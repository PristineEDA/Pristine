import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { useLazyRef } from '@/hooks/use-lazy-ref';
import type {
  LspLayoutBounds,
  LspLayoutCatalog,
  LspLayoutGeometry,
} from '../../../../../types/systemverilog-lsp';
import {
  createPhysicalLayout3DSceneInput,
  getPhysicalLayout3DCenter,
  type PhysicalLayout3DCenter,
  type PhysicalLayout3DMeshInput,
} from './physicalLayout3dGeometry';
import {
  getPhysicalLayout3DBaseGridMaterialOptions,
  getPhysicalLayout3DBaseOutlineMaterialOptions,
  getPhysicalLayout3DEdgeMaterialOptions,
  getPhysicalLayout3DEdgeRenderOrder,
  getPhysicalLayout3DMeshMaterialOptions,
  getPhysicalLayout3DShapeRenderOrder,
  physicalLayout3DRenderOrders,
} from './physicalLayout3dRendering';
import {
  createPhysicalLayout3DViewHelper,
  getPhysicalLayout3DViewHelperTargetOrbit,
  getPhysicalLayout3DViewHelperViewport,
  physicalLayout3DViewHelperSize,
  type PhysicalLayout3DViewHelperAxis,
  type PhysicalLayout3DViewHelperEndpointPositions,
} from './physicalLayout3dViewHelper';
import type { PhysicalLayoutTarget } from './physicalLayoutGeometry';
import {
  formatPhysicalLayoutLayerOpacitySummary,
  hasNonDefaultPhysicalLayoutLayerOpacity,
  type PhysicalLayoutVisibility,
} from './physicalLayoutLayers';

type ThreeRendererStatus = 'initializing' | 'three-webgl' | 'error';

interface PhysicalLayout3DCanvasProps {
  catalog: LspLayoutCatalog | null;
  geometry: LspLayoutGeometry | null;
  highlightedShapeIndex?: number | null;
  layoutVisibility: PhysicalLayoutVisibility;
  selectedTarget: PhysicalLayoutTarget | null;
  onHighlightedShapeChange?: (shapeIndex: number | null) => void;
}

const minimumCanvasWidth = 220;
const minimumCanvasHeight = 180;
const defaultOrbit = {
  angleX: -0.9,
  angleY: -0.72,
};
const defaultZoom = 1;
const clickDistanceThresholdPx = 4;
const viewportStateSyncIntervalMs = 120;
const viewHelperAnimationDurationMs = 260;

export function PhysicalLayout3DCanvas({
  catalog,
  geometry,
  highlightedShapeIndex = null,
  layoutVisibility,
  onHighlightedShapeChange,
  selectedTarget,
}: PhysicalLayout3DCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const orbitGroupRef = useRef<THREE.Group | null>(null);
  const contentGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useLazyRef(() => new THREE.Raycaster());
  const viewHelperRef = useRef<ReturnType<typeof createPhysicalLayout3DViewHelper> | null>(null);
  const lastViewHelperAxisRef = useRef<PhysicalLayout3DViewHelperAxis | ''>('');
  const viewHelperAnimationRef = useRef<{
    axis: PhysicalLayout3DViewHelperAxis;
    from: typeof defaultOrbit;
    start: number;
    to: typeof defaultOrbit;
  } | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const highlightedShapeIndexRef = useRef<number | null>(highlightedShapeIndex);
  const onHighlightedShapeChangeRef = useRef(onHighlightedShapeChange);
  const sizeRef = useRef({ width: minimumCanvasWidth, height: minimumCanvasHeight });
  const orbitRef = useRef(defaultOrbit);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(defaultZoom);
  const renderCountRef = useRef(0);
  const lastViewportStateSyncAtRef = useRef(0);
  const viewportStateSyncTimeoutRef = useRef<number | null>(null);
  const isInteractingRef = useRef(false);
  const [rendererStatus, setRendererStatus] = useState<ThreeRendererStatus>('initializing');
  const [renderCount, setRenderCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: minimumCanvasWidth, height: minimumCanvasHeight });
  const [viewportState, setViewportState] = useState({
    orbit: defaultOrbit,
    pan: { x: 0, y: 0 },
    zoom: defaultZoom,
  });
  const [viewHelperState, setViewHelperState] = useState<{
    animating: boolean;
    lastAxis: PhysicalLayout3DViewHelperAxis | '';
    positions: PhysicalLayout3DViewHelperEndpointPositions | null;
  }>({
    animating: false,
    lastAxis: '',
    positions: null,
  });

  const sceneInput = useMemo(
    () => createPhysicalLayout3DSceneInput(catalog, geometry, selectedTarget, layoutVisibility),
    [catalog, geometry, layoutVisibility, selectedTarget],
  );

  const sceneCenter = sceneInput.bounds3D ? getPhysicalLayout3DCenter(sceneInput.bounds3D) : null;
  const pickableMeshHit = isInteractingRef.current
    ? null
    : getPickableMeshHit(
      sceneInput.meshes,
      sceneCenter,
      cameraRef.current,
      orbitGroupRef.current,
      size,
      pickShapeIndexAtViewportPoint,
    );
  highlightedShapeIndexRef.current = highlightedShapeIndex;
  onHighlightedShapeChangeRef.current = onHighlightedShapeChange;
  sizeRef.current = size;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (cause) {
      setRendererStatus('error');
      setError(cause instanceof Error ? cause.message : 'Unable to initialize 3D layout renderer.');
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x101317, 1);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.width = '100%';
    renderer.domElement.tabIndex = -1;
    renderer.domElement.dataset.physicalLayout3DCanvas = 'true';
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    const viewHelper = createPhysicalLayout3DViewHelper();
    viewHelperRef.current = viewHelper;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const orbitGroup = new THREE.Group();
    const contentGroup = new THREE.Group();
    orbitGroupRef.current = orbitGroup;
    contentGroupRef.current = contentGroup;
    orbitGroup.add(contentGroup);
    scene.add(orbitGroup);
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(8, -10, 12);
    scene.add(keyLight);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(0, 0, 120);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    setRendererStatus('three-webgl');
    updateRendererSize();
    redrawScene();
    requestRender();

    return () => {
      if (renderFrameRef.current !== null) {
        window.cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
      if (viewportStateSyncTimeoutRef.current !== null) {
        window.clearTimeout(viewportStateSyncTimeoutRef.current);
        viewportStateSyncTimeoutRef.current = null;
      }
      disposeGroup(contentGroup);
      renderer.dispose();
      viewHelper.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      viewHelperRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      orbitGroupRef.current = null;
      contentGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateRendererSize();
      requestRender();
    });
    resizeObserver.observe(host);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    redrawScene();
    requestRender();
  }, [sceneInput]);

  useEffect(() => {
    redrawScene();
    requestRender();
  }, [highlightedShapeIndex]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const dragState = {
      moved: false,
      pointerId: -1,
      previousX: 0,
      previousY: 0,
      totalDistance: 0,
      viewHelperPointer: false,
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const helperHit = getViewHelperPointerHit(event.clientX, event.clientY);
      dragState.moved = false;
      dragState.pointerId = event.pointerId;
      dragState.previousX = event.clientX;
      dragState.previousY = event.clientY;
      dragState.totalDistance = 0;
      dragState.viewHelperPointer = Boolean(helperHit?.inside);
      isInteractingRef.current = false;
      host.setPointerCapture(event.pointerId);
      if (dragState.viewHelperPointer) {
        event.preventDefault();
        event.stopPropagation();
      }
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
      if (dragState.viewHelperPointer) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!dragState.moved) {
        return;
      }

      isInteractingRef.current = true;
      orbitRef.current = {
        angleX: normalizeOrbitAngle(orbitRef.current.angleX + dy * 0.01),
        angleY: normalizeOrbitAngle(orbitRef.current.angleY + dx * 0.01),
      };
      requestRender();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (dragState.pointerId !== event.pointerId) {
        return;
      }

      dragState.pointerId = -1;
      isInteractingRef.current = false;
      syncViewportState();
      if (dragState.viewHelperPointer) {
        const helperHit = getViewHelperPointerHit(event.clientX, event.clientY);
        if (!dragState.moved && helperHit?.axis) {
          startViewHelperAxisAnimation(helperHit.axis);
        }
        dragState.viewHelperPointer = false;
        event.preventDefault();
        event.stopPropagation();
        if (host.hasPointerCapture(event.pointerId)) {
          host.releasePointerCapture(event.pointerId);
        }
        return;
      }
      if (!dragState.moved) {
        onHighlightedShapeChangeRef.current?.(pickShapeIndexAtClientPoint(event.clientX, event.clientY));
      }

      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
    };
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) {
        zoomRef.current = clamp(zoomRef.current * Math.exp(-event.deltaY * 0.001), 0.28, 5);
        requestRender();
        scheduleViewportStateSync(true);
        return;
      }

      if (event.shiftKey) {
        panRef.current = { ...panRef.current, x: panRef.current.x + event.deltaY * 0.01 };
        requestRender();
        scheduleViewportStateSync(true);
        return;
      }

      panRef.current = { ...panRef.current, y: panRef.current.y - event.deltaY * 0.01 };
      requestRender();
      scheduleViewportStateSync(true);
    };
    const handleDoubleClick = () => {
      orbitRef.current = defaultOrbit;
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = defaultZoom;
      requestRender();
      syncViewportState();
    };
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const helperHit = getViewHelperPointerHit(event.clientX, event.clientY);
      if (!helperHit?.inside) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (helperHit.axis) {
        startViewHelperAxisAnimation(helperHit.axis);
      }
    };

    host.addEventListener('pointerdown', handlePointerDown, true);
    host.addEventListener('pointermove', handlePointerMove, true);
    host.addEventListener('pointerup', handlePointerUp, true);
    host.addEventListener('pointercancel', handlePointerUp, true);
    host.addEventListener('click', handleClick, true);
    host.addEventListener('wheel', handleWheel, { passive: false });
    host.addEventListener('dblclick', handleDoubleClick);
    return () => {
      host.removeEventListener('pointerdown', handlePointerDown, true);
      host.removeEventListener('pointermove', handlePointerMove, true);
      host.removeEventListener('pointerup', handlePointerUp, true);
      host.removeEventListener('pointercancel', handlePointerUp, true);
      host.removeEventListener('click', handleClick, true);
      host.removeEventListener('wheel', handleWheel);
      host.removeEventListener('dblclick', handleDoubleClick);
    };
  }, []);

  const updateRendererSize = () => {
    const host = hostRef.current;
    const renderer = rendererRef.current;
    if (!host || !renderer) {
      return;
    }

    const width = Math.max(minimumCanvasWidth, Math.floor(host.clientWidth));
    const height = Math.max(minimumCanvasHeight, Math.floor(host.clientHeight));
    renderer.setSize(width, height, false);
    setSize({ width, height });
    updateCamera(width, height);
  };

  const updateCamera = (width = size.width, height = size.height) => {
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }

    const view = getCameraView(sceneInput.bounds3D, width, height, zoomRef.current, panRef.current);
    camera.left = view.left;
    camera.right = view.right;
    camera.top = view.top;
    camera.bottom = view.bottom;
    camera.near = 0.1;
    camera.far = 1000;
    camera.updateProjectionMatrix();
  };

  const updateTransforms = () => {
    const orbitGroup = orbitGroupRef.current;
    if (!orbitGroup) {
      return;
    }

    orbitGroup.rotation.x = orbitRef.current.angleX;
    orbitGroup.rotation.z = orbitRef.current.angleY;
    updateCamera();
  };

  const redrawScene = () => {
    const contentGroup = contentGroupRef.current;
    if (!contentGroup) {
      return;
    }

    disposeGroup(contentGroup);
    const bounds = sceneInput.bounds;
    if (!bounds) {
      return;
    }

    const center = sceneCenter ?? { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2, z: 0 };
    contentGroup.add(createBaseGrid(bounds, center));

    for (const meshInput of sceneInput.meshes) {
      const mesh = createExtrudedMesh(meshInput, center, highlightedShapeIndexRef.current);
      if (mesh) {
        contentGroup.add(mesh);
      }
    }
    updateTransforms();
  };

  const requestRender = () => {
    if (renderFrameRef.current !== null) {
      return;
    }

    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const orbitGroup = orbitGroupRef.current;
      if (!renderer || !scene || !camera) {
        return;
      }

      const animating = updateViewHelperAnimation();
      updateTransforms();
      renderer.render(scene, camera);
      if (viewHelperRef.current && orbitGroup) {
        viewHelperRef.current.render(
          renderer,
          getPhysicalLayout3DViewHelperViewport(sizeRef.current.width, sizeRef.current.height),
          orbitGroup.quaternion,
        );
      }
      renderCountRef.current += 1;
      if (animating) {
        requestRender();
      }
      if (!isInteractingRef.current) {
        scheduleViewportStateSync(false);
      }
    });
  };

  const scheduleViewportStateSync = (immediate: boolean) => {
    if (immediate) {
      syncViewportState();
      return;
    }

    const now = window.performance.now();
    if (now - lastViewportStateSyncAtRef.current >= viewportStateSyncIntervalMs) {
      syncViewportState();
      return;
    }

    if (viewportStateSyncTimeoutRef.current !== null) {
      return;
    }

    const delay = Math.max(0, viewportStateSyncIntervalMs - (now - lastViewportStateSyncAtRef.current));
    viewportStateSyncTimeoutRef.current = window.setTimeout(() => {
      viewportStateSyncTimeoutRef.current = null;
      syncViewportState();
    }, delay);
  };

  const syncViewportState = () => {
    if (viewportStateSyncTimeoutRef.current !== null) {
      window.clearTimeout(viewportStateSyncTimeoutRef.current);
      viewportStateSyncTimeoutRef.current = null;
    }
    lastViewportStateSyncAtRef.current = window.performance.now();
    setRenderCount(renderCountRef.current);
    setViewportState({
      orbit: orbitRef.current,
      pan: panRef.current,
      zoom: zoomRef.current,
    });
    setViewHelperState((current) => ({
      ...current,
      animating: Boolean(viewHelperAnimationRef.current),
      positions: getViewHelperEndpointPositions(),
    }));
  };

  const startViewHelperAxisAnimation = (axis: PhysicalLayout3DViewHelperAxis) => {
    lastViewHelperAxisRef.current = axis;
    viewHelperAnimationRef.current = {
      axis,
      from: orbitRef.current,
      start: window.performance.now(),
      to: getPhysicalLayout3DViewHelperTargetOrbit(axis),
    };
    setViewHelperState((current) => ({
      ...current,
      animating: true,
      lastAxis: lastViewHelperAxisRef.current,
    }));
    requestRender();
  };

  const updateViewHelperAnimation = () => {
    const animation = viewHelperAnimationRef.current;
    if (!animation) {
      return false;
    }

    const progress = clamp((window.performance.now() - animation.start) / viewHelperAnimationDurationMs, 0, 1);
    const eased = easeInOutCubic(progress);
    orbitRef.current = {
      angleX: interpolateOrbitAngle(animation.from.angleX, animation.to.angleX, eased),
      angleY: interpolateOrbitAngle(animation.from.angleY, animation.to.angleY, eased),
    };

    if (progress >= 1) {
      orbitRef.current = animation.to;
      viewHelperAnimationRef.current = null;
      syncViewportState();
      return false;
    }

    return true;
  };

  const getViewHelperEndpointPositions = (): PhysicalLayout3DViewHelperEndpointPositions | null => {
    const viewHelper = viewHelperRef.current;
    if (!viewHelper) {
      return null;
    }

    return viewHelper.getEndpointPositions(getPhysicalLayout3DViewHelperViewport(sizeRef.current.width, sizeRef.current.height));
  };

  const getViewHelperPointerHit = (clientX: number, clientY: number): {
    axis: PhysicalLayout3DViewHelperAxis | null;
    inside: boolean;
  } | null => {
    const host = hostRef.current;
    const viewHelper = viewHelperRef.current;
    if (!host || !viewHelper) {
      return null;
    }

    const bounds = host.getBoundingClientRect();
    const viewport = getPhysicalLayout3DViewHelperViewport(bounds.width, bounds.height);
    const viewportX = clientX - bounds.left;
    const viewportY = clientY - bounds.top;
    const inside = viewportX >= viewport.left
      && viewportY >= viewport.top
      && viewportX <= viewport.left + viewport.width
      && viewportY <= viewport.top + viewport.height;
    if (!inside) {
      return null;
    }

    return {
      axis: viewHelper.hitTest(viewportX, viewportY, viewport),
      inside,
    };
  };

  const pickShapeIndexAtClientPoint = (clientX: number, clientY: number): number | null => {
    const host = hostRef.current;
    if (!host) {
      return null;
    }

    const bounds = host.getBoundingClientRect();
    return pickShapeIndexAtViewportPoint(clientX - bounds.left, clientY - bounds.top);
  };

  function pickShapeIndexAtViewportPoint(viewportX: number, viewportY: number): number | null {
    const camera = cameraRef.current;
    const contentGroup = contentGroupRef.current;
    if (!camera || !contentGroup) {
      return null;
    }

    const pointer = new THREE.Vector2(
      (viewportX / Math.max(sizeRef.current.width, 1)) * 2 - 1,
      -((viewportY / Math.max(sizeRef.current.height, 1)) * 2 - 1),
    );
    const raycaster = raycasterRef.current;
    camera.updateMatrixWorld(true);
    contentGroup.updateWorldMatrix(true, true);
    raycaster.setFromCamera(pointer, camera);

    const intersections = raycaster.intersectObjects(contentGroup.children, true);
    for (const intersection of intersections) {
      const shapeIndex = findShapeIndexOnObject(intersection.object);
      if (shapeIndex !== null) {
        return shapeIndex;
      }
    }

    return null;
  }

  return (
    <div
      ref={hostRef}
      aria-label="Physical layout 3D canvas"
      className="relative box-border h-full min-h-0 w-full overflow-hidden border border-l-0 border-ide-border/80 bg-[#101317] outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 [&>canvas]:block [&>canvas]:h-full [&>canvas]:max-h-full [&>canvas]:max-w-full [&>canvas]:w-full [&>canvas]:outline-none [&>canvas]:focus:outline-none [&>canvas]:focus:ring-0 [&>canvas]:focus-visible:outline-none [&>canvas]:focus-visible:ring-0"
      data-base-grid-depth-test="true"
      data-depth-write-mode="solid-mesh"
      data-material-side="double"
      data-orbit-origin="bounds3d"
      data-orbit-angle-x={viewportState.orbit.angleX.toFixed(4)}
      data-orbit-angle-y={viewportState.orbit.angleY.toFixed(4)}
      data-orbit-render-mode="raf-ref-interaction-idle-sync"
      data-highlighted-shape-index={highlightedShapeIndex ?? ''}
      data-layer-opacity-summary={formatPhysicalLayoutLayerOpacitySummary(layoutVisibility)}
      data-pan-x={viewportState.pan.x.toFixed(4)}
      data-pan-y={viewportState.pan.y.toFixed(4)}
      data-pick-visible-shape-index={pickableMeshHit?.shapeIndex ?? ''}
      data-pick-visible-shape-screen-x={pickableMeshHit ? pickableMeshHit.x.toFixed(2) : ''}
      data-pick-visible-shape-screen-y={pickableMeshHit ? pickableMeshHit.y.toFixed(2) : ''}
      data-render-count={renderCount}
      data-renderer={rendererStatus}
      data-scene-center-offset-x={sceneCenter ? sceneCenter.x.toFixed(4) : '0.0000'}
      data-scene-center-offset-y={sceneCenter ? sceneCenter.y.toFixed(4) : '0.0000'}
      data-scene-center-offset-z={sceneCenter ? sceneCenter.z.toFixed(4) : '0.0000'}
      data-selected-target-name={selectedTarget?.name ?? ''}
      data-shape-count={sceneInput.selectedShapeCount}
      data-shape-opacity-mode={hasNonDefaultPhysicalLayoutLayerOpacity(layoutVisibility) ? 'layered' : 'opaque'}
      data-source-kind={catalog?.sourceKind ?? ''}
      data-testid="physical-layout-3d-canvas"
      data-viewport-framed="true"
      data-viewport-left-border="false"
      data-visible-shape-count={sceneInput.meshes.length}
      data-view-helper-animating={viewHelperState.animating ? 'true' : 'false'}
      data-view-helper-last-axis={viewHelperState.lastAxis}
      data-view-helper-neg-x-screen-x={formatViewHelperPosition(viewHelperState.positions?.negX?.x)}
      data-view-helper-neg-x-screen-y={formatViewHelperPosition(viewHelperState.positions?.negX?.y)}
      data-view-helper-neg-y-screen-x={formatViewHelperPosition(viewHelperState.positions?.negY?.x)}
      data-view-helper-neg-y-screen-y={formatViewHelperPosition(viewHelperState.positions?.negY?.y)}
      data-view-helper-neg-z-screen-x={formatViewHelperPosition(viewHelperState.positions?.negZ?.x)}
      data-view-helper-neg-z-screen-y={formatViewHelperPosition(viewHelperState.positions?.negZ?.y)}
      data-view-helper-pos-x-screen-x={formatViewHelperPosition(viewHelperState.positions?.posX?.x)}
      data-view-helper-pos-x-screen-y={formatViewHelperPosition(viewHelperState.positions?.posX?.y)}
      data-view-helper-pos-y-screen-x={formatViewHelperPosition(viewHelperState.positions?.posY?.x)}
      data-view-helper-pos-y-screen-y={formatViewHelperPosition(viewHelperState.positions?.posY?.y)}
      data-view-helper-pos-z-screen-x={formatViewHelperPosition(viewHelperState.positions?.posZ?.x)}
      data-view-helper-pos-z-screen-y={formatViewHelperPosition(viewHelperState.positions?.posZ?.y)}
      data-view-helper-background="transparent"
      data-view-helper-size={physicalLayout3DViewHelperSize}
      data-view-helper-visible="true"
      data-zoom={viewportState.zoom.toFixed(4)}
      role="img"
      tabIndex={-1}
    >
      {rendererStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] text-ide-error">
          {error ?? '3D layout renderer unavailable'}
        </div>
      )}
    </div>
  );
}

function createExtrudedMesh(
  input: PhysicalLayout3DMeshInput,
  center: PhysicalLayout3DCenter,
  highlightedShapeIndex: number | null,
): THREE.Group | null {
  try {
    const shape = new THREE.Shape();
    const first = input.points[0];
    if (!first) {
      return null;
    }

    shape.moveTo(first.x - center.x, first.y - center.y);
    for (const point of input.points.slice(1)) {
      shape.lineTo(point.x - center.x, point.y - center.y);
    }
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      bevelEnabled: false,
      depth: input.depth,
      steps: 1,
    });
    geometry.translate(0, 0, input.z - center.z);
    const highlighted = input.shapeIndex === highlightedShapeIndex;
    const material = new THREE.MeshStandardMaterial(getPhysicalLayout3DMeshMaterialOptions(input, highlighted));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = getPhysicalLayout3DShapeRenderOrder(input, highlighted);
    mesh.userData.shapeIndex = input.shapeIndex;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial(getPhysicalLayout3DEdgeMaterialOptions(input, highlighted)),
    );
    edges.renderOrder = getPhysicalLayout3DEdgeRenderOrder(input, highlighted);
    edges.userData.shapeIndex = input.shapeIndex;
    const group = new THREE.Group();
    group.userData.shapeIndex = input.shapeIndex;
    group.add(mesh);
    group.add(edges);
    return group;
  } catch {
    return null;
  }
}

function getCameraView(
  bounds: ReturnType<typeof createPhysicalLayout3DSceneInput>['bounds3D'],
  width: number,
  height: number,
  zoom: number,
  pan: { x: number; y: number },
) {
  const boundsWidth = Math.max((bounds?.x1 ?? 1) - (bounds?.x0 ?? 0), 0.001);
  const boundsHeight = Math.max((bounds?.y1 ?? 1) - (bounds?.y0 ?? 0), 0.001);
  const boundsDepth = Math.max((bounds?.z1 ?? 0) - (bounds?.z0 ?? 0), 0.001);
  const aspect = Math.max(width / Math.max(height, 1), 0.01);
  const viewSize = Math.max(boundsWidth / Math.max(aspect, 0.01), boundsHeight + boundsDepth * 0.7, 1) * 1.35 / zoom;

  return {
    bottom: -viewSize / 2 + pan.y,
    left: -viewSize * aspect / 2 + pan.x,
    right: viewSize * aspect / 2 + pan.x,
    top: viewSize / 2 + pan.y,
  };
}

function getMeshInputBounds(input: PhysicalLayout3DMeshInput) {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;

  for (const point of input.points) {
    x0 = Math.min(x0, point.x);
    y0 = Math.min(y0, point.y);
    x1 = Math.max(x1, point.x);
    y1 = Math.max(y1, point.y);
  }

  return { x0, y0, x1, y1 };
}

interface PickableMeshHit {
  shapeIndex: number;
  x: number;
  y: number;
}

function getPickableMeshHit(
  meshes: readonly PhysicalLayout3DMeshInput[],
  center: PhysicalLayout3DCenter | null,
  camera: THREE.Camera | null,
  orbitGroup: THREE.Group | null,
  size: { width: number; height: number },
  pickShapeIndexAtViewportPoint: (viewportX: number, viewportY: number) => number | null,
): PickableMeshHit | null {
  if (!center || !camera || !orbitGroup || size.width <= 0 || size.height <= 0) {
    return null;
  }

  camera.updateMatrixWorld(true);
  orbitGroup.updateWorldMatrix(true, true);
  for (let meshIndex = meshes.length - 1; meshIndex >= 0; meshIndex -= 1) {
    const mesh = meshes[meshIndex];
    if (!mesh) {
      continue;
    }

    for (const point of getMeshPickCandidatePoints(mesh, center)) {
      const screenPoint = projectWorldPointToViewport(point, camera, orbitGroup, size);
      if (!screenPoint) {
        continue;
      }

      if (pickShapeIndexAtViewportPoint(screenPoint.x, screenPoint.y) === mesh.shapeIndex) {
        return {
          shapeIndex: mesh.shapeIndex,
          x: screenPoint.x,
          y: screenPoint.y,
        };
      }
    }
  }

  return null;
}

function getMeshPickCandidatePoints(
  input: PhysicalLayout3DMeshInput,
  center: PhysicalLayout3DCenter,
): THREE.Vector3[] {
  const meshBounds = getMeshInputBounds(input);
  const z = input.z + input.depth / 2 - center.z;
  const candidates = [
    new THREE.Vector3(
      (meshBounds.x0 + meshBounds.x1) / 2 - center.x,
      (meshBounds.y0 + meshBounds.y1) / 2 - center.y,
      z,
    ),
  ];

  for (const xFraction of [0.25, 0.5, 0.75]) {
    for (const yFraction of [0.25, 0.5, 0.75]) {
      candidates.push(new THREE.Vector3(
        meshBounds.x0 + (meshBounds.x1 - meshBounds.x0) * xFraction - center.x,
        meshBounds.y0 + (meshBounds.y1 - meshBounds.y0) * yFraction - center.y,
        z,
      ));
    }
  }

  return candidates;
}

function projectWorldPointToViewport(
  point: THREE.Vector3,
  camera: THREE.Camera,
  orbitGroup: THREE.Group,
  size: { width: number; height: number },
): { x: number; y: number } | null {
  const projected = point.clone();
  orbitGroup.localToWorld(projected);
  projected.project(camera);
  const x = ((projected.x + 1) / 2) * size.width;
  const y = ((1 - projected.y) / 2) * size.height;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 2 || y < 2 || x > size.width - 2 || y > size.height - 2) {
    return null;
  }

  return { x, y };
}

function findShapeIndexOnObject(object: THREE.Object3D): number | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const shapeIndex = current.userData.shapeIndex;
    if (typeof shapeIndex === 'number') {
      return shapeIndex;
    }

    current = current.parent;
  }

  return null;
}

function createBaseGrid(bounds: LspLayoutBounds, center: PhysicalLayout3DCenter): THREE.Group {
  const group = new THREE.Group();
  const width = Math.max(bounds.x1 - bounds.x0, 0.001);
  const height = Math.max(bounds.y1 - bounds.y0, 0.001);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial(getPhysicalLayout3DBaseGridMaterialOptions()),
  );
  plane.renderOrder = physicalLayout3DRenderOrders.baseGrid;
  plane.position.set((bounds.x0 + bounds.x1) / 2 - center.x, (bounds.y0 + bounds.y1) / 2 - center.y, -0.015 - center.z);
  group.add(plane);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)),
    new THREE.LineBasicMaterial(getPhysicalLayout3DBaseOutlineMaterialOptions()),
  );
  outline.renderOrder = physicalLayout3DRenderOrders.baseGridOutline;
  outline.position.copy(plane.position);
  group.add(outline);
  return group;
}

function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh | THREE.LineSegments;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    geometry?.dispose();
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

function interpolateOrbitAngle(from: number, to: number, amount: number) {
  const delta = normalizeOrbitAngle(to - from);
  return normalizeOrbitAngle(from + delta * amount);
}

function normalizeOrbitAngle(value: number) {
  const turn = Math.PI * 2;
  return ((((value + Math.PI) % turn) + turn) % turn) - Math.PI;
}

function formatViewHelperPosition(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '';
}
