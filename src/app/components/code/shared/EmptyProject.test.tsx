import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyProject } from './EmptyProject';

describe('EmptyProject', () => {
  it('defaults to the info tab and shows the existing empty project content', () => {
    render(<EmptyProject />);

    expect(screen.getByTestId('empty-project-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('empty-project-tabs')).toHaveClass('right-2');
    expect(screen.getByTestId('empty-project-tab-info')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('empty-project-info-panel')).toBeInTheDocument();
    expect(screen.getByText('No Projects Yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Project' })).toBeInTheDocument();
  });

  it('switches to the image and summary tabs', async () => {
    const user = userEvent.setup();
    render(<EmptyProject />);

    await user.click(screen.getByTestId('empty-project-tab-image'));
    expect(screen.getByTestId('empty-project-tab-image')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('empty-project-image-panel')).toBeInTheDocument();
    expect(screen.getByTestId('empty-project-image')).toHaveAttribute('src', './generated/empty-wallpaper.png');
    expect(screen.getByAltText('Empty project preview')).toBeInTheDocument();

    await user.click(screen.getByTestId('empty-project-tab-summary'));
    expect(screen.getByTestId('empty-project-tab-summary')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('empty-project-summary-panel')).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('calls project action callbacks from the info tab buttons', async () => {
    const user = userEvent.setup();
    const handleCreateProject = vi.fn();
    const handleOpenProject = vi.fn();

    render(<EmptyProject onCreateProject={handleCreateProject} onOpenProject={handleOpenProject} />);

    await user.click(screen.getByTestId('empty-project-create-project'));
    await user.click(screen.getByTestId('empty-project-open-project'));

    expect(handleCreateProject).toHaveBeenCalledTimes(1);
    expect(handleOpenProject).toHaveBeenCalledTimes(1);
  });

  it('keeps the image panel visible when the wallpaper is unavailable', async () => {
    const user = userEvent.setup();
    render(<EmptyProject />);

    await user.click(screen.getByTestId('empty-project-tab-image'));
    fireEvent.error(screen.getByTestId('empty-project-image'));

    expect(screen.getByTestId('empty-project-image-fallback')).toHaveClass('opacity-100');
    expect(screen.queryByTestId('empty-project-image')).not.toBeInTheDocument();
  });
});
