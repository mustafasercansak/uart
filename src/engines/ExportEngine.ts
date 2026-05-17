// ─────────────────────────────────────────────
// EXPORT ENGINE
// Frame verilerini CSV, PCAP ve JSON formatlarına
// aktarır. Tamamen client-side, backend yok.
// ─────────────────────────────────────────────

import type { GeneratedFrame, FrameProfile } from '../types';

// ── Yardımcı: blob indir ─────────────────────
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// CSV EXPORT
// ─────────────────────────────────────────────

export function exportToCSV(
  frames: GeneratedFrame[],
  profile: FrameProfile | null,
  filename = 'uart_session'
): void {
  if (frames.length === 0) return;

  const fieldNames = profile?.fields.map((f) => f.name) ?? [];

  // Header satırı
  const headerCols = [
    'Frame#',
    'Timestamp_ms',
    'Elapsed_ms',
    'Raw_Hex',
    'Byte_Count',
    'Errors',
    ...fieldNames.map((n) => `field_${n}`),
    ...fieldNames.map((n) => `field_${n}_hex`),
  ];

  const firstTs = frames[0].timestampMs;

  const rows = frames.map((f) => {
    const fieldDecMap: Record<string, string> = {};
    const fieldHexMap: Record<string, string> = {};
    f.fields.forEach((pf) => {
      fieldDecMap[pf.name] = String(pf.decimal);
      fieldHexMap[pf.name] = pf.hex;
    });

    const cols = [
      String(f.frameNumber),
      String(f.timestampMs),
      String(f.timestampMs - firstTs),
      f.rawHex,
      String(f.rawBytes.length),
      f.errors.join('; '),
      ...fieldNames.map((n) => fieldDecMap[n] ?? ''),
      ...fieldNames.map((n) => fieldHexMap[n] ?? ''),
    ];

    // CSV'de virgül veya tırnak içerenleri escape et
    return cols
      .map((c) => {
        if (c.includes(',') || c.includes('"') || c.includes('\n')) {
          return `"${c.replace(/"/g, '""')}"`;
        }
        return c;
      })
      .join(',');
  });

  const csv = [headerCols.join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  downloadBlob(blob, `${filename}_${ts}.csv`);
}

// ─────────────────────────────────────────────
// PCAP EXPORT (libpcap format)
// Wireshark ile açılabilir.
// Link type: 147 (USER0) — custom/raw data
// ─────────────────────────────────────────────

const PCAP_MAGIC = 0xa1b2c3d4; // little-endian timestamp
const PCAP_VERSION_MAJOR = 2;
const PCAP_VERSION_MINOR = 4;
const PCAP_THISZONE = 0;
const PCAP_SIGFIGS = 0;
const PCAP_SNAPLEN = 65535;
const PCAP_LINKTYPE = 147; // LINKTYPE_USER0 — generic

function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}
function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

export function exportToPCAP(
  frames: GeneratedFrame[],
  filename = 'uart_capture'
): void {
  if (frames.length === 0) return;

  // Global header: 24 bytes
  const GLOBAL_HEADER_SIZE = 24;
  // Per-packet header: 16 bytes + data
  const PACKET_HEADER_SIZE = 16;

  const totalDataBytes = frames.reduce((s, f) => s + f.rawBytes.length, 0);
  const totalSize = GLOBAL_HEADER_SIZE + frames.length * PACKET_HEADER_SIZE + totalDataBytes;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // ── Global Header ──
  writeUint32LE(view, offset, PCAP_MAGIC); offset += 4;
  writeUint16LE(view, offset, PCAP_VERSION_MAJOR); offset += 2;
  writeUint16LE(view, offset, PCAP_VERSION_MINOR); offset += 2;
  writeUint32LE(view, offset, PCAP_THISZONE); offset += 4;   // GMT offset
  writeUint32LE(view, offset, PCAP_SIGFIGS); offset += 4;    // accuracy of timestamps
  writeUint32LE(view, offset, PCAP_SNAPLEN); offset += 4;    // max packet length
  writeUint32LE(view, offset, PCAP_LINKTYPE); offset += 4;   // link-layer type

  // ── Packet Records ──
  for (const frame of frames) {
    const tsSec = Math.floor(frame.timestampMs / 1000);
    const tsUsec = (frame.timestampMs % 1000) * 1000;
    const len = frame.rawBytes.length;

    writeUint32LE(view, offset, tsSec); offset += 4;
    writeUint32LE(view, offset, tsUsec); offset += 4;
    writeUint32LE(view, offset, len); offset += 4;   // incl_len (captured)
    writeUint32LE(view, offset, len); offset += 4;   // orig_len (original)

    for (let i = 0; i < len; i++) {
      view.setUint8(offset++, frame.rawBytes[i]);
    }
  }

  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  downloadBlob(blob, `${filename}_${ts}.pcap`);
}

// ─────────────────────────────────────────────
// JSON EXPORT (ham session)
// ─────────────────────────────────────────────

export function exportToJSON(
  frames: GeneratedFrame[],
  profile: FrameProfile | null,
  filename = 'uart_session'
): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    profileName: profile?.name ?? 'Unknown',
    baudRate: profile?.baudRate ?? 0,
    frameCount: frames.length,
    durationMs: frames.length > 0 ? frames[frames.length - 1].timestampMs - frames[0].timestampMs : 0,
    frames,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  downloadBlob(blob, `${filename}_${ts}.json`);
}

// ─────────────────────────────────────────────
// ERROR STATISTICS (rapor için)
// ─────────────────────────────────────────────

export interface ErrorStats {
  totalFrames: number;
  errorFrames: number;
  errorRate: number; // 0-1
  errorTypeCounts: Record<string, number>;
  crcFailRate: number;
  avgFrameSize: number;
  minFrameSize: number;
  maxFrameSize: number;
  durationMs: number;
  framesPerSecond: number;
  timelineData: Array<{ timestampMs: number; hasError: boolean }>;
}

export function computeErrorStats(frames: GeneratedFrame[]): ErrorStats {
  if (frames.length === 0) {
    return {
      totalFrames: 0,
      errorFrames: 0,
      errorRate: 0,
      errorTypeCounts: {},
      crcFailRate: 0,
      avgFrameSize: 0,
      minFrameSize: 0,
      maxFrameSize: 0,
      durationMs: 0,
      framesPerSecond: 0,
      timelineData: [],
    };
  }

  const errorTypeCounts: Record<string, number> = {};
  let errorFrames = 0;
  let crcFails = 0;
  let totalBytes = 0;
  let minBytes = Infinity;
  let maxBytes = 0;

  for (const f of frames) {
    totalBytes += f.rawBytes.length;
    if (f.rawBytes.length < minBytes) minBytes = f.rawBytes.length;
    if (f.rawBytes.length > maxBytes) maxBytes = f.rawBytes.length;

    if (f.errors.length > 0) {
      errorFrames++;
      for (const err of f.errors) {
        errorTypeCounts[err] = (errorTypeCounts[err] ?? 0) + 1;
        if (err.toLowerCase().includes('crc') || err.toLowerCase().includes('checksum')) {
          crcFails++;
        }
      }
    }
  }

  const durationMs =
    frames[frames.length - 1].timestampMs - frames[0].timestampMs || 1;
  const fps = (frames.length / durationMs) * 1000;

  const timelineData = frames.map((f) => ({
    timestampMs: f.timestampMs,
    hasError: f.errors.length > 0,
  }));

  return {
    totalFrames: frames.length,
    errorFrames,
    errorRate: errorFrames / frames.length,
    errorTypeCounts,
    crcFailRate: errorFrames > 0 ? crcFails / errorFrames : 0,
    avgFrameSize: totalBytes / frames.length,
    minFrameSize: minBytes,
    maxFrameSize: maxBytes,
    durationMs,
    framesPerSecond: fps,
    timelineData,
  };
}
