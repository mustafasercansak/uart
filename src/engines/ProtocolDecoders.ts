import type { ProtocolType } from '../types';

export interface BitAnnotation {
  index: number;
  label: string;
  type: 'start' | 'data' | 'stop' | 'error' | 'idle' | 'clock' | 'ack' | 'sof' | 'eof' | 'id';
  value: number;
}

export interface SignalLine {
  label: string;
  color: string;
  bits: number[];
  annotations: BitAnnotation[];
}

export function decodeUART(bytes: number[]): SignalLine[] {
  const bits: number[] = [1, 1, 1]; // Idle
  const annotations: BitAnnotation[] = [
    { index: 0, label: 'IDLE', type: 'idle', value: 1 },
  ];

  bytes.forEach((byte) => {
    // Start bit (0)
    const byteStartIdx = bits.length;
    bits.push(0);
    annotations.push({ index: byteStartIdx, label: 'S', type: 'start', value: 0 });

    // 8 Data bits (LSB first)
    for (let i = 0; i < 8; i++) {
      const val = (byte >> i) & 1;
      bits.push(val);
      annotations.push({ index: bits.length - 1, label: `D${i}`, type: 'data', value: val });
    }

    // Stop bit (1)
    bits.push(1);
    annotations.push({ index: bits.length - 1, label: 'T', type: 'stop', value: 1 });
  });

  bits.push(1, 1, 1); // Padding

  return [{
    label: 'UART',
    color: 'text-blue-400',
    bits,
    annotations
  }];
}

export function decodeSPI(bytes: number[]): SignalLine[] {
  const sck: number[] = [];
  const mosi: number[] = [];
  const miso: number[] = [];
  const cs: number[] = [];
  
  const annotationsSCK: BitAnnotation[] = [];
  const annotationsMOSI: BitAnnotation[] = [];
  
  // CS starts High
  cs.push(1, 1);
  sck.push(0, 0);
  mosi.push(0, 0);
  miso.push(0, 0);

  bytes.forEach((byte, byteIdx) => {
    // CS goes Low
    cs.push(0);
    sck.push(0);
    mosi.push((byte >> 7) & 1); // MSB for SPI usually
    miso.push(0);

    for (let bit = 7; bit >= 0; bit--) {
      const val = (byte >> bit) & 1;
      
      // SCK Pulse (High then Low)
      sck.push(1);
      mosi.push(val);
      miso.push(0);
      cs.push(0);
      annotationsMOSI.push({ index: mosi.length - 1, label: `D${bit}`, type: 'data', value: val });
      
      sck.push(0);
      mosi.push(val);
      miso.push(0);
      cs.push(0);
    }
  });

  // CS goes High
  cs.push(1, 1);
  sck.push(0, 0);
  mosi.push(0, 0);
  miso.push(0, 0);

  return [
    { label: 'CS', color: 'text-purple-400', bits: cs, annotations: [] },
    { label: 'SCK', color: 'text-yellow-400', bits: sck, annotations: [] },
    { label: 'MOSI', color: 'text-blue-400', bits: mosi, annotations: annotationsMOSI },
    { label: 'MISO', color: 'text-green-400', bits: miso, annotations: [] },
  ];
}

export function decodeI2C(bytes: number[]): SignalLine[] {
  const scl: number[] = [1, 1];
  const sda: number[] = [1, 1];
  const annotationsSDA: BitAnnotation[] = [];

  // Start Condition (SDA goes Low while SCL High)
  scl.push(1, 1);
  sda.push(1, 0);
  annotationsSDA.push({ index: sda.length - 1, label: 'S', type: 'start', value: 0 });
  
  bytes.forEach((byte) => {
    for (let bit = 7; bit >= 0; bit--) {
      const val = (byte >> bit) & 1;
      
      // SCL Low
      scl.push(0);
      sda.push(val);
      
      // SCL High
      scl.push(1);
      sda.push(val);
      annotationsSDA.push({ index: sda.length - 1, label: `D${bit}`, type: 'data', value: val });
      
      // SCL Low
      scl.push(0);
      sda.push(val);
    }
    
    // ACK bit
    scl.push(0);
    sda.push(0);
    scl.push(1);
    sda.push(0);
    annotationsSDA.push({ index: sda.length - 1, label: 'ACK', type: 'ack', value: 0 });
    scl.push(0);
    sda.push(0);
  });

  // Stop Condition (SDA goes High while SCL High)
  scl.push(1, 1);
  sda.push(0, 1);
  annotationsSDA.push({ index: sda.length - 1, label: 'P', type: 'stop', value: 1 });

  return [
    { label: 'SCL', color: 'text-yellow-400', bits: scl, annotations: [] },
    { label: 'SDA', color: 'text-blue-400', bits: sda, annotations: annotationsSDA },
  ];
}

export function decodeCAN(bytes: number[]): SignalLine[] {
  const bits: number[] = [1, 1, 1];
  const annotations: BitAnnotation[] = [];

  // SOF
  bits.push(0);
  annotations.push({ index: bits.length - 1, label: 'SOF', type: 'sof', value: 0 });

  // ID (Arbitrary 11-bit)
  for (let i = 0; i < 11; i++) {
    bits.push(1); // Placeholder
  }
  annotations.push({ index: bits.length - 11, label: 'ID', type: 'id', value: 1 });

  // Control/DLC
  for (let i = 0; i < 6; i++) bits.push(0);

  // Data
  bytes.forEach((byte, bIdx) => {
    for (let i = 7; i >= 0; i--) {
      const val = (byte >> i) & 1;
      bits.push(val);
      annotations.push({ index: bits.length - 1, label: `B${bIdx}:D${i}`, type: 'data', value: val });
    }
  });

  // CRC (approx)
  for (let i = 0; i < 15; i++) bits.push(Math.random() > 0.5 ? 1 : 0);
  
  // ACK / EOF
  bits.push(0, 1, 1, 1, 1, 1, 1, 1);
  annotations.push({ index: bits.length - 8, label: 'ACK', type: 'ack', value: 0 });
  annotations.push({ index: bits.length - 1, label: 'EOF', type: 'eof', value: 1 });

  return [{
    label: 'CAN',
    color: 'text-orange-400',
    bits,
    annotations
  }];
}

export function getDecodedLines(protocol: ProtocolType, bytes: number[]): SignalLine[] {
  switch (protocol) {
    case 'UART': return decodeUART(bytes);
    case 'SPI': return decodeSPI(bytes);
    case 'I2C': return decodeI2C(bytes);
    case 'CAN': return decodeCAN(bytes);
    default: return decodeUART(bytes);
  }
}
