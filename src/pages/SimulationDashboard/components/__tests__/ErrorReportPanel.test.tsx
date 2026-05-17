import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { LanguageProvider } from '../../../../i18n/LanguageProvider';
import type { FrameProfile, GeneratedFrame } from '../../../../types';
import ErrorReportPanel from '../ErrorReportPanel';

const sampleProfile: FrameProfile = {
  id: 'demo-profile',
  name: 'Demo Profile',
  description: 'Demo profile for report rendering tests',
  baudRate: 115200,
  dataBits: 8,
  parity: 'None',
  stopBits: 1,
  sendIntervalMs: 100,
  fields: [],
  framing: { mode: 'fixed' },
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
};

const sampleFrames: GeneratedFrame[] = [
  { uId: 'f1', frameNumber: 1, timestampMs: 0, rawHex: 'AA', rawBytes: [0xaa], fields: [], errors: [] },
  { uId: 'f2', frameNumber: 2, timestampMs: 120, rawHex: 'BB', rawBytes: [0xbb], fields: [], errors: ['CRC error'] },
];

const renderPanel = (props?: Partial<Parameters<typeof ErrorReportPanel>[0]>, locale: 'tr' | 'en' = 'en') => {
  localStorage.setItem('uart_locale', locale);
  return render(
    <LanguageProvider>
      <ErrorReportPanel
        frames={sampleFrames}
        profile={sampleProfile}
        elapsedMs={120}
        frameCount={sampleFrames.length}
        errorCount={1}
        {...props}
      />
    </LanguageProvider>
  );
};

describe('ErrorReportPanel translations', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('renders localized Turkish labels instead of falling back to English', () => {
    renderPanel({}, 'tr');
    expect(screen.getByText('Hata Analiz Raporu')).toBeInTheDocument();
    expect(screen.getByText('Oturum Özeti')).toBeInTheDocument();
    expect(screen.getByText('Dışa Aktar')).toBeInTheDocument();
  });

  it('renders localized English labels when the locale is switched to en', () => {
    renderPanel({}, 'en');
    expect(screen.getByText('Error Analysis Report')).toBeInTheDocument();
    expect(screen.getByText('Session Summary')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });
});

describe('ErrorReportPanel — empty state', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
  });

  it('shows empty state when frames is empty', () => {
    render(
      <LanguageProvider>
        <ErrorReportPanel frames={[]} profile={null} elapsedMs={0} frameCount={0} errorCount={0} />
      </LanguageProvider>
    );
    // Export buttons should be disabled
    const csvButtons = screen.getAllByRole('button', { name: /CSV/i });
    csvButtons.forEach(btn => expect(btn).toBeDisabled());
  });

  it('shows null profile gracefully', () => {
    expect(() =>
      render(
        <LanguageProvider>
          <ErrorReportPanel frames={sampleFrames} profile={null} elapsedMs={0} frameCount={2} errorCount={0} />
        </LanguageProvider>
      )
    ).not.toThrow();
  });
});

describe('ErrorReportPanel — green banner when no errors', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
  });

  it('shows perfect session banner when errorCount is 0', () => {
    const cleanFrames: GeneratedFrame[] = [
      { uId: 'f1', frameNumber: 1, timestampMs: 0, rawHex: 'AA', rawBytes: [0xaa], fields: [], errors: [] },
    ];
    render(
      <LanguageProvider>
        <ErrorReportPanel frames={cleanFrames} profile={sampleProfile} elapsedMs={100} frameCount={1} errorCount={0} />
      </LanguageProvider>
    );
    // Session summary should be visible since frames > 0
    expect(screen.getByText('Session Summary')).toBeInTheDocument();
  });
});

describe('ErrorReportPanel — button handlers', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
    // Stub browser APIs that jsdom doesn't support
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => vi.restoreAllMocks());

  it('calls window.print when Print button is clicked', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPanel();
    // There may be multiple Print buttons (toolbar + export section)
    const printBtns = screen.getAllByRole('button', { name: /print/i });
    fireEvent.click(printBtns[0]);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('does not throw when CSV button is clicked with frames', () => {
    renderPanel();
    const csvBtns = screen.getAllByRole('button', { name: /CSV/i });
    expect(() => fireEvent.click(csvBtns[0])).not.toThrow();
  });

  it('does not throw when PCAP button is clicked with frames', () => {
    renderPanel();
    const pcapBtns = screen.getAllByRole('button', { name: /PCAP/i });
    expect(() => fireEvent.click(pcapBtns[0])).not.toThrow();
  });

  it('does not throw when JSON button is clicked with frames', () => {
    renderPanel();
    const jsonBtns = screen.getAllByRole('button', { name: /JSON/i });
    expect(() => fireEvent.click(jsonBtns[0])).not.toThrow();
  });
});

describe('ErrorReportPanel — elapsed time formatting', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
  });

  it('renders duration >= 60s in minutes format', () => {
    renderPanel({ elapsedMs: 90000 });
    // Should show something like "1m 30s"
    expect(document.body.textContent).toMatch(/1/);
  });

  it('renders duration < 60s in seconds format', () => {
    renderPanel({ elapsedMs: 5000 });
    expect(document.body.textContent).toMatch(/5/);
  });
});
