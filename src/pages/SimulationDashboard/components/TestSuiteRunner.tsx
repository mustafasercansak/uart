import React, { useState, useCallback, useRef } from 'react';
import {
  FlaskConical,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RotateCcw,
  Clock,
} from 'lucide-react';
import type { GeneratedFrame, FrameProfile } from '../../../types';

// ─────────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────────

type AssertionType =
  | 'field_in_range'
  | 'field_equals'
  | 'no_errors'
  | 'checksum_valid'
  | 'frame_rate_min'
  | 'byte_count_equals'
  | 'hex_contains';

interface TestCase {
  id: string;
  name: string;
  assertion: AssertionType;
  fieldName?: string;
  expectedMin?: number;
  expectedMax?: number;
  expectedValue?: number | string;
  minFPS?: number;
  expectedByteCount?: number;
  hexPattern?: string;
  enabled: boolean;
}

type TestStatus = 'pending' | 'pass' | 'fail' | 'skip';

interface TestResult {
  caseId: string;
  status: TestStatus;
  message: string;
  testedCount: number;
  failedFrames: number[];
}

// ─────────────────────────────────────────────
// ASSERTION LABELS
// ─────────────────────────────────────────────

const ASSERTION_LABELS: Record<AssertionType, string> = {
  field_in_range: 'Field aralık içinde',
  field_equals: 'Field değere eşit',
  no_errors: 'Hata yok',
  checksum_valid: 'Checksum geçerli',
  frame_rate_min: 'Minimum FPS',
  byte_count_equals: 'Frame boyutu eşit',
  hex_contains: 'Hex pattern içeriyor',
};

// ─────────────────────────────────────────────
// TEST RUNNER
// ─────────────────────────────────────────────

function runTest(
  tc: TestCase,
  frames: GeneratedFrame[],
  profile: FrameProfile | null
): TestResult {
  const base: TestResult = {
    caseId: tc.id,
    status: 'pending',
    message: '',
    testedCount: frames.length,
    failedFrames: [],
  };

  if (!tc.enabled) return { ...base, status: 'skip', message: 'Test devre dışı' };
  if (frames.length === 0) return { ...base, status: 'skip', message: 'Frame yok' };

  switch (tc.assertion) {
    case 'no_errors': {
      const failed = frames.filter((f) => f.errors.length > 0);
      if (failed.length === 0) {
        return { ...base, status: 'pass', message: `${frames.length} frame, hata yok ✓` };
      }
      return {
        ...base,
        status: 'fail',
        message: `${failed.length}/${frames.length} frame hatalı`,
        failedFrames: failed.map((f) => f.frameNumber),
      };
    }

    case 'checksum_valid': {
      const checksumField = profile?.fields.find((f) => f.type === 'checksum');
      if (!checksumField) return { ...base, status: 'skip', message: 'Profilde checksum alanı yok' };
      // Hata mesajlarında checksum hatalarını ara
      const failed = frames.filter((f) =>
        f.errors.some((e) => e.toLowerCase().includes('checksum') || e.toLowerCase().includes('crc'))
      );
      if (failed.length === 0) {
        return { ...base, status: 'pass', message: `Tüm checksum'lar geçerli ✓` };
      }
      return {
        ...base,
        status: 'fail',
        message: `${failed.length} checksum hatası`,
        failedFrames: failed.map((f) => f.frameNumber),
      };
    }

    case 'field_in_range': {
      if (!tc.fieldName) return { ...base, status: 'skip', message: 'Field adı belirtilmedi' };
      const min = tc.expectedMin ?? -Infinity;
      const max = tc.expectedMax ?? Infinity;
      const failed: number[] = [];

      for (const f of frames) {
        const pf = f.fields.find((p) => p.name === tc.fieldName);
        if (!pf) continue;
        if (pf.decimal < min || pf.decimal > max) {
          failed.push(f.frameNumber);
        }
      }

      if (failed.length === 0) {
        return { ...base, status: 'pass', message: `'${tc.fieldName}' her zaman [${min}, ${max}] aralığında ✓` };
      }
      return {
        ...base,
        status: 'fail',
        message: `'${tc.fieldName}': ${failed.length} frame aralık dışında`,
        failedFrames: failed,
      };
    }

    case 'field_equals': {
      if (!tc.fieldName) return { ...base, status: 'skip', message: 'Field adı belirtilmedi' };
      const expected = Number(tc.expectedValue);
      const failed = frames.filter((f) => {
        const pf = f.fields.find((p) => p.name === tc.fieldName);
        return pf ? pf.decimal !== expected : false;
      });

      if (failed.length === 0) {
        return { ...base, status: 'pass', message: `'${tc.fieldName}' her zaman ${expected} ✓` };
      }
      return {
        ...base,
        status: 'fail',
        message: `'${tc.fieldName}': ${failed.length} frame ${expected} değil`,
        failedFrames: failed.map((f) => f.frameNumber),
      };
    }

    case 'frame_rate_min': {
      if (frames.length < 2) return { ...base, status: 'skip', message: 'Hesaplamak için yeterli frame yok' };
      const durationMs = frames[frames.length - 1].timestampMs - frames[0].timestampMs;
      const fps = durationMs > 0 ? (frames.length / durationMs) * 1000 : 0;
      const minFPS = tc.minFPS ?? 1;
      if (fps >= minFPS) {
        return { ...base, status: 'pass', message: `FPS: ${fps.toFixed(1)} ≥ ${minFPS} ✓` };
      }
      return { ...base, status: 'fail', message: `FPS: ${fps.toFixed(1)} < ${minFPS} (beklenen min)` };
    }

    case 'byte_count_equals': {
      const expected = tc.expectedByteCount ?? 0;
      const failed = frames.filter((f) => f.rawBytes.length !== expected);
      if (failed.length === 0) {
        return { ...base, status: 'pass', message: `Tüm frame'ler ${expected} byte ✓` };
      }
      return {
        ...base,
        status: 'fail',
        message: `${failed.length} frame ${expected} byte değil`,
        failedFrames: failed.map((f) => f.frameNumber),
      };
    }

    case 'hex_contains': {
      if (!tc.hexPattern) return { ...base, status: 'skip', message: 'Hex pattern belirtilmedi' };
      const pattern = tc.hexPattern.replace(/\s+/g, '').toUpperCase();
      const failed = frames.filter(
        (f) => !f.rawHex.replace(/\s+/g, '').toUpperCase().includes(pattern)
      );
      if (failed.length === 0) {
        return { ...base, status: 'pass', message: `Tüm frame'ler '${tc.hexPattern}' içeriyor ✓` };
      }
      return {
        ...base,
        status: 'fail',
        message: `${failed.length} frame '${tc.hexPattern}' içermiyor`,
        failedFrames: failed.map((f) => f.frameNumber),
      };
    }

    default:
      return { ...base, status: 'skip', message: 'Bilinmeyen assertion' };
  }
}

// ─────────────────────────────────────────────
// TEST CASE FORM
// ─────────────────────────────────────────────

function TestCaseForm({
  tc,
  profile,
  onUpdate,
  onDelete,
  result,
}: {
  tc: TestCase;
  profile: FrameProfile | null;
  onUpdate: (id: string, patch: Partial<TestCase>) => void;
  onDelete: (id: string) => void;
  result?: TestResult;
}) {
  const fieldNames = profile?.fields.map((f) => f.name) ?? [];

  const statusIcon =
    result?.status === 'pass' ? (
      <CheckCircle size={14} className="text-emerald-400 shrink-0" />
    ) : result?.status === 'fail' ? (
      <XCircle size={14} className="text-red-400 shrink-0" />
    ) : result?.status === 'skip' ? (
      <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
    ) : (
      <Clock size={14} className="text-gray-600 shrink-0" />
    );

  return (
    <div
      className={`border rounded-lg p-3 mb-2 transition-all ${
        result?.status === 'pass'
          ? 'border-emerald-800/50 bg-emerald-950/20'
          : result?.status === 'fail'
          ? 'border-red-800/50 bg-red-950/20'
          : result?.status === 'skip'
          ? 'border-yellow-900/40 bg-yellow-950/10'
          : 'border-gray-800/50 bg-gray-900/30'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {statusIcon}
        <input
          className="flex-1 bg-transparent text-[11px] font-mono text-gray-200 border-b border-gray-700 focus:border-blue-500 outline-none py-0.5"
          value={tc.name}
          onChange={(e) => onUpdate(tc.id, { name: e.target.value })}
          placeholder="Test adı..."
        />
        <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer ml-2">
          <input
            type="checkbox"
            checked={tc.enabled}
            onChange={(e) => onUpdate(tc.id, { enabled: e.target.checked })}
            className="w-3 h-3 accent-blue-500"
          />
          Aktif
        </label>
        <button
          onClick={() => onDelete(tc.id)}
          className="p-1 hover:text-red-400 text-gray-600 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {/* Assertion type */}
        <select
          value={tc.assertion}
          onChange={(e) => onUpdate(tc.id, { assertion: e.target.value as AssertionType })}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1"
        >
          {Object.entries(ASSERTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        {/* Field name (for field assertions) */}
        {(tc.assertion === 'field_in_range' || tc.assertion === 'field_equals') && (
          <select
            value={tc.fieldName ?? ''}
            onChange={(e) => onUpdate(tc.id, { fieldName: e.target.value })}
            className="bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1"
          >
            <option value="">-- Field seçin --</option>
            {fieldNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}

        {/* Range inputs */}
        {tc.assertion === 'field_in_range' && (
          <>
            <input
              type="number"
              value={tc.expectedMin ?? ''}
              onChange={(e) => onUpdate(tc.id, { expectedMin: Number(e.target.value) })}
              placeholder="Min"
              className="w-20 bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1"
            />
            <span className="text-gray-600 text-[10px]">–</span>
            <input
              type="number"
              value={tc.expectedMax ?? ''}
              onChange={(e) => onUpdate(tc.id, { expectedMax: Number(e.target.value) })}
              placeholder="Max"
              className="w-20 bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1"
            />
          </>
        )}

        {/* Equals value */}
        {tc.assertion === 'field_equals' && (
          <input
            type="number"
            value={tc.expectedValue ?? ''}
            onChange={(e) => onUpdate(tc.id, { expectedValue: Number(e.target.value) })}
            placeholder="Beklenen değer"
            className="w-32 bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1"
          />
        )}

        {/* FPS input */}
        {tc.assertion === 'frame_rate_min' && (
          <input
            type="number"
            value={tc.minFPS ?? ''}
            onChange={(e) => onUpdate(tc.id, { minFPS: Number(e.target.value) })}
            placeholder="Min FPS"
            className="w-24 bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1"
          />
        )}

        {/* Byte count */}
        {tc.assertion === 'byte_count_equals' && (
          <input
            type="number"
            value={tc.expectedByteCount ?? ''}
            onChange={(e) => onUpdate(tc.id, { expectedByteCount: Number(e.target.value) })}
            placeholder="Byte sayısı"
            className="w-28 bg-gray-900 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1"
          />
        )}

        {/* Hex pattern */}
        {tc.assertion === 'hex_contains' && (
          <input
            value={tc.hexPattern ?? ''}
            onChange={(e) => onUpdate(tc.id, { hexPattern: e.target.value })}
            placeholder="örn. 55 AA"
            className="w-36 bg-gray-900 border border-gray-700 text-gray-300 text-[10px] font-mono rounded px-2 py-1"
          />
        )}
      </div>

      {/* Result message */}
      {result && result.status !== 'pending' && (
        <div
          className={`mt-2 text-[10px] font-mono px-2 py-1 rounded ${
            result.status === 'pass'
              ? 'text-emerald-300 bg-emerald-950/40'
              : result.status === 'fail'
              ? 'text-red-300 bg-red-950/40'
              : 'text-yellow-300 bg-yellow-950/30'
          }`}
        >
          {result.message}
          {result.failedFrames.length > 0 && result.failedFrames.length <= 10 && (
            <span className="ml-2 text-gray-500">
              (F# {result.failedFrames.join(', ')})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ANA BİLEŞEN
// ─────────────────────────────────────────────

interface TestSuiteRunnerProps {
  frames: GeneratedFrame[];
  profile: FrameProfile | null;
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT_TESTS: TestCase[] = [
  {
    id: makeId(),
    name: 'Hata sıfır olmalı',
    assertion: 'no_errors',
    enabled: true,
  },
  {
    id: makeId(),
    name: 'Checksum hep geçerli',
    assertion: 'checksum_valid',
    enabled: true,
  },
];

export default function TestSuiteRunner({ frames, profile }: TestSuiteRunnerProps) {
  const [tests, setTests] = useState<TestCase[]>(DEFAULT_TESTS);
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const runId = useRef(0);

  const addTest = useCallback(() => {
    setTests((prev) => [
      ...prev,
      {
        id: makeId(),
        name: `Test ${prev.length + 1}`,
        assertion: 'no_errors',
        enabled: true,
      },
    ]);
  }, []);

  const updateTest = useCallback((id: string, patch: Partial<TestCase>) => {
    setTests((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const deleteTest = useCallback((id: string) => {
    setTests((prev) => prev.filter((t) => t.id !== id));
    setResults((prev) => prev.filter((r) => r.caseId !== id));
  }, []);

  const runAll = useCallback(async () => {
    if (frames.length === 0) return;
    setRunning(true);
    const currentRunId = ++runId.current;
    setResults([]);

    const newResults: TestResult[] = [];
    for (const tc of tests) {
      if (runId.current !== currentRunId) break;
      // Small delay to show progress
      await new Promise((r) => setTimeout(r, 40));
      newResults.push(runTest(tc, frames, profile));
      setResults([...newResults]);
    }

    setRunning(false);
  }, [tests, frames, profile]);

  const resetResults = useCallback(() => {
    setResults([]);
  }, []);

  const exportResults = useCallback(() => {
    const lines = ['Test Suite Raporu', `Tarih: ${new Date().toISOString()}`, `Toplam Frame: ${frames.length}`, ''];
    for (const r of results) {
      const tc = tests.find((t) => t.id === r.caseId);
      const label = tc?.name ?? r.caseId;
      lines.push(`[${r.status.toUpperCase()}] ${label}`);
      lines.push(`  ${r.message}`);
      if (r.failedFrames.length > 0) {
        lines.push(`  Başarısız frame'ler: ${r.failedFrames.slice(0, 20).join(', ')}${r.failedFrames.length > 20 ? '...' : ''}`);
      }
      lines.push('');
    }

    const pass = results.filter((r) => r.status === 'pass').length;
    const fail = results.filter((r) => r.status === 'fail').length;
    const skip = results.filter((r) => r.status === 'skip').length;
    lines.push(`Özet: ${pass} PASS / ${fail} FAIL / ${skip} SKIP`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test_raporu_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, tests, frames]);

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  const total = tests.filter((t) => t.enabled).length;
  const completed = pass + fail + skip;

  const resultMap = Object.fromEntries(results.map((r) => [r.caseId, r]));

  return (
    <div className="h-full flex flex-col font-mono text-xs">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 bg-gray-900/40">
        <FlaskConical size={14} className="text-purple-400" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-300">
          Test Suite
        </span>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={addTest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 transition-all"
          >
            <Plus size={11} /> Test Ekle
          </button>

          <button
            onClick={runAll}
            disabled={running || frames.length === 0 || tests.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all"
          >
            <Play size={11} /> Tümünü Çalıştır
          </button>

          {results.length > 0 && (
            <>
              <button
                onClick={resetResults}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700/50 transition-all"
              >
                <RotateCcw size={11} /> Sıfırla
              </button>
              <button
                onClick={exportResults}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-indigo-800 hover:bg-indigo-700 text-indigo-200 border border-indigo-700/50 transition-all"
              >
                <Download size={11} /> Rapor İndir
              </button>
            </>
          )}
        </div>

        {/* Summary badges */}
        {results.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-gray-500">{completed}/{total}</span>
            {pass > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/50 text-emerald-300 border border-emerald-800/50">
                {pass} PASS
              </span>
            )}
            {fail > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-300 border border-red-800/50">
                {fail} FAIL
              </span>
            )}
            {skip > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-900/40 text-yellow-300 border border-yellow-800/40">
                {skip} SKIP
              </span>
            )}
          </div>
        )}

        {frames.length === 0 && (
          <span className="ml-auto text-[10px] text-yellow-500/80">
            ⚠ Simülasyonu başlatın ve frame oluşturun
          </span>
        )}
      </div>

      {/* Progress bar */}
      {running && (
        <div className="h-1 bg-gray-900 shrink-0">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      )}

      {/* Test cases */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        {tests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <FlaskConical size={32} className="opacity-30" />
            <p className="text-[11px]">Test yok — "Test Ekle" ile başlayın</p>
          </div>
        ) : (
          tests.map((tc) => (
            <TestCaseForm
              key={tc.id}
              tc={tc}
              profile={profile}
              onUpdate={updateTest}
              onDelete={deleteTest}
              result={resultMap[tc.id]}
            />
          ))
        )}
      </div>
    </div>
  );
}
