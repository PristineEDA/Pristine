import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CodeViewerLayoutProvider,
  WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY,
  type CodeViewerLayoutMode,
} from '../../../context/CodeViewerLayoutContext';
import { resetWorkspaceGitStatusStoreForTests } from '../../../git/workspaceGitStatus';
import { resetExplorerTreeSessionStoreForTests, useExplorerTreeSessionStore } from '../../../workspace/useExplorerTreeSessionStore';
import {
  getExplorerClipboardTarget,
  getExplorerDeleteTarget,
  getExplorerPasteTargetPath,
  getExplorerRenameTarget,
  LeftSidePanel,
} from './LeftSidePanel';
import { resetSidePanelSessionStoreForTests, useSidePanelSessionStore } from './useSidePanelSessionStore';

function mockCodeViewerLayoutMode(layoutMode: CodeViewerLayoutMode) {
  vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) =>
    key === WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY ? layoutMode : null,
  );
}

function renderLeftSidePanel(
  props: Partial<ComponentProps<typeof LeftSidePanel>> = {},
  options: { layoutMode?: CodeViewerLayoutMode } = {},
) {
  const componentProps: ComponentProps<typeof LeftSidePanel> = {
    activeFileId: 'cpu_top',
    onClearWorkspaceClipboard: vi.fn(),
    onCopyWorkspaceEntry: vi.fn().mockResolvedValue(true),
    onCreateWorkspaceFile: vi.fn().mockResolvedValue(undefined),
    onCreateWorkspaceFolder: vi.fn().mockResolvedValue(undefined),
    onCutWorkspaceEntry: vi.fn().mockResolvedValue(true),
    onDeleteWorkspaceEntry: vi.fn().mockResolvedValue(false),
    onFileOpen: vi.fn(),
    onFilePreview: vi.fn(),
    onLineJump: vi.fn(),
    onPasteWorkspaceEntry: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceEntry: vi.fn().mockResolvedValue(undefined),
    workspaceClipboard: null,
    ...props,
  };
  const panel = <LeftSidePanel {...componentProps} />;

  if (options.layoutMode) {
    mockCodeViewerLayoutMode(options.layoutMode);

    return {
      ...render(<CodeViewerLayoutProvider>{panel}</CodeViewerLayoutProvider>),
      props: componentProps,
    };
  }

  return {
    ...render(panel),
    props: componentProps,
  };
}

type TestUser = ReturnType<typeof userEvent.setup>;

function expectCompactTabButton(testId: string) {
  const tabButton = screen.getByTestId(testId);
  const icon = tabButton.querySelector('svg');

  expect(tabButton).toHaveClass('h-7', 'w-7');
  expect(icon).not.toBeNull();
  expect(icon!).toHaveAttribute('width', '12');
  expect(icon!).toHaveAttribute('height', '12');
}

let testUser: TestUser;

async function clickExplorerNode(testId: string) {
  await testUser.click(await screen.findByTestId(testId));
}

async function expandDefaultTree() {
  await clickExplorerNode('file-tree-node-rtl');
  await clickExplorerNode('file-tree-node-rtl_peripherals');
}

async function selectDefaultFile() {
  await expandDefaultTree();
  await clickExplorerNode('file-tree-node-rtl_peripherals_uart_rx_v');
}

describe('LeftSidePanel', () => {
  beforeEach(() => {
    const electronApi = window.electronAPI!;

    testUser = userEvent.setup();
    resetWorkspaceGitStatusStoreForTests();
    resetSidePanelSessionStoreForTests();
    resetExplorerTreeSessionStoreForTests();

    vi.mocked(electronApi.fs.exists).mockResolvedValue(true);
    vi.mocked(electronApi.fs.readDir).mockImplementation(async (dirPath: string) => {
      if (dirPath === '.') {
        return [{ name: 'rtl', isDirectory: true, isFile: false }];
      }

      if (dirPath === 'rtl') {
        return [{ name: 'peripherals', isDirectory: true, isFile: false }];
      }

      if (dirPath === 'rtl/peripherals') {
        return [{ name: 'uart_rx.v', isDirectory: false, isFile: true }];
      }

      return [];
    });
  });

  it('renders explorer and source control tabs', async () => {
    renderLeftSidePanel({}, { layoutMode: 'compact' });

    const header = screen.getByTestId('left-panel-header');

    expect(screen.getByTestId('left-panel-tabs')).toBeInTheDocument();
    expect(header.className).not.toMatch(/\bbg-/);
    expect(header).not.toHaveClass('border');
    expect(header).not.toHaveClass('border-ide-border');
    expect(header).not.toHaveClass('border-b');
    expect(screen.getByRole('radio', { name: 'Explorer' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Source Control' })).toBeInTheDocument();
    expectCompactTabButton('left-panel-tab-explorer');
    expectCompactTabButton('left-panel-tab-git');
    expect(screen.getByTestId('left-panel-split-toggle')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('left-panel-split-toggle')).toHaveClass('size-6', 'text-ide-text-muted');
    expect(screen.getByTestId('left-panel-split-toggle').parentElement).toHaveClass('ml-auto');
    expect(screen.getByTestId('left-panel-primary-panel')).not.toHaveClass('rounded-md', 'border', 'border-ide-border');
    expect(screen.getByTestId('left-panel-explorer-content')).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden');
    expect(screen.queryByTestId('left-panel-secondary-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Explorer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Source Control' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /problems/i })).not.toBeInTheDocument();
    expect(await screen.findByTestId('file-tree-node-rtl')).toBeInTheDocument();
    expect(header).not.toHaveTextContent('retroSoC');
    expect(screen.getByTestId('file-tree-node-root')).toHaveTextContent('Project');
  });

  it('removes the minimal layout outline around the panel tab header', () => {
    renderLeftSidePanel({}, { layoutMode: 'minimal' });

    const header = screen.getByTestId('left-panel-header');

    expect(header).toHaveAttribute('data-code-viewer-layout-mode', 'minimal');
    expect(header).toHaveClass('m-1.5', 'mb-0', 'rounded', 'px-2', 'py-1.5');
    expect(header).not.toHaveClass('border');
    expect(header).not.toHaveClass('border-ide-border');
    expect(header).not.toHaveClass('border-b');
    expectCompactTabButton('left-panel-tab-explorer');
    expectCompactTabButton('left-panel-tab-git');
  });

  it('shows the source control placeholder from the left panel git tab', async () => {
    renderLeftSidePanel({}, { layoutMode: 'compact' });

    await testUser.click(screen.getByRole('radio', { name: 'Source Control' }));

    expect(screen.getByTestId('left-panel-git-placeholder')).toHaveTextContent('No source control changes');
    expect(screen.queryByTestId('left-panel-explorer-content')).not.toBeInTheDocument();
    expect(useSidePanelSessionStore.getState().leftPrimaryTab).toBe('git');
  });

  it('defaults the lower stacked panel hidden and toggles two independent panel frames', async () => {
    renderLeftSidePanel({}, { layoutMode: 'compact' });

    const splitToggle = screen.getByTestId('left-panel-split-toggle');

    expect(splitToggle).toHaveAttribute('aria-label', 'Show lower explorer panel');
    expect(splitToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('left-panel-split-group')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-left-panel-primary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-left-panel-secondary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('left-panel-secondary-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('left-panel-split-resize-handle')).not.toBeInTheDocument();

    await testUser.click(splitToggle);

    const expandedSplitToggle = screen.getByTestId('left-panel-split-toggle');
    expect(expandedSplitToggle).toHaveAttribute('aria-label', 'Hide lower explorer panel');
    expect(expandedSplitToggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('left-panel-split-group')).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByTestId('left-panel-split-group')).toHaveClass('flex-1', 'min-h-0');
    expect(screen.getByTestId('panel-left-panel-primary')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('panel-left-panel-primary').style.transitionDuration).toBe('300ms');
    expect(screen.getByTestId('panel-left-panel-primary').style.transitionProperty).toBe('flex-basis');

    await waitFor(() => expect(screen.getByTestId('panel-left-panel-secondary')).toHaveAttribute('aria-hidden', 'false'));

    expect(screen.getByTestId('left-panel-explorer-content').parentElement).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden');
    expect(screen.getByTestId('panel-left-panel-secondary').style.transitionDuration).toBe('300ms');
    expect(screen.getByTestId('panel-left-panel-secondary').style.transitionProperty).toBe('flex-basis');
    expect(screen.getByTestId('left-panel-secondary-panel')).toHaveStyle({ opacity: '1' });
    expect(screen.getByTestId('left-panel-root')).toHaveClass('bg-ide-bg');
    expect(screen.getByTestId('left-panel-primary-panel')).not.toHaveClass('rounded-md', 'border', 'border-ide-border');
    expect(screen.getByTestId('left-panel-secondary-panel')).not.toHaveClass('rounded-md', 'border', 'border-ide-border');
    expect(screen.getByTestId('left-panel-primary-panel')).toHaveClass('bg-ide-bg');
    expect(screen.getByTestId('left-panel-secondary-panel')).toHaveClass('bg-ide-bg');
    expect(screen.getByTestId('left-panel-secondary-header')).toHaveAttribute('data-code-viewer-layout-mode', 'compact');
    expect(screen.getByTestId('left-panel-secondary-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('left-panel-secondary-tab-hierarchy')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('left-panel-secondary-tab-libraries')).toHaveAttribute('data-state', 'off');
    expect(within(screen.getByTestId('left-panel-secondary-header')).getByRole('button', { name: 'Reload module hierarchy' })).toBeInTheDocument();
    expect(await screen.findByTestId('left-panel-secondary-placeholder')).toHaveTextContent('Hierarchy is empty');
    expect(screen.getByTestId('left-panel-split-resize-handle')).toHaveAttribute('aria-orientation', 'horizontal');

    await testUser.click(expandedSplitToggle);

    const collapsedSplitToggle = screen.getByTestId('left-panel-split-toggle');
    expect(collapsedSplitToggle).toHaveAttribute('aria-label', 'Show lower explorer panel');
    expect(collapsedSplitToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('left-panel-split-group')).toBeInTheDocument();
    expect(screen.getByTestId('panel-left-panel-primary')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('panel-left-panel-secondary')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('left-panel-secondary-panel')).toHaveStyle({ opacity: '0' });
    expect(screen.queryByTestId('left-panel-split-resize-handle')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.queryByTestId('left-panel-split-group')).not.toBeInTheDocument(), {
      timeout: 1000,
    });

    expect(screen.queryByTestId('panel-left-panel-primary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-left-panel-secondary')).not.toBeInTheDocument();
    expect(screen.getByTestId('left-panel-primary-panel')).not.toHaveClass('rounded-md', 'border', 'border-ide-border');
    expect(screen.queryByTestId('left-panel-secondary-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('left-panel-split-resize-handle')).not.toBeInTheDocument();
  });

  it('keeps stacked explorer panels layout-aware in minimal mode', async () => {
    renderLeftSidePanel({}, { layoutMode: 'minimal' });

    await testUser.click(screen.getByTestId('left-panel-split-toggle'));
    await waitFor(() => expect(screen.getByTestId('panel-left-panel-secondary')).toHaveAttribute('aria-hidden', 'false'));

    const primaryPanel = screen.getByTestId('left-panel-primary-panel');
    const secondaryPanel = screen.getByTestId('left-panel-secondary-panel');
    const secondaryHeader = screen.getByTestId('left-panel-secondary-header');
    const resizeHandle = screen.getByTestId('left-panel-split-resize-handle');

    expect(screen.getByTestId('left-panel-root')).not.toHaveClass('bg-ide-bg');
    expect(primaryPanel).toHaveClass('rounded-md', 'border', 'border-ide-border', 'bg-ide-bg');
    expect(secondaryPanel).toHaveClass('rounded-md', 'border', 'border-ide-border', 'bg-ide-bg');
    expect(secondaryHeader).toHaveAttribute('data-code-viewer-layout-mode', 'minimal');
    expect(secondaryHeader).toHaveClass('m-1.5', 'mb-0', 'rounded', 'px-2', 'py-1.5');
    expect(secondaryHeader).not.toHaveClass('border');
    expect(secondaryHeader).not.toHaveClass('border-ide-border');
    expect(secondaryHeader).not.toHaveClass('border-b');
    expect(resizeHandle).toHaveClass('overlay-handle', 'rounded-full', 'bg-transparent');
  });

  it('switches the secondary panel between hierarchy and libraries', async () => {
    renderLeftSidePanel({}, { layoutMode: 'compact' });

    await testUser.click(screen.getByTestId('left-panel-split-toggle'));
    await waitFor(() => expect(screen.getByTestId('panel-left-panel-secondary')).toHaveAttribute('aria-hidden', 'false'));
    expect(await screen.findByTestId('left-panel-secondary-placeholder')).toHaveTextContent('Hierarchy is empty');

    await testUser.click(screen.getByTestId('left-panel-secondary-tab-libraries'));
    expect(screen.getByTestId('left-panel-secondary-tab-hierarchy')).toHaveAttribute('data-state', 'off');
    expect(screen.getByTestId('left-panel-secondary-tab-libraries')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('left-panel-libraries-placeholder')).toHaveTextContent('Libraries is empty');
    expect(screen.queryByTestId('left-panel-secondary-placeholder')).not.toBeInTheDocument();
    expect(useSidePanelSessionStore.getState().leftSecondaryTab).toBe('libraries');

    await testUser.click(screen.getByTestId('left-panel-secondary-tab-hierarchy'));
    expect(screen.getByTestId('left-panel-secondary-tab-hierarchy')).toHaveAttribute('data-state', 'on');
    expect(await screen.findByTestId('left-panel-secondary-placeholder')).toHaveTextContent('Hierarchy is empty');
    expect(screen.queryByTestId('left-panel-libraries-placeholder')).not.toBeInTheDocument();
    expect(useSidePanelSessionStore.getState().leftSecondaryTab).toBe('hierarchy');
  });

  it('persists selected real explorer nodes for project session restore', async () => {
    renderLeftSidePanel({}, { layoutMode: 'compact' });

    await selectDefaultFile();

    expect(useExplorerTreeSessionStore.getState().selectedNode).toEqual({
      path: 'rtl/peripherals/uart_rx.v',
      type: 'file',
    });
  });

  it('does not render the legacy explorer toolbar buttons', async () => {
    renderLeftSidePanel();

    expect(await screen.findByTestId('file-tree-node-rtl')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New File' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Folder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse All' })).not.toBeInTheDocument();
  });

  it('expands explorer items and opens a clicked file', async () => {
    const onFileOpen = vi.fn();
    const onFilePreview = vi.fn();

    renderLeftSidePanel({ onFileOpen, onFilePreview });

    await selectDefaultFile();

    expect(onFilePreview).toHaveBeenCalledWith('rtl/peripherals/uart_rx.v', 'uart_rx.v');
  });

  it('pins a file on explorer double click and applies the explorer hover scrollbar class', async () => {
    const onFileOpen = vi.fn();

    const { container } = renderLeftSidePanel({ onFileOpen });

    await expandDefaultTree();

    const fileNode = await screen.findByTestId('file-tree-node-rtl_peripherals_uart_rx_v');
    await testUser.dblClick(fileNode);

    expect(onFileOpen).toHaveBeenCalledWith('rtl/peripherals/uart_rx.v', 'uart_rx.v');
    expect(container.querySelector('.explorer-tree-scrollbar')).not.toBeNull();
  });

  it('keeps a clicked explorer folder highlighted after the pointer leaves the tree', async () => {
    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
    });

    const folderNode = await screen.findByTestId('file-tree-node-rtl');

    await testUser.click(folderNode);

    expect(screen.getByTestId('file-tree-node-rtl').className).toContain('bg-ide-selection');
    expect(screen.getByTestId('file-tree-node-rtl').className).toContain('hover:bg-ide-selection');

    fireEvent.mouseLeave(screen.getByTestId('file-tree-node-rtl'));

    expect(screen.getByTestId('file-tree-node-rtl').className).toContain('bg-ide-selection');
  });

  it('moves the persistent highlight from folders to files so only one explorer row stays highlighted', async () => {
    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
    });

    await expandDefaultTree();

    const folderNode = screen.getByTestId('file-tree-node-rtl_peripherals');
    const fileNode = await screen.findByTestId('file-tree-node-rtl_peripherals_uart_rx_v');

    expect(folderNode.className).toContain('bg-ide-selection');
    expect(fileNode.className).not.toContain('hover:bg-ide-selection');

    await testUser.click(fileNode);

    expect(screen.getByTestId('file-tree-node-rtl_peripherals').className).not.toContain('hover:bg-ide-selection');
    expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_rx_v').className).toContain('bg-ide-selection');
    expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_rx_v').className).toContain('hover:bg-ide-selection');
  });

  it('clears the selected folder highlight when another entry activates a file', async () => {
    const { rerender } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
    });

    await expandDefaultTree();

    expect(screen.getByTestId('file-tree-node-rtl_peripherals').className).toContain('bg-ide-selection');
    expect((await screen.findByTestId('file-tree-node-rtl_peripherals_uart_rx_v')).className).not.toContain('hover:bg-ide-selection');

    rerender(
      <LeftSidePanel
        activeFileId="rtl/core/cpu_top.v"
        onClearWorkspaceClipboard={vi.fn()}
        onCopyWorkspaceEntry={vi.fn().mockResolvedValue(true)}
        onCreateWorkspaceFile={vi.fn().mockResolvedValue(undefined)}
        onCreateWorkspaceFolder={vi.fn().mockResolvedValue(undefined)}
        onCutWorkspaceEntry={vi.fn().mockResolvedValue(true)}
        onDeleteWorkspaceEntry={vi.fn().mockResolvedValue(false)}
        onFileOpen={vi.fn()}
        onFilePreview={vi.fn()}
        onLineJump={vi.fn()}
        onPasteWorkspaceEntry={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceEntry={vi.fn().mockResolvedValue(undefined)}
        workspaceClipboard={null}
      />,
    );

    expect(screen.getByTestId('file-tree-node-rtl_peripherals').className).not.toContain('hover:bg-ide-selection');
  });

  it('allows the workspace root row to collapse and expand', async () => {
    renderLeftSidePanel();

    const rootNode = await screen.findByTestId('file-tree-node-root');
    expect(rootNode).toHaveTextContent('Project');
    expect(await screen.findByTestId('file-tree-node-rtl')).toBeInTheDocument();

    await testUser.click(rootNode);
    expect(screen.queryByTestId('file-tree-node-rtl')).not.toBeInTheDocument();

    await testUser.click(rootNode);
    expect(await screen.findByTestId('file-tree-node-rtl')).toBeInTheDocument();
  });

  it('starts inline rename with F2 for the selected explorer file and submits a real rename', async () => {
    const onRenameWorkspaceEntry = vi.fn().mockResolvedValue(undefined);
    const { container } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onRenameWorkspaceEntry,
    });

    await expandDefaultTree();

    const fileNode = await screen.findByTestId('file-tree-node-rtl_peripherals_uart_rx_v');
    await testUser.click(fileNode);
    fireEvent.keyDown(container.querySelector('.explorer-tree-scrollbar') as HTMLElement, { key: 'F2' });

    const renameInput = await screen.findByTestId('file-tree-input-rtl_peripherals_uart_rx_v');
    expect(renameInput).toHaveAttribute('spellcheck', 'false');
    expect(renameInput).toHaveClass('text-input-foreground');
    fireEvent.change(renameInput, { target: { value: 'uart_tx.v' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onRenameWorkspaceEntry).toHaveBeenCalledWith(
        'rtl/peripherals/uart_rx.v',
        'rtl/peripherals/uart_tx.v',
        'file',
      );
    });
  });

  it('keeps the current explorer tree rendered during a refresh token bump so the scroll container state can persist', async () => {
    const { container, props, rerender } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      refreshToken: 0,
    });

    await expandDefaultTree();
    await screen.findByTestId('file-tree-node-rtl_peripherals_uart_rx_v');

    const tree = container.querySelector('.explorer-tree-scrollbar') as HTMLElement;
    tree.scrollTop = 180;

    rerender(
      <LeftSidePanel
        {...props}
        refreshToken={1}
      />,
    );

    expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    expect(tree.scrollTop).toBe(180);
    expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_rx_v')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_rx_v')).toBeInTheDocument();
    });
  });

  it('does not re-scroll the same revealed file when a refresh rerenders the tree with the same reveal token', async () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const revealRequest = { path: 'rtl/peripherals/uart_rx.v', token: 7 };
    const { props, rerender } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      refreshToken: 0,
      revealRequest,
    });

    await waitFor(() => {
      expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_rx_v')).toBeInTheDocument();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(
      <LeftSidePanel
        {...props}
        refreshToken={1}
        revealRequest={revealRequest}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_rx_v')).toBeInTheDocument();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('compensates the explorer scroll position to keep a nearby anchor row stable during rename refreshes', async () => {
    const electronApi = window.electronAPI!;
    const onRenameWorkspaceEntry = vi.fn().mockResolvedValue(undefined);

    vi.mocked(electronApi.fs.readDir).mockImplementation(async (dirPath: string) => {
      if (dirPath === '.') {
        return [{ name: 'rtl', isDirectory: true, isFile: false }];
      }

      if (dirPath === 'rtl') {
        return [{ name: 'peripherals', isDirectory: true, isFile: false }];
      }

      if (dirPath === 'rtl/peripherals') {
        return [
          { name: 'uart_rx.v', isDirectory: false, isFile: true },
          { name: 'uart_aux.v', isDirectory: false, isFile: true },
        ];
      }

      return [];
    });

    const { container, props, rerender } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      refreshToken: 0,
      onRenameWorkspaceEntry,
    });

    await expandDefaultTree();

    const fileNode = await screen.findByTestId('file-tree-node-rtl_peripherals_uart_rx_v');
    await screen.findByTestId('file-tree-node-rtl_peripherals_uart_aux_v');
    const tree = container.querySelector('.explorer-tree-scrollbar') as HTMLElement;
    tree.scrollTop = 180;

    let anchorTop = 120;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
      if (this.getAttribute('data-testid') === 'file-tree-node-rtl_peripherals_uart_aux_v') {
        return {
          x: 0,
          y: anchorTop,
          width: 120,
          height: 24,
          top: anchorTop,
          right: 120,
          bottom: anchorTop + 24,
          left: 0,
          toJSON: () => '',
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        width: 120,
        height: 24,
        top: 0,
        right: 120,
        bottom: 24,
        left: 0,
        toJSON: () => '',
      } as DOMRect;
    });

    await testUser.click(fileNode);
    fireEvent.keyDown(tree, { key: 'F2' });

    const renameInput = await screen.findByTestId('file-tree-input-rtl_peripherals_uart_rx_v');
    fireEvent.change(renameInput, { target: { value: 'uart_tx.v' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onRenameWorkspaceEntry).toHaveBeenCalledWith(
        'rtl/peripherals/uart_rx.v',
        'rtl/peripherals/uart_tx.v',
        'file',
      );
    });

    anchorTop = 96;

    rerender(
      <LeftSidePanel
        {...props}
        refreshToken={1}
        onRenameWorkspaceEntry={onRenameWorkspaceEntry}
      />,
    );

    expect(tree.scrollTop).toBe(156);
  });

  it('starts inline rename when F2 is pressed on document after selecting a file in the tree', async () => {
    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
    });

    await selectDefaultFile();

    fireEvent.keyDown(document, { key: 'F2' });

    expect(await screen.findByTestId('file-tree-input-rtl_peripherals_uart_rx_v')).toBeInTheDocument();
  });

  it('starts inline rename for a folder when F2 is pressed immediately after selecting it', async () => {
    const onRenameWorkspaceEntry = vi.fn().mockResolvedValue(undefined);
    const { container } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onRenameWorkspaceEntry,
    });

    await clickExplorerNode('file-tree-node-rtl');

    const peripheralsFolderNode = await screen.findByTestId('file-tree-node-rtl_peripherals');
    await testUser.click(peripheralsFolderNode);
    fireEvent.keyDown(container.querySelector('.explorer-tree-scrollbar') as HTMLElement, { key: 'F2' });

    const renameInput = await screen.findByTestId('file-tree-input-rtl_peripherals');
    fireEvent.change(renameInput, { target: { value: 'renamed_peripherals' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onRenameWorkspaceEntry).toHaveBeenCalledWith(
        'rtl/peripherals',
        'rtl/renamed_peripherals',
        'folder',
      );
    });
  });

  it('keeps a newly selected folder as the rename target when a delayed tree-driven active file sync arrives', async () => {
    const onRenameWorkspaceEntry = vi.fn().mockResolvedValue(undefined);
    const { container, props, rerender } = renderLeftSidePanel({
      activeFileId: 'cpu_top',
      onRenameWorkspaceEntry,
    });

    await expandDefaultTree();

    const fileNode = await screen.findByTestId('file-tree-node-rtl_peripherals_uart_rx_v');
    await testUser.click(fileNode);

    const peripheralsFolderNode = await screen.findByTestId('file-tree-node-rtl_peripherals');
    await testUser.click(peripheralsFolderNode);

    rerender(
      <LeftSidePanel
        {...props}
        activeFileId="rtl/peripherals/uart_rx.v"
        onRenameWorkspaceEntry={onRenameWorkspaceEntry}
      />,
    );

    fireEvent.keyDown(container.querySelector('.explorer-tree-scrollbar') as HTMLElement, { key: 'F2' });

    const renameInput = await screen.findByTestId('file-tree-input-rtl_peripherals');
    fireEvent.change(renameInput, { target: { value: 'renamed_peripherals' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onRenameWorkspaceEntry).toHaveBeenCalledWith(
        'rtl/peripherals',
        'rtl/renamed_peripherals',
        'folder',
      );
    });
  });

  it('falls back to the highlighted active workspace file when F2 has no explicit tree selection', () => {
    expect(getExplorerRenameTarget(null, 'rtl/peripherals/uart_rx.v')).toEqual({
      path: 'rtl/peripherals/uart_rx.v',
      type: 'file',
    });
  });

  it('falls back to the highlighted active workspace file for explorer copy targets', () => {
    expect(getExplorerClipboardTarget(null, 'rtl/peripherals/uart_rx.v')).toEqual({
      path: 'rtl/peripherals/uart_rx.v',
      type: 'file',
    });
  });

  it('resolves paste targets to the selected file parent path', () => {
    expect(getExplorerPasteTargetPath({
      id: 'rtl/peripherals/uart_rx.v',
      path: 'rtl/peripherals/uart_rx.v',
      type: 'file',
      source: 'real',
    }, 'rtl/peripherals/uart_rx.v')).toBe('rtl/peripherals');
  });

  it('starts delete when Delete is pressed on document after selecting a file in the tree', async () => {
    const onDeleteWorkspaceEntry = vi.fn().mockResolvedValue(false);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onDeleteWorkspaceEntry,
    });

    await selectDefaultFile();

    fireEvent.keyDown(document, { key: 'Delete' });

    await waitFor(() => {
      expect(onDeleteWorkspaceEntry).toHaveBeenCalledWith('rtl/peripherals/uart_rx.v', 'file');
    });
  });

  it('starts copy when Ctrl+C is pressed on document after selecting a file in the tree', async () => {
    const onCopyWorkspaceEntry = vi.fn().mockResolvedValue(true);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onCopyWorkspaceEntry,
    });

    await selectDefaultFile();

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true });

    await waitFor(() => {
      expect(onCopyWorkspaceEntry).toHaveBeenCalledWith('rtl/peripherals/uart_rx.v', 'file');
    });
  });

  it('opens the selected explorer context menu when Shift+F10 is pressed on the tree', async () => {
    const { container } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
    });

    await selectDefaultFile();

    fireEvent.keyDown(container.querySelector('.explorer-tree-scrollbar') as HTMLElement, { key: 'F10', shiftKey: true });

    expect(await screen.findByTestId('explorer-context-menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Open in Editor' })).toHaveFocus();
  });

  it('does not trigger explorer shortcuts while the explorer context menu owns focus', async () => {
    const onDeleteWorkspaceEntry = vi.fn().mockResolvedValue(false);
    const { container } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onDeleteWorkspaceEntry,
    });

    await selectDefaultFile();

    fireEvent.keyDown(container.querySelector('.explorer-tree-scrollbar') as HTMLElement, { key: 'F10', shiftKey: true });

    const menuItem = await screen.findByRole('menuitem', { name: 'Open in Editor' });
    fireEvent.keyDown(menuItem, { key: 'Delete' });

    expect(onDeleteWorkspaceEntry).not.toHaveBeenCalled();
  });

  it('starts cut when Ctrl+X is pressed on the explorer tree', async () => {
    const onCutWorkspaceEntry = vi.fn().mockResolvedValue(true);
    const { container } = renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onCutWorkspaceEntry,
    });

    await selectDefaultFile();

    fireEvent.keyDown(container.querySelector('.explorer-tree-scrollbar') as HTMLElement, { key: 'x', ctrlKey: true });

    await waitFor(() => {
      expect(onCutWorkspaceEntry).toHaveBeenCalledWith('rtl/peripherals/uart_rx.v', 'file');
    });
  });

  it('starts paste into the selected file parent when Ctrl+V is pressed and clipboard is armed', async () => {
    const electronApi = window.electronAPI!;
    vi.mocked(electronApi.fs.readDir).mockImplementation(async (dirPath: string) => {
      if (dirPath === '.') {
        return [{ name: 'rtl', isDirectory: true, isFile: false }];
      }

      if (dirPath === 'rtl') {
        return [{ name: 'peripherals', isDirectory: true, isFile: false }];
      }

      if (dirPath === 'rtl/peripherals') {
        return [
          { name: 'uart_rx.v', isDirectory: false, isFile: true },
          { name: 'uart_aux.v', isDirectory: false, isFile: true },
        ];
      }

      return [];
    });

    const onPasteWorkspaceEntry = vi.fn().mockResolvedValue({
      path: 'rtl/peripherals/uart_aux.v',
      entryType: 'file',
    });

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onPasteWorkspaceEntry,
      workspaceClipboard: {
        sourcePath: 'rtl/peripherals/uart_rx.v',
        entryType: 'file',
        mode: 'copy',
      },
    });

    await selectDefaultFile();
    await screen.findByTestId('file-tree-node-rtl_peripherals_uart_aux_v');

    expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_rx_v')).toHaveAttribute('data-selected', 'true');

    fireEvent.keyDown(document, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      expect(onPasteWorkspaceEntry).toHaveBeenCalledWith('rtl/peripherals');
    });

    await waitFor(() => {
      expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_aux_v')).toHaveAttribute('data-selected', 'true');
    });
    expect(screen.getByTestId('file-tree-node-rtl_peripherals_uart_rx_v')).not.toHaveAttribute('data-selected');
  });

  it('clears the clipboard when Escape is pressed while the explorer owns the interaction scope', async () => {
    const onClearWorkspaceClipboard = vi.fn();

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onClearWorkspaceClipboard,
      workspaceClipboard: {
        sourcePath: 'rtl/peripherals/uart_rx.v',
        entryType: 'file',
        mode: 'copy',
      },
    });

    await selectDefaultFile();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClearWorkspaceClipboard).toHaveBeenCalledTimes(1);
  });

  it('starts delete when Monaco text input regains focus after selecting a file in the tree', async () => {
    const onDeleteWorkspaceEntry = vi.fn().mockResolvedValue(false);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onDeleteWorkspaceEntry,
    });

    await selectDefaultFile();

    const monacoRoot = document.createElement('div');
    monacoRoot.className = 'monaco-editor';
    const monacoInput = document.createElement('textarea');
    monacoInput.className = 'inputarea';
    monacoRoot.appendChild(monacoInput);
    document.body.appendChild(monacoRoot);

    try {
      monacoInput.focus();
      fireEvent.keyDown(monacoInput, { key: 'Delete' });

      await waitFor(() => {
        expect(onDeleteWorkspaceEntry).toHaveBeenCalledWith('rtl/peripherals/uart_rx.v', 'file');
      });
    } finally {
      monacoRoot.remove();
    }
  });

  it('starts delete from the folder context menu for the selected node', async () => {
    const onDeleteWorkspaceEntry = vi.fn().mockResolvedValue(false);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onDeleteWorkspaceEntry,
    });

    await clickExplorerNode('file-tree-node-rtl');
    fireEvent.contextMenu(await screen.findByTestId('file-tree-node-rtl_peripherals'), { clientX: 50, clientY: 60 });
    await testUser.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => {
      expect(onDeleteWorkspaceEntry).toHaveBeenCalledWith('rtl/peripherals', 'folder');
    });
  });

  it('does not start delete while an explorer input opened from the context menu is focused', async () => {
    const onDeleteWorkspaceEntry = vi.fn().mockResolvedValue(false);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onDeleteWorkspaceEntry,
    });

    await expandDefaultTree();
  fireEvent.contextMenu(await screen.findByTestId('file-tree-node-rtl_peripherals'), { clientX: 50, clientY: 60 });
  await testUser.click(screen.getByRole('menuitem', { name: 'New File' }));

    const draftInput = screen.getByRole('textbox');
    draftInput.focus();
    fireEvent.keyDown(document, { key: 'Delete' });

    expect(onDeleteWorkspaceEntry).not.toHaveBeenCalled();
  });

  it('does not start delete while a non-Monaco textarea is focused', async () => {
    const onDeleteWorkspaceEntry = vi.fn().mockResolvedValue(false);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onDeleteWorkspaceEntry,
    });

    await selectDefaultFile();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    try {
      textarea.focus();
      fireEvent.keyDown(textarea, { key: 'Delete' });

      expect(onDeleteWorkspaceEntry).not.toHaveBeenCalled();
    } finally {
      textarea.remove();
    }
  });

  it('does not start copy while a non-Monaco textarea is focused', async () => {
    const onCopyWorkspaceEntry = vi.fn().mockResolvedValue(true);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onCopyWorkspaceEntry,
    });

    await selectDefaultFile();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    try {
      textarea.focus();
      fireEvent.keyDown(textarea, { key: 'c', ctrlKey: true });

      expect(onCopyWorkspaceEntry).not.toHaveBeenCalled();
    } finally {
      textarea.remove();
    }
  });

  it('does not start delete after Monaco receives a real pointer interaction outside the tree', async () => {
    const onDeleteWorkspaceEntry = vi.fn().mockResolvedValue(false);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onDeleteWorkspaceEntry,
    });

    await selectDefaultFile();

    const monacoRoot = document.createElement('div');
    monacoRoot.className = 'monaco-editor';
    const monacoInput = document.createElement('textarea');
    monacoInput.className = 'inputarea';
    monacoRoot.appendChild(monacoInput);
    document.body.appendChild(monacoRoot);

    try {
      fireEvent.pointerDown(monacoInput);
      monacoInput.focus();
      fireEvent.keyDown(monacoInput, { key: 'Delete' });

      expect(onDeleteWorkspaceEntry).not.toHaveBeenCalled();
    } finally {
      monacoRoot.remove();
    }
  });

  it('ignores delete targets for the workspace root', () => {
    expect(getExplorerDeleteTarget({
      id: '.',
      path: '.',
      type: 'root',
      source: 'real',
    })).toBeNull();
  });

  it('creates a real file from the selected folder through the context menu draft row', async () => {
    const onCreateWorkspaceFile = vi.fn().mockResolvedValue(undefined);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onCreateWorkspaceFile,
    });

    await expandDefaultTree();
  fireEvent.contextMenu(await screen.findByTestId('file-tree-node-rtl_peripherals'), { clientX: 50, clientY: 60 });
  await testUser.click(screen.getByRole('menuitem', { name: 'New File' }));

    const draftInput = screen.getByRole('textbox');
    fireEvent.change(draftInput, { target: { value: 'uart_tx.sv' } });
    fireEvent.keyDown(draftInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onCreateWorkspaceFile).toHaveBeenCalledWith('rtl/peripherals/uart_tx.sv');
    });
  });

  it('removes an invalid draft folder when Enter is pressed', async () => {
    const onCreateWorkspaceFolder = vi.fn().mockResolvedValue(undefined);

    renderLeftSidePanel({
      activeFileId: 'rtl/peripherals/uart_rx.v',
      onCreateWorkspaceFolder,
    });

    await expandDefaultTree();
  fireEvent.contextMenu(await screen.findByTestId('file-tree-node-rtl_peripherals'), { clientX: 50, clientY: 60 });
  await testUser.click(screen.getByRole('menuitem', { name: 'New Folder' }));

    const draftInput = screen.getByRole('textbox');
    fireEvent.keyDown(draftInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onCreateWorkspaceFolder).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });
});
