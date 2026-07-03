import { useEffect } from 'react';
import { create } from 'zustand';
import type { WorkspaceGitPathState, WorkspaceGitStatusPayload } from '../../../types/workspace-git';
import { normalizeWorkspacePath } from '../workspace/workspaceFiles';

export interface WorkspaceGitSnapshot extends WorkspaceGitStatusPayload {
  isLoading: boolean;
}

const GIT_REFRESH_DEBOUNCE_MS = 100;

const EMPTY_WORKSPACE_GIT_STATUS: WorkspaceGitStatusPayload = {
  branchName: null,
  hasProjectFiles: false,
  isGitRepo: false,
  pathStates: {},
};

let inFlightLoad: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

interface WorkspaceGitStatusStoreState {
  snapshot: WorkspaceGitSnapshot;
}

interface WorkspaceGitStatusStoreActions {
  setSnapshot: (snapshot: WorkspaceGitSnapshot) => void;
}

type WorkspaceGitStatusStore = WorkspaceGitStatusStoreState & WorkspaceGitStatusStoreActions;

const DEFAULT_WORKSPACE_GIT_SNAPSHOT: WorkspaceGitSnapshot = {
  ...EMPTY_WORKSPACE_GIT_STATUS,
  isLoading: false,
};

const useWorkspaceGitStatusStore = create<WorkspaceGitStatusStore>((set) => ({
  snapshot: DEFAULT_WORKSPACE_GIT_SNAPSHOT,
  setSnapshot: (snapshot) => {
    set({ snapshot });
  },
}));

function getWorkspaceGitSnapshot(): WorkspaceGitSnapshot {
  return useWorkspaceGitStatusStore.getState().snapshot;
}

function setWorkspaceGitSnapshot(snapshot: WorkspaceGitSnapshot): void {
  useWorkspaceGitStatusStore.getState().setSnapshot(snapshot);
}

function normalizePathStates(pathStates: Record<string, WorkspaceGitPathState>): Record<string, WorkspaceGitPathState> {
  return Object.entries(pathStates).reduce<Record<string, WorkspaceGitPathState>>((current, [path, state]) => {
    const normalizedPath = normalizeWorkspacePath(path.replace(/\/$/, ''));

    if (normalizedPath !== '.') {
      current[normalizedPath] = state;
    }

    return current;
  }, {});
}

async function loadWorkspaceGitStatus(force = false): Promise<void> {
  if (inFlightLoad && !force) {
    return inFlightLoad;
  }

  const gitApi = window.electronAPI?.git;
  if (!gitApi) {
    setWorkspaceGitSnapshot({
      ...EMPTY_WORKSPACE_GIT_STATUS,
      isLoading: false,
      pathStates: {},
    });
    return;
  }

  setWorkspaceGitSnapshot({
    ...getWorkspaceGitSnapshot(),
    isLoading: true,
  });

  const nextLoad = gitApi.getStatus()
    .then((nextStatus) => {
      setWorkspaceGitSnapshot({
        ...nextStatus,
        isLoading: false,
        pathStates: normalizePathStates(nextStatus.pathStates),
      });
    })
    .catch(() => {
      setWorkspaceGitSnapshot({
        ...EMPTY_WORKSPACE_GIT_STATUS,
        isLoading: false,
        pathStates: {},
      });
    })
    .finally(() => {
      inFlightLoad = null;
    });

  inFlightLoad = nextLoad;
  return nextLoad;
}

export function getWorkspaceGitBranchLabel(snapshot: WorkspaceGitSnapshot): string {
  if (!snapshot.hasProjectFiles || !snapshot.isGitRepo || !snapshot.branchName) {
    return 'git';
  }

  return snapshot.branchName;
}

export function getWorkspaceGitPathState(
  snapshot: WorkspaceGitSnapshot,
  path: string,
): WorkspaceGitPathState | undefined {
  if (!path) {
    return undefined;
  }

  return snapshot.pathStates[normalizeWorkspacePath(path)];
}

export function refreshWorkspaceGitStatus() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void loadWorkspaceGitStatus(true);
  }, GIT_REFRESH_DEBOUNCE_MS);
}

export function resetWorkspaceGitStatusStoreForTests() {
  setWorkspaceGitSnapshot(DEFAULT_WORKSPACE_GIT_SNAPSHOT);
  inFlightLoad = null;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

export function useWorkspaceGitStatus(): WorkspaceGitSnapshot {
  const snapshot = useWorkspaceGitStatusStore((state) => state.snapshot);

  useEffect(() => {
    void loadWorkspaceGitStatus();
  }, []);

  return snapshot;
}
