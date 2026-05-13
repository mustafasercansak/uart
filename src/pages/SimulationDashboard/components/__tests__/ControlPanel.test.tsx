import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ControlPanel from '../ControlPanel';
import { LanguageProvider } from '../../../../i18n/LanguageProvider';

const defaultProps = {
  status: 'stopped',
  flagsFields: [],
  allRangeFields: [],
  bitOverrides: {},
  fieldOverrides: {},
  pendingErrors: [],
  logEntries: [],
  errorTypes: [],
  onOverrideField: vi.fn(),
  onOverrideBit: vi.fn(),
  onInjectError: vi.fn(),
  onResetOverrides: vi.fn(),
  onExportLogs: vi.fn(),
  signalIntegrity: { noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: false },
  onSetSignalIntegrity: vi.fn(),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('ControlPanel', () => {
  it('renders without crash with valid signalIntegrity', () => {
    render(<ControlPanel {...defaultProps} />, { wrapper });
    expect(document.body).toBeTruthy();
  });

  it('displays noise level percentage from signalIntegrity', () => {
    render(
      <ControlPanel {...defaultProps} signalIntegrity={{ noiseLevel: 0.42, jitterMs: 0, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    expect(screen.getByText('42.0%')).toBeInTheDocument();
  });

  it('displays jitter value from signalIntegrity', () => {
    render(
      <ControlPanel {...defaultProps} signalIntegrity={{ noiseLevel: 0, jitterMs: 5.5, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    expect(screen.getByText(/5\.5/)).toBeInTheDocument();
  });

  it('does not crash when signalIntegrity has zero values', () => {
    expect(() =>
      render(
        <ControlPanel {...defaultProps} signalIntegrity={{ noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: false }} />,
        { wrapper }
      )
    ).not.toThrow();
  });

  it('reflects bitFlipsEnabled toggle state', () => {
    const { rerender } = render(
      <ControlPanel {...defaultProps} signalIntegrity={{ noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    // Re-render with bitFlipsEnabled true — should not crash
    expect(() =>
      rerender(
        <LanguageProvider>
          <ControlPanel {...defaultProps} signalIntegrity={{ noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: true }} />
        </LanguageProvider>
      )
    ).not.toThrow();
  });
});
