import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHandle = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
}));

const mockReadDir = vi.fn();
const mockReadFile = vi.fn();
const mockStat = vi.fn();
vi.mock('node:fs/promises', () => ({
  default: {
    readdir: (...args: unknown[]) => mockReadDir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    stat: (...args: unknown[]) => mockStat(...args),
  },
}));

const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import { registerGitHandlers, setGitProjectRoot } from './git.js';

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((currentCall) => currentCall[0] === channel);
  if (!call) {
    throw new Error(`No handler registered for ${channel}`);
  }

  return call[1];
}

function createDirent(name: string, type: 'directory' | 'file' = 'directory') {
  return {
    name,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
  };
}

describe('git IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStat.mockRejectedValue(new Error('ENOENT'));
    setGitProjectRoot('C:/workspace/project-root');
    registerGitHandlers();
  });

  it('returns the default fallback when the project has no visible files', async () => {
    mockReadDir.mockResolvedValue([createDirent('.git')]);

    const handler = getHandler('async:git:get-status');
    await expect(handler({})).resolves.toEqual({
      branchName: null,
      hasProjectFiles: false,
      isGitRepo: false,
      pathStates: {},
    });

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('falls back to a non-git snapshot when git status fails', async () => {
    mockReadDir.mockResolvedValue([createDirent('rtl')]);
    mockExecFile.mockImplementation((
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(new Error('fatal: not a git repository'), '', 'fatal: not a git repository');
    });

    const handler = getHandler('async:git:get-status');
    await expect(handler({})).resolves.toEqual({
      branchName: null,
      hasProjectFiles: true,
      isGitRepo: false,
      pathStates: {},
    });
  });

  it('parses branch, created files, modified files, deleted files, and ignored paths from git status', async () => {
    mockReadDir.mockResolvedValue([createDirent('rtl'), createDirent('build')]);
    mockExecFile.mockImplementation((
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, [
        '## feature/git-ui...origin/feature/git-ui',
        ' M rtl/core/cpu_top.sv',
        'A  rtl/core/alu.v',
        ' D rtl/core/legacy.v',
        'R  rtl/core/old_name.v -> rtl/core/new_name.v',
        '!! build/',
        '!! logs/sim.log',
        '?? scratch/tmp.v',
      ].join('\n'), '');
    });

    const handler = getHandler('async:git:get-status');
    await expect(handler({})).resolves.toEqual({
      branchName: 'feature/git-ui',
      hasProjectFiles: true,
      isGitRepo: true,
      pathStates: {
        'rtl/core/alu.v': 'created',
        'rtl/core/cpu_top.sv': 'modified',
        'rtl/core/legacy.v': 'deleted',
        'rtl/core/new_name.v': 'modified',
        build: 'ignored',
        'logs/sim.log': 'ignored',
        'scratch/tmp.v': 'created',
      },
    });

    expect(mockExecFile).toHaveBeenCalledWith(
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
      expect.objectContaining({
        cwd: expect.stringMatching(/project-root$/),
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      }),
      expect.any(Function),
    );
  });

  it('merges first-level child git repository path states under the child directory prefix', async () => {
    mockReadDir.mockImplementation((targetPath: string) => {
      if (targetPath.endsWith('project-root')) {
        return Promise.resolve([createDirent('rtl'), createDirent('ip')]);
      }

      return Promise.resolve([]);
    });
    mockStat.mockImplementation((targetPath: string) => {
      if (targetPath.replace(/\\/g, '/').endsWith('/ip/.git')) {
        return Promise.resolve({
          isDirectory: () => true,
          isFile: () => false,
        });
      }

      return Promise.reject(new Error('ENOENT'));
    });
    mockExecFile.mockImplementation((
      _command: string,
      _args: string[],
      options: { cwd: string },
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (options.cwd.replace(/\\/g, '/').endsWith('/ip')) {
        callback(null, [
          '## child-main',
          ' M src/child_core.sv',
          '?? generated/new_child.sv',
        ].join('\n'), '');
        return;
      }

      callback(null, [
        '## root-main',
        ' M rtl/root_core.sv',
      ].join('\n'), '');
    });

    const handler = getHandler('async:git:get-status');
    await expect(handler({})).resolves.toEqual({
      branchName: 'root-main',
      hasProjectFiles: true,
      isGitRepo: true,
      pathStates: {
        'ip/generated/new_child.sv': 'created',
        'ip/src/child_core.sv': 'modified',
        'rtl/root_core.sv': 'modified',
      },
    });
  });

  it('keeps child git repository states when the workspace root is not a git repository', async () => {
    mockReadDir.mockImplementation((targetPath: string) => {
      if (targetPath.endsWith('project-root')) {
        return Promise.resolve([createDirent('ip')]);
      }

      return Promise.resolve([]);
    });
    mockStat.mockImplementation((targetPath: string) => {
      if (targetPath.replace(/\\/g, '/').endsWith('/ip/.git')) {
        return Promise.resolve({
          isDirectory: () => false,
          isFile: () => true,
        });
      }

      return Promise.reject(new Error('ENOENT'));
    });
    mockExecFile.mockImplementation((
      _command: string,
      _args: string[],
      options: { cwd: string },
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (options.cwd.replace(/\\/g, '/').endsWith('/ip')) {
        callback(null, '## child-main\n M src/child_core.sv\n', '');
        return;
      }

      callback(new Error('fatal: not a git repository'), '', 'fatal: not a git repository');
    });

    const handler = getHandler('async:git:get-status');
    await expect(handler({})).resolves.toEqual({
      branchName: null,
      hasProjectFiles: true,
      isGitRepo: false,
      pathStates: {
        'ip/src/child_core.sv': 'modified',
      },
    });
  });

  it('ignores child git repositories that cannot be read', async () => {
    mockReadDir.mockImplementation((targetPath: string) => {
      if (targetPath.endsWith('project-root')) {
        return Promise.resolve([createDirent('broken-ip'), createDirent('rtl')]);
      }

      return Promise.resolve([]);
    });
    mockStat.mockImplementation((targetPath: string) => {
      if (targetPath.replace(/\\/g, '/').endsWith('/broken-ip/.git')) {
        return Promise.resolve({
          isDirectory: () => true,
          isFile: () => false,
        });
      }

      return Promise.reject(new Error('ENOENT'));
    });
    mockExecFile.mockImplementation((
      _command: string,
      _args: string[],
      options: { cwd: string },
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (options.cwd.replace(/\\/g, '/').endsWith('/broken-ip')) {
        callback(new Error('fatal: child repository is broken'), '', 'fatal');
        return;
      }

      callback(null, '## root-main\n M rtl/root_core.sv\n', '');
    });

    const handler = getHandler('async:git:get-status');
    await expect(handler({})).resolves.toEqual({
      branchName: 'root-main',
      hasProjectFiles: true,
      isGitRepo: true,
      pathStates: {
        'rtl/root_core.sv': 'modified',
      },
    });
  });

  it('extracts the branch name for unborn branches', async () => {
    mockReadDir.mockResolvedValue([createDirent('rtl')]);
    mockExecFile.mockImplementation((
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, '## No commits yet on main\n', '');
    });

    const handler = getHandler('async:git:get-status');
    await expect(handler({})).resolves.toEqual({
      branchName: 'main',
      hasProjectFiles: true,
      isGitRepo: true,
      pathStates: {},
    });
  });

  it('returns HEAD and current file content for a workspace git diff', async () => {
    mockReadFile.mockResolvedValue('module reg_file;\n// working tree\nendmodule\n');
    mockExecFile.mockImplementation((
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, 'module reg_file;\nendmodule\n', '');
    });

    const handler = getHandler('async:git:get-file-diff');
    await expect(handler({}, 'rtl/core/reg_file.v')).resolves.toEqual({
      filePath: 'rtl/core/reg_file.v',
      originalContent: 'module reg_file;\nendmodule\n',
      currentContent: 'module reg_file;\n// working tree\nendmodule\n',
    });

    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['--no-optional-locks', 'show', 'HEAD:rtl/core/reg_file.v'],
      expect.objectContaining({
        cwd: expect.stringMatching(/project-root$/),
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      }),
      expect.any(Function),
    );
    expect(mockReadFile).toHaveBeenCalledWith(expect.stringMatching(/project-root[\\/]rtl[\\/]core[\\/]reg_file\.v$/), 'utf8');
  });

  it('rejects git diff paths outside the project root', async () => {
    const handler = getHandler('async:git:get-file-diff');

    await expect(handler({}, '../secrets.txt')).rejects.toThrow('Path traversal denied');
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('rejects git diff requests when HEAD content cannot be read', async () => {
    mockReadFile.mockResolvedValue('current content');
    mockExecFile.mockImplementation((
      _command: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(new Error('fatal: path does not exist in HEAD'), '', 'fatal: path does not exist in HEAD');
    });

    const handler = getHandler('async:git:get-file-diff');
    await expect(handler({}, 'rtl/core/reg_file.v')).rejects.toThrow('fatal: path does not exist in HEAD');
  });
});
