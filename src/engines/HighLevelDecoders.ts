// ─────────────────────────────────────────────
// HIGH-LEVEL PROTOCOL DECODERS
// Modbus RTU ve NMEA 0183 üst-katman çözücüleri
// ─────────────────────────────────────────────

export interface DecodedField {
  name: string;
  value: string | number;
  hex: string;
  highlight?: 'ok' | 'error' | 'warn';
}

export interface DecodedResult {
  valid: boolean;
  fields: DecodedField[];
}

// ─────────────────────────────────────────────
// MODBUS RTU
// ─────────────────────────────────────────────

export interface ModbusRTUFrame {
  valid: boolean;
  deviceAddress: number;
  functionCode: number;
  functionName: string;
  isError: boolean;
  exceptionCode?: number;
  data: number[];
  crc: number;
  crcValid: boolean;
  fields: DecodedField[];
}

const MODBUS_FUNCTION_NAMES: Record<number, string> = {
  0x01: 'Read Coils',
  0x02: 'Read Discrete Inputs',
  0x03: 'Read Holding Registers',
  0x04: 'Read Input Registers',
  0x05: 'Write Single Coil',
  0x06: 'Write Single Register',
  0x0F: 'Write Multiple Coils',
  0x10: 'Write Multiple Registers',
  0x17: 'Read/Write Multiple Registers',
};

const MODBUS_EXCEPTION_CODES: Record<number, string> = {
  0x01: 'Geçersiz Fonksiyon',
  0x02: 'Geçersiz Veri Adresi',
  0x03: 'Geçersiz Veri Değeri',
  0x04: 'Köle Cihaz Hatası',
  0x05: 'Onaylama',
  0x06: 'Köle Cihaz Meşgul',
  0x08: 'Bellek Parite Hatası',
  0x0A: 'Geçit Yolu Yok',
  0x0B: 'Geçit Yolu Hedef Yanıt Vermiyor',
};

function calcCRC16Modbus(bytes: number[]): number {
  let crc = 0xFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

export function decodeModbusRTU(bytes: number[]): ModbusRTUFrame {
  const empty: ModbusRTUFrame = {
    valid: false,
    deviceAddress: 0,
    functionCode: 0,
    functionName: 'Geçersiz Frame (< 4 byte)',
    isError: false,
    data: [],
    crc: 0,
    crcValid: false,
    fields: [],
  };

  if (bytes.length < 4) return empty;

  const deviceAddress = bytes[0];
  const functionCode = bytes[1];
  const isError = (functionCode & 0x80) !== 0;
  const realFC = isError ? functionCode & 0x7F : functionCode;
  const data = bytes.slice(2, bytes.length - 2);
  const crcLow = bytes[bytes.length - 2];
  const crcHigh = bytes[bytes.length - 1];
  const crc = (crcHigh << 8) | crcLow;
  const computedCrc = calcCRC16Modbus(bytes.slice(0, bytes.length - 2));
  const crcValid = crc === computedCrc;

  const functionName = MODBUS_FUNCTION_NAMES[realFC] || `FC 0x${realFC.toString(16).toUpperCase().padStart(2, '0')}`;

  const fields: DecodedField[] = [
    {
      name: 'Cihaz Adresi',
      value: deviceAddress,
      hex: deviceAddress.toString(16).padStart(2, '0').toUpperCase(),
    },
    {
      name: 'Fonksiyon Kodu',
      value: isError ? `${functionName} (HATA YANITI)` : functionName,
      hex: functionCode.toString(16).padStart(2, '0').toUpperCase(),
      highlight: isError ? 'error' : 'ok',
    },
  ];

  if (isError && data.length >= 1) {
    const exCode = data[0];
    fields.push({
      name: 'İstisna Kodu',
      value: MODBUS_EXCEPTION_CODES[exCode] || `0x${exCode.toString(16).toUpperCase()}`,
      hex: exCode.toString(16).padStart(2, '0').toUpperCase(),
      highlight: 'error',
    });
  } else if (realFC === 0x03 || realFC === 0x04) {
    if (data.length === 0) {
      // No data yet (request without response byte count)
    } else if (data.length === 4 && bytes.length === 8) {
      // Request format: addr(2) + quantity(2)
      const startAddr = (data[0] << 8) | data[1];
      const quantity = (data[2] << 8) | data[3];
      fields.push({ name: 'Başlangıç Adresi', value: `0x${startAddr.toString(16).padStart(4, '0').toUpperCase()} (${startAddr})`, hex: startAddr.toString(16).padStart(4, '0').toUpperCase() });
      fields.push({ name: 'Register Miktarı', value: quantity, hex: quantity.toString(16).padStart(4, '0').toUpperCase() });
    } else {
      // Response format: byteCount + data
      const byteCount = data[0];
      fields.push({ name: 'Byte Sayısı', value: byteCount, hex: byteCount.toString(16).padStart(2, '0').toUpperCase() });
      for (let i = 1; i + 1 < data.length; i += 2) {
        const regValue = (data[i] << 8) | data[i + 1];
        const regIndex = (i - 1) / 2;
        fields.push({
          name: `Register[${regIndex}]`,
          value: `${regValue} (0x${regValue.toString(16).padStart(4, '0').toUpperCase()})`,
          hex: regValue.toString(16).padStart(4, '0').toUpperCase(),
        });
      }
    }
  } else if (realFC === 0x06) {
    if (data.length >= 4) {
      const addr = (data[0] << 8) | data[1];
      const value = (data[2] << 8) | data[3];
      fields.push({ name: 'Register Adresi', value: addr, hex: addr.toString(16).padStart(4, '0').toUpperCase() });
      fields.push({ name: 'Yazılan Değer', value: value, hex: value.toString(16).padStart(4, '0').toUpperCase() });
    }
  } else if (realFC === 0x01 || realFC === 0x02) {
    if (data.length >= 4 && bytes.length === 8) {
      const startAddr = (data[0] << 8) | data[1];
      const quantity = (data[2] << 8) | data[3];
      fields.push({ name: 'Başlangıç Adresi', value: startAddr, hex: startAddr.toString(16).padStart(4, '0').toUpperCase() });
      fields.push({ name: 'Coil Miktarı', value: quantity, hex: quantity.toString(16).padStart(4, '0').toUpperCase() });
    } else if (data.length >= 1) {
      const byteCount = data[0];
      fields.push({ name: 'Byte Sayısı', value: byteCount, hex: byteCount.toString(16).padStart(2, '0').toUpperCase() });
      for (let i = 1; i < data.length; i++) {
        fields.push({
          name: `Coil Byte[${i - 1}]`,
          value: `0b${data[i].toString(2).padStart(8, '0')}`,
          hex: data[i].toString(16).padStart(2, '0').toUpperCase(),
        });
      }
    }
  } else if (realFC === 0x10) {
    if (data.length >= 5) {
      const startAddr = (data[0] << 8) | data[1];
      const quantity = (data[2] << 8) | data[3];
      const byteCount = data[4];
      fields.push({ name: 'Başlangıç Adresi', value: startAddr, hex: startAddr.toString(16).padStart(4, '0').toUpperCase() });
      fields.push({ name: 'Register Miktarı', value: quantity, hex: quantity.toString(16).padStart(4, '0').toUpperCase() });
      fields.push({ name: 'Byte Sayısı', value: byteCount, hex: byteCount.toString(16).padStart(2, '0').toUpperCase() });
      for (let i = 5; i + 1 < data.length; i += 2) {
        const regValue = (data[i] << 8) | data[i + 1];
        const regIndex = (i - 5) / 2;
        fields.push({
          name: `Veri[${regIndex}]`,
          value: regValue,
          hex: regValue.toString(16).padStart(4, '0').toUpperCase(),
        });
      }
    }
  }

  fields.push({
    name: 'CRC-16',
    value: crcValid ? 'Geçerli ✓' : 'HATA ✗',
    hex: crc.toString(16).padStart(4, '0').toUpperCase(),
    highlight: crcValid ? 'ok' : 'error',
  });

  return {
    valid: true,
    deviceAddress,
    functionCode,
    functionName,
    isError,
    data,
    crc,
    crcValid,
    fields,
  };
}

// ─────────────────────────────────────────────
// NMEA 0183
// ─────────────────────────────────────────────

export interface NMEASentence {
  valid: boolean;
  raw: string;
  talker: string;
  sentence: string;
  sentenceName: string;
  fields: DecodedField[];
  checksum: string;
  checksumValid: boolean;
}

const NMEA_TALKERS: Record<string, string> = {
  GP: 'GPS',
  GL: 'GLONASS',
  GN: 'GNSS (Multi)',
  GA: 'Galileo',
  GB: 'BeiDou',
  II: 'Entegre Enstrüman',
  HC: 'Pusula',
  WI: 'Hava İstasyonu',
};

const NMEA_SENTENCES: Record<string, string> = {
  GGA: 'Global Konum Verisi',
  RMC: 'Tavsiye Edilen Min. Konum',
  GSV: 'Görüntülenen Uydular',
  GSA: 'DOP ve Aktif Uydular',
  GLL: 'Coğrafi Konum',
  VTG: 'Hız ve Rota',
  ZDA: 'Tarih ve Saat',
  HDT: 'Gerçek Kuzey Başlığı',
  MWV: 'Rüzgar Hızı/Açısı',
};

function formatNMEATime(t: string): string {
  if (!t || t.length < 6) return t || '-';
  const hh = t.slice(0, 2);
  const mm = t.slice(2, 4);
  const ss = t.slice(4);
  return `${hh}:${mm}:${ss} UTC`;
}

function formatNMEADate(d: string): string {
  if (!d || d.length < 6) return d || '-';
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/20${d.slice(4, 6)}`;
}

function formatLatLon(val: string, dir: string): string {
  if (!val || val.length < 4) return `${val} ${dir}`.trim();
  const dotIdx = val.indexOf('.');
  if (dotIdx < 2) return `${val} ${dir}`;
  const degLen = dotIdx - 2;
  const deg = parseInt(val.slice(0, degLen), 10);
  const min = parseFloat(val.slice(degLen));
  const decimal = deg + min / 60;
  return `${decimal.toFixed(6)}° ${dir}`;
}

export function decodeNMEA(bytes: number[]): NMEASentence {
  const raw = bytes.map((b) => String.fromCharCode(b)).join('').trim();

  const empty: NMEASentence = {
    valid: false,
    raw,
    talker: '',
    sentence: '',
    sentenceName: 'Geçersiz NMEA Frame',
    fields: [],
    checksum: '',
    checksumValid: false,
  };

  if (!raw.startsWith('$')) return empty;

  const starIdx = raw.lastIndexOf('*');
  const checksumStr = starIdx >= 0 ? raw.slice(starIdx + 1).replace(/\s+/g, '') : '';
  const body = starIdx >= 0 ? raw.slice(1, starIdx) : raw.slice(1);

  let computedChecksum = 0;
  for (let i = 0; i < body.length; i++) {
    computedChecksum ^= body.charCodeAt(i);
  }
  const computedChecksumStr = computedChecksum.toString(16).toUpperCase().padStart(2, '0');
  const checksumValid = checksumStr.toUpperCase() === computedChecksumStr;

  const parts = body.split(',');
  const typeStr = parts[0];

  // talker is first 2 chars after $, sentence is remainder
  const talker = typeStr.length >= 2 ? typeStr.slice(0, 2) : typeStr;
  const sentence = typeStr.slice(2);
  const sentenceName = NMEA_SENTENCES[sentence] || sentence;

  const fields: DecodedField[] = [
    {
      name: 'Talker',
      value: NMEA_TALKERS[talker] || talker,
      hex: talker,
    },
    {
      name: 'Cümle Tipi',
      value: sentenceName,
      hex: sentence,
    },
  ];

  if (sentence === 'GGA') {
    fields.push({ name: 'Saat (UTC)', value: formatNMEATime(parts[1]), hex: parts[1] });
    fields.push({ name: 'Enlem', value: formatLatLon(parts[2], parts[3]), hex: `${parts[2]} ${parts[3]}` });
    fields.push({ name: 'Boylam', value: formatLatLon(parts[4], parts[5]), hex: `${parts[4]} ${parts[5]}` });
    const qualityMap: Record<string, string> = { '0': 'Geçersiz', '1': 'GPS Fix', '2': 'DGPS Fix', '3': 'PPS Fix', '4': 'RTK', '5': 'Float RTK' };
    fields.push({ name: 'Kalite', value: qualityMap[parts[6]] || parts[6], hex: parts[6], highlight: parts[6] === '0' ? 'error' : 'ok' });
    fields.push({ name: 'Uydu Sayısı', value: parts[7] || '-', hex: parts[7] });
    fields.push({ name: 'HDOP', value: parts[8] || '-', hex: parts[8] });
    fields.push({ name: 'Yükseklik', value: `${parts[9]} ${parts[10]}`, hex: parts[9] });
  } else if (sentence === 'RMC') {
    fields.push({ name: 'Saat (UTC)', value: formatNMEATime(parts[1]), hex: parts[1] });
    fields.push({ name: 'Durum', value: parts[2] === 'A' ? 'Aktif' : 'Geçersiz', hex: parts[2], highlight: parts[2] === 'A' ? 'ok' : 'error' });
    fields.push({ name: 'Enlem', value: formatLatLon(parts[3], parts[4]), hex: `${parts[3]} ${parts[4]}` });
    fields.push({ name: 'Boylam', value: formatLatLon(parts[5], parts[6]), hex: `${parts[5]} ${parts[6]}` });
    fields.push({ name: 'Hız (knot)', value: parts[7] || '-', hex: parts[7] });
    fields.push({ name: 'Kurs (°)', value: parts[8] ? `${parts[8]}°` : '-', hex: parts[8] });
    fields.push({ name: 'Tarih', value: formatNMEADate(parts[9]), hex: parts[9] });
  } else if (sentence === 'GSV') {
    fields.push({ name: 'Toplam Mesaj', value: parts[1] || '-', hex: parts[1] });
    fields.push({ name: 'Mesaj No', value: parts[2] || '-', hex: parts[2] });
    fields.push({ name: 'Toplam Uydu', value: parts[3] || '-', hex: parts[3] });
    // Per-satellite info (4 fields each: PRN, elevation, azimuth, SNR)
    for (let i = 4; i + 3 < parts.length && parts[i]; i += 4) {
      const satNum = (i - 4) / 4 + 1;
      fields.push({ name: `Uydu ${satNum} PRN`, value: parts[i], hex: parts[i] });
      fields.push({ name: `Uydu ${satNum} SNR`, value: parts[i + 3] ? `${parts[i + 3]} dBHz` : '-', hex: parts[i + 3] });
    }
  } else if (sentence === 'GSA') {
    const modeMap: Record<string, string> = { 'M': 'Manuel', 'A': 'Otomatik' };
    const fixMap: Record<string, string> = { '1': 'Fix Yok', '2': '2D Fix', '3': '3D Fix' };
    fields.push({ name: 'Mod', value: modeMap[parts[1]] || parts[1], hex: parts[1] });
    fields.push({ name: 'Fix Tipi', value: fixMap[parts[2]] || parts[2], hex: parts[2], highlight: parts[2] === '1' ? 'error' : 'ok' });
    fields.push({ name: 'PDOP', value: parts[15] || '-', hex: parts[15] });
    fields.push({ name: 'HDOP', value: parts[16] || '-', hex: parts[16] });
    fields.push({ name: 'VDOP', value: parts[17]?.split('*')[0] || '-', hex: parts[17] });
  } else if (sentence === 'VTG') {
    fields.push({ name: 'Kurs (Gerçek N)', value: parts[1] ? `${parts[1]}°` : '-', hex: parts[1] });
    fields.push({ name: 'Hız (knot)', value: parts[5] || '-', hex: parts[5] });
    fields.push({ name: 'Hız (km/h)', value: parts[7] || '-', hex: parts[7] });
  } else {
    // Generic: push all non-empty fields
    parts.slice(1).forEach((val, i) => {
      const v = val.split('*')[0];
      if (v) fields.push({ name: `Alan ${i + 1}`, value: v, hex: v });
    });
  }

  fields.push({
    name: 'Checksum',
    value: checksumValid ? `${checksumStr} ✓` : `${checksumStr} ✗ (beklenen: ${computedChecksumStr})`,
    hex: checksumStr,
    highlight: checksumValid ? 'ok' : 'error',
  });

  return { valid: true, raw, talker, sentence, sentenceName, fields, checksum: checksumStr, checksumValid };
}

// ─────────────────────────────────────────────
// OBD-II (ELM327)
// ─────────────────────────────────────────────

export interface OBD2Frame {
  valid: boolean;
  raw: string;
  command: string;
  isResponse: boolean;
  pid?: string;
  pidName?: string;
  value?: string | number;
  fields: DecodedField[];
}

export function decodeOBD2(bytes: number[]): OBD2Frame {
  const raw = bytes.map((b) => String.fromCharCode(b)).join('').trim().toUpperCase().replace(/\s+/g, '');
  
  const empty: OBD2Frame = {
    valid: false,
    raw,
    command: '',
    isResponse: false,
    fields: []
  };

  if (raw.length < 2) return empty;

  if (raw.startsWith('AT')) {
    return {
      valid: true,
      raw,
      command: raw,
      isResponse: false,
      fields: [
        { name: 'Tip', value: 'ELM327 AT Komutu', hex: 'AT' },
        { name: 'Komut', value: raw, hex: raw }
      ]
    };
  }

  const isResponse = raw.startsWith('41');
  const isRequest = raw.startsWith('01');
  
  if (!isRequest && !isResponse) return empty;

  const pid = raw.slice(2, 4);
  let pidName = `Bilinmeyen PID (0x${pid})`;
  let value: string | number = '';
  const fields: DecodedField[] = [
    { name: 'Yön', value: isResponse ? 'Cevap (Response)' : 'İstek (Request)', hex: raw.slice(0, 2) },
    { name: 'PID', value: `0x${pid}`, hex: pid }
  ];

  const dataHex = raw.slice(4);
  const dataBytes: number[] = [];
  for (let i = 0; i < dataHex.length; i += 2) {
    const val = parseInt(dataHex.slice(i, i + 2), 16);
    if (!isNaN(val)) dataBytes.push(val);
  }

  if (pid === '0C') {
    pidName = 'Motor Devri (RPM)';
    if (isResponse && dataBytes.length >= 2) {
      const rpm = ((dataBytes[0] * 256) + dataBytes[1]) / 4;
      value = `${rpm} RPM`;
      fields.push({ name: pidName, value, hex: dataHex, highlight: 'ok' });
    }
  } else if (pid === '0D') {
    pidName = 'Araç Hızı (Speed)';
    if (isResponse && dataBytes.length >= 1) {
      const speed = dataBytes[0];
      value = `${speed} km/h`;
      fields.push({ name: pidName, value, hex: dataHex, highlight: 'ok' });
    }
  } else if (pid === '05') {
    pidName = 'Motor Soğutma Suyu Sıcaklığı';
    if (isResponse && dataBytes.length >= 1) {
      const temp = dataBytes[0] - 40;
      value = `${temp} °C`;
      fields.push({ name: pidName, value, hex: dataHex, highlight: 'ok' });
    }
  } else if (pid === '11') {
    pidName = 'Gaz Kelebeği Pozisyonu';
    if (isResponse && dataBytes.length >= 1) {
      const throttle = (dataBytes[0] * 100) / 255;
      value = `${throttle.toFixed(1)} %`;
      fields.push({ name: pidName, value, hex: dataHex, highlight: 'ok' });
    }
  } else {
    fields.push({ name: 'Ham Veri (Hex)', value: dataHex || '—', hex: dataHex });
  }

  return {
    valid: true,
    raw,
    command: raw.slice(0, 4),
    isResponse,
    pid,
    pidName,
    value: value || undefined,
    fields
  };
}

// ─────────────────────────────────────────────
// AUTO-DETECT: ham byte dizisini hangi protokol
// olduğunu tahmin eder
// ─────────────────────────────────────────────
export type HighLevelProtocol = 'modbus_rtu' | 'nmea' | 'obd2' | 'unknown';

export function detectProtocol(bytes: number[]): HighLevelProtocol {
  if (!bytes || !Array.isArray(bytes) || bytes.length === 0) return 'unknown';
  // NMEA starts with '$' (0x24)
  if (bytes[0] === 0x24) return 'nmea';
  
  // OBD-II ASCII check (e.g. starts with '0', '4', 'A' in ASCII)
  if (bytes[0] === 0x30 || bytes[0] === 0x34 || bytes[0] === 0x41) {
    const raw = bytes.map((b) => String.fromCharCode(b)).join('').trim().toUpperCase().replace(/\s+/g, '');
    if (raw.startsWith('AT') || raw.startsWith('01') || raw.startsWith('41')) {
      return 'obd2';
    }
  }

  // Modbus RTU: device address 1–247, valid function code, at least 4 bytes
  if (bytes.length >= 4) {
    const addr = bytes[0];
    const fc = bytes[1] & 0x7F;
    if (addr >= 1 && addr <= 247 && fc >= 1 && fc <= 0x17) return 'modbus_rtu';
  }
  return 'unknown';
}
