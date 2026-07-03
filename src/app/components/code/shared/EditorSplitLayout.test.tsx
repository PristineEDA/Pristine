import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider, useWorkspace } from '../../../context/WorkspaceContext';
import { EditorSplitLayout } from './EditorSplitLayout';
import { resetProjectDialogStoreForTests, useProjectDialogStore } from './useProjectDialogStore';

const editorAreaRenderCounts = new Map<string, number>();

function clearEditorAreaRenderCounts() {
  editorAreaRenderCounts.clear();
}

function getEditorAreaRenderCount(groupId: string) {
  return editorAreaRenderCounts.get(groupId) ?? 0;
}

vi.mock('./EditorArea', () => ({
  EditorArea: ({
    tabs,
    activeTabId,
    onTabChange,
    onTabClose,
    onTabPin,
    onSplitEditor,
    onTabDragStart,
    onTabDragEnd,
    onFocus,
    onCreateProject,
    onOpenProject,
    showDragInteractionShield,
    dragInteractionShieldTestId,
  }: any) => {
    const groupId = dragInteractionShieldTestId?.replace('editor-drag-shield-', '') ?? 'empty';
    editorAreaRenderCounts.set(groupId, (editorAreaRenderCounts.get(groupId) ?? 0) + 1);

    return (
      <div data-testid="mock-editor-area" onMouseDown={onFocus}>
        <div data-testid="mock-active-tab">{activeTabId}</div>
        <div data-testid="mock-tabs">{tabs.map((tab: { id: string }) => tab.id).join(',')}</div>
        <div data-testid="mock-preview-tabs">{tabs.filter((tab: { isPinned?: boolean }) => tab.isPinned === false).map((tab: { id: string }) => tab.id).join(',')}</div>
        {showDragInteractionShield ? <div data-testid={dragInteractionShieldTestId} /> : null}
        {onCreateProject ? <button onClick={onCreateProject}>create-project-action</button> : null}
        {onOpenProject ? <button onClick={onOpenProject}>open-project-action</button> : null}
        {onSplitEditor ? <button onClick={() => onSplitEditor('horizontal')}>split-editor</button> : null}
        {onSplitEditor ? <button onClick={() => onSplitEditor('vertical')}>split-editor-down</button> : null}
        {tabs.map((tab: { id: string; name: string }) => (
          <div key={tab.id}>
            <button
              data-testid={`mock-tab-${tab.id}`}
              draggable
              onClick={() => onTabChange(tab.id)}
              onDoubleClick={() => onTabPin?.(tab.id)}
              onDragStart={() => {
                onTabPin?.(tab.id);
                onTabDragStart?.(tab.id);
              }}
              onDragEnd={() => onTabDragEnd?.()}
            >
              {tab.name}
            </button>
            <button data-testid={`mock-close-${tab.id}`} onClick={() => onTabClose(tab.id)}>
              close
            </button>
          </div>
        ))}
      </div>
    );
  },
}));

function LayoutHarness({ onActiveFileReveal }: { onActiveFileReveal?: (fileId: string) => void } = {}) {
  const { openFile, openPreviewFile } = useWorkspace();

  return (
    <div>
      <button onClick={() => openFile('rtl/core/reg_file.v', 'reg_file.v')}>open-reg</button>
      <button onClick={() => openFile('rtl/core/alu.v', 'alu.v')}>open-alu</button>
      <button onClick={() => openFile('.gitignore', '.gitignore')}>open-gitignore</button>
      <button onClick={() => openPreviewFile('rtl/core/reg_file.v', 'reg_file.v')}>preview-reg</button>
      <EditorSplitLayout onActiveFileReveal={onActiveFileReveal} />
    </div>
  );
}

function mockRect(element: HTMLElement) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

function fireDragEvent(element: HTMLElement, type: 'dragover' | 'drop', clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { configurable: true, value: clientX },
    clientY: { configurable: true, value: clientY },
  });
  fireEvent(element, event);
}

type TestUser = ReturnType<typeof userEvent.setup>;

let testUser: TestUser;

async function clickText(text: string) {
  await testUser.click(screen.getByText(text));
}

async function clickWithin(testId: string, text: string) {
  await testUser.click(within(screen.getByTestId(testId)).getByText(text));
}

describe('EditorSplitLayout', () => {
  beforeEach(() => {
    testUser = userEvent.setup();
    clearEditorAreaRenderCounts();
    resetProjectDialogStoreForTests();
  });

  it('passes empty project create and open actions into editor areas', async () => {
    render(
      <WorkspaceProvider>
        <EditorSplitLayout hasOpenProject={false} />
      </WorkspaceProvider>,
    );

    await clickText('create-project-action');
    expect(useProjectDialogStore.getState().createProjectDialogOpen).toBe(true);

    await clickText('open-project-action');
    await waitFor(() => {
      expect(window.electronAPI?.project.openProject).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps focused editor groups free of the blue focus ring', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');

    const group = screen.getByTestId('editor-group-group-1');
    fireEvent.focus(group);

    expect(group).toHaveAttribute('data-focused', 'true');
    expect(group).not.toHaveClass('ring-1', 'ring-inset', 'ring-primary/50');
  });

  it('creates a second editor group from the split action', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickWithin('editor-group-group-1', 'split-editor');

    expect(screen.getByTestId('editor-group-group-2')).toBeInTheDocument();
    expect(within(screen.getByTestId('editor-group-group-1')).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/reg_file.v');
    expect(within(screen.getByTestId('editor-group-group-2')).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/reg_file.v');
  });

  it('supports creating a vertical split from the tab bar actions', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickWithin('editor-group-group-1', 'split-editor-down');

    expect(screen.getByTestId('editor-group-group-2')).toBeInTheDocument();
    expect(within(screen.getByTestId('editor-group-group-2')).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/reg_file.v');
  });

  it('uses ew-resize for horizontal split handles', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickWithin('editor-group-group-1', 'split-editor');

    const handle = document.querySelector('[data-slot="resizable-handle"].cursor-ew-resize');

    expect(handle).not.toBeNull();
  });

  it('uses ns-resize for vertical split handles', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickWithin('editor-group-group-1', 'split-editor-down');

    const handle = document.querySelector('[data-slot="resizable-handle"].cursor-ns-resize');

    expect(handle).not.toBeNull();
  });

  it('creates a new split when a tab is dropped on the right edge', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');

    const group = screen.getByTestId('editor-group-group-1');
    mockRect(group);

    const draggedTab = within(group).getByTestId('mock-tab-rtl/core/reg_file.v');
    fireEvent.dragStart(draggedTab);

    expect(screen.getByTestId('editor-drag-shield-group-1')).toBeInTheDocument();

    fireDragEvent(group, 'dragover', 95, 50);

    expect(group).toHaveClass('ring-1', 'ring-inset', 'ring-border/80');
    expect(group).not.toHaveClass('ring-primary/50');

    const indicator = screen.getByTestId('editor-drop-indicator-right');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass('w-px', 'transition-all', 'duration-150', 'ease-out');
    expect(indicator).toHaveClass('right-1/2', 'translate-x-1/2', 'bg-ide-text-muted/75');

    fireDragEvent(group, 'drop', 95, 50);
    fireEvent.dragEnd(draggedTab);

    expect(screen.getByTestId('editor-group-group-2')).toBeInTheDocument();
    expect(within(screen.getByTestId('editor-group-group-2')).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/reg_file.v');
    expect(screen.queryByTestId('editor-drag-shield-group-1')).not.toBeInTheDocument();
  });

  it('pins a preview tab when the tab itself is double-clicked', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('preview-reg');
    const group = screen.getByTestId('editor-group-group-1');
    const previewTab = within(group).getByTestId('mock-tab-rtl/core/reg_file.v');

    await testUser.dblClick(previewTab);

    expect(within(group).getByTestId('mock-active-tab')).toHaveTextContent('rtl/core/reg_file.v');
    expect(within(group).getByTestId('mock-preview-tabs')).toHaveTextContent('');
  });

  it('pins a preview tab before drag state starts so cancelled drags still keep it', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('preview-reg');
    const group = screen.getByTestId('editor-group-group-1');
    const previewTab = within(group).getByTestId('mock-tab-rtl/core/reg_file.v');

    fireEvent.dragStart(previewTab);

    expect(within(group).getByTestId('mock-preview-tabs')).toHaveTextContent('');
    expect(screen.getByTestId('editor-drag-shield-group-1')).toBeInTheDocument();
  });

  it('requests explorer reveal whenever a tab is activated, including repeated clicks on the active tab', async () => {
    const onActiveFileReveal = vi.fn();

    render(
      <WorkspaceProvider>
        <LayoutHarness onActiveFileReveal={onActiveFileReveal} />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickText('open-alu');

    const group = screen.getByTestId('editor-group-group-1');
    const aluTab = within(group).getByTestId('mock-tab-rtl/core/alu.v');

    await testUser.click(aluTab);
    await testUser.click(aluTab);

    expect(onActiveFileReveal).toHaveBeenNthCalledWith(1, 'rtl/core/alu.v');
    expect(onActiveFileReveal).toHaveBeenNthCalledWith(2, 'rtl/core/alu.v');
  });

  it('moves a tab into an existing group when dropped in the center', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickText('open-alu');
    await clickWithin('editor-group-group-1', 'split-editor');

    const sourceGroup = screen.getByTestId('editor-group-group-1');
    const targetGroup = screen.getByTestId('editor-group-group-2');
    mockRect(targetGroup);

    fireEvent.dragStart(within(sourceGroup).getByTestId('mock-tab-rtl/core/reg_file.v'));
    fireDragEvent(targetGroup, 'dragover', 50, 50);

    const indicator = screen.getByTestId('editor-drop-indicator-center');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass('transition-all', 'duration-150', 'ease-out');
    expect(indicator).toHaveClass('left-[20%]', 'right-[20%]', 'top-[20%]', 'bottom-[20%]');

    fireDragEvent(targetGroup, 'drop', 50, 50);

    expect(within(sourceGroup).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/alu.v');
    expect(within(targetGroup).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/alu.v,rtl/core/reg_file.v');
  });

  it('keeps an unchanged split group from rerendering when another group opens a file', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickWithin('editor-group-group-1', 'split-editor');

    clearEditorAreaRenderCounts();
    await clickText('open-alu');

    expect(within(screen.getByTestId('editor-group-group-1')).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/reg_file.v');
    expect(within(screen.getByTestId('editor-group-group-2')).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/reg_file.v,rtl/core/alu.v');
    expect(getEditorAreaRenderCount('group-1')).toBe(0);
    expect(getEditorAreaRenderCount('group-2')).toBeGreaterThan(0);
  });

  it('cycles the focused group tabs to the right and reverses with Ctrl/Cmd+Shift+Tab', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickText('open-alu');
    await clickText('open-gitignore');

    const group = screen.getByTestId('editor-group-group-1');
    fireEvent.mouseDown(group);
    await testUser.click(within(group).getByTestId('mock-tab-rtl/core/alu.v'));

    fireEvent.keyDown(group, { key: 'Tab', ctrlKey: true });
    expect(within(group).getByTestId('mock-active-tab')).toHaveTextContent('.gitignore');

    fireEvent.keyDown(group, { key: 'Tab', metaKey: true, shiftKey: true });
    expect(within(group).getByTestId('mock-active-tab')).toHaveTextContent('rtl/core/alu.v');
  });

  it('closes only the focused group active tab with Ctrl+W', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');
    await clickWithin('editor-group-group-1', 'split-editor');
    await clickText('open-alu');

    const firstGroup = screen.getByTestId('editor-group-group-1');
    const secondGroup = screen.getByTestId('editor-group-group-2');
    fireEvent.mouseDown(secondGroup);

    fireEvent.keyDown(secondGroup, { key: 'w', ctrlKey: true });

    expect(within(firstGroup).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/reg_file.v');
    expect(within(secondGroup).getByTestId('mock-tabs')).toHaveTextContent('rtl/core/reg_file.v');
    expect(within(secondGroup).getByTestId('mock-active-tab')).toHaveTextContent('rtl/core/reg_file.v');
  });

  it('does not prevent plain Space key events in the focused editor group', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');

    const group = screen.getByTestId('editor-group-group-1');
    fireEvent.mouseDown(group);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Space',
      key: ' ',
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');

    group.dispatchEvent(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('renders half-pane edge hot zones with animated neutral styling', async () => {
    render(
      <WorkspaceProvider>
        <LayoutHarness />
      </WorkspaceProvider>,
    );

    await clickText('open-reg');

    const group = screen.getByTestId('editor-group-group-1');
    mockRect(group);

    fireEvent.dragStart(within(group).getByTestId('mock-tab-rtl/core/reg_file.v'));
    fireDragEvent(group, 'dragover', 10, 50);

    const indicator = screen.getByTestId('editor-drop-indicator-left');
    expect(indicator).toHaveClass('transition-all', 'duration-150', 'ease-out');

    const halfPaneZone = Array.from(group.querySelectorAll('div')).find((element) => element.className.includes('w-1/2'));
    expect(halfPaneZone).not.toBeNull();

    const overlayLabel = screen.getByText('Split left');
    expect(overlayLabel).toHaveClass('border-ide-border/70', 'bg-popover/95', 'text-ide-text-muted');
  });
});
