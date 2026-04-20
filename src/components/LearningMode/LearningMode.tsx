import React, { useState, useEffect, useRef } from 'react';
import type { GeneratedFrame, FrameProfile } from '../../types';

// ─── Lesson definitions ───────────────────────────────────────────────────────

interface LessonStep {
  id: string;
  title: string;
  explanation: string;
  // Which field to highlight in the frame (if any)
  highlightField?: string;
  // What to watch for to auto-advance
  watchCondition?: (frame: GeneratedFrame | null) => boolean;
  // Byte-level annotation shown on the hex frame
  byteAnnotation?: string;
  // Device twin to focus (matches MedicalRoomScene device IDs)
  focusDevice?: string;
  tip?: string;
}

interface Lesson {
  id: string;
  title: string;
  icon: string;
  description: string;
  requiredFields: string[]; // field names that should be present in the active profile
  steps: LessonStep[];
}

const LESSONS: Lesson[] = [
  {
    id: 'uart-basics',
    icon: '📡',
    title: 'How UART Works',
    description: 'Understand the byte-by-byte structure of a serial UART frame.',
    requiredFields: [],
    steps: [
      {
        id: 'start',
        title: 'What is UART?',
        explanation:
          'UART stands for Universal Asynchronous Receiver-Transmitter. It is the most common serial protocol used in medical devices, sensors, and industrial equipment. Both sides agree on a speed (baud rate) and then exchange data one byte at a time.',
        tip: 'Start the simulation and watch the Frame Monitor — each row is one UART transmission.',
      },
      {
        id: 'frame-structure',
        title: 'Anatomy of a Frame',
        explanation:
          'Every UART transmission follows a fixed structure: a START bit (logic LOW), then 8 data bits (LSB first), an optional PARITY bit for error detection, and finally a STOP bit (logic HIGH). The "frame" in this simulator is a packet of multiple bytes sent together.',
        byteAnnotation: 'START | D0 D1 D2 D3 D4 D5 D6 D7 | PARITY | STOP',
        tip: 'Open the Logic Analyzer tab to see individual bit transitions for each byte.',
      },
      {
        id: 'baud-rate',
        title: 'Baud Rate = Speed',
        explanation:
          'The baud rate defines how many symbols per second are transmitted. At 9600 baud, each bit lasts ~104 µs. At 115200 baud, each bit lasts ~8.7 µs. Both sides must use the same baud rate — even a 1% mismatch causes framing errors.',
        tip: 'Change the baud rate in the Profile Editor and watch how the Logic Analyzer bit widths change.',
      },
      {
        id: 'checksum',
        title: 'Error Detection with Checksums',
        explanation:
          'Medical devices add a checksum byte at the end of each frame. The receiver independently calculates the checksum from the received bytes. If it does not match, the frame is rejected. Common algorithms: XOR, Sum-Mod-256, CRC8, CRC16-CCITT.',
        tip: 'Use the Error Injection panel to corrupt the checksum and watch the receiver reject the frame.',
      },
    ],
  },
  {
    id: 'patient-monitor',
    icon: '🏥',
    title: 'Patient Monitor Deep Dive',
    description: 'Learn how a bedside patient monitor encodes and transmits vital signs over UART.',
    requiredFields: ['bpm', 'hr', 'spo2', 'rr'],
    steps: [
      {
        id: 'intro',
        title: 'The Patient Monitor',
        explanation:
          'A patient monitor continuously measures and displays vital signs: heart rate (ECG), blood oxygen saturation (SpO₂), respiratory rate, and temperature. All of these are digitised and packed into a UART frame that is transmitted every 40–100 ms.',
        focusDevice: 'patient_monitor',
        tip: 'Click the Patient Monitor in the 3D view to see its live values.',
      },
      {
        id: 'ecg-byte',
        title: 'Heart Rate Byte',
        explanation:
          'The BPM (beats per minute) value is stored as a single byte (0–255). A value of 75 is encoded as 0x4B. The receiver reads this byte, validates it is within physiological range (typically 30–250 BPM), and displays it. Values outside range trigger an alarm flag in the status byte.',
        highlightField: 'bpm',
        byteAnnotation: '75 BPM → 0x4B',
        focusDevice: 'patient_monitor',
        watchCondition: frame => !!frame?.fields.find(f => f.name.toLowerCase().includes('bpm'))?.decimal,
        tip: 'Watch the BPM field in the Frame Monitor as the simulation runs.',
      },
      {
        id: 'spo2-byte',
        title: 'SpO₂ Byte',
        explanation:
          'Blood oxygen saturation is sent as a percentage (0–100). A healthy value like 98% is encoded as 0x62. If the value drops below 90%, the alarm byte flips bit 1, and the monitor sounds an audible alert. The 3D patient monitor will also turn red.',
        highlightField: 'spo2',
        byteAnnotation: '98% SpO₂ → 0x62',
        focusDevice: 'patient_monitor',
        tip: 'Use the Error Injection panel to simulate a "Low SpO₂" event and watch the 3D alarm ring appear.',
      },
      {
        id: 'ecg-wave',
        title: 'ECG Waveform Samples',
        explanation:
          'In addition to the numeric BPM, the monitor transmits raw ECG waveform samples at 250 Hz. Each sample is a 12-bit value (0–4095) stored in 2 bytes (big-endian). The receiver renders these into the characteristic PQRST waveform you see on hospital screens.',
        highlightField: 'lead-i',
        byteAnnotation: 'ECG sample 2048 → 0x08 0x00 (big-endian)',
        focusDevice: 'patient_monitor',
        tip: 'Open the Waveforms tab to see the live ECG reconstruction from these bytes.',
      },
    ],
  },
  {
    id: 'signal-integrity',
    icon: '⚡',
    title: 'Signal Integrity & Noise',
    description: 'Explore what happens to UART data when the electrical signal degrades.',
    requiredFields: [],
    steps: [
      {
        id: 'perfect-signal',
        title: 'A Perfect Signal',
        explanation:
          'In ideal conditions, a UART TX line sits at logic HIGH (e.g., +3.3V or +5V) between frames. Each bit transition is sharp and clean. The receiver samples the line at the center of each bit period, so small timing variations do not matter.',
        tip: 'In the Signal Integrity panel, set noise and jitter to zero and observe the Logic Analyzer.',
      },
      {
        id: 'noise',
        title: 'Electrical Noise',
        explanation:
          'Real cables pick up electromagnetic interference (EMI) from nearby motors, power lines, or radio signals. This corrupts individual bits — a 1 becomes a 0 or vice versa. The result: framing errors or wrong data values. UART has no built-in retry mechanism, which is why checksums are critical.',
        tip: 'Increase the Noise Level slider in Signal Integrity and watch the error count climb in the Status Bar.',
      },
      {
        id: 'jitter',
        title: 'Clock Jitter',
        explanation:
          'Jitter is timing uncertainty — the bit edges arrive slightly early or late. Since both sides run independent clocks (asynchronous!), any frequency mismatch compounds over the 10 bits in a frame. Excessive jitter causes the receiver to sample the wrong bit. Maximum tolerance is typically ±2–3%.',
        tip: 'Enable Bit Flip in Signal Integrity and watch random bytes get corrupted in the Frame Monitor.',
      },
      {
        id: 'solutions',
        title: 'Engineering Solutions',
        explanation:
          'Engineers use hardware solutions (shielded cables, twisted pairs, RS-422/485 differential signalling) and software solutions (CRC checksums, retransmission, redundant sensors) to handle real-world signal degradation. In critical medical devices, all of these are required simultaneously.',
        tip: 'Try enabling all three signal integrity options at once and observe how quickly the system degrades.',
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  lastFrame: GeneratedFrame | null;
  activeProfile: FrameProfile | null;
  onFocusDevice?: (deviceId: string | null) => void;
}

export default function LearningMode({ lastFrame, activeProfile, onFocusDevice }: Props) {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('uart_completed_lessons') || '[]')); }
    catch { return new Set(); }
  });
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = selectedLesson?.steps[stepIndex] ?? null;

  // Auto-advance when watchCondition is met
  useEffect(() => {
    if (!currentStep?.watchCondition || !lastFrame) return;
    if (currentStep.watchCondition(lastFrame)) {
      autoAdvanceRef.current = setTimeout(() => {
        if (selectedLesson && stepIndex < selectedLesson.steps.length - 1) {
          setStepIndex(i => i + 1);
        }
      }, 1500);
    }
    return () => { if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current); };
  }, [lastFrame, currentStep, selectedLesson, stepIndex]);

  // Focus device when step changes
  useEffect(() => {
    if (currentStep?.focusDevice && onFocusDevice) {
      onFocusDevice(currentStep.focusDevice);
    }
  }, [currentStep, onFocusDevice]);

  const completeLesson = () => {
    if (!selectedLesson) return;
    const next = new Set(completed).add(selectedLesson.id);
    setCompleted(next);
    localStorage.setItem('uart_completed_lessons', JSON.stringify([...next]));
    setSelectedLesson(null);
    setStepIndex(0);
    onFocusDevice?.(null);
  };

  const goToStep = (i: number) => {
    if (!selectedLesson) return;
    setStepIndex(Math.max(0, Math.min(selectedLesson.steps.length - 1, i)));
  };

  // ── Lesson list ──────────────────────────────────────────────────────────
  if (!selectedLesson) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-4 bg-gray-950 font-mono">
        <div>
          <h2 className="text-white font-black text-xl">Learning Mode</h2>
          <p className="text-gray-500 text-sm mt-1">
            Step-by-step lessons that teach UART protocols through live simulation data.
          </p>
        </div>

        <div className="space-y-3">
          {LESSONS.map(lesson => {
            const isDone = completed.has(lesson.id);
            const profileHasFields = lesson.requiredFields.length === 0 || (
              activeProfile && lesson.requiredFields.some(f =>
                activeProfile.fields.some(pf => pf.name.toLowerCase().includes(f))
              )
            );

            return (
              <button
                key={lesson.id}
                onClick={() => { setSelectedLesson(lesson); setStepIndex(0); }}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  isDone
                    ? 'bg-emerald-950/30 border-emerald-500/30 hover:border-emerald-500/50'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{lesson.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-black text-sm">{lesson.title}</span>
                      {isDone && <span className="text-emerald-400 text-[10px] font-black tracking-widest">✓ DONE</span>}
                    </div>
                    <p className="text-gray-500 text-xs mt-1 leading-relaxed">{lesson.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-gray-600">{lesson.steps.length} steps</span>
                      {!profileHasFields && (
                        <span className="text-[10px] text-yellow-600">
                          ⚠ Load a compatible profile first
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-4 border-t border-white/5">
          <p className="text-gray-600 text-[11px] leading-relaxed">
            <span className="text-cyan-500 font-black">Tip:</span> Start a simulation first, then work through the lessons in order.
            Each lesson references live data from the running simulation.
          </p>
        </div>
      </div>
    );
  }

  // ── Active lesson ────────────────────────────────────────────────────────
  const isLast = stepIndex === selectedLesson.steps.length - 1;

  // Highlighted field value from current frame
  const highlightedField = currentStep?.highlightField
    ? lastFrame?.fields.find(f => f.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(
        currentStep.highlightField!.replace(/[^a-z0-9]/g, '').toLowerCase()
      ))
    : null;

  return (
    <div className="h-full flex flex-col bg-gray-950 font-mono">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/5">
        <button
          onClick={() => { setSelectedLesson(null); setStepIndex(0); onFocusDevice?.(null); }}
          className="text-gray-600 hover:text-white text-sm transition-colors"
        >
          ← Lessons
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-white font-black text-sm truncate">{selectedLesson.title}</div>
          <div className="text-gray-600 text-[10px] tracking-widest">
            Step {stepIndex + 1} of {selectedLesson.steps.length}
          </div>
        </div>
        {/* Step progress dots */}
        <div className="flex gap-1">
          {selectedLesson.steps.map((_, i) => (
            <button
              key={i}
              onClick={() => goToStep(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === stepIndex ? 'bg-cyan-500 scale-125' : i < stepIndex ? 'bg-emerald-500' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Step title */}
        <div>
          <div className="text-[10px] text-cyan-500 font-black tracking-widest mb-1">
            {selectedLesson.icon} {selectedLesson.title.toUpperCase()}
          </div>
          <h3 className="text-white font-black text-lg leading-tight">{currentStep?.title}</h3>
        </div>

        {/* Explanation */}
        <p className="text-gray-300 text-sm leading-relaxed">{currentStep?.explanation}</p>

        {/* Byte annotation */}
        {currentStep?.byteAnnotation && (
          <div className="bg-black/60 border border-cyan-500/20 rounded-xl p-4">
            <div className="text-[10px] text-cyan-500 font-black tracking-widest mb-2">BYTE LAYOUT</div>
            <div className="text-cyan-300 font-mono text-xs leading-relaxed">{currentStep.byteAnnotation}</div>
          </div>
        )}

        {/* Live field highlight */}
        {currentStep?.highlightField && (
          <div className="bg-black/40 border border-white/10 rounded-xl p-4">
            <div className="text-[10px] text-gray-500 font-black tracking-widest mb-2">LIVE VALUE</div>
            {highlightedField ? (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-white tabular-nums">{highlightedField.decimal}</span>
                <span className="text-gray-500 text-sm">{highlightedField.name}</span>
                <span className="text-cyan-400 font-mono text-sm ml-auto">{highlightedField.hex}</span>
              </div>
            ) : (
              <div className="text-gray-600 text-sm">
                {lastFrame ? `Field "${currentStep.highlightField}" not found in active profile.` : 'Start the simulation to see live values.'}
              </div>
            )}
          </div>
        )}

        {/* Last frame hex */}
        {lastFrame && (
          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <div className="text-[10px] text-gray-600 font-black tracking-widest mb-2">CURRENT FRAME HEX</div>
            <div className="font-mono text-[11px] text-gray-400 break-all leading-relaxed">{lastFrame.rawHex}</div>
          </div>
        )}

        {/* Tip */}
        {currentStep?.tip && (
          <div className="bg-cyan-950/40 border border-cyan-500/20 rounded-xl px-4 py-3 flex gap-3">
            <span className="text-cyan-400 flex-shrink-0">💡</span>
            <p className="text-cyan-300 text-xs leading-relaxed">{currentStep.tip}</p>
          </div>
        )}

        {/* Auto-advance indicator */}
        {currentStep?.watchCondition && (
          <div className="flex items-center gap-2 text-[10px] text-gray-600">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
            Watching for condition — will auto-advance when met
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-4 border-t border-white/5">
        <button
          onClick={() => goToStep(stepIndex - 1)}
          disabled={stepIndex === 0}
          className="px-4 py-2 text-[11px] font-black tracking-widest text-gray-400 border border-white/10 rounded-xl hover:border-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← BACK
        </button>

        {isLast ? (
          <button
            onClick={completeLesson}
            className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black tracking-widest rounded-xl transition-all"
          >
            ✓ COMPLETE LESSON
          </button>
        ) : (
          <button
            onClick={() => goToStep(stepIndex + 1)}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-black tracking-widest rounded-xl transition-all"
          >
            NEXT →
          </button>
        )}
      </div>
    </div>
  );
}
