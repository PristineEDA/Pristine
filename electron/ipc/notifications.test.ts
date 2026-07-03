import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncChannels, StreamChannels } from './channels.js';

interface MockBrowserWindow {
  isDestroyed: () => boolean;
  webContents: {
    isDestroyed: () => boolean;
    send: ReturnType<typeof vi.fn>;
  };
}

const {
  mockHandle,
  mockGetAllWindows,
  mockSetAppUserModelId,
  mockSetName,
  mockNotificationShow,
  mockNotificationClose,
  mockCreateAppLogoNativeImage,
  mockGetAppLogoPath,
} = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockGetAllWindows: vi.fn<() => MockBrowserWindow[]>(() => []),
  mockSetAppUserModelId: vi.fn(),
  mockSetName: vi.fn(),
  mockNotificationShow: vi.fn(),
  mockNotificationClose: vi.fn(),
  mockCreateAppLogoNativeImage: vi.fn<(size?: number) => { kind: string }>(() => ({ kind: 'app-logo-native-image' })),
  mockGetAppLogoPath: vi.fn<(size?: number) => string | null>(() => 'C:\\Pristine\\logo-v1-64.png'),
}));

class NotificationMock {
  static isSupported = vi.fn(() => true);

  options: Electron.NotificationConstructorOptions;
  private listeners = new Map<string, () => void>();

  constructor(options: Electron.NotificationConstructorOptions) {
    this.options = options;
  }

  once(event: string, listener: () => void) {
    this.listeners.set(event, listener);
    return this;
  }

  show() {
    mockNotificationShow(this.options);
  }

  close() {
    mockNotificationClose(this.options);
    this.listeners.get('close')?.();
  }

  emit(event: string) {
    this.listeners.get(event)?.();
  }
}

vi.mock('electron', () => ({
  app: {
    setName: (...args: unknown[]) => mockSetName(...args),
    setAppUserModelId: (...args: unknown[]) => mockSetAppUserModelId(...args),
  },
  BrowserWindow: {
    getAllWindows: () => mockGetAllWindows(),
  },
  ipcMain: {
    handle: (...args: unknown[]) => mockHandle(...args),
  },
  shell: {
    writeShortcutLink: vi.fn(),
  },
  Notification: NotificationMock,
}));

vi.mock('../appLogo.js', () => ({
  createAppLogoNativeImage: (size?: number) => mockCreateAppLogoNativeImage(size),
  getAppLogoPath: (size?: number) => mockGetAppLogoPath(size),
}));

vi.mock('./config.js', () => ({
  getConfigValue: vi.fn(() => 2),
}));

async function importModule() {
  vi.resetModules();
  return import('./notifications.js');
}

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((entry) => entry[0] === channel);
  if (!call) throw new Error(`No handler registered for ${channel}`);
  return call[1];
}

describe('notification IPC handlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.clearAllMocks();
    mockGetAllWindows.mockReturnValue([]);
    NotificationMock.isSupported.mockReturnValue(true);
    mockGetAppLogoPath.mockReturnValue('C:\\Pristine\\logo-v1-64.png');
    delete process.env['PRISTINE_E2E'];
  });

  afterEach(async () => {
    const module = await import('./notifications.js');
    module.resetNotificationServiceForTests();
    vi.useRealTimers();
    delete process.env['PRISTINE_E2E'];
  });

  it('registers handlers and Windows AppUserModelID', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const { registerNotificationHandlers } = await importModule();
    registerNotificationHandlers(() => null);

    expect(mockSetName).toHaveBeenCalledWith('Pristine');
    expect(mockSetAppUserModelId).toHaveBeenCalledWith('com.pristine.ide');
    expect(mockHandle).toHaveBeenCalledWith(AsyncChannels.NOTIFICATIONS_PUBLISH, expect.any(Function));
    expect(mockHandle).toHaveBeenCalledWith(AsyncChannels.NOTIFICATIONS_DISMISS, expect.any(Function));
    expect(mockHandle).toHaveBeenCalledWith(AsyncChannels.NOTIFICATIONS_GET_HISTORY, expect.any(Function));

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('publishes native notifications and broadcasts history', async () => {
    const send = vi.fn();
    mockGetAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send,
        },
      },
    ]);

    const { registerNotificationHandlers } = await importModule();
    registerNotificationHandlers(() => null);

    const handler = getHandler(AsyncChannels.NOTIFICATIONS_PUBLISH);
    const record = await handler({}, { level: 'warning', title: 'Warn', body: 'Timing drift' });

    expect(record).toMatchObject({
      body: 'Timing drift',
      createdAt: 10_000,
      expiresAt: 12_000,
      level: 'warning',
      title: 'Warn',
      variant: 'standard',
    });
    expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
      body: 'Warn\nTiming drift',
      icon: { kind: 'app-logo-native-image' },
      title: 'Pristine',
    }));
    expect(mockCreateAppLogoNativeImage).toHaveBeenCalledWith(64);
    expect(send).toHaveBeenCalledWith(StreamChannels.NOTIFICATIONS_HISTORY_CHANGED, [record]);

    vi.advanceTimersByTime(2_000);
    expect(mockNotificationClose).toHaveBeenCalled();
  });

  it('uses Windows toast XML with action buttons for action-style native notifications', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    try {
      const { registerNotificationHandlers } = await importModule();
      registerNotificationHandlers(() => null);

      const handler = getHandler(AsyncChannels.NOTIFICATIONS_PUBLISH);
      const record = await handler({}, {
        body: 'You missed messages in OpenPencil from Discord',
        level: 'info',
        title: 'maksyuki@qq.com received 1 new message',
        variant: 'actions',
      });

      expect(record).toMatchObject({
        actions: [{ label: 'Mark as Read' }, { label: 'Delete' }],
        variant: 'actions',
      });
      expect(mockNotificationShow).toHaveBeenCalledWith({
        toastXml: expect.stringContaining('<text>Pristine</text>'),
      });
      const toastXml = (mockNotificationShow.mock.calls[0]?.[0] as { toastXml: string }).toastXml;
      expect(toastXml).toContain('maksyuki@qq.com received 1 new message');
      expect(toastXml).toContain('You missed messages in OpenPencil from Discord');
      expect(toastXml).toContain('Mark as Read');
      expect(toastXml).toContain('Delete');
      expect(toastXml).toContain('file:///C:/Pristine/logo-v1-64.png');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('uses macOS notification actions for action-style native notifications', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    try {
      const { registerNotificationHandlers } = await importModule();
      registerNotificationHandlers(() => null);

      const handler = getHandler(AsyncChannels.NOTIFICATIONS_PUBLISH);
      await handler({}, {
        body: 'Review generated layout warnings',
        level: 'warning',
        title: 'Layout warning',
        variant: 'actions',
      });

      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        actions: [
          { text: 'Mark as Read', type: 'button' },
          { text: 'Delete', type: 'button' },
        ],
        body: 'Layout warning\nReview generated layout warnings',
        icon: { kind: 'app-logo-native-image' },
        title: 'Pristine',
      }));
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('keeps history when native notifications are unsupported or skipped for e2e', async () => {
    process.env['PRISTINE_E2E'] = '1';

    const { registerNotificationHandlers } = await importModule();
    registerNotificationHandlers(() => null);

    const publish = getHandler(AsyncChannels.NOTIFICATIONS_PUBLISH);
    const getHistory = getHandler(AsyncChannels.NOTIFICATIONS_GET_HISTORY);

    const record = await publish({}, { level: 'info', title: 'Info' });

    expect(mockNotificationShow).not.toHaveBeenCalled();
    await expect(getHistory({})).resolves.toEqual([record]);
  });

  it('dismisses notifications from history and closes native instances', async () => {
    const { registerNotificationHandlers } = await importModule();
    registerNotificationHandlers(() => null);

    const publish = getHandler(AsyncChannels.NOTIFICATIONS_PUBLISH);
    const dismiss = getHandler(AsyncChannels.NOTIFICATIONS_DISMISS);
    const getHistory = getHandler(AsyncChannels.NOTIFICATIONS_GET_HISTORY);

    const record = await publish({}, { level: 'error', title: 'Error' });
    await dismiss({}, (record as { id: string }).id);

    expect(mockNotificationClose).toHaveBeenCalled();
    await expect(getHistory({})).resolves.toEqual([]);
  });
});
