import type { Locale } from './context';

const STORAGE_KEY = 'uart_custom_labels';

export type CustomLabelStore = Record<Locale, Record<string, string>>;

export function loadCustomLabels(): CustomLabelStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { en: {}, tr: {}, ...parsed };
    return {
      en: merged.en && typeof merged.en === 'object' ? merged.en : {},
      tr: merged.tr && typeof merged.tr === 'object' ? merged.tr : {},
    };
  } catch {
    return { en: {}, tr: {} };
  }
}

export function saveCustomLabels(store: CustomLabelStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
