import { vi } from 'vitest';
import type { ElectronAPI } from '../../types/electron-api';
import { createWaveformFixtureFrame, waveformFixtureData } from '../app/components/code/explorer/waveform/waveformTestFixtures';
import { layoutFixtureGdsGeometry, layoutFixtureGeometry, layoutFixtureGdsOpenResult, layoutFixtureOpenResult } from './layoutFixture';
import type { LspLayoutGeometryOptions, LspLayoutTileGeometryOptions } from '../../types/systemverilog-lsp';

const defaultGpuDiagnostics = {
  hardwareAccelerationEnabled: true,
  featureStatus: {
    gpu_compositing: 'enabled',
    webgl: 'enabled',
    webgpu: 'enabled',
  },
  info: {
    auxAttributes: {
      glResetNotificationStrategy: 0,
    },
    gpuDevice: [{ active: true, deviceId: 1234, vendorId: 4321 }],
  },
  infoError: null,
};

export function createElectronApiMock(): ElectronAPI {
  const getLayoutGeometry = async (options: LspLayoutGeometryOptions) => {
    const geometry = options.gdsRootCellIndices ? layoutFixtureGdsGeometry : layoutFixtureGeometry;
    const ownerIndices = options.macroIndices ?? options.gdsRootCellIndices ?? [];
    if (ownerIndices.length === 0) {
      return layoutFixtureGeometry;
    }

    const shapes = geometry.shapes.filter((shape) => (
      shape.macroIndex !== null && ownerIndices.includes(shape.macroIndex)
    ));

    return {
      ...geometry,
      shapeCount: shapes.length,
      shapes,
    };
  };
  const getLayoutTileGeometry = async (options: LspLayoutTileGeometryOptions) => {
    const shapes = layoutFixtureGdsGeometry.shapes.filter((shape) => shape.macroIndex === options.rootCellIndex);
    return {
      geometry: {
        ...layoutFixtureGdsGeometry,
        shapeCount: shapes.length,
        shapes,
      },
      truncated: false,
      nextToken: null,
      payloadSize: 512,
      tileShapeCount: shapes.length,
      metrics: {
        indexBuildMicros: 100,
        queryMicros: 200,
        encodeMicros: 50,
        visitedCellCount: 1,
        elementCandidateCount: shapes.length,
        referenceCandidateCount: 0,
        traversedReferenceCount: 0,
        lodShapeCount: shapes.length,
        cacheHitCount: 1,
        cacheMissCount: 0,
        gridBuildMicros: 0,
        gridHitCount: 1,
        gridMissCount: 0,
        gridCandidateCount: shapes.length,
        gridBinCount: 1,
      },
    };
  };

  return {
    platform: 'win32',
    arch: 'x64',
    isE2E: false,
    versions: {
      electron: '35.0.0',
      node: process.versions.node,
      chrome: '130.0.0.0',
    },
    minimize: vi.fn(),
    maximize: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    markWorkspaceReady: vi.fn().mockResolvedValue(true),
    resolveCloseRequest: vi.fn(),
    setFloatingInfoWindowVisible: vi.fn(),
    setFloatingInfoWindowExpanded: vi.fn(),
    setFloatingInfoWindowMode: vi.fn(),
    isMaximized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    onMaximizedChange: vi.fn(() => vi.fn()),
    onFullScreenChange: vi.fn(() => vi.fn()),
    onCloseRequested: vi.fn(() => vi.fn()),
    onWindowFocus: vi.fn(() => vi.fn()),
    onWorkspaceChange: vi.fn(() => vi.fn()),
    gpu: {
      getDiagnostics: vi.fn().mockResolvedValue(defaultGpuDiagnostics),
    },
    fs: {
      readFile: vi.fn().mockResolvedValue(''),
      readFileAbsolute: vi.fn().mockResolvedValue(''),
      listFiles: vi.fn().mockResolvedValue([]),
      writeFile: vi.fn(),
      writeFileAbsolute: vi.fn(),
      createDirectory: vi.fn(),
      copyFile: vi.fn(),
      copyDirectory: vi.fn(),
      deleteFile: vi.fn(),
      deleteDirectory: vi.fn(),
      rename: vi.fn(),
      readDir: vi.fn().mockResolvedValue([]),
      stat: vi.fn(),
      exists: vi.fn().mockResolvedValue(false),
    },
    dialog: {
      showSaveDialog: vi.fn().mockResolvedValue({
        canceled: true,
        filePath: null,
        workspaceRelativePath: null,
      }),
      showOpenThemeDialog: vi.fn().mockResolvedValue({
        canceled: true,
        filePath: null,
      }),
      showOpenProjectDirectoryDialog: vi.fn().mockResolvedValue({
        canceled: true,
        filePath: null,
      }),
    },
    git: {
      getStatus: vi.fn().mockResolvedValue({
        branchName: null,
        hasProjectFiles: false,
        isGitRepo: false,
        pathStates: {},
      }),
      getFileDiff: vi.fn().mockResolvedValue({
        filePath: '',
        originalContent: '',
        currentContent: '',
      }),
    },
    shell: {
      exec: vi.fn(),
      kill: vi.fn(),
      onStdout: vi.fn(() => vi.fn()),
      onStderr: vi.fn(() => vi.fn()),
      onExit: vi.fn(() => vi.fn()),
    },
    terminal: {
      create: vi.fn().mockResolvedValue({ id: 'terminal-1', pid: 100, shell: 'powershell.exe' }),
      write: vi.fn().mockResolvedValue(true),
      resize: vi.fn().mockResolvedValue(true),
      kill: vi.fn().mockResolvedValue(true),
      onData: vi.fn(() => vi.fn()),
      onExit: vi.fn(() => vi.fn()),
    },
    wsl: {
      startPristineEdaEnvironment: vi.fn().mockResolvedValue({
        ok: true,
        distroName: 'pristine-eda-env',
        installed: true,
        status: { distroName: 'pristine-eda-env', installed: true, state: 'running' },
      }),
      stopPristineEdaEnvironment: vi.fn().mockResolvedValue({
        ok: true,
        distroName: 'pristine-eda-env',
        status: { distroName: 'pristine-eda-env', installed: true, state: 'stopped' },
      }),
      getPristineEdaEnvironmentStatus: vi.fn().mockResolvedValue({
        distroName: 'pristine-eda-env',
        installed: true,
        state: 'stopped',
      }),
    },
    lsp: {
      ensureInitialized: vi.fn().mockResolvedValue(undefined),
      openDocument: vi.fn().mockResolvedValue(undefined),
      changeDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
      completion: vi.fn().mockResolvedValue(null),
      completionResolve: vi.fn().mockImplementation(async (item) => item),
      hover: vi.fn().mockResolvedValue(null),
      definition: vi.fn().mockResolvedValue([]),
      typeDefinition: vi.fn().mockResolvedValue([]),
      implementation: vi.fn().mockResolvedValue([]),
      documentHighlights: vi.fn().mockResolvedValue([]),
      documentLinks: vi.fn().mockResolvedValue([]),
      inlayHints: vi.fn().mockResolvedValue([]),
      codeActions: vi.fn().mockResolvedValue([]),
      foldingRanges: vi.fn().mockResolvedValue([]),
      semanticTokensFull: vi.fn().mockResolvedValue({ data: [] }),
      selectionRanges: vi.fn().mockResolvedValue([]),
      signatureHelp: vi.fn().mockResolvedValue(null),
      documentSymbols: vi.fn().mockResolvedValue([]),
      references: vi.fn().mockResolvedValue([]),
      prepareCallHierarchy: vi.fn().mockResolvedValue([]),
      callHierarchyIncoming: vi.fn().mockResolvedValue([]),
      callHierarchyOutgoing: vi.fn().mockResolvedValue([]),
      workspaceSymbols: vi.fn().mockResolvedValue([]),
      prepareRename: vi.fn().mockResolvedValue(null),
      rename: vi.fn().mockResolvedValue(null),
      outline: vi.fn().mockResolvedValue({
        uri: '',
        version: 0,
        generation: 0,
        roots: [],
        items: [],
        partial: false,
        truncated: false,
        messages: [],
      }),
      moduleHierarchy: vi.fn().mockResolvedValue({ roots: [], messages: [] }),
      schematic: vi.fn().mockResolvedValue({ rootModuleId: null, modules: [], messages: [] }),
      waveformOpen: vi.fn().mockResolvedValue({
        cursorTime: waveformFixtureData.cursorTime,
        duration: waveformFixtureData.duration,
        groups: waveformFixtureData.groups,
        id: waveformFixtureData.id,
        sessionId: 'waveform-test-session',
        signals: waveformFixtureData.signals,
        timescaleUnit: waveformFixtureData.timescaleUnit,
        title: waveformFixtureData.title,
      }),
      waveformFrame: vi.fn().mockImplementation(async (options) => createWaveformFixtureFrame(
        {
          startTime: options.startTime,
          endTime: options.endTime,
        },
        options.width,
        options.signalIds,
      )),
      waveformClose: vi.fn().mockResolvedValue(true),
      layoutOpen: vi.fn().mockResolvedValue(layoutFixtureOpenResult),
      layoutGeometry: vi.fn().mockImplementation(getLayoutGeometry),
      layoutStatus: vi.fn().mockResolvedValue({
        state: 'ready',
        phase: 'ready',
        fileSizeBytes: 1024,
        bytesRead: 1024,
        recordCount: 8,
        cellCount: 2,
        referenceCount: 0,
        elementCount: 4,
        pointCount: 4,
        stringCount: 4,
        diagnosticCount: 0,
        elapsedMicros: 1000,
        openMicros: 200,
        parseMicros: 800,
        warmupScheduled: false,
        warmupReady: true,
        error: '',
      }),
      layoutCatalogSummary: vi.fn().mockResolvedValue({
        unitsPerMicron: layoutFixtureGdsOpenResult.catalog.unitsPerMicron,
        sourceKind: 'gds',
        shapeCount: layoutFixtureGdsOpenResult.catalog.shapeCount,
        hasBounds: true,
        topCellIndex: layoutFixtureGdsOpenResult.catalog.topCellIndex,
        bounds: layoutFixtureGdsOpenResult.catalog.gdsCells[0]?.bounds,
        layerCount: layoutFixtureGdsOpenResult.catalog.layers.length,
        layerSummary: layoutFixtureGdsOpenResult.catalog.layers,
        macroCount: 0,
        componentCount: 0,
        defPinCount: 0,
        netCount: 0,
        gdsCellCount: layoutFixtureGdsOpenResult.catalog.gdsCells.length,
        gdsReferenceCount: 0,
        gdsElementCount: layoutFixtureGdsOpenResult.catalog.gdsElements.length,
        gdsPointCount: 0,
        stringCount: 4,
        diagnosticCount: 0,
        parseMicros: 800,
        layerRegisterMicros: 20,
        boundsMicros: 30,
        openMicros: 200,
      }),
      layoutCatalogPage: vi.fn().mockResolvedValue({
        tableKind: 'cells',
        offset: 0,
        count: layoutFixtureGdsOpenResult.catalog.gdsCells.length,
        totalCount: layoutFixtureGdsOpenResult.catalog.gdsCells.length,
        nextOffset: null,
        layers: [],
        gdsCells: layoutFixtureGdsOpenResult.catalog.gdsCells,
        gdsReferences: [],
        gdsElements: [],
        gdsPoints: [],
        strings: [],
        diagnostics: [],
      }),
      layoutTileGeometry: vi.fn().mockImplementation(getLayoutTileGeometry),
      layoutClose: vi.fn().mockResolvedValue(true),
      getDebugEvents: vi.fn().mockResolvedValue([]),
      onDebug: vi.fn(() => vi.fn()),
      onDiagnostics: vi.fn(() => vi.fn()),
      onState: vi.fn(() => vi.fn()),
    },
    menu: {
      onCommand: vi.fn(() => vi.fn()),
    },
    notices: {
      revealBundledFiles: vi.fn().mockResolvedValue(true),
    },
    notifications: {
      publish: vi.fn().mockImplementation(async (input) => ({
        body: input.body ?? '',
        createdAt: Date.now(),
        expiresAt: Date.now() + 5000,
        id: 'notification-test-id',
        level: input.level,
        title: input.title,
        variant: input.variant ?? 'standard',
        ...(input.actions ? { actions: input.actions } : {}),
      })),
      dismiss: vi.fn().mockResolvedValue(undefined),
      getHistory: vi.fn().mockResolvedValue([]),
      onHistoryChanged: vi.fn(() => vi.fn()),
    },
    project: {
      createProject: vi.fn().mockImplementation(async (input) => ({
        project: {
          config: {
            mode: input.mode,
            process: input.process,
            type: input.type,
            mgnt: input.mgnt,
            padframe: input.padframe,
          },
          name: input.name,
          rootPath: `${input.path}\\${input.name}`,
          session: null,
        },
      })),
      openProject: vi.fn().mockResolvedValue({
        project: {
          config: {
            mode: 'rtl2gds',
            process: 'ics55',
            type: 'retroSoC',
            mgnt: 'none',
            padframe: 'QFN32',
          },
          name: 'project',
          rootPath: 'C:\\Projects\\project',
          session: null,
        },
      }),
      closeProject: vi.fn().mockResolvedValue({ closed: true }),
      getCurrentProject: vi.fn().mockResolvedValue(null),
      flushSession: vi.fn().mockResolvedValue(undefined),
      updateProjectConfig: vi.fn().mockImplementation(async (input) => ({
        project: {
          config: input,
          name: 'project',
          rootPath: 'C:\\Projects\\project',
          session: null,
        },
      })),
      onProjectChanged: vi.fn(() => vi.fn()),
    },
    auth: {
      openAccountPage: vi.fn().mockResolvedValue(true),
      getSession: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(true),
      syncCloudConfig: vi.fn().mockResolvedValue(true),
      onStateChanged: vi.fn(() => vi.fn()),
      onError: vi.fn(() => vi.fn()),
    },
    config: {
      get: vi.fn(),
      set: vi.fn(),
      onDidChange: vi.fn(() => vi.fn()),
    },
  };
}
