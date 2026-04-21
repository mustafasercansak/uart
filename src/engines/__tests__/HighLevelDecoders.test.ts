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

        it('decodes Write Single Register (FC 06)', () => {
            const bytes = [0x01, 0x06, 0x00, 0x01, 0x00, 0xFF, 0x99, 0x8A];
            const result = decodeModbusRTU(bytes);
            expect(result.functionName).toBe('Write Single Register');
            expect(result.fields.find(f => f.name === 'Yazılan Değer')?.value).toBe(255);
        });

        it('decodes Write Multiple Registers (FC 10)', () => {
            const bytes = [0x01, 0x10, 0x00, 0x01, 0x00, 0x02, 0x04, 0x00, 0x0A, 0x00, 0x14, 0x3E, 0x11];
            const result = decodeModbusRTU(bytes);
            expect(result.functionName).toBe('Write Multiple Registers');
            expect(result.fields.find(f => f.name === 'Veri[0]')?.value).toBe(10);
            expect(result.fields.find(f => f.name === 'Veri[1]')?.value).toBe(20);
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

        it('decodes a valid RMC sentence', () => {
            const sentence = '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A';
            const bytes = Array.from(sentence).map(c => c.charCodeAt(0));
            const result = decodeNMEA(bytes);
            expect(result.valid).toBe(true);
            expect(result.sentence).toBe('RMC');
            expect(result.fields.find(f => f.name === 'Durum')?.value).toBe('Aktif');
        });

        it('decodes a valid GSV sentence', () => {
            const sentence = '$GPGSV,3,1,11,03,03,111,00,04,15,270,00,06,01,010,00,13,06,292,00*74';
            const bytes = Array.from(sentence).map(c => c.charCodeAt(0));
            const result = decodeNMEA(bytes);
            expect(result.valid).toBe(true);
            expect(result.sentence).toBe('GSV');
            expect(result.fields.find(f => f.name === 'Uydu 1 PRN')?.value).toBe('03');
        });

        it('decodes a valid GSA sentence', () => {
            const sentence = '$GPGSA,A,3,04,05,,09,12,,,24,,,,,2.5,1.3,2.1*39';
            const bytes = Array.from(sentence).map(c => c.charCodeAt(0));
            const result = decodeNMEA(bytes);
            expect(result.valid).toBe(true);
            expect(result.sentence).toBe('GSA');
            expect(result.fields.find(f => f.name === 'Fix Tipi')?.value).toBe('3D Fix');
        });

        it('decodes a valid VTG sentence', () => {
            const sentence = '$GPVTG,054.7,T,034.4,M,005.5,N,010.2,K*48';
            const bytes = Array.from(sentence).map(c => c.charCodeAt(0));
            const result = decodeNMEA(bytes);
            expect(result.valid).toBe(true);
            expect(result.sentence).toBe('VTG');
            expect(result.fields.find(f => f.name === 'Hız (km/h)')?.value).toBe('010.2');
        });

        it('detects checksum mismatch', () => {
            const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*00';
            const bytes = Array.from(sentence).map(c => c.charCodeAt(0));
            const result = decodeNMEA(bytes);
            expect(result.checksumValid).toBe(false);
        });

        it('handles unknown NMEA sentences (generic parsing)', () => {
             const sentence = '$GPXXX,123,ABC*6B';
             const bytes = Array.from(sentence).map(c => c.charCodeAt(0));
             const result = decodeNMEA(bytes);
             expect(result.valid).toBe(true);
             expect(result.fields.find(f => f.name === 'Alan 1')?.value).toBe('123');
        });
    });
});
