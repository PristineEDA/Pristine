export const PRISTINE_WSL_DISTRO_NAME = 'pristine-eda-env';

export const wslUbuntuDistroOptions = ['Ubuntu-22.04', 'Ubuntu-24.04'] as const;

export type WslUbuntuDistro = typeof wslUbuntuDistroOptions[number];

export type WslEnvironmentState = 'not-installed' | 'stopped' | 'running' | 'suspended' | 'unknown';

export interface WslEnvironmentStatus {
  distroName: typeof PRISTINE_WSL_DISTRO_NAME;
  installed: boolean;
  state: WslEnvironmentState;
}

export interface WslStartInput {
  ubuntuDistro: WslUbuntuDistro;
}

export interface WslStartResult {
  ok: boolean;
  distroName: typeof PRISTINE_WSL_DISTRO_NAME;
  installed: boolean;
  status: WslEnvironmentStatus;
  error?: string;
}

export interface WslStopResult {
  ok: boolean;
  distroName: typeof PRISTINE_WSL_DISTRO_NAME;
  status: WslEnvironmentStatus;
  error?: string;
}

export function parseWslUbuntuDistro(value: unknown): WslUbuntuDistro {
  return value === 'Ubuntu-24.04' ? 'Ubuntu-24.04' : 'Ubuntu-22.04';
}
