import React, { useRef, useEffect, useCallback } from 'react';
import type { SignalHistory } from '../../../types/protocols/canbus';

interface Props {
  history: SignalHistory;
  width?: number;
  height?: number;
  color?: string;
}

export default function CANSignalChart({ history, width = 200, height = 48, color = '#3b82f6' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.fillRect(0, 0, width, height);

    const samples = history.samples;
    if (samples.length < 2) return;

    // Compute actual min/max from samples for dynamic range
    let lo = Infinity, hi = -Infinity;
    for (const s of samples) {
      if (s.v < lo) lo = s.v;
      if (s.v > hi) hi = s.v;
    }
    const range = hi - lo || 1;
    const pad = range * 0.1;
    const yMin = lo - pad;
    const yMax = hi + pad;
    const yRange = yMax - yMin;

    const toX = (i: number) => (i / (samples.length - 1)) * width;
    const toY = (v: number) => height - ((v - yMin) / yRange) * (height - 6) - 3;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) {
      const y = Math.round((g / 3) * height);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Fill area
    ctx.beginPath();
    ctx.moveTo(toX(0), height);
    ctx.lineTo(toX(0), toY(samples[0].v));
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(toX(i), toY(samples[i].v));
    }
    ctx.lineTo(toX(samples.length - 1), height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;
    ctx.moveTo(toX(0), toY(samples[0].v));
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(toX(i), toY(samples[i].v));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Last value dot
    const last = samples[samples.length - 1];
    ctx.beginPath();
    ctx.arc(toX(samples.length - 1), toY(last.v), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [history, width, height, color]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block' }}
      className="rounded"
    />
  );
}
