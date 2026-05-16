import React, { useRef, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { GeneratedFrame, FrameProfile } from '../../types';
import { useTranslation } from '../../i18n/context';

const DEVICE_BINDINGS_KEY = 'uart_device_bindings';

// ─── Device Config ────────────────────────────────────────────────────────────

type DeviceType = 'patient_monitor' | 'ventilator' | 'iv_pump' | 'pulse_oximeter';

interface DeviceConfig {
  id: string;
  type: DeviceType;
  label: string;
  position: [number, number, number];
  rotY: number;
  glowHex: number;
  glowCss: string;
  description: string;
  how: string;
  fieldMap: Record<string, string[]>; // display label -> candidate field names
}

// Removed static DEVICES constant, now defined inside component with t() support

// ─── Live Data ────────────────────────────────────────────────────────────────

interface LiveData {
  bpm: number; spo2: number; rr: number; temp: number;
  fio2: number; peep: number; tidalvol: number;
  flowrate: number; volume: number; remaining: number;
  pi: number;
  ecgHistory: number[];
  breathHistory: number[];
  plethHistory: number[];
  beatPhase: number;
  ivPhase: number;
  isAlarm: boolean;
  frameId: number;
  spo2AlarmLo: number;
}

const makeLiveData = (): LiveData => ({
  bpm: 0, spo2: 0, rr: 0, temp: 0,
  fio2: 0, peep: 0, tidalvol: 0,
  flowrate: 0, volume: 0, remaining: 0, pi: 0,
  ecgHistory: new Array(100).fill(2048),
  breathHistory: new Array(100).fill(128),
  plethHistory: new Array(100).fill(128),
  beatPhase: 0, ivPhase: 0, isAlarm: false, frameId: 0, spo2AlarmLo: 94,
});

// ─── Camera helpers ───────────────────────────────────────────────────────────

interface CamTarget { pos: THREE.Vector3; look: THREE.Vector3 }

const OVERVIEW: CamTarget = {
  pos: new THREE.Vector3(0, 13, 16),
  look: new THREE.Vector3(0, 1, 0),
};

function deviceCamTarget(cfg: DeviceConfig): CamTarget {
  const [x, y, z] = cfg.position;
  const dist = 6;
  return {
    pos: new THREE.Vector3(x + Math.sin(cfg.rotY) * dist, y + 4, z + Math.cos(cfg.rotY) * dist),
    look: new THREE.Vector3(x, y + 1.5, z),
  };
}

// ─── Screen drawing ───────────────────────────────────────────────────────────

function clearScreen(ctx: CanvasRenderingContext2D, bg: string) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  for (let i = 0; i < 512; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
}

function drawWave(ctx: CanvasRenderingContext2D, data: number[], color: string, yBase: number, scale: number, max = 4096) {
  if (data.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowBlur = 12;
  ctx.shadowColor = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * 512;
    const y = yBase - (v / max) * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 18) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.fillText(text, x, y);
}

function drawMonitorScreen(ctx: CanvasRenderingContext2D, d: LiveData, t: any) {
  clearScreen(ctx, '#010810');
  drawWave(ctx, d.ecgHistory, '#10b981', 220, 180);
  drawWave(ctx, d.plethHistory, '#06b6d4', 420, 120, 255);

  drawLabel(ctx, d.isAlarm ? t('visualizer.alarm') : t('visualizer.stable'), 30, 40, d.isAlarm ? '#ef4444' : '#ffffff30', 20);
  drawLabel(ctx, t('visualizer.devices.patient_monitor.label').toUpperCase(), 200, 40, '#ffffff20', 16);

  ctx.fillStyle = d.isAlarm && d.bpm > 0 ? '#ef4444' : '#10b981';
  ctx.font = 'bold 100px monospace';
  ctx.fillText(d.bpm ? `${d.bpm}` : '--', 30, 490);
  drawLabel(ctx, t('visualizer.hrUnit'), 30, 512, '#ffffff40', 22);

  ctx.fillStyle = d.isAlarm && d.spo2 < d.spo2AlarmLo ? '#ef4444' : '#06b6d4';
  ctx.font = 'bold 100px monospace';
  ctx.fillText(d.spo2 ? `${d.spo2}` : '--', 300, 490);
  drawLabel(ctx, t('visualizer.spo2Unit'), 300, 512, '#ffffff40', 22);
}

function drawVentilatorScreen(ctx: CanvasRenderingContext2D, d: LiveData, t: any) {
  clearScreen(ctx, '#020c1a');
  drawWave(ctx, d.breathHistory, '#3b82f6', 260, 160, 255);

  drawLabel(ctx, t('visualizer.devices.ventilator.label').toUpperCase(), 30, 40, '#3b82f640', 20);

  ctx.fillStyle = '#3b82f6';
  ctx.font = 'bold 90px monospace';
  ctx.fillText(d.rr ? `${d.rr}` : '--', 30, 420);
  drawLabel(ctx, t('visualizer.rrUnit'), 30, 448, '#ffffff40', 20);

  ctx.fillStyle = '#93c5fd';
  ctx.font = 'bold 90px monospace';
  ctx.fillText(d.fio2 ? `${d.fio2}%` : '--', 270, 420);
  drawLabel(ctx, t('visualizer.fio2Label'), 290, 448, '#ffffff40', 20);

  ctx.fillStyle = '#60a5fa';
  ctx.font = 'bold 50px monospace';
  ctx.fillText(d.peep ? `${t('visualizer.peepLabel')} ${d.peep}` : `${t('visualizer.peepLabel')} --`, 30, 510);
}

function drawIVPumpScreen(ctx: CanvasRenderingContext2D, d: LiveData, t: any) {
  clearScreen(ctx, '#1a0e00');
  drawLabel(ctx, t('visualizer.devices.iv_pump.label').toUpperCase(), 30, 40, '#f59e0b40', 18);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 110px monospace';
  ctx.fillText(d.flowrate ? `${d.flowrate}` : '--', 30, 250);
  drawLabel(ctx, t('visualizer.ivUnit'), 30, 280, '#ffffff50', 22);

  // Progress bar
  const pct = d.volume > 0 && d.remaining >= 0 ? Math.min(1, d.remaining / d.volume) : 0;
  ctx.fillStyle = '#1f1a10';
  ctx.fillRect(30, 320, 450, 28);
  ctx.fillStyle = pct < 0.2 ? '#ef4444' : '#f59e0b';
  ctx.fillRect(30, 320, 450 * pct, 28);

  drawLabel(ctx, d.volume ? `${d.remaining ?? '--'} / ${d.volume} ${t('visualizer.ivUnit').split('/')[0].trim()}` : `-- / -- ${t('visualizer.ivUnit').split('/')[0].trim()}`, 30, 390, '#ffffff50', 22);

  // Animated drip dot
  const dropY = 430 + ((d.ivPhase % 1) * 60);
  ctx.fillStyle = '#93c5fd';
  ctx.beginPath();
  ctx.ellipse(460, dropY, 7, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPulseOxScreen(ctx: CanvasRenderingContext2D, d: LiveData, beat: number, t: any) {
  clearScreen(ctx, '#180014');
  drawWave(ctx, d.plethHistory, `rgba(236,72,153,${0.6 + beat * 0.4})`, 260, 160, 255);

  drawLabel(ctx, t('visualizer.devices.pulse_oximeter.label').toUpperCase(), 30, 40, '#ec489940', 18);

  // Beating heart indicator
  const r = 18 + beat * 10;
  ctx.fillStyle = `rgba(236,72,153,${0.2 + beat * 0.6})`;
  ctx.beginPath(); ctx.arc(460, 50, r, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = d.spo2 < d.spo2AlarmLo && d.spo2 > 0 ? '#ef4444' : '#ec4899';
  ctx.font = 'bold 110px monospace';
  ctx.fillText(d.spo2 ? `${d.spo2}%` : '--', 30, 430);
  drawLabel(ctx, t('visualizer.spo2Unit'), 30, 460, '#ffffff40', 22);

  ctx.fillStyle = '#f9a8d4';
  ctx.font = 'bold 60px monospace';
  ctx.fillText(d.pi ? d.pi.toFixed(1) : '--', 30, 510);
  drawLabel(ctx, t('visualizer.piLabel'), 140, 510, '#ffffff40', 22);
}

// ─── 3D Model Builders ────────────────────────────────────────────────────────

const MAT = {
  pearl: () => new THREE.MeshPhysicalMaterial({ color: 0xf1f5f9, metalness: 0.1, roughness: 0.2, clearcoat: 0.8 }),
  dark: () => new THREE.MeshPhysicalMaterial({ color: 0x0f172a, metalness: 0.4, roughness: 0.5 }),
  steel: () => new THREE.MeshPhysicalMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 }),
  gray: () => new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, metalness: 0.15, roughness: 0.3 }),
  blue: () => new THREE.MeshPhysicalMaterial({ color: 0x3b82f6, metalness: 0.3, roughness: 0.5 }),
  yellow: () => new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, metalness: 0.2, roughness: 0.4 }),
  pink: () => new THREE.MeshPhysicalMaterial({ color: 0xfce7f3, metalness: 0.05, roughness: 0.3 }),
};

interface DeviceObject {
  group: THREE.Group;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  glowLight: THREE.PointLight;
  config: DeviceConfig;
}

function makeScreenCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  return { canvas, ctx, texture };
}

function buildPatientMonitor(scene: THREE.Scene, cfg: DeviceConfig): DeviceObject {
  const group = new THREE.Group();
  const { ctx, canvas, texture } = makeScreenCanvas();

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.45), MAT.pearl());
  chassis.position.y = 1.6; chassis.castShadow = true;
  group.add(chassis);

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.72, 0.06), MAT.dark());
  bezel.position.set(0, 1.6, 0.23);
  group.add(bezel);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.52), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.set(0, 1.6, 0.265);
  group.add(screen);

  // Side metal strips
  for (const x of [-1.07, 1.07]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.72, 0.47), MAT.steel());
    strip.position.set(x, 1.6, 0);
    group.add(strip);
  }

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.9, 12), MAT.steel());
  stand.position.y = 0.45;
  group.add(stand);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.08, 24), MAT.pearl());
  base.receiveShadow = true;
  group.add(base);

  group.position.set(...cfg.position);
  group.rotation.y = cfg.rotY;
  scene.add(group);

  const glowLight = new THREE.PointLight(cfg.glowHex, 2.5, 6);
  glowLight.position.set(cfg.position[0], cfg.position[1] + 1.6, cfg.position[2] + 0.8);
  scene.add(glowLight);

  return { group, canvas, ctx, texture, glowLight, config: cfg };
}

function buildVentilator(scene: THREE.Scene, cfg: DeviceConfig): DeviceObject {
  const group = new THREE.Group();
  const { ctx, canvas, texture } = makeScreenCanvas();

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 0.9), MAT.gray());
  body.position.y = 1.3; body.castShadow = true;
  group.add(body);

  const topPanel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.95), MAT.dark());
  topPanel.position.y = 2.85;
  group.add(topPanel);

  // Tilted screen on top panel
  const screenHolder = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.1), MAT.dark());
  screenHolder.rotation.x = -Math.PI / 2 + 0.25;
  screenHolder.position.set(0, 2.35, 0.1);
  group.add(screenHolder);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ map: texture }));
  screen.rotation.x = -Math.PI / 2 + 0.25;
  screen.position.set(0, 2.38, 0.07);
  group.add(screen);

  // Hose port
  const port = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.35, 12), MAT.blue());
  port.rotation.z = Math.PI / 2;
  port.position.set(1.0, 0.9, 0.3);
  group.add(port);

  // Wheels
  ([[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]] as [number, number][]).forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), MAT.dark());
    wheel.position.set(wx, 0.12, wz);
    group.add(wheel);
  });

  // Ventilation tube
  const tube = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.055, 8, 20, Math.PI * 1.5), MAT.blue());
  tube.position.set(1.1, 1.6, 0.3);
  tube.rotation.z = Math.PI / 2;
  group.add(tube);

  group.position.set(...cfg.position);
  group.rotation.y = cfg.rotY;
  scene.add(group);

  const glowLight = new THREE.PointLight(cfg.glowHex, 2, 6);
  glowLight.position.set(cfg.position[0], cfg.position[1] + 2.5, cfg.position[2] + 0.8);
  scene.add(glowLight);

  return { group, canvas, ctx, texture, glowLight, config: cfg };
}

function buildIVPump(scene: THREE.Scene, cfg: DeviceConfig): DeviceObject {
  const group = new THREE.Group();
  const { ctx, canvas, texture } = makeScreenCanvas();

  // IV pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.8, 10), MAT.steel());
  pole.position.y = 1.9;
  group.add(pole);

  // Pump body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.55), MAT.pearl());
  body.position.set(0.35, 2.1, 0); body.castShadow = true;
  group.add(body);

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.88, 0.07), MAT.dark());
  bezel.position.set(0.35, 2.1, 0.3);
  group.add(bezel);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.72), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.set(0.35, 2.1, 0.34);
  group.add(screen);

  // Yellow safety stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.1, 0.57), MAT.yellow());
  stripe.position.set(0.35, 2.65, 0);
  group.add(stripe);

  // IV bag (translucent)
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.12),
    new THREE.MeshPhysicalMaterial({ color: 0xbae6fd, metalness: 0, roughness: 0.8, transparent: true, opacity: 0.65 }));
  bag.position.set(0.35, 3.3, 0);
  group.add(bag);

  // Tripod base
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), MAT.steel());
    leg.rotation.y = (i / 3) * Math.PI * 2;
    leg.position.set(Math.sin((i / 3) * Math.PI * 2) * 0.35, 0.03, Math.cos((i / 3) * Math.PI * 2) * 0.35);
    group.add(leg);
  }

  group.position.set(...cfg.position);
  group.rotation.y = cfg.rotY;
  scene.add(group);

  const glowLight = new THREE.PointLight(cfg.glowHex, 1.8, 5);
  glowLight.position.set(cfg.position[0] + 0.35, cfg.position[1] + 2, cfg.position[2] + 0.8);
  scene.add(glowLight);

  return { group, canvas, ctx, texture, glowLight, config: cfg };
}

function buildPulseOximeter(scene: THREE.Scene, cfg: DeviceConfig): DeviceObject {
  const group = new THREE.Group();
  const { ctx, canvas, texture } = makeScreenCanvas();

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.55), MAT.pink());
  body.position.y = 0.97; body.castShadow = true;
  group.add(body);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.set(0, 0.97, 0.285);
  group.add(screen);

  // Probe cable coil
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.028, 8, 20), new THREE.MeshPhysicalMaterial({ color: 0xec4899, roughness: 0.7 }));
  coil.position.set(-0.55, 0.97, 0.1);
  coil.rotation.y = Math.PI / 2;
  group.add(coil);

  // Finger clip
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.32), MAT.dark());
  clip.position.set(-0.95, 0.97, 0);
  group.add(clip);

  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.55), MAT.dark());
  stand.position.y = 0.59;
  group.add(stand);

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.75), MAT.pink());
  base.receiveShadow = true;
  group.add(base);

  group.position.set(...cfg.position);
  group.rotation.y = cfg.rotY;
  scene.add(group);

  const glowLight = new THREE.PointLight(cfg.glowHex, 1.8, 5);
  glowLight.position.set(cfg.position[0], cfg.position[1] + 1, cfg.position[2] + 0.8);
  scene.add(glowLight);

  return { group, canvas, ctx, texture, glowLight, config: cfg };
}

function buildDevice(scene: THREE.Scene, cfg: DeviceConfig): DeviceObject {
  switch (cfg.type) {
    case 'patient_monitor': return buildPatientMonitor(scene, cfg);
    case 'ventilator': return buildVentilator(scene, cfg);
    case 'iv_pump': return buildIVPump(scene, cfg);
    case 'pulse_oximeter': return buildPulseOximeter(scene, cfg);
  }
}

function buildHospitalBed(scene: THREE.Scene) {
  const group = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, metalness: 0.1, roughness: 0.3 });
  const gray = new THREE.MeshPhysicalMaterial({ color: 0xd1d5db, metalness: 0.5, roughness: 0.3 });
  const mattress = new THREE.MeshPhysicalMaterial({ color: 0xfafafa, roughness: 0.9, metalness: 0 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 4.5), gray);
  frame.position.y = 0.75;
  group.add(frame);

  const mat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 4.2), mattress);
  mat.position.y = 0.92;
  group.add(mat);

  // Headboard
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.12), white);
  head.position.set(0, 1.15, -2.35);
  group.add(head);

  // Footboard
  const foot = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.1), white);
  foot.position.set(0, 0.95, 2.35);
  group.add(foot);

  // Legs
  ([[-1, -2], [1, -2], [-1, 2], [1, 2]] as [number, number][]).forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.1), gray);
    leg.position.set(lx, 0.38, lz);
    group.add(leg);
  });

  // Patient silhouette (abstract)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.2, 12), new THREE.MeshPhysicalMaterial({ color: 0xfde8d0, roughness: 0.9 }));
  torso.position.set(0, 1.18, -0.5);
  group.add(torso);

  const head3d = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshPhysicalMaterial({ color: 0xfde8d0, roughness: 0.9 }));
  head3d.position.set(0, 1.22, -1.6);
  group.add(head3d);

  // Pillow
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.6), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1 }));
  pillow.position.set(0, 1.04, -1.65);
  group.add(pillow);

  group.position.set(0, 0, 0);
  scene.add(group);
}

// ─── Scene context ────────────────────────────────────────────────────────────

interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  timer: THREE.Timer;
  rafId: number;
  devices: Record<string, DeviceObject>;
  cables: Array<{ line: THREE.Line; mat: THREE.LineBasicMaterial }>;
  alarmRings: Record<string, THREE.Mesh>; // per-device pulsing alarm rings
  camTarget: CamTarget;
  currentLook: THREE.Vector3;
  meshToDevice: Map<string, string>;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  lastFrame: GeneratedFrame | null;
  activeProfileId?: string | null;
  profiles?: FrameProfile[];
  onSetProfile?: (id: string) => void;
}

export default function MedicalRoomScene({ lastFrame, activeProfileId, profiles = [], onSetProfile }: Props) {
  const { t } = useTranslation();

  const DEVICES: DeviceConfig[] = [
    {
      id: 'patient_monitor',
      type: 'patient_monitor',
      label: t('visualizer.devices.patient_monitor.label'),
      position: [4.5, 0, 1],
      rotY: -0.5,
      glowHex: 0x10b981,
      glowCss: '#10b981',
      description: t('visualizer.devices.patient_monitor.description'),
      how: t('visualizer.devices.patient_monitor.how'),
      fieldMap: { [t('visualizer.hr')]: ['bpm', 'hr', 'heartrate'], [t('visualizer.spo2')]: ['spo2', 'oxygen'], [t('visualizer.rr')]: ['rr', 'resp'], [t('visualizer.temp')]: ['temp', 'temperature'] },
    },
    {
      id: 'ventilator',
      type: 'ventilator',
      label: t('visualizer.devices.ventilator.label'),
      position: [-4.5, 0, 1.5],
      rotY: 0.5,
      glowHex: 0x3b82f6,
      glowCss: '#3b82f6',
      description: t('visualizer.devices.ventilator.description'),
      how: t('visualizer.devices.ventilator.how'),
      fieldMap: { [t('visualizer.rr')]: ['rr', 'resp'], [t('visualizer.fio2')]: ['fio2', 'fi02'], [t('visualizer.peep')]: ['peep'], [t('visualizer.tidalVol')]: ['tidalvol', 'tv'] },
    },
    {
      id: 'iv_pump',
      type: 'iv_pump',
      label: t('visualizer.devices.iv_pump.label'),
      position: [-4, 0, -3.5],
      rotY: 0.8,
      glowHex: 0xf59e0b,
      glowCss: '#f59e0b',
      description: t('visualizer.devices.iv_pump.description'),
      how: t('visualizer.devices.iv_pump.how'),
      fieldMap: { [t('visualizer.rate')]: ['flowrate', 'rate', 'infusionrate'], [t('visualizer.volume')]: ['volume', 'vol'], [t('visualizer.remaining')]: ['remaining', 'rem'] },
    },
    {
      id: 'pulse_ox',
      type: 'pulse_oximeter',
      label: t('visualizer.devices.pulse_oximeter.label'),
      position: [3.5, 0, -4],
      rotY: -0.8,
      glowHex: 0xec4899,
      glowCss: '#ec4899',
      description: t('visualizer.devices.pulse_oximeter.description'),
      how: t('visualizer.devices.pulse_oximeter.how'),
      fieldMap: { [t('visualizer.spo2')]: ['spo2', 'oxygen'], [t('visualizer.pi')]: ['pi', 'perfusion'], [t('visualizer.pleth')]: ['pleth', 'ppg', 'spo2wave'] },
    },
  ];

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneCtx | null>(null);
  const liveRef = useRef<LiveData>(makeLiveData());
  const selectedRef = useRef<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [displayData, setDisplayData] = useState<LiveData>(makeLiveData());
  const [showConfig, setShowConfig] = useState(false);
  const [tick, setTick] = useState(0);
  const [activeScenarioStep, setActiveScenarioStep] = useState<string | null>(null);
  const scenarioStepRef = useRef<string | null>(null);
  // bindings: deviceId -> profileId
  const [bindings, setBindings] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(DEVICE_BINDINGS_KEY) || '{}'); }
    catch { return {}; }
  });

  const saveBinding = useCallback((deviceId: string, profileId: string) => {
    setBindings(prev => {
      const next = { ...prev, [deviceId]: profileId };
      localStorage.setItem(DEVICE_BINDINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // A device is "active" when its bound profile is the running simulation, or unbound
  const isDeviceActive = useCallback((deviceId: string) => {
    const boundId = bindings[deviceId];
    if (!boundId || !activeProfileId) return true; // no binding = always show
    return boundId === activeProfileId;
  }, [bindings, activeProfileId]);

  // Track active devices in a ref so the render loop can read it without stale closure
  const activeDevicesRef = useRef<Set<string>>(new Set(DEVICES.map(d => d.id)));
  
  // Keep selectedRef and activeDevicesRef in sync via useEffect
  useEffect(() => {
    selectedRef.current = selected;
    const active = new Set(DEVICES.map(d => d.id).filter(id => isDeviceActive(id)));
    activeDevicesRef.current = active;
  }, [selected, bindings, activeProfileId, isDeviceActive]);

  // ── Three.js setup ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    
    // ... remaining of larger useEffect ...

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020408);
    scene.fog = new THREE.FogExp2(0x020408, 0.04);

    // Camera
    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.copy(OVERVIEW.pos);
    camera.lookAt(OVERVIEW.look);

    // Renderer — keep pixel ratio at 1 to reduce fill-rate cost
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(8, 18, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8ecfff, 0.8);
    fillLight.position.set(-10, 8, -5);
    scene.add(fillLight);

    // Overhead ICU light (cheap point light instead of RectAreaLight)
    const overheadLight = new THREE.PointLight(0xfff8e7, 3, 12);
    overheadLight.position.set(0, 5, 0);
    scene.add(overheadLight);

    // Floor & grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x020608, roughness: 0.15, metalness: 0.7 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(40, 40, 0x06b6d4, 0x011820);
    grid.position.y = -0.04;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.08;
    scene.add(grid);

    // Hospital bed
    buildHospitalBed(scene);

    // Devices
    const meshToDevice = new Map<string, string>();
    const devices: Record<string, DeviceObject> = {};

    for (const cfg of DEVICES) {
      const obj = buildDevice(scene, cfg);
      devices[cfg.id] = obj;
      obj.group.traverse(child => {
        if (child instanceof THREE.Mesh) meshToDevice.set(child.uuid, cfg.id);
      });
    }

    // UART cables (lines from each device to center)
    const cables: Array<{ line: THREE.Line; mat: THREE.LineBasicMaterial }> = [];
    for (const cfg of DEVICES) {
      const [dx, , dz] = cfg.position;
      const points = [new THREE.Vector3(dx, 0.15, dz), new THREE.Vector3(0, 0.15, 0)];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: cfg.glowHex, transparent: true, opacity: 0.25 });
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      cables.push({ line, mat });
    }

    // Alarm rings — pulsing torus around each device for scenario/alarm events
    const alarmRings: Record<string, THREE.Mesh> = {};
    for (const cfg of DEVICES) {
      const [dx, , dz] = cfg.position;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.8, 0.06, 8, 40),
        new THREE.MeshBasicMaterial({ color: cfg.glowHex, transparent: true, opacity: 0 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(dx, 0.1, dz);
      scene.add(ring);
      alarmRings[cfg.id] = ring;
    }

    // Raycaster
    const raycaster = new THREE.Raycaster();

    const ctx: SceneCtx = {
      scene, camera, renderer, timer: new THREE.Timer(), rafId: 0,
      devices, cables, alarmRings,
      camTarget: { pos: OVERVIEW.pos.clone(), look: OVERVIEW.look.clone() },
      currentLook: OVERVIEW.look.clone(),
      meshToDevice,
    };
    sceneRef.current = ctx;

    // Per-device last-draw timestamps for throttling
    const lastDrawMs: Record<string, number> = {};
    DEVICES.forEach(cfg => { lastDrawMs[cfg.id] = 0; });
    const SELECTED_INTERVAL = 1000 / 60;  // 60 fps
    const IDLE_INTERVAL     = 1000 / 10;  // 10 fps

    // Track previous active/selection state to avoid traverse every frame
    const prevActive: Record<string, boolean> = {};
    const prevSel: Record<string, boolean> = {};
    DEVICES.forEach(cfg => { prevActive[cfg.id] = false; prevSel[cfg.id] = false; });

    // ── Render loop ──────────────────────────────────────────────────────
    const animate = () => {
      ctx.rafId = requestAnimationFrame(animate);
      ctx.timer.update();
      const dt = ctx.timer.getDelta();
      const now = Date.now();
      const time = now * 0.001;
      const d = liveRef.current;

      d.beatPhase += dt * Math.max(0.5, d.bpm / 60) * Math.PI * 2;
      d.ivPhase += dt * 0.4;
      const beat = Math.max(0, Math.sin(d.beatPhase));

      // Draw device screens — selected at 60fps, others at 10fps
      const sel = selectedRef.current;
      const shouldDraw = (id: string) => now - lastDrawMs[id] >= (id === sel ? SELECTED_INTERVAL : IDLE_INTERVAL);

      if (shouldDraw('patient_monitor')) {
        drawMonitorScreen(ctx.devices['patient_monitor'].ctx, d, t);
        ctx.devices['patient_monitor'].texture.needsUpdate = true;
        lastDrawMs['patient_monitor'] = now;
      }
      if (shouldDraw('ventilator')) {
        drawVentilatorScreen(ctx.devices['ventilator'].ctx, d, t);
        ctx.devices['ventilator'].texture.needsUpdate = true;
        lastDrawMs['ventilator'] = now;
      }
      if (shouldDraw('iv_pump')) {
        drawIVPumpScreen(ctx.devices['iv_pump'].ctx, d, t);
        ctx.devices['iv_pump'].texture.needsUpdate = true;
        lastDrawMs['iv_pump'] = now;
      }
      if (shouldDraw('pulse_ox')) {
        drawPulseOxScreen(ctx.devices['pulse_ox'].ctx, d, beat, t);
        ctx.devices['pulse_ox'].texture.needsUpdate = true;
        lastDrawMs['pulse_ox'] = now;
      }

      // Update glow lights + opacity (traverse only when active/sel state changes)
      Object.entries(ctx.devices).forEach(([id, dev]) => {
        const isSel = selectedRef.current === id;
        const isActive = activeDevicesRef.current.has(id);
        const isAlarmDev = d.isAlarm && id === 'patient_monitor';

        // traverse is expensive — only run when active state changed
        if (prevActive[id] !== isActive || prevSel[id] !== isSel) {
          dev.group.traverse(child => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
              child.material.opacity = isActive ? 1 : 0.25;
              child.material.transparent = !isActive;
            }
          });
          prevActive[id] = isActive;
          prevSel[id] = isSel;
        }

        dev.glowLight.intensity = isActive
          ? (isSel ? 5 : 2) + (id === 'patient_monitor' ? beat * 2 : 0)
          : 0.2;
        if (isAlarmDev && isActive) dev.glowLight.color.setHex(0xef4444);
        else dev.glowLight.color.setHex(dev.config.glowHex);

        // Gentle hover float (only for active devices)
        dev.group.position.y = isActive
          ? Math.sin(time * 0.3 + DEVICES.findIndex(c => c.id === id)) * 0.03
          : 0;
      });

      // Animate cables
      cables.forEach(({ mat }, i) => {
        mat.opacity = 0.15 + Math.sin(time * 2.5 + i * 1.2) * 0.1;
      });

      // Alarm rings — pulse on alarm or active scenario step
      const activeStep = scenarioStepRef.current;
      Object.entries(ctx.alarmRings).forEach(([id, ring]) => {
        const mat = ring.material as THREE.MeshBasicMaterial;
        const isAlarmRing = d.isAlarm && id === 'patient_monitor';
        const isStepRing = activeStep && activeStep.toLowerCase().includes(id.replace('_', ''));

        if (isAlarmRing) {
          mat.color.setHex(0xef4444);
          mat.opacity = 0.4 + Math.sin(time * 8) * 0.3;
          ring.scale.setScalar(1 + Math.sin(time * 4) * 0.05);
        } else if (isStepRing) {
          const dev = ctx.devices[id];
          mat.color.setHex(dev?.config.glowHex ?? 0xffffff);
          mat.opacity = 0.3 + Math.sin(time * 4) * 0.2;
          ring.scale.setScalar(1 + Math.sin(time * 2) * 0.04);
        } else {
          mat.opacity = Math.max(0, mat.opacity - 0.05);
          ring.scale.setScalar(1);
        }
      });

      // Camera lerp
      camera.position.lerp(ctx.camTarget.pos, 0.04);
      ctx.currentLook.lerp(ctx.camTarget.look, 0.04);
      camera.lookAt(ctx.currentLook);

      renderer.render(scene, camera);
    };
    animate();

    // ── Click handler ────────────────────────────────────────────────────
    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length > 0) {
        const devId = meshToDevice.get(hits[0].object.uuid);
        if (devId) {
          setSelected(prev => {
            const next = prev === devId ? null : devId;
            const cfg = DEVICES.find(d => d.id === devId);
            if (cfg && next) ctx.camTarget = deviceCamTarget(cfg);
            else ctx.camTarget = { pos: OVERVIEW.pos.clone(), look: OVERVIEW.look.clone() };
            return next;
          });
        } else {
          setSelected(null);
          ctx.camTarget = { pos: OVERVIEW.pos.clone(), look: OVERVIEW.look.clone() };
        }
      }
    };
    container.addEventListener('click', onClick);

    // ── Resize handler ───────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // Boot delay
    const bootTimer = setTimeout(() => setIsBooting(false), 1200);

    return () => {
      cancelAnimationFrame(ctx.rafId);
      renderer.dispose();
      container.removeChild(renderer.domElement);
      container.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      clearTimeout(bootTimer);
    };
  }, []);

  // ── Camera target when selected changes via UI buttons ───────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    if (selected) {
      const cfg = DEVICES.find(d => d.id === selected);
      if (cfg) sceneRef.current.camTarget = deviceCamTarget(cfg);
    } else {
      sceneRef.current.camTarget = { pos: OVERVIEW.pos.clone(), look: OVERVIEW.look.clone() };
    }
  }, [selected]);

  // ── Data ingestion ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastFrame) return;
    // Turkish-aware normalization: map ı→i ş→s ğ→g ç→c ö→o ü→u then strip non-alphanum
    const norm = (s: string) => s.toLowerCase()
      .replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
      .replace(/[çÇ]/g, 'c').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
      .replace(/[^a-z0-9]/g, '');
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const f = lastFrame.fields.find(f => norm(f.name) === norm(k));
        if (f) return f.decimal;
      }
      return 0;
    };

    const d = liveRef.current;
    d.bpm  = get('bpm', 'hr', 'heartrate', 'nabiz', 'kalp', 'pulse');
    d.spo2 = get('spo2', 'oxygen', 'oksijen', 'saturasyon', 'sat');
    d.rr   = get('rr', 'resp', 'solunum', 'solunumsayisi', 'breathrate');
    d.temp = get('temp', 'temperature', 'ates', 'sicaklik');
    d.fio2 = get('fio2', 'fi02');
    d.peep = get('peep');
    d.tidalvol  = get('tidalvol', 'tv');
    d.flowrate  = get('flowrate', 'rate', 'infusionrate', 'hiz');
    d.volume    = get('volume', 'vol', 'hacim');
    d.remaining = get('remaining', 'rem', 'kalan');
    d.pi = get('pi', 'perfusion');
    d.frameId = lastFrame.frameNumber;

    // Profile-driven alarm thresholds (fallback to clinical defaults)
    const activeProfile = profiles.find(p => p.id === activeProfileId);
    const getProfileField = (...names: string[]) =>
      activeProfile?.fields.find(f => names.some(n => norm(f.name) === norm(n)));
    const bpmField  = getProfileField('bpm', 'hr', 'heartrate', 'nabiz', 'kalp', 'pulse');
    const spo2Field = getProfileField('spo2', 'oxygen');
    const bpmLo  = bpmField?.alarmLow  ?? 45;
    const bpmHi  = bpmField?.alarmHigh ?? 140;
    const spo2Lo = spo2Field?.alarmLow ?? 94;
    d.spo2AlarmLo = spo2Lo;
    d.isAlarm = (d.bpm > 0 && (d.bpm < bpmLo || d.bpm > bpmHi)) || (d.spo2 > 0 && d.spo2 < spo2Lo);

    // Scenario step — drives ring animations on device twins
    const step = lastFrame.activeScenarioStep ?? null;
    scenarioStepRef.current = step;
    if (step !== activeScenarioStep) {
      // Use setTimeout to avoid synchronous setState in effect body
      setTimeout(() => setActiveScenarioStep(step), 0);
    }

    // ECG waveform
    const ecg = get('leadi', 'ecg', 'ecgwave') || 2048;
    d.ecgHistory.push(ecg);
    if (d.ecgHistory.length > 100) d.ecgHistory.shift();

    // Breath waveform
    const breath = get('flow', 'breathwave', 'pressure') || 128;
    d.breathHistory.push(breath);
    if (d.breathHistory.length > 100) d.breathHistory.shift();

    // Pleth waveform
    const pleth = get('spo2wave', 'pleth', 'ppg') || 128;
    d.plethHistory.push(pleth);
    if (d.plethHistory.length > 100) d.plethHistory.shift();

    setDisplayData({ ...d });
  }, [lastFrame, activeScenarioStep, isDeviceActive]);

  // Alarm flash ticker
  useEffect(() => {
    if (!displayData.isAlarm) return;
    const id = setInterval(() => setTick(n => n + 1), 750);
    return () => clearInterval(id);
  }, [displayData.isAlarm]);

  const selectedCfg = DEVICES.find(d => d.id === selected);

  const activeProf = profiles.find(p => p.id === activeProfileId);
  const normName = (s: string) => s.toLowerCase()
    .replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[çÇ]/g, 'c').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9]/g, '');
  const bpmProfileField  = activeProf?.fields.find(f => ['bpm','hr','heartrate','nabiz','kalp','pulse'].some(n => normName(f.name) === n));
  const spo2ProfileField = activeProf?.fields.find(f => ['spo2','oxygen','oksijen','saturasyon','sat'].some(n => normName(f.name) === n));
  const bpmAlarmLo  = bpmProfileField?.alarmLow  ?? 45;
  const bpmAlarmHi  = bpmProfileField?.alarmHigh ?? 140;
  const spo2AlarmLo = spo2ProfileField?.alarmLow ?? 94;
  const alarmBpm  = displayData.bpm  > 0 && (displayData.bpm < bpmAlarmLo || displayData.bpm > bpmAlarmHi);
  const alarmSpo2 = displayData.spo2 > 0 && displayData.spo2 < spo2AlarmLo;
  const alarmFlash = displayData.isAlarm && tick % 2 === 0;
  const alarmLabels: string[] = [];
  if (alarmBpm)  alarmLabels.push(displayData.bpm < bpmAlarmLo ? t('visualizer.alarmBrady') : t('visualizer.alarmTachy'));
  if (alarmSpo2) alarmLabels.push(t('visualizer.alarmHypox'));

  return (
    <div className="w-full h-full relative overflow-hidden bg-gray-950 font-mono select-none">

      {/* 3D Canvas */}
      <div ref={containerRef} className="w-full h-full cursor-pointer" />

      {/* ── Alarm vignette ── */}
      {displayData.isAlarm && (
        <div className={`absolute inset-0 pointer-events-none transition-all duration-300 ${
          alarmFlash
            ? 'shadow-[inset_0_0_120px_rgba(239,68,68,0.22)] ring-2 ring-inset ring-rose-600/40'
            : 'shadow-[inset_0_0_70px_rgba(239,68,68,0.1)] ring-1 ring-inset ring-rose-800/20'
        }`} />
      )}

      {/* ── Top HUD ── */}
      <div className="absolute top-0 left-0 right-0 px-6 pt-5 pb-3 flex items-start justify-between pointer-events-none">
        {/* Left: identity */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-sm flex-shrink-0 transition-all duration-300 ${
            displayData.isAlarm
              ? alarmFlash ? 'bg-rose-500 shadow-[0_0_10px_#ef4444]' : 'bg-rose-800'
              : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'
          }`} />
          <div>
            <div className="text-white font-black text-base tracking-widest">{t('visualizer.suiteTitle')}</div>
            <div className="text-[9px] text-gray-600 tracking-widest mt-0.5">{t('visualizer.activeDevices', { count: 4 })}</div>
          </div>
        </div>

        {/* Center: alarm banner or normal status */}
        <div className="flex-1 flex justify-center mx-6 mt-0.5">
          {displayData.isAlarm ? (
            <div className={`flex items-center gap-3 px-5 py-2 rounded-full border transition-all duration-300 ${
              alarmFlash
                ? 'bg-rose-600/20 border-rose-500/70 shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                : 'bg-rose-900/15 border-rose-700/40'
            }`}>
              <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${alarmFlash ? 'bg-rose-400' : 'bg-rose-800'}`} />
              <span className={`font-black text-sm tracking-[0.4em] uppercase transition-colors duration-300 ${alarmFlash ? 'text-rose-400' : 'text-rose-700'}`}>
                {t('visualizer.alarm')}
              </span>
              <span className="text-rose-600/40 text-xs">—</span>
              <span className={`font-semibold text-xs tracking-wider transition-colors duration-300 ${alarmFlash ? 'text-rose-300' : 'text-rose-700'}`}>
                {alarmLabels.join(' · ')}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="text-emerald-400 font-bold text-[11px] tracking-[0.3em] uppercase">
                {t('visualizer.allNormal')}
              </span>
            </div>
          )}
        </div>

        {/* Right: clock + frame + profile picker */}
        <div className="text-right flex flex-col items-end gap-1 pointer-events-auto">
          <div className="text-white font-black text-xl tabular-nums">{new Date().toLocaleTimeString()}</div>
          <div className="text-[10px] text-cyan-500/70 tracking-widest">Frame #{displayData.frameId}</div>
          {activeScenarioStep && (
            <div className="text-[10px] text-yellow-400 tracking-widest animate-pulse">
              ▶ {activeScenarioStep}
            </div>
          )}
          {onSetProfile && profiles.length > 0 && (
            <select
              value={activeProfileId ?? ''}
              onChange={e => onSetProfile(e.target.value)}
              className="mt-1 bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-[10px] text-gray-300 font-mono outline-none focus:border-white/30 cursor-pointer hover:border-white/25 transition-colors max-w-[160px] truncate"
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Device selector buttons ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
        <button
          onClick={() => setSelected(null)}
          className={`px-3 py-1.5 text-[11px] font-black tracking-widest rounded-lg border transition-all ${
            selected === null ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-500 hover:border-white/20'
          }`}
        >
          {t('visualizer.overview')}
        </button>
        {DEVICES.map(cfg => {
          const hasAlarm = displayData.isAlarm && cfg.id === 'patient_monitor';
          return (
            <button
              key={cfg.id}
              onClick={() => setSelected(prev => prev === cfg.id ? null : cfg.id)}
              style={{ borderColor: selected === cfg.id ? cfg.glowCss : hasAlarm ? (alarmFlash ? '#ef4444' : '#991b1b') : undefined, color: selected === cfg.id ? cfg.glowCss : undefined }}
              className={`relative px-3 py-1.5 text-[11px] font-black tracking-widest rounded-lg border transition-all duration-300 ${
                selected === cfg.id ? 'bg-black/60' : 'bg-black/40 border-white/10 text-gray-500 hover:border-white/20'
              }`}
            >
              {cfg.label.toUpperCase()}
              {hasAlarm && (
                <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full transition-colors duration-300 ${alarmFlash ? 'bg-rose-500 shadow-[0_0_6px_#ef4444]' : 'bg-rose-800'}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Config button ── */}
      <button
        onClick={() => setShowConfig(c => !c)}
        className="absolute top-14 left-4 pointer-events-auto px-3 py-1.5 text-[10px] font-black tracking-widest rounded-lg border border-white/10 bg-black/40 text-gray-400 hover:border-white/20 hover:text-white transition-all"
      >
        ⚙ {t('visualizer.bindProfiles')}
      </button>

      {/* ── Profile binding config panel ── */}
      {showConfig && (
        <div className="absolute left-4 top-24 w-72 pointer-events-auto">
          <div className="rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black tracking-widest text-gray-500">{t('visualizer.bindingTitle')}</div>
                <div className="text-white font-black text-sm mt-0.5">{t('visualizer.bindingDesc')}</div>
              </div>
              <button onClick={() => setShowConfig(false)} className="text-gray-600 hover:text-white text-lg">✕</button>
            </div>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              {t('visualizer.bindingHelp')}
            </p>
            {DEVICES.map(cfg => (
              <div key={cfg.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.glowCss }} />
                  <span className="text-[11px] font-black text-white tracking-wide">{cfg.label}</span>
                  {bindings[cfg.id] && (
                    <button
                      onClick={() => saveBinding(cfg.id, '')}
                      className="ml-auto text-[9px] text-gray-600 hover:text-red-400 transition-colors"
                    >
                      {t('visualizer.unbind')}
                    </button>
                  )}
                </div>
                <select
                  value={bindings[cfg.id] || ''}
                  onChange={e => saveBinding(cfg.id, e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-gray-300 font-mono outline-none focus:border-white/20"
                >
                  <option value="">{t('visualizer.anyProfile')}</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.id === activeProfileId ? ` ▶ ${t('visualizer.running')}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Device info panel ── */}
      {selectedCfg && (
        <div className="absolute right-4 top-14 bottom-16 w-72 pointer-events-auto">
          <div
            className="h-full rounded-2xl border bg-black/70 backdrop-blur-xl p-5 flex flex-col gap-4 overflow-y-auto"
            style={{ borderColor: `${selectedCfg.glowCss}40` }}
          >
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: selectedCfg.glowCss }} />
                <span className="text-[11px] tracking-widest text-gray-400 font-black">{t('visualizer.deviceTwin')}</span>
              </div>
              <h2 className="text-white font-black text-lg leading-tight">{selectedCfg.label}</h2>
            </div>

            {/* Live values */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(selectedCfg.fieldMap).map(([label, keys]) => {
                const val = keys.reduce((acc: number, k) => {
                  if (acc !== 0) return acc;
                  return (displayData as unknown as Record<string, number>)[k] || 0;
                }, 0);
                const isBpmField  = keys.some(k => ['bpm', 'hr', 'heartrate'].includes(k));
                const isSpo2Field = keys.some(k => ['spo2', 'oxygen'].includes(k));
                const isValAlarm  = (isBpmField && alarmBpm) || (isSpo2Field && alarmSpo2);
                const valFlash    = isValAlarm && alarmFlash;
                return (
                  <div
                    key={label}
                    className={`relative overflow-hidden rounded-xl p-3 border transition-all duration-300 ${
                      isValAlarm
                        ? valFlash
                          ? 'border-rose-500/50 bg-rose-950/40 shadow-[0_0_10px_rgba(239,68,68,0.18)]'
                          : 'border-rose-800/30 bg-rose-950/20'
                        : 'border-white/5 bg-white/5'
                    }`}
                  >
                    {/* Left accent bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-0.5 transition-colors duration-300"
                      style={{ backgroundColor: isValAlarm ? (valFlash ? '#ef4444' : '#7f1d1d') : selectedCfg.glowCss }}
                    />
                    <div className="pl-2">
                      <div className="text-[9px] font-black tracking-widest mb-1.5 flex items-center justify-between"
                        style={{ color: isValAlarm ? (valFlash ? '#fca5a5' : '#7f1d1d') : `${selectedCfg.glowCss}99` }}>
                        {label}
                        {isValAlarm && (
                          <span className={`text-[9px] font-black transition-opacity ${valFlash ? 'opacity-100' : 'opacity-40'}`}
                            style={{ color: '#ef4444' }}>!</span>
                        )}
                      </div>
                      <div
                        className="text-2xl font-black tabular-nums leading-none transition-colors duration-300"
                        style={{ color: isValAlarm ? (valFlash ? '#ef4444' : '#7f1d1d') : selectedCfg.glowCss }}
                      >
                        {val || '--'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-white/5" />

            {/* Description */}
            <div>
              <div className="text-[10px] font-black tracking-widest text-gray-500 mb-2">{t('visualizer.whatIsIt')}</div>
              <p className="text-gray-300 text-xs leading-relaxed">{selectedCfg.description}</p>
            </div>

            {/* How it works */}
            <div>
              <div className="text-[10px] font-black tracking-widest text-gray-500 mb-2">{t('visualizer.howUsed')}</div>
              <p className="text-gray-400 text-xs leading-relaxed">{selectedCfg.how}</p>
            </div>

            {/* UART frame info */}
            {lastFrame && (
              <div className="bg-black/60 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] font-black tracking-widest text-gray-500 mb-2">{t('visualizer.lastFrame')}</div>
                <div className="text-[10px] font-mono text-cyan-400 break-all leading-relaxed">{lastFrame.rawHex}</div>
              </div>
            )}

            {/* Alarm indicator */}
            {displayData.isAlarm && selectedCfg.id === 'patient_monitor' && (
              <div className={`rounded-xl border px-4 py-3 transition-all duration-300 ${
                alarmFlash
                  ? 'bg-rose-950/70 border-rose-500/60 shadow-[0_0_18px_rgba(239,68,68,0.25)]'
                  : 'bg-rose-950/30 border-rose-800/40'
              }`}>
                <div className="flex items-center justify-center gap-2.5 mb-1.5">
                  <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${alarmFlash ? 'bg-rose-400' : 'bg-rose-800'}`} />
                  <span className={`font-black text-sm tracking-[0.35em] uppercase transition-colors duration-300 ${alarmFlash ? 'text-rose-400' : 'text-rose-800'}`}>
                    {t('visualizer.alarm')}
                  </span>
                </div>
                <div className={`text-center text-xs font-semibold tracking-wide mb-1 transition-colors duration-300 ${alarmFlash ? 'text-rose-300' : 'text-rose-700'}`}>
                  {alarmLabels.join(' · ')}
                </div>
                <div className="text-[10px] text-rose-700/60 text-center">{t('visualizer.alarmCheck')}</div>
              </div>
            )}

            <button
              onClick={() => setSelected(null)}
              className="mt-auto py-2 rounded-xl text-[11px] font-black tracking-widest text-gray-500 border border-white/10 hover:border-white/20 hover:text-white transition-all"
            >
              {t('visualizer.backOverview')}
            </button>
          </div>
        </div>
      )}

      {/* ── Boot screen ── */}
      {isBooting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/98 z-50">
          <div className="text-cyan-400 font-black tracking-[0.6em] text-lg animate-pulse mb-8">
            {t('visualizer.digitalTwinSuite')}
          </div>
          <div className="flex flex-col gap-2 text-left w-56">
            {DEVICES.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3 text-[11px] font-mono" style={{ animationDelay: `${i * 200}ms` }}>
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: d.glowCss }} />
                <span className="text-gray-400">{t('visualizer.initializing', { name: d.label })}</span>
              </div>
            ))}
          </div>
          <div className="w-56 h-1 bg-white/5 mt-8 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500 rounded-full" style={{ animation: 'boot-progress 1.1s ease-out forwards' }} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes boot-progress { 0% { width: 0% } 100% { width: 100% } }
      `}</style>
    </div>
  );
}
