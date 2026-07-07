import { create } from 'zustand';

export const PDF_VIEWER_DEFAULT_PAGE_NUMBER = 1;
export const PDF_VIEWER_DEFAULT_ZOOM = 1;
export const PDF_VIEWER_MIN_ZOOM = 0.5;
export const PDF_VIEWER_MAX_ZOOM = 6;
export const PDF_VIEWER_ZOOM_STEP = 0.25;

export type PdfViewerFitMode = 'custom' | 'width' | 'page';
export type PdfViewerToolMode = 'select' | 'hand';
export type PdfViewerPageToneMode = 'auto' | 'original' | 'soft';

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
  color: 'yellow';
  quote: string;
  createdAt: number;
}

export interface CreatePdfHighlightAnnotationInput {
  pageNumber: number;
  rects: PdfHighlightRect[];
  quote?: string;
}

export interface PdfViewerSession {
  pageNumber: number;
  zoom: number;
  fitMode: PdfViewerFitMode;
  toolMode: PdfViewerToolMode;
  pageToneMode: PdfViewerPageToneMode;
  scrollTop: number;
  scrollLeft: number;
  searchQuery: string;
  isSearchOpen: boolean;
  activeSearchMatchIndex: number;
  isBookmarkTreeVisible: boolean;
  isThumbnailRailVisible: boolean;
  expandedBookmarkIds: string[];
  highlightAnnotations: PdfHighlightAnnotation[];
}

interface PdfViewerStoreState {
  sessions: Record<string, PdfViewerSession>;
  getSession: (fileId: string) => PdfViewerSession;
  setPageNumber: (fileId: string, pageNumber: number, pageCount?: number) => void;
  setPageNumberFromViewport: (fileId: string, pageNumber: number, pageCount?: number) => void;
  setScrollPosition: (fileId: string, position: Partial<Pick<PdfViewerSession, 'scrollTop' | 'scrollLeft'>>) => void;
  setZoom: (fileId: string, zoom: number, fitMode?: PdfViewerFitMode) => void;
  setFitMode: (fileId: string, fitMode: PdfViewerFitMode) => void;
  setToolMode: (fileId: string, toolMode: PdfViewerToolMode) => void;
  setPageToneMode: (fileId: string, mode: PdfViewerPageToneMode) => void;
  setSearchOpen: (fileId: string, isOpen: boolean) => void;
  setSearchQuery: (fileId: string, query: string) => void;
  setActiveSearchMatchIndex: (fileId: string, index: number, matchCount?: number) => void;
  setBookmarkTreeVisible: (fileId: string, visible: boolean) => void;
  setThumbnailRailVisible: (fileId: string, visible: boolean) => void;
  toggleBookmarkExpanded: (fileId: string, bookmarkId: string) => void;
  addHighlightAnnotation: (fileId: string, annotation: CreatePdfHighlightAnnotationInput) => string | null;
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

function normalizeFitMode(fitMode: PdfViewerFitMode): PdfViewerFitMode {
  return fitMode === 'width' || fitMode === 'page' ? fitMode : 'custom';
}

function normalizeToolMode(toolMode: PdfViewerToolMode): PdfViewerToolMode {
  return toolMode === 'hand' ? 'hand' : 'select';
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

const DEFAULT_PDF_VIEWER_SESSION: PdfViewerSession = {
  pageNumber: PDF_VIEWER_DEFAULT_PAGE_NUMBER,
  zoom: PDF_VIEWER_DEFAULT_ZOOM,
  fitMode: 'custom',
  toolMode: 'select',
  pageToneMode: 'auto',
  scrollTop: 0,
  scrollLeft: 0,
  searchQuery: '',
  isSearchOpen: false,
  activeSearchMatchIndex: 0,
  isBookmarkTreeVisible: true,
  isThumbnailRailVisible: true,
  expandedBookmarkIds: [],
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
                color: 'yellow',
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
