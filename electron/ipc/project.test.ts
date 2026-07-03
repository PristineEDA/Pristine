import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncChannels, StreamChannels } from './channels.js';
import {
  PROJECT_LAST_ROOT_CONFIG_KEY,
  closeProject,
  registerProjectHandlers,
  tryOpenStartupProject,
} from './project.js';
import { closeCurrentProjectDatabase, getCurrentProjectState } from './projectDatabase.js';
import type { ProjectSessionSnapshot } from '../../types/project.js';

const { MockBetterSqliteDatabase, mockHandle, mockSetConfigValue, mockBrowserWindowGetAllWindows, mockDatabaseFiles } = vi.hoisted(() => {
  const databaseFiles = new Set<string>();

  class MockStatement {
    constructor(
      private readonly database: {
        metadata: Map<string, string>;
        migrations: Set<number>;
        sessions: Map<string, string>;
      },
      private readonly sql: string,
    ) {}

    run(...values: unknown[]) {
      if (this.sql.includes('INSERT OR IGNORE INTO schema_migrations')) {
        this.database.migrations.add(Number(values[0]));
      } else if (this.sql.includes('INSERT INTO metadata')) {
        this.database.metadata.set(String(values[0]), String(values[1]));
      } else if (this.sql.includes('INSERT INTO session_state')) {
        this.database.sessions.set(String(values[0]), String(values[1]));
      }

      return { changes: 1 };
    }

    get(...values: unknown[]) {
      if (this.sql.includes('SELECT value_json FROM session_state')) {
        const valueJson = this.database.sessions.get(String(values[0]));
        return valueJson ? { value_json: valueJson } : undefined;
      }

      if (this.sql.includes('SELECT value FROM metadata')) {
        const value = this.database.metadata.get(String(values[0]));
        return value ? { value } : undefined;
      }

      return undefined;
    }
  }

  class MockBetterSqliteDatabase {
    static stores = new Map<string, {
      metadata: Map<string, string>;
      migrations: Set<number>;
      sessions: Map<string, string>;
    }>();
    static filenames: string[] = [];

    readonly metadata: Map<string, string>;
    readonly migrations: Set<number>;
    readonly sessions: Map<string, string>;
    readonly filename: string;
    closed = false;

    constructor(filename: string) {
      this.filename = filename;
      MockBetterSqliteDatabase.filenames.push(filename);
      databaseFiles.add(filename);

      const store = MockBetterSqliteDatabase.stores.get(filename) ?? {
        metadata: new Map<string, string>(),
        migrations: new Set<number>(),
        sessions: new Map<string, string>(),
      };
      MockBetterSqliteDatabase.stores.set(filename, store);
      this.metadata = store.metadata;
      this.migrations = store.migrations;
      this.sessions = store.sessions;
    }

    exec() {}

    pragma() {}

    prepare(sql: string) {
      return new MockStatement(this, sql);
    }

    close() {
      this.closed = true;
    }
  }

  return {
    MockBetterSqliteDatabase,
    mockDatabaseFiles: databaseFiles,
    mockHandle: vi.fn(),
    mockSetConfigValue: vi.fn(),
    mockBrowserWindowGetAllWindows: vi.fn(() => [] as unknown[]),
  };
});

vi.mock('./betterSqlite.js', () => ({
  loadBetterSqlite: () => MockBetterSqliteDatabase,
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => mockBrowserWindowGetAllWindows(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  ipcMain: {
    handle: (...args: unknown[]) => mockHandle(...args),
  },
}));

vi.mock('./config.js', () => ({
  setConfigValue: (...args: unknown[]) => mockSetConfigValue(...args),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();

  return {
    default: {
      ...actual,
      existsSync: (filePath: fs.PathLike) => (
        mockDatabaseFiles.has(String(filePath)) || actual.existsSync(filePath)
      ),
      readFileSync: (filePath: fs.PathOrFileDescriptor, options?: { encoding?: null } | null) => {
        if (mockDatabaseFiles.has(String(filePath))) {
          return Buffer.from('SQLite format 3\0');
        }

        return actual.readFileSync(filePath, options);
      },
    },
  };
});

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = mockHandle.mock.calls.find((entry) => entry[0] === channel);

  if (!call) {
    throw new Error(`No handler registered for ${channel}`);
  }

  return call[1];
}

function createSnapshot(activeView = 'explorer'): ProjectSessionSnapshot {
  return {
    activeTabId: undefined,
    activeView: activeView as ProjectSessionSnapshot['activeView'],
    editorGroups: [],
    editorLayout: null,
    focusedGroupId: null,
    mainContentView: 'code',
    panelStateByView: {
      explorer: { showBottomPanel: true, showLeftPanel: true, showRightPanel: true },
      simulation: { showBottomPanel: true, showLeftPanel: true, showRightPanel: true },
      synthesis: { showBottomPanel: true, showLeftPanel: true, showRightPanel: true },
      physical: { showBottomPanel: true, showLeftPanel: true, showRightPanel: true },
      factory: { showBottomPanel: false, showLeftPanel: false, showRightPanel: false },
    },
    panelWidths: {
      explorerLeftPanel: 280,
    },
    version: 1,
  };
}

describe('project IPC handlers', () => {
  let temporaryDirectory: string;
  let appliedProjectRoots: Array<string | null>;
  let appliedWindowStates: unknown[];
  const capturedWindowState = {
    bounds: { height: 720, width: 1280, x: 32, y: 48 },
    maximized: true,
  };

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pristine-project-ipc-'));
    appliedProjectRoots = [];
    appliedWindowStates = [];
    mockHandle.mockClear();
    mockSetConfigValue.mockClear();
    mockBrowserWindowGetAllWindows.mockReturnValue([]);
    mockDatabaseFiles.clear();
    MockBetterSqliteDatabase.filenames = [];
    MockBetterSqliteDatabase.stores.clear();
    registerProjectHandlers(
      () => null,
      (root) => {
        appliedProjectRoots.push(root);
      },
      () => capturedWindowState,
      (windowState) => {
        appliedWindowStates.push(windowState);
      },
    );
  });

  afterEach(() => {
    closeCurrentProjectDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('creates a project directory, initializes project sqlite, switches root, and stores last root', async () => {
    const handler = getHandler(AsyncChannels.PROJECT_CREATE);

    const result = await handler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'chip_lab',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    });

    const rootPath = path.join(temporaryDirectory, 'chip_lab');
    const databasePath = path.join(rootPath, '.pristine', 'project.sqlite');

    expect(result).toEqual({
      project: expect.objectContaining({
        config: {
          mgnt: 'none',
          mode: 'rtl2gds',
          padframe: 'QFN32',
          process: 'ics55',
          type: 'retroSoC',
        },
        name: 'chip_lab',
        rootPath,
        session: expect.objectContaining({
          activeView: 'explorer',
          version: 1,
        }),
      }),
    });
    expect(fs.existsSync(path.dirname(databasePath))).toBe(true);
    expect(MockBetterSqliteDatabase.filenames).toContain(databasePath);
    expect(appliedProjectRoots).toEqual([rootPath]);
    expect(appliedWindowStates).toEqual([expect.objectContaining({ maximized: false })]);
    expect(mockSetConfigValue).toHaveBeenCalledWith(PROJECT_LAST_ROOT_CONFIG_KEY, rootPath);
    expect(getCurrentProjectState()).toEqual(expect.objectContaining({ rootPath }));
  });

  it('rejects unsafe project names before creating directories', async () => {
    const handler = getHandler(AsyncChannels.PROJECT_CREATE);

    await expect(handler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: '..\\outside',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    })).rejects.toThrow('Project name may contain');

    expect(fs.existsSync(path.join(temporaryDirectory, '..\\outside'))).toBe(false);
  });

  it('opens an existing project and rejects folders without project sqlite', async () => {
    const createHandler = getHandler(AsyncChannels.PROJECT_CREATE);
    const openHandler = getHandler(AsyncChannels.PROJECT_OPEN);
    const rootPath = path.join(temporaryDirectory, 'openable_project');

    await createHandler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'openable_project',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    });
    closeCurrentProjectDatabase();
    appliedProjectRoots = [];
    appliedWindowStates = [];
    mockSetConfigValue.mockClear();

    await expect(openHandler({}, rootPath)).resolves.toEqual({
      project: expect.objectContaining({
        config: expect.objectContaining({ process: 'ics55' }),
        name: 'openable_project',
        rootPath,
      }),
    });
    expect(appliedProjectRoots).toEqual([rootPath]);
    expect(appliedWindowStates).toEqual([expect.objectContaining({ maximized: false })]);
    expect(mockSetConfigValue).toHaveBeenCalledWith(PROJECT_LAST_ROOT_CONFIG_KEY, rootPath);

    const emptyRoot = path.join(temporaryDirectory, 'empty');
    fs.mkdirSync(emptyRoot);
    await expect(openHandler({}, emptyRoot)).rejects.toThrow('Project database not found');
  });

  it('flushes session snapshots into the current project database', async () => {
    const createHandler = getHandler(AsyncChannels.PROJECT_CREATE);
    const flushHandler = getHandler(AsyncChannels.PROJECT_FLUSH_SESSION);
    const getHandlerForCurrentProject = getHandler(AsyncChannels.PROJECT_GET_CURRENT);

    await createHandler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'session_project',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    });

    await flushHandler({}, createSnapshot('physical'));

    await expect(getHandlerForCurrentProject({})).resolves.toEqual(expect.objectContaining({
      session: expect.objectContaining({
        activeView: 'physical',
        panelWidths: { explorerLeftPanel: 280 },
        windowState: capturedWindowState,
      }),
    }));
  });

  it('updates current project config metadata and broadcasts project changes', async () => {
    const createHandler = getHandler(AsyncChannels.PROJECT_CREATE);
    const updateConfigHandler = getHandler(AsyncChannels.PROJECT_UPDATE_CONFIG);
    const getHandlerForCurrentProject = getHandler(AsyncChannels.PROJECT_GET_CURRENT);
    const send = vi.fn();
    mockBrowserWindowGetAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send,
        },
      },
    ]);

    await createHandler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'config_project',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    });

    const result = await updateConfigHandler({}, {
      mgnt: 'item2',
      mode: 'rtl',
      padframe: 'QFN128',
      process: 'gf180',
      type: 'Custom',
    });

    expect(result).toEqual({
      project: expect.objectContaining({
        config: {
          mgnt: 'item2',
          mode: 'rtl',
          padframe: 'QFN128',
          process: 'gf180',
          type: 'Custom',
        },
        name: 'config_project',
      }),
    });
    await expect(getHandlerForCurrentProject({})).resolves.toEqual(expect.objectContaining({
      config: {
        mgnt: 'item2',
        mode: 'rtl',
        padframe: 'QFN128',
        process: 'gf180',
        type: 'Custom',
      },
    }));
    expect(send).toHaveBeenCalledWith(StreamChannels.PROJECT_CHANGED, expect.objectContaining({
      config: expect.objectContaining({ process: 'gf180' }),
    }));
  });

  it('rejects project config updates when no project is open', async () => {
    const updateConfigHandler = getHandler(AsyncChannels.PROJECT_UPDATE_CONFIG);

    await expect(updateConfigHandler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      padframe: 'QFN32',
      process: 'ics55',
      type: 'retroSoC',
    })).rejects.toThrow('No project is currently open.');
  });

  it('persists side panel, bottom panel, and window session state', async () => {
    const createHandler = getHandler(AsyncChannels.PROJECT_CREATE);
    const flushHandler = getHandler(AsyncChannels.PROJECT_FLUSH_SESSION);
    const getHandlerForCurrentProject = getHandler(AsyncChannels.PROJECT_GET_CURRENT);

    await createHandler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'layout_session_project',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    });

    await flushHandler({}, {
      ...createSnapshot('explorer'),
      bottomPanelSession: {
        activeTab: 'terminal',
        tabs: {
          terminal: {
            focusedPaneId: 'bottom-pane-2',
            nextPaneIndex: 3,
            panes: [
              { content: { kind: 'tab', tab: 'terminal' }, id: 'bottom-pane-1', size: 35 },
              { content: { kind: 'placeholder', icon: 'boxes', label: 'Placeholder B' }, id: 'bottom-pane-2', size: 65 },
            ],
          },
        },
      },
      sidePanelSession: {
        assistantThreadListExpanded: true,
        assistantThreadListWidth: 360,
        leftPrimaryTab: 'git',
        leftSecondaryTab: 'libraries',
        leftSplitVisible: true,
        physicalBottomTab: 'console',
        physicalLeftSplitVisible: true,
        physicalLeftTab: 'constraints',
        physicalRightSplitVisible: false,
        physicalRightTab: 'checks',
        rightPrimaryTab: 'outline',
        rightSecondaryTab: 'x-propagation',
        rightSplitVisible: true,
      },
      explorerTreeSession: {
        expandedPaths: ['.', 'rtl', 'rtl/core'],
        scrollTop: 144,
        selectedNode: { path: 'rtl/core/cpu_top.sv', type: 'file' },
      },
    });

    await expect(getHandlerForCurrentProject({})).resolves.toEqual(expect.objectContaining({
      session: expect.objectContaining({
        bottomPanelSession: expect.objectContaining({
          activeTab: 'terminal',
          tabs: expect.objectContaining({
            terminal: {
              focusedPaneId: 'bottom-pane-2',
              nextPaneIndex: 3,
              panes: [
                { content: { kind: 'tab', tab: 'terminal' }, id: 'bottom-pane-1', size: 35 },
                { content: { kind: 'placeholder', icon: 'boxes', label: 'Placeholder B' }, id: 'bottom-pane-2', size: 65 },
              ],
            },
          }),
        }),
        sidePanelSession: {
          assistantThreadListExpanded: true,
          assistantThreadListWidth: 360,
          leftPrimaryTab: 'git',
          leftSecondaryTab: 'libraries',
          leftSplitVisible: true,
          physicalBottomTab: 'console',
          physicalLeftSplitVisible: true,
          physicalLeftTab: 'constraints',
          physicalRightSplitVisible: false,
          physicalRightTab: 'checks',
          rightPrimaryTab: 'outline',
          rightSecondaryTab: 'x-propagation',
          rightSplitVisible: true,
        },
        explorerTreeSession: {
          expandedPaths: ['.', 'rtl', 'rtl/core'],
          scrollTop: 144,
          selectedNode: { path: 'rtl/core/cpu_top.sv', type: 'file' },
        },
        windowState: capturedWindowState,
      }),
    }));
  });

  it('normalizes invalid persisted project layout session payloads', async () => {
    const createHandler = getHandler(AsyncChannels.PROJECT_CREATE);
    const flushHandler = getHandler(AsyncChannels.PROJECT_FLUSH_SESSION);
    const getHandlerForCurrentProject = getHandler(AsyncChannels.PROJECT_GET_CURRENT);

    await createHandler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'invalid_layout_session_project',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    });

    await flushHandler({}, {
      ...createSnapshot('explorer'),
      bottomPanelSession: {
        focusedPaneId: 'missing-pane',
        nextPaneIndex: 1,
        panes: [
          { content: { kind: 'tab', tab: 'not-a-tab' }, id: 'bad-pane', size: -1 },
          { content: { icon: 'unknown', kind: 'placeholder', label: '' }, id: 'bad-pane', size: 50 },
        ],
      },
      sidePanelSession: {
        assistantThreadListExpanded: 'true',
        assistantThreadListWidth: -8,
        leftPrimaryTab: 'bad',
        leftSecondaryTab: 'bad',
        leftSplitVisible: 'yes',
        physicalBottomTab: 'bad',
        physicalLeftSplitVisible: true,
        physicalLeftTab: 'bad',
        physicalRightSplitVisible: 1,
        physicalRightTab: 'bad',
        rightPrimaryTab: 'bad',
        rightSecondaryTab: 'bad',
        rightSplitVisible: true,
      },
      explorerTreeSession: {
        expandedPaths: ['rtl', 42, '', 'rtl'],
        scrollTop: Number.NaN,
        selectedNode: { path: 'rtl/core', type: 'root' },
      },
      windowState: {
        bounds: { height: 10, width: 10, x: 'bad', y: 0 },
        maximized: true,
      },
    });

    await expect(getHandlerForCurrentProject({})).resolves.toEqual(expect.objectContaining({
      session: expect.objectContaining({
        bottomPanelSession: {
          activeTab: 'terminal',
          tabs: expect.objectContaining({
            terminal: {
              focusedPaneId: 'bad-pane',
              nextPaneIndex: 2,
              panes: [
                { content: { kind: 'empty' }, id: 'bad-pane', size: 100 },
              ],
            },
          }),
        },
        sidePanelSession: {
          assistantThreadListExpanded: false,
          assistantThreadListWidth: 140,
          leftPrimaryTab: 'explorer',
          leftSecondaryTab: 'hierarchy',
          leftSplitVisible: false,
          physicalBottomTab: 'reports',
          physicalLeftSplitVisible: true,
          physicalLeftTab: 'layout',
          physicalRightSplitVisible: false,
          physicalRightTab: 'layers',
          rightPrimaryTab: 'ai',
          rightSecondaryTab: 'module-info',
          rightSplitVisible: true,
        },
        explorerTreeSession: {
          expandedPaths: ['.', 'rtl'],
          scrollTop: 0,
          selectedNode: null,
        },
        windowState: capturedWindowState,
      }),
    }));
  });

  it('closes the current project, broadcasts null state, and clears last root', async () => {
    const createHandler = getHandler(AsyncChannels.PROJECT_CREATE);
    const closeHandler = getHandler(AsyncChannels.PROJECT_CLOSE);
    const send = vi.fn();
    mockBrowserWindowGetAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send,
        },
      },
    ]);

    await createHandler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'closable_project',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    });
    mockSetConfigValue.mockClear();

    await expect(closeHandler({}, createSnapshot())).resolves.toEqual({ closed: true });

    expect(appliedProjectRoots.at(-1)).toBeNull();
    expect(mockSetConfigValue).toHaveBeenCalledWith(PROJECT_LAST_ROOT_CONFIG_KEY, null);
    expect(send).toHaveBeenCalledWith(StreamChannels.PROJECT_CHANGED, null);
    expect(getCurrentProjectState()).toBeNull();
  });

  it('resolves startup projects from env/config and otherwise starts with no project', async () => {
    const applyProjectRoot = vi.fn();
    const createHandler = getHandler(AsyncChannels.PROJECT_CREATE);
    const rootPath = path.join(temporaryDirectory, 'startup_project');

    await createHandler({}, {
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'startup_project',
      padframe: 'QFN32',
      path: temporaryDirectory,
      process: 'ics55',
      type: 'retroSoC',
    });
    closeCurrentProjectDatabase();
    mockSetConfigValue.mockClear();

    const applyWindowState = vi.fn();
    expect(tryOpenStartupProject(rootPath, applyProjectRoot, applyWindowState)).toEqual(expect.objectContaining({ rootPath }));
    expect(applyProjectRoot).toHaveBeenCalledWith(rootPath);
    expect(applyWindowState).toHaveBeenCalledWith(expect.objectContaining({ maximized: false }));

    applyProjectRoot.mockClear();
    expect(tryOpenStartupProject(null, applyProjectRoot)).toBeNull();
    expect(applyProjectRoot).toHaveBeenCalledWith(null);
  });

  it('supports direct closeProject calls without an open project', () => {
    const applyProjectRoot = vi.fn();

    expect(closeProject(applyProjectRoot)).toEqual({ closed: true });
    expect(applyProjectRoot).toHaveBeenCalledWith(null);
    expect(mockSetConfigValue).toHaveBeenCalledWith(PROJECT_LAST_ROOT_CONFIG_KEY, null);
  });
});
