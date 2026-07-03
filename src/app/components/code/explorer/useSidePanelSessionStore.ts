import { create } from 'zustand';
import type { ExplorerPanelTab } from './LeftSidePanelChrome';
import type { RightSidePanelTab } from './RightSidePanelChrome';
import { ASSISTANT_THREAD_LIST_DEFAULT_WIDTH_PX } from './assistantPanelLayout';
import type { ProjectSidePanelSession } from '../../../../../types/project';

export type ExplorerSecondaryPanelTab = 'hierarchy' | 'libraries';
export type RightPanelSecondaryTab = 'module-info' | 'resource-usage' | 'x-propagation';
export type PhysicalLeftPanelTab = 'layout' | 'constraints';
export type PhysicalRightPanelTab = 'layers' | 'checks';
export type PhysicalBottomPanelTab = 'reports' | 'console';

interface SidePanelSessionState {
  assistantThreadListExpanded: boolean;
  assistantThreadListWidth: number;
  leftHierarchyReloadNonce: number;
  leftPrimaryTab: ExplorerPanelTab;
  leftSecondaryTab: ExplorerSecondaryPanelTab;
  leftSplitVisible: boolean;
  physicalBottomTab: PhysicalBottomPanelTab;
  physicalLeftSplitVisible: boolean;
  physicalLeftTab: PhysicalLeftPanelTab;
  physicalRightSplitVisible: boolean;
  physicalRightTab: PhysicalRightPanelTab;
  rightPrimaryTab: RightSidePanelTab;
  rightSecondaryTab: RightPanelSecondaryTab;
  rightSplitVisible: boolean;
}

interface SidePanelSessionActions {
  bumpExplorerLeftHierarchyReloadNonce: () => void;
  captureProjectSidePanelSession: () => ProjectSidePanelSession;
  hydrateProjectSidePanelSession: (snapshot: ProjectSidePanelSession | null | undefined) => void;
  resetSidePanelSessionStoreForTests: () => void;
  setAssistantThreadListExpanded: (expanded: boolean) => void;
  setAssistantThreadListWidth: (width: number) => void;
  setExplorerLeftSecondaryTab: (tab: ExplorerSecondaryPanelTab) => void;
  setExplorerLeftSplitVisible: (visible: boolean) => void;
  setExplorerLeftTab: (tab: ExplorerPanelTab) => void;
  setExplorerRightSecondaryTab: (tab: RightPanelSecondaryTab) => void;
  setExplorerRightSplitVisible: (visible: boolean) => void;
  setExplorerRightTab: (tab: RightSidePanelTab) => void;
  setPhysicalBottomTab: (tab: PhysicalBottomPanelTab) => void;
  setPhysicalLeftSplitVisible: (visible: boolean) => void;
  setPhysicalLeftTab: (tab: PhysicalLeftPanelTab) => void;
  setPhysicalRightSplitVisible: (visible: boolean) => void;
  setPhysicalRightTab: (tab: PhysicalRightPanelTab) => void;
}

export type SidePanelSessionStore = SidePanelSessionState & SidePanelSessionActions;

function createDefaultSidePanelSessionState(): SidePanelSessionState {
  return {
    assistantThreadListExpanded: false,
    assistantThreadListWidth: ASSISTANT_THREAD_LIST_DEFAULT_WIDTH_PX,
    leftHierarchyReloadNonce: 0,
    leftPrimaryTab: 'explorer',
    leftSecondaryTab: 'hierarchy',
    leftSplitVisible: false,
    physicalBottomTab: 'reports',
    physicalLeftSplitVisible: false,
    physicalLeftTab: 'layout',
    physicalRightSplitVisible: false,
    physicalRightTab: 'layers',
    rightPrimaryTab: 'ai',
    rightSecondaryTab: 'module-info',
    rightSplitVisible: false,
  };
}

export const useSidePanelSessionStore = create<SidePanelSessionStore>((set, get) => ({
  ...createDefaultSidePanelSessionState(),

  bumpExplorerLeftHierarchyReloadNonce: () => {
    set((state) => ({ leftHierarchyReloadNonce: state.leftHierarchyReloadNonce + 1 }));
  },

  captureProjectSidePanelSession: () => {
    const state = get();
    return {
      assistantThreadListExpanded: state.assistantThreadListExpanded,
      assistantThreadListWidth: state.assistantThreadListWidth,
      leftPrimaryTab: state.leftPrimaryTab,
      leftSecondaryTab: state.leftSecondaryTab,
      leftSplitVisible: state.leftSplitVisible,
      physicalBottomTab: state.physicalBottomTab,
      physicalLeftSplitVisible: state.physicalLeftSplitVisible,
      physicalLeftTab: state.physicalLeftTab,
      physicalRightSplitVisible: state.physicalRightSplitVisible,
      physicalRightTab: state.physicalRightTab,
      rightPrimaryTab: state.rightPrimaryTab,
      rightSecondaryTab: state.rightSecondaryTab,
      rightSplitVisible: state.rightSplitVisible,
    };
  },

  hydrateProjectSidePanelSession: (snapshot) => {
    const defaults = createDefaultSidePanelSessionState();
    set({
      assistantThreadListExpanded: snapshot?.assistantThreadListExpanded ?? defaults.assistantThreadListExpanded,
      assistantThreadListWidth: snapshot?.assistantThreadListWidth ?? defaults.assistantThreadListWidth,
      leftPrimaryTab: snapshot?.leftPrimaryTab ?? defaults.leftPrimaryTab,
      leftSecondaryTab: snapshot?.leftSecondaryTab ?? defaults.leftSecondaryTab,
      leftSplitVisible: snapshot?.leftSplitVisible ?? defaults.leftSplitVisible,
      physicalBottomTab: snapshot?.physicalBottomTab ?? defaults.physicalBottomTab,
      physicalLeftSplitVisible: snapshot?.physicalLeftSplitVisible ?? defaults.physicalLeftSplitVisible,
      physicalLeftTab: snapshot?.physicalLeftTab ?? defaults.physicalLeftTab,
      physicalRightSplitVisible: snapshot?.physicalRightSplitVisible ?? defaults.physicalRightSplitVisible,
      physicalRightTab: snapshot?.physicalRightTab ?? defaults.physicalRightTab,
      rightPrimaryTab: snapshot?.rightPrimaryTab ?? defaults.rightPrimaryTab,
      rightSecondaryTab: snapshot?.rightSecondaryTab ?? defaults.rightSecondaryTab,
      rightSplitVisible: snapshot?.rightSplitVisible ?? defaults.rightSplitVisible,
    });
  },

  resetSidePanelSessionStoreForTests: () => {
    set(createDefaultSidePanelSessionState());
  },

  setAssistantThreadListExpanded: (expanded) => {
    set((state) => (state.assistantThreadListExpanded === expanded ? state : { assistantThreadListExpanded: expanded }));
  },

  setAssistantThreadListWidth: (width) => {
    set((state) => {
      if (!Number.isFinite(width) || width <= 0 || state.assistantThreadListWidth === width) {
        return state;
      }

      return { assistantThreadListWidth: width };
    });
  },

  setExplorerLeftSecondaryTab: (tab) => {
    set((state) => (state.leftSecondaryTab === tab ? state : { leftSecondaryTab: tab }));
  },

  setExplorerLeftSplitVisible: (visible) => {
    set((state) => (state.leftSplitVisible === visible ? state : { leftSplitVisible: visible }));
  },

  setExplorerLeftTab: (tab) => {
    set((state) => (state.leftPrimaryTab === tab ? state : { leftPrimaryTab: tab }));
  },

  setExplorerRightSecondaryTab: (tab) => {
    set((state) => (state.rightSecondaryTab === tab ? state : { rightSecondaryTab: tab }));
  },

  setExplorerRightSplitVisible: (visible) => {
    set((state) => (state.rightSplitVisible === visible ? state : { rightSplitVisible: visible }));
  },

  setExplorerRightTab: (tab) => {
    set((state) => (state.rightPrimaryTab === tab ? state : { rightPrimaryTab: tab }));
  },

  setPhysicalBottomTab: (tab) => {
    set((state) => (state.physicalBottomTab === tab ? state : { physicalBottomTab: tab }));
  },

  setPhysicalLeftSplitVisible: (visible) => {
    set((state) => (state.physicalLeftSplitVisible === visible ? state : { physicalLeftSplitVisible: visible }));
  },

  setPhysicalLeftTab: (tab) => {
    set((state) => (state.physicalLeftTab === tab ? state : { physicalLeftTab: tab }));
  },

  setPhysicalRightSplitVisible: (visible) => {
    set((state) => (state.physicalRightSplitVisible === visible ? state : { physicalRightSplitVisible: visible }));
  },

  setPhysicalRightTab: (tab) => {
    set((state) => (state.physicalRightTab === tab ? state : { physicalRightTab: tab }));
  },
}));

export function resetSidePanelSessionStoreForTests(): void {
  useSidePanelSessionStore.getState().resetSidePanelSessionStoreForTests();
}
