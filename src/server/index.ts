import { WebSocketServer, WebSocket } from 'ws';
import { SimulationEngine } from './engine.ts';
import type { SimulationState, SerialConfig, ResponderRule } from '../types';
import { SerialPort } from 'serialport';

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
};

let activePort: SerialPort | null = null;

const engine = new SimulationEngine(INITIAL_STATE);

console.log('\x1b[32m[SERVER]\x1b[0m UART Simulator Arka Plan Servisi ws://localhost:8080 adresinde başlatıldı.');

wss.on('connection', (ws) => {
  console.log('\x1b[34m[CONN]\x1b[0m Dashboard bağlandı.');

  // Send initial state immediately
  ws.send(JSON.stringify({ 
    type: 'INITIAL_STATE', 
    state: engine.getState(),
    exchanges: engine.getState().exchanges
  }));

  // Handle engine frame emissions
  engine.onFrame = (frame) => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

    // 1. Send to Dashboard if connected
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'TICK', 
        frame, 
        elapsedMs: engine.getState().elapsedMs,
        status: engine.getState().status,
        selectedProfileId: engine.getProfile()?.id,
        pendingErrors: engine.getState().pendingErrors,
        exchanges: engine.getState().exchanges
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

    // 2. Send to Serial Port (Independent of Dashboard connection)
    if (activePort && activePort.writable) {
       activePort.write(Buffer.from(frame.rawBytes), (err) => {
         if (err) console.error(`\x1b[31m[TX ERR]\x1b[0m`, err.message);
         else console.log(`\x1b[36m[TX]\x1b[0m ${frame.rawBytes.length} bytes sent: ${frame.rawHex}`);
       });
    }
  };

  engine.onRawResponse = (bytes) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'TX_RAW', payload: bytes }));
    }
    if (activePort && activePort.writable) {
        activePort.write(Buffer.from(bytes));
    }
  };

  engine.onConversation = (entry) => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'CONVERSATION', entry }));
    }
  };

  engine.onExchange = (exchange) => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'EXCHANGE', exchange }));
    }
  };

  ws.on('message', async (message) => {
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
        case 'UPDATE_RESPONDER_RULES':
          engine.setResponderRules(data.rules as ResponderRule[]);
          break;
        case 'GET_PORTS':
          SerialPort.list().then(ports => {
            ws.send(JSON.stringify({ type: 'PORTS_LIST', ports }));
          });
          break;
        case 'CONNECT_SERIAL': {
          const config = data.config as SerialConfig;
          
          // Helper to close port safely
          const closePort = () => new Promise<void>((resolve) => {
            if (!activePort || !activePort.isOpen) return resolve();
            activePort.close(() => {
              activePort = null;
              setTimeout(resolve, 100); // Give OS time to release handle
            });
          });

          await closePort();
          
          console.log(`\x1b[34m[SERIAL]\x1b[0m Bağlanılıyor: ${config.portName} (${config.baudRate})`);
          activePort = new SerialPort({ 
            path: config.portName, 
            baudRate: config.baudRate,
            autoOpen: false 
          });

          activePort.open((err) => {
            if (err) {
              const msg = err.message.includes('Access denied') 
                ? 'Port kilitli (Başka bir program COM portunu kullanıyor olabilir)'
                : err.message;
              console.error('\x1b[31m[ERR]\x1b[0m Seri port açılamadı:', msg);
              ws.send(JSON.stringify({ type: 'SERIAL_STATUS', connected: false, error: msg }));
              return;
            }
            console.log('\x1b[32m[SERIAL]\x1b[0m Bağlantı başarılı.');
            ws.send(JSON.stringify({ type: 'SERIAL_STATUS', connected: true }));
          });

          // Re-attach listeners after successful open or initialization
          activePort.on('data', (bytes) => {
            const byteArr = Array.from(bytes);
            const hex = byteArr.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            console.log(`\x1b[35m[RX]\x1b[0m ${bytes.length} bytes received: ${hex}`);
            
            ws.send(JSON.stringify({ 
              type: 'RAW_RX_DATA', 
              hex
            }));
            engine.processIncomingData(byteArr);
          });

          activePort.on('error', (err) => {
             console.error('\x1b[31m[ERR]\x1b[0m Seri port hatası:', err.message);
             ws.send(JSON.stringify({ type: 'SERIAL_STATUS', connected: false, error: err.message }));
          });
          break;
        }
        case 'DISCONNECT_SERIAL':
          if (activePort) {
            activePort.close(() => {
              activePort = null;
              ws.send(JSON.stringify({ type: 'SERIAL_STATUS', connected: false }));
            });
          } else {
            ws.send(JSON.stringify({ type: 'SERIAL_STATUS', connected: false }));
          }
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
