import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
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
  {
    uId: 'frame-1',
    frameNumber: 1,
    timestampMs: 0,
    rawHex: 'AA',
    rawBytes: [0xaa],
    fields: [],
    errors: [],
  },
  {
    uId: 'frame-2',
    frameNumber: 2,
    timestampMs: 120,
    rawHex: 'BB',
    rawBytes: [0xbb, 0xcc],
    fields: [],
    errors: ['CRC error'],
  },
];

const renderPanel = (locale: 'tr' | 'en') => {
  localStorage.setItem('uart_locale', locale);

  return render(
    <LanguageProvider>
      <ErrorReportPanel
        frames={sampleFrames}
        profile={sampleProfile}
        elapsedMs={120}
        frameCount={sampleFrames.length}
        errorCount={1}
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
    renderPanel('tr');

    expect(screen.getByText('Hata Analiz Raporu')).toBeInTheDocument();
    expect(screen.getByText('Oturum Özeti')).toBeInTheDocument();
    expect(screen.getByText('Dışa Aktar')).toBeInTheDocument();
  });

  it('renders localized English labels when the locale is switched to en', () => {
    renderPanel('en');

    expect(screen.getByText('Error Analysis Report')).toBeInTheDocument();
    expect(screen.getByText('Session Summary')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });
});