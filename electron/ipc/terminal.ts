import { ipcMain, BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import * as path from 'node:path';
import * as pty from 'node-pty';
import { AsyncChannels, StreamChannels } from './channels.js';
import {
  assertNumber,
  assertOptionalString,
  assertString,
  validatePathWithinRoot,
} from './validators.js';
import { PRISTINE_WSL_DISTRO_NAME } from '../../types/wsl.js';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const EXECUTABLE_PERMISSION_BITS = 0o111;
const FILE_PERMISSION_BITS_MASK = 0o777;
const DIRECTORY_ACCESS_MODE = fs.constants.R_OK | fs.constants.X_OK;

const sessions = new Map<string, pty.IPty>();
let nextId = 1;
let projectRoot: string | null = null;
let macOSSpawnHelperPermissionsEnsured = false;

const require = createRequire(import.meta.url);

type TerminalProfile = 'default' | 'wsl-pristine-eda';

interface TerminalLaunchConfig {
  args: string[];
  file: string;
  label?: string;
}

function hasMissingProcessError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }

  return error instanceof Error && /not found|no such process|no running instance/i.test(error.message);
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasMissingProcessError(error);
  }
}

function terminateWindowsProcessTree(pid: number): void {
  if (!isProcessRunning(pid)) {
    return;
  }

  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    // Ignore best-effort Windows shutdown failures.
  }
}

function terminateSession(session: pty.IPty): void {
  const pid = session.pid;

  if (process.platform === 'win32') {
    if (!pid) {
      try {
        session.kill();
      } catch {
        // Ignore best-effort PTY shutdown failures.
      }
      return;
    }

    // node-pty.kill() shells out to taskkill on Windows and can emit a
    // benign "The process <pid> not found" message if the shell already exited.
    terminateWindowsProcessTree(pid);
    return;
  }

  try {
    session.kill();
  } catch {
    // Ignore best-effort PTY shutdown failures.
  }

  if (!pid) {
    return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process may already be gone.
  }
}

export function disposeAllTerminalSessions(): void {
  for (const session of sessions.values()) {
    terminateSession(session);
  }

  sessions.clear();
}

export function setTerminalProjectRoot(root: string | null): void {
  projectRoot = root;
}

export function getTerminalLaunchConfig(
  platform: NodeJS.Platform = process.platform,
  shellFromEnv = process.env['SHELL'],
  profile: TerminalProfile = 'default',
  resolvedCwd?: string,
): TerminalLaunchConfig {
  if (profile === 'wsl-pristine-eda') {
    if (process.env['PRISTINE_E2E_MOCK_WSL'] === '1') {
      return platform === 'win32'
        ? { file: 'powershell.exe', args: ['-NoLogo'], label: PRISTINE_WSL_DISTRO_NAME }
        : { file: shellFromEnv?.trim() || '/bin/bash', args: ['-l'], label: PRISTINE_WSL_DISTRO_NAME };
    }

    if (platform !== 'win32') {
      throw new Error('Pristine WSL terminal profile is only supported on Windows.');
    }

    return {
      file: 'wsl.exe',
      args: [
        '--distribution',
        PRISTINE_WSL_DISTRO_NAME,
        '--cd',
        resolvedCwd || projectRoot || '~',
      ],
      label: PRISTINE_WSL_DISTRO_NAME,
    };
  }

  if (platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] };
  }

  const shellPath = shellFromEnv?.trim() || '/bin/bash';
  return { file: shellPath, args: ['-l'] };
}

function normalizeTerminalProfile(value: unknown): TerminalProfile {
  if (value === undefined || value === null || value === 'default') {
    return 'default';
  }

  if (value === 'wsl-pristine-eda') {
    return 'wsl-pristine-eda';
  }

  throw new Error('Unsupported terminal profile.');
}

function getNodePtyPackageDirectory(): string | null {
  try {
    return path.dirname(require.resolve('node-pty/package.json'));
  } catch {
    return null;
  }
}

function toUnpackedAsarPath(filePath: string): string {
  return filePath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

function getMacOSSpawnHelperPathCandidates(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string[] {
  if (platform !== 'darwin') {
    return [];
  }

  const packageDirectory = getNodePtyPackageDirectory();
  if (!packageDirectory) {
    return [];
  }

  return [...new Set([
    packageDirectory,
    toUnpackedAsarPath(packageDirectory),
  ].map((directory) => path.join(directory, 'prebuilds', `darwin-${arch}`, 'spawn-helper')))];
}

function ensureMacOSSpawnHelperExecutable(platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'darwin' || macOSSpawnHelperPermissionsEnsured) {
    return;
  }

  for (const helperPath of getMacOSSpawnHelperPathCandidates(platform)) {
    try {
      const stats = fs.statSync(helperPath);
      const permissions = stats.mode & FILE_PERMISSION_BITS_MASK;

      if ((permissions & EXECUTABLE_PERMISSION_BITS) !== EXECUTABLE_PERMISSION_BITS) {
        fs.chmodSync(helperPath, permissions | EXECUTABLE_PERMISSION_BITS);
      }

      macOSSpawnHelperPermissionsEnsured = true;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }

  macOSSpawnHelperPermissionsEnsured = true;
}

function getAccessibleDirectory(dirPath: string | null | undefined): string | null {
  if (!dirPath) {
    return null;
  }

  try {
    const resolvedPath = fs.realpathSync(dirPath);
    const stats = fs.statSync(resolvedPath);

    if (!stats.isDirectory()) {
      return null;
    }

    fs.accessSync(resolvedPath, DIRECTORY_ACCESS_MODE);
    return resolvedPath;
  } catch {
    return null;
  }
}

function getProcessCwdSafe(): string | null {
  try {
    return process.cwd();
  } catch {
    return null;
  }
}

function getFallbackSessionCwd(): string {
  const envPwd = process.env['PWD']?.trim();
  const envHome = process.env['HOME']?.trim();
  const homeDirectory = os.homedir();
  const currentWorkingDirectory = getProcessCwdSafe();

  return [homeDirectory, envHome, envPwd, currentWorkingDirectory]
    .map((candidate) => getAccessibleDirectory(candidate))
    .find((candidate): candidate is string => candidate !== null)
    ?? homeDirectory;
}

function resolveSessionCwd(cwd?: string): string {
  const candidates: string[] = [];

  if (cwd && projectRoot) {
    candidates.push(validatePathWithinRoot(projectRoot, cwd), projectRoot);
  } else if (cwd) {
    candidates.push(path.resolve(cwd));
  } else if (projectRoot) {
    candidates.push(projectRoot);
  }

  return candidates
    .map((candidate) => getAccessibleDirectory(candidate))
    .find((candidate): candidate is string => candidate !== null)
    ?? getFallbackSessionCwd();
}

function createTerminalEnvironment(resolvedCwd: string, shellPath: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    PWD: resolvedCwd,
    SHELL: shellPath,
  };

  const homeDirectory = getAccessibleDirectory(os.homedir());
  if (homeDirectory) {
    environment['HOME'] = homeDirectory;
  }

  delete environment['OLDPWD'];
  return environment;
}

function normalizeSize(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function hasSessionAlreadyExited(error: unknown): boolean {
  return error instanceof Error && /already exited/i.test(error.message);
}

function sendToMainWindow(
  getMainWindow: () => BrowserWindow | null,
  channel: string,
  payload: unknown,
): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    return;
  }

  const contents = win.webContents;
  if (contents.isDestroyed()) {
    return;
  }

  try {
    contents.send(channel, payload);
  } catch {
    // The window may have been destroyed between the checks above and send().
  }
}

export function registerTerminalHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(AsyncChannels.TERMINAL_CREATE, async (_event, options?: unknown) => {
    const opts = (options && typeof options === 'object') ? options as Record<string, unknown> : {};
    const cwd = opts['cwd'];
    const cols = opts['cols'];
    const rows = opts['rows'];
    const profile = normalizeTerminalProfile(opts['profile']);

    assertOptionalString(cwd, 'cwd');
    if (cols !== undefined) {
      assertNumber(cols, 'cols');
    }
    if (rows !== undefined) {
      assertNumber(rows, 'rows');
    }

    const id = String(nextId++);
    const resolvedCwd = resolveSessionCwd(cwd);
    const launch = getTerminalLaunchConfig(process.platform, process.env['SHELL'], profile, resolvedCwd);
    let session: pty.IPty;

    try {
      ensureMacOSSpawnHelperExecutable();

      session = pty.spawn(launch.file, launch.args, {
        name: 'xterm-256color',
        cols: normalizeSize(cols as number | undefined, DEFAULT_COLS),
        rows: normalizeSize(rows as number | undefined, DEFAULT_ROWS),
        cwd: resolvedCwd,
        env: createTerminalEnvironment(resolvedCwd, launch.file),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start terminal shell "${launch.file}" in "${resolvedCwd}": ${message}`);
    }

    sessions.set(id, session);

    session.onData((data) => {
      sendToMainWindow(getMainWindow, StreamChannels.TERMINAL_DATA, { id, data });
    });

    session.onExit(({ exitCode, signal }) => {
      sessions.delete(id);
      sendToMainWindow(getMainWindow, StreamChannels.TERMINAL_EXIT, { id, exitCode, signal });
    });

    return {
      id,
      pid: session.pid,
      shell: launch.label ?? path.basename(launch.file),
    };
  });

  ipcMain.handle(AsyncChannels.TERMINAL_WRITE, async (_event, id: unknown, data: unknown) => {
    assertString(id, 'id');
    assertString(data, 'data');

    const session = sessions.get(id);
    if (!session) {
      return false;
    }

    session.write(data);
    return true;
  });

  ipcMain.handle(AsyncChannels.TERMINAL_RESIZE, async (_event, id: unknown, cols: unknown, rows: unknown) => {
    assertString(id, 'id');
    assertNumber(cols, 'cols');
    assertNumber(rows, 'rows');

    const session = sessions.get(id);
    if (!session) {
      return false;
    }

    try {
      session.resize(normalizeSize(cols, DEFAULT_COLS), normalizeSize(rows, DEFAULT_ROWS));
    } catch (error) {
      if (hasSessionAlreadyExited(error)) {
        sessions.delete(id);
        return false;
      }

      throw error;
    }

    return true;
  });

  ipcMain.handle(AsyncChannels.TERMINAL_KILL, async (_event, id: unknown) => {
    assertString(id, 'id');

    const session = sessions.get(id);
    if (!session) {
      return false;
    }

    sessions.delete(id);
    terminateSession(session);
    return true;
  });
}
