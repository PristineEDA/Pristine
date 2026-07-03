import fs from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';

export const PRISTINE_APP_USER_MODEL_ID = 'com.pristine.ide';
export const PRISTINE_SHORTCUT_NAME = 'Pristine.lnk';

function getProgramsShortcutPath(): string {
  return path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    PRISTINE_SHORTCUT_NAME,
  );
}

export function ensureWindowsNotificationShortcut(): boolean {
  if (process.platform !== 'win32' || process.defaultApp) {
    return false;
  }

  const shortcutPath = getProgramsShortcutPath();
  const operation = fs.existsSync(shortcutPath) ? 'update' : 'create';

  try {
    return shell.writeShortcutLink(shortcutPath, operation, {
      appUserModelId: PRISTINE_APP_USER_MODEL_ID,
      description: 'Pristine',
      icon: process.execPath,
      iconIndex: 0,
      target: process.execPath,
      cwd: path.dirname(process.execPath),
    });
  } catch {
    return false;
  }
}
