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
});
