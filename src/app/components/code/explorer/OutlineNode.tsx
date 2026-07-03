import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Blocks,
  Braces,
  Cable,
  ChevronDown,
  ChevronRight,
  Circle,
  CircuitBoard,
  Component,
  FunctionSquare,
  Hash,
  Package,
  SquareMinus,
  SquarePlus,
  Variable,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LspOutlineItem } from '../../../../../types/systemverilog-lsp';

export type OutlineTreeNode =
  | {
    type: 'item';
    item: LspOutlineItem;
    children: OutlineTreeNode[];
  }
  | {
    type: 'kind-group';
    id: string;
    kind: string;
    children: OutlineTreeNode[];
  };

export function sanitizeOutlineTestIdPart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'outline';
}

export function getOutlineNodeKey(pathSegments: string[]) {
  return pathSegments.map(sanitizeOutlineTestIdPart).join('__');
}

export function getOutlineKindLabel(kind: string) {
  return kind
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}

export function getOutlineLine(item: LspOutlineItem) {
  const line = item.selectionRange?.start.line ?? item.range?.start.line;
  return typeof line === 'number' ? line + 1 : null;
}

export function OutlineIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'module':
      return <CircuitBoard className="h-4 w-4 text-ide-syntax-keyword" aria-hidden="true" />;
    case 'interface':
    case 'port':
      return <Cable className="h-4 w-4 text-ide-info" aria-hidden="true" />;
    case 'package':
      return <Package className="h-4 w-4 text-ide-syntax-string" aria-hidden="true" />;
    case 'class':
      return <Braces className="h-4 w-4 text-ide-syntax-function" aria-hidden="true" />;
    case 'function':
    case 'task':
      return <FunctionSquare className="h-3.5 w-3.5 text-ide-success" aria-hidden="true" />;
    case 'parameter':
    case 'localparam':
    case 'enumMember':
      return <Hash className="h-3.5 w-3.5 text-ide-syntax-number" aria-hidden="true" />;
    case 'variable':
    case 'net':
      return <Variable className="h-3.5 w-3.5 text-ide-syntax-function" aria-hidden="true" />;
    case 'instance':
      return <Component className="h-4 w-4 text-ide-syntax-keyword" aria-hidden="true" />;
    case 'generateBlock':
      return <Blocks className="h-4 w-4 text-ide-warning" aria-hidden="true" />;
    default:
      return <Circle className="h-2.5 w-2.5 text-ide-text-muted" aria-hidden="true" />;
  }
}

function getOutlineItemNode(item: LspOutlineItem, children: OutlineTreeNode[] = []): OutlineTreeNode {
  return {
    type: 'item',
    item,
    children,
  };
}

export function createPlainOutlineNode(item: LspOutlineItem): OutlineTreeNode {
  return getOutlineItemNode(item, item.children.map(createPlainOutlineNode));
}

function renderChildNodes({
  children,
  depth,
  expandedKeys,
  onLineJump,
  onToggleNode,
  pathSegments,
}: {
  children: OutlineTreeNode[];
  depth: number;
  expandedKeys: Set<string>;
  onLineJump: (line: number) => void;
  onToggleNode: (nodeKey: string) => void;
  pathSegments: string[];
}) {
  return children.map((child, index) => (
    <OutlineNode
      key={getOutlineTreeNodeStableId(child)}
      depth={depth + 1}
      expandedKeys={expandedKeys}
      node={child}
      onLineJump={onLineJump}
      onToggleNode={onToggleNode}
      pathSegments={[...pathSegments, `${index}:${getOutlineTreeNodeStableId(child)}`]}
    />
  ));
}

function getOutlineTreeNodeStableId(node: OutlineTreeNode) {
  return node.type === 'item' ? `${node.item.id}:${node.item.name}` : node.id;
}

function OutlineItemDetailTooltip({
  children,
  detail,
  itemName,
}: {
  children: ReactNode;
  detail: string | undefined;
  itemName: string;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [shouldRenderTooltip, setShouldRenderTooltip] = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (showFrameRef.current !== null) {
      cancelAnimationFrame(showFrameRef.current);
    }
  }, []);

  if (!detail) {
    return children;
  }

  const showTooltip = (event: PointerEvent<HTMLDivElement>) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (showFrameRef.current !== null) {
      cancelAnimationFrame(showFrameRef.current);
    }

    setTooltipPosition({ x: event.clientX, y: event.clientY });
    setShouldRenderTooltip(true);
    showFrameRef.current = requestAnimationFrame(() => {
      setIsTooltipVisible(true);
      showFrameRef.current = null;
    });
  };

  const moveTooltip = (event: PointerEvent<HTMLDivElement>) => {
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  };

  const hideTooltip = () => {
    if (showFrameRef.current !== null) {
      cancelAnimationFrame(showFrameRef.current);
      showFrameRef.current = null;
    }

    setIsTooltipVisible(false);
    hideTimerRef.current = setTimeout(() => {
      setShouldRenderTooltip(false);
      setTooltipPosition(null);
      hideTimerRef.current = null;
    }, 300);
  };

  return (
    <>
      <div
        role="none"
        onPointerEnter={showTooltip}
        onPointerMove={moveTooltip}
        onPointerLeave={hideTooltip}
      >
        {children}
      </div>
      {shouldRenderTooltip && tooltipPosition && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          data-testid={`outline-node-detail-tooltip-${sanitizeOutlineTestIdPart(itemName)}`}
          className={cn(
            'pointer-events-none fixed z-50 max-w-[280px] -translate-x-1/2 rounded-md border border-ide-border bg-ide-bg px-2 py-1.5 text-[11px] leading-4 text-ide-text shadow-lg transition-[opacity,transform] duration-300 ease-out',
            isTooltipVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
          )}
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y + 12,
          }}
        >
          <span className="sr-only">{itemName} detail: </span>
          <span>{detail}</span>
        </div>,
        document.body,
      )}
    </>
  );
}

interface OutlineNodeProps {
  depth: number;
  expandedKeys: Set<string>;
  node: OutlineTreeNode;
  onLineJump: (line: number) => void;
  onToggleNode: (nodeKey: string) => void;
  pathSegments: string[];
}

export const OutlineNode = memo(function OutlineNode({
  depth,
  expandedKeys,
  node,
  onLineJump,
  onToggleNode,
  pathSegments,
}: OutlineNodeProps) {
  const nodeKey = getOutlineNodeKey(pathSegments);
  const hasChildren = node.children.length > 0;
  const expanded = expandedKeys.has(nodeKey);

  const toggleNode = useCallback(() => {
    onToggleNode(nodeKey);
  }, [nodeKey, onToggleNode]);

  if (node.type === 'kind-group') {
    const kindLabel = getOutlineKindLabel(node.kind);
    const kindTestId = sanitizeOutlineTestIdPart(node.kind);

    return (
      <div role="none">
        <button
          type="button"
          data-testid={`outline-kind-group-${kindTestId}`}
          className="group flex h-6 w-full min-w-0 items-center pr-2 text-left text-ide-text hover:bg-ide-hover"
          style={{ paddingLeft: depth * 12 + 4 }}
          role="treeitem"
          aria-expanded={hasChildren ? expanded : undefined}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${kindLabel}`}
          onClick={toggleNode}
        >
          <span className="flex h-[13px] min-w-0 flex-1 items-end gap-1">
            <span
              data-testid={`outline-kind-group-icon-${nodeKey}`}
              className="inline-flex h-[13px] w-3.5 shrink-0 items-end justify-center text-ide-text-muted group-hover:text-ide-text"
              aria-hidden="true"
            >
              {expanded ? <SquareMinus size={13} /> : <SquarePlus size={13} />}
            </span>

            <span
              data-testid={`outline-kind-group-label-${kindTestId}`}
              className="ml-1 min-w-0 flex-1 translate-y-px truncate text-[12px] font-medium leading-[13px] text-ide-text"
            >
              {kindLabel}
            </span>
          </span>

          <span
            data-testid={`outline-kind-group-count-${kindTestId}`}
            className="h-[13px] shrink-0 translate-y-px text-[10px] leading-[13px] text-ide-text-muted"
          >
            ({node.children.length})
          </span>
        </button>

        {hasChildren && expanded && renderChildNodes({
          children: node.children,
          depth,
          expandedKeys,
          onLineJump,
          onToggleNode,
          pathSegments,
        })}
      </div>
    );
  }

  return (
    <OutlineItemNode
      depth={depth}
      expanded={expanded}
      expandedKeys={expandedKeys}
      hasChildren={hasChildren}
      node={node}
      nodeKey={nodeKey}
      onLineJump={onLineJump}
      onToggleNode={onToggleNode}
      pathSegments={pathSegments}
    />
  );
});

interface OutlineItemNodeProps extends OutlineNodeProps {
  expanded: boolean;
  hasChildren: boolean;
  node: Extract<OutlineTreeNode, { type: 'item' }>;
  nodeKey: string;
}

const OutlineItemNode = memo(function OutlineItemNode({
  depth,
  expanded,
  expandedKeys,
  hasChildren,
  node,
  nodeKey,
  onLineJump,
  onToggleNode,
  pathSegments,
}: OutlineItemNodeProps) {
  const { item } = node;
  const line = getOutlineLine(item);
  const kindLabel = getOutlineKindLabel(item.kind);
  const labelTestId = `outline-node-label-${sanitizeOutlineTestIdPart(item.kind)}-${sanitizeOutlineTestIdPart(item.name)}`;
  const detail = item.detail?.trim();
  const detailTestId = `outline-node-detail-${sanitizeOutlineTestIdPart(item.kind)}-${sanitizeOutlineTestIdPart(item.name)}`;

  const handleOpen = useCallback(() => {
    if (line !== null) {
      onLineJump(line);
    }
  }, [line, onLineJump]);

  const handleToggle = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleNode(nodeKey);
  }, [nodeKey, onToggleNode]);

  const itemRow = (
    <div
      data-testid={`outline-node-${nodeKey}`}
      className={cn(
        'group flex h-6 min-w-0 items-center gap-1 pr-2 text-ide-text hover:bg-ide-hover',
        line !== null && 'cursor-pointer',
      )}
      style={{ paddingLeft: depth * 12 + 4 }}
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      onClick={handleOpen}
    >
      {hasChildren ? (
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center text-ide-text-muted hover:text-ide-text"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.name}`}
          onClick={handleToggle}
        >
          {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        </button>
      ) : (
        <span className="w-3.5 shrink-0" aria-hidden="true" />
      )}

      <span
        data-testid={`outline-node-icon-${nodeKey}`}
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        aria-label={`${kindLabel} ${item.name}`}
        role="img"
      >
        <OutlineIcon kind={item.kind} />
      </span>

      <span
        data-testid={labelTestId}
        className={cn(
          'ml-1 flex h-4 min-w-0 flex-1 items-center overflow-hidden text-left text-[13px] font-normal',
          line !== null ? 'group-hover:text-ide-accent' : 'cursor-default',
        )}
      >
        <span className="block min-w-0 truncate leading-4">
          <span className="align-baseline">{item.name}</span>
          {detail && (
            <>
              <span className="mx-1 align-baseline text-[11px] leading-4 text-ide-text-muted">:</span>
              <span
                data-testid={detailTestId}
                className="align-baseline text-[11px] leading-4 text-ide-text-muted"
              >
                {detail}
              </span>
            </>
          )}
        </span>
      </span>

      {line !== null && (
        <button
          type="button"
          className="shrink-0 text-[10px] text-ide-text-muted opacity-0 hover:text-ide-text group-hover:opacity-100"
          aria-label={`Open ${item.name} at line ${line}`}
          onClick={(event) => {
            event.stopPropagation();
            handleOpen();
          }}
        >
          :{line}
        </button>
      )}
    </div>
  );

  return (
    <div role="none">
      <OutlineItemDetailTooltip detail={detail} itemName={item.name}>
        {itemRow}
      </OutlineItemDetailTooltip>

      {hasChildren && expanded && renderChildNodes({
        children: node.children,
        depth,
        expandedKeys,
        onLineJump,
        onToggleNode,
        pathSegments,
      })}
    </div>
  );
});
