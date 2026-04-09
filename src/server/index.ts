import { WebSocketServer, WebSocket } from 'ws';
import { SimulationEngine } from './engine.ts';
import type { SimulationState } from '../types';

/**
 * UART Simulator Backend Server
 * Coordinates between the Frontend (UI) and the Simulation Engine (Backend).
 */

const wss = new WebSocketServer({ port: 8080 });
const INITIAL_STATE: SimulationState = {
  status: 'stopped',
  profileId: null,
  scenarioId: null,
  outputMode: 'log',
  serialConnected: false,
  networkConnected: false,
  startedAt: null,
  elapsedMs: 0,
  frameCount: 0,
  errorCount: 0,
  framesPerSecond: 0,
  lastFrame: null,
  lastRxFrame: null,
  recentFrames: [],
  waveformHistory: [],
  logEntries: [],
  fieldOverrides: {},
  bitOverrides: {},
  activeRamps: {},
  activePulses: {},
  pendingErrors: [],
  isRecording: false,
};

const engine = new SimulationEngine(INITIAL_STATE);

console.log('\x1b[32m[SERVER]\x1b[0m UART Simulator Arka Plan Servisi ws://localhost:8080 adresinde başlatıldı.');

wss.on('connection', (ws) => {
  console.log('\x1b[34m[CONN]\x1b[0m Dashboard bağlandı.');

  // Handle engine frame emissions
  engine.onFrame = (frame) => {
    if (ws.readyState === WebSocket.OPEN) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
      
      ws.send(JSON.stringify({ 
        type: 'TICK', 
        frame, 
        elapsedMs: engine.getState().elapsedMs,
        pendingErrors: engine.getState().pendingErrors 
      }));

      // Send logs for TX and errors
      if (engine.getState().outputMode !== 'log') {
        ws.send(JSON.stringify({ 
          type: 'LOG', 
          entry: { time: timeStr, text: `TX: ${frame.rawHex}`, type: 'tx' } 
        }));
      }

      if (frame.errors.length > 0) {
        frame.errors.forEach(err => {
          ws.send(JSON.stringify({ 
            type: 'LOG', 
            entry: { time: timeStr, text: err, type: 'error' } 
          }));
        });
      }
    }
  };

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'START':
          console.log('\x1b[32m[START]\x1b[0m Simülasyon başlatılıyor...', data.profile.name);
          engine.start(data.profile, data.scenario, data.outputMode);
          break;
        case 'STOP':
          console.log('\x1b[33m[STOP]\x1b[0m Simülasyon durduruldu.');
          engine.stop();
          break;
        case 'PAUSE':
          engine.pause();
          break;
        case 'RESUME':
          engine.resume();
          break;
        case 'OVERRIDE_FIELD':
          engine.updateOverrides({ fieldOverrides: { ...engine.getState().fieldOverrides, [data.fieldId]: data.value } });
          break;
        case 'OVERRIDE_BIT':
          engine.updateOverrides({ bitOverrides: { ...engine.getState().bitOverrides, [data.bitKey]: data.value } });
          break;
        case 'RESET_OVERRIDES':
          engine.updateOverrides({ fieldOverrides: {}, bitOverrides: {}, activeRamps: {}, activePulses: {}, pendingErrors: [] });
          break;
        case 'BEGIN_RECORD':
          engine.startRecording();
          break;
        case 'END_RECORD':
          const recordedData = engine.stopRecording();
          ws.send(JSON.stringify({ type: 'RECORDING_FINISHED', data: recordedData }));
          break;
        case 'START_PLAYBACK':
          console.log('\x1b[36m[PLAY]\x1b[0m Oynatma komutu alındı.');
          engine.startPlayback(data.data);
          break;
        case 'INJECT_ERROR':
          console.log('\x1b[35m[ERROR]\x1b[0m Hata enjekte ediliyor:', data.errorType);
          engine.injectError(data.errorType);
          break;
        default:
          console.log('\x1b[31m[WARN]\x1b[0m Bilinmeyen komut:', data.type);
      }
    } catch (err) {
      console.error('\x1b[31m[ERR]\x1b[0m Mesaj işleme hatası:', err);
    }
  });

  ws.on('close', () => {
    console.log('\x1b[33m[DISCO]\x1b[0m Dashboard ayrıldı.');
  });
});
