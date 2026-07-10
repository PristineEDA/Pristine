import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

// ─── Mock electron / child_process before importing module ────────────────

const mockHandle = vi.fn();
const mockOpenExternal = vi.fn();
vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
  shell: { openExternal: (...args: unknown[]) => mockOpenExternal(...args) },
  BrowserWindow: class {},
}));

const mockSpawn = vi.fn();
vi.mock('node:child_process', () => {
  const spawn = (...args: unknown[]) => mockSpawn(...args);

  return {
    default: { spawn },
    spawn,
  };
});

import { registerShellHandlers, setShellProjectRoot } from './shell.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

type FakeProcess = {
  pid: number;
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  _handlers: Record<string, (...args: unknown[]) => void>;
};

const spawnedProcesses: FakeProcess[] = [];

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((c) => c[0] === channel);
  if (!call) throw new Error(`No handler registered for ${channel}`);
  return call[1];
}

function makeFakeProcess(): FakeProcess {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const fakeProcess = {
    pid: 12345,
    stdout: {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { handlers[`stdout:${event}`] = cb; }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { handlers[`stderr:${event}`] = cb; }),
    },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { handlers[event] = cb; }),
    kill: vi.fn(),
    _handlers: handlers,
  };

  spawnedProcesses.push(fakeProcess);
  return fakeProcess;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('shell IPC handlers', () => {
  let send: ReturnType<typeof vi.fn>;
  const getMainWindow = () => ({ webContents: { send } } as any);

  beforeEach(() => {
    mockHandle.mockClear();
    mockOpenExternal.mockReset();
    mockOpenExternal.mockResolvedValue(undefined);
    mockSpawn.mockClear();
    send = vi.fn();
    spawnedProcesses.length = 0;
    setShellProjectRoot(path.resolve('.'));
    registerShellHandlers(getMainWindow);
  });

  afterEach(() => {
    for (const process of spawnedProcesses) {
      process._handlers['close']?.(0);
    }
    spawnedProcesses.length = 0;
  });

  describe('SHELL_EXEC', () => {
    it('rejects commands not in the allowlist', async () => {
      const handler = getHandler('async:shell:exec');
      await expect(handler({}, 'rm')).rejects.toThrow('Command not allowed');
    });

    it('rejects non-string command', async () => {
      const handler = getHandler('async:shell:exec');
      await expect(handler({}, 42)).rejects.toThrow('Expected string');
    });

    it('allows verilator command', async () => {
      const fakeProc = makeFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);
      const handler = getHandler('async:shell:exec');
      const result = await handler({}, 'verilator', ['--lint-only', 'top.v']);
      expect(result).toEqual({ id: expect.any(String), pid: 12345 });
      expect(mockSpawn).toHaveBeenCalledWith(
        'verilator',
        ['--lint-only', 'top.v'],
        expect.objectContaining({ shell: false }),
      );
    });

    it('allows make command', async () => {
      const fakeProc = makeFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);
      const handler = getHandler('async:shell:exec');
      const result = await handler({}, 'make', ['lint']);
      expect(result).toEqual({ id: expect.any(String), pid: 12345 });
    });

    it('allows python command', async () => {
      const fakeProc = makeFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);
      const handler = getHandler('async:shell:exec');
      const result = await handler({}, 'python', ['-m', 'cocotb']);
      expect(result).toEqual({ id: expect.any(String), pid: 12345 });
    });

    it('forwards stdout, stderr, close, and error events to the main window', async () => {
      const fakeProc = makeFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);
      const handler = getHandler('async:shell:exec');

      const result = await handler({}, 'make', ['lint']);
      const id = (result as { id: string }).id;

      fakeProc._handlers['stdout:data']?.(Buffer.from('stdout line'));
      fakeProc._handlers['stderr:data']?.(Buffer.from('stderr line'));
      fakeProc._handlers['close']?.(0);
      fakeProc._handlers['error']?.(new Error('spawn failed'));

      expect(send).toHaveBeenNthCalledWith(1, 'stream:shell:stdout', { id, data: 'stdout line' });
      expect(send).toHaveBeenNthCalledWith(2, 'stream:shell:stderr', { id, data: 'stderr line' });
      expect(send).toHaveBeenNthCalledWith(3, 'stream:shell:exit', { id, code: 0 });
      expect(send).toHaveBeenNthCalledWith(4, 'stream:shell:exit', { id, code: -1, error: 'spawn failed' });
    });

    it('rejects non-string args', async () => {
      const handler = getHandler('async:shell:exec');
      await expect(handler({}, 'make', [42])).rejects.toThrow('Expected string');
    });

    it('validates cwd within project root', async () => {
      const root = path.resolve('/safe/project');
      setShellProjectRoot(root);
      const handler = getHandler('async:shell:exec');
      await expect(
        handler({}, 'make', [], { cwd: '../../etc' }),
      ).rejects.toThrow('Path traversal denied');
    });

    it('enforces concurrency limit', async () => {
      mockSpawn.mockImplementation(() => makeFakeProcess());
      const handler = getHandler('async:shell:exec');

      for (let i = 0; i < 20; i++) {
        try {
          await handler({}, 'make', []);
        } catch (e: any) {
          expect(e.message).toContain('Too many concurrent processes');
          return;
        }
      }
      expect.unreachable('Should have thrown concurrency limit error');
    });
  });

  describe('SHELL_KILL', () => {
    it('rejects non-string id', async () => {
      const handler = getHandler('async:shell:kill');
      await expect(handler({}, 42)).rejects.toThrow('Expected string');
    });

    it('returns false for unknown id', async () => {
      const handler = getHandler('async:shell:kill');
      const result = await handler({}, 'nonexistent');
      expect(result).toBe(false);
    });

    it('kills a tracked process and removes it from the registry', async () => {
      const fakeProc = makeFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);
      const execHandler = getHandler('async:shell:exec');
      const killHandler = getHandler('async:shell:kill');

      const result = await execHandler({}, 'make', ['lint']);
      const id = (result as { id: string }).id;

      await expect(killHandler({}, id)).resolves.toBe(true);
      await expect(killHandler({}, id)).resolves.toBe(false);
      expect(fakeProc.kill).toHaveBeenCalledTimes(1);
    });
  });

  describe('SHELL_OPEN_EXTERNAL', () => {
    it('opens allowed external URLs', async () => {
      const handler = getHandler('async:shell:open-external');

      await expect(handler({}, 'https://example.com/docs')).resolves.toBe(true);

      expect(mockOpenExternal).toHaveBeenCalledWith('https://example.com/docs');
    });

    it('rejects unsupported protocols', async () => {
      const handler = getHandler('async:shell:open-external');

      await expect(handler({}, 'file:///C:/secret.txt')).rejects.toThrow('protocol not allowed');
      await expect(handler({}, 'javascript:alert(1)')).rejects.toThrow('protocol not allowed');
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });

    it('rejects invalid URL payloads', async () => {
      const handler = getHandler('async:shell:open-external');

      await expect(handler({}, 42)).rejects.toThrow('Expected string');
      await expect(handler({}, 'not a url')).rejects.toThrow('Invalid external URL');
    });
  });
});
