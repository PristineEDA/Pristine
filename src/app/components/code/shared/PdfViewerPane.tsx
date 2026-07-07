import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type UIEvent, type WheelEvent } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import {
  PDF_VIEWER_DEFAULT_ZOOM,
  PDF_VIEWER_MAX_ZOOM,
  PDF_VIEWER_MIN_ZOOM,
  PDF_VIEWER_ZOOM_STEP,
  usePdfViewerStore,
} from '../../../pdf/usePdfViewerStore';
import { isAbsoluteFilePath } from '../../../workspace/workspaceFiles';
import { TooltipIconButton } from '../../ui/tooltip-icon-button';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDFJS_ASSET_BASE_URL = './generated/pdfjs/';
const PDF_VIEWER_DEFAULT_PAGE_SIZE = { width: 600, height: 800 };
const PDF_VIEWER_PAGE_GAP_PX = 24;
const PDF_VIEWER_RENDER_OVERSCAN = 2;

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

interface PdfPageCanvasProps {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  zoom: number;
  shouldRender: boolean;
  pageSize: PdfPageSize;
  onPageSizeChange: (pageNumber: number, size: PdfPageSize) => void;
  onRenderError: (message: string | null) => void;
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
    minHeight: pageSize.height,
    width: pageSize.width,
  };

  return (
    <div
      data-pdf-page-number={pageNumber}
      data-testid={`pdf-viewer-page-${pageNumber}`}
      className="flex justify-center"
      style={{ marginBottom: PDF_VIEWER_PAGE_GAP_PX }}
    >
      {shouldRender ? (
        <canvas
          ref={canvasRef}
          data-testid={`pdf-viewer-page-canvas-${pageNumber}`}
          className="block rounded-sm bg-white shadow-[0_10px_35px_rgba(0,0,0,0.35)]"
          style={pageStyle}
        />
      ) : (
        <div
          data-testid={`pdf-viewer-page-placeholder-${pageNumber}`}
          className="rounded-sm border border-ide-border bg-ide-tab-bg/70"
          style={pageStyle}
        />
      )}
    </div>
  );
}

export function PdfViewerPane({
  fileId,
  fileName,
  showDragInteractionShield,
  dragInteractionShieldTestId,
}: PdfViewerPaneProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const restoredScrollForFileRef = useRef<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSizes, setPageSizes] = useState<Record<number, PdfPageSize>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const { pageNumber, zoom } = usePdfViewerStore((state) => state.getSession(fileId));
  const setPageNumber = usePdfViewerStore((state) => state.setPageNumber);
  const setPageNumberFromViewport = usePdfViewerStore((state) => state.setPageNumberFromViewport);
  const setScrollPosition = usePdfViewerStore((state) => state.setScrollPosition);
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

  useEffect(() => {
    restoredScrollForFileRef.current = null;
    setPageSizes({});
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

  const updateZoom = useCallback((nextZoom: number, anchor?: { clientX: number; clientY: number }) => {
    const viewport = viewportRef.current;
    const normalizedZoom = clampZoom(nextZoom);
    if (normalizedZoom === zoom) {
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

    setZoom(fileId, normalizedZoom);

    if (viewport && nextScrollLeft !== null && nextScrollTop !== null) {
      window.requestAnimationFrame(() => {
        setViewportScroll(viewport, nextScrollLeft, nextScrollTop);
        setScrollPosition(fileId, {
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        });
      });
    }
  }, [fileId, setScrollPosition, setZoom, zoom]);

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

  const handlePreviousPage = () => scrollToPage(pageNumber - 1);
  const handleNextPage = () => scrollToPage(pageNumber + 1);
  const handleZoomOut = () => updateZoom(zoom - PDF_VIEWER_ZOOM_STEP);
  const handleZoomIn = () => updateZoom(zoom + PDF_VIEWER_ZOOM_STEP);
  const handleResetZoom = () => updateZoom(PDF_VIEWER_DEFAULT_ZOOM);
  const handleRetry = () => setReloadToken((current) => current + 1);

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
        </div>
      </div>
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
        <div
          ref={viewportRef}
          data-testid="pdf-viewer-scroll-viewport"
          tabIndex={0}
          onScroll={handleViewportScroll}
          onWheel={handleWheel}
          className="min-h-0 flex-1 overflow-auto bg-ide-editor-bg focus:outline-none"
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
                return (
                  <PdfPageCanvas
                    key={currentPageNumber}
                    pageNumber={currentPageNumber}
                    pdfDocument={pdfDocument}
                    zoom={zoom}
                    shouldRender={shouldRender}
                    pageSize={getPageSize(pageSizes, currentPageNumber, zoom)}
                    onPageSizeChange={handlePageSizeChange}
                    onRenderError={setRenderError}
                  />
                );
              })}
            </div>
          </div>
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
