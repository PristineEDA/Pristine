import { useBottomPanelStore } from '../components/code/explorer/useBottomPanelStore';
import { getTerminalSessionSnapshot, terminateTerminalSession } from '../components/code/explorer/terminalSessionStore';
import { publishNotification } from '../notifications/useNotificationStore';
import {
  WSL_TERMINAL_SESSION_KEY,
  useWslDevelopmentEnvironmentStore,
  type WslDevelopmentEnvironmentStatus,
} from './useWslDevelopmentEnvironmentStore';

export function hasActiveWslDevelopmentEnvironment(): boolean {
  const status = useWslDevelopmentEnvironmentStore.getState().status;
  const wslSessionId = getTerminalSessionSnapshot(WSL_TERMINAL_SESSION_KEY).sessionId;
  const wslPaneOverride = useBottomPanelStore.getState().wslPaneOverride;

  return Boolean(wslSessionId)
    || Boolean(wslPaneOverride)
    || (status !== 'idle' && status !== 'error');
}

interface StopWslDevelopmentEnvironmentOptions {
  notifyOnError?: boolean;
  nextErrorStatus?: WslDevelopmentEnvironmentStatus;
}

type StopWslDevelopmentEnvironmentResult = { ok: true } | { ok: false; error: string };

let stopWslDevelopmentEnvironmentPromise: Promise<StopWslDevelopmentEnvironmentResult> | null = null;

export async function stopWslDevelopmentEnvironmentAndRestore(
  options: StopWslDevelopmentEnvironmentOptions = {},
): Promise<StopWslDevelopmentEnvironmentResult> {
  if (stopWslDevelopmentEnvironmentPromise) {
    return stopWslDevelopmentEnvironmentPromise;
  }

  stopWslDevelopmentEnvironmentPromise = stopWslDevelopmentEnvironmentAndRestoreOnce(options).finally(() => {
    stopWslDevelopmentEnvironmentPromise = null;
  });

  return stopWslDevelopmentEnvironmentPromise;
}

async function stopWslDevelopmentEnvironmentAndRestoreOnce(
  options: StopWslDevelopmentEnvironmentOptions,
): Promise<StopWslDevelopmentEnvironmentResult> {
  const { notifyOnError = true, nextErrorStatus = 'error' } = options;
  const store = useWslDevelopmentEnvironmentStore.getState();

  if (!hasActiveWslDevelopmentEnvironment()) {
    useBottomPanelStore.getState().restoreWslPaneOverride();
    store.setWslDevelopmentEnvironmentStatus('idle');
    return { ok: true };
  }

  store.setWslDevelopmentEnvironmentStatus('stopping');

  let stopError: string | null = null;

  try {
    await terminateTerminalSession(WSL_TERMINAL_SESSION_KEY);
    const result = await window.electronAPI?.wsl?.stopPristineEdaEnvironment();
    if (result && !result.ok) {
      stopError = result.error ?? 'Failed to stop Pristine WSL development environment.';
    }
  } catch (error) {
    stopError = error instanceof Error
      ? error.message
      : 'Failed to stop Pristine WSL development environment.';
  } finally {
    useBottomPanelStore.getState().restoreWslPaneOverride();
  }

  if (stopError) {
    if (nextErrorStatus === 'error') {
      useWslDevelopmentEnvironmentStore.getState().setWslDevelopmentEnvironmentError(stopError);
    } else {
      useWslDevelopmentEnvironmentStore.getState().setWslDevelopmentEnvironmentStatus(nextErrorStatus);
    }

    if (notifyOnError) {
      void publishNotification({
        body: stopError,
        level: 'error',
        title: 'WSL development environment failed',
      });
    }

    return { error: stopError, ok: false };
  }

  useWslDevelopmentEnvironmentStore.getState().setWslDevelopmentEnvironmentStatus('idle');
  return { ok: true };
}
