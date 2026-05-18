import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Circle, GitCompare, Send, Square, Trash2 } from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import type { GeneratedFrame } from '../../../types';
import { useTranslation } from '../../../i18n/context';

interface FrameMonitorProps {
  lastFrame: GeneratedFrame | null;
  recentFrames: GeneratedFrame[];
  selectedFrameId?: number;
  onSelectFrame?: (frame: GeneratedFrame) => void;
}

const MAX_TX_HISTORY = 50;

const FrameMonitor = memo(({ lastFrame, selectedFrameId, onSelectFrame }: FrameMonitorProps) => {
  const { setDiffFrame } = useSimulation();
  const { t } = useTranslation();
  const [txHistory, setTxHistory] = useState<GeneratedFrame[]>([]);
  const prevUid = useRef<string | null>(null);
  const [flashUid, setFlashUid] = useState<string | null>(null);

  // Frame Recorder
  const [isRecording, setIsRecording] = useState(false);
  const recordedRef = useRef<GeneratedFrame[]>([]);

  useEffect(() => {
    if (!lastFrame) return;
    if (lastFrame.uId === prevUid.current) return;
    prevUid.current = lastFrame.uId;
    setTxHistory((prev) => [lastFrame, ...prev].slice(0, MAX_TX_HISTORY));
    setFlashUid(lastFrame.uId);
    setTimeout(() => setFlashUid(null), 400);
    if (isRecording) recordedRef.current.push(lastFrame);
  }, [lastFrame, isRecording]);

  const clearHistory = () => {
    setTxHistory([]);
    prevUid.current = null;
  };

  const startRecording = () => {
    recordedRef.current = [];
    setIsRecording(true);
  };

  const stopAndExport = useCallback(() => {
    setIsRecording(false);
    const frames = recordedRef.current;
    if (frames.length === 0) return;

    const header = 'frame,timestamp_ms,bytes,hex,errors';
    const rows = frames.map(f =>
      `${f.frameNumber},${f.timestampMs},${f.rawBytes.length},"${f.rawHex}","${f.errors.join('|')}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uart_frames_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordedRef.current = [];
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 border-b border-gray-800 bg-green-900/5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60 shrink-0">
        <div className="flex items-center gap-2">
          <Send size={12} className={txHistory.length > 0 ? 'text-green-400 animate-pulse' : 'text-gray-600'} />
          <span className="text-green-400 text-[10px] font-mono uppercase tracking-wider">
            {t('frameMonitor.liveFrame')}
          </span>
          {txHistory.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-900/40 text-green-300 border border-green-800/40">
              {txHistory.length}
            </span>
          )}
          {isRecording && (
            <span className="text-[9px] font-mono text-red-400 animate-pulse">
              ● REC {recordedRef.current.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Frame Recorder */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="p-1 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded transition-colors"
              title={t('frameMonitor.recordStart')}
            >
              <Circle size={11} />
            </button>
          ) : (
            <button
              onClick={stopAndExport}
              className="p-1 hover:bg-red-900/50 text-red-400 rounded transition-colors animate-pulse"
              title={t('frameMonitor.recordStop')}
            >
              <Square size={11} fill="currentColor" />
            </button>
          )}

          {lastFrame && (
            <>
              <button
                onClick={() => setDiffFrame(0, lastFrame)}
                className="p-1 hover:bg-blue-500/20 text-blue-500 rounded transition-colors"
                title={t('frameMonitor.slotARef')}
              >
                <GitCompare size={11} />
              </button>
              <button
                onClick={() => setDiffFrame(1, lastFrame)}
                className="p-1 hover:bg-purple-500/20 text-purple-500 rounded transition-colors"
                title={t('frameMonitor.slotBTest')}
              >
                <GitCompare size={11} />
              </button>
            </>
          )}
          {txHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="p-1 hover:bg-red-900/30 text-gray-600 hover:text-red-400 rounded transition-colors"
              title={t('frameMonitor.clearHistory')}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Frame list */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {txHistory.length === 0 ? (
          <div className="px-4 py-3 text-gray-700 font-mono text-[10px] italic">
            {t('frameMonitor.waitingData')}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {txHistory.map((frame, idx) => {
              const isLatest = idx === 0;
              const isSelected = selectedFrameId === frame.frameNumber;
              const isFlashing = flashUid === frame.uId;

              return (
                <div
                  key={frame.uId}
                  className={`group px-3 py-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-green-900/30'
                      : isFlashing
                      ? 'bg-green-500/15'
                      : isLatest
                      ? 'bg-green-950/20 hover:bg-green-900/20'
                      : 'hover:bg-gray-800/20'
                  }`}
                  onClick={() => onSelectFrame?.(frame)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono text-gray-600 shrink-0">
                      {new Date(frame.timestampMs).toLocaleTimeString(undefined, {
                        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                      })}
                    </span>
                    <span className="text-[9px] font-mono text-gray-600 shrink-0">
                      {frame.rawBytes.length}B
                    </span>
                    {isLatest && (
                      <span className="text-[8px] font-mono text-green-400 animate-pulse ml-auto shrink-0">
                        {t('common.new')}
                      </span>
                    )}
                    {frame.errors.length > 0 && (
                      <span className="text-[8px] font-mono text-red-400 ml-auto shrink-0">⚠</span>
                    )}
                    <div className="hidden group-hover:flex gap-1 ml-auto shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDiffFrame(0, frame); }}
                        className="p-1 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
                        title={t('frameMonitor.slotARef')}
                      >
                        <GitCompare size={10} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDiffFrame(1, frame); }}
                        className="p-1 hover:bg-purple-500/30 text-purple-400 rounded transition-colors"
                        title={t('frameMonitor.slotBTest')}
                      >
                        <GitCompare size={10} />
                      </button>
                    </div>
                  </div>

                  <div className={`font-mono text-[10px] truncate transition-colors duration-300 ${
                    isFlashing ? 'text-green-300' : isSelected ? 'text-green-300' : 'text-green-400/80'
                  }`}>
                    {frame.rawHex}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

FrameMonitor.displayName = 'FrameMonitor';

export default FrameMonitor;
