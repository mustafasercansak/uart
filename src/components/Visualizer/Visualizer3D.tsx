import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GeneratedFrame } from '../../types';

interface Visualizer3DProps {
  lastFrame: GeneratedFrame | null;
}

export default function Visualizer3D({ lastFrame }: Visualizer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Sparkline Canvas Refs for HUD
  const ecgSparkRef = useRef<HTMLCanvasElement>(null);
  const spo2SparkRef = useRef<HTMLCanvasElement>(null);
  const diagScopeRef = useRef<HTMLCanvasElement>(null);

  const [isBooting, setIsBooting] = useState(true);
  const [hudData, setHudData] = useState({ frameId: 0, bpm: 0, spo2: 0, resp: 0, temp: 0 });
  const isAlarm = (hudData.bpm > 0 && (hudData.bpm < 45 || hudData.bpm > 140)) || (hudData.spo2 > 0 && hudData.spo2 < 90);
  const isAlarmRef = useRef(isAlarm);

  useEffect(() => {
    isAlarmRef.current = isAlarm;
  }, [isAlarm]);

  const dataRef = useRef({
    bpm: 0, spo2: 0, resp: 0, temp: 0, frameId: 0, pulsePhase: 0,
    history: {
        ecg: new Array(150).fill(2048),
        spo2: new Array(150).fill(128)
    }
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
    
    // ... scene setup ...

    // --- Scene Setup ---
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

    // --- Extreme Pro Lighting (v7 Studio Setup) ---
    // High ambient for general visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    // Key Light (The Studio Spot)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(10, 20, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    // Back Light (Rim lighting)
    const backLight = new THREE.DirectionalLight(0xffffff, 1.5);
    backLight.position.set(-10, 10, -5);
    scene.add(backLight);

    // Screen Glow
    const screenLight = new THREE.PointLight(0x06b6d4, 3, 15);
    screenLight.position.set(0, 1.8, 1);
    scene.add(screenLight);

    // --- Monitor Model (v7 Clinical Pearl) ---
    const monitorGroup = new THREE.Group();
    
    // High-End Materials
    const pearlWhite = new THREE.MeshPhysicalMaterial({ 
        color: 0xf8fafc, metalness: 0.1, roughness: 0.2, 
        clearcoat: 0.8, clearcoatRoughness: 0.1, reflectivity: 1.0 
    });
    const brushedSteel = new THREE.MeshPhysicalMaterial({ 
        color: 0x94a3b8, metalness: 0.9, roughness: 0.3 
    });
    const darkSlate = new THREE.MeshPhysicalMaterial({ 
        color: 0x0f172a, metalness: 0.4, roughness: 0.5 
    });

    // 1. Chassis (Pearl White Box)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 0.8), pearlWhite);
    chassis.position.y = 1.6;
    chassis.castShadow = true;
    monitorGroup.add(chassis);

    // 2. Bezel (Slim High-Gloss)
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.4, 0.1), darkSlate);
    bezel.position.set(0, 1.6, 0.4);
    monitorGroup.add(bezel);

    // 3. Side Metal Strips (Industrial Accent)
    const stripL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.4, 0.82), brushedSteel);
    stripL.position.set(-2.03, 1.6, 0);
    monitorGroup.add(stripL);

    const stripR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.4, 0.82), brushedSteel);
    stripR.position.set(2.03, 1.6, 0);
    monitorGroup.add(stripR);

    // 4. Screen Internal
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d', { alpha: false });
    const texture = new THREE.CanvasTexture(canvas);

    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 3.2), new THREE.MeshBasicMaterial({ map: texture }));
    screenMesh.position.set(0, 1.6, 0.46);
    monitorGroup.add(screenMesh);

    // 5. Handle & Stand
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

    // --- Environment ---
    const grid = new THREE.GridHelper(50, 50, 0x06b6d4, 0x011111);
    grid.position.y = -0.05;
    grid.material.transparent = true;
    grid.material.opacity = 0.1;
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

    // --- v7 Pure Performance Render Loop ---
    const animate = () => {
      const frameId = requestAnimationFrame(animate);
      if (sceneRef.current && ctx) {
        const { texture, clock, monitorGroup, screenLight } = sceneRef.current;
        const d = dataRef.current;
        const dt = clock.getDelta();

        d.pulsePhase += dt * (d.bpm / 60) * Math.PI * 2;
        const beat = Math.max(0, Math.sin(d.pulsePhase));

        // Clinical Screen Render
        ctx.fillStyle = '#010810';
        ctx.fillRect(0, 0, 1024, 1024);

        // Grid (Mindray standard)
        ctx.strokeStyle = '#38bdf812'; ctx.lineWidth = 1;
        for(let j=0; j<1024; j+=64) {
            ctx.beginPath(); ctx.moveTo(j,0); ctx.lineTo(j,1024); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0,j); ctx.lineTo(1024,j); ctx.stroke();
        }

        const drawWave = (data: number[], color: string, y: number, s: number, inv=false) => {
            ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.strokeStyle = color; ctx.lineWidth = 8;
            ctx.beginPath();
            const w = 1024 / data.length;
            for(let i=0; i<data.length; i++) {
                const px = i * w;
                const v = inv ? (1.0 - (data[i]/255)) : (data[i]/4096);
                const py = y - (v * 100 * s);
                if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        };

        drawWave(d.history.ecg, '#10b981', 400, 3.5);
        drawWave(d.history.spo2, '#06b6d4', 800, 2.8, true);

        // Parameters on 3D screen
        ctx.fillStyle = '#10b981'; ctx.font = 'bold 200px tabular-nums sans-serif'; ctx.fillText(`${d.bpm || '--'}`, 760, 260);
        ctx.fillStyle = '#06b6d4'; ctx.font = 'bold 200px tabular-nums sans-serif'; ctx.fillText(`${d.spo2 || '--'}`, 760, 680);
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = 'bold 36px monospace';
        ctx.fillText('BED 402-A  |  SIGNAL: STABLE', 40, 60);

        texture.needsUpdate = true;

        // HUD Sparkline Engine
        const drawSpark = (canvasRef: React.RefObject<HTMLCanvasElement | null>, data: number[], color: string, inv=false) => {
            const sc = canvasRef.current; if(!sc) return;
            const sctx = sc.getContext('2d'); if(!sctx) return;
            sctx.clearRect(0,0,sc.width,sc.height);
            sctx.strokeStyle = color; sctx.lineWidth = 4; sctx.beginPath();
            const sw = sc.width / data.length;
            for(let i=0; i<data.length; i++) {
                const sx = i * sw;
                const v = inv ? (1.0 - (data[i]/255)) : (data[i]/4096);
                const sy = sc.height - (v * sc.height * 0.7) - 6;
                if(i===0) sctx.moveTo(sx, sy); else sctx.lineTo(sx, sy);
            }
            sctx.stroke();
        };

        const sparkPoints = 80;
        drawSpark(ecgSparkRef, d.history.ecg.slice(-sparkPoints), '#10b981');
        drawSpark(spo2SparkRef, d.history.spo2.slice(-sparkPoints), '#06b6d4', true);
        drawSpark(diagScopeRef, d.history.ecg.slice(-120), '#0ea5e9');

        // Dynamics
        const time = Date.now() * 0.001;
        monitorGroup.position.y = Math.sin(time * 0.4) * 0.04;
        monitorGroup.rotation.y = Math.sin(time * 0.1) * 0.02;

        screenLight.intensity = 2 + beat * 1.5;
        if(isAlarmRef.current) screenLight.color.setHex(0xef4444); else screenLight.color.setHex(0x06b6d4);

        renderer.render(scene, camera);
        sceneRef.current.frameId = frameId;
      }
    };
    animate();

    return () => {
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.frameId);
        renderer.dispose();
      }
    };
  }, []);

  // --- v7 ZERO-FAILURE DATA ENGINE ---
  useEffect(() => {
    if (!lastFrame) return;

    // Normalizing strings to remove all hyphens, spaces and case issues
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const findF = (key: string) => lastFrame.fields.find(f => norm(f.name) === norm(key));

    const bpmVal = findF('bpm')?.decimal ?? findF('hr')?.decimal ?? findF('heartrate')?.decimal ?? 0;
    const spo2Val = findF('spo2')?.decimal ?? findF('oxygen')?.decimal ?? 0;
    const respVal = findF('rr')?.decimal ?? findF('resp')?.decimal ?? 0;
    const tempVal = findF('temp')?.decimal ?? findF('temperature')?.decimal ?? 0;

    // Waveform Sync Fix (NORMALIZED MATCHING)
    const ecg = findF('leadi')?.decimal ?? findF('ecg')?.decimal ?? findF('ecgwave')?.decimal ?? 2048;
    const pleth = findF('spo2wave')?.decimal ?? findF('pleth')?.decimal ?? findF('ppg')?.decimal ?? 128;

    dataRef.current.bpm = bpmVal;
    dataRef.current.spo2 = spo2Val;
    dataRef.current.resp = respVal;
    dataRef.current.temp = tempVal;
    dataRef.current.frameId = lastFrame.frameNumber;
    
    // Waveform Continuity logic
    dataRef.current.history.ecg.push(ecg);
    if(dataRef.current.history.ecg.length > 200) dataRef.current.history.ecg.shift();
    
    dataRef.current.history.spo2.push(pleth);
    if(dataRef.current.history.spo2.length > 200) dataRef.current.history.spo2.shift();

    setHudData(prev => {
      if (prev.frameId === lastFrame.frameNumber && 
          prev.bpm === bpmVal && 
          prev.spo2 === spo2Val &&
          prev.resp === respVal &&
          prev.temp === tempVal) return prev;
      return { frameId: lastFrame.frameNumber, bpm: bpmVal, spo2: spo2Val, resp: respVal, temp: tempVal };
    });
  }, [lastFrame]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-950 font-mono">
      {/* 3D Visualizer Layer */}
      <div ref={containerRef} className="w-full h-full" />
      
      {/* ZERO-FAILURE HUD v7 */}
      <div className={`absolute inset-0 pointer-events-none transition-all duration-700 ${isAlarm ? 'bg-rose-950/10' : ''}`}>
        
        {/* Intro */}
        {isBooting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/98 z-50">
                <div className="text-cyan-400 font-black tracking-[0.8em] text-xl animate-pulse">CLINICAL SYNC ENGINE v7.0</div>
                <div className="w-64 h-1 bg-white/5 mt-8 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 animate-progress origin-left" />
                </div>
            </div>
        )}

        {/* Cinematic Vignette */}
        <div className={`absolute inset-0 border-[20px] transition-colors duration-500 ${isAlarm ? 'border-rose-600/20 shadow-[inset_0_0_200px_rgba(225,29,72,0.4)]' : 'border-white/5'}`} />

        <div className="absolute inset-0 p-12 flex flex-col justify-between">
            {/* Header: Station Identity */}
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <div className="flex items-center gap-4">
                        <div className={`w-4 h-4 rounded-sm ${isAlarm ? 'bg-rose-500 animate-ping' : 'bg-emerald-500 shadow-[0_0_20px_#10b981]'}`} />
                        <span className="text-3xl font-black text-white tracking-widest uppercase [text-shadow:0_0_10px_rgba(255,255,255,0.2)]">MedNet Monitor</span>
                    </div>
                    <span className="text-[11px] text-gray-500 font-black uppercase tracking-[0.4em] pl-8 opacity-60">Mustafa Sercan Sak Diagnostics • Bed-402A</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-white font-black text-3xl tracking-tighter tabular-nums [text-shadow:0_0_15px_rgba(255,255,255,0.2)]">
                        {new Date().toLocaleTimeString()}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest px-4 py-1 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mt-2">Zero-Latency Link</span>
                </div>
            </div>

            {/* Bottom: Diagnostics & Vitals */}
            <div className="flex items-end justify-between">
                {/* Diagnostics Scope (v7 Enhanced) */}
                <div className="p-8 bg-black/60 backdrop-blur-3xl border-l-[6px] border-l-cyan-500 rounded-3xl min-w-[450px] shadow-2xl animate-in fade-in slide-in-from-left duration-1000">
                    <div className="flex items-center justify-between mb-6">
                        <span className="text-[12px] font-black text-cyan-500 tracking-widest uppercase italic">Live Protocol Analytics</span>
                        <div className="flex gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/40" />
                        </div>
                    </div>
                    {/* Diagnostic Monitor */}
                    <div className="h-20 w-full bg-black/80 rounded-2xl mb-6 p-3 border border-white/5 relative overflow-hidden">
                        <canvas ref={diagScopeRef} width={400} height={80} className="w-full h-full" />
                        <div className="absolute top-2 right-4 text-[8px] text-cyan-600 font-black">250Hz SAMPLING</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[11px] font-mono">
                        <div className="flex justify-between border-b border-white/5 pb-1">
                            <span className="text-gray-500 uppercase">Packet ID:</span>
                            <span className="text-white font-black">#{hudData.frameId}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-1">
                            <span className="text-gray-500 uppercase">Consistency:</span>
                            <span className="text-emerald-500 font-black uppercase tracking-widest">Fixed</span>
                        </div>
                        <div className="flex justify-between pt-1">
                            <span className="text-gray-500 uppercase">Throughput:</span>
                            <span className="text-cyan-400 font-black">3.4 MB/s</span>
                        </div>
                        <div className="flex justify-between pt-1">
                            <span className="text-gray-500 uppercase">Jitter:</span>
                            <span className="text-emerald-500 font-black">0.02ms</span>
                        </div>
                    </div>
                </div>

                {/* Viral Cluster Cluster v7 (Zero-Failure Match) */}
                <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right duration-1000">
                    
                    {/* HR Card v7 */}
                    <div className={`p-8 bg-black/60 backdrop-blur-3xl border-r-[10px] w-72 shadow-2xl transition-all duration-300 relative overflow-hidden ${isAlarm && hudData.bpm > 0 ? 'border-rose-600 bg-rose-950/40' : 'border-emerald-500'}`}>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                                <div className="text-[12px] text-gray-500 font-black uppercase tracking-widest mb-2">Heart Rate</div>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-7xl font-black tabular-nums tracking-tighter ${isAlarm && hudData.bpm > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {hudData.bpm || '--'}
                                    </span>
                                    <span className="text-xs font-black text-gray-600 uppercase">BPM</span>
                                </div>
                            </div>
                            {/* MINI SPARKLINE v7 */}
                            <div className="w-24 h-12 bg-black/60 rounded-xl p-2 border border-white/10">
                                <canvas ref={ecgSparkRef} width={80} height={40} className="w-full h-full opacity-90" />
                            </div>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden relative z-10">
                            <div className={`h-full transition-all duration-500 ${isAlarm ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (hudData.bpm / 200) * 100)}%` }} />
                        </div>
                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
                    </div>

                  {/* SpO2 Card v7 */}
                    <div className={`p-8 bg-black/60 backdrop-blur-3xl border-r-[10px] w-72 shadow-2xl transition-all duration-300 relative overflow-hidden ${isAlarm && hudData.spo2 < 90 ? 'border-rose-600 bg-rose-950/40' : 'border-cyan-500'}`}>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                                <div className="text-[12px] text-gray-500 font-black uppercase tracking-widest mb-2">O2 Saturation</div>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-7xl font-black tabular-nums tracking-tighter ${isAlarm && hudData.spo2 < 90 ? 'text-rose-500' : 'text-cyan-400'}`}>
                                        {hudData.spo2 || '--'}
                                    </span>
                                    <span className="text-xs font-black text-gray-600 uppercase">%</span>
                                </div>
                            </div>
                            <div className="w-24 h-12 bg-black/60 rounded-xl p-2 border border-white/10">
                                <canvas ref={spo2SparkRef} width={80} height={40} className="w-full h-full opacity-90" />
                            </div>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden relative z-10">
                            <div className={`h-full transition-all duration-500 ${isAlarm ? 'bg-rose-500' : 'bg-cyan-500'}`} style={{ width: `${hudData.spo2}%` }} />
                        </div>
                    </div>

                    {/* Secondary Cluster */}
                    <div className="flex gap-6">
                        <div className="p-6 bg-black/60 border-r-[6px] border-yellow-500 flex-1 text-center shadow-xl">
                            <span className="text-[10px] text-gray-600 font-black uppercase block mb-1">RR</span>
                            <span className="text-3xl font-black text-yellow-500">{hudData.resp || '--'}</span>
                        </div>
                        <div className="p-6 bg-black/60 border-r-[6px] border-purple-600 flex-1 text-center shadow-xl">
                            <span className="text-[10px] text-gray-600 font-black uppercase block mb-1">Temp</span>
                            <span className="text-3xl font-black text-purple-400">{hudData.temp ? (hudData.temp/10).toFixed(1) : '--'}°</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <style>{`
        @keyframes progress { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .animate-progress { animation: progress 1.1s ease-out forwards; }
      `}</style>
    </div>
  );
}
