import React, { useState, memo } from 'react';
import { Play, Save, Info, AlertTriangle, Code } from 'lucide-react';
import { useTranslation } from '../../../../i18n/context';

interface ScriptEditorProps {
  initialCode?: string;
  onSave: (code: string) => void;
}

const ScriptEditor = memo(({ initialCode = '', onSave }: ScriptEditorProps) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(initialCode || t('scriptEditor.defaultCode'));

  return (
    <div className="flex-1 flex flex-col p-6 space-y-4 h-full bg-transparent">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Code className="text-yellow-500" size={20} />
          <div>
            <h2 className="text-gray-200 text-xs font-black uppercase tracking-widest">{t('scriptEditor.title')}</h2>
            <p className="text-[10px] text-gray-500 font-mono italic">{t('scriptEditor.subTitle')}</p>
          </div>
        </div>
        <button
          onClick={() => onSave(code)}
          className="flex items-center gap-2 px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-black text-[10px] font-black rounded-lg transition-all shadow-lg shadow-yellow-900/20"
        >
          <Save size={14} />
          {t('scriptEditor.saveScript')}
        </button>
      </div>

      <div className="flex-1 min-h-0 relative group">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="w-full h-full bg-gray-950/80 border border-gray-800 p-4 font-mono text-xs text-gray-200 outline-none focus:border-yellow-900/50 rounded-xl resize-none shadow-inner custom-scrollbar"
        />
        <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-100 transition-opacity pointer-events-none">
           <Code size={48} className="text-yellow-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
           <div className="flex items-center gap-2 mb-2">
             <Info size={14} className="text-blue-400" />
             <span className="text-[10px] font-mono font-black text-blue-400 uppercase">{t('scriptEditor.inputVars')}</span>
           </div>
           <ul className="text-[9px] font-mono text-gray-500 space-y-1">
             <li>• <span className="text-gray-300">bytes:</span> {t('scriptEditor.bytesVar')}</li>
             <li>• <span className="text-gray-300">state:</span> {t('scriptEditor.stateVar')}</li>
           </ul>
        </div>

        <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-xl">
           <div className="flex items-center gap-2 mb-2">
             <AlertTriangle size={14} className="text-orange-400" />
             <span className="text-[10px] font-mono font-black text-orange-400 uppercase">{t('scriptEditor.returnFormat')}</span>
           </div>
           <ul className="text-[9px] font-mono text-gray-500 space-y-1">
             <li>• <span className="text-gray-300">sendHex:</span> {t('scriptEditor.sendHexVar')}</li>
             <li>• <span className="text-gray-300">setFields:</span> {t('scriptEditor.setFieldsVar')}</li>
           </ul>
        </div>
      </div>
      
      <div className="text-[9px] text-gray-600 font-mono italic text-center">
        {t('scriptEditor.warning')}
      </div>
    </div>
  );
});

ScriptEditor.displayName = 'ScriptEditor';
export default ScriptEditor;
