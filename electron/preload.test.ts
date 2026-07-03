import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExposeInMainWorld, mockSendSync, mockInvoke, mockOn, mockRemoveListener } = vi.hoisted(() => ({
  mockExposeInMainWorld: vi.fn(),
  mockSendSync: vi.fn((channel: string, ...args: unknown[]) => {
    if (channel === 'sync:window:is-maximized') {
      return true;
    }
    if (channel === 'sync:window:is-full-screen') {
      return false;
    }
    if (channel === 'sync:config:get') {
      return args[0] === 'theme' ? 'dracula' : null;
    }
    return null;
  }),
  mockInvoke: vi.fn(),
  mockOn: vi.fn(),
  mockRemoveListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => mockExposeInMainWorld(name, api),
  },
  ipcRenderer: {
    sendSync: (channel: string, ...args: unknown[]) => mockSendSync(channel, ...args),
    invoke: (channel: string, ...args: unknown[]) => mockInvoke(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void) => mockOn(channel, listener),
    removeListener: (channel: string, listener: (...args: unknown[]) => void) =>
      mockRemoveListener(channel, listener),
  },
}));

async function importPreload() {
  vi.resetModules();
  await import('./preload.ts');
}

describe('preload bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a typed electronAPI bridge in the renderer world', async () => {
    await importPreload();

    expect(mockExposeInMainWorld).toHaveBeenCalledTimes(1);
    const [, api] = mockExposeInMainWorld.mock.calls[0];

    expect(mockSendSync).not.toHaveBeenCalledWith('sync:platform');
    expect(api.platform).toBe(process.platform);
    expect(api.arch).toBe(process.arch);
    expect(api.versions.electron).toBe(process.versions.electron);
    expect(api.isMaximized()).toBe(true);
    expect(api.isFullScreen()).toBe(false);
    expect(api.config.get('theme')).toBe('dracula');
  });

  it('forwards async invocations and stream subscriptions through ipcRenderer', async () => {
    await importPreload();

    const [, api] = mockExposeInMainWorld.mock.calls[0];
    const onMaximizedChange = vi.fn();
    const onFullScreenChange = vi.fn();
    const onCloseRequested = vi.fn();
    const onWindowFocus = vi.fn();
    const onWorkspaceChange = vi.fn();
    const onStdout = vi.fn();
    const onStderr = vi.fn();
    const onShellExit = vi.fn();
    const onTerminalData = vi.fn();
    const onTerminalExit = vi.fn();
    const onLspDebug = vi.fn();
    const onLspDiagnostics = vi.fn();
    const onLspState = vi.fn();
    const onMenuCommand = vi.fn();
    const onNotificationsHistoryChanged = vi.fn();

    api.minimize();
    api.maximize();
    api.show();
    api.hide();
    api.close();
    api.markWorkspaceReady();
    api.resolveCloseRequest(3, 'proceed');
    api.setFloatingInfoWindowVisible(true);
    api.setFloatingInfoWindowExpanded(true);
    api.setFloatingInfoWindowMode('detail');
    api.gpu.getDiagnostics();
    api.dialog.showSaveDialog('untitled-1');
    api.dialog.showOpenProjectDirectoryDialog();
    api.project.updateProjectConfig({
      mgnt: 'none',
      mode: 'rtl2gds',
      padframe: 'QFN32',
      process: 'ics55',
      type: 'retroSoC',
    });
    api.fs.readFile('src/main.v', 'utf-8');
    api.fs.readFileAbsolute('C:/external/main.v', 'utf-8');
    api.fs.listFiles('rtl');
    api.fs.writeFile('rtl/main.v', 'module main; endmodule');
    api.fs.writeFileAbsolute('C:/external/main.v', 'module external; endmodule');
    api.fs.createDirectory('rtl/generated');
    api.fs.deleteFile('rtl/main.v');
    api.fs.deleteDirectory('rtl/generated');
    api.fs.rename('rtl/core/old.v', 'rtl/core/new.v');
    api.fs.readDir('rtl');
    api.fs.stat('rtl/main.v');
    api.fs.exists('rtl/main.v');
    api.git.getStatus();
    api.shell.exec('make', ['lint'], { cwd: 'rtl' });
    api.shell.kill('shell-1');
    api.terminal.create({ cwd: 'rtl', cols: 120, rows: 40, profile: 'wsl-pristine-eda' });
    api.terminal.write('terminal-1', 'help');
    api.terminal.resize('terminal-1', 160, 50);
    api.terminal.kill('terminal-1');
    api.wsl.startPristineEdaEnvironment({ ubuntuDistro: 'Ubuntu-24.04' });
    api.wsl.stopPristineEdaEnvironment();
    api.wsl.getPristineEdaEnvironmentStatus();
    api.lsp.ensureInitialized();
    api.lsp.openDocument('rtl/core/cpu_top.sv', 'systemverilog', 'module cpu_top; endmodule');
    api.lsp.changeDocument('rtl/core/cpu_top.sv', 'module cpu_top; logic a; endmodule');
    api.lsp.closeDocument('rtl/core/cpu_top.sv');
    api.lsp.completion('rtl/core/cpu_top.sv', 4, 6, '.', 2);
    api.lsp.completionResolve({ label: 'data_ready' });
    api.lsp.hover('rtl/core/cpu_top.sv', 4, 6);
    api.lsp.definition('rtl/core/cpu_top.sv', 4, 6);
    api.lsp.typeDefinition('rtl/core/cpu_top.sv', 4, 6);
    api.lsp.implementation('rtl/core/cpu_top.sv', 4, 6);
    api.lsp.documentHighlights('rtl/core/cpu_top.sv', 4, 6);
    api.lsp.documentLinks('rtl/core/cpu_top.sv');
    api.lsp.inlayHints('rtl/core/cpu_top.sv', {
      start: { line: 0, character: 0 },
      end: { line: 10, character: 0 },
    });
    api.lsp.codeActions('rtl/core/cpu_top.sv', {
      start: { line: 0, character: 0 },
      end: { line: 1, character: 0 },
    });
    api.lsp.foldingRanges('rtl/core/cpu_top.sv');
    api.lsp.semanticTokensFull('rtl/core/cpu_top.sv');
    api.lsp.selectionRanges('rtl/core/cpu_top.sv', [{ line: 4, character: 6 }]);
    api.lsp.signatureHelp('rtl/core/cpu_top.sv', 4, 6, '(', 2, false);
    api.lsp.documentSymbols('rtl/core/cpu_top.sv');
    api.lsp.references('rtl/core/cpu_top.sv', 4, 6, false);
    api.lsp.prepareCallHierarchy('rtl/core/cpu_top.sv', 4, 6);
    api.lsp.callHierarchyIncoming({
      name: 'cpu_top',
      kind: 2,
      uri: 'file:///workspace/rtl/core/cpu_top.sv',
      range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
      selectionRange: { start: { line: 0, character: 7 }, end: { line: 0, character: 14 } },
    });
    api.lsp.callHierarchyOutgoing({
      name: 'cpu_top',
      kind: 2,
      uri: 'file:///workspace/rtl/core/cpu_top.sv',
      range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
      selectionRange: { start: { line: 0, character: 7 }, end: { line: 0, character: 14 } },
    });
    api.lsp.workspaceSymbols('cpu');
    api.lsp.prepareRename('rtl/core/cpu_top.sv', 4, 6);
    api.lsp.rename('rtl/core/cpu_top.sv', 4, 6, 'valid');
    api.lsp.outline('rtl/core/cpu_top.sv', { maxDepth: 8, limit: 2000 });
    api.lsp.moduleHierarchy({ maxDepth: 12 });
    api.lsp.schematic({ moduleName: 'cpu_top', maxDepth: 12 });
    api.lsp.layoutOpen({ title: 'sg13g2_stdcell.lef' });
    api.lsp.layoutStatus('layout-1');
    api.lsp.layoutCatalogSummary('layout-1');
    api.lsp.layoutCatalogPage({ sessionId: 'layout-1', tableKind: 'cells', offset: 0, limit: 32 });
    api.lsp.layoutGeometry({ sessionId: 'layout-1', maxShapes: 1024 });
    api.lsp.layoutTileGeometry({ sessionId: 'layout-1', rootCellIndex: 0, maxShapes: 1000 });
    api.lsp.layoutClose('layout-1');
    api.lsp.getDebugEvents();
    api.notices.revealBundledFiles();
    api.notifications.publish({ level: 'info', title: 'Info notification', body: 'hello' });
    api.notifications.dismiss('notification-1');
    api.notifications.getHistory();
    api.auth.openAccountPage('login');
    api.auth.getSession();
    api.auth.signOut();
    api.auth.syncCloudConfig();
    api.config.set('theme', 'dracula');

    const dispose = api.onMaximizedChange(onMaximizedChange);
    const disposeFullScreen = api.onFullScreenChange(onFullScreenChange);
    const disposeCloseRequest = api.onCloseRequested(onCloseRequested);
    const disposeWindowFocus = api.onWindowFocus(onWindowFocus);
    const disposeWorkspaceChange = api.onWorkspaceChange(onWorkspaceChange);
    const disposeStdout = api.shell.onStdout(onStdout);
    const disposeStderr = api.shell.onStderr(onStderr);
    const disposeShellExit = api.shell.onExit(onShellExit);
    const disposeTerminalData = api.terminal.onData(onTerminalData);
    const disposeTerminalExit = api.terminal.onExit(onTerminalExit);
    const disposeLspDebug = api.lsp.onDebug(onLspDebug);
    const disposeLspDiagnostics = api.lsp.onDiagnostics(onLspDiagnostics);
    const disposeLspState = api.lsp.onState(onLspState);
    const disposeMenuCommand = api.menu.onCommand(onMenuCommand);
    const disposeNotificationsHistory = api.notifications.onHistoryChanged(onNotificationsHistoryChanged);
    const onAuthStateChanged = vi.fn();
    const onAuthError = vi.fn();
    const onConfigChange = vi.fn();
    const disposeAuthState = api.auth.onStateChanged(onAuthStateChanged);
    const disposeAuthError = api.auth.onError(onAuthError);
    const disposeConfigChange = api.config.onDidChange(onConfigChange);

    expect(mockInvoke).toHaveBeenCalledWith('async:window:minimize');
    expect(mockInvoke).toHaveBeenCalledWith('async:window:maximize');
    expect(mockInvoke).toHaveBeenCalledWith('async:window:show');
    expect(mockInvoke).toHaveBeenCalledWith('async:window:hide');
    expect(mockInvoke).toHaveBeenCalledWith('async:window:close');
    expect(mockInvoke).toHaveBeenCalledWith('async:window:mark-workspace-ready');
    expect(mockInvoke).toHaveBeenCalledWith('async:window:resolve-close-request', 3, 'proceed');
    expect(mockInvoke).toHaveBeenCalledWith('async:window:set-floating-info-visibility', true);
    expect(mockInvoke).toHaveBeenCalledWith('async:window:set-floating-info-expanded', true);
    expect(mockInvoke).toHaveBeenCalledWith('async:window:set-floating-info-mode', 'detail');
    expect(mockInvoke).toHaveBeenCalledWith('async:platform:get-gpu-diagnostics');
    expect(mockInvoke).toHaveBeenCalledWith('async:dialog:show-save', 'untitled-1');
    expect(mockInvoke).toHaveBeenCalledWith('async:dialog:show-open-project-directory');
    expect(mockInvoke).toHaveBeenCalledWith('async:project:update-config', {
      mgnt: 'none',
      mode: 'rtl2gds',
      padframe: 'QFN32',
      process: 'ics55',
      type: 'retroSoC',
    });
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:read-file', 'src/main.v', 'utf-8');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:read-file-absolute', 'C:/external/main.v', 'utf-8');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:list-files', 'rtl');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:write-file', 'rtl/main.v', 'module main; endmodule');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:write-file-absolute', 'C:/external/main.v', 'module external; endmodule');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:create-directory', 'rtl/generated');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:delete-file', 'rtl/main.v');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:delete-directory', 'rtl/generated');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:rename', 'rtl/core/old.v', 'rtl/core/new.v');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:read-dir', 'rtl');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:stat', 'rtl/main.v');
    expect(mockInvoke).toHaveBeenCalledWith('async:fs:exists', 'rtl/main.v');
    expect(mockInvoke).toHaveBeenCalledWith('async:git:get-status');
    expect(mockInvoke).toHaveBeenCalledWith('async:shell:exec', 'make', ['lint'], { cwd: 'rtl' });
    expect(mockInvoke).toHaveBeenCalledWith('async:shell:kill', 'shell-1');
    expect(mockInvoke).toHaveBeenCalledWith('async:terminal:create', { cwd: 'rtl', cols: 120, rows: 40, profile: 'wsl-pristine-eda' });
    expect(mockInvoke).toHaveBeenCalledWith('async:terminal:write', 'terminal-1', 'help');
    expect(mockInvoke).toHaveBeenCalledWith('async:terminal:resize', 'terminal-1', 160, 50);
    expect(mockInvoke).toHaveBeenCalledWith('async:terminal:kill', 'terminal-1');
    expect(mockInvoke).toHaveBeenCalledWith('async:wsl:start-pristine-eda-environment', { ubuntuDistro: 'Ubuntu-24.04' });
    expect(mockInvoke).toHaveBeenCalledWith('async:wsl:stop-pristine-eda-environment');
    expect(mockInvoke).toHaveBeenCalledWith('async:wsl:get-pristine-eda-environment-status');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:ensure-initialized');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:open-document', 'rtl/core/cpu_top.sv', 'systemverilog', 'module cpu_top; endmodule');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:change-document', 'rtl/core/cpu_top.sv', 'module cpu_top; logic a; endmodule');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:close-document', 'rtl/core/cpu_top.sv');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:completion', 'rtl/core/cpu_top.sv', 4, 6, '.', 2);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:completion-resolve', { label: 'data_ready' });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:hover', 'rtl/core/cpu_top.sv', 4, 6);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:definition', 'rtl/core/cpu_top.sv', 4, 6);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:type-definition', 'rtl/core/cpu_top.sv', 4, 6);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:implementation', 'rtl/core/cpu_top.sv', 4, 6);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:document-highlights', 'rtl/core/cpu_top.sv', 4, 6);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:document-links', 'rtl/core/cpu_top.sv');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:inlay-hints', 'rtl/core/cpu_top.sv', {
      start: { line: 0, character: 0 },
      end: { line: 10, character: 0 },
    });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:code-actions', 'rtl/core/cpu_top.sv', {
      start: { line: 0, character: 0 },
      end: { line: 1, character: 0 },
    }, []);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:folding-ranges', 'rtl/core/cpu_top.sv');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:semantic-tokens-full', 'rtl/core/cpu_top.sv');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:selection-ranges', 'rtl/core/cpu_top.sv', [{ line: 4, character: 6 }]);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:signature-help', 'rtl/core/cpu_top.sv', 4, 6, '(', 2, false);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:document-symbols', 'rtl/core/cpu_top.sv');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:references', 'rtl/core/cpu_top.sv', 4, 6, false);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:prepare-call-hierarchy', 'rtl/core/cpu_top.sv', 4, 6);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:workspace-symbols', 'cpu');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:prepare-rename', 'rtl/core/cpu_top.sv', 4, 6);
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:rename', 'rtl/core/cpu_top.sv', 4, 6, 'valid');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:outline', 'rtl/core/cpu_top.sv', { maxDepth: 8, limit: 2000 });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:module-hierarchy', { maxDepth: 12 });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:schematic', { moduleName: 'cpu_top', maxDepth: 12 });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:layout-open', { title: 'sg13g2_stdcell.lef' });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:layout-status', 'layout-1');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:layout-catalog-summary', 'layout-1');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:layout-catalog-page', {
      sessionId: 'layout-1',
      tableKind: 'cells',
      offset: 0,
      limit: 32,
    });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:layout-geometry', { sessionId: 'layout-1', maxShapes: 1024 });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:layout-tile-geometry', {
      sessionId: 'layout-1',
      rootCellIndex: 0,
      maxShapes: 1000,
    });
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:layout-close', 'layout-1');
    expect(mockInvoke).toHaveBeenCalledWith('async:lsp:get-debug-events');
    expect(mockInvoke).toHaveBeenCalledWith('async:notices:reveal-bundled-files');
    expect(mockInvoke).toHaveBeenCalledWith('async:notifications:publish', { level: 'info', title: 'Info notification', body: 'hello' });
    expect(mockInvoke).toHaveBeenCalledWith('async:notifications:dismiss', 'notification-1');
    expect(mockInvoke).toHaveBeenCalledWith('async:notifications:get-history');
    expect(mockInvoke).toHaveBeenCalledWith('async:auth:open-account-page', 'login');
    expect(mockInvoke).toHaveBeenCalledWith('async:auth:get-session');
    expect(mockInvoke).toHaveBeenCalledWith('async:auth:sign-out');
    expect(mockInvoke).toHaveBeenCalledWith('async:auth:sync-config');
    expect(mockInvoke).toHaveBeenCalledWith('async:config:set', 'theme', 'dracula');
    expect(mockOn).toHaveBeenCalledWith('stream:window:maximized-change', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:window:full-screen-change', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:window:close-request', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:window:focus', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:workspace:change', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:shell:stdout', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:shell:stderr', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:shell:exit', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:terminal:data', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:terminal:exit', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:lsp:debug', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:lsp:diagnostics', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:lsp:state', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:menu:command', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:notifications:history-changed', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:auth:state-changed', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:auth:error', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('stream:config:changed', expect.any(Function));

    const handler = mockOn.mock.calls.find((call) => call[0] === 'stream:window:maximized-change')?.[1];
    handler({}, true);
    expect(onMaximizedChange).toHaveBeenCalledWith(true);

    const fullScreenHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:window:full-screen-change')?.[1];
    fullScreenHandler({}, true);
    expect(onFullScreenChange).toHaveBeenCalledWith(true);

    const closeRequestHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:window:close-request')?.[1];
    closeRequestHandler({}, { requestId: 8, action: 'tray' });
    expect(onCloseRequested).toHaveBeenCalledWith({ requestId: 8, action: 'tray' });

    const focusHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:window:focus')?.[1];
    focusHandler({});
    expect(onWindowFocus).toHaveBeenCalledTimes(1);

    const workspaceChangeHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:workspace:change')?.[1];
    workspaceChangeHandler({}, { refreshGitStatus: true, refreshWorkspaceTree: true });
    expect(onWorkspaceChange).toHaveBeenCalledWith({ refreshGitStatus: true, refreshWorkspaceTree: true });

    const notificationsHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:notifications:history-changed')?.[1];
    notificationsHandler({}, [{ id: 'notification-1', level: 'info', title: 'Info', body: '', createdAt: 1, expiresAt: 2, variant: 'standard' }]);
    expect(onNotificationsHistoryChanged).toHaveBeenCalledWith([
      { id: 'notification-1', level: 'info', title: 'Info', body: '', createdAt: 1, expiresAt: 2, variant: 'standard' },
    ]);

    const stdoutHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:shell:stdout')?.[1];
    stdoutHandler({}, { id: 'shell-1', data: 'ok' });
    expect(onStdout).toHaveBeenCalledWith({ id: 'shell-1', data: 'ok' });

    const stderrHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:shell:stderr')?.[1];
    stderrHandler({}, { id: 'shell-1', data: 'warn' });
    expect(onStderr).toHaveBeenCalledWith({ id: 'shell-1', data: 'warn' });

    const shellExitHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:shell:exit')?.[1];
    shellExitHandler({}, { id: 'shell-1', code: 0, error: undefined });
    expect(onShellExit).toHaveBeenCalledWith({ id: 'shell-1', code: 0, error: undefined });

    const terminalDataHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:terminal:data')?.[1];
    terminalDataHandler({}, { id: 'terminal-1', data: 'prompt' });
    expect(onTerminalData).toHaveBeenCalledWith({ id: 'terminal-1', data: 'prompt' });

    const terminalExitHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:terminal:exit')?.[1];
    terminalExitHandler({}, { id: 'terminal-1', exitCode: 0, signal: 15 });
    expect(onTerminalExit).toHaveBeenCalledWith({ id: 'terminal-1', exitCode: 0, signal: 15 });

    const debugHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:lsp:debug')?.[1];
    debugHandler({}, { sequence: 1, timestamp: '2026-01-01T00:00:00.000Z', direction: 'session', kind: 'lifecycle', status: 'ready' });
    expect(onLspDebug).toHaveBeenCalledWith({ sequence: 1, timestamp: '2026-01-01T00:00:00.000Z', direction: 'session', kind: 'lifecycle', status: 'ready' });

    const diagnosticsHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:lsp:diagnostics')?.[1];
    diagnosticsHandler({}, { filePath: 'rtl/core/cpu_top.sv', diagnostics: [] });
    expect(onLspDiagnostics).toHaveBeenCalledWith({ filePath: 'rtl/core/cpu_top.sv', diagnostics: [] });

    const lspStateHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:lsp:state')?.[1];
    lspStateHandler({}, { status: 'ready' });
    expect(onLspState).toHaveBeenCalledWith({ status: 'ready' });

    const menuCommandHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:menu:command')?.[1];
    menuCommandHandler({}, { action: 'open-settings' });
    expect(onMenuCommand).toHaveBeenCalledWith({ action: 'open-settings' });

    const authStateHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:auth:state-changed')?.[1];
    authStateHandler({}, { userId: 'user-1', username: 'Alice', email: 'alice@example.com', avatarUrl: null, syncedAt: null });
    expect(onAuthStateChanged).toHaveBeenCalledWith({ userId: 'user-1', username: 'Alice', email: 'alice@example.com', avatarUrl: null, syncedAt: null });

    const authErrorHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:auth:error')?.[1];
    authErrorHandler({}, 'Unable to sign in');
    expect(onAuthError).toHaveBeenCalledWith('Unable to sign in');

    const configChangedHandler = mockOn.mock.calls.find((call) => call[0] === 'stream:config:changed')?.[1];
    configChangedHandler({}, { key: 'ui.theme', value: 'dark' });
    expect(onConfigChange).toHaveBeenCalledWith('ui.theme', 'dark');

    dispose();
    disposeFullScreen();
    disposeCloseRequest();
    disposeWindowFocus();
    disposeWorkspaceChange();
    disposeStdout();
    disposeStderr();
    disposeShellExit();
    disposeTerminalData();
    disposeTerminalExit();
    disposeLspDebug();
    disposeLspDiagnostics();
    disposeLspState();
    disposeMenuCommand();
    disposeNotificationsHistory();
    disposeAuthState();
    disposeAuthError();
    disposeConfigChange();
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:window:maximized-change', handler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:window:full-screen-change', fullScreenHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:window:close-request', closeRequestHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:window:focus', focusHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:workspace:change', workspaceChangeHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:shell:stdout', stdoutHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:shell:stderr', stderrHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:shell:exit', shellExitHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:terminal:data', terminalDataHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:terminal:exit', terminalExitHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:lsp:debug', debugHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:lsp:diagnostics', diagnosticsHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:lsp:state', lspStateHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:menu:command', menuCommandHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:auth:state-changed', authStateHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:auth:error', authErrorHandler);
    expect(mockRemoveListener).toHaveBeenCalledWith('stream:config:changed', configChangedHandler);
  });
});
