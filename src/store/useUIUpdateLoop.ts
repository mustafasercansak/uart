import { useEffect, useRef } from 'react';
import type React from 'react';
import type { SimulationState } from '../types';
import type { FrameProfile } from '../types';
import { parseFrame } from '../engines/FrameParser';
import type { SimAction } from './simulationReducer';
import type { ConversationEntry, Exchange, GeneratedFrame } from '../types';

interface UIUpdateLoopDeps {
  stateRef: React.MutableRefObject<SimulationState>;
  msgBufferRef: React.MutableRefObject<string[]>;
  profilesRef: React.MutableRefObject<FrameProfile[]>;
  uiVisibleRef: React.MutableRefObject<boolean>;
  conversationBufferRef: React.MutableRefObject<ConversationEntry[]>;
  exchangeBufferRef: React.MutableRefObject<Exchange[]>;
  waveformHistoryRef: React.MutableRefObject<Array<Record<string, number>>>;
  dispatch: React.Dispatch<SimAction>;
}

export function useUIUpdateLoop({
  stateRef,
  msgBufferRef,
  profilesRef,
  uiVisibleRef,
  conversationBufferRef,
  exchangeBufferRef,
  waveformHistoryRef,
  dispatch,
}: UIUpdateLoopDeps): void {
  const frameCounterRef = useRef(0);

  const formatNow = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  const assignUid = (frame: Omit<GeneratedFrame, 'uId'>) => ({
    ...frame,
    uId: `${frame.frameNumber}-${frame.timestampMs || Date.now()}-${frameCounterRef.current++}`
  });

  useEffect(() => {
    const timer = setInterval(() => {
      if (!uiVisibleRef.current) return;

      // Process incoming messages in bounded chunks to avoid long main-thread stalls.
      const MAX_MSGS_PER_CYCLE = 20;
      const rawMsgs = msgBufferRef.current.splice(0, MAX_MSGS_PER_CYCLE);

      const masterBatch: Partial<SimulationState> = {};
      const MAX_LOGS_PER_CYCLE = 24;
      const newLogs: SimulationState['logEntries'] = [];
      let latestElapsed = stateRef.current.elapsedMs;

      const pushLog = (entry: SimulationState['logEntries'][0]) => {
        if (newLogs.length < MAX_LOGS_PER_CYCLE) newLogs.push(entry);
      };

      for (const raw of rawMsgs) {
        try {
          const parsed = JSON.parse(raw);
          const msgs = Array.isArray(parsed) ? parsed : [parsed];

          for (const msg of msgs) {
            switch (msg.type) {
              case 'INITIAL_STATE':
                waveformHistoryRef.current = [];
                dispatch({ type: 'INIT_STATE', newState: msg.state });
                break;
              case 'TICK': {
                const frameWithUid = assignUid(msg.frame);
                masterBatch.lastFrame = frameWithUid;
                masterBatch.status = msg.status;
                masterBatch.profileId = msg.selectedProfileId;
                latestElapsed = msg.elapsedMs;

                // Write directly to ref — no React state allocation, no re-render
                const point: Record<string, number> = { t: msg.frame.timestampMs };
                msg.frame.fields.forEach((f: { name: string; decimal: number }) => { point[f.name] = f.decimal; });
                waveformHistoryRef.current.push(point);
                if (waveformHistoryRef.current.length > 180) {
                  waveformHistoryRef.current.splice(0, waveformHistoryRef.current.length - 180);
                }
                break;
              }
              case 'LOG':
                newLogs.push(msg.entry);
                break;
              case 'EXCHANGE':
                exchangeBufferRef.current.push(msg.exchange);
                break;
              case 'CONVERSATION': {
                // Deduplication: Ignore backend TX confirms if we already have a recent local one
                const isDuplicate = msg.entry.type === 'tx' && stateRef.current.conversationLogs.slice(0, 5).some(prev =>
                  prev.type === 'tx' &&
                  Math.abs(prev.timestamp - msg.entry.timestamp) < 500 &&
                  prev.rawHex === msg.entry.rawHex
                );

                if (isDuplicate) break;

                conversationBufferRef.current.push(msg.entry);
                const cDate = msg.entry.timestamp ? new Date(msg.entry.timestamp) : new Date();
                const cTimeStr = `${cDate.getHours().toString().padStart(2, '0')}:${cDate.getMinutes().toString().padStart(2, '0')}:${cDate.getSeconds().toString().padStart(2, '0')}.${cDate.getMilliseconds().toString().padStart(3, '0')}`;
                pushLog({
                  time: cTimeStr,
                  text: `${msg.entry.type.toUpperCase()}: ${msg.entry.rawHex}${msg.entry.details ? ` (${msg.entry.details})` : ''}`,
                  type: msg.entry.type
                });
                break;
              }
              case 'RAW_RX_DATA': {
                const profile = profilesRef.current.find(p => p.id === stateRef.current.profileId);
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
                pushLog({ time: timeStr, text: `RX: ${msg.hex}`, type: 'rx' });

                // Restore immediate RX pairing for Lab reliability
                const rxEntry: ConversationEntry = {
                  id: `local-rx-${Date.now()}-${Math.random()}`,
                  timestamp: Date.now(),
                  type: 'rx',
                  rawHex: msg.hex,
                  details: 'Raw Data'
                };
                conversationBufferRef.current.push(rxEntry);

                // Pairing logic for Timeline
                const recentExchanges = [...exchangeBufferRef.current, ...stateRef.current.exchanges];
                const pendingTx = recentExchanges.find(e =>
                  e.tx && !e.rx && (Date.now() - e.startTime < 2000)
                );

                if (pendingTx) {
                  pendingTx.rx = rxEntry;
                  pendingTx.latencyMs = rxEntry.timestamp - pendingTx.startTime;
                  pendingTx.status = 'done';
                  if (!exchangeBufferRef.current.includes(pendingTx)) {
                    exchangeBufferRef.current.push(pendingTx);
                  }
                } else {
                  exchangeBufferRef.current.push({
                    id: `local-ex-rx-${Date.now()}-${Math.random()}`,
                    startTime: rxEntry.timestamp,
                    rx: rxEntry,
                    status: 'done'
                  });
                }

                if (profile) {
                  const bytes = msg.hex.split(' ').map((h: string) => parseInt(h, 16));
                  const fields = parseFrame(profile, bytes);
                  masterBatch.lastRxFrame = assignUid({
                    frameNumber: 0,
                    timestampMs: Date.now(),
                    rawHex: msg.hex,
                    rawBytes: bytes,
                    fields: fields || [],
                    errors: []
                  });
                }
                break;
              }
              case 'STATUS_UPDATE':
                masterBatch.status = msg.status;
                break;
              case 'PORTS_LIST':
                masterBatch.availablePorts = msg.ports;
                break;
              case 'SERIAL_STATUS':
                masterBatch.serialConnected = msg.connected;
                if (msg.error) {
                  pushLog({ time: formatNow(), text: `SERİ PORT HATASI: ${msg.error}`, type: 'error' });
                } else if (msg.connected) {
                  pushLog({ time: formatNow(), text: 'Seri port başarıyla bağlandı.', type: 'info' });
                }
                break;
              case 'NETWORK_STATUS':
                masterBatch.networkConnected = msg.connected;
                if (msg.error) {
                  pushLog({ time: formatNow(), text: `AĞ/TCP HATASI: ${msg.error}`, type: 'error' });
                } else {
                  pushLog({
                    time: formatNow(),
                    text: msg.connected ? 'TCP bağlantısı kuruldu.' : 'TCP bağlantısı kapatıldı.',
                    type: 'info',
                  });
                }
                break;
            }
          }
        } catch (e) {
          console.error('[UI UPDATE] JSON parse hatası veya işleme hatası:', e);
        }
      }

      if (conversationBufferRef.current.length > 0) {
        const convEntries = [...conversationBufferRef.current];
        conversationBufferRef.current = [];
        masterBatch.conversationLogs = [...convEntries, ...stateRef.current.conversationLogs].slice(0, 100);
      }

      if (exchangeBufferRef.current.length > 0) {
        const exEntries = [...exchangeBufferRef.current];
        exchangeBufferRef.current = [];
        const currentExchanges = [...stateRef.current.exchanges];
        let latestLat: number | null = null;

        exEntries.forEach(ex => {
          const idx = currentExchanges.findIndex(e => e.id === ex.id);
          if (idx !== -1) currentExchanges[idx] = ex;
          else currentExchanges.unshift(ex);
          if (ex.latencyMs !== undefined) latestLat = ex.latencyMs;
        });

        if (latestLat !== null) {
          const arrivals = [...stateRef.current.timingStats.interPacketArrivals, latestLat].slice(-50);
          masterBatch.timingStats = {
            averageLatencyMs: arrivals.reduce((a, b) => a + b, 0) / arrivals.length,
            minLatencyMs: Math.min(...arrivals),
            maxLatencyMs: Math.max(...arrivals),
            jitterMs: arrivals.length > 1
              ? arrivals.slice(1).reduce((acc, v, i) => acc + Math.abs(v - arrivals[i]), 0) / (arrivals.length - 1)
              : 0,
            interPacketArrivals: arrivals
          };
        }

        masterBatch.exchanges = currentExchanges.slice(0, 50);
      }

      const hasUpdates =
        Object.keys(masterBatch).length > 0 ||
        newLogs.length > 0;

      if (hasUpdates) {
        dispatch({
          type: 'MASTER_TICK',
          updates: masterBatch,
          points: [],   // waveformHistory now lives in waveformHistoryRef, not state
          logEntries: newLogs,
          elapsedMs: latestElapsed
        });
      }
    }, 40);

    return () => clearInterval(timer);
  }, [conversationBufferRef, dispatch, exchangeBufferRef, msgBufferRef, profilesRef, stateRef, uiVisibleRef, waveformHistoryRef]);
}
