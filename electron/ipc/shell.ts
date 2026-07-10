import { ipcMain, BrowserWindow, shell as electronShell } from 'electron';
import * as childProcess from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { AsyncChannels, StreamChannels } from './channels.js';
import { assertString, validatePathWithinRoot } from './validators.js';

// ─── Security: command allowlist ──────────────────────────────────────────────
const ALLOWED_COMMANDS = new Set([
  'verilator', 'iverilog', 'vvp',
  'python', 'python3',
  'make', 'cmake',
  'cocotb-config',
  'git',
  'bash', 'sh',
]);

const MAX_PROCESSES = 10;

const processes = new Map<string, ChildProcess>();
let nextId = 1;
let projectRoot: string | null = null;

function validateExternalUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid external URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') {
    throw new Error(`External URL protocol not allowed: ${url.protocol}`);
  }

  return url.toString();
}

export function setShellProjectRoot(root: string | null): void {
  projectRoot = root;
}

export function registerShellHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    AsyncChannels.SHELL_EXEC,
    async (_event, command: unknown, args?: unknown, options?: unknown) => {
      assertString(command, 'command');

      // Security: only allow known commands
      const baseName = command.replace(/\\/g, '/').split('/').pop() ?? command;
      if (!ALLOWED_COMMANDS.has(baseName)) {
        throw new Error(`Command not allowed: ${command}. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}`);
      }

      // Security: validate each arg is a string
      const argList: string[] = [];
      if (Array.isArray(args)) {
        for (let i = 0; i < args.length; i++) {
          assertString(args[i], `args[${i}]`);
          argList.push(args[i] as string);
        }
      }

      const opts = (options && typeof options === 'object') ? options as Record<string, unknown> : {};
      let cwd = typeof opts['cwd'] === 'string' ? opts['cwd'] : undefined;

      // Security: validate cwd within project root
      if (cwd && projectRoot) {
        cwd = validatePathWithinRoot(projectRoot, cwd);
      }

      // Security: enforce concurrency limit
      if (processes.size >= MAX_PROCESSES) {
        throw new Error(`Too many concurrent processes (max ${MAX_PROCESSES}). Kill an existing process first.`);
      }

      const id = String(nextId++);
      const child = childProcess.spawn(command, argList, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }) as ChildProcess;
      processes.set(id, child);

      const win = getMainWindow();

      child.stdout?.on('data', (data: Buffer) => {
        win?.webContents.send(StreamChannels.SHELL_STDOUT, { id, data: data.toString() });
      });

      child.stderr?.on('data', (data: Buffer) => {
        win?.webContents.send(StreamChannels.SHELL_STDERR, { id, data: data.toString() });
      });

      child.on('close', (code) => {
        processes.delete(id);
        win?.webContents.send(StreamChannels.SHELL_EXIT, { id, code });
      });

      child.on('error', (err) => {
        processes.delete(id);
        win?.webContents.send(StreamChannels.SHELL_EXIT, { id, code: -1, error: err.message });
      });

      return { id, pid: child.pid };
    },
  );

  ipcMain.handle(AsyncChannels.SHELL_KILL, async (_event, id: unknown) => {
    assertString(id, 'id');
    const child = processes.get(id);
    if (child) {
      child.kill();
      processes.delete(id);
      return true;
    }
    return false;
  });

  ipcMain.handle(AsyncChannels.SHELL_OPEN_EXTERNAL, async (_event, url: unknown) => {
    assertString(url, 'url');
    await electronShell.openExternal(validateExternalUrl(url));
    return true;
  });
}
