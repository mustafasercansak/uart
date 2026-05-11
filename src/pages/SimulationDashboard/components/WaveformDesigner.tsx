import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Waves, 
  Pencil, 
  Type, 
  Trash2, 
  Play, 
  Save, 
  Download, 
  Zap,
  Activity,
  Maximize2,
  Minimize2,
  Grid3X3
} from 'lucide-react';
import { useTranslation } from '../../../i18n/context';

import { useSimulation } from '../../../hooks/useSimulation';

interface Point {
  x: number;
  y: number;
}

const WAVEFORM_STORAGE_KEY = 'uart_saved_waveforms';

const FORMULA_SNIPPET_KEYS = [
  { label: 'sin', insert: 'sin(x)', descKey: 'waveformDesigner.snippets.sin' },
  { label: 'cos', insert: 'cos(x)', descKey: 'waveformDesigner.snippets.cos' },
  { label: 'tan', insert: 'tan(x)', descKey: 'waveformDesigner.snippets.tan' },
  { label: 'abs', insert: 'abs(x)', descKey: 'waveformDesigner.snippets.abs' },
  { label: 'sqrt', insert: 'sqrt(x)', descKey: 'waveformDesigner.snippets.sqrt' },
  { label: 'pow', insert: 'pow(x,2)', descKey: 'waveformDesigner.snippets.pow' },
  { label: 'log', insert: 'log(x)', descKey: 'waveformDesigner.snippets.log' },
  { label: 'floor', insert: 'floor(x)', descKey: 'waveformDesigner.snippets.floor' },
  { label: 'PI', insert: 'PI', descKey: 'waveformDesigner.snippets.pi' },
  { label: 'x%1', insert: '(x % 1)', descKey: 'waveformDesigner.snippets.modulo' },
];

const FORMULA_EXAMPLE_KEYS = [
  { formula: 'sin(x)', descKey: 'waveformDesigner.examples.basicSine' },
  { formula: 'abs(sin(x))', descKey: 'waveformDesigner.examples.fullWave' },
  { formula: 'sin(x) * cos(x / 2)', descKey: 'waveformDesigner.examples.modSine' },
  { formula: '(x % (2 * PI)) / (2 * PI)', descKey: 'waveformDesigner.examples.sawtooth' },
  { formula: 'sin(x) > 0 ? 1 : 0', descKey: 'waveformDesigner.examples.square' },
  { formula: 'sin(x) + sin(3*x)/3 + sin(5*x)/5', descKey: 'waveformDesigner.examples.fourier' },
  { formula: 'sin(x * (1 + x / 20))', descKey: 'waveformDesigner.examples.chirp' },
  { formula: 'exp(-x / 10) * sin(x)', descKey: 'waveformDesigner.examples.damped' },
];

export default function WaveformDesigner() {
  const { t } = useTranslation();
  const { setCustomWaveform } = useSimulation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const formulaTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const setPointsRef = useRef(setPoints);
  setPointsRef.current = setPoints;
  const prevSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'formula' | 'preset' | 'saved'>('draw');
  const [formula, setFormula] = useState('sin(x) * 0.5 + 0.5');
  const [resolution, _setResolution] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [savedWaveforms, setSavedWaveforms] = useState<Array<{ name: string; data: number[] }>>(() => {
    try { return JSON.parse(localStorage.getItem(WAVEFORM_STORAGE_KEY) ?? '[]'); } catch { return []; }
  });

  // Canvas drawing logic
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Draw Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let i = 0; i < height; i += 20) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }

    // Draw Waveform
    if (points.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';

      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [points]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const newW = Math.round(entry.contentRect.width);
      const newH = Math.round(entry.contentRect.height);
      if (newW <= 0 || newH <= 0) return;

      const prev = prevSizeRef.current;
      if (prev && (prev.width !== newW || prev.height !== newH)) {
        setPointsRef.current(pts => pts.map(p => ({
          x: (p.x / prev.width) * newW,
          y: (p.y / prev.height) * newH,
        })));
      }

      canvas.width = newW;
      canvas.height = newH;
      prevSizeRef.current = { width: newW, height: newH };
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'draw') return;
    setIsDrawing(true);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPoints([{ x: e.clientX - rect.left, y: e.clientY - rect.top }]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || mode !== 'draw') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const newPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPoints(prev => [...prev, newPoint]);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const insertSnippet = (snippet: string) => {
    const el = formulaTextareaRef.current;
    if (!el) { setFormula(prev => prev + snippet); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newVal = formula.slice(0, start) + snippet + formula.slice(end);
    setFormula(newVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const applyFormula = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;
    const newPoints: Point[] = [];

    try {
      // Expose Math functions so users can write sin(x) instead of Math.sin(x)
      const fn = new Function(
        'x', 'sin', 'cos', 'tan', 'abs', 'sqrt', 'pow', 'floor', 'ceil', 'round', 'log', 'exp', 'PI', 'E', 'min', 'max',
        `return ${formula}`
      );

      const rawValues: number[] = [];
      for (let i = 0; i < resolution; i++) {
        const x = (i / resolution) * 2 * Math.PI * 2; // 0 → 4π (2 cycles)
        const y = fn(
          x,
          Math.sin, Math.cos, Math.tan, Math.abs, Math.sqrt, Math.pow,
          Math.floor, Math.ceil, Math.round, Math.log, Math.exp,
          Math.PI, Math.E, Math.min, Math.max
        );
        rawValues.push(isFinite(y) ? y : 0);
      }

      // Auto-normalize so any formula output fits the canvas
      const minY = Math.min(...rawValues);
      const maxY = Math.max(...rawValues);
      const range = maxY - minY || 1;

      for (let i = 0; i < resolution; i++) {
        const x = (i / resolution) * width;
        const normalized = (rawValues[i] - minY) / range; // 0–1
        const canvasY = height - normalized * height * 0.9 - height * 0.05; // 5% padding
        newPoints.push({ x, y: canvasY });
      }

      setPoints(newPoints);
    } catch (e) {
      console.error('Formula error:', e);
    }
  };

  const handleInject = () => {
    if (points.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const normalized = points.map(p => {
      const val = 1 - (p.y / canvas.height);
      return Math.max(0, Math.min(255, Math.round(val * 255)));
    });

    setCustomWaveform(normalized);
  };

  const applyPreset = (type: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;
    const newPoints: Point[] = [];
    const samples = 200;

    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * width;
      const t = i / samples;
      let y = 0.5; // default center

      switch (type) {
        case 'ecg': {
          const phase = (t * 2) % 1;
          if (phase < 0.1) y = 0.5 - 0.05 * Math.sin(Math.PI * phase / 0.1);
          else if (phase < 0.12) y = 0.5;
          else if (phase < 0.15) y = 0.5 + 0.1 * (phase - 0.12) / 0.03;
          else if (phase < 0.18) y = 0.5 - 0.4 * (phase - 0.15) / 0.03;
          else if (phase < 0.21) y = 0.1 + 0.5 * (phase - 0.18) / 0.03;
          else if (phase < 0.3) y = 0.5;
          else if (phase < 0.45) y = 0.5 - 0.1 * Math.sin(Math.PI * (phase - 0.3) / 0.15);
          else y = 0.5;
          break;
        }
        case 'ppg':
          // Photoplethysmogram (Heart pulse)
          y = 0.5 - (0.2 * Math.sin(Math.PI * t * 4) + 0.1 * Math.sin(Math.PI * t * 8));
          break;
        case 'resp': {
          const rPhase = (t * 2) % 1;
          y = rPhase < 0.3
            ? 0.5 - 0.3 * Math.sin(Math.PI * rPhase / 0.3)
            : 0.5 - 0.3 * Math.exp(-3 * (rPhase - 0.3));
          break;
        }
        case 'square':
          y = (t * 8) % 1 > 0.5 ? 0.2 : 0.8;
          break;
        case 'noise':
          // eslint-disable-next-line react-hooks/purity
          y = 0.3 + Math.random() * 0.4;
          break;
      }
      newPoints.push({ x, y: y * height });
    }
    setPoints(newPoints);
  };

  const getNormalized = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return null;
    return points.map(p => Math.max(0, Math.min(255, Math.round((1 - p.y / canvas.height) * 255))));
  }, [points]);

  const refreshSaved = useCallback(() => {
    try {
      setSavedWaveforms(JSON.parse(localStorage.getItem(WAVEFORM_STORAGE_KEY) ?? '[]'));
    } catch { /* ignore */ }
  }, []);

  const handleSave = () => {
    const normalized = getNormalized();
    if (!normalized) return;
    const name = `waveform_${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    try {
      const existing = JSON.parse(localStorage.getItem(WAVEFORM_STORAGE_KEY) ?? '[]') as Array<{ name: string; data: number[] }>;
      existing.push({ name, data: normalized });
      localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(existing));
      setSaveMsg(t('waveformDesigner.saved'));
      refreshSaved();
    } catch {
      setSaveMsg(t('waveformDesigner.saveError'));
    }
    setTimeout(() => setSaveMsg(null), 2000);
  };

  const handleLoadSaved = (data: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;
    const loaded: Point[] = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: (1 - v / 255) * height,
    }));
    setPoints(loaded);
  };

  const handleDeleteSaved = (index: number) => {
    try {
      const existing = JSON.parse(localStorage.getItem(WAVEFORM_STORAGE_KEY) ?? '[]') as Array<{ name: string; data: number[] }>;
      existing.splice(index, 1);
      localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(existing));
      refreshSaved();
    } catch { /* ignore */ }
  };

  const handleDownload = () => {
    const normalized = getNormalized();
    if (!normalized) return;
    const payload = JSON.stringify({ waveform: normalized, samples: normalized.length, createdAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waveform_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clear = () => {
    setPoints([]);
    setCustomWaveform(null);
  };

  return (
    <div className={`h-full flex flex-col bg-gray-950/20 ${isFullscreen ? 'fixed inset-0 z-[100] bg-gray-950 p-6' : ''}`}>
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/5 backdrop-blur-md rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Waves className="text-emerald-500" size={18} />
          </div>
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-200">{t('waveformDesigner.title')}</h3>
            <p className="text-[9px] text-gray-500 font-mono">{t('waveformDesigner.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-900/50 p-1 rounded-lg border border-white/5">
            <button 
              onClick={() => setMode('draw')}
              className={`p-1.5 rounded-md transition-all ${mode === 'draw' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              title={t('waveformDesigner.freehand')}
            >
              <Pencil size={14} />
            </button>
            <button 
              onClick={() => setMode('formula')}
              className={`p-1.5 rounded-md transition-all ${mode === 'formula' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              title={t('waveformDesigner.formula')}
            >
              <Type size={14} />
            </button>
            <button
              onClick={() => setMode('preset')}
              className={`p-1.5 rounded-md transition-all ${mode === 'preset' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              title={t('waveformDesigner.presets')}
            >
              <Activity size={14} />
            </button>
            <button
              onClick={() => { setMode('saved'); refreshSaved(); }}
              className={`p-1.5 rounded-md transition-all relative ${mode === 'saved' ? 'bg-amber-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              title={t('waveformDesigner.savedWaveforms')}
            >
              <Save size={14} />
              {savedWaveforms.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full text-[7px] flex items-center justify-center text-black font-bold">
                  {savedWaveforms.length}
                </span>
              )}
            </button>
          </div>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button onClick={clear} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-gray-500 hover:text-white transition-colors">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Main Designer Area */}
      <div className="flex-1 min-h-0 flex gap-4 p-4">
        {/* Sidebar Controls */}
        <div className="w-64 flex flex-col gap-4">
          {mode === 'formula' && (
            <div className="glass-panel p-3 rounded-xl border-white/5 space-y-3">
              <label className="text-[9px] font-mono uppercase text-gray-500 tracking-tighter">{t('waveformDesigner.expression')}</label>
              <textarea
                ref={formulaTextareaRef}
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyFormula(); }
                }}
                className="w-full h-20 bg-gray-950 border border-white/5 rounded-lg p-2 font-mono text-[10px] text-blue-400 outline-none focus:border-blue-500/50 resize-none"
                spellCheck={false}
              />

              {/* Function chips */}
              <div>
                <div className="text-[8px] font-mono text-gray-600 uppercase tracking-widest mb-1.5">{t('waveformDesigner.functionChips')}</div>
                <div className="flex flex-wrap gap-1">
                  {FORMULA_SNIPPET_KEYS.map(s => (
                    <button
                      key={s.insert}
                      onClick={() => insertSnippet(s.insert)}
                      title={t(s.descKey)}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-blue-900/50 bg-blue-950/30 text-blue-400 hover:bg-blue-800/40 hover:text-blue-200 transition-all"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick examples */}
              <div>
                <div className="text-[8px] font-mono text-gray-600 uppercase tracking-widest mb-1.5">{t('waveformDesigner.quickFormulas')}</div>
                <div className="space-y-1">
                  {FORMULA_EXAMPLE_KEYS.map(ex => (
                    <button
                      key={ex.formula}
                      onClick={() => { setFormula(ex.formula); setTimeout(applyFormula, 0); }}
                      className="w-full text-left px-2 py-1.5 rounded border border-gray-800/50 bg-gray-900/40 hover:bg-gray-800/60 transition-all group"
                    >
                      <div className="text-[9px] font-mono text-blue-300 group-hover:text-blue-200">{ex.formula}</div>
                      <div className="text-[8px] text-gray-600 group-hover:text-gray-500 mt-0.5">{t(ex.descKey)}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={applyFormula}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
              >
                <Zap size={12} /> {t('dashboard.apply')} <span className="text-blue-300 font-normal normal-case text-[9px]">Ctrl+Enter</span>
              </button>
            </div>
          )}

          {mode === 'draw' && (
            <div className="glass-panel p-3 rounded-xl border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-gray-500 uppercase tracking-tighter">{t('waveformDesigner.smoothing')}</span>
                <span className="text-[9px] font-mono text-emerald-500">85%</span>
              </div>
              <input type="range" className="w-full accent-emerald-500" />
              <div className="p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-[9px] text-gray-400 italic">
                Tip: Click and drag on the canvas to draw your custom signal.
              </div>
            </div>
          )}

          {mode === 'preset' && (
            <div className="glass-panel p-3 rounded-xl border-white/5 space-y-2 overflow-y-auto max-h-[350px] custom-scrollbar">
              <label className="text-[9px] font-mono uppercase text-gray-500 tracking-tighter block mb-2">{t('waveformDesigner.library')}</label>
              
              {[
                { id: 'ecg', name: t('waveformDesigner.presetsList.ecg'), desc: t('waveformDesigner.presetsList.ecgDesc'), icon: <Activity size={12}/>, color: 'text-emerald-400' },
                { id: 'ppg', name: t('waveformDesigner.presetsList.ppg'), desc: t('waveformDesigner.presetsList.ppgDesc'), icon: <Waves size={12}/>, color: 'text-blue-400' },
                { id: 'resp', name: t('waveformDesigner.presetsList.resp'), desc: t('waveformDesigner.presetsList.respDesc'), icon: <Activity size={12}/>, color: 'text-purple-400' },
                { id: 'square', name: t('waveformDesigner.presetsList.square'), desc: t('waveformDesigner.presetsList.squareDesc'), icon: <Grid3X3 size={12}/>, color: 'text-amber-400' },
                { id: 'noise', name: t('waveformDesigner.presetsList.noise'), desc: t('waveformDesigner.presetsList.noiseDesc'), icon: <Waves size={12}/>, color: 'text-red-400' },
              ].map(p => (
                <button 
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className="w-full p-2 bg-gray-900/50 border border-white/5 rounded-lg hover:border-white/20 transition-all text-left group"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={p.color}>{p.icon}</span>
                    <span className="text-[10px] font-bold text-gray-200 group-hover:text-white">{p.name}</span>
                  </div>
                  <div className="text-[8px] text-gray-600 font-mono pl-5">{p.desc}</div>
                </button>
              ))}
            </div>
          )}

          {mode === 'saved' && (
            <div className="glass-panel p-3 rounded-xl border-white/5 space-y-2 overflow-y-auto max-h-[350px] custom-scrollbar">
              <label className="text-[9px] font-mono uppercase text-gray-500 tracking-tighter block mb-2">{t('waveformDesigner.savedWaveforms')}</label>
              {savedWaveforms.length === 0 ? (
                <div className="text-[9px] text-gray-700 italic text-center py-4">{t('waveformDesigner.noSaved')}</div>
              ) : savedWaveforms.map((w, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-900/50 border border-white/5 rounded-lg hover:border-white/20 transition-all group">
                  <button
                    onClick={() => handleLoadSaved(w.data)}
                    className="flex-1 text-left text-[10px] text-gray-300 group-hover:text-white truncate"
                  >
                    <div className="font-mono">{w.name}</div>
                    <div className="text-[8px] text-gray-600">{w.data.length} sample</div>
                  </button>
                  <button
                    onClick={() => handleDeleteSaved(i)}
                    className="text-gray-700 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="glass-panel p-3 rounded-xl border-white/5 space-y-3 mt-auto">
             <button 
               onClick={handleInject}
               disabled={points.length === 0}
               className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-black uppercase rounded-lg transition-all shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2"
             >
                <Play size={14} /> {t('waveformDesigner.inject')}
             </button>
             <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSave}
                  disabled={points.length === 0}
                  className="flex items-center justify-center gap-1.5 py-1.5 bg-gray-900 border border-white/5 rounded-lg text-[9px] text-gray-400 hover:text-white transition-all disabled:opacity-40"
                >
                  <Save size={12} /> {saveMsg ?? t('common.save')}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={points.length === 0}
                  className="flex items-center justify-center gap-1.5 py-1.5 bg-gray-900 border border-white/5 rounded-lg text-[9px] text-gray-400 hover:text-white transition-all disabled:opacity-40"
                >
                  <Download size={12} /> {t('profileEditor.exportJson')}
                </button>
             </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div ref={containerRef} className="flex-1 glass-panel rounded-2xl border-white/5 relative overflow-hidden bg-gray-950/50 group">
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
            <Grid3X3 size={12} className="text-gray-600" />
            <span className="text-[9px] font-mono text-gray-600 uppercase tracking-tighter">Resolution: {points.length} samples</span>
          </div>

          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`block w-full h-full cursor-crosshair ${mode === 'draw' ? 'touch-none' : ''}`}
          />

          {points.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
               <Waves className="text-gray-800 mb-2 animate-pulse" size={48} />
               <p className="text-gray-700 font-mono text-[10px] uppercase tracking-widest">{t('waveformDesigner.empty')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
