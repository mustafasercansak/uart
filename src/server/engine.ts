import { generateFrame } from '../engines/FrameGenerator';
import { tickScenarioEngine } from '../engines/ScenarioEngine';
import type { 
  SimulationState, 
  FrameProfile, 
  Scenario, 
  OutputMode, 
  GeneratedFrame,
  SimulationStatus,
  ErrorType
} from '../types';

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
  private playbackIndex = 0;
  private playbackTimer: NodeJS.Timeout | null = null;

  constructor(initialState: SimulationState) {
    this.state = initialState;
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

  public injectError(errorType: ErrorType) {
    this.state.pendingErrors = [...this.state.pendingErrors, errorType];
  }

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
    this.state.status = 'running' as SimulationStatus;
    this.state.outputMode = 'log'; // Default to log for playback
    console.log('\x1b[36m[PLAY]\x1b[0m Oynatma başlatılıyor...', data.length, 'frame.');
    this.playbackLoop();
  }

  private playbackLoop() {
    if (!this.playbackData || this.playbackIndex >= this.playbackData.length || this.state.status !== 'running') {
      if (this.playbackIndex >= this.playbackData?.length!) {
         this.stop();
         console.log('\x1b[36m[PLAY]\x1b[0m Oynatma bitti.');
      }
      return;
    }

    const current = this.playbackData[this.playbackIndex];
    this.state.elapsedMs = current.time;
    this.state.frameCount = this.playbackIndex + 1;
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
    
    // Recording
    if (this.isRecording) {
      this.recordingBuffer.push({ time: this.state.elapsedMs, frame });
    }

    // Callback or Event emission happens here
    this.onFrame(frame);

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
