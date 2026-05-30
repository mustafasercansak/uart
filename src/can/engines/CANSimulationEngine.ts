import { v4 as uuidv4 } from 'uuid';
import type { CANFrame, CANArbitrationEvent } from '../types/CANFrame';
import type { CANNode, CANFaultType } from '../types/CANNode';
import type { CANBusState, CANBaudRate, CANLogEntry, CANFaultEvent } from '../types/CANBusState';
import type { CANErrorInjectionConfig, CANInjectedErrorType } from '../types/CANErrorInjection';
import type { UDSDiagnosticConfig } from '../types/UDS';
import { CAN_INJECTED_ERROR_LABELS } from '../types/CANErrorInjection';

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
const ERROR_INJECTION_EMIT_INTERVAL_MS = 250;

interface IsoTpRxSession {
  totalLength: number;
  payload: number[];
  nextSequence: number;
  responseId: number;
  startedAt: number;
}

// Approximate bit count per standard CAN frame at given DLC (worst case with bit stuffing)
function estimateFrameBits(dlc: number, isExtended: boolean): number {
  const headerBits = isExtended ? 67 : 47;
  return headerBits + dlc * 8;
}

export class CANSimulationEngine {
  private state: CANBusState;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  // Callbacks to main thread / UI
  public onFrame: ((frame: CANFrame) => void) | null = null;
  public onArbitration: ((event: CANArbitrationEvent) => void) | null = null;
  public onLog: ((entry: CANLogEntry) => void) | null = null;
  public onStateUpdate: ((patch: Partial<CANBusState>) => void) | null = null;
  public onFaultEvent: ((event: CANFaultEvent) => void) | null = null;

  // Active noise-burst timers keyed by nodeId
  private noiseBurstTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private isotpRxSessions: Map<number, IsoTpRxSession> = new Map();
  private isotpTxTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private isotpSessionCleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Bus load tracking
  private recentFrameBits: Array<{ ts: number; bits: number }> = [];
  private fpsCounter = 0;
  private fpsResetAt = 0;
  private lastErrorInjectionEmitAt = 0;

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
    this.isotpSessionCleanupTimer = setInterval(() => this.sweepIsoTpRxSessions(), 2000);
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
    this.isotpSessionCleanupTimer = setInterval(() => this.sweepIsoTpRxSessions(), 2000);
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

  public setErrorInjectionConfig(config: CANErrorInjectionConfig): void {
    this.state.errorInjection = {
      ...this.state.errorInjection,
      config: {
        ...config,
        periodicEvery: Math.max(1, config.periodicEvery),
        randomRate: Math.max(0, Math.min(100, config.randomRate)),
      },
    };
    this.emitStateUpdate({ errorInjection: this.state.errorInjection });
  }

  public armOneTimeErrorInjection(): void {
    this.state.errorInjection = { ...this.state.errorInjection, oneTimeArmed: true };
    this.log('info', 'CAN Error Injection armed for next matching packet');
    this.emitStateUpdate({ errorInjection: this.state.errorInjection });
  }

  public setUDSConfig(config: UDSDiagnosticConfig): void {
    this.state.udsConfig = {
      ...config,
      testerRequestId: this.clampCanId(config.testerRequestId),
      ecuResponseId: this.clampCanId(config.ecuResponseId),
      blockSize: Math.max(0, Math.min(255, config.blockSize)),
      stMinMs: Math.max(0, Math.min(127, config.stMinMs)),
      didResponses: config.didResponses.map(entry => ({
        ...entry,
        did: Math.max(0, Math.min(0xffff, entry.did)),
      })),
      dtcCodes: config.dtcCodes.map(code => Math.max(0, Math.min(0xffffff, code))),
    };
    this.log('info', `UDS Symphony configured on 0x${this.hexId(this.state.udsConfig.testerRequestId)} -> 0x${this.hexId(this.state.udsConfig.ecuResponseId)}`);
    this.emitStateUpdate({ udsConfig: this.state.udsConfig });
  }

  public sendUDSRequest(requestId: number, payload: number[]): void {
    const normalizedPayload = payload.map(byte => byte & 0xff);
    const responseId = this.responseIdForRequest(requestId);
    this.transmitIsoTpPayload(requestId, normalizedPayload, 'tester');
    const cfCount = normalizedPayload.length > 7 ? Math.ceil((normalizedPayload.length - 6) / 7) : 0;
    // When stMinMs=0 every CF fires as a macrotask at delay=0; give the response a
    // minimum of 1 ms per CF so it always lands after the last CF in the event queue.
    const effectiveStMin = Math.max(1, this.state.udsConfig.stMinMs);
    const responseDelay = cfCount > 0 ? (cfCount + 1) * effectiveStMin : 0;
    this.scheduleManagedTimeout(() => this.processUdsPayload(requestId, responseId, normalizedPayload), responseDelay);
  }

  public clearFrames(): void {
    this.isotpRxSessions.clear();
    this.isotpTxTimers.forEach(t => clearTimeout(t));
    this.isotpTxTimers.clear();
    this.state.recentFrames = [];
    this.state.frameCount = 0;
    this.state.errorCount = 0;
    this.state.arbitrationEvents = [];
    this.state.errorInjection = {
      ...this.state.errorInjection,
      stats: {
        totalPackets: 0,
        successfulPackets: 0,
        errorsInjected: 0,
      },
      oneTimeArmed: false,
    };
    this.lastErrorInjectionEmitAt = 0;
    this.emitStateUpdate({
      recentFrames: [],
      frameCount: 0,
      errorCount: 0,
      arbitrationEvents: [],
      errorInjection: this.state.errorInjection,
    });
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
    const idFormat = arbitrationId > 0x7ff ? 'extended' : 'standard';
    const crc = computeCANCRC(frameData, arbitrationId, dlc, idFormat);
    const frame: CANFrame = {
      uid: uuidv4(),
      arbitrationId,
      idFormat,
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

    this.applyErrorInjection(frame);

    this.state.recentFrames = [frame, ...this.state.recentFrames].slice(0, MAX_RECENT_FRAMES);
    this.state.frameCount++;
    this.onFrame?.(frame);
    this.log('tx', `Tester TX [0x${frame.arbitrationId.toString(16).toUpperCase().padStart(3, '0')}] DLC=${dlc} ${frameData.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);

    if (this.isDiagnosticAddress(arbitrationId)) {
      this.handleIsoTpFrame(arbitrationId, frameData);
    }
  }

  private transmitIsoTpPayload(arbitrationId: number, payload: number[], sender: 'tester' | 'ecu'): void {
    if (payload.length <= 7) {
      this.transmitDiagnosticFrame(arbitrationId, [payload.length, ...payload], sender);
      return;
    }

    const length = Math.min(payload.length, 0xfff);
    this.transmitDiagnosticFrame(arbitrationId, [
      0x10 | ((length >> 8) & 0x0f),
      length & 0xff,
      ...payload.slice(0, 6),
    ], sender);

    // Emit the FC from the opposite side on the next tick — after the FF has been
    // "received" — so the simulation log shows FF then FC in the correct order.
    // Tracking in isotpTxTimers allows clearFrames()/stop() to cancel it.
    const flowControlId = sender === 'tester' ? this.responseIdForRequest(arbitrationId) : this.state.udsConfig.testerRequestId;
    const fcSender = sender === 'tester' ? 'ecu' : 'tester';
    const fcData = [0x30, this.state.udsConfig.blockSize, this.state.udsConfig.stMinMs];
    this.scheduleManagedTimeout(() => this.transmitDiagnosticFrame(flowControlId, fcData, fcSender), 0);

    let offset = 6;
    let sequence = 1;
    const sendNext = () => {
      const chunk = payload.slice(offset, offset + 7);
      this.transmitDiagnosticFrame(arbitrationId, [0x20 | (sequence & 0x0f), ...chunk], sender);
      offset += chunk.length;
      sequence = (sequence + 1) & 0x0f;
      if (offset < length) {
        this.scheduleManagedTimeout(sendNext, this.state.udsConfig.stMinMs);
      }
    };

    this.scheduleManagedTimeout(sendNext, this.state.udsConfig.stMinMs);
  }

  private handleIsoTpFrame(arbitrationId: number, data: number[]): void {
    if (data.length === 0) return;
    const pciType = (data[0] & 0xf0) >> 4;
    const responseId = this.responseIdForRequest(arbitrationId);

    if (pciType === 0) {
      const payloadLength = data[0] & 0x0f;
      const payload = data.slice(1, 1 + payloadLength);
      this.log('rx', `ISO-TP SF request len=${payload.length} SID=0x${this.hexByte(payload[0] ?? 0)}`);
      this.processUdsPayload(arbitrationId, responseId, payload);
      return;
    }

    if (pciType === 1) {
      const totalLength = ((data[0] & 0x0f) << 8) | data[1];
      if (totalLength === 0) {
        this.log('error', `ISO-TP FF with totalLength=0 on 0x${this.hexId(arbitrationId)}; discarding`);
        return;
      }
      const payload = data.slice(2, Math.min(8, 2 + totalLength));
      if (payload.length >= totalLength) {
        // Malformed FF: total length fits in the first frame — process directly, no FC needed.
        this.log('rx', `ISO-TP FF (short) request len=${totalLength}; processing directly`);
        this.processUdsPayload(arbitrationId, responseId, payload.slice(0, totalLength));
      } else {
        const existing = this.isotpRxSessions.get(arbitrationId);
        if (existing) {
          this.log('error', `ISO-TP FF on 0x${this.hexId(arbitrationId)} interrupted in-progress session (${existing.payload.length}/${existing.totalLength} bytes received); discarding old session`);
        }
        this.isotpRxSessions.set(arbitrationId, {
          totalLength,
          payload,
          nextSequence: 1,
          responseId,
          startedAt: Date.now(),
        });
        this.log('rx', `ISO-TP FF request len=${totalLength}; sending Flow Control`);
        this.transmitDiagnosticFrame(responseId, [0x30, this.state.udsConfig.blockSize, this.state.udsConfig.stMinMs], 'ecu');
      }
      return;
    }

    if (pciType === 2) {
      const session = this.isotpRxSessions.get(arbitrationId);
      if (!session) return;
      // Expire sessions that have been waiting too long to prevent stale-session corruption.
      if (Date.now() - session.startedAt > 2000) {
        this.log('error', `ISO-TP session on 0x${this.hexId(arbitrationId)} expired; discarding stale CF`);
        this.isotpRxSessions.delete(arbitrationId);
        return;
      }
      const sequence = data[0] & 0x0f;
      if (sequence !== session.nextSequence) {
        this.log('error', `ISO-TP sequence error on 0x${this.hexId(arbitrationId)} expected ${session.nextSequence} got ${sequence}`);
        this.isotpRxSessions.delete(arbitrationId);
        return;
      }
      session.payload.push(...data.slice(1));
      session.nextSequence = (session.nextSequence + 1) & 0x0f;
      if (session.payload.length >= session.totalLength) {
        this.isotpRxSessions.delete(arbitrationId);
        const payload = session.payload.slice(0, session.totalLength);
        this.log('rx', `ISO-TP reassembled len=${payload.length} SID=0x${this.hexByte(payload[0] ?? 0)}`);
        this.processUdsPayload(arbitrationId, session.responseId, payload);
      }
      return;
    }

    if (pciType === 3) {
      this.log('rx', `ISO-TP Flow Control on 0x${this.hexId(arbitrationId)} FS=${data[0] & 0x0f} BS=${data[1] ?? 0} STmin=${data[2] ?? 0}ms`);
    }
  }

  private processUdsPayload(requestId: number, responseId: number, payload: number[]): void {
    if (!this.state.udsConfig.autoRespond || payload.length === 0) return;

    const targetNode = this.getDiagnosticTargetNode(requestId);
    const sid = payload[0];
    let response: number[];

    if (sid === 0x10) {
      const subFunction = payload[1] ?? 0x01;
      response = [0x50, subFunction, 0x00, 0x32, 0x01, 0xf4];
    } else if (sid === 0x11) {
      const subFunction = payload[1] ?? 0x01;
      response = [0x51, subFunction];
      if (targetNode) this.scheduleManagedTimeout(() => this.recoverNode(targetNode.id), 100);
    } else if (sid === 0x22) {
      response = this.buildReadDidResponse(payload, targetNode);
    } else if (sid === 0x2e) {
      response = this.buildWriteDidResponse(payload, targetNode);
    } else if (sid === 0x19) {
      response = this.buildReadDtcResponse(payload);
    } else {
      response = [0x7f, sid, 0x11];
    }

    this.log('rx', `UDS ${this.describeSid(sid)} request on 0x${this.hexId(requestId)} -> response 0x${this.hexId(responseId)}`);
    this.transmitIsoTpPayload(responseId, response, 'ecu');
  }

  private buildReadDidResponse(payload: number[], targetNode: CANNode | undefined): number[] {
    if (payload.length < 3 || payload.length % 2 === 0) return [0x7f, 0x22, 0x13];

    const response: number[] = [0x62];
    for (let i = 1; i < payload.length; i += 2) {
      const did = (payload[i] << 8) | payload[i + 1];
      const configured = this.state.udsConfig.didResponses.find(entry => entry.enabled && entry.did === did);
      const value = configured ? this.encodeDidValue(configured, targetNode) : null;
      if (!value || value.length === 0) return [0x7f, 0x22, 0x31];
      response.push((did >> 8) & 0xff, did & 0xff, ...value);
    }
    return response;
  }

  private buildWriteDidResponse(payload: number[], targetNode: CANNode | undefined): number[] {
    if (payload.length < 3) return [0x7f, 0x2e, 0x13];
    const did = (payload[1] << 8) | payload[2];
    if (did === 0xf197) {
      const nameBytes = payload.slice(3);
      const newName = String.fromCharCode(...nameBytes).split('\0').join('').trim();
      if (newName && targetNode) {
        this.updateNode(targetNode.id, { name: newName });
        this.log('nmt', `UDS Write DID 0xF197: Updated Node ${targetNode.id} name to "${newName}"`);
        return [0x6e, 0xf1, 0x97];
      }
      // 0x31 = requestOutOfRange: message is structurally valid but content is unacceptable
      // (empty name after trim). 0x13 would be wrong — it means length/format error.
      return [0x7f, 0x2e, 0x31];
    }
    return [0x7f, 0x2e, 0x31];
  }

  private buildReadDtcResponse(payload: number[]): number[] {
    const subFunction = payload[1] ?? 0x02;
    const statusMask = payload[2] ?? 0xff;
    if (subFunction !== 0x02) return [0x7f, 0x19, 0x12];

    const response = [0x59, subFunction, 0xff];
    for (const code of this.state.udsConfig.dtcCodes) {
      response.push((code >> 16) & 0xff, (code >> 8) & 0xff, code & 0xff, statusMask);
    }
    return response;
  }

  private encodeDidValue(entry: UDSDiagnosticConfig['didResponses'][number], targetNode: CANNode | undefined): number[] | null {
    if (entry.encoding === 'hex') {
      const clean = entry.value.replace(/[^0-9a-fA-F]/g, '');
      if (clean.length % 2 !== 0) return null;
      const bytes: number[] = [];
      for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
      return bytes;
    }

    if (entry.encoding === 'vitals') {
      const vitals = targetNode?.vitals ?? this.state.nodes[0]?.vitals;
      const numeric = vitals && entry.value in vitals
        ? Number(vitals[entry.value as keyof typeof vitals])
        : 0;
      const scaled = Math.max(0, Math.min(0xffff, Math.round(numeric * 10)));
      return [(scaled >> 8) & 0xff, scaled & 0xff];
    }

    return Array.from(entry.value).map(char => char.charCodeAt(0) & 0xff);
  }

  private transmitDiagnosticFrame(arbitrationId: number, data: number[], sender: 'tester' | 'ecu'): void {
    const now = Date.now();
    const dlc = 8;
    const frameData = data.slice(0, 8);
    while (frameData.length < 8) frameData.push(0x00);
    const idFormat: 'standard' | 'extended' = arbitrationId > 0x7ff ? 'extended' : 'standard';
    const crc = computeCANCRC(frameData, arbitrationId, dlc, idFormat);

    const frame: CANFrame = {
      uid: uuidv4(),
      arbitrationId,
      idFormat,
      frameType: 'data',
      isRTR: false,
      dlc,
      data: frameData,
      crc,
      timestamp: now,
      nodeId: sender === 'tester' ? -1 : -2,
      busLoadPercent: this.state.busLoadPercent,
      errors: [],
      cobId: arbitrationId,
      functionCode: 0,
      canOpenNodeId: 0,
    };

    this.applyErrorInjection(frame);

    this.state.recentFrames = [frame, ...this.state.recentFrames].slice(0, MAX_RECENT_FRAMES);
    this.state.frameCount++;
    this.onFrame?.(frame);
    const label = sender === 'tester' ? 'Tester TX' : 'ECU RX';
    this.log(sender === 'tester' ? 'tx' : 'rx', `${label} ISO-TP [0x${this.hexId(arbitrationId)}] ${frameData.map(b => this.hexByte(b)).join(' ')}`);
  }

  private transmitFrame(node: CANNode, data: number[], now: number): void {
    const dlc = Math.min(data.length, 8);
    const frameData = data.slice(0, dlc);
    const idFormat: 'standard' | 'extended' = node.baseArbitrationId > 0x7ff ? 'extended' : 'standard';
    const crc = computeCANCRC(frameData, node.baseArbitrationId, dlc, idFormat);

    const frame: CANFrame = {
      uid: uuidv4(),
      arbitrationId: node.baseArbitrationId,
      idFormat,
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

    this.applyErrorInjection(frame);

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
    const bits = estimateFrameBits(dlc, idFormat === 'extended');
    this.recentFrameBits.push({ ts: now, bits });

    this.onFrame?.(frame);

    this.log('tx', `Node ${node.id} TX [0x${frame.arbitrationId.toString(16).toUpperCase().padStart(3, '0')}] DLC=${dlc} ${encodeCANFrame(frame).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
  }

  private applyErrorInjection(frame: CANFrame): void {
    const current = this.state.errorInjection;
    const enabledTypes = (Object.keys(current.config.enabledTypes) as CANInjectedErrorType[])
      .filter(type => current.config.enabledTypes[type]);

    const packetNumber = current.stats.totalPackets + 1;
    let shouldInject = false;

    if (enabledTypes.length > 0) {
      if (current.config.triggerMode === 'one-time') {
        shouldInject = current.oneTimeArmed;
      } else if (current.config.triggerMode === 'periodic') {
        shouldInject = packetNumber % Math.max(1, current.config.periodicEvery) === 0;
      } else {
        shouldInject = Math.random() * 100 < current.config.randomRate;
      }
    }

    const injectedLabels = shouldInject
      ? enabledTypes.map(type => CAN_INJECTED_ERROR_LABELS[type])
      : [];

    if (shouldInject && enabledTypes.includes('crc-corruption')) {
      frame.crc = (frame.crc ^ 0x3fff) & 0x7fff;
    }

    if (injectedLabels.length > 0) {
      frame.errors = [...frame.errors, ...injectedLabels];
      this.log('error', `Injected Errors: ${injectedLabels.join(', ')} on CAN 0x${frame.arbitrationId.toString(16).toUpperCase().padStart(3, '0')}`, frame.nodeId >= 0 ? frame.nodeId : undefined);
    }

    const oneTimeConsumed = current.config.triggerMode === 'one-time' && shouldInject && current.oneTimeArmed;
    this.state.errorInjection = {
      ...current,
      oneTimeArmed: oneTimeConsumed ? false : current.oneTimeArmed,
      stats: {
        totalPackets: current.stats.totalPackets + 1,
        successfulPackets: current.stats.successfulPackets + (injectedLabels.length === 0 ? 1 : 0),
        errorsInjected: current.stats.errorsInjected + injectedLabels.length,
      },
    };

    const nowMs = Date.now();
    const shouldEmitState =
      injectedLabels.length > 0 ||
      oneTimeConsumed ||
      packetNumber === 1 ||
      nowMs - this.lastErrorInjectionEmitAt >= ERROR_INJECTION_EMIT_INTERVAL_MS;

    if (shouldEmitState) {
      this.lastErrorInjectionEmitAt = nowMs;
      this.emitStateUpdate({ errorInjection: this.state.errorInjection });
    }
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

  private scheduleManagedTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const tid = setTimeout(() => {
      // Guard against delayMs=0 callbacks that were already queued when clearTimers()
      // ran: clearTimeout is a no-op on already-enqueued macrotasks, but clearTimers()
      // also calls isotpTxTimers.clear(), so the presence check below is the reliable gate.
      if (!this.isotpTxTimers.has(tid)) return;
      this.isotpTxTimers.delete(tid);
      callback();
    }, delayMs);
    this.isotpTxTimers.add(tid);
    return tid;
  }

  private isDiagnosticAddress(id: number): boolean {
    return id === this.state.udsConfig.testerRequestId ||
      id === 0x7df ||
      (id >= 0x7e0 && id <= 0x7e7);
  }

  private responseIdForRequest(requestId: number): number {
    if (requestId === this.state.udsConfig.testerRequestId || requestId === 0x7df) {
      return this.state.udsConfig.ecuResponseId;
    }
    if (requestId >= 0x7e0 && requestId <= 0x7e7) return requestId + 8;
    return this.state.udsConfig.ecuResponseId;
  }

  private getDiagnosticTargetNode(requestId: number): CANNode | undefined {
    const configuredId = this.state.udsConfig.targetNodeId;
    if (configuredId !== null) return this.state.nodes.find(node => node.id === configuredId) ?? this.state.nodes[0];
    if (requestId >= 0x7e0 && requestId <= 0x7e7) {
      const index = requestId - 0x7e0;
      return this.state.nodes[index] ?? this.state.nodes[0];
    }
    return this.state.nodes[0];
  }

  private describeSid(sid: number): string {
    if (sid === 0x10) return 'Diagnostic Session Control';
    if (sid === 0x11) return 'ECU Reset';
    if (sid === 0x22) return 'Read Data By Identifier';
    if (sid === 0x2e) return 'Write Data By Identifier';
    if (sid === 0x19) return 'Read DTC Information';
    return `SID 0x${this.hexByte(sid)}`;
  }

  private clampCanId(id: number): number {
    return Math.max(0, Math.min(0x1FFFFFFF, Math.round(id)));
  }

  private hexId(id: number): string {
    return id.toString(16).toUpperCase().padStart(3, '0');
  }

  private hexByte(byte: number): string {
    return (byte & 0xff).toString(16).toUpperCase().padStart(2, '0');
  }

  private emitFaultEvent(nodeId: number, nodeName: string, fault: CANFaultType | 'recover'): void {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const event: CANFaultEvent = { timestamp: Date.now(), time, nodeId, nodeName, fault };
    this.state.faultEvents = [...this.state.faultEvents, event].slice(-200);
    this.onFaultEvent?.(event);
  }

  private sweepIsoTpRxSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.isotpRxSessions) {
      if (now - session.startedAt > 2000) {
        this.log('error', `ISO-TP session on 0x${this.hexId(id)} expired (no CFs received); discarding`);
        this.isotpRxSessions.delete(id);
      }
    }
  }

  private clearTimers(): void {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.isotpSessionCleanupTimer) { clearInterval(this.isotpSessionCleanupTimer); this.isotpSessionCleanupTimer = null; }
    this.noiseBurstTimers.forEach(t => clearTimeout(t));
    this.noiseBurstTimers.clear();
    this.isotpTxTimers.forEach(t => clearTimeout(t));
    this.isotpTxTimers.clear();
    this.isotpRxSessions.clear();
  }
}
