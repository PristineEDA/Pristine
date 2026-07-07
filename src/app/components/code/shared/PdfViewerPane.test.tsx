import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function createMockPdfDocument(pageCount = 2) {
  const render = vi.fn(() => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  }));
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render,
  }));

  return {
    cleanup: vi.fn(),
    destroy: vi.fn(),
    getPage,
    numPages: pageCount,
    render,
  };
}

describe('PdfViewerPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePdfViewerStore.getState().resetPdfViewerStoreForTests();
    vi.mocked(window.electronAPI!.fs.readFileBinary).mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  });

  it('loads PDF bytes and renders the first page', async () => {
    const pdfDocument = createMockPdfDocument(2);
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
    expect(screen.getByTestId('pdf-viewer-canvas')).toHaveAttribute('width', '600');
    expect(screen.getByTestId('pdf-viewer-canvas')).toHaveAttribute('height', '800');
  });

  it('supports page navigation and zoom controls', async () => {
    const pdfDocument = createMockPdfDocument(3);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) });

    render(<PdfViewerPane fileId="docs/spec.pdf" fileName="spec.pdf" />);

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('1 / 3'));

    fireEvent.click(screen.getByTestId('pdf-viewer-next-page'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-page-indicator')).toHaveTextContent('2 / 3'));
    expect(pdfDocument.getPage).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByTestId('pdf-viewer-zoom-in'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-zoom-indicator')).toHaveTextContent('125%'));
    await waitFor(() => expect(screen.getByTestId('pdf-viewer-canvas')).toHaveAttribute('width', '750'));

    fireEvent.click(screen.getByTestId('pdf-viewer-reset-zoom'));

    await waitFor(() => expect(screen.getByTestId('pdf-viewer-zoom-indicator')).toHaveTextContent('100%'));
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
