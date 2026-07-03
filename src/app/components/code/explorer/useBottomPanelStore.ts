import { create } from 'zustand';
import type {
  ProjectBottomPaneContent,
  ProjectBottomPanelSession,
  ProjectBottomPanelTabId,
  ProjectBottomPanelTabLayout,
} from '../../../../../types/project';
import type { TerminalProfile } from './terminalSessionStore';

export type BottomPanelTabId = 'terminal' | 'output' | 'problems' | 'debug' | 'lsp' | 'schematic' | 'waveform' | 'synthesis';

export type BottomPaneContent =
  | { kind: 'tab'; tab: BottomPanelTabId; terminalProfile?: TerminalProfile }
  | { kind: 'empty' }
  | { kind: 'placeholder'; label: string; icon: 'file' | 'boxes' };

export interface BottomPanelPane {
  id: string;
  content: BottomPaneContent;
  size: number;
}

export interface BottomTabLayout {
  focusedPaneId: string;
  focusedPaneMeasuredWidth: number;
  nextPaneIndex: number;
  panes: BottomPanelPane[];
}

export interface WslPaneOverride {
  paneId: string;
  previousContent: BottomPaneContent;
  tab: BottomPanelTabId;
}

export const MIN_SPLIT_PANE_WIDTH_PX = 260;
export const SPLIT_HANDLE_GAP_PX = 4;

export interface RemovedBottomPanelPane {
  pane: BottomPanelPane;
  nextFocusedPaneId: string;
}

type BottomPanelTabLayouts = Record<BottomPanelTabId, BottomTabLayout>;

interface BottomPanelState {
  activeTab: BottomPanelTabId;
  focusedPaneId: string;
  focusedPaneMeasuredWidth: number;
  nextPaneIndex: number;
  panes: BottomPanelPane[];
  tabLayouts: BottomPanelTabLayouts;
  wslPaneOverride: WslPaneOverride | null;
}

interface BottomPanelActions {
  captureProjectBottomPanelSession: () => ProjectBottomPanelSession;
  focusPane: (paneId: string, measuredWidth?: number) => void;
  hydrateProjectBottomPanelSession: (snapshot: ProjectBottomPanelSession | null | undefined) => void;
  removeFocusedPane: () => RemovedBottomPanelPane | null;
  restoreWslPaneOverride: () => boolean;
  resetBottomPanelPanes: () => void;
  setActiveTab: (tab: BottomPanelTabId) => void;
  setFocusedPaneMeasuredWidth: (measuredWidth: number) => void;
  setFocusedPaneTab: (tab: BottomPanelTabId, measuredWidth?: number) => void;
  setPaneSize: (paneId: string, size: number) => void;
  showWslTerminalInPane: (paneId: string, measuredWidth?: number) => boolean;
  splitFocusedPane: (measuredWidth: number) => boolean;
  updatePaneContent: (paneId: string, content: BottomPaneContent, measuredWidth?: number) => void;
}

export type BottomPanelStore = BottomPanelState & BottomPanelActions;

const BOTTOM_PANEL_TABS = [
  'terminal',
  'output',
  'problems',
  'debug',
  'lsp',
  'schematic',
  'waveform',
  'synthesis',
] as const satisfies readonly BottomPanelTabId[];

const VALID_BOTTOM_PANEL_TABS = new Set<BottomPanelTabId>(BOTTOM_PANEL_TABS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBottomPanelTabId(value: unknown): value is BottomPanelTabId {
  return typeof value === 'string' && VALID_BOTTOM_PANEL_TABS.has(value as BottomPanelTabId);
}

function createPaneId(tab: BottomPanelTabId, index: number): string {
  return tab === 'terminal' ? `bottom-pane-${index}` : `bottom-pane-${tab}-${index}`;
}

export const createInitialBottomPanelPane = (tab: BottomPanelTabId = 'terminal'): BottomPanelPane => ({
  content: { kind: 'tab', tab },
  id: createPaneId(tab, 1),
  size: 100,
});

function normalizeBottomPaneContent(value: unknown): BottomPaneContent {
  if (!isPlainObject(value)) {
    return { kind: 'empty' };
  }

  if (value['kind'] === 'tab' && isBottomPanelTabId(value['tab'])) {
    const terminalProfile = value['terminalProfile'] === 'wsl-pristine-eda' ? 'wsl-pristine-eda' : undefined;
    return terminalProfile && value['tab'] === 'terminal'
      ? { kind: 'tab', tab: value['tab'], terminalProfile }
      : { kind: 'tab', tab: value['tab'] };
  }

  if (value['kind'] === 'placeholder') {
    const label = typeof value['label'] === 'string' && value['label'].trim().length > 0
      ? value['label']
      : 'Placeholder';
    const icon = value['icon'] === 'boxes' ? 'boxes' : 'file';
    return { kind: 'placeholder', icon, label };
  }

  return { kind: 'empty' };
}

function isWslTerminalContent(content: BottomPaneContent): boolean {
  return content.kind === 'tab'
    && content.tab === 'terminal'
    && content.terminalProfile === 'wsl-pristine-eda';
}

function normalizePaneContentForSession(content: BottomPaneContent): ProjectBottomPaneContent {
  return content.kind === 'tab' && content.tab === 'terminal'
    ? { kind: 'tab', tab: 'terminal' }
    : { ...content };
}

export function normalizeBottomPaneSizes(panes: BottomPanelPane[]): BottomPanelPane[] {
  const total = panes.reduce((sum, pane) => sum + pane.size, 0);
  if (total <= 0) {
    const fallbackSize = 100 / panes.length;
    return panes.map((pane) => ({ ...pane, size: fallbackSize }));
  }

  return panes.map((pane) => ({ ...pane, size: (pane.size / total) * 100 }));
}

function inferNextPaneIndex(panes: BottomPanelPane[], rawNextPaneIndex: unknown): number {
  const maxPaneIndex = panes.reduce((maxIndex, pane) => {
    const match = pane.id.match(/(\d+)$/);
    const index = match ? Number.parseInt(match[1] ?? '', 10) : Number.NaN;
    return Number.isFinite(index) ? Math.max(maxIndex, index) : maxIndex;
  }, panes.length);
  const fallback = Math.max(maxPaneIndex + 1, panes.length + 1, 2);
  return typeof rawNextPaneIndex === 'number'
    && Number.isInteger(rawNextPaneIndex)
    && rawNextPaneIndex >= fallback
    ? rawNextPaneIndex
    : fallback;
}

function normalizeTabLayout(
  tab: BottomPanelTabId,
  value: unknown,
  fallback = createDefaultBottomTabLayout(tab),
): BottomTabLayout {
  if (!isPlainObject(value) || !Array.isArray(value['panes'])) {
    return { ...fallback, panes: [...fallback.panes] };
  }

  const seenPaneIds = new Set<string>();
  const panes = value['panes']
    .map((pane, index): BottomPanelPane | null => {
      if (!isPlainObject(pane)) {
        return null;
      }

      const fallbackId = createPaneId(tab, index + 1);
      const id = typeof pane['id'] === 'string' && pane['id'].trim().length > 0
        ? pane['id']
        : fallbackId;

      if (seenPaneIds.has(id)) {
        return null;
      }
      seenPaneIds.add(id);

      const size = typeof pane['size'] === 'number' && Number.isFinite(pane['size']) && pane['size'] > 0
        ? pane['size']
        : 100;

      return {
        content: normalizeBottomPaneContent(pane['content']),
        id,
        size,
      };
    })
    .filter((pane): pane is BottomPanelPane => Boolean(pane));

  if (panes.length === 0) {
    return { ...fallback, panes: [...fallback.panes] };
  }

  const normalizedPanes = normalizeBottomPaneSizes(panes);
  const focusedPaneId = typeof value['focusedPaneId'] === 'string'
    && normalizedPanes.some((pane) => pane.id === value['focusedPaneId'])
    ? value['focusedPaneId']
    : normalizedPanes[0]?.id ?? fallback.focusedPaneId;

  return {
    focusedPaneId,
    focusedPaneMeasuredWidth: Number.POSITIVE_INFINITY,
    nextPaneIndex: inferNextPaneIndex(normalizedPanes, value['nextPaneIndex']),
    panes: normalizedPanes,
  };
}

function createDefaultBottomTabLayout(tab: BottomPanelTabId): BottomTabLayout {
  const pane = createInitialBottomPanelPane(tab);
  return {
    focusedPaneId: pane.id,
    focusedPaneMeasuredWidth: Number.POSITIVE_INFINITY,
    nextPaneIndex: 2,
    panes: [pane],
  };
}

function createDefaultTabLayouts(): BottomPanelTabLayouts {
  return Object.fromEntries(BOTTOM_PANEL_TABS.map((tab) => [tab, createDefaultBottomTabLayout(tab)])) as BottomPanelTabLayouts;
}

function createStateFromLayouts(
  activeTab: BottomPanelTabId,
  tabLayouts: BottomPanelTabLayouts,
  wslPaneOverride: WslPaneOverride | null = null,
): BottomPanelState {
  const activeLayout = tabLayouts[activeTab] ?? createDefaultBottomTabLayout(activeTab);
  return {
    activeTab,
    focusedPaneId: activeLayout.focusedPaneId,
    focusedPaneMeasuredWidth: activeLayout.focusedPaneMeasuredWidth,
    nextPaneIndex: activeLayout.nextPaneIndex,
    panes: activeLayout.panes,
    tabLayouts: {
      ...tabLayouts,
      [activeTab]: activeLayout,
    },
    wslPaneOverride,
  };
}

function createDefaultBottomPanelState(): BottomPanelState {
  return createStateFromLayouts('terminal', createDefaultTabLayouts());
}

function canSplitMeasuredWidth(measuredWidth: number): boolean {
  return measuredWidth >= (MIN_SPLIT_PANE_WIDTH_PX * 2 + SPLIT_HANDLE_GAP_PX);
}

function updateActiveLayout(
  state: BottomPanelState,
  updater: (layout: BottomTabLayout) => BottomTabLayout,
  wslPaneOverride = state.wslPaneOverride,
): BottomPanelState {
  const layout = updater(state.tabLayouts[state.activeTab] ?? createDefaultBottomTabLayout(state.activeTab));
  return createStateFromLayouts(state.activeTab, {
    ...state.tabLayouts,
    [state.activeTab]: layout,
  }, wslPaneOverride);
}

function cloneLayoutForSession(layout: BottomTabLayout): ProjectBottomPanelTabLayout {
  return {
    focusedPaneId: layout.focusedPaneId,
    nextPaneIndex: layout.nextPaneIndex,
    panes: layout.panes.map((pane) => ({
      content: normalizePaneContentForSession(pane.content),
      id: pane.id,
      size: pane.size,
    })),
  };
}

function getProjectSessionTabLayouts(state: BottomPanelState): BottomPanelTabLayouts {
  if (!state.wslPaneOverride) {
    return state.tabLayouts;
  }

  const override = state.wslPaneOverride;
  const layout = state.tabLayouts[override.tab];
  if (!layout) {
    return state.tabLayouts;
  }

  return {
    ...state.tabLayouts,
    [override.tab]: {
      ...layout,
      panes: layout.panes.map((pane) => (
        pane.id === override.paneId && isWslTerminalContent(pane.content)
          ? { ...pane, content: override.previousContent }
          : pane
      )),
    },
  };
}

function normalizeNewBottomPanelSession(snapshot: Record<string, unknown>): BottomPanelState {
  const defaultLayouts = createDefaultTabLayouts();
  const rawTabs = isPlainObject(snapshot['tabs']) ? snapshot['tabs'] : {};
  const tabLayouts = Object.fromEntries(BOTTOM_PANEL_TABS.map((tab) => [
    tab,
    normalizeTabLayout(tab, rawTabs[tab], defaultLayouts[tab]),
  ])) as BottomPanelTabLayouts;
  const activeTab = isBottomPanelTabId(snapshot['activeTab']) ? snapshot['activeTab'] : 'terminal';
  return createStateFromLayouts(activeTab, tabLayouts);
}

function normalizeLegacyBottomPanelSession(snapshot: Record<string, unknown>): BottomPanelState {
  const flatLayout = normalizeTabLayout('terminal', snapshot);
  const focusedPane = flatLayout.panes.find((pane) => pane.id === flatLayout.focusedPaneId);
  const activeTab = focusedPane?.content.kind === 'tab' ? focusedPane.content.tab : 'terminal';
  const groupedPanes = new Map<BottomPanelTabId, BottomPanelPane[]>();

  flatLayout.panes.forEach((pane) => {
    const tab = pane.content.kind === 'tab' ? pane.content.tab : activeTab;
    groupedPanes.set(tab, [...(groupedPanes.get(tab) ?? []), pane]);
  });

  const defaultLayouts = createDefaultTabLayouts();
  const tabLayouts = { ...defaultLayouts };

  groupedPanes.forEach((panes, tab) => {
    const normalizedPanes = normalizeBottomPaneSizes(panes);
    const focusedPaneId = normalizedPanes.some((pane) => pane.id === flatLayout.focusedPaneId)
      ? flatLayout.focusedPaneId
      : normalizedPanes[0]?.id ?? defaultLayouts[tab].focusedPaneId;
    tabLayouts[tab] = {
      focusedPaneId,
      focusedPaneMeasuredWidth: Number.POSITIVE_INFINITY,
      nextPaneIndex: inferNextPaneIndex(normalizedPanes, snapshot['nextPaneIndex']),
      panes: normalizedPanes,
    };
  });

  return createStateFromLayouts(activeTab, tabLayouts);
}

function normalizeHydratedBottomPanelSession(
  snapshot: ProjectBottomPanelSession | null | undefined,
): BottomPanelState {
  if (!isPlainObject(snapshot)) {
    return createDefaultBottomPanelState();
  }

  if (isPlainObject(snapshot['tabs'])) {
    return normalizeNewBottomPanelSession(snapshot);
  }

  if (Array.isArray(snapshot['panes'])) {
    return normalizeLegacyBottomPanelSession(snapshot);
  }

  return createDefaultBottomPanelState();
}

export const useBottomPanelStore = create<BottomPanelStore>((set, get) => ({
  ...createDefaultBottomPanelState(),

  captureProjectBottomPanelSession: () => {
    const state = get();
    const tabLayouts = getProjectSessionTabLayouts(state);
    return {
      activeTab: state.activeTab,
      tabs: Object.fromEntries(BOTTOM_PANEL_TABS.map((tab) => [
        tab,
        cloneLayoutForSession(tabLayouts[tab]),
      ])) as Record<ProjectBottomPanelTabId, ProjectBottomPanelTabLayout>,
    };
  },

  focusPane: (paneId, measuredWidth) => {
    set((state) => updateActiveLayout(state, (layout) => {
      if (!layout.panes.some((pane) => pane.id === paneId)) {
        return layout;
      }

      return {
        ...layout,
        focusedPaneId: paneId,
        focusedPaneMeasuredWidth: measuredWidth ?? layout.focusedPaneMeasuredWidth,
      };
    }));
  },

  hydrateProjectBottomPanelSession: (snapshot) => {
    set(normalizeHydratedBottomPanelSession(snapshot));
  },

  removeFocusedPane: () => {
    const state = get();
    const layout = state.tabLayouts[state.activeTab];
    if (!layout || layout.panes.length <= 1) {
      return null;
    }

    const focusedIndex = layout.panes.findIndex((pane) => pane.id === layout.focusedPaneId);
    if (focusedIndex < 0) {
      return null;
    }

    const removedPane = layout.panes[focusedIndex];
    if (!removedPane) {
      return null;
    }

    const nextPanes = normalizeBottomPaneSizes(layout.panes.filter((pane) => pane.id !== removedPane.id));
    const nextFocusedPane = nextPanes[Math.min(focusedIndex, nextPanes.length - 1)] ?? nextPanes[0];
    if (!nextFocusedPane) {
      return null;
    }

    const nextWslPaneOverride = state.wslPaneOverride?.tab === state.activeTab && state.wslPaneOverride.paneId === removedPane.id
      ? null
      : state.wslPaneOverride;

    set(updateActiveLayout(state, () => ({
      ...layout,
      focusedPaneId: nextFocusedPane.id,
      focusedPaneMeasuredWidth: Number.POSITIVE_INFINITY,
      panes: nextPanes,
    }), nextWslPaneOverride));

    return {
      nextFocusedPaneId: nextFocusedPane.id,
      pane: removedPane,
    };
  },

  restoreWslPaneOverride: () => {
    const state = get();
    const override = state.wslPaneOverride;
    if (!override) {
      return false;
    }

    const layout = state.tabLayouts[override.tab];
    if (!layout) {
      set({ wslPaneOverride: null });
      return false;
    }

    let restored = false;
    const panes = layout.panes.map((pane) => {
      if (pane.id !== override.paneId || !isWslTerminalContent(pane.content)) {
        return pane;
      }

      restored = true;
      return { ...pane, content: override.previousContent };
    });

    const tabLayouts = {
      ...state.tabLayouts,
      [override.tab]: {
        ...layout,
        panes,
      },
    };
    set(createStateFromLayouts(state.activeTab, tabLayouts, null));

    return restored;
  },

  resetBottomPanelPanes: () => {
    set(createDefaultBottomPanelState());
  },

  setActiveTab: (tab) => {
    set((state) => createStateFromLayouts(tab, state.tabLayouts, state.wslPaneOverride));
  },

  setFocusedPaneMeasuredWidth: (measuredWidth) => {
    set((state) => updateActiveLayout(state, (layout) => ({
      ...layout,
      focusedPaneMeasuredWidth: measuredWidth,
    })));
  },

  setFocusedPaneTab: (tab, measuredWidth) => {
    get().updatePaneContent(get().focusedPaneId, { kind: 'tab', tab }, measuredWidth);
  },

  setPaneSize: (paneId, size) => {
    set((state) => updateActiveLayout(state, (layout) => {
      const pane = layout.panes.find((currentPane) => currentPane.id === paneId);
      if (!pane || Math.abs(pane.size - size) < 0.001) {
        return layout;
      }

      return {
        ...layout,
        panes: layout.panes.map((currentPane) => (
          currentPane.id === paneId ? { ...currentPane, size } : currentPane
        )),
      };
    }));
  },

  showWslTerminalInPane: (paneId, measuredWidth) => {
    const state = get();
    const terminalLayout = state.tabLayouts.terminal;
    const pane = terminalLayout.panes.find((currentPane) => currentPane.id === paneId)
      ?? terminalLayout.panes.find((currentPane) => currentPane.id === terminalLayout.focusedPaneId)
      ?? terminalLayout.panes[0];
    if (!pane) {
      return false;
    }

    if (isWslTerminalContent(pane.content) && !state.wslPaneOverride) {
      set(createStateFromLayouts('terminal', {
        ...state.tabLayouts,
        terminal: {
          ...terminalLayout,
          focusedPaneId: pane.id,
          focusedPaneMeasuredWidth: measuredWidth ?? terminalLayout.focusedPaneMeasuredWidth,
        },
      }));
      return true;
    }

    const wslContent: BottomPaneContent = {
      kind: 'tab',
      tab: 'terminal',
      terminalProfile: 'wsl-pristine-eda',
    };
    const previousContent = state.wslPaneOverride?.tab === 'terminal' && state.wslPaneOverride.paneId === pane.id
      ? state.wslPaneOverride.previousContent
      : pane.content;
    const restoredLayouts = state.wslPaneOverride
      && !(state.wslPaneOverride.tab === 'terminal' && state.wslPaneOverride.paneId === pane.id)
      ? getProjectSessionTabLayouts(state)
      : state.tabLayouts;
    const nextTerminalLayout = restoredLayouts.terminal;

    set(createStateFromLayouts('terminal', {
      ...restoredLayouts,
      terminal: {
        ...nextTerminalLayout,
        focusedPaneId: pane.id,
        focusedPaneMeasuredWidth: measuredWidth ?? nextTerminalLayout.focusedPaneMeasuredWidth,
        panes: nextTerminalLayout.panes.map((currentPane) => (
          currentPane.id === pane.id ? { ...currentPane, content: wslContent } : currentPane
        )),
      },
    }, {
      paneId: pane.id,
      previousContent,
      tab: 'terminal',
    }));

    return true;
  },

  splitFocusedPane: (measuredWidth) => {
    if (!canSplitMeasuredWidth(measuredWidth)) {
      return false;
    }

    const state = get();
    const layout = state.tabLayouts[state.activeTab];
    const focusedIndex = layout.panes.findIndex((pane) => pane.id === layout.focusedPaneId);
    if (focusedIndex < 0) {
      return false;
    }

    const focusedPane = layout.panes[focusedIndex];
    if (!focusedPane) {
      return false;
    }

    const nextPaneId = createPaneId(state.activeTab, layout.nextPaneIndex);
    const halfSize = focusedPane.size / 2;
    const nextPanes = normalizeBottomPaneSizes([
      ...layout.panes.slice(0, focusedIndex),
      { ...focusedPane, size: halfSize },
      { content: { kind: 'empty' }, id: nextPaneId, size: halfSize },
      ...layout.panes.slice(focusedIndex + 1),
    ]);

    set(updateActiveLayout(state, () => ({
      focusedPaneId: nextPaneId,
      focusedPaneMeasuredWidth: Number.POSITIVE_INFINITY,
      nextPaneIndex: layout.nextPaneIndex + 1,
      panes: nextPanes,
    })));

    return true;
  },

  updatePaneContent: (paneId, content, measuredWidth) => {
    set((state) => updateActiveLayout(state, (layout) => {
      if (!layout.panes.some((pane) => pane.id === paneId)) {
        return layout;
      }

      return {
        ...layout,
        focusedPaneId: paneId,
        focusedPaneMeasuredWidth: measuredWidth ?? layout.focusedPaneMeasuredWidth,
        panes: layout.panes.map((pane) => (
          pane.id === paneId ? { ...pane, content } : pane
        )),
      };
    }, state.wslPaneOverride?.tab === state.activeTab
      && state.wslPaneOverride.paneId === paneId
      && !isWslTerminalContent(content)
      ? null
      : state.wslPaneOverride));
  },
}));

export function resetBottomPanelStoreForTests(): void {
  useBottomPanelStore.setState(createDefaultBottomPanelState());
}
