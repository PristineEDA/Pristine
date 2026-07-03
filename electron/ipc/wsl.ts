import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { AsyncChannels } from './channels.js';
import {
  PRISTINE_WSL_DISTRO_NAME,
  parseWslUbuntuDistro,
  type WslEnvironmentState,
  type WslEnvironmentStatus,
  type WslStartInput,
  type WslStartResult,
  type WslStopResult,
} from '../../types/wsl.js';

const CHECK_TIMEOUT_MS = 15_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const STOP_TIMEOUT_MS = 20_000;

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface WslListEntry {
  name: string;
  state: WslEnvironmentState;
}

function emptyStatus(): WslEnvironmentStatus {
  return {
    distroName: PRISTINE_WSL_DISTRO_NAME,
    installed: false,
    state: 'not-installed',
  };
}

function createStatus(state: WslEnvironmentState, installed = true): WslEnvironmentStatus {
  return {
    distroName: PRISTINE_WSL_DISTRO_NAME,
    installed,
    state,
  };
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

function isE2eWslMockEnabled(): boolean {
  return process.env['PRISTINE_E2E_MOCK_WSL'] === '1';
}

function shouldMockWslStartFail(): boolean {
  return process.env['PRISTINE_E2E_MOCK_WSL_START_ERROR'] === '1';
}

function normalizeWslState(value: string | undefined): WslEnvironmentState {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'running') {
    return 'running';
  }

  if (normalized === 'stopped') {
    return 'stopped';
  }

  if (normalized === 'suspended') {
    return 'suspended';
  }

  return 'unknown';
}

function cleanWslOutput(value: string): string {
  return value
    .replace(/\uFEFF/g, '')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function decodeWslOutput(output: Buffer | string): string {
  if (typeof output === 'string') {
    return cleanWslOutput(output);
  }

  if (output.length === 0) {
    return '';
  }

  const hasUtf16LeBom = output.length >= 2 && output[0] === 0xff && output[1] === 0xfe;
  const sample = output.subarray(0, Math.min(output.length, 96));
  const nulCount = sample.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
  const likelyUtf16Le = hasUtf16LeBom || nulCount > sample.length / 4;

  return cleanWslOutput(output.toString(likelyUtf16Le ? 'utf16le' : 'utf8'));
}

function stripWslTableMarker(value: string): string {
  return value.replace(/^\*\s*/, '').trim();
}

export function parseWslListVerbose(output: string): WslListEntry[] {
  return cleanWslOutput(output)
    .split(/\r?\n/)
    .map((line) => stripWslTableMarker(cleanWslOutput(line).trim()))
    .filter((line) => line.length > 0 && !/^name\s+state\s+version$/i.test(stripWslTableMarker(line)))
    .map((line) => {
      const parts = line.split(/\s+/);
      const name = parts[0] ?? '';
      const state = normalizeWslState(parts[1]);
      return { name, state };
    })
    .filter((entry) => entry.name.length > 0);
}

function normalizeWslDistroName(value: string): string {
  return cleanWslOutput(value).trim().toLowerCase();
}

function findPristineDistro(output: string): WslListEntry | null {
  const pristineDistroName = normalizeWslDistroName(PRISTINE_WSL_DISTRO_NAME);
  return parseWslListVerbose(output)
    .find((entry) => normalizeWslDistroName(entry.name) === pristineDistroName) ?? null;
}

function commandErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function runWslCommand(args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile('wsl.exe', args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'buffer',
    }, (error, stdout, stderr) => {
      const decodedStdout = decodeWslOutput(stdout);
      const decodedStderr = decodeWslOutput(stderr);

      if (error) {
        reject(new Error(`${error.message}${decodedStderr ? `\n${decodedStderr}` : ''}`.trim()));
        return;
      }

      resolve({ stdout: decodedStdout, stderr: decodedStderr });
    });
  });
}

async function recoverInstalledStatusAfterInstallFailure(): Promise<WslEnvironmentStatus | null> {
  try {
    const status = await getRealWslStatus();
    return status.installed ? status : null;
  } catch {
    return null;
  }
}

async function getRealWslStatus(): Promise<WslEnvironmentStatus> {
  if (!isWindows()) {
    return emptyStatus();
  }

  await runWslCommand(['--status'], CHECK_TIMEOUT_MS);
  const listResult = await runWslCommand(['--list', '--verbose'], CHECK_TIMEOUT_MS);
  const distro = findPristineDistro(listResult.stdout);

  if (!distro) {
    return emptyStatus();
  }

  return createStatus(distro.state);
}

export async function getPristineEdaEnvironmentStatus(): Promise<WslEnvironmentStatus> {
  if (isE2eWslMockEnabled()) {
    return createStatus('stopped');
  }

  try {
    return await getRealWslStatus();
  } catch {
    return emptyStatus();
  }
}

export async function startPristineEdaEnvironment(input: WslStartInput): Promise<WslStartResult> {
  const ubuntuDistro = parseWslUbuntuDistro(input.ubuntuDistro);

  if (!isWindows() && !isE2eWslMockEnabled()) {
    const status = emptyStatus();
    return {
      ok: false,
      distroName: PRISTINE_WSL_DISTRO_NAME,
      installed: false,
      status,
      error: 'Pristine WSL development environment is only supported on Windows.',
    };
  }

  if (isE2eWslMockEnabled()) {
    const status = createStatus(shouldMockWslStartFail() ? 'stopped' : 'running');
    return {
      ok: !shouldMockWslStartFail(),
      distroName: PRISTINE_WSL_DISTRO_NAME,
      installed: true,
      status,
      error: shouldMockWslStartFail() ? 'Mock WSL start failure.' : undefined,
    };
  }

  try {
    await runWslCommand(['--status'], CHECK_TIMEOUT_MS);
    let status = await getRealWslStatus();
    let installed = status.installed;

    if (!status.installed) {
      try {
        await runWslCommand([
          '--install',
          '-d',
          ubuntuDistro,
          '--name',
          PRISTINE_WSL_DISTRO_NAME,
          '--version',
          '2',
          '--no-launch',
        ], INSTALL_TIMEOUT_MS);
      } catch (installError) {
        const recoveredStatus = await recoverInstalledStatusAfterInstallFailure();
        if (recoveredStatus) {
          return {
            ok: true,
            distroName: PRISTINE_WSL_DISTRO_NAME,
            installed: true,
            status: recoveredStatus,
          };
        }

        throw installError;
      }
      installed = true;
    }

    status = await getRealWslStatus();
    if (!status.installed) {
      status = createStatus('stopped', installed);
    }

    return {
      ok: true,
      distroName: PRISTINE_WSL_DISTRO_NAME,
      installed,
      status,
    };
  } catch (error) {
    const status = await getPristineEdaEnvironmentStatus();
    return {
      ok: false,
      distroName: PRISTINE_WSL_DISTRO_NAME,
      installed: status.installed,
      status,
      error: commandErrorMessage(error, 'Failed to start Pristine WSL development environment.'),
    };
  }
}

export async function stopPristineEdaEnvironment(): Promise<WslStopResult> {
  if (!isWindows() && !isE2eWslMockEnabled()) {
    const status = emptyStatus();
    return {
      ok: false,
      distroName: PRISTINE_WSL_DISTRO_NAME,
      status,
      error: 'Pristine WSL development environment is only supported on Windows.',
    };
  }

  if (isE2eWslMockEnabled()) {
    return {
      ok: true,
      distroName: PRISTINE_WSL_DISTRO_NAME,
      status: createStatus('stopped'),
    };
  }

  try {
    await runWslCommand(['--terminate', PRISTINE_WSL_DISTRO_NAME], STOP_TIMEOUT_MS);
    return {
      ok: true,
      distroName: PRISTINE_WSL_DISTRO_NAME,
      status: createStatus('stopped'),
    };
  } catch (error) {
    const status = await getPristineEdaEnvironmentStatus();
    return {
      ok: false,
      distroName: PRISTINE_WSL_DISTRO_NAME,
      status,
      error: commandErrorMessage(error, 'Failed to stop Pristine WSL development environment.'),
    };
  }
}

function normalizeStartInput(value: unknown): WslStartInput {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ubuntuDistro: parseWslUbuntuDistro(input['ubuntuDistro']),
  };
}

export function registerWslHandlers(): void {
  ipcMain.handle(AsyncChannels.WSL_GET_PRISTINE_EDA_ENVIRONMENT_STATUS, async () =>
    getPristineEdaEnvironmentStatus());

  ipcMain.handle(AsyncChannels.WSL_START_PRISTINE_EDA_ENVIRONMENT, async (_event, input: unknown) =>
    startPristineEdaEnvironment(normalizeStartInput(input)));

  ipcMain.handle(AsyncChannels.WSL_STOP_PRISTINE_EDA_ENVIRONMENT, async () =>
    stopPristineEdaEnvironment());
}
