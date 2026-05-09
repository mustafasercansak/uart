import React, { useEffect, useState } from 'react';
import { Play, Pause, Trash2, Calendar, Database, Clock, RefreshCw, Layers, ChevronLeft, ChevronRight, FastForward, FileDown, FileSpreadsheet } from 'lucide-react';
import type { RecordingMetadata, SimulationStatus } from '../../../types';
import { useTranslation } from '../../../i18n/context';
import { generateVcd, downloadVcd } from '../../../lib/VcdExporter';
import { generateCsv, downloadCsv } from '../../../lib/CsvExporter';
import { loadProfiles } from '../../../store/storage';

interface PlaybackPanelProps {
  recordings: RecordingMetadata[];
  onPlay: (data: Array<{ time: number; frame: import('../../../types').GeneratedFrame }>) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  status: SimulationStatus;
  playbackIndex: number;
  playbackTotal: number;
  onPause: () => void;
  onResume: () => void;
  onSeek: (index: number) => void;
  onStep: (delta: number) => void;
}

const PlaybackPanel: React.FC<PlaybackPanelProps> = ({ 
  recordings, 
  onPlay, 
  onDelete, 
  onRefresh, 
  status, 
  playbackIndex, 
  playbackTotal, 
  onPause, 
  onResume, 
  onSeek, 
  onStep 
}) => {
  const { t, language } = useTranslation();
  const [loading, setLoading] = useState(false);
  const locale = language === 'tr' ? 'tr-TR' : 'en-US';

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const handleRefresh = async () => {
    setLoading(true);
    onRefresh();
    setTimeout(() => setLoading(false), 500);
  };

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (ms: number) => {
    return (ms / 100).toFixed(1) + 's';
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 overflow-y-auto custom-scrollbar bg-gray-950/20">
      {/* ACTIVE PLAYER BAR */}
      {playbackTotal > 0 && (status === 'running' || status === 'paused') && (
        <div className="mb-8 bg-gradient-to-r from-orange-600/20 to-orange-900/10 border border-orange-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-900/40">
                        <FastForward className="text-white" size={20} />
                    </div>
                    <div>
                        <h2 className="text-sm font-black font-mono text-white uppercase tracking-tighter">{t('playback.activePlayer')}</h2>
                        <p className="text-[10px] font-mono text-orange-400/80">{t('playback.activeSub')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                      onClick={() => onStep(-1)}
                      className="p-2 bg-black/40 hover:bg-black/60 text-gray-400 hover:text-white rounded-xl border border-white/5 transition-all"
                      title={t('playback.stepBack')}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    
                    {status === 'running' ? (
                      <button 
                        onClick={onPause}
                        className="w-12 h-12 bg-white text-black hover:bg-orange-100 rounded-2xl flex items-center justify-center transition-all shadow-xl"
                      >
                        <Pause size={24} fill="currentColor" />
                      </button>
                    ) : (
                      <button 
                        onClick={onResume}
                        className="w-12 h-12 bg-orange-500 text-white hover:bg-orange-400 rounded-2xl flex items-center justify-center transition-all shadow-xl shadow-orange-900/20"
                      >
                        <Play size={24} fill="currentColor" />
                      </button>
                    )}

                    <button 
                      onClick={() => onStep(1)}
                      className="p-2 bg-black/40 hover:bg-black/60 text-gray-400 hover:text-white rounded-xl border border-white/5 transition-all"
                      title={t('playback.stepForward')}
                    >
                      <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono text-gray-500 mb-1">
                    <span>{t('playback.packetIndex').replace('{index}', (playbackIndex + 1).toString())}</span>
                    <span>{t('playback.packetTotal').replace('{count}', playbackTotal.toString())}</span>
                </div>
                <input 
                  type="range"
                  min="0"
                  max={playbackTotal - 1}
                  value={playbackIndex}
                  onChange={(e) => onSeek(parseInt(e.target.value))}
                  className="w-full h-2 bg-black/50 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
            </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-600/10 rounded-xl border border-orange-500/20">
                <Layers size={20} className="text-orange-500" />
            </div>
            <div>
                <h2 className="text-sm font-black font-mono uppercase tracking-widest text-gray-100">{t('playback.library')}</h2>
                <p className="text-[10px] font-mono text-gray-500">{t('playback.librarySub')}</p>
            </div>
        </div>
        <button 
          onClick={handleRefresh}
          className={`p-2 bg-gray-900 border border-gray-800 rounded-lg text-gray-400 hover:text-white transition-all ${loading ? 'animate-spin' : ''}`}
          title={t('playback.refreshList')}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {recordings.map((rec) => (
          <div 
            key={rec.id}
            className="group relative bg-gray-900/40 border border-gray-800/50 hover:border-orange-500/30 p-5 rounded-2xl backdrop-blur-sm transition-all hover:bg-gray-900/60"
          >
            <div className="flex justify-between items-start mb-4">
               <div>
                  <h3 className="text-[12px] font-mono font-bold text-gray-200 group-hover:text-orange-400 transition-colors">{rec.name}</h3>
                  <div className="flex items-center gap-3 mt-1 opacity-60">
                     <span className="flex items-center gap-1 text-[9px] font-mono"><Calendar size={10} /> {formatDate(rec.createdAt)}</span>
                  </div>
               </div>
               <div className="flex gap-2">
                  <button 
                    onClick={() => onPlay(rec.data || [])}
                    className="p-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white rounded-xl border border-emerald-500/20 transition-all flex items-center gap-2 text-[10px] font-mono font-black uppercase"
                  >
                    <Play size={14} fill="currentColor" />
                    {t('playback.play')}
                  </button>
                  <button 
                    onClick={() => {
                      const profile = loadProfiles()[0]; // Use first available profile as fallback
                      if (profile && rec.data) {
                        const frames = rec.data.map(d => d.frame);
                        const csv = generateCsv(frames, profile);
                        downloadCsv(csv, `${rec.name.replace(/\s+/g, '_')}_${rec.id.substring(0,4)}.csv`);
                      }
                    }}
                    className="p-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white rounded-xl border border-emerald-500/20 transition-all"
                    title="Export as CSV (Data Science / Excel)"
                  >
                    <FileSpreadsheet size={14} />
                  </button>
                  <button 
                    onClick={() => {
                      const profile = loadProfiles()[0]; // Use first available profile as fallback
                      if (profile && rec.data) {
                        const frames = rec.data.map(d => d.frame);
                        const vcd = generateVcd(frames, profile);
                        downloadVcd(vcd, `${rec.name.replace(/\s+/g, '_')}_${rec.id.substring(0,4)}.vcd`);
                      }
                    }}
                    className="p-2 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-xl border border-blue-500/20 transition-all"
                    title="Export Logic Analyzer VCD"
                  >
                    <FileDown size={14} />
                  </button>
                  <button 
                    onClick={() => onDelete(rec.id)}
                    className="p-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-xl border border-red-500/20 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-black/30 rounded-xl p-2 border border-gray-800/50 flex items-center gap-2">
                    <Database size={12} className="text-gray-500" />
                    <div>
                        <div className="text-[8px] font-mono text-gray-600 uppercase">{t('playback.packetCount')}</div>
                        <div className="text-[10px] font-mono font-bold text-gray-300">{rec.frameCount} {t('report.avgFrame')}</div>
                    </div>
                </div>
                <div className="bg-black/30 rounded-xl p-2 border border-gray-800/50 flex items-center gap-2">
                    <Clock size={12} className="text-gray-500" />
                    <div>
                        <div className="text-[8px] font-mono text-gray-600 uppercase">{t('playback.totalDuration')}</div>
                        <div className="text-[10px] font-mono font-bold text-gray-300">{formatDuration(rec.durationMs)}</div>
                    </div>
                </div>
            </div>
          </div>
        ))}

        {recordings.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-gray-900 rounded-3xl opacity-30">
             <Layers size={48} className="mb-4" />
             <span className="text-xs font-mono uppercase tracking-[0.3em]">{t('playback.noRecordings')}</span>
             <span className="text-[10px] font-mono mt-2">{t('playback.recHelp')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaybackPanel;
