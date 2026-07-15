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
  rotation: 0,
  fitMode: 'custom',
  toolMode: 'select',
  scrollMode: 'vertical',
  pageToneMode: 'auto',
  scrollTop: 0,
  scrollLeft: 0,
  searchQuery: '',
  isSearchOpen: false,
  isInfoPanelOpen: false,
  isPresentationModeActive: false,
  presentationRestoreState: null,
  activeSearchMatchIndex: 0,
  isBookmarkTreeVisible: true,
  isThumbnailRailVisible: true,
  expandedBookmarkIds: [],
  defaultHighlightColor: 'yellow',
  selectedHighlightId: null,
  commentHighlightId: null,
  highlightAnnotations: [],
} as const;

describe('usePdfViewerStore', () => {
  beforeEach(() => {
    usePdfViewerStore.getState().resetPdfViewerStoreForTests();
  });

  it('returns default viewer state for unseen PDF files', () => {
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual(defaultSession);
  });

  it('stores page number, zoom, rotation, fit mode, tool mode, scroll mode, page tone mode, and scroll position per file', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 3, 10);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 1.5, 'width');
    usePdfViewerStore.getState().setRotation('docs/spec.pdf', 90);
    usePdfViewerStore.getState().setToolMode('docs/spec.pdf', 'hand');
    usePdfViewerStore.getState().setScrollMode('docs/spec.pdf', 'horizontal');
    usePdfViewerStore.getState().setPageToneMode('docs/spec.pdf', 'soft');
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 240, scrollLeft: 18 });
    usePdfViewerStore.getState().setPageToneMode('docs/other.pdf', 'original');
    usePdfViewerStore.getState().setPageNumber('docs/other.pdf', 2, 5);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 3,
      zoom: 1.5,
      rotation: 90,
      fitMode: 'width',
      toolMode: 'hand',
      scrollMode: 'horizontal',
      pageToneMode: 'soft',
      scrollTop: 240,
      scrollLeft: 18,
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 2,
      pageToneMode: 'original',
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

  it('stores info panel visibility per PDF file', () => {
    usePdfViewerStore.getState().setInfoPanelOpen('docs/spec.pdf', true);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      isInfoPanelOpen: true,
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toEqual(defaultSession);

    usePdfViewerStore.getState().setInfoPanelOpen('docs/spec.pdf', false);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      isInfoPanelOpen: false,
    });
  });

  it('stores and restores presentation mode state per PDF file', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 4, 12);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 1.5);
    usePdfViewerStore.getState().setFitMode('docs/spec.pdf', 'width');
    usePdfViewerStore.getState().setToolMode('docs/spec.pdf', 'hand');
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 320, scrollLeft: 28 });

    usePdfViewerStore.getState().enterPresentationMode('docs/spec.pdf', {
      pageNumber: 4,
      zoom: 1.5,
      fitMode: 'width',
      toolMode: 'hand',
      scrollTop: 320,
      scrollLeft: 28,
    });

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 4,
      zoom: 1.5,
      fitMode: 'width',
      toolMode: 'hand',
      scrollTop: 320,
      scrollLeft: 28,
      isPresentationModeActive: true,
      presentationRestoreState: {
        pageNumber: 4,
        zoom: 1.5,
        fitMode: 'width',
        toolMode: 'hand',
        scrollTop: 320,
        scrollLeft: 28,
      },
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toEqual(defaultSession);

    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 7, 12);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 0.75, 'page');
    usePdfViewerStore.getState().exitPresentationMode('docs/spec.pdf', 7);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      pageNumber: 7,
      zoom: 1.5,
      fitMode: 'width',
      toolMode: 'hand',
      scrollTop: 320,
      scrollLeft: 28,
      isPresentationModeActive: false,
      presentationRestoreState: null,
    });
  });

  it('stores PDF scroll mode per file and normalizes invalid values to vertical', () => {
    usePdfViewerStore.getState().setScrollMode('docs/spec.pdf', 'page');
    usePdfViewerStore.getState().setScrollMode('docs/other.pdf', 'wrapped');

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').scrollMode).toBe('page');
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf').scrollMode).toBe('wrapped');

    usePdfViewerStore.getState().setScrollMode('docs/spec.pdf', 'invalid' as never);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').scrollMode).toBe('vertical');
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf').scrollMode).toBe('wrapped');
  });

  it('normalizes clockwise and counterclockwise rotation per PDF file', () => {
    usePdfViewerStore.getState().rotate('docs/spec.pdf', 90);
    usePdfViewerStore.getState().rotate('docs/spec.pdf', 90);
    usePdfViewerStore.getState().rotate('docs/other.pdf', -90);

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual({
      ...defaultSession,
      rotation: 180,
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toEqual({
      ...defaultSession,
      rotation: 270,
    });

    usePdfViewerStore.getState().setRotation('docs/spec.pdf', 450);
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').rotation).toBe(90);
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
        kind: 'highlight',
        color: 'yellow',
        comments: [],
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

  it('updates a highlight color and uses it as the next highlight default for that PDF', () => {
    const firstId = usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 1,
      rects: [{ left: 1, top: 2, width: 30, height: 8 }],
    });

    usePdfViewerStore.getState().setHighlightAnnotationColor('docs/spec.pdf', firstId!, 'green');
    const secondId = usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 1,
      rects: [{ left: 2, top: 12, width: 30, height: 8 }],
    });
    const otherId = usePdfViewerStore.getState().addHighlightAnnotation('docs/other.pdf', {
      pageNumber: 1,
      rects: [{ left: 2, top: 12, width: 30, height: 8 }],
    });

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toMatchObject({
      defaultHighlightColor: 'green',
      highlightAnnotations: [
        { id: firstId, color: 'green' },
        { id: secondId, color: 'green' },
      ],
    });
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf')).toMatchObject({
      defaultHighlightColor: 'yellow',
      highlightAnnotations: [{ id: otherId, color: 'yellow' }],
    });
  });

  it('stores underline and strikethrough annotations with the shared PDF color default', () => {
    const highlightId = usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 1,
      rects: [{ left: 1, top: 2, width: 30, height: 8 }],
    });
    const underlineId = usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 1,
      kind: 'underline',
      rects: [{ left: 1, top: 14, width: 30, height: 8 }],
    });

    usePdfViewerStore.getState().setHighlightAnnotationColor('docs/spec.pdf', underlineId!, 'cyan');
    const strikethroughId = usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 1,
      kind: 'strikethrough',
      rects: [{ left: 1, top: 26, width: 30, height: 8 }],
    });
    const invalidKindId = usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 1,
      kind: 'unknown' as never,
      rects: [{ left: 1, top: 38, width: 30, height: 8 }],
    });

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf').highlightAnnotations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: highlightId, kind: 'highlight', color: 'yellow' }),
      expect.objectContaining({ id: underlineId, kind: 'underline', color: 'cyan' }),
      expect.objectContaining({ id: strikethroughId, kind: 'strikethrough', color: 'cyan' }),
      expect.objectContaining({ id: invalidKindId, kind: 'highlight', color: 'cyan' }),
    ]));
  });

  it('tracks highlight interaction and local comments, and cleans it when the highlight is removed', () => {
    const id = usePdfViewerStore.getState().addHighlightAnnotation('docs/spec.pdf', {
      pageNumber: 1,
      rects: [{ left: 1, top: 2, width: 30, height: 8 }],
    });

    usePdfViewerStore.getState().setSelectedHighlight('docs/spec.pdf', id);
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toMatchObject({
      selectedHighlightId: id,
      commentHighlightId: null,
    });

    usePdfViewerStore.getState().setCommentHighlight('docs/spec.pdf', id);
    const commentId = usePdfViewerStore.getState().addHighlightComment('docs/spec.pdf', id!, '  First note  ');
    expect(commentId).toEqual(expect.any(String));
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toMatchObject({
      selectedHighlightId: null,
      commentHighlightId: id,
      highlightAnnotations: [{
        id,
        comments: [{
          id: commentId,
          author: 'You',
          body: 'First note',
          createdAt: expect.any(Number),
        }],
      }],
    });

    usePdfViewerStore.getState().removeHighlightAnnotation('docs/spec.pdf', id!);
    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toMatchObject({
      selectedHighlightId: null,
      commentHighlightId: null,
      highlightAnnotations: [],
    });
  });

  it('can reset a single file session and the full store', () => {
    usePdfViewerStore.getState().setPageNumber('docs/spec.pdf', 3, 10);
    usePdfViewerStore.getState().setZoom('docs/spec.pdf', 1.5);
    usePdfViewerStore.getState().setRotation('docs/spec.pdf', 90);
    usePdfViewerStore.getState().setToolMode('docs/spec.pdf', 'hand');
    usePdfViewerStore.getState().setScrollMode('docs/spec.pdf', 'page');
    usePdfViewerStore.getState().setSearchOpen('docs/spec.pdf', true);
    usePdfViewerStore.getState().setInfoPanelOpen('docs/spec.pdf', true);
    usePdfViewerStore.getState().enterPresentationMode('docs/spec.pdf', {
      pageNumber: 3,
      zoom: 1.5,
      fitMode: 'custom',
      toolMode: 'hand',
      scrollTop: 120,
      scrollLeft: 24,
    });
    usePdfViewerStore.getState().setScrollPosition('docs/spec.pdf', { scrollTop: 120, scrollLeft: 24 });
    usePdfViewerStore.getState().setZoom('docs/other.pdf', 1.25);

    usePdfViewerStore.getState().resetPdfSession('docs/spec.pdf');

    expect(usePdfViewerStore.getState().getSession('docs/spec.pdf')).toEqual(defaultSession);
    expect(usePdfViewerStore.getState().getSession('docs/other.pdf').zoom).toBe(1.25);

    usePdfViewerStore.getState().resetPdfViewerStoreForTests();

    expect(usePdfViewerStore.getState().sessions).toEqual({});
  });
});
