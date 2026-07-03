import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncChannels, StreamChannels, SyncChannels } from './channels.js';

const {
  mockOn,
  mockHandle,
  mockSetFloatingInfoWindowVisible,
  mockSetFloatingInfoWindowExpanded,
  mockSetFloatingInfoWindowMode,
  mockResolveCloseRequest,
} = vi.hoisted(() => ({
  mockOn: vi.fn(),
  mockHandle: vi.fn(),
  mockSetFloatingInfoWindowVisible: vi.fn(),
  mockSetFloatingInfoWindowExpanded: vi.fn(),
  mockSetFloatingInfoWindowMode: vi.fn(),
  mockResolveCloseRequest: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: (...args: unknown[]) => mockOn(...args),
    handle: (...args: unknown[]) => mockHandle(...args),
  },
  BrowserWindow: class {},
}));

import { registerWindowHandlers, setupWindowStreams } from './window.js';

function getOnListener(channel: string): (...args: unknown[]) => void {
  const call = mockOn.mock.calls.find((entry) => entry[0] === channel);
  if (!call) throw new Error(`No sync listener registered for ${channel}`);
  return call[1];
}

function getHandleListener(channel: string): (...args: unknown[]) => Promise<unknown> | unknown {
  const call = mockHandle.mock.calls.find((entry) => entry[0] === channel);
  if (!call) throw new Error(`No async handler registered for ${channel}`);
  return call[1];
}

describe('window IPC handlers', () => {
  beforeEach(() => {
    mockOn.mockClear();
    mockHandle.mockClear();
    mockSetFloatingInfoWindowVisible.mockClear();
    mockSetFloatingInfoWindowExpanded.mockClear();
    mockSetFloatingInfoWindowMode.mockClear();
    mockResolveCloseRequest.mockClear();
  });

  it('returns maximized state via sync channel', () => {
    const event = { returnValue: undefined as boolean | undefined };
    const getMainWindow = () => ({ isMaximized: () => true, isFullScreen: () => false }) as any;

    registerWindowHandlers(getMainWindow, undefined, undefined, undefined, mockResolveCloseRequest);
    const listener = getOnListener(SyncChannels.WINDOW_IS_MAXIMIZED);
    listener(event);

    expect(event.returnValue).toBe(true);
  });

  it('returns full-screen state via sync channel', () => {
    const event = { returnValue: undefined as boolean | undefined };
    const getMainWindow = () => ({ isFullScreen: () => true }) as any;

    registerWindowHandlers(getMainWindow, undefined, undefined, undefined, mockResolveCloseRequest);
    const listener = getOnListener(SyncChannels.WINDOW_IS_FULLSCREEN);
    listener(event);

    expect(event.returnValue).toBe(true);
  });

  it('returns false when minimizing without a window', async () => {
    registerWindowHandlers(() => null, undefined, undefined, undefined, mockResolveCloseRequest);
    const handler = getHandleListener(AsyncChannels.WINDOW_MINIMIZE);

    expect(handler({})).toBe(false);
  });

  it('toggles maximize state, changes visibility, and requests window close', async () => {
    let maximized = false;
    let minimized = false;
    const win = {
      minimize: vi.fn(),
      maximize: vi.fn(() => { maximized = true; }),
      unmaximize: vi.fn(() => { maximized = false; }),
      isMaximized: vi.fn(() => maximized),
      isFullScreen: vi.fn(() => false),
      isMinimized: vi.fn(() => minimized),
      restore: vi.fn(() => { minimized = false; }),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      close: vi.fn(),
    };

    registerWindowHandlers(() => win as any, (visible: boolean) => {
      mockSetFloatingInfoWindowVisible(visible);
      return true;
    }, (expanded: boolean) => {
      mockSetFloatingInfoWindowExpanded(expanded);
      return expanded;
    }, (mode) => {
      mockSetFloatingInfoWindowMode(mode);
      return mode === 'detail';
    }, (requestId: number, decision: 'proceed' | 'cancel') => {
      mockResolveCloseRequest(requestId, decision);
      return decision === 'proceed';
    });

    const minimize = getHandleListener(AsyncChannels.WINDOW_MINIMIZE);
    const maximize = getHandleListener(AsyncChannels.WINDOW_MAXIMIZE);
    const show = getHandleListener(AsyncChannels.WINDOW_SHOW);
    const hide = getHandleListener(AsyncChannels.WINDOW_HIDE);
    const close = getHandleListener(AsyncChannels.WINDOW_CLOSE);
    const resolveCloseRequest = getHandleListener(AsyncChannels.WINDOW_RESOLVE_CLOSE_REQUEST);
    const setFloatingInfoVisibility = getHandleListener(AsyncChannels.WINDOW_SET_FLOATING_INFO_VISIBILITY);
    const setFloatingInfoExpanded = getHandleListener(AsyncChannels.WINDOW_SET_FLOATING_INFO_EXPANDED);
    const setFloatingInfoMode = getHandleListener(AsyncChannels.WINDOW_SET_FLOATING_INFO_MODE);

    expect(minimize({})).toBe(true);
    minimized = true;
    expect(maximize({})).toBe(true);
    expect(maximize({})).toBe(false);
    expect(show({})).toBe(true);
    expect(hide({})).toBe(true);
    expect(close({})).toBe(true);
    expect(resolveCloseRequest({}, 4, 'proceed')).toBe(true);
    await expect(setFloatingInfoVisibility({}, true)).resolves.toBe(true);
    await expect(setFloatingInfoExpanded({}, true)).resolves.toBe(true);
    await expect(setFloatingInfoMode({}, 'detail')).resolves.toBe(true);

    expect(win.minimize).toHaveBeenCalledTimes(1);
    expect(win.maximize).toHaveBeenCalledTimes(1);
    expect(win.unmaximize).toHaveBeenCalledTimes(1);
    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(mockResolveCloseRequest).toHaveBeenCalledWith(4, 'proceed');
    expect(mockSetFloatingInfoWindowVisible).toHaveBeenCalledWith(true);
    expect(mockSetFloatingInfoWindowExpanded).toHaveBeenCalledWith(true);
    expect(mockSetFloatingInfoWindowMode).toHaveBeenCalledWith('detail');
  });

  it('validates floating info expanded state input', async () => {
    registerWindowHandlers(() => null, undefined, undefined, undefined, mockResolveCloseRequest);
    const setFloatingInfoExpanded = getHandleListener(AsyncChannels.WINDOW_SET_FLOATING_INFO_EXPANDED);

    await expect(setFloatingInfoExpanded({}, 'yes')).rejects.toThrow('Expected floating info expanded state to be boolean');
  });

  it('validates floating info mode input', async () => {
    registerWindowHandlers(() => null, undefined, undefined, undefined, mockResolveCloseRequest);
    const setFloatingInfoMode = getHandleListener(AsyncChannels.WINDOW_SET_FLOATING_INFO_MODE);

    await expect(setFloatingInfoMode({}, 'fullscreen')).rejects.toThrow('Expected floating info mode to be "collapsed", "expanded", or "detail"');
  });

  it('marks the workspace as ready for startup window display coordination', () => {
    const markWorkspaceReady = vi.fn();
    registerWindowHandlers(
      () => null,
      undefined,
      undefined,
      undefined,
      mockResolveCloseRequest,
      markWorkspaceReady,
    );
    const handler = getHandleListener(AsyncChannels.WINDOW_MARK_WORKSPACE_READY);

    expect(handler({})).toBe(true);
    expect(markWorkspaceReady).toHaveBeenCalledTimes(1);
  });

  it('emits focus, maximize, and full-screen stream events separately', () => {
    const events: Record<string, () => void> = {};
    const send = vi.fn();
    const win = {
      on: vi.fn((event: string, callback: () => void) => {
        events[event] = callback;
      }),
      webContents: { send },
    };

    setupWindowStreams(win as any);
    events['focus']();
    events['maximize']();
    events['unmaximize']();
    events['enter-full-screen']();
    events['leave-full-screen']();

    expect(send).toHaveBeenNthCalledWith(1, StreamChannels.WINDOW_FOCUS);
    expect(send).toHaveBeenNthCalledWith(2, StreamChannels.WINDOW_MAXIMIZED_CHANGE, true);
    expect(send).toHaveBeenNthCalledWith(3, StreamChannels.WINDOW_MAXIMIZED_CHANGE, false);
    expect(send).toHaveBeenNthCalledWith(4, StreamChannels.WINDOW_FULLSCREEN_CHANGE, true);
    expect(send).toHaveBeenNthCalledWith(5, StreamChannels.WINDOW_FULLSCREEN_CHANGE, false);
  });
});
