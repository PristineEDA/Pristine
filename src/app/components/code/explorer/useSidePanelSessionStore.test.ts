import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetSidePanelSessionStoreForTests,
  useSidePanelSessionStore,
} from './useSidePanelSessionStore';
import { ASSISTANT_THREAD_LIST_DEFAULT_WIDTH_PX } from './assistantPanelLayout';

function getStore() {
  return useSidePanelSessionStore.getState();
}

describe('useSidePanelSessionStore', () => {
  beforeEach(() => {
    resetSidePanelSessionStoreForTests();
  });

  it('starts with the default explorer, assistant, and physical chrome state', () => {
    expect(getStore()).toMatchObject({
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
    });
  });

  it('updates explorer left tab, split, secondary tab, and hierarchy reload nonce', () => {
    getStore().setExplorerLeftTab('git');
    getStore().setExplorerLeftSplitVisible(true);
    getStore().setExplorerLeftSecondaryTab('libraries');
    getStore().bumpExplorerLeftHierarchyReloadNonce();
    getStore().bumpExplorerLeftHierarchyReloadNonce();

    expect(getStore().leftPrimaryTab).toBe('git');
    expect(getStore().leftSplitVisible).toBe(true);
    expect(getStore().leftSecondaryTab).toBe('libraries');
    expect(getStore().leftHierarchyReloadNonce).toBe(2);
  });

  it('updates explorer right tab, split, secondary tab, and assistant thread list chrome', () => {
    getStore().setExplorerRightTab('outline');
    getStore().setExplorerRightSplitVisible(true);
    getStore().setExplorerRightSecondaryTab('x-propagation');
    getStore().setAssistantThreadListExpanded(true);
    getStore().setAssistantThreadListWidth(384);

    expect(getStore().rightPrimaryTab).toBe('outline');
    expect(getStore().rightSplitVisible).toBe(true);
    expect(getStore().rightSecondaryTab).toBe('x-propagation');
    expect(getStore().assistantThreadListExpanded).toBe(true);
    expect(getStore().assistantThreadListWidth).toBe(384);
  });

  it('ignores invalid assistant thread list widths', () => {
    getStore().setAssistantThreadListWidth(420);
    getStore().setAssistantThreadListWidth(0);
    getStore().setAssistantThreadListWidth(Number.NaN);

    expect(getStore().assistantThreadListWidth).toBe(420);
  });

  it('updates physical side and bottom panel chrome state', () => {
    getStore().setPhysicalLeftTab('constraints');
    getStore().setPhysicalLeftSplitVisible(true);
    getStore().setPhysicalRightTab('checks');
    getStore().setPhysicalRightSplitVisible(true);
    getStore().setPhysicalBottomTab('console');

    expect(getStore().physicalLeftTab).toBe('constraints');
    expect(getStore().physicalLeftSplitVisible).toBe(true);
    expect(getStore().physicalRightTab).toBe('checks');
    expect(getStore().physicalRightSplitVisible).toBe(true);
    expect(getStore().physicalBottomTab).toBe('console');
  });

  it('captures and hydrates project side panel chrome without reload nonce', () => {
    getStore().setExplorerLeftTab('git');
    getStore().setExplorerLeftSecondaryTab('libraries');
    getStore().setExplorerLeftSplitVisible(true);
    getStore().setExplorerRightTab('outline');
    getStore().setExplorerRightSecondaryTab('x-propagation');
    getStore().setExplorerRightSplitVisible(true);
    getStore().setAssistantThreadListExpanded(true);
    getStore().setAssistantThreadListWidth(360);
    getStore().setPhysicalBottomTab('console');
    getStore().setPhysicalLeftTab('constraints');
    getStore().setPhysicalLeftSplitVisible(true);
    getStore().setPhysicalRightTab('checks');
    getStore().setPhysicalRightSplitVisible(true);
    getStore().bumpExplorerLeftHierarchyReloadNonce();

    const snapshot = getStore().captureProjectSidePanelSession();
    resetSidePanelSessionStoreForTests();
    getStore().hydrateProjectSidePanelSession(snapshot);

    expect(getStore().leftPrimaryTab).toBe('git');
    expect(getStore().leftSecondaryTab).toBe('libraries');
    expect(getStore().leftSplitVisible).toBe(true);
    expect(getStore().rightPrimaryTab).toBe('outline');
    expect(getStore().rightSecondaryTab).toBe('x-propagation');
    expect(getStore().rightSplitVisible).toBe(true);
    expect(getStore().assistantThreadListExpanded).toBe(true);
    expect(getStore().assistantThreadListWidth).toBe(360);
    expect(getStore().physicalBottomTab).toBe('console');
    expect(getStore().physicalLeftTab).toBe('constraints');
    expect(getStore().physicalLeftSplitVisible).toBe(true);
    expect(getStore().physicalRightTab).toBe('checks');
    expect(getStore().physicalRightSplitVisible).toBe(true);
    expect(getStore().leftHierarchyReloadNonce).toBe(0);

    getStore().hydrateProjectSidePanelSession(null);

    expect(getStore().leftPrimaryTab).toBe('explorer');
    expect(getStore().leftSecondaryTab).toBe('hierarchy');
    expect(getStore().leftSplitVisible).toBe(false);
    expect(getStore().rightPrimaryTab).toBe('ai');
    expect(getStore().rightSecondaryTab).toBe('module-info');
    expect(getStore().rightSplitVisible).toBe(false);
    expect(getStore().assistantThreadListExpanded).toBe(false);
    expect(getStore().assistantThreadListWidth).toBe(ASSISTANT_THREAD_LIST_DEFAULT_WIDTH_PX);
    expect(getStore().physicalBottomTab).toBe('reports');
    expect(getStore().physicalLeftTab).toBe('layout');
    expect(getStore().physicalLeftSplitVisible).toBe(false);
    expect(getStore().physicalRightTab).toBe('layers');
    expect(getStore().physicalRightSplitVisible).toBe(false);
  });

  it('resets all side panel chrome state to defaults', () => {
    getStore().setExplorerLeftTab('git');
    getStore().setExplorerRightTab('references');
    getStore().setExplorerRightSplitVisible(true);
    getStore().setPhysicalBottomTab('console');
    getStore().setAssistantThreadListExpanded(true);

    resetSidePanelSessionStoreForTests();

    expect(getStore().leftPrimaryTab).toBe('explorer');
    expect(getStore().rightPrimaryTab).toBe('ai');
    expect(getStore().rightSplitVisible).toBe(false);
    expect(getStore().physicalBottomTab).toBe('reports');
    expect(getStore().assistantThreadListExpanded).toBe(false);
  });
});
