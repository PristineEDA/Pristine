import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Home, Maximize2, RotateCcw, Spline } from 'lucide-react';

import { useModuleHierarchy } from '../../../../context/ModuleHierarchyContext';
import { useSchematicSettings } from '../../../../context/SchematicSettingsContext';
import { useTheme } from '../../../../context/ThemeContext';
import { useLazyRef } from '@/hooks/use-lazy-ref';
import { Button } from '../../../ui/button';
import { TooltipIconButton } from '../../../ui/tooltip-icon-button';
import { AsicSchematicCanvas, type AsicSchematicCanvasHandle } from './AsicSchematicCanvas';
import { applySchematicNodePositions, findModulePath, layoutAsicSchematic, type SchematicNodePositionOverrides } from './asicSchematicLayout';
import type { AsicSchematicGraph, SchematicLayoutResult } from './asicSchematicTypes';
import { lspSchematicToGraph } from './lspSchematicGraph';

interface CameraSnapshot {
  x: number;
  y: number;
  zoom: number;
}

export function AsicSchematicPanel() {
  const { theme, themeId } = useTheme();
  const { top: hierarchyTop } = useModuleHierarchy();
  const schematicSettings = useSchematicSettings();
  const canvasRef = useRef<AsicSchematicCanvasHandle | null>(null);
  const layoutCacheRef = useLazyRef(() => new Map<string, SchematicLayoutResult>());
  const prefetchingModuleIdsRef = useLazyRef(() => new Set<string>());
  const graphRef = useRef<AsicSchematicGraph | null>(null);
  const [graph, setGraph] = useState<AsicSchematicGraph | null>(null);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [requestedModuleId, setRequestedModuleId] = useState<string | null>(null);
  const [layout, setLayout] = useState<SchematicLayoutResult | null>(null);
  const [schematicError, setSchematicError] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [backStack, setBackStack] = useState<string[]>([]);
  const [forwardStack, setForwardStack] = useState<string[]>([]);
  const [camera, setCamera] = useState<CameraSnapshot>({ x: 0, y: 0, zoom: 1 });
  const [renderer, setRenderer] = useState('initializing');
  const [layoutState, setLayoutState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [layoutCacheSize, setLayoutCacheSize] = useState(0);
  const [positionOverridesByModule, setPositionOverridesByModule] = useState<Record<string, SchematicNodePositionOverrides>>({});

  graphRef.current = graph;
  const topRequestKey = `${hierarchyTop?.rootKey ?? 'auto'}:${hierarchyTop?.moduleName ?? ''}`;
  const modulePath = useMemo(() => graph && moduleId ? findModulePath(graph, moduleId) : [], [graph, moduleId]);
  const activeModule = graph && moduleId ? graph.modules[moduleId] : null;
  const activeLayout = useMemo(
    () => layout && moduleId ? applySchematicNodePositions(layout, positionOverridesByModule[moduleId] ?? {}, {
      gridSize: schematicSettings.gridSize,
      snapToGrid: schematicSettings.snapToGrid,
    }) : null,
    [layout, moduleId, positionOverridesByModule, schematicSettings.gridSize, schematicSettings.snapToGrid],
  );
  const selectedNode = selectedNodeIds.length === 1 ? activeLayout?.nodes.find((node) => node.id === selectedNodeIds[0]) ?? null : null;
  const selectedEdge = selectedEdgeIds.length === 1 ? activeLayout?.edges.find((edge) => edge.id === selectedEdgeIds[0]) ?? null : null;
  const parentModuleId = modulePath.length > 1 ? modulePath[modulePath.length - 2]?.id ?? null : null;
  const nextChildModuleId = forwardStack[0] ?? null;
  const pendingModuleId = requestedModuleId && requestedModuleId !== moduleId ? requestedModuleId : null;

  const cacheLayout = useCallback((nextModuleId: string, nextLayout: SchematicLayoutResult) => {
    layoutCacheRef.current.set(nextModuleId, nextLayout);
    setLayoutCacheSize(layoutCacheRef.current.size);
  }, []);

  const prefetchChildLayouts = useCallback((sourceGraph: AsicSchematicGraph, sourceLayout: SchematicLayoutResult) => {
    sourceLayout.nodes.forEach((node) => {
      const childModuleId = node.canDrillDown ? node.moduleId : null;

      if (!childModuleId || layoutCacheRef.current.has(childModuleId) || prefetchingModuleIdsRef.current.has(childModuleId)) {
        return;
      }

      prefetchingModuleIdsRef.current.add(childModuleId);
      layoutAsicSchematic(sourceGraph, childModuleId)
        .then((nextLayout) => {
          if (graphRef.current === sourceGraph) {
            cacheLayout(childModuleId, nextLayout);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          prefetchingModuleIdsRef.current.delete(childModuleId);
        });
    });
  }, [cacheLayout]);

  const handleEnterModule = useCallback((nextModuleId: string) => {
    if (!moduleId || nextModuleId === moduleId || nextModuleId === requestedModuleId) {
      return;
    }

    setBackStack((currentStack) => [...currentStack, moduleId]);
    setForwardStack([]);
    setRequestedModuleId(nextModuleId);
  }, [moduleId, requestedModuleId]);

  const handleGoParentModule = useCallback(() => {
    if (!moduleId) {
      return;
    }

    const nextModuleId = backStack[backStack.length - 1] ?? parentModuleId;

    if (!nextModuleId) {
      return;
    }

    setBackStack((currentStack) => currentStack.length > 0 ? currentStack.slice(0, -1) : currentStack);
    setForwardStack((currentStack) => [moduleId, ...currentStack.filter((candidate) => candidate !== moduleId)]);
    setRequestedModuleId(nextModuleId);
  }, [backStack, moduleId, parentModuleId]);

  const handleGoNextChildModule = useCallback(() => {
    if (!moduleId || !nextChildModuleId) {
      return;
    }

    setForwardStack((currentStack) => currentStack.slice(1));
    setBackStack((currentStack) => [...currentStack, moduleId]);
    setRequestedModuleId(nextChildModuleId);
  }, [moduleId, nextChildModuleId]);

  const handleDirectModuleNavigation = useCallback((nextModuleId: string) => {
    setBackStack([]);
    setForwardStack([]);
    setRequestedModuleId(nextModuleId);
  }, []);

  const handleNodePositionsChange = useCallback((positions: SchematicNodePositionOverrides, movedNodeIds: readonly string[]) => {
    if (!moduleId) {
      return;
    }

    const currentModuleId = moduleId;

    setPositionOverridesByModule((currentOverrides) => {
      const moduleOverrides = currentOverrides[currentModuleId] ?? {};
      const mergedOverrides = {
        ...moduleOverrides,
        ...positions,
      };

      if (!layout) {
        return {
          ...currentOverrides,
          [currentModuleId]: mergedOverrides,
        };
      }

      const resolvedLayout = applySchematicNodePositions(layout, mergedOverrides, {
        avoidOverlaps: true,
        snapToGrid: schematicSettings.snapToGrid,
        gridSize: schematicSettings.gridSize,
        selectedNodeIds: movedNodeIds,
      });
      const resolvedOverrides = { ...mergedOverrides };
      movedNodeIds.forEach((nodeId) => {
        const resolvedNode = resolvedLayout.nodes.find((node) => node.id === nodeId);

        if (resolvedNode) {
          resolvedOverrides[nodeId] = { x: resolvedNode.x, y: resolvedNode.y };
        }
      });

      if (Object.entries(resolvedOverrides).every(([nodeId, position]) => {
        const currentPosition = moduleOverrides[nodeId];

        return currentPosition?.x === position?.x && currentPosition?.y === position?.y;
      })) {
        return currentOverrides;
      }

      return {
        ...currentOverrides,
        [currentModuleId]: resolvedOverrides,
      };
    });
  }, [layout, moduleId, schematicSettings.gridSize, schematicSettings.snapToGrid]);

  const handleNodeSelectionChange = useCallback((nodeIds: string[]) => {
    setSelectedNodeIds(nodeIds);
    if (nodeIds.length > 0) {
      setSelectedEdgeIds([]);
    }
  }, []);

  const handleEdgeSelectionChange = useCallback((edgeIds: string[]) => {
    setSelectedEdgeIds(edgeIds);
    if (edgeIds.length > 0) {
      setSelectedNodeIds([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const lsp = window.electronAPI?.lsp;

    setLayoutState('loading');
    layoutCacheRef.current.clear();
    prefetchingModuleIdsRef.current.clear();
    graphRef.current = null;
    setLayoutCacheSize(0);
    setLayout(null);
    setGraph(null);
    setModuleId(null);
    setRequestedModuleId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setBackStack([]);
    setForwardStack([]);
    setPositionOverridesByModule({});
    setSchematicError(null);

    if (!lsp?.schematic) {
      setSchematicError('SystemVerilog schematic service is unavailable.');
      setLayoutState('error');
      return () => {
        cancelled = true;
      };
    }

    lsp.schematic({ moduleName: hierarchyTop?.moduleName, maxDepth: 64 })
      .then((nextSchematic) => {
        if (cancelled) {
          return;
        }

        const nextGraph = lspSchematicToGraph(nextSchematic);
        setGraph(nextGraph);
        setRequestedModuleId(nextGraph.rootModuleId);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSchematicError(error instanceof Error ? error.message : String(error));
        setLayoutState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [hierarchyTop?.moduleName, topRequestKey]);

  useEffect(() => {
    if (!graph || !requestedModuleId) {
      return undefined;
    }

    let cancelled = false;
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);

    const cachedLayout = layoutCacheRef.current.get(requestedModuleId);
    if (cachedLayout) {
      setLayout(cachedLayout);
      setModuleId(requestedModuleId);
      setLayoutState('ready');
      prefetchChildLayouts(graph, cachedLayout);
      return undefined;
    }

    setLayoutState('loading');

    layoutAsicSchematic(graph, requestedModuleId)
      .then((nextLayout) => {
        if (!cancelled) {
          cacheLayout(requestedModuleId, nextLayout);
          setLayout(nextLayout);
          setModuleId(requestedModuleId);
          setLayoutState('ready');
          prefetchChildLayouts(graph, nextLayout);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLayoutState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheLayout, graph, prefetchChildLayouts, requestedModuleId]);

  return (
    <div
      data-testid="asic-schematic-panel"
      data-ready={layoutState === 'ready' && renderer !== 'initializing'}
      data-renderer={renderer}
      data-theme={theme}
      data-module-id={moduleId ?? ''}
      data-pending-module-id={pendingModuleId ?? ''}
      data-layout-state={layoutState}
      data-layout-cache-size={layoutCacheSize}
      data-top-module={hierarchyTop?.moduleName ?? ''}
      data-node-count={activeLayout?.nodes.length ?? 0}
      data-edge-count={activeLayout?.edges.length ?? 0}
      data-selected-node-count={selectedNodeIds.length}
      data-selected-node-ids={selectedNodeIds.join(',')}
      data-selected-edge-count={selectedEdgeIds.length}
      data-selected-edge-ids={selectedEdgeIds.join(',')}
      data-zoom={camera.zoom.toFixed(3)}
      data-pan-x={camera.x.toFixed(1)}
      data-pan-y={camera.y.toFixed(1)}
      className="flex h-full min-h-0 flex-col bg-ide-bg text-ide-text"
    >
      <div className="flex min-h-8 shrink-0 items-center gap-2 border-b border-ide-border px-3 py-1.5">
        <Spline size={13} className="text-ide-accent" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[11px]">
          {modulePath.map((module, index) => (
            <div key={module.id} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <ChevronRight size={10} className="shrink-0 text-ide-text-muted" /> : null}
              <button
                type="button"
                className="truncate rounded px-1 py-0.5 text-ide-text-muted hover:bg-ide-hover hover:text-ide-text"
                onClick={() => handleDirectModuleNavigation(module.id)}
              >
                {module.name}
              </button>
            </div>
          ))}
        </div>
        <div className="hidden items-center gap-2 text-[11px] text-ide-text-muted md:flex">
          <span>{activeLayout?.nodes.length ?? 0} modules</span>
          <span>{activeLayout?.edges.length ?? 0} nets</span>
          <span>{renderer}</span>
        </div>
        <TooltipIconButton content="Root module">
          <Button variant="ghost" size="icon-xs" aria-label="Root module" onClick={() => graph && handleDirectModuleNavigation(graph.rootModuleId)} disabled={!graph}>
            <Home size={12} />
          </Button>
        </TooltipIconButton>
        <TooltipIconButton content="Parent module">
          <Button variant="ghost" size="icon-xs" aria-label="Parent module" onClick={handleGoParentModule} disabled={!parentModuleId && backStack.length === 0}>
            <ChevronUp size={12} />
          </Button>
        </TooltipIconButton>
        <TooltipIconButton content="Next child module">
          <Button variant="ghost" size="icon-xs" aria-label="Next child module" onClick={handleGoNextChildModule} disabled={!nextChildModuleId}>
            <ChevronDown size={12} />
          </Button>
        </TooltipIconButton>
        <TooltipIconButton content="Fit schematic">
          <Button variant="ghost" size="icon-xs" aria-label="Fit schematic" onClick={() => canvasRef.current?.fitToView()}>
            <Maximize2 size={12} />
          </Button>
        </TooltipIconButton>
        <TooltipIconButton content="Reset view">
          <Button variant="ghost" size="icon-xs" aria-label="Reset schematic view" onClick={() => canvasRef.current?.resetView()}>
            <RotateCcw size={12} />
          </Button>
        </TooltipIconButton>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-52 shrink-0 border-r border-ide-border bg-ide-bg p-3 text-[11px] lg:block">
          <div className="font-medium text-ide-text">{activeModule?.name}</div>
          <p className="mt-1 leading-4 text-ide-text-muted">{activeModule?.description ?? 'Waiting for schematic data.'}</p>
          {selectedNode ? (
            <div className="mt-4 rounded-md border border-ide-border bg-ide-panel-bg p-2">
              <div className="font-medium text-ide-text">{selectedNode.label}</div>
              <div className="mt-1 text-ide-text-muted">{selectedNode.tooltipType}</div>
              {selectedNode.canDrillDown && selectedNode.moduleId ? (
                <Button size="xs" variant="ghost" className="mt-2 h-6 px-1.5 text-[11px]" onClick={() => handleEnterModule(selectedNode.moduleId!)}>
                  Open module
                </Button>
              ) : null}
            </div>
          ) : selectedNodeIds.length > 1 ? (
            <div className="mt-4 rounded-md border border-ide-border bg-ide-panel-bg p-2">
              <div className="font-medium text-ide-text">{selectedNodeIds.length} items selected</div>
            </div>
          ) : selectedEdge ? (
            <div className="mt-4 rounded-md border border-ide-border bg-ide-panel-bg p-2">
              <div className="font-medium text-ide-text">{selectedEdge.label}</div>
              <div className="mt-1 text-ide-text-muted">{selectedEdge.isBus ? `${selectedEdge.signalWidth}-bit bus` : 'Single signal'}</div>
              {selectedEdge.kind ? <div className="mt-1 text-ide-text-muted">{selectedEdge.kind}</div> : null}
            </div>
          ) : null}
        </div>

        {layoutState === 'error' ? (
          <div className="flex flex-1 items-center justify-center px-4 text-center text-[12px] text-ide-text-muted">
            {schematicError ?? 'Unable to layout schematic.'}
          </div>
        ) : null}
        {layoutState === 'loading' ? (
          !activeLayout ? <div className="flex flex-1 items-center justify-center text-[12px] text-ide-text-muted">Loading schematic...</div> : null
        ) : null}
        {activeLayout ? (
          <div className="relative flex min-h-0 flex-1">
            <AsicSchematicCanvas
              ref={canvasRef}
              layout={activeLayout}
              alignmentGuidesEnabled={schematicSettings.alignmentGuidesEnabled}
              gridEnabled={schematicSettings.gridEnabled}
              gridSize={schematicSettings.gridSize}
              selectedNodeIds={selectedNodeIds}
              selectedEdgeIds={selectedEdgeIds}
              snapToGrid={schematicSettings.snapToGrid}
              themeKey={`${themeId}:${theme}`}
              onCameraChange={setCamera}
              onModuleOpen={handleEnterModule}
              onNodeSelectionChange={handleNodeSelectionChange}
              onEdgeSelectionChange={handleEdgeSelectionChange}
              onNodePositionsChange={handleNodePositionsChange}
              onRendererChange={setRenderer}
            />
            {layoutState === 'loading' ? (
              <div className="pointer-events-none absolute right-3 top-3 rounded border border-ide-border bg-ide-panel-bg/90 px-2 py-1 text-[11px] text-ide-text-muted shadow-sm">
                Loading {pendingModuleId ?? 'schematic'}...
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
