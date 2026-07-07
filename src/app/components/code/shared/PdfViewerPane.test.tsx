import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

interface MockPdfDocumentOptions {
  annotations?: Record<number, Array<Record<string, unknown>>>;
  outline?: Array<Record<string, unknown>>;
}

function createMockPdfDocument(
  pageCount = 2,
  pageTexts: Record<number, string[]> = {},
  options: MockPdfDocumentOptions = {},
) {
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
      convertToViewportRectangle: (rect: number[]) => {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = rect;
        return [
          x1 * scale,
          (800 - y1) * scale,
          x2 * scale,
          (800 - y2) * scale,
        ];
      },
    }),
    getAnnotations: vi.fn(async () => options.annotations?.[pageNumber] ?? []),
    render,
  }));

  return {
    cleanup: vi.fn(),
    destroy: vi.fn(),
    getDestination: vi.fn(async (name: string) => (name === 'chapter-2' ? [{ num: 2, gen: 0 }] : null)),
    getOutline: vi.fn(async () => options.outline ?? []),
    getPage,
    getPageIndex: vi.fn(async () => 1),
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('renders bookmarks and link overlays, and opens links through Electron shell', async () => {
    const pdfDocument = createMockPdfDocument(2, {
      1: ['Read more at https://example.com/spec'],
      2: ['Chapter 2'],
    }, {
      annotations: {
        1: [{ rect: [24, 720, 160, 744], url: 'https://example.com/annotated' }],
      },
      outline: [
        { title: 'Chapter 2', dest: 'chapter-2', items: [] },
      ],
    });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 2'));

    const bookmark = await screen.findByTestId('pdf-viewer-bookmark-bookmark-0');
    expect(screen.getByTestId('pdf-viewer-bookmark-tree')).toBeInTheDocument();
    expect(screen.getByText('Bookmarks')).toHaveClass('font-normal');
    expect(screen.getByText('Bookmarks')).not.toHaveClass('font-semibold');
    expect(bookmark).toHaveClass('font-normal');

    fireEvent.click(bookmark);
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('2 / 2'));

    const link = await screen.findByTestId('pdf-viewer-link-1-0');
    expect(link).toHaveClass('cursor-pointer');
    expect(link).toHaveClass('focus-visible:ring-ide-accent');
    expect(link).not.toHaveClass('hover:bg-sky-400/10');
    fireEvent.click(link);
    expect(window.electronAPI!.shell.openExternal).toHaveBeenCalledWith('https://example.com/annotated');
  });

  it('toggles bookmark and thumbnail rails and uses an icon-only fit width control', async () => {
    const pdfDocument = createMockPdfDocument(2);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 2'));

    expect(screen.getByTestId('pdf-viewer-bookmark-tree')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-thumbnail-rail')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-fit-width')).not.toHaveTextContent('Width');

    fireEvent.click(screen.getByTestId('pdf-viewer-toggle-bookmarks'));
    expect(screen.queryByTestId('pdf-viewer-bookmark-tree')).not.toBeInTheDocument();
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').isBookmarkTreeVisible).toBe(false);

    fireEvent.click(screen.getByTestId('pdf-viewer-toggle-thumbnails'));
    expect(screen.queryByTestId('pdf-viewer-thumbnail-rail')).not.toBeInTheDocument();
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').isThumbnailRailVisible).toBe(false);
  });

  it('creates local highlight overlays from the current text selection', async () => {
    const pdfDocument = createMockPdfDocument(1, {
      1: ['Selectable annotation text'],
    });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await screen.findByTestId('pdf-viewer-text-layer-1');
    const pageContent = screen.getByTestId('pdf-viewer-page-1')
      .querySelector<HTMLElement>('[data-pdf-page-content="true"]');
    expect(pageContent).not.toBeNull();
    vi.spyOn(pageContent!, 'getBoundingClientRect').mockReturnValue({
      bottom: 820,
      height: 800,
      left: 10,
      right: 610,
      top: 20,
      width: 600,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    const removeAllRanges = vi.fn();
    const selection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'Selectable annotation text',
      getRangeAt: () => ({
        getClientRects: () => [{
          bottom: 66,
          height: 16,
          left: 50,
          right: 210,
          top: 50,
          width: 160,
          x: 50,
          y: 50,
          toJSON: () => ({}),
        }],
      }),
      removeAllRanges,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection);

    fireEvent.click(screen.getByTestId('pdf-viewer-highlight-selection'));

    expect(await screen.findByTestId('pdf-viewer-highlight')).toBeInTheDocument();
    expect(removeAllRanges).toHaveBeenCalled();
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').highlightAnnotations).toHaveLength(1);
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

    const secondThumbnail = screen.getByTestId('pdf-viewer-thumbnail-2');
    const scrollIntoView = vi.fn();
    Object.defineProperty(secondThumbnail, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    viewport.scrollTop = 900;
    fireEvent.scroll(viewport);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('2 / 3'));
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').scrollTop).toBe(900);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' }));

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
    expect(searchInput).toHaveClass('text-ide-text');
    expect(searchInput).toHaveClass('caret-ide-text');
    expect(searchInput).toHaveClass('selection:bg-ide-accent/45');
    expect(searchInput).toHaveClass('selection:text-white');
    expect(searchInput).toHaveClass('placeholder:text-ide-text-muted');
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
