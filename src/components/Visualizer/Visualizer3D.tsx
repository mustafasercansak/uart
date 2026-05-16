import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GeneratedFrame } from '../../types';
import { useTranslation } from '../../i18n/context';

interface Visualizer3DProps {
  lastFrame: GeneratedFrame | null;
}

// ─── Color maps (Tailwind static classes) ────────────────────────────────────

const COLOR = {
  emerald: {
    text: 'text-emerald-400',
    border: 'border-emerald-500',
    bg: 'bg-emerald-500',
    glow: 'shadow-[0_0_18px_#10b981]',
    hex: '#10b981',
    dimHex: '#064e3b',
  },
  cyan: {
    text: 'text-cyan-400',
    border: 'border-cyan-500',
    bg: 'bg-cyan-500',
    glow: 'shadow-[0_0_18px_#06b6d4]',
    hex: '#06b6d4',
    dimHex: '#164e63',
  },
  amber: {
    text: 'text-amber-400',
    border: 'border-amber-500',
    bg: 'bg-amber-500',
    hex: '#f59e0b',
    dimHex: '#78350f',
  },
  purple: {
    text: 'text-purple-400',
    border: 'border-purple-500',
    bg: 'bg-purple-500',
    hex: '#a855f7',
    dimHex: '#3b0764',
  },
} as const;

type ColorKey = keyof typeof COLOR;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface VitalCardProps {
  label: string;
  value: number;
  unit: string;
  color: ColorKey;
  isAlarm: boolean;
  sparkRef: React.RefObject<HTMLCanvasElement | null>;
  /** absolute min/max for the range bar scale */
  min: number;
  max: number;
  /** alarm thresholds */
  loLimit: number;
  hiLimit: number;
  /** normal highlight band */
  normalLo: number;
  normalHi: number;
  tick: number;
}

function VitalCard({ label, value, unit, color, isAlarm, sparkRef, min, max, loLimit, hiLimit, normalLo, normalHi, tick }: VitalCardProps) {
  const c = COLOR[color];
  const alarmFlash = isAlarm && tick % 2 === 0;

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-black/70 backdrop-blur-2xl shadow-2xl w-72 transition-all duration-300 ${
      isAlarm
        ? alarmFlash
          ? 'border-rose-500/70 shadow-[0_0_24px_rgba(239,68,68,0.35)]'
          : 'border-rose-700/40'
        : `${c.border}/30`
    }`}>
      {/* Colored left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isAlarm ? 'bg-rose-500' : c.bg} transition-colors duration-300`} />

      {/* Card header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1 pl-4">
        <span className={`text-[10px] font-black uppercase tracking-[0.35em] ${isAlarm ? 'text-rose-400' : c.text}`}>
          {label}
        </span>
        {/* Alarm pip */}
        {isAlarm && (
          <div className={`flex items-center gap-1.5 ${alarmFlash ? 'opacity-100' : 'opacity-40'} transition-opacity duration-300`}>
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span className="text-[9px] text-rose-400 font-black tracking-widest uppercase">!</span>
          </div>
        )}
      </div>

      {/* Main value row */}
      <div className="flex items-end justify-between px-5 pb-2 pl-4">
        <div className="flex items-baseline gap-2">
          <span className={`text-6xl font-black tabular-nums tracking-tighter leading-none ${isAlarm ? 'text-rose-400' : c.text}`}>
            {value || '--'}
          </span>
          <span className="text-[11px] font-bold text-gray-600 uppercase mb-1">{unit}</span>
        </div>
        {/* Sparkline */}
        <div className="w-20 h-10 rounded-lg p-1.5 bg-black/50 border border-white/5">
          <canvas ref={sparkRef} width={64} height={28} className="w-full h-full" />
        </div>
      </div>

      {/* Range bar */}
      <div className="px-5 pb-3 pl-4">
        <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
          {/* Normal range highlight */}
          <div
            className="absolute h-full rounded-full opacity-25"
            style={{
              left: `${pct(normalLo)}%`,
              width: `${pct(normalHi) - pct(normalLo)}%`,
              backgroundColor: isAlarm ? '#ef4444' : c.hex,
            }}
          />
          {/* Low alarm limit tick */}
          <div
            className="absolute w-px h-full bg-rose-500/50"
            style={{ left: `${pct(loLimit)}%` }}
          />
          {/* High alarm limit tick */}
          {hiLimit < max && (
            <div
              className="absolute w-px h-full bg-rose-500/50"
              style={{ left: `${pct(hiLimit)}%` }}
            />
          )}
          {/* Current value marker */}
          {value > 0 && (
            <div
              className={`absolute w-1.5 h-full rounded-full transition-all duration-500 ${isAlarm ? 'bg-rose-400' : c.bg}`}
              style={{ left: `calc(${pct(value)}% - 3px)` }}
            />
          )}
        </div>
        {/* Limit labels */}
        <div className="flex justify-between mt-1">
          <span className="text-[8px] text-gray-700 font-mono">{loLimit}</span>
          <span className="text-[8px] text-gray-700 font-mono">{hiLimit}</span>
        </div>
      </div>
    </div>
  );
}

interface SecondaryVitalProps {
  label: string;
  value: number | string | null;
  unit: string;
  color: ColorKey;
}

function SecondaryVital({ label, value, unit, color }: SecondaryVitalProps) {
  const c = COLOR[color];
  return (
    <div className={`flex-1 rounded-xl border ${c.border}/20 bg-black/60 backdrop-blur-xl px-4 py-3 shadow-lg`}>
      <div className={`text-[9px] font-black uppercase tracking-[0.35em] ${c.text} opacity-70 mb-1`}>{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-black tabular-nums ${c.text}`}>{value ?? '--'}</span>
        <span className="text-[9px] text-gray-600 font-mono uppercase">{unit}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Visualizer3D({ lastFrame }: Visualizer3DProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const ecgSparkRef = useRef<HTMLCanvasElement>(null);
  const spo2SparkRef = useRef<HTMLCanvasElement>(null);
  const diagScopeRef = useRef<HTMLCanvasElement>(null);

  const [isBooting, setIsBooting] = useState(true);
  const [tick, setTick] = useState(0);

  const hudData = useMemo(() => {
    if (!lastFrame) return { frameId: 0, bpm: 0, spo2: 0, resp: 0, temp: 0 };
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const findF = (key: string) => lastFrame.fields.find(f => norm(f.name) === norm(key));
    return {
      frameId: lastFrame.frameNumber,
      bpm:  findF('bpm')?.decimal  ?? findF('hr')?.decimal          ?? findF('heartrate')?.decimal   ?? 0,
      spo2: findF('spo2')?.decimal ?? findF('oxygen')?.decimal      ?? 0,
      resp: findF('rr')?.decimal   ?? findF('resp')?.decimal        ?? 0,
      temp: findF('temp')?.decimal ?? findF('temperature')?.decimal ?? 0,
    };
  }, [lastFrame]);

  const alarmBpm  = hudData.bpm  > 0 && (hudData.bpm < 45 || hudData.bpm > 140);
  const alarmSpo2 = hudData.spo2 > 0 && hudData.spo2 < 90;
  const isAlarm   = alarmBpm || alarmSpo2;

  const alarmLabels: string[] = [];
  if (alarmBpm)  alarmLabels.push(hudData.bpm < 45 ? t('visualizer.alarmBrady') : t('visualizer.alarmTachy'));
  if (alarmSpo2) alarmLabels.push(t('visualizer.alarmHypox'));

  const isAlarmRef = useRef(isAlarm);
  useEffect(() => { isAlarmRef.current = isAlarm; }, [isAlarm]);

  // Alarm flash ticker
  useEffect(() => {
    if (!isAlarm) return;
    const id = setInterval(() => setTick(n => n + 1), 750);
    return () => clearInterval(id);
  }, [isAlarm]);

  const dataRef = useRef({
    bpm: 0, spo2: 0, resp: 0, temp: 0, frameId: 0, pulsePhase: 0,
    history: { ecg: new Array(150).fill(2048), spo2: new Array(150).fill(128) },
  });

  const sceneRef = useRef<{
    scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
    monitorGroup: THREE.Group; texture: THREE.CanvasTexture; screenLight: THREE.PointLight;
    screenMesh: THREE.Mesh; frameId: number; clock: THREE.Clock;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020305);
    scene.fog = new THREE.Fog(0x020305, 5, 25);

    const camera = new THREE.PerspectiveCamera(35, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 12);
    camera.lookAt(0, 1.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);

    const clock = new THREE.Clock();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(10, 20, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 1.5);
    backLight.position.set(-10, 10, -5);
    scene.add(backLight);
    const screenLight = new THREE.PointLight(0x06b6d4, 3, 15);
    screenLight.position.set(0, 1.8, 1);
    scene.add(screenLight);

    // Monitor model
    const monitorGroup = new THREE.Group();
    const pearlWhite  = new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, metalness: 0.1, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1, reflectivity: 1.0 });
    const brushedSteel = new THREE.MeshPhysicalMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.3 });
    const darkSlate    = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, metalness: 0.4, roughness: 0.5 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 0.8), pearlWhite);
    chassis.position.y = 1.6; chassis.castShadow = true;
    monitorGroup.add(chassis);

    const bezel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.4, 0.1), darkSlate);
    bezel.position.set(0, 1.6, 0.4);
    monitorGroup.add(bezel);

    const stripL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.4, 0.82), brushedSteel);
    stripL.position.set(-2.03, 1.6, 0);
    monitorGroup.add(stripL);
    const stripR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.4, 0.82), brushedSteel);
    stripR.position.set(2.03, 1.6, 0);
    monitorGroup.add(stripR);

    // Screen canvas (1024×1024, two channels top/bottom)
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const texture = new THREE.CanvasTexture(canvas);

    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 3.2), new THREE.MeshBasicMaterial({ map: texture }));
    screenMesh.position.set(0, 1.6, 0.46);
    monitorGroup.add(screenMesh);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 16, 24, Math.PI), pearlWhite);
    handle.position.set(0, 3.1, 0);
    monitorGroup.add(handle);

    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.5, 32), brushedSteel);
    stand.position.y = 0.25;
    monitorGroup.add(stand);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.1, 32), pearlWhite);
    base.receiveShadow = true;
    monitorGroup.add(base);

    scene.add(monitorGroup);

    // Environment
    const grid = new THREE.GridHelper(50, 50, 0x06b6d4, 0x011111);
    grid.position.y = -0.05;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.08;
    scene.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x020406, roughness: 0.1, metalness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    scene.add(floor);

    sceneRef.current = { scene, camera, renderer, monitorGroup, texture, screenLight, screenMesh, frameId: 0, clock };

    const drawWaveChannel = (
      data: number[], color: string, glowColor: string,
      yBase: number, amplitude: number, normalize: (v: number) => number
    ) => {
      ctx.shadowBlur = 18; ctx.shadowColor = glowColor;
      ctx.strokeStyle = color; ctx.lineWidth = 7;
      ctx.beginPath();
      const w = 768 / data.length; // use left 75% for waveform
      for (let i = 0; i < data.length; i++) {
        const px = 12 + i * w;
        const py = yBase - normalize(data[i]) * amplitude;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const drawSpark = (
      canvasRef: React.RefObject<HTMLCanvasElement | null>,
      data: number[], color: string,
      normalize: (v: number) => number
    ) => {
      const sc = canvasRef.current; if (!sc) return;
      const sctx = sc.getContext('2d'); if (!sctx) return;
      sctx.clearRect(0, 0, sc.width, sc.height);
      sctx.shadowBlur = 6; sctx.shadowColor = color;
      sctx.strokeStyle = color; sctx.lineWidth = 2.5; sctx.beginPath();
      const sw = sc.width / data.length;
      for (let i = 0; i < data.length; i++) {
        const sx = i * sw;
        const sy = sc.height - normalize(data[i]) * sc.height * 0.75 - 3;
        if (i === 0) sctx.moveTo(sx, sy); else sctx.lineTo(sx, sy);
      }
      sctx.stroke();
      sctx.shadowBlur = 0;
    };

    const animate = () => {
      const frameId = requestAnimationFrame(animate);
      if (!sceneRef.current || !ctx) return;

      const { texture, clock, monitorGroup, screenLight } = sceneRef.current;
      const d = dataRef.current;
      const dt = clock.getDelta();
      const alarm = isAlarmRef.current;
      const time = Date.now() * 0.001;

      d.pulsePhase += dt * (d.bpm / 60) * Math.PI * 2;
      const beat = Math.max(0, Math.sin(d.pulsePhase));

      // ── 3D Screen: background ──
      ctx.fillStyle = '#020a14';
      ctx.fillRect(0, 0, 1024, 1024);

      // ── ECG paper grid ──
      // Minor gridlines
      ctx.strokeStyle = '#0a2540'; ctx.lineWidth = 1;
      for (let j = 0; j < 1024; j += 20) {
        ctx.beginPath(); ctx.moveTo(j, 0); ctx.lineTo(j, 1024); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(1024, j); ctx.stroke();
      }
      // Major gridlines (every 5 minor = 100px)
      ctx.strokeStyle = '#0e3558'; ctx.lineWidth = 1.5;
      for (let j = 0; j < 1024; j += 100) {
        ctx.beginPath(); ctx.moveTo(j, 0); ctx.lineTo(j, 1024); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(1024, j); ctx.stroke();
      }

      // ── Header bar ──
      const alarmFlash3D = alarm && Math.floor(time * 1.3) % 2 === 0;
      ctx.fillStyle = alarmFlash3D ? '#3b0a0a' : '#040f1a';
      ctx.fillRect(0, 0, 1024, 72);
      ctx.strokeStyle = alarm ? '#ef4444' : '#06b6d4';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 72); ctx.lineTo(1024, 72); ctx.stroke();

      // Header text
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = 'bold 26px monospace';
      ctx.fillText('BED 402-A', 28, 46);

      if (alarm) {
        ctx.fillStyle = alarmFlash3D ? '#ef4444' : '#991b1b';
        ctx.font = 'bold 28px monospace';
        ctx.fillText('!! ALARM !!', 380, 46);
      } else {
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 26px monospace';
        ctx.fillText('STABLE', 420, 46);
      }

      // Frame counter top right
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '20px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`#${d.frameId}`, 1010, 46);
      ctx.textAlign = 'left';

      // ── Channel divider ──
      ctx.strokeStyle = '#0e3558'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 536); ctx.lineTo(1024, 536); ctx.stroke();

      // ── Vertical separator between waveform and numerics ──
      ctx.beginPath(); ctx.moveTo(780, 72); ctx.lineTo(780, 1024); ctx.stroke();

      // ── ECG channel label ──
      ctx.fillStyle = '#10b981'; ctx.font = 'bold 22px monospace';
      ctx.fillText('ECG', 24, 108);
      ctx.fillStyle = '#064e3b'; ctx.font = '18px monospace';
      ctx.fillText('I', 80, 108);

      // ── SpO2 channel label ──
      ctx.fillStyle = '#06b6d4'; ctx.font = 'bold 22px monospace';
      ctx.fillText('SpO2', 24, 572);

      // ── Waveforms ──
      drawWaveChannel(d.history.ecg, '#10b981', '#10b981', 330, 180, v => v / 4096);
      drawWaveChannel(d.history.spo2, '#06b6d4', '#06b6d4', 800, 140, v => 1.0 - v / 255);

      // ── Numeric overlays (right panel) ──
      // HR
      ctx.fillStyle = alarm && d.bpm > 0 && (d.bpm < 45 || d.bpm > 140)
        ? (alarmFlash3D ? '#ef4444' : '#991b1b')
        : '#10b981';
      ctx.font = 'bold 160px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${d.bpm || '--'}`, 902, 340);
      ctx.fillStyle = '#10b981'; ctx.font = 'bold 32px monospace';
      ctx.fillText('BPM', 902, 390);

      // SpO2
      ctx.fillStyle = alarm && d.spo2 > 0 && d.spo2 < 90
        ? (alarmFlash3D ? '#ef4444' : '#991b1b')
        : '#06b6d4';
      ctx.font = 'bold 160px monospace';
      ctx.fillText(`${d.spo2 || '--'}`, 902, 800);
      ctx.fillStyle = '#06b6d4'; ctx.font = 'bold 32px monospace';
      ctx.fillText('%', 902, 850);

      ctx.textAlign = 'left';
      texture.needsUpdate = true;

      // ── HUD sparklines ──
      const sparkPoints = 80;
      drawSpark(ecgSparkRef,  d.history.ecg.slice(-sparkPoints),  '#10b981', v => v / 4096);
      drawSpark(spo2SparkRef, d.history.spo2.slice(-sparkPoints), '#06b6d4', v => 1.0 - v / 255);
      drawSpark(diagScopeRef, d.history.ecg.slice(-120),          '#0ea5e9', v => v / 4096);

      // ── 3D dynamics ──
      monitorGroup.position.y = Math.sin(time * 0.4) * 0.04;
      monitorGroup.rotation.y = Math.sin(time * 0.1) * 0.02;
      screenLight.intensity = 2 + beat * 1.5;
      screenLight.color.setHex(alarm ? 0xef4444 : 0x06b6d4);

      renderer.render(scene, camera);
      sceneRef.current.frameId = frameId;
    };
    animate();

    return () => {
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.frameId);
        renderer.dispose();
      }
    };
  }, []);

  // Data sync
  useEffect(() => {
    if (!lastFrame) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const findF = (key: string) => lastFrame.fields.find(f => norm(f.name) === norm(key));
    const ecg  = findF('leadi')?.decimal  ?? findF('ecg')?.decimal      ?? findF('ecgwave')?.decimal ?? 2048;
    const pleth = findF('spo2wave')?.decimal ?? findF('pleth')?.decimal  ?? findF('ppg')?.decimal     ?? 128;
    dataRef.current.bpm     = findF('bpm')?.decimal  ?? findF('hr')?.decimal          ?? findF('heartrate')?.decimal   ?? 0;
    dataRef.current.spo2    = findF('spo2')?.decimal ?? findF('oxygen')?.decimal      ?? 0;
    dataRef.current.resp    = findF('rr')?.decimal   ?? findF('resp')?.decimal        ?? 0;
    dataRef.current.temp    = findF('temp')?.decimal ?? findF('temperature')?.decimal ?? 0;
    dataRef.current.frameId = lastFrame.frameNumber;
    dataRef.current.history.ecg.push(ecg);
    if (dataRef.current.history.ecg.length > 200) dataRef.current.history.ecg.shift();
    dataRef.current.history.spo2.push(pleth);
    if (dataRef.current.history.spo2.length > 200) dataRef.current.history.spo2.shift();
  }, [lastFrame]);

  const alarmFlash = isAlarm && tick % 2 === 0;

  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-950 font-mono">
      {/* 3D scene layer */}
      <div ref={containerRef} className="w-full h-full" />

      {/* HUD overlay */}
      <div className="absolute inset-0 pointer-events-none">

        {/* Boot screen */}
        {isBooting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/98 z-50">
            <div className="text-cyan-400 font-black tracking-[0.8em] text-xl animate-pulse">{t('visualizer.booting')}</div>
            <div className="w-64 h-1 bg-white/5 mt-8 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 animate-progress origin-left" />
            </div>
          </div>
        )}

        {/* Vignette + alarm frame */}
        <div className={`absolute inset-0 transition-all duration-300 pointer-events-none ${
          isAlarm
            ? alarmFlash
              ? 'shadow-[inset_0_0_140px_rgba(239,68,68,0.28)] ring-2 ring-inset ring-rose-600/50'
              : 'shadow-[inset_0_0_100px_rgba(239,68,68,0.15)] ring-1 ring-inset ring-rose-700/30'
            : 'shadow-[inset_0_0_80px_rgba(0,0,0,0.5)]'
        }`} />

        <div className="absolute inset-0 flex flex-col px-8 pt-6 pb-8 gap-0">

          {/* ── TOP BAR ── */}
          <div className="flex items-start justify-between">

            {/* Left: identity */}
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-sm mt-0.5 flex-shrink-0 transition-all duration-300 ${
                isAlarm
                  ? alarmFlash ? 'bg-rose-500 shadow-[0_0_12px_#ef4444]' : 'bg-rose-800'
                  : 'bg-emerald-500 shadow-[0_0_12px_#10b981]'
              }`} />
              <div>
                <div className="text-white font-black text-xl tracking-widest uppercase leading-tight">
                  {t('visualizer.monitorName')}
                </div>
                <div className="text-[10px] text-gray-600 uppercase tracking-[0.35em] mt-0.5">
                  {t('visualizer.institution')} · {t('visualizer.bed')}
                </div>
              </div>
            </div>

            {/* Center: alarm banner */}
            <div className="flex-1 flex justify-center mx-6">
              {isAlarm ? (
                <div className={`flex items-center gap-3 px-5 py-2 rounded-full border transition-all duration-300 ${
                  alarmFlash
                    ? 'bg-rose-600/20 border-rose-500/70 shadow-[0_0_24px_rgba(239,68,68,0.4)]'
                    : 'bg-rose-900/20 border-rose-700/40'
                }`}>
                  <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${alarmFlash ? 'bg-rose-400' : 'bg-rose-800'}`} />
                  <span className={`font-black text-sm tracking-[0.4em] uppercase transition-colors duration-300 ${alarmFlash ? 'text-rose-400' : 'text-rose-700'}`}>
                    {t('visualizer.alarm')}
                  </span>
                  <span className="text-rose-600/50 text-xs">—</span>
                  <span className={`font-semibold text-xs tracking-wider transition-colors duration-300 ${alarmFlash ? 'text-rose-300' : 'text-rose-700'}`}>
                    {alarmLabels.join(' · ')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-5 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                  <span className="text-emerald-400 font-bold text-xs tracking-[0.3em] uppercase">
                    {t('visualizer.allNormal')}
                  </span>
                </div>
              )}
            </div>

            {/* Right: clock + link badge */}
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-white font-black text-2xl tracking-tight tabular-nums">
                {new Date().toLocaleTimeString()}
              </span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest px-3 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/5">
                {t('visualizer.linkStatus')}
              </span>
            </div>
          </div>

          {/* ── MIDDLE (3D shows through) ── */}
          <div className="flex-1" />

          {/* ── BOTTOM: diagnostics left + vitals right ── */}
          <div className="flex items-end justify-between gap-6">

            {/* DIAGNOSTICS PANEL */}
            <div className="rounded-2xl border border-cyan-500/15 bg-black/70 backdrop-blur-2xl shadow-2xl overflow-hidden min-w-[360px] animate-in fade-in slide-in-from-left duration-700">
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  <span className="text-[10px] font-black text-cyan-500 tracking-[0.35em] uppercase">
                    {t('visualizer.analytics')}
                  </span>
                </div>
                <span className="text-[9px] text-gray-600 font-mono tracking-widest">{t('visualizer.sampling')}</span>
              </div>

              {/* Scope */}
              <div className="px-4 pt-3 pb-2">
                <div className="relative h-[60px] rounded-xl bg-black/80 border border-white/5 overflow-hidden">
                  <canvas ref={diagScopeRef} width={340} height={60} className="w-full h-full" />
                  <div className="absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/60 to-transparent pointer-events-none" />
                  <div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/60 to-transparent pointer-events-none" />
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 mx-4 mb-4 rounded-xl overflow-hidden border border-white/5">
                {([
                  { label: t('visualizer.packetId'),    value: `#${hudData.frameId}`, cls: 'text-white' },
                  { label: t('visualizer.consistency'), value: t('visualizer.fixed'), cls: 'text-emerald-400' },
                  { label: t('visualizer.throughput'),  value: '3.4 KB/s',            cls: 'text-cyan-400' },
                  { label: t('visualizer.jitter'),      value: '0.02ms',              cls: 'text-emerald-400' },
                ] as const).map((item, i) => (
                  <div key={i} className="bg-black/60 px-4 py-2.5 flex justify-between items-center border-b border-r border-white/5 last:border-r-0">
                    <span className="text-[9px] text-gray-600 uppercase font-mono tracking-wider">{item.label}</span>
                    <span className={`text-[10px] font-black ${item.cls}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* VITALS CLUSTER */}
            <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-right duration-700">

              <VitalCard
                label={t('visualizer.hr')}
                value={hudData.bpm}
                unit={t('visualizer.hrUnit')}
                color="emerald"
                isAlarm={alarmBpm}
                sparkRef={ecgSparkRef}
                min={30} max={200}
                loLimit={45} hiLimit={140}
                normalLo={60} normalHi={100}
                tick={tick}
              />

              <VitalCard
                label={t('visualizer.spo2')}
                value={hudData.spo2}
                unit="%"
                color="cyan"
                isAlarm={alarmSpo2}
                sparkRef={spo2SparkRef}
                min={80} max={100}
                loLimit={90} hiLimit={100}
                normalLo={95} normalHi={100}
                tick={tick}
              />

              <div className="flex gap-3">
                <SecondaryVital label={t('visualizer.rr')}   value={hudData.resp}                                 unit={t('visualizer.rrUnit')} color="amber"  />
                <SecondaryVital label={t('visualizer.temp')} value={hudData.temp ? (hudData.temp / 10).toFixed(1) : null} unit="°C"                   color="purple" />
              </div>
            </div>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes progress { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
        .animate-progress { animation: progress 1.1s ease-out forwards; }
      `}</style>
    </div>
  );
}
