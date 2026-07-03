import { beforeEach, describe, expect, it } from 'vitest';
import { resetProjectDialogStoreForTests, useProjectDialogStore } from './useProjectDialogStore';

describe('useProjectDialogStore', () => {
  beforeEach(() => {
    resetProjectDialogStoreForTests();
  });

  it('starts with the create project dialog closed', () => {
    expect(useProjectDialogStore.getState().createProjectDialogOpen).toBe(false);
  });

  it('opens and updates the create project dialog state', () => {
    useProjectDialogStore.getState().openCreateProjectDialog();
    expect(useProjectDialogStore.getState().createProjectDialogOpen).toBe(true);

    useProjectDialogStore.getState().setCreateProjectDialogOpen(false);
    expect(useProjectDialogStore.getState().createProjectDialogOpen).toBe(false);

    useProjectDialogStore.getState().setCreateProjectDialogOpen(true);
    expect(useProjectDialogStore.getState().createProjectDialogOpen).toBe(true);
  });

  it('resets the dialog state for isolated tests', () => {
    useProjectDialogStore.getState().openCreateProjectDialog();

    resetProjectDialogStoreForTests();

    expect(useProjectDialogStore.getState().createProjectDialogOpen).toBe(false);
  });
});
