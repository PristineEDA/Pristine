import { beforeEach, describe, expect, it } from 'vitest';
import {
  WSL_TERMINAL_SESSION_KEY,
  resetWslDevelopmentEnvironmentStoreForTests,
  useWslDevelopmentEnvironmentStore,
} from './useWslDevelopmentEnvironmentStore';

describe('useWslDevelopmentEnvironmentStore', () => {
  beforeEach(() => {
    resetWslDevelopmentEnvironmentStoreForTests();
  });

  it('starts in the idle state with the fixed WSL terminal session key', () => {
    expect(useWslDevelopmentEnvironmentStore.getState()).toMatchObject({
      errorMessage: null,
      status: 'idle',
      terminalSessionKey: WSL_TERMINAL_SESSION_KEY,
      ubuntuDistro: 'Ubuntu-22.04',
    });
  });

  it('tracks status, distro, and errors', () => {
    useWslDevelopmentEnvironmentStore.getState().setWslUbuntuDistro('Ubuntu-24.04');
    useWslDevelopmentEnvironmentStore.getState().setWslDevelopmentEnvironmentStatus('checking');

    expect(useWslDevelopmentEnvironmentStore.getState()).toMatchObject({
      errorMessage: null,
      status: 'checking',
      ubuntuDistro: 'Ubuntu-24.04',
    });

    useWslDevelopmentEnvironmentStore.getState().setWslDevelopmentEnvironmentError('WSL failed');
    expect(useWslDevelopmentEnvironmentStore.getState()).toMatchObject({
      errorMessage: 'WSL failed',
      status: 'error',
    });

    useWslDevelopmentEnvironmentStore.getState().setWslDevelopmentEnvironmentStatus('idle');
    expect(useWslDevelopmentEnvironmentStore.getState()).toMatchObject({
      errorMessage: null,
      status: 'idle',
    });
  });

  it('falls back to Ubuntu 22.04 for invalid distro values', () => {
    useWslDevelopmentEnvironmentStore.getState().setWslUbuntuDistro('custom' as never);

    expect(useWslDevelopmentEnvironmentStore.getState().ubuntuDistro).toBe('Ubuntu-22.04');
  });
});
