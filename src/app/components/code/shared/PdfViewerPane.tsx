import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type UIEvent,
  type WheelEvent,
} from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Hand,
  Maximize2,
  MousePointer2,
  RotateCcw,
  Search,
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
  type PdfViewerFitMode,
  type PdfViewerToolMode,
  usePdfViewerStore,
} from '../../../pdf/usePdfViewerStore';
import { isAbsoluteFilePath } from '../../../workspace/workspaceFiles';
import { TooltipIconButton } from '../../ui/tooltip-icon-button';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDFJS_ASSET_BASE_URL = './generated/pdfjs/';
const PDF_VIEWER_DEFAULT_PAGE_SIZE = { width: 600, height: 800 };
const PDF_VIEWER_PAGE_GAP_PX = 24;
const PDF_VIEWER_RENDER_OVERSCAN = 2;
const PDF_VIEWER_VIEWPORT_PADDING_X = 48;
const PDF_VIEWER_VIEWPORT_PADDING_Y = 48;
const PDF_VIEWER_THUMBNAIL_WIDTH_PX = 78;
const PDF_VIEWER_THUMBNAIL_OVERSCAN = 4;

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

interface PdfTextItem {
  itemIndex: number;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PdfSearchMatch {
  pageNumber: number;
  itemIndex: number;
  globalIndex: number;
}

type PdfTransform = [number, number, number, number, number, number];

interface PdfPageCanvasProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  zoom: number;
  shouldRender: boolean;
  pageSize: PdfPageSize;
  onPageSizeChange: (pageNumber: number, size: PdfPageSize) => void;
  onRenderError: (message: string | null) => void;
}

interface PdfPageTextLayerProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  zoom: number;
  shouldRender: boolean;
  pageSize: PdfPageSize;
  toolMode: PdfViewerToolMode;
  searchMatches: PdfSearchMatch[];
  activeSearchMatchIndex: number;
  onTextItemsChange: (pageNumber: number, items: PdfTextItem[]) => void;
}

interface PdfThumbnailCanvasProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  isActive: boolean;
  shouldRender: boolean;
  onClick: () => void;
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
): number {
  if (pageCount <= 0) {
    return 1;
  }

  const viewportCenter = viewport.scrollTop + viewport.clientHeight / 2;
  let closestPage = 1;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const pageElement = viewport.querySelector<HTMLElement>(`[data-pdf-page-number="${pageNumber}"]`);
    const pageTop = pageElement?.offsetTop || getPageOffsetTop(pageSizes, pageNumber, zoom);
    const pageHeight = pageElement?.offsetHeight || getPageSize(pageSizes, pageNumber, zoom).height;
    const pageCenter = pageTop + pageHeight / 2;
    const distance = Math.abs(pageCenter - viewportCenter);

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

function normalizeTransform(value: unknown, fallback: PdfTransform): PdfTransform {
  if (!Array.isArray(value) || value.length < 6) {
    return fallback;
  }

  const nextTransform = value.slice(0, 6).map((entry) => (
    typeof entry === 'number' && Number.isFinite(entry) ? entry : 0
  )) as PdfTransform;

  return nextTransform;
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

function getNormalizedSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function PdfPageCanvas({
  pageNumber,
  pdfDocument,
  zoom,
  shouldRender,
  pageSize,
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
        const viewport = page.getViewport({ scale: zoom });
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
  }, [onPageSizeChange, onRenderError, pageNumber, pdfDocument, shouldRender, zoom]);

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
      className="block rounded-sm bg-white shadow-[0_10px_35px_rgba(0,0,0,0.35)]"
      style={pageStyle}
    />
  );
}

function PdfPageTextLayer({
  pageNumber,
  pdfDocument,
  zoom,
  shouldRender,
  pageSize,
  toolMode,
  searchMatches,
  activeSearchMatchIndex,
  onTextItemsChange,
}: PdfPageTextLayerProps) {
  const [textItems, setTextItems] = useState<PdfTextItem[]>([]);
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

        const viewport = page.getViewport({ scale: zoom });
        const textContent = await page.getTextContent();
        const viewportTransform = normalizeTransform(
          viewport.transform,
          [zoom, 0, 0, -zoom, 0, viewport.height],
        );

        return (textContent.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>)
          .map((item, itemIndex) => {
            const text = item.str ?? '';
            const itemTransform = normalizeTransform(item.transform, [1, 0, 0, 1, 0, 0]);
            const transform = multiplyTransform(viewportTransform, itemTransform);
            const height = Math.max(1, Math.hypot(transform[2], transform[3]) || (item.height ?? 10) * zoom);
            const width = Math.max(1, (item.width ?? text.length * 7) * zoom);

            return {
              itemIndex,
              text,
              left: transform[4],
              top: transform[5] - height,
              width,
              height,
            };
          })
          .filter((item) => item.text.length > 0);
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
  }, [onTextItemsChange, pageNumber, pdfDocument, shouldRender, zoom]);

  if (!shouldRender || textItems.length === 0) {
    return null;
  }

  return (
    <div
      data-testid={`pdf-viewer-text-layer-${pageNumber}`}
      className={[
        'absolute inset-0 overflow-hidden',
        toolMode === 'hand' ? 'pointer-events-none select-none' : 'select-text',
      ].join(' ')}
      style={{ height: pageSize.height, width: pageSize.width }}
    >
      {textItems.map((item) => {
        const match = matchByItemIndex.get(item.itemIndex);
        const isActiveMatch = match?.globalIndex === activeSearchMatchIndex;
        return (
          <span
            key={`${pageNumber}-${item.itemIndex}`}
            data-testid={match ? 'pdf-viewer-search-highlight' : undefined}
            data-pdf-search-match-index={match?.globalIndex}
            className={[
              'absolute whitespace-pre text-transparent selection:bg-sky-400/35',
              match ? 'rounded-sm bg-amber-300/35' : '',
              isActiveMatch ? 'outline outline-1 outline-amber-200 bg-amber-300/60' : '',
            ].join(' ')}
            style={{
              left: item.left,
              top: item.top,
              width: item.width,
              height: item.height,
              fontSize: item.height,
              lineHeight: '1',
            }}
          >
            {item.text}
          </span>
        );
      })}
    </div>
  );
}

function PdfThumbnailCanvas({
  pageNumber,
  pdfDocument,
  isActive,
  shouldRender,
  onClick,
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

    void pdfDocument.getPage(pageNumber)
      .then((page) => {
        if (cancelled) {
          return undefined;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = PDF_VIEWER_THUMBNAIL_WIDTH_PX / Math.max(1, baseViewport.width);
        const viewport = page.getViewport({ scale });
        const outputScale = Math.max(window.devicePixelRatio || 1, 1);
        setThumbnailSize({ width: viewport.width, height: viewport.height });
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        return renderTask.promise;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pageNumber, pdfDocument, shouldRender]);

  return (
    <button
      type="button"
      data-testid={`pdf-viewer-thumbnail-${pageNumber}`}
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
          className="rounded-sm bg-white shadow-sm"
          style={{ width: thumbnailSize.width, height: thumbnailSize.height }}
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

export function PdfViewerPane({
  fileId,
  fileName,
  showDragInteractionShield,
  dragInteractionShieldTestId,
}: PdfViewerPaneProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const restoredScrollForFileRef = useRef<string | null>(null);
  const handDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSizes, setPageSizes] = useState<Record<number, PdfPageSize>>({});
  const [pageTextItems, setPageTextItems] = useState<Record<number, PdfTextItem[]>>({});
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isHandDragging, setIsHandDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const {
    activeSearchMatchIndex,
    fitMode,
    isSearchOpen,
    pageNumber,
    searchQuery,
    toolMode,
    zoom,
  } = usePdfViewerStore((state) => state.getSession(fileId));
  const setActiveSearchMatchIndex = usePdfViewerStore((state) => state.setActiveSearchMatchIndex);
  const setFitMode = usePdfViewerStore((state) => state.setFitMode);
  const setPageNumber = usePdfViewerStore((state) => state.setPageNumber);
  const setPageNumberFromViewport = usePdfViewerStore((state) => state.setPageNumberFromViewport);
  const setScrollPosition = usePdfViewerStore((state) => state.setScrollPosition);
  const setSearchOpen = usePdfViewerStore((state) => state.setSearchOpen);
  const setSearchQuery = usePdfViewerStore((state) => state.setSearchQuery);
  const setToolMode = usePdfViewerStore((state) => state.setToolMode);
  const setZoom = usePdfViewerStore((state) => state.setZoom);
  const canGoPrevious = pageNumber > 1;
  const canGoNext = pageCount > 0 && pageNumber < pageCount;
  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );
  const renderedPageRange = useMemo(() => ({
    start: Math.max(1, pageNumber - PDF_VIEWER_RENDER_OVERSCAN),
    end: Math.min(pageCount, pageNumber + PDF_VIEWER_RENDER_OVERSCAN),
  }), [pageCount, pageNumber]);
  const renderedThumbnailRange = useMemo(() => ({
    start: Math.max(1, pageNumber - PDF_VIEWER_THUMBNAIL_OVERSCAN),
    end: Math.min(pageCount, pageNumber + PDF_VIEWER_THUMBNAIL_OVERSCAN),
  }), [pageCount, pageNumber]);
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

  useEffect(() => {
    restoredScrollForFileRef.current = null;
    setPageSizes({});
    setPageTextItems({});
  }, [fileId, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;

    const readBytes = getPdfBytesReader(fileId);
    if (!readBytes) {
      setPdfDocument(null);
      setPageCount(0);
      setIsLoading(false);
      setLoadError('Filesystem API unavailable');
      return undefined;
    }

    setIsLoading(true);
    setLoadError(null);
    setRenderError(null);
    setPdfDocument(null);
    setPageCount(0);

    void readBytes(fileId)
      .then((bytes) => getDocument({
        data: normalizePdfBytes(bytes),
        cMapPacked: true,
        cMapUrl: `${PDFJS_ASSET_BASE_URL}cmaps/`,
        standardFontDataUrl: `${PDFJS_ASSET_BASE_URL}standard_fonts/`,
      }).promise)
      .then((document) => {
        if (cancelled) {
          cleanupPdfDocument(document);
          return;
        }

        loadedDocument = document;
        setPdfDocument(document);
        setPageCount(document.numPages);
        setPageNumber(fileId, usePdfViewerStore.getState().getSession(fileId).pageNumber, document.numPages);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setPdfDocument(null);
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

  const handleTextItemsChange = useCallback((nextPageNumber: number, items: PdfTextItem[]) => {
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
    setScrollPosition(fileId, {
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
    setPageNumberFromViewport(
      fileId,
      getViewportPageNumber(viewport, pageCount, pageSizes, zoom),
      pageCount,
    );
  }, [fileId, pageCount, pageSizes, setPageNumberFromViewport, setScrollPosition, zoom]);

  const scrollToPage = useCallback((nextPageNumber: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setPageNumber(fileId, nextPageNumber, pageCount);
      return;
    }

    const normalizedPageNumber = Math.min(Math.max(nextPageNumber, 1), Math.max(pageCount, 1));
    const pageElement = viewport.querySelector<HTMLElement>(`[data-pdf-page-number="${normalizedPageNumber}"]`);
    const nextScrollTop = pageElement?.offsetTop || getPageOffsetTop(pageSizes, normalizedPageNumber, zoom);
    setViewportScroll(viewport, viewport.scrollLeft, nextScrollTop);
    setScrollPosition(fileId, {
      scrollLeft: viewport.scrollLeft,
      scrollTop: nextScrollTop,
    });
    setPageNumber(fileId, normalizedPageNumber, pageCount);
  }, [fileId, pageCount, pageSizes, setPageNumber, setScrollPosition, zoom]);

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

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey) {
      event.preventDefault();
      updateZoom(zoom + (event.deltaY < 0 ? PDF_VIEWER_ZOOM_STEP : -PDF_VIEWER_ZOOM_STEP), {
        clientX: event.clientX,
        clientY: event.clientY,
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
  }, [fileId, setScrollPosition, updateZoom, zoom]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'hand' || event.button !== 0) {
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
  }, [toolMode]);

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

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setSearchOpen(fileId, true);
    }
  }, [fileId, setSearchOpen]);

  const handlePreviousPage = () => scrollToPage(pageNumber - 1);
  const handleNextPage = () => scrollToPage(pageNumber + 1);
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

  return (
    <div data-testid="pdf-viewer-pane" className="relative flex min-h-0 flex-1 flex-col bg-ide-editor-bg text-ide-text">
      <div
        data-testid="pdf-viewer-toolbar"
        className="flex h-9 shrink-0 items-center gap-1 border-b border-ide-border bg-ide-tab-bg px-2 text-[12px]"
      >
        <span className="min-w-0 flex-1 truncate text-ide-text-muted" title={fileName}>
          {fileName}
        </span>
        <div className="flex items-center gap-1">
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
                'rounded px-2 py-1 text-[11px] transition-colors hover:bg-ide-hover disabled:cursor-default disabled:opacity-40',
                fitMode === 'width' ? 'bg-ide-hover text-ide-text' : 'text-ide-text-muted hover:text-ide-text',
              ].join(' ')}
            >
              Width
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
      {isSearchOpen && (
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
            className="h-6 min-w-0 flex-1 rounded border border-ide-border bg-ide-tab-bg px-2 text-[12px] text-ide-text outline-none placeholder:text-ide-text-muted focus:border-ide-accent"
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
          <div
            ref={viewportRef}
            data-testid="pdf-viewer-scroll-viewport"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onScroll={handleViewportScroll}
            onWheel={handleWheel}
            className={[
              'min-h-0 flex-1 overflow-auto bg-ide-editor-bg focus:outline-none',
              toolMode === 'hand' ? (isHandDragging ? 'cursor-grabbing' : 'cursor-grab') : '',
            ].join(' ')}
          >
            <div className="min-w-full px-6 py-6">
              <div className="relative mx-auto w-max max-w-none">
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
                {pdfDocument && pageNumbers.map((currentPageNumber) => {
                  const shouldRender = currentPageNumber >= renderedPageRange.start && currentPageNumber <= renderedPageRange.end;
                  const pageSize = getPageSize(pageSizes, currentPageNumber, zoom);
                  return (
                    <div
                      key={currentPageNumber}
                      data-pdf-page-number={currentPageNumber}
                      data-testid={`pdf-viewer-page-${currentPageNumber}`}
                      className="flex justify-center"
                      style={{ marginBottom: PDF_VIEWER_PAGE_GAP_PX }}
                    >
                      <div className="relative" style={{ height: pageSize.height, width: pageSize.width }}>
                        <PdfPageCanvas
                          pageNumber={currentPageNumber}
                          pdfDocument={pdfDocument}
                          zoom={zoom}
                          shouldRender={shouldRender}
                          pageSize={pageSize}
                          onPageSizeChange={handlePageSizeChange}
                          onRenderError={setRenderError}
                        />
                        <PdfPageTextLayer
                          pageNumber={currentPageNumber}
                          pdfDocument={pdfDocument}
                          zoom={zoom}
                          shouldRender={shouldRender}
                          pageSize={pageSize}
                          toolMode={toolMode}
                          searchMatches={searchMatches.filter((match) => match.pageNumber === currentPageNumber)}
                          activeSearchMatchIndex={activeSearchMatchIndex}
                          onTextItemsChange={handleTextItemsChange}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {pdfDocument && pageCount > 0 && (
            <div
              data-testid="pdf-viewer-thumbnail-rail"
              className="w-[108px] shrink-0 overflow-y-auto border-l border-ide-border bg-ide-tab-bg/80 px-2 py-2"
            >
              <div className="flex flex-col gap-2">
                {pageNumbers.map((currentPageNumber) => (
                  <PdfThumbnailCanvas
                    key={currentPageNumber}
                    pageNumber={currentPageNumber}
                    pdfDocument={pdfDocument}
                    isActive={currentPageNumber === pageNumber}
                    shouldRender={
                      currentPageNumber >= renderedThumbnailRange.start
                      && currentPageNumber <= renderedThumbnailRange.end
                    }
                    onClick={() => scrollToPage(currentPageNumber)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
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
