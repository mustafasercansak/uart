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
        name,
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

  return (
    <div className="h-full flex flex-col font-mono text-xs text-gray-300 print:bg-white print:text-black">
      {/* Toolbar (print'te gizlenir) */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 bg-gray-900/40 print:hidden">
        <BarChart3 size={14} className="text-rose-400" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-300">
          Hata Analiz Raporu
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
            <Printer size={11} /> PDF / Yazdır
          </button>
        </div>

        {frames.length === 0 && (
          <span className="ml-auto text-[10px] text-yellow-500/80">
            ⚠ Simülasyonu başlatın
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar print:overflow-visible">

        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-xl font-bold">UART Simülatör — Hata Analiz Raporu</h1>
          <p className="text-sm text-gray-600">
            Profil: {profile?.name ?? '-'} | Tarih: {new Date().toLocaleString('tr-TR')}
          </p>
        </div>

        {frames.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <BarChart3 size={32} className="opacity-30" />
            <p className="text-[11px]">Analiz için simülasyonu başlatın</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Toplam Frame"
                value={frameCount.toLocaleString('tr-TR')}
                sub={`${(stats.framesPerSecond).toFixed(1)} fps`}
                accent="blue"
              />
              <StatCard
                label="Hatalı Frame"
                value={errorCount.toLocaleString('tr-TR')}
                sub={`%${errorRatePct} hata oranı`}
                accent={errorCount === 0 ? 'green' : 'red'}
              />
              <StatCard
                label="Başarı Oranı"
                value={`%${successRatePct}`}
                sub={`${stats.totalFrames - stats.errorFrames} temiz frame`}
                accent={stats.errorRate < 0.01 ? 'green' : 'yellow'}
              />
              <StatCard
                label="Ortalama Frame"
                value={`${stats.avgFrameSize.toFixed(1)} B`}
                sub={`Min: ${stats.minFrameSize}B / Max: ${stats.maxFrameSize}B`}
                accent="blue"
              />
            </div>

            {/* Session bilgisi */}
            <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/30">
              <div className="flex items-center gap-2 mb-3 text-gray-400">
                <Activity size={13} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Oturum Özeti</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[11px]">
                <div>
                  <span className="text-gray-500">Profil:</span>{' '}
                  <span className="text-gray-200">{profile?.name ?? '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Baud Rate:</span>{' '}
                  <span className="text-gray-200">{profile?.baudRate?.toLocaleString('tr-TR') ?? '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Süre:</span>{' '}
                  <span className="text-gray-200">
                    {elapsedMs >= 60000
                      ? `${Math.floor(elapsedMs / 60000)}dk ${Math.floor((elapsedMs % 60000) / 1000)}sn`
                      : `${(elapsedMs / 1000).toFixed(1)}sn`}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Gönderim Aralığı:</span>{' '}
                  <span className="text-gray-200">{profile?.sendIntervalMs ?? '-'}ms</span>
                </div>
                <div>
                  <span className="text-gray-500">Field Sayısı:</span>{' '}
                  <span className="text-gray-200">{profile?.fields.length ?? '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">CRC Başarısız:</span>{' '}
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
                  <span className="text-[11px] font-bold uppercase tracking-wider">Hata Tipi Dağılımı</span>
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
                    Zaman İçinde Frame Dağılımı (OK / Hata)
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
                      <Bar dataKey="ok" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} name="Başarılı" />
                      <Bar dataKey="err" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} name="Hatalı" />
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
                  <div className="font-bold text-[12px]">Mükemmel — Sıfır Hata</div>
                  <div className="text-[10px] text-emerald-500">
                    {frames.length} frame analiz edildi, hata tespit edilmedi.
                  </div>
                </div>
              </div>
            )}

            {/* Export seçenekleri (print'te gizli) */}
            <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/30 print:hidden">
              <div className="flex items-center gap-2 mb-3 text-gray-400">
                <Download size={13} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Dışa Aktar</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCSV}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-800/50 text-[11px] font-bold transition-all"
                >
                  <Download size={12} /> CSV (Excel uyumlu)
                </button>
                <button
                  onClick={handlePCAP}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 border border-indigo-800/50 text-[11px] font-bold transition-all"
                >
                  <Download size={12} /> PCAP (Wireshark)
                </button>
                <button
                  onClick={handleJSON}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800/50 text-[11px] font-bold transition-all"
                >
                  <FileText size={12} /> JSON (Ham Veri)
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 text-[11px] font-bold transition-all"
                >
                  <Printer size={12} /> PDF Yazdır
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-2">
                PCAP: Wireshark ile analiz edin. CSV: Excel'de açın. JSON: Ham frame verisi.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
