import React, { useState, useEffect, useCallback } from 'react';
import tr from './locales/tr.json';
import en from './locales/en.json';
import { LanguageContext, type Locale, type Translations } from './context';

const translations: Record<Locale, Translations> = { tr, en };

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('uart_locale');
    return (saved as Locale) || 'tr';
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('uart_locale', newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((path: string, params?: Record<string, any>): string => {
    const keys = path.split('.');
    let current: unknown = translations[locale];
    
    for (const key of keys) {
      if (typeof current !== 'object' || current === null || !(key in current) || (current as Record<string, unknown>)[key] === undefined) {
        // Fallback to English for any missing key
        const fallbackLocale: Locale = locale === 'en' ? 'tr' : 'en';
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
    
    let result = typeof current === 'string' ? current : path;
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
      });
    }
    
    return result;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, language: locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
