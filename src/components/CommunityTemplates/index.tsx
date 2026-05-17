import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import type { SensorTemplate } from '../../types';
import type { FrameProfile, Scenario } from '../../types';
import { saveProfile, saveScenario } from '../../store/storage';
import { useSimulation } from '../../hooks/useSimulation';
import { useTranslation } from '../../i18n/context';

const COMMUNITY_INDEX_URL =
  'https://mustafasercansak.github.io/uart/community-templates/index.json';

const CATEGORY_COLORS: Record<string, string> = {
  medical: 'text-red-400 bg-red-900/20 border-red-800/40',
  medical_humanity: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
  environmental: 'text-green-400 bg-green-900/20 border-emerald-800/40',
  general: 'text-gray-400 bg-gray-800/40 border-gray-700/40',
  industrial: 'text-orange-400 bg-orange-900/20 border-orange-800/40',
  navigation: 'text-blue-400 bg-blue-900/20 border-blue-800/40',
};

interface CommunityEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  icon: string;
  tags: string[];
  submittedAt: string;
  file: string;
}

interface CommunityIndex {
  format: string;
  version: string;
  updatedAt: string;
  templates: CommunityEntry[];
}

export default function CommunityTemplates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setProfile, updateLayout, setScenario } = useSimulation();

  const [index, setIndex] = useState<CommunityIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);

  const fetchIndex = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${COMMUNITY_INDEX_URL}?t=${Date.now()}`);
      if (!res.ok) throw new Error('fetch failed');
      const data: CommunityIndex = await res.json();
      setIndex(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIndex(); }, [fetchIndex]);

  const importTemplate = async (entry: CommunityEntry) => {
    setImporting(entry.id);
    try {
      const base = COMMUNITY_INDEX_URL.replace('index.json', '');
      const res = await fetch(`${base}${entry.file}?t=${Date.now()}`);
      if (!res.ok) throw new Error('fetch failed');
      const template: SensorTemplate = await res.json();

      const now = new Date().toISOString();
      const profileId = uuidv4();
      const profile: FrameProfile = {
        ...template.profile,
        id: profileId,
        createdAt: now,
        updatedAt: now,
      };
      saveProfile(profile);

      let firstScenarioId: string | null = null;
      for (const scenarioDef of template.scenarios) {
        const sId = uuidv4();
        if (!firstScenarioId) firstScenarioId = sId;
        const scenario: Scenario = {
          ...scenarioDef,
          id: sId,
          profileId,
          steps: scenarioDef.steps.map((s) => ({ ...s, id: uuidv4() })),
          createdAt: now,
          updatedAt: now,
        };
        saveScenario(scenario);
      }

      setProfile(profileId);
      if (template.defaultLayout) updateLayout(template.defaultLayout.widgets);
      if (firstScenarioId) setScenario(firstScenarioId);

      setImported(entry.id);
      setTimeout(() => navigate('/'), 1000);
    } catch {
      setImporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 font-mono text-sm">
        <span className="animate-pulse">{t('templateBrowser.community.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <p className="text-red-400 font-mono text-sm">{t('templateBrowser.community.error')}</p>
        <button
          onClick={fetchIndex}
          className="px-3 py-1.5 rounded text-xs font-mono bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500"
        >
          {t('templateBrowser.community.retry')}
        </button>
      </div>
    );
  }

  if (!index || index.templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-4">
        <p className="text-gray-500 font-mono text-sm">{t('templateBrowser.community.empty')}</p>
        <a
          href="https://github.com/mustafasercansak/uart/pulls"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded text-xs font-mono bg-green-900/20 border border-green-800/40 text-green-400 hover:border-green-600"
        >
          {t('templateBrowser.community.submit')}
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-xs font-mono">{t('templateBrowser.community.subtitle')}</p>
        <a
          href="https://github.com/mustafasercansak/uart/pulls"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded text-xs font-mono bg-green-900/20 border border-green-800/40 text-green-400 hover:border-green-600 transition-colors"
        >
          {t('templateBrowser.community.submit')}
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {index.templates.map((entry) => {
          const isImporting = importing === entry.id;
          const isImported = imported === entry.id;
          return (
            <div
              key={entry.id}
              className="bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors overflow-hidden"
            >
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-3xl">{entry.icon}</div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${CATEGORY_COLORS[entry.category] ?? 'text-gray-400 bg-gray-700 border-gray-600'}`}>
                    {t(`templateBrowser.categories.${entry.category}`, { defaultValue: entry.category })}
                  </span>
                </div>
                <h3 className="text-gray-200 font-mono font-bold text-sm">{entry.name}</h3>
                <p className="text-gray-500 text-xs font-mono mt-1 leading-relaxed">{entry.description}</p>
              </div>

              <div className="p-3 border-b border-gray-700">
                <div className="flex flex-wrap gap-1">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600 text-gray-400">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-mono">
                  {t('templateBrowser.community.by')} {entry.author}
                </span>
                <button
                  onClick={() => importTemplate(entry)}
                  disabled={isImporting || isImported}
                  className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                    isImported
                      ? 'bg-green-900/30 border-green-700 text-green-400'
                      : isImporting
                        ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-wait'
                        : 'bg-blue-900/20 border-blue-800/40 text-blue-400 hover:border-blue-600 hover:bg-blue-900/30'
                  }`}
                >
                  {isImported
                    ? t('templateBrowser.community.imported')
                    : isImporting
                      ? t('templateBrowser.community.importing')
                      : t('templateBrowser.community.import')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
