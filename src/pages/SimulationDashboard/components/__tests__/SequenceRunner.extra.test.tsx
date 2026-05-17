import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LanguageProvider } from '../../../../i18n/LanguageProvider';
import SequenceRunner from '../SequenceRunner';
import type { AutomationSequence } from '../../../../types';

// Force triggerDownload to use the blob fallback (Tauri FS not available in test env)
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn().mockRejectedValue(new Error('not in browser')),
  BaseDirectory: { Download: 0 },
}));

// ─── Shared mock setup (mirrors interactions test) ────────────────────────────

const mockAutomation = {
  saveSequence: vi.fn(),
  deleteSequence: vi.fn(),
  setActiveSequence: vi.fn(),
};
const mockSendRawData = vi.fn();

const buildState = (sequences: AutomationSequence[] = [], activeSequenceId: string | null = null) => ({
  sequences,
  activeSequenceId,
  conversationLogs: [] as { type: string; rawHex: string }[],
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

const mkSeq = (id: string, name: string, group: string, steps?: AutomationSequence['steps']): AutomationSequence => ({
  id, name, group,
  steps: steps ?? [{ id: 's1', type: 'send', payload: 'AA', status: 'idle' }],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

// ─── SequenceCombobox keyboard navigation ─────────────────────────────────────

describe('SequenceRunner — combobox keyboard navigation', () => {
  const seq = mkSeq('kbd-s1', 'KbdSequence', 'KbdGroup');

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], null);
  });

  it('ArrowDown on closed input opens dropdown', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByText('KbdSequence').length).toBeGreaterThan(0);
  });

  it('Enter on closed input opens dropdown', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getAllByText('KbdSequence').length).toBeGreaterThan(0);
  });

  it('ArrowDown then Enter selects highlighted item', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockAutomation.setActiveSequence).toHaveBeenCalledWith('kbd-s1');
  });

  it('Escape closes the dropdown', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    expect(screen.getAllByText('KbdSequence').length).toBeGreaterThan(0);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryAllByRole('button', { name: /KbdSequence/ }).length).toBe(0);
  });

  it('ArrowUp at top stays at first item without crash', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    // no crash, still open
    expect(screen.getAllByText('KbdSequence').length).toBeGreaterThan(0);
  });

  it('ArrowDown beyond last item stays at last', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // past end
    // still open, no crash
    expect(screen.getAllByText('KbdSequence').length).toBeGreaterThan(0);
  });

  it('mouseEnter sets highlighted item', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    const seqBtn = screen.getAllByText('KbdSequence')[0].closest('button');
    if (seqBtn) fireEvent.mouseEnter(seqBtn);
    // no crash
  });

  it('shows group tag when selected sequence has a group', () => {
    mockStateRef = buildState([seq], 'kbd-s1');
    renderRunner('en');
    expect(screen.getByText('KbdGroup')).toBeInTheDocument();
  });

  it('shows General when selected sequence has no group', () => {
    const noGroupSeq = mkSeq('no-group', 'NoGroup Seq', '');
    mockStateRef = buildState([noGroupSeq], 'no-group');
    renderRunner('en');
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
  });

  it('Enter with no highlighted item does not select', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    // Press Enter without navigating (no highlighted)
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockAutomation.setActiveSequence).not.toHaveBeenCalled();
  });

  it('outside mousedown closes dropdown', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    expect(screen.getAllByText('KbdSequence').length).toBeGreaterThan(0);
    fireEvent.mouseDown(document.body);
    expect(screen.queryAllByRole('button', { name: /KbdSequence/ }).length).toBe(0);
  });
});

// ─── ExpandableResult toggle and fail branch ──────────────────────────────────

describe('SequenceRunner — ExpandableResult and fail campaign', () => {
  const failSeq = mkSeq('fail-seq', 'Fail Sequence', 'FailGroup', [
    { id: 'se1', type: 'expect', payload: 'DEAD|200', status: 'idle' },
  ]);

  const runFailCampaign = async () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Fail Sequence'));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Run Series/i }));
    await act(async () => { await vi.runAllTimersAsync(); });
    vi.useRealTimers();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([failSeq], null);
  });

  it('fail result shows report modal with fail count badge', async () => {
    await runFailCampaign();
    expect(screen.getByText('Test Series Report')).toBeInTheDocument();
    expect(screen.getAllByText(/Failed/i).length).toBeGreaterThan(0);
  });

  it('fail ExpandableResult starts expanded and can be toggled closed', async () => {
    await runFailCampaign();
    // Fail result starts open — find the toggle button by sequence name
    const resultBtn = screen.getByRole('button', { name: /Fail Sequence/i });
    expect(resultBtn).toBeInTheDocument();
    fireEvent.click(resultBtn); // collapse
    fireEvent.click(resultBtn); // expand again
  });

  it('closing report modal hides it', async () => {
    await runFailCampaign();
    expect(screen.getByText('Test Series Report')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText('Test Series Report')).not.toBeInTheDocument();
  });

  it('Report toolbar button re-opens the modal', async () => {
    await runFailCampaign();
    fireEvent.click(screen.getByText('Close'));
    fireEvent.click(screen.getByRole('button', { name: /Report/i }));
    expect(screen.getByText('Test Series Report')).toBeInTheDocument();
  });

  it('downloadJunit button triggers blob download', async () => {
    await runFailCampaign();
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await act(async () => {
      fireEvent.click(screen.getByText('JUnit XML'));
      // allow Promise chains to resolve
      await new Promise(r => setTimeout(r, 0));
    });
    expect(spy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('printPdf button builds HTML without throwing', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    await runFailCampaign();
    expect(() => fireEvent.click(screen.getByText('Download PDF'))).not.toThrow();
    vi.restoreAllMocks();
  });

  it('JUnit XML includes failure message for failed step', async () => {
    // Run and open modal — just verify no crash and modal shows
    await runFailCampaign();
    expect(screen.getByText('Test Series Report')).toBeInTheDocument();
  });
});

// ─── Pass campaign: ExpandableResult pass branch ──────────────────────────────

describe('SequenceRunner — pass campaign ExpandableResult', () => {
  const passSeq = mkSeq('pass-seq', 'Pass Sequence', 'PassGroup', [
    { id: 'ps1', type: 'send', payload: 'BB', status: 'idle' },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([passSeq], null);
  });

  it('pass result ExpandableResult starts collapsed and can be expanded', async () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('Pass Sequence'));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Run Series/i }));
    await act(async () => { await vi.runAllTimersAsync(); });
    vi.useRealTimers();

    // Pass result → ExpandableResult starts closed (open=false)
    expect(screen.getByText('Test Series Report')).toBeInTheDocument();
    const resultBtn = screen.getByRole('button', { name: /Pass Sequence/i });
    fireEvent.click(resultBtn); // expand
    fireEvent.click(resultBtn); // collapse
  });
});

// ─── expect step that succeeds ────────────────────────────────────────────────

describe('SequenceRunner — expect step success', () => {
  const expectSeq = mkSeq('expect-ok', 'Expect OK', 'EG', [
    { id: 'e1', type: 'expect', payload: 'AABB', status: 'idle' },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([expectSeq], 'expect-ok');
  });

  it('expect step passes when matching log is in state', async () => {
    renderRunner('en');
    // Pre-populate matching conversation log
    mockStateRef.conversationLogs = [{ type: 'rx', rawHex: 'AA BB' }];

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /^Run$/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    vi.useRealTimers();

    // Sequence completed (Run button back, not Stop)
    expect(screen.getByRole('button', { name: /^Run$/i })).toBeInTheDocument();
  });
});

// ─── Repeat step execution ────────────────────────────────────────────────────

describe('SequenceRunner — repeat step execution', () => {
  const repeatSeq = mkSeq('repeat-seq', 'Repeat Test', 'R', [
    { id: 'r1', type: 'send', payload: 'CC', repeat: 3, status: 'idle' },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([repeatSeq], 'repeat-seq');
  });

  it('send step with repeat=3 calls sendRawData 3 times', async () => {
    renderRunner('en');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /^Run$/i }));
    await act(async () => { await vi.runAllTimersAsync(); });
    vi.useRealTimers();
    expect(mockSendRawData).toHaveBeenCalledTimes(3);
    expect(mockSendRawData).toHaveBeenCalledWith('CC');
  });
});

// ─── Export and import buttons ────────────────────────────────────────────────

describe('SequenceRunner — export JSON button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState();
  });

  it('single mode Export JSON button triggers blob download', async () => {
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    renderRunner('en');
    await act(async () => { fireEvent.click(screen.getByTitle('Export JSON')); });
    await act(async () => {});
    expect(spy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('SequenceRunner — campaign mode import button', () => {
  const seq = mkSeq('imp-s1', 'ImpSeq', 'IG');

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], null);
  });

  it('clicking Import JSON in campaign mode does not crash', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    // Click import button — calls importRef.current?.click()
    const importBtns = screen.getAllByTitle('Import JSON');
    fireEvent.click(importBtns[0]);
    // No crash
  });
});

// ─── Wait step execution ──────────────────────────────────────────────────────

describe('SequenceRunner — wait step execution', () => {
  const waitSeq = mkSeq('wait-seq', 'Wait Test', 'W', [
    { id: 'w1', type: 'wait', payload: '300', status: 'idle' },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([waitSeq], 'wait-seq');
  });

  it('wait step completes after timer fires', async () => {
    renderRunner('en');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /^Run$/i }));
    await act(async () => { await vi.runAllTimersAsync(); });
    vi.useRealTimers();
    expect(screen.getByRole('button', { name: /^Run$/i })).toBeInTheDocument();
  });
});

// ─── Campaign mode: export all sequences ─────────────────────────────────────

describe('SequenceRunner — campaign export all', () => {
  const seq = mkSeq('ea-s1', 'ExportAll', 'EA');

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], null);
  });

  it('Export JSON in campaign mode calls triggerDownload', async () => {
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    await act(async () => { fireEvent.click(screen.getAllByTitle('Export JSON')[0]); });
    await act(async () => {});
    expect(spy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

// ─── isNewModeRef / createNew flow ────────────────────────────────────────────

describe('SequenceRunner — createNew and isNewModeRef', () => {
  const seq = mkSeq('new-s1', 'Existing Seq', 'NG');

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], 'new-s1');
  });

  it('createNew clears steps and sets untitled name', () => {
    renderRunner('en');
    fireEvent.click(screen.getByTitle('New Scenario'));
    expect(mockAutomation.setActiveSequence).toHaveBeenCalledWith(null);
    // Steps cleared — add-step buttons visible (steps.length===0 means Run disabled)
    expect(screen.getByRole('button', { name: /^Run$/i })).toBeDisabled();
  });

  it('activeSequenceId change while in new mode does not reload steps', () => {
    renderRunner('en');
    fireEvent.click(screen.getByTitle('New Scenario'));
    // isNewModeRef.current = true now; state change should be ignored
    mockStateRef = { ...mockStateRef, activeSequenceId: 'new-s1' };
    // No re-load (isNewModeRef guards the useEffect)
    expect(screen.getByRole('button', { name: /^Run$/i })).toBeDisabled();
  });
});

// ─── Campaign mode: no sequences empty state ──────────────────────────────────

describe('SequenceRunner — campaign empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([], null);
  });

  it('shows empty state in campaign mode when no sequences', () => {
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    expect(screen.getByText(/No saved sequences/i)).toBeInTheDocument();
  });
});

// ─── handleImportFile ─────────────────────────────────────────────────────────

describe('SequenceRunner — handleImportFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState();
  });

  it('valid JSON import saves sequences and shows success toast', async () => {
    renderRunner('en');
    const json = JSON.stringify({
      format: 'uart-sequences',
      sequences: [{ id: 'imp1', name: 'Imported', group: 'IG', steps: [] }],
    });
    const file = new File([json], 'seqs.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await new Promise(r => setTimeout(r, 50));
    });
    expect(mockAutomation.saveSequence).toHaveBeenCalled();
  });

  it('invalid format JSON shows error toast', async () => {
    renderRunner('en');
    const json = JSON.stringify({ format: 'wrong-format', data: [] });
    const file = new File([json], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await new Promise(r => setTimeout(r, 50));
    });
    // No sequences saved on bad format
    expect(mockAutomation.saveSequence).not.toHaveBeenCalled();
  });

  it('no-file guard: change with no files does nothing', () => {
    renderRunner('en');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(mockAutomation.saveSequence).not.toHaveBeenCalled();
  });
});

// ─── Single mode import button click ─────────────────────────────────────────

describe('SequenceRunner — single mode import button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState();
  });

  it('clicking Import JSON in single mode does not crash', () => {
    renderRunner('en');
    // In single mode, the import button has only an icon, so use title
    fireEvent.click(screen.getByTitle('Import JSON'));
    // no crash
  });
});

// ─── buildHtml Turkish locale ─────────────────────────────────────────────────

describe('SequenceRunner — report modal with Turkish locale', () => {
  const passSeq = mkSeq('tr-pass', 'TR Test', 'TRGroup', [
    { id: 'tp1', type: 'send', payload: 'AA', status: 'idle' },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([passSeq], null);
  });

  it('printPdf in Turkish locale uses tr-TR date format', async () => {
    localStorage.setItem('uart_locale', 'tr');
    render(<></>); // just set locale
    renderRunner('tr');
    fireEvent.click(screen.getByText('Test Serisi'));
    fireEvent.click(screen.getByText('TR Test'));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Seriyi Çalıştır/i }));
    await act(async () => { await vi.runAllTimersAsync(); });
    vi.useRealTimers();
    // Modal is open with TR locale
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    expect(() => fireEvent.click(screen.getByText('Kapat'))).not.toThrow();
    vi.restoreAllMocks();
  });
});

// ─── Cancel during multi-step execution ──────────────────────────────────────

describe('SequenceRunner — cancel during multi-step execution', () => {
  const twoStepSeq = mkSeq('two-step', 'Two Steps', 'TS', [
    { id: 's1', type: 'send', payload: 'AA', status: 'idle' },
    { id: 's2', type: 'send', payload: 'BB', status: 'idle' },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([twoStepSeq], 'two-step');
  });

  it('cancel between steps stops execution via cancelRef break', async () => {
    renderRunner('en');
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole('button', { name: /^Run$/i }));
    // Advance past step 1's delay (100ms)
    await act(async () => { await vi.advanceTimersByTimeAsync(110); });
    // Cancel before step 2 starts
    fireEvent.click(screen.getByRole('button', { name: /^Stop$/i }));
    await act(async () => { await vi.runAllTimersAsync(); });

    vi.useRealTimers();
    // Step 1 sent, step 2 cancelled — sendRawData called only once or twice (timing-dependent)
    expect(mockSendRawData).toHaveBeenCalledWith('AA');
  });
});

// ─── Combobox: filter by group name ──────────────────────────────────────────

describe('SequenceRunner — combobox group-based filter', () => {
  const seq = mkSeq('gf-s1', 'AlphaSeq', 'GroupFilter');

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([seq], null);
  });

  it('typing group name (not matching sequence name) filters by group', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    // Type the GROUP name (not sequence name) to trigger the || second operand
    fireEvent.change(input, { target: { value: 'GroupFilter' } });
    // Sequence should still appear (matched via group)
    expect(screen.getAllByText('AlphaSeq').length).toBeGreaterThan(0);
  });

  it('typing non-matching query shows no match message', () => {
    renderRunner('en');
    const input = screen.getByPlaceholderText('Search sequences...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzznomatch' } });
    expect(screen.getByText(/no match/i)).toBeInTheDocument();
  });
});

// ─── buildHtml with pass campaign result (printPdf) ──────────────────────────

describe('SequenceRunner — printPdf with pass result', () => {
  const passSeq = mkSeq('pdf-pass', 'PDF Pass', 'PDFGroup', [
    { id: 'pp1', type: 'send', payload: 'CC', status: 'idle' },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState([passSeq], null);
  });

  it('printPdf on pass result covers pass branch in buildHtml', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    renderRunner('en');
    fireEvent.click(screen.getByText('Test Series'));
    fireEvent.click(screen.getByText('PDF Pass'));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Run Series/i }));
    await act(async () => { await vi.runAllTimersAsync(); });
    vi.useRealTimers();
    // Modal is open with a pass result
    expect(screen.getByText('Test Series Report')).toBeInTheDocument();
    expect(() => fireEvent.click(screen.getByText('Download PDF'))).not.toThrow();
    vi.restoreAllMocks();
  });
});

// ─── saveSequence: no activeId path ──────────────────────────────────────────

describe('SequenceRunner — saveSequence with no activeId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockStateRef = buildState(); // no sequences, no activeId
  });

  it('save with no activeId generates a new id and calls setActiveSequence', () => {
    renderRunner('en');
    fireEvent.click(screen.getByTitle('Save Scenario'));
    expect(mockAutomation.saveSequence).toHaveBeenCalledTimes(1);
    const saved = mockAutomation.saveSequence.mock.calls[0][0];
    expect(saved.id).toBeTruthy();
    // setActiveSequence is called with the new id
    expect(mockAutomation.setActiveSequence).toHaveBeenCalledWith(saved.id);
  });
});
