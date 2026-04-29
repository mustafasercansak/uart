import React, { useMemo, useCallback } from 'react';
import {
  BarChart3,
  Download,
  Printer,
  AlertTriangle,
  CheckCircle,
  Activity,
  FileText,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from 'recharts';
import type { GeneratedFrame, FrameProfile } from '../../../types';
import { computeErrorStats, exportToCSV, exportToPCAP, exportToJSON } from '../../../engines/ExportEngine';
import { useTranslation } from '../../../i18n/context';

interface Props {
  frames: GeneratedFrame[];
  profile: FrameProfile | null;
  elapsedMs: number;
  frameCount: number;
  errorCount: number;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'green' | 'red' | 'blue' | 'yellow';
}) {
  const colorMap = {
    green: 'text-emerald-400 border-emerald-800/40 bg-emerald-950/20',
    red: 'text-red-400 border-red-800/40 bg-red-950/20',
    blue: 'text-blue-400 border-blue-800/40 bg-blue-950/20',
    yellow: 'text-yellow-400 border-yellow-800/40 bg-yellow-950/20',
  };
  const cls = accent ? colorMap[accent] : 'text-gray-200 border-gray-800/40 bg-gray-900/20';

  return (
    <div className={`border rounded-xl p-3 ${cls}`}>
      <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-black font-mono`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ErrorReportPanel({ frames, profile, elapsedMs, frameCount, errorCount }: Props) {
  const { t, language } = useTranslation();
  const stats = useMemo(() => computeErrorStats(frames), [frames]);

  // Timeline: hataları 500ms pencerelerine göre grupla
  const timelineChartData = useMemo(() => {
    if (frames.length < 2) return [];
    const windowMs = Math.max(500, Math.round(stats.durationMs / 40));
    const buckets: Record<number, { ok: number; err: number }> = {};
    for (const f of frames) {
      const bucket = Math.floor(f.timestampMs / windowMs);
      if (!buckets[bucket]) buckets[bucket] = { ok: 0, err: 0 };
      if (f.errors.length > 0) buckets[bucket].err++;
      else buckets[bucket].ok++;
    }
    const firstTs = frames[0]?.timestampMs ?? 0;
    return Object.entries(buckets)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([bucket, v]) => ({
        t: `${((Number(bucket) * windowMs - firstTs) / 1000).toFixed(1)}s`,
        ok: v.ok,
        err: v.err,
      }));
  }, [frames, stats.durationMs]);

  const errorTypeData = useMemo(
    () =>
      Object.entries(stats.errorTypeCounts).map(([name, count]) => ({
        name: name.replace('_', ' ').toUpperCase(),
        count,
      })),
    [stats.errorTypeCounts]
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleCSV = useCallback(() => {
    exportToCSV(frames, profile);
  }, [frames, profile]);

  const handlePCAP = useCallback(() => {
    exportToPCAP(frames);
  }, [frames]);

  const handleJSON = useCallback(() => {
    exportToJSON(frames, profile);
  }, [frames, profile]);

  const errorRatePct = (stats.errorRate * 100).toFixed(2);
  const successRatePct = ((1 - stats.errorRate) * 100).toFixed(2);
  const locale = language === 'tr' ? 'tr-TR' : 'en-US';

  return (
    <div className="h-full flex flex-col font-mono text-xs text-gray-300 print:bg-white print:text-black">
      {/* Toolbar (print'te gizlenir) */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 bg-gray-900/40 print:hidden">
        <BarChart3 size={14} className="text-rose-400" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-300">
          {t('report.title')}
        </span>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={handleCSV}
            disabled={frames.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-emerald-900/50 hover:bg-emerald-800/60 disabled:opacity-40 text-emerald-300 border border-emerald-800/50 transition-all"
          >
            <Download size={11} /> CSV
          </button>
          <button
            onClick={handlePCAP}
            disabled={frames.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-indigo-900/50 hover:bg-indigo-800/60 disabled:opacity-40 text-indigo-300 border border-indigo-800/50 transition-all"
          >
            <Download size={11} /> PCAP
          </button>
          <button
            onClick={handleJSON}
            disabled={frames.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-blue-900/50 hover:bg-blue-800/60 disabled:opacity-40 text-blue-300 border border-blue-800/50 transition-all"
          >
            <FileText size={11} /> JSON
          </button>
          <button
            onClick={handlePrint}
            disabled={frames.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 border border-gray-700/50 transition-all"
          >
            <Printer size={11} /> {t('report.print')}
          </button>
        </div>

        {frames.length === 0 && (
          <span className="ml-auto text-[10px] text-yellow-500/80">
            {t('report.simulationRequired')}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar print:overflow-visible">

        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-xl font-bold">{t('report.printHeader')}</h1>
          <p className="text-sm text-gray-600">
            {t('report.profileLabel')} {profile?.name ?? '-'} | {t('report.dateLabel')} {new Date().toLocaleString(locale)}
          </p>
        </div>

        {frames.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <BarChart3 size={32} className="opacity-30" />
            <p className="text-[11px]">{t('report.emptyState')}</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label={t('report.totalFrames')}
                value={frameCount.toLocaleString(locale)}
                sub={t('report.fps', { count: stats.framesPerSecond.toFixed(1) })}
                accent="blue"
              />
              <StatCard
                label={t('report.errorFrames')}
                value={errorCount.toLocaleString(locale)}
                sub={t('report.errorRateLabel').replace('{rate}', errorRatePct)}
                accent={errorCount === 0 ? 'green' : 'red'}
              />
              <StatCard
                label={t('report.successRate')}
                value={t('report.successRatePct', { rate: successRatePct })}
                sub={t('report.cleanFrames').replace('{count}', (stats.totalFrames - stats.errorFrames).toString())}
                accent={stats.errorRate < 0.01 ? 'green' : 'yellow'}
              />
              <StatCard
                label={t('report.avgFrame')}
                value={t('report.byte', { count: stats.avgFrameSize.toFixed(1) })}
                sub={t('report.minMax', { min: stats.minFrameSize, max: stats.maxFrameSize })}
                accent="blue"
              />
            </div>

            {/* Session bilgisi */}
            <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/30">
              <div className="flex items-center gap-2 mb-3 text-gray-400">
                <Activity size={13} />
                <span className="text-[11px] font-bold uppercase tracking-wider">{t('report.sessionSummary')}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[11px]">
                <div>
                  <span className="text-gray-500">{t('report.profileLabel')}:</span>{' '}
                  <span className="text-gray-200">{profile?.name ?? '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('report.baudRate')}:</span>{' '}
                  <span className="text-gray-200">{profile?.baudRate?.toLocaleString(locale) ?? '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('report.duration')}:</span>{' '}
                  <span className="text-gray-200">
                    {elapsedMs >= 60000
                      ? `${Math.floor(elapsedMs / 60000)}${t('time.minute')} ${Math.floor((elapsedMs % 60000) / 1000)}${t('time.second')}`
                      : `${(elapsedMs / 1000).toFixed(1)}${t('time.second')}`}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t('report.interval')}:</span>{' '}
                  <span className="text-gray-200">{profile?.sendIntervalMs ?? '-'}ms</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('report.fieldCount')}:</span>{' '}
                  <span className="text-gray-200">{profile?.fields.length ?? '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">{t('report.crcFail')}:</span>{' '}
                  <span className={stats.crcFailRate > 0 ? 'text-red-400' : 'text-emerald-400'}>
                    {(stats.crcFailRate * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Error type breakdown */}
            {errorTypeData.length > 0 && (
              <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-3 text-gray-400">
                  <AlertTriangle size={13} className="text-red-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">{t('report.errorTypeBreakdown')}</span>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorTypeData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} />
                      <Tooltip
                        contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 10 }}
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {errorTypeData.map((_, i) => (
                          <Cell key={i} fill={['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#3b82f6'][i % 5]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {errorTypeData.map((e) => (
                    <span key={e.name} className="px-2 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700/50">
                      {e.name}: <span className="text-red-400 font-bold">{e.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline chart */}
            {timelineChartData.length > 1 && (
              <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-3 text-gray-400">
                  <TrendingUp size={13} />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {t('report.timelineTitle')}
                  </span>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timelineChartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="t" tick={{ fontSize: 8, fill: '#6b7280' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} />
                      <Tooltip
                        contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 10 }}
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      />
                      <Bar dataKey="ok" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} name={t('report.success')} />
                      <Bar dataKey="err" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} name={t('report.failure')} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Tüm temiz ise yeşil banner */}
            {errorCount === 0 && frames.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300">
                <CheckCircle size={18} />
                <div>
                  <div className="font-bold text-[12px]">{t('report.perfectTitle')}</div>
                  <div className="text-[10px] text-emerald-500">
                    {t('report.perfectSub').replace('{count}', frames.length.toString())}
                  </div>
                </div>
              </div>
            )}

            {/* Export seçenekleri (print'te gizli) */}
            <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/30 print:hidden">
              <div className="flex items-center gap-2 mb-3 text-gray-400">
                <Download size={13} />
                <span className="text-[11px] font-bold uppercase tracking-wider">{t('report.export')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCSV}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-800/50 text-[11px] font-bold transition-all"
                >
                  <Download size={12} /> {t('report.csvLabel')}
                </button>
                <button
                  onClick={handlePCAP}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 border border-indigo-800/50 text-[11px] font-bold transition-all"
                >
                  <Download size={12} /> {t('report.pcapLabel')}
                </button>
                <button
                  onClick={handleJSON}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800/50 text-[11px] font-bold transition-all"
                >
                  <FileText size={12} /> {t('report.jsonLabel')}
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 text-[11px] font-bold transition-all"
                >
                  <Printer size={12} /> {t('report.pdfLabel')}
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-2">
                {t('report.footerHelp')}
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
