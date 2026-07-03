import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';

const originalPlatform = process.platform;
const originalMockWsl = process.env.PRISTINE_E2E_MOCK_WSL;
const originalMockWslStartError = process.env.PRISTINE_E2E_MOCK_WSL_START_ERROR;
const mockHandle = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import {
  decodeWslOutput,
  getPristineEdaEnvironmentStatus,
  parseWslListVerbose,
  registerWslHandlers,
  startPristineEdaEnvironment,
  stopPristineEdaEnvironment,
} from './wsl.js';

const mockExecFile = vi.mocked(execFile);

function setProcessPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

function createUtf16LeBuffer(value: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(value, 'utf16le')]);
}

function mockWslCommandOnce({
  stdout = '',
  stderr = '',
  error = null,
}: {
  stdout?: Buffer | string;
  stderr?: Buffer | string;
  error?: Error | null;
} = {}): void {
  mockExecFile.mockImplementationOnce(((
    _command: string,
    _args: readonly string[],
    _options: unknown,
    callback: (error: Error | null, stdout: Buffer, stderr: Buffer) => void,
  ) => {
    callback(
      error,
      Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout),
      Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr),
    );
    return undefined;
  }) as unknown as typeof execFile);
}

describe('WSL IPC service', () => {
  afterEach(() => {
    setProcessPlatform(originalPlatform);
    if (originalMockWsl === undefined) {
      delete process.env.PRISTINE_E2E_MOCK_WSL;
    } else {
      process.env.PRISTINE_E2E_MOCK_WSL = originalMockWsl;
    }
    if (originalMockWslStartError === undefined) {
      delete process.env.PRISTINE_E2E_MOCK_WSL_START_ERROR;
    } else {
      process.env.PRISTINE_E2E_MOCK_WSL_START_ERROR = originalMockWslStartError;
    }
    mockHandle.mockClear();
    mockExecFile.mockReset();
  });

  it('parses verbose WSL list output', () => {
    expect(parseWslListVerbose(`
      NAME                   STATE           VERSION
    * Ubuntu-22.04           Running         2
      pristine-eda-env       Stopped         2
    `)).toEqual([
      { name: 'Ubuntu-22.04', state: 'running' },
      { name: 'pristine-eda-env', state: 'stopped' },
    ]);
  });

  it('decodes UTF-16LE, BOM, and NUL verbose WSL output', () => {
    const output = createUtf16LeBuffer(`\u0000NAME                   STATE           VERSION\r\n* Ubuntu-22.04           Running         2\r\n  pristine-eda-env       Stopped         2\r\n`);

    expect(decodeWslOutput(output)).toContain('pristine-eda-env');
    expect(parseWslListVerbose(decodeWslOutput(output))).toEqual([
      { name: 'Ubuntu-22.04', state: 'running' },
      { name: 'pristine-eda-env', state: 'stopped' },
    ]);
  });

  it('does not install when the pristine distro already exists in WSL list output', async () => {
    setProcessPlatform('win32');
    delete process.env.PRISTINE_E2E_MOCK_WSL;
    mockWslCommandOnce();
    mockWslCommandOnce();
    mockWslCommandOnce({
      stdout: createUtf16LeBuffer(`
        NAME                   STATE           VERSION
      * Ubuntu-22.04           Running         2
        PRISTINE-EDA-ENV       Suspended       2
      `),
    });
    mockWslCommandOnce();
    mockWslCommandOnce({
      stdout: createUtf16LeBuffer(`
        NAME                   STATE           VERSION
        pristine-eda-env       Running         2
      `),
    });

    await expect(startPristineEdaEnvironment({ ubuntuDistro: 'Ubuntu-22.04' })).resolves.toMatchObject({
      ok: true,
      installed: true,
      status: { state: 'running' },
    });

    expect(mockExecFile.mock.calls.some((call) => {
      const args = call[1] as string[] | undefined;
      return args?.includes('--install') ?? false;
    })).toBe(false);
  });

  it('recovers when install fails but the pristine distro is found on a follow-up list', async () => {
    setProcessPlatform('win32');
    delete process.env.PRISTINE_E2E_MOCK_WSL;
    mockWslCommandOnce();
    mockWslCommandOnce();
    mockWslCommandOnce({
      stdout: `
        NAME                   STATE           VERSION
      * Ubuntu-22.04           Running         2
      `,
    });
    mockWslCommandOnce({
      error: new Error('Command failed: wsl.exe --install -d Ubuntu-22.04 --name pristine-eda-env'),
      stderr: 'A distribution with the supplied name already exists.',
    });
    mockWslCommandOnce();
    mockWslCommandOnce({
      stdout: createUtf16LeBuffer(`
        NAME                   STATE           VERSION
        pristine-eda-env       Stopped         2
      `),
    });

    const result = await startPristineEdaEnvironment({ ubuntuDistro: 'Ubuntu-22.04' });

    expect(result).toMatchObject({
      ok: true,
      installed: true,
      status: { state: 'stopped' },
    });
    expect(result).not.toHaveProperty('error');
  });

  it('uses E2E mock results without invoking local WSL', async () => {
    process.env.PRISTINE_E2E_MOCK_WSL = '1';
    delete process.env.PRISTINE_E2E_MOCK_WSL_START_ERROR;

    await expect(startPristineEdaEnvironment({ ubuntuDistro: 'Ubuntu-24.04' })).resolves.toMatchObject({
      ok: true,
      distroName: 'pristine-eda-env',
      installed: true,
      status: { state: 'running' },
    });
    await expect(stopPristineEdaEnvironment()).resolves.toMatchObject({
      ok: true,
      status: { state: 'stopped' },
    });
    await expect(getPristineEdaEnvironmentStatus()).resolves.toMatchObject({
      installed: true,
      state: 'stopped',
    });
  });

  it('returns a mock start failure for E2E failure mode', async () => {
    process.env.PRISTINE_E2E_MOCK_WSL = '1';
    process.env.PRISTINE_E2E_MOCK_WSL_START_ERROR = '1';

    await expect(startPristineEdaEnvironment({ ubuntuDistro: 'Ubuntu-22.04' })).resolves.toMatchObject({
      ok: false,
      error: 'Mock WSL start failure.',
    });
  });

  it('rejects non-Windows platforms outside E2E mock mode', async () => {
    setProcessPlatform('linux');
    delete process.env.PRISTINE_E2E_MOCK_WSL;

    await expect(startPristineEdaEnvironment({ ubuntuDistro: 'Ubuntu-22.04' })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('only supported on Windows'),
    });
  });

  it('registers WSL IPC handlers', () => {
    registerWslHandlers();

    expect(mockHandle).toHaveBeenCalledWith('async:wsl:get-pristine-eda-environment-status', expect.any(Function));
    expect(mockHandle).toHaveBeenCalledWith('async:wsl:start-pristine-eda-environment', expect.any(Function));
    expect(mockHandle).toHaveBeenCalledWith('async:wsl:stop-pristine-eda-environment', expect.any(Function));
  });
});
