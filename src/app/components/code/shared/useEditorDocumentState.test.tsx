import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorDocumentState } from './useEditorDocumentState';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe('useEditorDocumentState', () => {
  const tabs = [{ id: 'rtl/core/reg_file.v', name: 'reg_file.v' }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests external loading when onLoadFile is provided and content is missing', () => {
    const onLoadFile = vi.fn();

    const { result } = renderHook(() => useEditorDocumentState({
      tabs,
      activeTabId: 'rtl/core/reg_file.v',
      onLoadFile,
    }));

    expect(onLoadFile).toHaveBeenCalledWith('rtl/core/reg_file.v');
    expect(result.current.code).toBe('');
    expect(result.current.placeholderText).toContain('Loading file contents');
    expect(result.current.isActiveTabReady).toBe(false);
  });

  it('uses provided content cache without triggering a load', () => {
    const onLoadFile = vi.fn();

    const { result } = renderHook(() => useEditorDocumentState({
      tabs,
      activeTabId: 'rtl/core/reg_file.v',
      contentCache: { 'rtl/core/reg_file.v': 'module reg_file; endmodule' },
      onLoadFile,
    }));

    expect(onLoadFile).not.toHaveBeenCalled();
    expect(result.current.code).toBe('module reg_file; endmodule');
    expect(result.current.placeholderText).toBe('');
    expect(result.current.activeTab?.name).toBe('reg_file.v');
  });

  it('can skip document loading for non-text viewer tabs', () => {
    const { result } = renderHook(() => useEditorDocumentState({
      tabs: [{ id: 'docs/spec.pdf', name: 'spec.pdf' }],
      activeTabId: 'docs/spec.pdf',
      shouldLoadDocument: false,
    }));

    expect(result.current.isActiveTabReady).toBe(false);
    expect(window.electronAPI?.fs.readFile).not.toHaveBeenCalled();
  });

  it('loads content through the filesystem bridge when no external loader is provided', async () => {
    const deferred = createDeferred<string>();
    vi.mocked(window.electronAPI!.fs.readFile).mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useEditorDocumentState({
      tabs,
      activeTabId: 'rtl/core/reg_file.v',
    }));

    expect(window.electronAPI?.fs.readFile).toHaveBeenCalledWith('rtl/core/reg_file.v', 'utf-8');
  expect(result.current.code).toBe('');
  expect(result.current.placeholderText).toContain('Loading file contents');

    deferred.resolve('always_ff @(posedge clk) q <= d;');

    await waitFor(() => {
      expect(result.current.code).toBe('always_ff @(posedge clk) q <= d;');
    });
  });

  it('surfaces filesystem unavailability and load failures in the editor placeholder', async () => {
    const originalFs = window.electronAPI?.fs;
    if (window.electronAPI) {
      window.electronAPI.fs = undefined as never;
    }

    const unavailable = renderHook(() => useEditorDocumentState({
      tabs,
      activeTabId: 'rtl/core/reg_file.v',
    }));

    await waitFor(() => {
      expect(unavailable.result.current.placeholderText).toContain('Filesystem API unavailable');
    });

    unavailable.unmount();

    if (window.electronAPI) {
      window.electronAPI.fs = originalFs as typeof window.electronAPI.fs;
    }

    vi.mocked(window.electronAPI!.fs.readFile).mockRejectedValueOnce(new Error('Permission denied'));

    const failed = renderHook(() => useEditorDocumentState({
      tabs,
      activeTabId: 'rtl/core/reg_file.v',
    }));

    await waitFor(() => {
      expect(failed.result.current.placeholderText).toContain('Failed to load reg_file.v');
    });
    expect(failed.result.current.placeholderText).toContain('Permission denied');
  });

  it('updates content through the external callback or local cache', async () => {
    const onContentChange = vi.fn();
    const controlled = renderHook(() => useEditorDocumentState({
      tabs,
      activeTabId: 'rtl/core/reg_file.v',
      contentCache: { 'rtl/core/reg_file.v': 'initial' },
      onContentChange,
    }));

    act(() => {
      controlled.result.current.updateContent('next');
    });

    expect(onContentChange).toHaveBeenCalledWith('rtl/core/reg_file.v', 'next');

    vi.mocked(window.electronAPI!.fs.readFile).mockResolvedValueOnce('initial local');

    const local = renderHook(() => useEditorDocumentState({
      tabs,
      activeTabId: 'rtl/core/reg_file.v',
    }));

    await waitFor(() => {
      expect(local.result.current.code).toBe('initial local');
    });

    act(() => {
      local.result.current.updateContent('edited local');
    });

    expect(local.result.current.code).toBe('edited local');
  });

  it('delegates untitled tabs to the shared loader when the workspace owns document state', () => {
    const onLoadFile = vi.fn();

    renderHook(() => useEditorDocumentState({
      tabs: [{ id: 'untitled-1', name: 'untitled-1' }],
      activeTabId: 'untitled-1',
      onLoadFile,
    }));

    expect(onLoadFile).toHaveBeenCalledWith('untitled-1');
  });
});
