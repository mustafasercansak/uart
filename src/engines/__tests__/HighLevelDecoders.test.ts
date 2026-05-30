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

        it('uses fallback text for unknown exception code', () => {
            const bytes = [0x01, 0x83, 0x7f, 0x80, 0xf0];
            const result = decodeModbusRTU(bytes);
            expect(result.fields.find(f => f.name === 'İstisna Kodu')?.value).toBe('0x7F');
        });

        it('handles FC 03/04 with empty data payload', () => {
            const bytes = [0x01, 0x03, 0x40, 0x21];
            const result = decodeModbusRTU(bytes);
            expect(result.functionName).toBe('Read Holding Registers');
            expect(result.fields.find(f => f.name === 'Byte Sayısı')).toBeUndefined();
        });

        it('handles FC 06 frames with short data payload', () => {
            const bytes = [0x01, 0x06, 0x00, 0x00, 0x20, 0x0a];
            const result = decodeModbusRTU(bytes);
            expect(result.fields.find(f => f.name === 'Register Adresi')).toBeUndefined();
        });

        it('handles FC 01/02 branch with no data bytes', () => {
            const bytes = [0x01, 0x01, 0xc0, 0x01];
            const result = decodeModbusRTU(bytes);
            expect(result.functionName).toBe('Read Coils');
            expect(result.fields.find(f => f.name === 'Coil Miktarı')).toBeUndefined();
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

        it('covers NMEA helper function edge cases', () => {
             // formatNMEATime short
             const shortTime = '$GPGGA,12,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*42';
             const result1 = decodeNMEA(Array.from(shortTime).map(c => c.charCodeAt(0)));
             expect(result1.fields.find(f => f.name === 'Saat (UTC)')?.value).toBe('12');

             // formatLatLon invalid (short or missing dot)
             const invLat = '$GPGGA,123519,48,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*5E';
             const result2 = decodeNMEA(Array.from(invLat).map(c => c.charCodeAt(0)));
             expect(result2.fields.find(f => f.name === 'Enlem')?.value).toBe('48 N');
        });
    });

    describe('edge cases and additional branches', () => {
        it('handles malformed Modbus frames', () => {
            expect(decodeModbusRTU([0x01, 0x03]).valid).toBe(false);
        });

        it('decodes Modbus Coils (FC 01/02)', () => {
             // Request: Addr 1, FC 1, Start 0, Qty 8, CRC
             const req = [0x01, 0x01, 0x00, 0x00, 0x00, 0x08, 0x3D, 0xCC];
             const res1 = decodeModbusRTU(req);
             expect(res1.fields.find(f => f.name === 'Coil Miktarı')?.value).toBe(8);

             // Response: Addr 1, FC 1, ByteCount 1, Data 0x55, CRC
             const resp = [0x01, 0x01, 0x01, 0x55, 0x90, 0x6E];
             const res2 = decodeModbusRTU(resp);
             expect(res2.fields.find(f => f.name === 'Coil Byte[0]')?.value).toBe('0b01010101');
        });

        it('handles invalid NMEA formats', () => {
             expect(decodeNMEA([0x41, 0x42]).valid).toBe(false); // 'AB'
        });

        it('hits diverse detectProtocol branches', () => {
            expect(detectProtocol([])).toBe('unknown');
            expect(detectProtocol(null as unknown as number[])).toBe('unknown');
            // Modbus out of range
            expect(detectProtocol([250, 3, 0, 0])).toBe('unknown');
            expect(detectProtocol([1, 0x18, 0, 0])).toBe('unknown');
        });

        it('decodes Modbus Holding Register Responses', () => {
             // Addr 1, FC 3, ByteCount 4, Val1 100, Val2 200, CRC
             const bytes = [0x01, 0x03, 0x04, 0x00, 0x64, 0x00, 0xC8, 0xBA, 0xD2];
             const result = decodeModbusRTU(bytes);
             expect(result.valid).toBe(true);
             expect(result.fields.find(f => f.name === 'Byte Sayısı')?.value).toBe(4);
             expect(result.fields.find(f => f.name === 'Register[0]')?.value).toContain('100');
        });

        it('covers more NMEA branches (GSV, GSA, VTG, generic)', () => {
             // GSV with multiple satellites
             const gsv = '$GPGSV,1,1,02,03,03,111,00,04,15,270,00*72';
             const resGSV = decodeNMEA(Array.from(gsv).map(c => c.charCodeAt(0)));
             expect(resGSV.fields.filter(f => f.name.includes('PRN')).length).toBe(2);

             // GSA with mode/fix map hits
             const gsa = '$GPGSA,M,1,04,05,,,,,,,,,,,2.5,1.3,2.1*3C';
             const resGSA = decodeNMEA(Array.from(gsa).map(c => c.charCodeAt(0)));
             expect(resGSA.fields.find(f => f.name === 'Mod')?.value).toBe('Manuel');

             // VTG with missing curso
             const vtg = '$GPVTG,,T,,M,005.5,N,010.2,K*4E';
             const resVTG = decodeNMEA(Array.from(vtg).map(c => c.charCodeAt(0)));
             expect(resVTG.fields.find(f => f.name === 'Kurs (Gerçek N)')?.value).toBe('-');

             // Generic unknown fields
             const unknown = '$GPUNK,1,2,3*51';
             const resUNK = decodeNMEA(Array.from(unknown).map(c => c.charCodeAt(0)));
             expect(resUNK.fields.some(f => f.name === 'Alan 1')).toBe(true);
        });

        it('covers more Modbus branches (FC 16, FC 01/02 requests)', () => {
            // FC 16 (0x10) request with diverse data
            const fc16Req = [0x01, 0x10, 0x00, 0x01, 0x00, 0x02, 0x04, 0x00, 0x0A, 0x00, 0x14, 0x3E, 0x11];
            const res16 = decodeModbusRTU(fc16Req);
            expect(res16.fields.find(f => f.name === 'Veri[0]')?.value).toBe(10);

            // FC 01 request (8 bytes length)
            const fc1Req = [0x01, 0x01, 0x00, 0x00, 0x00, 0x08, 0x3D, 0xCC];
            const res1 = decodeModbusRTU(fc1Req);
            expect(res1.fields.find(f => f.name === 'Coil Miktarı')?.value).toBe(8);
        });
    });

    describe('Extreme Branch Coverage', () => {
        it('covers final HighLevelDecoders branches', () => {
             // formatLatLon dotIdx < 2
             const invLat = '$GPGGA,123519,.48,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*5E';
             expect(decodeNMEA(Array.from(invLat).map(c => c.charCodeAt(0))).fields.find(f => f.name === 'Enlem')?.value).toBe('.48 N');

             // GSA with unknown mode/fix and missing VDOP
             const gsa = '$GPGSA,X,9,04,05,,,,,,,,,,,2.5,1.3,*1F';
             const resGSA = decodeNMEA(Array.from(gsa).map(c => c.charCodeAt(0)));
             expect(resGSA.fields.find(f => f.name === 'Mod')?.value).toBe('X');
             expect(resGSA.fields.find(f => f.name === 'VDOP')?.value).toBe('-');

             // VTG with full data
             const vtg = '$GPVTG,054.7,T,034.4,M,005.5,N,010.2,K*48';
             const resVTG = decodeNMEA(Array.from(vtg).map(c => c.charCodeAt(0)));
             expect(resVTG.fields.find(f => f.name === 'Hız (knot)')?.value).toBe('005.5');

             // Modbus unknown FC
             const bytesUNK = [0x01, 0x11, 0x00, 0x00, 0x00, 0x00, 0xDE, 0xC4];
             expect(decodeModbusRTU(bytesUNK).functionName).toBe('FC 0x11');

             // Modbus FC 16 with short data (triggering length < 5 branch)
             const shortFC16 = [0x01, 0x10, 0x00, 0x01, 0x00, 0x6E, 0x1D];
             expect(decodeModbusRTU(shortFC16).fields.find(f => f.name === 'Başlangıç Adresi')).toBeUndefined();
        });

        it('NMEA: handles sentences without checksums and short talkers', () => {
             // No asterisk
             const noStar = '$GPGGA,1,2,3';
             const res1 = decodeNMEA(Array.from(noStar).map(c => c.charCodeAt(0)));
             expect(res1.checksum).toBe('');
             expect(res1.checksumValid).toBe(false);

             // Short talker (1 char)
             const shortTalker = '$P,DATA*29';
             const res2 = decodeNMEA(Array.from(shortTalker).map(c => c.charCodeAt(0)));
             expect(res2.talker).toBe('P');

             // Unknown talker
             const unknownTalker = '$XX,DATA*21';
             const res3 = decodeNMEA(Array.from(unknownTalker).map(c => c.charCodeAt(0)));
             expect(res3.fields.find(f => f.name === 'Talker')?.value).toBe('XX');
        });

        it('NMEA: handles missing fields in all major sentence types', () => {
             const gga = '$GPGGA,123519,4807.038,N,01131.000,E,1,,,545.4,M,46.9,M,,*41';
             const resGGA = decodeNMEA(Array.from(gga).map(c => c.charCodeAt(0)));
             expect(resGGA.fields.find(f => f.name === 'Uydu Sayısı')?.value).toBe('-');

             const rmc = '$GPRMC,123519,A,4807.038,N,01131.000,E,,,230394,,*31';
             const resRMC = decodeNMEA(Array.from(rmc).map(c => c.charCodeAt(0)));
             expect(resRMC.fields.find(f => f.name === 'Hız (knot)')?.value).toBe('-');

             const gsv = '$GPGSV,,,,*79';
             const resGSV = decodeNMEA(Array.from(gsv).map(c => c.charCodeAt(0)));
             expect(resGSV.fields.find(f => f.name === 'Toplam Mesaj')?.value).toBe('-');

             const gsa = '$GPGSA,A,3,04,05,,,,,,,,,,,,,,*12';
             const resGSA = decodeNMEA(Array.from(gsa).map(c => c.charCodeAt(0)));
             expect(resGSA.fields.find(f => f.name === 'PDOP')?.value).toBe('-');

             const vtg = '$GPVTG,054.7,T,034.4,M,,,,*42';
             const resVTG = decodeNMEA(Array.from(vtg).map(c => c.charCodeAt(0)));
             expect(resVTG.fields.find(f => f.name === 'Hız (knot)')?.value).toBe('-');
        });

        it('Formatter: handles null/empty inputs', () => {
             const emptyTimeDate = '$GPRMC,,A,4807.038,N,01131.000,E,022.4,084.4,,003.1,W*7D';
             const res1 = decodeNMEA(Array.from(emptyTimeDate).map(c => c.charCodeAt(0)));
             expect(res1.fields.find(f => f.name === 'Saat (UTC)')?.value).toBe('-');

             const weirdLat = '$GPGGA,123519,4807,N,0113,E,1,08,0.9,545.4,M,46.9,M,,*53';
             const res2 = decodeNMEA(Array.from(weirdLat).map(c => c.charCodeAt(0)));
             expect(res2.fields.find(f => f.name === 'Enlem')?.value).toBe('4807 N');
        });

        it('Modbus: covers multi-byte coil responses', () => {
             const resp = [0x01, 0x01, 0x02, 0x55, 0xAA, 0x3A, 0x72];
             const res = decodeModbusRTU(resp);
             expect(res.fields.find(f => f.name === 'Coil Byte[0]')?.value).toBe('0b01010101');
             expect(res.fields.find(f => f.name === 'Coil Byte[1]')?.value).toBe('0b10101010');
        });

        it('Modbus FC 0x06 write single register', () => {
             // realFC=0x06, data=[addrHi, addrLo, valHi, valLo]
             const req = [0x01, 0x06, 0x00, 0x10, 0x00, 0x0A, 0xE9, 0x79];
             const res = decodeModbusRTU(req);
             expect(res.fields.find(f => f.name === 'Register Adresi')?.value).toBe(16);
             expect(res.fields.find(f => f.name === 'Yazılan Değer')?.value).toBe(10);
        });

        it('Modbus FC 0x01 request form (8 bytes, 4 data bytes)', () => {
             // realFC=0x01, bytes.length===8, data.length>=4 → start address + quantity
             const req = [0x01, 0x01, 0x00, 0x00, 0x00, 0x08, 0x3D, 0xCC];
             const res = decodeModbusRTU(req);
             expect(res.fields.find(f => f.name === 'Başlangıç Adresi')?.value).toBe(0);
             expect(res.fields.find(f => f.name === 'Coil Miktarı')?.value).toBe(8);
        });

        it('NMEA: targets remaining specific branches', () => {
             // Line 326: qualityMap fallback
             const gga = '$GPGGA,123519,4807.038,N,01131.000,E,9,08,0.9,545.4,M,46.9,M,,*49';
             expect(decodeNMEA(Array.from(gga).map(c => c.charCodeAt(0))).fields.find(f => f.name === 'Kalite')?.value).toBe('9');

             // Line 332: RMC status 'V'
             const rmc = '$GPRMC,123519,V,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*7D';
             expect(decodeNMEA(Array.from(rmc).map(c => c.charCodeAt(0))).fields.find(f => f.name === 'Durum')?.value).toBe('Geçersiz');

             // Line 346: GSV SNR missing
             const gsv = '$GPGSV,1,1,01,03,03,111,*42';
             expect(decodeNMEA(Array.from(gsv).map(c => c.charCodeAt(0))).fields.find(f => f.name === 'Uydu 1 SNR')?.value).toBe('-');

             // Line 364: Generic loop with non-empty 'v'
             const generic = '$GPUNK,V1,,V3*5B';
             const res = decodeNMEA(Array.from(generic).map(c => c.charCodeAt(0)));
             expect(res.fields.find(f => f.name === 'Alan 1')?.value).toBe('V1');
             expect(res.fields.find(f => f.name === 'Alan 3')?.value).toBe('V3');
             expect(res.fields.find(f => f.name === 'Alan 2')).toBeUndefined();
        });

        it('NMEA: marks GGA quality 0 as error highlight', () => {
            const gga = '$GPGGA,123519,4807.038,N,01131.000,E,0,08,0.9,545.4,M,46.9,M,,*40';
            const result = decodeNMEA(Array.from(gga).map(c => c.charCodeAt(0)));
            const quality = result.fields.find(f => f.name === 'Kalite');
            expect(quality?.highlight).toBe('error');
            expect(quality?.value).toBe('Geçersiz');
        });
    });
});
