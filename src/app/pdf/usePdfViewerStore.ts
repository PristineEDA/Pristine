import { create } from 'zustand';

export const PDF_VIEWER_DEFAULT_PAGE_NUMBER = 1;
export const PDF_VIEWER_DEFAULT_ZOOM = 1;
export const PDF_VIEWER_MIN_ZOOM = 0.5;
export const PDF_VIEWER_MAX_ZOOM = 6;
export const PDF_VIEWER_ZOOM_STEP = 0.25;

export type PdfViewerFitMode = 'custom' | 'width' | 'page';
export type PdfViewerToolMode = 'select' | 'hand';
export type PdfViewerPageToneMode = 'auto' | 'original' | 'soft';
export type PdfViewerRotation = 0 | 90 | 180 | 270;
export type PdfViewerScrollMode = 'page' | 'vertical' | 'horizontal' | 'wrapped';
export type PdfHighlightColor = 'yellow' | 'green' | 'cyan' | 'pink' | 'red';

export interface PdfHighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfHighlightAnnotation {
  id: string;
  pageNumber: number;
  rects: PdfHighlightRect[];
  color: PdfHighlightColor;
  comments: PdfHighlightComment[];
  quote: string;
  createdAt: number;
}

export interface PdfHighlightComment {
  id: string;
  body: string;
  author: 'You';
  createdAt: number;
}

export interface CreatePdfHighlightAnnotationInput {
  pageNumber: number;
  rects: PdfHighlightRect[];
  quote?: string;
}

export interface PdfViewerPresentationRestoreState {
  pageNumber: number;
  zoom: number;
  fitMode: PdfViewerFitMode;
  toolMode: PdfViewerToolMode;
  scrollTop: number;
  scrollLeft: number;
}

export interface PdfViewerSession {
  pageNumber: number;
  zoom: number;
  rotation: PdfViewerRotation;
  fitMode: PdfViewerFitMode;
  toolMode: PdfViewerToolMode;
  scrollMode: PdfViewerScrollMode;
  pageToneMode: PdfViewerPageToneMode;
  scrollTop: number;
  scrollLeft: number;
  searchQuery: string;
  isSearchOpen: boolean;
  isInfoPanelOpen: boolean;
  isPresentationModeActive: boolean;
  presentationRestoreState: PdfViewerPresentationRestoreState | null;
  activeSearchMatchIndex: number;
  isBookmarkTreeVisible: boolean;
  isThumbnailRailVisible: boolean;
  expandedBookmarkIds: string[];
  defaultHighlightColor: PdfHighlightColor;
  selectedHighlightId: string | null;
  commentHighlightId: string | null;
  highlightAnnotations: PdfHighlightAnnotation[];
}

interface PdfViewerStoreState {
  sessions: Record<string, PdfViewerSession>;
  getSession: (fileId: string) => PdfViewerSession;
  setPageNumber: (fileId: string, pageNumber: number, pageCount?: number) => void;
  setPageNumberFromViewport: (fileId: string, pageNumber: number, pageCount?: number) => void;
  setScrollPosition: (fileId: string, position: Partial<Pick<PdfViewerSession, 'scrollTop' | 'scrollLeft'>>) => void;
  setZoom: (fileId: string, zoom: number, fitMode?: PdfViewerFitMode) => void;
  setRotation: (fileId: string, rotation: number) => void;
  rotate: (fileId: string, delta: number) => void;
  enterPresentationMode: (fileId: string, restoreState: PdfViewerPresentationRestoreState) => void;
  exitPresentationMode: (
    fileId: string,
    pageNumber?: number,
    restoreState?: PdfViewerPresentationRestoreState | null,
  ) => void;
  setFitMode: (fileId: string, fitMode: PdfViewerFitMode) => void;
  setToolMode: (fileId: string, toolMode: PdfViewerToolMode) => void;
  setScrollMode: (fileId: string, scrollMode: PdfViewerScrollMode) => void;
  setPageToneMode: (fileId: string, mode: PdfViewerPageToneMode) => void;
  setSearchOpen: (fileId: string, isOpen: boolean) => void;
  setInfoPanelOpen: (fileId: string, isOpen: boolean) => void;
  setSearchQuery: (fileId: string, query: string) => void;
  setActiveSearchMatchIndex: (fileId: string, index: number, matchCount?: number) => void;
  setBookmarkTreeVisible: (fileId: string, visible: boolean) => void;
  setThumbnailRailVisible: (fileId: string, visible: boolean) => void;
  toggleBookmarkExpanded: (fileId: string, bookmarkId: string) => void;
  addHighlightAnnotation: (fileId: string, annotation: CreatePdfHighlightAnnotationInput) => string | null;
  setSelectedHighlight: (fileId: string, annotationId: string | null) => void;
  setCommentHighlight: (fileId: string, annotationId: string | null) => void;
  closeHighlightInteraction: (fileId: string) => void;
  setHighlightAnnotationColor: (fileId: string, annotationId: string, color: PdfHighlightColor) => void;
  addHighlightComment: (fileId: string, annotationId: string, body: string) => string | null;
  removeHighlightAnnotation: (fileId: string, annotationId: string) => void;
  clearHighlightAnnotations: (fileId: string) => void;
  resetPdfSession: (fileId: string) => void;
  resetPdfViewerStoreForTests: () => void;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function normalizePageNumber(pageNumber: number, pageCount?: number): number {
  const maxPage = Number.isFinite(pageCount) && pageCount && pageCount > 0 ? Math.floor(pageCount) : Number.MAX_SAFE_INTEGER;
  return Math.floor(clampNumber(pageNumber, PDF_VIEWER_DEFAULT_PAGE_NUMBER, maxPage));
}

function normalizeZoom(zoom: number): number {
  return Math.round(clampNumber(zoom, PDF_VIEWER_MIN_ZOOM, PDF_VIEWER_MAX_ZOOM) * 100) / 100;
}

function normalizeRotation(rotation: number): PdfViewerRotation {
  if (!Number.isFinite(rotation)) {
    return 0;
  }

  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return normalized as PdfViewerRotation;
}

function normalizeFitMode(fitMode: PdfViewerFitMode): PdfViewerFitMode {
  return fitMode === 'width' || fitMode === 'page' ? fitMode : 'custom';
}

function normalizeToolMode(toolMode: PdfViewerToolMode): PdfViewerToolMode {
  return toolMode === 'hand' ? 'hand' : 'select';
}

function normalizeScrollMode(scrollMode: PdfViewerScrollMode): PdfViewerScrollMode {
  if (scrollMode === 'page' || scrollMode === 'horizontal' || scrollMode === 'wrapped') {
    return scrollMode;
  }

  return 'vertical';
}

function normalizePageToneMode(mode: PdfViewerPageToneMode): PdfViewerPageToneMode {
  return mode === 'original' || mode === 'soft' ? mode : 'auto';
}

function normalizeSearchQuery(query: string): string {
  return query.trimStart().slice(0, 256);
}

function normalizeSearchMatchIndex(index: number, matchCount?: number): number {
  if (!Number.isFinite(index) || index < 0) {
    return 0;
  }

  const normalizedIndex = Math.floor(index);
  if (!Number.isFinite(matchCount) || !matchCount || matchCount <= 0) {
    return normalizedIndex;
  }

  return Math.min(normalizedIndex, Math.max(0, Math.floor(matchCount) - 1));
}

function normalizeHighlightRect(rect: PdfHighlightRect): PdfHighlightRect | null {
  const left = Number.isFinite(rect.left) ? Math.max(0, rect.left) : 0;
  const top = Number.isFinite(rect.top) ? Math.max(0, rect.top) : 0;
  const width = Number.isFinite(rect.width) ? Math.max(0, rect.width) : 0;
  const height = Number.isFinite(rect.height) ? Math.max(0, rect.height) : 0;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    left: Math.round(left * 100) / 100,
    top: Math.round(top * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
  };
}

function createHighlightId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `pdf-highlight-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createHighlightCommentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `pdf-highlight-comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const DEFAULT_PDF_VIEWER_SESSION: PdfViewerSession = {
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
};

export const usePdfViewerStore = create<PdfViewerStoreState>((set, get) => ({
  sessions: {},
  getSession: (fileId) => get().sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION,
  setPageNumber: (fileId, pageNumber, pageCount) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            pageNumber: normalizePageNumber(pageNumber, pageCount),
          },
        },
      };
    });
  },
  setPageNumberFromViewport: (fileId, pageNumber, pageCount) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextPageNumber = normalizePageNumber(pageNumber, pageCount);
      if (current.pageNumber === nextPageNumber) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            pageNumber: nextPageNumber,
          },
        },
      };
    });
  },
  setScrollPosition: (fileId, position) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const scrollTop = position.scrollTop === undefined
        ? current.scrollTop
        : Math.max(0, Number.isFinite(position.scrollTop) ? position.scrollTop : 0);
      const scrollLeft = position.scrollLeft === undefined
        ? current.scrollLeft
        : Math.max(0, Number.isFinite(position.scrollLeft) ? position.scrollLeft : 0);

      if (current.scrollTop === scrollTop && current.scrollLeft === scrollLeft) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            scrollTop,
            scrollLeft,
          },
        },
      };
    });
  },
  setZoom: (fileId, zoom, fitMode = 'custom') => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            zoom: normalizeZoom(zoom),
            fitMode: normalizeFitMode(fitMode),
          },
        },
      };
    });
  },
  setRotation: (fileId, rotation) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextRotation = normalizeRotation(rotation);
      if (current.rotation === nextRotation) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            rotation: nextRotation,
          },
        },
      };
    });
  },
  rotate: (fileId, delta) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextRotation = normalizeRotation(current.rotation + delta);
      if (current.rotation === nextRotation) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            rotation: nextRotation,
          },
        },
      };
    });
  },
  enterPresentationMode: (fileId, restoreState) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            isPresentationModeActive: true,
            presentationRestoreState: {
              pageNumber: normalizePageNumber(restoreState.pageNumber),
              zoom: normalizeZoom(restoreState.zoom),
              fitMode: normalizeFitMode(restoreState.fitMode),
              toolMode: normalizeToolMode(restoreState.toolMode),
              scrollTop: Math.max(0, Number.isFinite(restoreState.scrollTop) ? restoreState.scrollTop : 0),
              scrollLeft: Math.max(0, Number.isFinite(restoreState.scrollLeft) ? restoreState.scrollLeft : 0),
            },
          },
        },
      };
    });
  },
  exitPresentationMode: (fileId, pageNumber, restoreStateOverride) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const restoreState = current.presentationRestoreState ?? restoreStateOverride ?? null;
      const nextPageNumber = pageNumber === undefined
        ? current.pageNumber
        : normalizePageNumber(pageNumber);

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            ...(restoreState
              ? {
                zoom: restoreState.zoom,
                fitMode: restoreState.fitMode,
                toolMode: restoreState.toolMode,
                scrollTop: restoreState.scrollTop,
                scrollLeft: restoreState.scrollLeft,
              }
              : {}),
            pageNumber: nextPageNumber,
            isPresentationModeActive: false,
            presentationRestoreState: null,
          },
        },
      };
    });
  },
  setFitMode: (fileId, fitMode) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextFitMode = normalizeFitMode(fitMode);
      if (current.fitMode === nextFitMode) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            fitMode: nextFitMode,
          },
        },
      };
    });
  },
  setToolMode: (fileId, toolMode) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextToolMode = normalizeToolMode(toolMode);
      if (current.toolMode === nextToolMode) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            toolMode: nextToolMode,
          },
        },
      };
    });
  },
  setScrollMode: (fileId, scrollMode) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextScrollMode = normalizeScrollMode(scrollMode);
      if (current.scrollMode === nextScrollMode) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            scrollMode: nextScrollMode,
          },
        },
      };
    });
  },
  setPageToneMode: (fileId, mode) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextMode = normalizePageToneMode(mode);
      if (current.pageToneMode === nextMode) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            pageToneMode: nextMode,
          },
        },
      };
    });
  },
  setSearchOpen: (fileId, isOpen) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      if (current.isSearchOpen === isOpen) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            isSearchOpen: isOpen,
          },
        },
      };
    });
  },
  setInfoPanelOpen: (fileId, isOpen) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      if (current.isInfoPanelOpen === isOpen) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            isInfoPanelOpen: isOpen,
          },
        },
      };
    });
  },
  setSearchQuery: (fileId, query) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextSearchQuery = normalizeSearchQuery(query);
      if (current.searchQuery === nextSearchQuery) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            searchQuery: nextSearchQuery,
            activeSearchMatchIndex: 0,
          },
        },
      };
    });
  },
  setActiveSearchMatchIndex: (fileId, index, matchCount) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextIndex = normalizeSearchMatchIndex(index, matchCount);
      if (current.activeSearchMatchIndex === nextIndex) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            activeSearchMatchIndex: nextIndex,
          },
        },
      };
    });
  },
  setBookmarkTreeVisible: (fileId, visible) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      if (current.isBookmarkTreeVisible === visible) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            isBookmarkTreeVisible: visible,
          },
        },
      };
    });
  },
  setThumbnailRailVisible: (fileId, visible) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      if (current.isThumbnailRailVisible === visible) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            isThumbnailRailVisible: visible,
          },
        },
      };
    });
  },
  toggleBookmarkExpanded: (fileId, bookmarkId) => {
    if (!fileId || !bookmarkId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const isExpanded = current.expandedBookmarkIds.includes(bookmarkId);
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            expandedBookmarkIds: isExpanded
              ? current.expandedBookmarkIds.filter((id) => id !== bookmarkId)
              : [...current.expandedBookmarkIds, bookmarkId],
          },
        },
      };
    });
  },
  addHighlightAnnotation: (fileId, annotation) => {
    if (!fileId) {
      return null;
    }

    const rects = annotation.rects.map(normalizeHighlightRect).filter((rect): rect is PdfHighlightRect => rect !== null);
    if (rects.length === 0) {
      return null;
    }

    const id = createHighlightId();
    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            highlightAnnotations: [
              ...current.highlightAnnotations,
              {
                id,
                pageNumber: normalizePageNumber(annotation.pageNumber),
                rects,
                color: current.defaultHighlightColor,
                comments: [],
                quote: (annotation.quote ?? '').slice(0, 512),
                createdAt: Date.now(),
              },
            ],
          },
        },
      };
    });

    return id;
  },
  setSelectedHighlight: (fileId, annotationId) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const selectedHighlightId = annotationId
        && current.highlightAnnotations.some((annotation) => annotation.id === annotationId)
        ? annotationId
        : null;
      if (current.selectedHighlightId === selectedHighlightId && current.commentHighlightId === null) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            selectedHighlightId,
            commentHighlightId: null,
          },
        },
      };
    });
  },
  setCommentHighlight: (fileId, annotationId) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const commentHighlightId = annotationId
        && current.highlightAnnotations.some((annotation) => annotation.id === annotationId)
        ? annotationId
        : null;
      if (current.commentHighlightId === commentHighlightId && current.selectedHighlightId === null) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            selectedHighlightId: null,
            commentHighlightId,
          },
        },
      };
    });
  },
  closeHighlightInteraction: (fileId) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      if (current.selectedHighlightId === null && current.commentHighlightId === null) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            selectedHighlightId: null,
            commentHighlightId: null,
          },
        },
      };
    });
  },
  setHighlightAnnotationColor: (fileId, annotationId, color) => {
    if (!fileId || !annotationId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const annotationIndex = current.highlightAnnotations.findIndex((annotation) => annotation.id === annotationId);
      if (annotationIndex < 0) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            defaultHighlightColor: color,
            highlightAnnotations: current.highlightAnnotations.map((annotation) => (
              annotation.id === annotationId ? { ...annotation, color } : annotation
            )),
          },
        },
      };
    });
  },
  addHighlightComment: (fileId, annotationId, body) => {
    const normalizedBody = body.trim().slice(0, 2_000);
    if (!fileId || !annotationId || !normalizedBody) {
      return null;
    }

    const current = get().sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
    if (!current.highlightAnnotations.some((annotation) => annotation.id === annotationId)) {
      return null;
    }

    const id = createHighlightCommentId();
    set((state) => {
      const nextCurrent = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...nextCurrent,
            highlightAnnotations: nextCurrent.highlightAnnotations.map((annotation) => (
              annotation.id === annotationId
                ? {
                    ...annotation,
                    comments: [
                      ...annotation.comments,
                      { id, body: normalizedBody, author: 'You', createdAt: Date.now() },
                    ],
                  }
                : annotation
            )),
          },
        },
      };
    });

    return id;
  },
  removeHighlightAnnotation: (fileId, annotationId) => {
    if (!fileId || !annotationId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      const nextAnnotations = current.highlightAnnotations.filter((annotation) => annotation.id !== annotationId);
      if (nextAnnotations.length === current.highlightAnnotations.length) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            selectedHighlightId: current.selectedHighlightId === annotationId ? null : current.selectedHighlightId,
            commentHighlightId: current.commentHighlightId === annotationId ? null : current.commentHighlightId,
            highlightAnnotations: nextAnnotations,
          },
        },
      };
    });
  },
  clearHighlightAnnotations: (fileId) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      const current = state.sessions[fileId] ?? DEFAULT_PDF_VIEWER_SESSION;
      if (current.highlightAnnotations.length === 0) {
        return state;
      }

      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...current,
            selectedHighlightId: null,
            commentHighlightId: null,
            highlightAnnotations: [],
          },
        },
      };
    });
  },
  resetPdfSession: (fileId) => {
    if (!fileId) {
      return;
    }

    set((state) => {
      if (!state.sessions[fileId]) {
        return state;
      }

      const nextSessions = { ...state.sessions };
      delete nextSessions[fileId];
      return { sessions: nextSessions };
    });
  },
  resetPdfViewerStoreForTests: () => set({ sessions: {} }),
}));
