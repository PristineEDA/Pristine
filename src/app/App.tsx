import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MenuBar } from './components/code/shared/MenuBar';
import { DeleteConfirmationDialog } from './components/code/shared/DeleteConfirmationDialog';
import { UnsavedChangesDialog } from './components/code/shared/UnsavedChangesDialog';
import { ActivityBar } from './components/code/shared/ActivityBar';
import { ConfigureProjectDialog } from './components/code/shared/ConfigureProjectDialog';
import { LeftSidePanel } from './components/code/explorer/LeftSidePanel';
import { EditorSplitLayout } from './components/code/shared/EditorSplitLayout';
import { RightSidePanel } from './components/code/explorer/RightSidePanel';
import { BottomPanel } from './components/code/explorer/BottomPanel';
import {
  ASSISTANT_THREAD_LIST_DEFAULT_WIDTH_PX,
  ASSISTANT_THREAD_LIST_RESIZE_HANDLE_WIDTH_PX,
} from './components/code/explorer/assistantPanelLayout';
import {
  CodeWorkspaceShell,
  type CodeWorkspaceBottomPanelControls,
  EXPLORER_LEFT_PANEL_DEFAULT_WIDTH_PX,
  EXPLORER_RIGHT_PANEL_MAX_WIDTH_PX,
  EXPLORER_RIGHT_PANEL_MIN_WIDTH_PX,
  EXPLORER_RIGHT_PANEL_DEFAULT_WIDTH_PX,
} from './components/code/shared/CodeWorkspaceShell';
import { AppStatusBar } from './components/code/shared/statusBars/AppStatusBar';
import {
  PhysicalBottomPanel,
  PhysicalLeftPanel,
  PhysicalMainPanel,
  PhysicalRightPanel,
  type PhysicalLayoutFileEntry,
  type PhysicalWorkspaceLayoutState,
} from './components/code/physical/PhysicalWorkspacePanels';
import {
  createEmptyPhysicalLayoutVisibility,
  createPhysicalLayoutVisibility,
  createLayerCategoryVisibilityKey,
  createOutlineVisibilityKey,
  filterVisiblePhysicalLayoutShapes,
  normalizePhysicalLayoutLayerOpacity,
  type PhysicalLayoutLayerCategory,
  type MutablePhysicalLayoutVisibility,
} from './components/code/physical/physicalLayoutLayers';
import {
  getDefaultLayoutTarget,
  selectLayoutTargetShapes,
  type PhysicalLayoutTarget,
} from './components/code/physical/physicalLayoutGeometry';
import type { LspLayoutGeometry } from '../../types/systemverilog-lsp';
import { QuickOpenPalette } from './components/code/shared/QuickOpenPalette';
import { isMonacoTextInputFocused } from './editor/focusEditor';
import {
  WorkspaceProvider,
  useWorkspaceDialogs,
  useWorkspaceEditor,
  useWorkspaceFiles,
  useWorkspaceProject,
  useWorkspaceView,
} from './context/WorkspaceContext';
import { CodeViewerLayoutProvider } from './context/CodeViewerLayoutContext';
import { ModuleHierarchyProvider } from './context/ModuleHierarchyContext';
import { SidebarProvider } from './components/ui/sidebar';
import { refreshWorkspaceGitStatus } from './git/workspaceGitStatus';
import { hydrateNotificationHistory, publishNotification } from './notifications/useNotificationStore';
import { endProgressSession, startProgressSession, updateProgressSession } from './progress/useProgressStore';
import { useGlobalAppShortcuts } from './useGlobalAppShortcuts';
import { getPathBaseName } from './workspace/workspaceFiles';
import { useQuickOpenController } from './useQuickOpenController';
import { preloadDeferredMainContentViews } from './mainContentViewPreload';
import { useProjectConfigureStore } from './components/code/shared/useProjectConfigureStore';
import { useBottomPanelStore } from './components/code/explorer/useBottomPanelStore';
import { getConfiguredWslUbuntuDistro } from './components/code/shared/MenuBarSettingsDialog';
import { getTerminalSessionSnapshot, subscribeTerminalSession } from './components/code/explorer/terminalSessionStore';
import {
  WSL_TERMINAL_SESSION_KEY,
  useWslDevelopmentEnvironmentStore,
} from './wsl/useWslDevelopmentEnvironmentStore';
import { stopWslDevelopmentEnvironmentAndRestore } from './wsl/wslDevelopmentEnvironmentLifecycle';

const WorkflowView = lazy(() => import('./components/workflow/WorkflowView').then((module) => ({ default: module.WorkflowView })));
const WhiteboardView = lazy(() => import('./components/whiteboard/WhiteboardView').then((module) => ({ default: module.WhiteboardView })));

// ─── ResizeHandle ────────────────────────────────────────────────────────────

const MainContentFallback = () => (
  <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground text-sm">
    Loading view...
  </div>
);

const PlaceholderView = ({
  title,
  description = 'Coming soon',
  testId,
}: {
  title: string;
  description?: string;
  testId: string;
}) => (
  <div data-testid={testId} className="flex h-full w-full items-center justify-center bg-background text-muted-foreground">
    <div className="text-center">
      <p className="text-lg font-medium">{title}</p>
      <p className="mt-1 text-sm">{description}</p>
    </div>
  </div>
);

const codeViewPlaceholderConfig = {
  factory: {
    title: 'Factory',
    testId: 'code-view-factory',
  },
} as const;

type PlaceholderWorkspaceView = 'simulation' | 'synthesis';

const demoNotifications = [
  {
    level: 'info',
    title: 'Info notification',
    body: 'Pristine notification info sample.',
  },
  {
    level: 'warning',
    title: 'Warning notification',
    body: 'Pristine notification warning sample.',
  },
  {
    level: 'error',
    title: 'Error notification',
    body: 'Pristine notification error sample.',
  },
] as const;

const demoNotificationActions = [
  { label: 'Mark as Read' },
  { label: 'Delete' },
] as const;

const demoProgressSessions = [
  { title: 'Scanning RTL Sources', source: 'Run', stepMs: 360, increment: 9, endDelayMs: 4200 },
  { title: 'Indexing SystemVerilog Symbols', source: 'Run', stepMs: 440, increment: 11, endDelayMs: 5200 },
  { title: 'Resolving Module Hierarchy', source: 'Run', stepMs: 320, increment: 7, endDelayMs: 6500 },
  { title: 'Preparing Schematic Graph', source: 'Run', stepMs: 520, increment: 13, endDelayMs: 7800 },
  { title: 'Checking Timing Reports', source: 'Run', stepMs: 610, increment: 15, endDelayMs: 9200 },
  { title: 'Synchronizing Waveform Data', source: 'Run', stepMs: 390, increment: 6, endDelayMs: 10800 },
] as const;

// ─── AppLayout (consumes context) ────────────────────────────────────────────
function AppLayout() {
  const {
    activeView, setActiveView,
    canToggleLayoutPanels,
    mainContentView,
    showLeftPanel, setShowLeftPanel,
    showBottomPanel, setShowBottomPanel,
    showRightPanel, setShowRightPanel,
    workspaceBootstrapStatus,
    workspaceTreeRefreshToken,
  } = useWorkspaceView();
  const {
    currentProject,
    hasOpenProject,
    projectPanelWidths,
    setProjectPanelWidth,
  } = useWorkspaceProject();
  const {
    activeTabId,
    captureEditorSelectionSnapshot,
    closeActiveTabInFocusedGroup,
    cursorLine, cursorCol,
    focusActiveEditor,
    jumpToLine, jumpTo,
    openFile,
    openGitDiff,
    openPreviewFile,
    openUntitledFile,
    restoreEditorSelection,
  } = useWorkspaceEditor();
  const {
    clearWorkspaceClipboard,
    copyWorkspaceEntry,
    createWorkspaceFile,
    createWorkspaceFolder,
    cutWorkspaceEntry,
    deleteWorkspaceEntry,
    pasteWorkspaceEntry,
    renameWorkspaceEntry,
    dirtyFileIds,
    saveActiveFile,
    saveAllFiles,
    saveErrors,
    savingFiles,
    workspaceClipboard,
  } = useWorkspaceFiles();
  const { openUnsavedChangesDialog } = useWorkspaceDialogs();
  const [isExplorerLeftPanelSplitVisible, setIsExplorerLeftPanelSplitVisible] = useState(false);
  const [isExplorerRightPanelSplitVisible, setIsExplorerRightPanelSplitVisible] = useState(false);
  const [isPhysicalLeftPanelSplitVisible, setIsPhysicalLeftPanelSplitVisible] = useState(false);
  const [isPhysicalRightPanelSplitVisible, setIsPhysicalRightPanelSplitVisible] = useState(false);
  const [physicalLayoutState, setPhysicalLayoutState] = useState<PhysicalWorkspaceLayoutState>({
    catalog: null,
    error: null,
    geometry: null,
    openResult: null,
    status: 'idle',
  });
  const [physicalGdsInspectorGeometry, setPhysicalGdsInspectorGeometry] = useState<LspLayoutGeometry | null>(null);
  const [physicalLayoutFiles, setPhysicalLayoutFiles] = useState<PhysicalLayoutFileEntry[]>([]);
  const [expandedPhysicalLayoutFilePaths, setExpandedPhysicalLayoutFilePaths] = useState<Set<string>>(() => new Set());
  const [activePhysicalLayoutFilePath, setActivePhysicalLayoutFilePath] = useState<string | null>(null);
  const [physicalSelectedTarget, setPhysicalSelectedTarget] = useState<PhysicalLayoutTarget | null>(null);
  const [physicalHighlightedShapeIndex, setPhysicalHighlightedShapeIndex] = useState<number | null>(null);
  const [physicalLayoutVisibility, setPhysicalLayoutVisibility] = useState<MutablePhysicalLayoutVisibility>(() => (
    createEmptyPhysicalLayoutVisibility()
  ));
  const physicalLayoutVisibilitySignatureRef = useRef('');
  const notificationDemoIndexRef = useRef(0);
  const progressDemoTimersRef = useRef<number[]>([]);
  const wslTerminalHadSessionRef = useRef(false);
  const wslStatus = useWslDevelopmentEnvironmentStore((state) => state.status);
  const setWslStatus = useWslDevelopmentEnvironmentStore((state) => state.setWslDevelopmentEnvironmentStatus);
  const setWslError = useWslDevelopmentEnvironmentStore((state) => state.setWslDevelopmentEnvironmentError);
  const setWslUbuntuDistro = useWslDevelopmentEnvironmentStore((state) => state.setWslUbuntuDistro);
  const focusedBottomPaneId = useBottomPanelStore((state) => state.focusedPaneId);
  const showWslTerminalInPane = useBottomPanelStore((state) => state.showWslTerminalInPane);
  const [assistantThreadListExpanded, setAssistantThreadListExpanded] = useState(false);
  const explorerLeftPanelWidthPx = projectPanelWidths.explorerLeftPanel ?? EXPLORER_LEFT_PANEL_DEFAULT_WIDTH_PX;
  const explorerAssistantPanelWidthPx = projectPanelWidths.explorerRightPanel ?? EXPLORER_RIGHT_PANEL_DEFAULT_WIDTH_PX;
  const assistantThreadListWidthPx = projectPanelWidths.explorerAssistantThreadList ?? ASSISTANT_THREAD_LIST_DEFAULT_WIDTH_PX;
  const physicalLeftPanelWidthPx = projectPanelWidths.physicalLeftPanel ?? EXPLORER_LEFT_PANEL_DEFAULT_WIDTH_PX;
  const physicalRightPanelWidthPx = projectPanelWidths.physicalRightPanel ?? EXPLORER_RIGHT_PANEL_DEFAULT_WIDTH_PX;
  const [shouldMountWorkflowView, setShouldMountWorkflowView] = useState(mainContentView === 'workflow');
  const [shouldMountWhiteboardView, setShouldMountWhiteboardView] = useState(mainContentView === 'whiteboard');
  const explorerBottomPanelLayoutVersion = `${showLeftPanel}:${showRightPanel}:${showBottomPanel}:${explorerLeftPanelWidthPx}`;
  const assistantThreadListExtraWidthPx = assistantThreadListExpanded
    ? assistantThreadListWidthPx + ASSISTANT_THREAD_LIST_RESIZE_HANDLE_WIDTH_PX
    : 0;
  const activePhysicalLayoutState: PhysicalWorkspaceLayoutState = {
    ...physicalLayoutState,
    geometry: physicalLayoutState.geometry,
  };
  const explorerRightPanelWidthPx = explorerAssistantPanelWidthPx + assistantThreadListExtraWidthPx;
  const explorerRightPanelMinWidthPx = EXPLORER_RIGHT_PANEL_MIN_WIDTH_PX + assistantThreadListExtraWidthPx;
  const explorerRightPanelMaxWidthPx = EXPLORER_RIGHT_PANEL_MAX_WIDTH_PX + assistantThreadListExtraWidthPx;

  useEffect(() => {
    let disposed = false;

    async function loadPhysicalLayoutFiles() {
      const entries = await window.electronAPI?.fs.readDir?.('.');
      if (disposed || !Array.isArray(entries)) {
        return;
      }

      const files = entries
        .filter((entry) => entry.isFile)
        .map((entry) => {
          const extension = getPhysicalLayoutFileExtension(entry.name);
          return { extension, name: entry.name, path: entry.name };
        })
        .filter((entry): entry is PhysicalLayoutFileEntry => isPhysicalLayoutFileExtension(entry.extension))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
      setPhysicalLayoutFiles(files);
    }

    void loadPhysicalLayoutFiles().catch(() => {
      if (!disposed) {
        setPhysicalLayoutFiles([]);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const defaultTarget = getDefaultLayoutTarget(physicalLayoutState.catalog);
    if (!physicalSelectedTarget && defaultTarget) {
      setPhysicalSelectedTarget(defaultTarget);
    }
  }, [physicalLayoutState.catalog, physicalSelectedTarget]);

  useEffect(() => {
    const activeGeometry = physicalLayoutState.catalog?.sourceKind === 'gds' && physicalSelectedTarget?.kind === 'gdsCell'
      ? null
      : physicalLayoutState.geometry;
    const shapes = selectLayoutTargetShapes(physicalLayoutState.catalog, activeGeometry, physicalSelectedTarget);
    const nextVisibility = createPhysicalLayoutVisibility(physicalLayoutState.catalog, Boolean(physicalSelectedTarget), shapes);
    const nextSignature = [
      physicalLayoutState.catalog?.sourceKind ?? '',
      physicalSelectedTarget?.kind ?? '',
      physicalSelectedTarget?.index ?? '',
      Array.from(nextVisibility.layerOpacities.keys()).sort((left, right) => left - right).join(','),
      Array.from(nextVisibility.visibleItems).sort().join(','),
    ].join('|');
    if (physicalLayoutVisibilitySignatureRef.current !== nextSignature) {
      physicalLayoutVisibilitySignatureRef.current = nextSignature;
      setPhysicalLayoutVisibility(nextVisibility);
    }
  }, [physicalLayoutState.catalog, physicalLayoutState.geometry, physicalSelectedTarget]);

  useEffect(() => {
    setPhysicalHighlightedShapeIndex(null);
    setPhysicalGdsInspectorGeometry(null);
  }, [activePhysicalLayoutFilePath, physicalLayoutState.geometry, physicalSelectedTarget]);

  useEffect(() => {
    if (physicalHighlightedShapeIndex === null) {
      return;
    }

    if (physicalLayoutState.catalog?.sourceKind === 'gds' && physicalSelectedTarget?.kind === 'gdsCell') {
      return;
    }

    const selectedShapes = selectLayoutTargetShapes(physicalLayoutState.catalog, physicalLayoutState.geometry, physicalSelectedTarget);
    const visibleShapes = filterVisiblePhysicalLayoutShapes(selectedShapes, physicalLayoutVisibility, physicalLayoutState.catalog?.sourceKind);
    if (!visibleShapes.some((shape) => shape.index === physicalHighlightedShapeIndex)) {
      setPhysicalHighlightedShapeIndex(null);
    }
  }, [
    physicalHighlightedShapeIndex,
    physicalLayoutState.catalog,
    physicalLayoutState.geometry,
    physicalLayoutVisibility,
    physicalSelectedTarget,
  ]);

  const handlePhysicalOutlineVisibilityToggle = useCallback(() => {
    setPhysicalLayoutVisibility((current) => {
      const nextItems = new Set(current.visibleItems);
      const outlineKey = createOutlineVisibilityKey();
      if (nextItems.has(outlineKey)) {
        nextItems.delete(outlineKey);
      } else {
        nextItems.add(outlineKey);
      }

      return {
        layerOpacities: new Map(current.layerOpacities),
        outlineVisible: nextItems.has(outlineKey),
        visibleItems: nextItems,
      };
    });
  }, []);

  const handlePhysicalLayerCategoryVisibilityToggle = useCallback((
    layerIndex: number,
    category: PhysicalLayoutLayerCategory,
  ) => {
    setPhysicalLayoutVisibility((current) => {
      const nextItems = new Set(current.visibleItems);
      const key = createLayerCategoryVisibilityKey(layerIndex, category);
      if (nextItems.has(key)) {
        nextItems.delete(key);
      } else {
        nextItems.add(key);
      }

      return {
        layerOpacities: new Map(current.layerOpacities),
        outlineVisible: current.outlineVisible,
        visibleItems: nextItems,
      };
    });
  }, []);

  const handlePhysicalLayerOpacityChange = useCallback((layerIndex: number, opacity: number) => {
    setPhysicalLayoutVisibility((current) => {
      const nextOpacities = new Map(current.layerOpacities);
      nextOpacities.set(layerIndex, normalizePhysicalLayoutLayerOpacity(opacity));

      return {
        layerOpacities: nextOpacities,
        outlineVisible: current.outlineVisible,
        visibleItems: new Set(current.visibleItems),
      };
    });
  }, []);

  const handlePhysicalLayoutFileToggle = useCallback((file: PhysicalLayoutFileEntry) => {
    setExpandedPhysicalLayoutFilePaths((current) => {
      const next = new Set(current);
      if (next.has(file.path)) {
        next.delete(file.path);
      } else {
        next.add(file.path);
      }
      return next;
    });

    setPhysicalHighlightedShapeIndex(null);
    setPhysicalGdsInspectorGeometry(null);
    setPhysicalSelectedTarget(null);
    setActivePhysicalLayoutFilePath(file.path);
    setPhysicalLayoutState({
      catalog: null,
      error: null,
      geometry: null,
      openResult: null,
      status: 'loading',
    });
  }, []);

  const handlePhysicalLayoutTargetActivate = useCallback((target: PhysicalLayoutTarget) => {
    setPhysicalHighlightedShapeIndex(null);
    setPhysicalGdsInspectorGeometry(null);
    setPhysicalSelectedTarget(target);
  }, []);

  const handleActivityItemSelect = (nextView: string) => {
    setActiveView(nextView as typeof activeView);
  };
  const openProjectConfigure = useProjectConfigureStore((state) => state.openProjectConfigure);

  const handleProjectConfigure = useCallback(() => {
    if (!currentProject) {
      return;
    }

    openProjectConfigure(currentProject.config);
  }, [currentProject, openProjectConfigure]);

  const restoreActiveEditorFocus = useCallback(() => {
    if (typeof window === 'undefined') {
      globalThis.setTimeout(() => {
        focusActiveEditor();
      }, 0);
      return;
    }

    const focusDeadline = window.performance.now() + 5000;

    const tryFocus = () => {
      focusActiveEditor();

      if (isMonacoTextInputFocused() || window.performance.now() >= focusDeadline) {
        return;
      }

      window.requestAnimationFrame(tryFocus);
    };

    window.requestAnimationFrame(tryFocus);
  }, [focusActiveEditor]);

  const {
    closeQuickOpen,
    handleEditorActiveFileReveal,
    handleQuickOpenQueryChange,
    handleQuickOpenSelect,
    handleQuickOpenSelectedIndexChange,
    isQuickOpenRecentMode,
    openQuickOpen,
    openWorkspaceFile,
    openWorkspacePreviewFile,
    queueRevealRequest,
    quickOpenResults,
    quickOpenState,
  } = useQuickOpenController({
    activeTabId,
    captureEditorSelectionSnapshot,
    openFile,
    openPreviewFile,
    restoreActiveEditorFocus,
    restoreEditorSelection,
    workspaceTreeRefreshToken,
  });

  const handleCreateUntitledFile = useCallback(() => {
    openUntitledFile();
    restoreActiveEditorFocus();
  }, [openUntitledFile, restoreActiveEditorFocus]);

  const handleCreateWorkspaceFile = useCallback(async (targetPath: string) => {
    await createWorkspaceFile(targetPath);
    openWorkspaceFile(targetPath, getPathBaseName(targetPath));
    restoreActiveEditorFocus();
  }, [createWorkspaceFile, openWorkspaceFile, restoreActiveEditorFocus]);

  const handleCreateWorkspaceFolder = useCallback(async (targetPath: string) => {
    await createWorkspaceFolder(targetPath);
    queueRevealRequest(targetPath);
  }, [createWorkspaceFolder, queueRevealRequest]);

  const handleCopyWorkspaceEntry = useCallback((targetPath: string, entryType: 'file' | 'folder') => {
    return copyWorkspaceEntry(targetPath, entryType);
  }, [copyWorkspaceEntry]);

  const handleCutWorkspaceEntry = useCallback((targetPath: string, entryType: 'file' | 'folder') => {
    return cutWorkspaceEntry(targetPath, entryType);
  }, [cutWorkspaceEntry]);

  const handlePasteWorkspaceEntry = useCallback(async (destinationFolderPath: string) => {
    const pastedEntry = await pasteWorkspaceEntry(destinationFolderPath);

    if (pastedEntry) {
      queueRevealRequest(pastedEntry.path);
    }

    return pastedEntry;
  }, [pasteWorkspaceEntry, queueRevealRequest]);

  const handleDeleteWorkspaceEntry = useCallback(async (
    targetPath: string,
    entryType: 'file' | 'folder',
  ) => {
    return deleteWorkspaceEntry(targetPath, entryType);
  }, [deleteWorkspaceEntry]);

  const handleRenameWorkspaceEntry = useCallback(async (
    currentPath: string,
    nextPath: string,
    entryType: 'file' | 'folder',
  ) => {
    await renameWorkspaceEntry(currentPath, nextPath, entryType);
    queueRevealRequest(nextPath, { markActiveFileHandled: entryType === 'file' });
  }, [queueRevealRequest, renameWorkspaceEntry]);

  useEffect(() => {
    const electronApi = typeof window === 'undefined' ? undefined : window.electronAPI;

    if (!electronApi?.onWindowFocus) {
      if (typeof window === 'undefined') {
        return undefined;
      }

      const handleWindowFocus = () => {
        refreshWorkspaceGitStatus();
      };

      window.addEventListener('focus', handleWindowFocus);

      return () => {
        window.removeEventListener('focus', handleWindowFocus);
      };
    }

    const disposeWindowFocus = electronApi.onWindowFocus(() => {
      refreshWorkspaceGitStatus();
    });

    return () => {
      disposeWindowFocus();
    };
  }, []);

  useEffect(() => {
    if (mainContentView === 'workflow') {
      setShouldMountWorkflowView(true);
      return;
    }

    if (mainContentView === 'whiteboard') {
      setShouldMountWhiteboardView(true);
    }
  }, [mainContentView]);

  useEffect(() => {
    return preloadDeferredMainContentViews({
      requestWorkflowMount: () => {
        setShouldMountWorkflowView(true);
      },
      requestWhiteboardMount: () => {
        setShouldMountWhiteboardView(true);
      },
    });
  }, []);

  useEffect(() => {
    const notificationsApi = window.electronAPI?.notifications;
    if (!notificationsApi) {
      return undefined;
    }

    let disposed = false;
    void notificationsApi.getHistory().then((records) => {
      if (!disposed) {
        hydrateNotificationHistory(records);
      }
    });

    const dispose = notificationsApi.onHistoryChanged((records) => {
      hydrateNotificationHistory(records);
    });

    return () => {
      disposed = true;
      dispose();
    };
  }, []);

  const handleNotificationProgressDemo = useCallback(() => {
    const notificationDemoIndex = notificationDemoIndexRef.current;
    const notification = demoNotifications[notificationDemoIndex % demoNotifications.length] ?? demoNotifications[0];
    const variant = notificationDemoIndex % 2 === 0 ? 'standard' : 'actions';
    notificationDemoIndexRef.current += 1;
    void publishNotification({
      ...notification,
      actions: variant === 'actions' ? [...demoNotificationActions] : undefined,
      variant,
    });

    demoProgressSessions.forEach((demo, index) => {
      const id = startProgressSession({
        title: demo.title,
        source: demo.source,
        value: 0,
        message: `Mock progress ${index + 1} of ${demoProgressSessions.length}`,
      });
      let value = 0;
      const intervalId = window.setInterval(() => {
        value = Math.min(98, value + demo.increment);
        updateProgressSession(id, { value });
      }, demo.stepMs);
      const timeoutId = window.setTimeout(() => {
        window.clearInterval(intervalId);
        updateProgressSession(id, { value: 100, message: 'Completed' });
        endProgressSession(id);
        progressDemoTimersRef.current = progressDemoTimersRef.current.filter((timerId) => timerId !== intervalId && timerId !== timeoutId);
      }, demo.endDelayMs);

      progressDemoTimersRef.current.push(intervalId, timeoutId);
    });
  }, []);

  const publishWslErrorNotification = useCallback((body: string) => {
    void publishNotification({
      level: 'error',
      title: 'WSL development environment failed',
      body,
    });
  }, []);

  const openWslTerminalPane = useCallback(() => {
    setActiveView('explorer');
    setShowBottomPanel(true);
    showWslTerminalInPane(focusedBottomPaneId);
  }, [focusedBottomPaneId, setActiveView, setShowBottomPanel, showWslTerminalInPane]);

  const stopWslDevelopmentEnvironment = useCallback(async () => {
    if (wslStatus === 'idle' || wslStatus === 'stopping') {
      return;
    }

    await stopWslDevelopmentEnvironmentAndRestore({ notifyOnError: true });
  }, [wslStatus]);

  const handleRunWslDevelopmentEnvironment = useCallback(async () => {
    if (!hasOpenProject || wslStatus === 'checking' || wslStatus === 'installing' || wslStatus === 'starting' || wslStatus === 'stopping') {
      return;
    }

    if (wslStatus === 'running') {
      await stopWslDevelopmentEnvironment();
      return;
    }

    const ubuntuDistro = getConfiguredWslUbuntuDistro();
    setWslUbuntuDistro(ubuntuDistro);
    setWslStatus('checking');

    try {
      const result = await window.electronAPI?.wsl?.startPristineEdaEnvironment({ ubuntuDistro });

      if (!result || !result.ok) {
        const errorMessage = result?.error ?? 'Failed to start Pristine WSL development environment.';
        setWslError(errorMessage);
        publishWslErrorNotification(errorMessage);
        return;
      }

      setWslStatus('starting');
      openWslTerminalPane();
      setWslStatus('running');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start Pristine WSL development environment.';
      setWslError(errorMessage);
      publishWslErrorNotification(errorMessage);
    }
  }, [
    hasOpenProject,
    openWslTerminalPane,
    publishWslErrorNotification,
    setWslError,
    setWslStatus,
    setWslUbuntuDistro,
    stopWslDevelopmentEnvironment,
    wslStatus,
  ]);

  useEffect(() => {
    const unsubscribe = subscribeTerminalSession(WSL_TERMINAL_SESSION_KEY, () => {
      const snapshot = getTerminalSessionSnapshot(WSL_TERMINAL_SESSION_KEY);
      const hadSession = wslTerminalHadSessionRef.current;
      wslTerminalHadSessionRef.current = Boolean(snapshot.sessionId);

      if (hadSession && !snapshot.sessionId && useWslDevelopmentEnvironmentStore.getState().status === 'running') {
        void stopWslDevelopmentEnvironment();
      }
    });

    return unsubscribe;
  }, [stopWslDevelopmentEnvironment]);

  useEffect(() => () => {
    for (const timerId of progressDemoTimersRef.current) {
      window.clearTimeout(timerId);
      window.clearInterval(timerId);
    }
    progressDemoTimersRef.current = [];
  }, []);

  const renderPanelPlaceholder = (title: string, testId: string) => (
    <PlaceholderView title={title} testId={testId} />
  );

  const activityBar = (
    <ActivityBar
      activeView={activeView}
      canConfigureProject={hasOpenProject}
      canRunDevelopmentEnvironment={hasOpenProject && wslStatus !== 'checking' && wslStatus !== 'installing' && wslStatus !== 'starting' && wslStatus !== 'stopping'}
      isDevelopmentEnvironmentActive={wslStatus !== 'idle' && wslStatus !== 'error'}
      onItemSelect={handleActivityItemSelect}
      onProjectConfigure={handleProjectConfigure}
      onRunAction={handleRunWslDevelopmentEnvironment}
    />
  );

  const renderWorkspaceShell = ({
    shellTestId,
    leftPanelId,
    centerPanelId,
    topPanelId,
    bottomPanelId,
    rightPanelId,
    leftContent,
    topContent,
    bottomContent,
    rightContent,
    enableBottomPanelMaximize,
    onBottomPanelAutoHide,
    overlay,
    useLeftPanelFrame,
    useRightPanelFrame,
    leftFixedWidthPx,
    onLeftFixedWidthChange,
    rightFixedWidthPx,
    onRightFixedWidthChange,
    rightFixedMinWidthPx,
    rightFixedMaxWidthPx,
  }: {
    shellTestId?: string;
    leftPanelId: string;
    centerPanelId: string;
    topPanelId: string;
    bottomPanelId: string;
    rightPanelId: string;
    leftContent: React.ReactNode;
    topContent: React.ReactNode;
    bottomContent: React.ReactNode | ((controls: CodeWorkspaceBottomPanelControls) => React.ReactNode);
    rightContent: React.ReactNode;
    enableBottomPanelMaximize?: boolean;
    onBottomPanelAutoHide?: () => void;
    overlay?: React.ReactNode;
    useLeftPanelFrame?: boolean;
    useRightPanelFrame?: boolean;
    leftFixedWidthPx?: number;
    onLeftFixedWidthChange?: React.Dispatch<React.SetStateAction<number>>;
    rightFixedWidthPx?: number;
    onRightFixedWidthChange?: React.Dispatch<React.SetStateAction<number>>;
    rightFixedMinWidthPx?: number;
    rightFixedMaxWidthPx?: number;
  }) => (
    <CodeWorkspaceShell
      shellTestId={shellTestId}
      activityBar={activityBar}
      overlay={overlay}
      useLeftPanelFrame={useLeftPanelFrame}
      useRightPanelFrame={useRightPanelFrame}
      showLeftPanel={showLeftPanel}
      showBottomPanel={showBottomPanel}
      showRightPanel={showRightPanel}
      leftPanelId={leftPanelId}
      centerPanelId={centerPanelId}
      topPanelId={topPanelId}
      bottomPanelId={bottomPanelId}
      rightPanelId={rightPanelId}
      leftContent={leftContent}
      topContent={topContent}
      bottomContent={bottomContent}
      rightContent={rightContent}
      enableBottomPanelMaximize={enableBottomPanelMaximize}
      onBottomPanelAutoHide={onBottomPanelAutoHide}
      leftFixedWidthPx={leftFixedWidthPx}
      onLeftFixedWidthChange={onLeftFixedWidthChange}
      rightFixedWidthPx={rightFixedWidthPx}
      onRightFixedWidthChange={onRightFixedWidthChange}
      rightFixedMinWidthPx={rightFixedMinWidthPx}
      rightFixedMaxWidthPx={rightFixedMaxWidthPx}
    />
  );

  const renderExplorerWorkspace = () => (
    renderWorkspaceShell({
      shellTestId: 'code-view-explorer',
      leftPanelId: 'left-panel',
      centerPanelId: 'center-panel',
      topPanelId: 'editor-panel',
      bottomPanelId: 'bottom-panel',
      rightPanelId: 'right-panel',
      useLeftPanelFrame: !isExplorerLeftPanelSplitVisible,
      useRightPanelFrame: !isExplorerRightPanelSplitVisible,
      leftFixedWidthPx: explorerLeftPanelWidthPx,
      onLeftFixedWidthChange: (nextValue) => {
        setProjectPanelWidth('explorerLeftPanel', typeof nextValue === 'function'
          ? (current) => nextValue(current ?? EXPLORER_LEFT_PANEL_DEFAULT_WIDTH_PX)
          : nextValue);
      },
      rightFixedWidthPx: explorerRightPanelWidthPx,
      onRightFixedWidthChange: (nextValue) => {
        setProjectPanelWidth('explorerRightPanel', (currentWidth = EXPLORER_RIGHT_PANEL_DEFAULT_WIDTH_PX) => {
          const currentTotalWidth = currentWidth + assistantThreadListExtraWidthPx;
          const nextTotalWidth = typeof nextValue === 'function'
            ? nextValue(currentTotalWidth)
            : nextValue;

          return nextTotalWidth - assistantThreadListExtraWidthPx;
        });
      },
      rightFixedMinWidthPx: explorerRightPanelMinWidthPx,
      rightFixedMaxWidthPx: explorerRightPanelMaxWidthPx,
      leftContent: (
        <LeftSidePanel
          activeFileId={activeTabId}
          hasOpenProject={hasOpenProject}
          onClearWorkspaceClipboard={clearWorkspaceClipboard}
          onCopyWorkspaceEntry={handleCopyWorkspaceEntry}
          onSplitPanelVisibleChange={setIsExplorerLeftPanelSplitVisible}
          onCreateWorkspaceFile={handleCreateWorkspaceFile}
          onCreateWorkspaceFolder={handleCreateWorkspaceFolder}
          onCutWorkspaceEntry={handleCutWorkspaceEntry}
          onDeleteWorkspaceEntry={handleDeleteWorkspaceEntry}
          onGitDiffOpen={openGitDiff}
          onFileOpen={openWorkspaceFile}
          onFilePreview={openWorkspacePreviewFile}
          onLineJump={jumpTo}
          onPasteWorkspaceEntry={handlePasteWorkspaceEntry}
          onRenameWorkspaceEntry={handleRenameWorkspaceEntry}
          refreshToken={workspaceTreeRefreshToken}
          revealRequest={quickOpenState.revealRequest}
          workspaceClipboard={workspaceClipboard}
          workspaceRootName={currentProject?.name ?? null}
        />
      ),
      topContent: (
        <EditorSplitLayout
          hasOpenProject={hasOpenProject}
          workspaceBootstrapStatus={workspaceBootstrapStatus}
          jumpToLine={jumpToLine}
          onActiveFileReveal={handleEditorActiveFileReveal}
        />
      ),
      bottomContent: ({ isMaximized, onMaximizeToggle }) => (
        <BottomPanel
          isMaximized={isMaximized}
          layoutVersion={explorerBottomPanelLayoutVersion}
          onClose={() => setShowBottomPanel(false)}
          onMaximizeToggle={onMaximizeToggle}
        />
      ),
      enableBottomPanelMaximize: true,
      onBottomPanelAutoHide: () => setShowBottomPanel(false),
      rightContent: (
        <RightSidePanel
          currentOutlineId={activeTabId}
          onFileOpen={openWorkspaceFile}
          onLineJump={jumpTo}
          onSplitPanelVisibleChange={setIsExplorerRightPanelSplitVisible}
          onThreadListExpandedChange={setAssistantThreadListExpanded}
          onThreadListWidthChange={(nextValue) => {
            setProjectPanelWidth('explorerAssistantThreadList', nextValue);
          }}
        />
      ),
      overlay: (
        <QuickOpenPalette
          isOpen={quickOpenState.isVisible}
          mode={isQuickOpenRecentMode ? 'recent' : 'search'}
          query={quickOpenState.query}
          results={quickOpenResults}
          selectedIndex={quickOpenState.selectedIndex}
          isLoading={quickOpenState.isLoading}
          errorMessage={quickOpenState.errorMessage}
          emptyMessage={isQuickOpenRecentMode ? 'No recently opened files' : 'No matching files'}
          onClose={closeQuickOpen}
          onQueryChange={handleQuickOpenQueryChange}
          onSelectedIndexChange={handleQuickOpenSelectedIndexChange}
          onSelectResult={handleQuickOpenSelect}
        />
      ),
    })
  );

  const renderPlaceholderWorkspace = (viewId: PlaceholderWorkspaceView, mainTitle: string) => (
    renderWorkspaceShell({
      shellTestId: `code-view-${viewId}`,
      leftPanelId: `${viewId}-left-panel`,
      centerPanelId: `${viewId}-center-panel`,
      topPanelId: `${viewId}-main-panel`,
      bottomPanelId: `${viewId}-bottom-panel`,
      rightPanelId: `${viewId}-right-panel`,
      leftContent: renderPanelPlaceholder('Left Panel', `${viewId}-left-panel-content`),
      topContent: renderPanelPlaceholder(mainTitle, `${viewId}-main-panel-content`),
      bottomContent: renderPanelPlaceholder('Bottom Panel', `${viewId}-bottom-panel-content`),
      rightContent: renderPanelPlaceholder('Right Panel', `${viewId}-right-panel-content`),
    })
  );

  const renderPhysicalWorkspace = () => (
    renderWorkspaceShell({
      shellTestId: 'code-view-physical',
      leftPanelId: 'physical-left-panel',
      centerPanelId: 'physical-center-panel',
      topPanelId: 'physical-main-panel',
      bottomPanelId: 'physical-bottom-panel',
      rightPanelId: 'physical-right-panel',
      useLeftPanelFrame: !isPhysicalLeftPanelSplitVisible,
      useRightPanelFrame: !isPhysicalRightPanelSplitVisible,
      leftFixedWidthPx: physicalLeftPanelWidthPx,
      onLeftFixedWidthChange: (nextValue) => {
        setProjectPanelWidth('physicalLeftPanel', typeof nextValue === 'function'
          ? (current) => nextValue(current ?? EXPLORER_LEFT_PANEL_DEFAULT_WIDTH_PX)
          : nextValue);
      },
      rightFixedWidthPx: physicalRightPanelWidthPx,
      onRightFixedWidthChange: (nextValue) => {
        setProjectPanelWidth('physicalRightPanel', typeof nextValue === 'function'
          ? (current) => nextValue(current ?? EXPLORER_RIGHT_PANEL_DEFAULT_WIDTH_PX)
          : nextValue);
      },
      rightFixedMinWidthPx: EXPLORER_RIGHT_PANEL_MIN_WIDTH_PX,
      rightFixedMaxWidthPx: EXPLORER_RIGHT_PANEL_MAX_WIDTH_PX,
      leftContent: (
        <PhysicalLeftPanel
          activeLayoutFilePath={activePhysicalLayoutFilePath}
          catalog={physicalLayoutState.catalog}
          expandedLayoutFilePaths={expandedPhysicalLayoutFilePaths}
          layoutFiles={physicalLayoutFiles}
          selectedTarget={physicalSelectedTarget}
          onLayoutFileToggle={handlePhysicalLayoutFileToggle}
          onLayoutTargetActivate={handlePhysicalLayoutTargetActivate}
          onSplitPanelVisibleChange={setIsPhysicalLeftPanelSplitVisible}
        />
      ),
      topContent: (
        <PhysicalMainPanel
          activeLayoutFilePath={activePhysicalLayoutFilePath}
          highlightedShapeIndex={physicalHighlightedShapeIndex}
          layoutVisibility={physicalLayoutVisibility}
          selectedTarget={physicalSelectedTarget}
          onGdsTileGeometryChange={setPhysicalGdsInspectorGeometry}
          onHighlightedShapeChange={setPhysicalHighlightedShapeIndex}
          onSelectedTargetChange={setPhysicalSelectedTarget}
          onLayoutStateChange={setPhysicalLayoutState}
        />
      ),
      bottomContent: ({ isMaximized, onMaximizeToggle }) => (
        <PhysicalBottomPanel
          isMaximized={isMaximized}
          layoutState={activePhysicalLayoutState}
          onClose={() => setShowBottomPanel(false)}
          onMaximizeToggle={onMaximizeToggle}
        />
      ),
      enableBottomPanelMaximize: true,
      onBottomPanelAutoHide: () => setShowBottomPanel(false),
      rightContent: (
        <PhysicalRightPanel
          gdsInspectorGeometry={physicalGdsInspectorGeometry}
          highlightedShapeIndex={physicalHighlightedShapeIndex}
          layoutVisibility={physicalLayoutVisibility}
          layoutState={activePhysicalLayoutState}
          selectedTarget={physicalSelectedTarget}
          onLayerCategoryVisibilityToggle={handlePhysicalLayerCategoryVisibilityToggle}
          onLayerOpacityChange={handlePhysicalLayerOpacityChange}
          onOutlineVisibilityToggle={handlePhysicalOutlineVisibilityToggle}
          onSplitPanelVisibleChange={setIsPhysicalRightPanelSplitVisible}
        />
      ),
    })
  );

  const renderCodePlaceholder = () => {
    const placeholder = codeViewPlaceholderConfig[activeView as keyof typeof codeViewPlaceholderConfig];

    if (!placeholder) {
      return renderExplorerWorkspace();
    }

    return (
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar
          activeView={activeView}
          canConfigureProject={hasOpenProject}
          canRunDevelopmentEnvironment={hasOpenProject && wslStatus !== 'checking' && wslStatus !== 'installing' && wslStatus !== 'starting' && wslStatus !== 'stopping'}
          isDevelopmentEnvironmentActive={wslStatus !== 'idle' && wslStatus !== 'error'}
          onItemSelect={handleActivityItemSelect}
          onProjectConfigure={handleProjectConfigure}
          onRunAction={handleRunWslDevelopmentEnvironment}
        />
        <div className="flex-1 min-h-0">
          <Suspense fallback={<MainContentFallback />}>
            <PlaceholderView title={placeholder.title} testId={placeholder.testId} />
          </Suspense>
        </div>
      </div>
    );
  };

  const renderDeferredMainContentLayer = ({
    active,
    children,
    mounted,
    testId,
  }: {
    active: boolean;
    children: React.ReactNode;
    mounted: boolean;
    testId: string;
  }) => {
    if (!mounted) {
      return null;
    }

    return (
      <div
        data-testid={testId}
        data-active={active ? 'true' : 'false'}
        data-mounted="true"
        aria-hidden={!active}
        className={`absolute inset-0 min-h-0 ${active ? 'z-10' : '-z-10 opacity-0 pointer-events-none'}`}
      >
        {children}
      </div>
    );
  };

  const renderMainContentStack = () => {
    const isCodeViewActive = mainContentView === 'code';
    const isWhiteboardViewActive = mainContentView === 'whiteboard';
    const isWorkflowViewActive = mainContentView === 'workflow';

    return (
      <div data-testid="main-content-stack" className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        {isCodeViewActive
          ? (activeView === 'explorer'
            ? renderExplorerWorkspace()
            : activeView === 'simulation'
              ? renderPlaceholderWorkspace('simulation', 'Simulation Workspace')
              : activeView === 'synthesis'
                ? renderPlaceholderWorkspace('synthesis', 'Synthesis')
                : activeView === 'physical'
                  ? renderPhysicalWorkspace()
                  : renderCodePlaceholder())
          : null}

        {renderDeferredMainContentLayer({
          active: isWhiteboardViewActive,
          mounted: shouldMountWhiteboardView || isWhiteboardViewActive,
          testId: 'main-content-whiteboard-layer',
          children: (
            <Suspense fallback={<MainContentFallback />}>
              <WhiteboardView isActive={isWhiteboardViewActive} />
            </Suspense>
          ),
        })}

        {renderDeferredMainContentLayer({
          active: isWorkflowViewActive,
          mounted: shouldMountWorkflowView || isWorkflowViewActive,
          testId: 'main-content-workflow-layer',
          children: (
            <Suspense fallback={<MainContentFallback />}>
              <WorkflowView isActive={isWorkflowViewActive} />
            </Suspense>
          ),
        })}
      </div>
    );
  };

  const { failedSaveFileCount, savingFileCount } = useMemo(() => {
    let nextSavingFileCount = 0;
    let nextFailedSaveFileCount = 0;

    for (const fileId of dirtyFileIds) {
      if (savingFiles[fileId]) {
        nextSavingFileCount += 1;
      }

      if (saveErrors[fileId]) {
        nextFailedSaveFileCount += 1;
      }
    }

    return {
      failedSaveFileCount: nextFailedSaveFileCount,
      savingFileCount: nextSavingFileCount,
    };
  }, [dirtyFileIds, saveErrors, savingFiles]);

  useGlobalAppShortcuts({
    canToggleLayoutPanels,
    closeActiveTabInFocusedGroup,
    closeQuickOpen,
    isQuickOpenVisible: quickOpenState.isVisible,
    openUntitledFile: handleCreateUntitledFile,
    openQuickOpen,
    saveActiveFile,
    setShowBottomPanel,
    setShowLeftPanel,
    setShowRightPanel,
    showBottomPanel,
    showLeftPanel,
    showRightPanel,
  });

  return (
    <SidebarProvider
      defaultOpen={false}
      keyboardShortcut={false}
      style={{ '--sidebar-width': '13rem' } as React.CSSProperties}
      className="flex h-screen min-h-0 flex-col bg-background text-foreground overflow-hidden"
    >
      <MenuBar
        onNotificationProgressDemo={handleNotificationProgressDemo}
        showLeftPanel={showLeftPanel}
        showBottomPanel={showBottomPanel}
        showRightPanel={showRightPanel}
        onShowLeftPanelChange={setShowLeftPanel}
        onShowBottomPanelChange={setShowBottomPanel}
        onShowRightPanelChange={setShowRightPanel}
      />
      <ConfigureProjectDialog currentProject={currentProject} />
      <UnsavedChangesDialog />
      <DeleteConfirmationDialog />

      {renderMainContentStack()}

      <AppStatusBar
        mainContentView={mainContentView}
        activeView={activeView}
        activeFileId={activeTabId}
        cursorLine={cursorLine}
        cursorCol={cursorCol}
        dirtyFileCount={dirtyFileIds.length}
        failedSaveFileCount={failedSaveFileCount}
        savingFileCount={savingFileCount}
        onOpenUnsavedFiles={openUnsavedChangesDialog}
        onSaveAll={() => {
          void saveAllFiles();
        }}
      />
    </SidebarProvider>
  );
}

function getPhysicalLayoutFileExtension(fileName: string): string {
  const normalized = fileName.toLowerCase();
  const index = normalized.lastIndexOf('.');
  return index >= 0 ? normalized.slice(index) : '';
}

function isPhysicalLayoutFileExtension(extension: string): boolean {
  return extension === '.lef'
    || extension === '.def'
    || extension === '.gds'
    || extension === '.gdsii'
    || extension === '.oas'
    || extension === '.oasis';
}

export default function App() {
  return (
    <WorkspaceProvider>
      <CodeViewerLayoutProvider>
        <ModuleHierarchyProvider>
          <AppLayout />
        </ModuleHierarchyProvider>
      </CodeViewerLayoutProvider>
    </WorkspaceProvider>
  );
}
