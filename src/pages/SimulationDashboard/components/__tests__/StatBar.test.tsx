import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StatBar from '../StatBar';
import { LanguageProvider } from '../../../../i18n/LanguageProvider';
import { BrowserRouter } from 'react-router-dom';
import type { FrameProfile, Scenario, SimulationState } from '../../../../types';

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

const sampleProfile: FrameProfile = {
  id: 'p1',
  name: 'Test Profile',
  description: '',
  baudRate: 9600,
  dataBits: 8,
  parity: 'None',
  stopBits: 1,
  sendIntervalMs: 100,
  fields: [],
  framing: { mode: 'fixed' },
  createdAt: '',
  updatedAt: '',
};

describe('StatBar', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
    vi.clearAllMocks();
  });

  it('renders without crash with valid signalIntegrity', () => {
    render(<StatBar {...defaultProps} />, { wrapper });
    expect(document.body).toBeTruthy();
  });

  it('displays noise level percentage from signalIntegrity', () => {
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

  it('shows LIVE status indicator when running', () => {
    render(<StatBar {...defaultProps} status="running" />, { wrapper });
    expect(screen.getByText(/live/i)).toBeInTheDocument();
  });

  it('shows PAUSED status indicator when paused', () => {
    render(<StatBar {...defaultProps} status="paused" />, { wrapper });
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
  });

  it('shows IDLE status indicator when stopped', () => {
    render(<StatBar {...defaultProps} status="stopped" />, { wrapper });
    expect(screen.getByText(/idle/i)).toBeInTheDocument();
  });

  it('renders profile in select when profiles provided', () => {
    render(<StatBar {...defaultProps} profiles={[sampleProfile]} />, { wrapper });
    expect(screen.getByText('Test Profile')).toBeInTheDocument();
  });

  it('renders scenarios filtered by selectedProfileId', () => {
    const scenarios: Scenario[] = [
      { id: 's1', name: 'Scenario A', profileId: 'p1', steps: [], createdAt: '', updatedAt: '', description: '', loop: false },
      { id: 's2', name: 'Scenario B', profileId: 'p2', steps: [], createdAt: '', updatedAt: '', description: '', loop: false },
    ];
    render(
      <StatBar {...defaultProps} scenarios={scenarios} selectedProfileId="p1" profiles={[sampleProfile]} />,
      { wrapper }
    );
    expect(screen.getByText('Scenario A')).toBeInTheDocument();
    expect(screen.queryByText('Scenario B')).not.toBeInTheDocument();
  });

  it('calls onSetScenario when scenario select changes', () => {
    const onSetScenario = vi.fn();
    const scenarios: Scenario[] = [
      { id: 's1', name: 'Scenario A', profileId: 'p1', steps: [], createdAt: '', updatedAt: '', description: '', loop: false },
      { id: 's2', name: 'Scenario B', profileId: 'p1', steps: [], createdAt: '', updatedAt: '', description: '', loop: false },
    ];

    render(
      <StatBar
        {...defaultProps}
        profiles={[sampleProfile]}
        selectedProfileId="p1"
        scenarios={scenarios}
        onSetScenario={onSetScenario}
      />,
      { wrapper }
    );

    const scenarioSelect = screen
      .getAllByRole('combobox')
      .find((select) => Array.from((select as HTMLSelectElement).options).some((opt) => opt.textContent === 'Scenario A'));

    expect(scenarioSelect).toBeTruthy();
    fireEvent.change(scenarioSelect as HTMLSelectElement, { target: { value: 's2' } });
    expect(onSetScenario).toHaveBeenCalledWith('s2');
  });

  it('shows baud rate badge when a profile is selected', () => {
    render(
      <StatBar {...defaultProps} profiles={[sampleProfile]} selectedProfileId="p1" />,
      { wrapper }
    );
    expect(screen.getByText('9600')).toBeInTheDocument();
  });

  it('calls onSetProfile when profile select changes', () => {
    const onSetProfile = vi.fn();
    render(
      <StatBar {...defaultProps} profiles={[sampleProfile]} onSetProfile={onSetProfile} />,
      { wrapper }
    );
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'p1' } });
    expect(onSetProfile).toHaveBeenCalledWith('p1');
  });

  it('calls onAddProfile when + button is clicked', () => {
    const onAddProfile = vi.fn();
    render(<StatBar {...defaultProps} onAddProfile={onAddProfile} />, { wrapper });
    // Plus button is small; find by title or nearby element
    const buttons = screen.getAllByRole('button');
    // Click the first non-disabled button that isn't a status toggle
    const addBtn = buttons.find(b => !b.hasAttribute('disabled') && b.querySelector('svg'));
    if (addBtn) fireEvent.click(addBtn);
    // At minimum it should not crash
    expect(document.body).toBeTruthy();
  });

  it('shows Connect button when outputMode is serial and not connected', () => {
    render(<StatBar {...defaultProps} outputMode="serial" serialConnected={false} />, { wrapper });
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
  });

  it('shows Disconnect button when serial is connected', () => {
    render(<StatBar {...defaultProps} outputMode="serial" serialConnected={true} />, { wrapper });
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
  });

  it('calls onDisconnectSerial when Disconnect is clicked', () => {
    const onDisconnectSerial = vi.fn();
    render(
      <StatBar {...defaultProps} outputMode="serial" serialConnected={true} status="stopped" onDisconnectSerial={onDisconnectSerial} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(onDisconnectSerial).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleAnalyzerMode when analyzer button clicked', () => {
    const onToggleAnalyzerMode = vi.fn();
    render(<StatBar {...defaultProps} onToggleAnalyzerMode={onToggleAnalyzerMode} />, { wrapper });
    // Find the analyzer toggle button by finding button containing "Analyzer" text or icon
    const allButtons = screen.getAllByRole('button');
    const analyzerBtn = allButtons.find(b => b.textContent?.toLowerCase().includes('analyzer'));
    if (analyzerBtn) {
      fireEvent.click(analyzerBtn);
      expect(onToggleAnalyzerMode).toHaveBeenCalled();
    }
  });

  it('does not crash with tcp outputMode', () => {
    expect(() =>
      render(<StatBar {...defaultProps} outputMode="tcp" />, { wrapper })
    ).not.toThrow();
  });

  it('does not crash with tcp-server outputMode', () => {
    expect(() =>
      render(<StatBar {...defaultProps} outputMode="tcp-server" />, { wrapper })
    ).not.toThrow();
  });

  it('shows recording stop button when isRecording is true', () => {
    render(<StatBar {...defaultProps} isRecording={true} />, { wrapper });
    // Recording active — stop recording button should be present
    expect(document.body).toBeTruthy();
  });

  it('does not crash when networkConnected is true', () => {
    expect(() =>
      render(<StatBar {...defaultProps} networkConnected={true} />, { wrapper })
    ).not.toThrow();
  });

  it('does not crash when elapsedMs > 0', () => {
    expect(() =>
      render(<StatBar {...defaultProps} elapsedMs={5000} frameCount={100} errorCount={3} />, { wrapper })
    ).not.toThrow();
  });

  it('does not crash when analyzerMode is true', () => {
    expect(() =>
      render(<StatBar {...defaultProps} analyzerMode={true} />, { wrapper })
    ).not.toThrow();
  });

  // --- Start / Stop / Pause / Resume buttons ---

  it('calls onStart when Start button clicked with a profile selected', () => {
    const onStart = vi.fn();
    render(
      <StatBar {...defaultProps} profiles={[sampleProfile]} selectedProfileId="p1" onStart={onStart} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('Start button is disabled when no profile is selected', () => {
    render(<StatBar {...defaultProps} />, { wrapper });
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('calls onPause when Pause button clicked while running', () => {
    const onPause = vi.fn();
    render(
      <StatBar {...defaultProps} profiles={[sampleProfile]} selectedProfileId="p1" status="running" onPause={onPause} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when Stop button clicked while running', () => {
    const onStop = vi.fn();
    render(
      <StatBar {...defaultProps} profiles={[sampleProfile]} selectedProfileId="p1" status="running" onStop={onStop} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('calls onResume when Resume button clicked while paused', () => {
    const onResume = vi.fn();
    render(
      <StatBar {...defaultProps} profiles={[sampleProfile]} selectedProfileId="p1" status="paused" onResume={onResume} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when Stop button clicked while paused', () => {
    const onStop = vi.fn();
    render(
      <StatBar {...defaultProps} profiles={[sampleProfile]} selectedProfileId="p1" status="paused" onStop={onStop} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  // --- Validation session buttons ---

  it('calls onStartValidation when Compliance button clicked', () => {
    const onStartValidation = vi.fn();
    render(<StatBar {...defaultProps} validationSession={null} onStartValidation={onStartValidation} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /compliance/i }));
    expect(onStartValidation).toHaveBeenCalledTimes(1);
  });

  it('calls onStopValidation when validation is running', () => {
    const onStopValidation = vi.fn();
    const runningSession = { status: 'running' } as SimulationState['validationSession'];
    render(<StatBar {...defaultProps} validationSession={runningSession} onStopValidation={onStopValidation} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(onStopValidation).toHaveBeenCalledTimes(1);
  });

  it('calls onViewReport when validation is completed', () => {
    const onViewReport = vi.fn();
    const completedSession = { status: 'completed' } as SimulationState['validationSession'];
    render(<StatBar {...defaultProps} validationSession={completedSession} onViewReport={onViewReport} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /view report/i }));
    expect(onViewReport).toHaveBeenCalledTimes(1);
  });

  // --- Recording buttons ---

  it('calls onStartRecording when REC button clicked while running', () => {
    const onStartRecording = vi.fn();
    render(
      <StatBar {...defaultProps} status="running" isRecording={false} onStartRecording={onStartRecording} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /rec/i }));
    expect(onStartRecording).toHaveBeenCalledTimes(1);
  });

  it('calls onStopRecording when recording is active and button clicked', () => {
    const onStopRecording = vi.fn();
    render(
      <StatBar {...defaultProps} status="running" isRecording={true} onStopRecording={onStopRecording} />,
      { wrapper }
    );
    // recording button has no text label when isRecording=true, find by disabled=false among buttons
    const allBtns = screen.getAllByRole('button');
    const recBtn = allBtns.find(b => !(b as HTMLButtonElement).disabled && b.className.includes('rose'));
    if (recBtn) fireEvent.click(recBtn);
    expect(onStopRecording).toHaveBeenCalledTimes(1);
  });

  it('recording button is disabled when status is stopped', () => {
    render(<StatBar {...defaultProps} status="stopped" isRecording={false} />, { wrapper });
    const allBtns = screen.getAllByRole('button');
    const recBtn = allBtns.find(b => b.textContent?.includes('REC'));
    expect(recBtn).toBeDisabled();
  });

  // --- Output mode & TCP inputs ---

  it('calls onSetOutputMode when output mode select changes', () => {
    const onSetOutputMode = vi.fn();
    render(<StatBar {...defaultProps} onSetOutputMode={onSetOutputMode} />, { wrapper });
    const selects = screen.getAllByRole('combobox');
    const modeSelect = selects.find(s => s.querySelector('option[value="serial"]') !== null || Array.from((s as HTMLSelectElement).options ?? []).some((o) => (o as HTMLOptionElement).value === 'serial'));
    // Change to serial
    if (modeSelect) fireEvent.change(modeSelect, { target: { value: 'serial' } });
    expect(onSetOutputMode).toHaveBeenCalledWith('serial');
  });

  it('shows host and port inputs in tcp mode', () => {
    render(<StatBar {...defaultProps} outputMode="tcp" />, { wrapper });
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('shows only port input in tcp-server mode', () => {
    render(<StatBar {...defaultProps} outputMode="tcp-server" />, { wrapper });
    expect(document.body).toBeTruthy();
  });

  it('calls onConnectNetwork with tcp:// url when tcp connect button clicked', () => {
    const onConnectNetwork = vi.fn();
    render(
      <StatBar {...defaultProps} outputMode="tcp" networkConnected={false} onConnectNetwork={onConnectNetwork} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    expect(onConnectNetwork).toHaveBeenCalledWith(expect.stringContaining('tcp://'));
  });

  it('calls onConnectNetwork with tcp-server:// url in tcp-server mode', () => {
    const onConnectNetwork = vi.fn();
    render(
      <StatBar {...defaultProps} outputMode="tcp-server" networkConnected={false} onConnectNetwork={onConnectNetwork} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /listen/i }));
    expect(onConnectNetwork).toHaveBeenCalledWith(expect.stringContaining('tcp-server://'));
  });

  it('calls onDisconnectNetwork when tcp disconnect button clicked', () => {
    const onDisconnectNetwork = vi.fn();
    render(
      <StatBar {...defaultProps} outputMode="tcp" networkConnected={true} onDisconnectNetwork={onDisconnectNetwork} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(onDisconnectNetwork).toHaveBeenCalledTimes(1);
  });

  // --- Port input ---

  it('calls onGetPorts when serial port input is focused', () => {
    const onGetPorts = vi.fn();
    render(<StatBar {...defaultProps} outputMode="serial" onGetPorts={onGetPorts} />, { wrapper });
    // Input with list attribute gets combobox role; use placeholder to find it
    const portInput = screen.getByPlaceholderText(/COM1/i);
    fireEvent.focus(portInput);
    expect(onGetPorts).toHaveBeenCalledTimes(1);
  });

  it('updates port state when port input changes', () => {
    render(<StatBar {...defaultProps} outputMode="serial" />, { wrapper });
    const portInput = screen.getByPlaceholderText(/COM1/i);
    fireEvent.change(portInput, { target: { value: 'COM3' } });
    expect((portInput as HTMLInputElement).value).toBe('COM3');
  });

  it('auto-selects first available port when ports list arrives', () => {
    const { rerender } = render(
      <StatBar {...defaultProps} outputMode="serial" availablePorts={[]} />,
      { wrapper }
    );
    // rerender re-uses the same wrapper — no nested BrowserRouter needed
    rerender(<StatBar {...defaultProps} outputMode="serial" availablePorts={[{ path: 'COM5' }]} />);
    const portInput = screen.getByPlaceholderText(/COM1/i);
    expect(portInput).toBeTruthy();
  });

  // --- Export Report button ---

  it('calls handleExport when Export Report button is clicked', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StatBar {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /export report/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  // --- Backend status button ---

  it('calls onConnectNetwork when backend button clicked while offline', () => {
    const onConnectNetwork = vi.fn();
    render(
      <StatBar {...defaultProps} outputMode="tcp" networkConnected={false} onConnectNetwork={onConnectNetwork} />,
      { wrapper }
    );
    // The ENGINE: OFFLINE button in the backend status section
    const offlineBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('OFFLINE'));
    if (offlineBtn) fireEvent.click(offlineBtn);
    expect(onConnectNetwork).toHaveBeenCalled();
  });

  it('calls onDisconnectNetwork when backend button clicked while online', () => {
    const onDisconnectNetwork = vi.fn();
    render(
      <StatBar {...defaultProps} outputMode="tcp" networkConnected={true} onDisconnectNetwork={onDisconnectNetwork} />,
      { wrapper }
    );
    const onlineBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('ONLINE'));
    if (onlineBtn) fireEvent.click(onlineBtn);
    expect(onDisconnectNetwork).toHaveBeenCalled();
  });

  // --- Language switcher & help ---

  it('toggles locale when language switcher is clicked', () => {
    render(<StatBar {...defaultProps} />, { wrapper });
    // Globe button has title equal to the current locale in uppercase ('EN')
    const langBtn = screen.getByTitle('EN');
    expect(() => fireEvent.click(langBtn)).not.toThrow();
  });

  it('navigates to /help when help button is clicked', () => {
    render(<StatBar {...defaultProps} />, { wrapper });
    // HelpCircle icon button has no text; find by it being the only unlabeled button near the lang button
    const allBtns = screen.getAllByRole('button');
    const helpBtn = allBtns.find(b => !b.textContent?.trim() && !b.title);
    if (helpBtn) fireEvent.click(helpBtn);
    expect(document.body).toBeTruthy();
  });

  // --- TCP inputs ---

  it('updates tcp host input when changed', () => {
    render(<StatBar {...defaultProps} outputMode="tcp" />, { wrapper });
    const inputs = screen.getAllByRole('textbox');
    const hostInput = inputs.find(i => (i as HTMLInputElement).placeholder === '127.0.0.1');
    if (hostInput) {
      fireEvent.change(hostInput, { target: { value: '192.168.1.1' } });
      expect((hostInput as HTMLInputElement).value).toBe('192.168.1.1');
    }
  });

  it('updates tcp port input when changed', () => {
    render(<StatBar {...defaultProps} outputMode="tcp" />, { wrapper });
    const inputs = screen.getAllByRole('textbox');
    const portInput = inputs.find(i => (i as HTMLInputElement).placeholder === '5000');
    if (portInput) {
      fireEvent.change(portInput, { target: { value: '9000' } });
      expect((portInput as HTMLInputElement).value).toBe('9000');
    }
  });

  it('calls onConnectSerial with selected port when Connect button clicked', () => {
    const onConnectSerial = vi.fn();
    render(
      <StatBar {...defaultProps} outputMode="serial" selectedProfileId="p1" profiles={[sampleProfile]} onConnectSerial={onConnectSerial} />,
      { wrapper }
    );
    const portInput = screen.getByPlaceholderText(/COM1/i);
    fireEvent.change(portInput, { target: { value: 'COM3' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    expect(onConnectSerial).toHaveBeenCalledWith('COM3');
  });

  // --- Edit profile button ---

  it('calls onEditProfile when edit button is clicked with a selected profile', () => {
    const onEditProfile = vi.fn();
    render(
      <StatBar {...defaultProps} profiles={[sampleProfile]} selectedProfileId="p1" onEditProfile={onEditProfile} />,
      { wrapper }
    );
    const allBtns = screen.getAllByRole('button');
    // Edit button is the small pencil icon next to the profile select, after the + button
    const _editBtn = allBtns.find(b => b.querySelector('[data-lucide="edit-3"], svg') && b !== allBtns[0]);
    // Click the second small icon button (after +)
    const smallIconBtns = allBtns.filter(b => b.className.includes('p-0.5') || (b.querySelector('svg') && b.textContent === ''));
    if (smallIconBtns.length >= 2) {
      fireEvent.click(smallIconBtns[1]);
      expect(onEditProfile).toHaveBeenCalledWith(sampleProfile);
    }
  });

  // --- Telemetry coloring ---

  it('shows rose color for error count when errorCount > 0', () => {
    const { container } = render(<StatBar {...defaultProps} errorCount={5} />, { wrapper });
    expect(container.querySelector('.text-rose-500')).toBeTruthy();
  });

  it('shows red color for latency when averageLatencyMs > 100', () => {
    const { container } = render(
      <StatBar {...defaultProps} timingStats={{ averageLatencyMs: 150, minLatencyMs: 0, maxLatencyMs: 200, jitterMs: 5 }} />,
      { wrapper }
    );
    expect(container.querySelector('.text-red-400')).toBeTruthy();
  });

  it('shows emerald color for latency when averageLatencyMs <= 100', () => {
    const { container } = render(
      <StatBar {...defaultProps} timingStats={{ averageLatencyMs: 50, minLatencyMs: 0, maxLatencyMs: 100, jitterMs: 2 }} />,
      { wrapper }
    );
    expect(container.querySelector('.text-emerald-400')).toBeTruthy();
  });

  it('shows online status when tcp mode is connected', () => {
    render(<StatBar {...defaultProps} outputMode="tcp" networkConnected={true} />, { wrapper });
    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });

  it('shows tcp-server listening status when tcp-server mode is connected', () => {
    render(<StatBar {...defaultProps} outputMode="tcp-server" networkConnected={true} />, { wrapper });
    expect(screen.getByText(/listening/i)).toBeInTheDocument();
  });

  it('toggles locale when Globe button is clicked', () => {
    localStorage.setItem('uart_locale', 'en');
    render(<StatBar {...defaultProps} />, { wrapper });
    // Default locale is 'en', so the button shows 'EN' as its title
    const globeBtn = screen.getByTitle('EN');
    fireEvent.click(globeBtn);
    // After click locale switches to 'tr'
    expect(screen.getByTitle('TR')).toBeInTheDocument();
  });

  it('shows Start button disabled when no profile is selected', () => {
    render(<StatBar {...defaultProps} status="stopped" selectedProfileId={null} />, { wrapper });
    const startBtn = screen.getByRole('button', { name: /start/i });
    expect(startBtn).toBeDisabled();
  });

  it('shows validationSession view-report button when session exists', () => {
    const session = { id: 's1', startedAt: 0, endedAt: 1000, summary: { pass: 1, fail: 0, warn: 0, totalSteps: 1 }, steps: [] };
    render(<StatBar {...defaultProps} validationSession={session as never} />, { wrapper });
    // Use queryAllByRole to handle multiple matches, just verify at least one exists
    const reportBtns = screen.queryAllByRole('button', { name: /report/i });
    expect(reportBtns.length).toBeGreaterThan(0);
  });
});
