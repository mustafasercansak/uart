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
const clients = new Set<WebSocket>();

console.log('\x1b[32m[SERVER]\x1b[0m UART Simulator Arka Plan Servisi ws://127.0.0.1:8080 adresinde başlatıldı.');

// Helper to broadcast to all connected clients
const broadcast = (message: any) => {
    const data = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(data);
            } catch (err) {
                console.error('\x1b[31m[BROADCAST ERR]\x1b[0m', err);
            }
        }
    });
};

// Setup Engine callbacks ONCE (Broadcast logic)
engine.onFrame = (frame) => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

    broadcast({ 
        type: 'TICK', 
        frame, 
        elapsedMs: engine.getState().elapsedMs,
        status: engine.getState().status,
        selectedProfileId: engine.getProfile()?.id,
        pendingErrors: engine.getState().pendingErrors,
        exchanges: engine.getState().exchanges
    });

    if (engine.getState().outputMode !== 'log') {
        broadcast({ 
            type: 'LOG', 
            entry: { time: timeStr, text: `TX: ${frame.rawHex}`, type: 'tx' } 
        });
    }

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
         else console.log(`\x1b[36m[TX]\x1b[0m ${frame.rawBytes.length} bytes sent: ${frame.rawHex}`);
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
          break;
        case 'INJECT_ERROR':
          engine.injectError(data.errorType);
          break;
        case 'UPDATE_RESPONDER_RULES':
          engine.setResponderRules(data.rules as ResponderRule[]);
          break;
        case 'GET_PORTS':
          SerialPort.list().then(ports => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PORTS_LIST', ports }));
          });
          break;
        case 'CONNECT_SERIAL': {
          const config = data.config as SerialConfig;
          const closePort = () => new Promise<void>((resolve) => {
            if (!activePort || !activePort.isOpen) return resolve();
            activePort.close(() => {
              activePort = null;
              setTimeout(resolve, 100);
            });
          });

          await closePort();
          console.log(`\x1b[34m[SERIAL]\x1b[0m Bağlanılıyor: ${config.portName}`);
          activePort = new SerialPort({ path: config.portName, baudRate: config.baudRate, autoOpen: false });

          activePort.open((err) => {
            if (err) {
              const msg = err.message.includes('Access denied') ? 'Port kilitli' : err.message;
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'SERIAL_STATUS', connected: false, error: msg }));
              return;
            }
            broadcast({ type: 'SERIAL_STATUS', connected: true });
          });

          let rxBuffer: number[] = [];
          let rxTimeout: NodeJS.Timeout | null = null;

          activePort.on('data', (bytes) => {
            const byteArr = Array.from(bytes);
            rxBuffer.push(...byteArr);

            if (rxTimeout) clearTimeout(rxTimeout);

            rxTimeout = setTimeout(() => {
                if (rxBuffer.length === 0) return;
                
                const hex = rxBuffer.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                console.log(`\x1b[35m[RX]\x1b[0m ${rxBuffer.length} bytes received: ${hex}`);
                
                broadcast({ type: 'RAW_RX_DATA', hex });
                
                engine.processIncomingData(rxBuffer);
                rxBuffer = [];
                rxTimeout = null;
            }, 50);
          });

          activePort.on('error', (err) => {
             broadcast({ type: 'SERIAL_STATUS', connected: false, error: err.message });
          });
          break;
        }
        case 'DISCONNECT_SERIAL':
          if (activePort) {
            activePort.close(() => {
              activePort = null;
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
