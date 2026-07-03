import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type BrowserWindowInstance = {
  options: Record<string, unknown>;
  loadURL: Mock<(url: string) => void>;
  loadFile: Mock<(filePath: string) => void>;
  getBounds: Mock<() => { x: number; y: number; width: number; height: number }>;
  getNormalBounds: Mock<() => { x: number; y: number; width: number; height: number }>;
  setBounds: Mock<(bounds: { x: number; y: number; width: number; height: number }, animate?: boolean) => void>;
  maximize: Mock<() => void>;
  unmaximize: Mock<() => void>;
  isMaximized: Mock<() => boolean>;
  webContents: {
    send: Mock<(channel: string, ...args: unknown[]) => void>;
    isDestroyed: Mock<() => boolean>;
  };
  on: Mock<(event: string, handler: (...args: unknown[]) => void) => BrowserWindowInstance>;
  once: Mock<(event: string, handler: (...args: unknown[]) => void) => BrowserWindowInstance>;
  show: Mock<() => void>;
  hide: Mock<() => void>;
  focus: Mock<() => void>;
  setAlwaysOnTop: Mock<(flag: boolean, level?: string) => void>;
  restore: Mock<() => void>;
  isMinimized: Mock<() => boolean>;
  isVisible: Mock<() => boolean>;
  isDestroyed: Mock<() => boolean>;
  close: Mock<() => void>;
  emit: (event: string, ...args: unknown[]) => void;
};

type TrayInstance = {
  icon: unknown;
  setToolTip: Mock<(tooltip: string) => void>;
  setContextMenu: Mock<(menu: unknown) => void>;
  popUpContextMenu: Mock<(menu?: unknown) => void>;
  on: Mock<(event: string, handler: (...args: unknown[]) => void) => TrayInstance>;
  destroy: Mock<() => void>;
  emit: (event: string, ...args: unknown[]) => void;
};

const mocks = vi.hoisted(() => {
  const appHandlers = new Map<string, (...args: unknown[]) => void>();
  const browserWindowInstances: BrowserWindowInstance[] = [];
  const trayInstances: TrayInstance[] = [];
  const mockAppDataPath = 'mock-home/AppData/Roaming';
  const appPaths = new Map<string, string>([
    ['appData', mockAppDataPath],
    ['userData', `${mockAppDataPath}/Pristine`],
    ['sessionData', `${mockAppDataPath}/Pristine/session-data`],
  ]);

  class BrowserWindowMock {
    static getAllWindows = vi.fn(() => browserWindowInstances);

    options: Record<string, unknown>;
    loadURL = vi.fn();
    loadFile = vi.fn();
    getBounds = vi.fn(() => ({ x: 10, y: 20, width: 1440, height: 900 }));
    getNormalBounds = vi.fn(() => ({ x: 10, y: 20, width: 1440, height: 900 }));
    setBounds = vi.fn();
    maximize = vi.fn(() => {
      this.maximized = true;
    });
    unmaximize = vi.fn(() => {
      this.maximized = false;
    });
    isMaximized = vi.fn(() => this.maximized);
    webContents = {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    };
    private visible: boolean;
    private maximized = false;
    show = vi.fn(() => {
      this.visible = true;
    });
    hide = vi.fn(() => {
      this.visible = false;
    });
    focus = vi.fn();
    setAlwaysOnTop = vi.fn();
    restore = vi.fn(() => {
      this.visible = true;
    });
    isMinimized = vi.fn(() => false);
    isVisible = vi.fn(() => this.visible);
    isDestroyed = vi.fn(() => false);
    private handlers = new Map<string, (...args: unknown[]) => void>();
    private onceHandlers = new Map<string, (...args: unknown[]) => void>();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.visible = options.show === true;
      browserWindowInstances.push(this as unknown as BrowserWindowInstance);
    }

    on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      this.handlers.set(event, handler);
      return this;
    });

    once = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      this.onceHandlers.set(event, handler);
      return this;
    });

    close = vi.fn(() => {
      const closeEvent = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };

      this.emit('close', closeEvent);

      if (!closeEvent.defaultPrevented) {
        this.emit('closed');
      }
    });

    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.(...args);

      const onceHandler = this.onceHandlers.get(event);
      if (onceHandler) {
        this.onceHandlers.delete(event);
        onceHandler(...args);
      }

      if (event === 'closed') {
        const index = browserWindowInstances.indexOf(this as unknown as BrowserWindowInstance);
        if (index >= 0) {
          browserWindowInstances.splice(index, 1);
        }
      }
    }
  }

  class TrayMock {
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    popUpContextMenu = vi.fn();
    destroy = vi.fn();
    private handlers = new Map<string, (...args: unknown[]) => void>();

    icon: unknown;

    constructor(icon: unknown) {
      this.icon = icon;
      trayInstances.push(this as unknown as TrayInstance);
    }

    on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      this.handlers.set(event, handler);
      return this;
    });

    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.(...args);
    }
  }

  return {
    appHandlers,
    mockAppDataPath,
    appPaths,
    browserWindowInstances,
    trayInstances,
    BrowserWindowMock,
    TrayMock,
    mockMkdirSync: vi.fn(),
    mockWhenReady: vi.fn(() => Promise.resolve()),
    mockAppOn: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      appHandlers.set(event, handler);
    }),
    mockGetPath: vi.fn((name: string) => appPaths.get(name) ?? `mock-${name}`),
    mockSetPath: vi.fn((name: string, value: string) => {
      appPaths.set(name, value);
    }),
    mockSetName: vi.fn(),
    mockGetName: vi.fn(() => 'Pristine'),
    mockQuit: vi.fn(),
    mockSetAsDefaultProtocolClient: vi.fn(),
    mockRequestSingleInstanceLock: vi.fn(() => true),
    mockBuildFromTemplate: vi.fn((template: unknown[]) => ({ template })),
    mockSetApplicationMenu: vi.fn(),
    mockWriteShortcutLink: vi.fn(() => true),
    mockExistsSync: vi.fn<(filePath: string) => boolean>(() => true),
    mockCreateFromDataURL: vi.fn(() => ({ kind: 'native-image-data-url' })),
    mockCreateFromPath: vi.fn((filePath: string) => ({ kind: 'native-image-path', path: filePath })),
    mockCreateEmpty: vi.fn(() => ({ kind: 'native-image-empty' })),
    mockDisposeLspSession: vi.fn(),
    mockDisposeAllTerminalSessions: vi.fn(),
    mockFlushPendingConfigSave: vi.fn(),
    mockGetConfigValue: vi.fn<(key: string) => unknown>(() => null),
    mockDisposeProjectService: vi.fn(),
    mockStopPristineEdaEnvironment: vi.fn(() => Promise.resolve({ ok: true })),
    mockRegisterAllHandlers: vi.fn(),
    mockSetProjectRoot: vi.fn(),
    mockSetupWindowStreams: vi.fn(),
    mockTryOpenStartupProject: vi.fn(),
    mockHandleAuthCallbackUrl: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()),
    mockIsAuthProtocolUrl: vi.fn<(value: string) => boolean>((value: string) => value.startsWith('pristine://')),
  };
});

vi.mock('node:fs', () => ({
  default: {
    existsSync: (filePath: string) => mocks.mockExistsSync(filePath),
    mkdirSync: (...args: unknown[]) => mocks.mockMkdirSync(...args),
  },
}));

vi.mock('electron', () => ({
  app: {
    getName: mocks.mockGetName,
    getPath: mocks.mockGetPath,
    setPath: mocks.mockSetPath,
    setName: mocks.mockSetName,
     setAsDefaultProtocolClient: mocks.mockSetAsDefaultProtocolClient,
     requestSingleInstanceLock: mocks.mockRequestSingleInstanceLock,
    whenReady: mocks.mockWhenReady,
    on: mocks.mockAppOn,
    quit: mocks.mockQuit,
  },
  BrowserWindow: mocks.BrowserWindowMock,
  Menu: {
    buildFromTemplate: mocks.mockBuildFromTemplate,
    setApplicationMenu: mocks.mockSetApplicationMenu,
  },
  Tray: mocks.TrayMock,
  shell: {
    writeShortcutLink: mocks.mockWriteShortcutLink,
  },
  nativeImage: {
    createFromDataURL: mocks.mockCreateFromDataURL,
    createFromPath: mocks.mockCreateFromPath,
    createEmpty: mocks.mockCreateEmpty,
  },
  screen: {
    getPrimaryDisplay: () => ({
      workArea: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      },
    }),
  },
}));

vi.mock('./ipc/register.js', () => ({
  registerAllHandlers: (...args: unknown[]) => mocks.mockRegisterAllHandlers(...args),
  setProjectRoot: (...args: unknown[]) => mocks.mockSetProjectRoot(...args),
  setupWindowStreams: (...args: unknown[]) => mocks.mockSetupWindowStreams(...args),
}));

vi.mock('./ipc/terminal.js', () => ({
  disposeAllTerminalSessions: (...args: unknown[]) => mocks.mockDisposeAllTerminalSessions(...args),
}));

vi.mock('./ipc/wsl.js', () => ({
  stopPristineEdaEnvironment: () => mocks.mockStopPristineEdaEnvironment(),
}));

vi.mock('./ipc/lsp.js', () => ({
  disposeLspSession: (...args: unknown[]) => mocks.mockDisposeLspSession(...args),
}));

vi.mock('./ipc/config.js', () => ({
  flushPendingConfigSave: (...args: unknown[]) => mocks.mockFlushPendingConfigSave(...args),
  getConfigValue: (key: string) => mocks.mockGetConfigValue(key),
}));

vi.mock('./ipc/project.js', () => ({
  PROJECT_LAST_ROOT_CONFIG_KEY: 'project.lastProjectRoot',
  disposeProjectService: (...args: unknown[]) => mocks.mockDisposeProjectService(...args),
  tryOpenStartupProject: (...args: unknown[]) => mocks.mockTryOpenStartupProject(...args),
}));

vi.mock('./ipc/auth.js', () => ({
  handleAuthCallbackUrl: (url: string) => mocks.mockHandleAuthCallbackUrl(url),
  isAuthProtocolUrl: (value: string) => mocks.mockIsAuthProtocolUrl(value),
}));

const originalPlatform = process.platform;
const originalDevServerUrl = process.env.VITE_DEV_SERVER_URL;
const originalProjectRoot = process.env.PRISTINE_PROJECT_ROOT;
const originalUserDataPath = process.env.PRISTINE_USER_DATA_PATH;

async function importMain(options?: {
  platform?: NodeJS.Platform;
  devServerUrl?: string;
  projectRoot?: string;
  userDataPath?: string;
  configValues?: Record<string, unknown>;
  singleInstanceLock?: boolean;
}) {
  vi.resetModules();
  mocks.appHandlers.clear();
  mocks.browserWindowInstances.length = 0;
  mocks.trayInstances.length = 0;
  mocks.appPaths.clear();
  mocks.appPaths.set('appData', mocks.mockAppDataPath);
  mocks.appPaths.set('userData', path.join(mocks.mockAppDataPath, 'Pristine'));
  mocks.appPaths.set('sessionData', path.join(mocks.mockAppDataPath, 'Pristine', 'session-data'));
  mocks.mockMkdirSync.mockClear();
  mocks.mockWhenReady.mockClear();
  mocks.mockAppOn.mockClear();
  mocks.mockGetName.mockClear();
  mocks.mockGetPath.mockClear();
  mocks.mockSetPath.mockClear();
  mocks.mockSetName.mockClear();
    mocks.mockSetAsDefaultProtocolClient.mockClear();
    mocks.mockRequestSingleInstanceLock.mockReset();
    mocks.mockRequestSingleInstanceLock.mockImplementation(() => options?.singleInstanceLock ?? true);
  mocks.mockQuit.mockClear();
  mocks.mockBuildFromTemplate.mockClear();
  mocks.mockSetApplicationMenu.mockClear();
  mocks.mockWriteShortcutLink.mockClear();
  mocks.mockExistsSync.mockReset();
  mocks.mockExistsSync.mockImplementation(() => true);
  mocks.mockCreateFromDataURL.mockClear();
  mocks.mockCreateFromPath.mockClear();
  mocks.mockCreateEmpty.mockClear();
  mocks.mockDisposeLspSession.mockClear();
  mocks.mockDisposeAllTerminalSessions.mockClear();
  mocks.mockStopPristineEdaEnvironment.mockClear();
  mocks.mockDisposeProjectService.mockClear();
  mocks.mockFlushPendingConfigSave.mockClear();
  mocks.mockGetConfigValue.mockReset();
  mocks.mockGetConfigValue.mockImplementation((key: string) => options?.configValues?.[key] ?? null);
  mocks.mockRegisterAllHandlers.mockClear();
  mocks.mockSetProjectRoot.mockClear();
  mocks.mockSetupWindowStreams.mockClear();
  mocks.mockTryOpenStartupProject.mockClear();
  mocks.mockTryOpenStartupProject.mockImplementation((
    _root: string | null,
    applyProjectRoot: (root: string | null) => void,
    applyWindowState?: (windowState: unknown) => void,
  ) => {
    applyProjectRoot(_root);
    if (_root) {
      applyWindowState?.({
        bounds: { height: 720, width: 1280, x: 44, y: 55 },
        maximized: true,
      });
    }
    return _root ? { name: path.basename(_root), rootPath: _root, session: null } : null;
  });
    mocks.mockHandleAuthCallbackUrl.mockClear();
    mocks.mockIsAuthProtocolUrl.mockClear();
    mocks.mockIsAuthProtocolUrl.mockImplementation((value: string) => value.startsWith('pristine://'));
  mocks.BrowserWindowMock.getAllWindows.mockClear();

  if (options?.devServerUrl) {
    process.env.VITE_DEV_SERVER_URL = options.devServerUrl;
  } else {
    delete process.env.VITE_DEV_SERVER_URL;
  }

  if (options?.projectRoot) {
    process.env.PRISTINE_PROJECT_ROOT = options.projectRoot;
  } else {
    delete process.env.PRISTINE_PROJECT_ROOT;
  }

  if (options?.userDataPath) {
    process.env.PRISTINE_USER_DATA_PATH = options.userDataPath;
  } else {
    delete process.env.PRISTINE_USER_DATA_PATH;
  }

  Object.defineProperty(process, 'platform', {
    value: options?.platform ?? 'win32',
  });

  await import('./main.ts');
  await Promise.resolve();

  return {
    appHandlers: mocks.appHandlers,
    browserWindowInstances: mocks.browserWindowInstances,
    trayInstances: mocks.trayInstances,
    getMainWindow: mocks.mockRegisterAllHandlers.mock.calls[0]?.[0] as (() => BrowserWindowInstance | null) | undefined,
    setFloatingInfoExpanded: mocks.mockRegisterAllHandlers.mock.calls[0]?.[2] as ((expanded: boolean) => boolean) | undefined,
    setFloatingInfoMode: mocks.mockRegisterAllHandlers.mock.calls[0]?.[3] as ((mode: 'collapsed' | 'expanded' | 'detail') => boolean) | undefined,
    resolveCloseRequest: mocks.mockRegisterAllHandlers.mock.calls[0]?.[4] as ((requestId: number, decision: 'proceed' | 'cancel') => boolean) | undefined,
    markWorkspaceReady: mocks.mockRegisterAllHandlers.mock.calls[0]?.[5] as (() => void) | undefined,
  };
}

describe('electron main entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();

    if (originalDevServerUrl) {
      process.env.VITE_DEV_SERVER_URL = originalDevServerUrl;
    } else {
      delete process.env.VITE_DEV_SERVER_URL;
    }

    if (originalProjectRoot) {
      process.env.PRISTINE_PROJECT_ROOT = originalProjectRoot;
    } else {
      delete process.env.PRISTINE_PROJECT_ROOT;
    }

    if (originalUserDataPath) {
      process.env.PRISTINE_USER_DATA_PATH = originalUserDataPath;
    } else {
      delete process.env.PRISTINE_USER_DATA_PATH;
    }

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses the configured user data path override when provided', async () => {
    const userDataPath = path.join(mocks.mockAppDataPath, 'Pristine', 'e2e-profile');

    await importMain({ userDataPath });

    expect(mocks.mockSetName).toHaveBeenCalledWith('Pristine');
    expect(mocks.mockMkdirSync).toHaveBeenCalledWith(
      userDataPath,
      { recursive: true },
    );
    expect(mocks.mockMkdirSync).toHaveBeenCalledWith(
      path.join(userDataPath, 'session-data'),
      { recursive: true },
    );
    expect(mocks.mockSetPath).toHaveBeenCalledWith('userData', userDataPath);
    expect(mocks.mockSetPath).toHaveBeenCalledWith('sessionData', path.join(userDataPath, 'session-data'));
  });

  it('quits immediately without creating windows when a protocol-launched second instance fails to acquire the single-instance lock', async () => {
    const { appHandlers, browserWindowInstances, trayInstances } = await importMain({
      platform: 'win32',
      singleInstanceLock: false,
    });

    expect(mocks.mockQuit).toHaveBeenCalledTimes(1);
    expect(mocks.mockRegisterAllHandlers).not.toHaveBeenCalled();
    expect(browserWindowInstances).toHaveLength(0);
    expect(trayInstances).toHaveLength(0);
    expect(appHandlers.has('second-instance')).toBe(false);
    expect(appHandlers.has('activate')).toBe(false);
    expect(appHandlers.has('before-quit')).toBe(false);
  });

  it('registers handlers, creates tray and startup windows, and loads the dev server when available', async () => {
    const { browserWindowInstances, trayInstances, getMainWindow } = await importMain({
      platform: 'win32',
      devServerUrl: 'http://127.0.0.1:5173',
    });

    expect(mocks.mockRegisterAllHandlers).toHaveBeenCalledTimes(1);
    expect(mocks.mockRequestSingleInstanceLock).toHaveBeenCalledTimes(1);
    expect(mocks.mockSetAsDefaultProtocolClient).toHaveBeenCalledWith('pristine');
    expect(mocks.mockTryOpenStartupProject).toHaveBeenCalledWith(null, expect.any(Function), expect.any(Function));
    expect(mocks.mockSetProjectRoot).toHaveBeenCalledWith(null);
    expect(mocks.mockMkdirSync).toHaveBeenCalledWith(
      path.join(mocks.mockAppDataPath, 'Pristine', 'dev-profile'),
      { recursive: true },
    );
    expect(mocks.mockMkdirSync).toHaveBeenCalledWith(
      path.join(mocks.mockAppDataPath, 'Pristine', 'dev-profile', 'session-data'),
      { recursive: true },
    );
    expect(mocks.mockSetPath).toHaveBeenCalledWith('userData', path.join(mocks.mockAppDataPath, 'Pristine', 'dev-profile'));
    expect(mocks.mockSetPath).toHaveBeenCalledWith('sessionData', path.join(mocks.mockAppDataPath, 'Pristine', 'dev-profile', 'session-data'));
    expect(trayInstances).toHaveLength(1);
    expect(browserWindowInstances).toHaveLength(2);
    expect(mocks.mockWriteShortcutLink).toHaveBeenCalledWith(
      path.join(mocks.mockAppDataPath, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Pristine.lnk'),
      'update',
      expect.objectContaining({
        appUserModelId: 'com.pristine.ide',
        description: 'Pristine',
        icon: process.execPath,
        iconIndex: 0,
        target: process.execPath,
        cwd: path.dirname(process.execPath),
      }),
    );

    const splashWindow = browserWindowInstances[0];
    const mainWindow = browserWindowInstances[1];

    expect(getMainWindow?.()).toBe(mainWindow);
    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Pristine');
    expect(trayInstances[0].icon).toMatchObject({
      kind: 'native-image-path',
      path: expect.stringMatching(/logo-v1-32\.png$/),
    });
    expect(mocks.mockCreateFromPath).toHaveBeenCalledWith(expect.stringMatching(/logo-v1-32\.png$/));
    expect(mocks.mockCreateFromPath).toHaveBeenCalledWith(expect.stringMatching(/logo-v1-256\.png$/));
    expect(mocks.mockCreateEmpty).not.toHaveBeenCalled();
    expect(mocks.mockBuildFromTemplate).toHaveBeenCalledWith([
      expect.objectContaining({ label: 'Open Pristine' }),
      { type: 'separator' },
      expect.objectContaining({ label: 'Quit Pristine' }),
    ]);
    expect(splashWindow.options).toMatchObject({
      width: 720,
      height: 405,
      icon: expect.objectContaining({ kind: 'native-image-path' }),
      frame: false,
      resizable: false,
      skipTaskbar: true,
      backgroundColor: '#191A1B',
    });
    expect(splashWindow.loadFile).toHaveBeenCalledWith(expect.stringMatching(/public[\\/]splash\.html$/), {
      query: {
        backgroundColor: '#191A1B',
        themeKind: 'dark',
      },
    });

    expect(mainWindow.options).toMatchObject({
      width: 1440,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#121314',
      frame: false,
      icon: expect.objectContaining({ kind: 'native-image-path' }),
      show: false,
      webPreferences: expect.objectContaining({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        preload: expect.stringMatching(/preload\.mjs$/),
      }),
    });
    expect(mainWindow.setBounds).not.toHaveBeenCalled();
    expect(mainWindow.maximize).not.toHaveBeenCalled();
    expect(mocks.mockSetupWindowStreams).toHaveBeenCalledWith(mainWindow);
    expect(mainWindow.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173');
    expect(mainWindow.loadFile).not.toHaveBeenCalled();
    expect(mainWindow.show).not.toHaveBeenCalled();

    mainWindow.emit('ready-to-show');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mainWindow.show).not.toHaveBeenCalled();
    expect(splashWindow.close).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(splashWindow.close).toHaveBeenCalledTimes(1);
    expect(mocks.mockSetApplicationMenu).not.toHaveBeenCalled();

    mainWindow.emit('closed');
    expect(getMainWindow?.()).toBeNull();
    expect(mocks.mockDisposeAllTerminalSessions).not.toHaveBeenCalled();
  });

  it('uses the last project root from config when no project env override is present', async () => {
    const configuredRoot = 'C:\\Projects\\chip-lab';

    const { browserWindowInstances } = await importMain({
      configValues: {
        'project.lastProjectRoot': configuredRoot,
      },
    });

    expect(mocks.mockTryOpenStartupProject).toHaveBeenCalledWith(configuredRoot, expect.any(Function), expect.any(Function));
    expect(mocks.mockSetProjectRoot).toHaveBeenCalledWith(configuredRoot);
    const mainWindow = browserWindowInstances[1];
    expect(mainWindow.setBounds).toHaveBeenCalledWith({ height: 720, width: 1280, x: 44, y: 55 }, false);
    expect(mainWindow.maximize).not.toHaveBeenCalled();
    expect(mainWindow.show).not.toHaveBeenCalled();
  });

  it('shows the startup window after renderer workspace readiness and the minimum splash duration', async () => {
    const { browserWindowInstances, markWorkspaceReady } = await importMain({
      platform: 'win32',
      devServerUrl: 'http://127.0.0.1:5173',
    });
    const splashWindow = browserWindowInstances[0];
    const mainWindow = browserWindowInstances[1];

    mainWindow.emit('ready-to-show');
    await vi.advanceTimersByTimeAsync(1000);
    markWorkspaceReady?.();
    await Promise.resolve();

    expect(mainWindow.show).not.toHaveBeenCalled();
    expect(splashWindow.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();

    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(splashWindow.close).toHaveBeenCalledTimes(1);
  });

  it('defers restored maximized project window state until the splash handoff is ready', async () => {
    const { browserWindowInstances, markWorkspaceReady } = await importMain({
      configValues: {
        'project.lastProjectRoot': 'C:\\Projects\\chip-lab',
      },
      platform: 'win32',
      devServerUrl: 'http://127.0.0.1:5173',
    });
    const splashWindow = browserWindowInstances[0];
    const mainWindow = browserWindowInstances[1];

    expect(mainWindow.setBounds).toHaveBeenCalledWith({ height: 720, width: 1280, x: 44, y: 55 }, false);
    expect(mainWindow.maximize).not.toHaveBeenCalled();
    expect(mainWindow.show).not.toHaveBeenCalled();

    mainWindow.emit('ready-to-show');
    await vi.advanceTimersByTimeAsync(1000);
    markWorkspaceReady?.();
    await Promise.resolve();

    expect(mainWindow.maximize).not.toHaveBeenCalled();
    expect(mainWindow.show).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();

    expect(mainWindow.maximize).toHaveBeenCalledTimes(1);
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(splashWindow.close).toHaveBeenCalledTimes(1);
  });

  it('prefers the project root env override over the configured last project root', async () => {
    const envRoot = 'C:\\Projects\\env-chip';

    await importMain({
      configValues: {
        'project.lastProjectRoot': 'C:\\Projects\\configured-chip',
      },
      projectRoot: envRoot,
    });

    expect(mocks.mockTryOpenStartupProject).toHaveBeenCalledWith(envRoot, expect.any(Function), expect.any(Function));
    expect(mocks.mockSetProjectRoot).toHaveBeenCalledWith(envRoot);
  });

  it('uses cached startup and splash background colors from the unified theme config', async () => {
    const { browserWindowInstances } = await importMain({
      platform: 'win32',
      configValues: {
        'workbench.colorThemeKind': 'light',
        'workbench.startupBackgroundColor': '#112233',
        'workbench.splashBackgroundColor': '#223344',
      },
    });

    const splashWindow = browserWindowInstances[0];
    const mainWindow = browserWindowInstances[1];

    expect(mainWindow.options).toMatchObject({
      backgroundColor: '#112233',
    });
    expect(splashWindow.options).toMatchObject({
      backgroundColor: '#223344',
    });
    expect(splashWindow.loadFile).toHaveBeenCalledWith(expect.stringMatching(/splash\.html$/), {
      query: {
        backgroundColor: '#223344',
        themeKind: 'light',
      },
    });
  });

  it('uses macOS window chrome and loads the built index and splash files in production', async () => {
    const { browserWindowInstances } = await importMain({ platform: 'darwin' });

    expect(mocks.mockMkdirSync).toHaveBeenCalledWith(
      path.join(mocks.mockAppDataPath, 'Pristine', 'session-data'),
      { recursive: true },
    );
    expect(mocks.mockSetPath).toHaveBeenCalledWith('userData', path.join(mocks.mockAppDataPath, 'Pristine'));
    expect(mocks.mockSetPath).toHaveBeenCalledWith('sessionData', path.join(mocks.mockAppDataPath, 'Pristine', 'session-data'));

    const splashWindow = browserWindowInstances[0];
    const mainWindow = browserWindowInstances[1];
    const applicationMenu = mocks.mockSetApplicationMenu.mock.calls[0]?.[0] as {
      template: Array<{ label?: string }>;
    };

    expect(mainWindow.options).toMatchObject({
      frame: true,
      show: false,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 10 },
    });
    expect(mocks.mockSetApplicationMenu).toHaveBeenCalledTimes(1);
    expect(applicationMenu.template.map((item) => item.label)).toEqual(['Pristine', 'File', 'Edit', 'Help']);
    expect(mainWindow.loadFile).toHaveBeenCalledWith(expect.stringMatching(/dist[\\/]index\.html$/));
    expect(mainWindow.loadURL).not.toHaveBeenCalled();
    expect(splashWindow.loadFile).toHaveBeenCalledWith(expect.stringMatching(/dist[\\/]splash\.html$/), {
      query: {
        backgroundColor: '#191A1B',
        themeKind: 'dark',
      },
    });
  });

  it('installs a dedicated macOS application menu labeled Pristine with app commands', async () => {
    await importMain({ platform: 'darwin' });

    const applicationMenu = mocks.mockSetApplicationMenu.mock.calls[0]?.[0] as {
      template: Array<{
        label?: string;
        submenu?: Array<{ label?: string; click?: () => void }>;
      }>;
    };
    const appMenu = applicationMenu.template[0];

    expect(appMenu.label).toBe('Pristine');
    expect(appMenu.submenu?.map((item) => item.label).filter(Boolean)).toEqual([
      'About Pristine',
      'Hide Pristine',
      'Hide Others',
      'Show All',
      'Quit Pristine',
    ]);
  });

  it('routes the dedicated macOS Pristine quit item through the close-request handshake', async () => {
    const { browserWindowInstances, resolveCloseRequest } = await importMain({ platform: 'darwin' });

    const applicationMenu = mocks.mockSetApplicationMenu.mock.calls[0]?.[0] as {
      template: Array<{
        label?: string;
        submenu?: Array<{ label?: string; click?: () => void }>;
      }>;
    };
    const appMenu = applicationMenu.template[0];
    const quitItem = appMenu.submenu?.find((item) => item.label === 'Quit Pristine');
    const mainWindow = browserWindowInstances[1];

    quitItem?.click?.();

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('stream:window:close-request', { requestId: 1, action: 'quit' });
    resolveCloseRequest?.(1, 'proceed');
    expect(mocks.mockQuit).toHaveBeenCalledTimes(1);
  });

  it('routes macOS Save, Save All, and Undo menu items back into the renderer command flow', async () => {
    const { browserWindowInstances } = await importMain({ platform: 'darwin' });

    const mainWindow = browserWindowInstances[1];
    const applicationMenu = mocks.mockSetApplicationMenu.mock.calls[0]?.[0] as {
      template: Array<{
        label?: string;
        submenu?: Array<{ label?: string; click?: () => void }>;
      }>;
    };
    const fileMenu = applicationMenu.template.find((item) => item.label === 'File');
    const editMenu = applicationMenu.template.find((item) => item.label === 'Edit');

    fileMenu?.submenu?.find((item) => item.label === 'Save')?.click?.();
    fileMenu?.submenu?.find((item) => item.label === 'Save All')?.click?.();
    editMenu?.submenu?.find((item) => item.label === 'Undo')?.click?.();

    expect(mainWindow.webContents.send).toHaveBeenNthCalledWith(1, 'stream:menu:command', { action: 'save-file' });
    expect(mainWindow.webContents.send).toHaveBeenNthCalledWith(2, 'stream:menu:command', { action: 'save-all-files' });
    expect(mainWindow.webContents.send).toHaveBeenNthCalledWith(3, 'stream:menu:command', { action: 'undo-editor' });
  });

  it('routes macOS New Project and Settings menu items back into renderer dialog flows', async () => {
    const { browserWindowInstances } = await importMain({ platform: 'darwin' });

    const mainWindow = browserWindowInstances[1];
    const applicationMenu = mocks.mockSetApplicationMenu.mock.calls[0]?.[0] as {
      template: Array<{
        label?: string;
        submenu?: Array<{ label?: string; click?: () => void }>;
      }>;
    };
    const fileMenu = applicationMenu.template.find((item) => item.label === 'File');
    const newProjectItem = fileMenu?.submenu?.find((item) => item.label === 'New Project');
    const settingsItem = fileMenu?.submenu?.find((item) => item.label === 'Setting...');

    newProjectItem?.click?.();
    settingsItem?.click?.();

    expect(mainWindow.show).toHaveBeenCalled();
    expect(mainWindow.focus).toHaveBeenCalledTimes(2);
    expect(mainWindow.webContents.send).toHaveBeenNthCalledWith(1, 'stream:menu:command', { action: 'open-new-project' });
    expect(mainWindow.webContents.send).toHaveBeenNthCalledWith(2, 'stream:menu:command', { action: 'open-settings' });
  });

  it('routes macOS About menu items back into the renderer about dialog flow', async () => {
    const { browserWindowInstances } = await importMain({ platform: 'darwin' });

    const mainWindow = browserWindowInstances[1];
    const applicationMenu = mocks.mockSetApplicationMenu.mock.calls[0]?.[0] as {
      template: Array<{
        label?: string;
        submenu?: Array<{ label?: string; click?: () => void }>;
      }>;
    };
    const appMenu = applicationMenu.template[0];
    const helpMenu = applicationMenu.template.find((item) => item.label === 'Help');

    appMenu.submenu?.find((item) => item.label === 'About Pristine')?.click?.();
    helpMenu?.submenu?.find((item) => item.label === 'About')?.click?.();

    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(2);
    expect(mainWindow.webContents.send).toHaveBeenNthCalledWith(1, 'stream:menu:command', { action: 'open-about' });
    expect(mainWindow.webContents.send).toHaveBeenNthCalledWith(2, 'stream:menu:command', { action: 'open-about' });
  });

  it('creates the detached floating info window when enabled in config', async () => {
    const { browserWindowInstances } = await importMain({
      platform: 'win32',
      configValues: {
        'workbench.colorThemeKind': 'light',
        'workbench.floatingInfoBackgroundColor': '#334455',
        'ui.floatingInfoWindow.visible': true,
      },
    });

    expect(browserWindowInstances).toHaveLength(3);

    const floatingInfoWindow = browserWindowInstances[2];
    expect(floatingInfoWindow.options).toMatchObject({
      width: 60,
      height: 24,
      frame: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      maxWidth: 360,
      maxHeight: 520,
      title: 'Pristine Floating Info',
      backgroundColor: '#334455',
    });
    expect(floatingInfoWindow.show).toHaveBeenCalledTimes(1);
    expect(floatingInfoWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(floatingInfoWindow.loadFile).toHaveBeenCalledWith(expect.stringMatching(/dist[\\/]floating-info\.html$/), {
      query: {
        backgroundColor: '#334455',
        themeKind: 'light',
      },
    });
  });

  it('changes the floating info window mode using the registered handlers while keeping the top-right anchor', async () => {
    const { browserWindowInstances, setFloatingInfoExpanded, setFloatingInfoMode } = await importMain({
      platform: 'win32',
      configValues: {
        'workbench.colorThemeKind': 'dark',
        'ui.floatingInfoWindow.visible': true,
      },
    });

    const floatingInfoWindow = browserWindowInstances[2];
    expect(setFloatingInfoExpanded).toBeTypeOf('function');
    expect(setFloatingInfoMode).toBeTypeOf('function');

    expect(setFloatingInfoExpanded?.(true)).toBe(true);
    expect(floatingInfoWindow.setBounds).toHaveBeenCalledWith({
      width: 220,
      height: 96,
      x: 1920 - 220 - 24,
      y: 24,
    }, false);

    expect(setFloatingInfoMode?.('detail')).toBe(true);
    expect(floatingInfoWindow.setBounds).toHaveBeenLastCalledWith({
      width: 360,
      height: 520,
      x: 1920 - 360 - 24,
      y: 24,
    }, false);

    expect(setFloatingInfoExpanded?.(false)).toBe(true);
    expect(floatingInfoWindow.setBounds).toHaveBeenLastCalledWith({
      width: 60,
      height: 24,
      x: 1920 - 60 - 24,
      y: 24,
    }, false);
  });

  it('focuses the existing visible main window for auth callback deep links without replaying the show animation', async () => {
    const { appHandlers, browserWindowInstances } = await importMain({ platform: 'win32' });

    const mainWindow = browserWindowInstances[1];
    mainWindow.isVisible.mockReturnValue(true);
    mainWindow.show.mockClear();
    mainWindow.focus.mockClear();

    appHandlers.get('second-instance')?.({}, ['pristine://auth/callback?code=exchange-code']);
    await Promise.resolve();

    expect(mocks.mockHandleAuthCallbackUrl).toHaveBeenCalledWith('pristine://auth/callback?code=exchange-code');
    expect(mainWindow.show).not.toHaveBeenCalled();
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
  });

  it('reveals the main window for auth callback deep links when it is currently hidden', async () => {
    const { appHandlers, browserWindowInstances } = await importMain({ platform: 'win32' });

    const mainWindow = browserWindowInstances[1];
    mainWindow.isVisible.mockReturnValue(false);
    mainWindow.show.mockClear();
    mainWindow.focus.mockClear();

    appHandlers.get('second-instance')?.({}, ['pristine://auth/callback?code=exchange-code']);
    await Promise.resolve();

    expect(mocks.mockHandleAuthCallbackUrl).toHaveBeenCalledWith('pristine://auth/callback?code=exchange-code');
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
  });

  it('recreates splash and main windows on activate when all windows are closed', async () => {
    const { appHandlers, browserWindowInstances } = await importMain({ platform: 'darwin' });

    expect(browserWindowInstances).toHaveLength(2);

    browserWindowInstances[1].emit('closed');
    mocks.BrowserWindowMock.getAllWindows.mockReturnValueOnce([]);
    appHandlers.get('activate')?.();

    expect(browserWindowInstances).toHaveLength(3);
  });

  it('shows the existing main window on activate when it is already available', async () => {
    const { appHandlers, browserWindowInstances } = await importMain({ platform: 'win32' });

    const mainWindow = browserWindowInstances[1];
    mainWindow.show.mockClear();
    mainWindow.focus.mockClear();

    appHandlers.get('activate')?.();

    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
  });

  it('opens the tray menu on click and tray actions can show or request quit through close confirmation', async () => {
    const { browserWindowInstances, trayInstances, resolveCloseRequest } = await importMain({ platform: 'win32' });

    const tray = trayInstances[0];
    const mainWindow = browserWindowInstances[1];
    const { template } = mocks.mockBuildFromTemplate.mock.results[0].value as {
      template: Array<{ label?: string; click?: () => void }>;
    };
    const openItem = template.find((item) => item.label === 'Open Pristine');
    const quitItem = template.find((item) => item.label === 'Quit Pristine');

    tray.emit('click');
    expect(tray.popUpContextMenu).toHaveBeenCalledTimes(1);

    mainWindow.show.mockClear();
    mainWindow.focus.mockClear();
    openItem?.click?.();
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);

    quitItem?.click?.();
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('stream:window:close-request', { requestId: 1, action: 'quit' });
    resolveCloseRequest?.(1, 'proceed');
    expect(mocks.mockQuit).toHaveBeenCalledTimes(1);
  });

  it('requests renderer confirmation before quitting on native close when close-to-tray is not enabled', async () => {
    const { browserWindowInstances, resolveCloseRequest } = await importMain({ platform: 'win32' });

    const mainWindow = browserWindowInstances[1];
    mainWindow.close();

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('stream:window:close-request', { requestId: 1, action: 'quit' });
    expect(mainWindow.hide).not.toHaveBeenCalled();
    expect(mocks.mockQuit).not.toHaveBeenCalled();

    resolveCloseRequest?.(1, 'proceed');
    expect(mocks.mockQuit).toHaveBeenCalledTimes(1);
  });

  it('requests renderer confirmation before hiding to tray on native close when the configured choice is tray', async () => {
    const { browserWindowInstances, resolveCloseRequest } = await importMain({
      platform: 'win32',
      configValues: {
        'window.closeActionPreference': 'tray',
      },
    });

    const mainWindow = browserWindowInstances[1];
    mainWindow.close();

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('stream:window:close-request', { requestId: 1, action: 'tray' });
    expect(mainWindow.hide).not.toHaveBeenCalled();
    resolveCloseRequest?.(1, 'proceed');
    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
    expect(mocks.mockQuit).not.toHaveBeenCalled();
  });

  it('does not quit when the renderer cancels a pending native close request', async () => {
    const { browserWindowInstances, resolveCloseRequest } = await importMain({
      platform: 'win32',
      configValues: {
        'window.closeActionPreference': 'quit',
      },
    });

    browserWindowInstances[1].close();
    resolveCloseRequest?.(1, 'cancel');

    expect(mocks.mockQuit).not.toHaveBeenCalled();
    expect(browserWindowInstances[1].hide).not.toHaveBeenCalled();
  });

  it('quits the app when all windows are closed on non-macOS platforms', async () => {
    const { appHandlers } = await importMain({ platform: 'win32' });

    appHandlers.get('window-all-closed')?.();
    expect(mocks.mockQuit).toHaveBeenCalledTimes(1);
  });

  it('keeps the app running when all windows are closed on macOS', async () => {
    const { appHandlers } = await importMain({ platform: 'darwin' });

    appHandlers.get('window-all-closed')?.();
    expect(mocks.mockQuit).not.toHaveBeenCalled();
  });

  it('disposes terminal sessions and destroys the tray only during app quit', async () => {
    const { appHandlers, trayInstances } = await importMain({ platform: 'win32' });

    appHandlers.get('before-quit')?.();

    expect(mocks.mockFlushPendingConfigSave).toHaveBeenCalledTimes(1);
    expect(mocks.mockDisposeProjectService).toHaveBeenCalledTimes(1);
    expect(mocks.mockDisposeLspSession).toHaveBeenCalledTimes(1);
    expect(mocks.mockDisposeAllTerminalSessions).toHaveBeenCalledTimes(1);
    expect(mocks.mockStopPristineEdaEnvironment).toHaveBeenCalledTimes(1);
    expect(trayInstances[0].destroy).toHaveBeenCalledTimes(1);
  });
});
