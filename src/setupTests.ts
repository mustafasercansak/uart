import '@testing-library/jest-dom';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers as unknown as Parameters<typeof expect.extend>[0]);

// scrollIntoView not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock Web Workers (jsdom doesn't support them)
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(_data: unknown) {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}
vi.stubGlobal('Worker', MockWorker);

// Mock canvas (jsdom doesn't implement canvas 2D context)
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  strokeRect: vi.fn(),
  fillRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  shadowBlur: 0,
  shadowColor: '',
  strokeStyle: '',
  fillStyle: '',
  lineWidth: 1,
  lineJoin: '',
  lineCap: '',
  font: '',
  textAlign: '',
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
