import {
  BugPlay,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  ListChecks,
  LoaderCircle,
  Play,
  Square,
} from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/button';
import { TooltipIconButton } from '../../ui/tooltip-icon-button';
import { RTL_REGRESSION_GROUPS, type RtlRegressionStatus, type RtlRegressionTest } from './rtlRegressionMockData';
import { useRtlRegressionStore, type RtlRegressionRunMode } from './useRtlRegressionStore';

const statusLabels: Record<RtlRegressionStatus, string> = {
  error: '错误',
  idle: '未开始',
  passed: '正确',
  running: '进行中',
};

const statusIconClassNames: Record<RtlRegressionStatus, string> = {
  error: 'text-ide-error',
  idle: 'text-ide-text-muted',
  passed: 'text-ide-success',
  running: 'text-ide-accent',
};

interface StatusIndicatorProps {
  status: RtlRegressionStatus;
}

function StatusIndicator({ status }: StatusIndicatorProps) {
  const iconClassName = cn('h-3.5 w-3.5', statusIconClassNames[status], status === 'running' && 'animate-spin');

  return (
    <span
      data-testid={`rtl-regression-status-${status}`}
      className={cn('ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center', statusIconClassNames[status])}
      aria-label={statusLabels[status]}
      role="img"
    >
      {status === 'idle' ? (
        <CircleDashed className={iconClassName} aria-hidden="true" />
      ) : status === 'running' ? (
        <LoaderCircle className={iconClassName} aria-hidden="true" />
      ) : status === 'error' ? (
        <CircleX className={iconClassName} aria-hidden="true" />
      ) : (
        <CircleCheck className={iconClassName} aria-hidden="true" />
      )}
    </span>
  );
}

interface TestRowProps {
  activeMode: RtlRegressionRunMode | null;
  onStart: (testId: string, mode: RtlRegressionRunMode) => void;
  onStop: (testId: string) => void;
  test: RtlRegressionTest;
}

const TestRow = memo(function TestRow({
  activeMode,
  onStart,
  onStop,
  test,
}: TestRowProps) {
  const isRunning = activeMode !== null;
  const status: RtlRegressionStatus = isRunning ? 'running' : test.status;
  const simulationLabel = isRunning ? `Stop simulation ${test.name}` : `Run simulation ${test.name}`;
  const debugLabel = isRunning ? `Stop debug ${test.name}` : `Debug ${test.name}`;

  return (
    <div
      data-testid={`rtl-regression-test-row-${test.id}`}
      className="group/test flex h-7 min-w-0 items-center gap-1.5 pr-2 text-ide-text hover:bg-ide-hover focus-within:bg-ide-hover"
      role="treeitem"
      style={{ paddingLeft: 24 }}
    >
      <span className="w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[12px]" title={test.name}>
        {test.name}
      </span>
      <StatusIndicator status={status} />
      <div
        data-testid={`rtl-regression-actions-${test.id}`}
        className="flex shrink-0 items-center gap-0 opacity-0 transition-opacity group-hover/test:opacity-100 group-focus-within/test:opacity-100"
      >
        <TooltipIconButton content="simulate" side="bottom">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              'h-5 w-5 text-ide-text-muted hover:text-ide-text',
              activeMode === 'simulation' && 'text-ide-accent',
            )}
            aria-label={simulationLabel}
            data-testid={`rtl-regression-action-simulate-${test.id}`}
            onClick={() => {
              if (isRunning) {
                onStop(test.id);
                return;
              }

              onStart(test.id, 'simulation');
            }}
          >
            {isRunning ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
          </Button>
        </TooltipIconButton>
        <TooltipIconButton content="debug" side="bottom">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              'h-5 w-5 text-ide-text-muted hover:text-ide-text',
              activeMode === 'debug' && 'text-ide-accent',
            )}
            aria-label={debugLabel}
            data-testid={`rtl-regression-action-debug-${test.id}`}
            onClick={() => {
              if (isRunning) {
                onStop(test.id);
                return;
              }

              onStart(test.id, 'debug');
            }}
          >
            {isRunning ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <BugPlay className="h-3.5 w-3.5" aria-hidden="true" />}
          </Button>
        </TooltipIconButton>
      </div>
    </div>
  );
});

export function RtlRegressionPanel() {
  const activeRun = useRtlRegressionStore((state) => state.activeRun);
  const expandedGroups = useRtlRegressionStore((state) => state.expandedGroups);
  const startTestRun = useRtlRegressionStore((state) => state.startTestRun);
  const stopTestRun = useRtlRegressionStore((state) => state.stopTestRun);
  const toggleGroup = useRtlRegressionStore((state) => state.toggleGroup);

  return (
    <div data-testid="rtl-regression-panel" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ide-border/60 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-ide-text-muted">
        <ListChecks className="h-3.5 w-3.5 text-ide-accent" aria-hidden="true" />
        <span>RTL Regression</span>
      </div>
      <div
        data-testid="rtl-regression-tree"
        className="min-h-0 flex-1 overflow-auto py-1 outline-none"
        role="tree"
        aria-label="RTL regression test suites"
        tabIndex={0}
      >
        {RTL_REGRESSION_GROUPS.map((group) => {
          const expanded = expandedGroups[group.id];

          return (
            <div key={group.id} role="none">
              <div
                data-testid={`rtl-regression-group-${group.id}`}
                className="group flex h-7 min-w-0 items-center gap-1 pr-2 text-ide-text hover:bg-ide-hover"
                role="treeitem"
                aria-expanded={expanded}
              >
                <button
                  type="button"
                  className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center text-ide-text-muted hover:text-ide-text"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.id} regression tests`}
                  data-testid={`rtl-regression-group-toggle-${group.id}`}
                  onClick={() => toggleGroup(group.id)}
                >
                  {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                </button>
                <span className="inline-flex min-w-0 items-baseline gap-1 leading-4">
                  <span className="block min-w-0 truncate text-[12px] font-semibold leading-4">{group.label}</span>
                  <span
                    data-testid={`rtl-regression-group-count-${group.id}`}
                    className="block text-[11px] leading-4 text-ide-text-muted"
                  >
                    ({group.tests.length})
                  </span>
                </span>
              </div>
              {expanded && group.tests.map((test) => (
                <TestRow
                  key={test.id}
                  activeMode={activeRun?.testId === test.id ? activeRun.mode : null}
                  test={test}
                  onStart={startTestRun}
                  onStop={stopTestRun}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
