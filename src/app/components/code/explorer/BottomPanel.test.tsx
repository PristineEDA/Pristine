import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CodeViewerLayoutProvider,
  WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY,
} from '../../../context/CodeViewerLayoutContext';
import type { LspProblem } from '../../../lsp/lspProblems';
import { BottomPanel } from './BottomPanel';
import { resetBottomPanelStoreForTests } from './useBottomPanelStore';

let mockedProblems: LspProblem[] = [];

const terminalPanelMockState = vi.hoisted(() => {
  let nextInstanceId = 1;
  let mountCount = 0;
  let unmountCount = 0;

  return {
    allocateInstanceId() {
      const instanceId = nextInstanceId;
      nextInstanceId += 1;
      return instanceId;
    },
    getMountCount() {
      return mountCount;
    },
    getUnmountCount() {
      return unmountCount;
    },
    markMounted() {
      mountCount += 1;
    },
    markUnmounted() {
      unmountCount += 1;
    },
    reset() {
      nextInstanceId = 1;
      mountCount = 0;
      unmountCount = 0;
    },
  };
});

function expectCompactTabButton(testId: string) {
  const tabButton = screen.getByTestId(testId);
  const icon = tabButton.querySelector('svg');

  expect(tabButton).toHaveClass('h-7', 'w-7');
  expect(icon).not.toBeNull();
  expect(icon!).toHaveAttribute('width', '12');
  expect(icon!).toHaveAttribute('height', '12');
}

const mockThemeApi = vi.hoisted(() => {
  const activeTheme = {
    id: 'vscode-2026-dark',
    label: 'Dark 2026',
    description: 'Built-in 2026 dark color theme.',
    author: 'Microsoft',
    kind: 'dark' as const,
    source: 'builtin' as const,
    colors: {
      'editor.background': '#101010',
      foreground: '#f5f5f5',
      'panel.background': '#181818',
    },
    tokenColors: [],
    semanticHighlighting: true,
    semanticTokenColors: {},
  };

  return {
    theme: 'dark' as const,
    themeId: activeTheme.id,
    activeTheme,
    availableThemes: [],
    importedThemes: [],
    isImportingTheme: false,
    getThemePreview: vi.fn(),
    importTheme: vi.fn(),
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  };
});

vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => mockThemeApi,
}));

vi.mock('../../../lsp/lspProblems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lsp/lspProblems')>();
  return {
    ...actual,
    useLspProblems: () => mockedProblems,
  };
});

const terminateTerminalSessionMock = vi.fn().mockResolvedValue(undefined);
const terminateAllTerminalSessionsMock = vi.fn().mockResolvedValue(undefined);

vi.mock('./terminalSessionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./terminalSessionStore')>();
  return {
    ...actual,
    terminateTerminalSession: (sessionKey?: string) => terminateTerminalSessionMock(sessionKey),
    terminateAllTerminalSessions: () => terminateAllTerminalSessionsMock(),
  };
});

vi.mock('./schematic/AsicSchematicPanel', () => ({
  AsicSchematicPanel: () => <div data-testid="asic-schematic-panel">ASIC schematic mock</div>,
}));

vi.mock('./waveform/WaveformPanel', () => ({
  WaveformPanel: () => <div data-testid="waveform-panel">Waveform mock</div>,
}));

vi.mock('./SynthesisPanel', () => ({
  SynthesisPanel: () => <div data-testid="synthesis-panel">Synthesis mock</div>,
}));

vi.mock('./TerminalPanel', async () => {
  const React = await import('react');

  return {
    TerminalPanel: ({ layoutVersion, sessionKey, testId }: { layoutVersion?: string; sessionKey?: string; testId?: string }) => {
      const instanceIdRef = React.useRef<number | null>(null);

      if (instanceIdRef.current === null) {
        instanceIdRef.current = terminalPanelMockState.allocateInstanceId();
      }

      React.useEffect(() => {
        terminalPanelMockState.markMounted();

        return () => {
          terminalPanelMockState.markUnmounted();
        };
      }, []);

      return React.createElement('div', {
        'data-testid': testId ?? 'terminal-panel-mock',
        'data-instance-id': String(instanceIdRef.current),
        'data-layout-version': layoutVersion ?? '',
        'data-session-key': sessionKey ?? '',
      }, 'Terminal panel mock');
    },
  };
});

type TestUser = ReturnType<typeof userEvent.setup>;

type BottomPanelTabId = 'terminal' | 'output' | 'problems' | 'debug' | 'lsp' | 'schematic' | 'waveform' | 'synthesis';

async function clickButton(user: TestUser, name: string | RegExp) {
  await user.click(screen.getByRole('button', { name }));
}

async function clickBottomTab(user: TestUser, tabId: BottomPanelTabId) {
  await user.click(screen.getByTestId(`bottom-panel-tab-${tabId}`));
}

describe('BottomPanel', () => {
  beforeEach(() => {
    resetBottomPanelStoreForTests();
    terminalPanelMockState.reset();
    terminateTerminalSessionMock.mockClear();
    terminateAllTerminalSessionsMock.mockClear();
    mockedProblems = [
      {
        id: 'error-1',
        severity: 'error',
        message: 'Undriven signal',
        file: 'cpu_top.sv',
        fileId: 'rtl/core/cpu_top.sv',
        line: 4,
        column: 5,
      },
      {
        id: 'error-2',
        severity: 'error',
        message: 'Missing reset assignment',
        file: 'alu.sv',
        fileId: 'rtl/core/alu.sv',
        line: 11,
        column: 2,
      },
      {
        id: 'warning-1',
        severity: 'warning',
        message: 'Potential latch inferred',
        file: 'alu.sv',
        fileId: 'rtl/core/alu.sv',
        line: 18,
        column: 9,
      },
      {
        id: 'warning-2',
        severity: 'warning',
        message: 'Unused output',
        file: 'cpu_top.sv',
        fileId: 'rtl/core/cpu_top.sv',
        line: 22,
        column: 1,
      },
      {
        id: 'info-1',
        severity: 'info',
        message: 'Consider registering this signal',
        file: 'cpu_top.sv',
        fileId: 'rtl/core/cpu_top.sv',
        line: 25,
        column: 7,
      },
      {
        id: 'hint-1',
        severity: 'hint',
        message: 'Inline this temporary variable',
        file: 'cpu_top.sv',
        fileId: 'rtl/core/cpu_top.sv',
        line: 27,
        column: 3,
      },
    ];
  });

  it('terminates the terminal session before closing the panel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<BottomPanel onClose={onClose} />);

    await clickButton(user, /close panel/i);

    await waitFor(() => expect(terminateAllTerminalSessionsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('renders the maximize panel button immediately before the close panel button', async () => {
    const user = userEvent.setup();
    const onMaximizeToggle = vi.fn();

    render(<BottomPanel onMaximizeToggle={onMaximizeToggle} />);

    const maximizeIcon = screen.getByTestId('bottom-panel-maximize').querySelector('svg');

    const toolbarButtonLabels = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => label === 'New Terminal' || label === 'Maximize Panel' || label === 'Close Panel');

    expect(toolbarButtonLabels).toEqual(['New Terminal', 'Maximize Panel', 'Close Panel']);
    expect(maximizeIcon).not.toBeNull();
    expect(maximizeIcon).toHaveClass('lucide-maximize');

    await clickButton(user, /maximize panel/i);

    expect(onMaximizeToggle).toHaveBeenCalledTimes(1);
    expect(terminateAllTerminalSessionsMock).not.toHaveBeenCalled();
  });

  it('labels the maximize button as restore when the panel is maximized', () => {
    const onMaximizeToggle = vi.fn();

    render(<BottomPanel isMaximized onMaximizeToggle={onMaximizeToggle} />);

    expect(screen.getByTestId('bottom-panel-maximize')).toHaveAccessibleName('Restore Panel');
    expect(screen.getByTestId('bottom-panel-maximize').querySelector('svg')).toHaveClass('lucide-minimize-2');
    expect(screen.queryByRole('button', { name: /maximize panel/i })).not.toBeInTheDocument();
  });

  it('keeps the terminal panel mounted when only layoutVersion changes', () => {
    const { rerender } = render(<BottomPanel layoutVersion="true:true:true:240" />);

    const initialTerminalPanel = screen.getByTestId('terminal-host');
    const initialInstanceId = initialTerminalPanel.getAttribute('data-instance-id');

    expect(initialTerminalPanel).toHaveAttribute('data-layout-version', 'true:true:true:240');
    expect(terminalPanelMockState.getMountCount()).toBe(1);
    expect(terminalPanelMockState.getUnmountCount()).toBe(0);

    rerender(<BottomPanel layoutVersion="false:true:true:240" />);

    const rerenderedTerminalPanel = screen.getByTestId('terminal-host');

    expect(rerenderedTerminalPanel).toBe(initialTerminalPanel);
    expect(rerenderedTerminalPanel).toHaveAttribute('data-instance-id', initialInstanceId ?? '');
    expect(rerenderedTerminalPanel).toHaveAttribute('data-layout-version', 'false:true:true:240');
    expect(terminalPanelMockState.getMountCount()).toBe(1);
    expect(terminalPanelMockState.getUnmountCount()).toBe(0);
  });

  it('switches between tabs and closes the panel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<BottomPanel onClose={onClose} />);

    expect(screen.getByTestId('bottom-panel-tab-bar')).toHaveClass('bg-ide-tab-bg');
    expect(screen.getByTestId('bottom-panel-tab-bar')).not.toHaveClass('border-b', 'border-ide-border');
    expect(screen.getByTestId('bottom-panel-tab-problems')).toHaveAccessibleName('Problems');

    await clickBottomTab(user, 'problems');
    expect(await screen.findByText(/2 errors/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 warnings/i)).toBeInTheDocument();
    expect(await screen.findByText(/1 infos/i)).toBeInTheDocument();
    expect(await screen.findByText(/1 hints/i)).toBeInTheDocument();
    expect(await screen.findByText(/Undriven signal/i)).toBeInTheDocument();

    await clickBottomTab(user, 'debug');
    expect(screen.getByRole('button', { name: /start debugging/i })).toBeInTheDocument();
    expect(screen.getByText(/Debug session not started/i)).toBeInTheDocument();

    await clickBottomTab(user, 'lsp');
    expect(await screen.findByTestId('lsp-panel')).toBeInTheDocument();
    expect(screen.getByText(/No LSP debug events yet\./i)).toBeInTheDocument();

    await clickBottomTab(user, 'schematic');
    expect(await screen.findByTestId('asic-schematic-panel')).toBeInTheDocument();

    await clickBottomTab(user, 'waveform');
    expect(await screen.findByTestId('waveform-panel')).toBeInTheDocument();

    await clickBottomTab(user, 'synthesis');
    expect(await screen.findByTestId('synthesis-panel')).toBeInTheDocument();

    await clickButton(user, /close panel/i);
    expect(terminateAllTerminalSessionsMock).toHaveBeenCalled();
  });

  it('keeps split panes scoped to the active tab and opens panel content from the new pane menu', async () => {
    const user = userEvent.setup();

    render(<BottomPanel />);

    const firstPane = screen.getByTestId('bottom-panel-pane-bottom-pane-1');
    vi.spyOn(firstPane, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 900,
      top: 0,
      width: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    expect(screen.getByTestId('bottom-panel-split')).toHaveAccessibleName('Split Panel');
    expect(screen.getByTestId('bottom-panel-remove-split')).toBeDisabled();

    await user.click(screen.getByTestId('bottom-panel-split'));

    const splitPanes = screen.getAllByTestId(/bottom-panel-pane-bottom-pane-/);
    expect(splitPanes).toHaveLength(2);
    expect(screen.getByTestId('panel-bottom-panel-split-pane-bottom-pane-1')).toHaveAttribute('data-default-size', '50');
    expect(screen.getByTestId('panel-bottom-panel-split-pane-bottom-pane-2')).toHaveAttribute('data-default-size', '50');
    expect(screen.getByTestId('bottom-panel-open-pane-bottom-pane-2')).toHaveTextContent('Open');

    await user.click(screen.getByTestId('bottom-panel-open-pane-bottom-pane-2'));
    await user.click(await screen.findByTestId('bottom-panel-open-placeholder-a-bottom-pane-2'));

    expect(screen.getByText('Placeholder A')).toBeInTheDocument();

    await clickBottomTab(user, 'lsp');

    expect(screen.getByTestId('bottom-panel-pane-bottom-pane-lsp-1')).toBeInTheDocument();
    expect(screen.queryByText('Placeholder A')).not.toBeInTheDocument();

    await clickBottomTab(user, 'terminal');

    expect(screen.getByText('Placeholder A')).toBeInTheDocument();
  });

  it('does not split panes below the minimum width threshold', async () => {
    const user = userEvent.setup();

    render(<BottomPanel />);

    const firstPane = screen.getByTestId('bottom-panel-pane-bottom-pane-1');
    vi.spyOn(firstPane, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 400,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(firstPane);

    expect(screen.getByTestId('bottom-panel-split')).toBeDisabled();

    await user.click(screen.getByTestId('bottom-panel-split'));

    expect(screen.getAllByTestId(/bottom-panel-pane-bottom-pane-/)).toHaveLength(1);
  });

  it('keeps Open menu content inside the current active tab layout', async () => {
    const user = userEvent.setup();

    render(<BottomPanel />);

    await clickBottomTab(user, 'lsp');

    const lspPane = screen.getByTestId('bottom-panel-pane-bottom-pane-lsp-1');
    vi.spyOn(lspPane, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 900,
      top: 0,
      width: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await user.click(screen.getByTestId('bottom-panel-split'));
    await user.click(screen.getByTestId('bottom-panel-open-pane-bottom-pane-lsp-2'));
    await user.click(await screen.findByTestId('bottom-panel-open-schematic-bottom-pane-lsp-2'));

    expect(screen.getByTestId('bottom-panel-tab-lsp')).toHaveAttribute('data-state', 'on');
    expect(await screen.findByTestId('asic-schematic-panel')).toBeInTheDocument();

    await clickBottomTab(user, 'terminal');
    expect(screen.queryByTestId('asic-schematic-panel')).not.toBeInTheDocument();

    await clickBottomTab(user, 'lsp');
    expect(await screen.findByTestId('asic-schematic-panel')).toBeInTheDocument();
  });

  it('removes the focused split pane and terminates its terminal session', async () => {
    const user = userEvent.setup();

    render(<BottomPanel />);

    const firstPane = screen.getByTestId('bottom-panel-pane-bottom-pane-1');
    vi.spyOn(firstPane, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 900,
      top: 0,
      width: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await user.click(screen.getByTestId('bottom-panel-split'));
    await user.click(screen.getByTestId('bottom-panel-open-pane-bottom-pane-2'));
    await user.click(await screen.findByTestId('bottom-panel-open-terminal-bottom-pane-2'));

    expect(await screen.findByTestId('terminal-host-bottom-pane-2')).toBeInTheDocument();

    await user.click(screen.getByTestId('bottom-panel-remove-split'));

    await waitFor(() => expect(screen.queryByTestId('terminal-host-bottom-pane-2')).not.toBeInTheDocument());
    expect(terminateTerminalSessionMock).toHaveBeenCalledWith('bottom-pane-2');
    expect(screen.getByTestId('terminal-host')).toBeInTheDocument();
  });

  it('filters output entries by text and severity', async () => {
    const user = userEvent.setup();
    const { container } = render(<BottomPanel />);

    expect(container.firstChild).toHaveClass('min-h-0');

    await clickBottomTab(user, 'output');

    const initialEntry = await screen.findByText(/RTL Analyzer v2\.4\.1 started/i);
    expect(initialEntry.closest('.bottom-panel-scrollbar')).not.toBeNull();

    const filterInput = await screen.findByPlaceholderText(/filter output/i);
    fireEvent.change(filterInput, { target: { value: 'cpu_top' } });

    expect(await screen.findByText(/cpu_top\.v \[L56\]: Unconnected port alu_src_b/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/RTL Analyzer v2\.4\.1 started/i)).not.toBeInTheDocument();
    });

    await clickButton(user, /^INFO$/i);

    await waitFor(() => {
      expect(screen.queryByText(/cpu_top\.v \[L56\]: Unconnected port alu_src_b/i)).not.toBeInTheDocument();
    });
  });

  it('uses minimal bottom-panel tab chrome when configured', () => {
    vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) =>
      key === WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY ? 'minimal' : null,
    );

    const { container } = render(
      <CodeViewerLayoutProvider>
        <BottomPanel />
      </CodeViewerLayoutProvider>,
    );

    expect(container.firstChild).toHaveAttribute('data-code-viewer-layout-mode', 'minimal');
    expect(container.firstChild).toHaveClass('rounded-md', 'bg-ide-bg');
    expect(container.firstChild).not.toHaveClass('border');
    expect(container.firstChild).not.toHaveClass('border-t');
    expect(screen.getByTestId('bottom-panel-tab-bar')).toHaveClass('h-9', 'gap-1.5', 'px-1.5');
    expect(screen.getByTestId('bottom-panel-tab-bar')).toHaveClass('bg-ide-tab-bg');
    expect(screen.getByTestId('bottom-panel-tab-bar')).not.toHaveClass('border-b', 'border-ide-border');
    expect(screen.getByTestId('bottom-panel-tab-group')).toHaveAttribute('aria-label', 'Bottom panel tabs');
    expectCompactTabButton('bottom-panel-tab-terminal');
    expectCompactTabButton('bottom-panel-tab-output');
    expectCompactTabButton('bottom-panel-tab-problems');
    expectCompactTabButton('bottom-panel-tab-debug');
    expectCompactTabButton('bottom-panel-tab-lsp');
    expectCompactTabButton('bottom-panel-tab-schematic');
    expectCompactTabButton('bottom-panel-tab-waveform');
    expectCompactTabButton('bottom-panel-tab-synthesis');
    expect(screen.getByTestId('bottom-panel-tab-terminal')).toHaveAccessibleName('Terminal');
    expect(screen.getByTestId('bottom-panel-tab-schematic')).toHaveAccessibleName('Schematic');
    expect(screen.getByTestId('bottom-panel-tab-waveform')).toHaveAccessibleName('Waveform');
    expect(screen.getByTestId('bottom-panel-tab-synthesis')).toHaveAccessibleName('Synthesis');
    expect(screen.getByTestId('bottom-panel-tab-terminal')).toHaveAttribute('data-state', 'on');
  });

  it('adds Synthesis as the final bottom-panel tab', () => {
    render(<BottomPanel />);

    const tabItems = [
      'terminal',
      'output',
      'problems',
      'debug',
      'lsp',
      'schematic',
      'waveform',
      'synthesis',
    ].map((tabId) => screen.getByTestId(`bottom-panel-tab-${tabId}`));

    expect(tabItems.map((button) => button.getAttribute('data-testid'))).toEqual([
      'bottom-panel-tab-terminal',
      'bottom-panel-tab-output',
      'bottom-panel-tab-problems',
      'bottom-panel-tab-debug',
      'bottom-panel-tab-lsp',
      'bottom-panel-tab-schematic',
      'bottom-panel-tab-waveform',
      'bottom-panel-tab-synthesis',
    ]);
    expect(screen.getByTestId('bottom-panel-tab-synthesis').querySelector('svg')).toHaveClass('lucide-network');
  });
});
