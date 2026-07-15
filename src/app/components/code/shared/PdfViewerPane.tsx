import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
  type UIEvent,
  type WheelEvent,
} from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Contrast,
  Hand,
  Highlighter,
  Info,
  Maximize2,
  MessageSquarePlus,
  MoveHorizontal,
  MousePointer2,
  NotebookPen,
  PanelLeft,
  PanelRight,
  PanelTop,
  Rows3,
  Columns3,
  Presentation,
  RotateCcw,
  RotateCw,
  ScanText,
  Search,
  Send,
  Strikethrough,
  Trash2,
  Underline,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import {
  PDF_VIEWER_DEFAULT_ZOOM,
  PDF_VIEWER_MAX_ZOOM,
  PDF_VIEWER_MIN_ZOOM,
  PDF_VIEWER_ZOOM_STEP,
  type PdfHighlightAnnotation,
  type PdfHighlightColor,
  type PdfHighlightKind,
  type PdfHighlightRect,
  type PdfViewerFitMode,
  type PdfViewerPageToneMode,
  type PdfViewerPresentationRestoreState,
  type PdfViewerRotation,
  type PdfViewerScrollMode,
  type PdfViewerToolMode,
  usePdfViewerStore,
} from '../../../pdf/usePdfViewerStore';
import {
  buildPdfTextRuns,
  type PdfTextContentLike,
  type PdfTextRun,
} from '../../../pdf/pdfTextLayerGeometry';
import { isAbsoluteFilePath } from '../../../workspace/workspaceFiles';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Textarea } from '../../ui/textarea';
import { TooltipIconButton } from '../../ui/tooltip-icon-button';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDFJS_ASSET_BASE_URL = './generated/pdfjs/';
const PDF_VIEWER_DEFAULT_PAGE_SIZE = { width: 600, height: 800 };
const PDF_VIEWER_PAGE_GAP_PX = 24;
const PDF_VIEWER_RENDER_OVERSCAN = 2;
const PDF_VIEWER_VIEWPORT_PADDING_X = 48;
const PDF_VIEWER_VIEWPORT_PADDING_Y = 48;
const PDF_VIEWER_THUMBNAIL_WIDTH_PX = 78;
const PDF_VIEWER_THUMBNAIL_PREFETCH_MARGIN_PX = 320;
const PDF_VIEWER_THUMBNAIL_MAX_CONCURRENT_RENDERS = 2;
const PDF_VIEWER_THUMBNAIL_CACHE_MAX_ENTRIES = 64;
const PDF_VIEWER_THUMBNAIL_CACHE_MAX_BYTES = 16 * 1024 * 1024;
const PDF_VIEWER_SOFT_PAGE_FILTER = 'brightness(0.9) contrast(0.96)';
const PDF_VIEWER_AUTO_PAGE_FILTER_CLASS = 'dark:[filter:brightness(0.9)_contrast(0.96)]';
const PDF_SELECTION_TOOLBAR_HEIGHT_PX = 38;
const PDF_SELECTION_TOOLBAR_GAP_PX = 7;
const PDF_PRESENTATION_WHEEL_THRESHOLD_PX = 80;
const PDF_PRESENTATION_WHEEL_COOLDOWN_MS = 500;
const PDF_PAGE_SCROLL_WHEEL_THRESHOLD_PX = 80;
const PDF_PAGE_SCROLL_WHEEL_COOLDOWN_MS = 250;

const PDF_VIEWER_PAGE_TONE_OPTIONS: Array<{ value: PdfViewerPageToneMode; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'original', label: 'Original' },
  { value: 'soft', label: 'Soft page' },
];

const PDF_HIGHLIGHT_COLOR_OPTIONS: Array<{
  value: PdfHighlightColor;
  label: string;
  swatch: string;
  background: string;
}> = [
  { value: 'yellow', label: 'Yellow', swatch: '#fde047', background: 'rgba(250, 204, 21, 0.38)' },
  { value: 'green', label: 'Green', swatch: '#34d399', background: 'rgba(52, 211, 153, 0.38)' },
  { value: 'cyan', label: 'Cyan', swatch: '#67e8f9', background: 'rgba(103, 232, 249, 0.38)' },
  { value: 'pink', label: 'Pink', swatch: '#f9a8d4', background: 'rgba(249, 168, 212, 0.38)' },
  { value: 'red', label: 'Red', swatch: '#fb7185', background: 'rgba(251, 113, 133, 0.38)' },
];

interface PdfViewerPaneProps {
  fileId: string;
  fileName: string;
  showDragInteractionShield?: boolean;
  dragInteractionShieldTestId?: string;
}

interface PdfPageSize {
  width: number;
  height: number;
}

interface PdfSearchMatch {
  pageNumber: number;
  itemIndex: number;
  globalIndex: number;
}

interface PdfLinkOverlay {
  id: string;
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PdfBookmark {
  id: string;
  title: string;
  dest: unknown;
  url: string | null;
  children: PdfBookmark[];
}

interface PdfClientRectBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface PdfSelectionPageMatch {
  pageNumber: number;
  rects: PdfHighlightRect[];
}

interface PdfSelectionInfo {
  selection: Selection;
  quote: string;
  bounds: PdfClientRectBounds;
  pageMatches: PdfSelectionPageMatch[];
}

interface PdfSelectionToolbarState {
  left: number;
  top: number;
}

interface PdfDocumentInfo {
  fileName: string;
  fileSize: string;
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creationDate: string;
  modificationDate: string;
  creator: string;
  producer: string;
  pdfVersion: string;
  pageCount: string;
  pageSize: string;
  fastWebView: string;
}

type PdfMetadataObject = {
  get?: (key: string) => unknown;
};

type PdfInfoDictionary = Record<string, unknown>;

interface PdfPageCanvasProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  zoom: number;
  rotation: PdfViewerRotation;
  shouldRender: boolean;
  pageSize: PdfPageSize;
  pageToneMode: PdfViewerPageToneMode;
  onPageSizeChange: (pageNumber: number, size: PdfPageSize) => void;
  onRenderError: (message: string | null) => void;
}

interface PdfPageTextLayerProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  zoom: number;
  rotation: PdfViewerRotation;
  shouldRender: boolean;
  pageSize: PdfPageSize;
  toolMode: PdfViewerToolMode;
  searchMatches: PdfSearchMatch[];
  activeSearchMatchIndex: number;
  onTextItemsChange: (pageNumber: number, items: PdfTextRun[]) => void;
}

interface PdfPageLinkLayerProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  zoom: number;
  rotation: PdfViewerRotation;
  shouldRender: boolean;
  pageSize: PdfPageSize;
  textItems: PdfTextRun[];
  onOpenLink: (url: string) => void;
}

interface PdfPageHighlightLayerProps {
  pageNumber: number;
  pageSize: PdfPageSize;
  zoom: number;
  annotations: PdfHighlightAnnotation[];
  selectedHighlightId: string | null;
}

interface PdfHighlightInteractionOverlayProps {
  annotation: PdfHighlightAnnotation;
  mode: 'controls' | 'comments';
  zoom: number;
  onClose: () => void;
  onColorChange: (color: PdfHighlightColor) => void;
  onDelete: () => void;
  onSubmitComment: (body: string) => boolean;
}

interface PdfThumbnailCanvasProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  rotation: PdfViewerRotation;
  isActive: boolean;
  shouldRender: boolean;
  pageToneMode: PdfViewerPageToneMode;
  onClick: () => void;
  onRenderStart: (pageNumber: number) => void;
  onRenderComplete: (pageNumber: number, byteSize: number) => void;
  onRenderCancelled: (pageNumber: number) => void;
}

interface PdfThumbnailCacheEntry {
  byteSize: number;
  lastUsed: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to open PDF';
}

function getPdfBytesReader(fileId: string): ((path: string) => Promise<Uint8Array>) | null {
  const fsApi = window.electronAPI?.fs;
  if (!fsApi) {
    return null;
  }

  return isAbsoluteFilePath(fileId) ? fsApi.readFileBinaryAbsolute : fsApi.readFileBinary;
}

function normalizePdfBytes(bytes: Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function cleanupPdfDocument(document: PDFDocumentProxy | null): void {
  const cleanup = document?.cleanup;
  if (typeof cleanup === 'function') {
    void cleanup.call(document);
  }
}

function clampZoom(zoom: number): number {
  return Math.round(Math.min(Math.max(zoom, PDF_VIEWER_MIN_ZOOM), PDF_VIEWER_MAX_ZOOM) * 100) / 100;
}

function getPageToneLabel(mode: PdfViewerPageToneMode): string {
  return PDF_VIEWER_PAGE_TONE_OPTIONS.find((option) => option.value === mode)?.label ?? 'Auto';
}

function getPageToneCanvasClassName(mode: PdfViewerPageToneMode): string {
  return mode === 'auto' ? PDF_VIEWER_AUTO_PAGE_FILTER_CLASS : '';
}

function getPageToneCanvasStyle(mode: PdfViewerPageToneMode): CSSProperties {
  return mode === 'soft' ? { filter: PDF_VIEWER_SOFT_PAGE_FILTER } : {};
}

function normalizePdfInfoText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(normalizePdfInfoText).filter(Boolean).join('\n');
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function formatPdfInfoValue(value: unknown): string {
  return normalizePdfInfoText(value) || '-';
}

function getPdfMetadataValue(metadata: unknown, key: string): string {
  const getter = (metadata as PdfMetadataObject | null)?.get;
  if (typeof getter !== 'function') {
    return '';
  }

  try {
    return normalizePdfInfoText(getter.call(metadata, key));
  } catch {
    return '';
  }
}

function getPdfInfoValue(info: PdfInfoDictionary, key: string): string {
  return normalizePdfInfoText(info[key]);
}

function formatPdfFileSize(byteLength: number | null): string {
  if (!Number.isFinite(byteLength) || byteLength === null || byteLength < 0) {
    return '-';
  }

  const bytes = Math.floor(byteLength);
  const formattedBytes = new Intl.NumberFormat('en-US').format(bytes);
  if (bytes < 1024) {
    return `${formattedBytes} bytes`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${Math.round(kilobytes).toLocaleString('en-US')} KB (${formattedBytes} bytes)`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(1)} MB (${formattedBytes} bytes)`;
}

function parsePdfDateString(value: unknown): Date | null {
  const text = normalizePdfInfoText(value);
  if (!text) {
    return null;
  }

  const parsedMetadataDate = Date.parse(text);
  if (Number.isFinite(parsedMetadataDate)) {
    return new Date(parsedMetadataDate);
  }

  const match = /^D:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz]|[+-])?(\d{2})?'?(\d{2})?'?/.exec(text);
  if (!match) {
    return null;
  }

  const [, yearText, monthText = '01', dayText = '01', hourText = '00', minuteText = '00', secondText = '00', zone, zoneHourText = '00', zoneMinuteText = '00'] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if ([year, month, day, hour, minute, second].some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (!zone) {
    return new Date(year, month, day, hour, minute, second);
  }

  const zoneHour = Number(zoneHourText);
  const zoneMinute = Number(zoneMinuteText);
  if (!Number.isFinite(zoneHour) || !Number.isFinite(zoneMinute)) {
    return null;
  }

  const offsetMinutes = zone === '-' ? -(zoneHour * 60 + zoneMinute) : zoneHour * 60 + zoneMinute;
  const utcTime = Date.UTC(year, month, day, hour, minute, second) - offsetMinutes * 60_000;
  return new Date(utcTime);
}

function formatPdfDate(metadataValue: unknown, infoValue: unknown): string {
  const date = parsePdfDateString(metadataValue) ?? parsePdfDateString(infoValue);
  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function detectPdfPageName(widthInches: number, heightInches: number): string | null {
  const shortSide = Math.min(widthInches, heightInches);
  const longSide = Math.max(widthInches, heightInches);
  const candidates = [
    { name: 'A4', width: 8.27, height: 11.69 },
    { name: 'Letter', width: 8.5, height: 11 },
    { name: 'Legal', width: 8.5, height: 14 },
  ];

  for (const candidate of candidates) {
    if (Math.abs(shortSide - candidate.width) <= 0.08 && Math.abs(longSide - candidate.height) <= 0.08) {
      return candidate.name;
    }
  }

  return null;
}

function formatPdfPageSizeFromViewport(viewport: { width: number; height: number } | null): string {
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    return '-';
  }

  const widthInches = viewport.width / 72;
  const heightInches = viewport.height / 72;
  const orientation = widthInches > heightInches ? 'landscape' : 'portrait';
  const pageName = detectPdfPageName(widthInches, heightInches);
  const dimensions = `${widthInches.toFixed(2)} \u00d7 ${heightInches.toFixed(2)} in`;
  return pageName ? `${dimensions} (${pageName}, ${orientation})` : `${dimensions} (${orientation})`;
}

async function createPdfDocumentInfo(
  document: PDFDocumentProxy,
  fileName: string,
  fileSizeBytes: number | null,
): Promise<PdfDocumentInfo> {
  const metadataResult = await document.getMetadata().catch(() => ({ info: {}, metadata: null }));
  const info = (metadataResult.info ?? {}) as PdfInfoDictionary;
  const metadata = metadataResult.metadata;
  const firstPage = await document.getPage(1).catch(() => null);
  const pageViewport = firstPage?.getViewport({ scale: 1 }) ?? null;

  return {
    fileName: formatPdfInfoValue(fileName),
    fileSize: formatPdfFileSize(fileSizeBytes),
    title: formatPdfInfoValue(getPdfMetadataValue(metadata, 'dc:title') || getPdfInfoValue(info, 'Title')),
    author: formatPdfInfoValue(getPdfMetadataValue(metadata, 'dc:creator') || getPdfInfoValue(info, 'Author')),
    subject: formatPdfInfoValue(getPdfMetadataValue(metadata, 'dc:subject') || getPdfInfoValue(info, 'Subject')),
    keywords: formatPdfInfoValue(getPdfMetadataValue(metadata, 'pdf:keywords') || getPdfInfoValue(info, 'Keywords')),
    creationDate: formatPdfDate(getPdfMetadataValue(metadata, 'xmp:createdate'), info.CreationDate),
    modificationDate: formatPdfDate(getPdfMetadataValue(metadata, 'xmp:modifydate'), info.ModDate),
    creator: formatPdfInfoValue(getPdfMetadataValue(metadata, 'xmp:creatortool') || getPdfInfoValue(info, 'Creator')),
    producer: formatPdfInfoValue(getPdfMetadataValue(metadata, 'pdf:producer') || getPdfInfoValue(info, 'Producer')),
    pdfVersion: formatPdfInfoValue(getPdfInfoValue(info, 'PDFFormatVersion')),
    pageCount: String(document.numPages),
    pageSize: formatPdfPageSizeFromViewport(pageViewport),
    fastWebView: info.IsLinearized === true ? 'Yes' : 'No',
  };
}

function getPageSize(pageSizes: Record<number, PdfPageSize>, pageNumber: number, zoom: number): PdfPageSize {
  const baseSize = pageSizes[pageNumber] ?? PDF_VIEWER_DEFAULT_PAGE_SIZE;
  return {
    width: Math.max(1, baseSize.width * zoom),
    height: Math.max(1, baseSize.height * zoom),
  };
}

function getPageOffsetTop(pageSizes: Record<number, PdfPageSize>, pageNumber: number, zoom: number): number {
  let offsetTop = 0;
  for (let currentPage = 1; currentPage < pageNumber; currentPage += 1) {
    offsetTop += getPageSize(pageSizes, currentPage, zoom).height + PDF_VIEWER_PAGE_GAP_PX;
  }
  return offsetTop;
}

function getViewportPageNumber(
  viewport: HTMLElement,
  pageCount: number,
  pageSizes: Record<number, PdfPageSize>,
  zoom: number,
  scrollMode: PdfViewerScrollMode,
  currentPageNumber: number,
): number {
  if (pageCount <= 0) {
    return 1;
  }

  if (scrollMode === 'page') {
    return currentPageNumber;
  }

  const viewportCenterX = viewport.scrollLeft + viewport.clientWidth / 2;
  const viewportCenterY = viewport.scrollTop + viewport.clientHeight / 2;
  let closestPage = 1;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const pageElement = viewport.querySelector<HTMLElement>(`[data-pdf-page-number="${pageNumber}"]`);
    const pageTop = pageElement && (
      scrollMode === 'horizontal'
      || scrollMode === 'wrapped'
      || pageNumber === 1
      || pageElement.offsetTop > 0
    )
      ? pageElement.offsetTop
      : getPageOffsetTop(pageSizes, pageNumber, zoom);
    const pageHeight = pageElement?.offsetHeight || getPageSize(pageSizes, pageNumber, zoom).height;
    const pageLeft = pageElement?.offsetLeft ?? 0;
    const pageWidth = pageElement?.offsetWidth || getPageSize(pageSizes, pageNumber, zoom).width;
    const pageCenterX = pageLeft + pageWidth / 2;
    const pageCenterY = pageTop + pageHeight / 2;
    const distance = scrollMode === 'horizontal'
      ? Math.abs(pageCenterX - viewportCenterX)
      : scrollMode === 'wrapped'
        ? Math.hypot(pageCenterX - viewportCenterX, pageCenterY - viewportCenterY)
        : Math.abs(pageCenterY - viewportCenterY);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestPage = pageNumber;
    }
  }

  return closestPage;
}

function setViewportScroll(viewport: HTMLElement, scrollLeft: number, scrollTop: number): void {
  if (typeof viewport.scrollTo === 'function') {
    viewport.scrollTo({ left: Math.max(0, scrollLeft), top: Math.max(0, scrollTop) });
    return;
  }

  viewport.scrollLeft = Math.max(0, scrollLeft);
  viewport.scrollTop = Math.max(0, scrollTop);
}

function getBoundsFromClientRects(rects: PdfClientRectBounds[]): PdfClientRectBounds | null {
  if (rects.length === 0) {
    return null;
  }

  const bounds = rects.reduce<PdfClientRectBounds>((current, rect) => ({
    left: Math.min(current.left, rect.left),
    right: Math.max(current.right, rect.right),
    top: Math.min(current.top, rect.top),
    bottom: Math.max(current.bottom, rect.bottom),
    width: 0,
    height: 0,
  }), {
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
    width: 0,
    height: 0,
  });

  bounds.width = bounds.right - bounds.left;
  bounds.height = bounds.bottom - bounds.top;
  return bounds.width > 0 && bounds.height > 0 ? bounds : null;
}

function mergePdfSelectionClientRects(rects: DOMRect[]): PdfClientRectBounds[] {
  const sortedRects = rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map<PdfClientRectBounds>((rect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }))
    .sort((left, right) => left.top - right.top || left.left - right.left);

  const mergedRects: PdfClientRectBounds[] = [];
  for (const rect of sortedRects) {
    const previous = mergedRects[mergedRects.length - 1];
    if (!previous) {
      mergedRects.push(rect);
      continue;
    }

    const verticalOverlap = Math.min(previous.bottom, rect.bottom) - Math.max(previous.top, rect.top);
    const minimumHeight = Math.min(previous.height, rect.height);
    const horizontalGap = rect.left - previous.right;
    const isSameVisualLine = verticalOverlap >= minimumHeight * 0.6
      && horizontalGap <= Math.max(2, minimumHeight * 0.4);
    if (!isSameVisualLine) {
      mergedRects.push(rect);
      continue;
    }

    previous.left = Math.min(previous.left, rect.left);
    previous.right = Math.max(previous.right, rect.right);
    previous.top = Math.min(previous.top, rect.top);
    previous.bottom = Math.max(previous.bottom, rect.bottom);
    previous.width = previous.right - previous.left;
    previous.height = previous.bottom - previous.top;
  }

  return mergedRects;
}

function getSelectionContentClientRects(viewport: HTMLElement, range: Range): DOMRect[] {
  const selectionRects = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  const textRunRects = Array.from(
    viewport.querySelectorAll<HTMLElement>('[data-pdf-text-item-index]'),
  )
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (textRunRects.length === 0) {
    return selectionRects;
  }

  return selectionRects.filter((selectionRect) => textRunRects.some((textRect) => (
    Math.min(selectionRect.right, textRect.right) - Math.max(selectionRect.left, textRect.left) > 0
    && Math.min(selectionRect.bottom, textRect.bottom) - Math.max(selectionRect.top, textRect.top) > 0
  )));
}

function getPdfSelectionInfo(
  viewport: HTMLElement | null,
  zoom: number,
  options: { requireSinglePage?: boolean } = {},
): PdfSelectionInfo | null {
  const selection = window.getSelection();
  if (!viewport || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const quote = selection.toString().trim();
  if (!quote) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const clientRects = mergePdfSelectionClientRects(getSelectionContentClientRects(viewport, range));
  const bounds = getBoundsFromClientRects(clientRects);
  if (!bounds) {
    return null;
  }

  const pageMatches: PdfSelectionPageMatch[] = [];
  const pageElements = Array.from(viewport.querySelectorAll<HTMLElement>('[data-pdf-page-content="true"]'));
  for (const pageElement of pageElements) {
    const pageNumberValue = Number(pageElement.dataset['pdfPageNumber']);
    if (!Number.isFinite(pageNumberValue)) {
      continue;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const rects: PdfHighlightRect[] = [];
    for (const rect of clientRects) {
      const left = Math.max(rect.left, pageRect.left);
      const right = Math.min(rect.right, pageRect.right);
      const top = Math.max(rect.top, pageRect.top);
      const bottom = Math.min(rect.bottom, pageRect.bottom);
      if (right <= left || bottom <= top) {
        continue;
      }

      rects.push({
        left: (left - pageRect.left) / zoom,
        top: (top - pageRect.top) / zoom,
        width: (right - left) / zoom,
        height: (bottom - top) / zoom,
      });
    }

    if (rects.length > 0) {
      pageMatches.push({
        pageNumber: pageNumberValue,
        rects,
      });
    }
  }

  if (pageMatches.length === 0 || (options.requireSinglePage && pageMatches.length !== 1)) {
    return null;
  }

  return {
    selection,
    quote,
    bounds,
    pageMatches,
  };
}

function getNormalizedSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function getTextUrl(text: string): string | null {
  const match = text.match(/\bhttps?:\/\/[^\s<>"')]+/i);
  return match?.[0] ?? null;
}

function getAnnotationUrl(annotation: Record<string, unknown>): string | null {
  const url = typeof annotation['url'] === 'string' ? annotation['url'] : annotation['unsafeUrl'];
  return typeof url === 'string' && url.length > 0 ? url : null;
}

function normalizeLinkUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function getViewportRect(rect: unknown, viewport: unknown): PdfHighlightRect | null {
  if (!Array.isArray(rect) || rect.length < 4) {
    return null;
  }

  const convertToViewportRectangle = (viewport as { convertToViewportRectangle?: (rect: number[]) => number[] })
    .convertToViewportRectangle;
  if (typeof convertToViewportRectangle !== 'function') {
    return null;
  }

  const viewportRect = convertToViewportRectangle.call(viewport, rect.slice(0, 4));
  if (!Array.isArray(viewportRect) || viewportRect.length < 4) {
    return null;
  }

  const x1 = viewportRect[0];
  const y1 = viewportRect[1];
  const x2 = viewportRect[2];
  const y2 = viewportRect[3];
  if (
    typeof x1 !== 'number'
    || typeof y1 !== 'number'
    || typeof x2 !== 'number'
    || typeof y2 !== 'number'
  ) {
    return null;
  }

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) {
    return null;
  }

  return { left, top, width, height };
}

function normalizeBookmarks(items: unknown, parentId = 'bookmark'): PdfBookmark[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const id = `${parentId}-${index}`;
    return {
      id,
      title: typeof record['title'] === 'string' && record['title'].trim()
        ? record['title'].trim()
        : 'Untitled',
      dest: record['dest'],
      url: typeof record['url'] === 'string' ? record['url'] : null,
      children: normalizeBookmarks(record['items'], id),
    };
  });
}

function PdfPageCanvas({
  pageNumber,
  pdfDocument,
  zoom,
  rotation,
  shouldRender,
  pageSize,
  pageToneMode,
  onPageSizeChange,
  onRenderError,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!shouldRender) {
      return undefined;
    }

    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      onRenderError('Unable to prepare PDF canvas');
      return undefined;
    }

    onRenderError(null);

    void pdfDocument.getPage(pageNumber)
      .then((page) => {
        if (cancelled) {
          return undefined;
        }

        const outputScale = Math.max(window.devicePixelRatio || 1, 1);
        const viewport = page.getViewport({ scale: zoom, rotation });
        onPageSizeChange(pageNumber, {
          width: viewport.width / zoom,
          height: viewport.height / zoom,
        });
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        return renderTask.promise;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onRenderError(getErrorMessage(error));
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [onPageSizeChange, onRenderError, pageNumber, pdfDocument, rotation, shouldRender, zoom]);

  const pageStyle: CSSProperties = {
    height: pageSize.height,
    width: pageSize.width,
  };

  if (!shouldRender) {
    return (
      <div
        data-testid={`pdf-viewer-page-placeholder-${pageNumber}`}
        className="rounded-sm border border-ide-border bg-ide-tab-bg/70"
        style={pageStyle}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid={`pdf-viewer-page-canvas-${pageNumber}`}
      data-pdf-page-tone-mode={pageToneMode}
      className={[
        'block rounded-sm bg-white shadow-[0_10px_35px_rgba(0,0,0,0.35)]',
        getPageToneCanvasClassName(pageToneMode),
      ].filter(Boolean).join(' ')}
      style={{
        ...pageStyle,
        ...getPageToneCanvasStyle(pageToneMode),
      }}
    />
  );
}

function PdfPageTextLayer({
  pageNumber,
  pdfDocument,
  zoom,
  rotation,
  shouldRender,
  pageSize,
  toolMode,
  searchMatches,
  activeSearchMatchIndex,
  onTextItemsChange,
}: PdfPageTextLayerProps) {
  const [textItems, setTextItems] = useState<PdfTextRun[]>([]);
  const matchByItemIndex = useMemo(() => {
    const nextMatches = new Map<number, PdfSearchMatch>();
    for (const match of searchMatches) {
      nextMatches.set(match.itemIndex, match);
    }
    return nextMatches;
  }, [searchMatches]);

  useEffect(() => {
    if (!shouldRender) {
      setTextItems([]);
      onTextItemsChange(pageNumber, []);
      return undefined;
    }

    let cancelled = false;

    void pdfDocument.getPage(pageNumber)
      .then(async (page) => {
        if (cancelled || typeof page.getTextContent !== 'function') {
          return [];
        }

        const viewport = page.getViewport({ scale: zoom, rotation });
        const textContent = await page.getTextContent();
        return buildPdfTextRuns(textContent as PdfTextContentLike, viewport);
      })
      .then((items) => {
        if (!cancelled) {
          setTextItems(items);
          onTextItemsChange(pageNumber, items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTextItems([]);
          onTextItemsChange(pageNumber, []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onTextItemsChange, pageNumber, pdfDocument, rotation, shouldRender, zoom]);

  if (!shouldRender || textItems.length === 0) {
    return null;
  }

  return (
    <div
      data-testid={`pdf-viewer-text-layer-${pageNumber}`}
      data-pdf-text-layer="true"
      className={[
        'absolute inset-0 z-[2] overflow-hidden',
        toolMode === 'hand' ? 'pointer-events-none select-none' : 'select-text',
      ].join(' ')}
      style={{
        height: pageSize.height,
        width: pageSize.width,
        lineHeight: '1',
        letterSpacing: 'normal',
        textAlign: 'initial',
        textSizeAdjust: 'none',
        WebkitTextSizeAdjust: 'none',
        forcedColorAdjust: 'none',
        wordSpacing: 'normal',
      }}
    >
      {textItems.map((item) => {
        const match = matchByItemIndex.get(item.itemIndex);
        const isActiveMatch = match?.globalIndex === activeSearchMatchIndex;
        return (
          <Fragment key={`${pageNumber}-${item.itemIndex}`}>
            {item.text ? (
              <span
                role="presentation"
                dir={item.dir}
                lang={item.lang ?? undefined}
                data-testid={match ? 'pdf-viewer-search-highlight' : undefined}
                data-pdf-search-match-index={match?.globalIndex}
                data-pdf-text-item-index={item.itemIndex}
                className={[
                  'absolute cursor-text whitespace-pre text-transparent selection:bg-sky-400/35',
                  match ? 'rounded-sm bg-amber-300/35' : '',
                  isActiveMatch ? 'outline outline-1 outline-amber-200 bg-amber-300/60' : '',
                ].join(' ')}
                style={{
                  fontFamily: item.fontFamily,
                  fontSize: item.fontHeight,
                  left: item.left,
                  lineHeight: '1',
                  top: item.top,
                  transform: `rotate(${item.angle}deg) scaleX(${item.scaleX})`,
                  transformOrigin: '0 0',
                }}
              >
                {item.text}
              </span>
            ) : null}
            {item.hasEOL ? (
              <br
                role="presentation"
                data-pdf-text-eol={item.itemIndex}
                className="absolute select-text selection:bg-transparent"
              />
            ) : null}
          </Fragment>
        );
      })}
      <div
        aria-hidden="true"
        data-pdf-text-end-of-content="true"
        className="pointer-events-none absolute inset-x-0 top-full h-0 select-none"
      />
    </div>
  );
}

function PdfPageHighlightLayer({
  pageNumber,
  pageSize,
  zoom,
  annotations,
  selectedHighlightId,
}: PdfPageHighlightLayerProps) {
  const pageAnnotations = annotations.filter((annotation) => annotation.pageNumber === pageNumber);
  if (pageAnnotations.length === 0) {
    return null;
  }

  return (
    <div
      data-testid={`pdf-viewer-highlight-layer-${pageNumber}`}
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
      style={{ height: pageSize.height, width: pageSize.width }}
    >
      {pageAnnotations.flatMap((annotation) => annotation.rects.map((rect, rectIndex) => {
        const colorOption = PDF_HIGHLIGHT_COLOR_OPTIONS.find((option) => option.value === annotation.color);
        const isSelected = selectedHighlightId === annotation.id;
        const left = rect.left * zoom;
        const top = rect.top * zoom;
        const width = rect.width * zoom;
        const height = rect.height * zoom;
        const lineThickness = Math.max(1, Math.round(1.6 * zoom * 100) / 100);
        const testId = annotation.kind === 'highlight'
          ? 'pdf-viewer-highlight'
          : `pdf-viewer-${annotation.kind}`;
        const annotationAttributes = {
          'data-testid': testId,
          'data-pdf-highlight-id': annotation.id,
          'data-pdf-highlight-kind': annotation.kind,
          'data-pdf-highlight-color': annotation.color,
          title: annotation.quote,
        };

        if (annotation.kind === 'highlight') {
          return (
            <div
              key={`${annotation.id}-${rectIndex}`}
              {...annotationAttributes}
              className="absolute rounded-[1px] mix-blend-multiply"
              style={{
                backgroundColor: colorOption?.background,
                boxShadow: isSelected
                  ? '0 0 0 2px rgba(14, 165, 233, 0.95)'
                  : 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
                left,
                top,
                width,
                height,
              }}
            />
          );
        }

        const lineTop = annotation.kind === 'underline'
          ? top + height - lineThickness
          : top + (height - lineThickness) / 2;
        return (
          <Fragment key={`${annotation.id}-${rectIndex}`}>
            <div
              {...annotationAttributes}
              className="absolute rounded-full"
              style={{
                backgroundColor: colorOption?.swatch,
                left,
                top: lineTop,
                width,
                height: lineThickness,
              }}
            />
            {isSelected ? (
              <div
                aria-hidden="true"
                data-testid="pdf-viewer-highlight-selection-outline"
                className="pointer-events-none absolute rounded-[1px]"
                style={{
                  boxShadow: '0 0 0 2px rgba(14, 165, 233, 0.95)',
                  left,
                  top,
                  width,
                  height,
                }}
              />
            ) : null}
          </Fragment>
        );
      }))}
    </div>
  );
}

function PdfPageLinkLayer({
  pageNumber,
  pdfDocument,
  zoom,
  rotation,
  shouldRender,
  pageSize,
  textItems,
  onOpenLink,
}: PdfPageLinkLayerProps) {
  const [annotationLinks, setAnnotationLinks] = useState<PdfLinkOverlay[]>([]);

  useEffect(() => {
    if (!shouldRender) {
      setAnnotationLinks([]);
      return undefined;
    }

    let cancelled = false;

    void pdfDocument.getPage(pageNumber)
      .then(async (page) => {
        const getAnnotations = (page as {
          getAnnotations?: (options?: { intent?: string }) => Promise<Array<Record<string, unknown>>>;
        }).getAnnotations;
        if (typeof getAnnotations !== 'function') {
          return [];
        }

        const viewport = page.getViewport({ scale: zoom, rotation });
        const annotations = await getAnnotations.call(page, { intent: 'display' });
        return annotations
          .map((annotation, index) => {
            const url = normalizeLinkUrl(getAnnotationUrl(annotation) ?? '');
            const rect = getViewportRect(annotation['rect'], viewport);
            if (!url || !rect) {
              return null;
            }

            return {
              id: `annotation-${pageNumber}-${index}`,
              url,
              ...rect,
            };
          })
          .filter((link): link is PdfLinkOverlay => link !== null);
      })
      .then((links) => {
        if (!cancelled) {
          setAnnotationLinks(links);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAnnotationLinks([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pageNumber, pdfDocument, rotation, shouldRender, zoom]);

  if (!shouldRender) {
    return null;
  }

  const textLinks = textItems
    .map((item) => {
      const url = normalizeLinkUrl(getTextUrl(item.text) ?? '');
      if (!url) {
        return null;
      }

      return {
        id: `text-${pageNumber}-${item.itemIndex}`,
        url,
        left: item.bounds.left,
        top: item.bounds.top,
        width: item.bounds.width,
        height: item.bounds.height,
      };
    })
    .filter((link): link is PdfLinkOverlay => link !== null);
  const links = [...annotationLinks, ...textLinks];

  if (links.length === 0) {
    return null;
  }

  return (
    <div
      data-testid={`pdf-viewer-link-layer-${pageNumber}`}
      className="pointer-events-none absolute inset-0 z-[3] overflow-hidden"
      style={{ height: pageSize.height, width: pageSize.width }}
    >
      {links.map((link, index) => (
        <button
          key={`${link.id}-${index}`}
          type="button"
          data-pdf-link="true"
          data-testid={`pdf-viewer-link-${pageNumber}-${index}`}
          aria-label={`Open link ${link.url}`}
          title={link.url}
          onClick={() => onOpenLink(link.url)}
          className="pointer-events-auto absolute cursor-pointer rounded-sm bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-ide-accent"
          style={{
            left: link.left,
            top: link.top,
            width: link.width,
            height: link.height,
          }}
        />
      ))}
    </div>
  );
}

function PdfThumbnailCanvas({
  pageNumber,
  pdfDocument,
  rotation,
  isActive,
  shouldRender,
  pageToneMode,
  onClick,
  onRenderStart,
  onRenderComplete,
  onRenderCancelled,
}: PdfThumbnailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [thumbnailSize, setThumbnailSize] = useState<PdfPageSize>({ width: PDF_VIEWER_THUMBNAIL_WIDTH_PX, height: 104 });

  useEffect(() => {
    if (!shouldRender) {
      return undefined;
    }

    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return undefined;
    }

    let completed = false;
    let released = false;
    const releaseRender = (didComplete: boolean, byteSize = 0) => {
      if (released) {
        return;
      }

      released = true;
      if (didComplete) {
        onRenderComplete(pageNumber, byteSize);
      } else {
        onRenderCancelled(pageNumber);
      }
    };

    onRenderStart(pageNumber);

    void (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1, rotation });
        const scale = PDF_VIEWER_THUMBNAIL_WIDTH_PX / Math.max(1, baseViewport.width);
        const viewport = page.getViewport({ scale, rotation });
        const outputScale = Math.max(window.devicePixelRatio || 1, 1);
        setThumbnailSize({ width: viewport.width, height: viewport.height });
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) {
          completed = true;
          releaseRender(true, canvas.width * canvas.height * 4);
        }
      } catch {
        if (!cancelled) {
          releaseRender(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
      if (!completed) {
        releaseRender(false);
      }
    };
  }, [onRenderCancelled, onRenderComplete, onRenderStart, pageNumber, pdfDocument, rotation, shouldRender]);

  return (
    <button
      type="button"
      data-testid={`pdf-viewer-thumbnail-${pageNumber}`}
      data-pdf-thumbnail-page={pageNumber}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={[
        'flex w-full flex-col items-center gap-1 rounded-md border px-1.5 py-1.5 text-[10px] transition-colors',
        isActive
          ? 'border-ide-accent bg-ide-accent/15 text-ide-text'
          : 'border-transparent text-ide-text-muted hover:border-ide-border hover:bg-ide-hover hover:text-ide-text',
      ].join(' ')}
    >
      {shouldRender ? (
        <canvas
          ref={canvasRef}
          data-testid={`pdf-viewer-thumbnail-canvas-${pageNumber}`}
          data-pdf-page-tone-mode={pageToneMode}
          className={[
            'rounded-sm bg-white shadow-sm',
            getPageToneCanvasClassName(pageToneMode),
          ].filter(Boolean).join(' ')}
          style={{
            width: thumbnailSize.width,
            height: thumbnailSize.height,
            ...getPageToneCanvasStyle(pageToneMode),
          }}
        />
      ) : (
        <div
          className="rounded-sm border border-ide-border bg-ide-tab-bg"
          style={{ width: thumbnailSize.width, height: thumbnailSize.height }}
        />
      )}
      <span>{pageNumber}</span>
    </button>
  );
}

function getHighlightPixelBounds(annotation: PdfHighlightAnnotation, zoom: number): PdfClientRectBounds | null {
  if (annotation.rects.length === 0) {
    return null;
  }

  const left = Math.min(...annotation.rects.map((rect) => rect.left * zoom));
  const top = Math.min(...annotation.rects.map((rect) => rect.top * zoom));
  const right = Math.max(...annotation.rects.map((rect) => (rect.left + rect.width) * zoom));
  const bottom = Math.max(...annotation.rects.map((rect) => (rect.top + rect.height) * zoom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function getHighlightAtViewportPoint(
  viewport: HTMLElement,
  annotations: PdfHighlightAnnotation[],
  zoom: number,
  clientX: number,
  clientY: number,
): PdfHighlightAnnotation | null {
  const hitPadding = Math.max(1, 2 / zoom);
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index];
    if (!annotation) {
      continue;
    }

    const pageElement = viewport.querySelector<HTMLElement>(
      `[data-pdf-page-content="true"][data-pdf-page-number="${annotation.pageNumber}"]`,
    );
    if (!pageElement) {
      continue;
    }

    const pageBounds = pageElement.getBoundingClientRect();
    const pageX = (clientX - pageBounds.left) / zoom;
    const pageY = (clientY - pageBounds.top) / zoom;
    const isHit = annotation.rects.some((rect) => (
      pageX >= rect.left - hitPadding
      && pageX <= rect.left + rect.width + hitPadding
      && pageY >= rect.top - hitPadding
      && pageY <= rect.top + rect.height + hitPadding
    ));
    if (isHit) {
      return annotation;
    }
  }

  return null;
}

function formatHighlightCommentTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(createdAt);
}

function PdfHighlightInteractionOverlay({
  annotation,
  mode,
  zoom,
  onClose,
  onColorChange,
  onDelete,
  onSubmitComment,
}: PdfHighlightInteractionOverlayProps) {
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const bounds = getHighlightPixelBounds(annotation, zoom);
  const colorOption = PDF_HIGHLIGHT_COLOR_OPTIONS.find((option) => option.value === annotation.color)
    ?? PDF_HIGHLIGHT_COLOR_OPTIONS[0];
  if (!bounds || !colorOption) {
    return null;
  }

  const handleSubmitComment = () => {
    if (onSubmitComment(commentDraft)) {
      setCommentDraft('');
    }
  };

  return (
    <Popover open onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          data-pdf-highlight-anchor={annotation.id}
          className="pointer-events-none absolute z-10"
          style={{
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
          }}
        />
      </PopoverAnchor>
      {mode === 'controls' ? (
        <PopoverContent
          align="center"
          side="bottom"
          sideOffset={8}
          data-testid="pdf-viewer-highlight-controls"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('[data-testid="pdf-viewer-highlight-color-menu"]')) {
              event.preventDefault();
            }
          }}
          className="w-auto border-ide-border bg-ide-tab-bg p-1 text-ide-text shadow-xl"
        >
          <div className="flex items-center gap-1">
            <Popover open={isColorMenuOpen} onOpenChange={setIsColorMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Change highlight color"
                  aria-expanded={isColorMenuOpen}
                  className="flex h-8 items-center gap-1 rounded px-1.5 text-ide-text transition-colors hover:bg-ide-hover"
                >
                  <span
                    aria-hidden="true"
                    className="h-5 w-5 rounded-full ring-1 ring-white/25"
                    style={{ backgroundColor: colorOption.swatch }}
                  />
                  <ChevronDown size={13} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={6}
                data-testid="pdf-viewer-highlight-color-menu"
                className="w-auto border-ide-border bg-ide-tab-bg p-1.5 shadow-xl"
              >
                <div className="flex flex-col gap-1">
                  {PDF_HIGHLIGHT_COLOR_OPTIONS.map((option) => (
                    <TooltipIconButton key={option.value} content={option.label} side="right">
                      <button
                        type="button"
                        aria-label={`${option.label} highlight`}
                        aria-pressed={annotation.color === option.value}
                        data-testid={`pdf-viewer-highlight-color-${option.value}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onColorChange(option.value);
                          setIsColorMenuOpen(false);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-ide-hover"
                      >
                        <span
                          aria-hidden="true"
                          className="h-5 w-5 rounded-full ring-1 ring-white/25"
                          style={{
                            backgroundColor: option.swatch,
                            boxShadow: annotation.color === option.value ? '0 0 0 2px var(--ide-accent)' : undefined,
                          }}
                        />
                      </button>
                    </TooltipIconButton>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <div className="h-5 w-px bg-ide-border" />
            <TooltipIconButton content="Delete highlight" side="bottom">
              <button
                type="button"
                aria-label="Delete highlight"
                data-testid="pdf-viewer-highlight-delete"
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onDelete();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.detail === 0) {
                    onDelete();
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-error"
              >
                <Trash2 size={16} />
              </button>
            </TooltipIconButton>
          </div>
        </PopoverContent>
      ) : (
        <PopoverContent
          align="start"
          side="right"
          sideOffset={10}
          data-testid="pdf-viewer-highlight-comment-overlay"
          className="w-80 border-ide-border bg-ide-tab-bg p-0 text-ide-text shadow-xl"
        >
          <div className="flex h-10 items-center justify-between border-b border-ide-border px-3">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <MessageSquarePlus size={14} className="text-ide-text-muted" />
              Comments
            </div>
            <button
              type="button"
              aria-label="Close comments"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-ide-text-muted hover:bg-ide-hover hover:text-ide-text"
            >
              <X size={14} />
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto px-3">
            {annotation.comments.length === 0 ? (
              <div className="py-5 text-center text-[11px] text-ide-text-muted">No comments yet.</div>
            ) : annotation.comments.map((comment) => (
              <div key={comment.id} className="border-b border-ide-border/70 py-3 last:border-b-0">
                <div className="mb-1 flex items-center gap-2 text-[11px]">
                  <span className="font-medium text-ide-text">{comment.author}</span>
                  <span className="text-ide-text-muted">{formatHighlightCommentTime(comment.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[12px] leading-5 text-ide-text">{comment.body}</p>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2 border-t border-ide-border p-3">
            <Textarea
              autoFocus
              rows={2}
              maxLength={2_000}
              value={commentDraft}
              data-testid="pdf-viewer-highlight-comment-input"
              placeholder="Add a reply"
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmitComment();
                }
              }}
              className="min-h-14 resize-none bg-ide-editor-bg px-2.5 py-2 text-[12px]"
            />
            <TooltipIconButton content="Add comment" side="top">
              <button
                type="button"
                aria-label="Add comment"
                data-testid="pdf-viewer-highlight-comment-submit"
                disabled={!commentDraft.trim()}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  handleSubmitComment();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.detail === 0) {
                    handleSubmitComment();
                  }
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ide-accent text-white transition-colors hover:brightness-110 disabled:cursor-default disabled:opacity-40"
              >
                <Send size={14} />
              </button>
            </TooltipIconButton>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

function arePageSetsEqual(first: ReadonlySet<number>, second: ReadonlySet<number>): boolean {
  if (first.size !== second.size) {
    return false;
  }

  for (const pageNumber of first) {
    if (!second.has(pageNumber)) {
      return false;
    }
  }

  return true;
}

interface PdfInfoPopoverContentProps {
  info: PdfDocumentInfo | null;
  isLoading: boolean;
  errorMessage: string | null;
  onClose: () => void;
}

const PDF_INFO_SECTIONS: Array<Array<[keyof PdfDocumentInfo, string]>> = [
  [
    ['fileName', 'File name:'],
    ['fileSize', 'File size:'],
  ],
  [
    ['title', 'Title:'],
    ['author', 'Author:'],
    ['subject', 'Subject:'],
    ['keywords', 'Keywords:'],
    ['creationDate', 'Creation Date:'],
    ['modificationDate', 'Modification Date:'],
    ['creator', 'Creator:'],
  ],
  [
    ['producer', 'PDF Producer:'],
    ['pdfVersion', 'PDF Version:'],
    ['pageCount', 'Page Count:'],
    ['pageSize', 'Page Size:'],
  ],
  [
    ['fastWebView', 'Fast Web View:'],
  ],
];

function PdfInfoPopoverContent({
  info,
  isLoading,
  errorMessage,
  onClose,
}: PdfInfoPopoverContentProps) {
  const valueFor = (key: keyof PdfDocumentInfo) => info?.[key] ?? '-';

  return (
    <div className="w-full min-w-0 text-[12px] text-ide-text" data-testid="pdf-viewer-info-popover">
      {isLoading ? (
        <div className="py-5 text-center text-ide-text-muted">Loading PDF information...</div>
      ) : (
        <div className="space-y-3">
          {errorMessage ? (
            <div className="rounded border border-ide-border bg-ide-editor-bg px-3 py-2 text-ide-text-muted">
              Unable to read some PDF information.
            </div>
          ) : null}
          {PDF_INFO_SECTIONS.map((section, sectionIndex) => (
            <div
              key={`pdf-info-section-${sectionIndex}`}
              className={sectionIndex === 0 ? 'space-y-1.5' : 'space-y-1.5 border-t border-ide-border pt-3'}
            >
              {section.map(([key, label]) => (
                <div
                  key={key}
                  className="grid min-w-0 grid-cols-[132px_minmax(0,1fr)] gap-2 leading-5"
                  data-testid={`pdf-viewer-info-row-${key}`}
                >
                  <div className="min-w-0 whitespace-nowrap font-semibold text-ide-text">{label}</div>
                  <div className="min-w-0 overflow-x-auto whitespace-nowrap font-semibold text-ide-text [scrollbar-width:thin]" data-testid={`pdf-viewer-info-${key}`}>
                    {valueFor(key)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          data-testid="pdf-viewer-info-close"
          onClick={onClose}
          className="rounded bg-ide-hover px-4 py-1.5 text-[12px] font-semibold text-ide-text transition-colors hover:bg-ide-border"
        >
          Close
        </button>
      </div>
    </div>
  );
}

interface PdfBookmarkTreeProps {
  bookmarks: PdfBookmark[];
  expandedBookmarkIds: string[];
  onToggleBookmark: (bookmarkId: string) => void;
  onOpenBookmark: (bookmark: PdfBookmark) => void;
}

function PdfBookmarkTree({
  bookmarks,
  expandedBookmarkIds,
  onToggleBookmark,
  onOpenBookmark,
}: PdfBookmarkTreeProps) {
  const renderBookmark = (bookmark: PdfBookmark, depth: number) => {
    const isExpanded = expandedBookmarkIds.includes(bookmark.id);
    const hasChildren = bookmark.children.length > 0;

    return (
      <li key={bookmark.id}>
        <div
          className="flex min-w-0 items-center gap-1 rounded px-1 py-1 text-[11px] text-ide-text-muted hover:bg-ide-hover hover:text-ide-text"
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          <button
            type="button"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} bookmark ${bookmark.title}`}
            disabled={!hasChildren}
            onClick={() => onToggleBookmark(bookmark.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-ide-text-muted hover:bg-ide-hover hover:text-ide-text disabled:opacity-0"
          >
            {isExpanded ? <ChevronRight size={12} className="rotate-90" /> : <ChevronRight size={12} />}
          </button>
          <button
            type="button"
            data-testid={`pdf-viewer-bookmark-${bookmark.id}`}
            title={bookmark.title}
            onClick={() => onOpenBookmark(bookmark)}
            className="min-w-0 flex-1 truncate text-left text-[11px] font-normal"
          >
            {bookmark.title}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <ul>
            {bookmark.children.map((child) => renderBookmark(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside
      data-testid="pdf-viewer-bookmark-tree"
      className="w-56 shrink-0 overflow-y-auto border-r border-ide-border bg-ide-tab-bg/80 px-2 py-2"
      aria-label="PDF bookmarks"
    >
      <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-normal text-ide-text-muted">
        <BookOpen size={13} />
        Bookmarks
      </div>
      {bookmarks.length === 0 ? (
        <div data-testid="pdf-viewer-bookmark-empty" className="px-1 py-6 text-center text-[11px] text-ide-text-muted">
          No bookmarks
        </div>
      ) : (
        <ul className="space-y-0.5">
          {bookmarks.map((bookmark) => renderBookmark(bookmark, 0))}
        </ul>
      )}
    </aside>
  );
}

interface PdfSelectionToolbarProps {
  state: PdfSelectionToolbarState;
  onHighlight: () => void;
  onUnderline: () => void;
  onStrikethrough: () => void;
  toolbarRef: RefObject<HTMLDivElement | null>;
}

function PdfSelectionToolbar({
  state,
  onHighlight,
  onUnderline,
  onStrikethrough,
  toolbarRef,
}: PdfSelectionToolbarProps) {
  const disabledButtonClassName = 'rounded p-1.5 text-ide-text-muted opacity-70';
  const enabledButtonClassName = 'rounded p-1.5 text-ide-text transition-colors hover:bg-ide-hover hover:text-ide-text';

  return (
    <div
      role="toolbar"
      ref={toolbarRef}
      aria-label="PDF selection tools"
      data-testid="pdf-viewer-selection-toolbar"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="absolute z-30 inline-flex w-auto -translate-x-1/2 items-center gap-0.5 rounded-md border border-white/10 bg-[#303030] px-1.5 py-1.5 text-ide-text shadow-xl"
      style={{
        left: state.left,
        top: state.top,
        minHeight: PDF_SELECTION_TOOLBAR_HEIGHT_PX,
      }}
    >
      <button type="button" aria-label="note" title="note" disabled className={disabledButtonClassName}>
        <PanelTop size={17} />
      </button>
      <TooltipIconButton content="highlight" side="bottom">
        <button
          type="button"
          aria-label="Highlight selection"
          data-testid="pdf-viewer-selection-highlight"
          onClick={onHighlight}
          className={enabledButtonClassName}
        >
          <Highlighter size={17} />
        </button>
      </TooltipIconButton>
      <TooltipIconButton content="underline" side="bottom">
        <button
          type="button"
          aria-label="Underline selection"
          data-testid="pdf-viewer-selection-underline"
          onClick={onUnderline}
          className={enabledButtonClassName}
        >
          <Underline size={17} />
        </button>
      </TooltipIconButton>
      <TooltipIconButton content="strikethrough" side="bottom">
        <button
          type="button"
          aria-label="Strikethrough selection"
          data-testid="pdf-viewer-selection-strikethrough"
          onClick={onStrikethrough}
          className={enabledButtonClassName}
        >
          <Strikethrough size={17} />
        </button>
      </TooltipIconButton>
      <button type="button" aria-label="comment" title="comment" disabled className={disabledButtonClassName}>
        <MessageSquarePlus size={17} />
      </button>
      <button type="button" aria-label="scan text" title="scan text" disabled className={disabledButtonClassName}>
        <ScanText size={17} />
      </button>
      <div className="mx-1 h-5 w-px bg-white/15" />
      <button type="button" aria-label="notebook" title="notebook" disabled className={disabledButtonClassName}>
        <NotebookPen size={17} />
      </button>
    </div>
  );
}

export function PdfViewerPane({
  fileId,
  fileName,
  showDragInteractionShield,
  dragInteractionShieldTestId,
}: PdfViewerPaneProps) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const selectionToolbarRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRailRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const restoredScrollForFileRef = useRef<string | null>(null);
  const selectionToolbarFrameRef = useRef<number | null>(null);
  const isTextSelectingRef = useRef(false);
  const presentationRestoreRef = useRef<PdfViewerPresentationRestoreState | null>(null);
  const presentationWheelDeltaRef = useRef(0);
  const presentationWheelTimeStampRef = useRef(0);
  const pageScrollWheelDeltaRef = useRef(0);
  const pageScrollWheelTimeStampRef = useRef(0);
  const scrollModeRestorePageRef = useRef<number | null>(null);
  const thumbnailCacheRef = useRef<Map<number, PdfThumbnailCacheEntry>>(new Map());
  const thumbnailCacheAccessRef = useRef(0);
  const thumbnailProtectedPagesRef = useRef<Set<number>>(new Set());
  const handDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfFileByteLength, setPdfFileByteLength] = useState<number | null>(null);
  const [pdfDocumentInfo, setPdfDocumentInfo] = useState<PdfDocumentInfo | null>(null);
  const [pdfDocumentInfoError, setPdfDocumentInfoError] = useState<string | null>(null);
  const [isPdfDocumentInfoLoading, setIsPdfDocumentInfoLoading] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [pageSizes, setPageSizes] = useState<Record<number, PdfPageSize>>({});
  const [pageTextItems, setPageTextItems] = useState<Record<number, PdfTextRun[]>>({});
  const [bookmarks, setBookmarks] = useState<PdfBookmark[]>([]);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isHandDragging, setIsHandDragging] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectionToolbar, setSelectionToolbar] = useState<PdfSelectionToolbarState | null>(null);
  const [visibleThumbnailPages, setVisibleThumbnailPages] = useState<Set<number>>(() => new Set());
  const [prefetchedThumbnailPages, setPrefetchedThumbnailPages] = useState<Set<number>>(() => new Set());
  const [cachedThumbnailPages, setCachedThumbnailPages] = useState<Set<number>>(() => new Set());
  const [renderingThumbnailPages, setRenderingThumbnailPages] = useState<Set<number>>(() => new Set());
  const {
    activeSearchMatchIndex,
    commentHighlightId,
    fitMode,
    expandedBookmarkIds,
    highlightAnnotations,
    isBookmarkTreeVisible,
    isInfoPanelOpen,
    isPresentationModeActive,
    isSearchOpen,
    isThumbnailRailVisible,
    pageNumber,
    pageToneMode,
    rotation,
    searchQuery,
    selectedHighlightId,
    scrollMode,
    toolMode,
    zoom,
  } = usePdfViewerStore((state) => state.getSession(fileId));
  const setActiveSearchMatchIndex = usePdfViewerStore((state) => state.setActiveSearchMatchIndex);
  const enterPresentationMode = usePdfViewerStore((state) => state.enterPresentationMode);
  const exitPresentationMode = usePdfViewerStore((state) => state.exitPresentationMode);
  const setFitMode = usePdfViewerStore((state) => state.setFitMode);
  const setBookmarkTreeVisible = usePdfViewerStore((state) => state.setBookmarkTreeVisible);
  const setThumbnailRailVisible = usePdfViewerStore((state) => state.setThumbnailRailVisible);
  const toggleBookmarkExpanded = usePdfViewerStore((state) => state.toggleBookmarkExpanded);
  const addHighlightAnnotation = usePdfViewerStore((state) => state.addHighlightAnnotation);
  const addHighlightComment = usePdfViewerStore((state) => state.addHighlightComment);
  const closeHighlightInteraction = usePdfViewerStore((state) => state.closeHighlightInteraction);
  const removeHighlightAnnotation = usePdfViewerStore((state) => state.removeHighlightAnnotation);
  const setCommentHighlight = usePdfViewerStore((state) => state.setCommentHighlight);
  const setHighlightAnnotationColor = usePdfViewerStore((state) => state.setHighlightAnnotationColor);
  const setSelectedHighlight = usePdfViewerStore((state) => state.setSelectedHighlight);
  const setPageNumber = usePdfViewerStore((state) => state.setPageNumber);
  const setPageNumberFromViewport = usePdfViewerStore((state) => state.setPageNumberFromViewport);
  const rotate = usePdfViewerStore((state) => state.rotate);
  const setScrollPosition = usePdfViewerStore((state) => state.setScrollPosition);
  const setSearchOpen = usePdfViewerStore((state) => state.setSearchOpen);
  const setInfoPanelOpen = usePdfViewerStore((state) => state.setInfoPanelOpen);
  const setSearchQuery = usePdfViewerStore((state) => state.setSearchQuery);
  const setPageToneMode = usePdfViewerStore((state) => state.setPageToneMode);
  const setScrollMode = usePdfViewerStore((state) => state.setScrollMode);
  const setToolMode = usePdfViewerStore((state) => state.setToolMode);
  const setZoom = usePdfViewerStore((state) => state.setZoom);
  const canGoPrevious = pageNumber > 1;
  const canGoNext = pageCount > 0 && pageNumber < pageCount;
  const canGoFirst = canGoPrevious;
  const canGoLast = canGoNext;
  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );
  const visiblePageNumbers = useMemo(
    () => ((isPresentationModeActive || scrollMode === 'page') && pageCount > 0 ? [pageNumber] : pageNumbers),
    [isPresentationModeActive, pageCount, pageNumber, pageNumbers, scrollMode],
  );
  const renderedPageRange = useMemo(() => ({
    start: Math.max(1, pageNumber - PDF_VIEWER_RENDER_OVERSCAN),
    end: Math.min(pageCount, pageNumber + PDF_VIEWER_RENDER_OVERSCAN),
  }), [pageCount, pageNumber]);
  const thumbnailRenderCandidates = useMemo(() => {
    const candidates: number[] = [];
    const seen = new Set<number>();
    const addPage = (currentPageNumber: number) => {
      if (currentPageNumber < 1 || currentPageNumber > pageCount || seen.has(currentPageNumber)) {
        return;
      }

      seen.add(currentPageNumber);
      candidates.push(currentPageNumber);
    };
    const sortByDistanceToActivePage = (first: number, second: number) => (
      Math.abs(first - pageNumber) - Math.abs(second - pageNumber)
    );

    addPage(pageNumber);
    [...visibleThumbnailPages].sort(sortByDistanceToActivePage).forEach(addPage);
    [...prefetchedThumbnailPages].sort(sortByDistanceToActivePage).forEach(addPage);
    return candidates;
  }, [pageCount, pageNumber, prefetchedThumbnailPages, visibleThumbnailPages]);
  const thumbnailRenderSlots = useMemo(() => {
    const slots = new Set<number>();
    const availableSlots = Math.max(0, PDF_VIEWER_THUMBNAIL_MAX_CONCURRENT_RENDERS - renderingThumbnailPages.size);

    for (const currentPageNumber of thumbnailRenderCandidates) {
      if (slots.size >= availableSlots) {
        break;
      }
      if (cachedThumbnailPages.has(currentPageNumber) || renderingThumbnailPages.has(currentPageNumber)) {
        continue;
      }

      slots.add(currentPageNumber);
    }

    return slots;
  }, [cachedThumbnailPages, renderingThumbnailPages, thumbnailRenderCandidates]);
  const thumbnailProtectedPages = useMemo(() => new Set([
    ...thumbnailRenderCandidates,
    ...thumbnailRenderSlots,
    ...renderingThumbnailPages,
  ]), [renderingThumbnailPages, thumbnailRenderCandidates, thumbnailRenderSlots]);
  thumbnailProtectedPagesRef.current = thumbnailProtectedPages;
  const effectiveToolMode: PdfViewerToolMode = isPresentationModeActive ? 'hand' : toolMode;
  const normalizedSearchQuery = getNormalizedSearchQuery(searchQuery);
  const searchMatches = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    const matches: PdfSearchMatch[] = [];
    for (const currentPageNumber of pageNumbers) {
      const items = pageTextItems[currentPageNumber] ?? [];
      for (const item of items) {
        if (item.text.toLowerCase().includes(normalizedSearchQuery)) {
          matches.push({
            pageNumber: currentPageNumber,
            itemIndex: item.itemIndex,
            globalIndex: matches.length,
          });
        }
      }
    }

    return matches;
  }, [normalizedSearchQuery, pageNumbers, pageTextItems]);
  const activeSearchMatch = searchMatches[activeSearchMatchIndex] ?? null;
  const hideSelectionToolbar = useCallback(() => {
    setSelectionToolbar(null);
  }, []);
  const syncCachedThumbnailPages = useCallback(() => {
    setCachedThumbnailPages((current) => {
      const next = new Set(thumbnailCacheRef.current.keys());
      return arePageSetsEqual(current, next) ? current : next;
    });
  }, []);
  const trimThumbnailCache = useCallback((protectedPages: ReadonlySet<number>) => {
    const cache = thumbnailCacheRef.current;
    const getCacheByteSize = () => [...cache.values()].reduce((total, entry) => total + entry.byteSize, 0);
    let cacheByteSize = getCacheByteSize();
    let evicted = false;

    while (
      (cache.size > PDF_VIEWER_THUMBNAIL_CACHE_MAX_ENTRIES || cacheByteSize > PDF_VIEWER_THUMBNAIL_CACHE_MAX_BYTES)
    ) {
      const evictionCandidate = [...cache.entries()]
        .filter(([currentPageNumber]) => !protectedPages.has(currentPageNumber))
        .sort(([, first], [, second]) => first.lastUsed - second.lastUsed)[0];
      if (!evictionCandidate) {
        break;
      }

      cacheByteSize -= evictionCandidate[1].byteSize;
      cache.delete(evictionCandidate[0]);
      evicted = true;
    }

    if (evicted) {
      syncCachedThumbnailPages();
    }
  }, [syncCachedThumbnailPages]);
  const handleThumbnailRenderStart = useCallback((currentPageNumber: number) => {
    setRenderingThumbnailPages((current) => {
      if (current.has(currentPageNumber)) {
        return current;
      }

      return new Set([...current, currentPageNumber]);
    });
  }, []);
  const handleThumbnailRenderCancelled = useCallback((currentPageNumber: number) => {
    setRenderingThumbnailPages((current) => {
      if (!current.has(currentPageNumber)) {
        return current;
      }

      const next = new Set(current);
      next.delete(currentPageNumber);
      return next;
    });
  }, []);
  const handleThumbnailRenderComplete = useCallback((currentPageNumber: number, byteSize: number) => {
    thumbnailCacheRef.current.set(currentPageNumber, {
      byteSize,
      lastUsed: ++thumbnailCacheAccessRef.current,
    });
    handleThumbnailRenderCancelled(currentPageNumber);
    trimThumbnailCache(thumbnailProtectedPagesRef.current);
    syncCachedThumbnailPages();
  }, [handleThumbnailRenderCancelled, syncCachedThumbnailPages, trimThumbnailCache]);
  useEffect(() => {
    thumbnailCacheRef.current.clear();
    thumbnailCacheAccessRef.current = 0;
    setVisibleThumbnailPages(new Set());
    setPrefetchedThumbnailPages(new Set());
    setCachedThumbnailPages(new Set());
    setRenderingThumbnailPages(new Set());
  }, [fileId, pdfDocument, rotation]);
  useEffect(() => {
    for (const currentPageNumber of thumbnailRenderCandidates) {
      const entry = thumbnailCacheRef.current.get(currentPageNumber);
      if (entry) {
        entry.lastUsed = ++thumbnailCacheAccessRef.current;
      }
    }
    trimThumbnailCache(thumbnailProtectedPages);
  }, [thumbnailProtectedPages, thumbnailRenderCandidates, trimThumbnailCache]);
  useEffect(() => {
    if (
      typeof IntersectionObserver !== 'undefined'
      || !pdfDocument
      || pageCount === 0
      || isPresentationModeActive
      || !isThumbnailRailVisible
    ) {
      return;
    }

    const start = Math.max(1, pageNumber - PDF_VIEWER_RENDER_OVERSCAN);
    const end = Math.min(pageCount, pageNumber + PDF_VIEWER_RENDER_OVERSCAN);
    setVisibleThumbnailPages(new Set([pageNumber]));
    setPrefetchedThumbnailPages(new Set(Array.from({ length: end - start + 1 }, (_, index) => start + index)));
  }, [isPresentationModeActive, isThumbnailRailVisible, pageCount, pageNumber, pdfDocument]);
  useEffect(() => {
    if (!pdfDocument || pageCount === 0 || isPresentationModeActive || !isThumbnailRailVisible) {
      setVisibleThumbnailPages(new Set());
      setPrefetchedThumbnailPages(new Set());
      return undefined;
    }

    const rail = thumbnailRailRef.current;
    if (!rail) {
      return undefined;
    }

    const thumbnailElements = Array.from(rail.querySelectorAll<HTMLElement>('[data-pdf-thumbnail-page]'));
    const updateObservedPages = (
      setPages: Dispatch<SetStateAction<Set<number>>>,
      entries: IntersectionObserverEntry[],
    ) => {
      setPages((current) => {
        const next = new Set(current);
        for (const entry of entries) {
          const currentPageNumber = Number((entry.target as HTMLElement).dataset.pdfThumbnailPage ?? 0);
          if (currentPageNumber < 1 || currentPageNumber > pageCount) {
            continue;
          }
          if (entry.isIntersecting) {
            next.add(currentPageNumber);
          } else {
            next.delete(currentPageNumber);
          }
        }
        return arePageSetsEqual(current, next) ? current : next;
      });
    };

    if (typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    setVisibleThumbnailPages(new Set());
    setPrefetchedThumbnailPages(new Set());
    const visibleObserver = new IntersectionObserver(
      (entries) => updateObservedPages(setVisibleThumbnailPages, entries),
      { root: rail, threshold: 0.01 },
    );
    const prefetchObserver = new IntersectionObserver(
      (entries) => updateObservedPages(setPrefetchedThumbnailPages, entries),
      { root: rail, rootMargin: `${PDF_VIEWER_THUMBNAIL_PREFETCH_MARGIN_PX}px 0px`, threshold: 0.01 },
    );
    for (const element of thumbnailElements) {
      visibleObserver.observe(element);
      prefetchObserver.observe(element);
    }

    return () => {
      visibleObserver.disconnect();
      prefetchObserver.disconnect();
    };
  }, [isPresentationModeActive, isThumbnailRailVisible, pageCount, pdfDocument]);
  const resetPresentationWheelState = useCallback(() => {
    presentationWheelDeltaRef.current = 0;
    presentationWheelTimeStampRef.current = 0;
  }, []);
  const resetPageScrollWheelState = useCallback(() => {
    pageScrollWheelDeltaRef.current = 0;
    pageScrollWheelTimeStampRef.current = 0;
  }, []);
  const addHighlightFromCurrentSelection = useCallback((
    kind: PdfHighlightKind = 'highlight',
    options: { requireSinglePage?: boolean } = {},
  ) => {
    const selectionInfo = getPdfSelectionInfo(viewportRef.current, zoom, options);
    if (!selectionInfo) {
      return false;
    }

    for (const pageMatch of selectionInfo.pageMatches) {
      addHighlightAnnotation(fileId, {
        pageNumber: pageMatch.pageNumber,
        rects: pageMatch.rects,
        kind,
        quote: selectionInfo.quote,
      });
    }

    selectionInfo.selection.removeAllRanges();
    hideSelectionToolbar();
    return true;
  }, [addHighlightAnnotation, fileId, hideSelectionToolbar, zoom]);
  const updateSelectionToolbar = useCallback(() => {
    if (toolMode !== 'select') {
      hideSelectionToolbar();
      return;
    }

    const pane = paneRef.current;
    const selectionInfo = getPdfSelectionInfo(viewportRef.current, zoom, { requireSinglePage: true });
    if (!pane || !selectionInfo) {
      hideSelectionToolbar();
      return;
    }

    const paneRect = pane.getBoundingClientRect();
    const centeredLeft = selectionInfo.bounds.left - paneRect.left + selectionInfo.bounds.width / 2;
    const left = Math.min(Math.max(centeredLeft, 8), Math.max(8, paneRect.width - 8));
    const belowTop = selectionInfo.bounds.bottom - paneRect.top + PDF_SELECTION_TOOLBAR_GAP_PX;
    const top = belowTop + PDF_SELECTION_TOOLBAR_HEIGHT_PX <= paneRect.height - 8
      ? belowTop
      : Math.max(8, selectionInfo.bounds.top - paneRect.top - PDF_SELECTION_TOOLBAR_HEIGHT_PX - PDF_SELECTION_TOOLBAR_GAP_PX);

    setSelectionToolbar({ left, top });
  }, [hideSelectionToolbar, toolMode, zoom]);
  const scheduleSelectionToolbarUpdate = useCallback(() => {
    if (selectionToolbarFrameRef.current !== null) {
      window.cancelAnimationFrame(selectionToolbarFrameRef.current);
    }

    selectionToolbarFrameRef.current = window.requestAnimationFrame(() => {
      selectionToolbarFrameRef.current = null;
      updateSelectionToolbar();
    });
  }, [updateSelectionToolbar]);
  const handleDocumentSelectionChange = useCallback(() => {
    if (!getPdfSelectionInfo(viewportRef.current, zoom, { requireSinglePage: true })) {
      hideSelectionToolbar();
    }
  }, [hideSelectionToolbar, zoom]);

  useEffect(() => {
    setIsFullscreenSupported(
      typeof document !== 'undefined'
      && document.fullscreenEnabled !== false
      && typeof document.documentElement.requestFullscreen === 'function',
    );
  }, []);

  useEffect(() => {
    restoredScrollForFileRef.current = null;
    setPageSizes({});
    setPageTextItems({});
    setBookmarks([]);
    setPdfFileByteLength(null);
    setPdfDocumentInfo(null);
    setPdfDocumentInfoError(null);
    setIsPdfDocumentInfoLoading(false);
    presentationRestoreRef.current = null;
    resetPresentationWheelState();
    resetPageScrollWheelState();
    hideSelectionToolbar();
  }, [
    fileId,
    hideSelectionToolbar,
    reloadToken,
    resetPageScrollWheelState,
    resetPresentationWheelState,
  ]);

  useEffect(() => {
    setPageSizes({});
    setPageTextItems({});
    hideSelectionToolbar();
  }, [fileId, hideSelectionToolbar, rotation]);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;

    const readBytes = getPdfBytesReader(fileId);
    if (!readBytes) {
      setPdfDocument(null);
      setPdfFileByteLength(null);
      setPdfDocumentInfo(null);
      setPdfDocumentInfoError(null);
      setIsPdfDocumentInfoLoading(false);
      setPageCount(0);
      setIsLoading(false);
      setLoadError('Filesystem API unavailable');
      return undefined;
    }

    setIsLoading(true);
    setLoadError(null);
    setRenderError(null);
    setPdfDocument(null);
    setPdfFileByteLength(null);
    setPdfDocumentInfo(null);
    setPdfDocumentInfoError(null);
    setPageCount(0);

    void readBytes(fileId)
      .then((bytes) => {
        const normalizedBytes = normalizePdfBytes(bytes);
        if (!cancelled) {
          setPdfFileByteLength(normalizedBytes.byteLength);
        }

        return getDocument({
          data: normalizedBytes,
          cMapPacked: true,
          cMapUrl: `${PDFJS_ASSET_BASE_URL}cmaps/`,
          standardFontDataUrl: `${PDFJS_ASSET_BASE_URL}standard_fonts/`,
        }).promise;
      })
      .then((document) => {
        if (cancelled) {
          cleanupPdfDocument(document);
          return;
        }

        loadedDocument = document;
        setPdfDocument(document);
        setPageCount(document.numPages);
        setPageNumber(fileId, usePdfViewerStore.getState().getSession(fileId).pageNumber, document.numPages);
        if (typeof document.getOutline === 'function') {
          void document.getOutline()
            .then((outline) => {
              if (!cancelled) {
                setBookmarks(normalizeBookmarks(outline));
              }
            })
            .catch(() => {
              if (!cancelled) {
                setBookmarks([]);
              }
            });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setPdfDocument(null);
        setPdfFileByteLength(null);
        setPdfDocumentInfo(null);
        setPageCount(0);
        setLoadError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      cleanupPdfDocument(loadedDocument);
    };
  }, [fileId, reloadToken, setPageNumber]);

  useEffect(() => {
    if (!pdfDocument) {
      setPdfDocumentInfo(null);
      setPdfDocumentInfoError(null);
      setIsPdfDocumentInfoLoading(false);
      return undefined;
    }

    let cancelled = false;
    setIsPdfDocumentInfoLoading(true);
    setPdfDocumentInfoError(null);

    void createPdfDocumentInfo(pdfDocument, fileName, pdfFileByteLength)
      .then((info) => {
        if (!cancelled) {
          setPdfDocumentInfo(info);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPdfDocumentInfo(null);
          setPdfDocumentInfoError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPdfDocumentInfoLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileName, pdfDocument, pdfFileByteLength]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const updateViewportSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    updateViewportSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportSize);
      return () => window.removeEventListener('resize', updateViewportSize);
    }

    const resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [pdfDocument]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleDocumentSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleDocumentSelectionChange);
      if (selectionToolbarFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionToolbarFrameRef.current);
        selectionToolbarFrameRef.current = null;
      }
    };
  }, [handleDocumentSelectionChange]);

  useEffect(() => {
    if (!selectionToolbar) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const pane = paneRef.current;
      const toolbar = selectionToolbarRef.current;
      if (!pane || !toolbar) {
        return;
      }

      const paneRect = pane.getBoundingClientRect();
      const toolbarWidth = toolbar.offsetWidth || toolbar.getBoundingClientRect().width;
      const halfWidth = toolbarWidth / 2;
      const minLeft = halfWidth + 8;
      const maxLeft = Math.max(minLeft, paneRect.width - halfWidth - 8);
      const nextLeft = Math.min(Math.max(selectionToolbar.left, minLeft), maxLeft);
      if (Math.abs(nextLeft - selectionToolbar.left) > 0.5) {
        setSelectionToolbar((current) => current ? { ...current, left: nextLeft } : current);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectionToolbar]);

  useEffect(() => {
    hideSelectionToolbar();
  }, [fileId, hideSelectionToolbar, isPresentationModeActive, pageNumber, toolMode, zoom]);

  useEffect(() => {
    if (!pdfDocument || pageCount === 0 || restoredScrollForFileRef.current === fileId) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const session = usePdfViewerStore.getState().getSession(fileId);
      setViewportScroll(viewport, session.scrollLeft, session.scrollTop);
      restoredScrollForFileRef.current = fileId;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [fileId, pageCount, pdfDocument]);

  const handlePageSizeChange = useCallback((nextPageNumber: number, size: PdfPageSize) => {
    setPageSizes((current) => {
      const previous = current[nextPageNumber];
      if (previous?.width === size.width && previous.height === size.height) {
        return current;
      }

      return {
        ...current,
        [nextPageNumber]: size,
      };
    });
  }, []);

  const handleTextItemsChange = useCallback((nextPageNumber: number, items: PdfTextRun[]) => {
    setPageTextItems((current) => {
      if (current[nextPageNumber] === items) {
        return current;
      }

      return {
        ...current,
        [nextPageNumber]: items,
      };
    });
  }, []);

  const handleViewportScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    hideSelectionToolbar();
    if (isPresentationModeActive) {
      return;
    }

    setScrollPosition(fileId, {
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
    setPageNumberFromViewport(
      fileId,
      getViewportPageNumber(viewport, pageCount, pageSizes, zoom, scrollMode, pageNumber),
      pageCount,
    );
  }, [
    fileId,
    hideSelectionToolbar,
    isPresentationModeActive,
    pageCount,
    pageNumber,
    pageSizes,
    scrollMode,
    setPageNumberFromViewport,
    setScrollPosition,
    zoom,
  ]);

  const scrollToPage = useCallback((nextPageNumber: number) => {
    const viewport = viewportRef.current;
    scrollModeRestorePageRef.current = null;
    const normalizedPageNumber = Math.min(Math.max(nextPageNumber, 1), Math.max(pageCount, 1));
    if (!viewport) {
      setPageNumber(fileId, normalizedPageNumber, pageCount);
      return;
    }

    if (isPresentationModeActive) {
      setViewportScroll(viewport, 0, 0);
      setScrollPosition(fileId, {
        scrollLeft: 0,
        scrollTop: 0,
      });
      setPageNumber(fileId, normalizedPageNumber, pageCount);
      return;
    }

    const pageElement = viewport.querySelector<HTMLElement>(`[data-pdf-page-number="${normalizedPageNumber}"]`);
    const pageSize = getPageSize(pageSizes, normalizedPageNumber, zoom);
    const pageLeft = pageElement?.offsetLeft ?? 0;
    const pageTop = pageElement?.offsetTop ?? getPageOffsetTop(pageSizes, normalizedPageNumber, zoom);
    const pageWidth = pageElement?.offsetWidth || pageSize.width;
    let nextScrollLeft = viewport.scrollLeft;
    let nextScrollTop = viewport.scrollTop;

    if (scrollMode === 'page') {
      nextScrollLeft = 0;
      nextScrollTop = 0;
    } else if (scrollMode === 'horizontal') {
      nextScrollLeft = pageLeft;
      nextScrollTop = 0;
    } else if (scrollMode === 'wrapped') {
      nextScrollLeft = Math.max(0, pageLeft - Math.max(0, (viewport.clientWidth - pageWidth) / 2));
      nextScrollTop = pageTop;
    } else {
      nextScrollTop = pageTop;
    }

    setViewportScroll(viewport, nextScrollLeft, nextScrollTop);
    setScrollPosition(fileId, {
      scrollLeft: nextScrollLeft,
      scrollTop: nextScrollTop,
    });
    setPageNumber(fileId, normalizedPageNumber, pageCount);
  }, [fileId, isPresentationModeActive, pageCount, pageSizes, scrollMode, setPageNumber, setScrollPosition, zoom]);

  useEffect(() => {
    const targetPageNumber = scrollModeRestorePageRef.current;
    if (targetPageNumber === null || isPresentationModeActive) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (scrollModeRestorePageRef.current !== targetPageNumber) {
        return;
      }

      scrollToPage(targetPageNumber);
      scrollModeRestorePageRef.current = null;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isPresentationModeActive, scrollMode, scrollToPage]);

  const createPresentationRestoreState = useCallback((): PdfViewerPresentationRestoreState => {
    const viewport = viewportRef.current;
    return {
      pageNumber,
      zoom,
      fitMode,
      toolMode,
      scrollTop: viewport?.scrollTop ?? usePdfViewerStore.getState().getSession(fileId).scrollTop,
      scrollLeft: viewport?.scrollLeft ?? usePdfViewerStore.getState().getSession(fileId).scrollLeft,
    };
  }, [fileId, fitMode, pageNumber, toolMode, zoom]);

  const applyPresentationPageFit = useCallback(() => {
    const viewport = viewportRef.current;
    if (
      !viewport
      || pageCount === 0
      || !usePdfViewerStore.getState().getSession(fileId).isPresentationModeActive
    ) {
      return;
    }

    const baseSize = pageSizes[pageNumber] ?? PDF_VIEWER_DEFAULT_PAGE_SIZE;
    const availableWidth = Math.max(1, viewport.clientWidth - PDF_VIEWER_VIEWPORT_PADDING_X);
    const availableHeight = Math.max(1, viewport.clientHeight - PDF_VIEWER_VIEWPORT_PADDING_Y);
    const nextZoom = Math.min(
      availableWidth / Math.max(1, baseSize.width),
      availableHeight / Math.max(1, baseSize.height),
    );

    if (Math.abs(nextZoom - zoom) > 0.01 || fitMode !== 'page') {
      setZoom(fileId, nextZoom, 'page');
    }

    const targetPageNumber = pageNumber;
    window.requestAnimationFrame(() => {
      const session = usePdfViewerStore.getState().getSession(fileId);
      if (session.isPresentationModeActive && session.pageNumber === targetPageNumber) {
        scrollToPage(targetPageNumber);
      }
    });
  }, [fileId, fitMode, pageCount, pageNumber, pageSizes, scrollToPage, setZoom, zoom]);

  const handleFullscreenChange = useCallback(() => {
    const pane = paneRef.current;
    const isPaneFullscreen = Boolean(pane && document.fullscreenElement === pane);
    if (isPaneFullscreen) {
      const session = usePdfViewerStore.getState().getSession(fileId);
      if (!session.isPresentationModeActive) {
        const restoreState = presentationRestoreRef.current ?? createPresentationRestoreState();
        presentationRestoreRef.current = restoreState;
        enterPresentationMode(fileId, restoreState);
      }
      hideSelectionToolbar();
      document.getSelection()?.removeAllRanges();
      resetPresentationWheelState();
      window.requestAnimationFrame(applyPresentationPageFit);
      return;
    }

    const session = usePdfViewerStore.getState().getSession(fileId);
    if (!session.isPresentationModeActive) {
      presentationRestoreRef.current = null;
      return;
    }

    const exitPageNumber = session.pageNumber;
    exitPresentationMode(fileId, exitPageNumber, presentationRestoreRef.current);
    presentationRestoreRef.current = null;
    resetPresentationWheelState();
    window.requestAnimationFrame(() => scrollToPage(exitPageNumber));
  }, [
    applyPresentationPageFit,
    createPresentationRestoreState,
    enterPresentationMode,
    exitPresentationMode,
    fileId,
    hideSelectionToolbar,
    resetPresentationWheelState,
    scrollToPage,
  ]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [handleFullscreenChange]);

  useEffect(() => {
    if (!isPresentationModeActive) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(applyPresentationPageFit);
    return () => window.cancelAnimationFrame(frameId);
  }, [applyPresentationPageFit, isPresentationModeActive]);

  useEffect(() => () => {
    const session = usePdfViewerStore.getState().getSession(fileId);
    if (session.isPresentationModeActive) {
      exitPresentationMode(fileId, session.pageNumber, presentationRestoreRef.current);
    }
    if (document.fullscreenElement === paneRef.current && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [exitPresentationMode, fileId]);

  const resolveBookmarkPageNumber = useCallback(async (bookmark: PdfBookmark): Promise<number | null> => {
    if (!pdfDocument) {
      return null;
    }

    let destination = bookmark.dest;
    if (typeof destination === 'string' && typeof pdfDocument.getDestination === 'function') {
      destination = await pdfDocument.getDestination(destination);
    }

    if (!Array.isArray(destination) || destination.length === 0) {
      return null;
    }

    const pageRef = destination[0];
    if (typeof pageRef === 'number') {
      return Math.min(Math.max(Math.floor(pageRef) + 1, 1), Math.max(pageCount, 1));
    }

    if (pageRef && typeof pageRef === 'object' && typeof pdfDocument.getPageIndex === 'function') {
      const pageIndex = await pdfDocument.getPageIndex(pageRef);
      return Math.min(Math.max(pageIndex + 1, 1), Math.max(pageCount, 1));
    }

    return null;
  }, [pageCount, pdfDocument]);

  const handleOpenExternalLink = useCallback((url: string) => {
    void window.electronAPI?.shell?.openExternal(url).catch(() => undefined);
  }, []);

  const handleOpenBookmark = useCallback((bookmark: PdfBookmark) => {
    const url = bookmark.url ? normalizeLinkUrl(bookmark.url) : null;
    if (url) {
      handleOpenExternalLink(url);
      return;
    }

    void resolveBookmarkPageNumber(bookmark)
      .then((nextPageNumber) => {
        if (nextPageNumber !== null) {
          scrollToPage(nextPageNumber);
        }
      })
      .catch(() => undefined);
  }, [handleOpenExternalLink, resolveBookmarkPageNumber, scrollToPage]);

  const updateZoom = useCallback((
    nextZoom: number,
    anchor?: { clientX: number; clientY: number },
    nextFitMode: PdfViewerFitMode = 'custom',
  ) => {
    const viewport = viewportRef.current;
    const normalizedZoom = clampZoom(nextZoom);
    if (normalizedZoom === zoom && fitMode === nextFitMode) {
      return;
    }

    let nextScrollLeft: number | null = null;
    let nextScrollTop: number | null = null;

    if (viewport && anchor) {
      const rect = viewport.getBoundingClientRect();
      const anchorX = anchor.clientX - rect.left + viewport.scrollLeft;
      const anchorY = anchor.clientY - rect.top + viewport.scrollTop;
      const zoomRatio = normalizedZoom / zoom;
      nextScrollLeft = anchorX * zoomRatio - (anchor.clientX - rect.left);
      nextScrollTop = anchorY * zoomRatio - (anchor.clientY - rect.top);
    }

    setZoom(fileId, normalizedZoom, nextFitMode);

    if (viewport && nextScrollLeft !== null && nextScrollTop !== null) {
      window.requestAnimationFrame(() => {
        setViewportScroll(viewport, nextScrollLeft, nextScrollTop);
        setScrollPosition(fileId, {
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        });
      });
    }
  }, [fileId, fitMode, setScrollPosition, setZoom, zoom]);

  const applyFitMode = useCallback((nextFitMode: Exclude<PdfViewerFitMode, 'custom'>) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setFitMode(fileId, nextFitMode);
      return;
    }

    const baseSize = pageSizes[pageNumber] ?? PDF_VIEWER_DEFAULT_PAGE_SIZE;
    const availableWidth = Math.max(1, viewport.clientWidth - PDF_VIEWER_VIEWPORT_PADDING_X);
    const availableHeight = Math.max(1, viewport.clientHeight - PDF_VIEWER_VIEWPORT_PADDING_Y);
    const widthZoom = availableWidth / Math.max(1, baseSize.width);
    const nextZoom = nextFitMode === 'width'
      ? widthZoom
      : Math.min(widthZoom, availableHeight / Math.max(1, baseSize.height));

    updateZoom(nextZoom, undefined, nextFitMode);
  }, [fileId, pageNumber, pageSizes, setFitMode, updateZoom]);

  useEffect(() => {
    if (fitMode === 'custom' || pageCount === 0) {
      return;
    }

    applyFitMode(fitMode);
  }, [applyFitMode, fitMode, pageCount, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!activeSearchMatch) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const matchElement = viewport?.querySelector<HTMLElement>(
        `[data-pdf-search-match-index="${activeSearchMatch.globalIndex}"]`,
      );
      if (matchElement && typeof matchElement.scrollIntoView === 'function') {
        matchElement.scrollIntoView({ block: 'center', inline: 'center' });
      } else if (viewport) {
        scrollToPage(activeSearchMatch.pageNumber);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeSearchMatch, scrollToPage]);

  useEffect(() => {
    if (activeSearchMatchIndex >= searchMatches.length && searchMatches.length > 0) {
      setActiveSearchMatchIndex(fileId, searchMatches.length - 1, searchMatches.length);
    }
  }, [activeSearchMatchIndex, fileId, searchMatches.length, setActiveSearchMatchIndex]);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isThumbnailRailVisible || pageCount === 0) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const activeThumbnail = thumbnailRailRef.current?.querySelector<HTMLElement>(
        `[data-testid="pdf-viewer-thumbnail-${pageNumber}"]`,
      );
      activeThumbnail?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isThumbnailRailVisible, pageCount, pageNumber]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (isPresentationModeActive) {
      event.preventDefault();
      const currentTime = Date.now();
      if (
        presentationWheelTimeStampRef.current > 0
        && currentTime - presentationWheelTimeStampRef.current < PDF_PRESENTATION_WHEEL_COOLDOWN_MS
      ) {
        return;
      }

      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (
        (presentationWheelDeltaRef.current > 0 && delta < 0)
        || (presentationWheelDeltaRef.current < 0 && delta > 0)
      ) {
        presentationWheelDeltaRef.current = 0;
      }

      presentationWheelDeltaRef.current += delta;
      if (Math.abs(presentationWheelDeltaRef.current) < PDF_PRESENTATION_WHEEL_THRESHOLD_PX) {
        return;
      }

      const totalDelta = presentationWheelDeltaRef.current;
      presentationWheelDeltaRef.current = 0;
      if (totalDelta > 0) {
        if (canGoNext) {
          scrollToPage(pageNumber + 1);
          presentationWheelTimeStampRef.current = currentTime;
        }
      } else if (canGoPrevious) {
        scrollToPage(pageNumber - 1);
        presentationWheelTimeStampRef.current = currentTime;
      }
      return;
    }

    if (event.ctrlKey) {
      event.preventDefault();
      updateZoom(zoom + (event.deltaY < 0 ? PDF_VIEWER_ZOOM_STEP : -PDF_VIEWER_ZOOM_STEP), {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      return;
    }

    if (scrollMode === 'page') {
      event.preventDefault();
      const currentTime = Date.now();
      if (
        pageScrollWheelTimeStampRef.current > 0
        && currentTime - pageScrollWheelTimeStampRef.current < PDF_PAGE_SCROLL_WHEEL_COOLDOWN_MS
      ) {
        return;
      }

      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (
        (pageScrollWheelDeltaRef.current > 0 && delta < 0)
        || (pageScrollWheelDeltaRef.current < 0 && delta > 0)
      ) {
        pageScrollWheelDeltaRef.current = 0;
      }

      pageScrollWheelDeltaRef.current += delta;
      if (Math.abs(pageScrollWheelDeltaRef.current) < PDF_PAGE_SCROLL_WHEEL_THRESHOLD_PX) {
        return;
      }

      const totalDelta = pageScrollWheelDeltaRef.current;
      pageScrollWheelDeltaRef.current = 0;
      if (totalDelta > 0 && canGoNext) {
        scrollToPage(pageNumber + 1);
        pageScrollWheelTimeStampRef.current = currentTime;
      } else if (totalDelta < 0 && canGoPrevious) {
        scrollToPage(pageNumber - 1);
        pageScrollWheelTimeStampRef.current = currentTime;
      }
      return;
    }

    if (scrollMode === 'horizontal') {
      event.preventDefault();
      const viewport = event.currentTarget;
      const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      setViewportScroll(viewport, viewport.scrollLeft + horizontalDelta, viewport.scrollTop);
      setScrollPosition(fileId, {
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      });
      return;
    }

    if (event.shiftKey) {
      event.preventDefault();
      const viewport = event.currentTarget;
      const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      setViewportScroll(viewport, viewport.scrollLeft + horizontalDelta, viewport.scrollTop);
      setScrollPosition(fileId, {
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      });
    }
  }, [
    canGoNext,
    canGoPrevious,
    fileId,
    isPresentationModeActive,
    pageNumber,
    scrollMode,
    scrollToPage,
    setScrollPosition,
    updateZoom,
    zoom,
  ]);

  const handleViewportMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (isPresentationModeActive) {
      hideSelectionToolbar();
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    isTextSelectingRef.current = toolMode === 'select' && Boolean(target?.closest('[data-pdf-text-layer="true"]'));
    hideSelectionToolbar();
  }, [hideSelectionToolbar, isPresentationModeActive, toolMode]);

  const handleViewportMouseUp = useCallback(() => {
    if (isPresentationModeActive) {
      isTextSelectingRef.current = false;
      return;
    }

    const wasTextSelecting = isTextSelectingRef.current;
    isTextSelectingRef.current = false;
    if (wasTextSelecting || getPdfSelectionInfo(viewportRef.current, zoom, { requireSinglePage: true })) {
      scheduleSelectionToolbarUpdate();
    }
  }, [isPresentationModeActive, scheduleSelectionToolbarUpdate, zoom]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (isPresentationModeActive || toolMode !== 'hand' || event.button !== 0) {
      return;
    }

    event.preventDefault();
    const viewport = event.currentTarget;
    handDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture?.(event.pointerId);
    setIsHandDragging(true);
  }, [isPresentationModeActive, toolMode]);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragState = handDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const viewport = event.currentTarget;
    setViewportScroll(
      viewport,
      dragState.scrollLeft - (event.clientX - dragState.startX),
      dragState.scrollTop - (event.clientY - dragState.startY),
    );
    setScrollPosition(fileId, {
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
  }, [fileId, setScrollPosition]);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (handDragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      handDragRef.current = null;
      setIsHandDragging(false);
    }
  }, []);

  const handlePresentationKeyCommand = useCallback((event: { key: string; preventDefault: () => void }) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        {
          const currentPageNumber = usePdfViewerStore.getState().getSession(fileId).pageNumber;
          exitPresentationMode(fileId, currentPageNumber, presentationRestoreRef.current);
        }
        if (typeof document.exitFullscreen === 'function' && document.fullscreenElement === paneRef.current) {
          void document.exitFullscreen().catch(() => undefined);
        }
        return true;
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        event.preventDefault();
        if (canGoNext) {
          scrollToPage(pageNumber + 1);
        }
        return true;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        event.preventDefault();
        if (canGoPrevious) {
          scrollToPage(pageNumber - 1);
        }
        return true;
      case 'Home':
        event.preventDefault();
        scrollToPage(1);
        return true;
      case 'End':
        event.preventDefault();
        scrollToPage(pageCount);
        return true;
      default:
        return false;
    }
  }, [
    canGoNext,
    canGoPrevious,
    exitPresentationMode,
    fileId,
    pageCount,
    pageNumber,
    scrollToPage,
  ]);

  useEffect(() => {
    if (!isPresentationModeActive) {
      return undefined;
    }

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      handlePresentationKeyCommand(event);
    };
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [handlePresentationKeyCommand, isPresentationModeActive]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && (selectedHighlightId || commentHighlightId)) {
      event.preventDefault();
      event.stopPropagation();
      closeHighlightInteraction(fileId);
      return;
    }

    if (isPresentationModeActive) {
      if (handlePresentationKeyCommand(event)) {
        event.stopPropagation();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setSearchOpen(fileId, true);
      return;
    }

    if (scrollMode !== 'page') {
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      scrollToPage(1);
    } else if (event.key === 'End') {
      event.preventDefault();
      scrollToPage(pageCount);
    } else if ((event.key === 'ArrowDown' || event.key === 'PageDown') && canGoNext) {
      event.preventDefault();
      scrollToPage(pageNumber + 1);
    } else if ((event.key === 'ArrowUp' || event.key === 'PageUp') && canGoPrevious) {
      event.preventDefault();
      scrollToPage(pageNumber - 1);
    }
  }, [
    canGoNext,
    canGoPrevious,
    closeHighlightInteraction,
    commentHighlightId,
    fileId,
    handlePresentationKeyCommand,
    isPresentationModeActive,
    pageCount,
    pageNumber,
    scrollMode,
    scrollToPage,
    selectedHighlightId,
    setSearchOpen,
  ]);

  const handleViewportClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!isPresentationModeActive) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-pdf-link="true"], button, input, textarea, [role="button"]')) {
        return;
      }
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        return;
      }

      const viewport = viewportRef.current;
      const annotation = viewport && toolMode === 'select'
        ? getHighlightAtViewportPoint(viewport, highlightAnnotations, zoom, event.clientX, event.clientY)
        : null;
      if (annotation) {
        event.stopPropagation();
        setSelectedHighlight(fileId, annotation.id);
      } else {
        closeHighlightInteraction(fileId);
      }
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-pdf-link="true"], button, input, textarea, [role="button"]')) {
      return;
    }

    event.preventDefault();
    if (event.shiftKey) {
      if (canGoPrevious) {
        scrollToPage(pageNumber - 1);
      }
      return;
    }

    if (canGoNext) {
      scrollToPage(pageNumber + 1);
    }
  }, [
    canGoNext,
    canGoPrevious,
    closeHighlightInteraction,
    fileId,
    highlightAnnotations,
    isPresentationModeActive,
    pageNumber,
    scrollToPage,
    setSelectedHighlight,
    toolMode,
    zoom,
  ]);

  const handleViewportDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (isPresentationModeActive || toolMode !== 'select') {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-pdf-link="true"], button, input, textarea, [role="button"]')) {
      return;
    }

    const viewport = viewportRef.current;
    const annotation = viewport
      ? getHighlightAtViewportPoint(viewport, highlightAnnotations, zoom, event.clientX, event.clientY)
      : null;
    if (!annotation) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    hideSelectionToolbar();
    setCommentHighlight(fileId, annotation.id);
  }, [
    fileId,
    hideSelectionToolbar,
    highlightAnnotations,
    isPresentationModeActive,
    setCommentHighlight,
    toolMode,
    zoom,
  ]);

  useEffect(() => {
    if (toolMode === 'hand' || isPresentationModeActive) {
      closeHighlightInteraction(fileId);
    }
  }, [closeHighlightInteraction, fileId, isPresentationModeActive, toolMode]);

  useEffect(() => () => {
    closeHighlightInteraction(fileId);
  }, [closeHighlightInteraction, fileId]);

  const handleFirstPage = () => scrollToPage(1);
  const handlePreviousPage = () => scrollToPage(pageNumber - 1);
  const handleNextPage = () => scrollToPage(pageNumber + 1);
  const handleLastPage = () => scrollToPage(pageCount);
  const handleRotate = (delta: number) => {
    hideSelectionToolbar();
    rotate(fileId, delta);
    window.requestAnimationFrame(() => scrollToPage(pageNumber));
  };
  const handleRotateClockwise = () => handleRotate(90);
  const handleRotateCounterclockwise = () => handleRotate(-90);
  const handleScrollModeChange = (nextScrollMode: PdfViewerScrollMode) => {
    if (scrollMode === nextScrollMode) {
      return;
    }

    hideSelectionToolbar();
    resetPageScrollWheelState();
    scrollModeRestorePageRef.current = pageNumber;
    setScrollMode(fileId, nextScrollMode);
  };
  const handlePresentationMode = () => {
    if (isPresentationModeActive) {
      const currentPageNumber = usePdfViewerStore.getState().getSession(fileId).pageNumber;
      exitPresentationMode(fileId, currentPageNumber, presentationRestoreRef.current);
      if (typeof document.exitFullscreen === 'function' && document.fullscreenElement === paneRef.current) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    const pane = paneRef.current;
    if (!pane || !isFullscreenSupported || typeof pane.requestFullscreen !== 'function') {
      return;
    }

    const restoreState = createPresentationRestoreState();
    presentationRestoreRef.current = restoreState;
    enterPresentationMode(fileId, restoreState);
    hideSelectionToolbar();
    setInfoPanelOpen(fileId, false);
    document.getSelection()?.removeAllRanges();

    void pane.requestFullscreen().catch(() => {
      const restoreState = presentationRestoreRef.current;
      presentationRestoreRef.current = null;
      exitPresentationMode(fileId, undefined, restoreState);
    });
  };
  const handleZoomOut = () => updateZoom(zoom - PDF_VIEWER_ZOOM_STEP);
  const handleZoomIn = () => updateZoom(zoom + PDF_VIEWER_ZOOM_STEP);
  const handleResetZoom = () => updateZoom(PDF_VIEWER_DEFAULT_ZOOM);
  const handleRetry = () => setReloadToken((current) => current + 1);
  const handleWidthFit = () => {
    setFitMode(fileId, 'width');
    applyFitMode('width');
  };
  const handlePageFit = () => {
    setFitMode(fileId, 'page');
    applyFitMode('page');
  };
  const handleSelectTool = () => setToolMode(fileId, 'select');
  const handleHandTool = () => setToolMode(fileId, 'hand');
  const handleSearchToggle = () => setSearchOpen(fileId, !isSearchOpen);
  const handleSearchClear = () => {
    setSearchQuery(fileId, '');
    setSearchOpen(fileId, false);
  };
  const handleSearchPrevious = () => {
    if (searchMatches.length === 0) {
      return;
    }
    setActiveSearchMatchIndex(
      fileId,
      (activeSearchMatchIndex - 1 + searchMatches.length) % searchMatches.length,
      searchMatches.length,
    );
  };
  const handleSearchNext = () => {
    if (searchMatches.length === 0) {
      return;
    }
    setActiveSearchMatchIndex(fileId, (activeSearchMatchIndex + 1) % searchMatches.length, searchMatches.length);
  };
  const handleAddHighlight = () => {
    addHighlightFromCurrentSelection('highlight');
  };
  const handleSelectionToolbarHighlight = () => {
    addHighlightFromCurrentSelection('highlight', { requireSinglePage: true });
  };
  const handleSelectionToolbarUnderline = () => {
    addHighlightFromCurrentSelection('underline', { requireSinglePage: true });
  };
  const handleSelectionToolbarStrikethrough = () => {
    addHighlightFromCurrentSelection('strikethrough', { requireSinglePage: true });
  };

  return (
    <div
      ref={paneRef}
      data-testid="pdf-viewer-pane"
      data-pdf-presentation-mode={isPresentationModeActive ? 'true' : undefined}
      className={[
        'relative flex min-h-0 flex-1 flex-col text-ide-text',
        isPresentationModeActive ? 'bg-black' : 'bg-ide-editor-bg',
      ].join(' ')}
    >
      {!isPresentationModeActive && (
        <div
          data-testid="pdf-viewer-toolbar"
          className="flex h-9 shrink-0 items-center gap-1 border-b border-ide-border bg-ide-tab-bg px-2 text-[12px]"
        >
          <span className="min-w-0 flex-1 truncate text-ide-text-muted" title={fileName}>
            {fileName}
          </span>
          <div className="flex items-center gap-1">
          <TooltipIconButton content="Toggle Bookmarks">
            <button
              type="button"
              aria-label="Toggle Bookmarks"
              aria-pressed={isBookmarkTreeVisible}
              data-testid="pdf-viewer-toggle-bookmarks"
              disabled={isLoading || !pdfDocument}
              onClick={() => setBookmarkTreeVisible(fileId, !isBookmarkTreeVisible)}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                isBookmarkTreeVisible ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <PanelLeft size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Toggle Thumbnails">
            <button
              type="button"
              aria-label="Toggle Thumbnails"
              aria-pressed={isThumbnailRailVisible}
              data-testid="pdf-viewer-toggle-thumbnails"
              disabled={isLoading || !pdfDocument}
              onClick={() => setThumbnailRailVisible(fileId, !isThumbnailRailVisible)}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                isThumbnailRailVisible ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <PanelRight size={14} />
            </button>
          </TooltipIconButton>
          <div className="mx-1 h-4 w-px bg-ide-border" />
          <TooltipIconButton content="Page Scrolling">
            <button
              type="button"
              aria-label="Page Scrolling"
              aria-pressed={scrollMode === 'page'}
              data-testid="pdf-viewer-scroll-mode-page"
              disabled={isLoading || !pdfDocument}
              onClick={() => handleScrollModeChange('page')}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                scrollMode === 'page' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <PanelTop size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Vertical Scrolling">
            <button
              type="button"
              aria-label="Vertical Scrolling"
              aria-pressed={scrollMode === 'vertical'}
              data-testid="pdf-viewer-scroll-mode-vertical"
              disabled={isLoading || !pdfDocument}
              onClick={() => handleScrollModeChange('vertical')}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                scrollMode === 'vertical' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <Rows3 size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Horizontal Scrolling">
            <button
              type="button"
              aria-label="Horizontal Scrolling"
              aria-pressed={scrollMode === 'horizontal'}
              data-testid="pdf-viewer-scroll-mode-horizontal"
              disabled={isLoading || !pdfDocument}
              onClick={() => handleScrollModeChange('horizontal')}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                scrollMode === 'horizontal' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <Columns3 size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Wrapped Scrolling">
            <button
              type="button"
              aria-label="Wrapped Scrolling"
              aria-pressed={scrollMode === 'wrapped'}
              data-testid="pdf-viewer-scroll-mode-wrapped"
              disabled={isLoading || !pdfDocument}
              onClick={() => handleScrollModeChange('wrapped')}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                scrollMode === 'wrapped' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <WrapText size={14} />
            </button>
          </TooltipIconButton>
          <div className="mx-1 h-4 w-px bg-ide-border" />
          <TooltipIconButton content="Go to First Page">
            <button
              type="button"
              aria-label="Go to First Page"
              data-testid="pdf-viewer-first-page"
              disabled={!canGoFirst || isLoading}
              onClick={handleFirstPage}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <ChevronsUp size={15} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Previous Page">
            <button
              type="button"
              aria-label="Previous Page"
              data-testid="pdf-viewer-prev-page"
              disabled={!canGoPrevious || isLoading}
              onClick={handlePreviousPage}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
          </TooltipIconButton>
          <span data-testid="pdf-viewer-page-indicator" className="min-w-20 text-center text-ide-text-muted">
            {pageCount > 0 ? `${pageNumber} / ${pageCount}` : '- / -'}
          </span>
          <TooltipIconButton content="Next Page">
            <button
              type="button"
              aria-label="Next Page"
              data-testid="pdf-viewer-next-page"
              disabled={!canGoNext || isLoading}
              onClick={handleNextPage}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Go to Last Page">
            <button
              type="button"
              aria-label="Go to Last Page"
              data-testid="pdf-viewer-last-page"
              disabled={!canGoLast || isLoading}
              onClick={handleLastPage}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <ChevronsDown size={15} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Rotate Clockwise">
            <button
              type="button"
              aria-label="Rotate Clockwise"
              data-testid="pdf-viewer-rotate-clockwise"
              disabled={isLoading || !pdfDocument}
              onClick={handleRotateClockwise}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <RotateCw size={15} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Rotate Counterclockwise">
            <button
              type="button"
              aria-label="Rotate Counterclockwise"
              data-testid="pdf-viewer-rotate-counterclockwise"
              disabled={isLoading || !pdfDocument}
              onClick={handleRotateCounterclockwise}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <RotateCcw size={15} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Presentation Mode">
            <button
              type="button"
              aria-label="Presentation Mode"
              data-testid="pdf-viewer-presentation-mode"
              disabled={isLoading || !pdfDocument || !isFullscreenSupported}
              onClick={handlePresentationMode}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <Presentation size={15} />
            </button>
          </TooltipIconButton>
          <div className="mx-1 h-4 w-px bg-ide-border" />
          <TooltipIconButton content="Select Text">
            <button
              type="button"
              aria-label="Select Text"
              aria-pressed={toolMode === 'select'}
              data-testid="pdf-viewer-select-tool"
              disabled={isLoading}
              onClick={handleSelectTool}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                toolMode === 'select' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <MousePointer2 size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Hand Tool">
            <button
              type="button"
              aria-label="Hand Tool"
              aria-pressed={toolMode === 'hand'}
              data-testid="pdf-viewer-hand-tool"
              disabled={isLoading}
              onClick={handleHandTool}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                toolMode === 'hand' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <Hand size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Highlight Selection">
            <button
              type="button"
              aria-label="Highlight Selection"
              data-testid="pdf-viewer-highlight-selection"
              disabled={isLoading || !pdfDocument || toolMode === 'hand'}
              onClick={handleAddHighlight}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <Highlighter size={14} />
            </button>
          </TooltipIconButton>
          <Popover open={isInfoPanelOpen} onOpenChange={(open) => setInfoPanelOpen(fileId, open)}>
            <TooltipIconButton content="PDF Information">
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="PDF Information"
                  aria-pressed={isInfoPanelOpen}
                  data-testid="pdf-viewer-info-menu"
                  disabled={isLoading || !pdfDocument}
                  className={[
                    'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                    isInfoPanelOpen ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
                  ].join(' ')}
                >
                  <Info size={14} />
                </button>
              </PopoverTrigger>
            </TooltipIconButton>
            <PopoverContent
              align="end"
              side="bottom"
              sideOffset={8}
              data-testid="pdf-viewer-info-content"
              className="w-[400px] max-w-[calc(100vw-32px)] min-w-0 border-ide-border bg-ide-tab-bg p-4 text-ide-text shadow-xl"
            >
              <PdfInfoPopoverContent
                info={pdfDocumentInfo}
                isLoading={isPdfDocumentInfoLoading}
                errorMessage={pdfDocumentInfoError}
                onClose={() => setInfoPanelOpen(fileId, false)}
              />
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Page tone"
                title={`Page tone: ${getPageToneLabel(pageToneMode)}`}
                data-testid="pdf-viewer-page-tone-menu"
                disabled={isLoading || !pdfDocument}
                className={[
                  'rounded p-1 ![box-shadow:none] outline-none transition-colors hover:bg-ide-hover focus:![box-shadow:none] focus:outline-none focus:ring-0 focus-visible:![box-shadow:none] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-default disabled:opacity-40',
                  pageToneMode === 'auto' ? 'text-ide-text-muted hover:text-ide-text' : 'bg-ide-hover text-ide-text',
                ].join(' ')}
              >
                <Contrast size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              data-testid="pdf-viewer-page-tone-menu-content"
              className="border-ide-border bg-ide-tab-bg text-ide-text shadow-lg"
            >
              {PDF_VIEWER_PAGE_TONE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  data-testid={`pdf-viewer-page-tone-${option.value}`}
                  data-selected={pageToneMode === option.value ? 'true' : undefined}
                  onSelect={() => setPageToneMode(fileId, option.value)}
                  className={[
                    'text-[12px] text-ide-text focus:bg-ide-hover focus:text-ide-text',
                    pageToneMode === option.value ? 'bg-ide-hover' : '',
                  ].join(' ')}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="mx-1 h-4 w-px bg-ide-border" />
          <TooltipIconButton content="Fit Width">
            <button
              type="button"
              aria-label="Fit Width"
              aria-pressed={fitMode === 'width'}
              data-testid="pdf-viewer-fit-width"
              disabled={isLoading || !pdfDocument}
              onClick={handleWidthFit}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                fitMode === 'width' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <MoveHorizontal size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Fit Page">
            <button
              type="button"
              aria-label="Fit Page"
              aria-pressed={fitMode === 'page'}
              data-testid="pdf-viewer-fit-page"
              disabled={isLoading || !pdfDocument}
              onClick={handlePageFit}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                fitMode === 'page' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <Maximize2 size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Zoom Out">
            <button
              type="button"
              aria-label="Zoom Out"
              data-testid="pdf-viewer-zoom-out"
              disabled={zoom <= PDF_VIEWER_MIN_ZOOM || isLoading}
              onClick={handleZoomOut}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <ZoomOut size={15} />
            </button>
          </TooltipIconButton>
          <span data-testid="pdf-viewer-zoom-indicator" className="min-w-12 text-center text-ide-text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <TooltipIconButton content="Zoom In">
            <button
              type="button"
              aria-label="Zoom In"
              data-testid="pdf-viewer-zoom-in"
              disabled={zoom >= PDF_VIEWER_MAX_ZOOM || isLoading}
              onClick={handleZoomIn}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <ZoomIn size={15} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Reset Zoom">
            <button
              type="button"
              aria-label="Reset Zoom"
              data-testid="pdf-viewer-reset-zoom"
              disabled={zoom === PDF_VIEWER_DEFAULT_ZOOM || isLoading}
              onClick={handleResetZoom}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <RotateCcw size={14} />
            </button>
          </TooltipIconButton>
          <div className="mx-1 h-4 w-px bg-ide-border" />
          <TooltipIconButton content="Search PDF">
            <button
              type="button"
              aria-label="Search PDF"
              aria-pressed={isSearchOpen}
              data-testid="pdf-viewer-search-toggle"
              disabled={isLoading || !pdfDocument}
              onClick={handleSearchToggle}
              className={[
                'rounded p-1 transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                isSearchOpen ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              <Search size={14} />
            </button>
          </TooltipIconButton>
          </div>
        </div>
      )}
      {!isPresentationModeActive && isSearchOpen && (
        <div
          data-testid="pdf-viewer-search-bar"
          className="flex h-9 shrink-0 items-center gap-2 border-b border-ide-border bg-ide-editor-bg px-2 text-[12px]"
        >
          <Search size={14} className="text-ide-text-muted" />
          <input
            ref={searchInputRef}
            aria-label="Search PDF text"
            data-testid="pdf-viewer-search-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(fileId, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.shiftKey) {
                handleSearchPrevious();
              } else if (event.key === 'Enter') {
                handleSearchNext();
              } else if (event.key === 'Escape') {
                handleSearchClear();
              }
            }}
            placeholder="Search PDF"
            className="h-6 min-w-0 flex-1 rounded border border-ide-border bg-ide-tab-bg px-2 text-[12px] text-ide-text caret-ide-text outline-none selection:bg-ide-accent/45 selection:text-white placeholder:text-ide-text-muted focus:border-ide-accent"
          />
          <span data-testid="pdf-viewer-search-count" className="min-w-16 text-right text-ide-text-muted">
            {normalizedSearchQuery
              ? `${searchMatches.length === 0 ? 0 : activeSearchMatchIndex + 1} / ${searchMatches.length}`
              : '0 / 0'}
          </span>
          <TooltipIconButton content="Previous Match">
            <button
              type="button"
              aria-label="Previous Match"
              data-testid="pdf-viewer-search-prev"
              disabled={searchMatches.length === 0}
              onClick={handleSearchPrevious}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Next Match">
            <button
              type="button"
              aria-label="Next Match"
              data-testid="pdf-viewer-search-next"
              disabled={searchMatches.length === 0}
              onClick={handleSearchNext}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text disabled:cursor-default disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </TooltipIconButton>
          <TooltipIconButton content="Close Search">
            <button
              type="button"
              aria-label="Close Search"
              data-testid="pdf-viewer-search-close"
              onClick={handleSearchClear}
              className="rounded p-1 text-ide-text-muted transition-colors hover:bg-ide-hover hover:text-ide-text"
            >
              <X size={14} />
            </button>
          </TooltipIconButton>
        </div>
      )}
      {loadError ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
          <div className="max-w-md">
            <AlertTriangle className="mx-auto mb-3 text-ide-warning" size={28} />
            <p className="text-[14px] font-medium text-ide-text">Unable to open PDF</p>
            <p className="mt-1 break-words text-[12px] text-ide-text-muted">{loadError}</p>
            <button
              type="button"
              data-testid="pdf-viewer-retry"
              onClick={handleRetry}
              className="mt-4 rounded border border-ide-border bg-ide-tab-bg px-3 py-1.5 text-[12px] text-ide-text transition-colors hover:bg-ide-hover"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {pdfDocument && !isPresentationModeActive && isBookmarkTreeVisible && (
            <PdfBookmarkTree
              bookmarks={bookmarks}
              expandedBookmarkIds={expandedBookmarkIds}
              onToggleBookmark={(bookmarkId) => toggleBookmarkExpanded(fileId, bookmarkId)}
              onOpenBookmark={handleOpenBookmark}
            />
          )}
          <div
            ref={viewportRef}
            data-testid="pdf-viewer-scroll-viewport"
            data-scroll-mode={scrollMode}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onKeyUp={scheduleSelectionToolbarUpdate}
            onClick={handleViewportClick}
            onDoubleClick={handleViewportDoubleClick}
            onMouseDown={handleViewportMouseDown}
            onMouseUp={handleViewportMouseUp}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onScroll={handleViewportScroll}
            onWheel={handleWheel}
            className={[
              'min-h-0 flex-1 overflow-auto focus:outline-none',
              isPresentationModeActive ? 'bg-black' : 'bg-ide-editor-bg',
              !isPresentationModeActive && toolMode === 'hand' ? (isHandDragging ? 'cursor-grabbing' : 'cursor-grab') : '',
            ].join(' ')}
          >
            <div
              className={[
                isPresentationModeActive ? 'flex min-h-full min-w-full items-center justify-center px-6 py-6' : '',
                !isPresentationModeActive && scrollMode === 'horizontal' ? 'min-h-full min-w-max px-6 py-6' : '',
                !isPresentationModeActive && scrollMode !== 'horizontal' ? 'min-w-full px-6 py-6' : '',
              ].join(' ')}
            >
              <div
                data-testid="pdf-viewer-page-layout"
                data-scroll-mode={scrollMode}
                className={[
                  'relative max-w-none',
                  isPresentationModeActive || scrollMode === 'page' || scrollMode === 'vertical' ? 'mx-auto w-max' : '',
                  !isPresentationModeActive && scrollMode === 'horizontal' ? 'flex w-max min-h-full items-start gap-6' : '',
                  !isPresentationModeActive && scrollMode === 'wrapped' ? 'flex w-full flex-wrap items-start justify-center gap-6' : '',
                ].join(' ')}
              >
                {isLoading && (
                  <div
                    data-testid="pdf-viewer-loading"
                    className="absolute inset-0 z-10 flex min-h-40 items-center justify-center rounded border border-ide-border bg-ide-editor-bg/85 text-[12px] text-ide-text-muted"
                  >
                    Loading PDF...
                  </div>
                )}
                {renderError && (
                  <div
                    data-testid="pdf-viewer-render-error"
                    className="mb-3 rounded border border-ide-error/40 bg-ide-error/10 px-3 py-2 text-[12px] text-ide-error"
                  >
                    {renderError}
                  </div>
                )}
                {pdfDocument && visiblePageNumbers.map((currentPageNumber) => {
                  const shouldRender = isPresentationModeActive
                    || (currentPageNumber >= renderedPageRange.start && currentPageNumber <= renderedPageRange.end);
                  const pageSize = getPageSize(pageSizes, currentPageNumber, zoom);
                  return (
                    <div
                      key={currentPageNumber}
                      data-pdf-page-number={currentPageNumber}
                      data-testid={`pdf-viewer-page-${currentPageNumber}`}
                      className={[
                        'flex justify-center',
                        scrollMode === 'horizontal' || scrollMode === 'wrapped' ? 'shrink-0' : '',
                      ].join(' ')}
                      style={scrollMode === 'vertical' ? { marginBottom: PDF_VIEWER_PAGE_GAP_PX } : undefined}
                    >
                      <div
                        className="relative"
                        data-pdf-page-content="true"
                        data-pdf-page-number={currentPageNumber}
                        style={{ height: pageSize.height, width: pageSize.width }}
                      >
                        <PdfPageCanvas
                          pageNumber={currentPageNumber}
                          pdfDocument={pdfDocument}
                          zoom={zoom}
                          rotation={rotation}
                          shouldRender={shouldRender}
                          pageSize={pageSize}
                          pageToneMode={pageToneMode}
                          onPageSizeChange={handlePageSizeChange}
                          onRenderError={setRenderError}
                        />
                        <PdfPageHighlightLayer
                          pageNumber={currentPageNumber}
                          pageSize={pageSize}
                          zoom={zoom}
                          annotations={highlightAnnotations}
                          selectedHighlightId={selectedHighlightId}
                        />
                        <PdfPageTextLayer
                          pageNumber={currentPageNumber}
                          pdfDocument={pdfDocument}
                          zoom={zoom}
                          rotation={rotation}
                          shouldRender={shouldRender}
                          pageSize={pageSize}
                          toolMode={effectiveToolMode}
                          searchMatches={searchMatches.filter((match) => match.pageNumber === currentPageNumber)}
                          activeSearchMatchIndex={activeSearchMatchIndex}
                          onTextItemsChange={handleTextItemsChange}
                        />
                        <PdfPageLinkLayer
                          pageNumber={currentPageNumber}
                          pdfDocument={pdfDocument}
                          zoom={zoom}
                          rotation={rotation}
                          shouldRender={shouldRender}
                          pageSize={pageSize}
                          textItems={pageTextItems[currentPageNumber] ?? []}
                          onOpenLink={handleOpenExternalLink}
                        />
                        {highlightAnnotations
                          .filter((annotation) => (
                            annotation.pageNumber === currentPageNumber
                            && (annotation.id === selectedHighlightId || annotation.id === commentHighlightId)
                          ))
                          .map((annotation) => (
                            <PdfHighlightInteractionOverlay
                              key={annotation.id}
                              annotation={annotation}
                              mode={annotation.id === commentHighlightId ? 'comments' : 'controls'}
                              zoom={zoom}
                              onClose={() => closeHighlightInteraction(fileId)}
                              onColorChange={(color) => setHighlightAnnotationColor(fileId, annotation.id, color)}
                              onDelete={() => removeHighlightAnnotation(fileId, annotation.id)}
                              onSubmitComment={(body) => addHighlightComment(fileId, annotation.id, body) !== null}
                            />
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {pdfDocument && pageCount > 0 && !isPresentationModeActive && isThumbnailRailVisible && (
            <div
              ref={thumbnailRailRef}
              data-testid="pdf-viewer-thumbnail-rail"
              className="w-[108px] shrink-0 overflow-y-auto border-l border-ide-border bg-ide-tab-bg/80 px-2 py-2"
            >
              <div className="flex flex-col gap-2">
                {pageNumbers.map((currentPageNumber) => (
                  <PdfThumbnailCanvas
                    key={currentPageNumber}
                    pageNumber={currentPageNumber}
                    pdfDocument={pdfDocument}
                    rotation={rotation}
                    isActive={currentPageNumber === pageNumber}
                    shouldRender={
                      cachedThumbnailPages.has(currentPageNumber)
                      || renderingThumbnailPages.has(currentPageNumber)
                      || thumbnailRenderSlots.has(currentPageNumber)
                    }
                    pageToneMode={pageToneMode}
                    onClick={() => scrollToPage(currentPageNumber)}
                    onRenderStart={handleThumbnailRenderStart}
                    onRenderComplete={handleThumbnailRenderComplete}
                    onRenderCancelled={handleThumbnailRenderCancelled}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {!isPresentationModeActive && selectionToolbar && (
        <PdfSelectionToolbar
          state={selectionToolbar}
          onHighlight={handleSelectionToolbarHighlight}
          onUnderline={handleSelectionToolbarUnderline}
          onStrikethrough={handleSelectionToolbarStrikethrough}
          toolbarRef={selectionToolbarRef}
        />
      )}
      {showDragInteractionShield && (
        <div
          data-testid={dragInteractionShieldTestId}
          className="absolute inset-0 z-50 bg-transparent"
        />
      )}
    </div>
  );
}
