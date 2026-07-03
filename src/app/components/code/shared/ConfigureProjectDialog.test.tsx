import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectState } from '../../../../../types/project';
import { ConfigureProjectDialog } from './ConfigureProjectDialog';
import {
  resetProjectConfigureStoreForTests,
  useProjectConfigureStore,
} from './useProjectConfigureStore';

function createProjectState(config: ProjectState['config'] = {
  mgnt: 'none',
  mode: 'rtl2gds',
  padframe: 'QFN32',
  process: 'ics55',
  type: 'retroSoC',
}): ProjectState {
  return {
    config,
    name: 'chip_lab',
    rootPath: 'C:\\Projects\\chip_lab',
    session: null,
  };
}

function renderConfigureProjectDialog(currentProject: ProjectState | null = createProjectState()) {
  render(<ConfigureProjectDialog currentProject={currentProject} />);
}

describe('ConfigureProjectDialog', () => {
  beforeEach(() => {
    resetProjectConfigureStoreForTests();
    vi.mocked(window.electronAPI!.project.updateProjectConfig).mockReset();
    vi.mocked(window.electronAPI!.project.updateProjectConfig).mockResolvedValue({
      project: createProjectState(),
    });
  });

  it('opens with current project metadata and editable config fields', () => {
    useProjectConfigureStore.getState().openProjectConfigure({
      mgnt: 'item1',
      mode: 'rtl',
      padframe: 'QFN88',
      process: 'ihp130',
      type: 'ysyxSoC',
    });

    renderConfigureProjectDialog(createProjectState({
      mgnt: 'item1',
      mode: 'rtl',
      padframe: 'QFN88',
      process: 'ihp130',
      type: 'ysyxSoC',
    }));

    expect(screen.getByTestId('configure-project-dialog')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Configure Project' })).toBeInTheDocument();
    expect(screen.getByTestId('configure-project-name')).toHaveTextContent('chip_lab');
    expect(screen.getByTestId('configure-project-root')).toHaveTextContent('C:\\Projects\\chip_lab');
    expect(screen.getByTestId('configure-project-mode')).toHaveTextContent('rtl');
    expect(screen.getByTestId('configure-project-process')).toHaveTextContent('ihp130');
    expect(screen.getByTestId('configure-project-type')).toHaveTextContent('ysyxSoC');
    expect(screen.getByTestId('configure-project-mgnt')).toHaveTextContent('item1');
    expect(screen.getByTestId('configure-project-padframe')).toHaveTextContent('QFN88');
  });

  it('saves config updates through the project API and closes', async () => {
    const user = userEvent.setup();
    useProjectConfigureStore.getState().openProjectConfigure(createProjectState().config);
    renderConfigureProjectDialog();

    await user.click(screen.getByTestId('configure-project-process'));
    await user.click(screen.getByRole('option', { name: 'gf180' }));
    await user.click(screen.getByTestId('configure-project-padframe'));
    await user.click(screen.getByRole('option', { name: 'QFN128' }));
    await user.click(screen.getByTestId('configure-project-submit'));

    expect(window.electronAPI!.project.updateProjectConfig).toHaveBeenCalledWith({
      mgnt: 'none',
      mode: 'rtl2gds',
      padframe: 'QFN128',
      process: 'gf180',
      type: 'retroSoC',
    });
    expect(useProjectConfigureStore.getState().isOpen).toBe(false);
  });

  it('keeps the dialog open and shows errors when save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI!.project.updateProjectConfig).mockRejectedValueOnce(new Error('No project is currently open.'));
    useProjectConfigureStore.getState().openProjectConfigure(createProjectState().config);
    renderConfigureProjectDialog();

    await user.click(screen.getByTestId('configure-project-submit'));

    expect(screen.getByTestId('configure-project-error')).toHaveTextContent('No project is currently open.');
    expect(useProjectConfigureStore.getState().isOpen).toBe(true);
  });

  it('discards draft edits on cancel', async () => {
    const user = userEvent.setup();
    useProjectConfigureStore.getState().openProjectConfigure(createProjectState().config);
    renderConfigureProjectDialog();

    await user.click(screen.getByTestId('configure-project-process'));
    await user.click(screen.getByRole('option', { name: 'sky130' }));
    await user.click(screen.getByTestId('configure-project-cancel'));

    expect(useProjectConfigureStore.getState()).toMatchObject({
      draft: createProjectState().config,
      isOpen: false,
    });
    expect(window.electronAPI!.project.updateProjectConfig).not.toHaveBeenCalled();
  });

  it('disables saving without an open project', () => {
    useProjectConfigureStore.getState().openProjectConfigure(createProjectState().config);
    renderConfigureProjectDialog(null);

    expect(screen.getByTestId('configure-project-submit')).toBeDisabled();
    expect(screen.getByTestId('configure-project-name')).toHaveTextContent('No project');
  });
});
