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
  info?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
  const getViewport = vi.fn(({ scale, rotation = 0 }: { scale: number; rotation?: number }) => {
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const isRotated = normalizedRotation === 90 || normalizedRotation === 270;
    const width = (isRotated ? 800 : 600) * scale;
    const height = (isRotated ? 600 : 800) * scale;
    const pageHeight = isRotated ? 600 : 800;
    return {
      width,
      height,
      transform: [scale, 0, 0, -scale, 0, height],
      convertToViewportRectangle: (rect: number[]) => {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = rect;
        return [
          x1 * scale,
          (pageHeight - y1) * scale,
          x2 * scale,
          (pageHeight - y2) * scale,
        ];
      },
    };
  });
  const getMetadata = vi.fn(async () => ({
    info: options.info ?? {},
    metadata: {
      get: vi.fn((key: string) => options.metadata?.[key]),
    },
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
    getViewport,
    getAnnotations: vi.fn(async () => options.annotations?.[pageNumber] ?? []),
    render,
  }));

  return {
    cleanup: vi.fn(),
    destroy: vi.fn(),
    getDestination: vi.fn(async (name: string) => (name === 'chapter-2' ? [{ num: 2, gen: 0 }] : null)),
    getMetadata,
    getViewport,
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

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockPdfSelection({
  isCollapsed = false,
  rects,
  text = 'Selectable annotation text',
}: {
  isCollapsed?: boolean;
  rects: DOMRect[];
  text?: string;
}) {
  const removeAllRanges = vi.fn();
  const selection = {
    isCollapsed,
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({
      getClientRects: () => rects,
    }),
    removeAllRanges,
  };
  vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection);
  return { removeAllRanges, selection };
}

let mockedFullscreenElement: Element | null = null;
const requestFullscreenMock = vi.fn(function requestFullscreen(this: Element) {
  mockedFullscreenElement = this;
  document.dispatchEvent(new Event('fullscreenchange'));
  return Promise.resolve();
});
const exitFullscreenMock = vi.fn(() => {
  mockedFullscreenElement = null;
  document.dispatchEvent(new Event('fullscreenchange'));
  return Promise.resolve();
});

describe('PdfViewerPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFullscreenElement = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => mockedFullscreenElement,
    });
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreenMock,
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreenMock,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreenMock,
    });
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

  it('shows PDF file information from document metadata', async () => {
    vi.mocked(window.electronAPI!.fs.readFileBinary).mockResolvedValue(new Uint8Array(828_734));
    const pdfDocument = createMockPdfDocument(11, {}, {
      info: {
        Author: 'Yuchi Miao',
        CreationDate: 'D:20260707074950',
        Creator: 'Typst 0.15.0',
        IsLinearized: false,
        Keywords: 'retroSoC',
        ModDate: 'D:20260707074950',
        PDFFormatVersion: '1.7',
      },
      metadata: {
        'dc:title': 'retroSoC Mini Gen2 Datasheet',
      },
    });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 11'));
    await waitFor(() => expect(pdfDocument.getMetadata).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('pdf-viewer-info-menu'));

    expect(await screen.findByTestId('pdf-viewer-info-popover')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-info-content')).toHaveClass('w-[400px]');
    expect(screen.getByTestId('pdf-viewer-info-popover')).toHaveClass('w-full');
    expect(screen.getByTestId('pdf-viewer-info-row-fileName')).toHaveClass('grid-cols-[132px_minmax(0,1fr)]', 'gap-2');
    expect(screen.getByTestId('pdf-viewer-info-fileName')).toHaveTextContent('spec.pdf');
    expect(screen.getByTestId('pdf-viewer-info-fileName')).toHaveClass('overflow-x-auto', 'whitespace-nowrap');
    expect(screen.getByTestId('pdf-viewer-info-fileName')).not.toHaveClass('break-words', '[overflow-wrap:anywhere]');
    expect(screen.getByTestId('pdf-viewer-info-fileSize')).toHaveTextContent('809 KB (828,734 bytes)');
    expect(screen.getByTestId('pdf-viewer-info-title')).toHaveTextContent('retroSoC Mini Gen2 Datasheet');
    expect(screen.getByTestId('pdf-viewer-info-author')).toHaveTextContent('Yuchi Miao');
    expect(screen.getByTestId('pdf-viewer-info-keywords')).toHaveTextContent('retroSoC');
    expect(screen.getByTestId('pdf-viewer-info-creator')).toHaveTextContent('Typst 0.15.0');
    expect(screen.getByTestId('pdf-viewer-info-pdfVersion')).toHaveTextContent('1.7');
    expect(screen.getByTestId('pdf-viewer-info-pageCount')).toHaveTextContent('11');
    expect(screen.getByTestId('pdf-viewer-info-pageSize')).toHaveTextContent('8.33 × 11.11 in (portrait)');
    expect(screen.getByTestId('pdf-viewer-info-fastWebView')).toHaveTextContent('No');
    expect(screen.getByTestId('pdf-viewer-info-creationDate')).toHaveTextContent('7/7/26, 7:49:50 AM');
    expect(screen.getByTestId('pdf-viewer-info-modificationDate')).toHaveTextContent('7/7/26, 7:49:50 AM');
  });

  it('closes the PDF information popover and shows placeholders for missing metadata', async () => {
    const pdfDocument = createMockPdfDocument(1);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 1'));

    fireEvent.click(screen.getByTestId('pdf-viewer-info-menu'));

    expect(await screen.findByTestId('pdf-viewer-info-popover')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-info-title')).toHaveTextContent('-');
    expect(screen.getByTestId('pdf-viewer-info-producer')).toHaveTextContent('-');
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').isInfoPanelOpen).toBe(true);

    fireEvent.click(screen.getByTestId('pdf-viewer-info-close'));

    await waitFor(() => expect(screen.queryByTestId('pdf-viewer-info-popover')).not.toBeInTheDocument());
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').isInfoPanelOpen).toBe(false);
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
    expect(screen.getByText('Bookmarks')).toHaveClass('text-[11px]');
    expect(screen.getByText('Bookmarks')).not.toHaveClass('uppercase');
    expect(screen.getByText('Bookmarks')).not.toHaveClass('tracking-wide');
    expect(screen.getByText('Bookmarks')).not.toHaveClass('font-semibold');
    expect(bookmark).toHaveClass('font-normal');
    expect(bookmark).toHaveClass('text-[11px]');
    expect(bookmark.closest('div')).toHaveClass('text-[11px]');

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

  it('applies page tone mode to page and thumbnail canvases', async () => {
    const pdfDocument = createMockPdfDocument(2);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 2'));

    const pageCanvas = screen.getByTestId('pdf-viewer-page-canvas-1');
    const thumbnailCanvas = screen.getByTestId('pdf-viewer-thumbnail-canvas-1');
    expect(pageCanvas).toHaveAttribute('data-pdf-page-tone-mode', 'auto');
    expect(pageCanvas).toHaveClass('dark:[filter:brightness(0.9)_contrast(0.96)]');
    expect(thumbnailCanvas).toHaveAttribute('data-pdf-page-tone-mode', 'auto');

    const pageToneMenu = screen.getByTestId('pdf-viewer-page-tone-menu');
    expect(pageToneMenu).toHaveClass('outline-none');
    expect(pageToneMenu).toHaveClass('focus:outline-none');
    expect(pageToneMenu).toHaveClass('focus:ring-0');
    expect(pageToneMenu).toHaveClass('focus-visible:outline-none');
    expect(pageToneMenu).toHaveClass('focus-visible:ring-0');
    expect(pageToneMenu).toHaveClass('focus-visible:ring-offset-0');
    expect(pageToneMenu).toHaveClass('focus-visible:![box-shadow:none]');

    fireEvent.pointerDown(pageToneMenu, { button: 0, ctrlKey: false });
    expect(await screen.findByTestId('pdf-viewer-page-tone-menu-content')).toHaveClass('bg-ide-tab-bg');
    expect(screen.getByTestId('pdf-viewer-page-tone-menu-content')).not.toHaveClass('bg-ide-panel');
    fireEvent.click(await screen.findByTestId('pdf-viewer-page-tone-soft'));

    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').pageToneMode).toBe('soft'));
    expect(pageCanvas).toHaveAttribute('data-pdf-page-tone-mode', 'soft');
    expect(pageCanvas).toHaveStyle({ filter: 'brightness(0.9) contrast(0.96)' });
    expect(thumbnailCanvas).toHaveAttribute('data-pdf-page-tone-mode', 'soft');
    expect(thumbnailCanvas).toHaveStyle({ filter: 'brightness(0.9) contrast(0.96)' });

    fireEvent.pointerDown(screen.getByTestId('pdf-viewer-page-tone-menu'), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByTestId('pdf-viewer-page-tone-original'));

    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').pageToneMode).toBe('original'));
    expect(pageCanvas).toHaveAttribute('data-pdf-page-tone-mode', 'original');
    expect(pageCanvas).not.toHaveClass('dark:[filter:brightness(0.9)_contrast(0.96)]');
    expect(pageCanvas).not.toHaveStyle({ filter: 'brightness(0.9) contrast(0.96)' });
    expect(thumbnailCanvas).toHaveAttribute('data-pdf-page-tone-mode', 'original');
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
    vi.spyOn(pageContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 20, 600, 800));
    const { removeAllRanges } = mockPdfSelection({
      rects: [createRect(50, 50, 160, 16)],
    });

    fireEvent.click(screen.getByTestId('pdf-viewer-highlight-selection'));

    expect(await screen.findByTestId('pdf-viewer-highlight')).toBeInTheDocument();
    expect(removeAllRanges).toHaveBeenCalled();
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').highlightAnnotations).toHaveLength(1);
  });

  it('shows a floating selection toolbar and highlights the selected text', async () => {
    const pdfDocument = createMockPdfDocument(1, {
      1: ['Selectable annotation text'],
    });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await screen.findByTestId('pdf-viewer-text-layer-1');
    vi.spyOn(screen.getByTestId('pdf-viewer-pane'), 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 800, 600));
    const pageContent = screen.getByTestId('pdf-viewer-page-1')
      .querySelector<HTMLElement>('[data-pdf-page-content="true"]');
    expect(pageContent).not.toBeNull();
    vi.spyOn(pageContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 20, 600, 800));
    const { removeAllRanges } = mockPdfSelection({
      rects: [createRect(50, 50, 160, 16)],
    });

    document.dispatchEvent(new Event('selectionchange'));
    expect(screen.queryByTestId('pdf-viewer-selection-toolbar')).not.toBeInTheDocument();

    fireEvent.mouseUp(screen.getByTestId('pdf-viewer-scroll-viewport'));
    const toolbar = await screen.findByTestId('pdf-viewer-selection-toolbar');
    expect(toolbar).toHaveStyle({ left: '130px', top: '73px' });
    expect(toolbar).not.toHaveStyle({ width: '344px' });
    expect(toolbar).toHaveClass('inline-flex');
    expect(toolbar).toHaveClass('w-auto');
    expect(toolbar).toHaveClass('px-1.5');
    expect(toolbar).toHaveClass('py-1.5');
    expect(toolbar).toHaveClass('gap-0.5');
    expect(screen.getByLabelText('note')).toHaveClass('text-ide-text-muted');
    expect(screen.getByLabelText('note')).toHaveClass('opacity-70');
    expect(screen.getByTestId('pdf-viewer-selection-highlight')).toHaveClass('text-ide-text');

    fireEvent.click(screen.getByTestId('pdf-viewer-selection-highlight'));

    expect(await screen.findByTestId('pdf-viewer-highlight')).toBeInTheDocument();
    expect(removeAllRanges).toHaveBeenCalled();
    expect(screen.queryByTestId('pdf-viewer-selection-toolbar')).not.toBeInTheDocument();
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').highlightAnnotations).toHaveLength(1);
  });

  it('shows the selection toolbar after keyboard selection updates', async () => {
    const pdfDocument = createMockPdfDocument(1, {
      1: ['Keyboard annotation text'],
    });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await screen.findByTestId('pdf-viewer-text-layer-1');
    vi.spyOn(screen.getByTestId('pdf-viewer-pane'), 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 800, 600));
    const pageContent = screen.getByTestId('pdf-viewer-page-1')
      .querySelector<HTMLElement>('[data-pdf-page-content="true"]');
    expect(pageContent).not.toBeNull();
    vi.spyOn(pageContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 20, 600, 800));
    mockPdfSelection({
      rects: [createRect(60, 80, 180, 16)],
      text: 'Keyboard annotation text',
    });

    fireEvent.keyUp(screen.getByTestId('pdf-viewer-scroll-viewport'), { key: 'ArrowRight', shiftKey: true });

    expect(await screen.findByTestId('pdf-viewer-selection-toolbar')).toBeInTheDocument();
  });

  it('does not show the selection toolbar for hand mode or invalid selections', async () => {
    const pdfDocument = createMockPdfDocument(2, {
      1: ['Selectable annotation text'],
      2: ['Second page selection text'],
    });
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await screen.findByTestId('pdf-viewer-text-layer-1');
    await screen.findByTestId('pdf-viewer-text-layer-2');
    vi.spyOn(screen.getByTestId('pdf-viewer-pane'), 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 800, 600));
    const pageOneContent = screen.getByTestId('pdf-viewer-page-1')
      .querySelector<HTMLElement>('[data-pdf-page-content="true"]');
    const pageTwoContent = screen.getByTestId('pdf-viewer-page-2')
      .querySelector<HTMLElement>('[data-pdf-page-content="true"]');
    expect(pageOneContent).not.toBeNull();
    expect(pageTwoContent).not.toBeNull();
    vi.spyOn(pageOneContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 20, 600, 800));
    vi.spyOn(pageTwoContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 850, 600, 800));

    fireEvent.click(screen.getByTestId('pdf-viewer-hand-tool'));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-hand-tool')).toHaveAttribute('aria-pressed', 'true'));
    mockPdfSelection({ rects: [createRect(50, 50, 160, 16)] });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(screen.getByTestId('pdf-viewer-scroll-viewport'));
    await waitFor(() => expect(screen.queryByTestId('pdf-viewer-selection-toolbar')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('pdf-viewer-select-tool'));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-select-tool')).toHaveAttribute('aria-pressed', 'true'));
    vi.spyOn(pageOneContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 20, 600, 800));
    vi.spyOn(pageTwoContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 850, 600, 800));
    vi.spyOn(screen.getByTestId('pdf-viewer-pane'), 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 800, 600));
    mockPdfSelection({ isCollapsed: true, rects: [createRect(50, 50, 160, 16)] });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(screen.getByTestId('pdf-viewer-scroll-viewport'));
    await waitFor(() => expect(screen.queryByTestId('pdf-viewer-selection-toolbar')).not.toBeInTheDocument());

    vi.spyOn(pageOneContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 20, 600, 800));
    vi.spyOn(pageTwoContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 850, 600, 800));
    vi.spyOn(screen.getByTestId('pdf-viewer-pane'), 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 800, 600));
    mockPdfSelection({ rects: [createRect(700, 50, 160, 16)] });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(screen.getByTestId('pdf-viewer-scroll-viewport'));
    await waitFor(() => expect(screen.queryByTestId('pdf-viewer-selection-toolbar')).not.toBeInTheDocument());

    vi.spyOn(pageOneContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 20, 600, 800));
    vi.spyOn(pageTwoContent!, 'getBoundingClientRect').mockReturnValue(createRect(10, 850, 600, 800));
    vi.spyOn(screen.getByTestId('pdf-viewer-pane'), 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 800, 600));
    mockPdfSelection({
      rects: [
        createRect(50, 50, 160, 16),
        createRect(50, 880, 160, 16),
      ],
    });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(screen.getByTestId('pdf-viewer-scroll-viewport'));
    await waitFor(() => expect(screen.queryByTestId('pdf-viewer-selection-toolbar')).not.toBeInTheDocument());
  });

  it('supports page navigation, thumbnail navigation, and zoom controls', async () => {
    const pdfDocument = createMockPdfDocument(3);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 3'));
    expect(screen.getByTestId('pdf-viewer-first-page')).toBeDisabled();
    expect(screen.getByTestId('pdf-viewer-last-page')).toBeEnabled();

    fireEvent.click(screen.getByTestId('pdf-viewer-last-page'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('3 / 3'));
    expect(screen.getByTestId('pdf-viewer-last-page')).toBeDisabled();

    fireEvent.click(screen.getByTestId('pdf-viewer-first-page'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 3'));
    expect(screen.getByLabelText('Go to First Page')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to Last Page')).toBeInTheDocument();
    expect(screen.getByLabelText('Rotate Clockwise')).toBeInTheDocument();
    expect(screen.getByLabelText('Rotate Counterclockwise')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pdf-viewer-next-page'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('2 / 3'));
    expect(pdfDocument.getPage).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTestId('pdf-viewer-thumbnail-3'));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('3 / 3'));

    fireEvent.click(screen.getByTestId('pdf-viewer-rotate-clockwise'));

    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').rotation).toBe(90));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-canvas-3')).toHaveStyle({ width: '800px', height: '600px' }));
    await waitFor(() => expect(pdfDocument.getViewport).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 })));
    expect(screen.getByTestId('pdf-viewer-thumbnail-3')).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByTestId('pdf-viewer-rotate-counterclockwise'));

    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').rotation).toBe(0));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-canvas-3')).toHaveStyle({ width: '600px', height: '800px' }));

    fireEvent.click(screen.getByTestId('pdf-viewer-zoom-in'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-zoom-indicator')).toHaveTextContent('125%'));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-canvas-3')).toHaveAttribute('width', '750'));
    expect(pdfDocument.cancelRenderTask).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('pdf-viewer-reset-zoom'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-zoom-indicator')).toHaveTextContent('100%'));
  });

  it('enters presentation mode, navigates pages, and restores the previous viewer session on exit', async () => {
    const pdfDocument = createMockPdfDocument(3);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    const viewport = await screen.findByTestId('pdf-viewer-scroll-viewport');
    setElementSize(viewport, 900, 700);
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 3'));

    const presentationButton = screen.getByTestId('pdf-viewer-presentation-mode');
    await waitFor(() => expect(presentationButton).toBeEnabled());
    expect(presentationButton).toHaveAccessibleName('Presentation Mode');
    expect(presentationButton).toHaveTextContent('');

    fireEvent.click(presentationButton);

    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-pane')).toHaveAttribute('data-pdf-presentation-mode', 'true'));
    expect(screen.queryByTestId('pdf-viewer-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer-bookmark-tree')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer-thumbnail-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer-search-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-page-1')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer-page-2')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('pdf-viewer-page-1')).getByTestId('pdf-viewer-text-layer-1')).toHaveClass('pointer-events-none');

    fireEvent.click(viewport);
    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').pageNumber).toBe(2));
    expect(screen.getByTestId('pdf-viewer-page-2')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer-page-1')).not.toBeInTheDocument();

    fireEvent.click(viewport, { shiftKey: true });
    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').pageNumber).toBe(1));

    fireEvent.keyDown(viewport, { key: 'End' });
    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').pageNumber).toBe(3));

    fireEvent.keyDown(viewport, { key: 'Home' });
    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').pageNumber).toBe(1));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-1')).toBeInTheDocument());

    fireEvent.wheel(viewport, {
      deltaY: 120,
    });
    await waitFor(() => expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').pageNumber).toBe(2));
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toMatchObject({
      isPresentationModeActive: true,
      presentationRestoreState: expect.objectContaining({
        zoom: 1,
        fitMode: 'custom',
        toolMode: 'select',
      }),
    });

    fireEvent.keyDown(viewport, { key: 'Escape' });

    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-pane')).not.toHaveAttribute('data-pdf-presentation-mode'));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-toolbar')).toBeInTheDocument());
    expect(screen.getByTestId('pdf-viewer-bookmark-tree')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-thumbnail-rail')).toBeInTheDocument();
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toMatchObject({
      pageNumber: 2,
      zoom: 1,
      fitMode: 'custom',
      toolMode: 'select',
      scrollLeft: 0,
      isPresentationModeActive: false,
      presentationRestoreState: null,
    });
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
