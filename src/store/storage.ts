import type { FrameProfile, Scenario, FixedConfig, RangeConfig, WaveformConfig, ChecksumConfig } from '../types';

// ─────────────────────────────────────────────
// LOCALSTORAGE TABANLI DEPOLAMA
// ─────────────────────────────────────────────

const PROFILES_KEY = 'uart_profiles';
const SCENARIOS_KEY = 'uart_scenarios';

const INITIAL_PROFILES: FrameProfile[] = [
  {
    id: 'medical-monitor-01',
    name: 'YS2000A Medical Monitor',
    description: 'ECG, SpO2 ve BPM simülasyonu içeren tıbbi monitör profili.',
    baudRate: 9600,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: 'm1', name: 'Sync', type: 'fixed', byteWidth: 2, endianness: 'big', order: 0, typeConfig: { value: 0x55AA } as FixedConfig },
      { id: 'm2', name: 'BPM', type: 'range', byteWidth: 1, endianness: 'big', order: 1, typeConfig: { min: 40, max: 200, distribution: 'uniform' } as RangeConfig },
      { id: 'm3', name: 'SpO2', type: 'range', byteWidth: 1, endianness: 'big', order: 2, typeConfig: { min: 90, max: 100, distribution: 'uniform' } as RangeConfig },
      { id: 'm4', name: 'Lead-I', type: 'waveform', byteWidth: 2, endianness: 'big', order: 3, typeConfig: { shape: 'ecg', frequency: 1, amplitude: 1000, offset: 2000, noiseLevel: 5 } as WaveformConfig },
      { id: 'm5', name: 'Lead-II', type: 'waveform', byteWidth: 2, endianness: 'big', order: 4, typeConfig: { shape: 'ecg', frequency: 1, amplitude: 1200, offset: 2000, noiseLevel: 7 } as WaveformConfig },
      { id: 'm6', name: 'SPO2-Wave', type: 'waveform', byteWidth: 1, endianness: 'big', order: 5, typeConfig: { shape: 'sine', frequency: 1, amplitude: 40, offset: 128, noiseLevel: 2 } as WaveformConfig },
      { id: 'm7', name: 'CRC', type: 'checksum', byteWidth: 1, endianness: 'big', order: 6, typeConfig: { algorithm: 'sum_mod256', scope: { startFieldId: 'm1', endFieldId: 'm6' } } as ChecksumConfig }
    ],
    framing: {
      mode: 'fixed',
      header: [0x55, 0xAA]
    }
  }
];

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw && key === PROFILES_KEY) return INITIAL_PROFILES as unknown as T[];
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
