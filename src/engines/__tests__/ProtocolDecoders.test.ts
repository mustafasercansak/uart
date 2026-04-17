import { describe, it, expect } from 'vitest';
import { decodeUART, decodeSPI, decodeI2C, decodeCAN } from '../ProtocolDecoders';

describe('ProtocolDecoders', () => {
    it('decodes UART bytes into bitstream with annotations', () => {
        const bytes = [0x55]; // 01010101
        const result = decodeUART(bytes);
        expect(result.length).toBe(1);
        expect(result[0].label).toBe('UART');
        // Start(0), D0..D7(1,0,1,0,1,0,1,0), Stop(1)
        const annotations = result[0].annotations;
        expect(annotations.find(a => a.label === 'START')).toBeUndefined(); // It uses 'S'
        expect(annotations.find(a => a.label === 'S')).toBeDefined();
        expect(annotations.find(a => a.label === 'D0')?.value).toBe(1);
        expect(annotations.find(a => a.label === 'D1')?.value).toBe(0);
    });

    it('decodes SPI bytes into 4 signal lines', () => {
        const bytes = [0xAA];
        const result = decodeSPI(bytes);
        expect(result.length).toBe(4);
        expect(result.map(r => r.label)).toContain('CS');
        expect(result.map(r => r.label)).toContain('SCK');
        expect(result.map(r => r.label)).toContain('MOSI');
        expect(result.map(r => r.label)).toContain('MISO');
    });

    it('decodes I2C bytes with Start/Stop conditions', () => {
        const bytes = [0x48];
        const result = decodeI2C(bytes);
        expect(result.length).toBe(2);
        expect(result[0].label).toBe('SCL');
        expect(result[1].label).toBe('SDA');
        expect(result[1].annotations.some(a => a.label === 'S')).toBe(true);
        expect(result[1].annotations.some(a => a.label === 'P')).toBe(true);
        expect(result[1].annotations.some(a => a.label === 'ACK')).toBe(true);
    });

    it('decodes CAN frames with SOF and EOF', () => {
        const bytes = [0x12, 0x34];
        const result = decodeCAN(bytes);
        expect(result[0].label).toBe('CAN');
        expect(result[0].annotations.some(a => a.label === 'SOF')).toBe(true);
        expect(result[0].annotations.some(a => a.label === 'EOF')).toBe(true);
    });
});
