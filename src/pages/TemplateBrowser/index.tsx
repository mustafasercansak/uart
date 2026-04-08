import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import type { FrameProfile, Scenario } from '../../types';
import { SENSOR_TEMPLATES } from '../../data/templates';
import { saveProfile, saveScenario } from '../../store/storage';

const CATEGORY_COLORS: Record<string, string> = {
  Tıbbi: 'text-red-400 bg-red-900/20 border-red-800/40',
  Çevresel: 'text-green-400 bg-green-900/20 border-green-800/40',
  Genel: 'text-gray-400 bg-gray-800/40 border-gray-700/40',
};

export default function TemplateBrowser() {
  const navigate = useNavigate();
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');

  const categories = ['Tümü', ...Array.from(new Set(SENSOR_TEMPLATES.map((t) => t.category)))];

  const filteredTemplates = selectedCategory === 'Tümü'
    ? SENSOR_TEMPLATES
    : SENSOR_TEMPLATES.filter((t) => t.category === selectedCategory);

  const applyTemplate = async (templateId: string) => {
    const template = SENSOR_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    setApplying(templateId);
    const now = new Date().toISOString();

    // Create profile
    const profileId = uuidv4();
    const profile: FrameProfile = {
      ...template.profile,
      id: profileId,
      createdAt: now,
      updatedAt: now,
    };
    saveProfile(profile);

    // Create scenarios
    for (const scenarioDef of template.scenarios) {
      const scenario: Scenario = {
        ...scenarioDef,
        id: uuidv4(),
        profileId,
        steps: scenarioDef.steps.map((s) => ({ ...s, id: uuidv4() })),
        createdAt: now,
        updatedAt: now,
      };
      saveScenario(scenario);
    }

    setApplied(templateId);
    setApplying(null);
    setTimeout(() => setApplied(null), 3000);
  };

  return (
    <div className="h-full overflow-auto p-6 bg-gray-900">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold font-mono text-gray-200 mb-1">Şablon Kütüphanesi</h1>
          <p className="text-gray-500 text-sm font-mono">Hazır sensör şablonlarından profil ve senaryo oluşturun</p>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-6">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                selectedCategory === cat
                  ? 'bg-green-900/30 border-green-700 text-green-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-4 border-b border-gray-700 bg-gray-850">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-3xl">{template.icon}</div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${CATEGORY_COLORS[template.category] ?? 'text-gray-400 bg-gray-700 border-gray-600'}`}>
                    {template.category}
                  </span>
                </div>
                <h3 className="text-gray-200 font-mono font-bold text-sm">{template.name}</h3>
                <p className="text-gray-500 text-xs font-mono mt-1 leading-relaxed">{template.description}</p>
              </div>

              {/* Frame Structure Preview */}
              <div className="p-3 border-b border-gray-700">
                <div className="text-gray-600 text-[10px] font-mono uppercase mb-2">Frame Yapısı</div>
                <div className="flex flex-wrap gap-1">
                  {template.profile.fields.map((field) => (
                    <div key={field.id} className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                      field.type === 'fixed' ? 'bg-gray-700 border-gray-600 text-gray-400' :
                      field.type === 'range' ? 'bg-blue-900/40 border-blue-800 text-blue-300' :
                      field.type === 'waveform' ? 'bg-purple-900/40 border-purple-800 text-purple-300' :
                      field.type === 'checksum' ? 'bg-orange-900/40 border-orange-800 text-orange-300' :
                      field.type === 'flags' ? 'bg-yellow-900/40 border-yellow-800 text-yellow-300' :
                      'bg-gray-700 border-gray-600 text-gray-400'
                    }`}>
                      {field.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="px-4 py-2 border-b border-gray-700 flex gap-4 text-[10px] font-mono text-gray-600">
                <span>{template.profile.baudRate} bps</span>
                <span>{template.profile.fields.reduce((s, f) => s + f.byteWidth, 0)} byte/frame</span>
                <span>{template.profile.sendIntervalMs}ms aralık</span>
                {template.scenarios.length > 0 && <span className="text-green-600">{template.scenarios.length} senaryo</span>}
              </div>

              {/* Actions */}
              <div className="p-3 flex gap-2">
                {applied === template.id ? (
                  <div className="flex-1 text-center text-green-400 text-xs font-mono py-1.5">✓ Profil oluşturuldu!</div>
                ) : (
                  <button
                    onClick={() => applyTemplate(template.id)}
                    disabled={applying === template.id}
                    className="flex-1 py-2 bg-green-900/30 border border-green-800/50 text-green-400 text-xs font-mono rounded hover:bg-green-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                  >
                    {applying === template.id ? 'Oluşturuluyor...' : '⚡ Bu Şablonu Kullan'}
                  </button>
                )}
                <button
                  onClick={() => navigate('/profiles')}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 text-gray-400 text-xs font-mono rounded hover:bg-gray-600 hover:text-gray-200 transition-colors"
                  title="Profillere git"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-gray-800/50 rounded-xl border border-gray-700 p-4">
          <div className="text-gray-400 text-sm font-mono font-bold mb-2">ℹ Alan Renk Kodu</div>
          <div className="flex flex-wrap gap-3 text-xs font-mono">
            <span className="bg-gray-700 border border-gray-600 text-gray-400 px-2 py-0.5 rounded">fixed — Sabit</span>
            <span className="bg-blue-900/40 border border-blue-800 text-blue-300 px-2 py-0.5 rounded">range — Rastgele Aralık</span>
            <span className="bg-purple-900/40 border border-purple-800 text-purple-300 px-2 py-0.5 rounded">waveform — Dalga</span>
            <span className="bg-orange-900/40 border border-orange-800 text-orange-300 px-2 py-0.5 rounded">checksum — Checksum</span>
            <span className="bg-yellow-900/40 border border-yellow-800 text-yellow-300 px-2 py-0.5 rounded">flags — Bayraklar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
