import { describe, it, expect } from 'vitest';
import { parseCHeader } from '../CHeaderImporter';

describe('CHeaderImporter', () => {
    it('parses basic uint8_t and uint16_t fields', () => {
        const header = `
            struct Data {
                uint8_t sync;
                uint16_t value;
            };
        `;
        const fields = parseCHeader(header);
        expect(fields.length).toBe(2);
        expect(fields[0].name).toBe('sync');
        expect(fields[0].byteWidth).toBe(1);
        expect(fields[1].name).toBe('value');
        expect(fields[1].byteWidth).toBe(2);
    });

    it('handles array members by multiplying width', () => {
        const header = `
            uint8_t raw[10];
            uint32_t timestamp;
        `;
        const fields = parseCHeader(header);
        expect(fields.length).toBe(2);
        expect(fields[0].name).toBe('raw');
        expect(fields[0].byteWidth).toBe(10);
        expect(fields[1].name).toBe('timestamp');
        expect(fields[1].byteWidth).toBe(4);
    });

    it('ignores comments', () => {
        const header = `
            // This is a comment
            uint8_t a; /* multi-line
                          comment */
            uint8_t b;
        `;
        const fields = parseCHeader(header);
        expect(fields.length).toBe(2);
        expect(fields[0].name).toBe('a');
        expect(fields[1].name).toBe('b');
    });

    it('defaults to 1 byte for unknown types', () => {
        const header = `mystruct_t custom;`;
        const fields = parseCHeader(header);
        expect(fields[0].byteWidth).toBe(1);
    });
});
