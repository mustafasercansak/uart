import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n/context';

const STORAGE_KEY = 'uart_onboarding_done';

interface Props {
  onDone: () => void;
}

export default function OnboardingFlow({ onDone }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const STEPS = [
    {
      id: 'welcome',
      title: t('onboarding.welcome.title'),
      subtitle: t('onboarding.welcome.subtitle'),
      body: t('onboarding.welcome.body'),
      tip: t('onboarding.welcome.tip'),
      action: t('onboarding.welcome.action'),
      visual: (
        <div className="grid grid-cols-2 gap-3 text-center">
          {[
            { icon: '🏥', label: t('onboarding.welcome.monitor'), color: '#10b981' },
            { icon: '💨', label: t('onboarding.welcome.ventilator'), color: '#3b82f6' },
            { icon: '💉', label: t('onboarding.welcome.pump'), color: '#f59e0b' },
            { icon: '🩺', label: t('onboarding.welcome.oximeter'), color: '#ec4899' },
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
      title: t('onboarding.profile.title'),
      subtitle: t('onboarding.profile.subtitle'),
      body: t('onboarding.profile.body'),
      tip: t('onboarding.profile.tip'),
      action: t('onboarding.profile.action'),
      visual: (
        <div className="bg-black/40 rounded-xl border border-white/10 p-4 font-mono text-xs space-y-2">
          <div className="text-gray-500 text-[10px] tracking-widest mb-3">{t('onboarding.profile.exampleFrame')}</div>
          {[
            { byte: '0x01', label: t('onboarding.profile.sync'), color: '#6366f1' },
            { byte: '0x4B', label: t('onboarding.profile.hr'), color: '#10b981' },
            { byte: '0x62', label: t('onboarding.profile.spo2'), color: '#06b6d4' },
            { byte: '0x12', label: t('onboarding.profile.temp'), color: '#f59e0b' },
            { byte: '0xA3', label: t('onboarding.profile.crc'), color: '#6b7280' },
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
      title: t('onboarding.simulate.title'),
      subtitle: t('onboarding.simulate.subtitle'),
      body: t('onboarding.simulate.body'),
      tip: t('onboarding.simulate.tip'),
      action: t('onboarding.simulate.action'),
      visual: (
        <div className="space-y-3">
          {[
            { tab: t('onboarding.simulate.visualizer'), desc: t('onboarding.simulate.visualizerDesc'), color: '#6366f1' },
            { tab: t('onboarding.simulate.waveforms'), desc: t('onboarding.simulate.waveformsDesc'), color: '#10b981' },
            { tab: t('onboarding.simulate.logic'), desc: t('onboarding.simulate.logicDesc'), color: '#06b6d4' },
            { tab: t('onboarding.simulate.decoder'), desc: t('onboarding.simulate.decoderDesc'), color: '#f59e0b' },
            { tab: t('onboarding.simulate.learn'), desc: t('onboarding.simulate.learnDesc'), color: '#ec4899' },
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

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleAction = () => {
    if (step === 1) {
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
              {t('onboarding.skip')}
            </button>
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="px-4 py-2 text-xs font-black tracking-widest text-gray-400 border border-white/10 rounded-xl hover:border-white/20 transition-all"
                >
                  {t('onboarding.back')}
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
