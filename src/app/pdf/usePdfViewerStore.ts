import { create } from 'zustand';

export const PDF_VIEWER_DEFAULT_PAGE_NUMBER = 1;
export const PDF_VIEWER_DEFAULT_ZOOM = 1;
export const PDF_VIEWER_MIN_ZOOM = 0.5;
export const PDF_VIEWER_MAX_ZOOM = 2;
export const PDF_VIEWER_ZOOM_STEP = 0.25;

export type PdfViewerFitMode = 'custom' | 'width' | 'page';
export type PdfViewerToolMode = 'select' | 'hand';

export interface PdfViewerSession {
  pageNumber: number;
  zoom: number;
  fitMode: PdfViewerFitMode;
  toolMode: PdfViewerToolMode;
  scrollTop: number;
  scrollLeft: number;
  searchQuery: string;
  isSearchOpen: boolean;
  activeSearchMatchIndex: number;
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
  setSearchOpen: (fileId: string, isOpen: boolean) => void;
  setSearchQuery: (fileId: string, query: string) => void;
  setActiveSearchMatchIndex: (fileId: string, index: number, matchCount?: number) => void;
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

const DEFAULT_PDF_VIEWER_SESSION: PdfViewerSession = {
  pageNumber: PDF_VIEWER_DEFAULT_PAGE_NUMBER,
  zoom: PDF_VIEWER_DEFAULT_ZOOM,
  fitMode: 'custom',
  toolMode: 'select',
  scrollTop: 0,
  scrollLeft: 0,
  searchQuery: '',
  isSearchOpen: false,
  activeSearchMatchIndex: 0,
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
