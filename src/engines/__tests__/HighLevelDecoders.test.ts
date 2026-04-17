import { describe, it, expect } from 'vitest';
import { decodeModbusRTU, decodeNMEA, detectProtocol } from '../HighLevelDecoders';

describe('HighLevelDecoders', () => {
    describe('detectProtocol', () => {
        it('detects NMEA from $ prefix', () => {
            expect(detectProtocol([0x24])).toBe('nmea'); // '$'
        });

        it('detects Modbus RTU from address and function code', () => {
            // addr 1, FC 3, data, crc16
            expect(detectProtocol([0x01, 0x03, 0x00, 0x00])).toBe('modbus_rtu');
        });

        it('returns unknown for small or invalid data', () => {
            expect(detectProtocol([0x00])).toBe('unknown');
        });
    });

    describe('decodeModbusRTU', () => {
        it('decodes a valid Read Holding Registers request', () => {
             // Addr: 1, FC: 3, Start: 0x0000, Qty: 0x0002, CRC: 0xC40B
             // bytes: [0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xC4, 0x0B]
             const bytes = [0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xC4, 0x0B];
             const result = decodeModbusRTU(bytes);
             expect(result.valid).toBe(true);
             expect(result.functionName).toBe('Read Holding Registers');
             expect(result.crcValid).toBe(true);
        });

        it('identifies CRC errors', () => {
            const bytes = [0x01, 0x03, 0x00, 0x6B, 0x00,0x01, 0x00, 0x00];
            const result = decodeModbusRTU(bytes);
            expect(result.crcValid).toBe(false);
        });

        it('handles error responses (FC >= 0x80)', () => {
            // Addr 1, FC 0x83, Ex 0x02, CRC
            const bytes = [0x01, 0x83, 0x02, 0xC0, 0xF1];
            const result = decodeModbusRTU(bytes);
            expect(result.isError).toBe(true);
            expect(result.fields.find(f => f.name === 'İstisna Kodu')?.value).toBe('Geçersiz Veri Adresi');
        });
    });

    describe('decodeNMEA', () => {
        it('decodes a valid GGA sentence', () => {
            const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47';
            const bytes = Array.from(sentence).map(c => c.charCodeAt(0));
            const result = decodeNMEA(bytes);
            expect(result.valid).toBe(true);
            expect(result.sentence).toBe('GGA');
            expect(result.checksumValid).toBe(true);
            expect(result.fields.find(f => f.name === 'Uydu Sayısı')?.value).toBe('08');
        });

        it('detects checksum mismatch', () => {
            const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*00';
            const bytes = Array.from(sentence).map(c => c.charCodeAt(0));
            const result = decodeNMEA(bytes);
            expect(result.checksumValid).toBe(false);
        });
    });
});
