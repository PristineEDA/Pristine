import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type WorkspaceRevealRequest, useWorkspaceTree } from './useWorkspaceTree';
import { resetExplorerTreeSessionStoreForTests } from './useExplorerTreeSessionStore';

function findNodeByPath(node: { path: string; children?: Array<{ path: string; children?: unknown[] }> } | null | undefined, targetPath: string): any {
  if (!node) {
    return null;
  }

  if (node.path === targetPath) {
    return node;
  }

  if (!node.children) {
    return null;
  }

  for (const child of node.children) {
    const match = findNodeByPath(child as any, targetPath);
    if (match) {
      return match;
    }
  }

  return null;
}

describe('useWorkspaceTree', () => {
  beforeEach(() => {
    const electronApi = window.electronAPI!;

    vi.clearAllMocks();
    resetExplorerTreeSessionStoreForTests();

    vi.mocked(electronApi.fs.exists).mockResolvedValue(true);
    vi.mocked(electronApi.fs.readDir).mockImplementation(async (dirPath: string) => {
      if (dirPath === '.') {
        return [{ name: 'rtl', isDirectory: true, isFile: false }];
      }

      if (dirPath === 'rtl') {
        return [{ name: 'peripherals', isDirectory: true, isFile: false }];
      }

      if (dirPath === 'rtl/peripherals') {
        return [{ name: 'uart_rx.v', isDirectory: false, isFile: true }];
      }

      return [];
    });
  });

  it('does not read the filesystem while no project is open', async () => {
    const { result } = renderHook(() => useWorkspaceTree(undefined, 0, { enabled: false }));

    expect(result.current.workspaceAvailable).toBe(false);
    expect(result.current.treeNodes).toEqual([]);
    expect(window.electronAPI!.fs.readDir).not.toHaveBeenCalled();
  });

  it('hides Pristine metadata directories only at the workspace root', async () => {
    vi.mocked(window.electronAPI!.fs.readDir).mockImplementation(async (dirPath: string) => {
      if (dirPath === '.') {
        return [
          { name: '.pristine', isDirectory: true, isFile: false },
          { name: '.prstine', isDirectory: true, isFile: false },
          { name: 'rtl', isDirectory: true, isFile: false },
        ];
      }

      if (dirPath === 'rtl') {
        return [
          { name: '.pristine', isDirectory: true, isFile: false },
          { name: 'core.sv', isDirectory: false, isFile: true },
        ];
      }

      return [];
    });

    const { result } = renderHook(() => useWorkspaceTree());

    await waitFor(() => {
      expect(result.current.workspaceAvailable).toBe(true);
      expect(result.current.treeNodes[0]?.children?.map((child) => child.path)).toEqual(['rtl']);
    });

    act(() => {
      result.current.toggleFolder('rtl');
    });

    await waitFor(() => {
      expect(findNodeByPath(result.current.treeNodes[0], 'rtl/.pristine')).not.toBeNull();
      expect(findNodeByPath(result.current.treeNodes[0], 'rtl/core.sv')).not.toBeNull();
    });
  });

  it('keeps the expanded folder state stable when revealing within already expanded ancestors', async () => {
    const { result, rerender } = renderHook(
      ({ revealRequest }: { revealRequest?: WorkspaceRevealRequest | null }) => useWorkspaceTree(revealRequest),
      {
        initialProps: {
          revealRequest: { path: 'rtl/peripherals/uart_rx.v', token: 1 },
        },
      },
    );

    await waitFor(() => {
      expect(result.current.workspaceAvailable).toBe(true);
      expect(result.current.expandedFolders.has('rtl')).toBe(true);
      expect(result.current.expandedFolders.has('rtl/peripherals')).toBe(true);
      expect(window.electronAPI!.fs.readDir).toHaveBeenCalledTimes(3);
    });

    const expandedFoldersAfterFirstReveal = result.current.expandedFolders;

    act(() => {
      rerender({ revealRequest: { path: 'rtl/peripherals/uart_rx.v', token: 2 } });
    });

    expect(result.current.expandedFolders).toBe(expandedFoldersAfterFirstReveal);
    expect(window.electronAPI!.fs.readDir).toHaveBeenCalledTimes(3);
  });

  it('reloads already expanded folders after a refresh token bump', async () => {
    const { result, rerender } = renderHook(
      ({ refreshToken }: { refreshToken: number }) => useWorkspaceTree(undefined, refreshToken),
      {
        initialProps: {
          refreshToken: 0,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.workspaceAvailable).toBe(true);
    });

    act(() => {
      result.current.toggleFolder('rtl');
    });

    await waitFor(() => {
      expect(window.electronAPI!.fs.readDir).toHaveBeenCalledWith('rtl');
    });

    act(() => {
      result.current.toggleFolder('rtl/peripherals');
    });

    await waitFor(() => {
      expect(window.electronAPI!.fs.readDir).toHaveBeenCalledWith('rtl/peripherals');
    });

    const readDirCallCount = vi.mocked(window.electronAPI!.fs.readDir).mock.calls.length;

    act(() => {
      rerender({ refreshToken: 1 });
    });

    await waitFor(() => {
      expect(window.electronAPI!.fs.readDir).toHaveBeenCalledTimes(readDirCallCount + 3);
    });

    expect(result.current.expandedFolders.has('rtl')).toBe(true);
    expect(result.current.expandedFolders.has('rtl/peripherals')).toBe(true);
  });

  it('keeps the existing tree available while a refresh token bump reloads it', async () => {
    const { result, rerender } = renderHook(
      ({ refreshToken }: { refreshToken: number }) => useWorkspaceTree(undefined, refreshToken),
      {
        initialProps: {
          refreshToken: 0,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.workspaceAvailable).toBe(true);
      expect(result.current.treeNodes).toHaveLength(1);
    });

    act(() => {
      rerender({ refreshToken: 1 });
    });

    expect(result.current.workspaceAvailable).toBe(true);
    expect(result.current.treeNodes).toHaveLength(1);

    await waitFor(() => {
      expect(window.electronAPI!.fs.readDir).toHaveBeenCalledWith('.');
    });
  });

  it('preserves expanded descendant nodes while refresh reloads expanded folders', async () => {
    let rtlReadCount = 0;
    let peripheralsReadCount = 0;
    let resolveRefreshRtl: ((value: { name: string; isDirectory: boolean; isFile: boolean }[]) => void) | null = null;
    let resolveRefreshPeripherals: ((value: { name: string; isDirectory: boolean; isFile: boolean }[]) => void) | null = null;

    vi.mocked(window.electronAPI!.fs.readDir).mockImplementation((dirPath: string) => {
      if (dirPath === '.') {
        return Promise.resolve([{ name: 'rtl', isDirectory: true, isFile: false }]);
      }

      if (dirPath === 'rtl') {
        rtlReadCount += 1;

        if (rtlReadCount === 1) {
          return Promise.resolve([{ name: 'peripherals', isDirectory: true, isFile: false }]);
        }

        return new Promise((resolve) => {
          resolveRefreshRtl = resolve;
        });
      }

      if (dirPath === 'rtl/peripherals') {
        peripheralsReadCount += 1;

        if (peripheralsReadCount === 1) {
          return Promise.resolve([{ name: 'uart_rx.v', isDirectory: false, isFile: true }]);
        }

        return new Promise((resolve) => {
          resolveRefreshPeripherals = resolve;
        });
      }

      return Promise.resolve([]);
    });

    const { result, rerender } = renderHook(
      ({ refreshToken }: { refreshToken: number }) => useWorkspaceTree(undefined, refreshToken),
      {
        initialProps: {
          refreshToken: 0,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.workspaceAvailable).toBe(true);
    });

    act(() => {
      result.current.toggleFolder('rtl');
    });

    await waitFor(() => {
      expect(rtlReadCount).toBe(1);
    });

    act(() => {
      result.current.toggleFolder('rtl/peripherals');
    });

    await waitFor(() => {
      expect(peripheralsReadCount).toBe(1);
      expect(findNodeByPath(result.current.treeNodes[0], 'rtl/peripherals/uart_rx.v')).not.toBeNull();
    });

    act(() => {
      rerender({ refreshToken: 1 });
    });

    await waitFor(() => {
      expect(rtlReadCount).toBe(2);
    });

    expect(findNodeByPath(result.current.treeNodes[0], 'rtl/peripherals/uart_rx.v')).not.toBeNull();

    act(() => {
      resolveRefreshRtl?.([{ name: 'peripherals', isDirectory: true, isFile: false }]);
    });

    await waitFor(() => {
      expect(peripheralsReadCount).toBe(2);
    });

    expect(findNodeByPath(result.current.treeNodes[0], 'rtl/peripherals/uart_rx.v')).not.toBeNull();

    act(() => {
      resolveRefreshPeripherals?.([{ name: 'uart_rx.v', isDirectory: false, isFile: true }]);
    });

    await waitFor(() => {
      expect(findNodeByPath(result.current.treeNodes[0], 'rtl/peripherals/uart_rx.v')).not.toBeNull();
    });
  });
});
