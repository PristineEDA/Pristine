import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../../ui/resizable';
import { EditorArea } from './EditorArea';
import { useWorkspaceEditor, useWorkspaceFiles, useWorkspaceProject } from '../../../context/WorkspaceContext';
import { useProjectDialogStore } from './useProjectDialogStore';
import {
  getEditorTabDocumentId,
  getEditorTabSourceFileId,
  type EditorDropPosition,
  type EditorGroup,
  type EditorLayoutNode,
  type SplitDirection,
} from '../../../editor/editorLayout';
import type { CursorRestoreRequest } from '../../../context/useWorkspaceEditorState';

interface DragState {
  sourceGroupId: string;
  tabId: string;
}

interface DropTargetState {
  groupId: string;
  position: EditorDropPosition;
}

interface CursorPosition {
  line: number;
  col: number;
}

interface EditorGroupWorkspaceActions {
  clearCursorRestoreRequest: (groupId: string, token: number) => void;
  closeActiveTabInFocusedGroup: () => void;
  closeFileInGroup: (groupId: string, fileId: string) => void;
  cycleFocusedGroupTabs: (direction?: 'forward' | 'backward') => void;
  focusGroup: (groupId: string) => void;
  loadFileContent: (fileId: string) => void;
  openFileInGroup: (fileId: string, fileName: string, groupId: string) => void;
  openUntitledFile: (groupId?: string) => string;
  pinTabInGroup: (groupId: string, tabId: string) => void;
  registerEditorRef: (groupId: string, editorInstance: any) => void;
  restoreEditorSelection: (snapshot: { groupId: string; fileId: string; line: number; col: number }) => void;
  saveActiveFile: () => Promise<boolean>;
  setActiveTabIdInGroup: (groupId: string, tabId: string) => void;
  setCursorPos: (line: number, col: number, groupId?: string, fileId?: string) => void;
  splitGroup: (groupId: string, direction?: SplitDirection) => void;
  updateFileContentInGroup: (groupId: string, fileId: string, content: string) => void;
}

const DROP_POSITION_LABELS: Record<EditorDropPosition, string> = {
  center: 'Move to group',
  left: 'Split left',
  right: 'Split right',
  top: 'Split up',
  bottom: 'Split down',
};

const DROP_ZONE_CLASS_NAMES: Record<EditorDropPosition, string> = {
  center: 'left-[20%] right-[20%] top-[20%] bottom-[20%]',
  left: 'left-0 top-0 bottom-0 w-1/2',
  right: 'right-0 top-0 bottom-0 w-1/2',
  top: 'left-0 right-0 top-0 h-1/2',
  bottom: 'left-0 right-0 bottom-0 h-1/2',
};

const DROP_PREVIEW_CLASS_NAMES: Record<EditorDropPosition, string> = {
  center: 'left-[20%] right-[20%] top-[20%] bottom-[20%] rounded-sm border border-ide-text-muted/70 bg-ide-selection',
  left: 'left-1/2 top-3 bottom-3 w-px -translate-x-1/2 bg-ide-text-muted/75',
  right: 'right-1/2 top-3 bottom-3 w-px translate-x-1/2 bg-ide-text-muted/75',
  top: 'left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-ide-text-muted/75',
  bottom: 'left-3 right-3 bottom-1/2 h-px translate-y-1/2 bg-ide-text-muted/75',
};

const FOCUSABLE_TARGET_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function shouldFocusEditorGroupRoot(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  if (target.closest('.monaco-editor')) {
    return false;
  }

  return target.closest(FOCUSABLE_TARGET_SELECTOR) === null;
}

function ResizeHandle({ direction }: { direction: SplitDirection }) {
  return (
    <ResizableHandle
      className={`group relative flex items-center justify-center ${
        direction === 'horizontal' ? 'w-1 cursor-ew-resize' : 'h-1 cursor-ns-resize'
      } bg-ide-border hover:bg-ide-accent transition-colors z-10`}
    >
      <div
        className={`${
          direction === 'horizontal' ? 'w-0.5 h-8' : 'h-0.5 w-8'
        } bg-ide-border group-hover:bg-ide-accent rounded transition-colors`}
      />
    </ResizableHandle>
  );
}

function getDropPosition(rect: DOMRect, clientX: number, clientY: number): EditorDropPosition {
  const relativeX = (clientX - rect.left) / rect.width;
  const relativeY = (clientY - rect.top) / rect.height;
  const edgeThreshold = 0.22;

  if (relativeY <= edgeThreshold) {
    return 'top';
  }

  if (relativeY >= 1 - edgeThreshold) {
    return 'bottom';
  }

  if (relativeX <= edgeThreshold) {
    return 'left';
  }

  if (relativeX >= 1 - edgeThreshold) {
    return 'right';
  }

  return 'center';
}

function DropIndicator({ position }: { position: EditorDropPosition }) {
  const orderedPositions: EditorDropPosition[] = ['left', 'top', 'center', 'right', 'bottom'];

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute inset-2 rounded-sm border border-ide-border/55 bg-ide-selection shadow-[inset_0_0_0_1px_var(--ide-border)]" />
      {orderedPositions.map((candidatePosition) => {
        const isActive = candidatePosition === position;

        return (
          <div
            key={candidatePosition}
            className={`absolute rounded-sm border transition-all duration-150 ease-out ${DROP_ZONE_CLASS_NAMES[candidatePosition]} ${
              isActive
                ? 'border-ide-text-muted/65 bg-ide-selection opacity-100 scale-100'
                : 'border-ide-border/20 bg-ide-border/10 opacity-0 scale-[0.985]'
            }`}
          />
        );
      })}
      <div
        data-testid={`editor-drop-indicator-${position}`}
        className={`absolute transition-all duration-150 ease-out ${DROP_PREVIEW_CLASS_NAMES[position]} ${
          position === 'center' ? 'shadow-[0_0_0_1px_rgba(0,0,0,0.18)]' : 'shadow-[0_0_6px_rgba(204,204,204,0.16)]'
        }`}
      />
      <div className="absolute bottom-3 right-3 rounded-sm border border-ide-border/70 bg-popover/95 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-ide-text-muted transition-all duration-150 ease-out">
        {DROP_POSITION_LABELS[position]}
      </div>
    </div>
  );
}

const EditorGroupLeaf = memo(function EditorGroupLeaf({
  group,
  focused,
  jumpToLine,
  dropPosition,
  activeCursorPosition,
  cursorRestoreRequest,
  contentCache,
  loadingFiles,
  loadErrors,
  onDropPosition,
  onClearDrop,
  onFocus,
  onMoveTab,
  onDragStart,
  onDragEnd,
  dragState,
  onActiveFileReveal,
  resolveFileId,
  workspaceActionsRef,
  hasOpenProject,
  workspaceBootstrapStatus,
  onCreateProject,
  onOpenProject,
}: {
  group: EditorGroup;
  focused: boolean;
  jumpToLine?: number;
  dropPosition: EditorDropPosition | null;
  activeCursorPosition?: CursorPosition;
  cursorRestoreRequest?: CursorRestoreRequest;
  contentCache: Record<string, string>;
  loadingFiles: Record<string, boolean>;
  loadErrors: Record<string, string>;
  onDropPosition: (groupId: string, position: EditorDropPosition) => void;
  onClearDrop: (groupId: string) => void;
  onFocus: (groupId: string) => void;
  onMoveTab: (targetGroupId: string, position: EditorDropPosition) => void;
  onDragStart: (groupId: string, tabId: string) => void;
  onDragEnd: () => void;
  dragState: DragState | null;
  onActiveFileReveal?: (fileId: string) => void;
  resolveFileId: (fileId: string) => string;
  workspaceActionsRef: React.MutableRefObject<EditorGroupWorkspaceActions>;
  hasOpenProject: boolean;
  workspaceBootstrapStatus: 'bootstrapping' | 'ready';
  onCreateProject?: () => void;
  onOpenProject?: () => void;
}) {
  const editorRef = useRef<any>(null);
  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId);
  const activeDocumentId = getEditorTabDocumentId(activeTab) || resolveFileId(group.activeTabId);

  const handleGroupMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    onFocus(group.id);

    if (shouldFocusEditorGroupRoot(event.target)) {
      event.currentTarget.focus();
    }
  };

  const handleGroupKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!focused || !(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 'w' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      workspaceActionsRef.current.closeActiveTabInFocusedGroup();
      return;
    }

    if (key === 'n' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      workspaceActionsRef.current.openUntitledFile(group.id);
      return;
    }

    if (key === 'tab') {
      event.preventDefault();
      event.stopPropagation();
      workspaceActionsRef.current.cycleFocusedGroupTabs(event.shiftKey ? 'backward' : 'forward');
    }
  };

  return (
    <div
      data-testid={`editor-group-${group.id}`}
      data-editor-group-root="true"
      data-focused={focused ? 'true' : 'false'}
      tabIndex={-1}
      className={`relative h-full min-w-0 ${dropPosition ? 'ring-1 ring-inset ring-border/80' : ''}`}
      onFocusCapture={() => onFocus(group.id)}
      onKeyDownCapture={handleGroupKeyDownCapture}
      onMouseDown={handleGroupMouseDown}
      onDragOver={(event) => {
        if (!dragState) {
          return;
        }

        event.preventDefault();
        onDropPosition(group.id, getDropPosition(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY));
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }

        onClearDrop(group.id);
      }}
      onDrop={(event) => {
        if (!dragState) {
          return;
        }

        event.preventDefault();
        onMoveTab(group.id, getDropPosition(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY));
      }}
    >
      {dropPosition && <DropIndicator position={dropPosition} />}
      <EditorArea
        tabs={group.tabs}
        activeTabId={group.activeTabId}
        hasOpenProject={hasOpenProject}
        workspaceBootstrapStatus={workspaceBootstrapStatus}
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
        documentTabId={activeDocumentId}
        onTabChange={(tabId) => {
          const nextTab = group.tabs.find((tab) => tab.id === tabId);
          onActiveFileReveal?.(getEditorTabSourceFileId(nextTab) || tabId);
          workspaceActionsRef.current.setActiveTabIdInGroup(group.id, tabId);
        }}
        onTabClose={(tabId) => workspaceActionsRef.current.closeFileInGroup(group.id, tabId)}
        onTabPin={(tabId) => workspaceActionsRef.current.pinTabInGroup(group.id, tabId)}
        editorRef={editorRef}
        cursorPosition={activeCursorPosition}
        cursorRestoreRequest={cursorRestoreRequest}
        onCursorRestoreRequestConsumed={(token) => workspaceActionsRef.current.clearCursorRestoreRequest(group.id, token)}
        jumpToLine={jumpToLine}
        onCursorChange={(line, col) => {
          if (!group.activeTabId) {
            return;
          }

          workspaceActionsRef.current.setCursorPos(line, col, group.id, activeDocumentId);
        }}
        onSplitEditor={(direction) => workspaceActionsRef.current.splitGroup(group.id, direction)}
        onFocus={() => onFocus(group.id)}
        focused={focused}
        onTabDragStart={(tabId) => onDragStart(group.id, tabId)}
        onTabDragEnd={onDragEnd}
        contentCache={contentCache}
        loadingFiles={loadingFiles}
        loadErrors={loadErrors}
        onLoadFile={workspaceActionsRef.current.loadFileContent}
        onSaveShortcut={() => {
          void workspaceActionsRef.current.saveActiveFile();
        }}
        onNewShortcut={() => {
          workspaceActionsRef.current.openUntitledFile(group.id);
        }}
        onCloseShortcut={() => {
          workspaceActionsRef.current.closeActiveTabInFocusedGroup();
        }}
        onContentChange={(fileId, content) => {
          workspaceActionsRef.current.updateFileContentInGroup(group.id, fileId, content);
        }}
        onEditorMount={(editor) => workspaceActionsRef.current.registerEditorRef(group.id, editor)}
        onNavigateToLocation={(fileId, line, col) => {
          const fileName = fileId.split('/').pop() ?? fileId;
          workspaceActionsRef.current.openFileInGroup(fileId, fileName, group.id);
          workspaceActionsRef.current.restoreEditorSelection({
            groupId: group.id,
            fileId,
            line,
            col,
          });
        }}
        showDragInteractionShield={Boolean(dragState)}
        dragInteractionShieldTestId={`editor-drag-shield-${group.id}`}
      />
    </div>
  );
});

export function EditorSplitLayout({
  hasOpenProject = true,
  workspaceBootstrapStatus = 'ready',
  jumpToLine,
  onActiveFileReveal,
}: {
  hasOpenProject?: boolean;
  workspaceBootstrapStatus?: 'bootstrapping' | 'ready';
  jumpToLine?: number;
  onActiveFileReveal?: (fileId: string) => void;
}) {
  const {
    clearCursorRestoreRequest,
    closeActiveTabInFocusedGroup,
    closeFileInGroup,
    cycleFocusedGroupTabs,
    editorLayout,
    focusGroup,
    focusedGroupId,
    getCursorRestoreRequest,
    getStoredCursorPosition,
    editorGroups,
    moveTab,
    openFileInGroup,
    openUntitledFile,
    pinTabInGroup,
    registerEditorRef,
    restoreEditorSelection,
    resolveFileId,
    setActiveTabIdInGroup,
    setCursorPos,
    splitGroup,
  } = useWorkspaceEditor();
  const {
    fileContents,
    loadErrors,
    loadFileContent,
    loadingFiles,
    saveActiveFile,
    updateFileContentInGroup,
  } = useWorkspaceFiles();
  const { openProject } = useWorkspaceProject();
  const openCreateProjectDialog = useProjectDialogStore((state) => state.openCreateProjectDialog);
  const handleCreateProject = useCallback(() => {
    openCreateProjectDialog();
  }, [openCreateProjectDialog]);
  const handleOpenProject = useCallback(() => {
    void openProject();
  }, [openProject]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const moveTabRef = useRef(moveTab);
  const workspaceActionsRef = useRef<EditorGroupWorkspaceActions>({
    clearCursorRestoreRequest,
    closeActiveTabInFocusedGroup,
    closeFileInGroup,
    cycleFocusedGroupTabs,
    focusGroup,
    loadFileContent,
    openFileInGroup,
    openUntitledFile,
    pinTabInGroup,
    registerEditorRef,
    restoreEditorSelection,
    saveActiveFile,
    setActiveTabIdInGroup,
    setCursorPos,
    splitGroup,
    updateFileContentInGroup,
  });

  workspaceActionsRef.current = {
    clearCursorRestoreRequest,
    closeActiveTabInFocusedGroup,
    closeFileInGroup,
    cycleFocusedGroupTabs,
    focusGroup,
    loadFileContent,
    openFileInGroup,
    openUntitledFile,
    pinTabInGroup,
    registerEditorRef,
    restoreEditorSelection,
    saveActiveFile,
    setActiveTabIdInGroup,
    setCursorPos,
    splitGroup,
    updateFileContentInGroup,
  };
  moveTabRef.current = moveTab;

  const groupsById = useMemo(
    () => Object.fromEntries(editorGroups.map((group) => [group.id, group])),
    [editorGroups],
  );

  const clearDragState = useCallback(() => {
    setDragState(null);
    setDropTarget(null);
  }, []);

  const handleDropPosition = useCallback((groupId: string, position: EditorDropPosition) => {
    setDropTarget((current) => {
      if (current?.groupId === groupId && current.position === position) {
        return current;
      }

      return { groupId, position };
    });
  }, []);

  const handleClearDrop = useCallback((groupId: string) => {
    setDropTarget((current) => (current?.groupId === groupId ? null : current));
  }, []);

  const handleFocusGroup = useCallback((groupId: string) => {
    workspaceActionsRef.current.focusGroup(groupId);
  }, []);

  const handleMoveTab = useCallback((targetGroupId: string, position: EditorDropPosition) => {
    if (!dragState) {
      return;
    }

    moveTabRef.current(dragState.sourceGroupId, dragState.tabId, targetGroupId, position);
    clearDragState();
  }, [clearDragState, dragState]);

  const handleDragStart = useCallback((sourceGroupId: string, tabId: string) => {
    setDragState({ sourceGroupId, tabId });
    setDropTarget(null);
  }, []);

  const renderNode = (node: EditorLayoutNode | null): React.ReactNode => {
    if (!node) {
      return (
        <EditorArea
          tabs={[]}
          activeTabId=""
          hasOpenProject={hasOpenProject}
          workspaceBootstrapStatus={workspaceBootstrapStatus}
          onCreateProject={handleCreateProject}
          onOpenProject={handleOpenProject}
          onTabChange={() => undefined}
          onTabClose={() => undefined}
          editorRef={{ current: null }}
        />
      );
    }

    if (node.type === 'group') {
      const group = groupsById[node.groupId];
      if (!group) {
        return null;
      }

      return (
        <EditorGroupLeaf
          key={group.id}
          group={group}
          focused={focusedGroupId === group.id}
          jumpToLine={focusedGroupId === group.id ? jumpToLine : undefined}
          dropPosition={dropTarget?.groupId === group.id ? dropTarget.position : null}
          activeCursorPosition={group.activeTabId ? getStoredCursorPosition(group.id, group.activeTabId) : undefined}
          cursorRestoreRequest={getCursorRestoreRequest(group.id)}
          contentCache={fileContents}
          loadingFiles={loadingFiles}
          loadErrors={loadErrors}
          onDropPosition={handleDropPosition}
          onClearDrop={handleClearDrop}
          onFocus={handleFocusGroup}
          onMoveTab={handleMoveTab}
          onDragStart={handleDragStart}
          onDragEnd={clearDragState}
          dragState={dragState}
          onActiveFileReveal={onActiveFileReveal}
          resolveFileId={resolveFileId}
            workspaceActionsRef={workspaceActionsRef}
            hasOpenProject={hasOpenProject}
            workspaceBootstrapStatus={workspaceBootstrapStatus}
            onCreateProject={handleCreateProject}
            onOpenProject={handleOpenProject}
          />
      );
    }

    const direction = node.direction;
    return (
      <ResizablePanelGroup orientation={direction} className="h-full min-w-0">
        <ResizablePanel defaultSize={50} minSize={15}>
          {renderNode(node.children[0])}
        </ResizablePanel>
        <ResizeHandle direction={direction} />
        <ResizablePanel defaultSize={50} minSize={15}>
          {renderNode(node.children[1])}
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  };

  return <div className="h-full min-w-0">{renderNode(editorLayout)}</div>;
}
