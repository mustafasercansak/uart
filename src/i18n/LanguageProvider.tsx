import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import tr from './locales/tr.json';
import en from './locales/en.json';
import { LanguageContext, type Locale, type Translations } from './context';
import { loadCustomLabels, saveCustomLabels, type CustomLabelStore } from './customLabels';

const translations: Record<Locale, Translations> = { tr, en };

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('uart_locale');
    return (saved as Locale) || 'tr';
  });

  const [customLabels, setCustomLabels] = useState<CustomLabelStore>(() => loadCustomLabels());
  // Ref so t() never needs customLabels in its dep array — prevents 173-component re-render
  // cascade on every label save while still reading the latest value at call time.
  const customLabelsRef = useRef<CustomLabelStore>(customLabels);
  useEffect(() => { customLabelsRef.current = customLabels; }, [customLabels]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('uart_locale', newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setCustomLabel = useCallback((key: string, loc: Locale, value: string) => {
    setCustomLabels(prev => {
      const next: CustomLabelStore = {
        ...prev,
        [loc]: { ...prev[loc], [key]: value },
      };
      saveCustomLabels(next);
      return next;
    });
  }, []);

  const bulkSetCustomLabels = useCallback((overrides: CustomLabelStore) => {
    setCustomLabels(prev => {
      const next: CustomLabelStore = {
        en: { ...prev.en, ...overrides.en },
        tr: { ...prev.tr, ...overrides.tr },
      };
      saveCustomLabels(next);
      return next;
    });
  }, []);

  const resetCustomLabelKeys = useCallback((keys: string[]) => {
    setCustomLabels(prev => {
      const keySet = new Set(keys);
      const next: CustomLabelStore = {
        en: Object.fromEntries(Object.entries(prev.en).filter(([k]) => !keySet.has(k))),
        tr: Object.fromEntries(Object.entries(prev.tr).filter(([k]) => !keySet.has(k))),
      };
      saveCustomLabels(next);
      return next;
    });
  }, []);

  const resetCustomLabel = useCallback((key: string, loc?: Locale) => {
    setCustomLabels(prev => {
      const next: CustomLabelStore = loc
        ? { ...prev, [loc]: Object.fromEntries(Object.entries(prev[loc]).filter(([k]) => k !== key)) }
        : {
            en: Object.fromEntries(Object.entries(prev.en).filter(([k]) => k !== key)),
            tr: Object.fromEntries(Object.entries(prev.tr).filter(([k]) => k !== key)),
          };
      saveCustomLabels(next);
      return next;
    });
  }, []);

  // t reads customLabels via ref — dep array is [locale] only, so label saves do NOT
  // invalidate t or contextValue, and 173 useTranslation() consumers stay quiet.
  const t = useCallback((path: string, params?: Record<string, unknown>): string => {
    const labels = customLabelsRef.current;

    // Check user overrides first
    const override = labels[locale]?.[path];
    if (override !== undefined && override !== '') {
      return applyParams(override, params);
    }

    const keys = path.split('.');
    let current: unknown = translations[locale];

    for (const key of keys) {
      if (typeof current !== 'object' || current === null || !(key in current) || (current as Record<string, unknown>)[key] === undefined) {
        // Fallback to the other locale for any missing key
        const fallbackLocale: Locale = locale === 'en' ? 'tr' : 'en';
        // Check user override in fallback locale
        const fallbackOverride = labels[fallbackLocale]?.[path];
        if (fallbackOverride !== undefined && fallbackOverride !== '') {
          return applyParams(fallbackOverride, params);
        }
        let fallback: unknown = translations[fallbackLocale];
        for (const fKey of keys) {
            if (typeof fallback !== 'object' || fallback == null || (fallback as Record<string, unknown>)[fKey] == null) return path;
            fallback = (fallback as Record<string, unknown>)[fKey];
        }
        current = fallback;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }

    const result = typeof current === 'string' ? current : path;
    return applyParams(result, params);
  }, [locale]);

  const contextValue = useMemo(
    () => ({ locale, language: locale, setLocale, t, customLabels, setCustomLabel, bulkSetCustomLabels, resetCustomLabel, resetCustomLabelKeys }),
    [locale, setLocale, t, customLabels, setCustomLabel, bulkSetCustomLabels, resetCustomLabel, resetCustomLabelKeys],
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

function applyParams(str: string, params?: Record<string, unknown>): string {
  if (!params) return str;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(String(value)),
    str,
  );
}
