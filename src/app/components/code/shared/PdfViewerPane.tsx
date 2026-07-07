import { useEffect, useRef, useState } from 'react';
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

interface PdfViewerPaneProps {
  fileId: string;
  fileName: string;
  showDragInteractionShield?: boolean;
  dragInteractionShieldTestId?: string;
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

export function PdfViewerPane({
  fileId,
  fileName,
  showDragInteractionShield,
  dragInteractionShieldTestId,
}: PdfViewerPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const { pageNumber, zoom } = usePdfViewerStore((state) => state.getSession(fileId));
  const setPageNumber = usePdfViewerStore((state) => state.setPageNumber);
  const setZoom = usePdfViewerStore((state) => state.setZoom);
  const canGoPrevious = pageNumber > 1;
  const canGoNext = pageCount > 0 && pageNumber < pageCount;

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
    if (!pdfDocument || pageCount === 0) {
      return undefined;
    }

    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      setRenderError('Unable to prepare PDF canvas');
      return undefined;
    }

    setRenderError(null);

    void pdfDocument.getPage(pageNumber)
      .then((page) => {
        if (cancelled) {
          return;
        }

        const outputScale = Math.max(window.devicePixelRatio || 1, 1);
        const viewport = page.getViewport({ scale: zoom });
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        return renderTask.promise;
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setRenderError(getErrorMessage(error));
      });

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pageCount, pageNumber, pdfDocument, zoom]);

  const handlePreviousPage = () => setPageNumber(fileId, pageNumber - 1, pageCount);
  const handleNextPage = () => setPageNumber(fileId, pageNumber + 1, pageCount);
  const handleZoomOut = () => setZoom(fileId, zoom - PDF_VIEWER_ZOOM_STEP);
  const handleZoomIn = () => setZoom(fileId, zoom + PDF_VIEWER_ZOOM_STEP);
  const handleResetZoom = () => setZoom(fileId, PDF_VIEWER_DEFAULT_ZOOM);
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
      <div className="flex min-h-0 flex-1 overflow-auto bg-ide-editor-bg">
        {loadError ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center">
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
          <div className="flex min-w-full justify-center px-6 py-6">
            <div className="relative">
              {isLoading && (
                <div
                  data-testid="pdf-viewer-loading"
                  className="absolute inset-0 z-10 flex items-center justify-center rounded border border-ide-border bg-ide-editor-bg/85 text-[12px] text-ide-text-muted"
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
              <canvas
                ref={canvasRef}
                data-testid="pdf-viewer-canvas"
                className="block rounded-sm bg-white shadow-[0_10px_35px_rgba(0,0,0,0.35)]"
              />
            </div>
          </div>
        )}
      </div>
      {showDragInteractionShield && (
        <div
          data-testid={dragInteractionShieldTestId}
          className="absolute inset-0 z-50 bg-transparent"
        />
      )}
    </div>
  );
}
