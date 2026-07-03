import { create } from 'zustand';
import type { ProjectExplorerTreeSelectedNode, ProjectExplorerTreeSession } from '../../../types/project';
import { WORKSPACE_ROOT_PATH, normalizeWorkspacePath } from './workspaceFiles';

interface ExplorerTreeSessionState {
  expandedPaths: string[];
  scrollTop: number;
  selectedNode: ProjectExplorerTreeSelectedNode | null;
}

interface ExplorerTreeSessionActions {
  addExpandedFolders: (paths: Iterable<string>) => void;
  captureProjectExplorerTreeSession: () => ProjectExplorerTreeSession;
  hydrateProjectExplorerTreeSession: (snapshot: ProjectExplorerTreeSession | null | undefined) => void;
  resetExplorerTreeSessionStoreForTests: () => void;
  setExpandedFolders: (paths: Iterable<string>) => void;
  setScrollTop: (scrollTop: number) => void;
  setSelectedNode: (node: ProjectExplorerTreeSelectedNode | null) => void;
  toggleExpandedFolder: (path: string) => void;
}

export type ExplorerTreeSessionStore = ExplorerTreeSessionState & ExplorerTreeSessionActions;

function createDefaultExplorerTreeSessionState(): ExplorerTreeSessionState {
  return {
    expandedPaths: [WORKSPACE_ROOT_PATH],
    scrollTop: 0,
    selectedNode: null,
  };
}

function normalizeExpandedPaths(
  paths: Iterable<string> | null | undefined,
  options: { includeRoot?: boolean } = {},
): string[] {
  const normalizedPaths = new Set<string>(options.includeRoot === false ? [] : [WORKSPACE_ROOT_PATH]);

  for (const path of paths ?? []) {
    if (typeof path !== 'string') {
      continue;
    }

    const normalizedPath = normalizeWorkspacePath(path);
    normalizedPaths.add(normalizedPath);
  }

  return Array.from(normalizedPaths);
}

function normalizeScrollTop(scrollTop: unknown): number {
  return typeof scrollTop === 'number' && Number.isFinite(scrollTop) && scrollTop > 0
    ? Math.round(scrollTop)
    : 0;
}

function normalizeSelectedNode(value: unknown): ProjectExplorerTreeSelectedNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const node = value as Record<string, unknown>;
  if (typeof node['path'] !== 'string' || (node['type'] !== 'file' && node['type'] !== 'folder')) {
    return null;
  }

  return {
    path: normalizeWorkspacePath(node['path']),
    type: node['type'],
  };
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export const useExplorerTreeSessionStore = create<ExplorerTreeSessionStore>((set, get) => ({
  ...createDefaultExplorerTreeSessionState(),

  addExpandedFolders: (paths) => {
    set((state) => {
      const nextExpandedPaths = normalizeExpandedPaths([...state.expandedPaths, ...Array.from(paths)]);
      return areStringArraysEqual(state.expandedPaths, nextExpandedPaths)
        ? state
        : { expandedPaths: nextExpandedPaths };
    });
  },

  captureProjectExplorerTreeSession: () => {
    const state = get();
    return {
      expandedPaths: normalizeExpandedPaths(state.expandedPaths),
      scrollTop: normalizeScrollTop(state.scrollTop),
      selectedNode: state.selectedNode ? { ...state.selectedNode } : null,
    };
  },

  hydrateProjectExplorerTreeSession: (snapshot) => {
    if (!snapshot) {
      set(createDefaultExplorerTreeSessionState());
      return;
    }

    set({
      expandedPaths: normalizeExpandedPaths(snapshot.expandedPaths),
      scrollTop: normalizeScrollTop(snapshot.scrollTop),
      selectedNode: normalizeSelectedNode(snapshot.selectedNode),
    });
  },

  resetExplorerTreeSessionStoreForTests: () => {
    set(createDefaultExplorerTreeSessionState());
  },

  setExpandedFolders: (paths) => {
    const nextExpandedPaths = normalizeExpandedPaths(paths);
    set((state) => (areStringArraysEqual(state.expandedPaths, nextExpandedPaths)
      ? state
      : { expandedPaths: nextExpandedPaths }));
  },

  setScrollTop: (scrollTop) => {
    const nextScrollTop = normalizeScrollTop(scrollTop);
    set((state) => (state.scrollTop === nextScrollTop ? state : { scrollTop: nextScrollTop }));
  },

  setSelectedNode: (node) => {
    const nextSelectedNode = normalizeSelectedNode(node);
    set((state) => {
      if (
        state.selectedNode?.path === nextSelectedNode?.path
        && state.selectedNode?.type === nextSelectedNode?.type
      ) {
        return state;
      }

      return { selectedNode: nextSelectedNode };
    });
  },

  toggleExpandedFolder: (path) => {
    const normalizedPath = normalizeWorkspacePath(path);
    set((state) => {
      const nextExpandedPaths = new Set(state.expandedPaths);

      if (nextExpandedPaths.has(normalizedPath)) {
        nextExpandedPaths.delete(normalizedPath);
      } else {
        nextExpandedPaths.add(normalizedPath);
      }

      return { expandedPaths: normalizeExpandedPaths(nextExpandedPaths, { includeRoot: false }) };
    });
  },
}));

export function resetExplorerTreeSessionStoreForTests(): void {
  useExplorerTreeSessionStore.getState().resetExplorerTreeSessionStoreForTests();
}
