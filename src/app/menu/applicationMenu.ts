export const APP_DISPLAY_NAME = 'Pristine';

export type AppMenuAction =
  | 'open-new-project'
  | 'open-project'
  | 'close-project'
  | 'open-settings'
  | 'open-about'
  | 'open-notice-files'
  | 'run-notification-progress-demo'
  | 'save-file'
  | 'save-all-files'
  | 'undo-editor'
  | 'redo-editor'
  | 'close-app';

export type AppMenuItem = {
  kind: 'item';
  name: string;
  shortcut?: string;
  action?: AppMenuAction;
};

export type AppMenuSeparator = {
  kind: 'separator';
};

export type AppMenuEntry = AppMenuItem | AppMenuSeparator;

export type AppMenuSection = {
  label: string;
  items: AppMenuEntry[];
};

export type MenuCommandEvent = {
  action: Exclude<AppMenuAction, 'close-app'>;
};

export const applicationMenus: AppMenuSection[] = [
  {
    label: 'File',
    items: [
      { kind: 'item', name: 'New Project', shortcut: 'Shift+Mod+N', action: 'open-new-project' },
      { kind: 'item', name: 'Open Project...', shortcut: 'Mod+O', action: 'open-project' },
      { kind: 'item', name: 'Close Project', action: 'close-project' },
      { kind: 'separator' },
      { kind: 'item', name: 'Save', shortcut: 'Mod+S', action: 'save-file' },
      { kind: 'item', name: 'Save All', action: 'save-all-files' },
      { kind: 'item', name: 'Save As...', shortcut: 'Shift+Mod+S' },
      { kind: 'separator' },
      { kind: 'item', name: 'notif', action: 'run-notification-progress-demo' },
      { kind: 'separator' },
      { kind: 'item', name: 'Setting...', action: 'open-settings' },
      { kind: 'item', name: 'Close', shortcut: 'Mod+Q', action: 'close-app' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { kind: 'item', name: 'Undo', shortcut: 'Mod+Z', action: 'undo-editor' },
      { kind: 'item', name: 'Redo', shortcut: 'Mod+Y', action: 'redo-editor' },
      { kind: 'separator' },
      { kind: 'item', name: 'Cut', shortcut: 'Mod+X' },
      { kind: 'item', name: 'Copy', shortcut: 'Mod+C' },
      { kind: 'item', name: 'Paste', shortcut: 'Mod+V' },
      { kind: 'separator' },
      { kind: 'item', name: 'Find', shortcut: 'Mod+F' },
      { kind: 'item', name: 'Replace', shortcut: 'Mod+H' },
    ],
  },
  {
    label: 'Help',
    items: [
      { kind: 'item', name: 'Documentation' },
      { kind: 'item', name: 'Check for Update...' },
      { kind: 'separator' },
      { kind: 'item', name: 'Open Notice Files', action: 'open-notice-files' },
      { kind: 'item', name: 'About', action: 'open-about' },
    ],
  },
];

export function isAppMenuItem(entry: AppMenuEntry): entry is AppMenuItem {
  return entry.kind === 'item';
}

export function findApplicationMenuItem(menuLabel: string, itemName: string): AppMenuItem | undefined {
  const menu = applicationMenus.find((entry) => entry.label === menuLabel);
  const item = menu?.items.find((entry) => isAppMenuItem(entry) && entry.name === itemName);
  return item && isAppMenuItem(item) ? item : undefined;
}

export function getApplicationMenuItemAction(menuLabel: string, itemName: string): AppMenuAction | null {
  return findApplicationMenuItem(menuLabel, itemName)?.action ?? null;
}

export function getApplicationMenuItemShortcut(menuLabel: string, itemName: string): string | undefined {
  return findApplicationMenuItem(menuLabel, itemName)?.shortcut;
}

export function toElectronAccelerator(shortcut?: string): string | undefined {
  if (!shortcut) {
    return undefined;
  }

  return shortcut
    .split('+')
    .map((token) => (token === 'Mod' ? 'CommandOrControl' : token))
    .join('+');
}
