import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CodeViewerLayoutProvider,
  WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY,
  type CodeViewerLayoutMode,
} from '../../../context/CodeViewerLayoutContext';
import { RightSidePanel } from './RightSidePanel';
import { resetSidePanelSessionStoreForTests, useSidePanelSessionStore } from './useSidePanelSessionStore';

const PANEL_ITEM_TIMEOUT_MS = 10000;
const PANEL_TEST_TIMEOUT_MS = 10000;

type TestUser = ReturnType<typeof userEvent.setup>;

function expectCompactTabButton(testId: string) {
  const tabButton = screen.getByTestId(testId);
  const icon = tabButton.querySelector('svg');

  expect(tabButton).toHaveClass('h-7', 'w-7');
  expect(icon).not.toBeNull();
  expect(icon!).toHaveAttribute('width', '12');
  expect(icon!).toHaveAttribute('height', '12');
}

async function clickButton(user: TestUser, name: RegExp) {
  await user.click(screen.getByRole('radio', { name }));
}

function mockCodeViewerLayoutMode(layoutMode: CodeViewerLayoutMode) {
  vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) =>
    key === WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY ? layoutMode : null,
  );
}

function renderRightSidePanelInLayout(layoutMode: CodeViewerLayoutMode) {
  mockCodeViewerLayoutMode(layoutMode);

  render(
    <CodeViewerLayoutProvider>
      <RightSidePanel currentOutlineId="rtl/core/alu.v" onFileOpen={vi.fn()} onLineJump={vi.fn()} />
    </CodeViewerLayoutProvider>,
  );
}

describe('RightSidePanel', () => {
  beforeEach(() => {
    resetSidePanelSessionStoreForTests();
    vi.mocked(window.electronAPI!.lsp.outline).mockResolvedValue({
      uri: 'file:///C:/workspace/Pristine/rtl/core/alu.sv',
      filePath: 'rtl/core/alu.sv',
      version: 1,
      generation: 2,
      partial: false,
      truncated: false,
      roots: [{
        id: 'outline:0',
        parentId: null,
        name: 'alu',
        kind: 'module',
        symbolKind: 2,
        range: {
          start: { line: 7, character: 0 },
          end: { line: 45, character: 9 },
        },
        selectionRange: {
          start: { line: 7, character: 7 },
          end: { line: 7, character: 10 },
        },
        depth: 0,
        children: [{
          id: 'outline:0.0',
          parentId: 'outline:0',
          name: 'clk_i',
          kind: 'port',
          detail: 'input logic',
          declaration: 'input logic clk_i',
          type: 'logic',
          direction: 'input',
          symbolKind: 13,
          range: {
            start: { line: 10, character: 2 },
            end: { line: 10, character: 19 },
          },
          selectionRange: {
            start: { line: 10, character: 14 },
            end: { line: 10, character: 19 },
          },
          depth: 1,
          children: [],
        }, {
          id: 'outline:0.1',
          parentId: 'outline:0',
          name: 'Width',
          kind: 'parameter',
          detail: 'int = 8',
          declaration: 'parameter int Width = 8',
          type: 'int',
          value: '8',
          symbolKind: 13,
          range: {
            start: { line: 12, character: 2 },
            end: { line: 12, character: 25 },
          },
          selectionRange: {
            start: { line: 12, character: 16 },
            end: { line: 12, character: 21 },
          },
          depth: 1,
          children: [],
        }, {
          id: 'outline:0.2',
          parentId: 'outline:0',
          name: 'u_adder',
          kind: 'instance',
          detail: 'adder',
          moduleName: 'adder',
          symbolKind: 9,
          range: {
            start: { line: 41, character: 2 },
            end: { line: 45, character: 5 },
          },
          selectionRange: {
            start: { line: 41, character: 2 },
            end: { line: 41, character: 9 },
          },
          depth: 1,
          children: [],
        }],
      }],
      items: [],
      messages: [],
    });
  });

  it('shows an assistant skeleton while the AI panel chunk is still loading', () => {
    render(
      <RightSidePanel currentOutlineId="rtl/core/alu.v" onFileOpen={vi.fn()} onLineJump={vi.fn()} />,
    );

    const header = screen.getByTestId('right-panel-header');

    expect(screen.getByTestId('right-panel-tabs')).toBeInTheDocument();
    expect(header.className).not.toMatch(/\bbg-/);
    expect(header).not.toHaveClass('border');
    expect(header).not.toHaveClass('border-ide-border');
    expect(header).not.toHaveClass('border-b');
    expect(screen.getByRole('radio', { name: /ai assistant/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /static check/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /references/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /outline/i })).toBeInTheDocument();
    expectCompactTabButton('right-panel-tab-ai');
    expectCompactTabButton('right-panel-tab-static');
    expectCompactTabButton('right-panel-tab-references');
    expectCompactTabButton('right-panel-tab-outline');
    expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-panel-suspense-skeleton')).toBeInTheDocument();
    expect(screen.queryByText(/Loading assistant/i)).not.toBeInTheDocument();
  });

  it('removes the minimal layout outline around the panel tab header', () => {
    renderRightSidePanelInLayout('minimal');

    const header = screen.getByTestId('right-panel-header');

    expect(header).toHaveAttribute('data-code-viewer-layout-mode', 'minimal');
    expect(header).toHaveClass('m-1.5', 'mb-0', 'rounded', 'px-2', 'py-1.5');
    expect(header).not.toHaveClass('border');
    expect(header).not.toHaveClass('border-ide-border');
    expect(header).not.toHaveClass('border-b');
    expectCompactTabButton('right-panel-tab-ai');
    expectCompactTabButton('right-panel-tab-outline');
  });

  it('defaults the lower stacked panel hidden and toggles two independent panel frames', async () => {
    const user = userEvent.setup();

    renderRightSidePanelInLayout('compact');

    const splitToggle = screen.getByTestId('right-panel-split-toggle');

    expect(splitToggle).toHaveAttribute('aria-label', 'Show lower right panel');
    expect(splitToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('right-panel-split-group')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-right-panel-primary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-right-panel-secondary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-panel-secondary-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-panel-split-resize-handle')).not.toBeInTheDocument();

    await user.click(splitToggle);

    const expandedSplitToggle = screen.getByTestId('right-panel-split-toggle');
    expect(expandedSplitToggle).toHaveAttribute('aria-label', 'Hide lower right panel');
    expect(expandedSplitToggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('right-panel-split-group')).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByTestId('right-panel-split-group')).toHaveClass('flex-1', 'min-h-0');
    expect(screen.getByTestId('panel-right-panel-primary')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('panel-right-panel-primary').style.transitionDuration).toBe('300ms');
    expect(screen.getByTestId('panel-right-panel-primary').style.transitionProperty).toBe('flex-basis');

    await waitFor(() => expect(screen.getByTestId('panel-right-panel-secondary')).toHaveAttribute('aria-hidden', 'false'));

    expect(screen.getByTestId('right-panel-secondary-panel')).toHaveStyle({ opacity: '1' });
    expect(screen.getByTestId('right-panel-root')).toHaveClass('bg-ide-bg');
    expect(screen.getByTestId('right-panel-primary-panel')).not.toHaveClass('rounded-md', 'border', 'border-ide-border');
    expect(screen.getByTestId('right-panel-secondary-panel')).not.toHaveClass('rounded-md', 'border', 'border-ide-border');
    expect(screen.getByTestId('right-panel-primary-panel')).toHaveClass('bg-ide-bg');
    expect(screen.getByTestId('right-panel-secondary-panel')).toHaveClass('bg-ide-bg');
    expect(screen.getByTestId('right-panel-secondary-header')).toHaveAttribute('data-code-viewer-layout-mode', 'compact');
    expect(screen.getByTestId('right-panel-secondary-tabs')).toBeInTheDocument();
    expectCompactTabButton('right-panel-secondary-tab-module-info');
    expectCompactTabButton('right-panel-secondary-tab-resource-usage');
    expectCompactTabButton('right-panel-secondary-tab-x-propagation');
    expect(screen.getByTestId('right-panel-secondary-tab-module-info')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('right-panel-secondary-tab-resource-usage')).toHaveAttribute('data-state', 'off');
    expect(screen.getByTestId('right-panel-secondary-tab-x-propagation')).toHaveAttribute('data-state', 'off');
    expect(screen.getByRole('button', { name: 'Secondary panel placeholder action' })).toBeInTheDocument();
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveAttribute('data-right-panel-secondary-tab', 'module-info');
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveTextContent('Module Information');
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveTextContent('Register map placeholder');
    expect(screen.getByTestId('right-panel-split-resize-handle')).toHaveAttribute('aria-orientation', 'horizontal');

    await user.click(expandedSplitToggle);

    const collapsedSplitToggle = screen.getByTestId('right-panel-split-toggle');
    expect(collapsedSplitToggle).toHaveAttribute('aria-label', 'Show lower right panel');
    expect(collapsedSplitToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('right-panel-split-group')).toBeInTheDocument();
    expect(screen.getByTestId('panel-right-panel-primary')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('panel-right-panel-secondary')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('right-panel-secondary-panel')).toHaveStyle({ opacity: '0' });
    expect(screen.queryByTestId('right-panel-split-resize-handle')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.queryByTestId('right-panel-split-group')).not.toBeInTheDocument(), {
      timeout: 3000,
    });

    expect(screen.queryByTestId('panel-right-panel-primary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-right-panel-secondary')).not.toBeInTheDocument();
    expect(screen.getByTestId('right-panel-primary-panel')).not.toHaveClass('rounded-md', 'border', 'border-ide-border');
    expect(screen.queryByTestId('right-panel-secondary-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-panel-split-resize-handle')).not.toBeInTheDocument();
  }, PANEL_TEST_TIMEOUT_MS + PANEL_ITEM_TIMEOUT_MS);

  it('keeps stacked right panels layout-aware in minimal mode', async () => {
    const user = userEvent.setup();

    renderRightSidePanelInLayout('minimal');

    await user.click(screen.getByTestId('right-panel-split-toggle'));
    await waitFor(() => expect(screen.getByTestId('panel-right-panel-secondary')).toHaveAttribute('aria-hidden', 'false'));

    const primaryPanel = screen.getByTestId('right-panel-primary-panel');
    const secondaryPanel = screen.getByTestId('right-panel-secondary-panel');
    const secondaryHeader = screen.getByTestId('right-panel-secondary-header');
    const resizeHandle = screen.getByTestId('right-panel-split-resize-handle');

    expect(screen.getByTestId('right-panel-root')).not.toHaveClass('bg-ide-bg');
    expect(primaryPanel).toHaveClass('rounded-md', 'border', 'border-ide-border', 'bg-ide-bg');
    expect(secondaryPanel).toHaveClass('rounded-md', 'border', 'border-ide-border', 'bg-ide-bg');
    expect(secondaryHeader).toHaveAttribute('data-code-viewer-layout-mode', 'minimal');
    expect(secondaryHeader).toHaveClass('m-1.5', 'mb-0', 'rounded', 'px-2', 'py-1.5');
    expect(secondaryHeader).not.toHaveClass('border');
    expect(secondaryHeader).not.toHaveClass('border-ide-border');
    expect(secondaryHeader).not.toHaveClass('border-b');
    expect(screen.getByTestId('right-panel-secondary-tabs')).toBeInTheDocument();
    expect(resizeHandle).toHaveClass('overlay-handle', 'rounded-full', 'bg-transparent');
  });

  it('switches the right secondary panel between placeholder tabs', async () => {
    const user = userEvent.setup();

    renderRightSidePanelInLayout('compact');

    await user.click(screen.getByTestId('right-panel-split-toggle'));
    await waitFor(() => expect(screen.getByTestId('panel-right-panel-secondary')).toHaveAttribute('aria-hidden', 'false'));

    const placeholder = screen.getByTestId('right-panel-secondary-placeholder');

    expect(placeholder).toHaveAttribute('data-right-panel-secondary-tab', 'module-info');
    expect(placeholder).toHaveTextContent('Signal trace placeholder');

    await user.click(screen.getByTestId('right-panel-secondary-tab-resource-usage'));
    expect(screen.getByTestId('right-panel-secondary-tab-module-info')).toHaveAttribute('data-state', 'off');
    expect(screen.getByTestId('right-panel-secondary-tab-resource-usage')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveAttribute('data-right-panel-secondary-tab', 'resource-usage');
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveTextContent('Module Resource Usage');
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveTextContent('Combinational utilization placeholder');
    expect(screen.queryByText('Register map placeholder')).not.toBeInTheDocument();
    expect(useSidePanelSessionStore.getState().rightSecondaryTab).toBe('resource-usage');

    await user.click(screen.getByTestId('right-panel-secondary-tab-x-propagation'));
    expect(screen.getByTestId('right-panel-secondary-tab-resource-usage')).toHaveAttribute('data-state', 'off');
    expect(screen.getByTestId('right-panel-secondary-tab-x-propagation')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveAttribute('data-right-panel-secondary-tab', 'x-propagation');
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveTextContent('X Propagation');
    expect(screen.getByTestId('right-panel-secondary-placeholder')).toHaveTextContent('Propagation path placeholder');
    expect(screen.queryByText('Combinational utilization placeholder')).not.toBeInTheDocument();
    expect(useSidePanelSessionStore.getState().rightSecondaryTab).toBe('x-propagation');
  }, 10_000);

  it('navigates static check items to their source file and line', async () => {
    const user = userEvent.setup();
    const onFileOpen = vi.fn();
    const onLineJump = vi.fn();

    render(
      <RightSidePanel currentOutlineId="rtl/core/cpu_top.v" onFileOpen={onFileOpen} onLineJump={onLineJump} />,
    );

    await clickButton(user, /static check/i);
    expect(await screen.findByText(/Static Check Report/i, undefined, { timeout: PANEL_ITEM_TIMEOUT_MS })).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /cpu_top\.v:65/i }, { timeout: PANEL_ITEM_TIMEOUT_MS }));

    expect(onFileOpen).toHaveBeenCalledWith('cpu_top', 'cpu_top.v');
    expect(onLineJump).toHaveBeenCalledWith(65);
  }, PANEL_TEST_TIMEOUT_MS);

  it('opens a reference target when a reference row is clicked', async () => {
    const user = userEvent.setup();
    const onFileOpen = vi.fn();
    const onLineJump = vi.fn();

    render(
      <RightSidePanel currentOutlineId="rtl/core/uart_tx.v" onFileOpen={onFileOpen} onLineJump={onLineJump} />,
    );

    await clickButton(user, /references/i);
    expect(await screen.findByText(/4 references · uart_tx\.v/i, undefined, { timeout: PANEL_ITEM_TIMEOUT_MS })).toBeInTheDocument();

    await user.click(await screen.findByText('L40', undefined, { timeout: PANEL_ITEM_TIMEOUT_MS }));

    expect(onFileOpen).toHaveBeenCalledWith('uart_tx', 'uart_tx.v');
    expect(onLineJump).toHaveBeenCalledWith(40);
  }, PANEL_TEST_TIMEOUT_MS);

  it('renders the current file outline from pristine-engine and jumps to selected symbols', async () => {
    const user = userEvent.setup();
    const onLineJump = vi.fn();

    render(
      <RightSidePanel currentOutlineId="rtl/core/alu.sv" onFileOpen={vi.fn()} onLineJump={onLineJump} />,
    );

    await clickButton(user, /outline/i);
    expect(await screen.findByTestId('outline-tree', undefined, { timeout: PANEL_ITEM_TIMEOUT_MS })).toBeInTheDocument();
    expect(window.electronAPI!.lsp.outline).toHaveBeenCalledWith('rtl/core/alu.sv', {
      maxDepth: 8,
      limit: 2000,
      includeChildren: true,
      includeFlat: true,
    });
    expect(screen.getByTestId('outline-node-label-module-alu')).toBeInTheDocument();
    expect(screen.getByTestId('outline-kind-group-label-port')).toHaveTextContent('Port');
    expect(screen.getByTestId('outline-kind-group-count-port')).toHaveTextContent('(1)');
    expect(screen.getByTestId('outline-kind-group-label-parameter')).toHaveTextContent('Parameter');
    expect(screen.getByTestId('outline-kind-group-label-instance')).toHaveTextContent('Instance');
    expect(screen.getByTestId('outline-node-label-port-clk_i')).toBeInTheDocument();
    expect(screen.getByTestId('outline-node-detail-port-clk_i')).toHaveTextContent('input logic');
    expect(screen.getByTestId('outline-node-label-parameter-Width')).toBeInTheDocument();
    expect(screen.getByTestId('outline-node-detail-parameter-Width')).toHaveTextContent('int = 8');
    expect(screen.getByTestId('outline-node-label-instance-u_adder')).toBeInTheDocument();
    expect(screen.getByTestId('outline-node-detail-instance-u_adder')).toHaveTextContent('adder');

    await user.hover(screen.getByTestId('outline-node-label-port-clk_i'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('input logic');

    await user.click(screen.getByTestId('outline-kind-group-port'));
    expect(screen.queryByTestId('outline-node-label-port-clk_i')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('outline-kind-group-port'));
    expect(screen.getByTestId('outline-node-label-port-clk_i')).toBeInTheDocument();

    await user.click(screen.getByTestId('outline-node-label-instance-u_adder'));

    expect(onLineJump).toHaveBeenCalledWith(42);
  }, PANEL_TEST_TIMEOUT_MS);
});
