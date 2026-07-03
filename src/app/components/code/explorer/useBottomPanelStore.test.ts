import {
  MIN_SPLIT_PANE_WIDTH_PX,
  SPLIT_HANDLE_GAP_PX,
  normalizeBottomPaneSizes,
  resetBottomPanelStoreForTests,
  useBottomPanelStore,
} from './useBottomPanelStore';
import { beforeEach, describe, expect, it } from 'vitest';

const splitWidth = MIN_SPLIT_PANE_WIDTH_PX * 2 + SPLIT_HANDLE_GAP_PX;

function getStore() {
  return useBottomPanelStore.getState();
}

describe('useBottomPanelStore', () => {
  beforeEach(() => {
    resetBottomPanelStoreForTests();
  });

  it('starts with tab-scoped layouts and a focused terminal pane', () => {
    expect(getStore().activeTab).toBe('terminal');
    expect(getStore().focusedPaneId).toBe('bottom-pane-1');
    expect(getStore().panes).toEqual([
      {
        content: { kind: 'tab', tab: 'terminal' },
        id: 'bottom-pane-1',
        size: 100,
      },
    ]);
    expect(getStore().tabLayouts.lsp.panes).toEqual([
      {
        content: { kind: 'tab', tab: 'lsp' },
        id: 'bottom-pane-lsp-1',
        size: 100,
      },
    ]);
  });

  it('switches active tabs without rewriting pane content', () => {
    getStore().updatePaneContent('bottom-pane-1', { kind: 'placeholder', icon: 'file', label: 'Placeholder A' }, 420);
    getStore().setActiveTab('lsp');

    expect(getStore().activeTab).toBe('lsp');
    expect(getStore().focusedPaneId).toBe('bottom-pane-lsp-1');
    expect(getStore().panes[0]?.content).toEqual({ kind: 'tab', tab: 'lsp' });

    getStore().setActiveTab('terminal');

    expect(getStore().focusedPaneMeasuredWidth).toBe(420);
    expect(getStore().panes[0]?.content).toEqual({ kind: 'placeholder', icon: 'file', label: 'Placeholder A' });
  });

  it('updates focused pane content within the active tab', () => {
    getStore().setFocusedPaneTab('lsp', 512);

    expect(getStore().activeTab).toBe('terminal');
    expect(getStore().focusedPaneMeasuredWidth).toBe(512);
    expect(getStore().panes[0]?.content).toEqual({ kind: 'tab', tab: 'lsp' });
  });

  it('splits only the active tab layout when the measured width is large enough', () => {
    expect(getStore().splitFocusedPane(splitWidth - 1)).toBe(false);
    expect(getStore().panes).toHaveLength(1);

    expect(getStore().splitFocusedPane(splitWidth)).toBe(true);

    expect(getStore().focusedPaneId).toBe('bottom-pane-2');
    expect(getStore().nextPaneIndex).toBe(3);
    expect(getStore().panes).toEqual([
      { content: { kind: 'tab', tab: 'terminal' }, id: 'bottom-pane-1', size: 50 },
      { content: { kind: 'empty' }, id: 'bottom-pane-2', size: 50 },
    ]);

    getStore().setActiveTab('lsp');

    expect(getStore().panes).toEqual([
      { content: { kind: 'tab', tab: 'lsp' }, id: 'bottom-pane-lsp-1', size: 100 },
    ]);
  });

  it('removes the focused pane only from the active tab', () => {
    getStore().splitFocusedPane(splitWidth);
    getStore().updatePaneContent('bottom-pane-2', { kind: 'tab', tab: 'terminal' });
    getStore().setActiveTab('lsp');
    getStore().splitFocusedPane(splitWidth);

    const removed = getStore().removeFocusedPane();

    expect(removed?.pane).toMatchObject({
      content: { kind: 'empty' },
      id: 'bottom-pane-lsp-2',
    });
    expect(getStore().panes).toHaveLength(1);

    getStore().setActiveTab('terminal');

    expect(getStore().panes).toHaveLength(2);
    expect(getStore().focusedPaneId).toBe('bottom-pane-2');
  });

  it('updates pane sizes and normalizes panes defensively', () => {
    getStore().splitFocusedPane(splitWidth);
    getStore().setPaneSize('bottom-pane-1', 35);

    expect(getStore().panes.find((pane) => pane.id === 'bottom-pane-1')?.size).toBe(35);
    expect(normalizeBottomPaneSizes([
      { content: { kind: 'empty' }, id: 'a', size: 0 },
      { content: { kind: 'empty' }, id: 'b', size: 0 },
    ])).toEqual([
      { content: { kind: 'empty' }, id: 'a', size: 50 },
      { content: { kind: 'empty' }, id: 'b', size: 50 },
    ]);
  });

  it('captures and hydrates tab-scoped project bottom pane layout', () => {
    getStore().splitFocusedPane(splitWidth);
    getStore().updatePaneContent('bottom-pane-2', { kind: 'placeholder', icon: 'boxes', label: 'Placeholder B' });
    getStore().setPaneSize('bottom-pane-1', 30);
    getStore().setPaneSize('bottom-pane-2', 70);
    getStore().setActiveTab('lsp');
    getStore().splitFocusedPane(splitWidth);
    getStore().updatePaneContent('bottom-pane-lsp-2', { kind: 'tab', tab: 'schematic' });

    const snapshot = getStore().captureProjectBottomPanelSession();
    resetBottomPanelStoreForTests();
    getStore().hydrateProjectBottomPanelSession(snapshot);

    expect(getStore().activeTab).toBe('lsp');
    expect(getStore().focusedPaneId).toBe('bottom-pane-lsp-2');
    expect(getStore().panes).toEqual([
      { content: { kind: 'tab', tab: 'lsp' }, id: 'bottom-pane-lsp-1', size: 50 },
      { content: { kind: 'tab', tab: 'schematic' }, id: 'bottom-pane-lsp-2', size: 50 },
    ]);

    getStore().setActiveTab('terminal');

    expect(getStore().panes).toEqual([
      { content: { kind: 'tab', tab: 'terminal' }, id: 'bottom-pane-1', size: 30 },
      { content: { kind: 'placeholder', icon: 'boxes', label: 'Placeholder B' }, id: 'bottom-pane-2', size: 70 },
    ]);
    expect(getStore().focusedPaneMeasuredWidth).toBe(Number.POSITIVE_INFINITY);
  });

  it('temporarily overrides the terminal tab pane with WSL content and restores it', () => {
    getStore().setActiveTab('lsp');
    expect(getStore().showWslTerminalInPane('bottom-pane-lsp-1', 640)).toBe(true);

    expect(getStore().activeTab).toBe('terminal');
    expect(getStore().focusedPaneId).toBe('bottom-pane-1');
    expect(getStore().focusedPaneMeasuredWidth).toBe(640);
    expect(getStore().wslPaneOverride).toEqual({
      paneId: 'bottom-pane-1',
      previousContent: { kind: 'tab', tab: 'terminal' },
      tab: 'terminal',
    });
    expect(getStore().panes[0]?.content).toEqual({
      kind: 'tab',
      tab: 'terminal',
      terminalProfile: 'wsl-pristine-eda',
    });
    expect(getStore().captureProjectBottomPanelSession().tabs.terminal?.panes[0]?.content).toEqual({ kind: 'tab', tab: 'terminal' });

    expect(getStore().restoreWslPaneOverride()).toBe(true);

    expect(getStore().wslPaneOverride).toBeNull();
    expect(getStore().panes[0]?.content).toEqual({ kind: 'tab', tab: 'terminal' });
  });

  it('does not force restore when the WSL pane was changed by the user', () => {
    expect(getStore().showWslTerminalInPane('bottom-pane-1')).toBe(true);

    getStore().updatePaneContent('bottom-pane-1', { kind: 'placeholder', icon: 'file', label: 'Placeholder A' });

    expect(getStore().wslPaneOverride).toBeNull();
    expect(getStore().restoreWslPaneOverride()).toBe(false);
    expect(getStore().panes[0]?.content).toEqual({ kind: 'placeholder', icon: 'file', label: 'Placeholder A' });
  });

  it('clears WSL override when the overridden pane is removed', () => {
    getStore().splitFocusedPane(splitWidth);
    expect(getStore().showWslTerminalInPane('bottom-pane-2')).toBe(true);

    const removed = getStore().removeFocusedPane();

    expect(removed?.pane.id).toBe('bottom-pane-2');
    expect(getStore().wslPaneOverride).toBeNull();
    expect(getStore().restoreWslPaneOverride()).toBe(false);
    expect(getStore().panes).toEqual([
      { content: { kind: 'tab', tab: 'terminal' }, id: 'bottom-pane-1', size: 100 },
    ]);
  });

  it('normalizes invalid and legacy hydrated bottom pane payloads', () => {
    getStore().hydrateProjectBottomPanelSession({
      focusedPaneId: 'missing-pane',
      nextPaneIndex: 1,
      panes: [
        { content: { kind: 'tab', tab: 'not-a-tab' } as any, id: 'pane-a', size: 0 },
        { content: { kind: 'placeholder', icon: 'unknown', label: '' } as any, id: 'pane-b', size: 25 },
        { content: { kind: 'tab', tab: 'lsp' }, id: 'pane-c', size: 25 },
      ],
    } as any);

    expect(getStore().activeTab).toBe('terminal');
    expect(getStore().panes).toEqual([
      { content: { kind: 'empty' }, id: 'pane-a', size: 80 },
      { content: { kind: 'placeholder', icon: 'file', label: 'Placeholder' }, id: 'pane-b', size: 20 },
    ]);
    getStore().setActiveTab('lsp');
    expect(getStore().panes).toEqual([
      { content: { kind: 'tab', tab: 'lsp' }, id: 'pane-c', size: 100 },
    ]);

    getStore().hydrateProjectBottomPanelSession(null);

    expect(getStore().activeTab).toBe('terminal');
    expect(getStore().panes).toEqual([
      { content: { kind: 'tab', tab: 'terminal' }, id: 'bottom-pane-1', size: 100 },
    ]);
  });
});
