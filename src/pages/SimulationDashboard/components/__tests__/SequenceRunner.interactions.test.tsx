import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LanguageProvider } from '../../../../i18n/LanguageProvider';
import SequenceRunner from '../SequenceRunner';
import type { AutomationSequence } from '../../../../types';

// ─── Mutable state ref so individual tests can inject sequences ───────────────

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

let mockStateRef = buildState();

vi.mock('../../../../hooks/useSimulation', () => ({
  useSimulation: () => ({
    get state() { return mockStateRef; },
    sendRawData: mockSendRawData,
    automation: mockAutomation,
  }),
}));

const renderRunner = (locale: 'tr' | 'en' = 'en') => {
  localStorage.setItem('uart_locale', locale);
  return render(
    <LanguageProvider>
      <SequenceRunner />
    </LanguageProvider>
  );
};

// ─── Step interaction tests ───────────────────────────────────────────────────

describe('SequenceRunner — addStep interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState();
  });

  it('clicking Send add-button appends a send step', () => {
    renderRunner('en');
    // Default 3 steps → 3 number inputs
    const before = document.querySelectorAll('input[type="number"]').length;
    // Send dashed button
    const sendBtn = screen.getByRole('button', { name: /^Send$/i });
    fireEvent.click(sendBtn);
    const after = document.querySelectorAll('input[type="number"]').length;
    expect(after).toBe(before + 1);
  });

  it('clicking Wait add-button appends a wait step', () => {
    renderRunner('en');
    const before = document.querySelectorAll('input[type="number"]').length;
    const waitBtn = screen.getByRole('button', { name: /^Wait$/i });
    fireEvent.click(waitBtn);
    expect(document.querySelectorAll('input[type="number"]').length).toBe(before + 1);
  });

  it('clicking Expect add-button appends an expect step', () => {
    renderRunner('en');
    const before = document.querySelectorAll('input[type="number"]').length;
    const expectBtn = screen.getByRole('button', { name: /^Expect$/i });
    fireEvent.click(expectBtn);
    expect(document.querySelectorAll('input[type="number"]').length).toBe(before + 1);
  });
});

describe('SequenceRunner — removeStep interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState();
  });

  it('clicking the trash button on a step removes it', () => {
    const { container } = renderRunner('en');
    const before = document.querySelectorAll('input[type="number"]').length; // 3 default steps
    // Trash buttons have opacity-0 class
    const trashBtns = container.querySelectorAll('button.opacity-0');
    expect(trashBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(trashBtns[0]);
    expect(document.querySelectorAll('input[type="number"]').length).toBe(before - 1);
  });
});

describe('SequenceRunner — updateStep interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState();
  });

  it('changing step payload updates the displayed value', () => {
    renderRunner('en');
    // Default send step has payload '55 AA 01 02 03'
    const sendInputs = screen.getAllByDisplayValue('55 AA 01 02 03');
    expect(sendInputs.length).toBeGreaterThanOrEqual(1);
    fireEvent.change(sendInputs[0], { target: { value: 'DEADBEEF' } });
    expect(screen.getByDisplayValue('DEADBEEF')).toBeInTheDocument();
  });

  it('changing repeat number input updates the step repeat', () => {
    renderRunner('en');
    const repeatInputs = document.querySelectorAll('input[type="number"]');
    expect(repeatInputs.length).toBeGreaterThan(0);
    fireEvent.change(repeatInputs[0], { target: { value: '3' } });
    expect((repeatInputs[0] as HTMLInputElement).value).toBe('3');
  });
});

describe('SequenceRunner — save and create new', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState();
  });

  it('clicking Save button calls automation.saveSequence', () => {
    renderRunner('en');
    const saveBtn = screen.getByTitle('Save Scenario');
    fireEvent.click(saveBtn);
    expect(mockAutomation.saveSequence).toHaveBeenCalledTimes(1);
    const saved = mockAutomation.saveSequence.mock.calls[0][0];
    expect(saved).toHaveProperty('steps');
    expect(saved).toHaveProperty('name');
  });

  it('clicking New button calls automation.setActiveSequence(null)', () => {
    renderRunner('en');
    const newBtn = screen.getByTitle('New Scenario');
    fireEvent.click(newBtn);
    expect(mockAutomation.setActiveSequence).toHaveBeenCalledWith(null);
  });

  it('Save assigns a new id when no activeId exists', () => {
    renderRunner('en');
    const saveBtn = screen.getByTitle('Save Scenario');
    fireEvent.click(saveBtn);
    const saved = mockAutomation.saveSequence.mock.calls[0][0];
    expect(typeof saved.id).toBe('string');
    expect(saved.id.length).toBeGreaterThan(0);
  });
});

describe('SequenceRunner — campaign mode with sequences', () => {
  const seq1: AutomationSequence = {
    id: 'seq-a', name: 'Alpha Test', group: 'GroupA',
    steps: [{ id: 's1', type: 'send', payload: 'AA', status: 'idle' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const seq2: AutomationSequence = {
    id: 'seq-b', name: 'Beta Test', group: 'GroupA',
    steps: [{ id: 's2', type: 'wait', payload: '100', status: 'idle' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq1, seq2], null);
  });

  it('campaign mode lists saved sequences', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    expect(screen.getByText('Alpha Test')).toBeInTheDocument();
    expect(screen.getByText('Beta Test')).toBeInTheDocument();
  });

  it('Select All button selects all sequences (Run Series enabled)', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Select All'));
    // Run Series button should no longer be disabled
    const runSeriesBtn = screen.getByRole('button', { name: /Run Series/i });
    expect(runSeriesBtn).not.toBeDisabled();
  });

  it('Clear button deselects all sequences', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByText('Clear'));
    const runSeriesBtn = screen.getByRole('button', { name: /Run Series/i });
    expect(runSeriesBtn).toBeDisabled();
  });

  it('clicking a sequence row selects it (Run Series becomes enabled)', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    // Each sequence is rendered as a clickable div containing the sequence name
    const alphaRow = screen.getByText('Alpha Test');
    fireEvent.click(alphaRow);
    const runSeriesBtn = screen.getByRole('button', { name: /Run Series/i });
    expect(runSeriesBtn).not.toBeDisabled();
  });

  it('campaign mode shows selected count label when items selected', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Select All'));
    // Selected count should show "2 selected"
    expect(screen.getByText(/selected/i)).toBeInTheDocument();
  });
});

describe('SequenceRunner — combobox with sequences', () => {
  const seq: AutomationSequence = {
    id: 'seq-x', name: 'My Sequence', group: 'TestGroup',
    steps: [{ id: 's1', type: 'send', payload: 'FF', status: 'idle' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], null);
  });

  it('combobox opens and shows sequence when focused', () => {
    renderRunner('en');
    // searchPlaceholder in EN: 'Search sequences...'
    const comboInput = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(comboInput);
    expect(screen.getByText('My Sequence')).toBeInTheDocument();
  });

  it('clicking sequence in combobox dropdown calls setActiveSequence', () => {
    renderRunner('en');
    const comboInput = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(comboInput);
    const seqBtn = screen.getAllByText('My Sequence')[0];
    fireEvent.mouseDown(seqBtn);
    expect(mockAutomation.setActiveSequence).toHaveBeenCalledWith('seq-x');
  });

  it('typing in combobox filters by query', () => {
    renderRunner('en');
    const comboInput = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(comboInput);
    fireEvent.change(comboInput, { target: { value: 'nomatch' } });
    expect(screen.getByText(/no match/i)).toBeInTheDocument();
  });
});

// ─── Mode switching ───────────────────────────────────────────────────────────

describe('SequenceRunner — mode switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState();
  });

  it('can switch back to single mode from campaign mode', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    expect(screen.getByText('Select All')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Single Sequence'));
    expect(screen.getByRole('button', { name: /^Send$/i })).toBeInTheDocument();
  });

  it('sequenceName input updates value', () => {
    renderRunner('en');
    const nameInput = screen.getByPlaceholderText('Sequence name');
    fireEvent.change(nameInput, { target: { value: 'My Automation' } });
    expect((nameInput as HTMLInputElement).value).toBe('My Automation');
  });

  it('sequenceGroup input updates value', () => {
    renderRunner('en');
    const groupInput = screen.getByPlaceholderText('Group (optional)');
    fireEvent.change(groupInput, { target: { value: 'SensorTests' } });
    expect((groupInput as HTMLInputElement).value).toBe('SensorTests');
  });
});

// ─── activeId interactions ────────────────────────────────────────────────────

describe('SequenceRunner — activeId interactions', () => {
  const seq: AutomationSequence = {
    id: 'seq-active', name: 'Active Seq', group: 'TestGroup',
    steps: [{ id: 's1', type: 'send', payload: 'AA', status: 'idle' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], 'seq-active');
  });

  it('delete button appears when activeId is set', () => {
    renderRunner('en');
    expect(screen.getByTitle('Delete Scenario')).toBeInTheDocument();
  });

  it('clicking delete calls automation.deleteSequence', () => {
    renderRunner('en');
    fireEvent.click(screen.getByTitle('Delete Scenario'));
    expect(mockAutomation.deleteSequence).toHaveBeenCalledWith('seq-active');
  });
});

// ─── toggleGroup in campaign mode ────────────────────────────────────────────

describe('SequenceRunner — toggleGroup', () => {
  const mkSeq = (id: string, name: string): AutomationSequence => ({
    id, name, group: 'Alpha',
    steps: [{ id: 's1', type: 'send', payload: 'AA', status: 'idle' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([mkSeq('sg1', 'Seq One'), mkSeq('sg2', 'Seq Two')], null);
  });

  it('clicking group header selects all sequences in group', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    const groupBtn = screen.getByRole('button', { name: /Alpha/i });
    fireEvent.click(groupBtn);
    expect(screen.getByRole('button', { name: /Run Series/i })).not.toBeDisabled();
  });

  it('partially selected group shows indeterminate state', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    // Select only the first sequence row
    fireEvent.click(screen.getByText('Seq One'));
    // Group header box is still there and Run Series becomes enabled
    expect(screen.getByRole('button', { name: /Run Series/i })).not.toBeDisabled();
    // Clicking group header again toggles remaining
    const groupBtn = screen.getByRole('button', { name: /Alpha/i });
    fireEvent.click(groupBtn); // adds missing seq → all selected
    fireEvent.click(groupBtn); // all → deselect all
    expect(screen.getByRole('button', { name: /Run Series/i })).toBeDisabled();
  });
});

// ─── runSingle async ─────────────────────────────────────────────────────────

describe('SequenceRunner — runSingle async', () => {
  const seq: AutomationSequence = {
    id: 'seq-run', name: 'Run Test', group: 'G',
    steps: [{ id: 's1', type: 'send', payload: 'AA', status: 'idle' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], 'seq-run');
  });

  it('runSingle calls sendRawData and completes', async () => {
    renderRunner('en');
    vi.useFakeTimers();

    const runBtn = screen.getByRole('button', { name: /^Run$/i });
    fireEvent.click(runBtn);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.useRealTimers();
    expect(mockSendRawData).toHaveBeenCalledWith('AA');
  });

  it('stopSingle cancels the running sequence', async () => {
    renderRunner('en');
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole('button', { name: /^Run$/i }));
    // Stop before timers fire
    fireEvent.click(screen.getByRole('button', { name: /^Stop$/i }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.useRealTimers();
    // After stop, Run button reappears
    expect(screen.getByRole('button', { name: /^Run$/i })).toBeInTheDocument();
  });
});

// ─── runCampaign async + ReportModal ─────────────────────────────────────────

describe('SequenceRunner — runCampaign and ReportModal', () => {
  const seq: AutomationSequence = {
    id: 'cseq', name: 'Campaign Test', group: 'G1',
    steps: [{ id: 's1', type: 'send', payload: 'BB', status: 'idle' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], null);
  });

  it('runCampaign completes and shows the report modal', async () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Campaign Test'));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Run Series/i }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.useRealTimers();
    expect(screen.getByText('Test Series Report')).toBeInTheDocument();
  });

  it('ReportModal close button hides the modal', async () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Campaign Test'));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Run Series/i }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.useRealTimers();
    expect(screen.getByText('Test Series Report')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText('Test Series Report')).not.toBeInTheDocument();
  });

  it('Report button in toolbar appears after campaign completes', async () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Campaign Test'));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Run Series/i }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.useRealTimers();
    // Close the auto-shown modal first
    fireEvent.click(screen.getByText('Close'));
    // Report button should now be visible in the toolbar
    expect(screen.getByRole('button', { name: /Report/i })).toBeInTheDocument();
  });

  it('stopCampaign cancels campaign execution', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Campaign Test'));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Run Series/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Stop$/i }));

    vi.useRealTimers();
    expect(screen.getByRole('button', { name: /Run Series/i })).toBeInTheDocument();
  });
});
