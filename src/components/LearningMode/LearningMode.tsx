import React, { useState, useEffect, useRef } from 'react';
import type { GeneratedFrame, FrameProfile } from '../../types';
import { useTranslation } from '../../i18n/context';

// ─── Lesson definitions ───────────────────────────────────────────────────────

interface LessonStep {
  id: string;
  title: string;
  explanation: string;
  highlightField?: string;
  watchCondition?: (frame: GeneratedFrame | null) => boolean;
  byteAnnotation?: string;
  focusDevice?: string;
  tip?: string;
}

interface Lesson {
  id: string;
  title: string;
  icon: string;
  description: string;
  requiredFields: string[];
  steps: LessonStep[];
}

interface Props {
  lastFrame: GeneratedFrame | null;
  activeProfile: FrameProfile | null;
  onFocusDevice?: (deviceId: string | null) => void;
}

export default function LearningMode({ lastFrame, activeProfile, onFocusDevice }: Props) {
  const { t } = useTranslation();
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('uart_completed_lessons') || '[]')); }
    catch { return new Set(); }
  });
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LESSONS: Lesson[] = [
    {
      id: 'uart-basics',
      icon: '📡',
      title: t('learning.lessons.uartBasics.title'),
      description: t('learning.lessons.uartBasics.desc'),
      requiredFields: [],
      steps: [
        {
          id: 'start',
          title: t('learning.lessons.uartBasics.steps.start.title'),
          explanation: t('learning.lessons.uartBasics.steps.start.explanation'),
          tip: t('learning.lessons.uartBasics.steps.start.tip'),
        },
        {
          id: 'frame-structure',
          title: t('learning.lessons.uartBasics.steps.anatomy.title'),
          explanation: t('learning.lessons.uartBasics.steps.anatomy.explanation'),
          byteAnnotation: t('learning.lessons.uartBasics.steps.anatomy.byteAnnotation'),
          tip: t('learning.lessons.uartBasics.steps.anatomy.tip'),
        },
        {
          id: 'baud-rate',
          title: t('learning.lessons.uartBasics.steps.baud.title'),
          explanation: t('learning.lessons.uartBasics.steps.baud.explanation'),
          tip: t('learning.lessons.uartBasics.steps.baud.tip'),
        },
        {
          id: 'checksum',
          title: t('learning.lessons.uartBasics.steps.checksum.title'),
          explanation: t('learning.lessons.uartBasics.steps.checksum.explanation'),
          tip: t('learning.lessons.uartBasics.steps.checksum.tip'),
        },
      ],
    },
    {
      id: 'patient-monitor',
      icon: '🏥',
      title: t('learning.lessons.patientMonitor.title'),
      description: t('learning.lessons.patientMonitor.desc'),
      requiredFields: ['bpm', 'hr', 'spo2', 'rr'],
      steps: [
        {
          id: 'intro',
          title: t('learning.lessons.patientMonitor.steps.intro.title'),
          explanation: t('learning.lessons.patientMonitor.steps.intro.explanation'),
          focusDevice: 'patient_monitor',
          tip: t('learning.lessons.patientMonitor.steps.intro.tip'),
        },
        {
          id: 'ecg-byte',
          title: t('learning.lessons.patientMonitor.steps.heartRate.title'),
          explanation: t('learning.lessons.patientMonitor.steps.heartRate.explanation'),
          highlightField: 'bpm',
          byteAnnotation: t('learning.lessons.patientMonitor.steps.heartRate.byteAnnotation'),
          focusDevice: 'patient_monitor',
          watchCondition: frame => !!frame?.fields.find(f => f.name.toLowerCase().includes('bpm'))?.decimal,
          tip: t('learning.lessons.patientMonitor.steps.heartRate.tip'),
        },
        {
          id: 'spo2-byte',
          title: t('learning.lessons.patientMonitor.steps.spo2.title'),
          explanation: t('learning.lessons.patientMonitor.steps.spo2.explanation'),
          highlightField: 'spo2',
          byteAnnotation: t('learning.lessons.patientMonitor.steps.spo2.byteAnnotation'),
          focusDevice: 'patient_monitor',
          tip: t('learning.lessons.patientMonitor.steps.spo2.tip'),
        },
        {
          id: 'ecg-wave',
          title: t('learning.lessons.patientMonitor.steps.ecg.title'),
          explanation: t('learning.lessons.patientMonitor.steps.ecg.explanation'),
          highlightField: 'lead-i',
          byteAnnotation: t('learning.lessons.patientMonitor.steps.ecg.byteAnnotation'),
          focusDevice: 'patient_monitor',
          tip: t('learning.lessons.patientMonitor.steps.ecg.tip'),
        },
      ],
    },
    {
      id: 'signal-integrity',
      icon: '⚡',
      title: t('learning.lessons.signalIntegrity.title'),
      description: t('learning.lessons.signalIntegrity.desc'),
      requiredFields: [],
      steps: [
        {
          id: 'perfect-signal',
          title: t('learning.lessons.signalIntegrity.steps.perfect.title'),
          explanation: t('learning.lessons.signalIntegrity.steps.perfect.explanation'),
          tip: t('learning.lessons.signalIntegrity.steps.perfect.tip'),
        },
        {
          id: 'noise',
          title: t('learning.lessons.signalIntegrity.steps.noise.title'),
          explanation: t('learning.lessons.signalIntegrity.steps.noise.explanation'),
          tip: t('learning.lessons.signalIntegrity.steps.noise.tip'),
        },
        {
          id: 'jitter',
          title: t('learning.lessons.signalIntegrity.steps.jitter.title'),
          explanation: t('learning.lessons.signalIntegrity.steps.jitter.explanation'),
          tip: t('learning.lessons.signalIntegrity.steps.jitter.tip'),
        },
        {
          id: 'solutions',
          title: t('learning.lessons.signalIntegrity.steps.solutions.title'),
          explanation: t('learning.lessons.signalIntegrity.steps.solutions.explanation'),
          tip: t('learning.lessons.signalIntegrity.steps.solutions.tip'),
        },
      ],
    },
  ];

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

  if (!selectedLesson) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-4 bg-gray-950 font-mono">
        <div>
          <h2 className="text-white font-black text-xl">{t('learning.title')}</h2>
          <p className="text-gray-500 text-sm mt-1">{t('learning.subtitle')}</p>
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
                      {isDone && <span className="text-emerald-400 text-[10px] font-black tracking-widest">{t('learning.done')}</span>}
                    </div>
                    <p className="text-gray-500 text-xs mt-1 leading-relaxed">{lesson.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-gray-600">{t('learning.stepsCount', { count: lesson.steps.length })}</span>
                      {!profileHasFields && (
                        <span className="text-[10px] text-yellow-600">
                          {t('learning.loadProfileWarning')}
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
            <span className="text-cyan-500 font-black">{t('learning.tip')}</span> {t('learning.globalTip')}
          </p>
        </div>
      </div>
    );
  }

  const isLast = stepIndex === selectedLesson.steps.length - 1;

  const highlightedField = currentStep?.highlightField
    ? lastFrame?.fields.find(f => f.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(
        currentStep.highlightField!.replace(/[^a-z0-9]/g, '').toLowerCase()
      ))
    : null;

  return (
    <div className="h-full flex flex-col bg-gray-950 font-mono">
      <div className="flex items-center gap-3 p-4 border-b border-white/5">
        <button
          onClick={() => { setSelectedLesson(null); setStepIndex(0); onFocusDevice?.(null); }}
          className="text-gray-600 hover:text-white text-sm transition-colors"
        >
          {t('learning.backToLessons')}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-white font-black text-sm truncate">{selectedLesson.title}</div>
          <div className="text-gray-600 text-[10px] tracking-widest">
            {t('learning.stepProgress', { current: stepIndex + 1, total: selectedLesson.steps.length })}
          </div>
        </div>
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

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <div className="text-[10px] text-cyan-500 font-black tracking-widest mb-1">
            {selectedLesson.icon} {selectedLesson.title.toUpperCase()}
          </div>
          <h3 className="text-white font-black text-lg leading-tight">{currentStep?.title}</h3>
        </div>

        <p className="text-gray-300 text-sm leading-relaxed">{currentStep?.explanation}</p>

        {currentStep?.byteAnnotation && (
          <div className="bg-black/60 border border-cyan-500/20 rounded-xl p-4">
            <div className="text-[10px] text-cyan-500 font-black tracking-widest mb-2">{t('learning.byteLayout')}</div>
            <div className="text-cyan-300 font-mono text-xs leading-relaxed">{currentStep.byteAnnotation}</div>
          </div>
        )}

        {currentStep?.highlightField && (
          <div className="bg-black/40 border border-white/10 rounded-xl p-4">
            <div className="text-[10px] text-gray-500 font-black tracking-widest mb-2">{t('learning.liveValue')}</div>
            {highlightedField ? (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-white tabular-nums">{highlightedField.decimal}</span>
                <span className="text-gray-500 text-sm">{highlightedField.name}</span>
                <span className="text-cyan-400 font-mono text-sm ml-auto">{highlightedField.hex}</span>
              </div>
            ) : (
              <div className="text-gray-600 text-sm">
                {lastFrame ? t('learning.fieldNotFound', { field: currentStep.highlightField }) : t('learning.startSimulationPrompt')}
              </div>
            )}
          </div>
        )}

        {lastFrame && (
          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <div className="text-[10px] text-gray-600 font-black tracking-widest mb-2">{t('learning.currentFrameHex')}</div>
            <div className="font-mono text-[11px] text-gray-400 break-all leading-relaxed">{lastFrame.rawHex}</div>
          </div>
        )}

        {currentStep?.tip && (
          <div className="bg-cyan-950/40 border border-cyan-500/20 rounded-xl px-4 py-3 flex gap-3">
            <span className="text-cyan-400 flex-shrink-0">💡</span>
            <p className="text-cyan-300 text-xs leading-relaxed">{currentStep.tip}</p>
          </div>
        )}

        {currentStep?.watchCondition && (
          <div className="flex items-center gap-2 text-[10px] text-gray-600">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
            {t('learning.watchingCondition')}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-4 border-t border-white/5">
        <button
          onClick={() => goToStep(stepIndex - 1)}
          disabled={stepIndex === 0}
          className="px-4 py-2 text-[11px] font-black tracking-widest text-gray-400 border border-white/10 rounded-xl hover:border-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t('learning.back')}
        </button>

        {isLast ? (
          <button
            onClick={completeLesson}
            className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black tracking-widest rounded-xl transition-all"
          >
            {t('learning.completeLesson')}
          </button>
        ) : (
          <button
            onClick={() => goToStep(stepIndex + 1)}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-black tracking-widest rounded-xl transition-all"
          >
            {t('learning.next')}
          </button>
        )}
      </div>
    </div>
  );
}
