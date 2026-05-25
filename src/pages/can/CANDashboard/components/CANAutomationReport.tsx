import React from 'react';
import { X, Printer, ShieldCheck, XCircle, CheckCircle2, Zap, Radio, ShieldAlert, RotateCcw, Activity } from 'lucide-react';
import { useTranslation } from '../../../../i18n/context';
import type { CANAutoStep, CANStepResult, CANAutomationGroup } from './CANAutomationTab';

interface ReportProfile {
  id: string;
  name: string;
  groupId?: string;
  stepCount?: number;
}

interface CANAutomationReportProps {
  results: CANStepResult[];
  profiles: ReportProfile[];
  groups: CANAutomationGroup[];
  runAt: number;
  onClose: () => void;
}

function stepTypeIcon(type: CANAutoStep['type']) {
  switch (type) {
    case 'send-frame':   return <Radio size={12} className="text-cyan-600" />;
    case 'expect-frame': return <Zap size={12} className="text-amber-600" />;
    case 'fault':        return <ShieldAlert size={12} className="text-rose-600" />;
    case 'recover':      return <RotateCcw size={12} className="text-emerald-600" />;
  }
}

export function CANAutomationReport({ results, profiles, groups, runAt, onClose }: CANAutomationReportProps) {
  const { t } = useTranslation();

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const stepTypeName = (type: CANAutoStep['type']) => {
    switch (type) {
      case 'send-frame':   return t('can.autoSendFrame');
      case 'expect-frame': return t('can.autoExpectFrame');
      case 'fault':        return t('can.injectFault');
      case 'recover':      return t('can.recoverNode');
    }
  };

  const resultProfileIds = new Set(results.map(r => r.profileId));
  const profilesWithResults = profiles.filter(p => resultProfileIds.has(p.id));

  const getProfileResults = (profileId: string) => results.filter(r => r.profileId === profileId);
  const isProfilePassed = (profileId: string) => {
    const profileResults = getProfileResults(profileId);
    return profileResults.length > 0 && profileResults.every(r => r.passed);
  };
  const getSectionResults = (sectionProfiles: ReportProfile[]) => {
    const ids = new Set(sectionProfiles.map(p => p.id));
    return results.filter(r => ids.has(r.profileId));
  };

  const stepPassCount = results.filter(r => r.passed).length;
  const stepFailCount = results.filter(r => !r.passed).length;
  const scenarioPassCount = profilesWithResults.filter(p => isProfilePassed(p.id)).length;
  const scenarioFailCount = profilesWithResults.length - scenarioPassCount;
  const scenarioPassRate = profilesWithResults.length > 0 ? Math.round((scenarioPassCount / profilesWithResults.length) * 100) : 0;
  const isOverallPass = scenarioFailCount === 0 && profilesWithResults.length > 0;

  // Group executed profiles by group, then ungrouped. Empty scenarios are omitted.
  const groupedSections: { group: CANAutomationGroup | null; profiles: ReportProfile[] }[] = [];
  const usedGroupIds = new Set<string>();
  profilesWithResults.forEach(p => {
    if (p.groupId) {
      const g = groups.find(g => g.id === p.groupId);
      if (g && !usedGroupIds.has(g.id)) {
        usedGroupIds.add(g.id);
        groupedSections.push({ group: g, profiles: profilesWithResults.filter(x => x.groupId === g.id) });
      }
    }
  });
  const ungrouped = profilesWithResults.filter(p => !p.groupId);
  if (ungrouped.length > 0) groupedSections.push({ group: null, profiles: ungrouped });

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 bg-gray-950/95 backdrop-blur-xl overflow-y-auto print:p-0 print:bg-white print:block">
      {/* Controls */}
      <div className="fixed top-8 right-8 flex gap-4 print:hidden z-10">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all"
        >
          <Printer size={18} />
          {t('validation.printPdf')}
        </button>
        <button
          onClick={onClose}
          className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all"
        >
          <X size={24} />
        </button>
      </div>

      {/* Report document */}
      <div className="w-full max-w-[210mm] bg-white text-gray-900 rounded-lg shadow-2xl p-[20mm] min-h-[297mm] mt-20 print:mt-0 print:shadow-none print:rounded-none print:w-full print:m-0">

        {/* Header */}
        <div className="border-b-2 border-purple-600 pb-4 mb-6 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 text-purple-700 mb-1">
              <ShieldCheck size={18} />
              <h6 className="text-sm font-black tracking-tight uppercase">{t('can.autoReportTitle')}</h6>
            </div>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.3em]">{t('can.autoReportDesc')}</p>
          </div>
          <div className="text-right">
            <div className={`px-3 py-1 rounded-lg border-2 font-black text-[10px] uppercase tracking-widest ${
              isOverallPass
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                : 'border-rose-200 text-rose-700 bg-rose-50'
            }`}>
              {isOverallPass ? t('can.autoReportPassed') : t('can.autoReportFailed')}
            </div>
            <p className="text-[9px] text-gray-400 mt-1 font-mono">
              {t('can.autoReportRunAt')}: {new Date(runAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6 flex justify-around border border-gray-100">
          <div className="text-center">
            <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block mb-0.5">{t('can.autoReportScenarios')}</span>
            <span className="text-2xl font-black text-gray-900">{profilesWithResults.length}</span>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="text-center">
            <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block mb-0.5">{t('can.autoReportScenarioPassed')}</span>
            <span className="text-2xl font-black text-emerald-600">{scenarioPassCount}</span>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="text-center">
            <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block mb-0.5">{t('can.autoReportScenarioFailed')}</span>
            <span className="text-2xl font-black text-rose-600">{scenarioFailCount}</span>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="text-center">
            <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest block mb-0.5">{t('can.autoReportPassRate')}</span>
            <span className="text-2xl font-black text-gray-900">{scenarioPassRate}%</span>
          </div>
        </div>
        <div className="mb-6 -mt-3 flex justify-center gap-4 text-[9px] font-black uppercase tracking-widest text-gray-400">
          <span>{t('can.autoReportStepResults')}: {results.length}</span>
          <span className="text-emerald-600">✓ {stepPassCount}</span>
          <span className="text-rose-600">✗ {stepFailCount}</span>
        </div>

        {/* Results grouped by group → scenario */}
        <div className="mb-6">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Activity className="text-purple-600" size={14} />
            {t('can.autoResults')}
          </h3>

          {groupedSections.map((section, sIdx) => {
            const sectionResults = getSectionResults(section.profiles);
            const sectionStepPassed = sectionResults.filter(r => r.passed).length;
            const sectionStepFailed = sectionResults.filter(r => !r.passed).length;
            const sectionScenarioPassed = section.profiles.filter(p => isProfilePassed(p.id)).length;
            const sectionScenarioFailed = section.profiles.length - sectionScenarioPassed;
            const sectionStatus = sectionScenarioFailed === 0 && section.profiles.length > 0;
            const sectionStepTotal = section.profiles.reduce((sum, p) => sum + (p.stepCount ?? getProfileResults(p.id).length), 0);

            return (
              <div key={section.group?.id ?? `ungrouped-${sIdx}`} className="mb-6 break-inside-avoid">
                {/* Group header */}
                <div className={`mb-3 rounded-xl border px-4 py-3 ${
                  sectionStatus
                    ? 'border-emerald-100 bg-emerald-50/60'
                    : 'border-rose-100 bg-rose-50/60'
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-[9px] font-black uppercase tracking-widest ${
                        sectionStatus ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {t('can.autoReportGroup')}
                      </p>
                      <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                        {section.group?.name ?? t('can.autoUngrouped')}
                      </h4>
                    </div>
                    <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-wider">
                      <span className="text-gray-500">{t('can.autoReportScenarios')}: {sectionScenarioPassed}/{section.profiles.length}</span>
                      <span className="text-gray-500">{t('can.autoReportStepResults')}: {sectionStepPassed}/{sectionStepTotal}</span>
                      <span className="text-rose-600">✗ {sectionScenarioFailed}</span>
                      {sectionStepFailed > 0 && <span className="text-rose-500">{t('can.autoReportStepFailed')}: {sectionStepFailed}</span>}
                      <span className={sectionStatus ? 'text-emerald-700' : 'text-rose-700'}>
                        {sectionStatus ? t('can.autoReportPassed') : t('can.autoReportFailed')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Profiles in this group */}
                {section.profiles.map((profile, pIdx) => {
                const profileResults = getProfileResults(profile.id);
                const profilePassed = profileResults.filter(r => r.passed).length;
                const profileFailed = profileResults.filter(r => !r.passed).length;

                return (
                  <div key={profile.id} className={pIdx > 0 ? 'mt-5' : ''}>
                    {/* Scenario header */}
                    <div className="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-wider">
                          {t('can.autoReportScenario')}: {profile.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] font-bold">
                        <span className="text-gray-500">{t('can.autoReportTotal')}: {profileResults.length}</span>
                        <span className="text-emerald-600">✓ {profilePassed}</span>
                        <span className="text-rose-600">✗ {profileFailed}</span>
                        {profileFailed === 0 && profileResults.length > 0 ? (
                          <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} /> {t('can.autoReportPassed')}</span>
                        ) : profileFailed > 0 ? (
                          <span className="flex items-center gap-1 text-rose-600"><XCircle size={11} /> {t('can.autoReportFailed')}</span>
                        ) : null}
                      </div>
                    </div>

                    <table className="w-full text-[10px] border-collapse mb-2">
                      <thead>
                        <tr className="bg-gray-900 text-white">
                          <th className="py-3 px-3 text-left font-black uppercase tracking-widest">{t('can.autoReportTime')}</th>
                          <th className="py-3 px-3 text-left font-black uppercase tracking-widest">{t('can.autoReportType')}</th>
                          <th className="py-3 px-3 text-left font-black uppercase tracking-widest">{t('can.autoReportStep')}</th>
                          <th className="py-3 px-3 text-left font-black uppercase tracking-widest">{t('can.autoReportExpected')}</th>
                          <th className="py-3 px-3 text-left font-black uppercase tracking-widest">{t('can.autoReportActual')}</th>
                          <th className="py-3 px-3 text-right font-black uppercase tracking-widest">{t('can.autoReportStatus')}</th>
                        </tr>
                      </thead>
                      <tbody className="border border-gray-100">
                        {profileResults.map((result, idx) => (
                          <tr key={`${result.stepId}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="py-3 px-3 border-b border-gray-100 font-mono text-gray-500">{formatTime(result.timeMs)}</td>
                            <td className="py-3 px-3 border-b border-gray-100">
                              <div className="flex items-center gap-1">
                                {stepTypeIcon(result.type)}
                                <span className="text-gray-600">{stepTypeName(result.type)}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 border-b border-gray-100 font-bold text-gray-800">{result.label}</td>
                            <td className="py-3 px-3 border-b border-gray-100 font-mono text-gray-500">{result.expected ?? '—'}</td>
                            <td className="py-3 px-3 border-b border-gray-100 font-mono text-gray-500">{result.actual ?? '—'}</td>
                            <td className="py-3 px-3 border-b border-gray-100 text-right">
                              {result.passed ? (
                                <span className="flex items-center justify-end gap-1 text-emerald-600 font-black">
                                  <CheckCircle2 size={11} /> {t('can.autoReportPassed')}
                                </span>
                              ) : (
                                <span className="flex items-center justify-end gap-1 text-rose-600 font-black">
                                  <XCircle size={11} /> {t('can.autoReportFailed')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-auto pt-12 border-t border-gray-100 flex justify-between items-end">
          <div className="text-[9px] text-gray-400 space-y-1">
            <p>{t('can.autoReportBrand')}</p>
            <p className="font-mono">Generated: {new Date(runAt).toISOString()}</p>
          </div>
          <div className="flex gap-12">
            <div className="text-center w-40">
              <div className="h-12 border-b-2 border-gray-200 mb-2" />
              <p className="text-[10px] font-bold text-gray-400 uppercase">{t('validation.engineer')}</p>
            </div>
            <div className="text-center w-40">
              <div className="h-12 border-b-2 border-gray-200 mb-2" />
              <p className="text-[10px] font-bold text-gray-400 uppercase">{t('validation.qualityAssurance')}</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:mt-0 { margin-top: 0 !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:rounded-none { border-radius: 0 !important; }
          .print\\:w-full { width: 100% !important; }
          .print\\:m-0 { margin: 0 !important; }
          @page { margin: 0; }
        }
      `}</style>
    </div>
  );
}
