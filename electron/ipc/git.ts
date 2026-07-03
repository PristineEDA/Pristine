import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { watch, type Dirent, type FSWatcher } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AsyncChannels, StreamChannels } from './channels.js';
import { assertString, validatePathWithinRoot } from './validators.js';
import type {
  WorkspaceGitChangeEvent,
  WorkspaceGitFileDiffPayload,
  WorkspaceGitPathState,
  WorkspaceGitStatusPayload,
} from '../../types/workspace-git.js';

const GIT_STATUS_MAX_BUFFER_BYTES = 1024 * 1024;
const GIT_FILE_DIFF_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const WORKSPACE_CHANGE_DEBOUNCE_MS = 160;

type WorkspaceChangeStreamTarget = {
  isDestroyed?: () => boolean;
  webContents: {
    send: (channel: string, payload: WorkspaceGitChangeEvent) => void;
  };
};

let projectRoot: string | null = null;
let getWorkspaceChangeTarget: (() => WorkspaceChangeStreamTarget | null) | null = null;
let workspaceWatchers: FSWatcher[] = [];
let queuedWorkspaceChange: WorkspaceGitChangeEvent | null = null;
let workspaceChangeTimer: ReturnType<typeof setTimeout> | null = null;

function getProjectRoot(): string {
  if (!projectRoot) {
    throw new Error('Project root not set');
  }

  return projectRoot;
}

function normalizeGitPath(value: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .trim();

  return normalized;
}

function unquoteGitPath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed) as string;
  } catch {
    return trimmed.slice(1, -1);
  }
}

function toStatusPath(rawPath: string): string {
  const targetPath = rawPath.includes(' -> ')
    ? rawPath.slice(rawPath.lastIndexOf(' -> ') + 4)
    : rawPath;

  return normalizeGitPath(unquoteGitPath(targetPath));
}

function parseBranchName(summary: string): string | null {
  if (summary.startsWith('No commits yet on ')) {
    return summary.slice('No commits yet on '.length).trim() || null;
  }

  if (summary.startsWith('HEAD (no branch)')) {
    return 'HEAD';
  }

  const branchName = summary.split('...')[0]?.trim() ?? '';
  return branchName.length > 0 ? branchName : null;
}

function isTrackedChange(statusCode: string): boolean {
  return [...statusCode].some((code) => code !== ' ' && code !== '?' && code !== '!');
}

function resolveWorkspaceGitPathState(statusCode: string): WorkspaceGitPathState | undefined {
  if (statusCode === '!!') {
    return 'ignored';
  }

  if (statusCode === '??') {
    return 'created';
  }

  const [indexStatus = ' ', workTreeStatus = ' '] = statusCode;

  if (indexStatus === 'D' || workTreeStatus === 'D') {
    return 'deleted';
  }

  if (indexStatus === 'A' || workTreeStatus === 'A') {
    return 'created';
  }

  if (isTrackedChange(statusCode)) {
    return 'modified';
  }

  return undefined;
}

function parseGitStatus(stdout: string): Pick<WorkspaceGitStatusPayload, 'branchName' | 'pathStates'> {
  const pathStates: WorkspaceGitStatusPayload['pathStates'] = {};
  let branchName: string | null = null;

  stdout.split(/\r?\n/g).forEach((line) => {
    if (!line) {
      return;
    }

    if (line.startsWith('## ')) {
      branchName = parseBranchName(line.slice(3));
      return;
    }

    if (line.length < 4) {
      return;
    }

    const statusCode = line.slice(0, 2);
    const statusPath = toStatusPath(line.slice(3));

    if (!statusPath) {
      return;
    }

    const nextPathState = resolveWorkspaceGitPathState(statusCode);

    if (nextPathState) {
      pathStates[statusPath] = nextPathState;
    }
  });

  return {
    branchName,
    pathStates,
  };
}

function prefixGitPathStates(
  prefix: string,
  pathStates: WorkspaceGitStatusPayload['pathStates'],
): WorkspaceGitStatusPayload['pathStates'] {
  return Object.entries(pathStates).reduce<WorkspaceGitStatusPayload['pathStates']>((current, [gitPath, state]) => {
    current[normalizeGitPath(`${prefix}/${gitPath}`)] = state;
    return current;
  }, {});
}

function execGitStatus(root: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [
        '--no-optional-locks',
        '-c',
        'status.relativePaths=true',
        'status',
        '--porcelain=1',
        '--branch',
        '--ignored=matching',
        '--untracked-files=all',
        '--',
        '.',
      ],
      {
        cwd: root,
        maxBuffer: GIT_STATUS_MAX_BUFFER_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      },
    );
  });
}

function execGitShowHead(root: string, gitPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['--no-optional-locks', 'show', `HEAD:${gitPath}`],
      {
        cwd: root,
        maxBuffer: GIT_FILE_DIFF_MAX_BUFFER_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      },
    );
  });
}

async function hasProjectFiles(root: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.some((entry) => entry.name !== '.git');
  } catch {
    return false;
  }
}

async function isGitRepositoryRoot(root: string): Promise<boolean> {
  try {
    const gitMetadataStat = await fs.stat(path.join(root, '.git'));
    return gitMetadataStat.isDirectory() || gitMetadataStat.isFile();
  } catch {
    return false;
  }
}

async function readFirstLevelGitRepositories(root: string): Promise<Array<{ name: string; root: string }>> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const repositories: Array<{ name: string; root: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.git') {
      continue;
    }

    const childRoot = path.join(root, entry.name);
    if (await isGitRepositoryRoot(childRoot)) {
      repositories.push({
        name: normalizeGitPath(entry.name),
        root: childRoot,
      });
    }
  }

  return repositories;
}

async function loadNestedGitPathStates(root: string): Promise<WorkspaceGitStatusPayload['pathStates']> {
  const pathStates: WorkspaceGitStatusPayload['pathStates'] = {};
  const repositories = await readFirstLevelGitRepositories(root);

  for (const repository of repositories) {
    try {
      const stdout = await execGitStatus(repository.root);
      Object.assign(pathStates, prefixGitPathStates(repository.name, parseGitStatus(stdout).pathStates));
    } catch {
      // Ignore broken or unavailable nested repositories; the root snapshot should still be usable.
    }
  }

  return pathStates;
}

function clearQueuedWorkspaceChange() {
  if (workspaceChangeTimer) {
    clearTimeout(workspaceChangeTimer);
    workspaceChangeTimer = null;
  }

  queuedWorkspaceChange = null;
}

function closeWorkspaceWatchers() {
  workspaceWatchers.forEach((watcher) => {
    try {
      watcher.close();
    } catch {
      // Ignore watcher disposal failures while switching projects.
    }
  });

  workspaceWatchers = [];
}

function flushQueuedWorkspaceChange() {
  workspaceChangeTimer = null;

  if (!queuedWorkspaceChange) {
    return;
  }

  const nextChange = queuedWorkspaceChange;
  queuedWorkspaceChange = null;

  const target = getWorkspaceChangeTarget?.();
  if (!target || target.isDestroyed?.()) {
    return;
  }

  target.webContents.send(StreamChannels.WORKSPACE_CHANGE, nextChange);
}

function queueWorkspaceChange(nextChange: WorkspaceGitChangeEvent) {
  queuedWorkspaceChange = queuedWorkspaceChange
    ? {
      refreshGitStatus: queuedWorkspaceChange.refreshGitStatus || nextChange.refreshGitStatus,
      refreshWorkspaceTree: queuedWorkspaceChange.refreshWorkspaceTree || nextChange.refreshWorkspaceTree,
    }
    : nextChange;

  if (workspaceChangeTimer) {
    return;
  }

  workspaceChangeTimer = setTimeout(flushQueuedWorkspaceChange, WORKSPACE_CHANGE_DEBOUNCE_MS);
}

function normalizeWatchedFilename(filename: string | Buffer | null): string {
  if (filename === null) {
    return '';
  }

  return filename.toString().replace(/\\/g, '/').replace(/^\.\//, '');
}

function watchPath(
  targetPath: string,
  listener: (eventType: string, filename: string) => void,
  recursive: boolean,
) {
  const createWatcher = (useRecursive: boolean) => watch(
    targetPath,
    useRecursive ? { recursive: true, encoding: 'utf8' } : { encoding: 'utf8' },
    (eventType, filename) => {
      listener(eventType, normalizeWatchedFilename(filename));
    },
  );

  try {
    const watcher = createWatcher(recursive);
    workspaceWatchers.push(watcher);
    return;
  } catch {
    if (!recursive) {
      return;
    }
  }

  try {
    const watcher = createWatcher(false);
    workspaceWatchers.push(watcher);
  } catch {
    // Ignore unsupported watcher targets and fall back to focus-driven refreshes.
  }
}

async function setupWorkspaceChangeWatchers() {
  closeWorkspaceWatchers();
  clearQueuedWorkspaceChange();

  if (!projectRoot || !getWorkspaceChangeTarget) {
    return;
  }

  const root = getProjectRoot();

  watchPath(root, (eventType, filename) => {
    if (filename === '.git' || filename.startsWith('.git/')) {
      return;
    }

    queueWorkspaceChange({
      refreshGitStatus: true,
      refreshWorkspaceTree: eventType === 'rename',
    });
  }, true);

  try {
    const gitDirectoryPath = path.join(root, '.git');
    const gitDirectoryStat = await fs.stat(gitDirectoryPath);

    if (gitDirectoryStat.isDirectory()) {
      watchPath(gitDirectoryPath, () => {
        queueWorkspaceChange({
          refreshGitStatus: true,
          refreshWorkspaceTree: false,
        });
      }, true);
    }
  } catch {
    // Non-git workspaces or unsupported git metadata layouts just skip live git watching.
  }
}

export function setGitProjectRoot(root: string | null): void {
  projectRoot = root ? path.resolve(root) : null;
  void setupWorkspaceChangeWatchers();
}

export function registerGitHandlers(
  nextGetWorkspaceChangeTarget?: () => WorkspaceChangeStreamTarget | null,
): void {
  if (nextGetWorkspaceChangeTarget) {
    getWorkspaceChangeTarget = nextGetWorkspaceChangeTarget;
    void setupWorkspaceChangeWatchers();
  }

  ipcMain.handle(AsyncChannels.GIT_GET_STATUS, async (): Promise<WorkspaceGitStatusPayload> => {
    if (!projectRoot) {
      return {
        branchName: null,
        hasProjectFiles: false,
        isGitRepo: false,
        pathStates: {},
      };
    }

    const root = getProjectRoot();
    const projectHasFiles = await hasProjectFiles(root);

    if (!projectHasFiles) {
      return {
        branchName: null,
        hasProjectFiles: false,
        isGitRepo: false,
        pathStates: {},
      };
    }

    const nestedPathStates = await loadNestedGitPathStates(root);

    try {
      const stdout = await execGitStatus(root);
      const { branchName, pathStates } = parseGitStatus(stdout);

      return {
        branchName,
        hasProjectFiles: true,
        isGitRepo: true,
        pathStates: {
          ...pathStates,
          ...nestedPathStates,
        },
      };
    } catch {
      return {
        branchName: null,
        hasProjectFiles: true,
        isGitRepo: false,
        pathStates: nestedPathStates,
      };
    }
  });

  ipcMain.handle(AsyncChannels.GIT_GET_FILE_DIFF, async (_event, filePath: unknown): Promise<WorkspaceGitFileDiffPayload> => {
    assertString(filePath, 'filePath');

    if (!projectRoot) {
      return {
        currentContent: '',
        filePath: normalizeGitPath(filePath),
        originalContent: '',
      };
    }

    const root = getProjectRoot();
    const normalizedFilePath = normalizeGitPath(filePath);
    if (!normalizedFilePath) {
      throw new Error('Expected a workspace-relative git file path');
    }

    const absoluteFilePath = validatePathWithinRoot(root, normalizedFilePath);
    const [originalContent, currentContent] = await Promise.all([
      execGitShowHead(root, normalizedFilePath),
      fs.readFile(absoluteFilePath, 'utf8'),
    ]);

    return {
      filePath: normalizedFilePath,
      originalContent,
      currentContent,
    };
  });
}
