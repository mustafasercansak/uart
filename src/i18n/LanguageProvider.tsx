import React, { useState, useEffect, useCallback } from 'react';
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

  const t = useCallback((path: string, params?: Record<string, unknown>): string => {
    // Check user overrides first
    const override = customLabels[locale]?.[path];
    if (override !== undefined && override !== '') {
      return applyParams(override, params);
    }

    const keys = path.split('.');
    let current: unknown = translations[locale];

    for (const key of keys) {
      if (typeof current !== 'object' || current === null || !(key in current) || (current as Record<string, unknown>)[key] === undefined) {
        // Fallback to English for any missing key
        const fallbackLocale: Locale = locale === 'en' ? 'tr' : 'en';
        // Check user override in fallback locale
        const fallbackOverride = customLabels[fallbackLocale]?.[path];
        if (fallbackOverride !== undefined && fallbackOverride !== '') {
          return applyParams(fallbackOverride, params);
        }
        let fallback: unknown = translations[fallbackLocale];
        for (const fKey of keys) {
            if (typeof fallback !== 'object' || fallback === null || (fallback as Record<string, unknown>)[fKey] === undefined) return path;
            fallback = (fallback as Record<string, unknown>)[fKey];
        }
        current = fallback;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }

    const result = typeof current === 'string' ? current : path;
    return applyParams(result, params);
  }, [locale, customLabels]);

  return (
    <LanguageContext.Provider value={{ locale, language: locale, setLocale, t, customLabels, setCustomLabel, resetCustomLabel }}>
      {children}
    </LanguageContext.Provider>
  );
}

function applyParams(str: string, params?: Record<string, unknown>): string {
  if (!params) return str;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`{${key}}`, 'g'), String(value)),
    str,
  );
}
