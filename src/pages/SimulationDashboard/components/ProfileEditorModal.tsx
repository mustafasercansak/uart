import React, { useState } from 'react';
import { X, Save, Code, Plus, Trash2, Settings2 } from 'lucide-react';
import type { FrameProfile, Field, FramingConfig, FramingMode } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { parseCHeader } from '../../../engines/CHeaderImporter';

interface ProfileEditorModalProps {
  profile: FrameProfile | null;
  onSave: (profile: FrameProfile) => void;
  onClose: () => void;
}

const ProfileEditorModal: React.FC<ProfileEditorModalProps> = ({ profile, onSave, onClose }) => {
  const [edited, setEdited] = useState<FrameProfile>(profile || {
    id: uuidv4(),
    name: 'Yeni Profil',
    description: '',
    baudRate: 9600,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 100,
    fields: [],
    framing: { mode: 'fixed' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const [importText, setImportText] = useState('');
  const [showImporter, setShowImporter] = useState(false);

  const handleImport = () => {
    const fields = parseCHeader(importText);
    setEdited({ ...edited, fields: [...edited.fields, ...fields] });
    setShowImporter(false);
    setImportText('');
  };

  const addField = () => {
    const newField: Field = {
      id: uuidv4(),
      name: `Field_${edited.fields.length + 1}`,
      order: edited.fields.length,
      byteWidth: 1,
      endianness: 'big',
      type: 'fixed',
      typeConfig: { value: 0 }
    };
    setEdited({ ...edited, fields: [...edited.fields, newField] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
      <div className="bg-gray-950 border border-gray-800 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/40">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Settings2 className="text-emerald-500" size={20} />
             </div>
             <div>
                <h2 className="text-sm font-black text-gray-200 uppercase tracking-tighter">Profil Düzenleyici</h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Gelişmiş Paket Yapılandırması</p>
             </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8 custom-scrollbar">
          {/* Left Column: Basic Info & Framing */}
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-[11px] text-emerald-500 font-bold uppercase tracking-widest border-l-2 border-emerald-500 pl-2">Temel Ayarlar</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Profil Adı</label>
                  <input 
                    value={edited.name}
                    onChange={e => setEdited({...edited, name: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-800 text-xs p-2 rounded focus:border-emerald-500 outline-none text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Baud Rate</label>
                  <input 
                    type="number"
                    value={edited.baudRate}
                    onChange={e => setEdited({...edited, baudRate: parseInt(e.target.value)})}
                    className="w-full bg-gray-900 border border-gray-800 text-xs p-2 rounded focus:border-emerald-500 outline-none text-gray-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase block mb-1">Interval (ms)</label>
                  <input 
                    type="number"
                    value={edited.sendIntervalMs}
                    onChange={e => setEdited({...edited, sendIntervalMs: parseInt(e.target.value)})}
                    className="w-full bg-gray-900 border border-gray-800 text-xs p-2 rounded focus:border-emerald-500 outline-none text-gray-200"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
               <h3 className="text-[11px] text-blue-500 font-bold uppercase tracking-widest border-l-2 border-blue-500 pl-2">Framing (Paketleme)</h3>
               <div className="bg-gray-900/50 p-4 border border-gray-800 rounded-lg space-y-4">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase block mb-1">Mod</label>
                    <select 
                      value={edited.framing.mode}
                      onChange={e => setEdited({...edited, framing: {...edited.framing, mode: e.target.value as FramingMode}})}
                      className="w-full bg-gray-950 border border-gray-800 text-xs p-2 rounded outline-none text-gray-300"
                    >
                      <option value="fixed">Fixed Width (Sabit)</option>
                      <option value="delimiter">Delimiter (\n, \r)</option>
                      <option value="slip">SLIP Protocol</option>
                      <option value="cobs">COBS Protocol</option>
                    </select>
                  </div>
                  {edited.framing.mode === 'delimiter' && (
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Delimiter (HEX)</label>
                      <input 
                        placeholder="Örn: 0A"
                        onChange={e => setEdited({...edited, framing: {...edited.framing, delimiter: parseInt(e.target.value, 16)}})}
                        className="w-full bg-gray-950 border border-gray-800 text-xs p-2 rounded outline-none text-yellow-500"
                      />
                    </div>
                  )}
               </div>
            </section>
          </div>

          {/* Right Column: Fields & Importer */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
               <h3 className="text-[11px] text-purple-500 font-bold uppercase tracking-widest border-l-2 border-purple-500 pl-2">Alanlar (Fields)</h3>
               <div className="flex gap-2">
                 <button 
                   onClick={() => setShowImporter(!showImporter)}
                   className="text-[9px] flex items-center gap-1 bg-purple-900/30 text-purple-400 border border-purple-800 px-2 py-1 rounded hover:bg-purple-900/50"
                 >
                   <Code size={12} />
                   C STRUCT IMPORT
                 </button>
                 <button 
                   onClick={addField}
                   className="text-[9px] flex items-center gap-1 bg-emerald-900/30 text-emerald-400 border border-emerald-800 px-2 py-1 rounded hover:bg-emerald-900/50"
                 >
                   <Plus size={12} />
                   EKLE
                 </button>
               </div>
            </div>

            {showImporter && (
              <div className="bg-gray-900 border border-purple-500/30 p-3 rounded-lg space-y-2 animate-in fade-in zoom-in-95">
                <p className="text-[9px] text-purple-400 uppercase font-bold">C struct kodunu buraya yapıştırın:</p>
                <textarea 
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  className="w-full h-32 bg-gray-950 border border-gray-800 text-[10px] p-2 rounded font-mono text-purple-200 outline-none"
                  placeholder="struct MyData { uint32_t id; ... };"
                />
                <button 
                  onClick={handleImport}
                  className="w-full bg-purple-600 text-white text-[10px] py-1.5 rounded font-black hover:bg-purple-500"
                >
                  PARSE VE EKLE
                </button>
              </div>
            )}

            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {edited.fields.length === 0 && (
                <div className="text-center py-10 text-gray-700 text-[10px] uppercase tracking-widest border border-dashed border-gray-800 rounded-lg">
                  Henüz alan tanımlanmadı
                </div>
              )}
              {edited.fields.map((field, idx) => (
                <div key={field.id} className="bg-gray-900/40 border border-gray-800 p-3 rounded-lg flex items-center gap-3 group relative hover:border-gray-700">
                  <div className="text-[10px] text-gray-600 font-bold w-4">#{idx}</div>
                  <div className="flex-1">
                    <input 
                      value={field.name}
                      onChange={e => {
                        const newFields = [...edited.fields];
                        newFields[idx].name = e.target.value;
                        setEdited({...edited, fields: newFields});
                      }}
                      className="bg-transparent text-[11px] font-bold text-gray-300 w-full outline-none focus:text-emerald-400"
                    />
                    <div className="text-[9px] text-gray-600 mt-1 uppercase flex gap-2">
                       <span>Boyut: {field.byteWidth} Byte</span>
                       <span>•</span>
                       <span>{field.endianness}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setEdited({...edited, fields: edited.fields.filter(f => f.id !== field.id)});
                    }}
                    className="p-1.5 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-900/60 border-t border-gray-800 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2 text-xs font-bold text-gray-500 hover:text-white transition-colors uppercase"
          >
            İptal
          </button>
          <button 
            onClick={() => onSave(edited)}
            className="px-8 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20 uppercase tracking-tighter"
          >
            <Save size={16} />
            Profili Kaydet
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditorModal;
