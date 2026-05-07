const KEY = 'uart_last_settings';

export interface LastSettings {
  selectedPort: string;
  profileId: string | null;
  scenarioId: string | null;
  outputMode: string;
}

const DEFAULTS: LastSettings = {
  selectedPort: '',
  profileId: null,
  scenarioId: null,
  outputMode: 'log',
};

export function loadLastSettings(): LastSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveLastSettings(patch: Partial<LastSettings>) {
  try {
    const current = loadLastSettings();
    localStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // localStorage dolu olabilir — sessizce geç
  }
}
