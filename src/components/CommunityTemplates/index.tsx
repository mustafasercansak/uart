import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import type { SensorTemplate } from '../../types';
import type { FrameProfile, Scenario } from '../../types';
import { saveProfile, saveScenario, getProfile, loadScenarios } from '../../store/storage';
import { open as openUrl } from '@tauri-apps/plugin-shell';
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
  const { setProfile, updateLayout, setScenario, state } = useSimulation();

  const [index, setIndex] = useState<CommunityIndex | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('uart_community_favorites');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('uart_community_favorites', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const [showFavOnly, setShowFavOnly] = useState(false);

  // loading is true until the fetch for the current retryCount completes
  const loading = fetchedAt !== retryCount;

  useEffect(() => {
    let cancelled = false;
    fetch(`${COMMUNITY_INDEX_URL}?v=${retryCount}`)
      .then((res) => { if (!res.ok) throw new Error('fetch failed'); return res.json(); })
      .then((data: CommunityIndex) => {
        if (!cancelled) { setIndex(data); setError(false); setFetchedAt(retryCount); }
      })
      .catch(() => {
        if (!cancelled) { setError(true); setFetchedAt(retryCount); }
      });
    return () => { cancelled = true; };
  }, [retryCount]);

  const submitActiveProfile = () => {
    const profile = getProfile(`${state.profileId}`);
    if (!profile) return;

    const scenarios = loadScenarios().filter((s) => s.profileId === profile.id);

    const template: SensorTemplate = {
      id: `community-${profile.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
      name: profile.name,
      description: profile.description || '',
      icon: '📡',
      category: 'general',
      profile: {
        name: profile.name,
        description: profile.description,
        baudRate: profile.baudRate,
        dataBits: profile.dataBits,
        parity: profile.parity,
        stopBits: profile.stopBits,
        sendIntervalMs: profile.sendIntervalMs,
        framing: profile.framing,
        fields: profile.fields,
      },
      scenarios: scenarios.map(({ id: _id, profileId: _pid, createdAt: _c, updatedAt: _u, ...rest }) => rest),
    };

    const json = JSON.stringify(template, null, 2);
    const body = `## Community Template Submission\n\n**Template Name:** ${profile.name}\n**Category:** general\n**Author:** (your GitHub username)\n\n### Template JSON\n\`\`\`json\n${json}\n\`\`\`\n\n### Description\n(Describe what this template simulates and how to use it.)`;
    const url = `https://github.com/mustafasercansak/uart/issues/new?title=${encodeURIComponent(`Community Template: ${profile.name}`)}&body=${encodeURIComponent(body)}&labels=community-template`;
    openUrl(url);
  };

  const importTemplate = async (entry: CommunityEntry) => {
    setImporting(entry.id);
    try {
      const base = COMMUNITY_INDEX_URL.replace('index.json', '');
      const res = await fetch(`${base}${entry.file}`);
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
          onClick={() => setRetryCount((c) => c + 1)}
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
        <button
          onClick={submitActiveProfile}
          disabled={!state.profileId}
          className="px-3 py-1.5 rounded text-xs font-mono bg-green-900/20 border border-green-800/40 text-green-400 hover:border-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('templateBrowser.community.submit')}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-gray-500 text-xs font-mono">{t('templateBrowser.community.subtitle')}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFavOnly(v => !v)}
            className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
              showFavOnly
                ? 'bg-yellow-900/30 border-yellow-700 text-yellow-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
            title={t('templateBrowser.community.showFavorites')}
          >
            {showFavOnly ? '★ ' : '☆ '}{t('templateBrowser.community.favorites')} ({favorites.size})
          </button>
          <button
            onClick={submitActiveProfile}
            disabled={!state.profileId}
            title={state.profileId ? t('templateBrowser.community.submit') : t('templateBrowser.community.submitNoProfile')}
            className="px-3 py-1.5 rounded text-xs font-mono bg-green-900/20 border border-green-800/40 text-green-400 hover:border-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('templateBrowser.community.submit')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {index.templates
          .filter(e => !showFavOnly || favorites.has(e.id))
          .sort((a, b) => (favorites.has(b.id) ? 1 : 0) - (favorites.has(a.id) ? 1 : 0))
          .map((entry) => {
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleFavorite(entry.id)}
                      className={`text-base transition-colors ${favorites.has(entry.id) ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
                      title={favorites.has(entry.id) ? t('templateBrowser.community.unfavorite') : t('templateBrowser.community.favorite')}
                    >
                      {favorites.has(entry.id) ? '★' : '☆'}
                    </button>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${CATEGORY_COLORS[entry.category] ?? 'text-gray-400 bg-gray-700 border-gray-600'}`}>
                      {t(`templateBrowser.categories.${entry.category}`, { defaultValue: entry.category })}
                    </span>
                  </div>
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
