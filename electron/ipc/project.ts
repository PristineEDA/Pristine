import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AsyncChannels, StreamChannels } from './channels.js';
import { setConfigValue } from './config.js';
import { assertString, validateAbsolutePath } from './validators.js';
import {
  closeCurrentProjectDatabase,
  createProjectDatabase,
  ensureProjectDatabase,
  flushCurrentProjectSession,
  getCurrentProjectState,
  getLastFlushedProjectSessionSnapshot,
  isValidProjectDatabase,
  openCurrentProject,
  updateCurrentProjectConfig,
} from './projectDatabase.js';
import type {
  CreateProjectInput,
  ProjectConfig,
  ProjectChangedEvent,
  ProjectCloseResult,
  ProjectCreateResult,
  ProjectOpenResult,
  ProjectSessionSnapshot,
  ProjectState,
  ProjectUpdateConfigResult,
  ProjectWindowState,
} from '../../types/project.js';

export const PROJECT_LAST_ROOT_CONFIG_KEY = 'project.lastProjectRoot';

const PROJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const WINDOWS_INVALID_NAME_CHARS = /[\\/:*?"<>|]/;

type ProjectRootApplier = (root: string | null) => void;
type ProjectWindowStateProvider = () => ProjectWindowState | null;
type ProjectWindowStateApplier = (windowState: ProjectWindowState | null | undefined) => void;

function broadcastProjectChanged(payload: ProjectChangedEvent): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }

    window.webContents.send(StreamChannels.PROJECT_CHANGED, payload);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCreateProjectInput(value: unknown): CreateProjectInput {
  if (!isPlainObject(value)) {
    throw new Error('Expected project input object');
  }

  const input = {
    mgnt: value['mgnt'],
    mode: value['mode'],
    name: value['name'],
    padframe: value['padframe'],
    path: value['path'],
    process: value['process'],
    type: value['type'],
  };

  Object.entries(input).forEach(([key, nextValue]) => {
    assertString(nextValue, key);
  });

  return input as CreateProjectInput;
}

function normalizeProjectConfigInput(value: unknown): ProjectConfig {
  if (!isPlainObject(value)) {
    throw new Error('Expected project config object');
  }

  const input = {
    mgnt: value['mgnt'],
    mode: value['mode'],
    padframe: value['padframe'],
    process: value['process'],
    type: value['type'],
  };

  Object.entries(input).forEach(([key, nextValue]) => {
    assertString(nextValue, key);
  });

  return input as ProjectConfig;
}

function validateProjectName(name: string): string {
  const trimmedName = name.trim();

  if (!PROJECT_NAME_PATTERN.test(trimmedName) || WINDOWS_INVALID_NAME_CHARS.test(trimmedName)) {
    throw new Error('Project name may contain letters, numbers, spaces, dashes, underscores, and dots.');
  }

  if (trimmedName === '.' || trimmedName === '..' || WINDOWS_RESERVED_NAME_PATTERN.test(trimmedName)) {
    throw new Error(`Project name "${trimmedName}" is reserved.`);
  }

  return trimmedName;
}

function normalizeProjectRootInput(rootPath: string): string {
  return validateAbsolutePath(rootPath);
}

function withWindowState(
  snapshot: ProjectSessionSnapshot,
  getWindowState: ProjectWindowStateProvider = () => null,
): ProjectSessionSnapshot {
  const windowState = getWindowState();
  return windowState ? { ...snapshot, windowState } : snapshot;
}

function openProjectRoot(
  rootPath: string,
  applyProjectRoot: ProjectRootApplier,
  applyWindowState: ProjectWindowStateApplier = () => undefined,
): ProjectState {
  const resolvedRoot = normalizeProjectRootInput(rootPath);

  if (!isValidProjectDatabase(resolvedRoot)) {
    throw new Error(`Project database not found at ${path.join(resolvedRoot, '.pristine', 'project.sqlite')}`);
  }

  applyProjectRoot(resolvedRoot);
  const project = openCurrentProject(resolvedRoot);
  applyWindowState(project.session?.windowState);
  setConfigValue(PROJECT_LAST_ROOT_CONFIG_KEY, resolvedRoot);
  broadcastProjectChanged(project);
  return project;
}

export function tryOpenStartupProject(
  rootPath: string | null,
  applyProjectRoot: ProjectRootApplier,
  applyWindowState: ProjectWindowStateApplier = () => undefined,
): ProjectState | null {
  if (!rootPath) {
    applyProjectRoot(null);
    return null;
  }

  try {
    ensureProjectDatabase(rootPath);
    return openProjectRoot(rootPath, applyProjectRoot, applyWindowState);
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error);
    applyProjectRoot(null);
    return null;
  }
}

export function closeProject(
  applyProjectRoot: ProjectRootApplier,
  snapshot?: ProjectSessionSnapshot,
  getWindowState: ProjectWindowStateProvider = () => null,
): ProjectCloseResult {
  if (snapshot) {
    flushCurrentProjectSession(withWindowState(snapshot, getWindowState));
  }

  closeCurrentProjectDatabase();
  applyProjectRoot(null);
  setConfigValue(PROJECT_LAST_ROOT_CONFIG_KEY, null);
  broadcastProjectChanged(null);
  return { closed: true };
}

export function disposeProjectService(getWindowState: ProjectWindowStateProvider = () => null): void {
  const snapshot = getLastFlushedProjectSessionSnapshot();
  if (snapshot) {
    flushCurrentProjectSession(withWindowState(snapshot, getWindowState));
  }
  closeCurrentProjectDatabase();
}

export function registerProjectHandlers(
  getMainWindow: () => BrowserWindow | null,
  applyProjectRoot: ProjectRootApplier,
  getWindowState: ProjectWindowStateProvider = () => null,
  applyWindowState: ProjectWindowStateApplier = () => undefined,
): void {
  ipcMain.handle(AsyncChannels.PROJECT_CREATE, async (_event, rawInput: unknown): Promise<ProjectCreateResult> => {
    const input = normalizeCreateProjectInput(rawInput);
    const projectName = validateProjectName(input.name);
    const parentPath = normalizeProjectRootInput(input.path);
    const rootPath = path.resolve(parentPath, projectName);
    const relative = path.relative(parentPath, rootPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Project path is outside the selected directory.');
    }

    await fs.mkdir(rootPath, { recursive: false });
    try {
      await createProjectDatabase({ ...input, name: projectName }, rootPath);
      const project = openProjectRoot(rootPath, applyProjectRoot, applyWindowState);
      return { project };
    } catch (error) {
      await fs.rm(rootPath, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  });

  ipcMain.handle(AsyncChannels.PROJECT_OPEN, async (_event, rootPath?: unknown): Promise<ProjectOpenResult> => {
    let selectedRoot: string | null = null;

    if (typeof rootPath === 'string' && rootPath.trim().length > 0) {
      selectedRoot = rootPath;
    } else {
      const e2eProjectRoot = process.env['PRISTINE_E2E_OPEN_PROJECT_PATH'];
      if (process.env['PRISTINE_E2E'] === '1' && e2eProjectRoot) {
        delete process.env['PRISTINE_E2E_OPEN_PROJECT_PATH'];
        selectedRoot = e2eProjectRoot;
      } else {
        const mainWindow = getMainWindow();
        const dialogOptions: OpenDialogOptions = {
          properties: ['openDirectory'],
        };
        const result = mainWindow
          ? await dialog.showOpenDialog(mainWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (result.canceled || !result.filePaths[0]) {
          throw new Error('Project open canceled.');
        }

        selectedRoot = result.filePaths[0];
      }
    }

    const project = openProjectRoot(selectedRoot, applyProjectRoot, applyWindowState);
    return { project };
  });

  ipcMain.handle(AsyncChannels.PROJECT_CLOSE, async (_event, snapshot?: unknown): Promise<ProjectCloseResult> => {
    const sessionSnapshot = isPlainObject(snapshot) ? snapshot as unknown as ProjectSessionSnapshot : undefined;
    return closeProject(applyProjectRoot, sessionSnapshot, getWindowState);
  });

  ipcMain.handle(AsyncChannels.PROJECT_GET_CURRENT, async (): Promise<ProjectState | null> => getCurrentProjectState());

  ipcMain.handle(AsyncChannels.PROJECT_FLUSH_SESSION, async (_event, snapshot: unknown): Promise<void> => {
    if (!isPlainObject(snapshot)) {
      throw new Error('Expected project session snapshot object');
    }

    flushCurrentProjectSession(withWindowState(snapshot as unknown as ProjectSessionSnapshot, getWindowState));
  });

  ipcMain.handle(
    AsyncChannels.PROJECT_UPDATE_CONFIG,
    async (_event, rawInput: unknown): Promise<ProjectUpdateConfigResult> => {
      const input = normalizeProjectConfigInput(rawInput);
      const project = updateCurrentProjectConfig(input);
      broadcastProjectChanged(project);
      return { project };
    },
  );
}
