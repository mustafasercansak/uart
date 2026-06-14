import { generateFrame } from './FrameGenerator';
import { parseFrame } from './FrameParser';
import { tickScenarioEngine } from './ScenarioEngine';
import { evaluateTriggers } from './TriggerEngine';
import { VirtualPeripheralEngine, ScriptableDriver } from './VirtualPeripheralEngine';
import type { 
  SimulationState, 
  FrameProfile, 
  Scenario, 
  OutputMode, 
  GeneratedFrame,
  ResponderRule,
  ResponderAction,
  ConversationEntry,
  Exchange,
  ErrorType,
  SimulationStatus,
  ScriptablePeripheral,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/** Simulation engine — runs entirely in the browser via Tauri WebView. */
export class SimulationEngine {
  private state: SimulationState;
  private profile: FrameProfile | null = null;
  private scenario: Scenario | null = null;
  private interval: ReturnType<typeof setTimeout> | null = null;
  private frameCount = 0;
  private startTime = 0;
  private pausedAt = 0;

  // FPS tracking — simple 1-second sliding window counter
  private fpsWindowStart = 0;
  private fpsWindowCount = 0;
  private fpsValue = 0;

  // Rate-limit TX conversation/exchange UI events to avoid flooding the main thread
  private txUiSampleCounter = 0;
  private static readonly TX_UI_SAMPLE_EVERY = 10;

  // Recording & Replay State
  private isRecording = false;
  private recordingBuffer: Array<{ time: number; frame: GeneratedFrame }> = [];
  private playbackData: Array<{ time: number; frame: GeneratedFrame }> | null = null;
  private playbackIndex: number = 0;
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;
  private isPlaybackPaused: boolean = false;
  
  // Responder State
  private responderRules: ResponderRule[] = [];
  private rxBuffer: number[] = [];
  private lastMatchTime: Record<string, number> = {};
  
  // Exchange Tracking
  private pendingExchanges: Exchange[] = [];

  // Peripherals
  private peripheralEngine: VirtualPeripheralEngine;


  constructor(initialState: SimulationState) {
    this.state = initialState;
    this.peripheralEngine = new VirtualPeripheralEngine();
    if (!this.state.conversationLogs) {
        this.state.conversationLogs = [];
    }
    if (!this.state.exchanges) {
        this.state.exchanges = [];
    }
  }

  public setProfile(profile: FrameProfile) {
    this.profile = profile;
  }

  public setScenario(scenario: Scenario | null) {
    this.scenario = scenario;
  }

  public updateOverrides(patch: Partial<SimulationState>) {
    this.state = { ...this.state, ...patch };
  }

  public getProfile() {
    return this.profile;
  }

  public injectError(errorType: ErrorType) {
    this.state.pendingErrors = [...this.state.pendingErrors, errorType];
  }

  public setResponderRules(rules: ResponderRule[]) {
    this.responderRules = rules;
    this.lastMatchTime = {};
    if (import.meta.env.DEV) console.log(`\x1b[34m[RESP]\x1b[0m ${rules.length} adet yanıt kuralı yüklendi.`);
  }

  public updatePeripherals(peripherals: ScriptablePeripheral[]) {
    this.peripheralEngine.clearScriptableDrivers();
    peripherals.forEach(p => {
      if (p.isActive) {
        this.peripheralEngine.addDriver(new ScriptableDriver(
          p.id, p.name, p.protocol, p.script, p.initialState
        ));
      }
    });
    if (import.meta.env.DEV) console.log(`\x1b[34m[PERIPH]\x1b[0m ${peripherals.filter(p => p.isActive).length} adet aktif sanal cihaz güncellendi.`);
  }

  public injectRawTX(bytes: number[]) {
    const hex = bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    
    // Log as TX in conversation
    const txEntry: ConversationEntry = {
        id: uuidv4(),
        timestamp: Date.now(),
        type: 'tx',
        rawHex: hex
    };
    this.addLog(txEntry);

    // Start/Update Exchange
    const txExchange: Exchange = {
        id: uuidv4(),
        startTime: txEntry.timestamp,
        tx: txEntry
    };
    this.pendingExchanges.push(txExchange);
    this.addExchange(txExchange);
    
    this.onRawResponse?.(bytes);

    // Virtual Loopback: If not connected to hardware, feed it back to RX
    if (!this.state.serialConnected && !this.state.networkConnected) {
        if (import.meta.env.DEV) console.log(`\x1b[33m[LOOPBACK]\x1b[0m ${bytes.length} bytes looped back to RX.`);
        // Small delay to simulate propagation
        setTimeout(() => {
            this.processIncomingData(bytes);
        }, 10);
    }
  }

  public processIncomingData(bytes: number[]) {
    const lossChance = this.state.signalIntegrity.lossRate || 0;
    const corruptChance = this.state.signalIntegrity.corruptRate || 0;
    
    let processedBytes = [...bytes];
    if (lossChance > 0 && Math.random() * 100 < lossChance) {
      if (import.meta.env.DEV) console.log(`[NOISE] RX chunk dropped (loss simulation).`);
      return;
    }
    
    if (corruptChance > 0) {
      processedBytes = processedBytes.map(b => {
        if (Math.random() * 100 < corruptChance) {
          const bitPos = Math.floor(Math.random() * 8);
          return b ^ (1 << bitPos);
        }
        return b;
      });
    }

    // 1. Accumulate all incoming bytes into the persistent buffer
    this.rxBuffer.push(...processedBytes);

    // 2. Decode frames based on the framing mode
    const framing = this.profile?.framing || { mode: 'fixed' as const };
    const frameSize = this.profile ? this.profile.fields.reduce((sum, f) => sum + f.byteWidth, 0) : 0;
    
    let processed = true;
    while (processed && this.rxBuffer.length > 0) {
      processed = false;
      let chunk: number[] | null = null;
      let bytesToSlice = 0;

      if (framing.mode === 'fixed') {
        if (!frameSize || frameSize <= 0) break;
        
        // Find header if configured
        if (framing.header && framing.header.length > 0) {
          const headerIdx = this.findSequence(this.rxBuffer, framing.header);
          if (headerIdx === -1) {
            if (this.rxBuffer.length > 50) this.rxBuffer = this.rxBuffer.slice(-framing.header.length);
            break;
          }
          if (headerIdx > 0) {
            this.rxBuffer = this.rxBuffer.slice(headerIdx);
          }
        }

        if (this.rxBuffer.length >= frameSize) {
          bytesToSlice = frameSize;
          chunk = this.rxBuffer.slice(0, frameSize);
        }
      } else if (framing.mode === 'delimiter') {
        const raw = framing.delimiter;
        const delim: number[] = Array.isArray(raw) ? raw : raw != null ? [raw] : [0x0A];
        if (delim.length === 1) {
          const idx = this.rxBuffer.indexOf(delim[0]);
          if (idx !== -1) { bytesToSlice = idx + 1; chunk = this.rxBuffer.slice(0, bytesToSlice); }
        } else {
          const idx = this.findSequence(this.rxBuffer, delim);
          if (idx !== -1) { bytesToSlice = idx + delim.length; chunk = this.rxBuffer.slice(0, bytesToSlice); }
        }
      }

      if (chunk && bytesToSlice > 0) {
        this.rxBuffer = this.rxBuffer.slice(bytesToSlice);
        processed = true;
        this.processFullFrame(chunk);
      }
    }

    // Keep enough room for large modem HTTP payloads while still bounding
    // malformed streams that never deliver the configured delimiter.
    const maxBufferedBytes = 64 * 1024;
    if (this.rxBuffer.length > maxBufferedBytes) {
      this.rxBuffer = this.rxBuffer.slice(-maxBufferedBytes);
    }
  }

  private findSequence(buffer: number[], seq: number[]): number {
    for (let i = 0; i <= buffer.length - seq.length; i++) {
        let match = true;
        for (let j = 0; j < seq.length; j++) {
            if (buffer[i + j] !== seq[j]) {
                match = false;
                break;
            }
        }
        if (match) return i;
    }
    return -1;
  }

  private processFullFrame(chunk: number[]) {
    const hex = chunk.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

    let asciiText: string | undefined;
    if (this.profile?.framing?.mode === 'delimiter') {
      const raw = this.profile.framing.delimiter;
      const delim: number[] = Array.isArray(raw) ? raw : raw != null ? [raw] : [0x0A];
      const endsWithDelim = delim.length <= chunk.length &&
        delim.every((b, i) => chunk[chunk.length - delim.length + i] === b);
      const textBytes = endsWithDelim ? chunk.slice(0, -delim.length) : chunk;
      asciiText = textBytes.map(b => (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.').join('');
    }

    const parsedFields = this.profile ? parseFrame(this.profile, chunk) : null;
    const rxEntry: ConversationEntry = {
        id: uuidv4(),
        timestamp: Date.now(),
        type: 'rx',
        rawHex: hex,
        ...(asciiText !== undefined && { details: asciiText }),
        ...(parsedFields && parsedFields.length > 0 && { fields: parsedFields }),
    };
    this.addLog(rxEntry);

    if (this.pendingExchanges.length > 0) {
        const exchange = this.pendingExchanges.shift()!;
        exchange.rx = rxEntry;
        exchange.latencyMs = rxEntry.timestamp - exchange.startTime;
        
        if (exchange.tx) {
            exchange.isLoopbackMatch = (exchange.tx.rawHex === rxEntry.rawHex);
        }
        this.updateExchange(exchange);
    } else {
        const rxExchange: Exchange = {
            id: uuidv4(),
            startTime: rxEntry.timestamp,
            rx: rxEntry
        };
        this.addExchange(rxExchange);
    }
    
    this.checkRules(rxEntry.id);
  }

  private addLog(entry: ConversationEntry) {
    this.state.conversationLogs.unshift(entry);
    if (this.state.conversationLogs.length > 100) this.state.conversationLogs.length = 100;
    this.onConversation?.(entry);
  }

  private addExchange(exchange: Exchange) {
    this.state.exchanges.unshift(exchange);
    if (this.state.exchanges.length > 50) this.state.exchanges.length = 50;
    this.onExchange?.(exchange);
  }

  private updateExchange(exchange: Exchange) {
    const index = this.state.exchanges.findIndex(e => e.id === exchange.id);
    if (index !== -1) {
        this.state.exchanges[index] = exchange;
        this.onExchange?.(exchange);
    }
  }

  private checkRules(rxId: string) {
    const now = Date.now();
    
    for (const rule of this.responderRules) {
      if (!rule.enabled) continue;

      if (rule.cooldownMs && this.lastMatchTime[rule.id] && (now - this.lastMatchTime[rule.id] < rule.cooldownMs)) {
        continue;
      }

      const patternBytes = this.parsePattern(rule.pattern, rule.patternType);
      if (patternBytes.length === 0) continue;

      // Simple end-with check
      const bufferTail = this.rxBuffer.slice(-patternBytes.length);
      const isMatch = bufferTail.every((b, i) => b === patternBytes[i]);

      if (isMatch) {
        if (import.meta.env.DEV) console.log(`\x1b[32m[MATCH]\x1b[0m Kural tetiklendi: ${rule.name}`);
        this.lastMatchTime[rule.id] = now;
        
        const matchEntry: ConversationEntry = {
            id: uuidv4(),
            timestamp: Date.now(),
            type: 'match',
            rawHex: rule.pattern,
            details: rule.name,
            linkedId: rxId
        };
        this.addLog(matchEntry);

        // Advanced Scripting Support
        if (rule.script) {
          try {
            const bytes = [...this.rxBuffer];
            const state = JSON.parse(JSON.stringify(this.state));
            
            // Script sandbox (simple)
            const scriptFn = new Function('bytes', 'state', `
              try {
                ${rule.script}
              } catch(e) {
                return { error: e.message };
              }
            `);
            
            const result = scriptFn(bytes, state);
            if (result && result.error) {
               console.error(`\x1b[31m[SCRIPT ERR]\x1b[0m ${result.error}`);
            } else if (result) {
               if (result.sendHex) {
                 this.executeActions([{ type: 'send_raw', payload: result.sendHex }], matchEntry.id);
               }
               if (result.sendString) {
                 const hexStr = Array.from(String(result.sendString))
                    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
                    .join(' ');
                 this.executeActions([{ type: 'send_raw', payload: hexStr }], matchEntry.id);
               }
               if (result.command === 'pause') {
                 this.executeActions([{ type: 'pause', payload: '' }], matchEntry.id);
               }
               if (result.command === 'stop') {
                 this.executeActions([{ type: 'stop', payload: '' }], matchEntry.id);
               }
               if (result.setFields) {
                 Object.entries(result.setFields as Record<string, number>).forEach(([fid, val]) => {
                    this.state.fieldOverrides[fid] = val;
                 });
               }
            }
          } catch (err) {
            console.error(`\x1b[31m[SCRIPT EXEC ERR]\x1b[0m`, err);
          }
        }

        this.executeActions(rule.actions, matchEntry.id);
        
        this.rxBuffer = [];
        break; 
      }
    }
  }

  private parsePattern(pattern: string, type: 'hex' | 'ascii'): number[] {
    try {
      if (type === 'hex') {
        return pattern.trim().split(/\s+/).map(h => parseInt(h, 16));
      } else {
        return Array.from(pattern).map(c => c.charCodeAt(0));
      }
    } catch (_) {
        return [];
    }
  }

  private executeActions(actions: ResponderAction[], matchId: string) {
    for (const action of actions) {
      setTimeout(() => {
        switch (action.type) {
          case 'send_raw': {
            const bytes = this.parsePattern(action.payload, 'hex');
            if (import.meta.env.DEV) console.log(`\x1b[32m[RESP]\x1b[0m Yanıt gönderiliyor: ${action.payload}`);
            
            const txEntry: ConversationEntry = {
                id: uuidv4(),
                timestamp: Date.now(),
                type: 'tx',
                rawHex: action.payload,
                linkedId: matchId
            };
            this.addLog(txEntry);

            const txExchange: Exchange = {
                id: uuidv4(),
                startTime: txEntry.timestamp,
                tx: txEntry
            };
            this.pendingExchanges.push(txExchange);
            this.addExchange(txExchange);
            
            this.onRawResponse?.(bytes);
            break;
          }
          case 'inject_error':
            this.injectError(action.payload as import('../types').ErrorType);
            break;
          case 'set_field': {
            const [fieldId, value] = action.payload.split(':');
            this.state.fieldOverrides[fieldId] = parseFloat(value);
            break;
          }
          case 'pause':
            this.pause();
            break;
          case 'stop':
            this.stop();
            break;
        }
      }, action.delayMs || 0);
    }
  }

  public setTriggers(triggers: import('../types').Trigger[]) {
    this.state.triggers = triggers;
  }

  public setSignalIntegrity(integrity: Partial<import('../types').SignalIntegrity>) {
    this.state.signalIntegrity = { ...this.state.signalIntegrity, ...integrity };
  }

  public onRawResponse: (bytes: number[]) => void = () => {};
  public onConversation: (entry: ConversationEntry) => void = () => {};
  public onExchange: (exchange: Exchange) => void = () => {};

  public startRecording() {
    this.isRecording = true;
    this.recordingBuffer = [];
    if (import.meta.env.DEV) console.log('\x1b[35m[REC]\x1b[0m Kayıt başlatıldı.');
  }

  public stopRecording() {
    this.isRecording = false;
    const buffer = [...this.recordingBuffer];
    this.recordingBuffer = [];
    if (import.meta.env.DEV) console.log('\x1b[35m[REC]\x1b[0m Kayıt tamamlandı.', buffer.length, 'frame.');
    return buffer;
  }

  public startPlayback(data: Array<{ time: number; frame: GeneratedFrame }>) {
    this.stop();
    this.playbackData = data;
    this.playbackIndex = 0;
    this.isPlaybackPaused = false;
    this.state.playbackTotal = data.length;
    this.state.playbackIndex = 0;
    this.state.status = 'running' as SimulationStatus;
    this.state.outputMode = 'log'; // Default to log for playback
    if (import.meta.env.DEV) console.log('\x1b[36m[PLAY]\x1b[0m Oynatma başlatılıyor...', data.length, 'frame.');
    this.playbackLoop();
  }

  public pausePlayback() {
    this.isPlaybackPaused = true;
    if (this.playbackTimer) clearTimeout(this.playbackTimer);
    this.state.status = 'paused' as SimulationStatus;
  }

  public resumePlayback() {
    if (!this.isPlaybackPaused) return;
    this.isPlaybackPaused = false;
    this.state.status = 'running' as SimulationStatus;
    this.playbackLoop();
  }

  public seekToFrame(index: number) {
    if (!this.playbackData) return;
    this.playbackIndex = Math.max(0, Math.min(index, this.playbackData.length - 1));
    
    // Send only THIS frame immediately
    const current = this.playbackData[this.playbackIndex];
    this.state.elapsedMs = current.time;
    this.state.frameCount = this.playbackIndex + 1;
    this.state.playbackIndex = this.playbackIndex;
    this.onFrame(current.frame);

    // If we are running, continue from here
    if (this.state.status === 'running' && !this.isPlaybackPaused) {
      if (this.playbackTimer) clearTimeout(this.playbackTimer);
      this.playbackLoop();
    }
  }

  public stepPlayback(delta: number) {
    if (!this.playbackData) return;
    this.seekToFrame(this.playbackIndex + delta);
  }

  private playbackLoop() {
    if (!this.playbackData || this.playbackIndex >= this.playbackData.length || this.state.status !== 'running' || this.isPlaybackPaused) {
      if (this.playbackData && this.playbackIndex >= this.playbackData.length) {
         this.state.status = 'stopped' as SimulationStatus;
         if (import.meta.env.DEV) console.log('\x1b[36m[PLAY]\x1b[0m Oynatma bitti.');
      }
      return;
    }

    const current = this.playbackData[this.playbackIndex];
    this.state.elapsedMs = current.time;
    this.state.frameCount = this.playbackIndex + 1;
    this.state.playbackIndex = this.playbackIndex;
    this.onFrame(current.frame);

    this.playbackIndex++;
    if (this.playbackIndex < this.playbackData.length) {
      const next = this.playbackData[this.playbackIndex];
      const delay = next.time - current.time;
      this.playbackTimer = setTimeout(() => this.playbackLoop(), Math.max(0, delay));
    } else {
      this.stop();
      console.log('\x1b[36m[PLAY]\x1b[0m Oynatma bitti.');
    }
  }

  public start(
    profile: FrameProfile,
    scenario: Scenario | null,
    outputMode: OutputMode,
  ) {
    this.stop();
    this.profile = profile;
    this.scenario = scenario;
    this.frameCount = 0;
    this.startTime = Date.now();
    this.state.status = 'running' as SimulationStatus;
    this.state.outputMode = outputMode;

    // Clear buffers for a clean run
    this.rxBuffer = [];
    this.pendingExchanges = [];
    this.lastMatchTime = {};

    this.run();
  }

  public pause() {
    if (this.interval) {
      clearTimeout(this.interval);
      this.interval = null;
    }
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.state.status = 'paused' as SimulationStatus;
    this.pausedAt = this.state.elapsedMs;
  }

  public resume() {
    this.state.status = 'running' as SimulationStatus;
    if (this.playbackData) {
        this.playbackLoop();
    } else {
        const resumeStart = Date.now();
        this.run(resumeStart);
    }
  }

  public stop() {
    if (this.interval) {
      clearTimeout(this.interval);
      this.interval = null;
    }
    if (this.playbackTimer) {
        clearTimeout(this.playbackTimer);
        this.playbackTimer = null;
    }
    this.state.status = 'stopped' as SimulationStatus;
    this.state.elapsedMs = 0;
    this.frameCount = 0;
    this.playbackData = null;
  }

  /**
   * Generates one frame from `profile` and pushes it through the full TX pipeline:
   * conversation log → hardware output → exchange → recording → triggers → onFrame →
   * virtual peripheral pass-through → one-shot error consumption.
   * Shared by the main loop and the multi-message scheduler.
   */
  private emitFrame(profile: FrameProfile, frameNumber: number, msgOverrides?: Record<string, number>) {
    const state = msgOverrides && Object.keys(msgOverrides).length > 0
      ? { ...this.state, fieldOverrides: { ...this.state.fieldOverrides, ...msgOverrides } }
      : this.state;
    const frame = generateFrame(profile, state, frameNumber, { includeBitStream: state.analyzerMode });

    // Log as TX — only forward to UI every N frames to avoid flooding postMessage at high Hz
    const now = Date.now();
    this.txUiSampleCounter++;
    const shouldNotifyUI = this.txUiSampleCounter >= SimulationEngine.TX_UI_SAMPLE_EVERY;
    if (shouldNotifyUI) this.txUiSampleCounter = 0;

    const txEntry: ConversationEntry = {
        id: uuidv4(),
        timestamp: now,
        type: 'tx',
        rawHex: frame.rawHex
    };
    this.state.conversationLogs.unshift(txEntry);
    if (this.state.conversationLogs.length > 100) this.state.conversationLogs.length = 100;
    if (shouldNotifyUI) this.onConversation?.(txEntry);

    // Apply physical layer noise (loss, corrupt)
    let finalBytes = [...frame.rawBytes];
    let isDropped = false;
    
    const lossChance = this.state.signalIntegrity.lossRate || 0;
    const corruptChance = this.state.signalIntegrity.corruptRate || 0;
    
    if (lossChance > 0 && Math.random() * 100 < lossChance) {
      isDropped = true;
    }
    
    if (!isDropped && corruptChance > 0) {
      finalBytes = finalBytes.map(b => {
        if (Math.random() * 100 < corruptChance) {
          const bitPos = Math.floor(Math.random() * 8);
          return b ^ (1 << bitPos);
        }
        return b;
      });
    }

    // Send the generated frame bytes to the hardware output pipeline (TCP/Serial)
    if (!isDropped) {
      this.onRawResponse?.(finalBytes);
    } else {
      if (import.meta.env.DEV) console.log(`[NOISE] Frame ${frameNumber} was dropped (loss simulation).`);
    }

    // Start/Update Exchange — track internally always; notify UI at the same rate
    const txExchange: Exchange = {
        id: uuidv4(),
        startTime: txEntry.timestamp,
        tx: txEntry
    };
    this.pendingExchanges.push(txExchange);
    this.state.exchanges.unshift(txExchange);
    if (this.state.exchanges.length > 50) this.state.exchanges.length = 50;
    if (shouldNotifyUI) this.onExchange?.(txExchange);

    // Clean up old pending exchanges that never got a response (prevent leak)
    if (this.pendingExchanges.length > 20) {
        this.pendingExchanges = this.pendingExchanges.slice(-20);
    }

    // Recording
    if (this.isRecording) {
      this.recordingBuffer.push({ time: this.state.elapsedMs, frame });
    }

    // ── TRIGGER EVALUATION ────────────────────
    const triggerResults = evaluateTriggers(this.state.triggers || [], frame, this.state);

    for (const res of triggerResults) {
      if (res.triggered) {
        if (import.meta.env.DEV) console.log(`\x1b[33m[TRIGGERED]\x1b[0m ${res.triggerName} -> ${res.action}`);

        switch (res.action) {
          case 'stop_simulation':
            this.stop();
            break;
          case 'inject_error':
            if (res.payload) this.injectError(res.payload as ErrorType);
            break;
          case 'log_warning':
            this.addLog({
              id: uuidv4(),
              timestamp: Date.now(),
              type: 'error', // Use error type for high visibility warnings
              rawHex: `WARNING: ${res.triggerName}`,
              details: res.payload
            });
            break;
          case 'set_field':
            if (res.payload && res.payload.includes(':')) {
              const [fid, val] = res.payload.split(':');
              this.state.fieldOverrides[fid] = parseFloat(val);
            }
            break;
          case 'start_recording':
            if (!this.isRecording) this.startRecording();
            break;
        }
      }
    }

    // Callback or Event emission happens here
    this.onFrame(frame);

    // ── VIRTUAL PERIPHERAL PASS-THROUGH ───────
    // If the tool is acting as a master, check if a virtual peripheral responds to this frame
    if (!this.state.serialConnected) {
      const protocol = (profile.name.includes('SPI') || profile.name.includes('Ethernet')) ? 'SPI' :
                       (profile.name.includes('I2C')) ? 'I2C' : 'UART';

      const pResponses = this.peripheralEngine.processIncoming(protocol as import('../types').ProtocolType, frame.rawBytes);

      pResponses.forEach(res => {
        // Small delay to simulate processing time
        setTimeout(() => {
          if (res.log) {
            this.onConversation?.({
              id: uuidv4(),
              timestamp: Date.now(),
              type: 'match',
              rawHex: '',
              details: res.log
            });
          }

          if (res.bytes.length > 0) {
            this.processIncomingData(res.bytes);
          }
        }, 5 + Math.random() * 10);
      });
    }

    // Clear one-shot error if it was applied
    if (this.state.pendingErrors.length > 0) {
      const consumed = this.state.pendingErrors[0];
      this.state.pendingErrors = this.state.pendingErrors.slice(1);
      if (import.meta.env.DEV) console.log(`\x1b[35m[ERROR]\x1b[0m Hata başarıyla enjekte edildi: ${consumed}`);
    }

    return frame;
  }

  private run(resumeStart?: number) {
    if (this.state.status !== 'running' || !this.profile) return;

    const profile = this.profile;
    const nextTickAt = Date.now() + profile.sendIntervalMs;

    // Calculate elapsed time
    if (resumeStart) {
        this.state.elapsedMs = this.pausedAt + (Date.now() - resumeStart);
    } else {
        this.state.elapsedMs = Date.now() - this.startTime;
    }

    this.frameCount++;

    // FPS calculation — 1-second sliding window, no array allocation
    const now = Date.now();
    if (now - this.fpsWindowStart >= 1000) {
      this.fpsValue = this.fpsWindowCount;
      this.fpsWindowCount = 0;
      this.fpsWindowStart = now;
    }
    this.fpsWindowCount++;
    this.state.framesPerSecond = this.fpsValue;
    this.state.frameCount = this.frameCount;

    // Process scenario — only spread state when a scenario is active
    if (this.scenario) {
      const result = tickScenarioEngine(this.scenario, profile, { ...this.state });
      this.state = {
        ...this.state,
        ...result.updates,
        frameCount: this.frameCount,
        signalIntegrity: this.state.signalIntegrity,
      };
    }

    // Generate + emit the frame through the full TX pipeline
    this.emitFrame(profile, this.frameCount);

    // Schedule next
    const drift = Date.now() - nextTickAt;
    
    // ── JITTER SIMULATION ─────────────────────
    let jitter = 0;
    if (this.state.signalIntegrity.jitterMs > 0) {
       // Gaussian jitter: most deltas are near 0, some are large
       const u1 = Math.random();
       const u2 = Math.random();
       const z0 = Math.sqrt(-2.0 * Math.log(u1 + 1e-10)) * Math.cos(2.0 * Math.PI * u2);
       jitter = z0 * (this.state.signalIntegrity.jitterMs / 2); // Divide by 2 to keep it mostly within range
    }

    const nextDelay = Math.max(0, profile.sendIntervalMs - drift + jitter);
    this.interval = setTimeout(() => this.run(resumeStart), nextDelay);
  }

  public onFrame: (frame: GeneratedFrame) => void = () => {};
  
  public getState(): SimulationState {
    return this.state;
  }
}
