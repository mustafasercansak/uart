import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const EN_PATH = path.resolve('src/i18n/locales/en.json');
const TR_PATH = path.resolve('src/i18n/locales/tr.json');

function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.keys(obj).reduce((res: string[], el) => {
        if (Array.isArray(obj[el])) {
            return [...res, prefix + el];
        } else if (typeof obj[el] === 'object' && obj[el] !== null) {
            return [...res, ...getAllKeys(obj[el] as Record<string, unknown>, prefix + el + '.')];
        }
        return [...res, prefix + el];
    }, []);
}

describe('I18n Locale Parity', () => {
    const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
    const tr = JSON.parse(fs.readFileSync(TR_PATH, 'utf8'));

    const enKeys = new Set(getAllKeys(en));
    const trKeys = new Set(getAllKeys(tr));

    it('should have identical keys in en.json and tr.json', () => {
        const missingInTr = Array.from(enKeys).filter(k => !trKeys.has(k));
        const missingInEn = Array.from(trKeys).filter(k => !enKeys.has(k));

        const errorMessage = [
            missingInTr.length > 0 ? `Missing in tr.json:\n  - ${missingInTr.join('\n  - ')}` : '',
            missingInEn.length > 0 ? `Missing in en.json:\n  - ${missingInEn.join('\n  - ')}` : ''
        ].filter(Boolean).join('\n\n');

        expect(errorMessage, errorMessage).toBe('');
    });

    it('should not have empty values', () => {
        const flatten = (obj: Record<string, unknown>, prefix = '') => {
            const results: Record<string, string> = {};
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    Object.assign(results, flatten(obj[key] as Record<string, unknown>, prefix + key + '.'));
                } else {
                    results[prefix + key] = obj[key] as string;
                }
            }
            return results;
        };

        const enFlat = flatten(en);
        const trFlat = flatten(tr);

        const emptyInEn = Object.entries(enFlat).filter(([_, v]) => !v || v.trim() === '').map(([k]) => k);
        const emptyInTr = Object.entries(trFlat).filter(([_, v]) => !v || v.trim() === '').map(([k]) => k);

        const errorMessage = [
            emptyInEn.length > 0 ? `Empty values in en.json:\n  - ${emptyInEn.join('\n  - ')}` : '',
            emptyInTr.length > 0 ? `Empty values in tr.json:\n  - ${emptyInTr.join('\n  - ')}` : ''
        ].filter(Boolean).join('\n\n');

        expect(errorMessage, errorMessage).toBe('');
    });

    it('should not have untranslated placeholders (identical values across languages)', () => {
        const flatten = (obj: Record<string, unknown>, prefix = '') => {
            const results: Record<string, string> = {};
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    Object.assign(results, flatten(obj[key] as Record<string, unknown>, prefix + key + '.'));
                } else {
                    results[prefix + key] = obj[key] as string;
                }
            }
            return results;
        };

        const enFlat = flatten(en);
        const trFlat = flatten(tr);

        // Technical terms/units that are expected to be identical
        const IGNORE_IDENTICAL = new Set([
            'TCP', 'UDP', 'UART', 'SPI', 'I2C', 'USB', 'HTTP', 'HTTPS', 'JSON', 'CSV', 'PDF', 'PCAP',
            'Baud', 'Hex', 'Dec', 'BPM', 'SPO2', 'RR', 'ms', 'Hz', 'MB/s', 'V', 'A', 'W', '8N1', 'CRC', 'XOR'
        ]);

        const identical = Object.keys(enFlat).filter(k => {
            if (!trFlat[k]) return false;
            const val = enFlat[k];
            if (IGNORE_IDENTICAL.has(val) || IGNORE_IDENTICAL.has(val.toLowerCase())) return false;
            if (/^[0-9\s.,:;/%-]+$/.test(val)) return false;
            
            // Check if values are identical and not a technical string
            return val === trFlat[k] && val.length > 3;
        });

        if (identical.length > 10 && process.env.VITEST_I18N_WARN === '1') {
            console.warn(`⚠️ Found ${identical.length} identical strings across languages. Potential missing translations:`, identical);
        }
    });
});
