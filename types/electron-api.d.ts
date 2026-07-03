import type {
  LspCompletionResponse,
  LspCompletionItem,
  LspCallHierarchyIncomingCall,
  LspCallHierarchyItem,
  LspCallHierarchyOutgoingCall,
  LspCodeAction,
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
  LspRange,
  WorkspaceLocation,
} from './systemverilog-lsp';
import type { WorkspaceGitChangeEvent, WorkspaceGitFileDiffPayload, WorkspaceGitStatusPayload } from './workspace-git';
import type { OpenProjectDirectoryDialogResult, OpenThemeDialogResult, SaveDialogResult } from '../electron/ipc/dialog';
import type { MenuCommandEvent } from '../src/app/menu/applicationMenu';
import type { WindowCloseDecision, WindowCloseRequest } from '../src/app/window/windowClose';
import type { FloatingInfoWindowMode } from '../src/app/window/floatingInfoWindow';
import type { AuthView, DesktopAuthSession } from '../src/app/auth/types';
import type { ElectronGpuDiagnostics } from './electron-gpu';
import type { NotificationPublishInput, NotificationRecord } from './notification';
import type { WslEnvironmentStatus, WslStartInput, WslStartResult, WslStopResult } from './wsl';
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
} from './project';

export interface ElectronAPI {
  platform: string;
  arch: string;
  isE2E: boolean;
  versions: {
    electron: string;
    node: string;
    chrome: string;
  };

  // Window control
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  show: () => Promise<void>;
  hide: () => Promise<void>;
  close: () => Promise<void>;
  markWorkspaceReady: () => Promise<boolean>;
  resolveCloseRequest: (requestId: number, decision: WindowCloseDecision) => Promise<boolean>;
  setFloatingInfoWindowVisible: (visible: boolean) => Promise<boolean>;
  setFloatingInfoWindowExpanded: (expanded: boolean) => Promise<boolean>;
  setFloatingInfoWindowMode: (mode: FloatingInfoWindowMode) => Promise<boolean>;
  isMaximized: () => boolean;
  isFullScreen: () => boolean;
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
  onFullScreenChange: (callback: (fullScreen: boolean) => void) => () => void;
  onCloseRequested: (callback: (request: WindowCloseRequest) => void) => () => void;
  onWindowFocus: (callback: () => void) => () => void;
  onWorkspaceChange: (callback: (payload: WorkspaceGitChangeEvent) => void) => () => void;

  gpu: {
    getDiagnostics: () => Promise<ElectronGpuDiagnostics>;
  };

  // File system (project-dir scoped)
  fs: {
    readFile: (filePath: string, encoding?: string) => Promise<string>;
    readFileAbsolute: (filePath: string, encoding?: string) => Promise<string>;
    listFiles: (dirPath?: string) => Promise<string[]>;
    writeFile: (filePath: string, content: string) => Promise<void>;
    writeFileAbsolute: (filePath: string, content: string) => Promise<void>;
    createDirectory: (dirPath: string) => Promise<void>;
    copyFile: (sourcePath: string, destinationPath: string) => Promise<void>;
    copyDirectory: (sourcePath: string, destinationPath: string) => Promise<void>;
    deleteFile: (filePath: string) => Promise<void>;
    deleteDirectory: (dirPath: string) => Promise<void>;
    rename: (currentPath: string, nextPath: string) => Promise<void>;
    readDir: (dirPath: string) => Promise<Array<{
      name: string;
      isDirectory: boolean;
      isFile: boolean;
    }>>;
    stat: (filePath: string) => Promise<{
      size: number;
      isDirectory: boolean;
      isFile: boolean;
      mtime: string;
      ctime: string;
    }>;
    exists: (filePath: string) => Promise<boolean>;
  };

  dialog: {
    showSaveDialog: (defaultPath?: string) => Promise<SaveDialogResult>;
    showOpenThemeDialog: () => Promise<OpenThemeDialogResult>;
    showOpenProjectDirectoryDialog: () => Promise<OpenProjectDirectoryDialogResult>;
  };

  project: {
    createProject: (input: CreateProjectInput) => Promise<ProjectCreateResult>;
    openProject: (rootPath?: string) => Promise<ProjectOpenResult>;
    closeProject: (snapshot?: ProjectSessionSnapshot) => Promise<ProjectCloseResult>;
    getCurrentProject: () => Promise<ProjectState | null>;
    flushSession: (snapshot: ProjectSessionSnapshot) => Promise<void>;
    updateProjectConfig: (input: ProjectUpdateConfigInput) => Promise<ProjectUpdateConfigResult>;
    onProjectChanged: (callback: (payload: ProjectChangedEvent) => void) => () => void;
  };

  git: {
    getStatus: () => Promise<WorkspaceGitStatusPayload>;
    getFileDiff: (filePath: string) => Promise<WorkspaceGitFileDiffPayload>;
  };

  // Shell (isolated subprocess)
  shell: {
    exec: (command: string, args?: string[], options?: { cwd?: string }) => Promise<{
      id: string;
      pid: number | undefined;
    }>;
    kill: (id: string) => Promise<boolean>;
    onStdout: (callback: (data: { id: string; data: string }) => void) => () => void;
    onStderr: (callback: (data: { id: string; data: string }) => void) => () => void;
    onExit: (callback: (data: { id: string; code: number | null; error?: string }) => void) => () => void;
  };

  terminal: {
    create: (options?: { cwd?: string; cols?: number; rows?: number; profile?: 'default' | 'wsl-pristine-eda' }) => Promise<{
      id: string;
      pid: number;
      shell: string;
    }>;
    write: (id: string, data: string) => Promise<boolean>;
    resize: (id: string, cols: number, rows: number) => Promise<boolean>;
    kill: (id: string) => Promise<boolean>;
    onData: (callback: (data: { id: string; data: string }) => void) => () => void;
    onExit: (callback: (data: { id: string; exitCode: number; signal: number }) => void) => () => void;
  };

  wsl: {
    startPristineEdaEnvironment: (input: WslStartInput) => Promise<WslStartResult>;
    stopPristineEdaEnvironment: () => Promise<WslStopResult>;
    getPristineEdaEnvironmentStatus: () => Promise<WslEnvironmentStatus>;
  };

  lsp: {
    ensureInitialized: () => Promise<void>;
    openDocument: (filePath: string, languageId: string, text: string) => Promise<void>;
    changeDocument: (filePath: string, text: string) => Promise<void>;
    closeDocument: (filePath: string) => Promise<void>;
    completion: (
      filePath: string,
      line: number,
      character: number,
      triggerCharacter?: string,
      triggerKind?: number,
    ) => Promise<LspCompletionResponse | null>;
    completionResolve: (item: LspCompletionItem) => Promise<LspCompletionItem | null>;
    hover: (filePath: string, line: number, character: number) => Promise<LspHover | null>;
    definition: (filePath: string, line: number, character: number) => Promise<WorkspaceLocation[]>;
    typeDefinition: (filePath: string, line: number, character: number) => Promise<WorkspaceLocation[]>;
    implementation: (filePath: string, line: number, character: number) => Promise<WorkspaceLocation[]>;
    documentHighlights: (filePath: string, line: number, character: number) => Promise<LspDocumentHighlight[]>;
    documentLinks: (filePath: string) => Promise<LspDocumentLink[]>;
    inlayHints: (filePath: string, range: LspRange) => Promise<LspInlayHint[]>;
    codeActions: (filePath: string, range: LspRange, diagnostics?: LspDiagnostic[]) => Promise<LspCodeAction[]>;
    foldingRanges: (filePath: string) => Promise<LspFoldingRange[]>;
    semanticTokensFull: (filePath: string) => Promise<LspSemanticTokens>;
    selectionRanges: (filePath: string, positions: Array<{ line: number; character: number }>) => Promise<LspSelectionRange[]>;
    signatureHelp: (
      filePath: string,
      line: number,
      character: number,
      triggerCharacter?: string,
      triggerKind?: number,
      isRetrigger?: boolean,
    ) => Promise<LspSignatureHelp | null>;
    documentSymbols: (filePath: string) => Promise<LspDocumentSymbol[]>;
    references: (
      filePath: string,
      line: number,
      character: number,
      includeDeclaration?: boolean,
    ) => Promise<WorkspaceLocation[]>;
    prepareCallHierarchy: (filePath: string, line: number, character: number) => Promise<LspCallHierarchyItem[]>;
    callHierarchyIncoming: (item: LspCallHierarchyItem) => Promise<LspCallHierarchyIncomingCall[]>;
    callHierarchyOutgoing: (item: LspCallHierarchyItem) => Promise<LspCallHierarchyOutgoingCall[]>;
    workspaceSymbols: (query: string) => Promise<LspWorkspaceSymbol[]>;
    prepareRename: (filePath: string, line: number, character: number) => Promise<LspPrepareRenameResult | null>;
    rename: (filePath: string, line: number, character: number, newName: string) => Promise<LspWorkspaceEdit | null>;
    outline: (filePath: string, options?: LspOutlineOptions) => Promise<LspOutlineResult>;
    moduleHierarchy: (options?: LspModuleHierarchyOptions) => Promise<LspModuleHierarchy>;
    schematic: (options?: LspSchematicOptions) => Promise<LspSchematic>;
    waveformOpen: () => Promise<LspWaveformOpenResult>;
    waveformFrame: (options: LspWaveformFrameOptions) => Promise<ArrayBuffer>;
    waveformClose: (sessionId: string) => Promise<boolean>;
    layoutOpen: (options?: LspLayoutOpenOptions) => Promise<LspLayoutOpenResult>;
    layoutGeometry: (options: LspLayoutGeometryOptions) => Promise<LspLayoutGeometry>;
    layoutStatus: (sessionId: string) => Promise<LspLayoutStatus>;
    layoutCatalogSummary: (sessionId: string) => Promise<LspLayoutCatalogSummary>;
    layoutCatalogPage: (options: LspLayoutCatalogPageOptions) => Promise<LspLayoutCatalogPage>;
    layoutTileGeometry: (options: LspLayoutTileGeometryOptions) => Promise<LspLayoutTileGeometry>;
    layoutClose: (sessionId: string) => Promise<boolean>;
    getDebugEvents: () => Promise<LspDebugEvent[]>;
    onDebug: (callback: (payload: LspDebugEvent) => void) => () => void;
    onDiagnostics: (callback: (payload: LspDiagnosticsEvent) => void) => () => void;
    onState: (callback: (payload: LspStateEvent) => void) => () => void;
  };

  menu: {
    onCommand: (callback: (payload: MenuCommandEvent) => void) => () => void;
  };

  notices: {
    revealBundledFiles: () => Promise<boolean>;
  };

  notifications: {
    publish: (input: NotificationPublishInput) => Promise<NotificationRecord>;
    dismiss: (id: string) => Promise<void>;
    getHistory: () => Promise<NotificationRecord[]>;
    onHistoryChanged: (callback: (records: NotificationRecord[]) => void) => () => void;
  };

  auth: {
    openAccountPage: (view: AuthView) => Promise<boolean>;
    getSession: () => Promise<DesktopAuthSession | null>;
    signOut: () => Promise<boolean>;
    syncCloudConfig: () => Promise<boolean>;
    onStateChanged: (callback: (session: DesktopAuthSession | null) => void) => () => void;
    onError: (callback: (message: string) => void) => () => void;
  };

  // Config
  config: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => Promise<void>;
    onDidChange: (callback: (key: string, value: unknown) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
