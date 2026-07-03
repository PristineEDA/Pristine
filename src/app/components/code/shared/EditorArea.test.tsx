import { createRef, useLayoutEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorArea } from './EditorArea';
import {
  CodeViewerLayoutProvider,
  WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY,
} from '../../../context/CodeViewerLayoutContext';
import { draculaThemeDefinition } from '../../../editor/draculaTheme';
import { getMonacoEditorFontFamilyStack } from '../../../editor/editorSettings';
import { resetEditorLanguageRegistrationForTests } from '../../../editor/registerLanguages';
import { resetEditorThemeRegistrationForTests } from '../../../editor/monacoThemes';
import { resetSystemVerilogLspProviderRegistrationForTests } from '../../../lsp/systemVerilogLspBridge';
import { resetMonacoColorThemeCacheForTests } from '../../../theme/monacoColorTheme';

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

vi.mock('../../../context/EditorSettingsContext', () => ({
  useEditorSettings: () => ({
    fontFamily: 'jetbrains-mono',
    fontSize: 13,
    inlineGitDiffEnabled: true,
    inlineGitDiffStateBackgroundsEnabled: true,
    setFontSize: vi.fn(),
    setTheme: vi.fn(),
    theme: 'dracula',
    themes: [],
  }),
}));

vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => mockThemeApi,
}));

const {
  mockEditorComponent,
  mockEditorDomNode,
  mockEditorInstance,
  mockModel,
  mockMonaco,
  mockWorkspaceGitStatus,
} = vi.hoisted(() => {
  const activeElement = {};
  const inputElement = {
    focus: vi.fn(),
  };
  const editorDomNode = {
    contains: vi.fn((element: unknown) => element === activeElement),
    focus: vi.fn(),
    ownerDocument: {
      activeElement,
    },
    querySelector: vi.fn(() => inputElement),
  };

  const editorInstance = {
    getDomNode: vi.fn(() => editorDomNode),
    hasTextFocus: vi.fn(() => true),
    onDidChangeCursorPosition: vi.fn((callback: (event: { position: { lineNumber: number; column: number } }) => void) => {
      callback({ position: { lineNumber: 12, column: 7 } });
      return { dispose: vi.fn() };
    }),
    onDidFocusEditorText: vi.fn(() => ({ dispose: vi.fn() })),
    getModel: vi.fn(() => ({
      getLineCount: () => 200,
      getLineMaxColumn: () => 120,
    })),
    revealLineInCenter: vi.fn(),
    setPosition: vi.fn(),
    focus: vi.fn(),
    updateOptions: vi.fn(),
    layout: vi.fn(),
  };

  const model = { id: 'mock-model' };

  const monaco = {
    languages: {
      getLanguages: vi.fn(() => []),
      register: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
      registerCompletionItemProvider: vi.fn(),
      registerHoverProvider: vi.fn(),
      registerDefinitionProvider: vi.fn(),
      registerReferenceProvider: vi.fn(),
      CompletionItemKind: { Keyword: 'keyword', Variable: 'variable' },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Uri: {
      parse: vi.fn((value: string) => ({ path: value })),
    },
    editor: {
      defineTheme: vi.fn(),
      getModels: vi.fn(() => [model]),
      setModelMarkers: vi.fn(),
      remeasureFonts: vi.fn(),
    },
    MarkerSeverity: {
      Error: 8,
      Warning: 4,
      Info: 2,
    },
  };

  return {
    mockEditorDomNode: editorDomNode,
    mockEditorInstance: editorInstance,
    mockModel: model,
    mockMonaco: monaco,
    mockEditorComponent: vi.fn(),
    mockWorkspaceGitStatus: {
      branchName: 'feature/git-ui',
      hasProjectFiles: true,
      isGitRepo: true,
      isLoading: false,
      pathStates: {} as Record<string, 'created' | 'modified' | 'deleted' | 'ignored'>,
    },
  };
});

vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => {
    mockEditorComponent(props);

    useLayoutEffect(() => {
      props.beforeMount?.(mockMonaco);
      props.onMount?.(mockEditorInstance);
    }, []);

    return (
      <div
        data-testid="monaco-editor"
        data-language={props.language}
      >
        {props.value}
      </div>
    );
  },
  useMonaco: () => mockMonaco,
}));

vi.mock('../../../git/workspaceGitStatus', () => ({
  useWorkspaceGitStatus: () => mockWorkspaceGitStatus,
  getWorkspaceGitPathState: (
    snapshot: typeof mockWorkspaceGitStatus,
    path: string,
  ) => snapshot.pathStates[path],
}));

vi.mock('../../../editor/configureMonacoLoader', () => ({}));

describe('EditorArea', () => {
  beforeEach(() => {
    const electronApi = window.electronAPI!;

    vi.clearAllMocks();
    resetEditorLanguageRegistrationForTests();
    resetEditorThemeRegistrationForTests();
    resetMonacoColorThemeCacheForTests();
    resetSystemVerilogLspProviderRegistrationForTests();
    mockMonaco.languages.getLanguages.mockReturnValue([]);
    mockMonaco.editor.getModels.mockReturnValue([mockModel]);
    mockEditorDomNode.contains.mockReturnValue(true);
    mockEditorInstance.hasTextFocus.mockReturnValue(true);
    mockWorkspaceGitStatus.branchName = 'feature/git-ui';
    mockWorkspaceGitStatus.hasProjectFiles = true;
    mockWorkspaceGitStatus.isGitRepo = true;
    mockWorkspaceGitStatus.pathStates = {};
    vi.mocked(electronApi.git.getFileDiff).mockReset();
    vi.mocked(electronApi.git.getFileDiff).mockResolvedValue({
      filePath: '',
      originalContent: '',
      currentContent: '',
    });
    vi.mocked(electronApi.fs.readFile).mockResolvedValue('// fixture content');
  });

  it('renders the empty state when no tabs are open', () => {
    const handleCreateProject = vi.fn();
    const handleOpenProject = vi.fn();

    render(
      <EditorArea
        tabs={[]}
        activeTabId=""
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        hasOpenProject={false}
        onCreateProject={handleCreateProject}
        onOpenProject={handleOpenProject}
      />,
    );

    const emptyState = screen.getByText('No Projects Yet').closest('[data-slot="empty"]');

    expect(emptyState).toHaveClass('h-full', 'w-full', 'items-center', 'justify-center');
    expect(emptyState).not.toHaveClass('border-dashed');
    expect(screen.getByTestId('empty-project-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('empty-project-tab-info')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('empty-project-tab-image')).toBeInTheDocument();
    expect(screen.getByTestId('empty-project-tab-summary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Project' })).toBeInTheDocument();
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('empty-project-create-project'));
    fireEvent.click(screen.getByTestId('empty-project-open-project'));

    expect(handleCreateProject).toHaveBeenCalledTimes(1);
    expect(handleOpenProject).toHaveBeenCalledTimes(1);
  });

  it('renders a restoring workspace placeholder while bootstrap is pending', () => {
    render(
      <EditorArea
        tabs={[]}
        activeTabId=""
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        hasOpenProject={false}
        workspaceBootstrapStatus="bootstrapping"
      />,
    );

    expect(screen.getByTestId('editor-workspace-restoring')).toHaveTextContent('Restoring workspace...');
    expect(screen.queryByText('No Projects Yet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
  });

  it('switches tabs and closes a tab through the tab strip', () => {
    const onTabChange = vi.fn();
    const onTabClose = vi.fn();

    vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) =>
      key === WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY ? 'compact' : null,
    );

    render(
      <CodeViewerLayoutProvider>
        <EditorArea
          tabs={[
            { id: 'rtl/core/cpu_top.v', name: 'cpu_top.v', modified: true, isPinned: true },
            { id: 'rtl/core/alu.v', name: 'alu.v', isPinned: true },
          ]}
          activeTabId="rtl/core/cpu_top.v"
          onTabChange={onTabChange}
          onTabClose={onTabClose}
          editorRef={createRef()}
        />
      </CodeViewerLayoutProvider>,
    );

    fireEvent.click(screen.getByTestId('editor-tab-rtl/core/alu.v'));
    fireEvent.click(screen.getByTestId('editor-tab-close-rtl/core/cpu_top.v'));

    expect(screen.getByTestId('editor-tab-bar')).toHaveClass('h-[27px]');
    expect(screen.getByTestId('editor-tab-rtl/core/cpu_top.v')).toHaveClass('min-w-[100px]', 'max-w-[200px]');
    expect(screen.getByTestId('editor-split-right')).toHaveClass('px-1', 'cursor-pointer');
    expect(screen.getByTestId('editor-split-down')).toHaveClass('px-1', 'cursor-pointer');
    expect(screen.getByTestId('editor-tab-primary-rtl/core/cpu_top.v')).toHaveClass('flex', 'min-w-0', 'flex-1', 'items-center');
    expect(screen.getByTestId('editor-tab-primary-rtl/core/cpu_top.v')).not.toHaveClass('items-end');
    expect(screen.getByTestId('editor-tab-primary-rtl/core/cpu_top.v')).not.toHaveClass('h-full');
    expect(screen.getByTestId('editor-tab-title-rtl/core/cpu_top.v')).toHaveClass('leading-4');
    expect(screen.getByTestId('editor-tab-title-rtl/core/cpu_top.v')).not.toHaveClass('leading-none');
    expect(screen.getByTestId('editor-tab-badge-rtl/core/cpu_top.v')).not.toHaveClass('self-end');
    expect(screen.getByTestId('editor-tab-badge-rtl/core/cpu_top.v')).toHaveAttribute('data-icon-key', 'verilog');
    expect(screen.getByTestId('editor-tab-badge-rtl/core/alu.v')).toHaveAttribute('data-icon-key', 'verilog');

    expect(onTabChange).toHaveBeenCalledWith('rtl/core/alu.v');
    expect(onTabClose).toHaveBeenCalledWith('rtl/core/cpu_top.v');
  });

  it('uses rounded minimal tab chrome when the code viewer layout is minimal', () => {
    vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) =>
      key === WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY ? 'minimal' : null,
    );

    render(
      <CodeViewerLayoutProvider>
        <EditorArea
          tabs={[
            { id: 'rtl/core/cpu_top.v', name: 'cpu_top.v', modified: true, isPinned: true },
            { id: 'rtl/core/alu.v', name: 'alu.v', isPinned: true },
          ]}
          activeTabId="rtl/core/cpu_top.v"
          onTabChange={vi.fn()}
          onTabClose={vi.fn()}
          editorRef={createRef()}
        />
      </CodeViewerLayoutProvider>,
    );

    expect(screen.getByTestId('editor-tab-bar')).toHaveAttribute('data-code-viewer-layout-mode', 'minimal');
    expect(screen.getByTestId('editor-tab-bar')).toHaveClass('h-[30px]', 'items-center', 'gap-0', 'px-1');
    expect(screen.getByTestId('editor-tab-bar')).not.toHaveClass('gap-1.5', 'p-1.5');
    expect(screen.getByTestId('editor-tab-rtl/core/cpu_top.v')).toHaveClass('h-[27px]', 'min-w-[90px]', 'max-w-[180px]', 'rounded-md', 'bg-ide-editor-bg', 'px-2');
    expect(screen.getByTestId('editor-tab-rtl/core/cpu_top.v')).not.toHaveClass('min-w-[100px]', 'max-w-[200px]');
    expect(screen.getByTestId('editor-tab-rtl/core/cpu_top.v')).not.toHaveClass('h-full');
    expect(screen.getByTestId('editor-tab-rtl/core/alu.v')).toHaveClass('h-[27px]', 'min-w-[90px]', 'max-w-[180px]', 'rounded-md', 'px-2');
  });

  it('renders preview tabs with italic titles and a visible temporary-state marker', () => {
    render(
      <EditorArea
        tabs={[
          { id: 'rtl/core/reg_file.v', name: 'reg_file.v', isPinned: false },
          { id: 'rtl/core/alu.v', name: 'alu.v', isPinned: true },
        ]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        onTabPin={vi.fn()}
        editorRef={createRef()}
      />,
    );

    expect(screen.getByTestId('editor-tab-title-rtl/core/reg_file.v')).toHaveClass('italic');
    expect(screen.getByTestId('editor-tab-preview-indicator-rtl/core/reg_file.v')).toBeInTheDocument();
    expect(screen.getByTestId('editor-tab-preview-indicator-ring-rtl/core/reg_file.v')).toBeInTheDocument();
    expect(screen.getByTestId('editor-tab-preview-indicator-dot-rtl/core/reg_file.v')).toBeInTheDocument();
    expect(screen.getByTestId('editor-tab-rtl/core/reg_file.v')).toHaveAttribute('title', 'rtl/core/reg_file.v (Preview tab)');
    expect(screen.getByTestId('editor-tab-close-rtl/core/reg_file.v')).toHaveClass('opacity-50');
    expect(screen.getByTestId('editor-tab-rtl/core/alu.v')).toHaveAttribute('title', 'rtl/core/alu.v');
    expect(screen.queryByTestId('editor-tab-preview-indicator-rtl/core/alu.v')).not.toBeInTheDocument();
  });

  it('renders a VS Code-style dirty indicator and hides the preview marker for modified tabs', () => {
    render(
      <EditorArea
        tabs={[
          { id: 'rtl/core/reg_file.v', name: 'reg_file.v', modified: true, isPinned: false },
        ]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    expect(screen.getByTestId('editor-tab-dirty-indicator-rtl/core/reg_file.v')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-tab-preview-indicator-rtl/core/reg_file.v')).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-tab-close-rtl/core/reg_file.v')).toBeInTheDocument();
  });

  it('highlights git-modified tabs in yellow while keeping the unsaved dirty indicator visible', () => {
    mockWorkspaceGitStatus.pathStates = {
      'rtl/core/reg_file.v': 'modified',
    };

    render(
      <EditorArea
        tabs={[
          { id: 'rtl/core/reg_file.v', name: 'reg_file.v', modified: true, isPinned: true },
        ]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    expect(screen.getByTestId('editor-tab-title-rtl/core/reg_file.v')).toHaveClass('text-ide-warning');
    expect(screen.getByTestId('editor-tab-dirty-indicator-rtl/core/reg_file.v')).toBeInTheDocument();
  });

  it('pins a preview tab on double-click and before dragging begins', () => {
    const onTabChange = vi.fn();
    const onTabPin = vi.fn();
    const onTabDragStart = vi.fn();

    render(
      <EditorArea
        tabs={[
          { id: 'rtl/core/reg_file.v', name: 'reg_file.v', isPinned: false },
        ]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={onTabChange}
        onTabClose={vi.fn()}
        onTabPin={onTabPin}
        onTabDragStart={onTabDragStart}
        editorRef={createRef()}
      />,
    );

    const previewTab = screen.getByTestId('editor-tab-rtl/core/reg_file.v');
    fireEvent.doubleClick(previewTab);

    expect(onTabChange).toHaveBeenCalledWith('rtl/core/reg_file.v');
    expect(onTabPin).toHaveBeenCalledTimes(1);

    fireEvent.dragStart(previewTab, {
      dataTransfer: {
        effectAllowed: '',
        setData: vi.fn(),
      },
    });

    expect(onTabPin).toHaveBeenCalledTimes(2);
    expect(onTabDragStart).toHaveBeenCalledWith('rtl/core/reg_file.v');
  });

  it('uses the same Material icon mapping in editor tabs as the explorer', () => {
    render(
      <EditorArea
        tabs={[
          { id: 'scripts/build.tcl', name: 'build.tcl' },
          { id: 'config/project.json', name: 'project.json' },
          { id: 'build/Makefile', name: 'Makefile' },
          { id: 'rtl/include/cpu_defs.vh', name: 'cpu_defs.vh' },
          { id: 'rtl/bus/axi_if.sv', name: 'axi_if.sv' },
          { id: 'rtl/include/axi_pkg.svh', name: 'axi_pkg.svh' },
          { id: 'rtl/filelist/top.fl', name: 'top.fl' },
          { id: 'sta/opensta/retrosoc.sdc', name: 'retrosoc.sdc' },
          { id: 'syn/demo/synth_retrosoc.ys', name: 'synth_retrosoc.ys' },
          { id: 'Hazard3/doc/hazard3.adoc', name: 'hazard3.adoc' },
        ]}
        activeTabId="scripts/build.tcl"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    expect(screen.getByTestId('editor-tab-badge-scripts/build.tcl')).toHaveAttribute('data-icon-key', 'tcl');
    expect(screen.getByTestId('editor-tab-badge-config/project.json')).toHaveAttribute('data-icon-key', 'json');
    expect(screen.getByTestId('editor-tab-badge-build/Makefile')).toHaveAttribute('data-icon-key', 'makefile');
    expect(screen.getByTestId('editor-tab-badge-rtl/include/cpu_defs.vh')).toHaveAttribute('data-icon-key', 'verilog-header');
    expect(screen.getByTestId('editor-tab-badge-rtl/bus/axi_if.sv')).toHaveAttribute('data-icon-key', 'systemverilog');
    expect(screen.getByTestId('editor-tab-badge-rtl/include/axi_pkg.svh')).toHaveAttribute('data-icon-key', 'systemverilog-header');
    expect(screen.getByTestId('editor-tab-badge-rtl/filelist/top.fl')).toHaveAttribute('data-icon-key', 'eda-filelist');
    expect(screen.getByTestId('editor-tab-badge-sta/opensta/retrosoc.sdc')).toHaveAttribute('data-icon-key', 'timing-constraint');
    expect(screen.getByTestId('editor-tab-badge-syn/demo/synth_retrosoc.ys')).toHaveAttribute('data-icon-key', 'yosys');
    expect(screen.getByTestId('editor-tab-badge-Hazard3/doc/hazard3.adoc')).toHaveAttribute('data-icon-key', 'asciidoc');
  });

  it('routes assembly files to the assembly language and registers assembly highlighting', async () => {
    render(
      <EditorArea
        tabs={[{ id: 'startup/crt0.S', name: 'crt0.S' }]}
        activeTabId="startup/crt0.S"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('startup/crt0.S', 'utf-8');
    });

    expect(screen.getByTestId('editor-tab-badge-startup/crt0.S')).toHaveAttribute('data-icon-key', 'assembly');
    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'assembly');
    expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'assembly', extensions: ['.s', '.S'] });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('assembly', expect.any(Object));
    expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith('assembly', expect.any(Object));
  });

  it('routes shell, Tcl, linker script, file list, and constraint files to dedicated highlighted editor languages', async () => {
    const { rerender } = render(
      <EditorArea
        tabs={[{ id: 'scripts/deploy.sh', name: 'deploy.sh' }]}
        activeTabId="scripts/deploy.sh"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('scripts/deploy.sh', 'utf-8');
    });
    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'shell');
    expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'shell', extensions: ['.sh'] });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('shell', expect.any(Object));

    rerender(
      <EditorArea
        tabs={[{ id: 'scripts/build.tcl', name: 'build.tcl' }]}
        activeTabId="scripts/build.tcl"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('scripts/build.tcl', 'utf-8');
    });
    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'tcl');
    expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'tcl', extensions: ['.tcl'] });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('tcl', expect.any(Object));

    rerender(
      <EditorArea
        tabs={[{ id: 'linker/memory.lds', name: 'memory.lds' }]}
        activeTabId="linker/memory.lds"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('linker/memory.lds', 'utf-8');
    });
    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'linker-script');
    expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'linker-script', extensions: ['.ld', '.lds'] });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('linker-script', expect.any(Object));

    rerender(
      <EditorArea
        tabs={[{ id: 'sim/sources.fl', name: 'sources.fl' }]}
        activeTabId="sim/sources.fl"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('sim/sources.fl', 'utf-8');
    });
    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'filelist');
    expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'filelist', extensions: ['.f', '.fl'] });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('filelist', expect.any(Object));

    rerender(
      <EditorArea
        tabs={[{ id: 'constraints/top.xdc', name: 'top.xdc' }]}
        activeTabId="constraints/top.xdc"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('constraints/top.xdc', 'utf-8');
    });
    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'constraints');
    expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'constraints', extensions: ['.xdc', '.sdc'] });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('constraints', expect.any(Object));
  });

  it('routes Makefile and .mk files to dedicated makefile highlighting', async () => {
    const { rerender } = render(
      <EditorArea
        tabs={[{ id: 'build/Makefile', name: 'Makefile' }]}
        activeTabId="build/Makefile"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('build/Makefile', 'utf-8');
    });
    expect(screen.getByTestId('editor-tab-badge-build/Makefile')).toHaveAttribute('data-icon-key', 'makefile');
    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'makefile');
    expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'makefile', extensions: ['.mk'], filenames: ['Makefile'] });
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('makefile', expect.any(Object));
    expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith('makefile', expect.any(Object));

    const makefileProviderCall = mockMonaco.languages.setMonarchTokensProvider.mock.calls.find(
      ([languageId]) => languageId === 'makefile',
    );
    const makefileProvider = makefileProviderCall?.[1] as any;
    expect(makefileProvider.tokenizer.makeVariable).toEqual(
      expect.arrayContaining([
        [/\$\(/, 'variable', '@push'],
        [/\)/, 'variable', '@pop'],
      ]),
    );
    expect(makefileProvider.tokenizer.root).toEqual(
      expect.arrayContaining([
        [/^\t+/, 'meta.recipe', '@recipeCommand'],
        [/^(\s*)([A-Za-z0-9_.%/\-]+)(\s*)(:=)/, ['', 'variable', '', 'operator.assignment.immediate'], '@assignmentValue'],
        [/^(\s*)([A-Za-z0-9_.%/\-]+)(\s*)(\+=)/, ['', 'variable', '', 'operator.assignment.append'], '@assignmentValue'],
        [/^(\s*)([A-Za-z0-9_.%/\-]+)(\s*)(\?=)/, ['', 'variable', '', 'operator.assignment.conditional'], '@assignmentValue'],
        [/^(\s*)([A-Za-z0-9_.%/\-]+)(\s*)(=)/, ['', 'variable', '', 'operator.assignment.recursive'], '@assignmentValue'],
      ]),
    );
    expect(makefileProvider.tokenizer.prerequisites).toEqual(
      expect.arrayContaining([
        [/[A-Za-z0-9_.%/\-]+/, 'identifier'],
      ]),
    );
    expect(makefileProvider.tokenizer.recipeCommand).toEqual(
      expect.arrayContaining([
        [/\$(?:[@%<?^*+|])/, 'variable.automatic'],
        [/\$\$\{?[A-Za-z_][\w]*\}?/, 'variable.shell'],
      ]),
    );
    expect(draculaThemeDefinition.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: 'variable.automatic', foreground: 'ffb86c' }),
        expect.objectContaining({ token: 'support.function.shell', foreground: '50fa7b' }),
        expect.objectContaining({ token: 'operator.assignment.immediate', foreground: 'ff79c6' }),
        expect.objectContaining({ token: 'operator.assignment.append', foreground: '50fa7b' }),
        expect.objectContaining({ token: 'operator.assignment.conditional', foreground: 'bd93f9' }),
        expect.objectContaining({ token: 'operator.assignment.recursive', foreground: 'ffb86c' }),
      ]),
    );

    rerender(
      <EditorArea
        tabs={[{ id: 'scripts/common.mk', name: 'common.mk' }]}
        activeTabId="scripts/common.mk"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('scripts/common.mk', 'utf-8');
    });
    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'makefile');
  });

  it('configures monaco, loads file content, reacts to cursor changes, and jumps to the target line', async () => {
    const onCursorChange = vi.fn();
    const editorRef = createRef<any>();

    render(
      <EditorArea
        tabs={[{ id: 'rtl/tb/tb_cpu_top.sv', name: 'tb_cpu_top.sv' }]}
        activeTabId="rtl/tb/tb_cpu_top.sv"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={editorRef}
        jumpToLine={24}
        onCursorChange={onCursorChange}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('rtl/tb/tb_cpu_top.sv', 'utf-8');
    });

    expect(await screen.findByTestId('monaco-editor')).toHaveAttribute('data-language', 'systemverilog');
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getAllByText('tb_cpu_top.sv')).toHaveLength(2);
    expect(mockMonaco.languages.register).toHaveBeenCalled();
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledTimes(9);
    expect(mockMonaco.editor.defineTheme).toHaveBeenCalled();
    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      expect.objectContaining({
        getLineCount: expect.any(Function),
        getLineMaxColumn: expect.any(Function),
      }),
      'slang-lsp',
      [],
    );
    expect(onCursorChange).toHaveBeenCalledWith(12, 7);
    expect(editorRef.current).toBe(mockEditorInstance);
    await waitFor(() => {
      expect(mockEditorInstance.revealLineInCenter).toHaveBeenCalledWith(24);
      expect(mockEditorInstance.setPosition).toHaveBeenCalledWith({ lineNumber: 24, column: 1 });
      expect(mockEditorInstance.focus).toHaveBeenCalled();
    });
  });

  it('places the cursor at line 1 column 1 when a file is opened without saved position', async () => {
    render(
      <EditorArea
        tabs={[{ id: 'rtl/core/reg_file.v', name: 'reg_file.v', isPinned: true }]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        contentCache={{ 'rtl/core/reg_file.v': 'module reg_file;\nendmodule\n' }}
      />,
    );

    await screen.findByTestId('monaco-editor');

    await waitFor(() => {
      expect(mockEditorInstance.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 });
      expect(mockEditorInstance.focus).toHaveBeenCalled();
    });
  });

  it('restores the saved cursor position after the active file content becomes ready', async () => {
    const onLoadFile = vi.fn();
    const editorRef = createRef<any>();

    const { rerender } = render(
      <EditorArea
        tabs={[{ id: 'rtl/core/reg_file.v', name: 'reg_file.v', isPinned: true }]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={editorRef}
        cursorPosition={{ line: 18, col: 6 }}
        loadingFiles={{ 'rtl/core/reg_file.v': true }}
        onLoadFile={onLoadFile}
      />,
    );

    expect(screen.getByTestId('editor-document-placeholder')).toHaveTextContent('Loading file contents...');
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
    expect(onLoadFile).toHaveBeenCalledWith('rtl/core/reg_file.v');
    expect(mockEditorInstance.setPosition).not.toHaveBeenCalledWith({ lineNumber: 18, column: 6 });

    rerender(
      <EditorArea
        tabs={[{ id: 'rtl/core/reg_file.v', name: 'reg_file.v', isPinned: true }]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={editorRef}
        cursorPosition={{ line: 18, col: 6 }}
        contentCache={{ 'rtl/core/reg_file.v': 'line 1\nline 2\nline 3\n' }}
        onLoadFile={onLoadFile}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('editor-document-placeholder')).not.toBeInTheDocument();
      expect(mockEditorInstance.setPosition).toHaveBeenCalledWith({ lineNumber: 18, column: 6 });
    });
    expect(mockEditorInstance.focus).toHaveBeenCalled();
  });

  it('applies and consumes an explicit cursor restore request for the active file', async () => {
    const onCursorRestoreRequestConsumed = vi.fn();

    render(
      <EditorArea
        tabs={[{ id: 'rtl/core/reg_file.v', name: 'reg_file.v', isPinned: true }]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        contentCache={{ 'rtl/core/reg_file.v': 'module reg_file;\nendmodule\n' }}
        cursorRestoreRequest={{
          groupId: 'group-1',
          fileId: 'rtl/core/reg_file.v',
          line: 33,
          col: 4,
          token: 7,
        }}
        onCursorRestoreRequestConsumed={onCursorRestoreRequestConsumed}
      />,
    );

    await screen.findByTestId('monaco-editor');

    await waitFor(() => {
      expect(mockEditorInstance.setPosition).toHaveBeenCalledWith({ lineNumber: 33, column: 4 });
      expect(onCursorRestoreRequestConsumed).toHaveBeenCalledWith(7);
    });
  });

  it('keeps Dracula token styling for linker script and file list syntax categories', async () => {
    render(
      <EditorArea
        tabs={[{ id: 'linker/startup.ld', name: 'startup.ld' }]}
        activeTabId="linker/startup.ld"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('linker/startup.ld', 'utf-8');
    });

    await waitFor(() => {
      expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('linker-script', expect.any(Object));
      expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith('filelist', expect.any(Object));
    });

    const linkerProviderCall = mockMonaco.languages.setMonarchTokensProvider.mock.calls.find(
      ([languageId, provider]) => languageId === 'linker-script' && Boolean((provider as any).tokenizer),
    );
    const linkerProvider = linkerProviderCall?.[1] as any;
    expect(linkerProvider.tokenizer.root).toEqual(
      expect.arrayContaining([
        [/[A-Za-z_][\w.]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      ]),
    );

    const filelistProviderCall = mockMonaco.languages.setMonarchTokensProvider.mock.calls.find(
      ([languageId, provider]) => languageId === 'filelist' && Boolean((provider as any).tokenizer),
    );
    expect(filelistProviderCall).toBeDefined();

    expect(draculaThemeDefinition.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: 'keyword', foreground: 'ff79c6' }),
        expect.objectContaining({ token: 'comment', foreground: '6272a4' }),
        expect.objectContaining({ token: 'string', foreground: 'f1fa8c' }),
        expect.objectContaining({ token: 'variable', foreground: 'ffb86c' }),
        expect.objectContaining({ token: 'type', foreground: '8be9fd' }),
      ]),
    );
  });

  it('does not get stuck in loading when switching away from a file before its first read completes', async () => {
    let resolveFirstRead: ((content: string) => void) | undefined;

    vi.mocked(window.electronAPI!.fs.readFile)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstRead = resolve;
      }))
      .mockResolvedValueOnce('// alu content');

    const { rerender } = render(
      <EditorArea
        tabs={[
          { id: 'rtl/core/cpu_top.v', name: 'cpu_top.v' },
          { id: 'rtl/core/alu.v', name: 'alu.v' },
        ]}
        activeTabId="rtl/core/cpu_top.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('rtl/core/cpu_top.v', 'utf-8');
    });

    rerender(
      <EditorArea
        tabs={[
          { id: 'rtl/core/cpu_top.v', name: 'cpu_top.v' },
          { id: 'rtl/core/alu.v', name: 'alu.v' },
        ]}
        activeTabId="rtl/core/alu.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI!.fs.readFile).toHaveBeenCalledWith('rtl/core/alu.v', 'utf-8');
    });

    rerender(
      <EditorArea
        tabs={[
          { id: 'rtl/core/cpu_top.v', name: 'cpu_top.v' },
          { id: 'rtl/core/alu.v', name: 'alu.v' },
        ]}
        activeTabId="rtl/core/cpu_top.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
      />,
    );

    expect(screen.getByTestId('editor-document-placeholder')).toHaveTextContent('Loading file contents...');
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();

    resolveFirstRead?.('// cpu_top content');

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveTextContent('// cpu_top content');
    });
  });

  it('keeps loading placeholders out of the Monaco document until file content is ready', async () => {
    const { rerender } = render(
      <EditorArea
        tabs={[{ id: 'rtl/core/reg_file.v', name: 'reg_file.v', isPinned: true }]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        onLoadFile={vi.fn()}
      />,
    );

    expect(screen.getByTestId('editor-document-placeholder')).toHaveTextContent('Loading file contents...');
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();

    rerender(
      <EditorArea
        tabs={[{ id: 'rtl/core/reg_file.v', name: 'reg_file.v', isPinned: true }]}
        activeTabId="rtl/core/reg_file.v"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        contentCache={{ 'rtl/core/reg_file.v': 'module reg_file; endmodule' }}
        onLoadFile={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveTextContent('module reg_file; endmodule');
    });
  });

  it('renders breadcrumb and document content from the resolved saved path after an untitled tab is renamed', async () => {
    render(
      <EditorArea
        tabs={[{ id: 'untitled-1', name: 'generated.sv', isPinned: true }]}
        activeTabId="untitled-1"
        documentTabId="rtl/core/generated.sv"
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        contentCache={{ 'rtl/core/generated.sv': 'module generated; endmodule' }}
      />,
    );

    expect(screen.getByTestId('editor-breadcrumb')).toHaveTextContent('Project');
    expect(screen.getByTestId('editor-breadcrumb')).toHaveTextContent('rtl');
    expect(screen.getByTestId('editor-breadcrumb')).toHaveTextContent('core');
    expect(screen.getByTestId('editor-breadcrumb')).toHaveTextContent('generated.sv');

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveTextContent('module generated; endmodule');
    });
  });

  it('renders the active modified file git diff summary at the end of the breadcrumb', async () => {
    const filePath = 'rtl/core/reg_file.v';
    const currentContent = 'module reg_file;\nassign ready = valid;\nassign extra = 1\'b1;\nendmodule';
    mockWorkspaceGitStatus.pathStates = { [filePath]: 'modified' };
    vi.mocked(window.electronAPI!.git.getFileDiff).mockResolvedValue({
      filePath,
      originalContent: 'module reg_file;\nassign ready = done;\nendmodule',
      currentContent,
    });

    render(
      <EditorArea
        tabs={[{ id: filePath, name: 'reg_file.v', isPinned: true }]}
        activeTabId={filePath}
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        contentCache={{ [filePath]: currentContent }}
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI?.git.getFileDiff).toHaveBeenCalledWith(filePath);
    });

    await waitFor(() => {
      expect(screen.getByTestId('editor-breadcrumb-git-diff-summary')).toBeInTheDocument();
    });

    const summary = screen.getByTestId('editor-breadcrumb-git-diff-summary');
    expect(screen.getByTestId('editor-breadcrumb-git-indicator-modified')).toHaveClass('text-ide-warning');
    expect(screen.getByTestId('editor-breadcrumb-git-diff-removed')).toHaveTextContent('-1');
    expect(screen.getByTestId('editor-breadcrumb-git-diff-removed')).toHaveClass('text-ide-error');
    expect(screen.getByTestId('editor-breadcrumb-git-diff-added')).toHaveTextContent('+2');
    expect(screen.getByTestId('editor-breadcrumb-git-diff-added')).toHaveClass('text-ide-success');
    expect(summary.style.fontFamily).toBe(getMonacoEditorFontFamilyStack('jetbrains-mono'));
    expect(summary.style.fontSize).toBe('13px');
  });

  it('renders the active created file git diff summary at the end of the breadcrumb', async () => {
    const filePath = 'rtl/core/created_auto.v';
    const currentContent = 'module created_auto;\nassign ready = 1\'b1;\nendmodule';
    mockWorkspaceGitStatus.pathStates = { [filePath]: 'created' };

    render(
      <EditorArea
        tabs={[{ id: filePath, name: 'created_auto.v', isPinned: true }]}
        activeTabId={filePath}
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        contentCache={{ [filePath]: currentContent }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('editor-breadcrumb-git-diff-summary')).toBeInTheDocument();
    });

    const summary = screen.getByTestId('editor-breadcrumb-git-diff-summary');
    expect(window.electronAPI?.git.getFileDiff).not.toHaveBeenCalled();
    expect(screen.getByTestId('editor-breadcrumb-git-indicator-created')).toHaveClass('text-ide-success');
    expect(screen.queryByTestId('editor-breadcrumb-git-diff-removed')).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-breadcrumb-git-diff-added')).toHaveTextContent('+3');
    expect(screen.getByTestId('editor-breadcrumb-git-diff-added')).toHaveClass('text-ide-success');
    expect(summary.style.fontFamily).toBe(getMonacoEditorFontFamilyStack('jetbrains-mono'));
    expect(summary.style.fontSize).toBe('13px');
  });

  it('restores the active created file git diff summary after switching away and back', async () => {
    const filePath = 'rtl/core/created_auto.v';
    const otherFilePath = 'rtl/core/reg_file.v';
    const currentContent = 'module created_auto;\nassign ready = 1\'b1;\nendmodule';
    const otherContent = 'module reg_file; endmodule';
    const tabs = [
      { id: filePath, name: 'created_auto.v', isPinned: true },
      { id: otherFilePath, name: 'reg_file.v', isPinned: true },
    ];
    const editorRef = createRef<any>();
    mockWorkspaceGitStatus.pathStates = { [filePath]: 'created' };

    const { rerender } = render(
      <EditorArea
        tabs={tabs}
        activeTabId={filePath}
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={editorRef}
        contentCache={{ [filePath]: currentContent, [otherFilePath]: otherContent }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('editor-breadcrumb-git-indicator-created')).toBeInTheDocument();
    });
    expect(screen.getByTestId('editor-breadcrumb-git-diff-added')).toHaveTextContent('+3');

    rerender(
      <EditorArea
        tabs={tabs}
        activeTabId={otherFilePath}
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={editorRef}
        contentCache={{ [filePath]: currentContent, [otherFilePath]: otherContent }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('editor-breadcrumb-git-diff-summary')).not.toBeInTheDocument();
    });

    rerender(
      <EditorArea
        tabs={tabs}
        activeTabId={filePath}
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={editorRef}
        contentCache={{ [filePath]: currentContent, [otherFilePath]: otherContent }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('editor-breadcrumb-git-indicator-created')).toBeInTheDocument();
    });
    expect(screen.getByTestId('editor-breadcrumb-git-diff-added')).toHaveTextContent('+3');
    expect(screen.queryByTestId('editor-breadcrumb-git-diff-removed')).not.toBeInTheDocument();
    expect(window.electronAPI?.git.getFileDiff).not.toHaveBeenCalled();
  });

  it('does not render breadcrumb git diff summary for unmodified files', async () => {
    const filePath = 'rtl/core/reg_file.v';

    render(
      <EditorArea
        tabs={[{ id: filePath, name: 'reg_file.v', isPinned: true }]}
        activeTabId={filePath}
        onTabChange={vi.fn()}
        onTabClose={vi.fn()}
        editorRef={createRef()}
        contentCache={{ [filePath]: 'module reg_file; endmodule' }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveTextContent('module reg_file; endmodule');
    });

    expect(screen.queryByTestId('editor-breadcrumb-git-diff-summary')).not.toBeInTheDocument();
    expect(window.electronAPI?.git.getFileDiff).not.toHaveBeenCalled();
  });
});
