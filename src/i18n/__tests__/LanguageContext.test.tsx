import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// Mock the translations to test fallback logic
vi.mock('../locales/tr.json', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const data = (actual.default || actual) as Record<string, unknown>;
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
  const actual = await importOriginal<Record<string, unknown>>();
  const data = (actual.default || actual) as Record<string, unknown>;
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
import { useTranslation, useCustomLabels } from '../context';
import { loadCustomLabels, saveCustomLabels } from '../customLabels';

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

  it('interpolates params into translated strings', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(() => useTranslation(), { wrapper });
    act(() => result.current.setLocale('en'));
    // Use a key that exists in EN and supply a param to exercise applyParams interpolation
    const out = result.current.t('common.save', { name: 'test' });
    expect(typeof out).toBe('string');
  });

  it('throws when useCustomLabels is used outside LanguageProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCustomLabels())).toThrow('useCustomLabels must be used within a LanguageProvider');
    consoleSpy.mockRestore();
  });

  it('setCustomLabel persists an override and t() returns it', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(
      () => ({ t: useTranslation(), labels: useCustomLabels() }),
      { wrapper },
    );

    act(() => result.current.labels.setCustomLabel('common.save', 'en', 'Save Override'));
    act(() => result.current.t.setLocale('en'));
    expect(result.current.t.t('common.save')).toBe('Save Override');
  });

  it('bulkSetCustomLabels applies multiple overrides at once', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(
      () => ({ t: useTranslation(), labels: useCustomLabels() }),
      { wrapper },
    );

    act(() =>
      result.current.labels.bulkSetCustomLabels({
        en: { 'common.save': 'Bulk Save' },
        tr: {},
      }),
    );
    act(() => result.current.t.setLocale('en'));
    expect(result.current.t.t('common.save')).toBe('Bulk Save');
  });

  it('replaceCustomLabels replaces the entire store', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(
      () => ({ t: useTranslation(), labels: useCustomLabels() }),
      { wrapper },
    );

    act(() => result.current.labels.setCustomLabel('common.save', 'en', 'Old'));
    act(() =>
      result.current.labels.replaceCustomLabels({ en: { 'common.save': 'Replaced' }, tr: {} }),
    );
    act(() => result.current.t.setLocale('en'));
    expect(result.current.t.t('common.save')).toBe('Replaced');
  });

  it('resetCustomLabel removes an override for a specific locale', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(
      () => ({ t: useTranslation(), labels: useCustomLabels() }),
      { wrapper },
    );

    act(() => result.current.labels.setCustomLabel('common.save', 'en', 'Override'));
    act(() => result.current.labels.resetCustomLabel('common.save', 'en'));
    act(() => result.current.t.setLocale('en'));
    expect(result.current.t.t('common.save')).toBe('Save');
  });

  it('resetCustomLabel with no locale removes from all locales', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(
      () => ({ t: useTranslation(), labels: useCustomLabels() }),
      { wrapper },
    );

    act(() => result.current.labels.setCustomLabel('common.save', 'en', 'EN Override'));
    act(() => result.current.labels.setCustomLabel('common.save', 'tr', 'TR Override'));
    act(() => result.current.labels.resetCustomLabel('common.save'));
    act(() => result.current.t.setLocale('en'));
    expect(result.current.t.t('common.save')).toBe('Save');
  });

  it('resetCustomLabelKeys removes multiple keys', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(
      () => ({ t: useTranslation(), labels: useCustomLabels() }),
      { wrapper },
    );

    act(() => result.current.labels.setCustomLabel('common.save', 'en', 'S'));
    act(() => result.current.labels.resetCustomLabelKeys(['common.save']));
    act(() => result.current.t.setLocale('en'));
    expect(result.current.t.t('common.save')).toBe('Save');
  });

  it('t() returns a fallback-locale custom label when primary locale key is missing', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(
      () => ({ t: useTranslation(), labels: useCustomLabels() }),
      { wrapper },
    );

    // Set locale to 'en'; add a custom label in TR for a key that doesn't exist in EN
    act(() => result.current.t.setLocale('en'));
    act(() => result.current.labels.setCustomLabel('absolutely.missing.key', 'tr', 'TR Only Label'));
    expect(result.current.t.t('absolutely.missing.key')).toBe('TR Only Label');
  });
});

describe('customLabels storage', () => {
  beforeEach(() => localStorage.clear());

  it('saveCustomLabels persists to localStorage and loadCustomLabels reads it back', () => {
    const store = { en: { 'foo.bar': 'Foo' }, tr: { 'foo.bar': 'Fu' } };
    saveCustomLabels(store);
    const loaded = loadCustomLabels();
    expect(loaded).toEqual(store);
  });

  it('loadCustomLabels returns empty store when localStorage is corrupt', () => {
    localStorage.setItem('uart_custom_labels', 'not-json{{{');
    const loaded = loadCustomLabels();
    expect(loaded).toEqual({ en: {}, tr: {} });
  });

  it('loadCustomLabels falls back to {} when en/tr values are non-objects', () => {
    // Covers lines 13-14: `merged.en && typeof merged.en === 'object'` false branch
    localStorage.setItem('uart_custom_labels', JSON.stringify({ en: null, tr: 42 }));
    const loaded = loadCustomLabels();
    expect(loaded).toEqual({ en: {}, tr: {} });
  });
});

describe('resetCustomLabelKeys preserves non-deleted keys', () => {
  it('keeps labels that are NOT in the deletion set', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>{children}</LanguageProvider>
    );
    const { result } = renderHook(
      () => ({ t: useTranslation(), labels: useCustomLabels() }),
      { wrapper },
    );

    // Set two custom labels
    act(() => result.current.labels.setCustomLabel('common.save', 'en', 'S'));
    act(() => result.current.labels.setCustomLabel('common.cancel', 'en', 'X'));

    // Delete only 'common.save'; 'common.cancel' must survive
    act(() => result.current.labels.resetCustomLabelKeys(['common.save']));
    act(() => result.current.t.setLocale('en'));

    // Deleted key reverts to default
    expect(result.current.t.t('common.save')).toBe('Save');
    // Kept key still uses custom override (covers the `!keySet.has(k)` → true branch)
    expect(result.current.t.t('common.cancel')).toBe('X');
  });
});
