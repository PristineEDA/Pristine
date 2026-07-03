import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  CreateProjectDialog,
  projectManagementOptions,
  projectModeOptions,
  projectPadframeOptions,
  projectProcessOptions,
  projectTypeOptions,
} from './CreateProjectDialog';

function renderCreateProjectDialog(onOpenChange = vi.fn()) {
  render(
    <CreateProjectDialog
      open
      onOpenChange={onOpenChange}
    />,
  );

  return onOpenChange;
}

describe('CreateProjectDialog', () => {
  it('renders project fields in the requested order with default values', () => {
    renderCreateProjectDialog();

    expect(screen.getByTestId('create-project-dialog')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'New Project' })).toBeInTheDocument();

    const form = screen.getByTestId('create-project-form');
    const labels = within(form).getAllByText(/^(name|path|mode|process|type|mgnt|padframe)$/)
      .map((label) => label.textContent);

    expect(labels).toEqual(['name', 'path', 'mode', 'process', 'type', 'mgnt', 'padframe']);
    expect(screen.getByTestId('create-project-mode')).toHaveTextContent('rtl2gds');
    expect(screen.getByTestId('create-project-process')).toHaveTextContent('ics55');
    expect(screen.getByTestId('create-project-type')).toHaveTextContent('retroSoC');
    expect(screen.getByTestId('create-project-mgnt')).toHaveTextContent('none');
    expect(screen.getByTestId('create-project-padframe')).toHaveTextContent('QFN32');
  });

  it('defines all project select options', () => {
    renderCreateProjectDialog();

    expect([...projectModeOptions]).toEqual(['rtl2gds', 'rtl']);
    expect([...projectProcessOptions]).toEqual(['ics55', 'ihp130', 'sky130', 'gf180']);
    expect([...projectTypeOptions]).toEqual(['retroSoC', 'ysyxSoC', 'Custom']);
    expect([...projectManagementOptions]).toEqual(['none', 'item1', 'item2']);
    expect([...projectPadframeOptions]).toEqual(['QFN32', 'QFN64', 'QFN88', 'QFN128']);
  });

  it('uses the same opaque dialog background as settings', () => {
    renderCreateProjectDialog();

    expect(screen.getByTestId('create-project-dialog')).toHaveClass('bg-ide-bg');
    expect(screen.getByTestId('create-project-dialog')).not.toHaveClass('bg-ide-panel');
    expect(screen.getByTestId('create-project-name-wrapper')).toHaveClass('bg-ide-tab-bg');
    expect(screen.getByTestId('create-project-mode')).toHaveClass('bg-ide-tab-bg');
  });

  it('matches settings input chrome for name and path fields', () => {
    renderCreateProjectDialog();

    expect(screen.getByTestId('create-project-name')).toHaveAttribute('placeholder', 'Project name');
    expect(screen.getByTestId('create-project-path')).toHaveAttribute('placeholder', 'Select a project directory');
    expect(screen.getByTestId('create-project-name-wrapper')).toHaveClass(
      'rounded-md',
      'border',
      'border-ide-border',
      'bg-ide-tab-bg',
      'transition-colors',
      'focus-within:border-ide-accent',
    );
    expect(screen.getByTestId('create-project-path-wrapper')).toHaveClass(
      'rounded-md',
      'border',
      'border-ide-border',
      'bg-ide-tab-bg',
      'transition-colors',
      'focus-within:border-ide-accent',
    );
    expect(screen.getByTestId('create-project-name')).toHaveClass(
      'bg-transparent',
      'pristine-command-search-input',
      'placeholder:text-ide-text-muted',
    );
    expect(screen.getByTestId('create-project-path')).toHaveClass(
      'bg-transparent',
      'pristine-command-search-input',
      'placeholder:text-ide-text-muted',
    );
    expect(screen.getByTestId('create-project-name')).toHaveStyle({
      caretColor: 'var(--ide-text)',
      color: 'var(--ide-text)',
      WebkitTextFillColor: 'var(--ide-text)',
    });
    expect(screen.getByTestId('create-project-path')).toHaveStyle({
      caretColor: 'var(--ide-text)',
      color: 'var(--ide-text)',
      WebkitTextFillColor: 'var(--ide-text)',
    });
    expect(screen.getByTestId('create-project-name')).not.toHaveClass('focus-visible:ring-[3px]');
    expect(screen.getByTestId('create-project-path')).not.toHaveClass('focus-visible:ring-[3px]');
  });

  it('updates the path input from the project directory picker', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI!.dialog.showOpenProjectDirectoryDialog).mockResolvedValueOnce({
      canceled: false,
      filePath: 'C:\\Users\\maksy\\Projects\\chip-lab',
    });

    renderCreateProjectDialog();

    await user.click(screen.getByTestId('create-project-browse'));

    expect(window.electronAPI!.dialog.showOpenProjectDirectoryDialog).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('create-project-path')).toHaveValue('C:\\Users\\maksy\\Projects\\chip-lab');
  });

  it('closes through Cancel without creating files', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderCreateProjectDialog();

    await user.click(screen.getByTestId('create-project-cancel'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.electronAPI!.fs.createDirectory).not.toHaveBeenCalled();
    expect(window.electronAPI!.fs.writeFile).not.toHaveBeenCalled();
  });

  it('submits through the project API and closes on success', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderCreateProjectDialog();

    vi.mocked(window.electronAPI!.project.createProject).mockResolvedValueOnce({
      project: {
        config: {
          mgnt: 'none',
          mode: 'rtl2gds',
          padframe: 'QFN32',
          process: 'ics55',
          type: 'retroSoC',
        },
        name: 'Project name',
        rootPath: 'C:\\Projects\\Project name',
        session: null,
      },
    });

    await user.type(screen.getByTestId('create-project-name'), 'Project name');
    await user.type(screen.getByTestId('create-project-path'), 'C:\\Projects');
    await user.click(screen.getByTestId('create-project-submit'));

    expect(window.electronAPI!.project.createProject).toHaveBeenCalledWith({
      mgnt: 'none',
      mode: 'rtl2gds',
      name: 'Project name',
      padframe: 'QFN32',
      path: 'C:\\Projects',
      process: 'ics55',
      type: 'retroSoC',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.electronAPI!.fs.createDirectory).not.toHaveBeenCalled();
    expect(window.electronAPI!.fs.writeFile).not.toHaveBeenCalled();
  });

  it('shows project API failures without closing the dialog', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderCreateProjectDialog();

    vi.mocked(window.electronAPI!.project.createProject).mockRejectedValueOnce(new Error('Project already exists'));

    await user.type(screen.getByTestId('create-project-name'), 'Project name');
    await user.type(screen.getByTestId('create-project-path'), 'C:\\Projects');
    await user.click(screen.getByTestId('create-project-submit'));

    expect(screen.getByTestId('create-project-error')).toHaveTextContent('Project already exists');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
