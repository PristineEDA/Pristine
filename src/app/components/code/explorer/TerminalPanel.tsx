import { Suspense, lazy } from 'react';
import type { TerminalProfile } from './terminalSessionStore';

const TerminalSurface = lazy(() => import('./TerminalSurface').then((module) => ({ default: module.TerminalSurface })));

interface TerminalPanelProps {
  layoutVersion?: string;
  profile?: TerminalProfile;
  sessionKey?: string;
  testId?: string;
}

export function TerminalPanel({ layoutVersion, profile, sessionKey, testId }: TerminalPanelProps) {
  return (
    <Suspense
      fallback={(
        <div className="flex h-full items-center justify-center bg-ide-terminal-bg text-ide-text-muted text-[12px]">
          Initializing terminal...
        </div>
      )}
    >
      <TerminalSurface layoutVersion={layoutVersion} profile={profile} sessionKey={sessionKey} testId={testId} />
    </Suspense>
  );
}
