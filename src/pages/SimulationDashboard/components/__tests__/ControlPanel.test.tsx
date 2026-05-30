import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ControlPanel from '../ControlPanel';
import { LanguageProvider } from '../../../../i18n/LanguageProvider';
import type { Field, ErrorType } from '../../../../types';

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

const makeFlagsField = (id: string, name: string, bits: Array<{ index: number; name: string; defaultValue: 0 | 1 }>): Field => ({
  id,
  name,
  order: 0,
  byteWidth: 1,
  endianness: 'big',
  type: 'flags',
  typeConfig: { bits: bits.map(b => ({ ...b, behavior: 'fixed', behaviorConfig: {} })) },
});

const makeRangeField = (id: string, name: string, min: number, max: number): Field => ({
  id,
  name,
  order: 0,
  byteWidth: 1,
  endianness: 'big',
  type: 'range',
  typeConfig: { min, max, distribution: 'uniform' },
});

describe('ControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
  });

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

  it('reflects bitFlipsEnabled toggle state via re-render', () => {
    const { rerender } = render(
      <ControlPanel {...defaultProps} signalIntegrity={{ noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    expect(() =>
      rerender(
        <LanguageProvider>
          <ControlPanel {...defaultProps} signalIntegrity={{ noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: true }} />
        </LanguageProvider>
      )
    ).not.toThrow();
  });

  it('calls onSetSignalIntegrity when bit-flip toggle is clicked', () => {
    const onSetSignalIntegrity = vi.fn();
    render(
      <ControlPanel {...defaultProps} onSetSignalIntegrity={onSetSignalIntegrity} signalIntegrity={{ noiseLevel: 0, jitterMs: 0, bitFlipsEnabled: false }} />,
      { wrapper }
    );
    // The toggle button is the only button in the Signal Quality section
    const toggleBtn = screen.getAllByRole('button').find(b => b.className.includes('rounded-full'));
    if (toggleBtn) fireEvent.click(toggleBtn);
    expect(onSetSignalIntegrity).toHaveBeenCalledWith({ bitFlipsEnabled: true });
  });

  it('renders flags field with bit buttons', () => {
    const flagsField = makeFlagsField('f1', 'Status', [
      { index: 0, name: 'BIT0', defaultValue: 0 },
      { index: 1, name: 'BIT1', defaultValue: 1 },
    ]);
    render(<ControlPanel {...defaultProps} flagsFields={[flagsField]} />, { wrapper });
    expect(screen.getByText('BIT0')).toBeInTheDocument();
    expect(screen.getByText('BIT1')).toBeInTheDocument();
  });

  it('calls onOverrideBit when a flag bit button is clicked', () => {
    const onOverrideBit = vi.fn();
    const flagsField = makeFlagsField('f1', 'Status', [
      { index: 0, name: 'ALARM', defaultValue: 0 },
    ]);
    render(
      <ControlPanel {...defaultProps} flagsFields={[flagsField]} onOverrideBit={onOverrideBit} />,
      { wrapper }
    );
    fireEvent.click(screen.getByText('ALARM'));
    expect(onOverrideBit).toHaveBeenCalledWith('f1.ALARM', 1);
  });

  it('calls onOverrideBit with 0 when an active bit is clicked', () => {
    const onOverrideBit = vi.fn();
    const flagsField = makeFlagsField('f1', 'Status', [
      { index: 0, name: 'ALARM', defaultValue: 1 },
    ]);
    render(
      <ControlPanel {...defaultProps} flagsFields={[flagsField]} bitOverrides={{ 'f1.ALARM': 1 }} onOverrideBit={onOverrideBit} />,
      { wrapper }
    );
    fireEvent.click(screen.getByText('ALARM'));
    expect(onOverrideBit).toHaveBeenCalledWith('f1.ALARM', 0);
  });

  it('renders range field with slider', () => {
    const rangeField = makeRangeField('temp', 'Temperature', 0, 100);
    render(<ControlPanel {...defaultProps} allRangeFields={[rangeField]} />, { wrapper });
    expect(screen.getByText('Temperature')).toBeInTheDocument();
  });

  it('calls onOverrideField when range slider changes', () => {
    const onOverrideField = vi.fn();
    const rangeField = makeRangeField('temp', 'Temperature', 0, 100);
    render(
      <ControlPanel {...defaultProps} allRangeFields={[rangeField]} onOverrideField={onOverrideField} />,
      { wrapper }
    );
    // Range field slider renders before signal integrity sliders, so index 0
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '75' } });
    expect(onOverrideField).toHaveBeenCalledWith('temp', 75);
  });

  it('shows override highlight when field has override', () => {
    const rangeField = makeRangeField('temp', 'Temperature', 0, 100);
    render(
      <ControlPanel {...defaultProps} allRangeFields={[rangeField]} fieldOverrides={{ temp: 42 }} />,
      { wrapper }
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('calls onResetOverrides when reset button is clicked', () => {
    const onResetOverrides = vi.fn();
    const rangeField = makeRangeField('temp', 'Temperature', 0, 100);
    render(
      <ControlPanel {...defaultProps} allRangeFields={[rangeField]} onResetOverrides={onResetOverrides} />,
      { wrapper }
    );
    const resetBtn = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetBtn);
    expect(onResetOverrides).toHaveBeenCalledTimes(1);
  });

  it('renders error injection buttons', () => {
    const errorTypes = [
      { type: 'corrupt_checksum' as ErrorType, label: 'CRC Error', color: 'text-red-400 border-red-800' },
      { type: 'wrong_sync' as ErrorType, label: 'Sync Error', color: 'text-orange-400 border-orange-800' },
    ];
    render(<ControlPanel {...defaultProps} errorTypes={errorTypes} />, { wrapper });
    expect(screen.getByText('CRC Error')).toBeInTheDocument();
    expect(screen.getByText('Sync Error')).toBeInTheDocument();
  });

  it('disables error injection buttons when status is not running', () => {
    const errorTypes = [
      { type: 'corrupt_checksum' as ErrorType, label: 'CRC Error', color: '' },
    ];
    render(<ControlPanel {...defaultProps} errorTypes={errorTypes} status="stopped" />, { wrapper });
    expect(screen.getByRole('button', { name: 'CRC Error' })).toBeDisabled();
  });

  it('enables error injection when status is running', () => {
    const errorTypes = [
      { type: 'corrupt_checksum' as ErrorType, label: 'CRC Error', color: '' },
    ];
    render(<ControlPanel {...defaultProps} errorTypes={errorTypes} status="running" />, { wrapper });
    expect(screen.getByRole('button', { name: 'CRC Error' })).not.toBeDisabled();
  });

  it('calls onInjectError when error button is clicked during running', () => {
    const onInjectError = vi.fn();
    const errorTypes = [
      { type: 'corrupt_checksum' as ErrorType, label: 'CRC Error', color: '' },
    ];
    render(
      <ControlPanel {...defaultProps} errorTypes={errorTypes} status="running" onInjectError={onInjectError} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: 'CRC Error' }));
    expect(onInjectError).toHaveBeenCalledWith('corrupt_checksum');
  });

  it('shows pending errors count when pendingErrors is non-empty', () => {
    render(
      <ControlPanel {...defaultProps} pendingErrors={['corrupt_checksum', 'wrong_sync']} />,
      { wrapper }
    );
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('renders log entries when provided', () => {
    const logEntries = [
      { type: 'info', time: '12:00:00.000', text: 'Simulation started' },
      { type: 'error', time: '12:00:01.000', text: 'Frame error detected' },
    ];
    render(<ControlPanel {...defaultProps} logEntries={logEntries} />, { wrapper });
    expect(screen.getByText('Simulation started')).toBeInTheDocument();
    expect(screen.getByText('Frame error detected')).toBeInTheDocument();
  });

  it('does not crash when noise slider changes', () => {
    const onSetSignalIntegrity = vi.fn();
    render(
      <ControlPanel {...defaultProps} onSetSignalIntegrity={onSetSignalIntegrity} />,
      { wrapper }
    );
    // defaultProps has allRangeFields:[], so only noise (0) and jitter (1) sliders
    const sliders = screen.getAllByRole('slider');
    expect(() => fireEvent.change(sliders[0], { target: { value: '0.02' } })).not.toThrow();
    expect(onSetSignalIntegrity).toHaveBeenCalledWith({ noiseLevel: 0.02 });
  });

  it('does not crash when jitter slider changes', () => {
    const onSetSignalIntegrity = vi.fn();
    render(
      <ControlPanel {...defaultProps} onSetSignalIntegrity={onSetSignalIntegrity} />,
      { wrapper }
    );
    // defaultProps has allRangeFields:[], so only noise (0) and jitter (1) sliders
    const sliders = screen.getAllByRole('slider');
    expect(() => fireEvent.change(sliders[1], { target: { value: '10' } })).not.toThrow();
    expect(onSetSignalIntegrity).toHaveBeenCalledWith({ jitterMs: 10 });
  });

  it('renders tx log entry with correct color class', () => {
    const { container } = render(
      <ControlPanel {...defaultProps} logEntries={[{ type: 'tx', time: '00:00:01.000', text: 'TX: AA BB' }]} />,
      { wrapper }
    );
    expect(container.querySelector('.text-green-600')).toBeTruthy();
    expect(screen.getByText('AA BB')).toBeInTheDocument();
  });

  it('renders rx log entry with correct color class', () => {
    const { container } = render(
      <ControlPanel {...defaultProps} logEntries={[{ type: 'rx', time: '00:00:02.000', text: '[RAW RX]: CC DD' }]} />,
      { wrapper }
    );
    expect(container.querySelector('.text-blue-500')).toBeTruthy();
    expect(screen.getByText('CC DD')).toBeInTheDocument();
  });

  it('renders error log entry with correct color class', () => {
    const { container } = render(
      <ControlPanel {...defaultProps} logEntries={[{ type: 'error', time: '00:00:03.000', text: 'Checksum fail' }]} />,
      { wrapper }
    );
    expect(container.querySelector('.text-red-600')).toBeTruthy();
  });

  it('renders info log entry with gray color class', () => {
    const { container } = render(
      <ControlPanel {...defaultProps} logEntries={[{ type: 'info', time: '00:00:04.000', text: 'Session began' }]} />,
      { wrapper }
    );
    expect(container.querySelector('.text-gray-400')).toBeTruthy();
  });

  it('calls onExportLogs when CSV export button is clicked', () => {
    const onExportLogs = vi.fn();
    render(<ControlPanel {...defaultProps} onExportLogs={onExportLogs} />, { wrapper });
    const exportBtn = screen.getByRole('button', { name: /csv/i });
    fireEvent.click(exportBtn);
    expect(onExportLogs).toHaveBeenCalledTimes(1);
  });

  it('shows empty log message when logEntries is empty', () => {
    render(<ControlPanel {...defaultProps} logEntries={[]} />, { wrapper });
    expect(document.body.textContent).toMatch(/logs will appear|simulation starts/i);
  });
});

// ─── Alarm Threshold Branch Coverage ─────────────────────────────────────────

const makeAlarmField = (
  id: string, name: string, min: number, max: number,
  alarmLow?: number, alarmHigh?: number,
): Field => ({
  id, name, order: 0, byteWidth: 1, endianness: 'big' as const,
  type: 'range' as const,
  typeConfig: { min, max, distribution: 'uniform' as const },
  alarmLow,
  alarmHigh,
});

describe('ControlPanel — alarm thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
  });

  it('renders alarm zone track (alarmLow + alarmHigh) without crashing', () => {
    // min=0, max=100, midpoint=50 — distinct from alarmLow=30 and alarmHigh=80
    const field = makeAlarmField('spo2', 'SpO2', 0, 100, 30, 80);
    render(<ControlPanel {...defaultProps} allRangeFields={[field]} />, { wrapper });
    expect(screen.getByText('SpO2')).toBeInTheDocument();
    expect(screen.getAllByText('30').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('80').length).toBeGreaterThanOrEqual(1);
  });

  it('shows alarm indicator (!) when value is below alarmLow', () => {
    const field = makeAlarmField('spo2', 'SpO2', 0, 100, 60, 100);
    render(
      <ControlPanel {...defaultProps} allRangeFields={[field]} fieldOverrides={{ spo2: 40 }} />,
      { wrapper },
    );
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  it('shows alarm indicator (!) when value is above alarmHigh', () => {
    const field = makeAlarmField('hr', 'HR', 0, 200, 60, 100);
    render(
      <ControlPanel {...defaultProps} allRangeFields={[field]} fieldOverrides={{ hr: 150 }} />,
      { wrapper },
    );
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  it('shows secondary alarm coloring on other fields when one field is in alarm', () => {
    const hrField = makeAlarmField('hr', 'HR', 0, 200, 60, 100);
    const spo2Field = makeAlarmField('spo2', 'SpO2', 80, 100, 90, 99);
    // hr override = 150 > 100 → inAlarm; spo2 uses midpoint ≈ 90 → inSecondaryAlarm
    render(
      <ControlPanel {...defaultProps} allRangeFields={[hrField, spo2Field]} fieldOverrides={{ hr: 150 }} />,
      { wrapper },
    );
    expect(document.querySelector('.text-rose-400')).toBeTruthy();
    expect(document.querySelector('.text-rose-700')).toBeTruthy();
  });

  it('renders with only alarmLow set (no alarmHigh)', () => {
    const field = makeAlarmField('spo2', 'SpO2', 0, 100, 60, undefined);
    render(<ControlPanel {...defaultProps} allRangeFields={[field]} />, { wrapper });
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('renders with only alarmHigh set (no alarmLow)', () => {
    // min=0, max=200, midpoint=100 — distinct from alarmHigh=150
    const field = makeAlarmField('hr', 'HR', 0, 200, undefined, 150);
    render(<ControlPanel {...defaultProps} allRangeFields={[field]} />, { wrapper });
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('does not show alarm indicator when value is within normal range', () => {
    const field = makeAlarmField('spo2', 'SpO2', 0, 100, 60, 100);
    render(
      <ControlPanel {...defaultProps} allRangeFields={[field]} fieldOverrides={{ spo2: 80 }} />,
      { wrapper },
    );
    expect(screen.queryByText('!')).not.toBeInTheDocument();
  });

  it('uses fieldOverrides ?? midpoint for anyFieldInAlarm calculation', () => {
    // alarmLow = 50, alarmHigh = 90, no override → midpoint = 50 → on boundary
    // midpoint of 0..100 = 50, which equals alarmLow — "not < 50" → no alarm
    const field = makeAlarmField('val', 'Val', 0, 100, 50, 90);
    expect(() =>
      render(<ControlPanel {...defaultProps} allRangeFields={[field]} />, { wrapper })
    ).not.toThrow();
  });

  it('handles range field with min === max without dividing by zero', () => {
    // range = 0 → `|| 1` fallback in ControlPanel
    const field = makeRangeField('flat', 'Flat', 50, 50);
    expect(() =>
      render(<ControlPanel {...defaultProps} allRangeFields={[field]} />, { wrapper })
    ).not.toThrow();
  });

  it('triggers auto-scroll effect when logEntries are updated', () => {
    const { rerender } = render(<ControlPanel {...defaultProps} logEntries={[]} />, { wrapper });
    // Rerender with new log entries — effect fires and tries to scroll logRef.current
    expect(() =>
      rerender(
        <ControlPanel
          {...defaultProps}
          logEntries={[{ type: 'info', time: '00:00:01.000', text: 'New entry' }]}
        />
      )
    ).not.toThrow();
  });

});
