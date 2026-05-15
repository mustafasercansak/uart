import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LanguageProvider } from '../../../../i18n/LanguageProvider';
import SequenceRunner from '../SequenceRunner';
import type { AutomationSequence } from '../../../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeSeq = (overrides: Partial<AutomationSequence> = {}): AutomationSequence => ({
  id: 'seq-1',
  name: 'Test Sekansı',
  steps: [
    { id: 's1', type: 'send', payload: 'AA BB', status: 'idle' },
    { id: 's2', type: 'wait', payload: '500', status: 'idle' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const mockAutomation = {
  saveSequence: vi.fn(),
  deleteSequence: vi.fn(),
  setActiveSequence: vi.fn(),
};

const mockSendRawData = vi.fn();

const buildState = (sequences: AutomationSequence[] = [], activeSequenceId: string | null = null) => ({
  sequences,
  activeSequenceId,
  conversationLogs: [],
  frames: [],
  isRunning: false,
  profile: null,
  scenario: null,
  elapsedMs: 0,
  frameCount: 0,
  errorCount: 0,
  bitOverrides: {},
  fieldOverrides: {},
  pendingErrors: [],
  logEntries: [],
  signalIntegrity: { noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: false },
});

vi.mock('../../../../hooks/useSimulation', () => ({
  useSimulation: () => ({
    state: buildState(),
    sendRawData: mockSendRawData,
    automation: mockAutomation,
  }),
}));

const renderRunner = (locale: 'tr' | 'en' = 'tr') => {
  localStorage.setItem('uart_locale', locale);
  return render(
    <LanguageProvider>
      <SequenceRunner />
    </LanguageProvider>
  );
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SequenceRunner i18n — top bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders Automation Lab label in Turkish', () => {
    renderRunner('tr');
    expect(screen.getByText('Otomasyon Lab')).toBeInTheDocument();
  });

  it('renders Automation Lab label in English', () => {
    renderRunner('en');
    expect(screen.getByText('Automation Lab')).toBeInTheDocument();
  });

  it('renders single mode description in Turkish', () => {
    renderRunner('tr');
    expect(screen.getByText('Tek sekans çalıştır ve kaydet')).toBeInTheDocument();
  });

  it('renders single mode description in English', () => {
    renderRunner('en');
    expect(screen.getByText('Run and save a single sequence')).toBeInTheDocument();
  });

  it('renders mode toggle buttons in Turkish', () => {
    renderRunner('tr');
    expect(screen.getByText('Tek Sekans')).toBeInTheDocument();
    expect(screen.getByText('Test Serisi')).toBeInTheDocument();
  });

  it('renders mode toggle buttons in English', () => {
    renderRunner('en');
    expect(screen.getByText('Single Sequence')).toBeInTheDocument();
    expect(screen.getByText('Test Series')).toBeInTheDocument();
  });
});

describe('SequenceRunner i18n — single mode toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders Run button in Turkish', () => {
    renderRunner('tr');
    expect(screen.getByText('Çalıştır')).toBeInTheDocument();
  });

  it('renders Run button in English', () => {
    renderRunner('en');
    expect(screen.getByText('Run')).toBeInTheDocument();
  });

  it('renders sequence name placeholder in Turkish', () => {
    renderRunner('tr');
    expect(screen.getByPlaceholderText('Sekans adı')).toBeInTheDocument();
  });

  it('renders sequence name placeholder in English', () => {
    renderRunner('en');
    expect(screen.getByPlaceholderText('Sequence name')).toBeInTheDocument();
  });

  it('renders group placeholder in Turkish', () => {
    renderRunner('tr');
    expect(screen.getByPlaceholderText('Grup (opsiyonel)')).toBeInTheDocument();
  });

  it('renders group placeholder in English', () => {
    renderRunner('en');
    expect(screen.getByPlaceholderText('Group (optional)')).toBeInTheDocument();
  });
});

describe('SequenceRunner i18n — step add buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders step type buttons in Turkish', () => {
    renderRunner('tr');
    expect(screen.getByText('Gönderim')).toBeInTheDocument();
    expect(screen.getByText('Bekleme')).toBeInTheDocument();
    expect(screen.getByText('Beklenti')).toBeInTheDocument();
  });

  it('renders step type buttons in English', () => {
    renderRunner('en');
    expect(screen.getByText('Send')).toBeInTheDocument();
    expect(screen.getByText('Wait')).toBeInTheDocument();
    expect(screen.getByText('Expect')).toBeInTheDocument();
  });
});

describe('SequenceRunner i18n — status bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders status label and ready state in Turkish', () => {
    renderRunner('tr');
    expect(screen.getByText('Durum')).toBeInTheDocument();
    expect(screen.getByText('Hazır')).toBeInTheDocument();
  });

  it('renders status label and ready state in English', () => {
    renderRunner('en');
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});

describe('SequenceRunner i18n — campaign mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const switchToCampaign = (locale: 'tr' | 'en') => {
    renderRunner(locale);
    const btn = screen.getByText(locale === 'tr' ? 'Test Serisi' : 'Test Series');
    fireEvent.click(btn);
  };

  it('renders campaign toolbar labels in Turkish', () => {
    switchToCampaign('tr');
    expect(screen.getByText('Tümünü Seç')).toBeInTheDocument();
    expect(screen.getByText('Temizle')).toBeInTheDocument();
    expect(screen.getByText('Seriyi Çalıştır')).toBeInTheDocument();
  });

  it('renders campaign toolbar labels in English', () => {
    switchToCampaign('en');
    expect(screen.getByText('Select All')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Run Series')).toBeInTheDocument();
  });

  it('renders series description in Turkish when switching mode', () => {
    switchToCampaign('tr');
    expect(screen.getByText('Grupları seç, sırayla çalıştır, raporla')).toBeInTheDocument();
  });

  it('renders series description in English when switching mode', () => {
    switchToCampaign('en');
    expect(screen.getByText('Select groups, run in order, report')).toBeInTheDocument();
  });

  it('shows empty-state message in Turkish when no sequences saved', () => {
    switchToCampaign('tr');
    expect(screen.getByText(/Kayıtlı sekans yok/)).toBeInTheDocument();
    expect(screen.getByText(/Önce Tek Sekans modunda oluştur ve kaydet/)).toBeInTheDocument();
  });

  it('shows empty-state message in English when no sequences saved', () => {
    switchToCampaign('en');
    expect(screen.getByText(/No saved sequences/)).toBeInTheDocument();
    expect(screen.getByText(/Create and save one in Single Sequence mode first/)).toBeInTheDocument();
  });
});

describe('SequenceRunner i18n — combobox placeholder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows "no sequences" placeholder in Turkish when list is empty', () => {
    renderRunner('tr');
    expect(screen.getByPlaceholderText('Kayıtlı sekans yok')).toBeInTheDocument();
  });

  it('shows "no sequences" placeholder in English when list is empty', () => {
    renderRunner('en');
    expect(screen.getByPlaceholderText('No saved sequences')).toBeInTheDocument();
  });
});

describe('SequenceRunner i18n — new automation keys in LanguageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const getT = (locale: 'tr' | 'en') => {
    localStorage.setItem('uart_locale', locale);
    let tFn!: (key: string, params?: Record<string, unknown>) => string;
    const { unmount } = render(
      <LanguageProvider>
        <TranslationCapture onT={fn => { tFn = fn; }} />
      </LanguageProvider>
    );
    unmount();
    return tFn;
  };

  it('translates automation.singleMode correctly', () => {
    expect(getT('tr')('automation.singleMode')).toBe('Tek Sekans');
    expect(getT('en')('automation.singleMode')).toBe('Single Sequence');
  });

  it('translates automation.seriesMode correctly', () => {
    expect(getT('tr')('automation.seriesMode')).toBe('Test Serisi');
    expect(getT('en')('automation.seriesMode')).toBe('Test Series');
  });

  it('translates automation.reportBrand correctly', () => {
    expect(getT('tr')('automation.reportBrand')).toBe('UART Simülatör · Otomasyon Sistemi');
    expect(getT('en')('automation.reportBrand')).toBe('UART Simulator · Automation System');
  });

  it('interpolates automation.selectedCount correctly', () => {
    expect(getT('tr')('automation.selectedCount', { count: '3' })).toBe('3 seçili');
    expect(getT('en')('automation.selectedCount', { count: '3' })).toBe('3 selected');
  });

  it('interpolates automation.summaryFooter correctly', () => {
    const params = { passed: '4', total: '5', duration: '12.34' };
    expect(getT('tr')('automation.summaryFooter', params)).toBe('4/5 sekans başarılı · Toplam 12.34s');
    expect(getT('en')('automation.summaryFooter', params)).toBe('4/5 sequences passed · Total 12.34s');
  });

  it('interpolates automation.groupPassOf correctly', () => {
    const params = { passed: '2', total: '3' };
    expect(getT('tr')('automation.groupPassOf', params)).toBe('2/3 geçti');
    expect(getT('en')('automation.groupPassOf', params)).toBe('2/3 passed');
  });

  it('translates all new automation keys without falling back to key path', () => {
    const newKeys = [
      'singleMode', 'seriesMode', 'singleDesc', 'seriesDesc',
      'run', 'runSeries', 'report', 'downloadPdf',
      'selectAll', 'clearAll', 'general',
      'noSequences', 'noSequencesHint', 'noMatch', 'searchPlaceholder',
      'stepsUnit', 'sequenceUnit', 'stepSend', 'stepWait', 'stepExpect',
      'statusLabel', 'statusRunning', 'statusReady',
      'passedShort', 'failedShort', 'runningStatus', 'doneStatus',
      'namePlaceholder', 'groupPlaceholder',
      'seriesReport', 'passedLabel', 'failedLabel',
      'totalDuration', 'successRateLabel',
      'seqPassed', 'seqFailed', 'seqRan',
      'passedStat', 'failedStat', 'passRateLabel', 'reportBrand',
      // v1.5.28 new keys
      'exportJson', 'importJson', 'importSuccess', 'importError', 'downloadJunit', 'repeatLabel',
    ];
    const tTr = getT('tr');
    const tEn = getT('en');
    for (const key of newKeys) {
      const fullKey = `automation.${key}`;
      expect(tTr(fullKey), `TR missing: ${fullKey}`).not.toBe(fullKey);
      expect(tEn(fullKey), `EN missing: ${fullKey}`).not.toBe(fullKey);
    }
  });

  it('translates automation.exportJson correctly', () => {
    expect(getT('tr')('automation.exportJson')).toBe('JSON Dışa Aktar');
    expect(getT('en')('automation.exportJson')).toBe('Export JSON');
  });

  it('translates automation.importJson correctly', () => {
    expect(getT('tr')('automation.importJson')).toBe('JSON İçe Aktar');
    expect(getT('en')('automation.importJson')).toBe('Import JSON');
  });

  it('translates automation.downloadJunit correctly', () => {
    expect(getT('tr')('automation.downloadJunit')).toBe('JUnit XML');
    expect(getT('en')('automation.downloadJunit')).toBe('JUnit XML');
  });

  it('interpolates automation.importSuccess correctly', () => {
    expect(getT('tr')('automation.importSuccess', { count: '3' })).toBe('3 sekans içe aktarıldı');
    expect(getT('en')('automation.importSuccess', { count: '3' })).toBe('3 sequences imported');
  });
});

describe('SequenceRunner — import/export buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders Export JSON icon button in single mode (TR)', () => {
    renderRunner('tr');
    expect(screen.getByTitle('JSON Dışa Aktar')).toBeInTheDocument();
  });

  it('renders Import JSON icon button in single mode (TR)', () => {
    renderRunner('tr');
    expect(screen.getByTitle('JSON İçe Aktar')).toBeInTheDocument();
  });

  it('renders Export JSON icon button in single mode (EN)', () => {
    renderRunner('en');
    expect(screen.getByTitle('Export JSON')).toBeInTheDocument();
  });

  it('renders Export JSON and Import JSON text links in campaign mode (TR)', () => {
    renderRunner('tr');
    fireEvent.click(screen.getByText('Test Serisi'));
    expect(screen.getByText('JSON Dışa Aktar')).toBeInTheDocument();
    expect(screen.getByText('JSON İçe Aktar')).toBeInTheDocument();
  });

  it('renders Export JSON and Import JSON text links in campaign mode (EN)', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    expect(screen.getByText('Export JSON')).toBeInTheDocument();
    expect(screen.getByText('Import JSON')).toBeInTheDocument();
  });
});

describe('SequenceRunner — repeat step input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders repeat number inputs for each default step', () => {
    renderRunner('tr');
    const repeatInputs = document.querySelectorAll('input[type="number"]');
    expect(repeatInputs.length).toBeGreaterThanOrEqual(3); // 3 default steps
  });

  it('repeat inputs default to 1', () => {
    renderRunner('tr');
    const repeatInputs = document.querySelectorAll('input[type="number"]');
    repeatInputs.forEach(input => {
      expect((input as HTMLInputElement).value).toBe('1');
    });
  });

  it('repeat × label is rendered', () => {
    renderRunner('tr');
    // repeatLabel key → '×'
    const labels = screen.getAllByText('×');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Helper component ─────────────────────────────────────────────────────────

import { useTranslation } from '../../../../i18n/context';

function TranslationCapture({ onT }: { onT: (t: (key: string, params?: Record<string, unknown>) => string) => void }) {
  const { t } = useTranslation();
  onT(t);
  return null;
}
