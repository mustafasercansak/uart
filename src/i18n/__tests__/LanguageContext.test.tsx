import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// Mock the translations to test fallback logic
vi.mock('../locales/tr.json', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const data = actual.default || actual;
  return {
    ...actual,
    default: {
      ...data,
      fallbackTest: {
        onlyInTr: 'Sadece TR'
      }
    }
  };
});

vi.mock('../locales/en.json', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const data = actual.default || actual;
  return {
    ...actual,
    default: {
      ...data,
      fallbackTest: {
        onlyInEn: 'Only in EN'
      }
    }
  };
});

import { LanguageProvider } from '../LanguageProvider';
import { useTranslation } from '../context';

describe('LanguageContext and LanguageProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes locale from localStorage if available', () => {
    localStorage.setItem('uart_locale', 'en');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.locale).toBe('en');
  });

  it('defaults to "tr" if no locale in localStorage', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.locale).toBe('tr');
  });

  it('updates localStorage and document lang when setLocale is called', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    act(() => {
      result.current.setLocale('en');
    });

    expect(result.current.locale).toBe('en');
    expect(localStorage.getItem('uart_locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('translates simple keys correctly', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(result.current.t('common.save')).toBe('Kaydet');
    
    act(() => {
      result.current.setLocale('en');
    });
    expect(result.current.t('common.save')).toBe('Save');
  });

  it('falls back to the other language if key is missing in preferred language', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });

    // Locale is 'tr'. fallbackTest.onlyInEn exists only in EN.
    // It should find it in EN.
    expect(result.current.t('fallbackTest.onlyInEn')).toBe('Only in EN');

    act(() => {
      result.current.setLocale('en');
    });
    // Locale is 'en'. fallbackTest.onlyInTr exists only in TR.
    // It should find it in TR.
    expect(result.current.t('fallbackTest.onlyInTr')).toBe('Sadece TR');
  });

  it('returns the path if key is missing in both languages', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.t('absolutely.missing.key')).toBe('absolutely.missing.key');
  });

  it('throws error when useTranslation is used outside of LanguageProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTranslation())).toThrow('useTranslation must be used within a LanguageProvider');
    consoleSpy.mockRestore();
  });

  it('handles deep nested keys', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.t('dashboard.logic')).toBeDefined();
    expect(result.current.t('dashboard.logic')).not.toBe('dashboard.logic');
  });
});
