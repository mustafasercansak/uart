/**
 * Simulation Worker — SimulationEngine runs here, isolated from the UI thread.
 * Main thread sends commands via postMessage; worker sends events back the same way.
 * The message format mirrors the old WebSocket protocol so useUIUpdateLoop is unchanged.
 */

import { SimulationEngine } from '../engines/SimulationEngine';
import { INITIAL_STATE } from '../store/simulationReducer';
import type { ResponderRule, Trigger, SignalIntegrity, ScriptablePeripheral } from '../types';

const engine = new SimulationEngine(structuredClone(INITIAL_STATE));

// ── ENGINE CALLBACKS → main thread ──────────────────────────────────────────

const formatNow = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
};

engine.onFrame = (frame) => {
  frame.timestampMs = Date.now();
  const st = engine.getState();
  self.postMessage({
    type: 'TICK',
    frame,
    elapsedMs: st.elapsedMs,
    framesPerSecond: st.framesPerSecond,
    status: st.status,
    selectedProfileId: engine.getProfile()?.id,
    pendingErrors: st.pendingErrors,
    // exchanges omitted — each exchange is sent individually via onExchange
  });
  frame.errors.forEach(err =>
    self.postMessage({ type: 'LOG', entry: { time: formatNow(), text: err, type: 'error' } })
  );
};

engine.onRawResponse = (bytes) => {
  self.postMessage({ type: 'TX_RAW', payload: bytes });
  // Ask main thread to write to hardware
  self.postMessage({ type: '__WRITE_HARDWARE__', bytes });
};

engine.onConversation = (entry) => self.postMessage({ type: 'CONVERSATION', entry });
engine.onExchange = (exchange) => self.postMessage({ type: 'EXCHANGE', exchange });

// ── COMMANDS FROM MAIN THREAD ────────────────────────────────────────────────

self.onmessage = (event: MessageEvent) => {
  const msg = event.data;

  switch (msg.type) {
    case 'START':
      engine.start(msg.profile, msg.scenario, msg.outputMode);
      self.postMessage({ type: 'STATUS_UPDATE', status: 'running' });
      break;

    case 'SET_PROFILE':
      engine.setProfile(msg.profile);
      break;

    case 'STOP':
      engine.stop();
      self.postMessage({ type: 'STATUS_UPDATE', status: 'stopped' });
      break;

    case 'PAUSE':
      engine.pause();
      self.postMessage({ type: 'STATUS_UPDATE', status: 'paused' });
      break;

    case 'RESUME':
      engine.resume();
      self.postMessage({ type: 'STATUS_UPDATE', status: 'running' });
      break;

    case 'OVERRIDE_FIELD': {
      const cur = engine.getState().fieldOverrides;
      engine.updateOverrides({ fieldOverrides: { ...cur, [msg.fieldId]: msg.value } });
      break;
    }

    case 'OVERRIDE_BIT': {
      const cur = engine.getState().bitOverrides;
      engine.updateOverrides({ bitOverrides: { ...cur, [msg.bitKey]: msg.value } });
      break;
    }

    case 'INJECT_ERROR':
      engine.injectError(msg.errorType);
      break;

    case 'RESET_OVERRIDES':
      engine.updateOverrides({ fieldOverrides: {}, bitOverrides: {}, activeRamps: {}, activePulses: {}, pendingErrors: [] });
      break;

    case 'SET_RESPONDER_RULES':
      engine.setResponderRules(msg.rules as ResponderRule[]);
      break;

    case 'SET_TRIGGERS':
      engine.setTriggers(msg.triggers as Trigger[]);
      break;

    case 'SET_SIGNAL_INTEGRITY':
      engine.setSignalIntegrity(msg.integrity as Partial<SignalIntegrity>);
      break;

    case 'UPDATE_PERIPHERALS':
      engine.updatePeripherals(msg.peripherals as ScriptablePeripheral[]);
      break;

    case 'INCOMING_DATA':
      engine.processIncomingData(msg.bytes as number[]);
      break;

    case 'SET_SERIAL_CONNECTED':
      engine.updateOverrides({ serialConnected: msg.connected });
      break;

    case 'SET_NETWORK_CONNECTED':
      engine.updateOverrides({ networkConnected: msg.connected });
      break;

    case 'INJECT_RAW_TX':
      engine.injectRawTX(msg.bytes as number[]);
      break;

    case 'START_RECORDING':
      engine.startRecording();
      break;

    case 'STOP_RECORDING': {
      const data = engine.stopRecording();
      self.postMessage({ type: 'RECORDING_FINISHED', data });
      break;
    }

    case 'START_PLAYBACK':
      engine.startPlayback(msg.data);
      self.postMessage({ type: 'STATUS_UPDATE', status: 'running' });
      break;

    case 'PAUSE_PLAYBACK':
      engine.pausePlayback();
      self.postMessage({ type: 'STATUS_UPDATE', status: 'paused' });
      break;

    case 'RESUME_PLAYBACK':
      engine.resumePlayback();
      self.postMessage({ type: 'STATUS_UPDATE', status: 'running' });
      break;

    case 'SEEK_PLAYBACK':
      engine.seekToFrame(msg.index as number);
      break;

    case 'STEP_PLAYBACK':
      engine.stepPlayback(msg.delta as number);
      break;

    case 'SET_CUSTOM_WAVEFORM':
      engine.updateOverrides({ customWaveform: msg.waveform } as never);
      break;

    case 'SET_ANALYZER_MODE':
      engine.updateOverrides({ analyzerMode: msg.enabled as boolean });
      break;

    case 'SET_GPS_POSITION':
      engine.setGpsPosition(msg.lat as number, msg.lon as number, msg.alt as number);
      break;

    case 'SET_GPS_WALK_MODE':
      engine.setGpsWalkMode(msg.enabled as boolean);
      break;

    case 'SIMULATE_INCOMING_CALL':
      engine.simulateIncomingCall(msg.number as string | undefined);
      break;

    case 'SIMULATE_INCOMING_SMS':
      engine.simulateIncomingSms(msg.number as string, msg.text as string);
      break;

    case 'SET_ROAMING':
      engine.setRoaming(msg.enabled as boolean, msg.operator as string | undefined);
      break;
  }
};
