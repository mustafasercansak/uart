import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'uart_onboarding_done';

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to the ICU Simulator',
    subtitle: 'Learn how medical devices communicate — visually, in real time.',
    body: 'This simulator lets you run real UART protocol data through 3D medical device twins. You can see exactly how a patient monitor, ventilator, IV pump, and pulse oximeter exchange bytes over a serial connection.',
    tip: 'No hardware needed. Everything runs in your browser.',
    action: 'Get Started →',
    visual: (
      <div className="grid grid-cols-2 gap-3 text-center">
        {[
          { icon: '🏥', label: 'Patient Monitor', color: '#10b981' },
          { icon: '💨', label: 'Ventilator', color: '#3b82f6' },
          { icon: '💉', label: 'IV Pump', color: '#f59e0b' },
          { icon: '🩺', label: 'Pulse Oximeter', color: '#ec4899' },
        ].map(d => (
          <div key={d.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-3xl mb-2">{d.icon}</div>
            <div className="text-[11px] font-black tracking-widest" style={{ color: d.color }}>{d.label}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'profile',
    title: 'Step 1: Choose a Sensor Profile',
    subtitle: 'A profile defines the UART frame structure for a device.',
    body: 'Each medical sensor sends data in a specific byte format. The profile tells the simulator which bytes represent heart rate, SpO₂, temperature, and so on. You can use a built-in template or build your own.',
    tip: 'Try the "YS2000A Patient Monitor" template to start immediately.',
    action: 'Browse Templates →',
    visual: (
      <div className="bg-black/40 rounded-xl border border-white/10 p-4 font-mono text-xs space-y-2">
        <div className="text-gray-500 text-[10px] tracking-widest mb-3">EXAMPLE UART FRAME</div>
        {[
          { byte: '0x01', label: 'Sync byte', color: '#6366f1' },
          { byte: '0x4B', label: 'Heart Rate = 75 BPM', color: '#10b981' },
          { byte: '0x62', label: 'SpO₂ = 98%', color: '#06b6d4' },
          { byte: '0x12', label: 'Temperature = 36.5°C', color: '#f59e0b' },
          { byte: '0xA3', label: 'CRC checksum', color: '#6b7280' },
        ].map(row => (
          <div key={row.byte} className="flex items-center gap-3">
            <span className="w-12 text-right font-black" style={{ color: row.color }}>{row.byte}</span>
            <span className="text-gray-400">{row.label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'simulate',
    title: 'Step 2: Run the Simulation',
    subtitle: 'Watch the devices come alive with real data.',
    body: 'Press Start on the dashboard. The simulator generates UART frames at the configured baud rate and interval. Each frame updates the 3D device twins, waveform charts, logic analyzer, and protocol decoder — simultaneously.',
    tip: 'Open the "3D Visualizer" tab to see the ICU room. Click any device to zoom in and read its UART data explanation.',
    action: 'Go to Dashboard →',
    visual: (
      <div className="space-y-3">
        {[
          { tab: '3D Visualizer', desc: 'ICU room with clickable device twins', color: '#6366f1' },
          { tab: 'Waveforms', desc: 'Live ECG, SpO₂, and pressure curves', color: '#10b981' },
          { tab: 'Logic Analyzer', desc: 'Bit-level UART signal timing', color: '#06b6d4' },
          { tab: 'Decoder', desc: 'Human-readable protocol breakdown', color: '#f59e0b' },
          { tab: 'Learn Mode', desc: 'Guided step-by-step walkthroughs', color: '#ec4899' },
        ].map(row => (
          <div key={row.tab} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
            <span className="font-black text-[11px] tracking-widest text-white w-32">{row.tab}</span>
            <span className="text-gray-500 text-[11px]">{row.desc}</span>
          </div>
        ))}
      </div>
    ),
  },
];

interface Props {
  onDone: () => void;
}

export default function OnboardingFlow({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleAction = () => {
    if (step === 1) {
      // Go to templates
      localStorage.setItem(STORAGE_KEY, '1');
      onDone();
      navigate('/templates');
    } else if (isLast) {
      localStorage.setItem(STORAGE_KEY, '1');
      onDone();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-gray-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-cyan-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-8 space-y-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full flex-1 transition-all duration-300 ${i <= step ? 'bg-cyan-500' : 'bg-white/10'}`}
              />
            ))}
          </div>

          {/* Header */}
          <div>
            <h2 className="text-white font-black text-xl leading-tight">{current.title}</h2>
            <p className="text-cyan-400 text-sm font-black tracking-wide mt-1">{current.subtitle}</p>
          </div>

          {/* Visual */}
          {current.visual}

          {/* Body text */}
          <p className="text-gray-400 text-sm leading-relaxed">{current.body}</p>

          {/* Tip */}
          <div className="bg-cyan-950/40 border border-cyan-500/20 rounded-xl px-4 py-3 flex gap-3">
            <span className="text-cyan-400 text-sm">💡</span>
            <p className="text-cyan-300 text-xs leading-relaxed">{current.tip}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleSkip}
              className="text-gray-600 text-xs font-black tracking-widest hover:text-gray-400 transition-colors"
            >
              SKIP TOUR
            </button>
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="px-4 py-2 text-xs font-black tracking-widest text-gray-400 border border-white/10 rounded-xl hover:border-white/20 transition-all"
                >
                  ← BACK
                </button>
              )}
              <button
                onClick={handleAction}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black tracking-widest rounded-xl transition-all"
              >
                {current.action}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
