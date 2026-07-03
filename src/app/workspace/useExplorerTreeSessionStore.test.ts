import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetExplorerTreeSessionStoreForTests,
  useExplorerTreeSessionStore,
} from './useExplorerTreeSessionStore';

function getStore() {
  return useExplorerTreeSessionStore.getState();
}

describe('useExplorerTreeSessionStore', () => {
  beforeEach(() => {
    resetExplorerTreeSessionStoreForTests();
  });

  it('starts with the workspace root expanded and no selection', () => {
    expect(getStore()).toMatchObject({
      expandedPaths: ['.'],
      scrollTop: 0,
      selectedNode: null,
    });
  });

  it('deduplicates expanded paths and keeps the root path', () => {
    getStore().setExpandedFolders(['rtl', 'rtl/core', 'rtl']);
    getStore().addExpandedFolders(['rtl/peripherals', 'rtl/core']);

    expect(getStore().expandedPaths).toEqual(['.', 'rtl', 'rtl/core', 'rtl/peripherals']);
  });

  it('toggles folders without collapsing the root path', () => {
    getStore().toggleExpandedFolder('rtl');
    getStore().toggleExpandedFolder('rtl/core');
    getStore().toggleExpandedFolder('rtl');
    getStore().toggleExpandedFolder('.');

    expect(getStore().expandedPaths).toEqual(['rtl/core']);
  });

  it('captures and hydrates selection and scroll position', () => {
    getStore().setExpandedFolders(['rtl/core']);
    getStore().setSelectedNode({ path: 'rtl/core/cpu_top.sv', type: 'file' });
    getStore().setScrollTop(128.6);

    const snapshot = getStore().captureProjectExplorerTreeSession();
    resetExplorerTreeSessionStoreForTests();
    getStore().hydrateProjectExplorerTreeSession(snapshot);

    expect(getStore()).toMatchObject({
      expandedPaths: ['.', 'rtl/core'],
      scrollTop: 129,
      selectedNode: { path: 'rtl/core/cpu_top.sv', type: 'file' },
    });
  });

  it('falls back safely for invalid hydrated payloads', () => {
    getStore().hydrateProjectExplorerTreeSession({
      expandedPaths: ['rtl', 42 as unknown as string, ''],
      scrollTop: Number.NaN,
      selectedNode: { path: 'rtl/core', type: 'folder' },
    });

    expect(getStore()).toMatchObject({
      expandedPaths: ['.', 'rtl'],
      scrollTop: 0,
      selectedNode: { path: 'rtl/core', type: 'folder' },
    });

    getStore().hydrateProjectExplorerTreeSession({
      expandedPaths: [],
      scrollTop: -1,
      selectedNode: { path: 'bad', type: 'root' as 'file' },
    });

    expect(getStore()).toMatchObject({
      expandedPaths: ['.'],
      scrollTop: 0,
      selectedNode: null,
    });
  });
});
