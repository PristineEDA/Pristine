import { create } from 'zustand';

export const PDF_VIEWER_DEFAULT_PAGE_NUMBER = 1;
export const PDF_VIEWER_DEFAULT_ZOOM = 1;
export const PDF_VIEWER_MIN_ZOOM = 0.5;
export const PDF_VIEWER_MAX_ZOOM = 2;
export const PDF_VIEWER_ZOOM_STEP = 0.25;

interface PdfViewerSession {
  pageNumber: number;
  zoom: number;
  scrollTop: number;
  scrollLeft: number;
}

interface PdfViewerStoreState {
  sessions: Record<string, PdfViewerSession>;
  getSession: (fileId: string) => PdfViewerSession;
  setPageNumber: (fileId: string, pageNumber: number, pageCount?: number) => void;
  setPageNumberFromViewport: (fileId: string, pageNumber: number, pageCount?: number) => void;
  setScrollPosition: (fileId: string, position: Partial<Pick<PdfViewerSession, 'scrollTop' | 'scrollLeft'>>) => void;
  setZoom: (fileId: string, zoom: number) => void;
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

const DEFAULT_PDF_VIEWER_SESSION: PdfViewerSession = {
  pageNumber: PDF_VIEWER_DEFAULT_PAGE_NUMBER,
  zoom: PDF_VIEWER_DEFAULT_ZOOM,
  scrollTop: 0,
  scrollLeft: 0,
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
  setZoom: (fileId, zoom) => {
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
