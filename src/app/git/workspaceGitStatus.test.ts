import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceGitBranchLabel,
  getWorkspaceGitPathState,
  refreshWorkspaceGitStatus,
  resetWorkspaceGitStatusStoreForTests,
  useWorkspaceGitStatus,
} from './workspaceGitStatus';

describe('workspaceGitStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceGitStatusStoreForTests();
  });

  it('loads and normalizes the workspace git snapshot from the Electron bridge', async () => {
    vi.mocked(window.electronAPI!.git.getStatus).mockResolvedValueOnce({
      branchName: 'feature/git-ui',
      hasProjectFiles: true,
      isGitRepo: true,
      pathStates: {
        './rtl/core/cpu_top.sv': 'modified',
        'build/': 'ignored',
      },
    });

    const { result } = renderHook(() => useWorkspaceGitStatus());

    await waitFor(() => {
      expect(result.current.isGitRepo).toBe(true);
    });

    expect(result.current.pathStates).toEqual({
      'rtl/core/cpu_top.sv': 'modified',
      build: 'ignored',
    });
    expect(getWorkspaceGitBranchLabel(result.current)).toBe('feature/git-ui');
    expect(getWorkspaceGitPathState(result.current, './rtl/core/cpu_top.sv')).toBe('modified');
  });

  it('keeps first-level child repository paths normalized in the shared git snapshot', async () => {
    vi.mocked(window.electronAPI!.git.getStatus).mockResolvedValueOnce({
      branchName: 'main',
      hasProjectFiles: true,
      isGitRepo: true,
      pathStates: {
        './ip/src/child_core.sv': 'modified',
        'ip/generated/': 'created',
      },
    });

    const { result } = renderHook(() => useWorkspaceGitStatus());

    await waitFor(() => {
      expect(result.current.isGitRepo).toBe(true);
    });

    expect(result.current.pathStates).toEqual({
      'ip/generated': 'created',
      'ip/src/child_core.sv': 'modified',
    });
    expect(getWorkspaceGitPathState(result.current, 'ip/src/child_core.sv')).toBe('modified');
  });

  it('falls back to an empty Zustand-backed snapshot when the Electron bridge is unavailable', async () => {
    const originalGitApi = window.electronAPI!.git;
    window.electronAPI!.git = undefined as any;

    try {
      const { result } = renderHook(() => useWorkspaceGitStatus());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toEqual({
        branchName: null,
        hasProjectFiles: false,
        isGitRepo: false,
        isLoading: false,
        pathStates: {},
      });
    } finally {
      window.electronAPI!.git = originalGitApi;
    }
  });

  it('falls back to git when the workspace has no visible project files or is not a git repository', () => {
    expect(getWorkspaceGitBranchLabel({
      branchName: 'feature/git-ui',
      hasProjectFiles: false,
      isGitRepo: true,
      isLoading: false,
      pathStates: {},
    })).toBe('git');

    expect(getWorkspaceGitBranchLabel({
      branchName: null,
      hasProjectFiles: true,
      isGitRepo: false,
      isLoading: false,
      pathStates: {},
    })).toBe('git');
  });

  it('refreshes the cached snapshot on demand', async () => {
    vi.mocked(window.electronAPI!.git.getStatus)
      .mockResolvedValueOnce({
        branchName: 'main',
        hasProjectFiles: true,
        isGitRepo: true,
        pathStates: {},
      })
      .mockResolvedValueOnce({
        branchName: 'feature/git-ui',
        hasProjectFiles: true,
        isGitRepo: true,
        pathStates: {
          'rtl/core/reg_file.v': 'modified',
        },
      });

    const { result } = renderHook(() => useWorkspaceGitStatus());

    await waitFor(() => {
      expect(result.current.branchName).toBe('main');
    });

    act(() => {
      refreshWorkspaceGitStatus();
    });

    await waitFor(() => {
      expect(result.current.branchName).toBe('feature/git-ui');
    });
    expect(getWorkspaceGitPathState(result.current, 'rtl/core/reg_file.v')).toBe('modified');
  });

  it('debounces repeated refresh requests into a single git status reload', async () => {
    vi.mocked(window.electronAPI!.git.getStatus)
      .mockResolvedValueOnce({
        branchName: 'main',
        hasProjectFiles: true,
        isGitRepo: true,
        pathStates: {},
      })
      .mockResolvedValue({
        branchName: 'feature/git-ui',
        hasProjectFiles: true,
        isGitRepo: true,
        pathStates: {
          'rtl/core/new_file.v': 'created',
        },
      });

    const { result } = renderHook(() => useWorkspaceGitStatus());

    await waitFor(() => {
      expect(result.current.branchName).toBe('main');
    });

    act(() => {
      refreshWorkspaceGitStatus();
      refreshWorkspaceGitStatus();
      refreshWorkspaceGitStatus();
    });

    expect(window.electronAPI!.git.getStatus).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(window.electronAPI!.git.getStatus).toHaveBeenCalledTimes(2);
      expect(result.current.branchName).toBe('feature/git-ui');
    });

    expect(getWorkspaceGitPathState(result.current, 'rtl/core/new_file.v')).toBe('created');
  });
});
