/**
 * Unit tests for the SocketCAN TX-echo matching logic extracted from CANContext.tsx.
 *
 * consumePendingSocketCANTx and buildIsoTpTxEntries are module-level pure helpers;
 * we test their logic inline here so regressions in zero-padding or framing
 * construction are caught without rendering the full React provider.
 */

import { describe, it, expect } from 'vitest';

// ── Inline copies of the pure helpers under test ──────────────────────────────
// These must stay in sync with CANContext.tsx. If the originals change, update here.

interface PendingSocketCANTx {
  arbitrationId: number;
  data: number[];
  dlc: number;
  idFormat: 'standard' | 'extended';
  createdAt: number;
}

interface SocketCANFramePayload {
  arbitrationId: number;
  idFormat: 'standard' | 'extended';
  isRTR: boolean;
  dlc: number;
  data: number[];
  sessionId?: number;
}

const SOCKETCAN_TX_ECHO_WINDOW_MS = 2000;

function consumePendingSocketCANTx(
  pending: PendingSocketCANTx[],
  payload: SocketCANFramePayload
): boolean {
  if (pending.length === 0) return false;
  const nowMs = Date.now();
  const payloadData = Array.isArray(payload.data)
    ? payload.data.slice(0, Math.min(payload.dlc ?? payload.data.length, 8))
    : [];
  const payloadDlc = Math.min(payload.dlc ?? payloadData.length, 8);
  const payloadIdFormat = payload.idFormat === 'extended' ? 'extended' : 'standard';

  for (let index = pending.length - 1; index >= 0; index--) {
    if (nowMs - pending[index].createdAt > SOCKETCAN_TX_ECHO_WINDOW_MS) {
      pending.splice(index, 1);
    }
  }

  const matchIndex = pending.findIndex(item => {
    if (item.arbitrationId !== payload.arbitrationId) return false;
    if (item.dlc !== payloadDlc) return false;
    if (item.idFormat !== payloadIdFormat) return false;
    for (let i = 0; i < payloadDlc; i++) {
      const expected = i < item.data.length ? item.data[i] : 0;
      if (expected !== payloadData[i]) return false;
    }
    return true;
  });

  if (matchIndex === -1) return false;
  pending.splice(matchIndex, 1);
  return true;
}

function buildIsoTpTxEntries(
  arbitrationId: number,
  payload: number[],
  stMinMs: number,
  baseCreatedAt: number
): PendingSocketCANTx[] {
  const idFormat: 'standard' | 'extended' = arbitrationId > 0x7ff ? 'extended' : 'standard';
  const entries: PendingSocketCANTx[] = [];

  if (payload.length <= 7) {
    entries.push({ arbitrationId, data: [payload.length, ...payload], dlc: 8, idFormat, createdAt: baseCreatedAt });
    return entries;
  }

  const length = Math.min(payload.length, 0xfff);
  entries.push({
    arbitrationId,
    data: [0x10 | ((length >> 8) & 0x0f), length & 0xff, ...payload.slice(0, 6)],
    dlc: 8, idFormat, createdAt: baseCreatedAt,
  });

  let offset = 6;
  let seq = 1;
  let createdAt = baseCreatedAt + stMinMs;
  while (offset < length) {
    const chunk = payload.slice(offset, offset + 7);
    entries.push({ arbitrationId, data: [0x20 | (seq & 0x0f), ...chunk], dlc: 8, idFormat, createdAt });
    offset += chunk.length;
    seq = (seq + 1) & 0x0f;
    createdAt += stMinMs;
  }
  return entries;
}

// ── consumePendingSocketCANTx tests ──────────────────────────────────────────

describe('consumePendingSocketCANTx', () => {
  function makePending(arbitrationId: number, data: number[], dlc = 8, createdAt = Date.now()): PendingSocketCANTx {
    return { arbitrationId, data, dlc, idFormat: 'standard', createdAt };
  }

  function makeEcho(arbitrationId: number, data: number[], dlc = 8): SocketCANFramePayload {
    return { arbitrationId, data, dlc, idFormat: 'standard', isRTR: false };
  }

  it('matches when pending data is shorter than 8 bytes but zero-padded echo matches', () => {
    const pending = [makePending(0x7e0, [0x03, 0x22, 0xf1, 0x90], 8)];
    const echo = makeEcho(0x7e0, [0x03, 0x22, 0xf1, 0x90, 0x00, 0x00, 0x00, 0x00], 8);

    expect(consumePendingSocketCANTx(pending, echo)).toBe(true);
    expect(pending).toHaveLength(0);
  });

  it('does not match when non-zero bytes beyond pending data length differ', () => {
    const pending = [makePending(0x7e0, [0x03, 0x22, 0xf1, 0x90], 8)];
    // Echo has 0xFF in the padding area, which doesn't match zero-padding
    const echo = makeEcho(0x7e0, [0x03, 0x22, 0xf1, 0x90, 0xff, 0x00, 0x00, 0x00], 8);

    expect(consumePendingSocketCANTx(pending, echo)).toBe(false);
    expect(pending).toHaveLength(1);
  });

  it('returns false for empty pending list', () => {
    const echo = makeEcho(0x7e0, [0x01, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(consumePendingSocketCANTx([], echo)).toBe(false);
  });

  it('evicts entries older than SOCKETCAN_TX_ECHO_WINDOW_MS', () => {
    const stale = makePending(0x7e0, [0x01, 0x10], 8, Date.now() - 2001);
    const pending = [stale];
    const echo = makeEcho(0x7e0, [0x01, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    expect(consumePendingSocketCANTx(pending, echo)).toBe(false);
    expect(pending).toHaveLength(0); // stale entry evicted
  });

  it('does not match on different arbitrationId', () => {
    const pending = [makePending(0x7e0, [0x01, 0x10], 8)];
    const echo = makeEcho(0x7e8, [0x01, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    expect(consumePendingSocketCANTx(pending, echo)).toBe(false);
  });

  it('consumes only the first matching entry leaving others intact', () => {
    const now = Date.now();
    const pending = [
      makePending(0x7e0, [0x03, 0x22, 0xf1, 0x90], 8, now),
      makePending(0x7e0, [0x03, 0x22, 0xf1, 0x90], 8, now + 50),
    ];
    const echo = makeEcho(0x7e0, [0x03, 0x22, 0xf1, 0x90, 0x00, 0x00, 0x00, 0x00], 8);

    expect(consumePendingSocketCANTx(pending, echo)).toBe(true);
    expect(pending).toHaveLength(1); // second entry remains
  });
});

// ── buildIsoTpTxEntries tests ─────────────────────────────────────────────────

describe('buildIsoTpTxEntries', () => {
  const BASE = 1000;

  it('builds a single SF entry for payload <= 7 bytes', () => {
    const entries = buildIsoTpTxEntries(0x7e0, [0x22, 0xf1, 0x90], 0, BASE);

    expect(entries).toHaveLength(1);
    expect(entries[0].data[0]).toBe(3); // length byte
    expect(entries[0].data.slice(1, 4)).toEqual([0x22, 0xf1, 0x90]);
    expect(entries[0].dlc).toBe(8);
    expect(entries[0].createdAt).toBe(BASE);
  });

  it('builds FF + CFs for payload > 7 bytes with correct sequence numbers', () => {
    const payload = Array.from({ length: 14 }, (_, i) => i); // 14 bytes
    const entries = buildIsoTpTxEntries(0x7e0, payload, 10, BASE);

    // FF + FC (engine sends FC) + 2 CFs
    // buildIsoTpTxEntries only produces FF + CFs (not FC — FC is from ECU side)
    expect(entries).toHaveLength(3); // FF + CF1 + CF2

    // FF
    expect((entries[0].data[0] & 0xf0) >> 4).toBe(1); // PCI type 1 = FF
    const declaredLength = ((entries[0].data[0] & 0x0f) << 8) | entries[0].data[1];
    expect(declaredLength).toBe(14);

    // CF1
    expect((entries[1].data[0] & 0xf0) >> 4).toBe(2); // PCI type 2 = CF
    expect(entries[1].data[0] & 0x0f).toBe(1); // sequence 1
    expect(entries[1].createdAt).toBe(BASE + 10);

    // CF2
    expect(entries[2].data[0] & 0x0f).toBe(2); // sequence 2
    expect(entries[2].createdAt).toBe(BASE + 20);
  });

  it('sequence number wraps at 0xf correctly', () => {
    // 6 (FF) + 16*7 = 118 bytes → 16 CFs, sequences 1..15 then 0
    const payload = new Array(6 + 16 * 7).fill(0xaa);
    const entries = buildIsoTpTxEntries(0x7e0, payload, 1, BASE);

    // FF + 16 CFs
    expect(entries).toHaveLength(17);
    expect(entries[16].data[0] & 0x0f).toBe(0); // sequence wraps: (16 % 16 = 0)
  });

  it('uses extended idFormat for arbitrationId > 0x7FF', () => {
    const entries = buildIsoTpTxEntries(0x18db33f1, [0x01, 0x3e], 0, BASE);
    expect(entries[0].idFormat).toBe('extended');
  });

  it('caps payload at 0xfff bytes', () => {
    const oversized = new Array(5000).fill(0xbb);
    const entries = buildIsoTpTxEntries(0x7e0, oversized, 0, BASE);

    const ff = entries[0];
    const declaredLength = ((ff.data[0] & 0x0f) << 8) | ff.data[1];
    expect(declaredLength).toBe(0xfff);
    // Total data in entries: 6 (FF) + 7*(n-1) CFs = 0xfff
    const totalData = 6 + (entries.length - 1) * 7;
    expect(totalData).toBeGreaterThanOrEqual(0xfff);
  });
});
