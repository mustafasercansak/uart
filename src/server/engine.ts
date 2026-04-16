import { generateFrame } from '../engines/FrameGenerator';
import { tickScenarioEngine } from '../engines/ScenarioEngine';
import { VirtualPeripheralEngine } from '../engines/VirtualPeripheralEngine';
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
  SimulationStatus
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * The Backend Simulation Engine
 * Handles high-precision timing and frame generation in a separate process/thread.
 */
export class SimulationEngine {
  private state: SimulationState;
  private profile: FrameProfile | null = null;
  private scenario: Scenario | null = null;
  private interval: NodeJS.Timeout | null = null;
  private frameCount = 0;
  private startTime = 0;
  private pausedAt = 0;

  // Recording & Replay State
  private isRecording = false;
  private recordingBuffer: Array<{ time: number; frame: GeneratedFrame }> = [];
  private playbackData: Array<{ time: number; frame: GeneratedFrame }> | null = null;
  private playbackIndex: number = 0;
  private playbackTimer: NodeJS.Timeout | null = null;
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
    console.log(`\x1b[34m[RESP]\x1b[0m ${rules.length} adet yanıt kuralı yüklendi.`);
  }

  public processIncomingData(bytes: number[]) {
    if (this.state.status !== 'running') return;

    // 1. Accumulate all incoming bytes into the persistent buffer
    this.rxBuffer.push(...bytes);

    // 2. Determine frame width and sync pattern (first 2 bytes usually)
    const frameSize = this.profile ? this.profile.fields.reduce((sum, f) => sum + f.byteWidth, 0) : 0;
    
    // Fallback if no profile or invalid size
    if (!frameSize || frameSize <= 0) {
      if (this.rxBuffer.length > 100) this.rxBuffer = this.rxBuffer.slice(-100);
      return;
    }

    // 3. Extraction loop: Try to find and pull whole frames from the buffer
    let processed = true;
    while (processed && this.rxBuffer.length >= frameSize) {
      processed = false;

      // Look for the header (55 AA for YS2000A)
      // We assume the first field(s) with constant values or common headers are sync.
      // For now, let's just use the frameSize as the trigger, but ideally look for 0x55 0xAA
      const headerIdx = this.rxBuffer.indexOf(0x55);
      
      if (headerIdx === -1) {
        // No header found, clear buffer to prevent overflow but keep last few bytes in case 0x55 is split
        if (this.rxBuffer.length > 20) this.rxBuffer = this.rxBuffer.slice(-5);
        break;
      }

      // If header is not at 0, discard everything before it (garbage)
      if (headerIdx > 0) {
        this.rxBuffer = this.rxBuffer.slice(headerIdx);
        if (this.rxBuffer.length < frameSize) break;
      }

      // Check if we have enough bytes for a full frame starting at the header
      if (this.rxBuffer.length >= frameSize) {
        const chunk = this.rxBuffer.slice(0, frameSize);
        this.rxBuffer = this.rxBuffer.slice(frameSize);
        processed = true;

        const hex = chunk.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        
        const rxEntry: ConversationEntry = {
            id: uuidv4(),
            timestamp: Date.now(),
            type: 'rx',
            rawHex: hex
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
    }

    // Buffer safety limit
    if (this.rxBuffer.length > 512) {
      this.rxBuffer = this.rxBuffer.slice(-256);
    }
  }

  private addLog(entry: ConversationEntry) {
    this.state.conversationLogs = [entry, ...this.state.conversationLogs].slice(0, 100);
    this.onConversation?.(entry);
  }

  private addExchange(exchange: Exchange) {
    this.state.exchanges = [exchange, ...this.state.exchanges].slice(0, 50);
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
        console.log(`\x1b[32m[MATCH]\x1b[0m Kural tetiklendi: ${rule.name}`);
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
               if (result.setFields) {
                 Object.entries(result.setFields as Record<string, number>).forEach(([fid, val]) => {
                    this.state.fieldOverrides[fid] = val;
                 });
               }
            }
          } catch (err: any) {
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
    } catch (e) {
        return [];
    }
  }

  private executeActions(actions: ResponderAction[], matchId: string) {
    for (const action of actions) {
      setTimeout(() => {
        switch (action.type) {
          case 'send_raw':
            const bytes = this.parsePattern(action.payload, 'hex');
            console.log(`\x1b[32m[RESP]\x1b[0m Yanıt gönderiliyor: ${action.payload}`);
            
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
          case 'inject_error':
            this.injectError(action.payload as any);
            break;
          case 'set_field':
            const [fieldId, value] = action.payload.split(':');
            this.state.fieldOverrides[fieldId] = parseFloat(value);
            break;
        }
      }, action.delayMs || 0);
    }
  }

  public onRawResponse: (bytes: number[]) => void = () => {};
  public onConversation: (entry: ConversationEntry) => void = () => {};
  public onExchange: (exchange: Exchange) => void = () => {};

  public startRecording() {
    this.isRecording = true;
    this.recordingBuffer = [];
    console.log('\x1b[35m[REC]\x1b[0m Kayıt başlatıldı.');
  }

  public stopRecording() {
    this.isRecording = false;
    const buffer = [...this.recordingBuffer];
    this.recordingBuffer = [];
    console.log('\x1b[35m[REC]\x1b[0m Kayıt tamamlandı.', buffer.length, 'frame.');
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
    console.log('\x1b[36m[PLAY]\x1b[0m Oynatma başlatılıyor...', data.length, 'frame.');
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
         console.log('\x1b[36m[PLAY]\x1b[0m Oynatma bitti.');
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

  public start(profile: FrameProfile, scenario: Scenario | null, outputMode: OutputMode) {
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

    // Process scenario
    let scenarioUpdates = {};
    if (this.scenario) {
      const result = tickScenarioEngine(this.scenario, profile, { ...this.state });
      scenarioUpdates = result.updates;
    }

    // Update internal state
    this.state = {
      ...this.state,
      ...scenarioUpdates,
      frameCount: this.frameCount,
    };

    // Generate frame
    const frame = generateFrame(profile, this.state, this.frameCount);
    
    // Log as TX in conversation
    const txEntry: ConversationEntry = {
        id: uuidv4(),
        timestamp: Date.now(),
        type: 'tx',
        rawHex: frame.rawHex
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
    
    // Clean up old pending exchanges that never got a response (prevent leak)
    if (this.pendingExchanges.length > 20) {
        this.pendingExchanges = this.pendingExchanges.slice(-20);
    }

    // Recording
    if (this.isRecording) {
      this.recordingBuffer.push({ time: this.state.elapsedMs, frame });
    }

    // Callback or Event emission happens here
    this.onFrame(frame);

    // ── VIRTUAL PERIPHERAL PASS-THROUGH ───────
    // If the tool is acting as a master, check if a virtual peripheral responds to this frame
    const protocol = (this.profile?.name.includes('SPI') || this.profile?.name.includes('Ethernet')) ? 'SPI' : 
                     (this.profile?.name.includes('I2C')) ? 'I2C' : 'UART';
    
    // In a real lab, TX from MCU is RX for Peripheral
    const pResponses = this.peripheralEngine.processIncoming(protocol as any, frame.rawBytes);

    pResponses.forEach(res => {
      // Small delay to simulate processing time
      setTimeout(() => {
        if (res.log) {
          const logEntry = { 
            time: new Date().toLocaleTimeString(), 
            text: `[PERIPHERAL] ${res.log}`, 
            type: 'info' as const 
          };
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

    // Clear one-shot error if it was applied
    if (this.state.pendingErrors.length > 0) {
      const consumed = this.state.pendingErrors[0];
      this.state.pendingErrors = this.state.pendingErrors.slice(1);
      console.log(`\x1b[35m[ERROR]\x1b[0m Hata başarıyla enjekte edildi: ${consumed}`);
    }

    // Schedule next
    const drift = Date.now() - nextTickAt;
    const nextDelay = Math.max(0, profile.sendIntervalMs - drift);
    this.interval = setTimeout(() => this.run(resumeStart), nextDelay);
  }

  public onFrame: (frame: GeneratedFrame) => void = () => {};
  
  public getState(): SimulationState {
    return this.state;
  }
}
