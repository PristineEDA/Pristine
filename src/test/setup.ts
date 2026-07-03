import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { createElectronApiMock } from './electronApiMock';

// ─── Mock HTMLCanvasElement.getContext for Konva in jsdom ──────────────────────
// jsdom does not implement getContext, so Konva crashes when trying to access
// context methods like .scale(), .save(), etc. Provide a minimal stub.
const noop = () => {};
function createContext2dMock(): Record<string, unknown> {
  return {
    getImageData: (_sx: number, _sy: number, sw: number, sh: number) => ({
      data: new Uint8ClampedArray(sw * sh * 4),
      width: sw,
      height: sh,
    }),
    putImageData: noop,
    createImageData: () => [],
    setTransform: noop,
    resetTransform: noop,
    drawImage: noop,
    save: noop,
    fillRect: noop,
    clearRect: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    stroke: noop,
    fill: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    clip: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    isPointInPath: () => false,
    isPointInStroke: () => false,
    measureText: (text: string) => ({
      width: text.length * 6,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 6,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 4,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 4,
    }),
    transform: noop,
    fillText: noop,
    strokeText: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    setLineDash: noop,
    getLineDash: () => [],
    canvas: { width: 300, height: 150 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000',
    fillStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    shadowBlur: 0,
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
}

const originalGetContext =
  typeof HTMLCanvasElement !== 'undefined'
    ? HTMLCanvasElement.prototype.getContext
    : null;
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    ...rest: unknown[]
  ) {
    if (contextId === '2d') {
      const ctx = createContext2dMock();
      ctx.canvas = this;
      return ctx as unknown as ReturnType<typeof HTMLCanvasElement.prototype.getContext>;
    }

    if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
      return null;
    }

    return Reflect.apply(originalGetContext!, this, [contextId, ...rest]) as ReturnType<typeof HTMLCanvasElement.prototype.getContext>;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

beforeEach(() => {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      })),
    });
  }

  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }

  if (!Element.prototype.hasPointerCapture) {
    Object.defineProperty(Element.prototype, 'hasPointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(() => false),
    });
  }

  if (!Element.prototype.setPointerCapture) {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }

  if (!Element.prototype.releasePointerCapture) {
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }

  if (typeof ResizeObserver === 'undefined') {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });
  }

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: createElectronApiMock(),
  });
});

afterEach(() => {
  if (typeof window !== 'undefined') {
    cleanup();
  }
});
