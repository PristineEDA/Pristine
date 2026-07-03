import { create } from 'zustand';
import { parseWslUbuntuDistro, type WslUbuntuDistro } from '../../../types/wsl';

export const WSL_TERMINAL_SESSION_KEY = 'wsl-pristine-eda-env';

export type WslDevelopmentEnvironmentStatus =
  | 'idle'
  | 'checking'
  | 'installing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

interface WslDevelopmentEnvironmentState {
  errorMessage: string | null;
  status: WslDevelopmentEnvironmentStatus;
  terminalSessionKey: typeof WSL_TERMINAL_SESSION_KEY;
  ubuntuDistro: WslUbuntuDistro;
}

interface WslDevelopmentEnvironmentActions {
  resetWslDevelopmentEnvironment: () => void;
  setWslDevelopmentEnvironmentError: (message: string) => void;
  setWslDevelopmentEnvironmentStatus: (status: WslDevelopmentEnvironmentStatus) => void;
  setWslUbuntuDistro: (distro: WslUbuntuDistro) => void;
}

export type WslDevelopmentEnvironmentStore = WslDevelopmentEnvironmentState & WslDevelopmentEnvironmentActions;

function createDefaultWslDevelopmentEnvironmentState(): WslDevelopmentEnvironmentState {
  return {
    errorMessage: null,
    status: 'idle',
    terminalSessionKey: WSL_TERMINAL_SESSION_KEY,
    ubuntuDistro: 'Ubuntu-22.04',
  };
}

export const useWslDevelopmentEnvironmentStore = create<WslDevelopmentEnvironmentStore>((set) => ({
  ...createDefaultWslDevelopmentEnvironmentState(),

  resetWslDevelopmentEnvironment: () => {
    set(createDefaultWslDevelopmentEnvironmentState());
  },

  setWslDevelopmentEnvironmentError: (message) => {
    set({ errorMessage: message, status: 'error' });
  },

  setWslDevelopmentEnvironmentStatus: (status) => {
    set({ errorMessage: null, status });
  },

  setWslUbuntuDistro: (distro) => {
    set({ ubuntuDistro: parseWslUbuntuDistro(distro) });
  },
}));

export function resetWslDevelopmentEnvironmentStoreForTests(): void {
  useWslDevelopmentEnvironmentStore.setState(createDefaultWslDevelopmentEnvironmentState());
}
