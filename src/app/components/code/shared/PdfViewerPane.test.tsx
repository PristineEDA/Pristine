import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfViewerPane } from './PdfViewerPane';
import { usePdfViewerStore } from '../../../pdf/usePdfViewerStore';

const { mockGetDocument } = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.worker.mjs?url', () => ({
  default: 'mock-pdf-worker-url',
}));

function createMockPdfDocument(pageCount = 2, pageTexts: Record<number, string[]> = {}) {
  const cancelRenderTask = vi.fn();
  const render = vi.fn(() => ({
    promise: Promise.resolve(),
    cancel: cancelRenderTask,
  }));
  const getPage = vi.fn(async (pageNumber: number) => ({
    getTextContent: vi.fn(async () => ({
      items: (pageTexts[pageNumber] ?? [`Page ${pageNumber} timing text`]).map((text, index) => ({
        str: text,
        transform: [12, 0, 0, 12, 24, 760 - index * 24],
        width: text.length * 7,
        height: 12,
      })),
    })),
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      transform: [scale, 0, 0, -scale, 0, 800 * scale],
    }),
    render,
  }));

  return {
    cleanup: vi.fn(),
    destroy: vi.fn(),
    getPage,
    numPages: pageCount,
    render,
    cancelRenderTask,
  };
}

function setElementSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: height,
  });
}

describe('PdfViewerPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePdfViewerStore.getState().resetPdfViewerStoreForTests();
    vi.mocked(window.electronAPI!.fs.readFileBinary).mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  it('loads PDF bytes and renders continuous pages, thumbnails, and text layers', async () => {
    const pdfDocument = createMockPdfDocument(2, {
      1: ['Pristine timing report'],
      2: ['Waveform debug appendix'],
    });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 2'));

    expect(window.electronAPI!.fs.readFileBinary).toHaveBeenCalledWith('docs/spec.pdf');
    expect(mockGetDocument).toHaveBeenCalledWith(expect.objectContaining({
      cMapPacked: true,
      cMapUrl: './generated/pdfjs/cmaps/',
      standardFontDataUrl: './generated/pdfjs/standard_fonts/',
    }));
    expect(pdfDocument.getPage).toHaveBeenCalledWith(1);
    expect(pdfDocument.getPage).toHaveBeenCalledWith(2);
    expect(screen.getByTestId('pdf-viewer-scroll-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-thumbnail-rail')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-thumbnail-1')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('pdf-viewer-page-1')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-page-2')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-page-canvas-1')).toHaveAttribute('width', '600');
    expect(screen.getByTestId('pdf-viewer-page-canvas-1')).toHaveAttribute('height', '800');
    expect(await screen.findByTestId('pdf-viewer-text-layer-1')).toBeInTheDocument();
    expect(await screen.findByTestId('pdf-viewer-text-layer-2')).toBeInTheDocument();
  });

  it('supports page navigation, thumbnail navigation, and zoom controls', async () => {
    const pdfDocument = createMockPdfDocument(3);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 3'));

    fireEvent.click(screen.getByTestId('pdf-viewer-next-page'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('2 / 3'));
    expect(pdfDocument.getPage).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTestId('pdf-viewer-thumbnail-3'));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('3 / 3'));

    fireEvent.click(screen.getByTestId('pdf-viewer-zoom-in'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-zoom-indicator')).toHaveTextContent('125%'));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-canvas-3')).toHaveAttribute('width', '750'));
    expect(pdfDocument.cancelRenderTask).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('pdf-viewer-reset-zoom'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-zoom-indicator')).toHaveTextContent('100%'));
  });

  it('supports width/page fit and returns to custom mode on manual zoom', async () => {
    const pdfDocument = createMockPdfDocument(1);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    const viewport = await screen.findByTestId('pdf-viewer-scroll-viewport');
    setElementSize(viewport, 900, 700);
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 1'));

    fireEvent.click(screen.getByTestId('pdf-viewer-fit-width'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-fit-width')).toHaveAttribute('aria-pressed', 'true'));
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').fitMode).toBe('width');
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').zoom).toBeGreaterThan(1);

    fireEvent.click(screen.getByTestId('pdf-viewer-fit-page'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-fit-page')).toHaveAttribute('aria-pressed', 'true'));
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').fitMode).toBe('page');

    fireEvent.click(screen.getByTestId('pdf-viewer-zoom-in'));

    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').fitMode).toBe('custom'));
  });

  it('tracks viewport scroll, hand dragging, and wheel shortcuts', async () => {
    const pdfDocument = createMockPdfDocument(3);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    const viewport = await screen.findByTestId('pdf-viewer-scroll-viewport');
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 3'));

    viewport.scrollTop = 900;
    fireEvent.scroll(viewport);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('2 / 3'));
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').scrollTop).toBe(900);

    const shiftWheel = createEvent.wheel(viewport, {
      cancelable: true,
      deltaY: 72,
      shiftKey: true,
    });
    fireEvent(viewport, shiftWheel);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').scrollLeft).toBe(72);

    const ctrlWheel = createEvent.wheel(viewport, {
      cancelable: true,
      clientX: 20,
      clientY: 20,
      ctrlKey: true,
      deltaY: -120,
    });
    fireEvent(viewport, ctrlWheel);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-zoom-indicator')).toHaveTextContent('125%'));

    fireEvent.click(screen.getByTestId('pdf-viewer-hand-tool'));
    viewport.scrollLeft = 100;
    viewport.scrollTop = 200;
    fireEvent.pointerDown(viewport, { button: 0, clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 80, clientY: 70, pointerId: 1 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').toolMode).toBe('hand');
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').scrollLeft).toBe(140);
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').scrollTop).toBe(250);
  });

  it('supports PDF text search, match navigation, and no-result state', async () => {
    const pdfDocument = createMockPdfDocument(2, {
      1: ['Pristine timing report', 'RTL hierarchy'],
      2: ['Waveform timing marker', 'Schematic graph'],
    });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 2'));
    await screen.findByTestId('pdf-viewer-text-layer-2');

    fireEvent.click(screen.getByTestId('pdf-viewer-search-toggle'));
    const searchInput = screen.getByTestId('pdf-viewer-search-input');
    fireEvent.change(searchInput, { target: { value: 'timing' } });

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-search-count')).toHaveTextContent('1 / 2'));
    expect(screen.getAllByTestId('pdf-viewer-search-highlight')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('pdf-viewer-search-next'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-search-count')).toHaveTextContent('2 / 2'));
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').activeSearchMatchIndex).toBe(1);

    fireEvent.change(searchInput, { target: { value: 'missing' } });

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-search-count')).toHaveTextContent('0 / 0'));
    expect(screen.queryByTestId('pdf-viewer-search-highlight')).not.toBeInTheDocument();
  });

  it('opens search with Ctrl+F and disables text selection in hand mode', async () => {
    const pdfDocument = createMockPdfDocument(1, { 1: ['Searchable PDF text'] });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    const viewport = await screen.findByTestId('pdf-viewer-scroll-viewport');
    await screen.findByTestId('pdf-viewer-text-layer-1');

    fireEvent.keyDown(viewport, { key: 'f', ctrlKey: true });

    expect(screen.getByTestId('pdf-viewer-search-input')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pdf-viewer-hand-tool'));

    expect(within(screen.getByTestId('pdf-viewer-page-1')).getByTestId('pdf-viewer-text-layer-1')).toHaveClass('pointer-events-none');
  });

  it('shows an inline error and can retry a failed load', async () => {
    vi.mocked(window.electronAPI!.fs.readFileBinary)
      .mockRejectedValueOnce(new Error('Read failed'))
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    const pdfDocument = createMockPdfDocument(1);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/broken.pdf" fileName="broken.pdf" />);

    await waitFor(() => expect(screen.getByText('Unable to open PDF')).toBeInTheDocument());
    expect(screen.getByText('Read failed')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pdf-viewer-retry'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 1'));
    expect(window.electronAPI!.fs.readFileBinary).toHaveBeenCalledTimes(2);
  });
});
