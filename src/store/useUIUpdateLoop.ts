import { useEffect, useRef, startTransition } from 'react';
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
  dispatch: React.Dispatch<SimAction>;
}

export function useUIUpdateLoop({
  stateRef,
  msgBufferRef,
  profilesRef,
  uiVisibleRef,
  conversationBufferRef,
  exchangeBufferRef,
  dispatch,
}: UIUpdateLoopDeps): void {
  const frameCounterRef = useRef(0);

  const assignUid = (frame: Omit<GeneratedFrame, 'uId'>) => ({
    ...frame,
    uId: `${frame.frameNumber}-${frame.timestampMs || Date.now()}-${frameCounterRef.current++}`
  });

  useEffect(() => {
    const timer = setInterval(() => {
      if (!uiVisibleRef.current) return;

      const rawMsgs = msgBufferRef.current;
      msgBufferRef.current = [];

      const masterBatch: Partial<SimulationState> = {};
      const newPoints: Array<Record<string, number>> = [];
      const newLogs: SimulationState['logEntries'] = [];
      let latestElapsed = stateRef.current.elapsedMs;

      for (const raw of rawMsgs) {
        try {
          const parsed = JSON.parse(raw);
          const msgs = Array.isArray(parsed) ? parsed : [parsed];

          for (const msg of msgs) {
            switch (msg.type) {
              case 'INITIAL_STATE':
                startTransition(() => {
                  dispatch({ type: 'INIT_STATE', newState: msg.state });
                });
                break;
              case 'TICK': {
                const frameWithUid = assignUid(msg.frame);
                masterBatch.lastFrame = frameWithUid;
                masterBatch.status = msg.status;
                masterBatch.profileId = msg.selectedProfileId;
                latestElapsed = msg.elapsedMs;

                const point: Record<string, number> = { t: msg.frame.timestampMs };
                msg.frame.fields.forEach((f: { name: string; decimal: number }) => point[f.name] = f.decimal);
                newPoints.push(point);
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
                newLogs.push({
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
                newLogs.push({ time: timeStr, text: `RX: ${msg.hex}`, type: 'rx' });

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
                  newLogs.push({ time: new Date().toLocaleTimeString(), text: `SERİ PORT HATASI: ${msg.error}`, type: 'error' });
                } else if (msg.connected) {
                  newLogs.push({ time: new Date().toLocaleTimeString(), text: 'Seri port başarıyla bağlandı.', type: 'info' });
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

      startTransition(() => {
        dispatch({
          type: 'MASTER_TICK',
          updates: masterBatch,
          points: newPoints,
          logEntries: newLogs,
          elapsedMs: latestElapsed
        });
      });
    }, 66);

    return () => clearInterval(timer);
  }, [conversationBufferRef, dispatch, exchangeBufferRef, msgBufferRef, profilesRef, stateRef, uiVisibleRef]);
}
