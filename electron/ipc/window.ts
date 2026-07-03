import { BrowserWindow, ipcMain } from 'electron';
import { SyncChannels, AsyncChannels, StreamChannels } from './channels.js';
import type { WindowCloseDecision } from '../../src/app/window/windowClose.js';
import { isFloatingInfoWindowMode, type FloatingInfoWindowMode } from '../../src/app/window/floatingInfoWindow.js';

export function registerWindowHandlers(
  getMainWindow: () => BrowserWindow | null,
  setFloatingInfoWindowVisible: (visible: boolean) => boolean = () => false,
  setFloatingInfoWindowExpanded: (expanded: boolean) => boolean = () => false,
  setFloatingInfoWindowMode: (mode: FloatingInfoWindowMode) => boolean = () => false,
  resolveCloseRequest: (requestId: number, decision: WindowCloseDecision) => boolean = () => false,
  markWorkspaceReady: () => void = () => {},
): void {
  ipcMain.on(SyncChannels.WINDOW_IS_MAXIMIZED, (event) => {
    const win = getMainWindow();
    event.returnValue = win ? win.isMaximized() : false;
  });

  ipcMain.on(SyncChannels.WINDOW_IS_FULLSCREEN, (event) => {
    const win = getMainWindow();
    event.returnValue = win ? win.isFullScreen() : false;
  });

  ipcMain.handle(AsyncChannels.WINDOW_MINIMIZE, () => {
    const win = getMainWindow();
    if (!win) return false;
    win.minimize();
    return true;
  });

  ipcMain.handle(AsyncChannels.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow();
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle(AsyncChannels.WINDOW_SHOW, () => {
    const win = getMainWindow();
    if (!win) return false;
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
    return true;
  });

  ipcMain.handle(AsyncChannels.WINDOW_HIDE, () => {
    const win = getMainWindow();
    if (!win) return false;
    win.hide();
    return true;
  });

  ipcMain.handle(AsyncChannels.WINDOW_CLOSE, () => {
    const win = getMainWindow();
    if (!win) return false;
    win.close();
    return true;
  });

  ipcMain.handle(AsyncChannels.WINDOW_MARK_WORKSPACE_READY, () => {
    markWorkspaceReady();
    return true;
  });

  ipcMain.handle(AsyncChannels.WINDOW_RESOLVE_CLOSE_REQUEST, (_event, requestId: unknown, decision: unknown) => {
    if (typeof requestId !== 'number' || !Number.isInteger(requestId) || requestId < 1) {
      throw new Error('Expected close request id to be a positive integer');
    }

    if (decision !== 'proceed' && decision !== 'cancel') {
      throw new Error('Expected close request decision to be "proceed" or "cancel"');
    }

    return resolveCloseRequest(requestId, decision);
  });

  ipcMain.handle(AsyncChannels.WINDOW_SET_FLOATING_INFO_VISIBILITY, async (_event, visible: unknown) => {
    if (typeof visible !== 'boolean') {
      throw new Error('Expected floating info visibility to be boolean');
    }

    return setFloatingInfoWindowVisible(visible);
  });

  ipcMain.handle(AsyncChannels.WINDOW_SET_FLOATING_INFO_EXPANDED, async (_event, expanded: unknown) => {
    if (typeof expanded !== 'boolean') {
      throw new Error('Expected floating info expanded state to be boolean');
    }

    return setFloatingInfoWindowExpanded(expanded);
  });

  ipcMain.handle(AsyncChannels.WINDOW_SET_FLOATING_INFO_MODE, async (_event, mode: unknown) => {
    if (!isFloatingInfoWindowMode(mode)) {
      throw new Error('Expected floating info mode to be "collapsed", "expanded", or "detail"');
    }

    return setFloatingInfoWindowMode(mode);
  });
}

export function setupWindowStreams(win: BrowserWindow): void {
  win.on('focus', () => {
    win.webContents.send(StreamChannels.WINDOW_FOCUS);
  });
  win.on('maximize', () => {
    win.webContents.send(StreamChannels.WINDOW_MAXIMIZED_CHANGE, true);
  });
  win.on('unmaximize', () => {
    win.webContents.send(StreamChannels.WINDOW_MAXIMIZED_CHANGE, false);
  });
  win.on('enter-full-screen', () => {
    win.webContents.send(StreamChannels.WINDOW_FULLSCREEN_CHANGE, true);
  });
  win.on('leave-full-screen', () => {
    win.webContents.send(StreamChannels.WINDOW_FULLSCREEN_CHANGE, false);
  });
}
