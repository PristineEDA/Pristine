import { BrowserWindow } from 'electron';
import path from 'node:path';
import { registerDialogHandlers, setDialogProjectRoot } from './dialog.js';
import { registerWindowHandlers, setupWindowStreams } from './window.js';
import { registerFilesystemHandlers, setProjectRoot as setFsRoot } from './filesystem.js';
import { registerGitHandlers, setGitProjectRoot } from './git.js';
import { registerLspHandlers, setLspProjectRoot } from './lsp.js';
import { registerShellHandlers, setShellProjectRoot } from './shell.js';
import { registerTerminalHandlers, setTerminalProjectRoot } from './terminal.js';
import { registerWslHandlers } from './wsl.js';
import { registerConfigHandlers } from './config.js';
import { registerPlatformHandler } from './platform.js';
import { registerAuthHandlers } from './auth.js';
import { registerNoticeHandlers } from './notices.js';
import { registerNotificationHandlers } from './notifications.js';
import { registerProjectHandlers } from './project.js';
import type { WindowCloseDecision } from '../../src/app/window/windowClose.js';
import type { FloatingInfoWindowMode } from '../../src/app/window/floatingInfoWindow.js';
import type { ProjectWindowState } from '../../types/project.js';

export function setProjectRoot(root: string | null): void {
  const resolved = root ? path.resolve(root) : null;
  setDialogProjectRoot(resolved);
  setFsRoot(resolved);
  setGitProjectRoot(resolved);
  setLspProjectRoot(resolved);
  setShellProjectRoot(resolved);
  setTerminalProjectRoot(resolved);
}

export function registerAllHandlers(
  getMainWindow: () => BrowserWindow | null,
  setFloatingInfoWindowVisible: (visible: boolean) => boolean = () => false,
  setFloatingInfoWindowExpanded: (expanded: boolean) => boolean = () => false,
  setFloatingInfoWindowMode: (mode: FloatingInfoWindowMode) => boolean = () => false,
  resolveCloseRequest: (requestId: number, decision: WindowCloseDecision) => boolean = () => false,
  getProjectWindowState: () => ProjectWindowState | null = () => null,
  applyProjectWindowState: (windowState: ProjectWindowState | null | undefined) => void = () => undefined,
  markWorkspaceReady: () => void = () => undefined,
): void {
  registerPlatformHandler();
  registerDialogHandlers(getMainWindow);
  registerWindowHandlers(
    getMainWindow,
    setFloatingInfoWindowVisible,
    setFloatingInfoWindowExpanded,
    setFloatingInfoWindowMode,
    resolveCloseRequest,
    markWorkspaceReady,
  );
  registerFilesystemHandlers();
  registerGitHandlers(getMainWindow);
  registerLspHandlers(getMainWindow);
  registerShellHandlers(getMainWindow);
  registerTerminalHandlers(getMainWindow);
  registerWslHandlers();
  registerConfigHandlers();
  registerNotificationHandlers(getMainWindow);
  registerProjectHandlers(getMainWindow, setProjectRoot, getProjectWindowState, applyProjectWindowState);
  registerAuthHandlers();
  registerNoticeHandlers();
}

export { setupWindowStreams };
