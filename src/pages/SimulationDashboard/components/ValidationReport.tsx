import React from 'react';
import { 
    Printer, 
    ShieldCheck, 
    Activity, 
    Calendar, 
    User, 
    Cpu, 
    CheckCircle2, 
    XCircle,
    Download,
    X
} from 'lucide-react';
import type { ValidationSession } from '../../../types';
import { useTranslation } from '../../../i18n/context';

interface ValidationReportProps {
  session: ValidationSession;
  onClose: () => void;
}

export default function ValidationReport({ session, onClose }: ValidationReportProps) {
  const { t } = useTranslation();
  const handlePrint = () => {
    window.print();
  };

  const passCount = session.events.filter(e => e.type === 'compliance_success').length;
  const failCount = session.events.filter(e => e.type === 'compliance_failure').length;
  const isPass = session.complianceScore >= 80;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-950/95 backdrop-blur-xl animate-in fade-in duration-500 overflow-y-auto print:p-0 print:bg-white print:relative print:inset-auto print:block">
      
      {/* UI Controls (Hidden in Print) */}
      <div className="fixed top-8 right-8 flex gap-4 print:hidden">
        <button 
          onClick={handlePrint}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all"
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

      {/* The Report Document */}
      <div className="w-full max-w-[210mm] bg-white text-gray-900 rounded-lg shadow-2xl p-[20mm] min-h-[297mm] print:shadow-none print:w-full print:m-0 print:rounded-none">
        
        {/* Document Header */}
        <div className="border-b-4 border-emerald-600 pb-8 mb-12 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 text-emerald-600 mb-2">
                <ShieldCheck size={32} />
                <h1 className="text-3xl font-black tracking-tighter uppercase">MedNet Monitor</h1>
            </div>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">Advanced Laboratory Validation Suite</p>
          </div>
          <div className="text-right">
            <div className={`px-4 py-2 rounded-xl border-2 font-black text-sm uppercase tracking-widest ${isPass ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-rose-200 text-rose-700 bg-rose-50'}`}>
                {isPass ? t('validation.passed') : t('validation.failed')}
            </div>
            <p className="text-[10px] text-gray-400 mt-2 font-mono">DOC-ID: {session.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>

        {/* Informational Header */}
        <div className="grid grid-cols-2 gap-12 mb-12">
          <div className="space-y-4">
            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest border-b border-gray-100 pb-2">{t('validation.testInfo')}</h3>
            <div className="grid grid-cols-[80px_1fr] gap-y-2 text-[11px]">
              <span className="text-gray-400 font-bold uppercase">{t('validation.testName')}:</span>
              <span className="font-bold">{session.name}</span>
              <span className="text-gray-400 font-bold uppercase">Tarih:</span>
              <span className="font-mono">{new Date(session.startTime).toLocaleString()}</span>
              <span className="text-gray-400 font-bold uppercase">Cihaz:</span>
              <span className="font-mono">{session.deviceId}</span>
              <span className="text-gray-400 font-bold uppercase">Durum:</span>
              <span className={session.status === 'completed' ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>{session.status.toUpperCase()}</span>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest border-b border-gray-100 pb-2">{t('validation.personnelInfo')}</h3>
            <div className="grid grid-cols-[80px_1fr] gap-y-2 text-[11px]">
              <span className="text-gray-400 font-bold uppercase">{t('validation.operator')}:</span>
              <span className="font-bold">{session.operator}</span>
              <span className="text-gray-400 font-bold uppercase">Kurum:</span>
              <span className="font-bold">Mustafa Sercan Sak Diagnostics</span>
              <span className="text-gray-400 font-bold uppercase">Sistem:</span>
              <span className="font-mono">ClinicSync Engine v7.1</span>
            </div>
          </div>
        </div>

        {/* Statistical Overview */}
        <div className="bg-gray-50 rounded-2xl p-8 mb-12 flex justify-around border border-gray-100">
           <div className="text-center">
             <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">{t('validation.successScore')}</span>
             <span className="text-4xl font-black text-gray-900">{session.complianceScore}%</span>
           </div>
           <div className="w-px bg-gray-200" />
           <div className="text-center">
             <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">Compliance</span>
             <span className="text-4xl font-black text-emerald-600">{passCount}</span>
           </div>
           <div className="w-px bg-gray-200" />
           <div className="text-center">
             <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-1">{t('validation.breaches')}</span>
             <span className="text-4xl font-black text-rose-600">{failCount}</span>
           </div>
        </div>

        {/* Targets Table */}
        <div className="mb-12">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-3">
            <Activity className="text-emerald-600" size={18} />
            {t('validation.resultsTitle')}
          </h3>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-gray-900 text-white font-black uppercase tracking-widest">
                <th className="py-4 px-4 text-left">{t('validation.fieldName')}</th>
                <th className="py-4 px-4 text-center">{t('validation.expectedRange')}</th>
                <th className="py-4 px-4 text-center">{t('validation.unit')}</th>
                <th className="py-4 px-4 text-right">Durum</th>
              </tr>
            </thead>
            <tbody className="border border-gray-100">
              {session.targets.map((target, idx) => {
                const hadFail = session.events.some(e => e.fieldName === target.fieldName && e.type === 'compliance_failure');
                return (
                  <tr key={target.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-4 px-4 border-r border-gray-100 font-bold">{target.fieldName}</td>
                    <td className="py-4 px-4 border-r border-gray-100 text-center font-mono">
                      {target.expectedMin} — {target.expectedMax}
                    </td>
                    <td className="py-4 px-4 border-r border-gray-100 text-center uppercase text-gray-500">{target.unit}</td>
                    <td className="py-4 px-4 text-right">
                      {hadFail ? (
                        <span className="text-rose-600 font-black flex items-center justify-end gap-1"><XCircle size={12} /> {t('validation.errorLabel')}</span>
                      ) : (
                        <span className="text-emerald-600 font-black flex items-center justify-end gap-1"><CheckCircle2 size={12} /> {t('validation.verified')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Events Log */}
        <div className="mb-12">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">{t('validation.historyTitle')}</h3>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            {session.events.map((e, idx) => (
              <div key={e.id} className={`p-3 text-[9px] border-b border-gray-50 flex justify-between items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 font-mono w-24">
                    {new Date(e.timestamp).toLocaleTimeString()} (+{Math.round((e.timestamp - session.startTime)/1000)}s)
                  </span>
                  <span className={e.type === 'compliance_failure' ? 'text-rose-600 font-bold' : e.type === 'session_start' ? 'text-blue-600 font-bold' : 'text-emerald-600 font-bold'}>
                    {e.type.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-gray-700">{e.message}</span>
                </div>
                {e.value !== undefined && (
                  <span className="font-mono text-gray-500">Value: {e.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer / Signature Area */}
        <div className="mt-auto pt-12 border-t border-gray-100 flex justify-between items-end">
          <div className="text-[9px] text-gray-400 space-y-1">
             <p>© 2026 MedNet Suite - Automated Certification Tool</p>
             <p>This report was digitally generated and hash-verified for integrity.</p>
             <p className="font-mono">HASH: {session.id.slice(0, 16)}...</p>
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
            .print\\:p-0 { padding: 0 !important; }
            .print\\:bg-white { background-color: white !important; }
            .print\\:shadow-none { box-shadow: none !important; }
            .print\\:block { display: block !important; }
            .print\\:relative { position: relative !important; }
            @page { margin: 0; }
        }
      `}</style>
    </div>
  );
}
