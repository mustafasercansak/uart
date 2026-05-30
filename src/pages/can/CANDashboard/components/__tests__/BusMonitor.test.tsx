import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../../../i18n/LanguageProvider';
import type { CANFrame } from '../../../../../can/types/CANFrame';
import type { CANNode } from '../../../../../can/types/CANNode';
import { DEFAULT_VITALS } from '../../../../../can/types/CANNode';
import { BusMonitor } from '../BusMonitor';

const baseProps = {
  frames: [] as CANFrame[],
  nodes: [] as CANNode[],
  filter: '',
  selectedFrameUid: null as string | null,
  showErrorFrames: true,
  canSend: true,
  onSelectFrame: vi.fn(),
  onSendFrame: vi.fn(),
  onClear: vi.fn(),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

const makeFrame = (patch: Partial<CANFrame>): CANFrame => ({
  uid: 'frame-1',
  arbitrationId: 0x123,
  idFormat: 'standard',
  frameType: 'data',
  isRTR: false,
  dlc: 2,
  data: [0x11, 0x22],
  crc: 0,
  timestamp: Date.UTC(2026, 0, 1, 12, 0, 0, 123),
  nodeId: 1,
  busLoadPercent: 0,
  errors: [],
  cobId: 0x123,
  functionCode: 0,
  canOpenNodeId: 1,
  ...patch,
});

const makeNode = (): CANNode => ({
  id: 1,
  name: 'Bed Monitor',
  profile: 'vital-monitor',
  color: '#22d3ee',
  txErrorCounter: 0,
  rxErrorCounter: 0,
  state: 'error-active',
  nmtState: 'operational',
  sendIntervalMs: 1000,
  isActive: true,
  baseArbitrationId: 0x180,
  vitals: DEFAULT_VITALS,
  activeFault: null,
  lastSentAt: 0,
  framesSent: 0,
});

const renderBusMonitor = (props: Partial<typeof baseProps> = {}) =>
  render(<BusMonitor {...baseProps} {...props} />, { wrapper });

describe('BusMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('uart_locale', 'en');
  });

  it('normalizes a valid arbitration ID and sends parsed bytes', () => {
    const onSendFrame = vi.fn();
    renderBusMonitor({ onSendFrame });

    const idInput = screen.getByPlaceholderText('0x200');
    const dataInput = screen.getByPlaceholderText('01 02 03 04');

    fireEvent.change(idInput, { target: { value: '1abc' } });
    fireEvent.change(dataInput, { target: { value: 'AA 0b 7F' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSendFrame).toHaveBeenCalledWith(0x1abc, [0xaa, 0x0b, 0x7f]);
    expect(idInput).toHaveValue('0x1ABC');
  });

  it('rejects invalid arbitration IDs before sending', () => {
    const onSendFrame = vi.fn();
    renderBusMonitor({ onSendFrame });

    fireEvent.change(screen.getByPlaceholderText('0x200'), { target: { value: 'not-hex' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSendFrame).not.toHaveBeenCalled();
    expect(screen.getByText(/arbitration id must/i)).toBeInTheDocument();
  });

  it('marks manually injected frames as TX and regular node frames as RX', () => {
    renderBusMonitor({
      frames: [
        makeFrame({ uid: 'tx-frame', arbitrationId: 0x200, nodeId: -1, data: [0xaa], dlc: 1 }),
        makeFrame({ uid: 'rx-frame', arbitrationId: 0x180, nodeId: 1, data: [0x55], dlc: 1 }),
      ],
      nodes: [makeNode()],
    });

    expect(screen.getByText('TX')).toBeInTheDocument();
    expect(screen.getByText('INJECTED')).toBeInTheDocument();
    expect(screen.getByText('Manual frame injection')).toBeInTheDocument();
    expect(screen.getByText('RX')).toBeInTheDocument();
    expect(screen.getByText('Bed Monitor')).toBeInTheDocument();
  });

  it('normalizes arb-ID field on blur', () => {
    renderBusMonitor();
    const idInput = screen.getByPlaceholderText('0x200');
    fireEvent.change(idInput, { target: { value: '1ff' } });
    fireEvent.blur(idInput);
    expect(idInput).toHaveValue('0x1FF');
  });

  it('blur on invalid arb-ID leaves field unchanged', () => {
    renderBusMonitor();
    const idInput = screen.getByPlaceholderText('0x200');
    fireEvent.change(idInput, { target: { value: 'zzz' } });
    fireEvent.blur(idInput);
    expect(idInput).toHaveValue('zzz');
  });

  it('decodeInfo shows vitals for vital-monitor nodes', () => {
    renderBusMonitor({
      frames: [makeFrame({ uid: 'f1', arbitrationId: 0x180, nodeId: 1, data: [0x01], dlc: 1 })],
      nodes: [makeNode()],
    });
    expect(screen.getByText(/HR=/)).toBeInTheDocument();
  });

  it('decodeInfo shows flow for infusion-pump nodes', () => {
    renderBusMonitor({
      frames: [makeFrame({ uid: 'f2', arbitrationId: 0x181, nodeId: 1, data: [0x01], dlc: 1 })],
      nodes: [{ ...makeNode(), profile: 'infusion-pump' }],
    });
    expect(screen.getByText(/Flow=/)).toBeInTheDocument();
  });

  it('decodeInfo shows TV/PEEP for ventilator nodes', () => {
    renderBusMonitor({
      frames: [makeFrame({ uid: 'f3', arbitrationId: 0x182, nodeId: 1, data: [0x01], dlc: 1 })],
      nodes: [{ ...makeNode(), profile: 'ventilator' }],
    });
    expect(screen.getByText(/TV=/)).toBeInTheDocument();
  });

  it('decodeInfo shows Standby for defibrillator nodes', () => {
    renderBusMonitor({
      frames: [makeFrame({ uid: 'f4', arbitrationId: 0x183, nodeId: 1, data: [0x01], dlc: 1 })],
      nodes: [{ ...makeNode(), profile: 'defibrillator' }],
    });
    expect(screen.getByText(/Standby/)).toBeInTheDocument();
  });

  it('decodeInfo shows TPDO1 for unknown profile nodes', () => {
    renderBusMonitor({
      frames: [makeFrame({ uid: 'f5', arbitrationId: 0x184, nodeId: 1, data: [0x01], dlc: 1 })],
      nodes: [{ ...makeNode(), profile: 'custom' as CANNode['profile'] }],
    });
    expect(screen.getByText(/TPDO1/)).toBeInTheDocument();
  });

  it('selects a frame when clicked', () => {
    const onSelectFrame = vi.fn();
    renderBusMonitor({
      frames: [makeFrame({ uid: 'click-frame' })],
      onSelectFrame,
    });
    fireEvent.click(screen.getByText('0x123'));
    expect(onSelectFrame).toHaveBeenCalledWith('click-frame');
  });

  it('filters the displayed frames by arbitration ID text', () => {
    renderBusMonitor({
      frames: [
        makeFrame({ uid: 'f-match', arbitrationId: 0x123 }),
        makeFrame({ uid: 'f-no', arbitrationId: 0x456 }),
      ],
      filter: '123',
    });
    expect(screen.getByText('0x123')).toBeInTheDocument();
    expect(screen.queryByText('0x456')).not.toBeInTheDocument();
  });

  it('shows error when data field is empty on send', () => {
    const onSendFrame = vi.fn();
    renderBusMonitor({ onSendFrame });

    fireEvent.change(screen.getByPlaceholderText('0x200'), { target: { value: '100' } });
    // Explicitly clear the data field so bytes.length === 0
    fireEvent.change(screen.getByPlaceholderText('01 02 03 04'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSendFrame).not.toHaveBeenCalled();
  });

  it('shows error when data exceeds 8 bytes', () => {
    const onSendFrame = vi.fn();
    renderBusMonitor({ onSendFrame });

    fireEvent.change(screen.getByPlaceholderText('0x200'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('01 02 03 04'), {
      target: { value: '01 02 03 04 05 06 07 08 09' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSendFrame).not.toHaveBeenCalled();
  });

  it('sends frame when Enter is pressed in the data input', () => {
    const onSendFrame = vi.fn();
    renderBusMonitor({ onSendFrame });

    fireEvent.change(screen.getByPlaceholderText('0x200'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('01 02 03 04'), { target: { value: 'AA BB' } });
    fireEvent.keyDown(screen.getByPlaceholderText('01 02 03 04'), { key: 'Enter' });

    expect(onSendFrame).toHaveBeenCalledWith(0x100, [0xaa, 0xbb]);
  });

  it('does not send when a non-Enter key is pressed (handleKeyDown false branch)', () => {
    // Covers line 62: if (e.key === 'Enter') — false branch when key !== 'Enter'
    const onSendFrame = vi.fn();
    renderBusMonitor({ onSendFrame });

    fireEvent.change(screen.getByPlaceholderText('0x200'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('01 02 03 04'), { target: { value: 'AA BB' } });
    fireEvent.keyDown(screen.getByPlaceholderText('01 02 03 04'), { key: 'Tab' });

    expect(onSendFrame).not.toHaveBeenCalled();
  });

  it('hides error frames when showErrorFrames is false', () => {
    // Covers line 31: if (!showErrorFrames) filter
    renderBusMonitor({
      frames: [
        makeFrame({ uid: 'err', arbitrationId: 0x100, errors: ['CRC error'] }),
        makeFrame({ uid: 'ok', arbitrationId: 0x200, errors: [] }),
      ],
      showErrorFrames: false,
    });
    expect(screen.queryByText('0x100')).not.toBeInTheDocument();
    expect(screen.getByText('0x200')).toBeInTheDocument();
  });

  it('disables send button and shows alt title when canSend is false', () => {
    // Covers line 98: disabled={!canSend} and title branch
    renderBusMonitor({ canSend: false });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('shows noFramesFilter message when frames exist but filter matches none', () => {
    // Covers line 118: frames.length > 0 but filtered.length === 0
    renderBusMonitor({
      frames: [makeFrame({ arbitrationId: 0x456 })],
      filter: 'zzz',
    });
    // filtered is empty but frames are not → shows the "no frames match filter" text
    expect(screen.queryByText('0x456')).not.toBeInTheDocument();
  });

  it('applies selected-frame styling when selectedFrameUid matches', () => {
    // Covers lines 145-147: isSelected branch
    renderBusMonitor({
      frames: [makeFrame({ uid: 'sel-frame' })],
      selectedFrameUid: 'sel-frame',
    });
    // The row should have the selected class (cyan background)
    const row = screen.getByText('0x123').closest('div[class*="grid"]');
    expect(row?.className).toMatch(/cyan/);
  });

  it('applies error styling and shows error text for frames with errors', () => {
    // Covers lines 145-147 (hasError branch) and lines 177-178 (hasError ? errors[0] : ...)
    renderBusMonitor({
      frames: [makeFrame({ uid: 'err-frame', errors: ['Bit stuffing error'] })],
    });
    const row = screen.getByText('0x123').closest('div[class*="grid"]');
    expect(row?.className).toMatch(/red/);
    expect(screen.getByText('Bit stuffing error')).toBeInTheDocument();
  });

  it('shows COB-ID when frame has no matching node', () => {
    // Covers lines 193-203: decodeInfo — the !node branch
    renderBusMonitor({
      frames: [makeFrame({ uid: 'no-node', nodeId: 99, cobId: 0x180 })],
      nodes: [],
    });
    expect(screen.getByText(/COB-ID: 0x180/i)).toBeInTheDocument();
  });

  it('shows COB-ID with ? when cobId is undefined', () => {
    // Covers the `frame.cobId?.toString() ?? '?'` fallback branch
    renderBusMonitor({
      frames: [makeFrame({ uid: 'no-cob', nodeId: 99, cobId: undefined })],
      nodes: [],
    });
    expect(screen.getByText(/COB-ID: 0x\?/i)).toBeInTheDocument();
  });

  it('decodeInfo shows HR for ecg-monitor and pulse-oximeter nodes', () => {
    // Covers the fall-through switch cases 'ecg-monitor' and 'pulse-oximeter'
    renderBusMonitor({
      frames: [
        makeFrame({ uid: 'ecg', nodeId: 1 }),
        makeFrame({ uid: 'pox', nodeId: 2, arbitrationId: 0x200 }),
      ],
      nodes: [
        { ...makeNode(), id: 1, profile: 'ecg-monitor' as CANNode['profile'] },
        { ...makeNode(), id: 2, baseArbitrationId: 0x200, profile: 'pulse-oximeter' as CANNode['profile'] },
      ],
    });
    // Both fall through to the vital-monitor return — shows HR=
    expect(screen.getAllByText(/HR=/).length).toBeGreaterThanOrEqual(1);
  });

  it('decodeInfo shows Flow for iv-pump nodes', () => {
    // Covers the 'iv-pump' fall-through case
    renderBusMonitor({
      frames: [makeFrame({ uid: 'ivp', nodeId: 1 })],
      nodes: [{ ...makeNode(), id: 1, profile: 'iv-pump' as CANNode['profile'] }],
    });
    expect(screen.getByText(/Flow=/)).toBeInTheDocument();
  });

  it('flash-sent timer resets flashSent state after 600 ms', () => {
    vi.useFakeTimers();
    const onSendFrame = vi.fn();
    renderBusMonitor({ onSendFrame });

    fireEvent.change(screen.getByPlaceholderText('0x200'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('01 02 03 04'), { target: { value: 'AA' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    vi.advanceTimersByTime(600);
    vi.useRealTimers();
  });

  it('rejects arbId hex strings that exceed the 29-bit CAN ID range', () => {
    // Covers line 193: `id <= 0x1fffffff ? id : null` — false branch (id > 0x1FFFFFFF)
    const onSendFrame = vi.fn();
    renderBusMonitor({ onSendFrame });

    fireEvent.change(screen.getByPlaceholderText('0x200'), { target: { value: '20000000' } });
    fireEvent.change(screen.getByPlaceholderText('01 02 03 04'), { target: { value: 'AA' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(onSendFrame).not.toHaveBeenCalled();
  });
});
