import { describe, it, expect } from 'vitest';
import { LM75Driver, EEPROMDriver, VirtualConsoleDriver, VirtualPeripheralEngine } from '../VirtualPeripheralEngine';

describe('VirtualPeripheralEngine', () => {
    describe('LM75Driver (I2C Temp Sensor)', () => {
        const driver = new LM75Driver();

        it('returns temperature on read command', () => {
            // Address 0x48, Read bit set (0x48 << 1 | 1 = 0x91)
            const input = [0x91];
            const response = driver.process(input);
            expect(response).not.toBeNull();
            expect(response?.bytes.length).toBe(2);
            expect(response?.log).toContain('25.5°C');
        });

        it('ignores incorrect I2C addresses', () => {
            const input = [0x55 << 1 | 1]; // addr 0x55
            const response = driver.process(input);
            expect(response).toBeNull();
        });
    });

    describe('EEPROMDriver (SPI)', () => {
        const driver = new EEPROMDriver();

        it('denies write if WREN is not set', () => {
            const input = [0x02, 0x10, 0xAA]; // WRITE, addr 0x10, val 0xAA
            const response = driver.process(input);
            expect(response?.log).toContain('FAILED');
        });

        it('allows write after WREN', () => {
            driver.process([0x06]); // WREN
            const writeRes = driver.process([0x02, 0x10, 0xAA]);
            expect(writeRes?.log).toContain('Write @0x10');
            
            // Read back
            const readRes = driver.process([0x03, 0x10]);
            expect(readRes?.bytes[0]).toBe(0xAA);
        });

        it('reports status register correctly', () => {
            driver.process([0x04]); // WRDI (disable)
            let res = driver.process([0x05]); // RDSR
            expect(res?.bytes[0]).toBe(0x00);

            driver.process([0x06]); // WREN
            res = driver.process([0x05]);
            expect(res?.bytes[0]).toBe(0x02); // WEL bit
        });
    });

    describe('VirtualConsoleDriver (UART)', () => {
        const driver = new VirtualConsoleDriver();

        it('responds to HELP command', () => {
            const input = Array.from('HELP').map(c => c.charCodeAt(0));
            const response = driver.process(input);
            expect(response?.log).toContain('HELP command');
            expect(String.fromCharCode(...(response?.bytes || []))).toContain('Available commands');
        });

        it('performs raw loopback for unknown text', () => {
            const input = [0xDE, 0xAD, 0xBE, 0xEF];
            const response = driver.process(input);
            expect(response?.bytes).toEqual(input);
            expect(response?.log).toContain('Loopback');
        });
    });

    describe('Engine Integration', () => {
        const engine = new VirtualPeripheralEngine();

        it('routes I2C packets only to I2C drivers', () => {
            const results = engine.processIncoming('I2C', [0x91]);
            // LM75 is an I2C driver
            expect(results.length).toBe(1);
            expect(results[0].log).toContain('LM75');
        });

        it('routes SPI packets only to SPI drivers', () => {
            const results = engine.processIncoming('SPI', [0x05]);
            // EEPROM is an SPI driver
            expect(results.length).toBe(1);
            expect(results[0].log).toContain('EEPROM');
        });
    });
});
