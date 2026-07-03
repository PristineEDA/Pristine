import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_STATE_BY_CODE_VIEW } from '../codeViewPanels';
import type { ProjectSessionSnapshot, ProjectState } from '../../../types/project';
import {
  resetWorkspaceSessionStoreForTests,
  useWorkspaceSessionStore,
} from './useWorkspaceSessionStore';

function getStore() {
  return useWorkspaceSessionStore.getState();
}

function createProject(session: ProjectSessionSnapshot | null = null): ProjectState {
  return {
    config: {
      mgnt: 'none',
      mode: 'rtl2gds',
      padframe: 'QFN32',
      process: 'ics55',
      type: 'retroSoC',
    },
    name: 'chip_lab',
    rootPath: 'C:\\Projects\\chip_lab',
    session,
  };
}

function createSnapshot(): ProjectSessionSnapshot {
  return {
    activeTabId: 'rtl/top.sv',
    activeView: 'physical',
    editorGroups: [],
    editorLayout: null,
    focusedGroupId: 'group-2',
    mainContentView: 'whiteboard',
    panelStateByView: {
      ...DEFAULT_PANEL_STATE_BY_CODE_VIEW,
      explorer: {
        showLeftPanel: true,
        showBottomPanel: true,
        showRightPanel: false,
      },
      physical: {
        showLeftPanel: true,
        showBottomPanel: false,
        showRightPanel: true,
      },
    },
    panelWidths: {
      explorerLeftPanel: 312,
      physicalRightPanel: 420,
    },
    version: 1,
  };
}

describe('useWorkspaceSessionStore', () => {
  beforeEach(() => {
    resetWorkspaceSessionStoreForTests();
  });

  it('starts with the default project and layout session state', () => {
    const state = getStore();

    expect(state.currentProject).toBeNull();
    expect(state.activeView).toBe('explorer');
    expect(state.mainContentView).toBe('code');
    expect(state.panelStateByView).toEqual(DEFAULT_PANEL_STATE_BY_CODE_VIEW);
    expect(state.panelWidths).toEqual({});
    expect(state.workspaceBootstrapStatus).toBe('bootstrapping');
    expect(state.workspaceTreeRefreshToken).toBe(0);
  });

  it('tracks workspace bootstrap readiness and resets it for tests', () => {
    getStore().setWorkspaceBootstrapStatus('ready');

    expect(getStore().workspaceBootstrapStatus).toBe('ready');

    resetWorkspaceSessionStoreForTests();

    expect(getStore().workspaceBootstrapStatus).toBe('bootstrapping');
  });

  it('updates current project and high-level view state', () => {
    const project = createProject();

    getStore().setCurrentProject(project);
    getStore().setActiveView('synthesis');
    getStore().setMainContentView('workflow');

    expect(getStore().currentProject).toBe(project);
    expect(getStore().activeView).toBe('synthesis');
    expect(getStore().mainContentView).toBe('workflow');
  });

  it('updates panel visibility for a specific code view', () => {
    getStore().setPanelStateForView('explorer', {
      showLeftPanel: true,
      showBottomPanel: true,
    });

    expect(getStore().panelStateByView.explorer).toEqual({
      showLeftPanel: true,
      showBottomPanel: true,
      showRightPanel: false,
    });
    expect(getStore().panelStateByView.physical).toEqual(DEFAULT_PANEL_STATE_BY_CODE_VIEW.physical);
  });

  it('tracks finite positive project panel widths', () => {
    getStore().setProjectPanelWidth('explorerLeftPanel', 320);
    getStore().setProjectPanelWidth('explorerLeftPanel', (current) => (current ?? 0) + 24);
    getStore().setProjectPanelWidth('ignoredZero', 0);
    getStore().setProjectPanelWidth('ignoredInfinite', Number.POSITIVE_INFINITY);

    expect(getStore().panelWidths).toEqual({
      explorerLeftPanel: 344,
    });
  });

  it('hydrates project session fields from a snapshot', () => {
    const snapshot = createSnapshot();

    getStore().hydrateProjectSession(snapshot);

    expect(getStore().activeView).toBe('physical');
    expect(getStore().mainContentView).toBe('whiteboard');
    expect(getStore().panelStateByView.explorer).toEqual(snapshot.panelStateByView.explorer);
    expect(getStore().panelStateByView.physical).toEqual(snapshot.panelStateByView.physical);
    expect(getStore().panelWidths).toEqual(snapshot.panelWidths);
  });

  it('resets project session fields without clearing the current project', () => {
    const project = createProject(createSnapshot());

    getStore().setCurrentProject(project);
    getStore().hydrateProjectSession(project.session);
    getStore().resetProjectSession();

    expect(getStore().currentProject).toBe(project);
    expect(getStore().activeView).toBe('explorer');
    expect(getStore().mainContentView).toBe('code');
    expect(getStore().panelStateByView).toEqual(DEFAULT_PANEL_STATE_BY_CODE_VIEW);
    expect(getStore().panelWidths).toEqual({});
  });

  it('captures defensive copies for session persistence', () => {
    getStore().hydrateProjectSession(createSnapshot());

    const captured = getStore().captureSessionState();
    captured.panelStateByView.explorer.showLeftPanel = false;
    captured.panelWidths.explorerLeftPanel = 1;

    expect(getStore().panelStateByView.explorer.showLeftPanel).toBe(true);
    expect(getStore().panelWidths.explorerLeftPanel).toBe(312);
  });

  it('increments the workspace tree refresh token', () => {
    getStore().bumpWorkspaceTreeRefreshToken();
    getStore().bumpWorkspaceTreeRefreshToken();

    expect(getStore().workspaceTreeRefreshToken).toBe(2);
  });
});
