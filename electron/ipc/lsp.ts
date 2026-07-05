import { BrowserWindow, ipcMain } from 'electron';
import * as childProcess from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node.js';
import type {
  LspCallHierarchyIncomingCall,
  LspCallHierarchyItem,
  LspCallHierarchyOutgoingCall,
  LspCodeAction,
  LspCompletionItem,
  LspCompletionList,
  LspCompletionResponse,
  LspDebugEvent,
  LspDebugValue,
  LspDiagnostic,
  LspDiagnosticsEvent,
  LspDocumentHighlight,
  LspDocumentLink,
  LspDocumentSymbol,
  LspFoldingRange,
  LspHover,
  LspInlayHint,
  LspLayoutGeometryOptions,
  LspLayoutCatalogPageOptions,
  LspLayoutOpenOptions,
  LspLayoutOpenResult,
  LspLayoutTileGeometryOptions,
  LspMarkupContent,
  LspModuleHierarchy,
  LspModuleHierarchyNode,
  LspModuleHierarchyOptions,
  LspOutlineItem,
  LspOutlineOptions,
  LspOutlineResult,
  LspPosition,
  LspPrepareRenameResult,
  LspRange,
  LspSchematic,
  LspSchematicCell,
  LspSchematicConnection,
  LspSchematicEndpoint,
  LspSchematicModule,
  LspSchematicNet,
  LspSchematicOptions,
  LspSchematicPort,
  LspSchematicPortDirection,
  LspWaveformFrameOptions,
  LspWaveformOpenResult,
  LspSelectionRange,
  LspSemanticTokens,
  LspSignatureHelp,
  LspSignatureInformation,
  LspStateEvent,
  LspTextEdit,
  LspWorkspaceEdit,
  LspWorkspaceSymbol,
  WorkspaceLocation,
} from '../../types/systemverilog-lsp.js';
import { AsyncChannels, StreamChannels } from './channels.js';
import { assertNumber, assertOptionalString, assertString, validatePathWithinRoot } from './validators.js';
import { assertPristineEnginePathAvailable, resolvePristineEnginePath } from './pristineEnginePath.js';
import {
  closeAllWaveformPipeSessions,
  closeWaveformPipeSession,
  normalizeWaveformOpenSessionMetadata,
  openWaveformPipeSession,
  requestWaveformPipeFrame,
} from './waveformPipeClient.js';
import {
  closeAllLayoutPipeSessions,
  closeLayoutPipeSession,
  normalizeLayoutOpenSessionMetadata,
  openLayoutPipeSession,
  requestLayoutPipeCatalogPage,
  requestLayoutPipeCatalogSummary,
  requestLayoutPipeGeometry,
  requestLayoutPipeStatus,
  requestLayoutPipeTileGeometry,
} from './layoutPipeClient.js';

interface TrackedDocument {
  filePath: string;
  uri: string;
  languageId: string;
  version: number;
  refCount: number;
  text: string;
}

interface LspSession {
  process: ChildProcessWithoutNullStreams;
  connection: MessageConnection;
  initialized: Promise<void>;
  documents: Map<string, TrackedDocument>;
  disposed: boolean;
  nextDebugRequestId: number;
}

const SYSTEMVERILOG_LANGUAGE_ID = 'systemverilog';
const CLIENT_NAME = 'Pristine Monaco LSP';
const CLIENT_VERSION = '0.1.0';
const LSP_REQUEST_TIMEOUT_MS = 10_000;
const LSP_INITIALIZE_TIMEOUT_MS = 30_000;
const LSP_OUTLINE_TIMEOUT_MS = 30_000;
const LSP_MODULE_HIERARCHY_TIMEOUT_MS = 30_000;
const LSP_WAVEFORM_TIMEOUT_MS = 30_000;
const LSP_LAYOUT_TIMEOUT_MS = 30_000;
const LSP_DEBUG_EVENT_LIMIT = 200;
const DEFAULT_IHP_STDCELL_LEF_FILE_NAME = 'sg13g2_stdcell.lef';

interface SendDebugRequestOptions {
  timeoutMs?: number;
}

class LspRequestTimeoutError extends Error {
  constructor(readonly method: string, readonly timeoutMs: number) {
    super(`LSP request "${method}" timed out after ${timeoutMs}ms`);
    this.name = 'LspRequestTimeoutError';
  }
}

let projectRoot: string | null = null;
let activeSessionPromise: Promise<LspSession> | null = null;
let activeSession: LspSession | null = null;
let nextDebugEventSequence = 1;
let lspDebugEvents: LspDebugEvent[] = [];
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_FILE_URI_PATH_PATTERN = /^\/[A-Za-z]:\//;

function getProjectRoot(): string {
  if (!projectRoot) {
    throw new Error('Project root not set');
  }

  return projectRoot;
}

function normalizeWorkspaceFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

function isWindowsAbsolutePath(filePath: string): boolean {
  return WINDOWS_ABSOLUTE_PATH_PATTERN.test(filePath);
}

function resolveProjectRootPath(root: string): string {
  return isWindowsAbsolutePath(root)
    ? path.win32.normalize(root)
    : path.resolve(root);
}

function resolveWorkspaceFilePath(filePath: string): string {
  const root = getProjectRoot();

  if (!isWindowsAbsolutePath(root)) {
    return validatePathWithinRoot(root, filePath);
  }

  const resolvedPath = path.win32.isAbsolute(filePath)
    ? path.win32.normalize(filePath)
    : path.win32.resolve(root, filePath);
  const relativePath = path.win32.relative(root, resolvedPath);

  if (relativePath.startsWith('..') || path.win32.isAbsolute(relativePath)) {
    throw new Error(`Path traversal denied: ${filePath}`);
  }

  return resolvedPath;
}

function absolutePathToFileUri(absolutePath: string): string {
  if (!isWindowsAbsolutePath(absolutePath)) {
    return pathToFileURL(absolutePath).toString();
  }

  const url = new URL('file:///');
  url.pathname = `/${path.win32.normalize(absolutePath).replace(/\\/g, '/')}`;
  return url.toString();
}

function fileUriToAbsolutePath(uri: string): string | null {
  let parsedUri: URL;

  try {
    parsedUri = new URL(uri);
  } catch {
    return null;
  }

  if (parsedUri.protocol !== 'file:') {
    return null;
  }

  const decodedPathname = decodeURIComponent(parsedUri.pathname);
  if (WINDOWS_FILE_URI_PATH_PATTERN.test(decodedPathname)) {
    return path.win32.normalize(decodedPathname.slice(1));
  }

  try {
    return fileURLToPath(parsedUri);
  } catch {
    return null;
  }
}

function getDocumentUri(filePath: string): string {
  return absolutePathToFileUri(resolveWorkspaceFilePath(filePath));
}

function getProjectPathModule(): typeof path {
  return isWindowsAbsolutePath(getProjectRoot()) ? path.win32 : path;
}

function resolveDefaultLayoutLefUri(): string {
  const root = getProjectRoot();
  const pathModule = getProjectPathModule();
  const lefPath = pathModule.join(root, DEFAULT_IHP_STDCELL_LEF_FILE_NAME);
  if (!fs.existsSync(lefPath)) {
    throw new Error(`Default Physical layout LEF not found at ${lefPath}. Place ${DEFAULT_IHP_STDCELL_LEF_FILE_NAME} in the LSP workspace root.`);
  }

  return absolutePathToFileUri(lefPath);
}

function resolveWorkspaceLayoutFileUri(workspaceFilePath: string): string {
  return absolutePathToFileUri(resolveWorkspaceFilePath(workspaceFilePath));
}

function getWorkspaceLayoutFileExtension(workspaceFilePath: string): string {
  return path.posix.extname(normalizeWorkspaceFilePath(workspaceFilePath)).toLowerCase();
}

function listWorkspaceRootLefUris(): string[] {
  const root = getProjectRoot();
  const pathModule = getProjectPathModule();

  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.lef'))
    .map((entry) => absolutePathToFileUri(pathModule.join(root, entry.name)))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

function resolveLayoutOpenRequestOptions(options: LspLayoutOpenOptions): {
  defUri?: string;
  gdsUri?: string;
  lefUris?: string[];
  openMode?: 'sync' | 'staged' | 'auto';
  title: string;
} {
  if (!options.workspaceFilePath) {
    const lefUris = options.lefUris && options.lefUris.length > 0
      ? options.lefUris
      : [resolveDefaultLayoutLefUri()];

    return {
      defUri: options.defUri,
      gdsUri: options.gdsUri,
      lefUris,
      openMode: options.openMode,
      title: options.title ?? DEFAULT_IHP_STDCELL_LEF_FILE_NAME,
    };
  }

  const workspaceFilePath = normalizeWorkspaceFilePath(options.workspaceFilePath);
  const extension = getWorkspaceLayoutFileExtension(workspaceFilePath);
  const fileUri = resolveWorkspaceLayoutFileUri(workspaceFilePath);
  const title = options.title ?? path.posix.basename(workspaceFilePath);

  if (extension === '.lef') {
    return { lefUris: [fileUri], openMode: options.openMode, title };
  }

  if (extension === '.def') {
    const lefUris = options.lefUris && options.lefUris.length > 0
      ? options.lefUris
      : listWorkspaceRootLefUris();
    if (lefUris.length === 0) {
      throw new Error(`No LEF files found in the LSP workspace root. Place at least one .lef file next to ${workspaceFilePath} before opening DEF layout.`);
    }

    return { defUri: fileUri, lefUris, openMode: options.openMode, title };
  }

  if (extension === '.gds' || extension === '.gdsii') {
    return { gdsUri: fileUri, openMode: options.openMode ?? 'auto', title };
  }

  if (extension === '.oas' || extension === '.oasis') {
    throw new Error('OASIS layout rendering is not supported yet.');
  }

  throw new Error(`Unsupported physical layout file extension: ${extension || '<none>'}`);
}

function getRelativeWorkspaceFilePath(uri: string): string | null {
  const absolutePath = fileUriToAbsolutePath(uri);
  if (!absolutePath) {
    return null;
  }

  const root = getProjectRoot();
  const pathModule = isWindowsAbsolutePath(root) ? path.win32 : path;
  const relativePath = pathModule.relative(root, absolutePath);
  if (relativePath.startsWith('..') || pathModule.isAbsolute(relativePath)) {
    return null;
  }

  return normalizeWorkspaceFilePath(relativePath);
}

function sendLspState(getMainWindow: () => BrowserWindow | null, payload: LspStateEvent): void {
  getMainWindow()?.webContents.send(StreamChannels.LSP_STATE, payload);
}

function sendLspDebug(getMainWindow: () => BrowserWindow | null, payload: Omit<LspDebugEvent, 'sequence' | 'timestamp'>): void {
  const event = {
    sequence: nextDebugEventSequence++,
    timestamp: new Date().toISOString(),
    ...payload,
  } satisfies LspDebugEvent;

  lspDebugEvents = [...lspDebugEvents, event].slice(-LSP_DEBUG_EVENT_LIMIT);
  getMainWindow()?.webContents.send(StreamChannels.LSP_DEBUG, event);
}

function emitLspLifecycle(getMainWindow: () => BrowserWindow | null, payload: LspStateEvent): void {
  sendLspState(getMainWindow, payload);
  sendLspDebug(getMainWindow, {
    direction: 'session',
    kind: 'lifecycle',
    status: payload.status,
    text: payload.message,
    payload: payload.message ? { message: payload.message } : undefined,
  });
}

function sendLspDiagnostics(getMainWindow: () => BrowserWindow | null, payload: LspDiagnosticsEvent): void {
  getMainWindow()?.webContents.send(StreamChannels.LSP_DIAGNOSTICS, payload);
}

function toDebugValue(value: unknown, depth = 0): LspDebugValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= 6) {
    return '[Max depth reached]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toDebugValue(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    const normalizedEntries = Object.entries(value).flatMap(([key, entry]) => {
      if (entry === undefined) {
        return [];
      }

      return [[key, toDebugValue(entry, depth + 1)] as const];
    });

    return Object.fromEntries(normalizedEntries);
  }

  return String(value);
}

function getDebugFilePath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nestedPath = getDebugFilePath(entry);
      if (nestedPath) {
        return nestedPath;
      }
    }

    return undefined;
  }

  const candidate = value as {
    filePath?: unknown;
    uri?: unknown;
    textDocument?: { filePath?: unknown; uri?: unknown };
    targetUri?: unknown;
  };
  if (typeof candidate.filePath === 'string') {
    return normalizeWorkspaceFilePath(candidate.filePath);
  }

  if (typeof candidate.textDocument?.filePath === 'string') {
    return normalizeWorkspaceFilePath(candidate.textDocument.filePath);
  }

  const uri = typeof candidate.textDocument?.uri === 'string'
    ? candidate.textDocument.uri
    : typeof candidate.targetUri === 'string'
    ? candidate.targetUri
    : typeof candidate.uri === 'string'
    ? candidate.uri
    : null;
  if (!uri) {
    return undefined;
  }

  return getRelativeWorkspaceFilePath(uri) ?? undefined;
}

async function sendDebugNotification(
  session: LspSession,
  getMainWindow: () => BrowserWindow | null,
  method: string,
  params: unknown,
): Promise<void> {
  sendLspDebug(getMainWindow, {
    direction: 'client->server',
    kind: 'notification',
    method,
    filePath: getDebugFilePath(params),
    payload: toDebugValue(params),
  });

  await session.connection.sendNotification(method, params);
}

function withLspRequestTimeout<T>(request: Promise<T>, method: string, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return request;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new LspRequestTimeoutError(method, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([request, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

function isLspRequestTimeoutError(error: unknown): error is LspRequestTimeoutError {
  return error instanceof LspRequestTimeoutError
    || (error instanceof Error && error.name === 'LspRequestTimeoutError');
}

function getLspRequestErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sendDebugRequest<T>(
  session: LspSession,
  getMainWindow: () => BrowserWindow | null,
  method: string,
  params: unknown,
  options: SendDebugRequestOptions = {},
): Promise<T> {
  const requestId = session.nextDebugRequestId++;
  const filePath = getDebugFilePath(params);
  const timeoutMs = options.timeoutMs ?? LSP_REQUEST_TIMEOUT_MS;

  sendLspDebug(getMainWindow, {
    direction: 'client->server',
    kind: 'request',
    requestId,
    method,
    filePath,
    payload: toDebugValue(params),
  });

  try {
    const result = await withLspRequestTimeout(session.connection.sendRequest(method, params), method, timeoutMs);
    sendLspDebug(getMainWindow, {
      direction: 'server->client',
      kind: 'response',
      requestId,
      method,
      filePath: getDebugFilePath(result) ?? filePath,
      payload: toDebugValue(result),
    });
    return result as T;
  } catch (error) {
    sendLspDebug(getMainWindow, {
      direction: 'server->client',
      kind: 'response',
      requestId,
      method,
      filePath,
      payload: {
        error: toDebugValue(error),
      },
      text: getLspRequestErrorMessage(error),
    });
    throw error;
  }
}

function normalizeTextEdit(value: unknown): LspTextEdit | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as {
    newText?: unknown;
    range?: LspTextEdit['range'];
    insert?: LspTextEdit['range'];
  };
  const range = candidate.range ?? candidate.insert;

  if (!range || typeof candidate.newText !== 'string') {
    return undefined;
  }

  return {
    range,
    newText: candidate.newText,
  };
}

function normalizeTextEdits(value: unknown): LspTextEdit[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeTextEdit(entry))
      .filter((entry): entry is LspTextEdit => Boolean(entry))
    : [];
}

function normalizeMarkupContent(value: unknown): LspMarkupContent | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as { kind?: unknown; value?: unknown };
  if (typeof candidate.kind !== 'string' || typeof candidate.value !== 'string') {
    return undefined;
  }

  return {
    kind: candidate.kind,
    value: candidate.value,
  };
}

function normalizeCompletionItem(value: unknown): LspCompletionItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    label?: unknown;
    kind?: unknown;
    detail?: unknown;
    documentation?: unknown;
    insertText?: unknown;
    sortText?: unknown;
    filterText?: unknown;
    preselect?: unknown;
    commitCharacters?: unknown;
    insertTextFormat?: unknown;
    textEdit?: unknown;
    additionalTextEdits?: unknown;
    data?: unknown;
  };
  if (typeof candidate.label !== 'string') {
    return null;
  }

  const normalizedDocumentation = typeof candidate.documentation === 'string'
    ? candidate.documentation
    : Array.isArray(candidate.documentation)
    ? candidate.documentation.filter(
      (entry): entry is string | LspMarkupContent => typeof entry === 'string' || Boolean(normalizeMarkupContent(entry)),
    ).map((entry) => (typeof entry === 'string' ? entry : normalizeMarkupContent(entry)!))
    : normalizeMarkupContent(candidate.documentation);
  const normalizedAdditionalTextEdits = Array.isArray(candidate.additionalTextEdits)
    ? candidate.additionalTextEdits
      .map((entry) => normalizeTextEdit(entry))
      .filter((entry): entry is LspTextEdit => Boolean(entry))
    : undefined;

  return {
    label: candidate.label,
    kind: typeof candidate.kind === 'number' ? candidate.kind : undefined,
    detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
    documentation: normalizedDocumentation,
    insertText: typeof candidate.insertText === 'string' ? candidate.insertText : undefined,
    sortText: typeof candidate.sortText === 'string' ? candidate.sortText : undefined,
    filterText: typeof candidate.filterText === 'string' ? candidate.filterText : undefined,
    preselect: candidate.preselect === true,
    commitCharacters: Array.isArray(candidate.commitCharacters)
      ? candidate.commitCharacters.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    insertTextFormat: typeof candidate.insertTextFormat === 'number' ? candidate.insertTextFormat : undefined,
    textEdit: normalizeTextEdit(candidate.textEdit),
    additionalTextEdits: normalizedAdditionalTextEdits,
    data: candidate.data === undefined ? undefined : toDebugValue(candidate.data),
  };
}

function normalizeCompletionResponse(value: unknown): LspCompletionResponse | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeCompletionItem(entry))
      .filter((entry): entry is LspCompletionItem => Boolean(entry));
  }

  if (typeof value !== 'object') {
    return null;
  }

  const candidate = value as { isIncomplete?: unknown; items?: unknown };
  if (!Array.isArray(candidate.items)) {
    return null;
  }

  const items = candidate.items
    .map((entry) => normalizeCompletionItem(entry))
    .filter((entry): entry is LspCompletionItem => Boolean(entry));

  return {
    isIncomplete: candidate.isIncomplete === true,
    items,
  } satisfies LspCompletionList;
}

function normalizeHover(value: unknown): LspHover | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { contents?: unknown; range?: LspHover['range'] };
  if (candidate.contents === undefined) {
    return null;
  }

  const normalizedContents = Array.isArray(candidate.contents)
    ? candidate.contents.map((entry) => normalizeMarkupContent(entry) ?? entry)
    : normalizeMarkupContent(candidate.contents) ?? candidate.contents;

  return {
    contents: normalizedContents as LspHover['contents'],
    range: candidate.range,
  };
}

function normalizeWorkspaceLocation(value: unknown): WorkspaceLocation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    uri?: unknown;
    range?: WorkspaceLocation['range'];
    targetUri?: unknown;
    targetRange?: WorkspaceLocation['range'];
    targetSelectionRange?: WorkspaceLocation['range'];
  };
  const uri = typeof candidate.targetUri === 'string'
    ? candidate.targetUri
    : typeof candidate.uri === 'string'
    ? candidate.uri
    : null;
  const range = candidate.targetSelectionRange ?? candidate.targetRange ?? candidate.range;

  if (!uri || !range) {
    return null;
  }

  const filePath = getRelativeWorkspaceFilePath(uri);
  if (!filePath) {
    return null;
  }

  return {
    filePath,
    range,
  };
}

function normalizeWorkspaceLocations(value: unknown): WorkspaceLocation[] {
  if (!value) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values
    .map((entry) => normalizeWorkspaceLocation(entry))
    .filter((entry): entry is WorkspaceLocation => Boolean(entry));
}

function normalizeDocumentSymbol(value: unknown): LspDocumentSymbol | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    name?: unknown;
    detail?: unknown;
    kind?: unknown;
    range?: unknown;
    selectionRange?: unknown;
    children?: unknown;
  };
  if (typeof candidate.name !== 'string' || typeof candidate.kind !== 'number') {
    return null;
  }
  const range = normalizeOptionalRange(candidate.range);
  const selectionRange = normalizeOptionalRange(candidate.selectionRange);
  if (!range || !selectionRange) {
    return null;
  }

  return {
    name: candidate.name,
    detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
    kind: candidate.kind,
    range,
    selectionRange,
    children: Array.isArray(candidate.children)
      ? candidate.children
        .map((entry) => normalizeDocumentSymbol(entry))
        .filter((entry): entry is LspDocumentSymbol => Boolean(entry))
      : undefined,
  };
}

function normalizeDocumentSymbols(value: unknown): LspDocumentSymbol[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeDocumentSymbol(entry))
      .filter((entry): entry is LspDocumentSymbol => Boolean(entry))
    : [];
}

function normalizeDocumentHighlight(value: unknown): LspDocumentHighlight | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { range?: unknown; kind?: unknown };
  const range = normalizeOptionalRange(candidate.range);
  if (!range) {
    return null;
  }

  return {
    range,
    kind: typeof candidate.kind === 'number' ? candidate.kind : undefined,
  };
}

function normalizeDocumentHighlights(value: unknown): LspDocumentHighlight[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeDocumentHighlight(entry))
      .filter((entry): entry is LspDocumentHighlight => Boolean(entry))
    : [];
}

function normalizeDocumentLink(value: unknown): LspDocumentLink | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { range?: unknown; target?: unknown; tooltip?: unknown };
  const range = normalizeOptionalRange(candidate.range);
  if (!range) {
    return null;
  }

  return {
    range,
    target: typeof candidate.target === 'string' ? candidate.target : undefined,
    tooltip: typeof candidate.tooltip === 'string' ? candidate.tooltip : undefined,
  };
}

function normalizeDocumentLinks(value: unknown): LspDocumentLink[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeDocumentLink(entry))
      .filter((entry): entry is LspDocumentLink => Boolean(entry))
    : [];
}

function normalizeInlayHint(value: unknown): LspInlayHint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    position?: Partial<LspPosition>;
    label?: unknown;
    kind?: unknown;
    tooltip?: unknown;
    textEdits?: unknown;
  };
  if (
    typeof candidate.position?.line !== 'number'
    || typeof candidate.position.character !== 'number'
    || typeof candidate.label !== 'string'
  ) {
    return null;
  }

  const tooltip = typeof candidate.tooltip === 'string'
    ? candidate.tooltip
    : normalizeMarkupContent(candidate.tooltip);

  return {
    position: {
      line: candidate.position.line,
      character: candidate.position.character,
    },
    label: candidate.label,
    kind: typeof candidate.kind === 'number' ? candidate.kind : undefined,
    tooltip,
    textEdits: normalizeTextEdits(candidate.textEdits),
  };
}

function normalizeInlayHints(value: unknown): LspInlayHint[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeInlayHint(entry))
      .filter((entry): entry is LspInlayHint => Boolean(entry))
    : [];
}

function normalizeWorkspaceEdit(value: unknown): LspWorkspaceEdit | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { changes?: unknown; documentChanges?: unknown };

  const changes: Record<string, LspTextEdit[]> = {};
  if (candidate.changes && typeof candidate.changes === 'object' && !Array.isArray(candidate.changes)) {
    for (const [uri, edits] of Object.entries(candidate.changes)) {
      const filePath = getRelativeWorkspaceFilePath(uri);
      if (!filePath) {
        continue;
      }

      const normalizedEdits = normalizeTextEdits(edits);
      if (normalizedEdits.length > 0) {
        changes[filePath] = normalizedEdits;
      }
    }
  }

  const documentChanges = Array.isArray(candidate.documentChanges)
    ? candidate.documentChanges.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const change = entry as { kind?: unknown; uri?: unknown; options?: { ignoreIfExists?: unknown; overwrite?: unknown } };
      if (change.kind !== 'create' || typeof change.uri !== 'string') {
        return [];
      }
      const filePath = getRelativeWorkspaceFilePath(change.uri);
      if (!filePath) {
        return [];
      }

      return [{
        kind: 'create' as const,
        filePath,
        uri: change.uri,
        options: change.options && typeof change.options === 'object'
          ? {
            ignoreIfExists: change.options.ignoreIfExists === true,
            overwrite: change.options.overwrite === true,
          }
          : undefined,
      }];
    })
    : undefined;

  if (Object.keys(changes).length === 0 && (!documentChanges || documentChanges.length === 0)) {
    return null;
  }

  return {
    changes,
    documentChanges: documentChanges && documentChanges.length > 0 ? documentChanges : undefined,
  };
}

function normalizeWorkspaceEditOrEmpty(value: unknown): LspWorkspaceEdit {
  return normalizeWorkspaceEdit(value) ?? { changes: {} };
}

function normalizeCodeAction(value: unknown): LspCodeAction | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    title?: unknown;
    kind?: unknown;
    diagnostics?: unknown;
    edit?: unknown;
    isPreferred?: unknown;
  };
  if (typeof candidate.title !== 'string') {
    return null;
  }

  return {
    title: candidate.title,
    kind: typeof candidate.kind === 'string' ? candidate.kind : undefined,
    diagnostics: Array.isArray(candidate.diagnostics)
      ? candidate.diagnostics.filter((entry): entry is LspDiagnostic => Boolean(entry && typeof entry === 'object'))
      : undefined,
    edit: candidate.edit === undefined ? undefined : normalizeWorkspaceEditOrEmpty(candidate.edit),
    isPreferred: candidate.isPreferred === true,
  };
}

function normalizeCodeActions(value: unknown): LspCodeAction[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeCodeAction(entry))
      .filter((entry): entry is LspCodeAction => Boolean(entry))
    : [];
}

function normalizeFoldingRange(value: unknown): LspFoldingRange | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    startLine?: unknown;
    startCharacter?: unknown;
    endLine?: unknown;
    endCharacter?: unknown;
    kind?: unknown;
  };
  if (typeof candidate.startLine !== 'number' || typeof candidate.endLine !== 'number') {
    return null;
  }

  return {
    startLine: candidate.startLine,
    startCharacter: typeof candidate.startCharacter === 'number' ? candidate.startCharacter : undefined,
    endLine: candidate.endLine,
    endCharacter: typeof candidate.endCharacter === 'number' ? candidate.endCharacter : undefined,
    kind: typeof candidate.kind === 'string' ? candidate.kind : undefined,
  };
}

function normalizeFoldingRanges(value: unknown): LspFoldingRange[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeFoldingRange(entry))
      .filter((entry): entry is LspFoldingRange => Boolean(entry))
    : [];
}

function normalizeSemanticTokens(value: unknown): LspSemanticTokens {
  if (!value || typeof value !== 'object') {
    return { data: [] };
  }

  const candidate = value as { resultId?: unknown; data?: unknown };
  return {
    resultId: typeof candidate.resultId === 'string' ? candidate.resultId : undefined,
    data: Array.isArray(candidate.data)
      ? candidate.data.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
      : [],
  };
}

function normalizeSelectionRange(value: unknown): LspSelectionRange | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { range?: unknown; parent?: unknown };
  const range = normalizeOptionalRange(candidate.range);
  if (!range) {
    return null;
  }

  const parent = normalizeSelectionRange(candidate.parent);
  return {
    range,
    parent: parent ?? undefined,
  };
}

function normalizeSelectionRanges(value: unknown): LspSelectionRange[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeSelectionRange(entry))
      .filter((entry): entry is LspSelectionRange => Boolean(entry))
    : [];
}

function normalizeSignatureInformation(value: unknown): LspSignatureInformation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    label?: unknown;
    documentation?: unknown;
    parameters?: unknown;
  };
  if (typeof candidate.label !== 'string') {
    return null;
  }

  return {
    label: candidate.label,
    documentation: typeof candidate.documentation === 'string'
      ? candidate.documentation
      : normalizeMarkupContent(candidate.documentation),
    parameters: Array.isArray(candidate.parameters)
      ? candidate.parameters.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }
        const parameter = entry as { label?: unknown; documentation?: unknown };
        const label = typeof parameter.label === 'string'
          ? parameter.label
          : Array.isArray(parameter.label)
            && parameter.label.length === 2
            && typeof parameter.label[0] === 'number'
            && typeof parameter.label[1] === 'number'
          ? [parameter.label[0], parameter.label[1]] as [number, number]
          : null;
        if (!label) {
          return [];
        }
        return [{
          label,
          documentation: typeof parameter.documentation === 'string'
            ? parameter.documentation
            : normalizeMarkupContent(parameter.documentation),
        }];
      })
      : undefined,
  };
}

function normalizeSignatureHelp(value: unknown): LspSignatureHelp | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    signatures?: unknown;
    activeSignature?: unknown;
    activeParameter?: unknown;
  };
  const signatures = Array.isArray(candidate.signatures)
    ? candidate.signatures
      .map((entry) => normalizeSignatureInformation(entry))
      .filter((entry): entry is LspSignatureInformation => Boolean(entry))
    : [];
  if (signatures.length === 0) {
    return null;
  }

  return {
    signatures,
    activeSignature: typeof candidate.activeSignature === 'number' ? candidate.activeSignature : undefined,
    activeParameter: typeof candidate.activeParameter === 'number' ? candidate.activeParameter : undefined,
  };
}

function normalizeCallHierarchyItem(value: unknown): LspCallHierarchyItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    name?: unknown;
    kind?: unknown;
    uri?: unknown;
    range?: unknown;
    selectionRange?: unknown;
    detail?: unknown;
    data?: unknown;
  };
  if (typeof candidate.name !== 'string' || typeof candidate.kind !== 'number' || typeof candidate.uri !== 'string') {
    return null;
  }
  const range = normalizeOptionalRange(candidate.range);
  const selectionRange = normalizeOptionalRange(candidate.selectionRange);
  if (!range || !selectionRange) {
    return null;
  }

  return {
    name: candidate.name,
    kind: candidate.kind,
    uri: candidate.uri,
    filePath: getRelativeWorkspaceFilePath(candidate.uri) ?? undefined,
    range,
    selectionRange,
    detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
    data: candidate.data === undefined ? undefined : toDebugValue(candidate.data),
  };
}

function normalizeCallHierarchyItems(value: unknown): LspCallHierarchyItem[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeCallHierarchyItem(entry))
      .filter((entry): entry is LspCallHierarchyItem => Boolean(entry))
    : [];
}

function normalizeCallHierarchyIncomingCalls(value: unknown): LspCallHierarchyIncomingCall[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const candidate = entry as { from?: unknown; fromRanges?: unknown };
      const from = normalizeCallHierarchyItem(candidate.from);
      if (!from) {
        return [];
      }
      return [{
        from,
        fromRanges: Array.isArray(candidate.fromRanges)
          ? candidate.fromRanges.map(normalizeOptionalRange).filter((range): range is LspRange => Boolean(range))
          : [],
      }];
    })
    : [];
}

function normalizeCallHierarchyOutgoingCalls(value: unknown): LspCallHierarchyOutgoingCall[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const candidate = entry as { to?: unknown; fromRanges?: unknown };
      const to = normalizeCallHierarchyItem(candidate.to);
      if (!to) {
        return [];
      }
      return [{
        to,
        fromRanges: Array.isArray(candidate.fromRanges)
          ? candidate.fromRanges.map(normalizeOptionalRange).filter((range): range is LspRange => Boolean(range))
          : [],
      }];
    })
    : [];
}

function normalizeWorkspaceSymbol(value: unknown): LspWorkspaceSymbol | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    name?: unknown;
    kind?: unknown;
    location?: unknown;
    containerName?: unknown;
  };
  if (typeof candidate.name !== 'string' || typeof candidate.kind !== 'number') {
    return null;
  }
  const location = normalizeWorkspaceLocation(candidate.location);
  if (!location) {
    return null;
  }

  return {
    name: candidate.name,
    kind: candidate.kind,
    location,
    containerName: typeof candidate.containerName === 'string' ? candidate.containerName : undefined,
  };
}

function normalizeWorkspaceSymbols(value: unknown): LspWorkspaceSymbol[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeWorkspaceSymbol(entry))
      .filter((entry): entry is LspWorkspaceSymbol => Boolean(entry))
    : [];
}

function normalizePrepareRenameResult(value: unknown): LspPrepareRenameResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { range?: unknown; placeholder?: unknown };
  const range = normalizeOptionalRange(candidate.range);
  if (!range || typeof candidate.placeholder !== 'string') {
    return null;
  }

  return {
    range,
    placeholder: candidate.placeholder,
  };
}

function isLspRange(value: unknown): value is LspRange {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { start?: Partial<LspRange['start']>; end?: Partial<LspRange['end']> };
  return typeof candidate.start?.line === 'number'
    && typeof candidate.start.character === 'number'
    && typeof candidate.end?.line === 'number'
    && typeof candidate.end.character === 'number';
}

function normalizeOptionalRange(value: unknown): LspRange | undefined {
  return isLspRange(value) ? value : undefined;
}

function normalizeModuleHierarchyNode(value: unknown): LspModuleHierarchyNode | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    moduleName?: unknown;
    kind?: unknown;
    instanceName?: unknown;
    uri?: unknown;
    range?: unknown;
    selectionRange?: unknown;
    instanceRange?: unknown;
    instanceSelectionRange?: unknown;
    moduleSelectionRange?: unknown;
    unresolved?: unknown;
    cycle?: unknown;
    truncated?: unknown;
    children?: unknown;
  };
  if (typeof candidate.moduleName !== 'string') {
    return null;
  }

  const uri = typeof candidate.uri === 'string' ? candidate.uri : undefined;
  const children = Array.isArray(candidate.children)
    ? candidate.children
      .map((entry) => normalizeModuleHierarchyNode(entry))
      .filter((entry): entry is LspModuleHierarchyNode => Boolean(entry))
    : [];

  return {
    moduleName: candidate.moduleName,
    kind: candidate.kind === 'interface' ? 'interface' : 'module',
    instanceName: typeof candidate.instanceName === 'string' ? candidate.instanceName : undefined,
    uri,
    filePath: uri ? getRelativeWorkspaceFilePath(uri) ?? undefined : undefined,
    range: normalizeOptionalRange(candidate.range),
    selectionRange: normalizeOptionalRange(candidate.selectionRange),
    instanceRange: normalizeOptionalRange(candidate.instanceRange),
    instanceSelectionRange: normalizeOptionalRange(candidate.instanceSelectionRange),
    moduleSelectionRange: normalizeOptionalRange(candidate.moduleSelectionRange),
    unresolved: candidate.unresolved === true,
    cycle: candidate.cycle === true,
    truncated: candidate.truncated === true ? true : undefined,
    children,
  };
}

function normalizeModuleHierarchy(value: unknown): LspModuleHierarchy {
  if (!value || typeof value !== 'object') {
    return { roots: [], messages: [] };
  }

  const candidate = value as { roots?: unknown; messages?: unknown };
  const roots = Array.isArray(candidate.roots)
    ? candidate.roots
      .map((entry) => normalizeModuleHierarchyNode(entry))
      .filter((entry): entry is LspModuleHierarchyNode => Boolean(entry))
    : [];
  const messages = Array.isArray(candidate.messages)
    ? candidate.messages.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return { roots, messages };
}

function normalizeModuleHierarchyOptions(value: unknown): LspModuleHierarchyOptions {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected object or undefined for "options", got ${typeof value}`);
  }

  const candidate = value as { moduleName?: unknown; maxDepth?: unknown };
  assertOptionalString(candidate.moduleName, 'moduleName');
  if (candidate.maxDepth !== undefined) {
    assertNumber(candidate.maxDepth, 'maxDepth');
  }

  return {
    moduleName: typeof candidate.moduleName === 'string' ? candidate.moduleName : undefined,
    maxDepth: typeof candidate.maxDepth === 'number' ? candidate.maxDepth : undefined,
  };
}

function normalizeOutlineItem(value: unknown): LspOutlineItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    parentId?: unknown;
    name?: unknown;
    kind?: unknown;
    detail?: unknown;
    declaration?: unknown;
    type?: unknown;
    direction?: unknown;
    value?: unknown;
    moduleName?: unknown;
    symbolKind?: unknown;
    range?: unknown;
    selectionRange?: unknown;
    depth?: unknown;
    children?: unknown;
  };
  const range = normalizeOptionalRange(candidate.range);
  const selectionRange = normalizeOptionalRange(candidate.selectionRange);
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.name !== 'string'
    || typeof candidate.kind !== 'string'
    || !range
    || !selectionRange
  ) {
    return null;
  }

  return {
    id: candidate.id,
    parentId: typeof candidate.parentId === 'string' ? candidate.parentId : null,
    name: candidate.name,
    kind: candidate.kind,
    detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
    declaration: typeof candidate.declaration === 'string' ? candidate.declaration : undefined,
    type: typeof candidate.type === 'string' ? candidate.type : undefined,
    direction: typeof candidate.direction === 'string' ? candidate.direction : undefined,
    value: typeof candidate.value === 'string' ? candidate.value : undefined,
    moduleName: typeof candidate.moduleName === 'string' ? candidate.moduleName : undefined,
    symbolKind: typeof candidate.symbolKind === 'number' ? candidate.symbolKind : 0,
    range,
    selectionRange,
    depth: typeof candidate.depth === 'number' ? candidate.depth : 0,
    children: Array.isArray(candidate.children)
      ? candidate.children
        .map((entry) => normalizeOutlineItem(entry))
        .filter((entry): entry is LspOutlineItem => Boolean(entry))
      : [],
  };
}

function normalizeOutlineItems(value: unknown): LspOutlineItem[] {
  return Array.isArray(value)
    ? value
      .map((entry) => normalizeOutlineItem(entry))
      .filter((entry): entry is LspOutlineItem => Boolean(entry))
    : [];
}

function createEmptyOutlineResult(uri = '', messages: string[] = []): LspOutlineResult {
  return {
    uri,
    filePath: uri ? getRelativeWorkspaceFilePath(uri) ?? undefined : undefined,
    version: 0,
    generation: 0,
    roots: [],
    items: [],
    partial: false,
    truncated: false,
    messages,
  };
}

function normalizeOutlineResult(value: unknown): LspOutlineResult {
  if (!value || typeof value !== 'object') {
    return createEmptyOutlineResult();
  }

  const candidate = value as {
    uri?: unknown;
    version?: unknown;
    generation?: unknown;
    roots?: unknown;
    items?: unknown;
    partial?: unknown;
    truncated?: unknown;
    messages?: unknown;
  };
  const uri = typeof candidate.uri === 'string' ? candidate.uri : '';

  return {
    uri,
    filePath: uri ? getRelativeWorkspaceFilePath(uri) ?? undefined : undefined,
    version: typeof candidate.version === 'number' ? candidate.version : 0,
    generation: typeof candidate.generation === 'number' ? candidate.generation : 0,
    roots: normalizeOutlineItems(candidate.roots),
    items: normalizeOutlineItems(candidate.items),
    partial: candidate.partial === true,
    truncated: candidate.truncated === true,
    messages: Array.isArray(candidate.messages)
      ? candidate.messages.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

function normalizeOutlineOptions(value: unknown): Required<LspOutlineOptions> {
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    throw new Error(`Expected object or undefined for "options", got ${typeof value}`);
  }

  const candidate = (value ?? {}) as {
    maxDepth?: unknown;
    limit?: unknown;
    includeChildren?: unknown;
    includeFlat?: unknown;
  };
  if (candidate.maxDepth !== undefined) {
    assertNumber(candidate.maxDepth, 'maxDepth');
  }
  if (candidate.limit !== undefined) {
    assertNumber(candidate.limit, 'limit');
  }
  if (candidate.includeChildren !== undefined && typeof candidate.includeChildren !== 'boolean') {
    throw new Error(`Expected boolean for "includeChildren", got ${typeof candidate.includeChildren}`);
  }
  if (candidate.includeFlat !== undefined && typeof candidate.includeFlat !== 'boolean') {
    throw new Error(`Expected boolean for "includeFlat", got ${typeof candidate.includeFlat}`);
  }

  return {
    maxDepth: typeof candidate.maxDepth === 'number' ? candidate.maxDepth : 8,
    limit: typeof candidate.limit === 'number' ? candidate.limit : 2000,
    includeChildren: typeof candidate.includeChildren === 'boolean' ? candidate.includeChildren : true,
    includeFlat: typeof candidate.includeFlat === 'boolean' ? candidate.includeFlat : true,
  };
}

function normalizeSchematicPortDirection(value: unknown): LspSchematicPortDirection {
  return value === 'input' || value === 'output' || value === 'inout' ? value : 'inout';
}

function normalizeSchematicPort(value: unknown): LspSchematicPort | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    name?: unknown;
    direction?: unknown;
    widthText?: unknown;
    range?: unknown;
    selectionRange?: unknown;
  };
  if (typeof candidate.name !== 'string') {
    return null;
  }

  return {
    name: candidate.name,
    direction: normalizeSchematicPortDirection(candidate.direction),
    widthText: typeof candidate.widthText === 'string' ? candidate.widthText : '',
    range: normalizeOptionalRange(candidate.range),
    selectionRange: normalizeOptionalRange(candidate.selectionRange),
  };
}

function normalizeSchematicConnection(value: unknown): LspSchematicConnection | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { portName?: unknown; portIndex?: unknown; signal?: unknown; range?: unknown };
  if (typeof candidate.signal !== 'string') {
    return null;
  }

  return {
    portName: typeof candidate.portName === 'string' ? candidate.portName : '',
    portIndex: typeof candidate.portIndex === 'number' ? candidate.portIndex : -1,
    signal: candidate.signal,
    range: normalizeOptionalRange(candidate.range),
  };
}

function normalizeSchematicCell(value: unknown): LspSchematicCell | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    name?: unknown;
    type?: unknown;
    kind?: unknown;
    range?: unknown;
    selectionRange?: unknown;
    connections?: unknown;
  };
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.type !== 'string') {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    type: candidate.type,
    kind: typeof candidate.kind === 'string' ? candidate.kind : candidate.type,
    range: normalizeOptionalRange(candidate.range),
    selectionRange: normalizeOptionalRange(candidate.selectionRange),
    connections: Array.isArray(candidate.connections)
      ? candidate.connections
        .map((entry) => normalizeSchematicConnection(entry))
        .filter((entry): entry is LspSchematicConnection => Boolean(entry))
      : [],
  };
}

function normalizeSchematicEndpoint(value: unknown): LspSchematicEndpoint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { nodeId?: unknown; portName?: unknown };
  if (typeof candidate.nodeId !== 'string' || typeof candidate.portName !== 'string') {
    return null;
  }

  return { nodeId: candidate.nodeId, portName: candidate.portName };
}

function normalizeSchematicNet(value: unknown): LspSchematicNet | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { name?: unknown; drivers?: unknown; loads?: unknown };
  if (typeof candidate.name !== 'string') {
    return null;
  }

  const normalizeEndpoints = (entries: unknown): LspSchematicEndpoint[] => Array.isArray(entries)
    ? entries
      .map((entry) => normalizeSchematicEndpoint(entry))
      .filter((entry): entry is LspSchematicEndpoint => Boolean(entry))
    : [];

  return {
    name: candidate.name,
    drivers: normalizeEndpoints(candidate.drivers),
    loads: normalizeEndpoints(candidate.loads),
  };
}

function normalizeSchematicModule(value: unknown): LspSchematicModule | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    name?: unknown;
    uri?: unknown;
    range?: unknown;
    selectionRange?: unknown;
    ports?: unknown;
    cells?: unknown;
    nets?: unknown;
  };
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') {
    return null;
  }

  const uri = typeof candidate.uri === 'string' ? candidate.uri : undefined;
  return {
    id: candidate.id,
    name: candidate.name,
    uri,
    filePath: uri ? getRelativeWorkspaceFilePath(uri) ?? undefined : undefined,
    range: normalizeOptionalRange(candidate.range),
    selectionRange: normalizeOptionalRange(candidate.selectionRange),
    ports: Array.isArray(candidate.ports)
      ? candidate.ports
        .map((entry) => normalizeSchematicPort(entry))
        .filter((entry): entry is LspSchematicPort => Boolean(entry))
      : [],
    cells: Array.isArray(candidate.cells)
      ? candidate.cells
        .map((entry) => normalizeSchematicCell(entry))
        .filter((entry): entry is LspSchematicCell => Boolean(entry))
      : [],
    nets: Array.isArray(candidate.nets)
      ? candidate.nets
        .map((entry) => normalizeSchematicNet(entry))
        .filter((entry): entry is LspSchematicNet => Boolean(entry))
      : [],
  };
}

function normalizeSchematic(value: unknown): LspSchematic {
  if (!value || typeof value !== 'object') {
    return { rootModuleId: null, modules: [], messages: [] };
  }

  const candidate = value as { rootModuleId?: unknown; modules?: unknown; messages?: unknown };
  return {
    rootModuleId: typeof candidate.rootModuleId === 'string' ? candidate.rootModuleId : null,
    modules: Array.isArray(candidate.modules)
      ? candidate.modules
        .map((entry) => normalizeSchematicModule(entry))
        .filter((entry): entry is LspSchematicModule => Boolean(entry))
      : [],
    messages: Array.isArray(candidate.messages)
      ? candidate.messages.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

function createEmptyWaveformOpenResult(message: string): LspWaveformOpenResult {
  return {
    sessionId: '',
    title: 'Waveform',
    timescaleUnit: 'ns',
    duration: 0,
    cursorTime: 0,
    groups: [],
    signals: [],
    messages: [message],
  };
}

function createEmptyLayoutOpenResult(message: string): LspLayoutOpenResult {
  return {
    sessionId: '',
    protocol: 'pristine-layout-columnar-v3',
    title: 'Layout',
    lefCount: 0,
    defPresent: false,
    unitsPerMicron: 0,
    bbox: null,
    layerCount: 0,
    macroCount: 0,
    componentCount: 0,
    netCount: 0,
    diagnosticCount: 0,
    fileUris: [],
    messages: [message],
    catalog: {
      unitsPerMicron: 0,
      sourceKind: 'lefdef',
      shapeCount: 0,
      hasBounds: false,
      topCellIndex: null,
      layers: [],
      macros: [],
      pins: [],
      defPins: [],
      vias: [],
      components: [],
      nets: [],
      gdsCells: [],
      gdsReferences: [],
      gdsElements: [],
      gdsPoints: [],
      diagnostics: [],
    },
  };
}

function normalizeWaveformFrameOptions(value: unknown): LspWaveformFrameOptions {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected waveform frame options.');
  }

  const candidate = value as {
    endTime?: unknown;
    headerHeight?: unknown;
    height?: unknown;
    laneHeight?: unknown;
    maxSegments?: unknown;
    preparedEndTime?: unknown;
    preparedStartTime?: unknown;
    protocolVersion?: unknown;
    sessionId?: unknown;
    signalIds?: unknown;
    startTime?: unknown;
    viewportEndTime?: unknown;
    viewportStartTime?: unknown;
    width?: unknown;
  };
  const sessionId = candidate.sessionId;
  const startTime = candidate.startTime;
  const endTime = candidate.endTime;
  const width = candidate.width;
  const height = candidate.height;
  const laneHeight = candidate.laneHeight;
  const headerHeight = candidate.headerHeight;

  assertString(sessionId, 'sessionId');
  assertNumber(startTime, 'startTime');
  assertNumber(endTime, 'endTime');
  assertNumber(width, 'width');
  assertNumber(height, 'height');
  assertNumber(laneHeight, 'laneHeight');
  assertNumber(headerHeight, 'headerHeight');

  return {
    sessionId,
    startTime,
    endTime,
    width,
    height,
    laneHeight,
    headerHeight,
    maxSegments: typeof candidate.maxSegments === 'number' && Number.isInteger(candidate.maxSegments) && candidate.maxSegments >= 0
      ? candidate.maxSegments
      : undefined,
    preparedEndTime: typeof candidate.preparedEndTime === 'number' ? candidate.preparedEndTime : undefined,
    preparedStartTime: typeof candidate.preparedStartTime === 'number' ? candidate.preparedStartTime : undefined,
    protocolVersion: candidate.protocolVersion === 2 ? 2 : undefined,
    signalIds: Array.isArray(candidate.signalIds)
      ? candidate.signalIds.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    viewportEndTime: typeof candidate.viewportEndTime === 'number' ? candidate.viewportEndTime : undefined,
    viewportStartTime: typeof candidate.viewportStartTime === 'number' ? candidate.viewportStartTime : undefined,
  };
}

function normalizeLayoutOpenOptions(value: unknown): LspLayoutOpenOptions {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object') {
    throw new Error('Expected layout open options.');
  }

  const candidate = value as {
    defUri?: unknown;
    deferCatalog?: unknown;
    gdsUri?: unknown;
    lefUris?: unknown;
    openMode?: unknown;
    title?: unknown;
    workspaceFilePath?: unknown;
  };
  assertOptionalString(candidate.defUri, 'defUri');
  assertOptionalString(candidate.gdsUri, 'gdsUri');
  assertOptionalString(candidate.title, 'title');
  assertOptionalString(candidate.workspaceFilePath, 'workspaceFilePath');

  if (candidate.lefUris !== undefined && !Array.isArray(candidate.lefUris)) {
    throw new Error('Expected string array or undefined for "lefUris".');
  }

  return {
    defUri: candidate.defUri,
    deferCatalog: candidate.deferCatalog === true,
    gdsUri: candidate.gdsUri,
    lefUris: Array.isArray(candidate.lefUris)
      ? candidate.lefUris.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : undefined,
    openMode: candidate.openMode === 'sync' || candidate.openMode === 'staged' || candidate.openMode === 'auto'
      ? candidate.openMode
      : undefined,
    title: candidate.title,
    workspaceFilePath: candidate.workspaceFilePath,
  };
}

function normalizeLayoutGeometryOptions(value: unknown): LspLayoutGeometryOptions {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected layout geometry options.');
  }

  const candidate = value as {
    bbox?: unknown;
    gdsRootCellIndices?: unknown;
    layerIndices?: unknown;
    macroIndices?: unknown;
    maxShapes?: unknown;
    sessionId?: unknown;
    shapeKinds?: unknown;
  };
  const sessionId = candidate.sessionId;
  assertString(sessionId, 'sessionId');

  if (candidate.maxShapes !== undefined && (
    typeof candidate.maxShapes !== 'number'
    || !Number.isInteger(candidate.maxShapes)
    || candidate.maxShapes < 0
  )) {
    throw new Error('Expected non-negative integer or undefined for "maxShapes".');
  }

  return {
    sessionId,
    bbox: normalizeLayoutRequestBounds(candidate.bbox),
    maxShapes: typeof candidate.maxShapes === 'number' ? candidate.maxShapes : undefined,
    layerIndices: normalizeIntegerArray(candidate.layerIndices, 'layerIndices'),
    shapeKinds: normalizeIntegerArray(candidate.shapeKinds, 'shapeKinds'),
    macroIndices: normalizeIntegerArray(candidate.macroIndices, 'macroIndices'),
    gdsRootCellIndices: normalizeIntegerArray(candidate.gdsRootCellIndices, 'gdsRootCellIndices'),
  };
}

function normalizeLayoutCatalogPageOptions(value: unknown): LspLayoutCatalogPageOptions {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected layout catalog page options.');
  }

  const candidate = value as {
    sessionId?: unknown;
    tableKind?: unknown;
    offset?: unknown;
    limit?: unknown;
    maxBytes?: unknown;
  };
  const sessionId = candidate.sessionId;
  assertString(sessionId, 'sessionId');
  if (
    candidate.tableKind !== 'layers'
    && candidate.tableKind !== 'cells'
    && candidate.tableKind !== 'references'
    && candidate.tableKind !== 'elements'
    && candidate.tableKind !== 'points'
    && candidate.tableKind !== 'strings'
    && candidate.tableKind !== 'diagnostics'
  ) {
    throw new Error('Expected supported layout catalog page tableKind.');
  }

  return {
    sessionId,
    tableKind: candidate.tableKind,
    offset: normalizeOptionalNonNegativeInteger(candidate.offset, 'offset'),
    limit: normalizeOptionalNonNegativeInteger(candidate.limit, 'limit'),
    maxBytes: normalizeOptionalNonNegativeInteger(candidate.maxBytes, 'maxBytes'),
  };
}

function normalizeLayoutTileGeometryOptions(value: unknown): LspLayoutTileGeometryOptions {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected layout tile geometry options.');
  }

  const candidate = value as {
    bbox?: unknown;
    continuationToken?: unknown;
    datatypes?: unknown;
    layerIndices?: unknown;
    lod?: unknown;
    maxBytes?: unknown;
    maxPoints?: unknown;
    maxShapes?: unknown;
    rootCellIndex?: unknown;
    sessionId?: unknown;
    shapeKinds?: unknown;
  };
  const sessionId = candidate.sessionId;
  assertString(sessionId, 'sessionId');

  return {
    sessionId,
    bbox: normalizeLayoutRequestBounds(candidate.bbox),
    rootCellIndex: normalizeRequiredNonNegativeInteger(candidate.rootCellIndex, 'rootCellIndex'),
    maxShapes: normalizeOptionalNonNegativeInteger(candidate.maxShapes, 'maxShapes'),
    maxPoints: normalizeOptionalNonNegativeInteger(candidate.maxPoints, 'maxPoints'),
    maxBytes: normalizeOptionalNonNegativeInteger(candidate.maxBytes, 'maxBytes'),
    lod: normalizeOptionalNonNegativeInteger(candidate.lod, 'lod'),
    continuationToken: normalizeOptionalNonNegativeInteger(candidate.continuationToken, 'continuationToken'),
    layerIndices: normalizeIntegerArray(candidate.layerIndices, 'layerIndices'),
    shapeKinds: normalizeIntegerArray(candidate.shapeKinds, 'shapeKinds'),
    datatypes: normalizeIntegerArray(candidate.datatypes, 'datatypes'),
  };
}

function normalizeRequiredNonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Expected non-negative integer for "${name}".`);
  }
  return value;
}

function normalizeOptionalNonNegativeInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeRequiredNonNegativeInteger(value, name);
}

function normalizeLayoutRequestBounds(value: unknown): LspLayoutGeometryOptions['bbox'] {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Expected layout bbox object.');
  }

  const candidate = value as { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
  const x0 = candidate.x0;
  const y0 = candidate.y0;
  const x1 = candidate.x1;
  const y1 = candidate.y1;
  assertNumber(x0, 'bbox.x0');
  assertNumber(y0, 'bbox.y0');
  assertNumber(x1, 'bbox.x1');
  assertNumber(y1, 'bbox.y1');
  return { x0, y0, x1, y1 };
}

function normalizeIntegerArray(value: unknown, name: string): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Expected number array or undefined for "${name}".`);
  }

  for (const entry of value) {
    if (!Number.isInteger(entry) || entry < 0) {
      throw new Error(`Expected non-negative integer entries for "${name}".`);
    }
  }

  return value as number[];
}

function normalizeSchematicOptions(value: unknown): LspSchematicOptions {
  return normalizeModuleHierarchyOptions(value);
}

function assertLspRange(value: unknown, name: string): asserts value is LspRange {
  if (!isLspRange(value)) {
    throw new Error(`Expected LSP range for "${name}"`);
  }
}

function normalizePositions(value: unknown): LspPosition[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array for "positions", got ${typeof value}`);
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Expected object for "positions[${index}]", got ${typeof entry}`);
    }
    const candidate = entry as Partial<LspPosition>;
    if (typeof candidate.line !== 'number' || typeof candidate.character !== 'number') {
      throw new Error(`Expected LSP position for "positions[${index}]"`);
    }

    return {
      line: candidate.line,
      character: candidate.character,
    };
  });
}

function normalizeDiagnostics(value: unknown): LspDiagnostic[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Expected array or undefined for "diagnostics", got ${typeof value}`);
  }

  return value.filter((entry): entry is LspDiagnostic => Boolean(entry && typeof entry === 'object'));
}

function createInitializeParams() {
  const root = getProjectRoot();
  const rootUri = absolutePathToFileUri(root);

  return {
    processId: process.pid,
    clientInfo: {
      name: CLIENT_NAME,
      version: CLIENT_VERSION,
    },
    rootPath: root,
    rootUri,
    workspaceFolders: [{ name: path.basename(root), uri: rootUri }],
    capabilities: {
      textDocument: {
        completion: {
          completionItem: {
            documentationFormat: ['markdown', 'plaintext'],
            snippetSupport: true,
            resolveSupport: {
              properties: ['documentation', 'detail', 'additionalTextEdits', 'insertText', 'insertTextFormat'],
            },
          },
          contextSupport: true,
        },
        hover: {
          contentFormat: ['markdown', 'plaintext'],
        },
        definition: {
          linkSupport: true,
        },
        typeDefinition: {
          linkSupport: true,
        },
        implementation: {
          linkSupport: true,
        },
        documentSymbol: {
          hierarchicalDocumentSymbolSupport: true,
        },
        documentHighlight: {},
        documentLink: {},
        inlayHint: {},
        codeAction: {
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: ['quickfix'],
            },
          },
        },
        foldingRange: {},
        semanticTokens: {
          tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'function', 'variable', 'parameter', 'enumMember'],
          tokenModifiers: [],
          formats: ['relative'],
          requests: { full: true, range: false },
        },
        selectionRange: {},
        signatureHelp: {
          signatureInformation: {
            documentationFormat: ['markdown', 'plaintext'],
            parameterInformation: {
              labelOffsetSupport: true,
            },
          },
        },
        callHierarchy: {},
        rename: {
          prepareSupport: true,
        },
        references: {},
        publishDiagnostics: {},
      },
      workspace: {
        workspaceFolders: true,
        symbol: {},
        applyEdit: true,
      },
    },
  };
}

function cleanupSession(session: LspSession): void {
  if (session.disposed) {
    return;
  }

  session.disposed = true;
  session.documents.clear();

  try {
    session.connection.dispose();
  } catch {
    // Ignore disposal failures during shutdown.
  }

  if (!session.process.killed) {
    session.process.kill();
  }

  if (activeSession === session) {
    activeSession = null;
    activeSessionPromise = null;
  }
}

function createTrackedDocument(filePath: string, text: string, languageId = SYSTEMVERILOG_LANGUAGE_ID): TrackedDocument {
  return {
    filePath,
    uri: getDocumentUri(filePath),
    languageId,
    version: 1,
    refCount: 0,
    text,
  };
}

async function createSession(getMainWindow: () => BrowserWindow | null): Promise<LspSession> {
  const root = getProjectRoot();
  const binaryPath = assertPristineEnginePathAvailable(resolvePristineEnginePath());
  const serverProcess = childProcess.spawn(binaryPath, [], {
    cwd: root,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const connection = createMessageConnection(
    new StreamMessageReader(serverProcess.stdout),
    new StreamMessageWriter(serverProcess.stdin),
  );
  const session: LspSession = {
    process: serverProcess,
    connection,
    initialized: Promise.resolve(),
    documents: new Map<string, TrackedDocument>(),
    disposed: false,
    nextDebugRequestId: 1,
  };

  activeSession = session;
  emitLspLifecycle(getMainWindow, { status: 'starting' });

  serverProcess.stderr.on('data', (chunk: Buffer | string) => {
    const text = chunk.toString().trim();
    if (!text) {
      return;
    }

    sendLspDebug(getMainWindow, {
      direction: 'server->client',
      kind: 'stderr',
      text,
      payload: { text },
    });
  });

  serverProcess.on('error', (error) => {
    emitLspLifecycle(getMainWindow, { status: 'error', message: error.message });
    cleanupSession(session);
  });

  serverProcess.on('close', (code) => {
    if (session.disposed) {
      return;
    }

    const message = code === null ? 'Language server exited unexpectedly' : `Language server exited with code ${code}`;
    emitLspLifecycle(getMainWindow, { status: 'stopped', message });
    cleanupSession(session);
  });

  connection.onNotification('textDocument/publishDiagnostics', (params: { uri: string; diagnostics: LspDiagnostic[] }) => {
    const filePath = getRelativeWorkspaceFilePath(params.uri);
    if (!filePath) {
      return;
    }

    sendLspDebug(getMainWindow, {
      direction: 'server->client',
      kind: 'notification',
      method: 'textDocument/publishDiagnostics',
      filePath,
      payload: toDebugValue(params),
    });

    sendLspDiagnostics(getMainWindow, {
      filePath,
      diagnostics: params.diagnostics,
    });
  });

  connection.onClose(() => {
    if (!session.disposed) {
      emitLspLifecycle(getMainWindow, { status: 'stopped' });
    }
  });

  connection.listen();
  session.initialized = sendDebugRequest(session, getMainWindow, 'initialize', createInitializeParams(), {
    timeoutMs: LSP_INITIALIZE_TIMEOUT_MS,
  })
    .then(() => {
      return sendDebugNotification(session, getMainWindow, 'initialized', {});
    })
    .then(() => {
      emitLspLifecycle(getMainWindow, { status: 'ready' });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to initialize SystemVerilog LSP server';
      emitLspLifecycle(getMainWindow, { status: 'error', message });
      cleanupSession(session);
      throw error;
    });

  return session;
}

async function getSession(getMainWindow: () => BrowserWindow | null): Promise<LspSession> {
  if (!activeSessionPromise) {
    activeSessionPromise = createSession(getMainWindow).catch((error) => {
      activeSessionPromise = null;
      activeSession = null;
      throw error;
    });
  }

  return activeSessionPromise;
}

async function withInitializedSession<T>(
  getMainWindow: () => BrowserWindow | null,
  callback: (session: LspSession) => Promise<T>,
): Promise<T> {
  const session = await getSession(getMainWindow);
  await session.initialized;
  return callback(session);
}

function getOrCreateDocument(session: LspSession, filePath: string, text: string, languageId = SYSTEMVERILOG_LANGUAGE_ID): TrackedDocument {
  const normalizedFilePath = normalizeWorkspaceFilePath(filePath);
  const existing = session.documents.get(normalizedFilePath);
  if (existing) {
    return existing;
  }

  const document = createTrackedDocument(normalizedFilePath, text, languageId);
  session.documents.set(normalizedFilePath, document);
  return document;
}

function updateDocumentText(session: LspSession, filePath: string, text: string): TrackedDocument {
  const document = getOrCreateDocument(session, filePath, text);
  if (document.text !== text) {
    document.text = text;
    document.version += 1;
  }

  return document;
}

export function setLspProjectRoot(root: string | null): void {
  projectRoot = root ? resolveProjectRootPath(root) : null;
  disposeLspSession();
}

export function disposeLspSession(): void {
  void closeAllWaveformPipeSessions();
  void closeAllLayoutPipeSessions();

  if (activeSession) {
    cleanupSession(activeSession);
  }
}

export function registerLspHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(AsyncChannels.LSP_GET_DEBUG_EVENTS, async () => lspDebugEvents);

  ipcMain.handle(AsyncChannels.LSP_ENSURE_INITIALIZED, async () => {
    await withInitializedSession(getMainWindow, async () => undefined);
  });

  ipcMain.handle(AsyncChannels.LSP_OPEN_DOCUMENT, async (_event, filePath: unknown, languageId: unknown, text: unknown) => {
    assertString(filePath, 'filePath');
    assertString(languageId, 'languageId');
    assertString(text, 'text');

    await withInitializedSession(getMainWindow, async (session) => {
      const document = getOrCreateDocument(session, filePath, text, languageId);
      document.refCount += 1;

      if (document.refCount === 1) {
        await sendDebugNotification(session, getMainWindow, 'textDocument/didOpen', {
          textDocument: {
            uri: document.uri,
            languageId: document.languageId,
            version: document.version,
            text: document.text,
          },
        });
        return;
      }

      if (document.text !== text) {
        document.text = text;
        document.version += 1;
        await sendDebugNotification(session, getMainWindow, 'textDocument/didChange', {
          textDocument: {
            uri: document.uri,
            version: document.version,
          },
          contentChanges: [{ text: document.text }],
        });
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_CHANGE_DOCUMENT, async (_event, filePath: unknown, text: unknown) => {
    assertString(filePath, 'filePath');
    assertString(text, 'text');

    await withInitializedSession(getMainWindow, async (session) => {
      const document = updateDocumentText(session, filePath, text);
      if (document.refCount === 0) {
        document.refCount = 1;
        await sendDebugNotification(session, getMainWindow, 'textDocument/didOpen', {
          textDocument: {
            uri: document.uri,
            languageId: document.languageId,
            version: document.version,
            text: document.text,
          },
        });
        return;
      }

      await sendDebugNotification(session, getMainWindow, 'textDocument/didChange', {
        textDocument: {
          uri: document.uri,
          version: document.version,
        },
        contentChanges: [{ text: document.text }],
      });
    });
  });

  ipcMain.handle(AsyncChannels.LSP_CLOSE_DOCUMENT, async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath');

    await withInitializedSession(getMainWindow, async (session) => {
      const normalizedFilePath = normalizeWorkspaceFilePath(filePath);
      const document = session.documents.get(normalizedFilePath);
      if (!document) {
        return;
      }

      document.refCount = Math.max(document.refCount - 1, 0);
      if (document.refCount > 0) {
        return;
      }

      session.documents.delete(normalizedFilePath);
      await sendDebugNotification(session, getMainWindow, 'textDocument/didClose', {
        textDocument: {
          uri: document.uri,
        },
      });
    });
  });

  const registerPositionLocationsHandler = (
    channel: string,
    method: string,
  ) => {
    ipcMain.handle(channel, async (_event, filePath: unknown, line: unknown, character: unknown) => {
      assertString(filePath, 'filePath');
      assertNumber(line, 'line');
      assertNumber(character, 'character');

      return withInitializedSession(getMainWindow, async (session) => {
        try {
          const result = await sendDebugRequest(session, getMainWindow, method, {
            textDocument: { uri: getDocumentUri(filePath) },
            position: { line, character },
          });

          return normalizeWorkspaceLocations(result);
        } catch (error) {
          if (isLspRequestTimeoutError(error)) {
            return [];
          }

          throw error;
        }
      });
    });
  };

  const registerDocumentArrayHandler = <T>(
    channel: string,
    method: string,
    normalize: (value: unknown) => T[],
  ) => {
    ipcMain.handle(channel, async (_event, filePath: unknown) => {
      assertString(filePath, 'filePath');

      return withInitializedSession(getMainWindow, async (session) => {
        try {
          const result = await sendDebugRequest(session, getMainWindow, method, {
            textDocument: { uri: getDocumentUri(filePath) },
          });

          return normalize(result);
        } catch (error) {
          if (isLspRequestTimeoutError(error)) {
            return [];
          }

          throw error;
        }
      });
    });
  };

  ipcMain.handle(
    AsyncChannels.LSP_COMPLETION,
    async (
      _event,
      filePath: unknown,
      line: unknown,
      character: unknown,
      triggerCharacter?: unknown,
      triggerKind?: unknown,
    ) => {
      assertString(filePath, 'filePath');
      assertNumber(line, 'line');
      assertNumber(character, 'character');
      assertOptionalString(triggerCharacter, 'triggerCharacter');
      if (triggerKind !== undefined) {
        assertNumber(triggerKind, 'triggerKind');
      }

      return withInitializedSession(getMainWindow, async (session) => {
        try {
          const result = await sendDebugRequest(session, getMainWindow, 'textDocument/completion', {
            textDocument: { uri: getDocumentUri(filePath) },
            position: { line, character },
            context: triggerKind === undefined
              ? undefined
              : {
                triggerKind,
                triggerCharacter,
              },
          });

          return normalizeCompletionResponse(result);
        } catch (error) {
          if (isLspRequestTimeoutError(error)) {
            return null;
          }

          throw error;
        }
      });
    },
  );

  ipcMain.handle(AsyncChannels.LSP_COMPLETION_RESOLVE, async (_event, item: unknown) => {
    const normalizedItem = normalizeCompletionItem(item);
    if (!normalizedItem) {
      throw new Error('Expected completion item for "item"');
    }

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'completionItem/resolve', normalizedItem);

        return normalizeCompletionItem(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return normalizedItem;
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_HOVER, async (_event, filePath: unknown, line: unknown, character: unknown) => {
    assertString(filePath, 'filePath');
    assertNumber(line, 'line');
    assertNumber(character, 'character');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/hover', {
          textDocument: { uri: getDocumentUri(filePath) },
          position: { line, character },
        });

        return normalizeHover(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return null;
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_DEFINITION, async (_event, filePath: unknown, line: unknown, character: unknown) => {
    assertString(filePath, 'filePath');
    assertNumber(line, 'line');
    assertNumber(character, 'character');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/definition', {
          textDocument: { uri: getDocumentUri(filePath) },
          position: { line, character },
        });

        return normalizeWorkspaceLocations(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  registerPositionLocationsHandler(AsyncChannels.LSP_TYPE_DEFINITION, 'textDocument/typeDefinition');
  registerPositionLocationsHandler(AsyncChannels.LSP_IMPLEMENTATION, 'textDocument/implementation');

  ipcMain.handle(AsyncChannels.LSP_DOCUMENT_HIGHLIGHTS, async (_event, filePath: unknown, line: unknown, character: unknown) => {
    assertString(filePath, 'filePath');
    assertNumber(line, 'line');
    assertNumber(character, 'character');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/documentHighlight', {
          textDocument: { uri: getDocumentUri(filePath) },
          position: { line, character },
        });

        return normalizeDocumentHighlights(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  registerDocumentArrayHandler(AsyncChannels.LSP_DOCUMENT_LINKS, 'textDocument/documentLink', normalizeDocumentLinks);

  ipcMain.handle(AsyncChannels.LSP_INLAY_HINTS, async (_event, filePath: unknown, range: unknown) => {
    assertString(filePath, 'filePath');
    assertLspRange(range, 'range');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/inlayHint', {
          textDocument: { uri: getDocumentUri(filePath) },
          range,
        });

        return normalizeInlayHints(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_CODE_ACTIONS, async (_event, filePath: unknown, range: unknown, diagnostics: unknown) => {
    assertString(filePath, 'filePath');
    assertLspRange(range, 'range');
    const normalizedDiagnostics = normalizeDiagnostics(diagnostics);

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/codeAction', {
          textDocument: { uri: getDocumentUri(filePath) },
          range,
          context: { diagnostics: normalizedDiagnostics },
        });

        return normalizeCodeActions(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  registerDocumentArrayHandler(AsyncChannels.LSP_FOLDING_RANGES, 'textDocument/foldingRange', normalizeFoldingRanges);

  ipcMain.handle(AsyncChannels.LSP_SEMANTIC_TOKENS_FULL, async (_event, filePath: unknown) => {
    assertString(filePath, 'filePath');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/semanticTokens/full', {
          textDocument: { uri: getDocumentUri(filePath) },
        });

        return normalizeSemanticTokens(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return { data: [] };
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_SELECTION_RANGES, async (_event, filePath: unknown, positions: unknown) => {
    assertString(filePath, 'filePath');
    const normalizedPositions = normalizePositions(positions);

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/selectionRange', {
          textDocument: { uri: getDocumentUri(filePath) },
          positions: normalizedPositions,
        });

        return normalizeSelectionRanges(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  ipcMain.handle(
    AsyncChannels.LSP_SIGNATURE_HELP,
    async (
      _event,
      filePath: unknown,
      line: unknown,
      character: unknown,
      triggerCharacter?: unknown,
      triggerKind?: unknown,
      isRetrigger?: unknown,
    ) => {
      assertString(filePath, 'filePath');
      assertNumber(line, 'line');
      assertNumber(character, 'character');
      assertOptionalString(triggerCharacter, 'triggerCharacter');
      if (triggerKind !== undefined) {
        assertNumber(triggerKind, 'triggerKind');
      }
      if (isRetrigger !== undefined && typeof isRetrigger !== 'boolean') {
        throw new Error(`Expected boolean or undefined for "isRetrigger", got ${typeof isRetrigger}`);
      }

      return withInitializedSession(getMainWindow, async (session) => {
        try {
          const result = await sendDebugRequest(session, getMainWindow, 'textDocument/signatureHelp', {
            textDocument: { uri: getDocumentUri(filePath) },
            position: { line, character },
            context: triggerKind === undefined
              ? undefined
              : {
                triggerKind,
                triggerCharacter,
                isRetrigger: isRetrigger === true,
              },
          });

          return normalizeSignatureHelp(result);
        } catch (error) {
          if (isLspRequestTimeoutError(error)) {
            return null;
          }

          throw error;
        }
      });
    },
  );

  registerDocumentArrayHandler(AsyncChannels.LSP_DOCUMENT_SYMBOLS, 'textDocument/documentSymbol', normalizeDocumentSymbols);

  ipcMain.handle(
    AsyncChannels.LSP_REFERENCES,
    async (_event, filePath: unknown, line: unknown, character: unknown, includeDeclaration?: unknown) => {
      assertString(filePath, 'filePath');
      assertNumber(line, 'line');
      assertNumber(character, 'character');
      if (includeDeclaration !== undefined && typeof includeDeclaration !== 'boolean') {
        throw new Error(`Expected boolean or undefined for "includeDeclaration", got ${typeof includeDeclaration}`);
      }

      return withInitializedSession(getMainWindow, async (session) => {
        try {
          const result = await sendDebugRequest(session, getMainWindow, 'textDocument/references', {
            textDocument: { uri: getDocumentUri(filePath) },
            position: { line, character },
            context: { includeDeclaration: includeDeclaration !== false },
          });

          return normalizeWorkspaceLocations(result);
        } catch (error) {
          if (isLspRequestTimeoutError(error)) {
            return [];
          }

          throw error;
        }
      });
    },
  );

  ipcMain.handle(AsyncChannels.LSP_PREPARE_CALL_HIERARCHY, async (_event, filePath: unknown, line: unknown, character: unknown) => {
    assertString(filePath, 'filePath');
    assertNumber(line, 'line');
    assertNumber(character, 'character');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/prepareCallHierarchy', {
          textDocument: { uri: getDocumentUri(filePath) },
          position: { line, character },
        });

        return normalizeCallHierarchyItems(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_CALL_HIERARCHY_INCOMING, async (_event, item: unknown) => {
    const normalizedItem = normalizeCallHierarchyItem(item);
    if (!normalizedItem) {
      throw new Error('Expected call hierarchy item for "item"');
    }

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'callHierarchy/incomingCalls', {
          item: normalizedItem,
        });

        return normalizeCallHierarchyIncomingCalls(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_CALL_HIERARCHY_OUTGOING, async (_event, item: unknown) => {
    const normalizedItem = normalizeCallHierarchyItem(item);
    if (!normalizedItem) {
      throw new Error('Expected call hierarchy item for "item"');
    }

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'callHierarchy/outgoingCalls', {
          item: normalizedItem,
        });

        return normalizeCallHierarchyOutgoingCalls(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_WORKSPACE_SYMBOLS, async (_event, query: unknown) => {
    assertString(query, 'query');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'workspace/symbol', { query });

        return normalizeWorkspaceSymbols(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return [];
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_PREPARE_RENAME, async (_event, filePath: unknown, line: unknown, character: unknown) => {
    assertString(filePath, 'filePath');
    assertNumber(line, 'line');
    assertNumber(character, 'character');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/prepareRename', {
          textDocument: { uri: getDocumentUri(filePath) },
          position: { line, character },
        });

        return normalizePrepareRenameResult(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return null;
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_RENAME, async (_event, filePath: unknown, line: unknown, character: unknown, newName: unknown) => {
    assertString(filePath, 'filePath');
    assertNumber(line, 'line');
    assertNumber(character, 'character');
    assertString(newName, 'newName');

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'textDocument/rename', {
          textDocument: { uri: getDocumentUri(filePath) },
          position: { line, character },
          newName,
        });

        return normalizeWorkspaceEdit(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return null;
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_OUTLINE, async (_event, filePath: unknown, options?: unknown) => {
    assertString(filePath, 'filePath');
    const normalizedOptions = normalizeOutlineOptions(options);
    const uri = getDocumentUri(filePath);

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'systemverilog/outline', {
          textDocument: { uri },
          ...normalizedOptions,
        }, {
          timeoutMs: LSP_OUTLINE_TIMEOUT_MS,
        });

        return normalizeOutlineResult(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return createEmptyOutlineResult(uri, [getLspRequestErrorMessage(error)]);
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_MODULE_HIERARCHY, async (_event, options?: unknown) => {
    const normalizedOptions = normalizeModuleHierarchyOptions(options);

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'systemverilog/moduleHierarchy', normalizedOptions, {
          timeoutMs: LSP_MODULE_HIERARCHY_TIMEOUT_MS,
        });

        return normalizeModuleHierarchy(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return { roots: [], messages: [getLspRequestErrorMessage(error)] };
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_SCHEMATIC, async (_event, options?: unknown) => {
    const normalizedOptions = normalizeSchematicOptions(options);

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'systemverilog/schematic', normalizedOptions);

        return normalizeSchematic(result);
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return { rootModuleId: null, modules: [], messages: [getLspRequestErrorMessage(error)] };
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_WAVEFORM_OPEN, async () => {
    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'systemverilog/waveform/open', { source: 'mock' }, {
          timeoutMs: LSP_WAVEFORM_TIMEOUT_MS,
        });

        return openWaveformPipeSession(normalizeWaveformOpenSessionMetadata(result));
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return createEmptyWaveformOpenResult(getLspRequestErrorMessage(error));
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_WAVEFORM_FRAME, async (_event, options?: unknown) => {
    const normalizedOptions = normalizeWaveformFrameOptions(options);

    return requestWaveformPipeFrame(normalizedOptions);
  });

  ipcMain.handle(AsyncChannels.LSP_WAVEFORM_CLOSE, async (_event, sessionId: unknown) => {
    assertString(sessionId, 'sessionId');
    await closeWaveformPipeSession(sessionId);

    return withInitializedSession(getMainWindow, async (session) => {
      await sendDebugRequest(session, getMainWindow, 'systemverilog/waveform/close', { sessionId }, {
        timeoutMs: LSP_WAVEFORM_TIMEOUT_MS,
      });

      return true;
    });
  });

  ipcMain.handle(AsyncChannels.LSP_LAYOUT_OPEN, async (_event, options?: unknown) => {
    const normalizedOptions = normalizeLayoutOpenOptions(options);
    const requestOptions = resolveLayoutOpenRequestOptions(normalizedOptions);

    return withInitializedSession(getMainWindow, async (session) => {
      try {
        const result = await sendDebugRequest(session, getMainWindow, 'systemverilog/layout/open', requestOptions, {
          timeoutMs: LSP_LAYOUT_TIMEOUT_MS,
        });

        return openLayoutPipeSession(normalizeLayoutOpenSessionMetadata(result), {
          deferCatalog: normalizedOptions.deferCatalog === true,
        });
      } catch (error) {
        if (isLspRequestTimeoutError(error)) {
          return createEmptyLayoutOpenResult(getLspRequestErrorMessage(error));
        }

        throw error;
      }
    });
  });

  ipcMain.handle(AsyncChannels.LSP_LAYOUT_GEOMETRY, async (_event, options?: unknown) => {
    const normalizedOptions = normalizeLayoutGeometryOptions(options);

    return requestLayoutPipeGeometry(normalizedOptions);
  });

  ipcMain.handle(AsyncChannels.LSP_LAYOUT_STATUS, async (_event, sessionId: unknown) => {
    assertString(sessionId, 'sessionId');

    return requestLayoutPipeStatus(sessionId);
  });

  ipcMain.handle(AsyncChannels.LSP_LAYOUT_CATALOG_SUMMARY, async (_event, sessionId: unknown) => {
    assertString(sessionId, 'sessionId');

    return requestLayoutPipeCatalogSummary(sessionId);
  });

  ipcMain.handle(AsyncChannels.LSP_LAYOUT_CATALOG_PAGE, async (_event, options?: unknown) => {
    const normalizedOptions = normalizeLayoutCatalogPageOptions(options);

    return requestLayoutPipeCatalogPage(normalizedOptions);
  });

  ipcMain.handle(AsyncChannels.LSP_LAYOUT_TILE_GEOMETRY, async (_event, options?: unknown) => {
    const normalizedOptions = normalizeLayoutTileGeometryOptions(options);

    return requestLayoutPipeTileGeometry(normalizedOptions);
  });

  ipcMain.handle(AsyncChannels.LSP_LAYOUT_CLOSE, async (_event, sessionId: unknown) => {
    assertString(sessionId, 'sessionId');
    await closeLayoutPipeSession(sessionId);

    return withInitializedSession(getMainWindow, async (session) => {
      await sendDebugRequest(session, getMainWindow, 'systemverilog/layout/close', { sessionId }, {
        timeoutMs: LSP_LAYOUT_TIMEOUT_MS,
      });

      return true;
    });
  });
}
