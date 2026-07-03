import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mockHandle = vi.fn();
const send = vi.fn();
const mockExecFileSync = vi.fn();
const originalPlatform = process.platform;
const originalPwd = process.env.PWD;

vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
  BrowserWindow: class {},
}));

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

const mockSpawn = vi.fn();
vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import {
  disposeAllTerminalSessions,
  getTerminalLaunchConfig,
  registerTerminalHandlers,
  setTerminalProjectRoot,
} from './terminal.js';

function setProcessPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((entry) => entry[0] === channel);
  if (!call) {
    throw new Error(`No handler registered for ${channel}`);
  }

  return call[1];
}

function createFakeTerminal() {
  const handlers: {
    data?: (data: string) => void;
    exit?: (event: { exitCode: number; signal: number }) => void;
  } = {};

  return {
    pid: 2468,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((callback: (data: string) => void) => {
      handlers.data = callback;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((callback: (event: { exitCode: number; signal: number }) => void) => {
      handlers.exit = callback;
      return { dispose: vi.fn() };
    }),
    handlers,
  };
}

describe('terminal IPC handlers', () => {
  let mainWindow: any;
  const getMainWindow = () => mainWindow;

  beforeEach(() => {
    setProcessPlatform('linux');
    mockHandle.mockClear();
    mockSpawn.mockClear();
    mockExecFileSync.mockClear();
    send.mockClear();
    disposeAllTerminalSessions();
    mainWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send,
      },
    };
    registerTerminalHandlers(getMainWindow);
  });

  afterAll(() => {
    setProcessPlatform(originalPlatform);
    if (originalPwd === undefined) {
      delete process.env.PWD;
      return;
    }

    process.env.PWD = originalPwd;
  });

  it('selects PowerShell on Windows', () => {
    expect(getTerminalLaunchConfig('win32')).toEqual({
      file: 'powershell.exe',
      args: ['-NoLogo'],
    });
  });

  it('uses the native shell on Unix-like platforms', () => {
    expect(getTerminalLaunchConfig('linux', '/bin/zsh')).toEqual({
      file: '/bin/zsh',
      args: ['-l'],
    });
  });

  it('rejects invalid create parameters before spawning a session', async () => {
    const createHandler = getHandler('async:terminal:create');

    await expect(createHandler({}, { cwd: 42 })).rejects.toThrow('Expected string or undefined for "cwd", got number');
    await expect(createHandler({}, { cols: 'wide' })).rejects.toThrow('Expected number for "cols", got string');
    await expect(createHandler({}, { rows: 'tall' })).rejects.toThrow('Expected number for "rows", got string');
    await expect(createHandler({}, { profile: 'custom-shell' })).rejects.toThrow('Unsupported terminal profile.');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('uses a restricted WSL command for the Pristine EDA terminal profile', async () => {
    setProcessPlatform('win32');
    const fakeTerminal = createFakeTerminal();
    mockSpawn.mockReturnValue(fakeTerminal);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pristine-terminal-wsl-root-'));
    const expectedCwd = fs.realpathSync(root);

    try {
      setTerminalProjectRoot(root);

      const createHandler = getHandler('async:terminal:create');
      const result = await createHandler({}, { profile: 'wsl-pristine-eda' });

      expect(result).toEqual({
        id: expect.any(String),
        pid: 2468,
        shell: 'pristine-eda-env',
      });
      expect(mockSpawn).toHaveBeenCalledWith(
        'wsl.exe',
        ['--distribution', 'pristine-eda-env', '--cd', expectedCwd],
        expect.objectContaining({
          cwd: expectedCwd,
        }),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates a terminal session and forwards data/exit streams', async () => {
    const fakeTerminal = createFakeTerminal();
    mockSpawn.mockReturnValue(fakeTerminal);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pristine-terminal-root-'));
    const sourceDir = path.join(root, 'src');
    fs.mkdirSync(sourceDir, { recursive: true });
    const expectedCwd = fs.realpathSync(sourceDir);

    try {
      setTerminalProjectRoot(root);

      const createHandler = getHandler('async:terminal:create');
      const result = await createHandler({}, { cwd: 'src', cols: 100, rows: 40 });

      expect(result).toEqual({
        id: expect.any(String),
        pid: 2468,
        shell: expect.any(String),
      });
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          cols: 100,
          rows: 40,
          cwd: expectedCwd,
          env: expect.objectContaining({
            PWD: expectedCwd,
            SHELL: expect.any(String),
            TERM: 'xterm-256color',
          }),
        }),
      );

      const sessionId = (result as { id: string }).id;
      fakeTerminal.handlers.data?.('PS> ');
      fakeTerminal.handlers.exit?.({ exitCode: 0, signal: 0 });

      expect(send).toHaveBeenNthCalledWith(1, 'stream:terminal:data', { id: sessionId, data: 'PS> ' });
      expect(send).toHaveBeenNthCalledWith(2, 'stream:terminal:exit', { id: sessionId, exitCode: 0, signal: 0 });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to a valid local cwd when the configured project root does not exist', async () => {
    const fakeTerminal = createFakeTerminal();
    const fallbackCwd = fs.realpathSync(os.homedir());
    const missingProjectRoot = path.join(fallbackCwd, '__missing_pristine_project_root__');

    mockSpawn.mockReturnValue(fakeTerminal);
    process.env.PWD = path.join(fallbackCwd, '__missing_pristine_pwd__');
    setTerminalProjectRoot(missingProjectRoot);

    const createHandler = getHandler('async:terminal:create');
    await createHandler({}, {});

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        cwd: fallbackCwd,
        env: expect.objectContaining({ PWD: fallbackCwd }),
      }),
    );
  });

  it('repairs the macOS node-pty spawn-helper execute bit before spawning', async () => {
    setProcessPlatform('darwin');

    const fakeTerminal = createFakeTerminal();
    const originalStatSync = fs.statSync;
    const chmodSyncSpy = vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);
    const statSyncSpy = vi.spyOn(fs, 'statSync').mockImplementation(((targetPath: fs.PathLike) => {
      const normalizedPath = String(targetPath).replace(/\\/g, '/');

      if (normalizedPath.includes('/node-pty/prebuilds/darwin-') && normalizedPath.endsWith('/spawn-helper')) {
        return {
          mode: 0o644,
          isDirectory: () => false,
        } as fs.Stats;
      }

      return originalStatSync(targetPath);
    }) as typeof fs.statSync);

    try {
      mockSpawn.mockReturnValue(fakeTerminal);

      const createHandler = getHandler('async:terminal:create');
      await createHandler({}, {});

      expect(chmodSyncSpy).toHaveBeenCalledWith(
        expect.stringMatching(/node-pty[\\/]prebuilds[\\/]darwin-(arm64|x64)[\\/]spawn-helper$/),
        0o755,
      );
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    } finally {
      chmodSyncSpy.mockRestore();
      statSyncSpy.mockRestore();
    }
  });

  it('routes write, resize, and kill to the matching session', async () => {
    const fakeTerminal = createFakeTerminal();
    mockSpawn.mockReturnValue(fakeTerminal);
    const createHandler = getHandler('async:terminal:create');
    const writeHandler = getHandler('async:terminal:write');
    const resizeHandler = getHandler('async:terminal:resize');
    const killHandler = getHandler('async:terminal:kill');

    const result = await createHandler({}, {});
    const sessionId = (result as { id: string }).id;

    await expect(writeHandler({}, sessionId, 'dir\r')).resolves.toBe(true);
    await expect(resizeHandler({}, sessionId, 90, 28)).resolves.toBe(true);
    await expect(killHandler({}, sessionId)).resolves.toBe(true);

    expect(fakeTerminal.write).toHaveBeenCalledWith('dir\r');
    expect(fakeTerminal.resize).toHaveBeenCalledWith(90, 28);
    expect(fakeTerminal.kill).toHaveBeenCalled();
  });

  it('uses silent taskkill to terminate Windows terminal sessions', async () => {
    setProcessPlatform('win32');
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(((_pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 0) {
        return true;
      }

      return true;
    }) as typeof process.kill);

    try {
      const fakeTerminal = createFakeTerminal();
      mockSpawn.mockReturnValue(fakeTerminal);
      const createHandler = getHandler('async:terminal:create');
      const killHandler = getHandler('async:terminal:kill');

      const result = await createHandler({}, {});
      const sessionId = (result as { id: string }).id;

      await expect(killHandler({}, sessionId)).resolves.toBe(true);

      expect(fakeTerminal.kill).not.toHaveBeenCalled();
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'taskkill',
        ['/PID', '2468', '/T', '/F'],
        expect.objectContaining({
          stdio: 'ignore',
          windowsHide: true,
        }),
      );
    } finally {
      processKillSpy.mockRestore();
    }
  });

  it('returns false for write, resize, and kill when the session is missing', async () => {
    const writeHandler = getHandler('async:terminal:write');
    const resizeHandler = getHandler('async:terminal:resize');
    const killHandler = getHandler('async:terminal:kill');

    await expect(writeHandler({}, 'missing-session', 'dir\r')).resolves.toBe(false);
    await expect(resizeHandler({}, 'missing-session', 90, 28)).resolves.toBe(false);
    await expect(killHandler({}, 'missing-session')).resolves.toBe(false);
  });

  it('routes terminal actions only to the targeted session', async () => {
    const firstTerminal = createFakeTerminal();
    const secondTerminal = createFakeTerminal();
    mockSpawn
      .mockReturnValueOnce(firstTerminal)
      .mockReturnValueOnce(secondTerminal);

    const createHandler = getHandler('async:terminal:create');
    const writeHandler = getHandler('async:terminal:write');
    const resizeHandler = getHandler('async:terminal:resize');

    await createHandler({}, {});
    const second = await createHandler({}, {});

    await writeHandler({}, (second as { id: string }).id, 'help\r');
    await resizeHandler({}, (second as { id: string }).id, 120, 50);

    expect(firstTerminal.write).not.toHaveBeenCalled();
    expect(firstTerminal.resize).not.toHaveBeenCalled();
    expect(secondTerminal.write).toHaveBeenCalledWith('help\r');
    expect(secondTerminal.resize).toHaveBeenCalledWith(120, 50);
  });

  it('swallows resize requests for sessions that have already exited', async () => {
    const fakeTerminal = createFakeTerminal();
    fakeTerminal.resize.mockImplementation(() => {
      throw new Error('Cannot resize a pty that has already exited');
    });
    mockSpawn.mockReturnValue(fakeTerminal);

    const createHandler = getHandler('async:terminal:create');
    const resizeHandler = getHandler('async:terminal:resize');

    const result = await createHandler({}, {});
    const sessionId = (result as { id: string }).id;

    await expect(resizeHandler({}, sessionId, 90, 28)).resolves.toBe(false);
    await expect(resizeHandler({}, sessionId, 90, 28)).resolves.toBe(false);
  });

  it('kills all active sessions during shutdown cleanup', async () => {
    const firstTerminal = createFakeTerminal();
    const secondTerminal = createFakeTerminal();
    mockSpawn
      .mockReturnValueOnce(firstTerminal)
      .mockReturnValueOnce(secondTerminal);

    const createHandler = getHandler('async:terminal:create');
    await createHandler({}, {});
    await createHandler({}, {});

    disposeAllTerminalSessions();

    expect(firstTerminal.kill).toHaveBeenCalledTimes(1);
    expect(secondTerminal.kill).toHaveBeenCalledTimes(1);
  });

  it('skips Windows taskkill cleanup when the terminal process has already exited', async () => {
    setProcessPlatform('win32');
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(((_pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 0) {
        const error = new Error('process missing') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }

      return true;
    }) as typeof process.kill);

    try {
      const fakeTerminal = createFakeTerminal();
      mockSpawn.mockReturnValue(fakeTerminal);

      const createHandler = getHandler('async:terminal:create');
      await createHandler({}, {});

      disposeAllTerminalSessions();

      expect(fakeTerminal.kill).not.toHaveBeenCalled();
      expect(mockExecFileSync).not.toHaveBeenCalled();
    } finally {
      processKillSpy.mockRestore();
    }
  });

  it('ignores late terminal events after the window is destroyed', async () => {
    const fakeTerminal = createFakeTerminal();
    mockSpawn.mockReturnValue(fakeTerminal);

    const createHandler = getHandler('async:terminal:create');
    await createHandler({}, {});

    mainWindow.isDestroyed.mockReturnValue(true);

    expect(() => {
      fakeTerminal.handlers.data?.('late output');
      fakeTerminal.handlers.exit?.({ exitCode: 0, signal: 0 });
    }).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores late terminal events after webContents is destroyed', async () => {
    const fakeTerminal = createFakeTerminal();
    mockSpawn.mockReturnValue(fakeTerminal);

    const createHandler = getHandler('async:terminal:create');
    await createHandler({}, {});

    mainWindow.webContents.isDestroyed.mockReturnValue(true);

    expect(() => {
      fakeTerminal.handlers.data?.('late output');
      fakeTerminal.handlers.exit?.({ exitCode: 0, signal: 0 });
    }).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
