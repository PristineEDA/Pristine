import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from 'react';
import {
  type EditorTabCycleDirection,
  type EditorDropPosition,
  type EditorGroup,
  type EditorLayoutNode,
  type EditorTab,
  isGitDiffEditorTab,
} from '../editor/editorLayout';
import {
  canToggleLayoutPanels,
  type CodeView,
  EMPTY_PANEL_STATE,
  type MainContentView,
  type PanelVisibilityState,
} from '../codeViewPanels';
import {
  useWorkspaceEditorState,
  type CursorRestoreRequest,
  type EditorSelectionSnapshot,
} from './useWorkspaceEditorState';
import { useWorkspaceFileStore, type SaveFilesResult } from './useWorkspaceFileStore';
import { useWorkspaceSessionStore } from './useWorkspaceSessionStore';
import { useBottomPanelStore } from '../components/code/explorer/useBottomPanelStore';
import { useSidePanelSessionStore } from '../components/code/explorer/useSidePanelSessionStore';
import { useExplorerTreeSessionStore } from '../workspace/useExplorerTreeSessionStore';
import { stopWslDevelopmentEnvironmentAndRestore } from '../wsl/wslDevelopmentEnvironmentLifecycle';
import type { WindowCloseRequest } from '../window/windowClose';
import { refreshWorkspaceGitStatus } from '../git/workspaceGitStatus';
import {
  createWorkspaceCopyName,
  getPathBaseName,
  getWorkspaceParentPath,
  isWithinWorkspacePath,
  isWorkspaceRelativeFilePath,
  joinWorkspacePath,
  replaceWorkspacePathPrefix,
  type WorkspaceClipboardMode,
  type WorkspaceClipboardState,
  type WorkspaceEntryType,
} from '../workspace/workspaceFiles';
import type { ProjectSessionSnapshot, ProjectState } from '../../../types/project';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Tab = EditorTab;

type UnsavedChangesDialogKind = 'close-app' | 'close-file' | 'review' | 'delete-entry' | 'copy-entry' | 'cut-entry';
type SaveFilesOptions = {
  contentOverrides?: Record<string, string>;
};

export interface UnsavedChangesDialogState {
  fileIds: string[];
  kind: UnsavedChangesDialogKind;
  title: string;
  description: string;
}

export interface DeleteConfirmationDialogState {
  targetPath: string;
  entryType: 'file' | 'folder';
  title: string;
  description: string;
  isSubmitting: boolean;
  errorMessage: string | null;
}

interface WorkspaceFileDeleteTarget {
  fileId: string;
  groupId: string;
}

interface WorkspacePasteResult {
  path: string;
  entryType: WorkspaceEntryType;
}

interface WorkspaceState {
  currentProject: ProjectState | null;
  hasOpenProject: boolean;
  workspaceBootstrapStatus: 'bootstrapping' | 'ready';
  captureProjectSessionSnapshot: () => ProjectSessionSnapshot;
  flushProjectSession: () => Promise<void>;
  openProject: () => Promise<void>;
  closeProject: () => Promise<void>;
  projectPanelWidths: Record<string, number>;
  setProjectPanelWidth: (key: string, value: number | ((current: number | undefined) => number)) => void;

  activeView: CodeView;
  setActiveView: (view: CodeView) => void;

  mainContentView: MainContentView;
  setMainContentView: (view: MainContentView) => void;
  canToggleLayoutPanels: boolean;

  editorGroups: EditorGroup[];
  editorLayout: EditorLayoutNode | null;
  focusedGroupId: string | null;
  focusGroup: (groupId: string) => void;
  focusActiveEditor: (groupId?: string) => void;
  splitGroup: (groupId: string, direction?: 'horizontal' | 'vertical') => void;
  moveTab: (sourceGroupId: string, tabId: string, targetGroupId: string, position: EditorDropPosition) => void;
  cycleFocusedGroupTabs: (direction?: EditorTabCycleDirection) => void;
  closeActiveTabInFocusedGroup: () => void;

  tabs: Tab[];
  activeTabId: string;
  openFile: (fileId: string, fileName: string) => void;
  resolveFileId: (fileId: string) => string;
  openFileInGroup: (fileId: string, fileName: string, groupId: string) => void;
  openGitDiff: (fileId: string, fileName: string) => void;
  openGitDiffInGroup: (fileId: string, fileName: string, groupId: string) => void;
  openUntitledFile: (groupId?: string) => string;
  openPreviewFile: (fileId: string, fileName: string) => void;
  openPreviewFileInGroup: (fileId: string, fileName: string, groupId: string) => void;
  createWorkspaceFile: (targetPath: string) => Promise<void>;
  createWorkspaceFolder: (targetPath: string) => Promise<void>;
  workspaceClipboard: WorkspaceClipboardState | null;
  copyWorkspaceEntry: (targetPath: string, entryType: WorkspaceEntryType) => Promise<boolean>;
  cutWorkspaceEntry: (targetPath: string, entryType: WorkspaceEntryType) => Promise<boolean>;
  clearWorkspaceClipboard: () => void;
  pasteWorkspaceEntry: (destinationFolderPath: string) => Promise<WorkspacePasteResult | null>;
  deleteWorkspaceEntry: (targetPath: string, entryType: 'file' | 'folder') => Promise<boolean>;
  renameWorkspaceEntry: (currentPath: string, nextPath: string, entryType: 'file' | 'folder') => Promise<void>;
  pinTab: (tabId: string) => void;
  pinTabInGroup: (groupId: string, tabId: string) => void;
  closeFile: (fileId: string) => void;
  closeFileInGroup: (groupId: string, fileId: string) => void;
  setActiveTabId: (id: string) => void;
  setActiveTabIdInGroup: (groupId: string, id: string) => void;

  jumpToLine: number | undefined;
  jumpTo: (line: number) => void;

  cursorLine: number;
  cursorCol: number;
  setCursorPos: (line: number, col: number, groupId?: string, fileId?: string) => void;
  getStoredCursorPosition: (groupId: string, fileId: string) => { line: number; col: number } | undefined;
  getCursorRestoreRequest: (groupId: string) => CursorRestoreRequest | undefined;
  clearCursorRestoreRequest: (groupId: string, token: number) => void;
  captureEditorSelectionSnapshot: (groupId?: string, fileId?: string) => EditorSelectionSnapshot | null;
  restoreEditorSelection: (snapshot: EditorSelectionSnapshot) => void;

  showLeftPanel: boolean;
  setShowLeftPanel: (show: boolean) => void;
  showBottomPanel: boolean;
  setShowBottomPanel: (show: boolean) => void;
  showRightPanel: boolean;
  setShowRightPanel: (show: boolean) => void;
  workspaceTreeRefreshToken: number;

  fileContents: Record<string, string>;
  loadingFiles: Record<string, boolean>;
  loadErrors: Record<string, string>;
  loadFileContent: (fileId: string) => void;
  updateFileContent: (fileId: string, content: string) => void;
  updateFileContentInGroup: (groupId: string, fileId: string, content: string) => void;
  dirtyFiles: Record<string, boolean>;
  dirtyFileIds: string[];
  savingFiles: Record<string, boolean>;
  saveErrors: Record<string, string>;
  saveActiveFile: () => Promise<boolean>;
  saveAllFiles: () => Promise<boolean>;
  saveFiles: (fileIds: string[]) => Promise<SaveFilesResult>;
  undoActiveEditor: () => Promise<boolean>;
  redoActiveEditor: () => Promise<boolean>;

  unsavedChangesDialog: UnsavedChangesDialogState | null;
  openUnsavedChangesDialog: (fileIds?: string[]) => void;
  confirmUnsavedChangesSave: (fileIds?: string[]) => Promise<void>;
  discardUnsavedChanges: (fileIds?: string[]) => void;
  cancelUnsavedChanges: () => void;

  deleteConfirmationDialog: DeleteConfirmationDialogState | null;
  confirmDeleteConfirmation: () => Promise<void>;
  cancelDeleteConfirmation: () => void;

  editorRef: React.MutableRefObject<any>;
  registerEditorRef: (groupId: string, editorInstance: any) => void;
}

type WorkspaceViewState = Pick<
  WorkspaceState,
  | 'currentProject'
  | 'hasOpenProject'
  | 'workspaceBootstrapStatus'
  | 'activeView'
  | 'setActiveView'
  | 'mainContentView'
  | 'setMainContentView'
  | 'canToggleLayoutPanels'
  | 'showLeftPanel'
  | 'setShowLeftPanel'
  | 'showBottomPanel'
  | 'setShowBottomPanel'
  | 'showRightPanel'
  | 'setShowRightPanel'
  | 'workspaceTreeRefreshToken'
>;

type WorkspaceProjectState = Pick<
  WorkspaceState,
  | 'currentProject'
  | 'hasOpenProject'
  | 'workspaceBootstrapStatus'
  | 'captureProjectSessionSnapshot'
  | 'flushProjectSession'
  | 'openProject'
  | 'closeProject'
  | 'projectPanelWidths'
  | 'setProjectPanelWidth'
>;

type WorkspaceEditorState = Pick<
  WorkspaceState,
  | 'editorGroups'
  | 'editorLayout'
  | 'focusedGroupId'
  | 'focusGroup'
  | 'focusActiveEditor'
  | 'splitGroup'
  | 'moveTab'
  | 'cycleFocusedGroupTabs'
  | 'closeActiveTabInFocusedGroup'
  | 'tabs'
  | 'activeTabId'
  | 'openFile'
  | 'resolveFileId'
  | 'openFileInGroup'
  | 'openGitDiff'
  | 'openGitDiffInGroup'
  | 'openUntitledFile'
  | 'openPreviewFile'
  | 'openPreviewFileInGroup'
  | 'pinTab'
  | 'pinTabInGroup'
  | 'closeFile'
  | 'closeFileInGroup'
  | 'setActiveTabId'
  | 'setActiveTabIdInGroup'
  | 'jumpToLine'
  | 'jumpTo'
  | 'cursorLine'
  | 'cursorCol'
  | 'setCursorPos'
  | 'getStoredCursorPosition'
  | 'getCursorRestoreRequest'
  | 'clearCursorRestoreRequest'
  | 'captureEditorSelectionSnapshot'
  | 'restoreEditorSelection'
  | 'undoActiveEditor'
  | 'redoActiveEditor'
  | 'editorRef'
  | 'registerEditorRef'
>;

type WorkspaceFileState = Pick<
  WorkspaceState,
  | 'createWorkspaceFile'
  | 'createWorkspaceFolder'
  | 'workspaceClipboard'
  | 'copyWorkspaceEntry'
  | 'cutWorkspaceEntry'
  | 'clearWorkspaceClipboard'
  | 'pasteWorkspaceEntry'
  | 'deleteWorkspaceEntry'
  | 'renameWorkspaceEntry'
  | 'fileContents'
  | 'loadingFiles'
  | 'loadErrors'
  | 'loadFileContent'
  | 'updateFileContent'
  | 'updateFileContentInGroup'
  | 'dirtyFiles'
  | 'dirtyFileIds'
  | 'savingFiles'
  | 'saveErrors'
  | 'saveActiveFile'
  | 'saveAllFiles'
  | 'saveFiles'
>;

type WorkspaceDialogState = Pick<
  WorkspaceState,
  | 'unsavedChangesDialog'
  | 'openUnsavedChangesDialog'
  | 'confirmUnsavedChangesSave'
  | 'discardUnsavedChanges'
  | 'cancelUnsavedChanges'
  | 'deleteConfirmationDialog'
  | 'confirmDeleteConfirmation'
  | 'cancelDeleteConfirmation'
>;

function createUnsavedChangesDialogState(
  kind: UnsavedChangesDialogKind,
  fileIds: string[],
  getTabName: (fileId: string) => string,
): UnsavedChangesDialogState {
  if (kind === 'close-app') {
    return {
      fileIds,
      kind,
      title: 'Save changes before closing Pristine?',
      description: `You have ${fileIds.length} file${fileIds.length === 1 ? '' : 's'} with unsaved changes.`,
    };
  }

  if (kind === 'review') {
    return {
      fileIds,
      kind,
      title: 'Unsaved Files',
      description: fileIds.length === 1
        ? `The file ${getTabName(fileIds[0] ?? '')} has unsaved changes.`
        : `${fileIds.length} files have unsaved changes. Choose which files to save now.`,
    };
  }

  if (kind === 'delete-entry') {
    return {
      fileIds,
      kind,
      title: 'Save changes before deleting?',
      description: fileIds.length === 1
        ? `The file ${getTabName(fileIds[0] ?? '')} has unsaved changes.`
        : `${fileIds.length} files have unsaved changes and are affected by this delete.`,
    };
  }

  if (kind === 'copy-entry') {
    return {
      fileIds,
      kind,
      title: 'Save changes before copying?',
      description: fileIds.length === 1
        ? `The file ${getTabName(fileIds[0] ?? '')} has unsaved changes.`
        : `${fileIds.length} files have unsaved changes and are affected by this copy.`,
    };
  }

  if (kind === 'cut-entry') {
    return {
      fileIds,
      kind,
      title: 'Save changes before cutting?',
      description: fileIds.length === 1
        ? `The file ${getTabName(fileIds[0] ?? '')} has unsaved changes.`
        : `${fileIds.length} files have unsaved changes and are affected by this cut.`,
    };
  }

  return {
    fileIds,
    kind,
    title: 'Save changes before closing?',
    description: fileIds.length === 1
      ? `The file ${getTabName(fileIds[0] ?? '')} has unsaved changes.`
      : `${fileIds.length} files have unsaved changes.`,
  };
}

function createDeleteConfirmationDialogState(
  targetPath: string,
  entryType: 'file' | 'folder',
): DeleteConfirmationDialogState {
  const entryLabel = entryType === 'folder' ? 'folder' : 'file';
  const description = entryType === 'folder'
    ? 'This will permanently delete this folder and all of its contents.'
    : 'This will permanently delete this file.';

  return {
    targetPath,
    entryType,
    title: `Delete ${entryLabel}?`,
    description,
    isSubmitting: false,
    errorMessage: null,
  };
}

function isWorkspaceDeleteTargetMatch(
  fileId: string,
  targetPath: string,
  entryType: 'file' | 'folder',
) {
  return entryType === 'folder'
    ? isWithinWorkspacePath(fileId, targetPath)
    : fileId === targetPath;
}

function collectWorkspaceFileDeleteTargets(
  editorGroups: EditorGroup[],
  targetPath: string,
  entryType: 'file' | 'folder',
): WorkspaceFileDeleteTarget[] {
  return editorGroups.flatMap((group) => group.tabs
    .filter((tab) => isWorkspaceRelativeFilePath(tab.id) && isWorkspaceDeleteTargetMatch(tab.id, targetPath, entryType))
    .map((tab) => ({
      fileId: tab.id,
      groupId: group.id,
    })));
}

function shouldBlockWorkspacePasteIntoDestination(
  sourcePath: string,
  entryType: WorkspaceEntryType,
  destinationFolderPath: string,
) {
  return entryType === 'folder' && isWithinWorkspacePath(destinationFolderPath, sourcePath);
}

async function resolveWorkspacePastePath(options: {
  destinationFolderPath: string;
  entryType: WorkspaceEntryType;
  exists: (filePath: string) => Promise<boolean>;
  mode: WorkspaceClipboardMode;
  sourcePath: string;
}) {
  const {
    destinationFolderPath,
    entryType,
    exists,
    mode,
    sourcePath,
  } = options;
  const sourceName = getPathBaseName(sourcePath);
  const sourceParentPath = getWorkspaceParentPath(sourcePath);

  if (mode === 'cut' && destinationFolderPath === sourceParentPath) {
    return null;
  }

  const directTargetPath = joinWorkspacePath(destinationFolderPath, sourceName);

  if (mode === 'cut' && !(await exists(directTargetPath))) {
    return directTargetPath;
  }

  let copyIndex = 1;

  while (true) {
    const candidatePath = joinWorkspacePath(
      destinationFolderPath,
      createWorkspaceCopyName(sourceName, entryType, copyIndex),
    );

    if (!(await exists(candidatePath))) {
      return candidatePath;
    }

    copyIndex += 1;
  }
}

const EMPTY_TABS: Tab[] = [];
const EMPTY_EDITOR_GROUPS: EditorGroup[] = [];

function withModifiedTabState(tab: EditorTab, dirtyFiles: Record<string, boolean>, previousTab?: EditorTab): EditorTab {
  const modified = Boolean(dirtyFiles[tab.id]);

  if (
    previousTab
    && previousTab.id === tab.id
    && previousTab.name === tab.name
    && previousTab.isPinned === tab.isPinned
    && previousTab.modified === modified
  ) {
    return previousTab;
  }

  return {
    ...tab,
    modified,
  };
}

function withModifiedTabsState(
  tabs: EditorTab[],
  dirtyFiles: Record<string, boolean>,
  previousTabs: EditorTab[] = EMPTY_TABS,
): EditorTab[] {
  const previousTabsById = new Map(previousTabs.map((tab) => [tab.id, tab]));
  let changed = tabs.length !== previousTabs.length;

  const nextTabs = tabs.map((tab, index) => {
    const nextTab = withModifiedTabState(tab, dirtyFiles, previousTabsById.get(tab.id));

    if (!changed && nextTab !== previousTabs[index]) {
      changed = true;
    }

    return nextTab;
  });

  return changed ? nextTabs : previousTabs;
}

function withModifiedEditorGroupsState(
  groups: EditorGroup[],
  dirtyFiles: Record<string, boolean>,
  previousGroups: EditorGroup[],
): EditorGroup[] {
  const previousGroupsById = new Map(previousGroups.map((group) => [group.id, group]));
  let changed = groups.length !== previousGroups.length;

  const nextGroups = groups.map((group, index) => {
    const previousGroup = previousGroupsById.get(group.id);
    const nextTabs = withModifiedTabsState(group.tabs, dirtyFiles, previousGroup?.tabs);

    if (
      previousGroup
      && previousGroup.activeTabId === group.activeTabId
      && previousGroup.previewTabId === group.previewTabId
      && nextTabs === previousGroup.tabs
    ) {
      if (!changed && previousGroup !== previousGroups[index]) {
        changed = true;
      }

      return previousGroup;
    }

    changed = true;
    return {
      ...group,
      tabs: nextTabs,
    };
  });

  return changed ? nextGroups : previousGroups;
}

// ─── Context ────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceState | null>(null);
const WorkspaceViewContext = createContext<WorkspaceViewState | null>(null);
const WorkspaceProjectContext = createContext<WorkspaceProjectState | null>(null);
const WorkspaceEditorContext = createContext<WorkspaceEditorState | null>(null);
const WorkspaceFileContext = createContext<WorkspaceFileState | null>(null);
const WorkspaceDialogContext = createContext<WorkspaceDialogState | null>(null);

function useRequiredWorkspaceContext<T>(context: Context<T | null>, hookName: string): T {
  const ctx = useContext(context);
  if (!ctx) throw new Error(`${hookName} must be used within WorkspaceProvider`);
  return ctx;
}

export function useWorkspace(): WorkspaceState {
  return useRequiredWorkspaceContext(WorkspaceContext, 'useWorkspace');
}

export function useWorkspaceView(): WorkspaceViewState {
  return useRequiredWorkspaceContext(WorkspaceViewContext, 'useWorkspaceView');
}

export function useWorkspaceProject(): WorkspaceProjectState {
  return useRequiredWorkspaceContext(WorkspaceProjectContext, 'useWorkspaceProject');
}

export function useWorkspaceEditor(): WorkspaceEditorState {
  return useRequiredWorkspaceContext(WorkspaceEditorContext, 'useWorkspaceEditor');
}

export function useWorkspaceFiles(): WorkspaceFileState {
  return useRequiredWorkspaceContext(WorkspaceFileContext, 'useWorkspaceFiles');
}

export function useWorkspaceDialogs(): WorkspaceDialogState {
  return useRequiredWorkspaceContext(WorkspaceDialogContext, 'useWorkspaceDialogs');
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const currentProject = useWorkspaceSessionStore((state) => state.currentProject);
  const setCurrentProject = useWorkspaceSessionStore((state) => state.setCurrentProject);
  const workspaceBootstrapStatus = useWorkspaceSessionStore((state) => state.workspaceBootstrapStatus);
  const setWorkspaceBootstrapStatus = useWorkspaceSessionStore((state) => state.setWorkspaceBootstrapStatus);
  const activeView = useWorkspaceSessionStore((state) => state.activeView);
  const setActiveView = useWorkspaceSessionStore((state) => state.setActiveView);
  const mainContentView = useWorkspaceSessionStore((state) => state.mainContentView);
  const setMainContentView = useWorkspaceSessionStore((state) => state.setMainContentView);
  const projectPanelWidths = useWorkspaceSessionStore((state) => state.panelWidths);
  const panelStateByView = useWorkspaceSessionStore((state) => state.panelStateByView);
  const workspaceTreeRefreshToken = useWorkspaceSessionStore((state) => state.workspaceTreeRefreshToken);
  const bumpWorkspaceTreeRefreshToken = useWorkspaceSessionStore((state) => state.bumpWorkspaceTreeRefreshToken);
  const captureWorkspaceSessionState = useWorkspaceSessionStore((state) => state.captureSessionState);
  const hydrateWorkspaceProjectSession = useWorkspaceSessionStore((state) => state.hydrateProjectSession);
  const resetWorkspaceProjectSession = useWorkspaceSessionStore((state) => state.resetProjectSession);
  const captureBottomPanelSession = useBottomPanelStore((state) => state.captureProjectBottomPanelSession);
  const hydrateBottomPanelSession = useBottomPanelStore((state) => state.hydrateProjectBottomPanelSession);
  const captureSidePanelSession = useSidePanelSessionStore((state) => state.captureProjectSidePanelSession);
  const hydrateSidePanelSession = useSidePanelSessionStore((state) => state.hydrateProjectSidePanelSession);
  const captureExplorerTreeSession = useExplorerTreeSessionStore((state) => state.captureProjectExplorerTreeSession);
  const hydrateExplorerTreeSession = useExplorerTreeSessionStore((state) => state.hydrateProjectExplorerTreeSession);
  const setPanelStateForView = useWorkspaceSessionStore((state) => state.setPanelStateForView);
  const setProjectPanelWidthInStore = useWorkspaceSessionStore((state) => state.setProjectPanelWidth);
  const editorWorkspace = useWorkspaceEditorState();
  const fileStore = useWorkspaceFileStore();
  const [unsavedChangesDialog, setUnsavedChangesDialog] = useState<UnsavedChangesDialogState | null>(null);
  const [deleteConfirmationDialog, setDeleteConfirmationDialog] = useState<DeleteConfirmationDialogState | null>(null);
  const [workspaceClipboard, setWorkspaceClipboard] = useState<WorkspaceClipboardState | null>(null);
  const [untitledFiles, setUntitledFiles] = useState<Record<string, string>>({});
  const unsavedChangesResolverRef = useRef<((result: 'save' | 'discard' | 'cancel') => void) | null>(null);
  const deleteConfirmationResolverRef = useRef<((result: boolean) => void) | null>(null);
  const deleteConfirmationActionRef = useRef<(() => Promise<void>) | null>(null);
  const previousEditorGroupsRef = useRef<EditorGroup[]>(EMPTY_EDITOR_GROUPS);
  const currentProjectRef = useRef<ProjectState | null>(currentProject);
  const layoutPanelsEnabled = canToggleLayoutPanels(mainContentView, activeView);
  const visiblePanelState = layoutPanelsEnabled ? panelStateByView[activeView] : EMPTY_PANEL_STATE;
  const editorWorkspaceRef = useRef(editorWorkspace);
  const fileStoreRef = useRef(fileStore);
  const activeViewRef = useRef(activeView);
  const layoutPanelsEnabledRef = useRef(layoutPanelsEnabled);
  const unsavedChangesDialogRef = useRef(unsavedChangesDialog);
  const deleteConfirmationDialogRef = useRef(deleteConfirmationDialog);
  const workspaceClipboardRef = useRef(workspaceClipboard);
  const untitledFilesRef = useRef(untitledFiles);
  const fileIdRedirectsRef = useRef<Record<string, string>>({});

  currentProjectRef.current = currentProject;
  editorWorkspaceRef.current = editorWorkspace;
  fileStoreRef.current = fileStore;
  activeViewRef.current = activeView;
  layoutPanelsEnabledRef.current = layoutPanelsEnabled;
  unsavedChangesDialogRef.current = unsavedChangesDialog;
  deleteConfirmationDialogRef.current = deleteConfirmationDialog;
  workspaceClipboardRef.current = workspaceClipboard;
  untitledFilesRef.current = untitledFiles;

  const resolveCurrentFileId = useCallback((fileId: string) => {
    let currentFileId = fileId;
    const visited = new Set<string>();

    while (fileIdRedirectsRef.current[currentFileId] && !visited.has(currentFileId)) {
      visited.add(currentFileId);
      currentFileId = fileIdRedirectsRef.current[currentFileId] ?? currentFileId;
    }

    return currentFileId;
  }, []);

  const clearTrackedFileId = useCallback((fileId: string) => {
    const resolvedFileId = resolveCurrentFileId(fileId);

    setUntitledFiles((current) => {
      if (!current[fileId] && !current[resolvedFileId]) {
        return current;
      }

      const next = { ...current };
      delete next[fileId];
      delete next[resolvedFileId];
      return next;
    });

    delete fileIdRedirectsRef.current[fileId];
  }, [resolveCurrentFileId]);

  const resetWorkspaceForProject = useCallback(() => {
    editorWorkspaceRef.current.resetWorkspace();
    fileStoreRef.current.resetFileStore();
    setWorkspaceClipboard(null);
    setUntitledFiles({});
    resetWorkspaceProjectSession();
    hydrateBottomPanelSession(null);
    hydrateSidePanelSession(null);
    hydrateExplorerTreeSession(null);
    fileIdRedirectsRef.current = {};
    previousEditorGroupsRef.current = EMPTY_EDITOR_GROUPS;
  }, [hydrateBottomPanelSession, hydrateExplorerTreeSession, hydrateSidePanelSession, resetWorkspaceProjectSession]);

  const hydrateProjectSession = useCallback((snapshot: ProjectSessionSnapshot | null | undefined) => {
    resetWorkspaceForProject();
    hydrateWorkspaceProjectSession(snapshot);
    hydrateBottomPanelSession(snapshot?.bottomPanelSession);
    hydrateSidePanelSession(snapshot?.sidePanelSession);
    hydrateExplorerTreeSession(snapshot?.explorerTreeSession);

    if (!snapshot) {
      return;
    }

    editorWorkspaceRef.current.restoreWorkspace({
      editorGroups: snapshot.editorGroups,
      editorLayout: snapshot.editorLayout,
      focusedGroupId: snapshot.focusedGroupId,
    });
  }, [
    hydrateBottomPanelSession,
    hydrateExplorerTreeSession,
    hydrateSidePanelSession,
    hydrateWorkspaceProjectSession,
    resetWorkspaceForProject,
  ]);

  const captureProjectSessionSnapshot = useCallback((): ProjectSessionSnapshot => {
    const sessionState = captureWorkspaceSessionState();

    return {
      activeTabId: resolveCurrentFileId(editorWorkspaceRef.current.activeTabId),
      activeView: sessionState.activeView,
      bottomPanelSession: captureBottomPanelSession(),
      editorGroups: editorWorkspaceRef.current.editorGroups,
      editorLayout: editorWorkspaceRef.current.editorLayout,
      explorerTreeSession: captureExplorerTreeSession(),
      focusedGroupId: editorWorkspaceRef.current.focusedGroupId,
      mainContentView: sessionState.mainContentView,
      panelStateByView: sessionState.panelStateByView,
      panelWidths: sessionState.panelWidths,
      sidePanelSession: captureSidePanelSession(),
      version: 1,
    };
  }, [
    captureBottomPanelSession,
    captureExplorerTreeSession,
    captureSidePanelSession,
    captureWorkspaceSessionState,
    resolveCurrentFileId,
  ]);

  const setProjectPanelWidth = useCallback((key: string, value: number | ((current: number | undefined) => number)) => {
    setProjectPanelWidthInStore(key, value);
  }, [setProjectPanelWidthInStore]);

  const flushProjectSession = useCallback(async () => {
    if (!currentProjectRef.current || !window.electronAPI?.project?.flushSession) {
      return;
    }

    await window.electronAPI.project.flushSession(captureProjectSessionSnapshot());
  }, [captureProjectSessionSnapshot]);

  useEffect(() => {
    const projectApi = typeof window === 'undefined' ? undefined : window.electronAPI?.project;
    const markBootstrapReady = () => {
      setWorkspaceBootstrapStatus('ready');
      void window.electronAPI?.markWorkspaceReady?.();
    };

    if (!projectApi) {
      hydrateProjectSession(null);
      setCurrentProject(null);
      markBootstrapReady();
      return undefined;
    }

    let disposed = false;
    void projectApi.getCurrentProject().then((project) => {
      if (disposed) {
        return;
      }

      setCurrentProject(project);
      hydrateProjectSession(project?.session);
      if (project) {
        bumpWorkspaceTreeRefreshToken();
      }
      refreshWorkspaceGitStatus();
      markBootstrapReady();
    }).catch(() => {
      if (disposed) {
        return;
      }

      setCurrentProject(null);
      hydrateProjectSession(null);
      markBootstrapReady();
    });

    const disposeProjectChanged = projectApi.onProjectChanged((project) => {
      setCurrentProject(project);
      hydrateProjectSession(project?.session);
      bumpWorkspaceTreeRefreshToken();
      refreshWorkspaceGitStatus();
    });

    return () => {
      disposed = true;
      disposeProjectChanged?.();
    };
  }, [bumpWorkspaceTreeRefreshToken, hydrateProjectSession, setCurrentProject, setWorkspaceBootstrapStatus]);

  useEffect(() => {
    const electronApi = typeof window === 'undefined' ? undefined : window.electronAPI;

    if (!electronApi?.onWorkspaceChange) {
      return undefined;
    }

    const disposeWorkspaceChange = electronApi.onWorkspaceChange((payload) => {
      if (payload.refreshWorkspaceTree) {
        bumpWorkspaceTreeRefreshToken();
      }

      if (payload.refreshGitStatus) {
        refreshWorkspaceGitStatus();
      }
    });

    return () => {
      disposeWorkspaceChange();
    };
  }, [bumpWorkspaceTreeRefreshToken]);

  const rewriteRedirectedFileIds = useCallback((currentPrefix: string, nextPrefix: string) => {
    const nextRedirects: Record<string, string> = {};

    Object.entries(fileIdRedirectsRef.current).forEach(([key, value]) => {
      const nextKey = isWorkspaceRelativeFilePath(key) && isWithinWorkspacePath(key, currentPrefix)
        ? replaceWorkspacePathPrefix(key, currentPrefix, nextPrefix)
        : key;
      const nextValue = isWorkspaceRelativeFilePath(value) && isWithinWorkspacePath(value, currentPrefix)
        ? replaceWorkspacePathPrefix(value, currentPrefix, nextPrefix)
        : value;

      nextRedirects[nextKey] = nextValue;
    });

    fileIdRedirectsRef.current = nextRedirects;
  }, []);

  const removeRedirectedFileIds = useCallback((targetPath: string, entryType: 'file' | 'folder') => {
    const nextRedirects: Record<string, string> = {};

    Object.entries(fileIdRedirectsRef.current).forEach(([key, value]) => {
      const shouldDeleteKey = isWorkspaceRelativeFilePath(key) && isWorkspaceDeleteTargetMatch(key, targetPath, entryType);
      const shouldDeleteValue = isWorkspaceRelativeFilePath(value) && isWorkspaceDeleteTargetMatch(value, targetPath, entryType);

      if (shouldDeleteKey || shouldDeleteValue) {
        return;
      }

      nextRedirects[key] = value;
    });

    fileIdRedirectsRef.current = nextRedirects;
  }, []);

  const clearWorkspaceClipboard = useCallback(() => {
    setWorkspaceClipboard(null);
  }, []);

  const rewriteWorkspaceClipboardPath = useCallback((currentPrefix: string, nextPrefix: string) => {
    setWorkspaceClipboard((current) => {
      if (!current || !isWithinWorkspacePath(current.sourcePath, currentPrefix)) {
        return current;
      }

      const nextSourcePath = replaceWorkspacePathPrefix(current.sourcePath, currentPrefix, nextPrefix);
      if (nextSourcePath === current.sourcePath) {
        return current;
      }

      return {
        ...current,
        sourcePath: nextSourcePath,
      };
    });
  }, []);

  const removeWorkspaceClipboardTarget = useCallback((targetPath: string, entryType: WorkspaceEntryType) => {
    setWorkspaceClipboard((current) => (
      current && isWorkspaceDeleteTargetMatch(current.sourcePath, targetPath, entryType)
        ? null
        : current
    ));
  }, []);

  const findTabName = useCallback((fileId: string) => {
    for (const group of editorWorkspaceRef.current.editorGroups) {
      const tab = group.tabs.find((currentTab) => currentTab.id === fileId);
      if (tab) {
        return tab.name;
      }
    }

    return untitledFilesRef.current[fileId] ?? getPathBaseName(fileId);
  }, []);

  const editorGroups = useMemo(() => {
    const nextGroups = withModifiedEditorGroupsState(
      editorWorkspace.editorGroups,
      fileStore.dirtyFiles,
      previousEditorGroupsRef.current,
    );

    previousEditorGroupsRef.current = nextGroups;
    return nextGroups;
  }, [editorWorkspace.editorGroups, fileStore.dirtyFiles]);

  const tabs = useMemo(
    () => editorGroups.find((group) => group.id === editorWorkspace.focusedGroupId)?.tabs ?? EMPTY_TABS,
    [editorGroups, editorWorkspace.focusedGroupId],
  );

  const getDirtyRequestedFileIds = useCallback((fileIds: string[]) => Array.from(
    new Set(fileIds.filter((fileId) => fileStoreRef.current.dirtyFiles[fileId])),
  ), []);

  const closeWorkspaceDeleteTargets = useCallback((targets: WorkspaceFileDeleteTarget[]) => {
    targets.forEach(({ groupId, fileId }) => {
      editorWorkspaceRef.current.closeFileInGroup(groupId, fileId);
      clearTrackedFileId(fileId);
    });
  }, [clearTrackedFileId]);

  const showUnsavedChangesDialog = useCallback((fileIds: string[], kind: UnsavedChangesDialogKind) => {
    const uniqueFileIds = getDirtyRequestedFileIds(fileIds);
    if (uniqueFileIds.length === 0) {
      setUnsavedChangesDialog(null);
      return null;
    }

    const nextState = createUnsavedChangesDialogState(kind, uniqueFileIds, findTabName);
    setUnsavedChangesDialog(nextState);
    return nextState;
  }, [findTabName, getDirtyRequestedFileIds]);

  const requestUnsavedChangesConfirmation = useCallback((fileIds: string[], kind: UnsavedChangesDialogKind) => {
    if (unsavedChangesResolverRef.current) {
      unsavedChangesResolverRef.current('cancel');
    }

    const dialogState = showUnsavedChangesDialog(fileIds, kind);
    if (!dialogState) {
      return Promise.resolve<'save' | 'discard' | 'cancel'>('save');
    }

    return new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
      unsavedChangesResolverRef.current = resolve;
    });
  }, [showUnsavedChangesDialog]);

  const resolveUnsavedChangesDialog = useCallback((result: 'save' | 'discard' | 'cancel') => {
    const resolver = unsavedChangesResolverRef.current;
    unsavedChangesResolverRef.current = null;
    setUnsavedChangesDialog(null);
    resolver?.(result);
  }, []);

  const requestDeleteConfirmation = useCallback((
    targetPath: string,
    entryType: 'file' | 'folder',
    onConfirm: () => Promise<void>,
  ) => {
    deleteConfirmationResolverRef.current?.(false);
    deleteConfirmationActionRef.current = onConfirm;
    setDeleteConfirmationDialog(createDeleteConfirmationDialogState(targetPath, entryType));

    return new Promise<boolean>((resolve) => {
      deleteConfirmationResolverRef.current = resolve;
    });
  }, []);

  const resolveDeleteConfirmation = useCallback((result: boolean) => {
    const resolver = deleteConfirmationResolverRef.current;
    deleteConfirmationResolverRef.current = null;
    deleteConfirmationActionRef.current = null;
    setDeleteConfirmationDialog(null);
    resolver?.(result);
  }, []);

  const confirmDeleteConfirmation = useCallback(async () => {
    const pendingAction = deleteConfirmationActionRef.current;
    const currentDialog = deleteConfirmationDialogRef.current;

    if (!pendingAction || !currentDialog || currentDialog.isSubmitting) {
      return;
    }

    setDeleteConfirmationDialog((current) => (current ? {
      ...current,
      isSubmitting: true,
      errorMessage: null,
    } : current));

    try {
      await pendingAction();
      resolveDeleteConfirmation(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to delete the selected entry.';
      setDeleteConfirmationDialog((current) => (current ? {
        ...current,
        isSubmitting: false,
        errorMessage: message,
      } : current));
    }
  }, [resolveDeleteConfirmation]);

  const cancelDeleteConfirmation = useCallback(() => {
    if (deleteConfirmationDialogRef.current?.isSubmitting) {
      return;
    }

    resolveDeleteConfirmation(false);
  }, [resolveDeleteConfirmation]);

  const saveFiles = useCallback((fileIds: string[], options?: SaveFilesOptions) => {
    const uniqueFileIds = Array.from(new Set(fileIds.filter(Boolean)));

    return (async (): Promise<SaveFilesResult> => {
      const savedFileIds: string[] = [];
      const failedFileIds: string[] = [];

      for (const fileId of uniqueFileIds) {
        const resolvedFileId = resolveCurrentFileId(fileId);

        if (!resolvedFileId) {
          failedFileIds.push(fileId);
          continue;
        }

        const contentOverride = options?.contentOverrides?.[resolvedFileId] ?? options?.contentOverrides?.[fileId];

        if (!untitledFilesRef.current[resolvedFileId]) {
          const saved = await fileStoreRef.current.saveFileContent(
            resolvedFileId,
            contentOverride === undefined ? undefined : { content: contentOverride },
          );
          if (saved) {
            savedFileIds.push(fileId);
          } else {
            failedFileIds.push(fileId);
          }
          continue;
        }

        const dialogResult = await window.electronAPI?.dialog?.showSaveDialog(
          untitledFilesRef.current[resolvedFileId] ?? resolvedFileId,
        );

        if (!dialogResult || dialogResult.canceled || !dialogResult.filePath) {
          failedFileIds.push(fileId);
          continue;
        }

        const targetFileId = dialogResult.workspaceRelativePath ?? dialogResult.filePath;
        const currentContent = contentOverride ?? fileStoreRef.current.fileContents[resolvedFileId] ?? '';
        const saved = await fileStoreRef.current.saveFileContent(resolvedFileId, {
          absolute: dialogResult.workspaceRelativePath === null,
          content: contentOverride,
          targetPath: dialogResult.workspaceRelativePath ?? dialogResult.filePath,
        });

        if (!saved) {
          failedFileIds.push(fileId);
          continue;
        }

        fileStoreRef.current.adoptFileState(resolvedFileId, targetFileId, {
          content: currentContent,
          removeSource: true,
          savedContent: currentContent,
        });
        editorWorkspaceRef.current.renameFileId(resolvedFileId, targetFileId, getPathBaseName(targetFileId));
        fileIdRedirectsRef.current[fileId] = targetFileId;
        fileIdRedirectsRef.current[resolvedFileId] = targetFileId;
        setUntitledFiles((current) => {
          if (!current[resolvedFileId]) {
            return current;
          }

          const next = { ...current };
          delete next[resolvedFileId];
          return next;
        });

        if (dialogResult.workspaceRelativePath) {
          bumpWorkspaceTreeRefreshToken();
        }

        savedFileIds.push(fileId);
      }

      return {
        savedFileIds,
        failedFileIds,
      };
    })();
  }, [bumpWorkspaceTreeRefreshToken, resolveCurrentFileId]);

  const saveAllFiles = useCallback(async () => {
    const { dirtyFileIds } = fileStoreRef.current;
    const result = await saveFiles(dirtyFileIds);
    return result.failedFileIds.length === 0;
  }, [saveFiles]);

  const saveActiveFile = useCallback(async () => {
    const { activeTabId } = editorWorkspaceRef.current;
    const activeGroup = editorWorkspaceRef.current.editorGroups.find((group) => group.activeTabId === activeTabId);
    const activeTab = activeGroup?.tabs.find((tab) => tab.id === activeTabId);
    if (isGitDiffEditorTab(activeTab)) {
      return false;
    }

    const resolvedFileId = resolveCurrentFileId(activeTabId);
    const { loadingFiles, loadErrors } = fileStoreRef.current;

    if (!resolvedFileId || loadingFiles[resolvedFileId] || loadErrors[resolvedFileId]) {
      return false;
    }

    const editorModel = editorWorkspaceRef.current.editorRef.current?.getModel?.();
    const normalizedResolvedFileId = resolvedFileId.replace(/\\/g, '/');
    const editorModelPaths = [
      typeof editorModel?.uri?.path === 'string' ? editorModel.uri.path : undefined,
      typeof editorModel?.uri?.fsPath === 'string' ? editorModel.uri.fsPath : undefined,
    ]
      .filter((path): path is string => Boolean(path))
      .map((path) => path.replace(/\\/g, '/').replace(/^\/+/, ''));
    const editorContent = editorModelPaths.some((path) => (
      path === normalizedResolvedFileId || path.endsWith(`/${normalizedResolvedFileId}`)
    )) && typeof editorModel?.getValue === 'function'
      ? editorModel.getValue()
      : undefined;

    return (await saveFiles(
      [resolvedFileId],
      editorContent === undefined ? undefined : { contentOverrides: { [resolvedFileId]: editorContent } },
    )).failedFileIds.length === 0;
  }, [resolveCurrentFileId, saveFiles]);

  const runActiveEditorAction = useCallback(async (actionId: 'undo' | 'redo') => {
    const editor = editorWorkspaceRef.current.editorRef.current;
    if (!editor) {
      return false;
    }

    const action = editor.getAction?.(actionId);
    if (action?.run) {
      await action.run();
      return true;
    }

    if (typeof editor.trigger === 'function') {
      editor.trigger('pristine', actionId, null);
      return true;
    }

    return false;
  }, []);

  const updateFileContentInGroup = useCallback((groupId: string, fileId: string, content: string) => {
    const resolvedFileId = resolveCurrentFileId(fileId);
    const group = editorWorkspaceRef.current.editorGroups.find((currentGroup) => currentGroup.id === groupId);
    if (group?.previewTabId && resolveCurrentFileId(group.previewTabId) === resolvedFileId) {
      editorWorkspaceRef.current.pinTabInGroup(groupId, group.previewTabId);
    }

    fileStoreRef.current.updateFileContent(resolvedFileId, content);
  }, [resolveCurrentFileId]);

  const loadFileContent = useCallback((fileId: string) => {
    const resolvedFileId = resolveCurrentFileId(fileId);

    if (untitledFilesRef.current[resolvedFileId]) {
      if (fileStoreRef.current.fileContents[resolvedFileId] === undefined) {
        fileStoreRef.current.initializeFile(resolvedFileId, '');
      }
      return;
    }

    fileStoreRef.current.loadFileContent(resolvedFileId);
  }, [resolveCurrentFileId]);

  const openUntitledFile = useCallback((groupId?: string) => {
    const untitledId = editorWorkspaceRef.current.openUntitledFile(groupId);
    fileStoreRef.current.initializeFile(untitledId, '');
    setUntitledFiles((current) => ({
      ...current,
      [untitledId]: untitledId,
    }));
    return untitledId;
  }, []);

  const createWorkspaceFile = useCallback(async (targetPath: string) => {
    const fsApi = window.electronAPI?.fs;
    if (!fsApi?.writeFile || !fsApi.exists) {
      throw new Error('Filesystem API unavailable');
    }

    if (await fsApi.exists(targetPath)) {
      throw new Error('An entry with the same name already exists.');
    }

    await fsApi.writeFile(targetPath, '');
    fileStoreRef.current.initializeFile(targetPath, '');
    bumpWorkspaceTreeRefreshToken();
    refreshWorkspaceGitStatus();
  }, [bumpWorkspaceTreeRefreshToken]);

  const createWorkspaceFolder = useCallback(async (targetPath: string) => {
    const fsApi = window.electronAPI?.fs;
    if (!fsApi?.createDirectory || !fsApi.exists) {
      throw new Error('Filesystem API unavailable');
    }

    if (await fsApi.exists(targetPath)) {
      throw new Error('An entry with the same name already exists.');
    }

    await fsApi.createDirectory(targetPath);
    bumpWorkspaceTreeRefreshToken();
    refreshWorkspaceGitStatus();
  }, [bumpWorkspaceTreeRefreshToken]);

  const maybeProceedWithUnsavedChanges = useCallback(async (
    fileIds: string[],
    kind: UnsavedChangesDialogKind,
    onProceed: () => void | Promise<void>,
  ) => {
    const dirtyFileIds = getDirtyRequestedFileIds(fileIds);
    if (dirtyFileIds.length === 0) {
      await onProceed();
      return true;
    }

    const decision = await requestUnsavedChangesConfirmation(dirtyFileIds, kind);
    if (decision === 'cancel') {
      return false;
    }

    await onProceed();
    return true;
  }, [getDirtyRequestedFileIds, requestUnsavedChangesConfirmation]);

  const openProject = useCallback(async () => {
    const projectApi = window.electronAPI?.project;
    if (!projectApi?.openProject) {
      return;
    }

    await maybeProceedWithUnsavedChanges(
      fileStoreRef.current.dirtyFileIds,
      'close-app',
      async () => {
        await flushProjectSession();
        await projectApi.openProject();
      },
    );
  }, [flushProjectSession, maybeProceedWithUnsavedChanges]);

  const closeProject = useCallback(async () => {
    const projectApi = window.electronAPI?.project;
    if (!projectApi?.closeProject || !currentProjectRef.current) {
      return;
    }

    await maybeProceedWithUnsavedChanges(
      fileStoreRef.current.dirtyFileIds,
      'close-app',
      async () => {
        await projectApi.closeProject(captureProjectSessionSnapshot());
      },
    );
  }, [captureProjectSessionSnapshot, maybeProceedWithUnsavedChanges]);

  const moveWorkspaceEntry = useCallback(async (
    currentPath: string,
    nextPath: string,
    entryType: WorkspaceEntryType,
  ) => {
    if (!currentPath || !nextPath || currentPath === nextPath) {
      return;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi?.rename) {
      throw new Error('Filesystem API unavailable');
    }

    await fsApi.rename(currentPath, nextPath);

    if (entryType === 'file') {
      fileStoreRef.current.renameFileState(currentPath, nextPath);
      editorWorkspaceRef.current.renameFileId(currentPath, nextPath, getPathBaseName(nextPath));
    } else {
      fileStoreRef.current.renameWorkspacePaths(currentPath, nextPath);

      const workspaceFileIdsToRename = Array.from(new Set(
        editorWorkspaceRef.current.editorGroups
          .flatMap((group) => group.tabs.map((tab) => tab.id))
          .filter((fileId) => isWorkspaceRelativeFilePath(fileId) && isWithinWorkspacePath(fileId, currentPath)),
      ));

      workspaceFileIdsToRename.forEach((fileId) => {
        const nextFileId = replaceWorkspacePathPrefix(fileId, currentPath, nextPath);
        editorWorkspaceRef.current.renameFileId(fileId, nextFileId, getPathBaseName(nextFileId));
      });
    }

    rewriteRedirectedFileIds(currentPath, nextPath);
    rewriteWorkspaceClipboardPath(currentPath, nextPath);
    bumpWorkspaceTreeRefreshToken();
    refreshWorkspaceGitStatus();
  }, [bumpWorkspaceTreeRefreshToken, rewriteRedirectedFileIds, rewriteWorkspaceClipboardPath]);

  const armWorkspaceClipboard = useCallback(async (
    targetPath: string,
    entryType: WorkspaceEntryType,
    mode: WorkspaceClipboardMode,
  ) => {
    if (!targetPath || targetPath === '.') {
      return false;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi?.exists) {
      throw new Error('Filesystem API unavailable');
    }

    if (!(await fsApi.exists(targetPath))) {
      if (workspaceClipboardRef.current?.sourcePath === targetPath) {
        setWorkspaceClipboard(null);
      }
      return false;
    }

    const dirtyFileIds = fileStoreRef.current.dirtyFileIds.filter((fileId) => (
      isWorkspaceRelativeFilePath(fileId) && isWorkspaceDeleteTargetMatch(fileId, targetPath, entryType)
    ));

    let armed = false;

    const proceeded = await maybeProceedWithUnsavedChanges(
      dirtyFileIds,
      mode === 'copy' ? 'copy-entry' : 'cut-entry',
      async () => {
        setWorkspaceClipboard({
          sourcePath: targetPath,
          entryType,
          mode,
        });
        armed = true;
      },
    );

    return proceeded && armed;
  }, [maybeProceedWithUnsavedChanges]);

  const copyWorkspaceEntry = useCallback((targetPath: string, entryType: WorkspaceEntryType) => {
    return armWorkspaceClipboard(targetPath, entryType, 'copy');
  }, [armWorkspaceClipboard]);

  const cutWorkspaceEntry = useCallback((targetPath: string, entryType: WorkspaceEntryType) => {
    return armWorkspaceClipboard(targetPath, entryType, 'cut');
  }, [armWorkspaceClipboard]);

  const pasteWorkspaceEntry = useCallback(async (destinationFolderPath: string) => {
    const clipboard = workspaceClipboardRef.current;

    if (!clipboard) {
      return null;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi?.exists || !fsApi.copyFile || !fsApi.copyDirectory) {
      throw new Error('Filesystem API unavailable');
    }

    if (!(await fsApi.exists(clipboard.sourcePath))) {
      setWorkspaceClipboard(null);
      return null;
    }

    if (!(await fsApi.exists(destinationFolderPath))) {
      return null;
    }

    if (shouldBlockWorkspacePasteIntoDestination(
      clipboard.sourcePath,
      clipboard.entryType,
      destinationFolderPath,
    )) {
      return null;
    }

    const nextPath = await resolveWorkspacePastePath({
      destinationFolderPath,
      entryType: clipboard.entryType,
      exists: fsApi.exists,
      mode: clipboard.mode,
      sourcePath: clipboard.sourcePath,
    });

    if (!nextPath) {
      return null;
    }

    if (clipboard.mode === 'cut') {
      await moveWorkspaceEntry(clipboard.sourcePath, nextPath, clipboard.entryType);
      setWorkspaceClipboard(null);
      return {
        path: nextPath,
        entryType: clipboard.entryType,
      };
    }

    if (clipboard.entryType === 'folder') {
      await fsApi.copyDirectory(clipboard.sourcePath, nextPath);
    } else {
      await fsApi.copyFile(clipboard.sourcePath, nextPath);
    }

    bumpWorkspaceTreeRefreshToken();
    refreshWorkspaceGitStatus();

    return {
      path: nextPath,
      entryType: clipboard.entryType,
    };
  }, [bumpWorkspaceTreeRefreshToken, moveWorkspaceEntry]);

  const renameWorkspaceEntry = useCallback(async (
    currentPath: string,
    nextPath: string,
    entryType: 'file' | 'folder',
  ) => {
    if (!currentPath || !nextPath || currentPath === nextPath) {
      return;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi?.rename || !fsApi.exists) {
      throw new Error('Filesystem API unavailable');
    }

    if (await fsApi.exists(nextPath)) {
      throw new Error('An entry with the same name already exists.');
    }

    await moveWorkspaceEntry(currentPath, nextPath, entryType);
  }, [moveWorkspaceEntry]);

  const deleteWorkspaceEntry = useCallback(async (
    targetPath: string,
    entryType: 'file' | 'folder',
  ) => {
    if (!targetPath || targetPath === '.') {
      return false;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi?.exists || !fsApi.deleteFile || !fsApi.deleteDirectory) {
      throw new Error('Filesystem API unavailable');
    }

    if (!(await fsApi.exists(targetPath))) {
      throw new Error('The selected entry no longer exists.');
    }

    const dirtyFileIds = fileStoreRef.current.dirtyFileIds.filter((fileId) => (
      isWorkspaceRelativeFilePath(fileId) && isWorkspaceDeleteTargetMatch(fileId, targetPath, entryType)
    ));
    const openTargets = collectWorkspaceFileDeleteTargets(
      editorWorkspaceRef.current.editorGroups,
      targetPath,
      entryType,
    );

    let deleted = false;

    const proceeded = await maybeProceedWithUnsavedChanges(
      dirtyFileIds,
      'delete-entry',
      async () => {
        deleted = await requestDeleteConfirmation(targetPath, entryType, async () => {
          if (entryType === 'folder') {
            await fsApi.deleteDirectory(targetPath);
          } else {
            await fsApi.deleteFile(targetPath);
          }

          closeWorkspaceDeleteTargets(openTargets);

          if (entryType === 'folder') {
            fileStoreRef.current.removeWorkspacePaths(targetPath);
          } else {
            fileStoreRef.current.removeFile(targetPath);
          }

          removeRedirectedFileIds(targetPath, entryType);
          removeWorkspaceClipboardTarget(targetPath, entryType);
          bumpWorkspaceTreeRefreshToken();
          refreshWorkspaceGitStatus();
        });
      },
    );

    return proceeded && deleted;
  }, [
    bumpWorkspaceTreeRefreshToken,
    closeWorkspaceDeleteTargets,
    maybeProceedWithUnsavedChanges,
    removeRedirectedFileIds,
    removeWorkspaceClipboardTarget,
    requestDeleteConfirmation,
  ]);

  const closeFileInGroup = useCallback((groupId: string, fileId: string) => {
    const resolvedFileId = resolveCurrentFileId(fileId);

    void maybeProceedWithUnsavedChanges(
      [resolvedFileId],
      'close-file',
      () => {
        editorWorkspaceRef.current.closeFileInGroup(groupId, resolveCurrentFileId(fileId));
        clearTrackedFileId(fileId);
      },
    );
  }, [clearTrackedFileId, maybeProceedWithUnsavedChanges, resolveCurrentFileId]);

  const closeFile = useCallback((fileId: string) => {
    const resolvedFileId = resolveCurrentFileId(fileId);

    void maybeProceedWithUnsavedChanges(
      [resolvedFileId],
      'close-file',
      () => {
        editorWorkspaceRef.current.closeFile(resolveCurrentFileId(fileId));
        clearTrackedFileId(fileId);
      },
    );
  }, [clearTrackedFileId, maybeProceedWithUnsavedChanges, resolveCurrentFileId]);

  const closeActiveTabInFocusedGroup = useCallback(() => {
    const { editorGroups, focusedGroupId } = editorWorkspaceRef.current;
    const groupId = focusedGroupId;
    if (!groupId) {
      return;
    }

    const activeFileId = editorGroups.find((group) => group.id === groupId)?.activeTabId;
    if (!activeFileId) {
      return;
    }

    closeFileInGroup(groupId, activeFileId);
  }, [closeFileInGroup]);

  const openUnsavedChangesDialog = useCallback((fileIds?: string[]) => {
    showUnsavedChangesDialog(fileIds ?? fileStoreRef.current.dirtyFileIds, 'review');
  }, [showUnsavedChangesDialog]);

  const confirmUnsavedChangesSave = useCallback(async (selectedFileIds?: string[]) => {
    const dialogState = unsavedChangesDialogRef.current;
    const fileIds = dialogState?.fileIds ?? [];
    if (fileIds.length === 0 || !dialogState) {
      resolveUnsavedChangesDialog('cancel');
      return;
    }

    const targetFileIds = Array.from(new Set((selectedFileIds ?? fileIds).filter((fileId) => fileIds.includes(fileId))));
    if (targetFileIds.length === 0) {
      return;
    }

    const saveResult = await saveFiles(targetFileIds);
    const remainingFileIds = getDirtyRequestedFileIds(
      fileIds.filter((fileId) => !saveResult.savedFileIds.includes(fileId)),
    );
    if (remainingFileIds.length > 0) {
      setUnsavedChangesDialog(createUnsavedChangesDialogState(dialogState.kind, remainingFileIds, findTabName));
      return;
    }

    resolveUnsavedChangesDialog('save');
  }, [findTabName, getDirtyRequestedFileIds, resolveUnsavedChangesDialog, saveFiles]);

  const discardUnsavedChanges = useCallback((selectedFileIds?: string[]) => {
    const dialogState = unsavedChangesDialogRef.current;
    const fileIds = dialogState?.fileIds ?? [];
    if (fileIds.length === 0 || !dialogState) {
      resolveUnsavedChangesDialog('discard');
      return;
    }

    const targetFileIds = Array.from(new Set((selectedFileIds ?? fileIds).filter((fileId) => fileIds.includes(fileId))));
    if (targetFileIds.length === 0) {
      return;
    }

    fileStoreRef.current.discardFiles(targetFileIds);

    const discardedFileIdSet = new Set(targetFileIds);
    const remainingFileIds = getDirtyRequestedFileIds(
      fileIds.filter((fileId) => !discardedFileIdSet.has(fileId)),
    );
    if (remainingFileIds.length > 0) {
      setUnsavedChangesDialog(createUnsavedChangesDialogState(dialogState.kind, remainingFileIds, findTabName));
      return;
    }

    resolveUnsavedChangesDialog('discard');
  }, [findTabName, getDirtyRequestedFileIds, resolveUnsavedChangesDialog]);

  const cancelUnsavedChanges = useCallback(() => {
    resolveUnsavedChangesDialog('cancel');
  }, [resolveUnsavedChangesDialog]);

  useEffect(() => {
    const electronApi = window.electronAPI;
    if (!electronApi?.onCloseRequested) {
      return undefined;
    }

    const dispose = electronApi.onCloseRequested((request: WindowCloseRequest) => {
      void (async () => {
        const dirtyFileIds = fileStoreRef.current.dirtyFileIds;
        if (dirtyFileIds.length === 0) {
          await stopWslDevelopmentEnvironmentAndRestore({ notifyOnError: true });
          await flushProjectSession();
          await electronApi.resolveCloseRequest(request.requestId, 'proceed');
          return;
        }

        const decision = await requestUnsavedChangesConfirmation(dirtyFileIds, 'close-app');

        if (decision === 'cancel') {
          await electronApi.resolveCloseRequest(request.requestId, 'cancel');
          return;
        }

        await stopWslDevelopmentEnvironmentAndRestore({ notifyOnError: true });
        await flushProjectSession();
        await electronApi.resolveCloseRequest(request.requestId, 'proceed');
      })();
    });

    return () => {
      dispose?.();
    };
  }, [flushProjectSession, requestUnsavedChangesConfirmation]);

  const setPanelStateForActiveView = useCallback((nextState: Partial<PanelVisibilityState>) => {
    if (!layoutPanelsEnabledRef.current) {
      return;
    }

    setPanelStateForView(activeViewRef.current, nextState);
  }, [setPanelStateForView]);

  const setShowLeftPanel = useCallback((show: boolean) => {
    setPanelStateForActiveView({ showLeftPanel: show });
  }, [setPanelStateForActiveView]);

  const setShowBottomPanel = useCallback((show: boolean) => {
    setPanelStateForActiveView({ showBottomPanel: show });
  }, [setPanelStateForActiveView]);

  const setShowRightPanel = useCallback((show: boolean) => {
    setPanelStateForActiveView({ showRightPanel: show });
  }, [setPanelStateForActiveView]);

  const undoActiveEditor = useCallback(() => runActiveEditorAction('undo'), [runActiveEditorAction]);

  const redoActiveEditor = useCallback(() => runActiveEditorAction('redo'), [runActiveEditorAction]);

  useEffect(() => {
    editorWorkspace.syncFocusedEditorRef();
  }, [editorWorkspace.syncFocusedEditorRef]);

  const activeTabId = resolveCurrentFileId(editorWorkspace.activeTabId);
  const workspaceValue = useMemo<WorkspaceState>(() => ({
    currentProject,
    hasOpenProject: Boolean(currentProject),
    workspaceBootstrapStatus,
    captureProjectSessionSnapshot,
    flushProjectSession,
    openProject,
    closeProject,
    projectPanelWidths,
    setProjectPanelWidth,
    activeView, setActiveView,
    mainContentView, setMainContentView,
    canToggleLayoutPanels: layoutPanelsEnabled,
    editorGroups,
    editorLayout: editorWorkspace.editorLayout,
    focusedGroupId: editorWorkspace.focusedGroupId,
    focusGroup: editorWorkspace.focusGroup,
    focusActiveEditor: editorWorkspace.focusActiveEditor,
    splitGroup: editorWorkspace.splitGroup,
    moveTab: editorWorkspace.moveTab,
    cycleFocusedGroupTabs: editorWorkspace.cycleFocusedGroupTabs,
    closeActiveTabInFocusedGroup,
    tabs,
    activeTabId,
    openFile: editorWorkspace.openFile,
    resolveFileId: resolveCurrentFileId,
    openFileInGroup: editorWorkspace.openFileInGroup,
    openGitDiff: editorWorkspace.openGitDiff,
    openGitDiffInGroup: editorWorkspace.openGitDiffInGroup,
    openUntitledFile,
    openPreviewFile: editorWorkspace.openPreviewFile,
    openPreviewFileInGroup: editorWorkspace.openPreviewFileInGroup,
    createWorkspaceFile,
    createWorkspaceFolder,
    workspaceClipboard,
    copyWorkspaceEntry,
    cutWorkspaceEntry,
    clearWorkspaceClipboard,
    pasteWorkspaceEntry,
    deleteWorkspaceEntry,
    renameWorkspaceEntry,
    pinTab: editorWorkspace.pinTab,
    pinTabInGroup: editorWorkspace.pinTabInGroup,
    closeFile,
    closeFileInGroup,
    setActiveTabId: editorWorkspace.setActiveTabId,
    setActiveTabIdInGroup: editorWorkspace.setActiveTabIdInGroup,
    jumpToLine: editorWorkspace.jumpToLine,
    jumpTo: editorWorkspace.jumpTo,
    cursorLine: editorWorkspace.cursorLine,
    cursorCol: editorWorkspace.cursorCol,
    setCursorPos: editorWorkspace.setCursorPos,
    getStoredCursorPosition: editorWorkspace.getStoredCursorPosition,
    getCursorRestoreRequest: editorWorkspace.getCursorRestoreRequest,
    clearCursorRestoreRequest: editorWorkspace.clearCursorRestoreRequest,
    captureEditorSelectionSnapshot: editorWorkspace.captureEditorSelectionSnapshot,
    restoreEditorSelection: editorWorkspace.restoreEditorSelection,
    showLeftPanel: visiblePanelState.showLeftPanel,
    setShowLeftPanel,
    showBottomPanel: visiblePanelState.showBottomPanel,
    setShowBottomPanel,
    showRightPanel: visiblePanelState.showRightPanel,
    setShowRightPanel,
    workspaceTreeRefreshToken,
    dirtyFiles: fileStore.dirtyFiles,
    dirtyFileIds: fileStore.dirtyFileIds,
    fileContents: fileStore.fileContents,
    loadingFiles: fileStore.loadingFiles,
    loadErrors: fileStore.loadErrors,
    loadFileContent,
    updateFileContent: fileStore.updateFileContent,
    updateFileContentInGroup,
    savingFiles: fileStore.savingFiles,
    saveErrors: fileStore.saveErrors,
    saveActiveFile,
    saveAllFiles,
    saveFiles,
    undoActiveEditor,
    redoActiveEditor,
    unsavedChangesDialog,
    openUnsavedChangesDialog,
    confirmUnsavedChangesSave,
    discardUnsavedChanges,
    cancelUnsavedChanges,
    deleteConfirmationDialog,
    confirmDeleteConfirmation,
    cancelDeleteConfirmation,
    editorRef: editorWorkspace.editorRef,
    registerEditorRef: editorWorkspace.registerEditorRef,
  }), [
    activeTabId,
    activeView,
    cancelDeleteConfirmation,
    cancelUnsavedChanges,
    captureProjectSessionSnapshot,
    clearWorkspaceClipboard,
    closeProject,
    closeActiveTabInFocusedGroup,
    closeFile,
    closeFileInGroup,
    confirmDeleteConfirmation,
    confirmUnsavedChangesSave,
    copyWorkspaceEntry,
    createWorkspaceFile,
    createWorkspaceFolder,
    currentProject,
    cutWorkspaceEntry,
    deleteConfirmationDialog,
    deleteWorkspaceEntry,
    discardUnsavedChanges,
    editorGroups,
    editorWorkspace.captureEditorSelectionSnapshot,
    editorWorkspace.clearCursorRestoreRequest,
    editorWorkspace.cycleFocusedGroupTabs,
    editorWorkspace.cursorCol,
    editorWorkspace.cursorLine,
    editorWorkspace.editorLayout,
    editorWorkspace.editorRef,
    editorWorkspace.focusActiveEditor,
    editorWorkspace.focusGroup,
    editorWorkspace.focusedGroupId,
    editorWorkspace.getCursorRestoreRequest,
    editorWorkspace.getStoredCursorPosition,
    editorWorkspace.jumpTo,
    editorWorkspace.jumpToLine,
    editorWorkspace.moveTab,
    editorWorkspace.openFile,
    editorWorkspace.openFileInGroup,
    editorWorkspace.openGitDiff,
    editorWorkspace.openGitDiffInGroup,
    editorWorkspace.openPreviewFile,
    editorWorkspace.openPreviewFileInGroup,
    editorWorkspace.pinTab,
    editorWorkspace.pinTabInGroup,
    editorWorkspace.registerEditorRef,
    editorWorkspace.restoreEditorSelection,
    editorWorkspace.setActiveTabId,
    editorWorkspace.setActiveTabIdInGroup,
    editorWorkspace.setCursorPos,
    editorWorkspace.splitGroup,
    fileStore.dirtyFileIds,
    fileStore.dirtyFiles,
    fileStore.fileContents,
    fileStore.loadErrors,
    fileStore.loadingFiles,
    fileStore.saveErrors,
    fileStore.savingFiles,
    fileStore.updateFileContent,
    layoutPanelsEnabled,
    loadFileContent,
    mainContentView,
    openProject,
    openUnsavedChangesDialog,
    openUntitledFile,
    pasteWorkspaceEntry,
    redoActiveEditor,
    renameWorkspaceEntry,
    resolveCurrentFileId,
    saveActiveFile,
    saveAllFiles,
    saveFiles,
    setProjectPanelWidth,
    setShowBottomPanel,
    setShowLeftPanel,
    setShowRightPanel,
    tabs,
    undoActiveEditor,
    unsavedChangesDialog,
    updateFileContentInGroup,
    visiblePanelState.showBottomPanel,
    visiblePanelState.showLeftPanel,
    visiblePanelState.showRightPanel,
    workspaceClipboard,
    workspaceTreeRefreshToken,
    flushProjectSession,
    projectPanelWidths,
    workspaceBootstrapStatus,
  ]);

  const workspaceViewValue = useMemo<WorkspaceViewState>(() => ({
    currentProject: workspaceValue.currentProject,
    hasOpenProject: workspaceValue.hasOpenProject,
    workspaceBootstrapStatus: workspaceValue.workspaceBootstrapStatus,
    activeView: workspaceValue.activeView,
    setActiveView: workspaceValue.setActiveView,
    mainContentView: workspaceValue.mainContentView,
    setMainContentView: workspaceValue.setMainContentView,
    canToggleLayoutPanels: workspaceValue.canToggleLayoutPanels,
    showLeftPanel: workspaceValue.showLeftPanel,
    setShowLeftPanel: workspaceValue.setShowLeftPanel,
    showBottomPanel: workspaceValue.showBottomPanel,
    setShowBottomPanel: workspaceValue.setShowBottomPanel,
    showRightPanel: workspaceValue.showRightPanel,
    setShowRightPanel: workspaceValue.setShowRightPanel,
    workspaceTreeRefreshToken: workspaceValue.workspaceTreeRefreshToken,
  }), [
    workspaceValue.activeView,
    workspaceValue.canToggleLayoutPanels,
    workspaceValue.currentProject,
    workspaceValue.hasOpenProject,
    workspaceValue.workspaceBootstrapStatus,
    workspaceValue.mainContentView,
    workspaceValue.setActiveView,
    workspaceValue.setMainContentView,
    workspaceValue.setShowBottomPanel,
    workspaceValue.setShowLeftPanel,
    workspaceValue.setShowRightPanel,
    workspaceValue.showBottomPanel,
    workspaceValue.showLeftPanel,
    workspaceValue.showRightPanel,
    workspaceValue.workspaceTreeRefreshToken,
  ]);

  const workspaceProjectValue = useMemo<WorkspaceProjectState>(() => ({
    currentProject: workspaceValue.currentProject,
    hasOpenProject: workspaceValue.hasOpenProject,
    workspaceBootstrapStatus: workspaceValue.workspaceBootstrapStatus,
    captureProjectSessionSnapshot: workspaceValue.captureProjectSessionSnapshot,
    flushProjectSession: workspaceValue.flushProjectSession,
    openProject: workspaceValue.openProject,
    closeProject: workspaceValue.closeProject,
    projectPanelWidths: workspaceValue.projectPanelWidths,
    setProjectPanelWidth: workspaceValue.setProjectPanelWidth,
  }), [
    workspaceValue.captureProjectSessionSnapshot,
    workspaceValue.closeProject,
    workspaceValue.currentProject,
    workspaceValue.flushProjectSession,
    workspaceValue.hasOpenProject,
    workspaceValue.workspaceBootstrapStatus,
    workspaceValue.openProject,
    workspaceValue.projectPanelWidths,
    workspaceValue.setProjectPanelWidth,
  ]);

  const workspaceEditorValue = useMemo<WorkspaceEditorState>(() => ({
    editorGroups: workspaceValue.editorGroups,
    editorLayout: workspaceValue.editorLayout,
    focusedGroupId: workspaceValue.focusedGroupId,
    focusGroup: workspaceValue.focusGroup,
    focusActiveEditor: workspaceValue.focusActiveEditor,
    splitGroup: workspaceValue.splitGroup,
    moveTab: workspaceValue.moveTab,
    cycleFocusedGroupTabs: workspaceValue.cycleFocusedGroupTabs,
    closeActiveTabInFocusedGroup: workspaceValue.closeActiveTabInFocusedGroup,
    tabs: workspaceValue.tabs,
    activeTabId: workspaceValue.activeTabId,
    openFile: workspaceValue.openFile,
    resolveFileId: workspaceValue.resolveFileId,
    openFileInGroup: workspaceValue.openFileInGroup,
    openGitDiff: workspaceValue.openGitDiff,
    openGitDiffInGroup: workspaceValue.openGitDiffInGroup,
    openUntitledFile: workspaceValue.openUntitledFile,
    openPreviewFile: workspaceValue.openPreviewFile,
    openPreviewFileInGroup: workspaceValue.openPreviewFileInGroup,
    pinTab: workspaceValue.pinTab,
    pinTabInGroup: workspaceValue.pinTabInGroup,
    closeFile: workspaceValue.closeFile,
    closeFileInGroup: workspaceValue.closeFileInGroup,
    setActiveTabId: workspaceValue.setActiveTabId,
    setActiveTabIdInGroup: workspaceValue.setActiveTabIdInGroup,
    jumpToLine: workspaceValue.jumpToLine,
    jumpTo: workspaceValue.jumpTo,
    cursorLine: workspaceValue.cursorLine,
    cursorCol: workspaceValue.cursorCol,
    setCursorPos: workspaceValue.setCursorPos,
    getStoredCursorPosition: workspaceValue.getStoredCursorPosition,
    getCursorRestoreRequest: workspaceValue.getCursorRestoreRequest,
    clearCursorRestoreRequest: workspaceValue.clearCursorRestoreRequest,
    captureEditorSelectionSnapshot: workspaceValue.captureEditorSelectionSnapshot,
    restoreEditorSelection: workspaceValue.restoreEditorSelection,
    undoActiveEditor: workspaceValue.undoActiveEditor,
    redoActiveEditor: workspaceValue.redoActiveEditor,
    editorRef: workspaceValue.editorRef,
    registerEditorRef: workspaceValue.registerEditorRef,
  }), [
    workspaceValue.activeTabId,
    workspaceValue.captureEditorSelectionSnapshot,
    workspaceValue.clearCursorRestoreRequest,
    workspaceValue.closeActiveTabInFocusedGroup,
    workspaceValue.closeFile,
    workspaceValue.closeFileInGroup,
    workspaceValue.cursorCol,
    workspaceValue.cursorLine,
    workspaceValue.cycleFocusedGroupTabs,
    workspaceValue.editorGroups,
    workspaceValue.editorLayout,
    workspaceValue.editorRef,
    workspaceValue.focusActiveEditor,
    workspaceValue.focusGroup,
    workspaceValue.focusedGroupId,
    workspaceValue.getCursorRestoreRequest,
    workspaceValue.getStoredCursorPosition,
    workspaceValue.jumpTo,
    workspaceValue.jumpToLine,
    workspaceValue.moveTab,
    workspaceValue.openFile,
    workspaceValue.openFileInGroup,
    workspaceValue.openGitDiff,
    workspaceValue.openGitDiffInGroup,
    workspaceValue.openPreviewFile,
    workspaceValue.openPreviewFileInGroup,
    workspaceValue.openUntitledFile,
    workspaceValue.pinTab,
    workspaceValue.pinTabInGroup,
    workspaceValue.redoActiveEditor,
    workspaceValue.registerEditorRef,
    workspaceValue.resolveFileId,
    workspaceValue.restoreEditorSelection,
    workspaceValue.setActiveTabId,
    workspaceValue.setActiveTabIdInGroup,
    workspaceValue.setCursorPos,
    workspaceValue.splitGroup,
    workspaceValue.tabs,
    workspaceValue.undoActiveEditor,
  ]);

  const workspaceFileValue = useMemo<WorkspaceFileState>(() => ({
    createWorkspaceFile: workspaceValue.createWorkspaceFile,
    createWorkspaceFolder: workspaceValue.createWorkspaceFolder,
    workspaceClipboard: workspaceValue.workspaceClipboard,
    copyWorkspaceEntry: workspaceValue.copyWorkspaceEntry,
    cutWorkspaceEntry: workspaceValue.cutWorkspaceEntry,
    clearWorkspaceClipboard: workspaceValue.clearWorkspaceClipboard,
    pasteWorkspaceEntry: workspaceValue.pasteWorkspaceEntry,
    deleteWorkspaceEntry: workspaceValue.deleteWorkspaceEntry,
    renameWorkspaceEntry: workspaceValue.renameWorkspaceEntry,
    fileContents: workspaceValue.fileContents,
    loadingFiles: workspaceValue.loadingFiles,
    loadErrors: workspaceValue.loadErrors,
    loadFileContent: workspaceValue.loadFileContent,
    updateFileContent: workspaceValue.updateFileContent,
    updateFileContentInGroup: workspaceValue.updateFileContentInGroup,
    dirtyFiles: workspaceValue.dirtyFiles,
    dirtyFileIds: workspaceValue.dirtyFileIds,
    savingFiles: workspaceValue.savingFiles,
    saveErrors: workspaceValue.saveErrors,
    saveActiveFile: workspaceValue.saveActiveFile,
    saveAllFiles: workspaceValue.saveAllFiles,
    saveFiles: workspaceValue.saveFiles,
  }), [
    workspaceValue.clearWorkspaceClipboard,
    workspaceValue.copyWorkspaceEntry,
    workspaceValue.createWorkspaceFile,
    workspaceValue.createWorkspaceFolder,
    workspaceValue.cutWorkspaceEntry,
    workspaceValue.deleteWorkspaceEntry,
    workspaceValue.dirtyFileIds,
    workspaceValue.dirtyFiles,
    workspaceValue.fileContents,
    workspaceValue.loadErrors,
    workspaceValue.loadFileContent,
    workspaceValue.loadingFiles,
    workspaceValue.pasteWorkspaceEntry,
    workspaceValue.renameWorkspaceEntry,
    workspaceValue.saveActiveFile,
    workspaceValue.saveAllFiles,
    workspaceValue.saveErrors,
    workspaceValue.saveFiles,
    workspaceValue.savingFiles,
    workspaceValue.updateFileContent,
    workspaceValue.updateFileContentInGroup,
    workspaceValue.workspaceClipboard,
  ]);

  const workspaceDialogValue = useMemo<WorkspaceDialogState>(() => ({
    unsavedChangesDialog: workspaceValue.unsavedChangesDialog,
    openUnsavedChangesDialog: workspaceValue.openUnsavedChangesDialog,
    confirmUnsavedChangesSave: workspaceValue.confirmUnsavedChangesSave,
    discardUnsavedChanges: workspaceValue.discardUnsavedChanges,
    cancelUnsavedChanges: workspaceValue.cancelUnsavedChanges,
    deleteConfirmationDialog: workspaceValue.deleteConfirmationDialog,
    confirmDeleteConfirmation: workspaceValue.confirmDeleteConfirmation,
    cancelDeleteConfirmation: workspaceValue.cancelDeleteConfirmation,
  }), [
    workspaceValue.cancelDeleteConfirmation,
    workspaceValue.cancelUnsavedChanges,
    workspaceValue.confirmDeleteConfirmation,
    workspaceValue.confirmUnsavedChangesSave,
    workspaceValue.deleteConfirmationDialog,
    workspaceValue.discardUnsavedChanges,
    workspaceValue.openUnsavedChangesDialog,
    workspaceValue.unsavedChangesDialog,
  ]);

  return (
    <WorkspaceViewContext.Provider value={workspaceViewValue}>
      <WorkspaceProjectContext.Provider value={workspaceProjectValue}>
        <WorkspaceEditorContext.Provider value={workspaceEditorValue}>
          <WorkspaceFileContext.Provider value={workspaceFileValue}>
            <WorkspaceDialogContext.Provider value={workspaceDialogValue}>
              <WorkspaceContext.Provider value={workspaceValue}>
                {children}
              </WorkspaceContext.Provider>
            </WorkspaceDialogContext.Provider>
          </WorkspaceFileContext.Provider>
        </WorkspaceEditorContext.Provider>
      </WorkspaceProjectContext.Provider>
    </WorkspaceViewContext.Provider>
  );
}
