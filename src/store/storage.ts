import type {
  FrameProfile,
  Scenario,
  FixedConfig,
  RangeConfig,
  WaveformConfig,
  ChecksumConfig,
  FlagsConfig,
  AutomationSequence,
  Field,
  FramingMode,
  Parity,
  StopBits,
} from '../types';
import { invoke, isTauri } from '../lib/tauri-bridge';

// ── LOCAL STORAGE + TAURI FILE-SYSTEM STORAGE ─────────────────────────────────
//
// Profiles are stored in TWO places:
//   1. localStorage  — synchronous, fast, used as the in-process cache
//   2. Tauri FS      — durable, survives localStorage clears
//
// On every saveProfiles() both stores are written (FS is fire-and-forget async).
// On startup, initProfileStorage() reads from FS and repopulates localStorage
// so that the synchronous loadProfiles() always returns fresh data.
// ─────────────────────────────────────────────────────────────────────────────

const PROFILES_KEY = 'uart_profiles';
const SCENARIOS_KEY = 'uart_scenarios';
const PROFILE_SCHEMA_VERSION = 2;

type PersistedProfile = Partial<FrameProfile> & { schemaVersion?: number };

const INITIAL_PROFILES: FrameProfile[] = [
  {
    id: 'standard-delimiter-01',
    name: 'Standart Terminal (CRLF)',
    description: 'Satır sonu (CRLF - \\r\\n) ayırıcısı kullanan ve değişken uzunluklu ASCII metin satırları (Sıcaklık, Voltaj, Sinyal vb.) üreten standart terminal profili.',
    baudRate: 115200,
    dataBits: 8,
    parity: 'None',
    stopBits: 1,
    sendIntervalMs: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    generatorScript: `// Değişken uzunlukta ASCII terminal verileri simüle et\nconst readings = [\n  "TEMP=" + (36 + Math.random() * 2).toFixed(1) + "C",\n  "SYS_STATUS=OK",\n  "VOLT=" + (3.2 + Math.random() * 0.5).toFixed(2) + "V",\n  "RSSI=" + Math.floor(-80 + Math.random() * 30) + "dBm"\n];\nreturn readings[Math.floor(Math.random() * readings.length)];`,
    fields: [],
    framing: {
      mode: 'delimiter',
      delimiter: [0x0D, 0x0A]
    }
  },
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
      {
        id: 'm8', name: 'Alarms', type: 'flags', byteWidth: 1, endianness: 'big', order: 8, typeConfig: {
          bits: [
            { index: 0, name: 'Lead-Off', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
            { index: 1, name: 'Low-SPO2', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
            { index: 2, name: 'Battery-Low', defaultValue: 0, behavior: 'manual', behaviorConfig: {} }
          ]
        } as FlagsConfig
      },
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
      {
        id: 'p4', name: 'Status', type: 'flags', byteWidth: 1, endianness: 'big', order: 3, typeConfig: {
          bits: [
            { index: 0, name: 'Running', defaultValue: 1, behavior: 'manual', behaviorConfig: {} },
            { index: 1, name: 'Air-In-Line', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
            { index: 2, name: 'Occlusion', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
            { index: 3, name: 'Bolus', defaultValue: 0, behavior: 'manual', behaviorConfig: {} }
          ]
        } as FlagsConfig
      },
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
      {
        id: 'c4', name: 'Flags', type: 'flags', byteWidth: 1, endianness: 'big', order: 3, typeConfig: {
          bits: [
            { index: 0, name: 'Moving', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
            { index: 1, name: 'Error', defaultValue: 0, behavior: 'manual', behaviorConfig: {} },
            { index: 2, name: 'Calibrated', defaultValue: 1, behavior: 'manual', behaviorConfig: {} }
          ]
        } as FlagsConfig
      },
      { id: 'c5', name: 'CRC', type: 'checksum', byteWidth: 1, endianness: 'big', order: 4, typeConfig: { algorithm: 'xor', scope: { startFieldId: 'c2', endFieldId: 'c4' } } as ChecksumConfig }
    ],
    framing: {
      mode: 'fixed',
      header: [0xFE]
    }
  }
];

function isParity(value: unknown): value is Parity {
  return value === 'None' || value === 'Even' || value === 'Odd' || value === 'Mark' || value === 'Space';
}

function isStopBits(value: unknown): value is StopBits {
  return value === 1 || value === 1.5 || value === 2;
}

function isFramingMode(value: unknown): value is FramingMode {
  return value === 'fixed' || value === 'delimiter' || value === 'slip' || value === 'cobs' || value === 'modbus';
}

function normalizeField(raw: unknown, index: number): Field | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<Field>;
  const byteWidth = Number.isFinite(src.byteWidth) && (src.byteWidth as number) > 0 ? Number(src.byteWidth) : 1;

  return {
    id: typeof src.id === 'string' && src.id.trim().length > 0 ? src.id : `field-${index}`,
    name: typeof src.name === 'string' && src.name.trim().length > 0 ? src.name : `Field_${index + 1}`,
    order: Number.isFinite(src.order) ? Number(src.order) : index,
    byteWidth,
    endianness: src.endianness === 'little' ? 'little' : 'big',
    isAscii: src.isAscii === true,
    type: src.type ?? 'fixed',
    typeConfig: src.typeConfig ?? { value: 0 },
    widgetConfig: src.widgetConfig,
    ...(Number.isFinite(src.alarmLow)  && { alarmLow:  Number(src.alarmLow) }),
    ...(Number.isFinite(src.alarmHigh) && { alarmHigh: Number(src.alarmHigh) }),
  };
}

function migrateProfile(raw: PersistedProfile, index: number): { profile: FrameProfile; changed: boolean } | null {
  if (!raw || typeof raw !== 'object') return null;

  const now = new Date().toISOString();
  const fields = Array.isArray(raw.fields)
    ? raw.fields.map((f, i) => normalizeField(f, i)).filter((f): f is Field => !!f)
    : [];

  const framingMode = raw.framing?.mode;
  const profile: FrameProfile = {
    id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : `legacy-profile-${index}`,
    name: typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name : `Recovered Profile ${index + 1}`,
    description: typeof raw.description === 'string' ? raw.description : '',
    baudRate: Number.isFinite(raw.baudRate) ? Number(raw.baudRate) : 9600,
    dataBits: Number.isFinite(raw.dataBits) ? Number(raw.dataBits) : 8,
    parity: isParity(raw.parity) ? raw.parity : 'None',
    stopBits: isStopBits(raw.stopBits) ? raw.stopBits : 1,
    sendIntervalMs: Number.isFinite(raw.sendIntervalMs) ? Math.max(10, Number(raw.sendIntervalMs)) : 100,
    fields,
    framing: {
      mode: isFramingMode(framingMode) ? framingMode : 'fixed',
      delimiter: typeof raw.framing?.delimiter === 'number' ? raw.framing.delimiter : undefined,
      header: Array.isArray(raw.framing?.header) ? raw.framing.header.filter((b): b is number => typeof b === 'number') : undefined,
      footer: Array.isArray(raw.framing?.footer) ? raw.framing.footer.filter((b): b is number => typeof b === 'number') : undefined,
    },
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: now,
  };

  const changed =
    raw.schemaVersion !== PROFILE_SCHEMA_VERSION ||
    !raw.framing ||
    !Array.isArray(raw.fields) ||
    fields.length !== (raw.fields?.length ?? 0) ||
    profile.updatedAt !== raw.updatedAt;

  return { profile, changed };
}

function migrateProfiles(profiles: PersistedProfile[]): { profiles: FrameProfile[]; changed: boolean } {
  let changed = false;
  const migrated: FrameProfile[] = [];

  profiles.forEach((raw, index) => {
    const result = migrateProfile(raw, index);
    if (!result) {
      changed = true;
      return;
    }
    if (result.changed) changed = true;
    migrated.push(result.profile);
  });

  return { profiles: migrated, changed };
}

function load<T>(key: string, fallback: T[] = []): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Tauri FS helpers (async) ──────────────────────────────────────────────────

/** Write profiles to disk. Fire-and-forget — errors are logged, never thrown. */
async function tauriSaveProfiles(profiles: FrameProfile[]): Promise<void> {
  try {
    const persisted = profiles.map((p) => ({ ...p, schemaVersion: PROFILE_SCHEMA_VERSION }));
    await invoke('save_can_profiles', { data: persisted });
  } catch (e) {
    console.error('[storage] save_can_profiles failed:', e);
  }
}

/**
 * Load profiles from Tauri FS.
 * Returns migrated profiles (possibly empty) on success, or `null` when the file
 * does not exist yet (first-run). Throws on transient OS / read errors so the
 * caller does NOT fall through to the first-run migration branch.
 */
async function tauriLoadProfiles(): Promise<FrameProfile[] | null> {
  // Intentionally not caught — transient errors propagate so initProfileStorage
  // skips migration and leaves the existing FS file untouched.
  const raw = await invoke<PersistedProfile[] | null>('load_can_profiles');
  if (raw == null) return null; // Rust returned None: file does not exist yet
  const list = Array.isArray(raw) ? raw : [];
  const { profiles } = migrateProfiles(list);
  // Return profiles even when empty — an empty array is the user's authoritative state.
  return profiles;
}

/**
 * Must be awaited ONCE before React renders.
 *
 * Behaviour:
 *  - Tauri env: load from FS → sync localStorage cache
 *      • First run (no FS file): migrate localStorage → FS
 *      • Subsequent runs: FS wins, overwrites stale localStorage (including empty [])
 *  - Browser/dev env: no-op (localStorage is the only store)
 *  - Transient FS error: logged, localStorage left unchanged (FS not overwritten)
 */
export async function initProfileStorage(): Promise<void> {
  if (!isTauri()) return;
  try {
    const fromFs = await tauriLoadProfiles();

    if (fromFs !== null) {
      // FS is authoritative — repopulate localStorage cache, including empty array.
      const withSchema = fromFs.map((p) => ({ ...p, schemaVersion: PROFILE_SCHEMA_VERSION }));
      save(PROFILES_KEY, withSchema);
      return;
    }

    // File not found — first run: migrate localStorage contents to FS.
    const fromLocal = load<PersistedProfile>(PROFILES_KEY, INITIAL_PROFILES);
    const { profiles } = migrateProfiles(fromLocal);
    const source = profiles.length > 0 ? profiles : INITIAL_PROFILES;
    await tauriSaveProfiles(source);
  } catch (e) {
    // Transient OS / network error — log and leave both stores untouched.
    console.error('[storage] initProfileStorage failed, keeping existing data:', e);
  }
}

// ── Profiles ─────────────────────────────────

export function loadProfiles(): FrameProfile[] {
  const loaded = load<PersistedProfile>(PROFILES_KEY, INITIAL_PROFILES);
  let { profiles, changed } = migrateProfiles(loaded);

  // Force standard delimiter profile fields to be empty if it exists
  const stdDelim = profiles.find(p => p.id === 'standard-delimiter-01');
  if (stdDelim && stdDelim.fields.length > 0) {
    stdDelim.fields = [];
    changed = true;
  }

  const isTesting = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  if (!isTesting && profiles.length > 0 && !profiles.some(p => p.id === 'standard-delimiter-01')) {
    profiles.unshift(INITIAL_PROFILES[0]);
    const withSchema = profiles.map((p) => ({ ...p, schemaVersion: PROFILE_SCHEMA_VERSION }));
    save(PROFILES_KEY, withSchema);
    if (isTauri()) {
      tauriSaveProfiles(profiles).catch(console.error);
    }
    return profiles;
  }

  if (profiles.length === 0) {
    // Recovery fallback if storage is corrupted/empty after parse.
    return INITIAL_PROFILES;
  }

  if (changed) {
    const withSchema = profiles.map((p) => ({ ...p, schemaVersion: PROFILE_SCHEMA_VERSION }));
    save(PROFILES_KEY, withSchema);
    if (isTauri()) {
      tauriSaveProfiles(profiles).catch(console.error);
    }
  }

  return profiles;
}

export function saveProfiles(profiles: FrameProfile[]): void {
  const persisted = profiles.map((p) => ({ ...p, schemaVersion: PROFILE_SCHEMA_VERSION }));
  save(PROFILES_KEY, persisted);
  // Mirror to Tauri FS asynchronously — fire-and-forget
  if (isTauri()) {
    tauriSaveProfiles(profiles).catch(console.error);
  }
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

// ── Automation Sequences ─────────────────────

const SEQUENCES_KEY = 'uart_sequences';

export function loadSequences(): AutomationSequence[] {
  return load<AutomationSequence>(SEQUENCES_KEY);
}

export function saveSequences(sequences: AutomationSequence[]): void {
  save(SEQUENCES_KEY, sequences);
}

export function saveSequence(sequence: AutomationSequence): void {
  const sequences = loadSequences();
  const idx = sequences.findIndex((s) => s.id === sequence.id);
  if (idx >= 0) sequences[idx] = sequence;
  else sequences.push(sequence);
  saveSequences(sequences);
}

export function deleteSequence(id: string): void {
  const sequences = loadSequences().filter((s) => s.id !== id);
  saveSequences(sequences);
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
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('File could not be read'));
    reader.readAsText(file);
  });
}
