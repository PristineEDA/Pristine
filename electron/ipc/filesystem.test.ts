import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock electron / fs ─────────────────────────────────────────────────────

const { mockHandle, mockFs } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockFs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
    cp: vi.fn(),
    unlink: vi.fn(),
    rm: vi.fn(),
    rename: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
}));

vi.mock('node:fs/promises', () => ({ default: mockFs }));

import { registerFilesystemHandlers, setProjectRoot } from './filesystem.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((c) => c[0] === channel);
  if (!call) throw new Error(`No handler registered for ${channel}`);
  return call[1];
}

function createDirent(name: string, type: 'file' | 'directory') {
  return {
    name,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('filesystem IPC handlers', () => {
  beforeEach(() => {
    mockHandle.mockClear();
    mockFs.readFile.mockReset();
    mockFs.writeFile.mockReset();
    mockFs.mkdir.mockReset();
    mockFs.copyFile.mockReset();
    mockFs.cp.mockReset();
    mockFs.unlink.mockReset();
    mockFs.rm.mockReset();
    mockFs.rename.mockReset();
    mockFs.readdir.mockReset();
    mockFs.stat.mockReset();
    mockFs.access.mockReset();
    mockFs.readFile.mockResolvedValue('');
    setProjectRoot('/safe/project');
    registerFilesystemHandlers();
  });

  describe('FS_READ_FILE', () => {
    it('rejects invalid encoding', async () => {
      const handler = getHandler('async:fs:read-file');
      await expect(handler({}, 'file.v', 'evil-enc')).rejects.toThrow('Invalid encoding');
    });

    it('rejects non-string encoding', async () => {
      const handler = getHandler('async:fs:read-file');
      await expect(handler({}, 'file.v', 42)).rejects.toThrow('Expected string');
    });

    it('accepts valid utf-8 encoding', async () => {
      mockFs.readFile.mockResolvedValue('content');
      const handler = getHandler('async:fs:read-file');
      const result = await handler({}, 'src/main.v', 'utf-8');
      expect(result).toBe('content');
    });

    it('accepts undefined encoding (defaults to utf-8)', async () => {
      mockFs.readFile.mockResolvedValue('content');
      const handler = getHandler('async:fs:read-file');
      const result = await handler({}, 'src/main.v');
      expect(result).toBe('content');
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.any(String),
        { encoding: 'utf-8' },
      );
    });

    it('rejects path traversal', async () => {
      const handler = getHandler('async:fs:read-file');
      await expect(handler({}, '../../etc/passwd')).rejects.toThrow('Path traversal denied');
    });

    it('reads an absolute file path through the dedicated absolute channel', async () => {
      mockFs.readFile.mockResolvedValue('absolute-content');
      const handler = getHandler('async:fs:read-file-absolute');

      await expect(handler({}, '/safe/external/main.v', 'utf-8')).resolves.toBe('absolute-content');
    });
  });

  describe('FS_READ_FILE_BINARY', () => {
    it('reads a project-scoped file as bytes', async () => {
      const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      mockFs.readFile.mockResolvedValue(bytes);
      const handler = getHandler('async:fs:read-file-binary');

      const result = await handler({}, 'docs/spec.pdf');

      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result as Uint8Array)).toEqual([0x25, 0x50, 0x44, 0x46]);
      expect(mockFs.readFile).toHaveBeenCalledWith(expect.stringMatching(/safe[\\/]project[\\/]docs[\\/]spec\.pdf$/));
    });

    it('rejects path traversal', async () => {
      const handler = getHandler('async:fs:read-file-binary');
      await expect(handler({}, '../../outside.pdf')).rejects.toThrow('Path traversal denied');
    });

    it('rejects reads when no project root is open', async () => {
      setProjectRoot(null);
      const handler = getHandler('async:fs:read-file-binary');

      await expect(handler({}, 'docs/spec.pdf')).rejects.toThrow('Project root not set');
    });

    it('reads an absolute file path through the dedicated absolute binary channel', async () => {
      const bytes = Buffer.from([1, 2, 3]);
      mockFs.readFile.mockResolvedValue(bytes);
      const handler = getHandler('async:fs:read-file-binary-absolute');

      const result = await handler({}, '/safe/external/spec.pdf');

      expect(Array.from(result as Uint8Array)).toEqual([1, 2, 3]);
      expect(mockFs.readFile).toHaveBeenCalledWith(expect.stringMatching(/safe[\\/]external[\\/]spec\.pdf$/));
    });
  });

  describe('FS_WRITE_FILE', () => {
    it('rejects path traversal', async () => {
      const handler = getHandler('async:fs:write-file');
      await expect(handler({}, '../outside.txt', 'data')).rejects.toThrow('Path traversal denied');
    });

    it('rejects non-string content', async () => {
      const handler = getHandler('async:fs:write-file');
      await expect(handler({}, 'file.v', 42)).rejects.toThrow('Expected string');
    });

    it('writes an absolute file path through the dedicated absolute channel', async () => {
      const handler = getHandler('async:fs:write-file-absolute');

      await expect(handler({}, '/safe/external/out.v', 'module out; endmodule')).resolves.toBeUndefined();
      expect(mockFs.writeFile).toHaveBeenCalledWith(expect.any(String), 'module out; endmodule', 'utf-8');
    });
  });

  describe('FS_CREATE_DIRECTORY', () => {
    it('creates a project-scoped directory', async () => {
      const handler = getHandler('async:fs:create-directory');

      await expect(handler({}, 'rtl/generated')).resolves.toBeUndefined();
      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]generated$/), { recursive: true });
    });
  });

  describe('FS_COPY_FILE', () => {
    it('copies a project-scoped file into a new project-scoped path', async () => {
      const handler = getHandler('async:fs:copy-file');

      await expect(handler({}, 'rtl/core/reg_file.v', 'rtl/core/reg_file-copy.v')).resolves.toBeUndefined();
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]core[\\/]reg_file\.v$/),
        expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]core[\\/]reg_file-copy\.v$/),
      );
    });
  });

  describe('FS_COPY_DIRECTORY', () => {
    it('copies a project-scoped directory recursively into a new project-scoped path', async () => {
      const handler = getHandler('async:fs:copy-directory');

      await expect(handler({}, 'rtl/core', 'rtl/core-copy')).resolves.toBeUndefined();
      expect(mockFs.cp).toHaveBeenCalledWith(
        expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]core$/),
        expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]core-copy$/),
        {
          recursive: true,
          errorOnExist: true,
          force: false,
        },
      );
    });
  });

  describe('FS_RENAME', () => {
    it('renames a project-scoped file or folder', async () => {
      const handler = getHandler('async:fs:rename');

      await expect(handler({}, 'rtl/core/old.v', 'rtl/core/new.v')).resolves.toBeUndefined();
      expect(mockFs.rename).toHaveBeenCalledWith(
        expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]core[\\/]old\.v$/),
        expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]core[\\/]new\.v$/),
      );
    });
  });

  describe('FS_DELETE_FILE', () => {
    it('deletes a project-scoped file', async () => {
      const handler = getHandler('async:fs:delete-file');

      await expect(handler({}, 'rtl/core/reg_file.v')).resolves.toBeUndefined();
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]core[\\/]reg_file\.v$/),
      );
    });
  });

  describe('FS_DELETE_DIRECTORY', () => {
    it('deletes a project-scoped directory recursively', async () => {
      const handler = getHandler('async:fs:delete-directory');

      await expect(handler({}, 'rtl/core')).resolves.toBeUndefined();
      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringMatching(/safe[\\/]project[\\/]rtl[\\/]core$/),
        { recursive: true, force: false },
      );
    });
  });

  describe('FS_EXISTS', () => {
    it('returns true for existing file', async () => {
      mockFs.access.mockResolvedValue(undefined);
      const handler = getHandler('async:fs:exists');
      expect(await handler({}, 'src/main.v')).toBe(true);
    });

    it('returns false for missing file', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));
      const handler = getHandler('async:fs:exists');
      expect(await handler({}, 'missing.v')).toBe(false);
    });
  });

  describe('FS_LIST_FILES', () => {
    it('returns recursively discovered workspace files including dotfiles', async () => {
      mockFs.readdir.mockImplementation(async (resolvedPath: string) => {
        const normalized = resolvedPath.replace(/\\/g, '/');

        if (normalized.endsWith('/safe/project')) {
          return [
            createDirent('README.md', 'file'),
            createDirent('.gitignore', 'file'),
            createDirent('rtl', 'directory'),
          ];
        }

        if (normalized.endsWith('/safe/project/rtl')) {
          return [
            createDirent('core', 'directory'),
            createDirent('top.sv', 'file'),
          ];
        }

        if (normalized.endsWith('/safe/project/rtl/core')) {
          return [
            createDirent('alu.v', 'file'),
          ];
        }

        return [];
      });

      const handler = getHandler('async:fs:list-files');
      await expect(handler({}, '.')).resolves.toEqual([
        '.gitignore',
        'README.md',
        'rtl/core/alu.v',
        'rtl/top.sv',
      ]);
    });

    it('skips .git contents and applies root and nested .gitignore rules', async () => {
      mockFs.readdir.mockImplementation(async (resolvedPath: string) => {
        const normalized = resolvedPath.replace(/\\/g, '/');

        if (normalized.endsWith('/safe/project')) {
          return [
            createDirent('.git', 'directory'),
            createDirent('.gitignore', 'file'),
            createDirent('README.md', 'file'),
            createDirent('ignored', 'directory'),
            createDirent('notes.tmp', 'file'),
            createDirent('rtl', 'directory'),
          ];
        }

        if (normalized.endsWith('/safe/project/ignored')) {
          return [createDirent('secret.txt', 'file')];
        }

        if (normalized.endsWith('/safe/project/rtl')) {
          return [
            createDirent('.gitignore', 'file'),
            createDirent('debug.tmp', 'file'),
            createDirent('keep.tmp', 'file'),
            createDirent('core', 'directory'),
          ];
        }

        if (normalized.endsWith('/safe/project/rtl/core')) {
          return [createDirent('alu.v', 'file')];
        }

        if (normalized.endsWith('/safe/project/.git')) {
          return [createDirent('config', 'file')];
        }

        return [];
      });

      mockFs.readFile.mockImplementation(async (resolvedPath: string) => {
        const normalized = resolvedPath.replace(/\\/g, '/');

        if (normalized.endsWith('/safe/project/.gitignore')) {
          return 'ignored/\nnotes.tmp\n';
        }

        if (normalized.endsWith('/safe/project/rtl/.gitignore')) {
          return '*.tmp\n!keep.tmp\n';
        }

        throw new Error(`Unexpected read: ${resolvedPath}`);
      });

      const handler = getHandler('async:fs:list-files');
      await expect(handler({}, '.')).resolves.toEqual([
        '.gitignore',
        'README.md',
        'rtl/.gitignore',
        'rtl/core/alu.v',
        'rtl/keep.tmp',
      ]);
    });

    it('rejects path traversal for recursive file listing', async () => {
      const handler = getHandler('async:fs:list-files');
      await expect(handler({}, '../outside')).rejects.toThrow('Path traversal denied');
    });
  });
});
