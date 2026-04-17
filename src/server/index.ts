import { WebSocketServer, WebSocket } from 'ws';
import { SimulationEngine } from './engine';
import type { SimulationState, SerialConfig, ResponderRule } from '../types';
import { SerialPort } from 'serialport';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECORDINGS_DIR = path.join(__dirname, '..', '..', 'recordings');

// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

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
  conversationLogs: [],
  exchanges: [],
  selectedExchangeId: null,
  analyzerMode: false,
  displayFilter: '',
  watchlist: [],
  snapshots: [],
  timingStats: {
    averageLatencyMs: 0,
    minLatencyMs: 0,
    maxLatencyMs: 0,
    jitterMs: 0,
    interPacketArrivals: []
  },
  diffFrames: [null, null],
  responderRules: [],
  telemetryLayouts: {},
  recordings: [],
  playbackIndex: 0,
  playbackTotal: 0,
  triggers: [],
  signalIntegrity: {
    noiseLevel: 0,
    jitterMs: 0,
    bitFlipsEnabled: false
  },
  dashboardLayout: { widgets: [] },
  logicHistory: [
    { id: 'tx-main', name: 'UART TX', transitions: [] }
  ],
  validationSession: null
};

let activePort: SerialPort | null = null;
const engine = new SimulationEngine(INITIAL_STATE);
const clients = new Set<WebSocket>();

console.log('\x1b[32m[SERVER]\x1b[0m UART Simulator Arka Plan Servisi ws://127.0.0.1:8080 adresinde başlatıldı.');

let broadcastBuffer: any[] = [];

// Flush backend websocket buffer to frontend clients at 60 FPS
setInterval(() => {
  if (broadcastBuffer.length === 0) return;
  const data = JSON.stringify(broadcastBuffer);
  broadcastBuffer = [];

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (err) {
        console.error('\x1b[31m[BROADCAST ERR]\x1b[0m', err);
      }
    }
  });
}, 16);

// Helper to broadcast to all connected clients
const broadcast = (message: any) => {
  broadcastBuffer.push(message);
};

// Send critical or large messages immediately
const broadcastImmediate = (message: any) => {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (err) { }
    }
  });
};

// Setup Engine callbacks ONCE (Broadcast logic)
engine.onFrame = (frame) => {
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

  // Update timestamp to real-world time for UI animations (Hardware TX active etc)
  frame.timestampMs = Date.now();

  broadcast({
    type: 'TICK',
    frame,
    elapsedMs: engine.getState().elapsedMs,
    framesPerSecond: engine.getState().framesPerSecond,
    status: engine.getState().status,
    selectedProfileId: engine.getProfile()?.id,
    pendingErrors: engine.getState().pendingErrors,
    exchanges: engine.getState().exchanges
  });


  if (frame.errors.length > 0) {
    frame.errors.forEach(err => {
      broadcast({
        type: 'LOG',
        entry: { time: timeStr, text: err, type: 'error' }
      });
    });
  }

  // Send to Serial Port
  if (activePort && activePort.writable) {
    activePort.write(Buffer.from(frame.rawBytes), (err) => {
      if (err) console.error(`\x1b[31m[TX ERR]\x1b[0m`, err.message);
      else console.log(`\x1b[36m[TX]\x1b[0m ${frame.rawBytes.length} bytes sent    : ${frame.rawHex}`);
    });
  }
};

engine.onRawResponse = (bytes) => {
  broadcast({ type: 'TX_RAW', payload: bytes });
  if (activePort && activePort.writable) {
    activePort.write(Buffer.from(bytes));
  }
};

engine.onConversation = (entry) => {
  broadcast({ type: 'CONVERSATION', entry });
};

engine.onExchange = (exchange) => {
  broadcast({ type: 'EXCHANGE', exchange });
};

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`\x1b[34m[CONN]\x1b[0m Dashboard bağlandı. Toplam: ${clients.size}`);

  const fullState = engine.getState();
  // Filter out UI-only or confusing flags for initial sync
  const { networkConnected, ...cleanState } = fullState;

  ws.send(JSON.stringify({
    type: 'INITIAL_STATE',
    state: cleanState,
    exchanges: cleanState.exchanges
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'START':
          console.log('\x1b[32m[START]\x1b[0m Simülasyon başlatılıyor...', data.profile.name);
          engine.start(data.profile, data.scenario, data.outputMode);
          broadcast({ type: 'STATUS_UPDATE', status: 'running' });
          break;
        case 'STOP':
          console.log('\x1b[33m[STOP]\x1b[0m Simülasyon durduruldu.');
          engine.stop();
          broadcast({ type: 'STATUS_UPDATE', status: 'stopped' });
          break;
        case 'PAUSE':
          engine.pause();
          broadcast({ type: 'STATUS_UPDATE', status: 'paused' });
          break;
        case 'RESUME':
          engine.resume();
          broadcast({ type: 'STATUS_UPDATE', status: 'running' });
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
          engine.startPlayback(data.data);
          broadcast({ type: 'STATUS_UPDATE', status: 'running' });
          break;
        case 'PAUSE_PLAYBACK':
          engine.pausePlayback();
          broadcast({ type: 'STATUS_UPDATE', status: 'paused' });
          break;
        case 'RESUME_PLAYBACK':
          engine.resumePlayback();
          broadcast({ type: 'STATUS_UPDATE', status: 'running' });
          break;
        case 'SEEK_PLAYBACK':
          engine.seekToFrame(data.index);
          break;
        case 'STEP_PLAYBACK':
          engine.stepPlayback(data.delta);
          break;
        case 'LIST_RECORDINGS': {
          const files = fs.readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.json'));
          const recordings = files.map(f => {
            const stats = fs.statSync(path.join(RECORDINGS_DIR, f));
            const content = JSON.parse(fs.readFileSync(path.join(RECORDINGS_DIR, f), 'utf-8'));
            return {
              id: f,
              name: f.replace('.json', ''),
              createdAt: stats.birthtimeMs,
              frameCount: content.length,
              durationMs: content.length > 0 ? content[content.length - 1].time : 0,
              data: content
            };
          });
          ws.send(JSON.stringify({ type: 'RECORDINGS_LIST', recordings }));
          break;
        }
        case 'SAVE_RECORDING': {
          const fileName = `${data.name || `recording_${Date.now()}`}.json`;
          fs.writeFileSync(path.join(RECORDINGS_DIR, fileName), JSON.stringify(data.data, null, 2));
          console.log(`\x1b[35m[REC]\x1b[0m Kayıt kaydedildi: ${fileName}`);
          // Refresh list for all clients
          const files = fs.readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.json'));
          broadcastImmediate({ type: 'RECORDINGS_LIST', recordings: files.map(f => ({ id: f, name: f.replace('.json', '') })) });
          break;
        }
        case 'DELETE_RECORDING': {
          const filePath = path.join(RECORDINGS_DIR, data.id);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`\x1b[31m[REC]\x1b[0m Kayıt silindi: ${data.id}`);
            // Broadcast updated list
            const files = fs.readdirSync(RECORDINGS_DIR).filter(f => f.endsWith('.json'));
            broadcast({ type: 'RECORDINGS_LIST', recordings: files.map(f => ({ id: f, name: f.replace('.json', '') })) });
          }
          break;
        }
        case 'INJECT_ERROR':
          engine.injectError(data.errorType);
          break;
        case 'UPDATE_RESPONDER_RULES':
          engine.setResponderRules(data.rules as ResponderRule[]);
          break;
        case 'SET_TRIGGERS':
          engine.setTriggers(data.triggers);
          break;
        case 'SET_SIGNAL_INTEGRITY':
          engine.setSignalIntegrity(data.integrity);
          break;
        case 'GET_PORTS':
          SerialPort.list().then(ports => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PORTS_LIST', ports }));
          });
          break;
        case 'CONNECT_SERIAL': {
          try {
            const config = data.config as SerialConfig;
            if (!config || !config.portName) {
              console.error('\x1b[31m[SERIAL ERR]\x1b[0m Geçersiz port yapılandırması alındı.');
              return;
            }

            // If we're already connecting or connected to THIS port, ignore
            if (activePort && activePort.path === config.portName && activePort.isOpen) {
              console.log(`\x1b[33m[SERIAL]\x1b[0m ${config.portName} zaten bağlı.`);
              ws.send(JSON.stringify({ type: 'SERIAL_STATUS', connected: true }));
              return;
            }

            const closePort = () => new Promise<void>((resolve) => {
              if (!activePort || !activePort.isOpen) return resolve();
              activePort.close(() => {
                activePort = null;
                setTimeout(resolve, 100);
              });
            });

            await closePort();
            console.log(`\x1b[34m[SERIAL]\x1b[0m Bağlanılıyor: ${config.portName} (${config.baudRate} baud)`);

            activePort = new SerialPort({
              path: config.portName,
              baudRate: config.baudRate,
              autoOpen: false
            });

            activePort.open((err) => {
              if (err) {
                const msg = err.message.includes('Access denied')
                  ? 'Port kilitli (Başka bir program kullanıyor olabilir)'
                  : err.message;
                console.error(`\x1b[31m[SERIAL ERR]\x1b[0m ${config.portName} bağlantı hatası:`, err.message);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'SERIAL_STATUS', connected: false, error: msg }));
                }
                return;
              }
              console.log(`\x1b[32m[SERIAL]\x1b[0m ${config.portName} başarıyla bağlandı.`);
              engine.updateOverrides({ serialConnected: true });
              broadcast({ type: 'SERIAL_STATUS', connected: true });
            });

            let rxBuffer: number[] = [];
            let rxTimeout: NodeJS.Timeout | null = null;

            activePort.on('data', (bytes: Buffer) => {
              try {
                const byteArr = Array.from(bytes);
                rxBuffer.push(...byteArr);

                if (rxTimeout) clearTimeout(rxTimeout);

                rxTimeout = setTimeout(() => {
                  if (rxBuffer.length === 0) return;

                  const hex = rxBuffer.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                  console.log(`\x1b[35m[RX]\x1b[0m ${rxBuffer.length} bytes received  : ${hex}`);

                  broadcast({ type: 'RAW_RX_DATA', hex });

                  engine.processIncomingData(rxBuffer);
                  rxBuffer = [];
                  rxTimeout = null;
                }, 50);
              } catch (err: any) {
                console.error('\x1b[31m[RX DATA ERR]\x1b[0m', err.message);
              }
            });

            activePort.on('error', (err) => {
              console.error('\x1b[31m[SERIAL ERROR EVENT]\x1b[0m', err.message);
              broadcast({ type: 'SERIAL_STATUS', connected: false, error: err.message });
            });
          } catch (err: any) {
            console.error('\x1b[31m[CONNECT_SERIAL ERR]\x1b[0m', err.message);
          }
          break;
        }
        case 'DISCONNECT_SERIAL':
          if (activePort) {
            console.log('\x1b[33m[SERIAL]\x1b[0m Bağlantı kesiliyor...');
            activePort.close(() => {
              activePort = null;
              engine.updateOverrides({ serialConnected: false });
              broadcast({ type: 'SERIAL_STATUS', connected: false });
            });
          }
          break;
      }
    } catch (err) {
      console.error('\x1b[31m[ERR]\x1b[0m', err);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`\x1b[33m[DISCO]\x1b[0m Dashboard ayrıldı. Kalan: ${clients.size}`);
  });
});

// Global Error Handler to prevent exit code 1 crashes
process.on('uncaughtException', (err) => {
  console.error('\x1b[31m[FATAL ERROR]\x1b[0m', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\x1b[31m[UNHANDLED REJECTION]\x1b[0m', reason);
});
