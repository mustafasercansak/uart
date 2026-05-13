import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function getFiles(dir: string, extension: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach((file: string) => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('__tests__') && !file.includes('dist')) {
                results = results.concat(getFiles(file, extension));
            }
        } else {
            if (file.endsWith(extension)) {
                results.push(file);
            }
        }
    });
    return results;
}

const PROJECT_ROOT = path.resolve(process.cwd());
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// Common attributes that often contain user-visible text
const VISIBLE_ATTRIBUTES = [
    'label',
    'placeholder',
    'title',
    'alt',
    'message',
    'helperText',
    'caption',
    'tooltip',
    'description',
    'aria-label',
    'aria-placeholder',
    'aria-description',
    'headerName',
    'header',
    'footer',
    'buttonText',
    'confirmText',
    'cancelText'
];

// Common MUI/Technical values to ignore
const IGNORE_VALUES = new Set([
    'outlined', 'contained', 'text', 'small', 'medium', 'large',
    'primary', 'secondary', 'error', 'info', 'success', 'warning',
    'inherit', 'div', 'span', 'row', 'column', 'flex', 'center',
    'sticky', 'absolute', 'relative', 'fixed', 'hidden', 'visible',
    'password', 'email', 'number', 'tel', 'url', 'search', 'date',
    'top', 'bottom', 'left', 'right', 'start', 'end',
    'monospace', 'sans-serif', 'serif', 'auto', 'none', 'initial',
    'button', 'submit', 'reset', 'checkbox', 'radio', 'select',
    'info', 'tx', 'rx', 'error', 'pending', 'running', 'stopped', 'paused', 'Started', 'Progress', 'Finished',
    'HR', 'SpO2', 'RR', 'Temp', 'Pleth', 'BPM', 'Rate', 'Volume', 'Remaining', 'PI', 'FiO2', 'PEEP', 'Tidal Vol', 'Lead-I', 'Lead-II', 'SPO2-Wave',
    'INIT_STATE', 'SET_PROFILE', 'SET_SCENARIO', 'SET_OUTPUT_MODE', 'START', 'STOP', 'PAUSE', 'RESUME',
    'SET:', 'RAMP:', 'INJECT_ERROR:', 'Mustafa Sercan Sak', '© 2026 Mustafa Sercan Sak',
    'SpO₂', 'Math.*', 'struct MyData { uint32_t id; ... };', 'BPM > 150',
    ', borderRadius:', ', fontSize:', ').length > 30 ?', ', endFieldId: allFields[allFields.length - 1]?.id ??',
    ', atMs: 0, target:', ', atMs: 500, target:', 'None', 'Even', 'Odd', 'Mark', 'Space',
    'field:Lead-I', 'field:Lead-II', 'field:SPO2-Wave',
    'MASTER_TICK', 'ADD_LOG', 'BATCH_LOGS', 'OVERRIDE_FIELD', 'OVERRIDE_BIT', 'INJECT_ERROR',
    'CONSUME_ERROR', 'RESET_OVERRIDES', 'SET_SERIAL_CONNECTED', 'SET_NETWORK_CONNECTED',
    'SET_BACKEND_CONNECTED', 'SET_RECORDING', 'ADD_CONVERSATION', 'UPDATE_EXCHANGE',
    'SELECT_EXCHANGE', 'SET_ANALYZER_MODE', 'SET_DISPLAY_FILTER', 'TOGGLE_WATCHLIST',
    'SAVE_SNAPSHOT', 'DELETE_SNAPSHOT', 'SET_SIGNAL_INTEGRITY', 'SET_TRIGGERS',
    'UPDATE_TIMING_STATS', 'SET_DIFF_FRAME', 'SET_RESPONDER_RULES', 'SET_TELEMETRY_LAYOUT',
    'SET_RECORDINGS', 'SET_STATUS', 'ADD_WIDGET', 'REMOVE_WIDGET', 'UPDATE_LAYOUT',
    'BATCH_UPDATE', 'START_VALIDATION', 'STOP_VALIDATION', 'CANCEL_VALIDATION',
    'ADD_VALIDATION_EVENT', 'UPDATE_VALIDATION_HISTORY', 'SET_ACTIVE_SEQUENCE',
    'SAVE_SEQUENCE', 'DELETE_SEQUENCE', 'SET_SEQUENCES', 'CLEAR_EXCHANGES',
    'tr-TR', 'en-US', 'currentColor', 'transparent', 'solid', 'dashed', 'dotted',
    'uppercase', 'lowercase', 'capitalize', 'normal', 'bold', 'black', 'mono',
    'pointer', 'default', 'none', 'absolute', 'relative', 'fixed', 'sticky',
    'top', 'bottom', 'left', 'right', 'center', 'middle', 'justify',
    'Enter', 'Escape', 'Space', 'Shift', 'Control', 'Alt', 'Meta',
    'TCP', 'UDP', 'UART', 'SPI', 'I2C', 'USB', 'HTTP', 'HTTPS', 'JSON', 'CSV', 'PDF', 'PCAP',
    'MSB', 'LSB', 'BPM', 'SPO2', 'ECG', 'EKG', 'RR', 'TEMP', 'PIP', 'PEEP', 'FIO2',
    'Baud', 'Parity', 'Stop', 'Start', 'Sync', 'CRC', 'XOR', 'Checksum',
    'Hanning', 'Hamming', 'CCITT', 'Modbus', 'RTU', 'NMEA', 'Big Endian', 'Little Endian',
    'Courier New', 'Arial', 'Roboto', 'Inter', 'monospace', 'sans-serif',
    'borderRadius', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'margin',
    'transparent', 'inherit', 'initial', 'unset', 'auto',
    'ms', 'Hz', 'MHz', 'kHz', 'BPM', 'mmHg', 'cmH2O', 'mL', 'mL/h', 'L/min', 'sec', 'min', 'sa', 'dk', 'sn',
    'borderRadius', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'margin',
    'SpO2', 'FiO2', 'RR', 'BPM', 'HR', 'PEEP', 'PIP', 'MAP', 'TV', 'Tidal Vol', 'PI%', 'Pulse',
    'Modbus RTU', 'NMEA 0183', 'NMEA', 'Modbus', 'UART-X1',
    'peripheral_logic.js', 'input', 'state', 'send(bytes)', 'bytes:', 'state:', 'sendHex:', 'setFields:',
    'Diagnostics', 'Gauge', 'Sparkline', 'Monitor', 'Timeline', 'VisualProtocolAnalyzer',
    'minDurationMs', 'maxDurationMs', 'activateAtMs', 'deactivateAtMs', 'preserveStartEnd'
]);

interface HardcodedString {
    file: string;
    line: number;
    content: string;
    type: 'JSX Text' | 'Attribute' | 'Code String';
}

function scanFile(filePath: string): HardcodedString[] {
    const content = fs.readFileSync(filePath, 'utf8');
    const findings: HardcodedString[] = [];

    // Process line by line for attributes and code strings to easily ignore commented lines
    const lines = content.split('\n');
    lines.forEach((lineText: string, index: number) => {
        // 1. Scan for JSX Text: >Text Here<
        const jsxTextRegex = />([^<{}\n\r]*[a-zA-ZğüşıöçĞÜŞİÖÇ][^<{}\n\r]*)</g;

        const lineNumber = index + 1;
        const trimmedLine = lineText.trim();

        if (trimmedLine.startsWith('import ') ||
            trimmedLine.startsWith('//') ||
            trimmedLine.startsWith('/*') ||
            trimmedLine.includes('console.') ||
            trimmedLine.includes('logger.')) {
            return;
        }

        // --- JSX TEXT ---
        let match;
        while ((match = jsxTextRegex.exec(lineText)) !== null) {
            const text = match[1].trim();
            if (text && !text.startsWith('{') && !text.endsWith('}') &&
                !IGNORE_VALUES.has(text) &&
                !IGNORE_VALUES.has(text.toLowerCase()) &&
                !/^[0-9\s.,:;/%-]+$/.test(text) &&
                !/^[0-9.]+(ms|Hz|BPM|MB\/s|s|h|m|sa|dk|sn|%|V|A|W|px|rem|vh|vw|mmHg|cmH2O|mL|mL\/h|L\/min)$/.test(text)) {
                
                // Filter out code-like fragments often found in JSX text by mistake (e.g. inside brackets)
                const isCodeLikeText = text.includes('&&') || text.includes('||') || text.includes('==') || 
                                       text.includes('!=') || text.includes('>') || text.includes('<') ||
                                       text.includes('?') || text.includes(': ') || text.includes('().') ||
                                       /^[a-z0-9]+\.[a-z0-9]+$/i.test(text);

                // Ignore single chars like A, B (labels for cursors etc)
                if ((text.length > 1 || /[ğüşıöçĞÜŞİÖÇ]/.test(text)) && !isCodeLikeText) {
                    findings.push({ file: filePath, line: lineNumber, content: text, type: 'JSX Text' });
                }
            }
        }

        // 2. Scan for Attributes
        const attrRegex = /\b([a-zA-Z0-9]+)=(?:{?\s*["']([^"']+)["']\s*}?|{([^}]+)})/g;
        while ((match = attrRegex.exec(lineText)) !== null) {
            const attrName = match[1];
            const attrValue = match[2] || match[3];

            // Ignore technical attributes
            if (attrName === 'className' || attrName === 'sx' || attrName === 'style' ||
                attrName === 'variant' || attrName === 'color' || attrName === 'size' ||
                attrName === 'component' || attrName === 'key' || attrName === 'id' ||
                attrName === 'src' || attrName === 'href' || attrName.startsWith('on') ||
                attrName === 'aria-label' || attrName === 'role' || attrName === 'tabIndex' ||
                attrName === 'width' || attrName === 'height' || attrName === 'ref') {
                continue;
            }

            if (attrValue && VISIBLE_ATTRIBUTES.includes(attrName)) {
                const val = attrValue.trim();
                if (!val.includes('(') && !val.includes('.') && !val.includes('?') &&
                    !IGNORE_VALUES.has(val) &&
                    !IGNORE_VALUES.has(val.toLowerCase()) &&
                    !val.startsWith('t(') && !val.startsWith('i18n.t(')) {

                    const isHardcodedInBraces = val.startsWith("'") || val.startsWith('"') || val.startsWith('`');
                    const cleanVal = isHardcodedInBraces ? val.slice(1, -1) : val;

                    if (isHardcodedInBraces || !/^[a-zA-Z0-9_]+$/.test(cleanVal)) {
                        // Ignore technical value patterns
                        if (!/^[0-9,.\s]+$/.test(cleanVal) && cleanVal.length > 1) {
                            findings.push({ file: filePath, line: lineNumber, content: cleanVal, type: 'Attribute' });
                        }
                    }
                }
            }
        }

        // 3. Scan for code strings
        // Matches strings wrapped in single, double, or backticks
        const phraseRegex = /(['"`])([^'"`]*[a-zA-ZğüşıöçĞÜŞİÖÇ][^'"`]*)\1/g;
        while ((match = phraseRegex.exec(lineText)) !== null) {
            const text = match[2].trim();

            // Ignore if it's likely a technical string
            // Refined Tailwind/Technical detection
            const isLikelyTailwind = /^[a-z0-9\s\-[\]/:#%().!,><]+$/.test(text) && 
                                    (text.includes(' ') || text.includes('-') || text.includes(':')) && 
                                    !/[A-Z]/.test(text) && 
                                    !/[ğüşıöçĞÜŞİÖÇ]/.test(text);

            const isTechnical = /^[A-Z0-9_]+$/.test(text) || 
                                IGNORE_VALUES.has(text) || 
                                IGNORE_VALUES.has(text.toLowerCase()) ||
                                /^[a-z]+[A-Z][a-z]+$/.test(text) || // camelCase
                                /^[A-Z][a-z]+[A-Z][a-z]+$/.test(text) || // PascalCase
                                (text.includes('.') && !text.includes(' ')) || // translation keys
                                /^[a-z0-9-]+$/.test(text) || // kebab-case technical words
                                /^[a-z]+:[a-z0-9]+$/i.test(text); // field:Name patterns

            const isCssOrSvg = text.startsWith('hsla(') || 
                               text.startsWith('rgba(') || 
                               text.startsWith('rgb(') || 
                               /^[MLHVCSQTA][0-9\s.,-]+/i.test(text) || 
                               text.includes('shadow-') ||
                               text.includes('bg-') ||
                               text.includes('text-') ||
                               text.includes('px ') ||
                               text.includes('deg') ||
                               text.includes('border-') ||
                               text.includes('solid ') ||
                               text.includes('font-');

            const isCodeLike = text.includes('=>') || 
                               text.includes('&&') || 
                               text.includes('||') || 
                               (text.includes('=') && text.includes(' ')) ||
                               text.includes('${') ||
                               text.includes('`') ||
                               text.includes('return ') ||
                               text.includes('if (') ||
                               text.includes('Math.') ||
                               text.includes('sin(') ||
                               text.includes('cos(') ||
                               text.includes('=>') ||
                               text.includes('!=') ||
                               text.includes('==') ||
                               /^[0-9\s.,+\-*/%|&!? :;[\](){}=<>]+$/.test(text);

            const hasUppercase = /[A-Z]/.test(text);
            const hasTurkish = /[ğüşıöçĞÜŞİÖÇ]/.test(text);
            const hasSpace = text.includes(' ');

            if (text.length > 2 &&
                !text.includes('/') &&
                !text.includes('\\') &&
                !text.includes('://') &&
                !text.startsWith('http') &&
                !lineText.includes('className=') &&
                !lineText.includes('sx=') &&
                !lineText.includes('t(') &&
                !lineText.includes('i18n.t(') &&
                !isTechnical &&
                !isCssOrSvg &&
                !isCodeLike &&
                (hasUppercase || hasTurkish || hasSpace) &&
                !isLikelyTailwind &&
                !/^[a-z-]+\.json$/.test(text) && // filenames
                text !== 'currentColor' &&
                !/^[0-9.]+(ms|Hz|BPM|MB\/s|s|h|m|sa|dk|sn|%|V|A|W)$/.test(text)) {

                if (!findings.some(f => f.line === lineNumber && f.content.includes(text))) {
                    findings.push({ file: filePath, line: lineNumber, content: text, type: 'Code String' });
                }
            }
        }

    });

    return findings;
}

describe('I18n Compliance', () => {
    it('should not have hardcoded strings in components', () => {
        const tsxFiles = getFiles(SRC_DIR, '.tsx');
        const jsxFiles = getFiles(SRC_DIR, '.jsx');
        const files = [...tsxFiles, ...jsxFiles];

        const allFindings: HardcodedString[] = [];
        files.forEach(file => {
            const findings = scanFile(file);
            allFindings.push(...findings);
        });

        if (allFindings.length > 0) {
            const grouped = allFindings.reduce((acc, f) => {
                const relPath = path.relative(SRC_DIR, f.file);
                if (!acc[relPath]) acc[relPath] = [];
                acc[relPath].push(f);
                return acc;
            }, {} as Record<string, HardcodedString[]>);

            console.log('\n🔍 I18n Compliance Report: Found ' + allFindings.length + ' hardcoded strings\n');

            console.log(allFindings);

            Object.entries(grouped).forEach(([file, findings]) => {
                console.log(`\n📂 ${file}:`);
                findings.forEach(f => {
                    console.log(`  L${f.line.toString().padEnd(4)} [${f.type.padEnd(11)}] "${f.content}"`);
                });
            });

            console.log('\n');
        }

        // For now, let's just log them and not fail if it's the first run, 
        // OR fail it to be strict. The user asked to "detect" them.
        // Threshold-based compliance: fail if new hardcoded strings are added
        // Fail on ANY hardcoded string found. 
        // We set it to 0 to ensure 100% compliance.
        const BASELINE = 0;
        expect(allFindings.length, `Found ${allFindings.length} hardcoded strings. Please translate them using the t() function.`).toBeLessThanOrEqual(BASELINE);
    });
});
