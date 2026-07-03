import { app, BrowserWindow, Menu, Tray, screen, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_DISPLAY_NAME,
  applicationMenus,
  isAppMenuItem,
  toElectronAccelerator,
  type AppMenuAction,
  type MenuCommandEvent,
} from '../src/app/menu/applicationMenu.js';
import { registerAllHandlers, setProjectRoot, setupWindowStreams } from './ipc/register.js';
import { StreamChannels } from './ipc/channels.js';
import { flushPendingConfigSave, getConfigValue } from './ipc/config.js';
import { PROJECT_LAST_ROOT_CONFIG_KEY, disposeProjectService, tryOpenStartupProject } from './ipc/project.js';
import { disposeLspSession } from './ipc/lsp.js';
import { disposeAllTerminalSessions } from './ipc/terminal.js';
import { stopPristineEdaEnvironment } from './ipc/wsl.js';
import type { WindowCloseDecision, WindowCloseRequest } from '../src/app/window/windowClose.js';
import type { FloatingInfoWindowMode } from '../src/app/window/floatingInfoWindow.js';
import type { ProjectWindowState } from '../types/project.js';
import { handleAuthCallbackUrl, isAuthProtocolUrl } from './ipc/auth.js';
import { createAppLogoNativeImage } from './appLogo.js';
import { ensureWindowsNotificationShortcut } from './windowsNotificationIdentity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MINIMUM_SPLASH_DURATION_MS = 3000;
const WORKSPACE_READY_TIMEOUT_MS = 1500;
const CLOSE_ACTION_CONFIG_KEY = 'window.closeActionPreference';
const FLOATING_INFO_VISIBLE_CONFIG_KEY = 'ui.floatingInfoWindow.visible';
const WORKBENCH_COLOR_THEME_KIND_CONFIG_KEY = 'workbench.colorThemeKind';
const WORKBENCH_FLOATING_INFO_BACKGROUND_COLOR_CONFIG_KEY = 'workbench.floatingInfoBackgroundColor';
const WORKBENCH_SPLASH_BACKGROUND_COLOR_CONFIG_KEY = 'workbench.splashBackgroundColor';
const WORKBENCH_STARTUP_BACKGROUND_COLOR_CONFIG_KEY = 'workbench.startupBackgroundColor';
const AUTH_CALLBACK_PROTOCOL = 'pristine';
const FLOATING_INFO_WINDOW_TITLE = 'Pristine Floating Info';
const FLOATING_INFO_COLLAPSED_WIDTH = 60;
const FLOATING_INFO_COLLAPSED_HEIGHT = 24;
const FLOATING_INFO_EXPANDED_WIDTH = 220;
const FLOATING_INFO_EXPANDED_HEIGHT = 96;
const FLOATING_INFO_DETAIL_WIDTH = 360;
const FLOATING_INFO_DETAIL_HEIGHT = 520;
const DEFAULT_STARTUP_BACKGROUND_COLOR = '#121314';
const DEFAULT_SPLASH_BACKGROUND_COLOR = '#191A1B';
const DEFAULT_FLOATING_INFO_BACKGROUND_COLOR = '#121314';

type ThemeKind = 'light' | 'dark';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let floatingInfoWindow: BrowserWindow | null = null;
let floatingInfoWindowMode: FloatingInfoWindowMode = 'collapsed';
let tray: Tray | null = null;
let isQuitting = false;
let nextWindowCloseRequestId = 1;
let pendingWindowCloseRequest: WindowCloseRequest | null = null;
let pendingAuthCallbackUrl: string | null = null;
let pendingProjectWindowState: ProjectWindowState | null = null;
let resolveWorkspaceReady: (() => void) | null = null;
let workspaceReadyPromise: Promise<void> = Promise.resolve();

app.setName(APP_DISPLAY_NAME);

function resetWorkspaceReadyWait(): Promise<void> {
  workspaceReadyPromise = new Promise((resolve) => {
    resolveWorkspaceReady = resolve;
  });
  return workspaceReadyPromise;
}

function markWorkspaceReady(): void {
  resolveWorkspaceReady?.();
  resolveWorkspaceReady = null;
}

function configureElectronStoragePaths(): void {
  const isDev = Boolean(process.env['VITE_DEV_SERVER_URL']);
  const configuredUserDataPath = process.env['PRISTINE_USER_DATA_PATH'];
  const userDataPath = configuredUserDataPath ?? (
    isDev
      ? path.join(app.getPath('appData'), 'Pristine', 'dev-profile')
      : path.join(app.getPath('appData'), app.getName())
  );
  const sessionDataPath = path.join(userDataPath, 'session-data');

  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(sessionDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  app.setPath('sessionData', sessionDataPath);
}

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function getProjectWindowState(): ProjectWindowState | null {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  const bounds = mainWindow.isMaximized()
    ? mainWindow.getNormalBounds()
    : mainWindow.getBounds();

  return {
    bounds: {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    },
    maximized: mainWindow.isMaximized(),
  };
}

function applyProjectWindowState(windowState: ProjectWindowState | null | undefined): void {
  pendingProjectWindowState = windowState ?? null;

  if (!pendingProjectWindowState || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const bounds = pendingProjectWindowState.bounds;
  if (bounds) {
    mainWindow.setBounds(bounds, false);
  }
}

function applyPendingProjectWindowVisibilityState(window: BrowserWindow): void {
  if (!pendingProjectWindowState || mainWindow !== window || window.isDestroyed()) {
    return;
  }

  if (pendingProjectWindowState.maximized) {
    window.maximize();
  } else if (window.isMaximized()) {
    window.unmaximize();
  }

  pendingProjectWindowState = null;
}

function findAuthCallbackUrl(args: readonly string[]): string | null {
  return args.find((value) => isAuthProtocolUrl(value)) ?? null;
}

function registerDeepLinkProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(AUTH_CALLBACK_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    return;
  }

  app.setAsDefaultProtocolClient(AUTH_CALLBACK_PROTOCOL);
}

function processAuthCallbackUrl(url: string): void {
  pendingAuthCallbackUrl = url;
  void handleAuthCallbackUrl(url).then(() => {
    if (pendingAuthCallbackUrl === url) {
      pendingAuthCallbackUrl = null;
    }
  });
}

function sendMenuCommandToMainWindow(payload: MenuCommandEvent): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send(StreamChannels.MENU_COMMAND, payload);
}

function sendWindowCloseRequestToMainWindow(payload: WindowCloseRequest): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send(StreamChannels.WINDOW_CLOSE_REQUEST, payload);
}

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.mjs');
}

function getMainRendererPath(): string {
  return path.join(__dirname, '../dist/index.html');
}

function getFloatingInfoRendererPath(): string {
  return path.join(__dirname, '../dist/floating-info.html');
}

function getSplashHtmlPath(): string {
  return process.env['VITE_DEV_SERVER_URL']
    ? path.join(__dirname, '../public/splash.html')
    : path.join(__dirname, '../dist/splash.html');
}

function getFloatingInfoRendererUrl(): string {
  return new URL('floating-info.html', process.env['VITE_DEV_SERVER_URL']).toString();
}

function getConfiguredThemeKind(): ThemeKind {
  return getConfigValue(WORKBENCH_COLOR_THEME_KIND_CONFIG_KEY) === 'light' ? 'light' : 'dark';
}

export function resolveStartupProjectRoot(
  envProjectRoot: string | undefined,
  configuredProjectRoot: unknown,
): string | null {
  if (envProjectRoot && envProjectRoot.trim().length > 0) {
    return envProjectRoot;
  }

  return typeof configuredProjectRoot === 'string' && configuredProjectRoot.trim().length > 0
    ? configuredProjectRoot
    : null;
}

function getConfiguredWindowBackgroundColor(configKey: string, fallback: string): string {
  const value = getConfigValue(configKey);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function createRendererSurfaceQuery(backgroundColor: string): Record<string, string> {
  return {
    backgroundColor,
    themeKind: getConfiguredThemeKind(),
  };
}

function withRendererSurfaceQuery(rendererUrl: string, backgroundColor: string): string {
  const url = new URL(rendererUrl);
  const query = createRendererSurfaceQuery(backgroundColor);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createStartupWindows();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
}

function dispatchRendererMenuActionFromApplicationMenu(
  action: Extract<AppMenuAction, 'open-new-project' | 'open-project' | 'close-project' | 'open-settings' | 'open-about' | 'open-notice-files' | 'run-notification-progress-demo'>,
): void {
  const existingWindow = mainWindow;

  showMainWindow();

  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    return;
  }

  if (existingWindow && existingWindow === window) {
    sendMenuCommandToMainWindow({ action });
    return;
  }

  window.once('ready-to-show', () => {
    if (mainWindow === window) {
      sendMenuCommandToMainWindow({ action });
    }
  });
}

function handleApplicationMenuAction(action: AppMenuAction): void {
  if (
    action === 'open-new-project'
    || action === 'open-project'
    || action === 'close-project'
    || action === 'open-settings'
    || action === 'open-about'
    || action === 'open-notice-files'
    || action === 'run-notification-progress-demo'
  ) {
    dispatchRendererMenuActionFromApplicationMenu(action);
    return;
  }

  if (action === 'save-file' || action === 'save-all-files' || action === 'undo-editor' || action === 'redo-editor') {
    sendMenuCommandToMainWindow({ action });
    return;
  }

  if (action === 'close-app') {
    mainWindow?.close();
  }
}

function requestApplicationQuit(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    requestRendererWindowClose('quit');
    return;
  }

  app.quit();
}

function createMacOSApplicationMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_DISPLAY_NAME,
      submenu: [
        {
          label: `About ${APP_DISPLAY_NAME}`,
          click: () => {
            dispatchRendererMenuActionFromApplicationMenu('open-about');
          },
        },
        { type: 'separator' },
        {
          label: `Hide ${APP_DISPLAY_NAME}`,
          role: 'hide',
        },
        {
          label: 'Hide Others',
          role: 'hideOthers',
        },
        {
          label: 'Show All',
          role: 'unhide',
        },
        { type: 'separator' },
        {
          label: `Quit ${APP_DISPLAY_NAME}`,
          accelerator: 'Command+Q',
          click: () => {
            requestApplicationQuit();
          },
        },
      ],
    },
    ...applicationMenus.map<MenuItemConstructorOptions>((menu) => ({
      label: menu.label,
      submenu: menu.items.map<MenuItemConstructorOptions>((item) => {
        if (!isAppMenuItem(item)) {
          return { type: 'separator' };
        }

        const action = item.action;

        return {
          label: item.name,
          accelerator: toElectronAccelerator(item.shortcut),
          click: action === undefined
            ? undefined
            : () => {
              handleApplicationMenuAction(action);
            },
        } satisfies MenuItemConstructorOptions;
      }),
    })),
  ];

  return Menu.buildFromTemplate(template);
}

function installApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  Menu.setApplicationMenu(createMacOSApplicationMenu());
}

function hideMainWindowToTray(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.hide();
}

function shouldShowFloatingInfoWindow(): boolean {
  return getConfigValue(FLOATING_INFO_VISIBLE_CONFIG_KEY) === true;
}

function getFloatingInfoWindowDimensions(mode: FloatingInfoWindowMode): { width: number; height: number } {
  if (mode === 'detail') {
    return {
      width: FLOATING_INFO_DETAIL_WIDTH,
      height: FLOATING_INFO_DETAIL_HEIGHT,
    };
  }

  if (mode === 'expanded') {
    return {
      width: FLOATING_INFO_EXPANDED_WIDTH,
      height: FLOATING_INFO_EXPANDED_HEIGHT,
    };
  }

  return {
    width: FLOATING_INFO_COLLAPSED_WIDTH,
    height: FLOATING_INFO_COLLAPSED_HEIGHT,
  };
}

function getFloatingInfoWindowBounds(mode: FloatingInfoWindowMode) {
  const { workArea } = screen.getPrimaryDisplay();
  const { width, height } = getFloatingInfoWindowDimensions(mode);

  return {
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 24,
  };
}

function applyFloatingInfoWindowBounds(window: BrowserWindow, mode: FloatingInfoWindowMode): void {
  const bounds = getFloatingInfoWindowBounds(mode);
  window.setBounds(bounds, false);
}

function createFloatingInfoWindow(): BrowserWindow {
  if (floatingInfoWindow && !floatingInfoWindow.isDestroyed()) {
    return floatingInfoWindow;
  }

  const bounds = getFloatingInfoWindowBounds(floatingInfoWindowMode);
  const preloadFile = getPreloadPath();
  const backgroundColor = getConfiguredWindowBackgroundColor(
    WORKBENCH_FLOATING_INFO_BACKGROUND_COLOR_CONFIG_KEY,
    DEFAULT_FLOATING_INFO_BACKGROUND_COLOR,
  );
  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: FLOATING_INFO_COLLAPSED_WIDTH,
    minHeight: FLOATING_INFO_COLLAPSED_HEIGHT,
    maxWidth: FLOATING_INFO_DETAIL_WIDTH,
    maxHeight: FLOATING_INFO_DETAIL_HEIGHT,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    title: FLOATING_INFO_WINDOW_TITLE,
    backgroundColor,
    icon: createAppLogoNativeImage(256),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadFile,
      webSecurity: true,
    },
  });

  if (process.env['VITE_DEV_SERVER_URL']) {
    window.loadURL(withRendererSurfaceQuery(getFloatingInfoRendererUrl(), backgroundColor));
  } else {
    window.loadFile(getFloatingInfoRendererPath(), {
      query: createRendererSurfaceQuery(backgroundColor),
    });
  }

  window.setAlwaysOnTop(true, 'screen-saver');
  window.on('closed', () => {
    if (floatingInfoWindow === window) {
      floatingInfoWindow = null;
    }
  });

  floatingInfoWindow = window;
  return window;
}

function setFloatingInfoWindowVisible(visible: boolean): boolean {
  if (visible) {
    const window = createFloatingInfoWindow();
    applyFloatingInfoWindowBounds(window, floatingInfoWindowMode);
    window.show();
    return true;
  }

  if (!floatingInfoWindow || floatingInfoWindow.isDestroyed()) {
    return false;
  }

  floatingInfoWindow.hide();
  return true;
}

function setFloatingInfoWindowExpanded(expanded: boolean): boolean {
  return setFloatingInfoWindowMode(expanded ? 'expanded' : 'collapsed');
}

function setFloatingInfoWindowMode(mode: FloatingInfoWindowMode): boolean {
  floatingInfoWindowMode = mode;

  if (!floatingInfoWindow || floatingInfoWindow.isDestroyed()) {
    return false;
  }

  applyFloatingInfoWindowBounds(floatingInfoWindow, mode);
  return true;
}

function getConfiguredCloseAction(): 'quit' | 'tray' {
  const value = getConfigValue(CLOSE_ACTION_CONFIG_KEY);
  return value === 'tray' ? 'tray' : 'quit';
}

function executeCloseAction(action: 'quit' | 'tray'): void {
  pendingWindowCloseRequest = null;

  if (action === 'tray') {
    hideMainWindowToTray();
    return;
  }

  isQuitting = true;
  app.quit();
}

function createTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Open Pristine',
      click: () => {
        showMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Pristine',
      click: () => {
        requestApplicationQuit();
      },
    },
  ]);
}

function requestRendererWindowClose(action: 'quit' | 'tray'): void {
  if (pendingWindowCloseRequest) {
    return;
  }

  const request: WindowCloseRequest = {
    requestId: nextWindowCloseRequestId++,
    action,
  };

  pendingWindowCloseRequest = request;
  sendWindowCloseRequestToMainWindow(request);
}

function resolveWindowCloseRequest(requestId: number, decision: WindowCloseDecision): boolean {
  if (!pendingWindowCloseRequest || pendingWindowCloseRequest.requestId !== requestId) {
    return false;
  }

  const { action } = pendingWindowCloseRequest;
  pendingWindowCloseRequest = null;

  if (decision === 'cancel') {
    return true;
  }

  executeCloseAction(action);
  return true;
}

function createTray(): Tray {
  if (tray) {
    return tray;
  }

  const nextTray = new Tray(createAppLogoNativeImage(32));
  const trayMenu = createTrayMenu();

  nextTray.setToolTip('Pristine');
  nextTray.setContextMenu(trayMenu);
  nextTray.on('click', () => {
    nextTray.popUpContextMenu(trayMenu);
  });

  tray = nextTray;
  return nextTray;
}

function createSplashWindow(): BrowserWindow {
  const backgroundColor = getConfiguredWindowBackgroundColor(
    WORKBENCH_SPLASH_BACKGROUND_COLOR_CONFIG_KEY,
    DEFAULT_SPLASH_BACKGROUND_COLOR,
  );
  const window = new BrowserWindow({
    width: 720,
    height: 405,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: true,
    center: true,
    skipTaskbar: true,
    backgroundColor,
    autoHideMenuBar: true,
    icon: createAppLogoNativeImage(256),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.loadFile(getSplashHtmlPath(), {
    query: createRendererSurfaceQuery(backgroundColor),
  });
  window.on('closed', () => {
    if (splashWindow === window) {
      splashWindow = null;
    }
  });

  splashWindow = window;
  return window;
}

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const preloadFile = getPreloadPath();
  const backgroundColor = getConfiguredWindowBackgroundColor(
    WORKBENCH_STARTUP_BACKGROUND_COLOR_CONFIG_KEY,
    DEFAULT_STARTUP_BACKGROUND_COLOR,
  );

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: isMac,
    show: false,
    backgroundColor,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 10 } : undefined,
    icon: createAppLogoNativeImage(256),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadFile,
      webSecurity: true,
    },
  });

  mainWindow = window;
  setupWindowStreams(window);
  applyProjectWindowState(pendingProjectWindowState);

  // Dev mode: load Vite dev server; Prod mode: load built files
  if (process.env['VITE_DEV_SERVER_URL']) {
    window.loadURL(process.env['VITE_DEV_SERVER_URL']);
  } else {
    window.loadFile(getMainRendererPath());
  }

  window.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    requestRendererWindowClose(getConfiguredCloseAction());
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
      pendingWindowCloseRequest = null;
    }
  });

  return window;
}

function waitForWindowReady(window: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    window.once('ready-to-show', () => {
      resolve();
    });
  });
}

function waitForMinimumSplashDuration(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, MINIMUM_SPLASH_DURATION_MS);
  });
}

function waitForWorkspaceReady(): Promise<void> {
  return Promise.race([
    workspaceReadyPromise,
    new Promise<void>((resolve) => {
      setTimeout(resolve, WORKSPACE_READY_TIMEOUT_MS);
    }),
  ]);
}

function showMainWindowWhenReady(window: BrowserWindow, splash: BrowserWindow): void {
  void Promise.all([waitForWindowReady(window), waitForMinimumSplashDuration(), waitForWorkspaceReady()]).then(() => {
    if (mainWindow === window) {
      applyPendingProjectWindowVisibilityState(window);
      window.show();
    }

    if (splashWindow === splash) {
      splash.close();
    }
  });
}

function createStartupWindows(): void {
  resetWorkspaceReadyWait();
  const splash = createSplashWindow();
  const window = createMainWindow();

  showMainWindowWhenReady(window, splash);
}

configureElectronStoragePaths();
tryOpenStartupProject(resolveStartupProjectRoot(
  process.env['PRISTINE_PROJECT_ROOT'],
  getConfigValue(PROJECT_LAST_ROOT_CONFIG_KEY),
), setProjectRoot, applyProjectWindowState);
registerDeepLinkProtocol();

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  pendingAuthCallbackUrl = findAuthCallbackUrl(process.argv);

  app.on('second-instance', (_event, argv) => {
    const nextAuthCallbackUrl = findAuthCallbackUrl(argv);

    if (nextAuthCallbackUrl) {
      processAuthCallbackUrl(nextAuthCallbackUrl);
    }

    showMainWindow();
  });

  // Register all IPC handlers before window creation
  registerAllHandlers(
    getMainWindow,
    setFloatingInfoWindowVisible,
    setFloatingInfoWindowExpanded,
    setFloatingInfoWindowMode,
    resolveWindowCloseRequest,
    getProjectWindowState,
    applyProjectWindowState,
    markWorkspaceReady,
  );

  app.whenReady().then(() => {
    installApplicationMenu();
    ensureWindowsNotificationShortcut();
    createTray();
    createStartupWindows();

    if (shouldShowFloatingInfoWindow()) {
      setFloatingInfoWindowVisible(true);
    }

    if (pendingAuthCallbackUrl) {
      processAuthCallbackUrl(pendingAuthCallbackUrl);
    }

    app.on('open-url', (event, url) => {
      event.preventDefault();
      processAuthCallbackUrl(url);
      showMainWindow();
    });

    app.on('activate', () => {
      if (mainWindow) {
        showMainWindow();
        return;
      }

      if (BrowserWindow.getAllWindows().length === 0) {
        createStartupWindows();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    void stopPristineEdaEnvironment().catch(() => undefined);
    flushPendingConfigSave();
    disposeProjectService(getProjectWindowState);
    disposeLspSession();
    disposeAllTerminalSessions();
    tray?.destroy();
    tray = null;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
