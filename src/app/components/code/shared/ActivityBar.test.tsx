import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  CodeViewerLayoutProvider,
  WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY,
  type CodeViewerLayoutMode,
} from '../../../context/CodeViewerLayoutContext';
import { ActivityBar } from './ActivityBar';
import { SidebarProvider } from '../../ui/sidebar';

function renderActivityBar({
  activeView = 'explorer',
  canConfigureProject = false,
  canRunDevelopmentEnvironment = false,
  isDevelopmentEnvironmentActive = false,
  onItemSelect = vi.fn(),
  onProjectConfigure = vi.fn(),
  onRunAction = vi.fn(),
  defaultOpen = false,
  layoutMode = 'compact',
}: {
  activeView?: string;
  canConfigureProject?: boolean;
  canRunDevelopmentEnvironment?: boolean;
  isDevelopmentEnvironmentActive?: boolean;
  onItemSelect?: (view: string) => void;
  onProjectConfigure?: () => void;
  onRunAction?: () => void;
  defaultOpen?: boolean;
  layoutMode?: CodeViewerLayoutMode;
} = {}) {
  vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) =>
    key === WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY ? layoutMode : null,
  );

  return render(
    <CodeViewerLayoutProvider>
      <SidebarProvider defaultOpen={defaultOpen} keyboardShortcut={false}>
        <ActivityBar
          activeView={activeView}
          canConfigureProject={canConfigureProject}
          canRunDevelopmentEnvironment={canRunDevelopmentEnvironment}
          isDevelopmentEnvironmentActive={isDevelopmentEnvironmentActive}
          onItemSelect={onItemSelect}
          onProjectConfigure={onProjectConfigure}
          onRunAction={onRunAction}
        />
      </SidebarProvider>
    </CodeViewerLayoutProvider>,
  );
}

function getActivityBarContainer() {
  return screen.getByTestId('activity-bar');
}

describe('ActivityBar', () => {
  it('renders configure and run action buttons and removes settings', () => {
    renderActivityBar();

    const buttons = [
      screen.getByTestId('activity-action-configure'),
      screen.getByTestId('activity-action-run'),
    ];

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Configure', 'Run']);
    expect(screen.queryByTestId('activity-action-debug-action')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simulation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Extensions' })).not.toBeInTheDocument();
  });

  it('does not apply pressed state or call the shared navigation handler when configure and run are clicked', async () => {
    const user = userEvent.setup();
    const onItemSelect = vi.fn();
    const onProjectConfigure = vi.fn();
    const onRunAction = vi.fn();

    renderActivityBar({ canConfigureProject: true, canRunDevelopmentEnvironment: true, onItemSelect, onProjectConfigure, onRunAction });

    const configureButton = screen.getByTestId('activity-action-configure');
    const runButton = screen.getByTestId('activity-action-run');

    expect(configureButton).not.toHaveAttribute('aria-pressed');
    expect(runButton).not.toHaveAttribute('aria-pressed');

    await user.click(configureButton);
    await user.click(runButton);

    expect(configureButton).not.toHaveAttribute('aria-pressed');
    expect(runButton).not.toHaveAttribute('aria-pressed');
    expect(onItemSelect).not.toHaveBeenCalled();
    expect(onProjectConfigure).toHaveBeenCalledTimes(1);
    expect(onRunAction).toHaveBeenCalledTimes(1);
  });

  it('disables configure while no project is open', async () => {
    const user = userEvent.setup();
    const onProjectConfigure = vi.fn();

    renderActivityBar({ canConfigureProject: false, onProjectConfigure });

    const configureButton = screen.getByTestId('activity-action-configure');
    expect(configureButton).toBeDisabled();

    await user.click(configureButton);

    expect(onProjectConfigure).not.toHaveBeenCalled();
  });

  it('disables run while no project is open', async () => {
    const user = userEvent.setup();
    const onRunAction = vi.fn();

    renderActivityBar({ canRunDevelopmentEnvironment: false, onRunAction });

    const runButton = screen.getByTestId('activity-action-run');
    expect(runButton).toBeDisabled();

    await user.click(runButton);

    expect(onRunAction).not.toHaveBeenCalled();
  });

  it('shows pause semantics while the development environment is active', () => {
    renderActivityBar({
      canRunDevelopmentEnvironment: true,
      defaultOpen: true,
      isDevelopmentEnvironmentActive: true,
    });

    expect(screen.getByTestId('activity-action-run')).toHaveAttribute('aria-label', 'Pause');
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('forwards clicked item ids to the shared selection handler', async () => {
    const user = userEvent.setup();
    const onItemSelect = vi.fn();

    renderActivityBar({ onItemSelect });

    await user.click(screen.getByTestId('activity-item-simulation'));
    await user.click(screen.getByTestId('activity-item-explorer'));

    expect(onItemSelect).toHaveBeenNthCalledWith(1, 'simulation');
    expect(onItemSelect).toHaveBeenNthCalledWith(2, 'explorer');
  });

  it('forwards the id for collapsible top-level items to the shared selection handler', async () => {
    const user = userEvent.setup();
    const onItemSelect = vi.fn();

    renderActivityBar({ onItemSelect });

    await user.click(screen.getByTestId('activity-item-physical'));

    expect(onItemSelect).toHaveBeenCalledWith('physical');
  });

  it('uses the selected button style for the active item', () => {
    renderActivityBar();

    const explorerButton = screen.getByTestId('activity-item-explorer');

    expect(explorerButton).toHaveAttribute('data-active', 'true');
    expect(explorerButton).toHaveClass(
      'rounded-md',
      'data-[active=true]:bg-sidebar-accent',
      'data-[active=true]:text-sidebar-accent-foreground',
    );
  });

  it('keeps the compact activity bar right border and pointer cursor affordances', () => {
    renderActivityBar();

    expect(getActivityBarContainer()).toHaveClass('group-data-[side=left]:border-r');
    expect(screen.getByTestId('activity-item-explorer')).toHaveClass('cursor-pointer');
    expect(screen.getByTestId('activity-item-simulation')).toHaveClass('hover:bg-sidebar-accent');
    expect(screen.getByTestId('activity-action-configure')).toHaveClass('hover:cursor-pointer', 'hover:bg-sidebar-accent');
  });

  it('removes the activity bar side border in minimal layout', () => {
    renderActivityBar({ layoutMode: 'minimal' });

    expect(screen.getByTestId('activity-bar')).toHaveAttribute('data-code-viewer-layout-mode', 'minimal');
    expect(getActivityBarContainer()).not.toHaveClass('group-data-[side=left]:border-r');
  });

  it('renders shadcn tooltip content for navigation and action buttons on hover', async () => {
    const user = userEvent.setup();

    renderActivityBar();

    await user.hover(screen.getByTestId('activity-item-explorer'));
    expect(await screen.findByRole('tooltip', { name: 'Editor' })).toBeInTheDocument();
  });

  it('keeps labels hidden while collapsed and shows them when expanded', () => {
    const { unmount } = renderActivityBar({ defaultOpen: false });

    expect(screen.queryByText('Configure')).not.toBeInTheDocument();
    expect(screen.queryByText('Run')).not.toBeInTheDocument();
    expect(screen.getByText('Physical')).toBeInTheDocument();

    unmount();
    renderActivityBar({ defaultOpen: true });

    expect(screen.getByText('Physical')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Run')).toBeInTheDocument();
  });
});
