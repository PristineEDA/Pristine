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
  isBookmarkTreeVisible: true,
  isThumbnailRailVisible: true,
  expandedBookmarkIds: [],
  highlightAnnotations: [],
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

  it('stores bookmark, thumbnail, and expanded bookmark state per PDF file', () => {
    usePdfViewerStore.getState().setBookmarkTreeVisible('docs/spec.pdf', false);
    usePdfViewerStore.getState().setThumbnailRailVisible('docs/spec.pdf', false);
    usePdfViewerStore.getState().toggleBookmarkExpanded('docs/spec.pdf', 'bookmark-0');
    usePdfViewerStore.getState().toggleBookmarkExpanded('docs/spec.pdf', 'bookmark-1');
    usePdfViewerStore.getState().toggleBookmarkExpanded('docs/spec.pdf', 'bookmark-0');

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      isBookmarkTreeVisible: false,
      isThumbnailRailVisible: false,
      expandedBookmarkIds: ['bookmark-1'],
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toEqual(defaultSession);
  });

  it('stores highlight annotations per PDF file', () => {
    const id = usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 2,
      quote: 'Selected PDF text',
      rects: [
        { left: 10.123, top: 20.456, width: 120.5, height: 14.25 },
        { left: 0, top: 0, width: 0, height: 12 },
      ],
    });

    expect(id).toEqual(expect.any(String));
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').highlightAnnotations).toEqual([
      {
        id,
        pageNumber: 2,
        color: 'yellow',
        quote: 'Selected PDF text',
        createdAt: expect.any(Number),
        rects: [{ left: 10.12, top: 20.46, width: 120.5, height: 14.25 }],
      },
    ]);

    usePdfViewerStore.getState().removeHighlightAnnotation('docs/spec.pdf', id!);
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').highlightAnnotations).toEqual([]);

    usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 1,
      rects: [{ left: 1, top: 2, width: 3, height: 4 }],
    });
    usePdfViewerStore.getState().clearHighlightAnnotations('docs/spec.pdf');
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').highlightAnnotations).toEqual([]);
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
