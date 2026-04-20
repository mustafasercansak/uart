import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import tr from './locales/tr.json';
import en from './locales/en.json';

type Locale = 'tr' | 'en';
type Translations = typeof tr;

interface LanguageContextType {
  locale: Locale;
  language: Locale; // alias for locale, used by some components
  setLocale: (locale: Locale) => void;
  t: (path: string) => string;
}

const translations: Record<Locale, Translations> = { tr, en: en as unknown as Translations };

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

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

  const t = useCallback((path: string): string => {
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
        return fallback as string;
      }
      current = (current as Record<string, unknown>)[key];
    }
    
    return current as string;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, language: locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
