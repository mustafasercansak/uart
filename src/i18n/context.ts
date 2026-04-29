import { createContext, useContext } from 'react';
import tr from './locales/tr.json';

export type Locale = 'tr' | 'en';
export type Translations = typeof tr;

export interface LanguageContextType {
  locale: Locale;
  language: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, params?: Record<string, any>) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
