import { useEffect, useMemo, useRef, useState } from 'react';
import { Application, Buffer as PixiBuffer, Container, Graphics, Mesh, MeshGeometry, Text, Texture } from 'pixi.js';

import { useLazyRef } from '@/hooks/use-lazy-ref';
import type {
  LspLayoutCatalog,
  LspLayoutBounds,
  LspLayoutGeometry,
  LspLayoutShape,
  LspLayoutTileGeometry,
} from '../../../../../types/systemverilog-lsp';
import {
  applyLayoutWheel,
  findShapeAtLayoutPoint,
  getFitLayoutCamera,
  getLayoutTargetBounds,
  getShapesBounds,
  layoutClientPointToWorldPoint,
  physicalLayoutZoomLimits,
  selectLayoutTargetShapes,
  shapeBounds,
  type PhysicalLayoutCamera,
  type PhysicalLayoutTarget,
  type PhysicalLayoutZoomLimits,
} from './physicalLayoutGeometry';
import {
  calculateGdsScreenVisibleCoverage,
  calculateGdsNonEmptyTileCoverageRatio,
  calculateGdsTileCoverageRatio,
  createGdsTileAtlasUpdate,
  createGdsTileMetricsSnapshot,
  createEmptyGdsTileGeometry,
  createGdsFullCellTileRequestPlan,
  createGdsOverviewRetryTileRequestPlan,
  createGdsPreciseTileRequestPlan,
  createGdsTileWindowPlan,
  createMergedGdsTileGeometry,
  createGdsTileRequestPlan,
  createGdsRetryTileRequestPlan,
  defaultPhysicalLayoutGdsTileMetrics,
  doLayoutBoundsIntersect,
  getGdsEmptyTileRetryKind,
  getGdsTileShapeStyle,
  gdsTileMaxContinuationPages,
  gdsTileMaxMergedPayloadBytes,
  PhysicalLayoutGdsTileLruCache,
  estimateGdsDisplayedTileAtlasByteLength,
  getViewportWorldBounds,
  isGdsTileModeEnabled,
  mergeGdsTileGeometryResults,
  shouldRequestPreciseGdsTile,
  shouldUseFullCellGdsTile,
  type PhysicalLayoutGdsDisplayedTile,
  type PhysicalLayoutGdsTileScope,
  type PhysicalLayoutGdsTileShapeStyle,
  type PhysicalLayoutGdsTileMetrics,
  type PhysicalLayoutGdsTileRequestInput,
  type PhysicalLayoutGdsTileRequestPlan,
} from './physicalLayoutGdsTiles';
import { createPhysicalLayoutMinimapModel, type PhysicalLayoutMinimapModel } from './physicalLayoutMinimap';
import {
  installPhysicalExplicitDrawCountPatch,
  markPhysicalExplicitDrawCountGeometry,
  setPhysicalExplicitDrawCount,
} from './physicalLayoutExplicitDrawCount';
import {
  createPhysicalLayoutPinLabels,
  formatPhysicalLayoutLayerOpacitySummary,
  filterVisiblePhysicalLayoutShapes,
  getPhysicalLayoutLayerCategoryColor,
  getPhysicalLayoutLayerOpacity,
  getVisiblePhysicalLayoutCategoryCount,
  getVisiblePhysicalLayoutLayerCount,
  getVisiblePhysicalLayoutShapeCounts,
  isPhysicalLayoutOutlineVisible,
  type PhysicalLayoutLayerCategory,
  type PhysicalLayoutPinLabel,
  type PhysicalLayoutVisibility,
} from './physicalLayoutLayers';

type PixiRendererPreference = 'webgpu' | 'webgl';
type PixiRendererStatus = PixiRendererPreference | 'error' | 'initializing';
type PixiContainerChild = Container['children'][number];

interface PhysicalLayoutCanvasProps {
  catalog: LspLayoutCatalog | null;
  geometry: LspLayoutGeometry | null;
  highlightedShapeIndex?: number | null;
  layoutSessionId?: string | null;
  selectedTarget: PhysicalLayoutTarget | null;
  layoutVisibility: PhysicalLayoutVisibility;
  is3DViewVisible?: boolean;
  onGdsTileGeometryChange?: (geometry: LspLayoutGeometry | null) => void;
  onGdsTileMetricsChange?: (metrics: PhysicalLayoutGdsTileMetrics) => void;
  onHighlightedShapeChange?: (shapeIndex: number | null) => void;
}

const defaultCamera: PhysicalLayoutCamera = { panX: 0, panY: 0, zoom: 24 };
const minimumCanvasWidth = 240;
const minimumCanvasHeight = 180;
const gridMajorStep = 1;
const gridMinorStep = 0.2;
const clickDistanceThresholdPx = 4;
const gdsPreciseTileIdleDelayMs = 300;
const gdsTileApplyIdleDelayMs = 480;
const cameraFitPaddingPx = 48;
const GDS_TILE_ORDER_BUCKET_SIZE = 512;
const GDS_TILE_LARGE_ORDER_BUCKET_SIZE = 2_048;
const GDS_TILE_HUGE_ORDER_BUCKET_SIZE = 4_096;
const GDS_TILE_PRECISE_ORDER_SHAPE_LIMIT = 2_048;
const GDS_TILE_LARGE_ORDER_SHAPE_LIMIT = 50_000;
const GDS_TILE_HUGE_ORDER_SHAPE_LIMIT = 200_000;
const GDS_TILE_PICKABLE_SHAPE_LIMIT = 4_096;
const GDS_TILE_RENDER_OVERSCAN_RATIO = 0.2;
const GDS_TILE_REPLACE_MIN_COVERAGE = 0.55;
const GDS_TILE_GEOMETRY_SNAPSHOT_SHAPE_LIMIT = 12_000;
const GDS_TILE_GEOMETRY_SNAPSHOT_PAYLOAD_LIMIT = 24 * 1024 * 1024;

interface PendingGdsTileApply {
  generation: number;
  options: { acceptEmpty: boolean; preserveDisplayedTiles?: boolean; state: string };
  plan: PhysicalLayoutGdsTileRequestPlan;
  roundtripMs: number;
  tile: LspLayoutTileGeometry;
}

interface PendingGdsTileAtlasApply {
  generation: number;
  roundtripMs: number;
  state: string;
  tiles: Map<string, PhysicalLayoutGdsDisplayedTile>;
  windowPlan: ReturnType<typeof createGdsTileWindowPlan>;
}

interface LoadedGdsTilePlan {
  plan: PhysicalLayoutGdsTileRequestPlan;
  roundtripMs: number;
  stoppedByBudget: boolean;
  tile: LspLayoutTileGeometry;
}

export function PhysicalLayoutCanvas({
  catalog,
  geometry,
  highlightedShapeIndex = null,
  is3DViewVisible = false,
  layoutSessionId = null,
  selectedTarget,
  layoutVisibility,
  onGdsTileGeometryChange,
  onGdsTileMetricsChange,
  onHighlightedShapeChange,
}: PhysicalLayoutCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const backgroundRef = useRef<Container | null>(null);
  const overlayRef = useRef<Container | null>(null);
  const minimapGraphicsRef = useRef<Graphics | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const gdsTransformFrameRef = useRef<number | null>(null);
  const cameraRef = useRef<PhysicalLayoutCamera>(defaultCamera);
  const isGdsTileModeRef = useRef(false);
  const layoutSessionIdRef = useRef<string | null>(layoutSessionId);
  const layoutVisibilityRef = useRef(layoutVisibility);
  const selectedTargetRef = useRef<PhysicalLayoutTarget | null>(selectedTarget);
  const sizeRef = useRef({ width: minimumCanvasWidth, height: minimumCanvasHeight });
  const selectedBoundsRef = useRef<LspLayoutBounds | null>(null);
  const selectedShapesRef = useRef<LspLayoutShape[]>([]);
  const selectedLabelsRef = useRef<PhysicalLayoutPinLabel[]>([]);
  const gdsTileGenerationRef = useRef(0);
  const gdsTileRequestTimeoutRef = useRef<number | null>(null);
  const gdsPreciseTileTimeoutRef = useRef<number | null>(null);
  const gdsDeferredTileApplyTimeoutRef = useRef<number | null>(null);
  const gdsDeferredTileApplyRef = useRef<PendingGdsTileApply | null>(null);
  const gdsDeferredAtlasApplyTimeoutRef = useRef<number | null>(null);
  const gdsDeferredAtlasApplyRef = useRef<PendingGdsTileAtlasApply | null>(null);
  const gdsGeometrySyncTimeoutRef = useRef<number | null>(null);
  const gdsGeometrySnapshotVersionRef = useRef(0);
  const gdsGeometrySnapshotKeyRef = useRef('');
  const gdsReactSyncCountRef = useRef(0);
  const gdsIdleSnapshotMsRef = useRef(0);
  const gdsIdleSnapshotSkippedCountRef = useRef(0);
  const gdsTileCacheRef = useLazyRef(() => new PhysicalLayoutGdsTileLruCache());
  const gdsLatestRequestKeyRef = useRef('');
  const gdsLastGoodTileRef = useRef<LspLayoutTileGeometry | null>(null);
  const gdsDisplayedTilesRef = useLazyRef(() => new Map<string, PhysicalLayoutGdsDisplayedTile>());
  const gdsDisplayedViewportBboxRef = useRef<LspLayoutBounds | null>(null);
  const gdsSceneActiveRef = useRef(false);
  const gdsChromeLayerRef = useRef<Container | null>(null);
  const gdsOverlayWorldLayerRef = useRef<Container | null>(null);
  const gdsTileRendererRef = useRef<PhysicalLayoutGdsPersistentTileRenderer | null>(null);
  const gdsBackgroundSizeKeyRef = useRef('');
  const gdsFullCellFallbackKeyRef = useRef('');
  const gdsFullCellFallbackReasonRef = useRef('');
  const gdsBlankFrameCountRef = useRef(0);
  const gdsEmptyVisibleFrameCountRef = useRef(0);
  const gdsCoverageRatioRef = useRef(0);
  const gdsNonEmptyCoverageRatioRef = useRef(0);
  const gdsScreenVisibleCoverageRatioRef = useRef(0);
  const gdsScreenVisibleNonEmptyCoverageRatioRef = useRef(0);
  const gdsScreenVisibleTileCountRef = useRef(0);
  const gdsScreenVisibleShapeCountRef = useRef(0);
  const gdsCellIntersectionRatioRef = useRef(0);
  const gdsVisualEmptyReasonRef = useRef('');
  const gdsViewportBboxRef = useRef<LspLayoutBounds | null>(null);
  const gdsActiveTileCountRef = useRef(0);
  const gdsPrefetchTileCountRef = useRef(0);
  const gdsOverviewFallbackActiveRef = useRef(false);
  const gdsCurrentLodBandRef = useRef('');
  const gdsObservedLodBandsRef = useLazyRef(() => new Set<string>());
  const lastGdsTileApplyMsRef = useRef(0);
  const lastGdsTileBuildMsRef = useRef(0);
  const gdsTileDiagnosticsRef = useRef({
    bboxArea: 0,
    displayedState: 'empty',
    emptyReason: '',
    finalLod: -1,
    fullCellFallbackReason: '',
    fullCellShapeCount: 0,
    lastGoodShapeCount: 0,
    observedLodBands: '',
    precisePending: false,
    retryKind: 'none',
    tileScope: 'viewport-window' as PhysicalLayoutGdsTileScope,
    tileLod: -1,
  });
  const gdsCameraSyncTimeoutRef = useRef<number | null>(null);
  const gdsMetricsSyncTimeoutRef = useRef<number | null>(null);
  const minimapSyncTimeoutRef = useRef<number | null>(null);
  const gdsRenderCountSyncTimeoutRef = useRef<number | null>(null);
  const frameDurationsRef = useRef<number[]>([]);
  const lastFrameAtRef = useRef<number | null>(null);
  const lastGdsHotFrameAtRef = useRef<number | null>(null);
  const lastRenderDurationMsRef = useRef(0);
  const lastRenderCountSyncAtRef = useRef(0);
  const lastGdsMetricsSyncAtRef = useRef(0);
  const lastMinimapSyncAtRef = useRef(0);
  const lastGdsInteractionAtRef = useRef(0);
  const lastTileRoundtripMsRef = useRef(0);
  const maxFrameP95MsRef = useRef(0);
  const maxTileApplyMsRef = useRef(0);
  const maxTileBuildMsRef = useRef(0);
  const maxTileRoundtripMsRef = useRef(0);
  const lastTileContinuationCountRef = useRef(0);
  const inflightTileRequestCountRef = useRef(0);
  const retryTileRequestCountRef = useRef(0);
  const tileRequestCountRef = useRef(0);
  const meshStatsRef = useRef({
    bufferCapacityVertexCount: 0,
    bufferDataReplaceCount: 0,
    bufferReallocCount: 0,
    bufferSubarrayCommitCount: 0,
    bufferUpdateCount: 0,
    bufferUpdateMs: 0,
    tileLayerCreateCount: 0,
    tileLayerReuseCount: 0,
    tileLayerDestroyCount: 0,
    batchCreateCount: 0,
    batchReuseCount: 0,
    batchDestroyCount: 0,
    applyQueueDepth: 0,
    applyChunkCount: 0,
    applyBudgetOverrunCount: 0,
    idleSnapshotMs: 0,
    idleSnapshotSkippedCount: 0,
    columnarByteLength: 0,
    atlasGpuByteLength: 0,
    drawNodeCount: 0,
    indexCount: 0,
    meshBatchCount: 0,
    orderBucketSize: 0,
    vertexCount: 0,
  });
  const minimapModelRef = useRef<PhysicalLayoutMinimapModel | null>(null);
  const renderCountRef = useRef(0);
  const outlineVisibleRef = useRef(false);
  const highlightedShapeIndexRef = useRef<number | null>(highlightedShapeIndex);
  const onHighlightedShapeChangeRef = useRef(onHighlightedShapeChange);
  const onGdsTileGeometryChangeRef = useRef(onGdsTileGeometryChange);
  const onGdsTileMetricsChangeRef = useRef(onGdsTileMetricsChange);
  const is3DViewVisibleRef = useRef(is3DViewVisible);
  const [renderer, setRenderer] = useState<PixiRendererStatus>('initializing');
  const [camera, setCamera] = useState<PhysicalLayoutCamera>(defaultCamera);
  const [renderCount, setRenderCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastPick, setLastPick] = useState<{ shapeIndex: number | null; worldX: number; worldY: number } | null>(null);
  const [size, setSize] = useState({ width: minimumCanvasWidth, height: minimumCanvasHeight });
  const [gdsTileGeometry, setGdsTileGeometry] = useState<LspLayoutGeometry | null>(null);
  const [gdsTileMetrics, setGdsTileMetrics] = useState<PhysicalLayoutGdsTileMetrics>(defaultPhysicalLayoutGdsTileMetrics);
  const [cameraSync, setCameraSync] = useState<PhysicalLayoutCamera>(defaultCamera);
  const [gdsTileDiagnostics, setGdsTileDiagnostics] = useState(gdsTileDiagnosticsRef.current);
  const [minimapModel, setMinimapModel] = useState<PhysicalLayoutMinimapModel | null>(null);

  const isGdsTileMode = isGdsTileModeEnabled(catalog?.sourceKind, selectedTarget?.kind);
  const activeGeometry = isGdsTileMode ? gdsTileGeometry : geometry;

  const selectedShapes = useMemo(
    () => selectLayoutTargetShapes(catalog, activeGeometry, selectedTarget),
    [activeGeometry, catalog, selectedTarget],
  );
  const visibleShapes = useMemo(
    () => filterVisiblePhysicalLayoutShapes(selectedShapes, layoutVisibility, catalog?.sourceKind),
    [catalog?.sourceKind, selectedShapes, layoutVisibility],
  );
  const visibleLabels = useMemo(
    () => createPhysicalLayoutPinLabels(catalog, selectedShapes, layoutVisibility),
    [catalog, selectedShapes, layoutVisibility],
  );
  const visibleShapeCounts = useMemo(
    () => getVisiblePhysicalLayoutShapeCounts(selectedShapes, layoutVisibility, catalog?.sourceKind),
    [catalog?.sourceKind, selectedShapes, layoutVisibility],
  );
  const selectedBounds = useMemo(
    () => {
      if (isGdsTileMode) {
        return getLayoutTargetBounds(catalog, selectedTarget, null);
      }

      return getShapesBounds(selectedShapes, getLayoutTargetBounds(catalog, selectedTarget, activeGeometry ? getShapesBounds(activeGeometry.shapes, null) : null));
    },
    [activeGeometry, catalog, isGdsTileMode, selectedShapes, selectedTarget],
  );
  const layerCount = catalog?.layers.length ?? 0;
  const catalogPinCount = catalog?.pins.length ?? 0;
  const selectedPinCount = catalog && selectedTarget?.kind === 'macro' && selectedTarget.index !== null
    ? catalog.pins.filter((pin) => pin.macroIndex === selectedTarget.index).length
    : catalog?.defPins.length ?? 0;
  const visibleLayerCount = getVisiblePhysicalLayoutLayerCount(catalog, layoutVisibility);
  const visibleCategoryCount = getVisiblePhysicalLayoutCategoryCount(catalog, layoutVisibility);
  const outlineVisible = isPhysicalLayoutOutlineVisible(layoutVisibility);
  const pickableShape = useMemo(
    () => {
      if (isGdsTileMode && visibleShapes.length > GDS_TILE_PICKABLE_SHAPE_LIMIT) {
        return null;
      }

      return getPickableVisibleShape(visibleShapes, camera, size);
    },
    [camera, isGdsTileMode, size, visibleShapes],
  );

  selectedBoundsRef.current = selectedBounds;
  selectedShapesRef.current = visibleShapes;
  selectedLabelsRef.current = visibleLabels;
  isGdsTileModeRef.current = isGdsTileMode;
  layoutSessionIdRef.current = layoutSessionId;
  layoutVisibilityRef.current = layoutVisibility;
  selectedTargetRef.current = selectedTarget;
  sizeRef.current = size;
  outlineVisibleRef.current = outlineVisible;
  highlightedShapeIndexRef.current = highlightedShapeIndex;
  onHighlightedShapeChangeRef.current = onHighlightedShapeChange;
  onGdsTileGeometryChangeRef.current = onGdsTileGeometryChange;
  onGdsTileMetricsChangeRef.current = onGdsTileMetricsChange;
  is3DViewVisibleRef.current = is3DViewVisible;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let disposed = false;
    void createPixiApp(host).then(({ app, renderer: pixiRenderer }) => {
      if (disposed) {
        app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
        return;
      }

      appRef.current = app;
      backgroundRef.current = new Container();
      worldRef.current = new Container();
      overlayRef.current = new Container();
      minimapGraphicsRef.current = new Graphics();
      app.stage.addChild(backgroundRef.current);
      app.stage.addChild(worldRef.current);
      app.stage.addChild(overlayRef.current);
      overlayRef.current.addChild(minimapGraphicsRef.current);
      setRenderer(pixiRenderer);
      setSize({ width: app.renderer.width, height: app.renderer.height });
      redrawScene();
      requestRender();
    }).catch((cause: unknown) => {
      if (disposed) {
        return;
      }

      setRenderer('error');
      setError(cause instanceof Error ? cause.message : 'Unable to initialize layout renderer.');
    });

    return () => {
      disposed = true;
      if (renderFrameRef.current !== null) {
        window.cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
      if (gdsTransformFrameRef.current !== null) {
        window.cancelAnimationFrame(gdsTransformFrameRef.current);
        gdsTransformFrameRef.current = null;
      }
      if (gdsTileRequestTimeoutRef.current !== null) {
        window.clearTimeout(gdsTileRequestTimeoutRef.current);
        gdsTileRequestTimeoutRef.current = null;
      }
      if (gdsPreciseTileTimeoutRef.current !== null) {
        window.clearTimeout(gdsPreciseTileTimeoutRef.current);
        gdsPreciseTileTimeoutRef.current = null;
      }
      if (gdsDeferredTileApplyTimeoutRef.current !== null) {
        window.clearTimeout(gdsDeferredTileApplyTimeoutRef.current);
        gdsDeferredTileApplyTimeoutRef.current = null;
      }
      gdsDeferredTileApplyRef.current = null;
      if (gdsDeferredAtlasApplyTimeoutRef.current !== null) {
        window.clearTimeout(gdsDeferredAtlasApplyTimeoutRef.current);
        gdsDeferredAtlasApplyTimeoutRef.current = null;
      }
      gdsDeferredAtlasApplyRef.current = null;
      if (gdsGeometrySyncTimeoutRef.current !== null) {
        window.clearTimeout(gdsGeometrySyncTimeoutRef.current);
        gdsGeometrySyncTimeoutRef.current = null;
      }
      if (gdsCameraSyncTimeoutRef.current !== null) {
        window.clearTimeout(gdsCameraSyncTimeoutRef.current);
        gdsCameraSyncTimeoutRef.current = null;
      }
      if (gdsMetricsSyncTimeoutRef.current !== null) {
        window.clearTimeout(gdsMetricsSyncTimeoutRef.current);
        gdsMetricsSyncTimeoutRef.current = null;
      }
      if (minimapSyncTimeoutRef.current !== null) {
        window.clearTimeout(minimapSyncTimeoutRef.current);
        minimapSyncTimeoutRef.current = null;
      }
      if (gdsRenderCountSyncTimeoutRef.current !== null) {
        window.clearTimeout(gdsRenderCountSyncTimeoutRef.current);
        gdsRenderCountSyncTimeoutRef.current = null;
      }
      clearGdsPersistentScene();
      appRef.current?.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
      appRef.current = null;
      worldRef.current = null;
      backgroundRef.current = null;
      overlayRef.current = null;
      minimapGraphicsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      const app = appRef.current;
      if (!app) {
        return;
      }

      const width = Math.max(minimumCanvasWidth, Math.floor(host.clientWidth));
      const height = Math.max(minimumCanvasHeight, Math.floor(host.clientHeight));
      app.renderer.resize(width, height);
      setSize({ width, height });
      if (isGdsTileModeRef.current) {
        redrawGdsDisplayedTileScene();
      }
      requestRender();
    });
    resizeObserver.observe(host);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const zoomLimits = getPhysicalLayoutCanvasZoomLimits(catalog?.sourceKind, selectedTarget?.kind, selectedBounds, size);
    const nextCamera = getFitLayoutCamera(selectedBounds, size, zoomLimits);
    cameraRef.current = nextCamera;
    if (isGdsTileModeRef.current) {
      syncGdsScreenVisibleCoverage(getViewportWorldBounds(nextCamera, sizeRef.current, 0));
    }
    setCamera(nextCamera);
    setCameraSync(nextCamera);
    redrawScene();
    requestRender();
    scheduleGdsTileRequest();
  }, [selectedBounds, selectedTarget, size.height, size.width]);

  useEffect(() => {
    redrawScene();
    requestRender();
  }, [highlightedShapeIndex, layoutVisibility, outlineVisible, visibleLabels, visibleShapes]);

  useEffect(() => {
    gdsTileGenerationRef.current += 1;
    gdsTileCacheRef.current.clear();
    gdsLatestRequestKeyRef.current = '';
    gdsFullCellFallbackKeyRef.current = '';
    gdsFullCellFallbackReasonRef.current = '';
    gdsLastGoodTileRef.current = null;
    gdsDisplayedTilesRef.current.clear();
    gdsGeometrySnapshotVersionRef.current += 1;
    gdsReactSyncCountRef.current = 0;
    gdsIdleSnapshotMsRef.current = 0;
    gdsIdleSnapshotSkippedCountRef.current = 0;
    clearGdsPersistentScene();
    gdsBlankFrameCountRef.current = 0;
    gdsEmptyVisibleFrameCountRef.current = 0;
    gdsCoverageRatioRef.current = 0;
    gdsNonEmptyCoverageRatioRef.current = 0;
    gdsScreenVisibleCoverageRatioRef.current = 0;
    gdsScreenVisibleNonEmptyCoverageRatioRef.current = 0;
    gdsScreenVisibleTileCountRef.current = 0;
    gdsScreenVisibleShapeCountRef.current = 0;
    gdsCellIntersectionRatioRef.current = 0;
    gdsVisualEmptyReasonRef.current = '';
    gdsViewportBboxRef.current = null;
    gdsActiveTileCountRef.current = 0;
    gdsPrefetchTileCountRef.current = 0;
    gdsOverviewFallbackActiveRef.current = false;
    gdsCurrentLodBandRef.current = '';
    gdsObservedLodBandsRef.current.clear();
    maxFrameP95MsRef.current = 0;
    maxTileApplyMsRef.current = 0;
    maxTileBuildMsRef.current = 0;
    maxTileRoundtripMsRef.current = 0;
    if (gdsDeferredTileApplyTimeoutRef.current !== null) {
      window.clearTimeout(gdsDeferredTileApplyTimeoutRef.current);
      gdsDeferredTileApplyTimeoutRef.current = null;
    }
    gdsDeferredTileApplyRef.current = null;
    if (gdsDeferredAtlasApplyTimeoutRef.current !== null) {
      window.clearTimeout(gdsDeferredAtlasApplyTimeoutRef.current);
      gdsDeferredAtlasApplyTimeoutRef.current = null;
    }
    gdsDeferredAtlasApplyRef.current = null;
    if (gdsGeometrySyncTimeoutRef.current !== null) {
      window.clearTimeout(gdsGeometrySyncTimeoutRef.current);
      gdsGeometrySyncTimeoutRef.current = null;
    }
    updateGdsTileDiagnostics({
      bboxArea: 0,
      displayedState: 'empty',
      emptyReason: '',
      finalLod: -1,
      fullCellFallbackReason: '',
      fullCellShapeCount: 0,
      lastGoodShapeCount: 0,
      observedLodBands: '',
      precisePending: false,
      retryKind: 'none',
      tileScope: 'viewport-window',
      tileLod: -1,
    });
    setGdsTileGeometry(null);
    onGdsTileGeometryChangeRef.current?.(null);
    setGdsTileMetrics(defaultPhysicalLayoutGdsTileMetrics);
    onGdsTileMetricsChangeRef.current?.(defaultPhysicalLayoutGdsTileMetrics);
    if (isGdsTileMode) {
      scheduleGdsTileRequest();
    }
  }, [isGdsTileMode, layoutSessionId, selectedTarget?.index]);

  useEffect(() => {
    if (!isGdsTileMode || !is3DViewVisible) {
      return;
    }

    gdsGeometrySnapshotVersionRef.current += 1;
    gdsGeometrySnapshotKeyRef.current = '';
    scheduleGdsDisplayedGeometrySnapshot();
  }, [is3DViewVisible, isGdsTileMode]);

  useEffect(() => {
    if (!isGdsTileMode) {
      return;
    }

    if (shouldUseFullCellGdsTile({ selectedBounds: selectedBoundsRef.current })) {
      updateGdsTileMetrics(gdsLastGoodTileRef.current);
      return;
    }

    gdsTileGenerationRef.current += 1;
    gdsTileCacheRef.current.clear();
    gdsLatestRequestKeyRef.current = '';
    if (gdsDeferredTileApplyTimeoutRef.current !== null) {
      window.clearTimeout(gdsDeferredTileApplyTimeoutRef.current);
      gdsDeferredTileApplyTimeoutRef.current = null;
    }
    gdsDeferredTileApplyRef.current = null;
    scheduleGdsTileRequest();
  }, [isGdsTileMode, layoutVisibility]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const dragState = {
      downCamera: defaultCamera,
      downX: 0,
      downY: 0,
      moved: false,
      pointerId: -1,
      previousX: 0,
      previousY: 0,
      totalDistance: 0,
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      markGdsViewportInteraction();
      const bounds = host.getBoundingClientRect();
      const zoomLimits = getPhysicalLayoutCanvasZoomLimits(catalog?.sourceKind, selectedTargetRef.current?.kind, selectedBoundsRef.current, sizeRef.current);
      updateCamera(applyLayoutWheel(cameraRef.current, event, { x: bounds.left, y: bounds.top }, zoomLimits));
      scheduleGdsTileRequest();
    };
    const selectShapeAtClientPoint = (
      clientX: number,
      clientY: number,
      camera: PhysicalLayoutCamera,
      options: { clearWhenEmpty: boolean } = { clearWhenEmpty: true },
    ) => {
      const bounds = host.getBoundingClientRect();
      const point = layoutClientPointToWorldPoint(
        { x: clientX, y: clientY },
        bounds,
        camera,
      );
      const shape = findShapeAtLayoutPoint(selectedShapesRef.current, point, 4 / camera.zoom);
      setLastPick({ shapeIndex: shape?.index ?? null, worldX: point.x, worldY: point.y });
      if (shape || options.clearWhenEmpty) {
        onHighlightedShapeChangeRef.current?.(shape?.index ?? null);
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      dragState.moved = false;
      dragState.pointerId = event.pointerId;
      dragState.downCamera = cameraRef.current;
      dragState.downX = event.clientX;
      dragState.downY = event.clientY;
      dragState.previousX = event.clientX;
      dragState.previousY = event.clientY;
      dragState.totalDistance = 0;
      host.setPointerCapture(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (dragState.pointerId !== event.pointerId) {
        return;
      }

      const dx = event.clientX - dragState.previousX;
      const dy = event.clientY - dragState.previousY;
      dragState.previousX = event.clientX;
      dragState.previousY = event.clientY;
      dragState.totalDistance += Math.hypot(dx, dy);
      dragState.moved = dragState.totalDistance > clickDistanceThresholdPx;
      updateCamera({
        ...cameraRef.current,
        panX: cameraRef.current.panX + dx,
        panY: cameraRef.current.panY + dy,
      });
      markGdsViewportInteraction();
      scheduleGdsTileRequest();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (dragState.pointerId !== event.pointerId) {
        return;
      }

      dragState.pointerId = -1;
      if (!dragState.moved) {
        selectShapeAtClientPoint(dragState.downX, dragState.downY, dragState.downCamera);
      }

      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
    };
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || dragState.moved) {
        return;
      }

      selectShapeAtClientPoint(event.clientX, event.clientY, cameraRef.current, { clearWhenEmpty: false });
    };

    host.addEventListener('wheel', handleWheel, { passive: false });
    host.addEventListener('pointerdown', handlePointerDown, true);
    host.addEventListener('pointermove', handlePointerMove, true);
    host.addEventListener('pointerup', handlePointerUp, true);
    host.addEventListener('pointercancel', handlePointerUp, true);
    host.addEventListener('click', handleClick, true);
    return () => {
      host.removeEventListener('wheel', handleWheel);
      host.removeEventListener('pointerdown', handlePointerDown, true);
      host.removeEventListener('pointermove', handlePointerMove, true);
      host.removeEventListener('pointerup', handlePointerUp, true);
      host.removeEventListener('pointercancel', handlePointerUp, true);
      host.removeEventListener('click', handleClick, true);
    };
  }, []);

  const renderFrameNow = () => {
    const frameStartedAt = performance.now();
    const app = appRef.current;
    if (!app) {
      return;
    }

    updateTransforms();
    if (isGdsTileModeRef.current && gdsTileRendererRef.current) {
      gdsTileRendererRef.current.syncCull(
        gdsDisplayedTilesRef.current,
        getViewportWorldBounds(cameraRef.current, sizeRef.current, GDS_TILE_RENDER_OVERSCAN_RATIO),
      );
    }
    updateMinimapOverlay();
    app.render();
    const frameEndedAt = performance.now();
    lastRenderDurationMsRef.current = frameEndedAt - frameStartedAt;
    if (isGdsTileModeRef.current) {
      if (isGdsViewportInteractionActive()) {
        if (lastGdsHotFrameAtRef.current !== null) {
          frameDurationsRef.current.push(frameEndedAt - lastGdsHotFrameAtRef.current);
          if (frameDurationsRef.current.length > 120) {
            frameDurationsRef.current.shift();
          }
        }
        lastGdsHotFrameAtRef.current = frameEndedAt;
      } else {
        lastGdsHotFrameAtRef.current = null;
      }
    } else {
      if (lastFrameAtRef.current !== null) {
        frameDurationsRef.current.push(frameEndedAt - lastFrameAtRef.current);
        if (frameDurationsRef.current.length > 120) {
          frameDurationsRef.current.shift();
        }
      }
      lastFrameAtRef.current = frameEndedAt;
    }
    renderCountRef.current += 1;
    if (isGdsTileModeRef.current && gdsTileDiagnosticsRef.current.displayedState !== 'empty-hidden') {
      const viewportBbox = getViewportWorldBounds(cameraRef.current, sizeRef.current, 0);
      const hasCellIntersection = selectedBoundsRef.current
        ? doLayoutBoundsIntersect(viewportBbox, selectedBoundsRef.current)
        : true;
      let hasScreenVisibleTile = false;
      let hasScreenVisibleNonEmptyTile = false;
      if (hasCellIntersection) {
        for (const entry of gdsDisplayedTilesRef.current.values()) {
          if (!doLayoutBoundsIntersect(entry.plan.bbox, viewportBbox)) {
            continue;
          }
          hasScreenVisibleTile = true;
          if (entry.tile.geometry.shapes.length > 0) {
            hasScreenVisibleNonEmptyTile = true;
            break;
          }
        }
      }

      if (
        isGdsViewportInteractionActive()
        && hasCellIntersection
        && !hasScreenVisibleTile
        && gdsTileDiagnosticsRef.current.displayedState !== 'pending-window'
      ) {
        gdsBlankFrameCountRef.current += 1;
      }
      if (hasCellIntersection && hasScreenVisibleTile && !hasScreenVisibleNonEmptyTile) {
        gdsEmptyVisibleFrameCountRef.current += 1;
      }
    }
    syncRenderCountState();
    updateGdsTileMetrics();
  };

  const requestRender = () => {
    if (renderFrameRef.current !== null) {
      return;
    }

    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      renderFrameNow();
    });
  };

  const updateCamera = (nextCamera: PhysicalLayoutCamera) => {
    cameraRef.current = nextCamera;
    const world = worldRef.current;
    if (world) {
      world.position.set(nextCamera.panX, nextCamera.panY);
      world.scale.set(nextCamera.zoom);
    }
    if (isGdsTileMode) {
      syncGdsScreenVisibleCoverage(getViewportWorldBounds(nextCamera, sizeRef.current, 0));
      syncGdsCameraState();
    } else {
      setCamera(nextCamera);
      setCameraSync(nextCamera);
    }
    requestRender();
  };

  const isGdsViewportInteractionActive = () => (
    isGdsTileModeRef.current
    && performance.now() - lastGdsInteractionAtRef.current < gdsTileApplyIdleDelayMs
  );

  const getGdsViewportIdleDelay = () => Math.max(
    16,
    gdsTileApplyIdleDelayMs - (performance.now() - lastGdsInteractionAtRef.current),
  );

  const runGdsTransformLoopFrame = () => {
    gdsTransformFrameRef.current = null;

    if (!isGdsViewportInteractionActive()) {
      if (gdsDisplayedTilesRef.current.size > 0) {
        redrawGdsDisplayedTileScene();
        requestRender();
      }
      syncRenderCountState(true);
      syncGdsCameraState(true);
      syncMinimapModelState(true);
      updateGdsTileMetrics();
      return;
    }

    if (renderFrameRef.current !== null) {
      window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
    }

    renderFrameNow();
    gdsTransformFrameRef.current = window.requestAnimationFrame(runGdsTransformLoopFrame);
  };

  const startGdsTransformLoop = () => {
    if (!isGdsTileModeRef.current || gdsTransformFrameRef.current !== null) {
      return;
    }

    gdsTransformFrameRef.current = window.requestAnimationFrame(runGdsTransformLoopFrame);
  };

  const syncRenderCountState = (force = false) => {
    const now = performance.now();
    if (isGdsTileModeRef.current && !force && isGdsViewportInteractionActive()) {
      if (gdsRenderCountSyncTimeoutRef.current === null) {
        gdsRenderCountSyncTimeoutRef.current = window.setTimeout(() => {
          gdsRenderCountSyncTimeoutRef.current = null;
          syncRenderCountState(true);
        }, getGdsViewportIdleDelay());
      }
      return;
    }

    if (!isGdsTileModeRef.current || force || now - lastRenderCountSyncAtRef.current >= 120) {
      if (gdsRenderCountSyncTimeoutRef.current !== null) {
        window.clearTimeout(gdsRenderCountSyncTimeoutRef.current);
        gdsRenderCountSyncTimeoutRef.current = null;
      }
      lastRenderCountSyncAtRef.current = now;
      setRenderCount(renderCountRef.current);
      return;
    }

    if (gdsRenderCountSyncTimeoutRef.current === null) {
      gdsRenderCountSyncTimeoutRef.current = window.setTimeout(() => {
        gdsRenderCountSyncTimeoutRef.current = null;
        lastRenderCountSyncAtRef.current = performance.now();
        setRenderCount(renderCountRef.current);
      }, Math.max(16, 120 - (now - lastRenderCountSyncAtRef.current)));
    }
  };

  const syncGdsCameraState = (force = false) => {
    if (!isGdsTileModeRef.current || force) {
      if (gdsCameraSyncTimeoutRef.current !== null) {
        window.clearTimeout(gdsCameraSyncTimeoutRef.current);
        gdsCameraSyncTimeoutRef.current = null;
      }
      setCamera(cameraRef.current);
      setCameraSync(cameraRef.current);
      return;
    }

    if (isGdsViewportInteractionActive()) {
      if (gdsCameraSyncTimeoutRef.current === null) {
        gdsCameraSyncTimeoutRef.current = window.setTimeout(() => {
          gdsCameraSyncTimeoutRef.current = null;
          syncGdsCameraState();
        }, getGdsViewportIdleDelay());
      }
      return;
    }

    if (gdsCameraSyncTimeoutRef.current !== null) {
      return;
    }

    gdsCameraSyncTimeoutRef.current = window.setTimeout(() => {
      gdsCameraSyncTimeoutRef.current = null;
      setCamera(cameraRef.current);
      setCameraSync(cameraRef.current);
    }, 80);
  };

  const syncGdsFullCameraState = () => {
    setCamera(cameraRef.current);
    setCameraSync(cameraRef.current);
  };

  const scheduleGdsTileRequest = () => {
    const currentTarget = selectedTargetRef.current;
    if (!isGdsTileModeRef.current || !layoutSessionIdRef.current || currentTarget?.index === null || currentTarget?.index === undefined) {
      return;
    }

    if (gdsTileRequestTimeoutRef.current !== null) {
      window.clearTimeout(gdsTileRequestTimeoutRef.current);
    }

    const delayMs = isGdsViewportInteractionActive() ? 120 : 40;
    gdsTileRequestTimeoutRef.current = window.setTimeout(() => {
      gdsTileRequestTimeoutRef.current = null;
      void requestGdsTileGeometry();
    }, delayMs);
  };

  const cancelPendingPreciseGdsTile = () => {
    if (gdsPreciseTileTimeoutRef.current !== null) {
      window.clearTimeout(gdsPreciseTileTimeoutRef.current);
      gdsPreciseTileTimeoutRef.current = null;
    }
  };

  const markGdsViewportInteraction = () => {
    const wasActive = isGdsViewportInteractionActive();
    lastGdsInteractionAtRef.current = performance.now();
    if (!wasActive) {
      lastGdsHotFrameAtRef.current = null;
    }
    cancelPendingPreciseGdsTile();
    startGdsTransformLoop();
  };

  const recordGdsObservedLod = (lod: number) => {
    if (!Number.isFinite(lod) || lod < 0) {
      return;
    }

    const label = `lod${Math.trunc(lod)}`;
    if (gdsObservedLodBandsRef.current.has(label)) {
      return;
    }

    gdsObservedLodBandsRef.current.add(label);
    updateGdsTileDiagnostics({
      observedLodBands: Array.from(gdsObservedLodBandsRef.current).sort().join(','),
    });
  };

  const schedulePreciseGdsTileRequest = (
    input: PhysicalLayoutGdsTileRequestInput,
    sourcePlan: PhysicalLayoutGdsTileRequestPlan,
    generation: number,
    expectedRequestKey = sourcePlan.cacheKey,
  ) => {
    cancelPendingPreciseGdsTile();
    updateGdsTileDiagnostics({
      precisePending: true,
      retryKind: 'precise',
    });
    gdsPreciseTileTimeoutRef.current = window.setTimeout(() => {
      gdsPreciseTileTimeoutRef.current = null;
      if (gdsTileGenerationRef.current !== generation || gdsLatestRequestKeyRef.current !== expectedRequestKey) {
        updateGdsTileDiagnostics({
          precisePending: false,
        });
        return;
      }

      const elapsedSinceInteraction = performance.now() - lastGdsInteractionAtRef.current;
      if (elapsedSinceInteraction < gdsPreciseTileIdleDelayMs) {
        schedulePreciseGdsTileRequest(input, sourcePlan, generation);
        return;
      }

      const currentInput = createGdsTileRequestInput(input.sessionId, input.rootCellIndex);
      const currentPlan = createGdsTileRequestPlan(currentInput);
      if (currentPlan.cacheKey !== sourcePlan.cacheKey || !shouldRequestPreciseGdsTile(currentPlan)) {
        updateGdsTileDiagnostics({
          precisePending: false,
          retryKind: 'none',
        });
        return;
      }

      const precisePlan = createGdsPreciseTileRequestPlan(currentInput);
      gdsLatestRequestKeyRef.current = precisePlan.cacheKey;
      void requestGdsTilePlan(currentInput, precisePlan, generation, {
        acceptEmpty: false,
        retryEmpty: true,
      });
    }, gdsPreciseTileIdleDelayMs);
  };

  const requestGdsTileGeometry = async () => {
    const lsp = window.electronAPI?.lsp;
    const currentSessionId = layoutSessionIdRef.current;
    const currentTarget = selectedTargetRef.current;
    if (!lsp?.layoutTileGeometry || !currentSessionId || currentTarget?.index === null || currentTarget?.index === undefined) {
      return;
    }

    const generation = gdsTileGenerationRef.current;
    const input = createGdsTileRequestInput(currentSessionId, currentTarget.index);
    if (shouldUseFullCellGdsTile(input)) {
      const plan = createGdsFullCellTileRequestPlan(input);
      if (gdsFullCellFallbackKeyRef.current !== plan.cacheKey) {
        const requestKey = plan.cacheKey;
        cancelPendingPreciseGdsTile();
        gdsLatestRequestKeyRef.current = requestKey;
        gdsPrefetchTileCountRef.current = 0;
        updateGdsTileDiagnostics({
          bboxArea: getTilePlanArea(plan),
          displayedState: gdsLastGoodTileRef.current && gdsTileDiagnosticsRef.current.tileScope === 'full-cell'
            ? 'ready-full-cell'
            : 'pending-full-cell',
          emptyReason: '',
          finalLod: gdsTileDiagnosticsRef.current.tileScope === 'full-cell' ? gdsTileDiagnosticsRef.current.finalLod : -1,
          fullCellFallbackReason: '',
          precisePending: false,
          retryKind: 'none',
          tileScope: 'full-cell',
          tileLod: plan.lod,
        });
        gdsCurrentLodBandRef.current = 'full-cell-lod0';
        recordGdsObservedLod(plan.lod);
        if (
          gdsDisplayedTilesRef.current.has(plan.cacheKey)
          && gdsLastGoodTileRef.current
          && gdsTileDiagnosticsRef.current.tileScope === 'full-cell'
        ) {
          updateGdsTileMetrics(gdsLastGoodTileRef.current);
          return;
        }
        void requestGdsFullCellTile(input, plan, generation, requestKey);
        return;
      }

      updateGdsTileDiagnostics({
        fullCellFallbackReason: gdsFullCellFallbackReasonRef.current,
        fullCellShapeCount: 0,
        tileScope: 'viewport-window',
      });
    }

    const windowPlan = createGdsTileWindowPlan(input);
    const plan = windowPlan.primaryPlan;
    const requestKey = createGdsTileWindowRequestKey(windowPlan.visiblePlans);
    gdsCurrentLodBandRef.current = `lod${plan.lod}:tile${windowPlan.tileWorldSize.toFixed(3)}`;
    recordGdsObservedLod(plan.lod);
    cancelPendingPreciseGdsTile();
    gdsLatestRequestKeyRef.current = requestKey;
    gdsPrefetchTileCountRef.current = windowPlan.prefetchPlans.length;
    updateGdsTileDiagnostics({
      bboxArea: getTilePlanArea(plan),
      displayedState: gdsDisplayedTilesRef.current.size > 0 || gdsLastGoodTileRef.current ? 'pending-window-last-good' : 'pending-window',
      emptyReason: '',
      precisePending: false,
      retryKind: 'none',
      tileScope: 'viewport-window',
      tileLod: plan.lod,
    });
    if (plan.empty) {
      if (
        plan.emptyReason === 'outside-cell-bounds'
        && (gdsDisplayedTilesRef.current.size > 0 || gdsLastGoodTileRef.current)
      ) {
        syncGdsScreenVisibleCoverage(getViewportWorldBounds(cameraRef.current, sizeRef.current, 0));
        const displayedShapeCount = getGdsDisplayedTileShapeCount(gdsDisplayedTilesRef.current);
        updateGdsTileDiagnostics({
          bboxArea: getTilePlanArea(plan),
          displayedState: gdsDisplayedTilesRef.current.size > 0
            ? 'outside-kept-displayed-atlas'
            : 'outside-kept-last-good',
          emptyReason: 'outside-cell-bounds',
          lastGoodShapeCount: displayedShapeCount > 0
            ? displayedShapeCount
            : gdsLastGoodTileRef.current?.geometry.shapes.length ?? 0,
          precisePending: false,
          retryKind: 'none',
          tileScope: 'viewport-window',
          tileLod: plan.lod,
        });
        updateGdsTileMetrics(null);
        return;
      }
      const emptyTile = createEmptyGdsTileGeometry(catalog?.unitsPerMicron);
      gdsTileCacheRef.current.set(plan.cacheKey, emptyTile);
      if (plan.emptyReason === 'all-hidden') {
        gdsLastGoodTileRef.current = null;
      }
      applyGdsTile(emptyTile, plan, generation, 0, {
        acceptEmpty: true,
        state: plan.emptyReason === 'outside-cell-bounds' ? 'empty-outside-cell-bounds' : 'empty-hidden',
      });
      return;
    }

    void requestGdsTileWindow(input, windowPlan, generation, requestKey);
  };

  const requestGdsFullCellTile = async (
    input: PhysicalLayoutGdsTileRequestInput,
    plan: PhysicalLayoutGdsTileRequestPlan,
    generation: number,
    requestKey: string,
  ) => {
    const result = await loadGdsTilePlan(input, plan, generation);
    if (generation !== gdsTileGenerationRef.current || requestKey !== gdsLatestRequestKeyRef.current) {
      return;
    }

    const fallbackReason = getGdsFullCellFallbackReason(result);
    if (fallbackReason) {
      gdsFullCellFallbackKeyRef.current = plan.cacheKey;
      gdsFullCellFallbackReasonRef.current = fallbackReason;
      updateGdsTileDiagnostics({
        bboxArea: getTilePlanArea(plan),
        displayedState: 'full-cell-fallback',
        emptyReason: fallbackReason,
        fullCellFallbackReason: fallbackReason,
        fullCellShapeCount: 0,
        precisePending: false,
        retryKind: 'none',
        tileScope: 'viewport-window',
        tileLod: plan.lod,
      });
      const windowPlan = createGdsTileWindowPlan(input);
      const windowRequestKey = createGdsTileWindowRequestKey(windowPlan.visiblePlans);
      gdsLatestRequestKeyRef.current = windowRequestKey;
      gdsPrefetchTileCountRef.current = windowPlan.prefetchPlans.length;
      void requestGdsTileWindow(input, windowPlan, generation, windowRequestKey);
      return;
    }

    const tile = result?.tile;
    if (!tile) {
      return;
    }
    updateGdsTileDiagnostics({
      fullCellFallbackReason: '',
      fullCellShapeCount: tile.geometry.shapes.length,
      tileScope: 'full-cell',
    });
    applyOrDeferGdsTile(tile, plan, generation, result.roundtripMs, {
      acceptEmpty: false,
      preserveDisplayedTiles: false,
      state: 'ready-full-cell',
    });
  };

  const requestGdsTileWindow = async (
    input: PhysicalLayoutGdsTileRequestInput,
    windowPlan: ReturnType<typeof createGdsTileWindowPlan>,
    generation: number,
    requestKey: string,
  ) => {
    const cachedVisibleResults = getCachedGdsTilePlanResults(windowPlan.visiblePlans);
    if (cachedVisibleResults.length > 0) {
      const cachedAtlasUpdate = createGdsTileAtlasUpdate({
        currentTiles: gdsDisplayedTilesRef.current,
        incomingTiles: cachedVisibleResults.map((result) => ({
          plan: result.plan,
          tile: result.tile,
        })),
        windowPlan,
      });
      if (
        cachedAtlasUpdate.tiles.size > 0
        && (
          gdsDisplayedTilesRef.current.size === 0
          || cachedAtlasUpdate.screenVisibleCoverageRatio >= GDS_TILE_REPLACE_MIN_COVERAGE
        )
      ) {
        applyOrDeferGdsDisplayedTileSet(
          cachedAtlasUpdate.tiles,
          windowPlan,
          generation,
          0,
          cachedAtlasUpdate.screenVisibleCoverageRatio < GDS_TILE_REPLACE_MIN_COVERAGE
            ? 'cached-partial-window-atlas'
            : 'cached-ready-window',
        );
      }
    }

    const cachedKeys = new Set(cachedVisibleResults.map((result) => result.plan.cacheKey));
    const visiblePlansToLoad = windowPlan.visiblePlans.filter((plan) => !cachedKeys.has(plan.cacheKey));
    const visibleResults = await loadGdsTilePlans(input, visiblePlansToLoad, generation, 2);
    if (generation !== gdsTileGenerationRef.current || requestKey !== gdsLatestRequestKeyRef.current) {
      return;
    }

    const nonEmptyTiles = [...cachedVisibleResults, ...visibleResults]
      .filter((result): result is LoadedGdsTilePlan => (
        Boolean(result && result.tile.geometry.shapes.length > 0)
      ));
    if (nonEmptyTiles.length === 0) {
      if (gdsDisplayedTilesRef.current.size > 0 || gdsLastGoodTileRef.current) {
        gdsOverviewFallbackActiveRef.current = true;
        updateGdsTileDiagnostics({
          bboxArea: getTilePlanArea(windowPlan.primaryPlan),
          displayedState: 'empty-window-kept-last-good',
          emptyReason: 'empty-window-no-replacement',
          lastGoodShapeCount: gdsLastGoodTileRef.current?.geometry.shapes.length ?? 0,
          precisePending: false,
          retryKind: 'none',
          tileScope: 'viewport-window',
          tileLod: windowPlan.primaryPlan.lod,
        });
        updateGdsTileMetrics(gdsLastGoodTileRef.current);
        return;
      }

      const retryKind = getGdsEmptyTileRetryKind(windowPlan.primaryPlan, selectedBoundsRef.current);
      if (retryKind !== 'none') {
        const retryPlan = retryKind === 'precise'
          ? createGdsRetryTileRequestPlan(input)
          : createGdsOverviewRetryTileRequestPlan(input);
        gdsLatestRequestKeyRef.current = retryPlan.cacheKey;
        retryTileRequestCountRef.current += 1;
        updateGdsTileDiagnostics({
          bboxArea: getTilePlanArea(retryPlan),
          displayedState: 'empty-window-retry',
          emptyReason: retryKind === 'precise' ? 'retry-expanded-lod0' : 'retry-overview',
          precisePending: retryKind === 'precise',
          retryKind,
          tileScope: 'viewport-window',
          tileLod: windowPlan.primaryPlan.lod,
        });
        void requestGdsTilePlan(input, retryPlan, generation, {
          acceptEmpty: true,
          retryEmpty: false,
        });
        return;
      }

      const emptyTile = createEmptyGdsTileGeometry(catalog?.unitsPerMicron);
      applyGdsTile(emptyTile, windowPlan.primaryPlan, generation, 0, {
        acceptEmpty: true,
        state: 'empty-window-confirmed',
      });
      return;
    }

    const atlasUpdate = createGdsTileAtlasUpdate({
      currentTiles: gdsDisplayedTilesRef.current,
      incomingTiles: nonEmptyTiles.map((result) => ({
        plan: result.plan,
        tile: result.tile,
      })),
      windowPlan,
    });
    if (
      atlasUpdate.tiles.size === 0
      || (
        gdsDisplayedTilesRef.current.size > 0
        && atlasUpdate.screenVisibleCoverageRatio < GDS_TILE_REPLACE_MIN_COVERAGE
      )
    ) {
      const currentViewportBbox = getViewportWorldBounds(cameraRef.current, sizeRef.current, 0);
      gdsCoverageRatioRef.current = calculateGdsTileCoverageRatio(Array.from(atlasUpdate.tiles.values()), currentViewportBbox);
      gdsNonEmptyCoverageRatioRef.current = calculateGdsNonEmptyTileCoverageRatio(
        Array.from(atlasUpdate.tiles.values()),
        currentViewportBbox,
      );
      syncGdsScreenVisibleCoverage(currentViewportBbox);
      updateGdsTileDiagnostics({
        bboxArea: getTilePlanArea(windowPlan.primaryPlan),
        displayedState: 'partial-window-kept-last-good',
        emptyReason: atlasUpdate.visualEmptyReason || 'coverage-pending',
        lastGoodShapeCount: gdsLastGoodTileRef.current?.geometry.shapes.length ?? 0,
        precisePending: false,
        retryKind: 'none',
        tileScope: 'viewport-window',
        tileLod: windowPlan.primaryPlan.lod,
      });
      updateGdsTileMetrics(gdsLastGoodTileRef.current);
      return;
    }
    applyOrDeferGdsDisplayedTileSet(
      atlasUpdate.tiles,
      windowPlan,
      generation,
      Math.max(...nonEmptyTiles.map((result) => result.roundtripMs), 0),
      atlasUpdate.screenVisibleCoverageRatio < GDS_TILE_REPLACE_MIN_COVERAGE ? 'partial-window-atlas' : 'ready-window',
    );

    if (shouldRequestPreciseGdsTile(windowPlan.primaryPlan)) {
      schedulePreciseGdsTileRequest(input, windowPlan.primaryPlan, generation, requestKey);
    }

    if (windowPlan.prefetchPlans.length > 0) {
      void loadGdsTilePlans(input, windowPlan.prefetchPlans, generation, 1);
    }
  };

  const loadGdsTilePlans = async (
    input: PhysicalLayoutGdsTileRequestInput,
    plans: readonly PhysicalLayoutGdsTileRequestPlan[],
    generation: number,
    concurrency: number,
  ): Promise<Array<LoadedGdsTilePlan | null>> => {
    const results: Array<LoadedGdsTilePlan | null> = new Array(plans.length).fill(null);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < plans.length) {
        const planIndex = nextIndex;
        nextIndex += 1;
        const plan = plans[planIndex];
        if (!plan) {
          continue;
        }
        results[planIndex] = await loadGdsTilePlan(input, plan, generation);
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, plans.length)) }, () => worker()));
    return results;
  };

  const getCachedGdsTilePlanResults = (
    plans: readonly PhysicalLayoutGdsTileRequestPlan[],
  ): LoadedGdsTilePlan[] => plans.flatMap((plan) => {
    const tile = gdsTileCacheRef.current.peek(plan.cacheKey);
    return tile ? [{ plan, roundtripMs: 0, stoppedByBudget: false, tile }] : [];
  });

  const loadGdsTilePlan = async (
    _input: PhysicalLayoutGdsTileRequestInput,
    plan: PhysicalLayoutGdsTileRequestPlan,
    generation: number,
  ): Promise<LoadedGdsTilePlan | null> => {
    const lsp = window.electronAPI?.lsp;
    if (!lsp?.layoutTileGeometry || plan.empty) {
      return null;
    }

    recordGdsObservedLod(plan.lod);

    const cachedTile = gdsTileCacheRef.current.get(plan.cacheKey);
    if (cachedTile) {
      return { plan, roundtripMs: 0, stoppedByBudget: false, tile: cachedTile };
    }

    const startedAt = performance.now();
    const results: LspLayoutTileGeometry[] = [];
    const seenContinuationTokens = new Set<number>();
    let continuationToken: number | null | undefined = undefined;
    let continuationCount = 0;
    let mergedPayloadSize = 0;
    let stoppedByBudget = false;
    inflightTileRequestCountRef.current += 1;
    updateGdsTileMetrics();
    try {
      do {
        const tile = await lsp.layoutTileGeometry({
          ...plan.options,
          continuationToken,
        });
        if (gdsTileGenerationRef.current !== generation) {
          return null;
        }
        results.push(tile);
        mergedPayloadSize += Math.max(0, tile.payloadSize);
        continuationToken = tile.nextToken;
        if (continuationToken !== null && continuationToken !== undefined) {
          if (seenContinuationTokens.has(continuationToken)) {
            updateGdsTileDiagnostics({ emptyReason: 'repeated-continuation-token' });
            stoppedByBudget = true;
            continuationToken = null;
          } else {
            seenContinuationTokens.add(continuationToken);
          }
        }
        continuationCount += 1;
        if (continuationCount > gdsTileMaxContinuationPages) {
          updateGdsTileDiagnostics({ emptyReason: 'continuation-limit' });
          stoppedByBudget = true;
          continuationToken = null;
        }
        if (mergedPayloadSize > gdsTileMaxMergedPayloadBytes) {
          updateGdsTileDiagnostics({ emptyReason: 'payload-budget-exceeded' });
          stoppedByBudget = true;
          continuationToken = null;
        }
      } while (continuationToken !== null && continuationToken !== undefined);

      const mergedTile = mergeGdsTileGeometryResults(results);
      if (!mergedTile) {
        return null;
      }

      gdsTileCacheRef.current.set(plan.cacheKey, mergedTile);
      tileRequestCountRef.current += 1;
      lastTileContinuationCountRef.current = Math.max(lastTileContinuationCountRef.current, Math.max(0, continuationCount - 1));
      return { plan, roundtripMs: performance.now() - startedAt, stoppedByBudget, tile: mergedTile };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load GDS viewport tile.');
      return null;
    } finally {
      inflightTileRequestCountRef.current = Math.max(0, inflightTileRequestCountRef.current - 1);
      updateGdsTileMetrics();
    }
  };

  const applyGdsDisplayedTileSet = (
    tiles: Map<string, PhysicalLayoutGdsDisplayedTile>,
    windowPlan: ReturnType<typeof createGdsTileWindowPlan>,
    generation: number,
    roundtripMs: number,
    state: string,
  ) => {
    if (generation !== gdsTileGenerationRef.current) {
      return;
    }

    if (tiles.size === 0) {
      return;
    }

    const applyStartedAt = performance.now();
    const coverageRatio = calculateGdsTileCoverageRatio(Array.from(tiles.values()), windowPlan.viewportBbox);
    const nonEmptyCoverageRatio = calculateGdsNonEmptyTileCoverageRatio(Array.from(tiles.values()), windowPlan.viewportBbox);
    gdsDisplayedTilesRef.current = tiles;
    gdsDisplayedViewportBboxRef.current = windowPlan.viewportBbox;
    gdsCoverageRatioRef.current = coverageRatio;
    gdsNonEmptyCoverageRatioRef.current = nonEmptyCoverageRatio;
    gdsActiveTileCountRef.current = tiles.size;
    gdsOverviewFallbackActiveRef.current = windowPlan.primaryPlan.lod > 0;
    lastTileRoundtripMsRef.current = roundtripMs;
    maxTileRoundtripMsRef.current = Math.max(maxTileRoundtripMsRef.current, roundtripMs);
    const buildStartedAt = performance.now();
    redrawGdsDisplayedTileScene();
    lastGdsTileBuildMsRef.current = performance.now() - buildStartedAt;
    lastGdsTileApplyMsRef.current = performance.now() - applyStartedAt;
    maxTileBuildMsRef.current = Math.max(maxTileBuildMsRef.current, lastGdsTileBuildMsRef.current);
    maxTileApplyMsRef.current = Math.max(maxTileApplyMsRef.current, lastGdsTileApplyMsRef.current);
    requestRender();
    scheduleGdsDisplayedGeometrySnapshot();
    syncGdsCameraState(false);
    syncRenderCountState(false);
    updateGdsTileMetrics();
    updateGdsTileDiagnostics({
      bboxArea: getTilePlanArea(windowPlan.primaryPlan),
      displayedState: state,
      emptyReason: '',
      finalLod: windowPlan.primaryPlan.lod,
      lastGoodShapeCount: getGdsDisplayedTileShapeCount(tiles),
      precisePending: false,
      retryKind: 'none',
      tileLod: windowPlan.primaryPlan.lod,
    });
  };

  const shouldDeferGdsTileAtlasApply = () => (
    isGdsTileModeRef.current
    && gdsDisplayedTilesRef.current.size > 0
    && performance.now() - lastGdsInteractionAtRef.current < gdsTileApplyIdleDelayMs
  );

  const clearDeferredGdsTileAtlasApply = () => {
    if (gdsDeferredAtlasApplyTimeoutRef.current !== null) {
      window.clearTimeout(gdsDeferredAtlasApplyTimeoutRef.current);
      gdsDeferredAtlasApplyTimeoutRef.current = null;
    }
    gdsDeferredAtlasApplyRef.current = null;
  };

  const scheduleDeferredGdsTileAtlasApply = (pending: PendingGdsTileAtlasApply) => {
    gdsDeferredAtlasApplyRef.current = pending;
    if (gdsDeferredAtlasApplyTimeoutRef.current !== null) {
      window.clearTimeout(gdsDeferredAtlasApplyTimeoutRef.current);
    }

    const delayMs = Math.max(
      16,
      gdsTileApplyIdleDelayMs - (performance.now() - lastGdsInteractionAtRef.current),
    );
    gdsDeferredAtlasApplyTimeoutRef.current = window.setTimeout(() => {
      gdsDeferredAtlasApplyTimeoutRef.current = null;
      const currentPending = gdsDeferredAtlasApplyRef.current;
      if (!currentPending) {
        return;
      }

      if (performance.now() - lastGdsInteractionAtRef.current < gdsTileApplyIdleDelayMs) {
        scheduleDeferredGdsTileAtlasApply(currentPending);
        return;
      }

      const currentRequestKey = createGdsTileWindowRequestKey(currentPending.windowPlan.visiblePlans);
      if (
        currentPending.generation !== gdsTileGenerationRef.current
        || currentRequestKey !== gdsLatestRequestKeyRef.current
      ) {
        gdsDeferredAtlasApplyRef.current = null;
        return;
      }

      gdsDeferredAtlasApplyRef.current = null;
      applyGdsDisplayedTileSet(
        currentPending.tiles,
        currentPending.windowPlan,
        currentPending.generation,
        currentPending.roundtripMs,
        currentPending.state,
      );
    }, delayMs);
  };

  const applyOrDeferGdsDisplayedTileSet = (
    tiles: Map<string, PhysicalLayoutGdsDisplayedTile>,
    windowPlan: ReturnType<typeof createGdsTileWindowPlan>,
    generation: number,
    roundtripMs: number,
    state: string,
  ) => {
    if (generation !== gdsTileGenerationRef.current) {
      return;
    }

    if (shouldDeferGdsTileAtlasApply()) {
      const currentViewportBbox = getViewportWorldBounds(cameraRef.current, sizeRef.current, 0);
      const currentScreenCoverage = calculateGdsScreenVisibleCoverage({
        cellBounds: selectedBoundsRef.current,
        tiles: Array.from(gdsDisplayedTilesRef.current.values()),
        viewportBbox: currentViewportBbox,
      });
      const shouldApplyNowForVisibleCoverage = (
        currentScreenCoverage.cellIntersectionRatio > 0
        && currentScreenCoverage.screenVisibleNonEmptyCoverageRatio <= 0
      );
      if (shouldApplyNowForVisibleCoverage) {
        applyGdsDisplayedTileSet(tiles, windowPlan, generation, roundtripMs, state);
        return;
      }

      scheduleDeferredGdsTileAtlasApply({
        generation,
        roundtripMs,
        state,
        tiles,
        windowPlan,
      });
      gdsCoverageRatioRef.current = calculateGdsTileCoverageRatio(Array.from(gdsDisplayedTilesRef.current.values()), currentViewportBbox);
      gdsNonEmptyCoverageRatioRef.current = calculateGdsNonEmptyTileCoverageRatio(
        Array.from(gdsDisplayedTilesRef.current.values()),
        currentViewportBbox,
      );
      const screenCoverage = syncGdsScreenVisibleCoverage(currentViewportBbox);
      updateGdsTileDiagnostics({
        bboxArea: getTilePlanArea(windowPlan.primaryPlan),
        displayedState: gdsDisplayedTilesRef.current.size > 0 ? 'deferred-window-atlas-last-good' : 'deferred-window-atlas',
        emptyReason: screenCoverage.visualEmptyReason,
        precisePending: false,
        retryKind: 'none',
        tileLod: windowPlan.primaryPlan.lod,
      });
      updateGdsTileMetrics();
      return;
    }

    applyGdsDisplayedTileSet(tiles, windowPlan, generation, roundtripMs, state);
  };

  const createGdsTileRequestInput = (sessionId: string, rootCellIndex: number): PhysicalLayoutGdsTileRequestInput => ({
      camera: cameraRef.current,
      rootCellIndex,
      selectedBounds: selectedBoundsRef.current,
      sessionId,
      size: sizeRef.current,
      visibility: layoutVisibilityRef.current,
    });

  const requestGdsTilePlan = async (
    input: PhysicalLayoutGdsTileRequestInput,
    plan: PhysicalLayoutGdsTileRequestPlan,
    generation: number,
    options: { acceptEmpty?: boolean; requestPreciseAfterSuccess?: boolean; retryEmpty?: boolean },
  ) => {
    const lsp = window.electronAPI?.lsp;
    if (!lsp?.layoutTileGeometry) {
      return;
    }

    recordGdsObservedLod(plan.lod);

    const cachedTile = gdsTileCacheRef.current.get(plan.cacheKey);
    if (cachedTile) {
      lastTileContinuationCountRef.current = 0;
      handleGdsTileResult(cachedTile, input, plan, generation, 0, options);
      return;
    }

    const startedAt = performance.now();
    const results: LspLayoutTileGeometry[] = [];
    const seenContinuationTokens = new Set<number>();
    let continuationToken: number | null | undefined = undefined;
    let continuationCount = 0;
    let mergedPayloadSize = 0;
    let stoppedByBudget = false;
    inflightTileRequestCountRef.current += 1;
    updateGdsTileMetrics();
    try {
      do {
        const tile = await lsp.layoutTileGeometry({
          ...plan.options,
          continuationToken,
        });
        if (gdsTileGenerationRef.current !== generation) {
          return;
        }
        results.push(tile);
        mergedPayloadSize += Math.max(0, tile.payloadSize);
        continuationToken = tile.nextToken;
        if (continuationToken !== null && continuationToken !== undefined) {
          if (seenContinuationTokens.has(continuationToken)) {
            updateGdsTileDiagnostics({
              emptyReason: 'repeated-continuation-token',
            });
            stoppedByBudget = true;
            continuationToken = null;
          } else {
            seenContinuationTokens.add(continuationToken);
          }
        }
        continuationCount += 1;
        if (continuationCount > gdsTileMaxContinuationPages) {
          updateGdsTileDiagnostics({
            emptyReason: 'continuation-limit',
          });
          stoppedByBudget = true;
          continuationToken = null;
        }
        if (mergedPayloadSize > gdsTileMaxMergedPayloadBytes) {
          updateGdsTileDiagnostics({
            emptyReason: 'payload-budget-exceeded',
          });
          stoppedByBudget = true;
          continuationToken = null;
        }
      } while (continuationToken !== null && continuationToken !== undefined);

      if (stoppedByBudget) {
        lastTileContinuationCountRef.current = Math.max(0, continuationCount - 1);
        if (gdsLastGoodTileRef.current) {
          updateGdsTileDiagnostics({
        displayedState: 'budget-kept-last-good',
        precisePending: false,
        retryKind: 'none',
          });
        }
        return;
      }

      const mergedTile = mergeGdsTileGeometryResults(results);
      if (!mergedTile) {
        return;
      }

      gdsTileCacheRef.current.set(plan.cacheKey, mergedTile);
      tileRequestCountRef.current += 1;
      lastTileContinuationCountRef.current = Math.max(0, continuationCount - 1);
      handleGdsTileResult(mergedTile, input, plan, generation, performance.now() - startedAt, options);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load GDS viewport tile.');
    } finally {
      inflightTileRequestCountRef.current = Math.max(0, inflightTileRequestCountRef.current - 1);
      updateGdsTileMetrics();
    }
  };

  const handleGdsTileResult = (
    tile: LspLayoutTileGeometry,
    input: PhysicalLayoutGdsTileRequestInput,
    plan: PhysicalLayoutGdsTileRequestPlan,
    generation: number,
    roundtripMs: number,
    options: { acceptEmpty?: boolean; requestPreciseAfterSuccess?: boolean; retryEmpty?: boolean },
  ) => {
    if (gdsTileGenerationRef.current !== generation) {
      return;
    }

    if (gdsLatestRequestKeyRef.current !== plan.cacheKey) {
      return;
    }

    if (tile.geometry.shapes.length === 0 && !options.acceptEmpty) {
      const retryKind = options.retryEmpty === false
        ? 'none'
        : getGdsEmptyTileRetryKind(plan, selectedBoundsRef.current);
      if (retryKind !== 'none') {
        const retryPlan = retryKind === 'precise'
          ? createGdsRetryTileRequestPlan(input)
          : createGdsOverviewRetryTileRequestPlan(input);
        gdsLatestRequestKeyRef.current = retryPlan.cacheKey;
        retryTileRequestCountRef.current += 1;
        updateGdsTileDiagnostics({
          bboxArea: getTilePlanArea(retryPlan),
        displayedState: gdsLastGoodTileRef.current ? 'empty-retry-last-good' : 'empty-retry',
          emptyReason: retryKind === 'precise' ? 'retry-expanded-lod0' : 'retry-overview',
          precisePending: retryKind === 'precise',
          retryKind,
          tileLod: plan.lod,
        });
        void requestGdsTilePlan(input, retryPlan, generation, {
          acceptEmpty: true,
          retryEmpty: false,
        });
        return;
      }

      if (gdsLastGoodTileRef.current) {
        updateGdsTileDiagnostics({
        displayedState: 'empty-kept-last-good',
          emptyReason: retryKind === 'none' ? 'empty-no-safe-retry' : 'empty-current-tile',
          precisePending: false,
          retryKind,
          tileLod: plan.lod,
        });
        updateGdsTileMetrics(tile);
        return;
      }
    }

    applyOrDeferGdsTile(tile, plan, generation, roundtripMs, {
      acceptEmpty: Boolean(options.acceptEmpty),
      state: tile.geometry.shapes.length > 0 ? 'ready' : 'empty-confirmed',
    });

    if (tile.geometry.shapes.length > 0 && options.requestPreciseAfterSuccess && shouldRequestPreciseGdsTile(plan)) {
      schedulePreciseGdsTileRequest(input, plan, generation);
    }
  };

  const applyGdsTile = (
    tile: LspLayoutTileGeometry,
    plan: PhysicalLayoutGdsTileRequestPlan,
    generation: number,
    roundtripMs: number,
    options: { acceptEmpty: boolean; preserveDisplayedTiles?: boolean; state: string },
  ) => {
    if (gdsTileGenerationRef.current !== generation) {
      return;
    }

    clearDeferredGdsTileAtlasApply();
    lastTileRoundtripMsRef.current = roundtripMs;
    maxTileRoundtripMsRef.current = Math.max(maxTileRoundtripMsRef.current, roundtripMs);
    const applyStartedAt = performance.now();
    if (tile.geometry.shapes.length > 0) {
      gdsLastGoodTileRef.current = tile;
      gdsGeometrySnapshotKeyRef.current = '';
      if (!options.preserveDisplayedTiles) {
        gdsDisplayedTilesRef.current = new Map([[plan.cacheKey, { plan, tile }]]);
        gdsDisplayedViewportBboxRef.current = plan.bbox;
        gdsCoverageRatioRef.current = 1;
        gdsNonEmptyCoverageRatioRef.current = 1;
        gdsActiveTileCountRef.current = 1;
        gdsOverviewFallbackActiveRef.current = plan.lod > 0;
      }
    } else if (options.acceptEmpty && !options.preserveDisplayedTiles) {
      gdsLastGoodTileRef.current = null;
      gdsGeometrySnapshotKeyRef.current = '';
      gdsDisplayedTilesRef.current = new Map();
      gdsDisplayedViewportBboxRef.current = plan.bbox;
      gdsCoverageRatioRef.current = 0;
      gdsNonEmptyCoverageRatioRef.current = 0;
      gdsActiveTileCountRef.current = 0;
      gdsOverviewFallbackActiveRef.current = false;
    }
    const isFullCellTile = gdsTileDiagnosticsRef.current.tileScope === 'full-cell';
    if (isFullCellTile) {
      gdsReactSyncCountRef.current += 1;
      setGdsTileGeometry(tile.geometry);
      onGdsTileGeometryChangeRef.current?.(tile.geometry);
    } else if (tile.geometry.shapes.length > 0) {
      scheduleGdsDisplayedGeometrySnapshot();
    } else if (options.acceptEmpty && !options.preserveDisplayedTiles && plan.emptyReason === 'all-hidden') {
      gdsReactSyncCountRef.current += 1;
      setGdsTileGeometry(null);
      onGdsTileGeometryChangeRef.current?.(null);
    }
    const buildStartedAt = performance.now();
    redrawScene(tile.geometry);
    lastGdsTileBuildMsRef.current = performance.now() - buildStartedAt;
    lastGdsTileApplyMsRef.current = performance.now() - applyStartedAt;
    maxTileBuildMsRef.current = Math.max(maxTileBuildMsRef.current, lastGdsTileBuildMsRef.current);
    maxTileApplyMsRef.current = Math.max(maxTileApplyMsRef.current, lastGdsTileApplyMsRef.current);
    requestRender();
    syncGdsFullCameraState();
    syncRenderCountState(true);
    updateGdsTileMetrics(tile);
    updateGdsTileDiagnostics({
      bboxArea: getTilePlanArea(plan),
      displayedState: options.state,
      emptyReason: tile.geometry.shapes.length === 0
        ? plan.emptyReason || (options.acceptEmpty ? 'accepted-empty' : 'empty-current-tile')
        : '',
      finalLod: plan.lod,
      fullCellShapeCount: gdsTileDiagnosticsRef.current.tileScope === 'full-cell'
        ? tile.geometry.shapes.length
        : gdsTileDiagnosticsRef.current.fullCellShapeCount,
      lastGoodShapeCount: gdsLastGoodTileRef.current?.geometry.shapes.length ?? 0,
      precisePending: false,
      retryKind: tile.geometry.shapes.length === 0 ? gdsTileDiagnosticsRef.current.retryKind : 'none',
      tileLod: plan.lod,
    });
  };

  const shouldDeferGdsTileApply = (tile: LspLayoutTileGeometry, options: { acceptEmpty: boolean }) => {
    if (!isGdsTileModeRef.current || tile.geometry.shapes.length === 0 || options.acceptEmpty) {
      return false;
    }

    return performance.now() - lastGdsInteractionAtRef.current < gdsTileApplyIdleDelayMs;
  };

  const clearDeferredGdsTileApply = () => {
    if (gdsDeferredTileApplyTimeoutRef.current !== null) {
      window.clearTimeout(gdsDeferredTileApplyTimeoutRef.current);
      gdsDeferredTileApplyTimeoutRef.current = null;
    }
    gdsDeferredTileApplyRef.current = null;
  };

  const scheduleDeferredGdsTileApply = (pending: PendingGdsTileApply) => {
    gdsDeferredTileApplyRef.current = pending;
    if (gdsDeferredTileApplyTimeoutRef.current !== null) {
      window.clearTimeout(gdsDeferredTileApplyTimeoutRef.current);
    }

    const delayMs = Math.max(
      16,
      gdsTileApplyIdleDelayMs - (performance.now() - lastGdsInteractionAtRef.current),
    );
    gdsDeferredTileApplyTimeoutRef.current = window.setTimeout(() => {
      gdsDeferredTileApplyTimeoutRef.current = null;
      const currentPending = gdsDeferredTileApplyRef.current;
      if (!currentPending) {
        return;
      }

      if (performance.now() - lastGdsInteractionAtRef.current < gdsTileApplyIdleDelayMs) {
        scheduleDeferredGdsTileApply(currentPending);
        return;
      }

      if (
        currentPending.generation !== gdsTileGenerationRef.current
        || currentPending.plan.cacheKey !== gdsLatestRequestKeyRef.current
      ) {
        gdsDeferredTileApplyRef.current = null;
        return;
      }

      gdsDeferredTileApplyRef.current = null;
      applyGdsTile(
        currentPending.tile,
        currentPending.plan,
        currentPending.generation,
        currentPending.roundtripMs,
        currentPending.options,
      );
    }, delayMs);
  };

  const applyOrDeferGdsTile = (
    tile: LspLayoutTileGeometry,
    plan: PhysicalLayoutGdsTileRequestPlan,
    generation: number,
    roundtripMs: number,
    options: { acceptEmpty: boolean; preserveDisplayedTiles?: boolean; state: string },
  ) => {
    if (
      generation !== gdsTileGenerationRef.current
      || plan.cacheKey !== gdsLatestRequestKeyRef.current
    ) {
      return;
    }

    if (shouldDeferGdsTileApply(tile, options)) {
      scheduleDeferredGdsTileApply({
        generation,
        options,
        plan,
        roundtripMs,
        tile,
      });
      updateGdsTileDiagnostics({
        bboxArea: getTilePlanArea(plan),
        displayedState: gdsLastGoodTileRef.current ? 'deferred-last-good' : 'deferred',
        emptyReason: '',
        precisePending: false,
        retryKind: 'none',
        tileLod: plan.lod,
      });
      updateGdsTileMetrics(gdsLastGoodTileRef.current ?? tile);
      return;
    }

    clearDeferredGdsTileApply();
    applyGdsTile(tile, plan, generation, roundtripMs, options);
  };

  const updateGdsTileDiagnostics = (updates: Partial<typeof gdsTileDiagnosticsRef.current>) => {
    const nextDiagnostics = {
      ...gdsTileDiagnosticsRef.current,
      ...updates,
    };
    gdsTileDiagnosticsRef.current = nextDiagnostics;
    setGdsTileDiagnostics(nextDiagnostics);
  };

  const syncGdsScreenVisibleCoverage = (viewportBbox = getViewportWorldBounds(cameraRef.current, sizeRef.current, 0)) => {
    gdsViewportBboxRef.current = viewportBbox;
    const screenCoverage = calculateGdsScreenVisibleCoverage({
      allHidden: gdsTileDiagnosticsRef.current.displayedState === 'empty-hidden',
      cellBounds: selectedBoundsRef.current,
      tiles: Array.from(gdsDisplayedTilesRef.current.values()),
      viewportBbox,
    });
    gdsScreenVisibleCoverageRatioRef.current = screenCoverage.screenVisibleCoverageRatio;
    gdsScreenVisibleNonEmptyCoverageRatioRef.current = screenCoverage.screenVisibleNonEmptyCoverageRatio;
    gdsScreenVisibleTileCountRef.current = screenCoverage.screenVisibleTileCount;
    gdsScreenVisibleShapeCountRef.current = screenCoverage.screenVisibleShapeCount;
    gdsCellIntersectionRatioRef.current = screenCoverage.cellIntersectionRatio;
    gdsVisualEmptyReasonRef.current = screenCoverage.visualEmptyReason;
    return screenCoverage;
  };

  const updateGdsTileMetrics = (tile?: LspLayoutTileGeometry | null) => {
    if (!isGdsTileModeRef.current) {
      return;
    }

    const now = performance.now();
    if (!tile && isGdsViewportInteractionActive()) {
      if (gdsMetricsSyncTimeoutRef.current === null) {
        gdsMetricsSyncTimeoutRef.current = window.setTimeout(() => {
          gdsMetricsSyncTimeoutRef.current = null;
          updateGdsTileMetrics();
        }, getGdsViewportIdleDelay());
      }
      return;
    }

    if (!tile && now - lastGdsMetricsSyncAtRef.current < 250) {
      if (gdsMetricsSyncTimeoutRef.current === null) {
        gdsMetricsSyncTimeoutRef.current = window.setTimeout(() => {
          gdsMetricsSyncTimeoutRef.current = null;
          updateGdsTileMetrics();
        }, Math.max(16, 250 - (now - lastGdsMetricsSyncAtRef.current)));
      }
      return;
    }
    if (gdsMetricsSyncTimeoutRef.current !== null) {
      window.clearTimeout(gdsMetricsSyncTimeoutRef.current);
      gdsMetricsSyncTimeoutRef.current = null;
    }
    lastGdsMetricsSyncAtRef.current = now;
    const screenCoverage = syncGdsScreenVisibleCoverage();
    const renderableShapeCount = getGdsDisplayedTileShapeCount(gdsDisplayedTilesRef.current);

    const nextMetrics = createGdsTileMetricsSnapshot({
      atlasByteLength: estimateGdsDisplayedTileAtlasByteLength(gdsDisplayedTilesRef.current),
      blankFrameCount: gdsBlankFrameCountRef.current,
      bufferCapacityVertexCount: meshStatsRef.current.bufferCapacityVertexCount,
      bufferDataReplaceCount: meshStatsRef.current.bufferDataReplaceCount,
      bufferReallocCount: meshStatsRef.current.bufferReallocCount,
      bufferSubarrayCommitCount: meshStatsRef.current.bufferSubarrayCommitCount,
      bufferUpdateCount: meshStatsRef.current.bufferUpdateCount,
      bufferUpdateMs: meshStatsRef.current.bufferUpdateMs,
      tileLayerCreateCount: meshStatsRef.current.tileLayerCreateCount,
      tileLayerReuseCount: meshStatsRef.current.tileLayerReuseCount,
      tileLayerDestroyCount: meshStatsRef.current.tileLayerDestroyCount,
      batchCreateCount: meshStatsRef.current.batchCreateCount,
      batchReuseCount: meshStatsRef.current.batchReuseCount,
      batchDestroyCount: meshStatsRef.current.batchDestroyCount,
      applyQueueDepth: (
        gdsDeferredTileApplyRef.current !== null
        || gdsDeferredAtlasApplyRef.current !== null
        || gdsGeometrySyncTimeoutRef.current !== null
      ) ? 1 : 0,
      applyChunkCount: meshStatsRef.current.applyChunkCount,
      applyBudgetOverrunCount: meshStatsRef.current.applyBudgetOverrunCount,
      idleSnapshotMs: gdsIdleSnapshotMsRef.current,
      idleSnapshotSkippedCount: gdsIdleSnapshotSkippedCountRef.current,
      columnarByteLength: meshStatsRef.current.columnarByteLength,
      atlasGpuByteLength: meshStatsRef.current.atlasGpuByteLength,
      cacheStats: gdsTileCacheRef.current.getStats(),
      continuationCount: lastTileContinuationCountRef.current,
      coverageRatio: gdsCoverageRatioRef.current,
      displayedTileCount: gdsDisplayedTilesRef.current.size,
      emptyDisplayedTileCount: getGdsDisplayedEmptyTileCount(gdsDisplayedTilesRef.current),
      emptyVisibleFrameCount: gdsEmptyVisibleFrameCountRef.current,
      frameDurationsMs: frameDurationsRef.current,
      inflightRequestCount: inflightTileRequestCountRef.current,
      tileApplyMs: lastGdsTileApplyMsRef.current,
      tileBuildMs: lastGdsTileBuildMsRef.current,
      maxFrameP95Ms: Math.max(maxFrameP95MsRef.current, calculateFrameP95Ms(frameDurationsRef.current)),
      maxTileApplyMs: maxTileApplyMsRef.current,
      maxTileBuildMs: maxTileBuildMsRef.current,
      maxTileRoundtripMs: maxTileRoundtripMsRef.current,
      meshBatchCount: meshStatsRef.current.meshBatchCount,
      meshDrawNodeCount: meshStatsRef.current.drawNodeCount,
      meshIndexCount: meshStatsRef.current.indexCount,
      meshVertexCount: meshStatsRef.current.vertexCount,
      reactSyncCount: gdsReactSyncCountRef.current,
      renderMs: lastRenderDurationMsRef.current,
      retryCount: retryTileRequestCountRef.current,
      tile: tile ?? null,
      nonEmptyCoverageRatio: gdsNonEmptyCoverageRatioRef.current,
      renderableShapeCount,
      screenVisibleCoverageRatio: screenCoverage.screenVisibleCoverageRatio,
      screenVisibleNonEmptyCoverageRatio: screenCoverage.screenVisibleNonEmptyCoverageRatio,
      screenVisibleShapeCount: screenCoverage.screenVisibleShapeCount,
      screenVisibleTileCount: screenCoverage.screenVisibleTileCount,
      cellIntersectionRatio: screenCoverage.cellIntersectionRatio,
      visualEmptyReason: screenCoverage.visualEmptyReason,
      tileRequestCount: tileRequestCountRef.current,
      tileRoundtripMs: lastTileRoundtripMsRef.current,
    });
    maxFrameP95MsRef.current = Math.max(maxFrameP95MsRef.current, nextMetrics.frameP95Ms);
    setGdsTileMetrics(nextMetrics);
    onGdsTileMetricsChangeRef.current?.(nextMetrics);
  };

  const updateTransforms = () => {
    const world = worldRef.current;
    if (!world) {
      return;
    }

    const nextCamera = cameraRef.current;
    world.position.set(nextCamera.panX, nextCamera.panY);
    world.scale.set(nextCamera.zoom);
  };

  const clearGdsPersistentScene = () => {
    gdsTileRendererRef.current?.container.parent?.removeChild(gdsTileRendererRef.current.container);
    gdsChromeLayerRef.current?.parent?.removeChild(gdsChromeLayerRef.current);
    gdsOverlayWorldLayerRef.current?.parent?.removeChild(gdsOverlayWorldLayerRef.current);
    gdsTileRendererRef.current?.destroy();
    gdsChromeLayerRef.current?.destroy({ children: true });
    gdsOverlayWorldLayerRef.current?.destroy({ children: true });
    gdsTileRendererRef.current = null;
    gdsChromeLayerRef.current = null;
    gdsOverlayWorldLayerRef.current = null;
    gdsSceneActiveRef.current = false;
    gdsBackgroundSizeKeyRef.current = '';
    gdsGeometrySnapshotKeyRef.current = '';
  };

  const redrawGdsDisplayedTileScene = () => {
    const background = backgroundRef.current;
    const world = worldRef.current;
    if (!background || !world) {
      return;
    }

    const bounds = selectedBoundsRef.current;
    if (!bounds) {
      return;
    }

    const backgroundSizeKey = `${sizeRef.current.width}x${sizeRef.current.height}`;
    if (gdsBackgroundSizeKeyRef.current !== backgroundSizeKey) {
      background.removeChildren().forEach((child) => child.destroy({ children: true }));
      background.addChild(drawBackground(sizeRef.current.width, sizeRef.current.height));
      gdsBackgroundSizeKeyRef.current = backgroundSizeKey;
    }

    if (!gdsSceneActiveRef.current || !gdsChromeLayerRef.current || !gdsTileRendererRef.current || !gdsOverlayWorldLayerRef.current) {
      world.removeChildren().forEach((child) => child.destroy({ children: true }));
      const chromeLayer = new Container({ label: 'gds-chrome-layer' });
      const tileRenderer = new PhysicalLayoutGdsPersistentTileRenderer();
      const overlayLayer = new Container({ label: 'gds-overlay-layer' });
      world.addChild(chromeLayer);
      world.addChild(tileRenderer.container);
      world.addChild(overlayLayer);
      gdsChromeLayerRef.current = chromeLayer;
      gdsTileRendererRef.current = tileRenderer;
      gdsOverlayWorldLayerRef.current = overlayLayer;
      gdsSceneActiveRef.current = true;
    }

    const chromeLayer = gdsChromeLayerRef.current;
    const tileRenderer = gdsTileRendererRef.current;
    const overlayLayer = gdsOverlayWorldLayerRef.current;
    if (!chromeLayer || !tileRenderer || !overlayLayer) {
      return;
    }

    chromeLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    chromeLayer.addChild(drawVisibleGrid(bounds, cameraRef.current, sizeRef.current));
    if (outlineVisibleRef.current) {
      chromeLayer.addChild(drawLayoutOutline(bounds));
    }

    const currentViewportBbox = getViewportWorldBounds(cameraRef.current, sizeRef.current, 0);
    const renderCullBbox = getViewportWorldBounds(cameraRef.current, sizeRef.current, GDS_TILE_RENDER_OVERSCAN_RATIO);
    meshStatsRef.current = tileRenderer.update(gdsDisplayedTilesRef.current, layoutVisibilityRef.current, renderCullBbox);
    syncGdsScreenVisibleCoverage(currentViewportBbox);

    overlayLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    const highlightedShape = findVisibleGdsDisplayedShapeByIndex(
      gdsDisplayedTilesRef.current,
      highlightedShapeIndexRef.current,
      layoutVisibilityRef.current,
    )
      ?? selectedShapesRef.current.find((shape) => shape.index === highlightedShapeIndexRef.current)
      ?? null;
    if (!highlightedShape && highlightedShapeIndexRef.current !== null) {
      onHighlightedShapeChangeRef.current?.(null);
    }
    if (highlightedShape) {
      overlayLayer.addChild(drawHighlightedShape(highlightedShape));
    }
    const labels = drawPinLabels(selectedLabelsRef.current);
    if (labels.length > 0) {
      overlayLayer.addChild(...labels);
    }
  };

  const scheduleGdsDisplayedGeometrySnapshot = () => {
    if (!isGdsTileModeRef.current || gdsDisplayedTilesRef.current.size === 0) {
      return;
    }

    if (isGdsViewportInteractionActive()) {
      if (gdsGeometrySyncTimeoutRef.current === null) {
        gdsGeometrySyncTimeoutRef.current = window.setTimeout(() => {
          gdsGeometrySyncTimeoutRef.current = null;
          scheduleGdsDisplayedGeometrySnapshot();
        }, getGdsViewportIdleDelay());
      }
      return;
    }

    if (gdsGeometrySyncTimeoutRef.current !== null) {
      window.clearTimeout(gdsGeometrySyncTimeoutRef.current);
    }

    const version = gdsGeometrySnapshotVersionRef.current + 1;
    gdsGeometrySnapshotVersionRef.current = version;
    gdsGeometrySyncTimeoutRef.current = window.setTimeout(() => {
      gdsGeometrySyncTimeoutRef.current = null;
      if (version !== gdsGeometrySnapshotVersionRef.current) {
        return;
      }
      syncGdsDisplayedGeometryState(true);
    }, getGdsViewportIdleDelay());
  };

  const syncGdsDisplayedGeometryState = (force = false) => {
    if (!isGdsTileModeRef.current) {
      return;
    }

    if (!force && isGdsViewportInteractionActive()) {
      scheduleGdsDisplayedGeometrySnapshot();
      return;
    }

    if (gdsGeometrySyncTimeoutRef.current !== null) {
      window.clearTimeout(gdsGeometrySyncTimeoutRef.current);
      gdsGeometrySyncTimeoutRef.current = null;
    }

    const snapshotKey = createGdsDisplayedGeometrySnapshotKey(gdsDisplayedTilesRef.current);
    if (snapshotKey === gdsGeometrySnapshotKeyRef.current) {
      return;
    }

    const displayedTiles = Array.from(gdsDisplayedTilesRef.current.values());
    const snapshotShapeCount = displayedTiles.reduce((sum, entry) => sum + entry.tile.geometry.shapes.length, 0);
    const snapshotPayloadSize = displayedTiles.reduce((sum, entry) => sum + Math.max(0, entry.tile.payloadSize), 0);
    const snapshotStartedAt = performance.now();
    if (gdsTileDiagnosticsRef.current.tileScope !== 'full-cell' && !is3DViewVisibleRef.current) {
      gdsGeometrySnapshotKeyRef.current = snapshotKey;
      gdsIdleSnapshotSkippedCountRef.current += 1;
      gdsIdleSnapshotMsRef.current = Math.max(0, performance.now() - snapshotStartedAt);
      updateGdsTileDiagnostics({
        lastGoodShapeCount: gdsLastGoodTileRef.current?.geometry.shapes.length ?? 0,
      });
      updateGdsTileMetrics();
      return;
    }

    if (
      gdsTileDiagnosticsRef.current.tileScope !== 'full-cell'
      && (
        snapshotShapeCount > GDS_TILE_GEOMETRY_SNAPSHOT_SHAPE_LIMIT
        || snapshotPayloadSize > GDS_TILE_GEOMETRY_SNAPSHOT_PAYLOAD_LIMIT
      )
    ) {
      gdsGeometrySnapshotKeyRef.current = snapshotKey;
      gdsIdleSnapshotSkippedCountRef.current += 1;
      gdsIdleSnapshotMsRef.current = Math.max(0, performance.now() - snapshotStartedAt);
      updateGdsTileDiagnostics({
        lastGoodShapeCount: gdsLastGoodTileRef.current?.geometry.shapes.length ?? 0,
      });
      updateGdsTileMetrics();
      return;
    }

    const mergedTile = createMergedGdsTileGeometry(displayedTiles.map((entry) => entry.tile));
    const nextGeometry = mergedTile?.geometry ?? null;
    if (mergedTile) {
      gdsLastGoodTileRef.current = mergedTile;
    }
    gdsGeometrySnapshotKeyRef.current = snapshotKey;
    gdsIdleSnapshotMsRef.current = Math.max(0, performance.now() - snapshotStartedAt);
    gdsReactSyncCountRef.current += 1;
    setGdsTileGeometry(nextGeometry);
    onGdsTileGeometryChangeRef.current?.(nextGeometry);
  };

  const updateMinimapOverlay = () => {
    const minimap = minimapGraphicsRef.current;
    if (!minimap) {
      return;
    }

    minimap.clear();
    const model = createCurrentMinimapModel();
    minimapModelRef.current = model;
    syncMinimapModelState();
    if (!model.visible) {
      return;
    }

    drawGdsMinimap(minimap, model);
  };

  const createCurrentMinimapModel = () => createPhysicalLayoutMinimapModel({
    canvasSize: sizeRef.current,
    cellBounds: isGdsTileModeRef.current ? selectedBoundsRef.current : null,
    viewportBounds: isGdsTileModeRef.current
      ? getViewportWorldBounds(cameraRef.current, sizeRef.current, 0)
      : null,
  });

  const syncMinimapModelState = (force = false) => {
    const nextModel = minimapModelRef.current;
    const now = performance.now();
    if (isGdsTileModeRef.current && !force && isGdsViewportInteractionActive()) {
      if (minimapSyncTimeoutRef.current === null) {
        minimapSyncTimeoutRef.current = window.setTimeout(() => {
          minimapSyncTimeoutRef.current = null;
          syncMinimapModelState(true);
        }, getGdsViewportIdleDelay());
      }
      return;
    }

    if (!isGdsTileModeRef.current || force || now - lastMinimapSyncAtRef.current >= 120) {
      if (minimapSyncTimeoutRef.current !== null) {
        window.clearTimeout(minimapSyncTimeoutRef.current);
        minimapSyncTimeoutRef.current = null;
      }
      lastMinimapSyncAtRef.current = now;
      setMinimapModel((previousModel) => areMinimapModelsEqual(previousModel, nextModel) ? previousModel : nextModel);
      return;
    }

    if (minimapSyncTimeoutRef.current === null) {
      minimapSyncTimeoutRef.current = window.setTimeout(() => {
        minimapSyncTimeoutRef.current = null;
        lastMinimapSyncAtRef.current = performance.now();
        const currentModel = minimapModelRef.current;
        setMinimapModel((previousModel) => areMinimapModelsEqual(previousModel, currentModel) ? previousModel : currentModel);
      }, Math.max(16, 120 - (now - lastMinimapSyncAtRef.current)));
    }
  };

  const redrawScene = (overrideGeometry?: LspLayoutGeometry | null) => {
    const background = backgroundRef.current;
    const world = worldRef.current;
    const app = appRef.current;
    if (!background || !world || !app) {
      return;
    }

    if (isGdsTileModeRef.current) {
      redrawGdsDisplayedTileScene();
      return;
    }

    clearGdsPersistentScene();
    background.removeChildren().forEach((child) => child.destroy({ children: true }));
    world.removeChildren().forEach((child) => child.destroy({ children: true }));
    background.addChild(drawBackground(size.width, size.height));

    const bounds = selectedBoundsRef.current;
    if (!bounds) {
      return;
    }

    world.addChild(drawGrid(bounds));
    if (outlineVisibleRef.current) {
      world.addChild(drawLayoutOutline(bounds));
    }
    const nextShapes = overrideGeometry
      ? selectLayoutTargetShapes(catalog, overrideGeometry, selectedTarget)
      : selectedShapesRef.current;
    const visibleNextShapes = overrideGeometry
      ? filterVisiblePhysicalLayoutShapes(nextShapes, layoutVisibility, catalog?.sourceKind)
      : selectedShapesRef.current;
    const shapeDisplay = isGdsTileMode
      ? drawGdsTileShapes(visibleNextShapes, layoutVisibility)
      : drawShapes(visibleNextShapes, layoutVisibility);
    meshStatsRef.current = shapeDisplay.stats;
    world.addChild(shapeDisplay.node);
    const highlightedShape = selectedShapesRef.current.find((shape) => shape.index === highlightedShapeIndexRef.current) ?? null;
    if (highlightedShape) {
      world.addChild(drawHighlightedShape(highlightedShape));
    }
    const labels = drawPinLabels(selectedLabelsRef.current);
    if (labels.length > 0) {
      world.addChild(...labels);
    }
  };

  const liveCamera = isGdsTileMode ? cameraRef.current : cameraSync;
  const liveViewportBbox = isGdsTileMode
    ? getViewportWorldBounds(liveCamera, size, 0)
    : null;
  const liveScreenCoverage = isGdsTileMode && liveViewportBbox
    ? calculateGdsScreenVisibleCoverage({
      allHidden: gdsTileDiagnostics.displayedState === 'empty-hidden',
      cellBounds: selectedBounds,
      tiles: Array.from(gdsDisplayedTilesRef.current.values()),
      viewportBbox: liveViewportBbox,
    })
    : null;

  return (
    <div
      ref={hostRef}
      aria-label="Physical layout editor canvas"
      className="relative h-full min-h-0 w-full overflow-hidden bg-[#101317] outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 [&>canvas]:outline-none [&>canvas]:focus:outline-none [&>canvas]:focus:ring-0 [&>canvas]:focus-visible:outline-none [&>canvas]:focus-visible:ring-0"
      data-catalog-pin-count={catalogPinCount}
      data-gds-average-fps={gdsTileMetrics.averageFps.toFixed(1)}
      data-gds-atlas-bytes={gdsTileMetrics.atlasByteLength}
      data-gds-bbox-area={gdsTileDiagnostics.bboxArea.toFixed(2)}
      data-gds-blank-frame-metric-count={gdsTileMetrics.blankFrameCount}
      data-gds-buffer-capacity-vertex-count={gdsTileMetrics.bufferCapacityVertexCount}
      data-gds-buffer-data-replace-count={gdsTileMetrics.bufferDataReplaceCount}
      data-gds-buffer-realloc-count={gdsTileMetrics.bufferReallocCount}
      data-gds-buffer-subarray-commit-count={gdsTileMetrics.bufferSubarrayCommitCount}
      data-gds-buffer-update-count={gdsTileMetrics.bufferUpdateCount}
      data-gds-buffer-update-ms={gdsTileMetrics.bufferUpdateMs.toFixed(3)}
      data-gds-tile-layer-create-count={gdsTileMetrics.tileLayerCreateCount}
      data-gds-tile-layer-reuse-count={gdsTileMetrics.tileLayerReuseCount}
      data-gds-tile-layer-destroy-count={gdsTileMetrics.tileLayerDestroyCount}
      data-gds-batch-create-count={gdsTileMetrics.batchCreateCount}
      data-gds-batch-reuse-count={gdsTileMetrics.batchReuseCount}
      data-gds-batch-destroy-count={gdsTileMetrics.batchDestroyCount}
      data-gds-apply-queue-depth={gdsTileMetrics.applyQueueDepth}
      data-gds-apply-chunk-count={gdsTileMetrics.applyChunkCount}
      data-gds-apply-budget-overrun-count={gdsTileMetrics.applyBudgetOverrunCount}
      data-gds-idle-snapshot-ms={gdsTileMetrics.idleSnapshotMs.toFixed(2)}
      data-gds-idle-snapshot-skipped-count={gdsTileMetrics.idleSnapshotSkippedCount}
      data-gds-columnar-bytes={gdsTileMetrics.columnarByteLength}
      data-gds-atlas-gpu-bytes={gdsTileMetrics.atlasGpuByteLength}
      data-gds-cache-bytes={gdsTileMetrics.cacheByteLength}
      data-gds-cache-entry-count={gdsTileMetrics.cacheEntryCount}
      data-gds-continuation-count={gdsTileMetrics.continuationCount}
      data-gds-current-lod-band={gdsCurrentLodBandRef.current}
      data-gds-active-tile-count={gdsActiveTileCountRef.current}
      data-gds-blank-frame-count={gdsBlankFrameCountRef.current}
      data-gds-coverage-ratio={gdsCoverageRatioRef.current.toFixed(3)}
      data-gds-world-coverage-ratio={gdsCoverageRatioRef.current.toFixed(3)}
      data-gds-viewport-bbox={formatLayoutBoundsDataAttribute(liveViewportBbox ?? gdsViewportBboxRef.current)}
      data-gds-cell-intersection-ratio={(liveScreenCoverage?.cellIntersectionRatio ?? gdsCellIntersectionRatioRef.current).toFixed(3)}
      data-gds-screen-visible-coverage-ratio={(liveScreenCoverage?.screenVisibleCoverageRatio ?? gdsScreenVisibleCoverageRatioRef.current).toFixed(3)}
      data-gds-screen-visible-non-empty-coverage-ratio={(liveScreenCoverage?.screenVisibleNonEmptyCoverageRatio ?? gdsScreenVisibleNonEmptyCoverageRatioRef.current).toFixed(3)}
      data-gds-screen-visible-tile-count={liveScreenCoverage?.screenVisibleTileCount ?? gdsScreenVisibleTileCountRef.current}
      data-gds-screen-visible-shape-count={liveScreenCoverage?.screenVisibleShapeCount ?? gdsScreenVisibleShapeCountRef.current}
      data-gds-visual-empty-reason={liveScreenCoverage?.visualEmptyReason ?? gdsVisualEmptyReasonRef.current}
      data-gds-frame-p95-ms={gdsTileMetrics.frameP95Ms.toFixed(1)}
      data-gds-max-frame-p95-ms={gdsTileMetrics.maxFrameP95Ms.toFixed(1)}
      data-gds-draw-node-count={meshStatsRef.current.drawNodeCount}
      data-gds-displayed-tile-state={gdsTileDiagnostics.displayedState}
      data-gds-displayed-tile-count={gdsTileMetrics.displayedTileCount}
      data-gds-empty-displayed-tile-count={gdsTileMetrics.emptyDisplayedTileCount}
      data-gds-empty-tile-reason={gdsTileDiagnostics.emptyReason}
      data-gds-empty-visible-frame-count={gdsTileMetrics.emptyVisibleFrameCount}
      data-gds-deferred-tile-pending={gdsDeferredTileApplyRef.current || gdsDeferredAtlasApplyRef.current ? 'true' : 'false'}
      data-gds-final-tile-lod={gdsTileDiagnostics.finalLod}
      data-gds-full-cell-fallback-reason={gdsTileDiagnostics.fullCellFallbackReason}
      data-gds-full-cell-shape-count={gdsTileDiagnostics.fullCellShapeCount}
      data-gds-inflight-count={gdsTileMetrics.inflightRequestCount}
      data-gds-last-good-shape-count={gdsTileDiagnostics.lastGoodShapeCount}
      data-gds-mesh-buffer-bytes={gdsTileMetrics.bufferByteLength + gdsTileMetrics.indexByteLength}
      data-gds-mesh-batch-count={meshStatsRef.current.meshBatchCount}
      data-gds-minimap-cell-height={minimapModel?.visible ? minimapModel.cellWorldHeight.toFixed(4) : ''}
      data-gds-minimap-cell-width={minimapModel?.visible ? minimapModel.cellWorldWidth.toFixed(4) : ''}
      data-gds-minimap-viewport-height={minimapModel?.visible ? minimapModel.viewport.height.toFixed(2) : ''}
      data-gds-minimap-viewport-width={minimapModel?.visible ? minimapModel.viewport.width.toFixed(2) : ''}
      data-gds-minimap-viewport-world-height={minimapModel?.visible ? minimapModel.viewportWorldHeight.toFixed(4) : ''}
      data-gds-minimap-viewport-world-width={minimapModel?.visible ? minimapModel.viewportWorldWidth.toFixed(4) : ''}
      data-gds-minimap-viewport-world-x={minimapModel?.visible ? minimapModel.viewportWorld.x0.toFixed(4) : ''}
      data-gds-minimap-viewport-world-y={minimapModel?.visible ? minimapModel.viewportWorld.y0.toFixed(4) : ''}
      data-gds-minimap-viewport-x={minimapModel?.visible ? minimapModel.viewport.x.toFixed(2) : ''}
      data-gds-minimap-viewport-y={minimapModel?.visible ? minimapModel.viewport.y.toFixed(2) : ''}
      data-gds-minimap-visible={minimapModel?.visible ? 'true' : 'false'}
      data-gds-non-empty-coverage-ratio={gdsTileMetrics.nonEmptyCoverageRatio.toFixed(3)}
      data-gds-precise-tile-pending={gdsTileDiagnostics.precisePending ? 'true' : 'false'}
      data-gds-prefetch-tile-count={gdsPrefetchTileCountRef.current}
      data-gds-overview-fallback-active={gdsOverviewFallbackActiveRef.current ? 'true' : 'false'}
      data-gds-observed-lod-bands={gdsTileDiagnostics.observedLodBands}
      data-gds-render-batch-mode={isGdsTileMode ? 'order-bucket' : 'none'}
      data-gds-render-bucket-size={isGdsTileMode ? meshStatsRef.current.orderBucketSize : 0}
      data-gds-render-mode={isGdsTileMode ? 'tile-mesh' : 'full-graphics'}
      data-gds-retry-count={gdsTileMetrics.retryCount}
      data-gds-retry-kind={gdsTileDiagnostics.retryKind}
      data-gds-tile-lod={gdsTileDiagnostics.tileLod}
      data-gds-tile-scope={gdsTileDiagnostics.tileScope}
      data-gds-render-ms={gdsTileMetrics.lastRenderMs.toFixed(2)}
      data-gds-react-sync-count={gdsTileMetrics.reactSyncCount}
      data-gds-tile-apply-ms={gdsTileMetrics.lastTileApplyMs.toFixed(2)}
      data-gds-tile-build-ms={gdsTileMetrics.lastTileBuildMs.toFixed(2)}
      data-gds-max-tile-apply-ms={gdsTileMetrics.maxTileApplyMs.toFixed(2)}
      data-gds-max-tile-build-ms={gdsTileMetrics.maxTileBuildMs.toFixed(2)}
      data-gds-max-tile-roundtrip-ms={gdsTileMetrics.maxTileRoundtripMs.toFixed(2)}
      data-gds-tile-query-ms={gdsTileMetrics.lastTileQueryMs.toFixed(2)}
      data-gds-tile-request-count={tileRequestCountRef.current}
      data-gds-tile-roundtrip-ms={gdsTileMetrics.lastTileRoundtripMs.toFixed(2)}
      data-gds-tile-shape-count={isGdsTileMode ? getGdsDisplayedTileShapeCount(gdsDisplayedTilesRef.current) : (gdsTileGeometry?.shapes.length ?? 0)}
      data-gds-truncated={gdsTileMetrics.truncated ? 'true' : 'false'}
      data-gds-renderable-shape-count={gdsTileMetrics.renderableShapeCount}
      data-geometry-shape-count={activeGeometry?.shapes.length ?? 0}
      data-hidden-layer-count={Math.max(0, layerCount - visibleLayerCount)}
      data-highlighted-shape-index={highlightedShapeIndex ?? ''}
      data-layer-opacity-summary={formatPhysicalLayoutLayerOpacitySummary(layoutVisibility)}
      data-outline-visible={outlineVisible ? 'true' : 'false'}
      data-layer-count={layerCount}
      data-last-pick-shape-index={lastPick?.shapeIndex ?? ''}
      data-last-pick-world-x={lastPick ? lastPick.worldX.toFixed(4) : ''}
      data-last-pick-world-y={lastPick ? lastPick.worldY.toFixed(4) : ''}
      data-macro-count={catalog?.macros.length ?? 0}
      data-pan-x={liveCamera.panX.toFixed(2)}
      data-pan-y={liveCamera.panY.toFixed(2)}
      data-render-count={renderCount}
      data-renderer={renderer}
      data-selected-macro-name={selectedTarget?.kind === 'macro' ? selectedTarget.name : ''}
      data-selected-target-kind={selectedTarget?.kind ?? ''}
      data-selected-target-name={selectedTarget?.name ?? ''}
      data-selected-pin-count={selectedPinCount}
      data-selected-shape-count={selectedShapes.length}
      data-shape-count={selectedShapes.length}
      data-testid="physical-layout-canvas"
      data-visible-category-count={visibleCategoryCount}
      data-first-visible-shape-index={visibleShapes[0]?.index ?? ''}
      data-first-visible-shape-screen-x={formatShapeScreenX(visibleShapes[0], camera)}
      data-first-visible-shape-screen-y={formatShapeScreenY(visibleShapes[0], camera)}
      data-pick-visible-shape-category={pickableShape ? getCanvasShapeCategory(pickableShape.shape) : ''}
      data-pick-visible-shape-index={pickableShape?.shape.index ?? ''}
      data-pick-visible-shape-layer-index={pickableShape?.shape.layerIndex ?? ''}
      data-pick-visible-shape-screen-x={formatPickScreenX(pickableShape, camera)}
      data-pick-visible-shape-screen-y={formatPickScreenY(pickableShape, camera)}
      data-visible-label-count={visibleLabels.length}
      data-visible-label-names={visibleLabels.map((label) => label.name).join('|')}
      data-visible-layer-count={visibleLayerCount}
      data-visible-obstruction-shape-count={visibleShapeCounts.obstruction}
      data-visible-pin-shape-count={visibleShapeCounts.pin}
      data-source-kind={catalog?.sourceKind ?? ''}
      data-visible-shape-count={visibleShapes.length}
      data-zoom={liveCamera.zoom.toFixed(4)}
      role="img"
      tabIndex={-1}
    >
      {renderer === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] text-ide-error">
          {error ?? 'Layout renderer unavailable'}
        </div>
      )}
    </div>
  );
}

function getPhysicalLayoutCanvasZoomLimits(
  sourceKind: LspLayoutCatalog['sourceKind'] | undefined,
  targetKind: PhysicalLayoutTarget['kind'] | undefined,
  bounds: LspLayoutBounds | null,
  viewport: { height: number; width: number },
): PhysicalLayoutZoomLimits {
  if (sourceKind !== 'gds' || targetKind !== 'gdsCell' || !bounds || viewport.width <= 0 || viewport.height <= 0) {
    return physicalLayoutZoomLimits;
  }

  const width = Math.max(bounds.x1 - bounds.x0, 0.001);
  const height = Math.max(bounds.y1 - bounds.y0, 0.001);
  const availableWidth = Math.max(viewport.width - cameraFitPaddingPx * 2, 24);
  const availableHeight = Math.max(viewport.height - cameraFitPaddingPx * 2, 24);
  const fitZoom = Math.min(availableWidth / width, availableHeight / height);

  return {
    max: physicalLayoutZoomLimits.max,
    min: Math.min(physicalLayoutZoomLimits.min, Math.max(0.000001, fitZoom)),
  };
}

async function createPixiApp(host: HTMLElement) {
  const width = Math.max(minimumCanvasWidth, Math.floor(host.clientWidth));
  const height = Math.max(minimumCanvasHeight, Math.floor(host.clientHeight));
  const preferences: PixiRendererPreference[] = ['webgpu', 'webgl'];
  let lastError: unknown;

  for (const preference of preferences) {
    const app = new Application();

    try {
      await app.init({
        width,
        height,
        autoDensity: true,
        antialias: true,
        autoStart: false,
        backgroundAlpha: 0,
        preference,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      installPhysicalExplicitDrawCountPatch(app.renderer);
      app.stop();
      app.canvas.dataset.physicalLayoutCanvas = 'true';
      app.canvas.tabIndex = -1;
      host.appendChild(app.canvas);
      return { app, renderer: preference };
    } catch (cause) {
      lastError = cause;
      app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to initialize layout renderer.');
}

function formatShapeScreenX(shape: LspLayoutShape | undefined, camera: PhysicalLayoutCamera): string {
  if (!shape) {
    return '';
  }

  const bounds = shapeBounds(shape);
  return (camera.panX + ((bounds.x0 + bounds.x1) / 2) * camera.zoom).toFixed(2);
}

function formatShapeScreenY(shape: LspLayoutShape | undefined, camera: PhysicalLayoutCamera): string {
  if (!shape) {
    return '';
  }

  const bounds = shapeBounds(shape);
  return (camera.panY + ((bounds.y0 + bounds.y1) / 2) * camera.zoom).toFixed(2);
}

function formatLayoutBoundsDataAttribute(bounds: LspLayoutBounds | null): string {
  if (!bounds) {
    return '';
  }

  return [
    bounds.x0.toFixed(4),
    bounds.y0.toFixed(4),
    bounds.x1.toFixed(4),
    bounds.y1.toFixed(4),
  ].join(',');
}

interface PickableLayoutShape {
  point: { x: number; y: number };
  shape: LspLayoutShape;
}

function getPickableVisibleShape(
  shapes: readonly LspLayoutShape[],
  camera: PhysicalLayoutCamera,
  size: { width: number; height: number },
): PickableLayoutShape | null {
  const tolerance = 4 / camera.zoom;
  for (let shapeIndex = shapes.length - 1; shapeIndex >= 0; shapeIndex -= 1) {
    const shape = shapes[shapeIndex];
    if (!shape || shape.kind === 'path' || shape.kind === 'text') {
      continue;
    }

    for (const point of getShapePickCandidatePoints(shape)) {
      const topShape = findShapeAtLayoutPoint(shapes, point, tolerance);
      if (topShape?.index !== shape.index) {
        continue;
      }

      const screenX = camera.panX + point.x * camera.zoom;
      const screenY = camera.panY + point.y * camera.zoom;
      if (screenX >= 2 && screenX <= size.width - 2 && screenY >= 2 && screenY <= size.height - 2) {
        return { point, shape };
      }
    }
  }

  return null;
}

function getShapePickCandidatePoints(shape: LspLayoutShape): Array<{ x: number; y: number }> {
  const bounds = shapeBounds(shape);
  const candidates: Array<{ x: number; y: number }> = [
    {
      x: (bounds.x0 + bounds.x1) / 2,
      y: (bounds.y0 + bounds.y1) / 2,
    },
  ];

  if (shape.polygon && shape.polygon.length > 0) {
    const centroid = shape.polygon.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    candidates.push({
      x: centroid.x / shape.polygon.length,
      y: centroid.y / shape.polygon.length,
    });
  }

  for (const xFraction of [0.25, 0.5, 0.75]) {
    for (const yFraction of [0.25, 0.5, 0.75]) {
      candidates.push({
        x: bounds.x0 + (bounds.x1 - bounds.x0) * xFraction,
        y: bounds.y0 + (bounds.y1 - bounds.y0) * yFraction,
      });
    }
  }

  return candidates;
}

function formatPickScreenX(pickableShape: PickableLayoutShape | null, camera: PhysicalLayoutCamera): string {
  if (!pickableShape) {
    return '';
  }

  return (camera.panX + pickableShape.point.x * camera.zoom).toFixed(2);
}

function formatPickScreenY(pickableShape: PickableLayoutShape | null, camera: PhysicalLayoutCamera): string {
  if (!pickableShape) {
    return '';
  }

  return (camera.panY + pickableShape.point.y * camera.zoom).toFixed(2);
}

function drawBackground(width: number, height: number) {
  return new Graphics()
    .rect(0, 0, width, height)
    .fill({ color: 0x101317, alpha: 1 });
}

function drawGdsMinimap(graphics: Graphics, model: PhysicalLayoutMinimapModel) {
  graphics
    .roundRect(model.panel.x, model.panel.y, model.panel.width, model.panel.height, 6)
    .fill({ color: 0x0b1117, alpha: 0.78 })
    .stroke({ color: 0x34404c, alpha: 0.8, width: 1 });
  graphics
    .rect(model.cell.x, model.cell.y, model.cell.width, model.cell.height)
    .fill({ color: 0x5b7286, alpha: 0.2 })
    .stroke({ color: 0x94a3b8, alpha: 0.9, width: 1 });
  graphics
    .rect(model.viewport.x, model.viewport.y, model.viewport.width, model.viewport.height)
    .stroke({ color: 0xf8fafc, alpha: 0.98, width: 1.5 });
}

function areMinimapModelsEqual(
  left: PhysicalLayoutMinimapModel | null,
  right: PhysicalLayoutMinimapModel | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.visible === right.visible
    && areMinimapRectsEqual(left.panel, right.panel)
    && areMinimapRectsEqual(left.cell, right.cell)
    && areMinimapRectsEqual(left.viewport, right.viewport)
    && Math.abs(left.cellWorldWidth - right.cellWorldWidth) < 0.001
    && Math.abs(left.cellWorldHeight - right.cellWorldHeight) < 0.001
    && Math.abs(left.viewportWorld.x0 - right.viewportWorld.x0) < 0.001
    && Math.abs(left.viewportWorld.y0 - right.viewportWorld.y0) < 0.001
    && Math.abs(left.viewportWorld.x1 - right.viewportWorld.x1) < 0.001
    && Math.abs(left.viewportWorld.y1 - right.viewportWorld.y1) < 0.001;
}

function areMinimapRectsEqual(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }): boolean {
  return Math.abs(left.x - right.x) < 0.01
    && Math.abs(left.y - right.y) < 0.01
    && Math.abs(left.width - right.width) < 0.01
    && Math.abs(left.height - right.height) < 0.01;
}

function drawGrid(bounds: LspLayoutBounds) {
  const graphics = new Graphics();

  for (let x = Math.floor(bounds.x0 / gridMinorStep) * gridMinorStep; x <= bounds.x1 + 0.001; x += gridMinorStep) {
    const isMajor = Math.abs(Math.round(x / gridMajorStep) - x / gridMajorStep) < 0.001;
    graphics
      .moveTo(x, bounds.y0)
      .lineTo(x, bounds.y1)
      .stroke({ color: isMajor ? 0x34404c : 0x1e2730, alpha: isMajor ? 0.5 : 0.28, width: 0.008 });
  }

  for (let y = Math.floor(bounds.y0 / gridMinorStep) * gridMinorStep; y <= bounds.y1 + 0.001; y += gridMinorStep) {
    const isMajor = Math.abs(Math.round(y / gridMajorStep) - y / gridMajorStep) < 0.001;
    graphics
      .moveTo(bounds.x0, y)
      .lineTo(bounds.x1, y)
      .stroke({ color: isMajor ? 0x34404c : 0x1e2730, alpha: isMajor ? 0.5 : 0.28, width: 0.008 });
  }

  return graphics;
}

function drawVisibleGrid(
  bounds: LspLayoutBounds,
  camera: PhysicalLayoutCamera,
  size: { height: number; width: number },
) {
  const viewport = getViewportWorldBounds(camera, size, 0.08);
  const visibleBounds = {
    x0: Math.max(bounds.x0, viewport.x0),
    y0: Math.max(bounds.y0, viewport.y0),
    x1: Math.min(bounds.x1, viewport.x1),
    y1: Math.min(bounds.y1, viewport.y1),
  };
  if (visibleBounds.x1 <= visibleBounds.x0 || visibleBounds.y1 <= visibleBounds.y0) {
    return new Graphics();
  }

  const targetMajorPixels = 96;
  const rawMajorStep = targetMajorPixels / Math.max(camera.zoom, 0.000001);
  const exponent = Math.floor(Math.log10(Math.max(rawMajorStep, 0.000001)));
  const normalized = rawMajorStep / (10 ** exponent);
  const majorBase = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const majorStep = Math.max(gridMajorStep, majorBase * (10 ** exponent));
  const minorStep = majorStep / 5;
  const graphics = new Graphics();

  for (let x = Math.floor(visibleBounds.x0 / minorStep) * minorStep; x <= visibleBounds.x1 + 0.001; x += minorStep) {
    const isMajor = Math.abs(Math.round(x / majorStep) - x / majorStep) < 0.001;
    graphics
      .moveTo(x, visibleBounds.y0)
      .lineTo(x, visibleBounds.y1)
      .stroke({ color: isMajor ? 0x34404c : 0x1e2730, alpha: isMajor ? 0.5 : 0.28, width: 0.008 });
  }

  for (let y = Math.floor(visibleBounds.y0 / minorStep) * minorStep; y <= visibleBounds.y1 + 0.001; y += minorStep) {
    const isMajor = Math.abs(Math.round(y / majorStep) - y / majorStep) < 0.001;
    graphics
      .moveTo(visibleBounds.x0, y)
      .lineTo(visibleBounds.x1, y)
      .stroke({ color: isMajor ? 0x34404c : 0x1e2730, alpha: isMajor ? 0.5 : 0.28, width: 0.008 });
  }

  return graphics;
}

function drawLayoutOutline(bounds: LspLayoutBounds) {
  return new Graphics()
    .rect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0)
    .fill({ color: 0x151c24, alpha: 0.48 })
    .stroke({ color: 0xe5eef8, alpha: 0.9, width: 0.025 });
}

interface PhysicalLayoutShapeDisplay {
  node: Container;
  stats: {
    bufferCapacityVertexCount: number;
    bufferDataReplaceCount: number;
    bufferReallocCount: number;
    bufferSubarrayCommitCount: number;
    bufferUpdateCount: number;
    bufferUpdateMs: number;
    tileLayerCreateCount: number;
    tileLayerReuseCount: number;
    tileLayerDestroyCount: number;
    batchCreateCount: number;
    batchReuseCount: number;
    batchDestroyCount: number;
    applyQueueDepth: number;
    applyChunkCount: number;
    applyBudgetOverrunCount: number;
    idleSnapshotMs: number;
    idleSnapshotSkippedCount: number;
    columnarByteLength: number;
    atlasGpuByteLength: number;
    drawNodeCount: number;
    indexCount: number;
    orderBucketSize: number;
    meshBatchCount: number;
    vertexCount: number;
  };
}

interface PhysicalLayoutMeshBatch {
  alpha: number;
  builder: PhysicalLayoutGdsMeshBuilder;
  color: number;
}

interface PhysicalLayoutGdsTileOrderBucket {
  batches: Map<string, PhysicalLayoutMeshBatch>;
  fallbackGraphics: Graphics;
  hasFallbackGraphics: boolean;
}

interface PhysicalLayoutGdsPersistentBatch {
  builder: PhysicalLayoutGdsMeshBuilder;
  mesh: Mesh<MeshGeometry>;
  used: boolean;
}

class PhysicalLayoutGdsPersistentTileRenderer {
  public readonly container = new Container({ label: 'gds-persistent-tile-atlas' });

  private readonly tileLayers = new Map<string, PhysicalLayoutGdsPersistentTileLayer>();

  public syncCull(
    tiles: ReadonlyMap<string, PhysicalLayoutGdsDisplayedTile>,
    cullBbox: LspLayoutBounds | null,
  ) {
    for (const [key, layer] of this.tileLayers) {
      const entry = tiles.get(key);
      layer.container.visible = Boolean(entry && (!cullBbox || doLayoutBoundsIntersect(entry.plan.bbox, cullBbox)));
    }
  }

  public update(
    tiles: ReadonlyMap<string, PhysicalLayoutGdsDisplayedTile>,
    layoutVisibility: PhysicalLayoutVisibility,
    cullBbox: LspLayoutBounds | null,
  ): PhysicalLayoutShapeDisplay['stats'] {
    const liveKeys = new Set<string>();
    const orderedEntries = Array.from(tiles.entries()).sort((left, right) => compareGdsDisplayedTiles(left[1], right[1]));
    const visibilityKey = createGdsPersistentRendererVisibilityKey(layoutVisibility);

    let stats = createEmptyGdsMeshStats();
    let tileLayerCreateCount = 0;
    let tileLayerReuseCount = 0;
    let batchDestroyCount = 0;
    let tileLayerDestroyCount = 0;
    const orderedChildren: PixiContainerChild[] = [];
    orderedEntries.forEach(([key, entry], order) => {
      liveKeys.add(key);
      let layer = this.tileLayers.get(key);
      if (!layer) {
        layer = new PhysicalLayoutGdsPersistentTileLayer(key);
        this.tileLayers.set(key, layer);
        tileLayerCreateCount += 1;
      } else {
        tileLayerReuseCount += 1;
      }

      const isLayerScreenVisible = !cullBbox || doLayoutBoundsIntersect(entry.plan.bbox, cullBbox);
      layer.container.visible = isLayerScreenVisible;
      orderedChildren[order] = layer.container;
      const layerStats = layer.update(entry.tile, layoutVisibility, visibilityKey);
      stats = mergeGdsMeshStats(stats, layerStats);
    });

    for (const [key, layer] of this.tileLayers) {
      if (!liveKeys.has(key)) {
        batchDestroyCount += layer.getBatchCount();
        tileLayerDestroyCount += 1;
        layer.destroy();
        this.tileLayers.delete(key);
      }
    }

    syncContainerChildOrder(this.container, orderedChildren);

    return mergeGdsMeshStats(stats, {
      ...createEmptyGdsMeshStats(),
      tileLayerCreateCount,
      tileLayerReuseCount,
      tileLayerDestroyCount,
      batchDestroyCount,
    });
  }

  public clear() {
    for (const layer of this.tileLayers.values()) {
      layer.destroy();
    }
    this.tileLayers.clear();
    this.container.removeChildren();
  }

  public destroy() {
    this.clear();
    this.container.destroy({ children: true });
  }
}

class PhysicalLayoutGdsPersistentTileLayer {
  public readonly container: Container;

  private readonly buckets = new Map<number, PhysicalLayoutGdsPersistentBucket>();
  private lastStats: PhysicalLayoutShapeDisplay['stats'] = createEmptyGdsMeshStats();
  private lastTile: LspLayoutTileGeometry | null = null;
  private lastVisibilityKey = '';

  public constructor(key: string) {
    this.container = new Container({ label: `gds-tile-layer:${key}`, sortableChildren: true });
  }

  public update(
    tile: LspLayoutTileGeometry,
    layoutVisibility: PhysicalLayoutVisibility,
    visibilityKey: string,
  ): PhysicalLayoutShapeDisplay['stats'] {
    if (this.lastTile === tile && this.lastVisibilityKey === visibilityKey) {
      return this.lastStats;
    }

    const shapes = tile.geometry.shapes;
    for (const bucket of this.buckets.values()) {
      bucket.beginUpdate();
    }

    const orderBucketSize = getGdsTileOrderBucketSize(shapes.length);
    let visibleShapeOrdinal = 0;
    for (const shape of shapes) {
      const style = getGdsTileShapeStyle(shape, layoutVisibility, getPhysicalLayoutLayerCategoryColor);
      if (!style) {
        continue;
      }

      const bucketIndex = Math.floor(visibleShapeOrdinal / orderBucketSize);
      visibleShapeOrdinal += 1;
      const bucket = this.getBucket(bucketIndex);
      bucket.used = true;
      const batch = bucket.getBatch(getGdsTileMeshBatchKey(shape, style), style);
      if (addGdsTileMeshFill(batch.builder, shape)) {
        if (shape.kind !== 'placement') {
          drawGdsTileShapeStroke(bucket.fallbackGraphics, shape, style);
          bucket.hasFallbackGraphics = true;
        }
        continue;
      }

      drawGdsTileShapeGraphics(bucket.fallbackGraphics, shape, style);
      bucket.hasFallbackGraphics = true;
    }

    let stats: PhysicalLayoutShapeDisplay['stats'] = {
      ...createEmptyGdsMeshStats(),
      columnarByteLength: estimateGdsTileColumnarByteLength(tile),
      orderBucketSize,
    };
    const orderedBuckets = Array.from(this.buckets.entries()).sort((left, right) => left[0] - right[0]);
    const orderedChildren: PixiContainerChild[] = [];
    for (const [bucketIndex, bucket] of orderedBuckets) {
      if (!bucket.used) {
        bucket.container.visible = false;
        continue;
      }

      bucket.container.visible = true;
      const bucketStats = bucket.commit();
      stats = mergeGdsMeshStats(stats, { ...bucketStats, orderBucketSize });
      orderedChildren[bucketIndex] = bucket.container;
    }

    const liveBucketChildren = orderedChildren.filter((child): child is PixiContainerChild => Boolean(child));
    syncContainerChildOrder(this.container, liveBucketChildren);

    this.lastTile = tile;
    this.lastVisibilityKey = visibilityKey;
    this.lastStats = stats;
    return stats;
  }

  public destroy() {
    for (const bucket of this.buckets.values()) {
      bucket.destroy();
    }
    this.buckets.clear();
    this.container.destroy({ children: true });
  }

  public getBatchCount(): number {
    let count = 0;
    for (const bucket of this.buckets.values()) {
      count += bucket.getBatchCount();
    }
    return count;
  }

  private getBucket(index: number): PhysicalLayoutGdsPersistentBucket {
    let bucket = this.buckets.get(index);
    if (!bucket) {
      bucket = new PhysicalLayoutGdsPersistentBucket();
      this.buckets.set(index, bucket);
    }
    return bucket;
  }
}

class PhysicalLayoutGdsPersistentBucket {
  public readonly container = new Container({ label: 'gds-persistent-order-bucket' });
  public readonly fallbackGraphics = new Graphics();
  public hasFallbackGraphics = false;
  public used = false;

  private readonly batches = new Map<string, PhysicalLayoutGdsPersistentBatch>();
  private batchCreateCount = 0;
  private batchReuseCount = 0;

  public beginUpdate() {
    this.used = false;
    this.hasFallbackGraphics = false;
    this.batchCreateCount = 0;
    this.batchReuseCount = 0;
    this.fallbackGraphics.clear();
    for (const batch of this.batches.values()) {
      batch.used = false;
      batch.builder.reset();
    }
  }

  public getBatch(key: string, style: PhysicalLayoutGdsTileShapeStyle): PhysicalLayoutGdsPersistentBatch {
    let batch = this.batches.get(key);
    if (!batch) {
      batch = createGdsPersistentBatch(style);
      this.batches.set(key, batch);
      this.batchCreateCount += 1;
    } else {
      this.batchReuseCount += 1;
    }

    batch.used = true;
    batch.mesh.tint = style.color;
    batch.mesh.alpha = style.alpha;
    return batch;
  }

  public commit(): PhysicalLayoutShapeDisplay['stats'] {
    let stats = createEmptyGdsMeshStats();
    const orderedChildren: PixiContainerChild[] = [];
    for (const batch of this.batches.values()) {
      if (!batch.used) {
        batch.mesh.visible = false;
        continue;
      }

      const batchStats = commitGdsPersistentBatch(batch);
      stats = mergeGdsMeshStats(stats, batchStats);
      if (batch.mesh.visible) {
        orderedChildren.push(batch.mesh);
      }
    }

    this.fallbackGraphics.visible = this.hasFallbackGraphics;
    if (this.hasFallbackGraphics) {
      orderedChildren.push(this.fallbackGraphics);
      stats.drawNodeCount += 1;
    }

    syncContainerChildOrder(this.container, orderedChildren);

    return mergeGdsMeshStats(stats, {
      ...createEmptyGdsMeshStats(),
      batchCreateCount: this.batchCreateCount,
      batchReuseCount: this.batchReuseCount,
    });
  }

  public destroy() {
    for (const batch of this.batches.values()) {
      batch.mesh.destroy({ children: true });
    }
    this.batches.clear();
    this.fallbackGraphics.destroy();
    this.container.destroy({ children: true });
  }

  public getBatchCount(): number {
    return this.batches.size;
  }
}

function createGdsPersistentRendererVisibilityKey(layoutVisibility: PhysicalLayoutVisibility): string {
  return [
    layoutVisibility.outlineVisible ? 'outline:1' : 'outline:0',
    Array.from(layoutVisibility.visibleItems).sort().join(','),
    formatPhysicalLayoutLayerOpacitySummary(layoutVisibility),
  ].join('|');
}

function syncContainerChildOrder(container: Container, orderedChildren: readonly PixiContainerChild[]) {
  orderedChildren.forEach((child, index) => {
    if (child.parent !== container) {
      container.addChildAt(child, Math.min(index, container.children.length));
      return;
    }

    const currentIndex = container.children.indexOf(child);
    if (currentIndex !== index) {
      container.setChildIndex(child, index);
    }
  });
}

function estimateGdsTileColumnarByteLength(tile: LspLayoutTileGeometry): number {
  const shapeCount = tile.geometry.shapes.length;
  const pointCount = tile.geometry.polygonPointCount;
  const textShapeCount = tile.geometry.shapes.reduce((count, shape) => count + (shape.kind === 'text' ? 1 : 0), 0);
  const shapeScalarBytes = shapeCount * (
    (6 * Uint32Array.BYTES_PER_ELEMENT)
    + (4 * Float64Array.BYTES_PER_ELEMENT)
  );
  const pointBytes = pointCount * 2 * Float64Array.BYTES_PER_ELEMENT;
  const textBytes = textShapeCount * 4 * Uint32Array.BYTES_PER_ELEMENT;
  return shapeScalarBytes + pointBytes + textBytes;
}

function createGdsDisplayedGeometrySnapshotKey(tiles: ReadonlyMap<string, PhysicalLayoutGdsDisplayedTile>): string {
  return Array.from(tiles.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, entry]) => `${key}:${entry.tile.geometry.shapes.length}:${entry.tile.payloadSize}:${entry.tile.nextToken ?? 'done'}`)
    .join('|');
}

function drawShapes(shapes: readonly LspLayoutShape[], layoutVisibility: PhysicalLayoutVisibility): PhysicalLayoutShapeDisplay {
  const graphics = new Graphics();

  for (const shape of shapes) {
    const category = getCanvasShapeCategory(shape);
    const color = getPhysicalLayoutLayerCategoryColor(shape.layerIndex, category).pixiColor;
    const layerOpacity = getPhysicalLayoutLayerOpacity(layoutVisibility, shape.layerIndex);
    const alpha = (category === 'obstruction' || category === 'blockage' ? 0.28 : 0.7) * layerOpacity;

    if (shape.kind === 'polygon' && shape.polygon && shape.polygon.length >= 3) {
      graphics
        .poly(shape.polygon.flatMap((point) => [point.x, point.y]), true)
        .fill({ color, alpha })
        .stroke({ color, alpha: 0.9 * layerOpacity, width: 0.018 });
      continue;
    }

    const x0 = Math.min(shape.rect.x0, shape.rect.x1);
    const y0 = Math.min(shape.rect.y0, shape.rect.y1);
    const width = Math.max(Math.abs(shape.rect.x1 - shape.rect.x0), 0.01);
    const height = Math.max(Math.abs(shape.rect.y1 - shape.rect.y0), 0.01);
    graphics
      .rect(x0, y0, width, height)
      .fill({ color, alpha })
      .stroke({ color, alpha: 0.92 * layerOpacity, width: 0.015 });
  }

  const container = new Container({ label: 'layout-shapes-graphics' });
  container.addChild(graphics);
  return {
    node: container,
    stats: {
      ...createEmptyGdsMeshStats(),
      drawNodeCount: 1,
    },
  };
}

function drawGdsTileShapes(shapes: readonly LspLayoutShape[], layoutVisibility: PhysicalLayoutVisibility): PhysicalLayoutShapeDisplay {
  const container = new Container({ label: 'gds-tile-shapes' });
  const buckets: PhysicalLayoutGdsTileOrderBucket[] = [];
  const orderBucketSize = getGdsTileOrderBucketSize(shapes.length);
  let visibleShapeOrdinal = 0;

  for (const shape of shapes) {
    const style = getGdsTileShapeStyle(shape, layoutVisibility, getPhysicalLayoutLayerCategoryColor);
    if (!style) {
      continue;
    }

    const bucketIndex = Math.floor(visibleShapeOrdinal / orderBucketSize);
    visibleShapeOrdinal += 1;
    const bucket = getGdsTileOrderBucket(buckets, bucketIndex);
    if (isGdsTileMeshFillShape(shape)) {
      const batchKey = getGdsTileMeshBatchKey(shape, style);
      const batch = bucket.batches.get(batchKey) ?? {
        alpha: style.alpha,
        builder: new PhysicalLayoutGdsMeshBuilder(),
        color: style.color,
      };
      addGdsTileMeshFill(batch.builder, shape);
      bucket.batches.set(batchKey, batch);
      if (shape.kind !== 'placement') {
        drawGdsTileShapeStroke(bucket.fallbackGraphics, shape, style);
        bucket.hasFallbackGraphics = true;
      }
      continue;
    }

    drawGdsTileShapeGraphics(bucket.fallbackGraphics, shape, style);
    bucket.hasFallbackGraphics = true;
  }

  let vertexCount = 0;
  let indexCount = 0;
  let meshBatchCount = 0;
  let drawNodeCount = 0;
  let bufferCapacityVertexCount = 0;
  let bufferDataReplaceCount = 0;
  let bufferReallocCount = 0;
  let bufferSubarrayCommitCount = 0;
  let bufferUpdateCount = 0;
  const bufferUpdateStartedAt = performance.now();
  for (const bucket of buckets) {
    const bucketContainer = new Container({ label: 'gds-tile-order-bucket' });
    for (const batch of bucket.batches.values()) {
      if (batch.builder.vertexCount === 0 || batch.builder.indexCount === 0) {
        continue;
      }

      const committed = batch.builder.commit();
      vertexCount += committed.vertexCount;
      indexCount += committed.indexCount;
      bufferCapacityVertexCount += committed.capacityVertexCount;
      bufferDataReplaceCount += 3;
      bufferReallocCount += committed.reallocCount;
      bufferUpdateCount += 1;
      meshBatchCount += 1;
      drawNodeCount += 1;
      const geometry = new MeshGeometry({
        indices: committed.indices,
        positions: committed.positions,
        shrinkBuffersToFit: false,
        topology: 'triangle-list',
        uvs: committed.uvs,
      });
      geometry.batchMode = 'no-batch';
      const mesh = new Mesh({
        geometry,
        label: 'gds-tile-fill-mesh',
        texture: Texture.WHITE,
      });
      mesh.tint = batch.color;
      mesh.alpha = batch.alpha;
      bucketContainer.addChild(mesh);
    }

    if (bucket.hasFallbackGraphics) {
      bucketContainer.addChild(bucket.fallbackGraphics);
      drawNodeCount += 1;
    }
    if (bucketContainer.children.length > 0) {
      container.addChild(bucketContainer);
    } else {
      bucket.fallbackGraphics.destroy();
      bucketContainer.destroy({ children: true });
    }
  }

  return {
    node: container,
    stats: {
      ...createEmptyGdsMeshStats(),
      drawNodeCount,
      bufferCapacityVertexCount,
      bufferDataReplaceCount,
      bufferReallocCount,
      bufferSubarrayCommitCount,
      bufferUpdateCount,
      bufferUpdateMs: Math.max(0, performance.now() - bufferUpdateStartedAt),
      indexCount,
      orderBucketSize,
      meshBatchCount,
      vertexCount,
    },
  };
}

class PhysicalLayoutGdsMeshBuilder {
  private indices = new Uint32Array(6);
  private positions = new Float32Array(8);
  private uvs = new Float32Array(8);
  private activeIndexView = this.indices;
  private activePositionView = this.positions;
  private activeUvView = this.uvs;
  private indexLength = 0;
  private positionLength = 0;
  private reallocCount = 0;

  public get vertexCount() {
    return this.positionLength / 2;
  }

  public get indexCount() {
    return this.indexLength;
  }

  public get capacityVertexCount() {
    return this.positions.length / 2;
  }

  public get capacityByteLength() {
    return this.positions.byteLength + this.uvs.byteLength + this.indices.byteLength;
  }

  public consumeReallocCount() {
    const value = this.reallocCount;
    this.reallocCount = 0;
    return value;
  }

  public reset() {
    this.indexLength = 0;
    this.positionLength = 0;
  }

  public addRect(bounds: LspLayoutBounds) {
    const x0 = Math.min(bounds.x0, bounds.x1);
    const x1 = Math.max(bounds.x0, bounds.x1);
    const y0 = Math.min(bounds.y0, bounds.y1);
    const y1 = Math.max(bounds.y0, bounds.y1);
    if (x1 <= x0 || y1 <= y0) {
      return;
    }

    const baseIndex = this.vertexCount;
    this.ensurePositionCapacity(this.positionLength + 8);
    this.ensureIndexCapacity(this.indexLength + 6);

    this.positions[this.positionLength] = x0;
    this.positions[this.positionLength + 1] = y0;
    this.positions[this.positionLength + 2] = x1;
    this.positions[this.positionLength + 3] = y0;
    this.positions[this.positionLength + 4] = x1;
    this.positions[this.positionLength + 5] = y1;
    this.positions[this.positionLength + 6] = x0;
    this.positions[this.positionLength + 7] = y1;
    this.uvs[this.positionLength] = 0;
    this.uvs[this.positionLength + 1] = 0;
    this.uvs[this.positionLength + 2] = 0;
    this.uvs[this.positionLength + 3] = 0;
    this.uvs[this.positionLength + 4] = 0;
    this.uvs[this.positionLength + 5] = 0;
    this.uvs[this.positionLength + 6] = 0;
    this.uvs[this.positionLength + 7] = 0;
    this.positionLength += 8;

    this.indices[this.indexLength] = baseIndex;
    this.indices[this.indexLength + 1] = baseIndex + 1;
    this.indices[this.indexLength + 2] = baseIndex + 2;
    this.indices[this.indexLength + 3] = baseIndex;
    this.indices[this.indexLength + 4] = baseIndex + 2;
    this.indices[this.indexLength + 5] = baseIndex + 3;
    this.indexLength += 6;
  }

  public addPolygon(points: readonly { x: number; y: number }[]) {
    if (points.length < 3) {
      return;
    }

    const baseIndex = this.vertexCount;
    this.ensurePositionCapacity(this.positionLength + points.length * 2);
    this.ensureIndexCapacity(this.indexLength + (points.length - 2) * 3);

    for (const point of points) {
      this.positions[this.positionLength] = point.x;
      this.positions[this.positionLength + 1] = point.y;
      this.uvs[this.positionLength] = 0;
      this.uvs[this.positionLength + 1] = 0;
      this.positionLength += 2;
    }

    for (let pointIndex = 1; pointIndex < points.length - 1; pointIndex += 1) {
      this.indices[this.indexLength] = baseIndex;
      this.indices[this.indexLength + 1] = baseIndex + pointIndex;
      this.indices[this.indexLength + 2] = baseIndex + pointIndex + 1;
      this.indexLength += 3;
    }
  }

  public commit() {
    return {
      capacityVertexCount: this.positions.length / 2,
      indexCount: this.indexLength,
      indices: this.indices.subarray(0, this.indexLength),
      positions: this.positions.subarray(0, this.positionLength),
      reallocCount: this.reallocCount,
      uvs: this.uvs.subarray(0, this.positionLength),
      vertexCount: this.vertexCount,
    };
  }

  public commitToGeometry(geometry: MeshGeometry) {
    geometry.positions = this.positions.subarray(0, this.positionLength);
    geometry.uvs = this.uvs.subarray(0, this.positionLength);
    geometry.indices = this.indices.subarray(0, this.indexLength);
  }

  public commitStableToGeometry(geometry: MeshGeometry) {
    const metrics = {
      dataReplaceCount: 0,
      subarrayCommitCount: 0,
    };
    const recordCommit = (delta: PhysicalLayoutGdsBufferViewCommitDelta) => {
      metrics.dataReplaceCount += delta.dataReplaceCount;
      metrics.subarrayCommitCount += delta.subarrayCommitCount;
    };

    this.activePositionView = commitPhysicalLayoutGdsStableBufferView(
      geometry.getBuffer('aPosition'),
      this.activePositionView,
      this.positions,
      this.positionLength,
      recordCommit,
    );
    this.activeUvView = commitPhysicalLayoutGdsStableBufferView(
      geometry.getBuffer('aUV'),
      this.activeUvView,
      this.uvs,
      this.positionLength,
      recordCommit,
    );
    this.activeIndexView = commitPhysicalLayoutGdsStableBufferView(
      geometry.indexBuffer,
      this.activeIndexView,
      this.indices,
      this.indexLength,
      recordCommit,
    );
    setPhysicalExplicitDrawCount(geometry, this.indexLength);
    return metrics;
  }

  private ensurePositionCapacity(requiredLength: number) {
    if (this.positions.length >= requiredLength) {
      return;
    }

    const nextLength = getNextPowerOfTwo(Math.max(8, requiredLength));
    const nextPositions = new Float32Array(nextLength);
    nextPositions.set(this.positions.subarray(0, this.positionLength));
    this.positions = nextPositions;
    const nextUvs = new Float32Array(nextLength);
    nextUvs.set(this.uvs.subarray(0, this.positionLength));
    this.uvs = nextUvs;
    this.reallocCount += 1;
  }

  private ensureIndexCapacity(requiredLength: number) {
    if (this.indices.length >= requiredLength) {
      return;
    }

    const nextLength = getNextPowerOfTwo(Math.max(6, requiredLength));
    const nextIndices = new Uint32Array(nextLength);
    nextIndices.set(this.indices.subarray(0, this.indexLength));
    this.indices = nextIndices;
    this.reallocCount += 1;
  }
}

function getGdsTileOrderBucket(
  buckets: PhysicalLayoutGdsTileOrderBucket[],
  bucketIndex: number,
): PhysicalLayoutGdsTileOrderBucket {
  let bucket = buckets[bucketIndex];
  if (!bucket) {
    bucket = {
      batches: new Map<string, PhysicalLayoutMeshBatch>(),
      fallbackGraphics: new Graphics(),
      hasFallbackGraphics: false,
    };
    buckets[bucketIndex] = bucket;
  }
  return bucket;
}

type PhysicalLayoutGdsTypedBuffer = Float32Array | Uint32Array;

interface PhysicalLayoutGdsBufferViewCommitDelta {
  dataReplaceCount: number;
  subarrayCommitCount: number;
}

function commitPhysicalLayoutGdsStableBufferView<TView extends PhysicalLayoutGdsTypedBuffer>(
  buffer: PixiBuffer,
  previousView: TView,
  source: TView,
  activeLength: number,
  onCommit: (delta: PhysicalLayoutGdsBufferViewCommitDelta) => void,
): TView {
  if (previousView === source && buffer.data === source) {
    buffer.update(activeLength * source.BYTES_PER_ELEMENT);
    onCommit({ dataReplaceCount: 0, subarrayCommitCount: 1 });
    return previousView;
  }

  buffer.data = source;
  buffer.update(activeLength * source.BYTES_PER_ELEMENT);
  onCommit({ dataReplaceCount: 1, subarrayCommitCount: 0 });
  return source;
}

function createGdsPersistentBatch(style: PhysicalLayoutGdsTileShapeStyle): PhysicalLayoutGdsPersistentBatch {
  const geometry = new MeshGeometry({
    indices: new Uint32Array(0),
    positions: new Float32Array(0),
    shrinkBuffersToFit: false,
    topology: 'triangle-list',
    uvs: new Float32Array(0),
  });
  geometry.batchMode = 'no-batch';
  markPhysicalExplicitDrawCountGeometry(geometry);
  const mesh = new Mesh({
    geometry,
    label: 'gds-persistent-fill-mesh',
    texture: Texture.WHITE,
  });
  mesh.tint = style.color;
  mesh.alpha = style.alpha;
  mesh.visible = false;

  return {
    builder: new PhysicalLayoutGdsMeshBuilder(),
    mesh,
    used: false,
  };
}

function commitGdsPersistentBatch(batch: PhysicalLayoutGdsPersistentBatch): PhysicalLayoutShapeDisplay['stats'] {
  const startedAt = performance.now();
  const hasGeometry = batch.builder.vertexCount > 0 && batch.builder.indexCount > 0 && batch.mesh.alpha > 0;
  const wasVisible = batch.mesh.visible;
  let dataReplaceCount = 0;
  let subarrayCommitCount = 0;
  if (hasGeometry || batch.mesh.visible) {
    const commitMetrics = batch.builder.commitStableToGeometry(batch.mesh.geometry);
    dataReplaceCount = commitMetrics.dataReplaceCount;
    subarrayCommitCount = commitMetrics.subarrayCommitCount;
  }
  batch.mesh.visible = hasGeometry;
  return {
    atlasGpuByteLength: batch.builder.capacityByteLength,
    applyBudgetOverrunCount: batch.builder.vertexCount > 0 && Math.max(0, performance.now() - startedAt) > 4 ? 1 : 0,
    applyChunkCount: batch.builder.vertexCount > 0 ? 1 : 0,
    applyQueueDepth: 0,
    batchCreateCount: 0,
    batchDestroyCount: 0,
    batchReuseCount: 0,
    bufferCapacityVertexCount: batch.builder.capacityVertexCount,
    bufferDataReplaceCount: dataReplaceCount,
    bufferReallocCount: batch.builder.consumeReallocCount(),
    bufferSubarrayCommitCount: subarrayCommitCount,
    bufferUpdateCount: hasGeometry || wasVisible ? 1 : 0,
    bufferUpdateMs: Math.max(0, performance.now() - startedAt),
    columnarByteLength: 0,
    drawNodeCount: batch.mesh.visible ? 1 : 0,
    idleSnapshotMs: 0,
    idleSnapshotSkippedCount: 0,
    indexCount: batch.builder.indexCount,
    orderBucketSize: 0,
    meshBatchCount: batch.mesh.visible ? 1 : 0,
    tileLayerCreateCount: 0,
    tileLayerDestroyCount: 0,
    tileLayerReuseCount: 0,
    vertexCount: batch.builder.vertexCount,
  };
}

function createEmptyGdsMeshStats(): PhysicalLayoutShapeDisplay['stats'] {
  return {
    atlasGpuByteLength: 0,
    applyBudgetOverrunCount: 0,
    applyChunkCount: 0,
    applyQueueDepth: 0,
    batchCreateCount: 0,
    batchDestroyCount: 0,
    batchReuseCount: 0,
    bufferCapacityVertexCount: 0,
    bufferDataReplaceCount: 0,
    bufferReallocCount: 0,
    bufferSubarrayCommitCount: 0,
    bufferUpdateCount: 0,
    bufferUpdateMs: 0,
    columnarByteLength: 0,
    drawNodeCount: 0,
    idleSnapshotMs: 0,
    idleSnapshotSkippedCount: 0,
    indexCount: 0,
    orderBucketSize: 0,
    meshBatchCount: 0,
    tileLayerCreateCount: 0,
    tileLayerDestroyCount: 0,
    tileLayerReuseCount: 0,
    vertexCount: 0,
  };
}

function mergeGdsMeshStats(
  left: PhysicalLayoutShapeDisplay['stats'],
  right: PhysicalLayoutShapeDisplay['stats'],
): PhysicalLayoutShapeDisplay['stats'] {
  return {
    atlasGpuByteLength: left.atlasGpuByteLength + right.atlasGpuByteLength,
    applyBudgetOverrunCount: left.applyBudgetOverrunCount + right.applyBudgetOverrunCount,
    applyChunkCount: left.applyChunkCount + right.applyChunkCount,
    applyQueueDepth: Math.max(left.applyQueueDepth, right.applyQueueDepth),
    batchCreateCount: left.batchCreateCount + right.batchCreateCount,
    batchDestroyCount: left.batchDestroyCount + right.batchDestroyCount,
    batchReuseCount: left.batchReuseCount + right.batchReuseCount,
    bufferCapacityVertexCount: left.bufferCapacityVertexCount + right.bufferCapacityVertexCount,
    bufferDataReplaceCount: left.bufferDataReplaceCount + right.bufferDataReplaceCount,
    bufferReallocCount: left.bufferReallocCount + right.bufferReallocCount,
    bufferSubarrayCommitCount: left.bufferSubarrayCommitCount + right.bufferSubarrayCommitCount,
    bufferUpdateCount: left.bufferUpdateCount + right.bufferUpdateCount,
    bufferUpdateMs: left.bufferUpdateMs + right.bufferUpdateMs,
    columnarByteLength: left.columnarByteLength + right.columnarByteLength,
    drawNodeCount: left.drawNodeCount + right.drawNodeCount,
    idleSnapshotMs: Math.max(left.idleSnapshotMs, right.idleSnapshotMs),
    idleSnapshotSkippedCount: left.idleSnapshotSkippedCount + right.idleSnapshotSkippedCount,
    indexCount: left.indexCount + right.indexCount,
    orderBucketSize: Math.max(left.orderBucketSize, right.orderBucketSize),
    meshBatchCount: left.meshBatchCount + right.meshBatchCount,
    tileLayerCreateCount: left.tileLayerCreateCount + right.tileLayerCreateCount,
    tileLayerDestroyCount: left.tileLayerDestroyCount + right.tileLayerDestroyCount,
    tileLayerReuseCount: left.tileLayerReuseCount + right.tileLayerReuseCount,
    vertexCount: left.vertexCount + right.vertexCount,
  };
}

function compareGdsDisplayedTiles(left: PhysicalLayoutGdsDisplayedTile, right: PhysicalLayoutGdsDisplayedTile): number {
  if (left.plan.lod !== right.plan.lod) {
    return right.plan.lod - left.plan.lod;
  }
  if (left.plan.bbox.y0 !== right.plan.bbox.y0) {
    return left.plan.bbox.y0 - right.plan.bbox.y0;
  }
  if (left.plan.bbox.x0 !== right.plan.bbox.x0) {
    return left.plan.bbox.x0 - right.plan.bbox.x0;
  }
  return left.plan.cacheKey.localeCompare(right.plan.cacheKey);
}

function getGdsDisplayedTileShapeCount(tiles: ReadonlyMap<string, PhysicalLayoutGdsDisplayedTile>): number {
  let count = 0;
  for (const entry of tiles.values()) {
    count += entry.tile.geometry.shapes.length;
  }
  return count;
}

function getGdsDisplayedEmptyTileCount(tiles: ReadonlyMap<string, PhysicalLayoutGdsDisplayedTile>): number {
  let count = 0;
  for (const entry of tiles.values()) {
    if (entry.tile.geometry.shapes.length === 0) {
      count += 1;
    }
  }
  return count;
}

function calculateFrameP95Ms(values: readonly number[]): number {
  const frameDurations = values
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 250)
    .sort((left, right) => left - right);
  if (frameDurations.length === 0) {
    return 0;
  }

  const index = Math.min(
    frameDurations.length - 1,
    Math.max(0, Math.ceil(frameDurations.length * 0.95) - 1),
  );
  return frameDurations[index] ?? 0;
}

function findGdsDisplayedShapeByIndex(
  tiles: ReadonlyMap<string, PhysicalLayoutGdsDisplayedTile>,
  shapeIndex: number | null,
): LspLayoutShape | null {
  if (shapeIndex === null) {
    return null;
  }

  for (const entry of tiles.values()) {
    const shape = entry.tile.geometry.shapes.find((candidate) => candidate.index === shapeIndex);
    if (shape) {
      return shape;
    }
  }
  return null;
}

function findVisibleGdsDisplayedShapeByIndex(
  tiles: ReadonlyMap<string, PhysicalLayoutGdsDisplayedTile>,
  shapeIndex: number | null,
  layoutVisibility: PhysicalLayoutVisibility,
): LspLayoutShape | null {
  const shape = findGdsDisplayedShapeByIndex(tiles, shapeIndex);
  if (!shape) {
    return null;
  }
  return filterVisiblePhysicalLayoutShapes([shape], layoutVisibility, 'gds').length > 0 ? shape : null;
}

function getGdsTileOrderBucketSize(shapeCount: number): number {
  if (shapeCount <= GDS_TILE_PRECISE_ORDER_SHAPE_LIMIT) {
    return 1;
  }
  if (shapeCount >= GDS_TILE_HUGE_ORDER_SHAPE_LIMIT) {
    return GDS_TILE_HUGE_ORDER_BUCKET_SIZE;
  }
  if (shapeCount >= GDS_TILE_LARGE_ORDER_SHAPE_LIMIT) {
    return GDS_TILE_LARGE_ORDER_BUCKET_SIZE;
  }
  return GDS_TILE_ORDER_BUCKET_SIZE;
}

function getGdsTileMeshBatchKey(shape: LspLayoutShape, style: PhysicalLayoutGdsTileShapeStyle): string {
  return [
    shape.layerIndex,
    getCanvasShapeCategory(shape),
    style.color,
    style.alpha.toFixed(3),
    style.strokeAlpha.toFixed(3),
    style.strokeWidth.toFixed(4),
  ].join(':');
}

function isGdsTileMeshFillShape(shape: LspLayoutShape): boolean {
  if (shape.kind === 'rect' || shape.kind === 'placement') {
    return true;
  }

  return !!(shape.kind === 'polygon' && shape.polygon && isConvexPolygon(shape.polygon));
}

function addGdsTileMeshFill(builder: PhysicalLayoutGdsMeshBuilder, shape: LspLayoutShape): boolean {
  if (shape.kind === 'rect' || shape.kind === 'placement') {
    builder.addRect(shapeBounds(shape));
    return true;
  }

  if (shape.kind === 'polygon' && shape.polygon && isConvexPolygon(shape.polygon)) {
    builder.addPolygon(shape.polygon);
    return true;
  }

  return false;
}

function drawGdsTileShapeStroke(
  graphics: Graphics,
  shape: LspLayoutShape,
  style: PhysicalLayoutGdsTileShapeStyle,
) {
  if (shape.kind === 'polygon' && shape.polygon && shape.polygon.length >= 3) {
    graphics
      .poly(shape.polygon.flatMap((point) => [point.x, point.y]), true)
      .stroke({ color: style.color, alpha: style.strokeAlpha, width: style.strokeWidth });
    return;
  }

  const bounds = shapeBounds(shape);
  graphics
    .rect(bounds.x0, bounds.y0, Math.max(bounds.x1 - bounds.x0, 0.01), Math.max(bounds.y1 - bounds.y0, 0.01))
    .stroke({ color: style.color, alpha: style.strokeAlpha, width: style.strokeWidth });
}

function drawGdsTileShapeGraphics(
  graphics: Graphics,
  shape: LspLayoutShape,
  style: PhysicalLayoutGdsTileShapeStyle,
) {
  if (shape.kind === 'polygon' && shape.polygon && shape.polygon.length >= 3) {
    graphics
      .poly(shape.polygon.flatMap((point) => [point.x, point.y]), true)
      .fill({ color: style.color, alpha: style.alpha })
      .stroke({ color: style.color, alpha: style.strokeAlpha, width: style.strokeWidth });
    return;
  }

  const bounds = shapeBounds(shape);
  graphics
    .rect(bounds.x0, bounds.y0, Math.max(bounds.x1 - bounds.x0, 0.01), Math.max(bounds.y1 - bounds.y0, 0.01))
    .fill({ color: style.color, alpha: style.alpha })
    .stroke({ color: style.color, alpha: style.strokeAlpha, width: style.strokeWidth });
}

function isConvexPolygon(points: readonly { x: number; y: number }[]): boolean {
  if (points.length < 3) {
    return false;
  }

  let sign = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    if (!a || !b || !c) {
      continue;
    }

    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) {
      continue;
    }

    const nextSign = Math.sign(cross);
    if (sign === 0) {
      sign = nextSign;
      continue;
    }

    if (sign !== nextSign) {
      return false;
    }
  }

  return true;
}

function getTilePlanArea(plan: PhysicalLayoutGdsTileRequestPlan): number {
  return Math.max(0, plan.bbox.x1 - plan.bbox.x0) * Math.max(0, plan.bbox.y1 - plan.bbox.y0);
}

function createGdsTileWindowRequestKey(plans: readonly PhysicalLayoutGdsTileRequestPlan[]): string {
  return plans.map((plan) => plan.cacheKey).join('||');
}

function getGdsFullCellFallbackReason(result: LoadedGdsTilePlan | null): string {
  if (!result) {
    return 'full-cell-request-failed';
  }

  if (result.stoppedByBudget) {
    return 'full-cell-budget-exceeded';
  }

  if (result.tile.truncated || result.tile.geometry.truncated) {
    return 'full-cell-truncated';
  }

  if (result.tile.geometry.shapes.length === 0) {
    return 'full-cell-empty';
  }

  return '';
}

function getNextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result *= 2;
  }

  return result;
}

function drawHighlightedShape(shape: LspLayoutShape) {
  const graphics = new Graphics();
  const highlightColor = 0xf8fafc;

  if (shape.kind === 'polygon' && shape.polygon && shape.polygon.length >= 3) {
    return graphics
      .poly(shape.polygon.flatMap((point) => [point.x, point.y]), true)
      .fill({ color: highlightColor, alpha: 0.2 })
      .stroke({ color: highlightColor, alpha: 1, width: 0.045 });
  }

  const bounds = shapeBounds(shape);
  return graphics
    .rect(bounds.x0, bounds.y0, Math.max(bounds.x1 - bounds.x0, 0.01), Math.max(bounds.y1 - bounds.y0, 0.01))
    .fill({ color: highlightColor, alpha: 0.2 })
    .stroke({ color: highlightColor, alpha: 1, width: 0.045 });
}

function getCanvasShapeCategory(shape: LspLayoutShape): PhysicalLayoutLayerCategory {
  if (shape.ownerKind === 'obstruction') {
    return 'obstruction';
  }
  if (shape.ownerKind === 'net') {
    return 'net';
  }
  if (shape.ownerKind === 'specialNet') {
    return 'specialNet';
  }
  if (shape.ownerKind === 'blockage') {
    return 'blockage';
  }
  if (shape.ownerKind === 'gdsElement') {
    if (shape.kind === 'text') {
      return 'text';
    }
    if (shape.kind === 'path') {
      return 'path';
    }
    return 'boundary';
  }

  return 'pin';
}

function drawPinLabels(labels: readonly PhysicalLayoutPinLabel[]) {
  const baseFontSize = 14;
  const worldFontSize = 0.16;

  return labels.map((label) => {
    const text = new Text({
      text: label.name,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: baseFontSize,
        fontWeight: '600',
        fill: label.color,
        stroke: { color: 0x101317, width: 3 },
      },
    });

    text.anchor.set(0.5);
    text.alpha = label.opacity;
    text.position.set(label.x, label.y);
    text.scale.set(worldFontSize / baseFontSize);
    text.resolution = 2;
    return text;
  });
}
