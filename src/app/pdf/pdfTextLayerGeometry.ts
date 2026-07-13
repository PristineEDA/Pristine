type PdfTransform = [number, number, number, number, number, number];

export interface PdfTextStyleLike {
  ascent?: number;
  descent?: number;
  fontFamily?: string;
  vertical?: boolean;
}

export interface PdfTextItemLike {
  dir?: string;
  fontName?: string;
  hasEOL?: boolean;
  height?: number;
  str?: string;
  transform?: number[];
  width?: number;
}

export interface PdfTextContentLike {
  items: Array<PdfTextItemLike | { type?: string }>;
  lang?: string | null;
  styles?: Record<string, PdfTextStyleLike>;
}

export interface PdfTextViewportLike {
  height: number;
  scale: number;
  transform?: number[];
  width: number;
}

export interface PdfTextBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface PdfTextRun {
  angle: number;
  bounds: PdfTextBounds;
  dir: string;
  fontFamily: string;
  fontHeight: number;
  fontName: string;
  hasEOL: boolean;
  itemIndex: number;
  lang: string | null;
  left: number;
  scaleX: number;
  style: PdfTextStyleLike;
  text: string;
  top: number;
}

const DEFAULT_FONT_ASCENT = 0.8;
const FONT_METRICS_SIZE_PX = 30;
const fontAscentCache = new Map<string, number>();
let measurementCanvas: HTMLCanvasElement | null = null;
let measurementContext: CanvasRenderingContext2D | null = null;

function normalizeTransform(value: unknown, fallback: PdfTransform): PdfTransform {
  if (!Array.isArray(value) || value.length < 6) {
    return fallback;
  }

  return value.slice(0, 6).map((entry) => (
    typeof entry === 'number' && Number.isFinite(entry) ? entry : 0
  )) as PdfTransform;
}

function multiplyTransform(first: PdfTransform, second: PdfTransform): PdfTransform {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (measurementContext) {
    return measurementContext;
  }
  if (typeof document === 'undefined') {
    return null;
  }

  measurementCanvas = document.createElement('canvas');
  measurementContext = measurementCanvas.getContext('2d');
  return measurementContext;
}

function getFontAscentRatio(fontFamily: string, style: PdfTextStyleLike, lang: string | null): number {
  const cacheKey = `${lang ?? ''}\u0000${fontFamily}`;
  const cached = fontAscentCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const context = getMeasurementContext();
  let ratio = 0;
  if (context) {
    context.font = `${FONT_METRICS_SIZE_PX}px ${fontFamily}`;
    const metrics = context.measureText('');
    const ascent = Number(metrics.fontBoundingBoxAscent ?? 0);
    const descent = Math.abs(Number(metrics.fontBoundingBoxDescent ?? 0));
    if (ascent > 0 && ascent + descent > 0) {
      ratio = ascent / (ascent + descent);
    }
  }

  if (ratio <= 0 && typeof style.ascent === 'number' && style.ascent > 0) {
    ratio = style.ascent;
  } else if (ratio <= 0 && typeof style.descent === 'number' && style.descent < 0) {
    ratio = 1 + style.descent;
  }

  const normalizedRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_FONT_ASCENT;
  fontAscentCache.set(cacheKey, normalizedRatio);
  return normalizedRatio;
}

function measureTextWidth(text: string, fontFamily: string, fontHeight: number, dir: string): number {
  const context = getMeasurementContext();
  if (!context || !text) {
    return 0;
  }

  context.font = `${fontHeight}px ${fontFamily}`;
  if ('direction' in context && (dir === 'ltr' || dir === 'rtl')) {
    context.direction = dir;
  }
  return context.measureText(text).width;
}

function getRotatedBounds(
  left: number,
  top: number,
  width: number,
  height: number,
  angle: number,
): PdfTextBounds {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const corners: Array<[number, number]> = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
  const points = corners.map(([x, y]) => ({
    x: left + x * cosine - y * sine,
    y: top + x * sine + y * cosine,
  }));
  const leftEdge = Math.min(...points.map((point) => point.x));
  const rightEdge = Math.max(...points.map((point) => point.x));
  const topEdge = Math.min(...points.map((point) => point.y));
  const bottomEdge = Math.max(...points.map((point) => point.y));

  return {
    height: bottomEdge - topEdge,
    left: leftEdge,
    top: topEdge,
    width: rightEdge - leftEdge,
  };
}

function isTextItem(item: PdfTextItemLike | { type?: string }): item is PdfTextItemLike {
  return 'str' in item;
}

export function buildPdfTextRuns(
  textContent: PdfTextContentLike,
  viewport: PdfTextViewportLike,
): PdfTextRun[] {
  const viewportTransform = normalizeTransform(
    viewport.transform,
    [viewport.scale, 0, 0, -viewport.scale, 0, viewport.height],
  );

  return textContent.items.flatMap((item, itemIndex) => {
    if (!isTextItem(item)) {
      return [];
    }

    const text = item.str ?? '';
    const fontName = item.fontName ?? '';
    const style = textContent.styles?.[fontName] ?? {};
    const fontFamily = style.fontFamily?.trim() || 'sans-serif';
    const itemTransform = normalizeTransform(item.transform, [1, 0, 0, 1, 0, 0]);
    const transform = multiplyTransform(viewportTransform, itemTransform);
    const fontHeight = Math.max(0.01, Math.hypot(transform[2], transform[3]));
    let angle = Math.atan2(transform[1], transform[0]);
    if (style.vertical) {
      angle += Math.PI / 2;
    }

    const ascent = fontHeight * getFontAscentRatio(fontFamily, style, textContent.lang ?? null);
    const left = angle === 0
      ? transform[4]
      : transform[4] + ascent * Math.sin(angle);
    const top = angle === 0
      ? transform[5] - ascent
      : transform[5] - ascent * Math.cos(angle);
    const measuredWidth = measureTextWidth(text, fontFamily, fontHeight, item.dir ?? 'ltr');
    const sourceWidth = style.vertical ? item.height : item.width;
    const targetWidth = Math.max(0, Number(sourceWidth ?? 0) * viewport.scale);
    const layoutWidth = targetWidth > 0 ? targetWidth : measuredWidth;
    const scaleX = measuredWidth > 0 && layoutWidth > 0 ? layoutWidth / measuredWidth : 1;

    return [{
      angle: angle * (180 / Math.PI),
      bounds: getRotatedBounds(left, top, layoutWidth, fontHeight, angle),
      dir: item.dir ?? 'ltr',
      fontFamily,
      fontHeight,
      fontName,
      hasEOL: item.hasEOL === true,
      itemIndex,
      lang: textContent.lang ?? null,
      left,
      scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
      style,
      text,
      top,
    }];
  });
}

export function resetPdfTextLayerMeasurementCacheForTests() {
  fontAscentCache.clear();
  measurementCanvas = null;
  measurementContext = null;
}
