import { create } from 'zustand';
import type { ProjectConfig } from '../../../../../types/project';
import { defaultProjectConfigDraft, type ProjectConfigDraft } from './ProjectConfigForm';

interface ProjectConfigureState {
  draft: ProjectConfigDraft;
  errorMessage: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
}

interface ProjectConfigureActions {
  closeProjectConfigure: () => void;
  openProjectConfigure: (config: ProjectConfig) => void;
  resetProjectConfigureStoreForTests: () => void;
  setDraft: (draft: ProjectConfigDraft) => void;
  setErrorMessage: (message: string | null) => void;
  setSubmitting: (isSubmitting: boolean) => void;
}

export type ProjectConfigureStore = ProjectConfigureState & ProjectConfigureActions;

function createDefaultProjectConfigureState(): ProjectConfigureState {
  return {
    draft: { ...defaultProjectConfigDraft },
    errorMessage: null,
    isOpen: false,
    isSubmitting: false,
  };
}

function toProjectConfigDraft(config: ProjectConfig): ProjectConfigDraft {
  return {
    mode: config.mode,
    process: config.process,
    type: config.type,
    mgnt: config.mgnt,
    padframe: config.padframe,
  };
}

export const useProjectConfigureStore = create<ProjectConfigureStore>((set) => ({
  ...createDefaultProjectConfigureState(),

  closeProjectConfigure: () => {
    set(createDefaultProjectConfigureState());
  },

  openProjectConfigure: (config) => {
    set({
      draft: toProjectConfigDraft(config),
      errorMessage: null,
      isOpen: true,
      isSubmitting: false,
    });
  },

  resetProjectConfigureStoreForTests: () => {
    set(createDefaultProjectConfigureState());
  },

  setDraft: (draft) => {
    set({ draft });
  },

  setErrorMessage: (message) => {
    set({ errorMessage: message });
  },

  setSubmitting: (isSubmitting) => {
    set({ isSubmitting });
  },
}));

export function resetProjectConfigureStoreForTests(): void {
  useProjectConfigureStore.getState().resetProjectConfigureStoreForTests();
}
