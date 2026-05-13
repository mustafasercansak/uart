import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StatBar from '../StatBar';
import { LanguageProvider } from '../../../../i18n/LanguageProvider';
import { BrowserRouter } from 'react-router-dom';

const defaultProps = {
  status: 'stopped' as const,
  frameCount: 0,
  framesPerSecond: 0,
  errorCount: 0,
  elapsedMs: 0,
  profiles: [],
  scenarios: [],
  selectedProfileId: null,
  selectedScenarioId: null,
  outputMode: 'log' as const,
  serialConnected: false,
  networkConnected: false,
  analyzerMode: false,
  onSetProfile: vi.fn(),
  onSetScenario: vi.fn(),
  onSetOutputMode: vi.fn(),
  onConnectSerial: vi.fn(),
  onDisconnectSerial: vi.fn(),
  onConnectNetwork: vi.fn(),
  onDisconnectNetwork: vi.fn(),
  onToggleAnalyzerMode: vi.fn(),
  onAddProfile: vi.fn(),
  onEditProfile: vi.fn(),
  onGetPorts: vi.fn(),
  availablePorts: [],
  onStart: vi.fn(),
  onStop: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  formatMs: (ms: number) => `${ms}ms`,
  timingStats: { averageLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0, jitterMs: 0 },
  isRecording: false,
  onStartRecording: vi.fn(),
  onStopRecording: vi.fn(),
  signalIntegrity: { noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: false },
  validationSession: null,
  onStartValidation: vi.fn(),
  onStopValidation: vi.fn(),
  onViewReport: vi.fn(),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <LanguageProvider>{children}</LanguageProvider>
  </BrowserRouter>
);

describe('StatBar', () => {
  it('renders without crash with valid signalIntegrity', () => {
    render(<StatBar {...defaultProps} />, { wrapper });
    expect(document.body).toBeTruthy();
  });

  it('displays noise level from signalIntegrity', () => {
    render(
      <StatBar {...defaultProps} signalIntegrity={{ noiseLevel: 0.75, jitterMs: 0, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('displays jitter from signalIntegrity', () => {
    render(
      <StatBar {...defaultProps} signalIntegrity={{ noiseLevel: 0, jitterMs: 12, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    expect(screen.getByText('12ms')).toBeInTheDocument();
  });

  it('does not crash when noiseLevel is 0', () => {
    expect(() =>
      render(
        <StatBar {...defaultProps} signalIntegrity={{ noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: false }} />,
        { wrapper }
      )
    ).not.toThrow();
  });

  it('shows amber color class when noiseLevel exceeds 50%', () => {
    const { container } = render(
      <StatBar {...defaultProps} signalIntegrity={{ noiseLevel: 0.6, jitterMs: 0, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    expect(container.querySelector('.text-amber-500')).toBeTruthy();
  });

  it('shows emerald color class when noiseLevel is below 50%', () => {
    const { container } = render(
      <StatBar {...defaultProps} signalIntegrity={{ noiseLevel: 0.1, jitterMs: 0, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    expect(container.querySelector('.text-emerald-500')).toBeTruthy();
  });
});
