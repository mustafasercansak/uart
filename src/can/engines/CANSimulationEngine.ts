import { v4 as uuidv4 } from 'uuid';
import type { CANFrame, CANArbitrationEvent } from '../types/CANFrame';
import type { CANNode, CANFaultType } from '../types/CANNode';
import type { CANBusState, CANBaudRate, CANLogEntry, CANFaultEvent } from '../types/CANBusState';

function t(key: string): string {
  const translations: Record<string, string> = {
    'can.cANBusSimulatio': 'CAN Bus Simulation',
    'can.noiseBurstBitEr': 'Noise burst bit error',
    'can.cardiacArrest': 'Cardiac Arrest',
    'can.bradycardia': 'Bradycardia',
    'can.tachycardia': 'Tachycardia',
    'can.hypoxia': 'Hypoxia',
    'can.hypotension': 'Hypotension',
    'can.hypertension': 'Hypertension',
    'can.fever': 'Fever',
    'can.hypothermia': 'Hypothermia',
    'can.busOff': 'Bus Off',
    'can.tXFreeze': 'TX Freeze',
    'can.noiseBurst': 'Noise Burst'
  };
  return translations[key] || key;
}
import { computeCANCRC, encodeCANFrame } from './CANFrameParser';
import { applySuccessfulTx, applySuccessfulRx } from './CANErrorStateMachine';
import { tickVitals, encodeVitalsToCANData } from './CANMedicalVitals';
import { DEFAULT_VITALS, MEDICAL_PROFILE_COLORS, FAULT_LABELS } from '../types/CANNode';

const MAX_RECENT_FRAMES = 200;
const MAX_LOG_ENTRIES = 500;
const BUS_LOAD_WINDOW_MS = 1000;

// Approximate bit count per standard CAN frame at given DLC (worst case with bit stuffing)
function estimateFrameBits(dlc: number, isExtended: boolean): number {
  const headerBits = isExtended ? 67 : 47;
  return headerBits + dlc * 8;
}

export class CANSimulationEngine {
  private state: CANBusState;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private busOffTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  // Callbacks to main thread / UI
  public onFrame: ((frame: CANFrame) => void) | null = null;
  public onArbitration: ((event: CANArbitrationEvent) => void) | null = null;
  public onLog: ((entry: CANLogEntry) => void) | null = null;
  public onStateUpdate: ((patch: Partial<CANBusState>) => void) | null = null;
  public onFaultEvent: ((event: CANFaultEvent) => void) | null = null;

  // Active noise-burst timers keyed by nodeId
  private noiseBurstTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  // Bus load tracking
  private recentFrameBits: Array<{ ts: number; bits: number }> = [];
  private fpsCounter = 0;
  private fpsResetAt = 0;

  constructor(initialState: CANBusState) {
    this.state = structuredClone(initialState);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  public start(): void {
    if (this.state.status === 'running') return;
    this.state.status = 'running';
    this.state.startedAt = Date.now();
    this.fpsResetAt = Date.now();
    this.tickTimer = setInterval(() => this.tick(), 50); // 20 Hz tick
    this.log('info', t('can.cANBusSimulatio'));
    this.emitStateUpdate({ status: 'running', startedAt: this.state.startedAt });
  }

  public stop(): void {
    this.clearTimers();
    this.state.status = 'stopped';
    this.state.startedAt = null;
    this.state.elapsedMs = 0;
    this.log('info', t('can.cANBusSimulatio'));
    this.emitStateUpdate({ status: 'stopped', elapsedMs: 0 });
  }

  public pause(): void {
    if (this.state.status !== 'running') return;
    this.clearTimers();
    this.state.status = 'paused';
    this.log('info', t('can.cANBusSimulatio'));
    this.emitStateUpdate({ status: 'paused' });
  }

  public resume(): void {
    if (this.state.status !== 'paused') return;
    this.state.status = 'running';
    this.tickTimer = setInterval(() => this.tick(), 50);
    this.log('info', t('can.cANBusSimulatio'));
    this.emitStateUpdate({ status: 'running' });
  }

  public addNode(node: Omit<CANNode, 'lastSentAt' | 'framesSent' | 'vitals' | 'txErrorCounter' | 'rxErrorCounter' | 'state' | 'nmtState' | 'activeFault'> & Partial<Pick<CANNode, 'vitals'>>): void {
    const fullNode: CANNode = {
      ...node,
      vitals: node.vitals ?? { ...DEFAULT_VITALS },
      txErrorCounter: 0,
      rxErrorCounter: 0,
      state: 'error-active',
      nmtState: 'operational',
      activeFault: null,
      lastSentAt: 0,
      framesSent: 0,
      color: node.color || MEDICAL_PROFILE_COLORS[node.profile],
    };
    this.state.nodes = [...this.state.nodes, fullNode];
    this.log('nmt', `Node ${node.id} (${node.name}) joined the bus`);
    this.emitStateUpdate({ nodes: this.state.nodes });
  }

  public removeNode(nodeId: number): void {
    this.state.nodes = this.state.nodes.filter(n => n.id !== nodeId);
    this.log('nmt', `Node ${nodeId} removed from bus`);
    this.emitStateUpdate({ nodes: this.state.nodes });
  }

  public updateNode(nodeId: number, patch: Partial<CANNode>): void {
    this.state.nodes = this.state.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n);
    this.emitStateUpdate({ nodes: this.state.nodes });
  }

  public setBaudRate(baudRate: CANBaudRate): void {
    this.state.baudRate = baudRate;
    this.log('info', `Baud rate set to ${baudRate} kbps`);
    this.emitStateUpdate({ baudRate });
  }

  public getState(): CANBusState {
    return this.state;
  }

  public injectFault(nodeId: number, fault: CANFaultType): void {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    if (fault === 'bus-off') {
      this.updateNode(nodeId, { state: 'bus-off', txErrorCounter: 256, activeFault: fault });
      this.log('alarm', `Fault injected — Node ${nodeId} forced Bus-Off`);
    } else if (fault === 'freeze') {
      this.updateNode(nodeId, { isActive: false, activeFault: fault });
      this.log('alarm', `Fault injected — Node ${nodeId} TX frozen (silent node)`);
    } else if (fault === 'noise-burst') {
      this.updateNode(nodeId, { activeFault: fault });
      // Inject error frames for 3 seconds, then auto-clear
      const existing = this.noiseBurstTimers.get(nodeId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const current = this.state.nodes.find(n => n.id === nodeId);
        if (current?.activeFault === 'noise-burst') {
          this.updateNode(nodeId, { activeFault: null });
          this.log('info', `Node ${nodeId} noise burst ended`);
          this.emitFaultEvent(nodeId, node.name, 'recover');
        }
        this.noiseBurstTimers.delete(nodeId);
      }, 3000);
      this.noiseBurstTimers.set(nodeId, timer);
      this.log('alarm', `Fault injected — Node ${nodeId} noise burst (3 s)`);
    } else {
      // Clinical faults: override vitals via activeFault, tickVitals will seek fault targets
      this.updateNode(nodeId, { activeFault: fault });
      this.log('alarm', `Fault injected — Node ${nodeId}: ${t(FAULT_LABELS[fault])}`);
    }

    this.emitFaultEvent(nodeId, node.name, fault);
  }

  public recoverNode(nodeId: number): void {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Clear any noise-burst timer
    const timer = this.noiseBurstTimers.get(nodeId);
    if (timer) { clearTimeout(timer); this.noiseBurstTimers.delete(nodeId); }

    const wasOff = node.state === 'bus-off' || !node.isActive;
    this.updateNode(nodeId, {
      activeFault: null,
      state: 'error-active',
      txErrorCounter: 0,
      rxErrorCounter: 0,
      isActive: true,
      vitals: { ...DEFAULT_VITALS },
    });
    this.log('info', `Node ${nodeId} recovered${wasOff ? ' (re-activated)' : ''}`);
    this.emitFaultEvent(nodeId, node.name, 'recover');
  }

  // ── MAIN TICK ──────────────────────────────────────────────────────────────

  private tick(): void {
    if (this.state.status !== 'running') return;

    const now = Date.now();
    this.state.elapsedMs = this.state.startedAt ? now - this.state.startedAt : 0;

    // Collect frames that are ready to transmit this tick
    const pendingTransmissions: { node: CANNode; data: number[] }[] = [];

    for (const node of this.state.nodes) {
      if (!node.isActive || node.state === 'bus-off' || node.state === 'offline') continue;
      if (now - node.lastSentAt < node.sendIntervalMs) continue;

      // Advance vitals by one tick, passing active fault for fault-driven seeking
      const updatedVitals = tickVitals(node.vitals, node.profile, node.activeFault);
      const data = encodeVitalsToCANData(updatedVitals, node.profile);
      const updatedNode: CANNode = { ...node, vitals: updatedVitals };
      this.updateNode(node.id, { vitals: updatedVitals });
      pendingTransmissions.push({ node: updatedNode, data });
    }

    // Arbitrate: lowest arbitration ID wins when multiple nodes transmit simultaneously
    if (pendingTransmissions.length > 1) {
      pendingTransmissions.sort((a, b) => a.node.baseArbitrationId - b.node.baseArbitrationId);

      for (let i = 1; i < pendingTransmissions.length; i++) {
        const loser = pendingTransmissions[i].node;
        const winner = pendingTransmissions[0].node;
        const event: CANArbitrationEvent = {
          timestamp: now,
          winnerId: winner.id,
          loserId: loser.id,
          winnerArbitrationId: winner.baseArbitrationId,
          loserArbitrationId: loser.baseArbitrationId,
        };
        this.state.arbitrationEvents = [...this.state.arbitrationEvents.slice(-99), event];
        this.onArbitration?.(event);
        this.log('arbitration', `Arbitration: Node ${winner.id} (ID 0x${winner.baseArbitrationId.toString(16).toUpperCase()}) beat Node ${loser.id}`);
      }

      // Only the winner transmits this tick
      const winner = pendingTransmissions[0];
      this.transmitFrame(winner.node, winner.data, now);
    } else if (pendingTransmissions.length === 1) {
      const { node, data } = pendingTransmissions[0];
      this.transmitFrame(node, data, now);
    }

    // Update FPS
    this.fpsCounter++;
    if (now - this.fpsResetAt >= 1000) {
      const fps = this.fpsCounter;
      this.fpsCounter = 0;
      this.fpsResetAt = now;
      this.state.framesPerSecond = fps;
      this.emitStateUpdate({ framesPerSecond: fps, elapsedMs: this.state.elapsedMs });
    }

    // Update bus load
    this.updateBusLoad(now);
  }

  // ── FRAME TRANSMISSION ─────────────────────────────────────────────────────

  public sendCustomFrame(arbitrationId: number, data: number[]): void {
    const now = Date.now();
    const dlc = Math.min(data.length, 8);
    const frameData = data.slice(0, dlc);
    const crc = computeCANCRC(frameData, arbitrationId, dlc, 'standard');

    const frame: CANFrame = {
      uid: uuidv4(),
      arbitrationId,
      idFormat: 'standard',
      frameType: 'data',
      isRTR: false,
      dlc,
      data: frameData,
      crc,
      timestamp: now,
      nodeId: -1,
      busLoadPercent: this.state.busLoadPercent,
      errors: [],
      cobId: arbitrationId,
      functionCode: 0,
      canOpenNodeId: 0,
    };

    this.state.recentFrames = [frame, ...this.state.recentFrames].slice(0, MAX_RECENT_FRAMES);
    this.state.frameCount++;
    this.onFrame?.(frame);
    this.log('tx', `Tester TX [0x${frame.arbitrationId.toString(16).toUpperCase().padStart(3, '0')}] DLC=${dlc} ${frameData.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);

    this.processUdsRequest(arbitrationId, frameData);
  }

  private udsTxBuffer: number[] = [];
  private udsTxResponseId = 0x7E8;
  private udsTxSequence = 1;

  private processUdsRequest(id: number, data: number[]): void {
    const isPhysical = id >= 0x7E0 && id <= 0x7E7;
    const isBroadcast = id === 0x7DF;

    if (!isPhysical && !isBroadcast) {
      if (id >= 0x7E0 && id <= 0x7E7 && (data[0] & 0xF0) === 0x30) {
        this.sendUdsConsecutiveFrames();
      }
      return;
    }

    const nodeIndex = isPhysical ? (id - 0x7E0) : 0;
    const targetNode = this.state.nodes[nodeIndex] || this.state.nodes[0];
    if (!targetNode) return;

    const responseId = isPhysical ? (id + 8) : 0x7E8;
    const type = (data[0] & 0xF0) >> 4;

    if (type === 0) { // Single Frame
      const len = data[0] & 0x0F;
      const sid = data[1];
      
      if (sid === 0x10) { // Diagnostic Session Control
        const sub = data[2];
        this.sendUdsResponse(responseId, [0x50, sub, 0x00, 0x32, 0x01, 0xF4]);
      } 
      else if (sid === 0x11) { // ECU Reset
        const sub = data[2];
        setTimeout(() => {
          this.log('nmt', `UDS ECU Reset triggered on Node ${targetNode.id}`);
          this.recoverNode(targetNode.id);
        }, 100);
        this.sendUdsResponse(responseId, [0x51, sub]);
      }
      else if (sid === 0x22) { // Read Data By Identifier
        const did = (data[2] << 8) | data[3];
        if (did === 0xF190) { // VIN
          const vin = "MOCKVIN1234567890";
          const vinBytes = Array.from(vin).map(c => c.charCodeAt(0));
          this.sendUdsResponse(responseId, [0x62, 0xF1, 0x90, ...vinBytes]);
        } else if (did === 0xF18C) { // ECU Serial Number
          const sn = `MOCK-SN-NODE${targetNode.id}`;
          const snBytes = Array.from(sn).map(c => c.charCodeAt(0));
          this.sendUdsResponse(responseId, [0x62, 0xF1, 0x8C, ...snBytes]);
        } else if (did === 0xF197) { // System Name
          const nameBytes = Array.from(targetNode.name).map(c => c.charCodeAt(0));
          this.sendUdsResponse(responseId, [0x62, 0xF1, 0x97, ...nameBytes]);
        } else {
          this.sendUdsResponse(responseId, [0x7F, 0x22, 0x31]);
        }
      }
      else if (sid === 0x2E) { // Write Data By Identifier
        const did = (data[2] << 8) | data[3];
        if (did === 0xF197) {
          const newName = String.fromCharCode(...data.slice(4, 4 + len - 3)).trim();
          if (newName) {
            this.updateNode(targetNode.id, { name: newName });
            this.log('nmt', `UDS Write DID 0xF197: Updated Node ${targetNode.id} name to "${newName}"`);
            this.sendUdsResponse(responseId, [0x6E, 0xF1, 0x97]);
          } else {
            this.sendUdsResponse(responseId, [0x7F, 0x2E, 0x13]);
          }
        } else {
          this.sendUdsResponse(responseId, [0x7F, 0x2E, 0x31]);
        }
      }
      else {
        this.sendUdsResponse(responseId, [0x7F, sid, 0x11]);
      }
    }
  }

  private sendUdsResponse(responseId: number, payload: number[]): void {
    if (payload.length <= 7) {
      const data = [payload.length, ...payload];
      while (data.length < 8) data.push(0x00);
      this.transmitECUFrame(responseId, data);
    } else {
      const len = payload.length;
      const ffByte0 = 0x10 | ((len >> 8) & 0x0F);
      const ffByte1 = len & 0xFF;
      const firstChunk = payload.slice(0, 6);
      const data = [ffByte0, ffByte1, ...firstChunk];
      
      this.udsTxBuffer = payload.slice(6);
      this.udsTxResponseId = responseId;
      this.udsTxSequence = 1;

      this.transmitECUFrame(responseId, data);
    }
  }

  private sendUdsConsecutiveFrames(): void {
    if (this.udsTxBuffer.length === 0) return;

    let seq = this.udsTxSequence;
    const responseId = this.udsTxResponseId;
    const delay = 20;

    const sendNext = () => {
      if (this.udsTxBuffer.length === 0) return;

      const chunk = this.udsTxBuffer.splice(0, 7);
      const cfByte = 0x20 | (seq & 0x0F);
      const data = [cfByte, ...chunk];
      while (data.length < 8) data.push(0x00);

      this.transmitECUFrame(responseId, data);
      seq++;
      
      if (this.udsTxBuffer.length > 0) {
        setTimeout(sendNext, delay);
      }
    };

    setTimeout(sendNext, delay);
  }

  private transmitECUFrame(arbitrationId: number, data: number[]): void {
    const now = Date.now();
    const dlc = 8;
    const crc = computeCANCRC(data, arbitrationId, dlc, 'standard');

    const frame: CANFrame = {
      uid: uuidv4(),
      arbitrationId,
      idFormat: 'standard',
      frameType: 'data',
      isRTR: false,
      dlc,
      data,
      crc,
      timestamp: now,
      nodeId: -2,
      busLoadPercent: this.state.busLoadPercent,
      errors: [],
      cobId: arbitrationId,
      functionCode: 0,
      canOpenNodeId: 0,
    };

    this.state.recentFrames = [frame, ...this.state.recentFrames].slice(0, MAX_RECENT_FRAMES);
    this.state.frameCount++;
    this.onFrame?.(frame);
    this.log('rx', `ECU Response [0x${frame.arbitrationId.toString(16).toUpperCase().padStart(3, '0')}] DLC=8 ${data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
  }

  private transmitFrame(node: CANNode, data: number[], now: number): void {
    const dlc = Math.min(data.length, 8);
    const frameData = data.slice(0, dlc);
    const crc = computeCANCRC(frameData, node.baseArbitrationId, dlc, 'standard');

    const frame: CANFrame = {
      uid: uuidv4(),
      arbitrationId: node.baseArbitrationId,
      idFormat: 'standard',
      frameType: 'data',
      isRTR: false,
      dlc,
      data: frameData,
      crc,
      timestamp: now,
      nodeId: node.id,
      busLoadPercent: this.state.busLoadPercent,
      errors: [],
      // CANopen: TPDO1 function code = 0x180 + nodeId
      cobId: 0x180 + node.id,
      functionCode: 0x180,
      canOpenNodeId: node.id,
    };

    // Noise-burst: mark ~40% of frames as errors while fault is active
    if (node.activeFault === 'noise-burst' && Math.random() < 0.4) {
      frame.errors = [t('can.noiseBurstBitEr')];
      this.state.errorCount++;
    }

    // Track alarm frames
    const vitals = node.vitals;
    if (vitals.alarmFlags !== 0) {
      if (frame.errors.length === 0) {
        frame.errors = [`Alarm flags: 0x${vitals.alarmFlags.toString(16).toUpperCase().padStart(2, '0')}`];
        this.state.errorCount++;
      }
      this.log('alarm', `Node ${node.id} alarm: flags=0x${vitals.alarmFlags.toString(16).toUpperCase()}`);
    }

    this.state.recentFrames = [frame, ...this.state.recentFrames].slice(0, MAX_RECENT_FRAMES);
    this.state.frameCount++;

    // Update node timing
    const txUpdated = applySuccessfulTx(node);
    this.updateNode(node.id, {
      ...txUpdated,
      lastSentAt: now,
      framesSent: node.framesSent + 1,
    });

    // Apply successful RX to all other active nodes
    for (const other of this.state.nodes) {
      if (other.id !== node.id && other.isActive && other.state !== 'bus-off') {
        this.updateNode(other.id, { ...applySuccessfulRx(other) });
      }
    }

    // Track bits for bus load calculation
    const bits = estimateFrameBits(dlc, false);
    this.recentFrameBits.push({ ts: now, bits });

    this.state.frameCount++;
    this.onFrame?.(frame);

    this.log('tx', `Node ${node.id} TX [0x${frame.arbitrationId.toString(16).toUpperCase().padStart(3, '0')}] DLC=${dlc} ${encodeCANFrame(frame).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
  }

  // ── BUS LOAD ───────────────────────────────────────────────────────────────

  private updateBusLoad(now: number): void {
    // Remove frame records older than BUS_LOAD_WINDOW_MS
    this.recentFrameBits = this.recentFrameBits.filter(r => now - r.ts < BUS_LOAD_WINDOW_MS);
    const totalBits = this.recentFrameBits.reduce((s, r) => s + r.bits, 0);
    const capacityBits = this.state.baudRate * 1000; // bps in 1 second window
    this.state.busLoadPercent = Math.min(100, (totalBits / capacityBits) * 100);
    this.emitStateUpdate({ busLoadPercent: this.state.busLoadPercent, frameCount: this.state.frameCount, errorCount: this.state.errorCount });
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────

  private log(type: CANLogEntry['type'], text: string, nodeId?: number): void {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const entry: CANLogEntry = { time, text, type, nodeId };
    this.state.logEntries = [...this.state.logEntries, entry].slice(-MAX_LOG_ENTRIES);
    this.onLog?.(entry);
  }

  private emitStateUpdate(patch: Partial<CANBusState>): void {
    this.onStateUpdate?.(patch);
  }

  private emitFaultEvent(nodeId: number, nodeName: string, fault: CANFaultType | 'recover'): void {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const event: CANFaultEvent = { timestamp: Date.now(), time, nodeId, nodeName, fault };
    this.state.faultEvents = [...this.state.faultEvents, event].slice(-200);
    this.onFaultEvent?.(event);
  }

  private clearTimers(): void {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    this.busOffTimers.forEach(t => clearTimeout(t));
    this.busOffTimers.clear();
    this.noiseBurstTimers.forEach(t => clearTimeout(t));
    this.noiseBurstTimers.clear();
  }
}
