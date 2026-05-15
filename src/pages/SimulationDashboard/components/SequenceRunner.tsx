import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Plus, Trash2, CheckCircle2,
  XCircle, Clock, Send, Eye, Save,
  FilePlus, ChevronDown, Download, Layers,
  AlignLeft, ChevronRight, AlertTriangle, Tag,
  Minus, FileDown, FileUp, RotateCcw,
} from 'lucide-react';
import { useSimulation } from '../../../hooks/useSimulation';
import { v4 as uuidv4 } from 'uuid';
import { AutomationStep, AutomationSequence, ConversationEntry } from '../../../types';
import { useTranslation } from '../../../i18n/context';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StepResult {
  type: string;
  payload: string;
  status: 'success' | 'fail';
  error?: string;
  durationMs: number;
}

interface CampaignResult {
  sequenceId: string;
  sequenceName: string;
  group: string;
  status: 'pending' | 'running' | 'pass' | 'fail';
  stepResults: StepResult[];
  durationMs: number;
  startedAt: string;
}

interface ExportEnvelope {
  format: 'uart-sequences';
  version: string;
  exportedAt: string;
  sequences: AutomationSequence[];
}

// ─── Step executor ────────────────────────────────────────────────────────────

async function executeSteps(
  steps: AutomationStep[],
  sendFn: (data: string) => void,
  getState: () => import('../../../types').SimulationState,
  onStep: (idx: number, status: AutomationStep['status'], result?: string) => void,
  cancelRef: { current: boolean },
  timeoutErrorMsg: string,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (cancelRef.current) break;
    onStep(i, 'running');
    const step = steps[i];
    const repeatCount = Math.max(1, step.repeat ?? 1);
    const t0 = Date.now();
    try {
      for (let rep = 0; rep < repeatCount; rep++) {
        if (cancelRef.current) break;
        if (step.type === 'send') {
          sendFn(step.payload);
          await new Promise(r => setTimeout(r, 100));
        } else if (step.type === 'wait') {
          await new Promise(r => setTimeout(r, parseInt(step.payload) || 1000));
        } else if (step.type === 'expect') {
          let matched = false;
          const [patternPart, timeoutPart] = step.payload.split('|').map(p => p.trim());
          const searchPattern = (patternPart || '').replace(/\s+/g, '').toUpperCase();
          const timeoutMs = Number.parseInt(timeoutPart || '2500', 10);
          const deadline = Date.now() + (Number.isFinite(timeoutMs) ? Math.max(200, timeoutMs) : 2500);
          while (Date.now() < deadline) {
            if (cancelRef.current) break;
            const recentLogs = getState().conversationLogs.slice(0, 40);
            if (recentLogs.some((log: ConversationEntry) =>
              log.type === 'rx' && log.rawHex.replace(/\s+/g, '').toUpperCase().includes(searchPattern)
            )) { matched = true; break; }
            await new Promise(r => setTimeout(r, 50));
          }
          if (!matched) throw new Error(timeoutErrorMsg);
        }
      }
      onStep(i, 'success');
      results.push({ type: step.type, payload: step.payload, status: 'success', durationMs: Date.now() - t0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onStep(i, 'fail', msg);
      results.push({ type: step.type, payload: step.payload, status: 'fail', error: msg, durationMs: Date.now() - t0 });
      return results;
    }
  }
  return results;
}

// ─── Download helper ──────────────────────────────────────────────────────────

async function triggerDownload(content: string, filename: string, mimeType: string): Promise<string> {
  try {
    const fsModule = await import('@tauri-apps/plugin-fs');
    await fsModule.writeTextFile(filename, content, { baseDir: fsModule.BaseDirectory.Download });
  } catch (err) {
    console.error('[triggerDownload] Tauri FS failed, falling back to blob:', err);
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return filename;
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({ results, totalMs, onClose }: {
  results: CampaignResult[];
  totalMs: number;
  onClose: () => void;
}) {
  const { t, locale } = useTranslation();
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const [dlMsg, setDlMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const buildHtml = () => {
    const groups = Array.from(new Set(results.map(r => r.group)));
    const passRate = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;
    const now = new Date();
    const dateStr = now.toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString(locale === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${t('automation.seriesReport')} — ${dateStr}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11px; color: #1e293b; background: #fff; }

  /* ── Page layout ── */
  .page { max-width: 800px; margin: 0 auto; padding: 48px 48px 64px; }

  /* ── Header ── */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #0f172a; }
  .header-left {}
  .brand { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
  .title { font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.2; }
  .header-right { text-align: right; }
  .date { font-size: 12px; font-weight: 600; color: #0f172a; }
  .time { font-size: 10px; color: #94a3b8; margin-top: 2px; }

  /* ── Summary cards ── */
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .card { border-radius: 8px; padding: 14px 16px; border: 1px solid; }
  .card-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px; }
  .card-value { font-size: 24px; font-weight: 800; line-height: 1; }
  .card-sub { font-size: 9px; margin-top: 4px; }
  .card-pass { background: #f0fdf4; border-color: #86efac; }
  .card-pass .card-label { color: #16a34a; }
  .card-pass .card-value { color: #15803d; }
  .card-pass .card-sub { color: #4ade80; }
  .card-fail { background: #fef2f2; border-color: #fca5a5; }
  .card-fail .card-label { color: #dc2626; }
  .card-fail .card-value { color: #b91c1c; }
  .card-fail .card-sub { color: #f87171; }
  .card-total { background: #f8fafc; border-color: #cbd5e1; }
  .card-total .card-label { color: #475569; }
  .card-total .card-value { color: #1e293b; }
  .card-total .card-sub { color: #94a3b8; }
  .card-rate { background: #eff6ff; border-color: #93c5fd; }
  .card-rate .card-label { color: #2563eb; }
  .card-rate .card-value { color: #1d4ed8; }
  .card-rate .card-sub { color: #60a5fa; }

  /* ── Progress bar ── */
  .progress-wrap { margin-bottom: 28px; }
  .progress-bar-bg { height: 6px; background: #fee2e2; border-radius: 9999px; overflow: hidden; }
  .progress-bar-fill { height: 100%; background: linear-gradient(90deg, #10b981, #059669); border-radius: 9999px; }
  .progress-labels { display: flex; justify-content: space-between; margin-top: 4px; font-size: 9px; color: #94a3b8; }

  /* ── Group section ── */
  .group { margin-bottom: 28px; page-break-inside: avoid; }
  .group-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .group-tag { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #fff; background: #475569; padding: 3px 8px; border-radius: 4px; }
  .group-line { flex: 1; height: 1px; background: #e2e8f0; }
  .group-count { font-size: 9px; color: #94a3b8; }

  /* ── Sequence row ── */
  .seq { margin-bottom: 8px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; page-break-inside: avoid; }
  .seq-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
  .seq.pass .seq-header { background: #f0fdf4; border-bottom: 1px solid #dcfce7; }
  .seq.fail .seq-header { background: #fef2f2; border-bottom: 1px solid #fee2e2; }
  .seq-status { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0; }
  .seq.pass .seq-status { background: #10b981; color: #fff; }
  .seq.fail .seq-status { background: #ef4444; color: #fff; }
  .seq-name { font-weight: 700; font-size: 12px; flex: 1; }
  .seq.pass .seq-name { color: #14532d; }
  .seq.fail .seq-name { color: #7f1d1d; }
  .seq-dur { font-size: 10px; color: #94a3b8; font-variant-numeric: tabular-nums; }
  .seq-steps-count { font-size: 9px; padding: 2px 7px; border-radius: 9999px; font-weight: 600; }
  .seq.pass .seq-steps-count { background: #dcfce7; color: #166534; }
  .seq.fail .seq-steps-count { background: #fee2e2; color: #991b1b; }

  /* ── Steps table ── */
  .steps-table { width: 100%; border-collapse: collapse; }
  .steps-table td { padding: 6px 14px; font-size: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .steps-table tr:last-child td { border-bottom: none; }
  .td-num { color: #cbd5e1; width: 24px; font-variant-numeric: tabular-nums; }
  .td-type { width: 60px; }
  .type-pill { display: inline-block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 3px; }
  .type-send { background: #dcfce7; color: #14532d; }
  .type-wait { background: #fef9c3; color: #713f12; }
  .type-expect { background: #ede9fe; color: #4c1d95; }
  .td-payload { font-family: 'Courier New', monospace; color: #475569; }
  .td-dur { color: #cbd5e1; text-align: right; width: 48px; font-variant-numeric: tabular-nums; }
  .td-status { width: 28px; text-align: center; }
  .icon-ok { color: #10b981; font-weight: 700; }
  .icon-err { color: #ef4444; font-weight: 700; }
  .td-errmsg { color: #ef4444; font-size: 9px; font-style: italic; }

  /* ── Footer ── */
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 10px; font-weight: 700; color: #1e293b; }
  .footer-right { font-size: 9px; color: #94a3b8; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 32px; }
    .group { page-break-inside: avoid; }
    .seq { page-break-inside: avoid; }
  }
</style></head><body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="brand">${t('automation.reportBrand')}</div>
      <div class="title">${t('automation.seriesReport')}</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div class="time">${timeStr}</div>
    </div>
  </div>

  <!-- Summary cards -->
  <div class="summary-grid">
    <div class="card card-pass">
      <div class="card-label">${t('automation.passedLabel')}</div>
      <div class="card-value">${passed}</div>
      <div class="card-sub">${t('automation.seqPassed')}</div>
    </div>
    <div class="card card-fail">
      <div class="card-label">${t('automation.failedLabel')}</div>
      <div class="card-value">${failed}</div>
      <div class="card-sub">${t('automation.seqFailed')}</div>
    </div>
    <div class="card card-total">
      <div class="card-label">${t('automation.totalDuration')}</div>
      <div class="card-value">${(totalMs / 1000).toFixed(1)}<span style="font-size:14px;font-weight:600">s</span></div>
      <div class="card-sub">${results.length} ${t('automation.seqRan')}</div>
    </div>
    <div class="card card-rate">
      <div class="card-label">${t('automation.successRateLabel')}</div>
      <div class="card-value">${passRate}<span style="font-size:14px;font-weight:600">%</span></div>
      <div class="card-sub">${passed}/${results.length} ${t('automation.sequenceUnit')}</div>
    </div>
  </div>

  <!-- Progress bar -->
  <div class="progress-wrap">
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width:${passRate}%"></div>
    </div>
    <div class="progress-labels">
      <span>${passed} ${t('automation.passedStat')}</span>
      <span>${passRate}% ${t('automation.passRateLabel')}</span>
      <span>${failed} ${t('automation.failedStat')}</span>
    </div>
  </div>

  <!-- Groups -->
  ${groups.map(group => {
    const groupResults = results.filter(r => r.group === group);
    const gPass = groupResults.filter(r => r.status === 'pass').length;
    return `
    <div class="group">
      <div class="group-header">
        <span class="group-tag">${group || t('automation.general')}</span>
        <div class="group-line"></div>
        <span class="group-count">${gPass}/${groupResults.length} ${t('automation.passedShort')}</span>
      </div>
      ${groupResults.map(r => `
      <div class="seq ${r.status === 'pass' ? 'pass' : 'fail'}">
        <div class="seq-header">
          <div class="seq-status">${r.status === 'pass' ? '✓' : '✗'}</div>
          <div class="seq-name">${r.sequenceName}</div>
          <span class="seq-steps-count">${r.stepResults.length} ${t('automation.stepsUnit')}</span>
          <span class="seq-dur">${(r.durationMs / 1000).toFixed(2)}s</span>
        </div>
        <table class="steps-table">
          ${r.stepResults.map((s, i) => `
          <tr>
            <td class="td-num">${i + 1}</td>
            <td class="td-type"><span class="type-pill type-${s.type}">${s.type}</span></td>
            <td class="td-payload">${s.payload}</td>
            ${s.status === 'success'
              ? `<td class="td-status icon-ok">✓</td><td></td>`
              : `<td class="td-status icon-err">✗</td><td class="td-errmsg">${s.error ?? ''}</td>`
            }
            <td class="td-dur">${s.durationMs}ms</td>
          </tr>`).join('')}
        </table>
      </div>`).join('')}
    </div>`;
  }).join('')}

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">${t('automation.summaryFooter', { passed: String(passed), total: String(results.length), duration: (totalMs / 1000).toFixed(2) })}</div>
    <div class="footer-right">${t('automation.reportBrand')} · ${dateStr} ${timeStr}</div>
  </div>

</div>
</body></html>`;
  };

  const buildJunitXml = () => {
    const groups = Array.from(new Set(results.map(r => r.group)));
    const totalSec = (totalMs / 1000).toFixed(3);
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;');

    const suites = groups.map(group => {
      const gResults = results.filter(r => r.group === group);
      const gFail = gResults.filter(r => r.status === 'fail').length;
      const gSec = (gResults.reduce((a, r) => a + r.durationMs, 0) / 1000).toFixed(3);
      const cases = gResults.map(r => {
        const sec = (r.durationMs / 1000).toFixed(3);
        const failMsg = r.stepResults.find(s => s.status === 'fail');
        if (r.status === 'fail' && failMsg) {
          const errMsg = failMsg.error ?? t('automation.timeoutError');
          const tcOpen = `    <testcase name="${esc(r.sequenceName)}" time="${sec}">`;
          const failEl = `      <failure message="${esc(errMsg)}" type="AssertionError">${esc(errMsg)}</failure>`;
          return [tcOpen, failEl, '    </testcase>'].join('\n');
        }
        return `    <testcase name="${esc(r.sequenceName)}" time="${sec}" />`;
      }).join('\n');
      const suiteName = esc(group || t('automation.general'));
      return [
        `  <testsuite name="${suiteName}" tests="${gResults.length}" failures="${gFail}" time="${gSec}">`,
        cases,
        '  </testsuite>',
      ].join('\n');
    }).join('\n');

    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
    const tsOpen = `<testsuites name="UART Automation" tests="${results.length}" failures="${results.filter(r => r.status === 'fail').length}" time="${totalSec}">`;
    return [xmlHeader, tsOpen, suites, '</testsuites>'].join('\n');
  };

  const printPdf = () => {
    const html = buildHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 2000);
    };
  };

  const downloadJunit = () => {
    const filename = `uart-test-results-${Date.now()}.xml`;
    triggerDownload(buildJunitXml(), filename, 'application/xml').then(saved => {
      setDlMsg({ text: saved ? `✓ ${saved}` : `✓ ${filename}`, ok: true });
      setTimeout(() => setDlMsg(null), 3000);
    }).catch(() => {
      setDlMsg({ text: '✗ download failed', ok: false });
      setTimeout(() => setDlMsg(null), 3000);
    });
  };

  // Group results for modal display too
  const groups = Array.from(new Set(results.map(r => r.group)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="w-[720px] max-h-[85vh] flex flex-col bg-gray-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gray-900/60">
          <div>
            <div className="text-[12px] font-black text-cyan-400 uppercase tracking-widest">{t('automation.seriesReport')}</div>
            <div className="text-[10px] text-gray-500 font-mono mt-0.5">{new Date().toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB')}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg text-[10px] font-black bg-emerald-900/50 text-emerald-300 border border-emerald-800/40">
              {passed} {t('automation.passedLabel')}
            </span>
            {failed > 0 && (
              <span className="px-3 py-1 rounded-lg text-[10px] font-black bg-red-900/50 text-red-300 border border-red-800/40">
                {failed} {t('automation.failedLabel')}
              </span>
            )}
            <span className="px-3 py-1 rounded-lg text-[10px] font-mono bg-gray-800 text-gray-400 border border-gray-700/40">
              {(totalMs / 1000).toFixed(2)}s
            </span>
            <button onClick={downloadJunit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-amber-700 hover:bg-amber-600 text-white transition-all">
              <FileDown size={11} /> {t('automation.downloadJunit')}
            </button>
            <button onClick={printPdf} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-700 hover:bg-indigo-600 text-white transition-all">
              <Download size={11} /> {t('automation.downloadPdf')}
            </button>
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700/50 transition-all">
              {t('common.close')}
            </button>
          </div>
        </div>

        {/* Grouped results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {groups.map(group => {
            const groupResults = results.filter(r => r.group === group);
            const gPassed = groupResults.filter(r => r.status === 'pass').length;
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-2">
                  <Tag size={10} className="text-gray-500" />
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{group || t('automation.general')}</span>
                  <span className="text-[9px] text-gray-600">{gPassed}/{groupResults.length}</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="space-y-1.5 pl-3">
                  {groupResults.map((r, i) => <ExpandableResult key={r.sequenceId} result={r} index={i} />)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-white/5 bg-gray-900/40 text-[10px] font-mono flex items-center justify-between">
          <span className="text-gray-500">{t('automation.summaryFooter', { passed: String(passed), total: String(results.length), duration: (totalMs / 1000).toFixed(2) })}</span>
          {dlMsg && (
            <span className={`px-3 py-1 rounded-lg font-bold text-[10px] transition-all ${dlMsg.ok ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
              {dlMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpandableResult({ result, index }: { result: CampaignResult; index: number }) {
  const [open, setOpen] = useState(result.status === 'fail');
  const isPassed = result.status === 'pass';
  return (
    <div className={`rounded-xl border overflow-hidden ${isPassed ? 'border-emerald-800/30 bg-emerald-950/10' : 'border-red-800/30 bg-red-950/10'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors">
        <span className="text-[9px] font-mono text-gray-600 w-4">{index + 1}</span>
        {isPassed ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" /> : <XCircle size={13} className="text-red-400 shrink-0" />}
        <span className="flex-1 text-[11px] font-bold text-gray-200">{result.sequenceName}</span>
        <span className="text-[9px] text-gray-500 font-mono">{(result.durationMs / 1000).toFixed(2)}s</span>
        <ChevronRight size={11} className={`text-gray-600 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1 border-t border-white/5">
          {result.stepResults.map((s, si) => (
            <div key={si} className="flex items-center gap-2 py-1">
              <span className="text-[9px] text-gray-600 font-mono w-4">{si + 1}</span>
              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                s.type === 'send' ? 'bg-emerald-900/40 text-emerald-400' :
                s.type === 'wait' ? 'bg-yellow-900/40 text-yellow-400' : 'bg-purple-900/40 text-purple-400'
              }`}>{s.type}</span>
              <span className="flex-1 text-[10px] font-mono text-gray-400 truncate">{s.payload}</span>
              <span className="text-[9px] font-mono text-gray-600">{s.durationMs}ms</span>
              {s.status === 'success'
                ? <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                : <div className="flex items-center gap-1 shrink-0">
                    <XCircle size={11} className="text-red-400" />
                    {s.error && <span className="text-[9px] text-red-400 font-mono max-w-[120px] truncate">{s.error}</span>}
                  </div>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sequence Combobox ────────────────────────────────────────────────────────

interface ComboboxProps {
  sequences: import('../../../types').AutomationSequence[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

function SequenceCombobox({ sequences, activeId, onSelect }: ComboboxProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const selected = sequences.find(s => s.id === activeId);

  const filtered = query.trim()
    ? sequences.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        (s.group ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : sequences;

  const groups = Array.from(new Set(filtered.map(s => s.group ?? ''))).sort();

  const flatFiltered = groups.flatMap(g => filtered.filter(s => (s.group ?? '') === g));

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    const idx = highlighted ? flatFiltered.findIndex(s => s.id === highlighted) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(flatFiltered[Math.min(idx + 1, flatFiltered.length - 1)]?.id ?? null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(flatFiltered[Math.max(idx - 1, 0)]?.id ?? null);
    } else if (e.key === 'Enter' && highlighted) {
      handleSelect(highlighted);
    } else if (e.key === 'Escape') {
      setOpen(false); setQuery('');
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted && listRef.current) {
      const el = listRef.current.querySelector(`[data-id="${highlighted}"]`) as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.closest('.seq-combobox')?.contains(e.target as Node)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="seq-combobox relative flex-1">
      <div className={`flex items-center bg-gray-900 border rounded-lg px-3 py-2 gap-2 transition-colors ${open ? 'border-blue-500/50' : 'border-gray-700'}`}>
        <input
          ref={inputRef}
          value={open ? query : (selected ? selected.name : '')}
          onChange={e => { setQuery(e.target.value); setHighlighted(null); }}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onKeyDown={handleKeyDown}
          placeholder={sequences.length === 0 ? t('automation.noSequences') : t('automation.searchPlaceholder')}
          className="flex-1 bg-transparent text-xs font-mono text-gray-200 focus:outline-none placeholder:text-gray-600 min-w-0"
        />
        {selected && !open && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${selected.group ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-800 text-gray-500'}`}>
            {selected.group || t('automation.general')}
          </span>
        )}
        <ChevronDown size={13} className={`text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div ref={listRef} className="absolute top-full left-0 right-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-[10px] text-gray-600 text-center">{t('automation.noMatch')}</div>
          ) : (
            groups.map(group => {
              const groupSeqs = filtered.filter(s => (s.group ?? '') === group);
              return (
                <div key={group}>
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5">
                    <Tag size={9} className="text-gray-600" />
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{group || t('automation.general')}</span>
                    <span className="text-[9px] text-gray-700">{groupSeqs.length}</span>
                  </div>
                  {groupSeqs.map(seq => (
                    <button
                      key={seq.id}
                      data-id={seq.id}
                      onMouseDown={() => handleSelect(seq.id)}
                      onMouseEnter={() => setHighlighted(seq.id)}
                      className={`w-full text-left flex items-center gap-2 px-4 py-2 text-[11px] font-mono transition-colors ${
                        highlighted === seq.id ? 'bg-blue-600/20 text-white' :
                        activeId === seq.id ? 'bg-white/5 text-blue-300' : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="flex-1 truncate">{seq.name}</span>
                      <span className="text-[9px] text-gray-600 shrink-0">{seq.steps.length} {t('automation.stepsUnit')}</span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SequenceRunner: React.FC = () => {
  const { t } = useTranslation();
  const { state, sendRawData, automation } = useSimulation();
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [mode, setMode] = useState<'single' | 'campaign'>('single');

  // ── Single mode ──
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [sequenceName, setSequenceName] = useState(t('automation.newSequence'));
  const [sequenceGroup, setSequenceGroup] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const cancelRef = useRef(false);
  const [currentStepIdx, setCurrentStepIdx] = useState<number | null>(null);
  const isNewModeRef = useRef(false);

  // ── Campaign mode ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [campaignResults, setCampaignResults] = useState<CampaignResult[]>([]);
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [currentCampaignIdx, setCurrentCampaignIdx] = useState<number | null>(null);
  const campaignCancelRef = useRef(false);
  const [showReport, setShowReport] = useState(false);
  const [campaignTotalMs, setCampaignTotalMs] = useState(0);

  // ── Import/Export ──
  const importRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Load sequence
  useEffect(() => {
    if (isNewModeRef.current) return;

    if (state.activeSequenceId) {
      const seq = state.sequences.find(s => s.id === state.activeSequenceId);
      if (seq && seq.id !== activeId) {
        setSteps(seq.steps);
        setSequenceName(seq.name);
        setSequenceGroup(seq.group ?? '');
        setActiveId(seq.id);
      }
    } else if (state.sequences.length > 0 && activeId === null) {
      const first = state.sequences[0];
      setSteps(first.steps);
      setSequenceName(first.name);
      setSequenceGroup(first.group ?? '');
      setActiveId(first.id);
    } else if (state.sequences.length === 0 && steps.length === 0) {
      setSteps([
        { id: '1', type: 'send', payload: '55 AA 01 02 03', status: 'idle' },
        { id: '2', type: 'wait', payload: '500', status: 'idle' },
        { id: '3', type: 'expect', payload: '55 AA 01 02 03', status: 'idle' },
      ]);
    }
  }, [state.activeSequenceId, state.sequences]); // activeId ve steps kasıtlı olarak bağımlılıktan çıkarıldı

  const addStep = useCallback((type: AutomationStep['type']) => {
    setSteps(prev => [...prev, { id: uuidv4(), type, payload: type === 'wait' ? '1000' : '', status: 'idle' }]);
  }, []);
  const removeStep = useCallback((id: string) => setSteps(prev => prev.filter(s => s.id !== id)), []);
  const updateStep = useCallback((id: string, payload: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, payload } : s));
  }, []);
  const updateRepeat = useCallback((id: string, repeat: number) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, repeat: repeat > 1 ? repeat : undefined } : s));
  }, []);

  const saveSequence = () => {
    const sequenceId = activeId || uuidv4();
    automation.saveSequence({
      id: sequenceId, name: sequenceName, group: sequenceGroup || undefined,
      steps: steps.map(s => ({ ...s, status: 'idle' })),
      updatedAt: new Date().toISOString(),
      createdAt: (activeId ? state.sequences.find(s => s.id === activeId)?.createdAt : null) || new Date().toISOString(),
    });
    if (!activeId) {
      setActiveId(sequenceId);
      automation.setActiveSequence(sequenceId);
    }
    isNewModeRef.current = false;
  };

  const deleteActiveSequence = () => {
    if (!activeId) return;
    automation.deleteSequence(activeId);
    isNewModeRef.current = false;
    setActiveId(null); setSteps([]); setSequenceName(t('automation.newSequence')); setSequenceGroup('');
  };

  const createNew = () => {
    isNewModeRef.current = true;
    setActiveId(null);
    automation.setActiveSequence(null);
    setSteps([]);
    setSequenceName(t('automation.untitledTest'));
    setSequenceGroup('');
  };

  // ── Export helpers ──
  const exportSequences = (seqs: AutomationSequence[]) => {
    if (exporting) return;
    setExporting(true);
    const envelope: ExportEnvelope = {
      format: 'uart-sequences',
      version: __APP_VERSION__,
      exportedAt: new Date().toISOString(),
      sequences: seqs,
    };
    const filename = `uart-sequences-${Date.now()}.json`;
    triggerDownload(JSON.stringify(envelope, null, 2), filename, 'application/json').then(saved => {
      setImportMsg({ text: `✓ ${saved}`, ok: true });
      setTimeout(() => setImportMsg(null), 3000);
    }).finally(() => setExporting(false));
  };

  const exportCurrentSequence = () => {
    const current: AutomationSequence = {
      id: activeId || uuidv4(),
      name: sequenceName,
      group: sequenceGroup || undefined,
      steps: steps.map(s => ({ ...s, status: 'idle' })),
      createdAt: (activeId ? state.sequences.find(s => s.id === activeId)?.createdAt : null) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    exportSequences([current]);
  };

  const exportAllSequences = () => exportSequences(state.sequences);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string) as ExportEnvelope;
        if (data.format !== 'uart-sequences' || !Array.isArray(data.sequences)) {
          throw new Error('bad format');
        }
        let count = 0;
        data.sequences.forEach(seq => {
          const newId = uuidv4();
          automation.saveSequence({
            ...seq,
            id: newId,
            steps: seq.steps.map(s => ({ ...s, id: uuidv4(), status: 'idle' })),
            updatedAt: new Date().toISOString(),
          });
          count++;
        });
        setImportMsg({ text: t('automation.importSuccess', { count: String(count) }), ok: true });
      } catch {
        setImportMsg({ text: t('automation.importError'), ok: false });
      }
      setTimeout(() => setImportMsg(null), 3000);
      if (importRef.current) importRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const runSingle = async () => {
    if (isRunning || steps.length === 0) return;
    setIsRunning(true); cancelRef.current = false; setCurrentStepIdx(0);
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle' })));
    await executeSteps(steps, sendRawData, () => stateRef.current,
      (idx, status, result) => { setCurrentStepIdx(idx); setSteps(prev => prev.map((s, i) => i === idx ? { ...s, status, result } : s)); },
      cancelRef, t('automation.timeoutError'),
    );
    setIsRunning(false); setCurrentStepIdx(null);
  };

  const stopSingle = () => { cancelRef.current = true; setIsRunning(false); setCurrentStepIdx(null); };

  // ── Campaign helpers ──
  const allGroups = Array.from(new Set(state.sequences.map(s => s.group ?? ''))).sort();

  const toggleSeq = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const toggleGroup = (group: string) => {
    const groupIds = state.sequences.filter(s => (s.group ?? '') === group).map(s => s.id);
    const allSelected = groupIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      groupIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(state.sequences.map(s => s.id)));
  const clearAll = () => setSelectedIds(new Set());

  const runCampaign = async () => {
    if (campaignRunning || selectedIds.size === 0) return;
    const ordered = state.sequences.filter(s => selectedIds.has(s.id));
    campaignCancelRef.current = false; setCampaignRunning(true);
    setCampaignResults(ordered.map(s => ({
      sequenceId: s.id, sequenceName: s.name, group: s.group ?? '',
      status: 'pending', stepResults: [], durationMs: 0, startedAt: '',
    })));

    const campaignStart = Date.now();

    for (let i = 0; i < ordered.length; i++) {
      if (campaignCancelRef.current) break;
      setCurrentCampaignIdx(i);
      const seq = ordered[i];
      const t0 = Date.now();
      setCampaignResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'running', startedAt: new Date().toISOString() } : r));
      const stepResults = await executeSteps(
        seq.steps, sendRawData, () => stateRef.current, () => {},
        { current: campaignCancelRef.current }, t('automation.timeoutError'),
      );
      const durationMs = Date.now() - t0;
      const allPassed = stepResults.length === seq.steps.length && stepResults.every(s => s.status === 'success');
      setCampaignResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: allPassed ? 'pass' : 'fail', stepResults, durationMs } : r));
    }

    setCampaignTotalMs(Date.now() - campaignStart);
    setCampaignRunning(false); setCurrentCampaignIdx(null); setShowReport(true);
  };

  const stopCampaign = () => { campaignCancelRef.current = true; setCampaignRunning(false); setCurrentCampaignIdx(null); };

  const completedCount = campaignResults.filter(r => r.status === 'pass' || r.status === 'fail').length;
  const passedCount = campaignResults.filter(r => r.status === 'pass').length;
  const failedCount = campaignResults.filter(r => r.status === 'fail').length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-950/40 font-mono">

      {/* Hidden file input for import */}
      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />

      {/* Import toast */}
      {importMsg && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[11px] font-bold shadow-xl border transition-all ${importMsg.ok ? 'bg-emerald-900 border-emerald-700 text-emerald-300' : 'bg-red-900 border-red-700 text-red-300'}`}>
          {importMsg.text}
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5 bg-gray-900/40">
        <div>
          <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{t('automation.lab')}</div>
          <div className="text-[9px] text-gray-600 mt-0.5">
            {mode === 'single' ? t('automation.singleDesc') : t('automation.seriesDesc')}
          </div>
        </div>
        <div className="flex items-center bg-gray-900 border border-gray-800 rounded-lg p-0.5 gap-0.5">
          <button onClick={() => setMode('single')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${mode === 'single' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
            <AlignLeft size={11} /> {t('automation.singleMode')}
          </button>
          <button onClick={() => setMode('campaign')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${mode === 'campaign' ? 'bg-purple-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
            <Layers size={11} /> {t('automation.seriesMode')}
          </button>
        </div>
      </div>

      {/* ══ SINGLE MODE ══════════════════════════════════════════════════════ */}
      {mode === 'single' && (
        <div className="flex-1 flex flex-col min-h-0 p-4">
          {/* Toolbar */}
          <div className="shrink-0 flex flex-col gap-2 mb-4">
            <div className="flex items-center gap-2 glass-panel p-2 rounded-xl border border-gray-800">
              <SequenceCombobox
                sequences={state.sequences}
                activeId={activeId}
                onSelect={id => { isNewModeRef.current = false; automation.setActiveSequence(id); }}
              />
              <div className="flex items-center gap-1">
                <button onClick={createNew} title={t('automation.newScenario')} className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"><FilePlus size={14} /></button>
                <button onClick={saveSequence} title={t('automation.saveScenario')} className="p-2 text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all"><Save size={14} /></button>
                {activeId && <button onClick={deleteActiveSequence} title={t('automation.deleteScenario')} className="p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"><Trash2 size={14} /></button>}
                <button onClick={exportCurrentSequence} disabled={exporting} title={t('automation.exportJson')} className="p-2 text-gray-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all disabled:opacity-30 disabled:cursor-wait"><FileDown size={14} /></button>
                <button onClick={() => importRef.current?.click()} title={t('automation.importJson')} className="p-2 text-gray-500 hover:text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-all"><FileUp size={14} /></button>
              </div>
              {!isRunning
                ? <button onClick={runSingle} disabled={steps.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-bold transition-all"><Play size={12} fill="currentColor" /> {t('automation.run')}</button>
                : <button onClick={stopSingle} className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[11px] font-bold transition-all"><Square size={12} fill="currentColor" /> {t('automation.stop')}</button>
              }
            </div>
            {/* Name + Group row */}
            <div className="flex items-center gap-2 px-1">
              <input value={sequenceName} onChange={e => setSequenceName(e.target.value)} placeholder={t('automation.namePlaceholder')}
                className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-[11px] font-mono text-gray-200 focus:outline-none focus:border-blue-500/50" />
              <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5">
                <Tag size={11} className="text-gray-600 shrink-0" />
                <input value={sequenceGroup} onChange={e => setSequenceGroup(e.target.value)} placeholder={t('automation.groupPlaceholder')}
                  list="group-suggestions"
                  className="w-32 bg-transparent text-[11px] font-mono text-gray-300 focus:outline-none placeholder:text-gray-700" />
                <datalist id="group-suggestions">
                  {allGroups.filter(Boolean).map(g => <option key={g} value={g} />)}
                </datalist>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
            {steps.map((step, idx) => (
              <div key={step.id} className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${idx === currentStepIdx ? 'bg-blue-900/10 border-blue-500/40 ring-1 ring-blue-500/20' : 'bg-gray-900/40 border-gray-800 hover:bg-gray-900/60'}`}>
                <div className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center text-[9px] font-bold text-gray-500 shrink-0">{idx + 1}</div>
                <div className="flex items-center gap-2 min-w-[80px]">
                  {step.type === 'send' && <Send size={12} className="text-emerald-500" />}
                  {step.type === 'wait' && <Clock size={12} className="text-yellow-500" />}
                  {step.type === 'expect' && <Eye size={12} className="text-purple-500" />}
                  <span className="text-[9px] font-black uppercase text-gray-500">{step.type}</span>
                </div>
                <input value={step.payload} onChange={e => updateStep(step.id, e.target.value)}
                  placeholder={step.type === 'wait' ? t('automation.placeholderWait') : t('automation.placeholderPattern')}
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-[11px] font-mono text-gray-200 focus:outline-none focus:border-blue-500/50" />
                {/* Repeat control */}
                <div className="flex items-center gap-1 shrink-0">
                  <RotateCcw size={10} className="text-gray-600" />
                  <input
                    type="number" min={1} max={99}
                    value={step.repeat ?? 1}
                    onChange={e => updateRepeat(step.id, Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-9 bg-gray-950 border border-gray-800 rounded text-[10px] font-mono text-gray-400 text-center focus:outline-none focus:border-blue-500/50 py-0.5"
                  />
                  <span className="text-[9px] text-gray-600">{t('automation.repeatLabel')}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-[70px] justify-end">
                  {step.status === 'running' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />}
                  {step.status === 'success' && <CheckCircle2 size={13} className="text-emerald-500" />}
                  {step.status === 'fail' && <div className="flex items-center gap-1 text-rose-500"><XCircle size={13} />{step.result && <span className="text-[9px] max-w-[60px] truncate">{step.result}</span>}</div>}
                  <button onClick={() => removeStep(step.id)} className="p-1 text-gray-700 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              {(['send', 'wait', 'expect'] as AutomationStep['type'][]).map(type => (
                <button key={type} onClick={() => addStep(type)} className={`flex-1 py-2.5 border-2 border-dashed rounded-xl flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase transition-all ${
                  type === 'send' ? 'border-gray-800 hover:border-emerald-500/40 text-gray-600 hover:text-emerald-500' :
                  type === 'wait' ? 'border-gray-800 hover:border-yellow-500/40 text-gray-600 hover:text-yellow-500' :
                  'border-gray-800 hover:border-purple-500/40 text-gray-600 hover:text-purple-500'
                }`}>
                  <Plus size={11} />
                  {type === 'send' ? t('automation.stepSend') : type === 'wait' ? t('automation.stepWait') : t('automation.stepExpect')}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="shrink-0 mt-3 px-3 py-2 bg-gray-900/60 rounded-xl border border-gray-800 flex items-center justify-between">
            <span className="text-[9px] text-gray-500 uppercase">{t('automation.statusLabel')} <span className={isRunning ? 'text-blue-400 animate-pulse' : 'text-gray-400'}>{isRunning ? t('automation.statusRunning') : t('automation.statusReady')}</span></span>
            <div className="flex gap-3">
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-[9px] text-gray-600">{steps.filter(s => s.status === 'success').length} {t('automation.passedShort')}</span></div>
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /><span className="text-[9px] text-gray-600">{steps.filter(s => s.status === 'fail').length} {t('automation.failedShort')}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CAMPAIGN MODE ════════════════════════════════════════════════════ */}
      {mode === 'campaign' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">

          {/* Toolbar */}
          <div className="shrink-0 flex items-center gap-3 glass-panel px-4 py-2.5 rounded-xl border border-gray-800">
            <span className="text-[10px] font-black text-gray-400">{t('automation.selectedCount', { count: String(selectedIds.size) })}</span>
            <div className="w-px h-3 bg-gray-700" />
            <button onClick={selectAll} className="text-[9px] text-blue-400 hover:text-blue-300 font-bold transition-colors">{t('automation.selectAll')}</button>
            <button onClick={clearAll} className="text-[9px] text-gray-600 hover:text-gray-400 font-bold transition-colors">{t('automation.clearAll')}</button>
            <div className="w-px h-3 bg-gray-700" />
            <button onClick={exportAllSequences} disabled={exporting} title={t('automation.exportJson')} className="flex items-center gap-1 text-[9px] text-amber-500 hover:text-amber-400 font-bold transition-colors disabled:opacity-30 disabled:cursor-wait">
              <FileDown size={11} /> {exporting ? '...' : t('automation.exportJson')}
            </button>
            <button onClick={() => importRef.current?.click()} title={t('automation.importJson')} className="flex items-center gap-1 text-[9px] text-cyan-500 hover:text-cyan-400 font-bold transition-colors">
              <FileUp size={11} /> {t('automation.importJson')}
            </button>
            <div className="flex-1" />
            {campaignResults.some(r => r.status === 'pass' || r.status === 'fail') && (
              <button onClick={() => setShowReport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-700 hover:bg-indigo-600 text-white transition-all">
                <Download size={11} /> {t('automation.report')}
              </button>
            )}
            {!campaignRunning
              ? <button onClick={runCampaign} disabled={selectedIds.size === 0 || state.sequences.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-[10px] font-bold transition-all">
                  <Play size={12} fill="currentColor" /> {t('automation.runSeries')}
                </button>
              : <button onClick={stopCampaign} className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold transition-all">
                  <Square size={12} fill="currentColor" /> {t('automation.stop')}
                </button>
            }
          </div>

          {/* Progress bar */}
          {campaignRunning && (
            <div className="shrink-0 h-1 bg-gray-900 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${selectedIds.size > 0 ? (completedCount / selectedIds.size) * 100 : 0}%` }} />
            </div>
          )}

          {/* Grouped sequence list */}
          {state.sequences.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-2">
              <AlertTriangle size={28} className="opacity-30" />
              <p className="text-[11px] text-center">{t('automation.noSequences')}.<br />{t('automation.noSequencesHint')}</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              {allGroups.map(group => {
                const groupSeqs = state.sequences.filter(s => (s.group ?? '') === group);
                const groupIds = groupSeqs.map(s => s.id);
                const allSelected = groupIds.every(id => selectedIds.has(id));
                const someSelected = groupIds.some(id => selectedIds.has(id));

                return (
                  <div key={group}>
                    {/* Group header */}
                    <button onClick={() => toggleGroup(group)}
                      className="w-full flex items-center gap-2 mb-1.5 group/gh hover:opacity-80 transition-opacity">
                      <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${allSelected ? 'bg-purple-600 border-purple-600' : someSelected ? 'bg-purple-600/30 border-purple-600/60' : 'border-gray-700 bg-transparent'}`}>
                        {allSelected ? <CheckCircle2 size={10} className="text-white" /> : someSelected ? <Minus size={9} className="text-purple-300" /> : null}
                      </div>
                      <Tag size={10} className="text-gray-500" />
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{group || t('automation.general')}</span>
                      <span className="text-[9px] text-gray-600">{groupSeqs.length} {t('automation.sequenceUnit')}</span>
                      <div className="flex-1 h-px bg-white/5" />
                    </button>

                    {/* Sequences in group */}
                    <div className="space-y-1 pl-5">
                      {groupSeqs.map(seq => {
                        const result = campaignResults.find(r => r.sequenceId === seq.id);
                        const isSelected = selectedIds.has(seq.id);
                        const runningIdx = currentCampaignIdx !== null ? state.sequences.filter(s => selectedIds.has(s.id))[currentCampaignIdx]?.id : null;
                        const isCurrent = runningIdx === seq.id;

                        return (
                          <div key={seq.id} onClick={() => toggleSeq(seq.id)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                              isCurrent ? 'bg-purple-900/20 border-purple-500/40 ring-1 ring-purple-500/20' :
                              isSelected ? 'bg-white/5 border-white/10 hover:border-white/15' :
                              'bg-gray-900/20 border-gray-800/40 opacity-40 hover:opacity-60'
                            }`}>
                            <div className={`shrink-0 w-3.5 h-3.5 rounded border transition-all ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-700'}`}>
                              {isSelected && <CheckCircle2 size={10} className="text-white" />}
                            </div>
                            <span className="flex-1 text-[11px] font-bold text-gray-200">{seq.name}</span>
                            <span className="text-[9px] text-gray-600">{seq.steps.length} {t('automation.stepsUnit')}</span>
                            {isCurrent && <div className="flex items-center gap-1.5 text-purple-400"><div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" /><span className="text-[9px] font-black">{t('automation.runningStatus')}</span></div>}
                            {result?.status === 'pass' && <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
                            {result?.status === 'fail' && <XCircle size={13} className="text-red-400 shrink-0" />}
                            {result?.status === 'pending' && !isCurrent && <Clock size={11} className="text-gray-600 shrink-0" />}
                            {result && (result.status === 'pass' || result.status === 'fail') && (
                              <span className="text-[9px] text-gray-500 font-mono">{(result.durationMs / 1000).toFixed(2)}s</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Campaign status bar */}
          {campaignResults.length > 0 && (
            <div className="shrink-0 px-4 py-2 bg-gray-900/60 rounded-xl border border-gray-800 flex items-center justify-between">
              <span className="text-[9px] text-gray-500 uppercase">{campaignRunning ? t('automation.runningStatus') : t('automation.doneStatus')} · {completedCount}/{selectedIds.size}</span>
              <div className="flex gap-3">
                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-[9px] text-gray-400">{passedCount} {t('automation.passedShort')}</span></div>
                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /><span className="text-[9px] text-gray-400">{failedCount} {t('automation.failedShort')}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Report modal */}
      {showReport && campaignResults.length > 0 && (
        <ReportModal results={campaignResults} totalMs={campaignTotalMs} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
};

export default SequenceRunner;
