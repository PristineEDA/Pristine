import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { loadBetterSqlite } from './betterSqlite.js';
import type {
  CreateProjectInput,
  ProjectConfig,
  ProjectBottomPanelSession,
  ProjectBottomPanelTabId,
  ProjectBottomPanelTabLayout,
  ProjectExplorerTreeSession,
  ProjectSidePanelSession,
  ProjectSessionSnapshot,
  ProjectState,
  ProjectWindowState,
} from '../../types/project.js';

const PROJECT_DATA_DIRECTORY_NAME = '.pristine';
const PROJECT_DATABASE_FILE_NAME = 'project.sqlite';
const PROJECT_SESSION_STATE_KEY = 'workspace-session';
const PROJECT_SCHEMA_VERSION = 1;

let currentDatabase: BetterSqliteDatabase | null = null;
let currentProject: Omit<ProjectState, 'session'> | null = null;
let lastFlushedSessionSnapshot: ProjectSessionSnapshot | null = null;

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  mode: 'rtl2gds',
  process: 'ics55',
  type: 'retroSoC',
  mgnt: 'none',
  padframe: 'QFN32',
};

function getDatabasePath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_DATA_DIRECTORY_NAME, PROJECT_DATABASE_FILE_NAME);
}

function getProjectName(rootPath: string): string {
  return path.basename(path.resolve(rootPath));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const DEFAULT_PROJECT_WINDOW_STATE: ProjectWindowState = {
  bounds: null,
  maximized: false,
};

const DEFAULT_PROJECT_SIDE_PANEL_SESSION: ProjectSidePanelSession = {
  assistantThreadListExpanded: false,
  assistantThreadListWidth: 140,
  leftPrimaryTab: 'explorer',
  leftSecondaryTab: 'hierarchy',
  leftSplitVisible: false,
  physicalBottomTab: 'reports',
  physicalLeftSplitVisible: false,
  physicalLeftTab: 'layout',
  physicalRightSplitVisible: false,
  physicalRightTab: 'layers',
  rightPrimaryTab: 'ai',
  rightSecondaryTab: 'module-info',
  rightSplitVisible: false,
};

const DEFAULT_PROJECT_EXPLORER_TREE_SESSION: ProjectExplorerTreeSession = {
  expandedPaths: ['.'],
  scrollTop: 0,
  selectedNode: null,
};

const PROJECT_BOTTOM_PANEL_TABS = [
  'terminal',
  'output',
  'problems',
  'debug',
  'lsp',
  'schematic',
  'waveform',
  'synthesis',
] as const satisfies readonly ProjectBottomPanelTabId[];

function createBottomPaneId(tab: ProjectBottomPanelTabId, index: number): string {
  return tab === 'terminal' ? `bottom-pane-${index}` : `bottom-pane-${tab}-${index}`;
}

function createDefaultBottomTabLayout(tab: ProjectBottomPanelTabId): ProjectBottomPanelTabLayout {
  const pane = {
    content: { kind: 'tab' as const, tab },
    id: createBottomPaneId(tab, 1),
    size: 100,
  };
  return {
    focusedPaneId: pane.id,
    nextPaneIndex: 2,
    panes: [pane],
  };
}

function createDefaultBottomPanelSession(): ProjectBottomPanelSession {
  return {
    activeTab: 'terminal',
    tabs: Object.fromEntries(PROJECT_BOTTOM_PANEL_TABS.map((tab) => [
      tab,
      createDefaultBottomTabLayout(tab),
    ])) as Record<ProjectBottomPanelTabId, ProjectBottomPanelTabLayout>,
  };
}

const DEFAULT_PROJECT_BOTTOM_PANEL_SESSION: ProjectBottomPanelSession = createDefaultBottomPanelSession();

function getDefaultBottomTabLayout(tab: ProjectBottomPanelTabId): ProjectBottomPanelTabLayout {
  return DEFAULT_PROJECT_BOTTOM_PANEL_SESSION.tabs[tab] ?? createDefaultBottomTabLayout(tab);
}

export function isValidProjectDatabase(rootPath: string): boolean {
  return fs.existsSync(getDatabasePath(rootPath));
}

export function createDefaultProjectSession(): ProjectSessionSnapshot {
  return {
    activeView: 'explorer',
    editorGroups: [],
    editorLayout: null,
    focusedGroupId: null,
    mainContentView: 'code',
    panelStateByView: {
      explorer: {
        showLeftPanel: true,
        showBottomPanel: false,
        showRightPanel: false,
      },
      simulation: {
        showLeftPanel: true,
        showBottomPanel: true,
        showRightPanel: true,
      },
      synthesis: {
        showLeftPanel: true,
        showBottomPanel: true,
        showRightPanel: true,
      },
      physical: {
        showLeftPanel: true,
        showBottomPanel: true,
        showRightPanel: true,
      },
      factory: {
        showLeftPanel: false,
        showBottomPanel: false,
        showRightPanel: false,
      },
    },
    bottomPanelSession: cloneBottomPanelSession(DEFAULT_PROJECT_BOTTOM_PANEL_SESSION),
    explorerTreeSession: cloneExplorerTreeSession(DEFAULT_PROJECT_EXPLORER_TREE_SESSION),
    version: 1,
    sidePanelSession: { ...DEFAULT_PROJECT_SIDE_PANEL_SESSION },
    windowState: cloneWindowState(DEFAULT_PROJECT_WINDOW_STATE),
  };
}

function migrateDatabase(database: BetterSqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  database.prepare(`
    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
    VALUES (?, ?)
  `).run(PROJECT_SCHEMA_VERSION, new Date().toISOString());
}

function writeMetadata(database: BetterSqliteDatabase, key: string, value: unknown): void {
  database.prepare(`
    INSERT INTO metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

function readMetadataValue(database: BetterSqliteDatabase, key: string): unknown {
  const row = database.prepare('SELECT value FROM metadata WHERE key = ?')
    .get(key) as { value: string } | undefined;

  if (!row) {
    return undefined;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function normalizeProjectConfig(value: unknown): ProjectConfig {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_PROJECT_CONFIG };
  }

  return {
    mode: typeof value['mode'] === 'string' && value['mode'].trim().length > 0
      ? value['mode']
      : DEFAULT_PROJECT_CONFIG.mode,
    process: typeof value['process'] === 'string' && value['process'].trim().length > 0
      ? value['process']
      : DEFAULT_PROJECT_CONFIG.process,
    type: typeof value['type'] === 'string' && value['type'].trim().length > 0
      ? value['type']
      : DEFAULT_PROJECT_CONFIG.type,
    mgnt: typeof value['mgnt'] === 'string' && value['mgnt'].trim().length > 0
      ? value['mgnt']
      : DEFAULT_PROJECT_CONFIG.mgnt,
    padframe: typeof value['padframe'] === 'string' && value['padframe'].trim().length > 0
      ? value['padframe']
      : DEFAULT_PROJECT_CONFIG.padframe,
  };
}

function readProjectConfig(database: BetterSqliteDatabase): ProjectConfig {
  return normalizeProjectConfig(readMetadataValue(database, 'template'));
}

function writeProjectConfig(database: BetterSqliteDatabase, config: ProjectConfig): ProjectConfig {
  const normalizedConfig = normalizeProjectConfig(config);
  writeMetadata(database, 'template', normalizedConfig);
  return normalizedConfig;
}

function writeSession(database: BetterSqliteDatabase, snapshot: ProjectSessionSnapshot): void {
  database.prepare(`
    INSERT INTO session_state (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(PROJECT_SESSION_STATE_KEY, JSON.stringify(snapshot), new Date().toISOString());
  lastFlushedSessionSnapshot = snapshot;
}

function readSession(database: BetterSqliteDatabase): ProjectSessionSnapshot | null {
  const row = database.prepare('SELECT value_json FROM session_state WHERE key = ?')
    .get(PROJECT_SESSION_STATE_KEY) as { value_json: string } | undefined;

  if (!row) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.value_json) as unknown;
    return normalizeProjectSessionSnapshot(parsed);
  } catch {
    return null;
  }
}

function normalizeProjectSessionSnapshot(value: unknown): ProjectSessionSnapshot | null {
  if (!isPlainObject(value) || value['version'] !== 1) {
    return null;
  }

  const defaultSession = createDefaultProjectSession();
  const activeView = typeof value['activeView'] === 'string' && value['activeView'] in defaultSession.panelStateByView
    ? value['activeView'] as ProjectSessionSnapshot['activeView']
    : defaultSession.activeView;
  const mainContentView = value['mainContentView'] === 'whiteboard' || value['mainContentView'] === 'workflow'
    ? value['mainContentView']
    : 'code';
  const panelStateByView = isPlainObject(value['panelStateByView'])
    ? {
        ...defaultSession.panelStateByView,
        ...value['panelStateByView'],
      } as ProjectSessionSnapshot['panelStateByView']
    : defaultSession.panelStateByView;
  const panelWidths = isPlainObject(value['panelWidths'])
    ? Object.fromEntries(
        Object.entries(value['panelWidths'])
          .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])),
      )
    : undefined;
  const sidePanelSession = normalizeSidePanelSession(value['sidePanelSession'], defaultSession.sidePanelSession);
  const bottomPanelSession = normalizeBottomPanelSession(value['bottomPanelSession'], defaultSession.bottomPanelSession);
  const explorerTreeSession = normalizeExplorerTreeSession(
    value['explorerTreeSession'],
    defaultSession.explorerTreeSession,
  );
  const windowState = normalizeWindowState(value['windowState']);

  return {
    activeTabId: typeof value['activeTabId'] === 'string' ? value['activeTabId'] : undefined,
    activeView,
    editorGroups: Array.isArray(value['editorGroups'])
      ? value['editorGroups'] as ProjectSessionSnapshot['editorGroups']
      : defaultSession.editorGroups,
    editorLayout: isPlainObject(value['editorLayout'])
      ? value['editorLayout'] as unknown as ProjectSessionSnapshot['editorLayout']
      : null,
    explorerTreeSession,
    focusedGroupId: typeof value['focusedGroupId'] === 'string' ? value['focusedGroupId'] : null,
    mainContentView,
    panelStateByView,
    panelWidths,
    bottomPanelSession,
    sidePanelSession,
    version: 1,
    windowState,
  };
}

function normalizeWindowState(value: unknown): ProjectWindowState {
  if (!isPlainObject(value)) {
    return cloneWindowState(DEFAULT_PROJECT_WINDOW_STATE);
  }

  const rawBounds = value['bounds'];
  const bounds = isPlainObject(rawBounds)
    && typeof rawBounds['x'] === 'number'
    && typeof rawBounds['y'] === 'number'
    && typeof rawBounds['width'] === 'number'
    && typeof rawBounds['height'] === 'number'
    && Number.isFinite(rawBounds['x'])
    && Number.isFinite(rawBounds['y'])
    && Number.isFinite(rawBounds['width'])
    && Number.isFinite(rawBounds['height'])
    && rawBounds['width'] >= 800
    && rawBounds['height'] >= 600
    ? {
        x: Math.round(rawBounds['x']),
        y: Math.round(rawBounds['y']),
        width: Math.round(rawBounds['width']),
        height: Math.round(rawBounds['height']),
      }
    : null;

  return {
    bounds,
    maximized: value['maximized'] === true,
  };
}

function cloneWindowState(windowState: ProjectWindowState): ProjectWindowState {
  return {
    bounds: windowState.bounds ? { ...windowState.bounds } : null,
    maximized: windowState.maximized,
  };
}

function cloneBottomPanelSession(session: ProjectBottomPanelSession): ProjectBottomPanelSession {
  return {
    activeTab: session.activeTab,
    tabs: cloneBottomTabs(session),
  };
}

function cloneBottomTabs(session: ProjectBottomPanelSession): Record<ProjectBottomPanelTabId, ProjectBottomPanelTabLayout> {
  return Object.fromEntries(PROJECT_BOTTOM_PANEL_TABS.map((tab) => [
      tab,
      cloneBottomTabLayout(session.tabs[tab] ?? getDefaultBottomTabLayout(tab)),
    ])) as Record<ProjectBottomPanelTabId, ProjectBottomPanelTabLayout>;
}

function cloneBottomTabLayout(layout: ProjectBottomPanelTabLayout): ProjectBottomPanelTabLayout {
  return {
    focusedPaneId: layout.focusedPaneId,
    nextPaneIndex: layout.nextPaneIndex,
    panes: layout.panes.map((pane) => ({
      content: { ...pane.content },
      id: pane.id,
      size: pane.size,
    })),
  };
}

function cloneExplorerTreeSession(session: ProjectExplorerTreeSession): ProjectExplorerTreeSession {
  return {
    expandedPaths: [...session.expandedPaths],
    scrollTop: session.scrollTop,
    selectedNode: session.selectedNode ? { ...session.selectedNode } : null,
  };
}

function normalizeStringOption<T extends string>(value: unknown, fallback: T, options: readonly T[]): T {
  return typeof value === 'string' && options.includes(value as T) ? value as T : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeSidePanelSession(
  value: unknown,
  fallback = DEFAULT_PROJECT_SIDE_PANEL_SESSION,
): ProjectSidePanelSession {
  if (!isPlainObject(value)) {
    return { ...fallback };
  }

  return {
    assistantThreadListExpanded: typeof value['assistantThreadListExpanded'] === 'boolean'
      ? value['assistantThreadListExpanded']
      : fallback.assistantThreadListExpanded,
    assistantThreadListWidth: normalizePositiveNumber(
      value['assistantThreadListWidth'],
      fallback.assistantThreadListWidth,
    ),
    leftPrimaryTab: normalizeStringOption(value['leftPrimaryTab'], fallback.leftPrimaryTab, ['explorer', 'git']),
    leftSecondaryTab: normalizeStringOption(
      value['leftSecondaryTab'],
      fallback.leftSecondaryTab,
      ['hierarchy', 'libraries'],
    ),
    leftSplitVisible: typeof value['leftSplitVisible'] === 'boolean'
      ? value['leftSplitVisible']
      : fallback.leftSplitVisible,
    physicalBottomTab: normalizeStringOption(
      value['physicalBottomTab'],
      fallback.physicalBottomTab,
      ['reports', 'console'],
    ),
    physicalLeftSplitVisible: typeof value['physicalLeftSplitVisible'] === 'boolean'
      ? value['physicalLeftSplitVisible']
      : fallback.physicalLeftSplitVisible,
    physicalLeftTab: normalizeStringOption(
      value['physicalLeftTab'],
      fallback.physicalLeftTab,
      ['layout', 'constraints'],
    ),
    physicalRightSplitVisible: typeof value['physicalRightSplitVisible'] === 'boolean'
      ? value['physicalRightSplitVisible']
      : fallback.physicalRightSplitVisible,
    physicalRightTab: normalizeStringOption(
      value['physicalRightTab'],
      fallback.physicalRightTab,
      ['layers', 'checks'],
    ),
    rightPrimaryTab: normalizeStringOption(
      value['rightPrimaryTab'],
      fallback.rightPrimaryTab,
      ['ai', 'static', 'references', 'outline'],
    ),
    rightSecondaryTab: normalizeStringOption(
      value['rightSecondaryTab'],
      fallback.rightSecondaryTab,
      ['module-info', 'resource-usage', 'x-propagation'],
    ),
    rightSplitVisible: typeof value['rightSplitVisible'] === 'boolean'
      ? value['rightSplitVisible']
      : fallback.rightSplitVisible,
  };
}

function normalizeExplorerTreeSession(
  value: unknown,
  fallback = DEFAULT_PROJECT_EXPLORER_TREE_SESSION,
): ProjectExplorerTreeSession {
  if (!isPlainObject(value)) {
    return cloneExplorerTreeSession(fallback);
  }

  const expandedPaths = Array.isArray(value['expandedPaths'])
    ? Array.from(new Set([
        '.',
        ...value['expandedPaths'].filter((path): path is string => typeof path === 'string' && path.trim().length > 0),
      ]))
    : [...fallback.expandedPaths];
  const rawSelectedNode = value['selectedNode'];
  let selectedNode: ProjectExplorerTreeSession['selectedNode'] = fallback.selectedNode
    ? { ...fallback.selectedNode }
    : null;
  if (
    isPlainObject(rawSelectedNode)
    && typeof rawSelectedNode['path'] === 'string'
    && (rawSelectedNode['type'] === 'file' || rawSelectedNode['type'] === 'folder')
  ) {
    selectedNode = {
      path: rawSelectedNode['path'],
      type: rawSelectedNode['type'],
    };
  }
  const scrollTop = typeof value['scrollTop'] === 'number'
    && Number.isFinite(value['scrollTop'])
    && value['scrollTop'] > 0
    ? Math.round(value['scrollTop'])
    : fallback.scrollTop;

  return {
    expandedPaths,
    scrollTop,
    selectedNode,
  };
}

function isProjectBottomPanelTabId(value: unknown): value is ProjectBottomPanelTabId {
  return typeof value === 'string' && PROJECT_BOTTOM_PANEL_TABS.includes(value as ProjectBottomPanelTabId);
}

function normalizeBottomPaneContent(value: unknown): ProjectBottomPanelTabLayout['panes'][number]['content'] {
  if (!isPlainObject(value)) {
    return { kind: 'empty' };
  }

  if (value['kind'] === 'tab' && isProjectBottomPanelTabId(value['tab'])) {
    return { kind: 'tab', tab: value['tab'] };
  }

  if (value['kind'] === 'placeholder') {
    const label = typeof value['label'] === 'string' && value['label'].trim().length > 0
      ? value['label']
      : 'Placeholder';
    const icon = value['icon'] === 'boxes' ? 'boxes' : 'file';
    return { kind: 'placeholder', icon, label };
  }

  return { kind: 'empty' };
}

function normalizeBottomPaneSizes<T extends { size: number }>(panes: T[]): T[] {
  const totalSize = panes.reduce((sum, pane) => sum + pane.size, 0);
  return panes.map((pane) => ({
    ...pane,
    size: totalSize > 0 ? (pane.size / totalSize) * 100 : 100 / panes.length,
  }));
}

function inferBottomNextPaneIndex(
  panes: ProjectBottomPanelTabLayout['panes'],
  rawNextPaneIndex: unknown,
): number {
  const maxPaneIndex = panes.reduce((maxIndex, pane) => {
    const match = pane.id.match(/(\d+)$/);
    const index = match ? Number.parseInt(match[1] ?? '', 10) : Number.NaN;
    return Number.isFinite(index) ? Math.max(maxIndex, index) : maxIndex;
  }, panes.length);
  const fallback = Math.max(maxPaneIndex + 1, panes.length + 1, 2);
  return typeof rawNextPaneIndex === 'number'
    && Number.isInteger(rawNextPaneIndex)
    && rawNextPaneIndex >= fallback
    ? rawNextPaneIndex
    : fallback;
}

function normalizeBottomTabLayout(
  tab: ProjectBottomPanelTabId,
  value: unknown,
  fallback = getDefaultBottomTabLayout(tab),
): ProjectBottomPanelTabLayout {
  if (!isPlainObject(value) || !Array.isArray(value['panes'])) {
    return cloneBottomTabLayout(fallback);
  }

  const seenPaneIds = new Set<string>();
  const panes = value['panes']
    .map((pane, index): ProjectBottomPanelTabLayout['panes'][number] | null => {
      if (!isPlainObject(pane)) {
        return null;
      }

      const id = typeof pane['id'] === 'string' && pane['id'].trim().length > 0
        ? pane['id']
        : createBottomPaneId(tab, index + 1);
      if (seenPaneIds.has(id)) {
        return null;
      }
      seenPaneIds.add(id);

      const size = typeof pane['size'] === 'number' && Number.isFinite(pane['size']) && pane['size'] > 0
        ? pane['size']
        : 100;

      return {
        content: normalizeBottomPaneContent(pane['content']),
        id,
        size,
      };
    })
    .filter((pane): pane is ProjectBottomPanelTabLayout['panes'][number] => Boolean(pane));

  if (panes.length === 0) {
    return cloneBottomTabLayout(fallback);
  }

  const normalizedPanes = normalizeBottomPaneSizes(panes);
  const focusedPaneId = typeof value['focusedPaneId'] === 'string'
    && normalizedPanes.some((pane) => pane.id === value['focusedPaneId'])
    ? value['focusedPaneId']
    : normalizedPanes[0]?.id ?? fallback.focusedPaneId;

  return {
    focusedPaneId,
    nextPaneIndex: inferBottomNextPaneIndex(normalizedPanes, value['nextPaneIndex']),
    panes: normalizedPanes,
  };
}

function normalizeLegacyBottomPanelSession(
  value: Record<string, unknown>,
  fallback = DEFAULT_PROJECT_BOTTOM_PANEL_SESSION,
): ProjectBottomPanelSession {
  const flatLayout = normalizeBottomTabLayout('terminal', value, fallback.tabs.terminal ?? getDefaultBottomTabLayout('terminal'));
  const focusedPane = flatLayout.panes.find((pane) => pane.id === flatLayout.focusedPaneId);
  const activeTab = focusedPane?.content.kind === 'tab' ? focusedPane.content.tab : fallback.activeTab;
  const groupedPanes = new Map<ProjectBottomPanelTabId, ProjectBottomPanelTabLayout['panes']>();

  flatLayout.panes.forEach((pane) => {
    const tab = pane.content.kind === 'tab' ? pane.content.tab : activeTab;
    groupedPanes.set(tab, [...(groupedPanes.get(tab) ?? []), pane]);
  });

  const tabs = cloneBottomTabs(fallback);
  groupedPanes.forEach((panes, tab) => {
    const normalizedPanes = normalizeBottomPaneSizes(panes);
    tabs[tab] = {
      focusedPaneId: normalizedPanes.some((pane) => pane.id === flatLayout.focusedPaneId)
        ? flatLayout.focusedPaneId
        : normalizedPanes[0]?.id ?? tabs[tab]?.focusedPaneId ?? getDefaultBottomTabLayout(tab).focusedPaneId,
      nextPaneIndex: inferBottomNextPaneIndex(normalizedPanes, value['nextPaneIndex']),
      panes: normalizedPanes,
    };
  });

  return {
    activeTab,
    tabs,
  };
}

function normalizeBottomPanelSession(
  value: unknown,
  fallback = DEFAULT_PROJECT_BOTTOM_PANEL_SESSION,
): ProjectBottomPanelSession {
  if (!isPlainObject(value)) {
    return cloneBottomPanelSession(fallback);
  }

  if (isPlainObject(value['tabs'])) {
    const rawTabs = value['tabs'];
    const tabs = Object.fromEntries(PROJECT_BOTTOM_PANEL_TABS.map((tab) => [
      tab,
      normalizeBottomTabLayout(tab, rawTabs[tab], fallback.tabs[tab] ?? getDefaultBottomTabLayout(tab)),
    ])) as Record<ProjectBottomPanelTabId, ProjectBottomPanelTabLayout>;

    return {
      activeTab: isProjectBottomPanelTabId(value['activeTab']) ? value['activeTab'] : fallback.activeTab,
      tabs,
    };
  }

  if (Array.isArray(value['panes'])) {
    return normalizeLegacyBottomPanelSession(value, fallback);
  }

  return cloneBottomPanelSession(fallback);
}

function openDatabase(projectRoot: string): BetterSqliteDatabase {
  const Database = loadBetterSqlite();
  const database = new Database(getDatabasePath(projectRoot));
  database.pragma('journal_mode = WAL');
  migrateDatabase(database);
  return database;
}

export async function createProjectDatabase(input: CreateProjectInput, rootPath: string): Promise<ProjectState> {
  await fsPromises.mkdir(path.join(rootPath, PROJECT_DATA_DIRECTORY_NAME), { recursive: true });

  const database = openDatabase(rootPath);
  const session = createDefaultProjectSession();
  const config = writeProjectConfig(database, input);

  writeMetadata(database, 'name', input.name);
  writeMetadata(database, 'rootPath', rootPath);
  writeMetadata(database, 'createdAt', new Date().toISOString());
  writeSession(database, session);
  database.close();

  return {
    config,
    name: input.name,
    rootPath,
    session,
  };
}

export function ensureProjectDatabase(rootPath: string): void {
  if (isValidProjectDatabase(rootPath)) {
    return;
  }

  fs.mkdirSync(path.join(rootPath, PROJECT_DATA_DIRECTORY_NAME), { recursive: true });

  const database = openDatabase(rootPath);
  const session = createDefaultProjectSession();

  writeMetadata(database, 'name', getProjectName(rootPath));
  writeMetadata(database, 'rootPath', rootPath);
  writeMetadata(database, 'createdAt', new Date().toISOString());
  writeProjectConfig(database, DEFAULT_PROJECT_CONFIG);
  writeSession(database, session);
  database.close();
}

export function openCurrentProject(rootPath: string): ProjectState {
  closeCurrentProjectDatabase();

  const resolvedRoot = path.resolve(rootPath);
  const database = openDatabase(resolvedRoot);
  currentDatabase = database;
  currentProject = {
    config: readProjectConfig(database),
    name: getProjectName(resolvedRoot),
    rootPath: resolvedRoot,
  };
  lastFlushedSessionSnapshot = readSession(database);

  return {
    ...currentProject,
    session: lastFlushedSessionSnapshot,
  };
}

export function getCurrentProjectState(): ProjectState | null {
  if (!currentProject || !currentDatabase) {
    return null;
  }

  return {
    ...currentProject,
    config: readProjectConfig(currentDatabase),
    session: readSession(currentDatabase),
  };
}

export function updateCurrentProjectConfig(config: ProjectConfig): ProjectState {
  if (!currentProject || !currentDatabase) {
    throw new Error('No project is currently open.');
  }

  const nextConfig = writeProjectConfig(currentDatabase, config);
  currentProject = {
    ...currentProject,
    config: nextConfig,
  };

  return {
    ...currentProject,
    session: readSession(currentDatabase),
  };
}

export function flushCurrentProjectSession(snapshot: ProjectSessionSnapshot): void {
  if (!currentDatabase) {
    return;
  }

  writeSession(currentDatabase, snapshot);
}

export function getLastFlushedProjectSessionSnapshot(): ProjectSessionSnapshot | null {
  return lastFlushedSessionSnapshot;
}

export function closeCurrentProjectDatabase(): void {
  if (!currentDatabase) {
    currentProject = null;
    lastFlushedSessionSnapshot = null;
    return;
  }

  currentDatabase.close();
  currentDatabase = null;
  currentProject = null;
  lastFlushedSessionSnapshot = null;
}

export function getProjectDatabasePath(rootPath: string): string {
  return getDatabasePath(rootPath);
}
