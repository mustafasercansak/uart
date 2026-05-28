import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Download, Upload, RotateCcw, X } from 'lucide-react';
import { useTranslation } from '../../i18n/context';
import type { Locale } from '../../i18n/context';
import enRaw from '../../i18n/locales/en.json';
import trRaw from '../../i18n/locales/tr.json';

// ─── Flatten nested JSON to "ns.key.subkey" → value ──────────────────────────

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      result[path] = v;
    } else if (typeof v === 'object' && v !== null) {
      Object.assign(result, flattenObject(v as Record<string, unknown>, path));
    }
  }
  return result;
}

const EN_FLAT = flattenObject(enRaw as Record<string, unknown>);
const TR_FLAT = flattenObject(trRaw as Record<string, unknown>);

// ─── Namespace list ───────────────────────────────────────────────────────────

function getNamespaces(): { ns: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const key of Object.keys(EN_FLAT)) {
    const ns = key.split('.')[0];
    counts[ns] = (counts[ns] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([ns, count]) => ({ ns, count }))
    .sort((a, b) => b.count - a.count);
}

const NAMESPACES = getNamespaces();

// ─── Row type ─────────────────────────────────────────────────────────────────

interface TranslationRow {
  key: string;
  defaultEn: string;
  defaultTr: string;
}

function getRows(ns: string): TranslationRow[] {
  return Object.keys(EN_FLAT)
    .filter(k => k.split('.')[0] === ns)
    .map(key => ({
      key,
      defaultEn: EN_FLAT[key] ?? '',
      defaultTr: TR_FLAT[key] ?? '',
    }));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TranslationsPage() {
  const { t, customLabels, setCustomLabel, resetCustomLabel } = useTranslation();
  const navigate = useNavigate();

  const [selectedNs, setSelectedNs] = useState('can');
  const [search, setSearch] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => getRows(selectedNs), [selectedNs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        r.key.toLowerCase().includes(q) ||
        r.defaultEn.toLowerCase().includes(q) ||
        r.defaultTr.toLowerCase().includes(q) ||
        (customLabels.en[r.key] ?? '').toLowerCase().includes(q) ||
        (customLabels.tr[r.key] ?? '').toLowerCase().includes(q),
    );
  }, [rows, search, customLabels]);

  const overriddenCount = useMemo(
    () => rows.filter(r => customLabels.en[r.key] || customLabels.tr[r.key]).length,
    [rows, customLabels],
  );

  const handleBlur = useCallback(
    (key: string, locale: Locale, value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        setCustomLabel(key, locale, trimmed);
      } else {
        resetCustomLabel(key, locale);
      }
    },
    [setCustomLabel, resetCustomLabel],
  );

  const handleResetRow = useCallback(
    (key: string) => resetCustomLabel(key),
    [resetCustomLabel],
  );

  const handleResetAll = () => {
    rows.forEach(r => resetCustomLabel(r.key));
  };

  const handleExport = () => {
    const data = JSON.stringify(customLabels, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uart_custom_labels.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const locales: Locale[] = ['en', 'tr'];
        locales.forEach(loc => {
          const overrides = parsed[loc];
          if (typeof overrides === 'object' && overrides !== null) {
            Object.entries(overrides).forEach(([key, val]) => {
              if (typeof val === 'string' && val.trim()) {
                setCustomLabel(key, loc, val.trim());
              }
            });
          }
        });
      } catch {
        // silently ignore malformed JSON
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0d] text-gray-200 font-mono overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-800/60 bg-gray-950">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          title={t('translations.back')}
        >
          <ArrowLeft size={12} />
        </button>
        <span className="text-[11px] font-bold text-white tracking-wide">{t('translations.title')}</span>
        <span className="text-[9px] text-gray-600 hidden sm:inline">{t('translations.subtitle')}</span>

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs transition-colors"
          >
            <Upload size={11} />
            {t('translations.import')}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs transition-colors"
          >
            <Download size={11} />
            {t('translations.export')}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-gray-800/40 bg-gray-950/60">
        {/* Namespace selector */}
        <select
          value={selectedNs}
          onChange={e => { setSelectedNs(e.target.value); setSearch(''); }}
          className="bg-gray-800/60 border border-white/10 text-white text-xs px-2 py-1.5 rounded-lg focus:border-cyan-500 outline-none"
        >
          {NAMESPACES.map(({ ns, count }) => (
            <option key={ns} value={ns}>{ns} ({count})</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('translations.searchPlaceholder')}
            className="w-full bg-gray-800/60 border border-white/10 text-white text-xs pl-7 pr-8 py-1.5 rounded-lg focus:border-cyan-500 outline-none placeholder:text-gray-600"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Stats & reset */}
        <div className="flex items-center gap-3 ml-auto text-[10px] text-gray-500">
          <span>
            {filtered.length === rows.length
              ? t('translations.keyCount', { n: rows.length })
              : t('translations.keyCountFiltered', { n: filtered.length, total: rows.length })}
          </span>
          {overriddenCount > 0 && (
            <>
              <span className="text-cyan-400">{t('translations.overriddenCount', { n: overriddenCount })}</span>
              <button
                onClick={handleResetAll}
                className="flex items-center gap-1 text-gray-500 hover:text-red-400 transition-colors"
                title={t('translations.resetAllNs')}
              >
                <RotateCcw size={10} />
                {t('translations.resetAll')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table header */}
      <div className="shrink-0 grid grid-cols-[2fr_2fr_2fr_2fr_2fr_auto] gap-0 border-b border-gray-800/60 px-5 py-1.5 bg-gray-900/40">
        {[
          t('translations.colKey'),
          t('translations.colDefaultEn'),
          t('translations.colDefaultTr'),
          t('translations.colCustomEn'),
          t('translations.colCustomTr'),
        ].map(label => (
          <div key={label} className="text-[9px] font-black uppercase tracking-widest text-gray-500 pr-3">{label}</div>
        ))}
        <div className="w-6" />
      </div>

      {/* Table body */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-xs">
            {t('translations.noResults')}
          </div>
        ) : (
          filtered.map(row => {
            const hasOverrideEn = Boolean(customLabels.en[row.key]);
            const hasOverrideTr = Boolean(customLabels.tr[row.key]);
            const hasAny = hasOverrideEn || hasOverrideTr;

            return (
              <div
                key={row.key}
                className={`grid grid-cols-[2fr_2fr_2fr_2fr_2fr_auto] gap-0 items-center px-5 py-1.5 border-b border-gray-800/20 hover:bg-gray-900/30 transition-colors ${
                  hasAny ? 'bg-cyan-950/10 border-l-2 border-l-cyan-800/40' : ''
                }`}
              >
                {/* Key */}
                <div className="text-[10px] text-gray-500 pr-3 truncate" title={row.key}>
                  {row.key}
                </div>

                {/* Default EN */}
                <div className="text-[10px] text-gray-400 pr-3 truncate" title={row.defaultEn}>
                  {row.defaultEn}
                </div>

                {/* Default TR */}
                <div className="text-[10px] text-gray-400 pr-3 truncate" title={row.defaultTr}>
                  {row.defaultTr}
                </div>

                {/* Custom EN */}
                <div className="pr-2">
                  <input
                    type="text"
                    defaultValue={customLabels.en[row.key] ?? ''}
                    key={`${row.key}-en-${customLabels.en[row.key] ?? ''}`}
                    onBlur={e => handleBlur(row.key, 'en', e.target.value)}
                    placeholder={row.defaultEn}
                    className={`w-full bg-transparent border-b text-[10px] text-white px-1 py-0.5 outline-none placeholder:text-gray-700 transition-colors ${
                      hasOverrideEn
                        ? 'border-cyan-700/60 focus:border-cyan-400'
                        : 'border-gray-800/60 focus:border-gray-600'
                    }`}
                  />
                </div>

                {/* Custom TR */}
                <div className="pr-2">
                  <input
                    type="text"
                    defaultValue={customLabels.tr[row.key] ?? ''}
                    key={`${row.key}-tr-${customLabels.tr[row.key] ?? ''}`}
                    onBlur={e => handleBlur(row.key, 'tr', e.target.value)}
                    placeholder={row.defaultTr}
                    className={`w-full bg-transparent border-b text-[10px] text-white px-1 py-0.5 outline-none placeholder:text-gray-700 transition-colors ${
                      hasOverrideTr
                        ? 'border-cyan-700/60 focus:border-cyan-400'
                        : 'border-gray-800/60 focus:border-gray-600'
                    }`}
                  />
                </div>

                {/* Reset */}
                <div className="w-6 flex justify-center">
                  {hasAny && (
                    <button
                      onClick={() => handleResetRow(row.key)}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                      title={t('translations.resetRow')}
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-5 py-2 border-t border-gray-800/40 text-[9px] text-gray-600">
        {t('translations.footerHint')}
      </div>
    </div>
  );
}
