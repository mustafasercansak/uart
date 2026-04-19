import type { FrameProfile, Scenario, FixedConfig, RangeConfig, WaveformConfig, ChecksumConfig, FlagsConfig } from '../types';

// ─────────────────────────────────────────────
// LOCALSTORAGE TABANLI DEPOLAMA
// ─────────────────────────────────────────────

const PROFILES_KEY = 'uart_profiles';
const SCENARIOS_KEY = 'uart_scenarios';

const INITIAL_PROFILES: FrameProfile[] = [
  {
    id: 'medical-monitor-01',
    name: 'YS2000A Patient Monitor',
    description: 'ECG (Lead I, II), SpO2, BPM ve RR simülasyonu içeren profesyonel hasta başı monitör profili.',
    baudRate: 115200,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 40,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: 'm1', name: 'Sync', type: 'fixed', byteWidth: 2, endianness: 'big', order: 0, typeConfig: { value: 0x55AA } as FixedConfig },
      { id: 'm2', name: 'BPM', type: 'range', byteWidth: 1, endianness: 'big', order: 1, typeConfig: { min: 60, max: 100, distribution: 'uniform' } as RangeConfig },
      { id: 'm3', name: 'SpO2', type: 'range', byteWidth: 1, endianness: 'big', order: 2, typeConfig: { min: 94, max: 100, distribution: 'uniform' } as RangeConfig },
      { id: 'm4', name: 'RR', type: 'range', byteWidth: 1, endianness: 'big', order: 3, typeConfig: { min: 12, max: 20, distribution: 'uniform' } as RangeConfig },
      { id: 'm5', name: 'Temp', type: 'range', byteWidth: 2, endianness: 'big', order: 4, typeConfig: { min: 360, max: 375, distribution: 'gaussian' } as RangeConfig },
      { id: 'm6', name: 'Lead-I', type: 'waveform', byteWidth: 2, endianness: 'big', order: 5, typeConfig: { shape: 'ecg', frequency: 1.2, amplitude: 800, offset: 2048, noiseLevel: 3, phase: 0 } as WaveformConfig },
      { id: 'm6_2', name: 'Lead-II', type: 'waveform', byteWidth: 2, endianness: 'big', order: 6, typeConfig: { shape: 'ecg', frequency: 1.2, amplitude: 1200, offset: 2048, noiseLevel: 3, phase: 0.04 } as WaveformConfig },
      { id: 'm7', name: 'SpO2-Wave', type: 'waveform', byteWidth: 1, endianness: 'big', order: 7, typeConfig: { shape: 'sine', frequency: 1.2, amplitude: 30, offset: 128, noiseLevel: 1 } as WaveformConfig },
      { id: 'm8', name: 'Alarms', type: 'flags', byteWidth: 1, endianness: 'big', order: 8, typeConfig: { bits: [
        { index: 0, name: 'Lead-Off', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
        { index: 1, name: 'Low-SPO2', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
        { index: 2, name: 'Battery-Low', defaultValue: 0, behavior: 'manual', behaviorConfig: {} }
      ]} as FlagsConfig },
      { id: 'm9', name: 'CRC', type: 'checksum', byteWidth: 1, endianness: 'big', order: 8, typeConfig: { algorithm: 'sum_mod256', scope: { startFieldId: 'm1', endFieldId: 'm8' } } as ChecksumConfig }
    ],
    framing: {
      mode: 'fixed',
      header: [0x55, 0xAA]
    }
  },
  {
    id: 'oximeter-pro-01',
    name: 'Masimo Signal Oximeter',
    description: 'Yüksek hassasiyetli SpO2 ve Perfüzyon İndeksi (PI) simülatörü.',
    baudRate: 9600,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: 'o1', name: 'Hdr', type: 'fixed', byteWidth: 1, endianness: 'big', order: 0, typeConfig: { value: 0xBE } as FixedConfig },
      { id: 'o2', name: 'SpO2', type: 'range', byteWidth: 1, endianness: 'big', order: 1, typeConfig: { min: 90, max: 100, distribution: 'uniform' } as RangeConfig },
      { id: 'o3', name: 'Pulse', type: 'range', byteWidth: 1, endianness: 'big', order: 2, typeConfig: { min: 40, max: 220, distribution: 'uniform' } as RangeConfig },
      { id: 'o4', name: 'PI', type: 'range', byteWidth: 2, endianness: 'big', order: 3, typeConfig: { min: 20, max: 200, distribution: 'uniform' } as RangeConfig },
      { id: 'o5', name: 'CRC', type: 'checksum', byteWidth: 1, endianness: 'big', order: 4, typeConfig: { algorithm: 'xor', scope: { startFieldId: 'o2', endFieldId: 'o4' } } as ChecksumConfig }
    ],
    framing: {
      mode: 'fixed',
      header: [0xBE]
    }
  },
  {
    id: 'medical-pump-01',
    name: 'Infusion Pump X1',
    description: 'Akıllı infüzyon pompası simülasyonu. Akış hızı, toplam hacim ve kritik alarmları simüle eder.',
    baudRate: 19200,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: 'p1', name: 'Hdr', type: 'fixed', byteWidth: 1, endianness: 'big', order: 0, typeConfig: { value: 0xFB } as FixedConfig },
      { id: 'p2', name: 'Flow Rate', type: 'range', byteWidth: 2, endianness: 'big', order: 1, typeConfig: { min: 50, max: 250, distribution: 'uniform' } as RangeConfig },
      { id: 'p3', name: 'Volume', type: 'range', byteWidth: 4, endianness: 'big', order: 2, typeConfig: { min: 0, max: 10000, distribution: 'uniform' } as RangeConfig },
      { id: 'p4', name: 'Status', type: 'flags', byteWidth: 1, endianness: 'big', order: 3, typeConfig: { bits: [
        { index: 0, name: 'Running', defaultValue: 1, behavior: 'manual', behaviorConfig: {} },
        { index: 1, name: 'Air-In-Line', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
        { index: 2, name: 'Occlusion', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
        { index: 3, name: 'Bolus', defaultValue: 0, behavior: 'manual', behaviorConfig: {} }
      ]} as FlagsConfig },
      { id: 'p5', name: 'CRC', type: 'checksum', byteWidth: 1, endianness: 'big', order: 4, typeConfig: { algorithm: 'sum_mod256', scope: { startFieldId: 'p2', endFieldId: 'p4' } } as ChecksumConfig }
    ],
    framing: {
      mode: 'fixed',
      header: [0xFB]
    }
  },
  {
    id: 'medical-clamp-01',
    name: 'Flow Control Clamp',
    description: 'Hassas akış kontrol ünitesi ve oklüzyon klebi simülatörü.',
    baudRate: 115200,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: 'c1', name: 'Hdr', type: 'fixed', byteWidth: 1, endianness: 'big', order: 0, typeConfig: { value: 0xFE } as FixedConfig },
      { id: 'c2', name: 'Position', type: 'range', byteWidth: 1, endianness: 'big', order: 1, typeConfig: { min: 0, max: 100, distribution: 'uniform' } as RangeConfig },
      { id: 'c3', name: 'Pressure', type: 'range', byteWidth: 2, endianness: 'big', order: 2, typeConfig: { min: 0, max: 400, distribution: 'gaussian' } as RangeConfig },
      { id: 'c4', name: 'Flags', type: 'flags', byteWidth: 1, endianness: 'big', order: 3, typeConfig: { bits: [
        { index: 0, name: 'Moving', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
        { index: 1, name: 'Error', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
        { index: 2, name: 'Calibrated', defaultValue: 1, behavior: 'manual', behaviorConfig: {} }
      ]} as FlagsConfig },
      { id: 'c5', name: 'CRC', type: 'checksum', byteWidth: 1, endianness: 'big', order: 4, typeConfig: { algorithm: 'xor', scope: { startFieldId: 'c2', endFieldId: 'c4' } } as ChecksumConfig }
    ],
    framing: {
      mode: 'fixed',
      header: [0xFE]
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
      } catch {
        reject(new Error('Geçersiz JSON dosyası'));
      }
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsText(file);
  });
}
