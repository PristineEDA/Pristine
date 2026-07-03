import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { createTerminalThemeFromColorTheme, IDE_MONO_FONT_FAMILY } from '../../../editor/appearance';
import { useTheme } from '../../../context/ThemeContext';
import {
  ensureTerminalSession,
  getTerminalSessionSnapshot,
  resizeTerminalSession,
  subscribeTerminalSession,
  writeTerminalSession,
  type TerminalProfile,
} from './terminalSessionStore';

interface TerminalSurfaceProps {
  layoutVersion?: string;
  profile?: TerminalProfile;
  sessionKey?: string;
  testId?: string;
}

const DEFAULT_TERMINAL_SESSION_KEY = 'default';

export function TerminalSurface({
  layoutVersion,
  profile = 'default',
  sessionKey = DEFAULT_TERMINAL_SESSION_KEY,
  testId = 'terminal-host',
}: TerminalSurfaceProps) {
  const [sessionState, setSessionState] = useState(() => getTerminalSessionSnapshot(sessionKey));
  const isE2E = window.electronAPI?.isE2E === true;
  const { activeTheme } = useTheme();
  const terminalTheme = useMemo(() => createTerminalThemeFromColorTheme(activeTheme), [activeTheme]);
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const renderedBufferRef = useRef(0);
  const syncSizeRef = useRef<(() => void) | null>(null);
  const pendingFrameRef = useRef<number | null>(null);
  const pendingFollowUpFrameRef = useRef<number | null>(null);

  const cancelScheduledSyncSize = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (pendingFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }

    if (pendingFollowUpFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingFollowUpFrameRef.current);
      pendingFollowUpFrameRef.current = null;
    }
  }, []);

  const scheduleSyncSize = useCallback((withFollowUp = false) => {
    if (typeof window === 'undefined') {
      return;
    }

    cancelScheduledSyncSize();

    pendingFrameRef.current = window.requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      syncSizeRef.current?.();

      if (!withFollowUp) {
        return;
      }

      pendingFollowUpFrameRef.current = window.requestAnimationFrame(() => {
        pendingFollowUpFrameRef.current = null;
        syncSizeRef.current?.();
      });
    });
  }, [cancelScheduledSyncSize]);

  const syncE2EState = (buffer: string, pid: number | null, sessionId: string | null) => {
    const host = hostRef.current;
    if (!host || !isE2E) {
      return;
    }

    host.dataset['terminalText'] = buffer.slice(-8000);
    if (pid) {
      host.dataset['terminalPid'] = String(pid);
    } else {
      delete host.dataset['terminalPid'];
    }

    if (sessionId) {
      host.dataset['terminalSessionId'] = sessionId;
    } else {
      delete host.dataset['terminalSessionId'];
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    scheduleSyncSize(true);

    return cancelScheduledSyncSize;
  }, [cancelScheduledSyncSize, layoutVersion, scheduleSyncSize]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const snapshot = getTerminalSessionSnapshot(sessionKey);
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: IDE_MONO_FONT_FAMILY,
      fontSize: 12,
      theme: terminalTheme,
    });
    const fitAddon = new FitAddon();
    renderedBufferRef.current = 0;

    terminalRef.current = term;
    term.loadAddon(fitAddon);
    term.open(host);
    term.focus();
    if (snapshot.buffer) {
      term.write(snapshot.buffer);
      renderedBufferRef.current = snapshot.buffer.length;
    }
    syncE2EState(snapshot.buffer, snapshot.pid, snapshot.sessionId);

    const syncSize = () => {
      fitAddon.fit();
      void resizeTerminalSession(sessionKey, term.cols, term.rows);
    };
    syncSizeRef.current = syncSize;

    const syncFromStore = () => {
      const next = getTerminalSessionSnapshot(sessionKey);
      setSessionState(next);

      if (next.buffer.length < renderedBufferRef.current) {
        term.reset();
        renderedBufferRef.current = 0;
      }

      if (next.buffer.length > renderedBufferRef.current) {
        term.write(next.buffer.slice(renderedBufferRef.current));
        renderedBufferRef.current = next.buffer.length;
      }
      syncE2EState(next.buffer, next.pid, next.sessionId);
    };

    const unsubscribe = subscribeTerminalSession(sessionKey, syncFromStore);
    const inputSubscription = term.onData((data) => {
      void writeTerminalSession(sessionKey, data);
    });

    const observedElements = [
      host,
      host.parentElement,
      host.closest('[data-panel-id="bottom-panel"]'),
      host.closest('[data-panel-id="center-panel"]'),
    ].filter((element): element is HTMLElement => element instanceof HTMLElement);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => scheduleSyncSize())
      : null;

    observedElements.forEach((element) => resizeObserver?.observe(element));

    scheduleSyncSize();

    void ensureTerminalSession(sessionKey, { cols: term.cols, profile, rows: term.rows }).then(() => {
      syncFromStore();
      scheduleSyncSize(true);
    });

    return () => {
      syncSizeRef.current = null;
      cancelScheduledSyncSize();
      resizeObserver?.disconnect();
      unsubscribe();
      inputSubscription.dispose();

      term.dispose();
      terminalRef.current = null;
    };
  }, [cancelScheduledSyncSize, isE2E, profile, scheduleSyncSize, sessionKey, terminalTheme]);

  return (
    <div
      className="bottom-panel-scrollbar relative flex h-full min-h-0 min-w-0 flex-1 cursor-text overflow-hidden"
      style={{ backgroundColor: terminalTheme.background }}
    >
      <div
        ref={hostRef}
        data-testid={testId}
        data-terminal-pane-id={sessionKey}
        className="h-full min-h-0 min-w-0 w-full px-2 py-1"
        onClick={() => terminalRef.current?.focus()}
      />
      {sessionState.error && (
        <div
          className="absolute inset-0 flex items-center justify-center px-6 text-center"
          style={{ backgroundColor: `${terminalTheme.background}e6` }}
        >
          <div>
            <div className="text-sm font-medium text-destructive">Terminal failed to start</div>
            <div className="mt-2 text-xs text-ide-text-muted">{sessionState.error}</div>
          </div>
        </div>
      )}
      {!sessionState.error && sessionState.isStarting && (
        <div className="pointer-events-none absolute right-3 top-2 text-[11px] text-ide-text-muted">
          Starting {sessionState.shellLabel}...
        </div>
      )}
    </div>
  );
}
