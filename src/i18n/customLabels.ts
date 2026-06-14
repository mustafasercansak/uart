import type { Locale } from './context';

const STORAGE_KEY = 'uart_custom_labels';

export type CustomLabelStore = Record<Locale, Record<string, string>>;

export function loadCustomLabels(): CustomLabelStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { en: {}, tr: {}, ...parsed };
    const store = {
      en: merged.en && typeof merged.en === 'object' ? merged.en : {},
      tr: merged.tr && typeof merged.tr === 'object' ? merged.tr : {},
    };

    let mutated = false;
    if (store.tr) {
      if (store.tr['terminal.socatDesc'] === 'loopback resmi için başlanış sanal seri port çifti oluşturur (yalnızca linux).') {
        delete store.tr['terminal.socatDesc'];
        mutated = true;
      }
      if (store.tr['terminal.customDelim'] === 'özel (hex bayt, örn. od)') {
        delete store.tr['terminal.customDelim'];
        mutated = true;
      }
    }

    if (mutated) {
      saveCustomLabels(store);
    }

    return store;
  } catch {
    return { en: {}, tr: {} };
  }
}

export function saveCustomLabels(store: CustomLabelStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
