import { beforeEach, describe, expect, it } from 'vitest';
import {
  PDF_VIEWER_DEFAULT_PAGE_NUMBER,
  PDF_VIEWER_DEFAULT_ZOOM,
  PDF_VIEWER_MAX_ZOOM,
  PDF_VIEWER_MIN_ZOOM,
  usePdfViewerStore,
} from './usePdfViewerStore';

const defaultSession = {
  pageNumber: PDF_VIEWER_DEFAULT_PAGE_NUMBER,
  zoom: PDF_VIEWER_DEFAULT_ZOOM,
  fitMode: 'custom',
  toolMode: 'select',
  scrollTop: 0,
  scrollLeft: 0,
  searchQuery: '',
  isSearchOpen: false,
  activeSearchMatchIndex: 0,
} as const;

describe('usePdfViewerStore', () => {
  beforeEach(() => {
    usePdfViewerStore.getState().resetPdfViewerStoreForTests();
  });

  it('returns default viewer state for unseen PDF files', () => {
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual(defaultSession);
  });

  it('stores page number, zoom, fit mode, tool mode, and scroll position per file', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 3, 10);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 1.5, 'width');
    usePdfViewerStore.getState().setToolMode('docs/spec.pdf', 'hand');
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 240, scrollLeft: 18 });
    usePdfViewerStore.getState().setPageNumber('docs/other.pdf', 2, 5);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 3,
      zoom: 1.5,
      fitMode: 'width',
      toolMode: 'hand',
      scrollTop: 240,
      scrollLeft: 18,
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 2,
    });
  });

  it('clamps page number, zoom, search index, and invalid scroll positions', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', -4, 12);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 99);
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: Number.NaN, scrollLeft: -42 });
    usePdfViewerStore.getState().setActiveSearchMatchIndex('docs/spec.pdf', 99, 4);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 1,
      zoom: PDF_VIEWER_MAX_ZOOM,
      activeSearchMatchIndex: 3,
    });

    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 99, 4);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 0.1);
    usePdfViewerStore.getState().setActiveSearchMatchIndex('docs/spec.pdf', -1, 4);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 4,
      zoom: PDF_VIEWER_MIN_ZOOM,
    });
  });

  it('tracks viewport page updates without rewriting unchanged state', () => {
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 512, scrollLeft: 64 });
    usePdfViewerStore.getState().setPageNumberFromViewport('docs/spec.pdf', 5, 8);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 5,
      scrollTop: 512,
      scrollLeft: 64,
    });

    usePdfViewerStore.getState().setPageNumberFromViewport('docs/spec.pdf', 100, 8);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 8,
      scrollTop: 512,
      scrollLeft: 64,
    });
  });

  it('stores search UI state per PDF file', () => {
    usePdfViewerStore.getState().setSearchOpen('docs/spec.pdf', true);
    usePdfViewerStore.getState().setSearchQuery('docs/spec.pdf', '  timing path');
    usePdfViewerStore.getState().setActiveSearchMatchIndex('docs/spec.pdf', 2, 5);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      isSearchOpen: true,
      searchQuery: 'timing path',
      activeSearchMatchIndex: 2,
    });

    usePdfViewerStore.getState().setSearchQuery('docs/spec.pdf', 'next');

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toMatchObject({
      searchQuery: 'next',
      activeSearchMatchIndex: 0,
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toEqual(defaultSession);
  });

  it('can reset a single file session and the full store', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 3, 10);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 1.5);
    usePdfViewerStore.getState().setToolMode('docs/spec.pdf', 'hand');
    usePdfViewerStore.getState().setSearchOpen('docs/spec.pdf', true);
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 120, scrollLeft: 24 });
    usePdfViewerStore.getState().setZoom('docs/other.pdf', 1.25);

    usePdfViewerStore.getState().resetPdfSession('docs/spec.pdf');

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual(defaultSession);
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf').zoom).toBe(1.25);

    usePdfViewerStore.getState().resetPdfViewerStoreForTests();

    expect(usePdfViewerStore.getState().sessions).toEqual({});
  });
});
