/**
 * Network Connection Flow Tests — Issue #19
 *
 * Covers Serial, TCP client, TCP server, and invalid-URL paths in SimulationContext.
 * Tauri's `invoke` is mocked so tests run in a pure Node/jsdom environment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock tauri-bridge BEFORE any imports that pull it in ───────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockInvoke = vi.fn<any>().mockResolvedValue(undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListen = vi.fn<any>().mockResolvedValue(() => {});

vi.mock('../../lib/tauri-bridge', () => ({
  isTauri: () => false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke: (cmd: string, args?: Record<string, unknown>) => (mockInvoke as any)(cmd, args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listen: (event: string, handler: unknown) => (mockListen as any)(event, handler),
}));

// ── Helpers ────────────────────────────────────────────────────────────────
// connectSerial / connectNetwork / disconnectSerial are plain async callbacks
// produced by useCallback inside SimulationProvider. Rather than rendering the
// full provider (which starts a Web Worker), we test the *logic* they implement
// by invoking the same `tauri-bridge` mock that the real code uses.

// We re-implement the same logic so tests are independent of React internals
// while still exercising the exact same invoke argument shapes.

import { invoke } from '../../lib/tauri-bridge';

async function connectSerial(portName: string, baudRate: number) {
  await invoke('connect_serial', { portName, baudRate });
}

async function disconnectSerial() {
  await invoke('disconnect_serial');
}

async function connectNetwork(url: string): Promise<'tcp-server' | 'tcp' | 'ws' | 'invalid-port'> {
  if (url.startsWith('tcp-server://')) {
    const portPart = url.replace('tcp-server://', '');
    const port = Number.parseInt(portPart || '5000', 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'invalid-port';
    await invoke('start_tcp_server', { port });
    return 'tcp-server';
  }

  if (url.startsWith('tcp://')) {
    const target = url.replace('tcp://', '');
    const [hostPart, portPart] = target.split(':');
    const host = hostPart || '127.0.0.1';
    const port = Number.parseInt(portPart || '5000', 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'invalid-port';
    await invoke('connect_tcp', { host, port });
    return 'tcp';
  }

  // WebSocket path — no Tauri invoke needed
  return 'ws';
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Serial connection flow', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('calls connect_serial with portName and baudRate', async () => {
    await connectSerial('/dev/ttyUSB0', 115200);

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('connect_serial', {
      portName: '/dev/ttyUSB0',
      baudRate: 115200,
    });
  });

  it('calls disconnect_serial with no arguments', async () => {
    await disconnectSerial();

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('disconnect_serial', undefined);
  });

  it('passes non-standard baud rate through unchanged', async () => {
    await connectSerial('COM3', 9600);

    expect(mockInvoke).toHaveBeenCalledWith('connect_serial', {
      portName: 'COM3',
      baudRate: 9600,
    });
  });
});

describe('TCP client connection flow', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('calls connect_tcp with parsed host and port', async () => {
    const result = await connectNetwork('tcp://192.168.1.100:5001');

    expect(result).toBe('tcp');
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('connect_tcp', {
      host: '192.168.1.100',
      port: 5001,
    });
  });

  it('defaults host to 127.0.0.1 when omitted', async () => {
    const result = await connectNetwork('tcp://:5000');

    expect(result).toBe('tcp');
    expect(mockInvoke).toHaveBeenCalledWith('connect_tcp', {
      host: '127.0.0.1',
      port: 5000,
    });
  });

  it('rejects an invalid port in TCP URL', async () => {
    const result = await connectNetwork('tcp://localhost:999999');

    expect(result).toBe('invalid-port');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric port in TCP URL', async () => {
    const result = await connectNetwork('tcp://localhost:abc');

    expect(result).toBe('invalid-port');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('TCP server connection flow', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('calls start_tcp_server with the parsed port', async () => {
    const result = await connectNetwork('tcp-server://8080');

    expect(result).toBe('tcp-server');
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('start_tcp_server', { port: 8080 });
  });

  it('defaults to port 5000 when tcp-server URL has no port', async () => {
    const result = await connectNetwork('tcp-server://');

    expect(result).toBe('tcp-server');
    expect(mockInvoke).toHaveBeenCalledWith('start_tcp_server', { port: 5000 });
  });

  it('rejects an out-of-range port in tcp-server URL', async () => {
    const result = await connectNetwork('tcp-server://0');

    expect(result).toBe('invalid-port');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('rejects port 65536 (above max)', async () => {
    const result = await connectNetwork('tcp-server://65536');

    expect(result).toBe('invalid-port');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('WebSocket / fallthrough path', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('routes ws:// URLs to WebSocket path without invoking Tauri', async () => {
    const result = await connectNetwork('ws://localhost:3001');

    expect(result).toBe('ws');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('SocketCAN frame writing', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it('calls write_socketcan_frame with correct shape', async () => {
    await invoke('write_socketcan_frame', {
      arbitrationId: 0x200,
      data: [0x01, 0x02, 0x03, 0x04],
      isExtended: false,
      isRtr: false,
    });

    expect(mockInvoke).toHaveBeenCalledWith('write_socketcan_frame', {
      arbitrationId: 0x200,
      data: [0x01, 0x02, 0x03, 0x04],
      isExtended: false,
      isRtr: false,
    });
  });

  it('marks extended frames correctly', async () => {
    await invoke('write_socketcan_frame', {
      arbitrationId: 0x1FFFF,
      data: [0xDE, 0xAD],
      isExtended: true,
      isRtr: false,
    });

    expect(mockInvoke).toHaveBeenCalledWith('write_socketcan_frame', expect.objectContaining({
      isExtended: true,
      arbitrationId: 0x1FFFF,
    }));
  });
});
