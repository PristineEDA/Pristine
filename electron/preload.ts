import { contextBridge, ipcRenderer } from 'electron';
import { SyncChannels, AsyncChannels, StreamChannels } from './ipc/channels.js';
import type { OpenProjectDirectoryDialogResult, OpenThemeDialogResult, SaveDialogResult } from './ipc/dialog.js';
import type {
  LspCallHierarchyIncomingCall,
  LspCallHierarchyItem,
  LspCallHierarchyOutgoingCall,
  LspCodeAction,
  LspCompletionItem,
  LspCompletionResponse,
  LspDebugEvent,
  LspDiagnostic,
  LspDiagnosticsEvent,
  LspDocumentHighlight,
  LspDocumentLink,
  LspDocumentSymbol,
  LspFoldingRange,
  LspHover,
  LspInlayHint,
  LspLayoutGeometry,
  LspLayoutGeometryOptions,
  LspLayoutCatalogPage,
  LspLayoutCatalogPageOptions,
  LspLayoutCatalogSummary,
  LspLayoutOpenOptions,
  LspLayoutOpenResult,
  LspLayoutStatus,
  LspLayoutTileGeometry,
  LspLayoutTileGeometryOptions,
  LspModuleHierarchy,
  LspModuleHierarchyOptions,
  LspOutlineOptions,
  LspOutlineResult,
  LspPrepareRenameResult,
  LspRange,
  LspSchematic,
  LspSchematicOptions,
  LspWaveformFrameOptions,
  LspWaveformOpenResult,
  LspSelectionRange,
  LspSemanticTokens,
  LspSignatureHelp,
  LspStateEvent,
  LspWorkspaceEdit,
  LspWorkspaceSymbol,
  WorkspaceLocation,
} from '../types/systemverilog-lsp.js';
import type { WorkspaceGitChangeEvent, WorkspaceGitFileDiffPayload, WorkspaceGitStatusPayload } from '../types/workspace-git.js';
import type { MenuCommandEvent } from '../src/app/menu/applicationMenu.js';
import type { WindowCloseDecision, WindowCloseRequest } from '../src/app/window/windowClose.js';
import type { FloatingInfoWindowMode } from '../src/app/window/floatingInfoWindow.js';
import type { AuthView, DesktopAuthSession } from '../src/app/auth/types.js';
import type { ElectronGpuDiagnostics } from '../types/electron-gpu.js';
import type { NotificationPublishInput, NotificationRecord } from '../types/notification.js';
import type { WslEnvironmentStatus, WslStartInput, WslStartResult, WslStopResult } from '../types/wsl.js';
import type {
  CreateProjectInput,
  ProjectChangedEvent,
  ProjectCloseResult,
  ProjectCreateResult,
  ProjectOpenResult,
  ProjectSessionSnapshot,
  ProjectState,
  ProjectUpdateConfigInput,
  ProjectUpdateConfigResult,
} from '../types/project.js';

// ─── Sync Helpers ─────────────────────────────────────────────────────────────

function syncSend<T>(channel: string, ...args: unknown[]): T {
  return ipcRenderer.sendSync(channel, ...args) as T;
}

// ─── Platform Info (local preload process data) ───────────────────────────────

const platformInfo = {
  platform: process.platform,
  arch: process.arch,
  isE2E: process.env['PRISTINE_E2E'] === '1',
  versions: {
    electron: process.versions['electron'],
    node: process.versions['node'],
    chrome: process.versions['chrome'],
  },
};

// ─── Exposed API ──────────────────────────────────────────────────────────────

const electronAPI = {
  platform: platformInfo.platform,
  arch: platformInfo.arch,
  versions: platformInfo.versions,
  isE2E: platformInfo.isE2E,

  // ── Window Control (async) ──
  minimize: () => ipcRenderer.invoke(AsyncChannels.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.invoke(AsyncChannels.WINDOW_MAXIMIZE),
  show: () => ipcRenderer.invoke(AsyncChannels.WINDOW_SHOW),
  hide: () => ipcRenderer.invoke(AsyncChannels.WINDOW_HIDE),
  close: () => ipcRenderer.invoke(AsyncChannels.WINDOW_CLOSE),
  markWorkspaceReady: () => ipcRenderer.invoke(AsyncChannels.WINDOW_MARK_WORKSPACE_READY) as Promise<boolean>,
  resolveCloseRequest: (requestId: number, decision: WindowCloseDecision) =>
    ipcRenderer.invoke(AsyncChannels.WINDOW_RESOLVE_CLOSE_REQUEST, requestId, decision) as Promise<boolean>,
  setFloatingInfoWindowVisible: (visible: boolean) =>
    ipcRenderer.invoke(AsyncChannels.WINDOW_SET_FLOATING_INFO_VISIBILITY, visible),
  setFloatingInfoWindowExpanded: (expanded: boolean) =>
    ipcRenderer.invoke(AsyncChannels.WINDOW_SET_FLOATING_INFO_EXPANDED, expanded),
  setFloatingInfoWindowMode: (mode: FloatingInfoWindowMode) =>
    ipcRenderer.invoke(AsyncChannels.WINDOW_SET_FLOATING_INFO_MODE, mode),
  isMaximized: (): boolean => syncSend(SyncChannels.WINDOW_IS_MAXIMIZED),
  isFullScreen: (): boolean => syncSend(SyncChannels.WINDOW_IS_FULLSCREEN),
  onMaximizedChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on(StreamChannels.WINDOW_MAXIMIZED_CHANGE, handler);
    return () => { ipcRenderer.removeListener(StreamChannels.WINDOW_MAXIMIZED_CHANGE, handler); };
  },
  onFullScreenChange: (callback: (fullScreen: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fullScreen: boolean) => callback(fullScreen);
    ipcRenderer.on(StreamChannels.WINDOW_FULLSCREEN_CHANGE, handler);
    return () => { ipcRenderer.removeListener(StreamChannels.WINDOW_FULLSCREEN_CHANGE, handler); };
  },
  onCloseRequested: (callback: (request: WindowCloseRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: WindowCloseRequest) => callback(request);
    ipcRenderer.on(StreamChannels.WINDOW_CLOSE_REQUEST, handler);
    return () => { ipcRenderer.removeListener(StreamChannels.WINDOW_CLOSE_REQUEST, handler); };
  },
  onWindowFocus: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(StreamChannels.WINDOW_FOCUS, handler);
    return () => { ipcRenderer.removeListener(StreamChannels.WINDOW_FOCUS, handler); };
  },
  onWorkspaceChange: (callback: (payload: WorkspaceGitChangeEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: WorkspaceGitChangeEvent) => callback(payload);
    ipcRenderer.on(StreamChannels.WORKSPACE_CHANGE, handler);
    return () => { ipcRenderer.removeListener(StreamChannels.WORKSPACE_CHANGE, handler); };
  },

  gpu: {
    getDiagnostics: () =>
      ipcRenderer.invoke(AsyncChannels.PLATFORM_GET_GPU_DIAGNOSTICS) as Promise<ElectronGpuDiagnostics>,
  },

  // ── File System (async, project-dir scoped) ──
  fs: {
    readFile: (filePath: string, encoding?: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_READ_FILE, filePath, encoding) as Promise<string>,
    readFileAbsolute: (filePath: string, encoding?: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_READ_FILE_ABSOLUTE, filePath, encoding) as Promise<string>,
    listFiles: (dirPath = '.') =>
      ipcRenderer.invoke(AsyncChannels.FS_LIST_FILES, dirPath) as Promise<string[]>,
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_WRITE_FILE, filePath, content) as Promise<void>,
    writeFileAbsolute: (filePath: string, content: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_WRITE_FILE_ABSOLUTE, filePath, content) as Promise<void>,
    createDirectory: (dirPath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_CREATE_DIRECTORY, dirPath) as Promise<void>,
    copyFile: (sourcePath: string, destinationPath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_COPY_FILE, sourcePath, destinationPath) as Promise<void>,
    copyDirectory: (sourcePath: string, destinationPath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_COPY_DIRECTORY, sourcePath, destinationPath) as Promise<void>,
    deleteFile: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_DELETE_FILE, filePath) as Promise<void>,
    deleteDirectory: (dirPath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_DELETE_DIRECTORY, dirPath) as Promise<void>,
    rename: (currentPath: string, nextPath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_RENAME, currentPath, nextPath) as Promise<void>,
    readDir: (dirPath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_READ_DIR, dirPath) as Promise<
        Array<{ name: string; isDirectory: boolean; isFile: boolean }>
      >,
    stat: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_STAT, filePath) as Promise<{
        size: number;
        isDirectory: boolean;
        isFile: boolean;
        mtime: string;
        ctime: string;
      }>,
    exists: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.FS_EXISTS, filePath) as Promise<boolean>,
  },

  dialog: {
    showSaveDialog: (defaultPath?: string) =>
      ipcRenderer.invoke(AsyncChannels.DIALOG_SHOW_SAVE, defaultPath) as Promise<SaveDialogResult>,
    showOpenThemeDialog: () =>
      ipcRenderer.invoke(AsyncChannels.DIALOG_SHOW_OPEN_THEME) as Promise<OpenThemeDialogResult>,
    showOpenProjectDirectoryDialog: () =>
      ipcRenderer.invoke(AsyncChannels.DIALOG_SHOW_OPEN_PROJECT_DIRECTORY) as Promise<OpenProjectDirectoryDialogResult>,
  },

  project: {
    createProject: (input: CreateProjectInput) =>
      ipcRenderer.invoke(AsyncChannels.PROJECT_CREATE, input) as Promise<ProjectCreateResult>,
    openProject: (rootPath?: string) =>
      ipcRenderer.invoke(AsyncChannels.PROJECT_OPEN, rootPath) as Promise<ProjectOpenResult>,
    closeProject: (snapshot?: ProjectSessionSnapshot) =>
      ipcRenderer.invoke(AsyncChannels.PROJECT_CLOSE, snapshot) as Promise<ProjectCloseResult>,
    getCurrentProject: () =>
      ipcRenderer.invoke(AsyncChannels.PROJECT_GET_CURRENT) as Promise<ProjectState | null>,
    flushSession: (snapshot: ProjectSessionSnapshot) =>
      ipcRenderer.invoke(AsyncChannels.PROJECT_FLUSH_SESSION, snapshot) as Promise<void>,
    updateProjectConfig: (input: ProjectUpdateConfigInput) =>
      ipcRenderer.invoke(AsyncChannels.PROJECT_UPDATE_CONFIG, input) as Promise<ProjectUpdateConfigResult>,
    onProjectChanged: (callback: (payload: ProjectChangedEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: ProjectChangedEvent) => callback(payload);
      ipcRenderer.on(StreamChannels.PROJECT_CHANGED, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.PROJECT_CHANGED, handler); };
    },
  },

  git: {
    getStatus: () =>
      ipcRenderer.invoke(AsyncChannels.GIT_GET_STATUS) as Promise<WorkspaceGitStatusPayload>,
    getFileDiff: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.GIT_GET_FILE_DIFF, filePath) as Promise<WorkspaceGitFileDiffPayload>,
  },

  // ── Shell (async + stream) ──
  shell: {
    exec: (command: string, args?: string[], options?: { cwd?: string }) =>
      ipcRenderer.invoke(AsyncChannels.SHELL_EXEC, command, args, options) as Promise<{
        id: string;
        pid: number | undefined;
      }>,
    kill: (id: string) =>
      ipcRenderer.invoke(AsyncChannels.SHELL_KILL, id) as Promise<boolean>,
    onStdout: (callback: (data: { id: string; data: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) =>
        callback(payload);
      ipcRenderer.on(StreamChannels.SHELL_STDOUT, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.SHELL_STDOUT, handler); };
    },
    onStderr: (callback: (data: { id: string; data: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) =>
        callback(payload);
      ipcRenderer.on(StreamChannels.SHELL_STDERR, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.SHELL_STDERR, handler); };
    },
    onExit: (callback: (data: { id: string; code: number | null; error?: string }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; code: number | null; error?: string },
      ) => callback(payload);
      ipcRenderer.on(StreamChannels.SHELL_EXIT, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.SHELL_EXIT, handler); };
    },
  },

  terminal: {
    create: (options?: { cwd?: string; cols?: number; rows?: number; profile?: 'default' | 'wsl-pristine-eda' }) =>
      ipcRenderer.invoke(AsyncChannels.TERMINAL_CREATE, options) as Promise<{
        id: string;
        pid: number;
        shell: string;
      }>,
    write: (id: string, data: string) =>
      ipcRenderer.invoke(AsyncChannels.TERMINAL_WRITE, id, data) as Promise<boolean>,
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke(AsyncChannels.TERMINAL_RESIZE, id, cols, rows) as Promise<boolean>,
    kill: (id: string) =>
      ipcRenderer.invoke(AsyncChannels.TERMINAL_KILL, id) as Promise<boolean>,
    onData: (callback: (data: { id: string; data: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) =>
        callback(payload);
      ipcRenderer.on(StreamChannels.TERMINAL_DATA, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.TERMINAL_DATA, handler); };
    },
    onExit: (callback: (data: { id: string; exitCode: number; signal: number }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; exitCode: number; signal: number },
      ) => callback(payload);
      ipcRenderer.on(StreamChannels.TERMINAL_EXIT, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.TERMINAL_EXIT, handler); };
    },
  },

  wsl: {
    startPristineEdaEnvironment: (input: WslStartInput) =>
      ipcRenderer.invoke(AsyncChannels.WSL_START_PRISTINE_EDA_ENVIRONMENT, input) as Promise<WslStartResult>,
    stopPristineEdaEnvironment: () =>
      ipcRenderer.invoke(AsyncChannels.WSL_STOP_PRISTINE_EDA_ENVIRONMENT) as Promise<WslStopResult>,
    getPristineEdaEnvironmentStatus: () =>
      ipcRenderer.invoke(AsyncChannels.WSL_GET_PRISTINE_EDA_ENVIRONMENT_STATUS) as Promise<WslEnvironmentStatus>,
  },

  lsp: {
    ensureInitialized: () =>
      ipcRenderer.invoke(AsyncChannels.LSP_ENSURE_INITIALIZED) as Promise<void>,
    openDocument: (filePath: string, languageId: string, text: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_OPEN_DOCUMENT, filePath, languageId, text) as Promise<void>,
    changeDocument: (filePath: string, text: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_CHANGE_DOCUMENT, filePath, text) as Promise<void>,
    closeDocument: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_CLOSE_DOCUMENT, filePath) as Promise<void>,
    completion: (
      filePath: string,
      line: number,
      character: number,
      triggerCharacter?: string,
      triggerKind?: number,
    ) => ipcRenderer.invoke(
      AsyncChannels.LSP_COMPLETION,
      filePath,
      line,
      character,
      triggerCharacter,
      triggerKind,
    ) as Promise<LspCompletionResponse | null>,
    completionResolve: (item: LspCompletionItem) =>
      ipcRenderer.invoke(AsyncChannels.LSP_COMPLETION_RESOLVE, item) as Promise<LspCompletionItem | null>,
    hover: (filePath: string, line: number, character: number) =>
      ipcRenderer.invoke(AsyncChannels.LSP_HOVER, filePath, line, character) as Promise<LspHover | null>,
    definition: (filePath: string, line: number, character: number) =>
      ipcRenderer.invoke(AsyncChannels.LSP_DEFINITION, filePath, line, character) as Promise<WorkspaceLocation[]>,
    typeDefinition: (filePath: string, line: number, character: number) =>
      ipcRenderer.invoke(AsyncChannels.LSP_TYPE_DEFINITION, filePath, line, character) as Promise<WorkspaceLocation[]>,
    implementation: (filePath: string, line: number, character: number) =>
      ipcRenderer.invoke(AsyncChannels.LSP_IMPLEMENTATION, filePath, line, character) as Promise<WorkspaceLocation[]>,
    documentHighlights: (filePath: string, line: number, character: number) =>
      ipcRenderer.invoke(AsyncChannels.LSP_DOCUMENT_HIGHLIGHTS, filePath, line, character) as Promise<LspDocumentHighlight[]>,
    documentLinks: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_DOCUMENT_LINKS, filePath) as Promise<LspDocumentLink[]>,
    inlayHints: (filePath: string, range: LspRange) =>
      ipcRenderer.invoke(AsyncChannels.LSP_INLAY_HINTS, filePath, range) as Promise<LspInlayHint[]>,
    codeActions: (filePath: string, range: LspRange, diagnostics: LspDiagnostic[] = []) =>
      ipcRenderer.invoke(AsyncChannels.LSP_CODE_ACTIONS, filePath, range, diagnostics) as Promise<LspCodeAction[]>,
    foldingRanges: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_FOLDING_RANGES, filePath) as Promise<LspFoldingRange[]>,
    semanticTokensFull: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_SEMANTIC_TOKENS_FULL, filePath) as Promise<LspSemanticTokens>,
    selectionRanges: (filePath: string, positions: Array<{ line: number; character: number }>) =>
      ipcRenderer.invoke(AsyncChannels.LSP_SELECTION_RANGES, filePath, positions) as Promise<LspSelectionRange[]>,
    signatureHelp: (
      filePath: string,
      line: number,
      character: number,
      triggerCharacter?: string,
      triggerKind?: number,
      isRetrigger?: boolean,
    ) => ipcRenderer.invoke(
      AsyncChannels.LSP_SIGNATURE_HELP,
      filePath,
      line,
      character,
      triggerCharacter,
      triggerKind,
      isRetrigger,
    ) as Promise<LspSignatureHelp | null>,
    documentSymbols: (filePath: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_DOCUMENT_SYMBOLS, filePath) as Promise<LspDocumentSymbol[]>,
    references: (filePath: string, line: number, character: number, includeDeclaration = true) =>
      ipcRenderer.invoke(
        AsyncChannels.LSP_REFERENCES,
        filePath,
        line,
        character,
        includeDeclaration,
      ) as Promise<WorkspaceLocation[]>,
    prepareCallHierarchy: (filePath: string, line: number, character: number) =>
      ipcRenderer.invoke(AsyncChannels.LSP_PREPARE_CALL_HIERARCHY, filePath, line, character) as Promise<LspCallHierarchyItem[]>,
    callHierarchyIncoming: (item: LspCallHierarchyItem) =>
      ipcRenderer.invoke(AsyncChannels.LSP_CALL_HIERARCHY_INCOMING, item) as Promise<LspCallHierarchyIncomingCall[]>,
    callHierarchyOutgoing: (item: LspCallHierarchyItem) =>
      ipcRenderer.invoke(AsyncChannels.LSP_CALL_HIERARCHY_OUTGOING, item) as Promise<LspCallHierarchyOutgoingCall[]>,
    workspaceSymbols: (query: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_WORKSPACE_SYMBOLS, query) as Promise<LspWorkspaceSymbol[]>,
    prepareRename: (filePath: string, line: number, character: number) =>
      ipcRenderer.invoke(AsyncChannels.LSP_PREPARE_RENAME, filePath, line, character) as Promise<LspPrepareRenameResult | null>,
    rename: (filePath: string, line: number, character: number, newName: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_RENAME, filePath, line, character, newName) as Promise<LspWorkspaceEdit | null>,
    outline: (filePath: string, options?: LspOutlineOptions) =>
      ipcRenderer.invoke(AsyncChannels.LSP_OUTLINE, filePath, options) as Promise<LspOutlineResult>,
    moduleHierarchy: (options?: LspModuleHierarchyOptions) =>
      ipcRenderer.invoke(AsyncChannels.LSP_MODULE_HIERARCHY, options) as Promise<LspModuleHierarchy>,
    schematic: (options?: LspSchematicOptions) =>
      ipcRenderer.invoke(AsyncChannels.LSP_SCHEMATIC, options) as Promise<LspSchematic>,
    waveformOpen: () =>
      ipcRenderer.invoke(AsyncChannels.LSP_WAVEFORM_OPEN) as Promise<LspWaveformOpenResult>,
    waveformFrame: (options: LspWaveformFrameOptions) =>
      ipcRenderer.invoke(AsyncChannels.LSP_WAVEFORM_FRAME, options) as Promise<ArrayBuffer>,
    waveformClose: (sessionId: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_WAVEFORM_CLOSE, sessionId) as Promise<boolean>,
    layoutOpen: (options?: LspLayoutOpenOptions) =>
      ipcRenderer.invoke(AsyncChannels.LSP_LAYOUT_OPEN, options) as Promise<LspLayoutOpenResult>,
    layoutGeometry: (options: LspLayoutGeometryOptions) =>
      ipcRenderer.invoke(AsyncChannels.LSP_LAYOUT_GEOMETRY, options) as Promise<LspLayoutGeometry>,
    layoutStatus: (sessionId: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_LAYOUT_STATUS, sessionId) as Promise<LspLayoutStatus>,
    layoutCatalogSummary: (sessionId: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_LAYOUT_CATALOG_SUMMARY, sessionId) as Promise<LspLayoutCatalogSummary>,
    layoutCatalogPage: (options: LspLayoutCatalogPageOptions) =>
      ipcRenderer.invoke(AsyncChannels.LSP_LAYOUT_CATALOG_PAGE, options) as Promise<LspLayoutCatalogPage>,
    layoutTileGeometry: (options: LspLayoutTileGeometryOptions) =>
      ipcRenderer.invoke(AsyncChannels.LSP_LAYOUT_TILE_GEOMETRY, options) as Promise<LspLayoutTileGeometry>,
    layoutClose: (sessionId: string) =>
      ipcRenderer.invoke(AsyncChannels.LSP_LAYOUT_CLOSE, sessionId) as Promise<boolean>,
    getDebugEvents: () =>
      ipcRenderer.invoke(AsyncChannels.LSP_GET_DEBUG_EVENTS) as Promise<LspDebugEvent[]>,
    onDiagnostics: (callback: (payload: LspDiagnosticsEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: LspDiagnosticsEvent) => callback(payload);
      ipcRenderer.on(StreamChannels.LSP_DIAGNOSTICS, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.LSP_DIAGNOSTICS, handler); };
    },
    onDebug: (callback: (payload: LspDebugEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: LspDebugEvent) => callback(payload);
      ipcRenderer.on(StreamChannels.LSP_DEBUG, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.LSP_DEBUG, handler); };
    },
    onState: (callback: (payload: LspStateEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: LspStateEvent) => callback(payload);
      ipcRenderer.on(StreamChannels.LSP_STATE, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.LSP_STATE, handler); };
    },
  },

  menu: {
    onCommand: (callback: (payload: MenuCommandEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: MenuCommandEvent) => callback(payload);
      ipcRenderer.on(StreamChannels.MENU_COMMAND, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.MENU_COMMAND, handler); };
    },
  },

  notices: {
    revealBundledFiles: () =>
      ipcRenderer.invoke(AsyncChannels.NOTICES_REVEAL_BUNDLED_FILES) as Promise<boolean>,
  },

  notifications: {
    publish: (input: NotificationPublishInput) =>
      ipcRenderer.invoke(AsyncChannels.NOTIFICATIONS_PUBLISH, input) as Promise<NotificationRecord>,
    dismiss: (id: string) =>
      ipcRenderer.invoke(AsyncChannels.NOTIFICATIONS_DISMISS, id) as Promise<void>,
    getHistory: () =>
      ipcRenderer.invoke(AsyncChannels.NOTIFICATIONS_GET_HISTORY) as Promise<NotificationRecord[]>,
    onHistoryChanged: (callback: (records: NotificationRecord[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, records: NotificationRecord[]) => callback(records);
      ipcRenderer.on(StreamChannels.NOTIFICATIONS_HISTORY_CHANGED, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.NOTIFICATIONS_HISTORY_CHANGED, handler); };
    },
  },

  auth: {
    openAccountPage: (view: AuthView) =>
      ipcRenderer.invoke(AsyncChannels.AUTH_OPEN_ACCOUNT_PAGE, view) as Promise<boolean>,
    getSession: () =>
      ipcRenderer.invoke(AsyncChannels.AUTH_GET_SESSION) as Promise<DesktopAuthSession | null>,
    signOut: () =>
      ipcRenderer.invoke(AsyncChannels.AUTH_SIGN_OUT) as Promise<boolean>,
    syncCloudConfig: () =>
      ipcRenderer.invoke(AsyncChannels.AUTH_SYNC_CONFIG) as Promise<boolean>,
    onStateChanged: (callback: (session: DesktopAuthSession | null) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, session: DesktopAuthSession | null) => callback(session);
      ipcRenderer.on(StreamChannels.AUTH_STATE_CHANGED, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.AUTH_STATE_CHANGED, handler); };
    },
    onError: (callback: (message: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on(StreamChannels.AUTH_ERROR, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.AUTH_ERROR, handler); };
    },
  },

  // ── Config (sync get, async set) ──
  config: {
    get: (key: string): unknown => syncSend(SyncChannels.CONFIG_GET, key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke(AsyncChannels.CONFIG_SET, key, value) as Promise<void>,
    onDidChange: (callback: (key: string, value: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { key: string; value: unknown }) =>
        callback(payload.key, payload.value);
      ipcRenderer.on(StreamChannels.CONFIG_CHANGED, handler);
      return () => { ipcRenderer.removeListener(StreamChannels.CONFIG_CHANGED, handler); };
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
