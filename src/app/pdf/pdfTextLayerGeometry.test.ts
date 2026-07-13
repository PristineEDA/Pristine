import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildPdfTextRuns,
  resetPdfTextLayerMeasurementCacheForTests,
  type PdfTextContentLike,
} from './pdfTextLayerGeometry';

const viewport = {
  height: 800,
  scale: 1,
  transform: [1, 0, 0, -1, 0, 800],
  width: 600,
};

describe('pdfTextLayerGeometry', () => {
  beforeEach(() => {
    resetPdfTextLayerMeasurementCacheForTests();
  });

  it('uses font metrics and measured width to align a horizontal text run', () => {
    const runs = buildPdfTextRuns({
      items: [{
        dir: 'ltr',
        fontName: 'body-font',
        hasEOL: false,
        height: 12,
        str: 'Selectable text',
        transform: [12, 0, 0, 12, 24, 760],
        width: 120,
      }],
      lang: 'en',
      styles: {
        'body-font': {
          ascent: 0.8,
          descent: -0.2,
          fontFamily: 'serif',
        },
      },
    }, viewport);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      angle: 0,
      dir: 'ltr',
      fontFamily: 'serif',
      fontHeight: 12,
      left: 24,
      top: 31,
    });
    expect(runs[0]!.bounds).toEqual({
      height: 12,
      left: 24,
      top: 31,
      width: 120,
    });
    expect(runs[0]!.scaleX).toBeCloseTo(120 / ('Selectable text'.length * 6));
  });

  it('preserves empty EOL items and split-run DOM order metadata', () => {
    const textContent: PdfTextContentLike = {
      items: [
        {
          dir: 'ltr',
          fontName: 'body-font',
          hasEOL: false,
          str: 'First line',
          transform: [10, 0, 0, 10, 20, 760],
          width: 50,
        },
        {
          dir: 'ltr',
          fontName: 'body-font',
          hasEOL: true,
          str: '',
          transform: [10, 0, 0, 10, 20, 740],
          width: 0,
        },
        {
          dir: 'ltr',
          fontName: 'body-font',
          hasEOL: false,
          str: 'Split ',
          transform: [10, 0, 0, 10, 20, 740],
          width: 30,
        },
        {
          dir: 'rtl',
          fontName: 'body-font',
          hasEOL: true,
          str: 'run',
          transform: [10, 0, 0, 10, 50, 740],
          width: 18,
        },
      ],
      styles: {
        'body-font': { fontFamily: 'sans-serif' },
      },
    };

    const runs = buildPdfTextRuns(textContent, viewport);

    expect(runs.map(({ itemIndex, text, hasEOL, dir }) => ({ itemIndex, text, hasEOL, dir }))).toEqual([
      { itemIndex: 0, text: 'First line', hasEOL: false, dir: 'ltr' },
      { itemIndex: 1, text: '', hasEOL: true, dir: 'ltr' },
      { itemIndex: 2, text: 'Split ', hasEOL: false, dir: 'ltr' },
      { itemIndex: 3, text: 'run', hasEOL: true, dir: 'rtl' },
    ]);
  });

  it('computes axis-aligned fallback bounds for rotated text', () => {
    const [run] = buildPdfTextRuns({
      items: [{
        dir: 'ltr',
        fontName: 'rotated-font',
        str: 'Rotated',
        transform: [0, 12, -12, 0, 40, 700],
        width: 70,
      }],
      styles: {
        'rotated-font': { fontFamily: 'sans-serif' },
      },
    }, viewport);

    expect(run).toBeDefined();
    expect(Math.abs(run!.angle)).toBe(90);
    expect(run!.bounds.height).toBeCloseTo(70);
    expect(run!.bounds.width).toBeCloseTo(12);
  });
});
