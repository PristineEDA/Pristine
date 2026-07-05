import { BrowserWindow, Notification, app, ipcMain } from 'electron';
import { pathToFileURL } from 'node:url';
import { AsyncChannels, StreamChannels } from './channels.js';
import { getConfigValue } from './config.js';
import type {
  NotificationAction,
  NotificationActionLabel,
  NotificationLevel,
  NotificationPublishInput,
  NotificationRecord,
  NotificationVariant,
} from '../../types/notification.js';
import { createAppLogoNativeImage, getAppLogoPath } from '../appLogo.js';
import { PRISTINE_APP_USER_MODEL_ID } from '../windowsNotificationIdentity.js';

export const NOTIFICATION_DISMISS_SECONDS_CONFIG_KEY = 'notifications.dismissSeconds';
export const DEFAULT_NOTIFICATION_DISMISS_SECONDS = 5;
export const MIN_NOTIFICATION_DISMISS_SECONDS = 1;
export const MAX_NOTIFICATION_DISMISS_SECONDS = 10;

const activeNotifications = new Map<string, Electron.Notification>();
const closeTimers = new Map<string, ReturnType<typeof setTimeout>>();
let history: NotificationRecord[] = [];
let getMainWindowForNotifications: (() => BrowserWindow | null) | null = null;
let onNotificationHistoryChanged: ((records: NotificationRecord[]) => void) | null = null;
let nextNotificationId = 1;
const PRISTINE_NOTIFICATION_TITLE = 'Pristine';
const DEFAULT_ACTION_NOTIFICATION_ACTIONS: NotificationAction[] = [
  { label: 'Mark as Read' },
  { label: 'Delete' },
];

export function parseNotificationDismissSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_NOTIFICATION_DISMISS_SECONDS;
  }

  return Math.min(
    MAX_NOTIFICATION_DISMISS_SECONDS,
    Math.max(MIN_NOTIFICATION_DISMISS_SECONDS, Math.round(value)),
  );
}

function getConfiguredDismissSeconds(): number {
  return parseNotificationDismissSeconds(getConfigValue(NOTIFICATION_DISMISS_SECONDS_CONFIG_KEY));
}

function isNotificationLevel(value: unknown): value is NotificationLevel {
  return value === 'error' || value === 'info' || value === 'warning';
}

function isNotificationVariant(value: unknown): value is NotificationVariant {
  return value === 'actions' || value === 'standard';
}

function isNotificationActionLabel(value: unknown): value is NotificationActionLabel {
  return value === 'Delete' || value === 'Mark as Read';
}

function normalizeNotificationActions(value: unknown, variant: NotificationVariant): NotificationAction[] | undefined {
  if (variant !== 'actions') {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return DEFAULT_ACTION_NOTIFICATION_ACTIONS;
  }

  const actions = value
    .map((entry): NotificationAction | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const label = (entry as { label?: unknown }).label;
      return isNotificationActionLabel(label) ? { label } : null;
    })
    .filter((entry): entry is NotificationAction => entry !== null);

  return actions.length > 0 ? actions : DEFAULT_ACTION_NOTIFICATION_ACTIONS;
}

function normalizePublishInput(input: unknown): NotificationPublishInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Expected notification input object');
  }

  const candidate = input as Record<string, unknown>;
  if (!isNotificationLevel(candidate.level)) {
    throw new Error('Expected notification level to be info, warning, or error');
  }

  if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) {
    throw new Error('Expected notification title');
  }

  const variant = isNotificationVariant(candidate.variant) ? candidate.variant : 'standard';

  return {
    actions: normalizeNotificationActions(candidate.actions, variant),
    body: typeof candidate.body === 'string' ? candidate.body : '',
    level: candidate.level,
    title: candidate.title.trim(),
    variant,
  };
}

function broadcastHistoryChanged(): void {
  const payload = getNotificationHistory();
  onNotificationHistoryChanged?.(payload);

  BrowserWindow.getAllWindows().forEach((window) => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }

    window.webContents.send(StreamChannels.NOTIFICATIONS_HISTORY_CHANGED, payload);
  });
}

function markNotificationRead(id: string): void {
  let changed = false;
  const now = Date.now();

  history = history.map((record) => {
    if (record.id !== id || record.readAt !== undefined) {
      return record;
    }

    changed = true;
    return {
      ...record,
      readAt: now,
    };
  });

  if (changed) {
    broadcastHistoryChanged();
  }
}

function markNotificationReadAndFocus(id: string): void {
  markNotificationRead(id);
  focusMainWindow();
}

function focusMainWindow(): void {
  const window = getMainWindowForNotifications?.();
  if (!window || window.isDestroyed()) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  if (!window.isVisible()) {
    window.show();
  }

  window.focus();
}

function scheduleNotificationClose(record: NotificationRecord): void {
  const timeoutMs = Math.max(0, record.expiresAt - Date.now());
  const timer = setTimeout(() => {
    closeTimers.delete(record.id);
    const notification = activeNotifications.get(record.id);
    if (!notification) {
      return;
    }

    notification.close();
    activeNotifications.delete(record.id);
  }, timeoutMs);

  closeTimers.set(record.id, timer);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function getNotificationBody(record: NotificationRecord): string {
  return record.body.trim().length > 0
    ? `${record.title}\n${record.body}`
    : record.title;
}

function encodeFileUrlPathSegments(value: string): string {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getNotificationIconFileUrl(filePath: string): string {
  if (process.platform !== 'win32') {
    return pathToFileURL(filePath).toString();
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  const drivePathMatch = /^([A-Za-z]:)\/(.*)$/.exec(normalizedPath);
  if (drivePathMatch) {
    return `file:///${drivePathMatch[1]}/${encodeFileUrlPathSegments(drivePathMatch[2])}`;
  }

  if (normalizedPath.startsWith('//')) {
    const withoutPrefix = normalizedPath.slice(2);
    return `file://${encodeFileUrlPathSegments(withoutPrefix)}`;
  }

  return pathToFileURL(filePath).toString();
}

function createWindowsActionToastXml(record: NotificationRecord): string {
  const logoPath = getAppLogoPath(64);
  const appLogoImage = logoPath
    ? `<image placement="appLogoOverride" src="${escapeXml(getNotificationIconFileUrl(logoPath))}" hint-crop="circle" />`
    : '';
  const actions = (record.actions ?? DEFAULT_ACTION_NOTIFICATION_ACTIONS)
    .map((action) => (
      `<action content="${escapeXml(action.label)}" arguments="pristine-notification:${escapeXml(action.label)}" activationType="foreground" />`
    ))
    .join('');

  return [
    '<toast>',
    '<visual>',
    '<binding template="ToastGeneric">',
    `<text>${escapeXml(PRISTINE_NOTIFICATION_TITLE)}</text>`,
    `<text>${escapeXml(getNotificationBody(record))}</text>`,
    appLogoImage,
    '</binding>',
    '</visual>',
    `<actions>${actions}</actions>`,
    '</toast>',
  ].join('');
}

function createNativeNotificationOptions(record: NotificationRecord): Electron.NotificationConstructorOptions {
  const body = getNotificationBody(record);

  if (record.variant === 'actions' && process.platform === 'win32') {
    return {
      toastXml: createWindowsActionToastXml(record),
    };
  }

  const options: Electron.NotificationConstructorOptions = {
    body,
    icon: createAppLogoNativeImage(64),
    silent: false,
    title: PRISTINE_NOTIFICATION_TITLE,
  };

  if (record.variant === 'actions' && process.platform === 'darwin') {
    options.actions = (record.actions ?? DEFAULT_ACTION_NOTIFICATION_ACTIONS).map((action) => ({
      text: action.label,
      type: 'button',
    }));
  }

  return options;
}

function showNativeNotification(record: NotificationRecord): void {
  if (process.env['PRISTINE_E2E'] === '1' || !Notification.isSupported()) {
    return;
  }

  try {
    const notification = new Notification(createNativeNotificationOptions(record));

    activeNotifications.set(record.id, notification);
    notification.once('action', () => markNotificationReadAndFocus(record.id));
    notification.once('click', () => markNotificationReadAndFocus(record.id));
    notification.once('close', () => {
      activeNotifications.delete(record.id);
      const timer = closeTimers.get(record.id);
      if (timer) {
        clearTimeout(timer);
        closeTimers.delete(record.id);
      }
    });
    notification.show();
    scheduleNotificationClose(record);
  } catch {
    activeNotifications.delete(record.id);
  }
}

export function publishNotification(input: unknown): NotificationRecord {
  const normalized = normalizePublishInput(input);
  const now = Date.now();
  const dismissSeconds = getConfiguredDismissSeconds();
  const record: NotificationRecord = {
    body: normalized.body ?? '',
    createdAt: now,
    expiresAt: now + dismissSeconds * 1000,
    id: `notification-${now}-${nextNotificationId++}`,
    level: normalized.level,
    title: normalized.title,
    variant: normalized.variant ?? 'standard',
  };
  if (normalized.actions) {
    record.actions = normalized.actions.map((action) => ({ ...action }));
  }

  history = [record, ...history];
  showNativeNotification(record);
  broadcastHistoryChanged();
  return record;
}

export function dismissNotification(id: unknown): void {
  if (typeof id !== 'string') {
    throw new Error('Expected notification id');
  }

  history = history.filter((record) => record.id !== id);

  const timer = closeTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    closeTimers.delete(id);
  }

  const notification = activeNotifications.get(id);
  if (notification) {
    notification.close();
    activeNotifications.delete(id);
  }

  broadcastHistoryChanged();
}

export function getNotificationHistory(): NotificationRecord[] {
  return history.map((record) => ({
    ...record,
    actions: record.actions?.map((action) => ({ ...action })),
  }));
}

export function resetNotificationServiceForTests(): void {
  history = [];
  onNotificationHistoryChanged = null;
  activeNotifications.forEach((notification) => notification.close());
  activeNotifications.clear();
  closeTimers.forEach((timer) => clearTimeout(timer));
  closeTimers.clear();
  nextNotificationId = 1;
}

export function registerNotificationHandlers(
  getMainWindow: () => BrowserWindow | null,
  onHistoryChanged: (records: NotificationRecord[]) => void = () => undefined,
): void {
  getMainWindowForNotifications = getMainWindow;
  onNotificationHistoryChanged = onHistoryChanged;
  app.setName(PRISTINE_NOTIFICATION_TITLE);

  if (process.platform === 'win32') {
    app.setAppUserModelId(PRISTINE_APP_USER_MODEL_ID);
  }

  ipcMain.handle(AsyncChannels.NOTIFICATIONS_PUBLISH, async (_event, input: unknown) => publishNotification(input));
  ipcMain.handle(AsyncChannels.NOTIFICATIONS_DISMISS, async (_event, id: unknown) => {
    dismissNotification(id);
  });
  ipcMain.handle(AsyncChannels.NOTIFICATIONS_GET_HISTORY, async () => getNotificationHistory());
}
