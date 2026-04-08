import type { FrameProfile, Scenario } from '../types';

// ─────────────────────────────────────────────
// LOCALSTORAGE TABANLI DEPOLAMA
// ─────────────────────────────────────────────

const PROFILES_KEY = 'uart_profiles';
const SCENARIOS_KEY = 'uart_scenarios';

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Profiles ─────────────────────────────────

export function loadProfiles(): FrameProfile[] {
  return load<FrameProfile>(PROFILES_KEY);
}

export function saveProfiles(profiles: FrameProfile[]): void {
  save(PROFILES_KEY, profiles);
}

export function saveProfile(profile: FrameProfile): void {
  const profiles = loadProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) profiles[idx] = profile;
  else profiles.push(profile);
  saveProfiles(profiles);
}

export function deleteProfile(id: string): void {
  const profiles = loadProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
}

export function getProfile(id: string): FrameProfile | null {
  return loadProfiles().find((p) => p.id === id) ?? null;
}

// ── Scenarios ─────────────────────────────────

export function loadScenarios(): Scenario[] {
  return load<Scenario>(SCENARIOS_KEY);
}

export function saveScenarios(scenarios: Scenario[]): void {
  save(SCENARIOS_KEY, scenarios);
}

export function saveScenario(scenario: Scenario): void {
  const scenarios = loadScenarios();
  const idx = scenarios.findIndex((s) => s.id === scenario.id);
  if (idx >= 0) scenarios[idx] = scenario;
  else scenarios.push(scenario);
  saveScenarios(scenarios);
}

export function deleteScenario(id: string): void {
  const scenarios = loadScenarios().filter((s) => s.id !== id);
  saveScenarios(scenarios);
}

export function getScenario(id: string): Scenario | null {
  return loadScenarios().find((s) => s.id === id) ?? null;
}

// ── Import / Export ───────────────────────────

export function exportAsJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromJson<T>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        resolve(data as T);
      } catch (err) {
        reject(new Error('Geçersiz JSON dosyası'));
      }
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsText(file);
  });
}
