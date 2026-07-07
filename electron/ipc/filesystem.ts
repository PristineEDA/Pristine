import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
import { AsyncChannels } from './channels.js';
import {
  validateAbsolutePath,
  validatePathWithinRoot,
  assertString,
  assertValidEncoding,
} from './validators.js';

let projectRoot: string | null = null;

export function setProjectRoot(root: string | null): void {
  projectRoot = root ? path.resolve(root) : null;
}

function getRoot(): string {
  if (!projectRoot) {
    throw new Error('Project root not set');
  }
  return projectRoot;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

function prefixGitIgnorePattern(pattern: string, dirPath: string): string[] {
  const line = pattern.replace(/\r$/, '');

  if (line.trim().length === 0 || line.startsWith('#')) {
    return [];
  }

  const isNegated = line.startsWith('!') && !line.startsWith('\\!');
  const rawBody = isNegated ? line.slice(1) : line;
  const body = rawBody.startsWith('\\#') ? rawBody.slice(1) : rawBody;
  const normalizedDirPath = normalizeRelativePath(dirPath);
  const basePrefix = normalizedDirPath === '.' || normalizedDirPath.length === 0 ? '' : `${normalizedDirPath}/`;
  const isAnchored = body.startsWith('/');
  const normalizedBody = body.replace(/^\//, '');
  const bodyWithoutDirectoryMarker = normalizedBody.endsWith('/')
    ? normalizedBody.slice(0, -1)
    : normalizedBody;
  const hasSlash = bodyWithoutDirectoryMarker.includes('/');
  const variants = isAnchored || hasSlash
    ? [`${basePrefix}${normalizedBody}`]
    : [`${basePrefix}${normalizedBody}`, `${basePrefix}**/${normalizedBody}`];

  return variants.map((variant) => (isNegated ? `!${variant}` : variant));
}

async function readGitIgnorePatterns(dirPath: string, entryNames: Set<string>): Promise<string[]> {
  if (!entryNames.has('.gitignore')) {
    return [];
  }

  const gitIgnorePath = dirPath === '.' ? '.gitignore' : `${dirPath}/.gitignore`;
  const resolved = validatePathWithinRoot(getRoot(), gitIgnorePath);
  const contents = await fs.readFile(resolved, { encoding: 'utf-8' });

  return contents
    .split(/\n/g)
    .flatMap((line) => prefixGitIgnorePattern(line, dirPath));
}

async function listFilesRecursive(dirPath: string, inheritedIgnorePatterns: string[] = []): Promise<string[]> {
  const resolved = validatePathWithinRoot(getRoot(), dirPath);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const entryNames = new Set(entries.map((entry) => entry.name));
  const localIgnorePatterns = await readGitIgnorePatterns(dirPath, entryNames);
  const ignorePatterns = [...inheritedIgnorePatterns, ...localIgnorePatterns];
  const matcher = ignore().add(ignorePatterns);
  const results: string[] = [];

  for (const entry of entries) {
    const childPath = dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`;
    const normalizedChildPath = normalizeRelativePath(childPath);

    if (entry.isDirectory() && entry.name === '.git') {
      continue;
    }

    if (matcher.ignores(entry.isDirectory() ? `${normalizedChildPath}/` : normalizedChildPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(childPath, ignorePatterns));
      continue;
    }

    if (entry.isFile()) {
      results.push(normalizedChildPath);
    }
  }

  return results;
}

export function registerFilesystemHandlers(): void {
  ipcMain.handle(AsyncChannels.FS_READ_FILE, async (_event, filePath: unknown, encoding?: unknown) => {
    assertString(filePath, 'filePath');
    assertValidEncoding(encoding, 'encoding');
    const resolved = validatePathWithinRoot(getRoot(), filePath);
    const enc = (encoding as BufferEncoding) ?? 'utf-8';
    return fs.readFile(resolved, { encoding: enc });
  });

  ipcMain.handle(AsyncChannels.FS_READ_FILE_ABSOLUTE, async (_event, filePath: unknown, encoding?: unknown) => {
    assertString(filePath, 'filePath');
    assertValidEncoding(encoding, 'encoding');
    const resolved = validateAbsolutePath(filePath);
    const enc = (encoding as BufferEncoding) ?? 'utf-8';
    return fs.readFile(resolved, { encoding: enc });
  });

  ipcMain.handle(AsyncChannels.FS_READ_FILE_BINARY, async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath');
    const resolved = validatePathWithinRoot(getRoot(), filePath);
    const contents = await fs.readFile(resolved);
    return new Uint8Array(contents);
  });

  ipcMain.handle(AsyncChannels.FS_READ_FILE_BINARY_ABSOLUTE, async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath');
    const resolved = validateAbsolutePath(filePath);
    const contents = await fs.readFile(resolved);
    return new Uint8Array(contents);
  });

  ipcMain.handle(AsyncChannels.FS_LIST_FILES, async (_event, dirPath: unknown = '.') => {
    assertString(dirPath, 'dirPath');
    if (!projectRoot) {
      return [];
    }
    const files = await listFilesRecursive(dirPath);
    return files.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  });

  ipcMain.handle(AsyncChannels.FS_WRITE_FILE, async (_event, filePath: unknown, content: unknown) => {
    assertString(filePath, 'filePath');
    assertString(content, 'content');
    const resolved = validatePathWithinRoot(getRoot(), filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  });

  ipcMain.handle(AsyncChannels.FS_WRITE_FILE_ABSOLUTE, async (_event, filePath: unknown, content: unknown) => {
    assertString(filePath, 'filePath');
    assertString(content, 'content');
    const resolved = validateAbsolutePath(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  });

  ipcMain.handle(AsyncChannels.FS_CREATE_DIRECTORY, async (_event, dirPath: unknown) => {
    assertString(dirPath, 'dirPath');
    const resolved = validatePathWithinRoot(getRoot(), dirPath);
    await fs.mkdir(resolved, { recursive: true });
  });

  ipcMain.handle(AsyncChannels.FS_COPY_FILE, async (_event, sourcePath: unknown, destinationPath: unknown) => {
    assertString(sourcePath, 'sourcePath');
    assertString(destinationPath, 'destinationPath');
    const resolvedSourcePath = validatePathWithinRoot(getRoot(), sourcePath);
    const resolvedDestinationPath = validatePathWithinRoot(getRoot(), destinationPath);
    await fs.mkdir(path.dirname(resolvedDestinationPath), { recursive: true });
    await fs.copyFile(resolvedSourcePath, resolvedDestinationPath);
  });

  ipcMain.handle(AsyncChannels.FS_COPY_DIRECTORY, async (_event, sourcePath: unknown, destinationPath: unknown) => {
    assertString(sourcePath, 'sourcePath');
    assertString(destinationPath, 'destinationPath');
    const resolvedSourcePath = validatePathWithinRoot(getRoot(), sourcePath);
    const resolvedDestinationPath = validatePathWithinRoot(getRoot(), destinationPath);
    await fs.mkdir(path.dirname(resolvedDestinationPath), { recursive: true });
    await fs.cp(resolvedSourcePath, resolvedDestinationPath, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  });

  ipcMain.handle(AsyncChannels.FS_DELETE_FILE, async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath');
    const resolved = validatePathWithinRoot(getRoot(), filePath);
    await fs.unlink(resolved);
  });

  ipcMain.handle(AsyncChannels.FS_DELETE_DIRECTORY, async (_event, dirPath: unknown) => {
    assertString(dirPath, 'dirPath');
    const resolved = validatePathWithinRoot(getRoot(), dirPath);
    await fs.rm(resolved, { recursive: true, force: false });
  });

  ipcMain.handle(AsyncChannels.FS_RENAME, async (_event, currentPath: unknown, nextPath: unknown) => {
    assertString(currentPath, 'currentPath');
    assertString(nextPath, 'nextPath');
    const resolvedCurrentPath = validatePathWithinRoot(getRoot(), currentPath);
    const resolvedNextPath = validatePathWithinRoot(getRoot(), nextPath);
    await fs.mkdir(path.dirname(resolvedNextPath), { recursive: true });
    await fs.rename(resolvedCurrentPath, resolvedNextPath);
  });

  ipcMain.handle(AsyncChannels.FS_READ_DIR, async (_event, dirPath: unknown) => {
    assertString(dirPath, 'dirPath');
    if (!projectRoot) {
      return [];
    }
    const resolved = validatePathWithinRoot(getRoot(), dirPath);
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
  });

  ipcMain.handle(AsyncChannels.FS_STAT, async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath');
    const resolved = validatePathWithinRoot(getRoot(), filePath);
    const stat = await fs.stat(resolved);
    return {
      size: stat.size,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      mtime: stat.mtime.toISOString(),
      ctime: stat.ctime.toISOString(),
    };
  });

  ipcMain.handle(AsyncChannels.FS_EXISTS, async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath');
    if (!projectRoot) {
      return false;
    }
    const resolved = validatePathWithinRoot(getRoot(), filePath);
    try {
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  });
}
