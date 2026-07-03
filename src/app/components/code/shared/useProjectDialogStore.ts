import { create } from 'zustand';

interface ProjectDialogStore {
  createProjectDialogOpen: boolean;
  openCreateProjectDialog: () => void;
  setCreateProjectDialogOpen: (open: boolean) => void;
}

export const useProjectDialogStore = create<ProjectDialogStore>((set) => ({
  createProjectDialogOpen: false,
  openCreateProjectDialog: () => set({ createProjectDialogOpen: true }),
  setCreateProjectDialogOpen: (open) => set({ createProjectDialogOpen: open }),
}));

export function resetProjectDialogStoreForTests() {
  useProjectDialogStore.setState({ createProjectDialogOpen: false });
}
