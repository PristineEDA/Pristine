import { beforeEach, describe, expect, it } from 'vitest';
import {
  PDF_VIEWER_DEFAULT_PAGE_NUMBER,
  PDF_VIEWER_DEFAULT_ZOOM,
  PDF_VIEWER_MAX_ZOOM,
  PDF_VIEWER_MIN_ZOOM,
  usePdfViewerStore,
} from './usePdfViewerStore';

describe('usePdfViewerStore', () => {
  beforeEach(() => {
    usePdfViewerStore.getState().resetPdfViewerStoreForTests();
  });

  it('returns default page and zoom for unseen PDF files', () => {
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      pageNumber: PDF_VIEWER_DEFAULT_PAGE_NUMBER,
      zoom: PDF_VIEWER_DEFAULT_ZOOM,
      scrollTop: 0,
      scrollLeft: 0,
    });
  });

  it('stores page number, zoom, and scroll position per file', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 3, 10);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 1.5);
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 240, scrollLeft: 18 });
    usePdfViewerStore.getState().setPageNumber('docs/other.pdf', 2, 5);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      pageNumber: 3,
      zoom: 1.5,
      scrollTop: 240,
      scrollLeft: 18,
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toEqual({
      pageNumber: 2,
      zoom: PDF_VIEWER_DEFAULT_ZOOM,
      scrollTop: 0,
      scrollLeft: 0,
    });
  });

  it('clamps page number and zoom to safe viewer bounds', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', -4, 12);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 99);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      pageNumber: 1,
      zoom: PDF_VIEWER_MAX_ZOOM,
      scrollTop: 0,
      scrollLeft: 0,
    });

    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 99, 4);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 0.1);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      pageNumber: 4,
      zoom: PDF_VIEWER_MIN_ZOOM,
      scrollTop: 0,
      scrollLeft: 0,
    });
  });

  it('clamps invalid scroll positions and tracks viewport page updates', () => {
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 512, scrollLeft: 64 });
    usePdfViewerStore.getState().setPageNumberFromViewport('docs/spec.pdf', 5, 8);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      pageNumber: 5,
      zoom: PDF_VIEWER_DEFAULT_ZOOM,
      scrollTop: 512,
      scrollLeft: 64,
    });

    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: Number.NaN, scrollLeft: -42 });
    usePdfViewerStore.getState().setPageNumberFromViewport('docs/spec.pdf', 100, 8);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      pageNumber: 8,
      zoom: PDF_VIEWER_DEFAULT_ZOOM,
      scrollTop: 0,
      scrollLeft: 0,
    });
  });

  it('can reset a single file session and the full store', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 3, 10);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 1.5);
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 120, scrollLeft: 24 });
    usePdfViewerStore.getState().setZoom('docs/other.pdf', 1.25);

    usePdfViewerStore.getState().resetPdfSession('docs/spec.pdf');

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      pageNumber: PDF_VIEWER_DEFAULT_PAGE_NUMBER,
      zoom: PDF_VIEWER_DEFAULT_ZOOM,
      scrollTop: 0,
      scrollLeft: 0,
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf').zoom).toBe(1.25);

    usePdfViewerStore.getState().resetPdfViewerStoreForTests();

    expect(usePdfViewerStore.getState().sessions).toEqual({});
  });
});
