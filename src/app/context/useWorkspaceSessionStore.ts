import { create } from 'zustand';
import {
  type CodeView,
  DEFAULT_PANEL_STATE_BY_CODE_VIEW,
  type MainContentView,
  type PanelVisibilityState,
} from '../codeViewPanels';
import type { ProjectSessionSnapshot, ProjectState } from '../../../types/project';

type ProjectPanelWidthUpdater = number | ((current: number | undefined) => number);
export type WorkspaceBootstrapStatus = 'bootstrapping' | 'ready';

interface WorkspaceSessionSnapshotFields {
  activeView: CodeView;
  mainContentView: MainContentView;
  panelStateByView: Record<CodeView, PanelVisibilityState>;
  panelWidths: Record<string, number>;
}

interface WorkspaceSessionState extends WorkspaceSessionSnapshotFields {
  currentProject: ProjectState | null;
  workspaceBootstrapStatus: WorkspaceBootstrapStatus;
  workspaceTreeRefreshToken: number;
}

interface WorkspaceSessionActions {
  bumpWorkspaceTreeRefreshToken: () => void;
  captureSessionState: () => WorkspaceSessionSnapshotFields;
  hydrateProjectSession: (snapshot: ProjectSessionSnapshot | null | undefined) => void;
  resetProjectSession: () => void;
  setActiveView: (view: CodeView) => void;
  setWorkspaceBootstrapStatus: (status: WorkspaceBootstrapStatus) => void;
  setCurrentProject: (project: ProjectState | null) => void;
  setMainContentView: (view: MainContentView) => void;
  setPanelStateForView: (view: CodeView, nextState: Partial<PanelVisibilityState>) => void;
  setProjectPanelWidth: (key: string, value: ProjectPanelWidthUpdater) => void;
}

export type WorkspaceSessionStore = WorkspaceSessionState & WorkspaceSessionActions;

function clonePanelStateByView(
  panelStateByView: Record<CodeView, PanelVisibilityState>,
): Record<CodeView, PanelVisibilityState> {
  return {
    explorer: { ...panelStateByView.explorer },
    simulation: { ...panelStateByView.simulation },
    synthesis: { ...panelStateByView.synthesis },
    physical: { ...panelStateByView.physical },
    factory: { ...panelStateByView.factory },
  };
}

function createDefaultSessionState(): WorkspaceSessionState {
  return {
    activeView: 'explorer',
    currentProject: null,
    mainContentView: 'code',
    panelStateByView: clonePanelStateByView(DEFAULT_PANEL_STATE_BY_CODE_VIEW),
    workspaceBootstrapStatus: 'bootstrapping',
    panelWidths: {},
    workspaceTreeRefreshToken: 0,
  };
}

function getHydratedSessionState(
  snapshot: ProjectSessionSnapshot | null | undefined,
): Pick<WorkspaceSessionState, 'activeView' | 'mainContentView' | 'panelStateByView' | 'panelWidths'> {
  if (!snapshot) {
    return {
      activeView: 'explorer',
      mainContentView: 'code',
      panelStateByView: clonePanelStateByView(DEFAULT_PANEL_STATE_BY_CODE_VIEW),
      panelWidths: {},
    };
  }

  return {
    activeView: snapshot.activeView,
    mainContentView: snapshot.mainContentView,
    panelStateByView: clonePanelStateByView({
      ...DEFAULT_PANEL_STATE_BY_CODE_VIEW,
      ...snapshot.panelStateByView,
    }),
    panelWidths: { ...(snapshot.panelWidths ?? {}) },
  };
}

export const useWorkspaceSessionStore = create<WorkspaceSessionStore>((set, get) => ({
  ...createDefaultSessionState(),

  bumpWorkspaceTreeRefreshToken: () => {
    set((state) => ({ workspaceTreeRefreshToken: state.workspaceTreeRefreshToken + 1 }));
  },

  captureSessionState: () => {
    const state = get();
    return {
      activeView: state.activeView,
      mainContentView: state.mainContentView,
      panelStateByView: clonePanelStateByView(state.panelStateByView),
      panelWidths: { ...state.panelWidths },
    };
  },

  hydrateProjectSession: (snapshot) => {
    set(getHydratedSessionState(snapshot));
  },

  resetProjectSession: () => {
    set(getHydratedSessionState(null));
  },

  setActiveView: (view) => {
    set((state) => (state.activeView === view ? state : { activeView: view }));
  },

  setWorkspaceBootstrapStatus: (status) => {
    set((state) => (state.workspaceBootstrapStatus === status ? state : { workspaceBootstrapStatus: status }));
  },

  setCurrentProject: (project) => {
    set((state) => (state.currentProject === project ? state : { currentProject: project }));
  },

  setMainContentView: (view) => {
    set((state) => (state.mainContentView === view ? state : { mainContentView: view }));
  },

  setPanelStateForView: (view, nextState) => {
    set((state) => {
      const currentPanelState = state.panelStateByView[view];
      const nextPanelState = {
        ...currentPanelState,
        ...nextState,
      };

      if (
        currentPanelState.showLeftPanel === nextPanelState.showLeftPanel
        && currentPanelState.showBottomPanel === nextPanelState.showBottomPanel
        && currentPanelState.showRightPanel === nextPanelState.showRightPanel
      ) {
        return state;
      }

      return {
        panelStateByView: {
          ...state.panelStateByView,
          [view]: nextPanelState,
        },
      };
    });
  },

  setProjectPanelWidth: (key, value) => {
    set((state) => {
      const currentValue = state.panelWidths[key];
      const nextValue = typeof value === 'function' ? value(currentValue) : value;
      if (!Number.isFinite(nextValue) || nextValue <= 0 || currentValue === nextValue) {
        return state;
      }

      return {
        panelWidths: {
          ...state.panelWidths,
          [key]: nextValue,
        },
      };
    });
  },
}));

export function resetWorkspaceSessionStoreForTests(): void {
  useWorkspaceSessionStore.setState(createDefaultSessionState());
}
