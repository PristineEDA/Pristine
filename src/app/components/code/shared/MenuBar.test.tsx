import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { openSourceAttributionSections } from '../../../about/attributions';
import {
  MenuBarTestHarness,
  clickByTestId,
  clickByText,
  hasNormalizedTextContent,
  lockApplicationMenuBar,
  mockPersistedSettingsConfig,
  openAccountPageMock,
  redoActionRun,
  renderMenuBar,
  renderMenuBarWithControls,
  signOutMock,
  syncCloudConfigMock,
  toggleThemeMock,
  undoActionRun,
  userMockState,
} from './MenuBar.testSupport';

describe('MenuBar', () => {
  it('renders the compact menu chrome with a bottom border separator', () => {
    mockPersistedSettingsConfig({ codeViewerLayoutMode: 'compact' });

    renderMenuBar();

    expect(screen.getByTestId('menu-bar-root')).toHaveClass('border-b', 'border-ide-border');
  });

  it('keeps the minimal menu chrome borderless', () => {
    mockPersistedSettingsConfig({ codeViewerLayoutMode: 'minimal' });

    renderMenuBar();

    expect(screen.getByTestId('menu-bar-root')).not.toHaveClass('border-b');
    expect(screen.getByTestId('menu-bar-root')).not.toHaveClass('border-ide-border');
  });

  it('renders the window-local Pristine app logo image', () => {
    renderMenuBar();

    const appIcon = screen.getByTestId('menu-app-icon');
    const logo = screen.getByTestId('menu-app-logo-image');

    expect(appIcon).toContainElement(logo);
    expect(logo).toHaveAttribute('alt', 'Pristine');
    expect(logo).toHaveAttribute('draggable', 'false');
    expect(logo).toHaveAttribute('src', './generated/logo/logo-32.png');
    expect(appIcon).not.toHaveTextContent('P');
  });

  it('calls electron window controls directly', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await clickByTestId(user, 'window-control-minimize');
    await clickByTestId(user, 'window-control-maximize');
    await clickByTestId(user, 'window-control-close');

    expect(window.electronAPI?.minimize).toHaveBeenCalledTimes(1);
    expect(window.electronAPI?.maximize).toHaveBeenCalledTimes(1);
    expect(window.electronAPI?.close).toHaveBeenCalledTimes(1);
  });

  it('shows the maximize icon while the window is not maximized', () => {
    renderMenuBar();

    const maximizeControl = screen.getByTestId('window-control-maximize');

    expect(maximizeControl).toHaveAttribute('aria-label', 'Maximize Window');
    expect(maximizeControl).toHaveAttribute('title', 'Maximize Window');
    expect(maximizeControl.querySelector('.lucide-square')).toBeInTheDocument();
    expect(maximizeControl.querySelector('.lucide-copy')).not.toBeInTheDocument();
  });

  it('shows the restore icon while the window is maximized', () => {
    vi.mocked(window.electronAPI!.isMaximized).mockReturnValue(true);

    renderMenuBar();

    const maximizeControl = screen.getByTestId('window-control-maximize');

    expect(maximizeControl).toHaveAttribute('aria-label', 'Restore Window');
    expect(maximizeControl).toHaveAttribute('title', 'Restore Window');
    expect(maximizeControl.querySelector('.lucide-copy')).toBeInTheDocument();
    expect(maximizeControl.querySelector('.lucide-square')).not.toBeInTheDocument();
  });

  it('updates the maximize control icon when the native maximized state changes', () => {
    let maximizedListener: ((maximized: boolean) => void) | undefined;
    const dispose = vi.fn();
    vi.mocked(window.electronAPI!.onMaximizedChange).mockImplementation((callback: (maximized: boolean) => void) => {
      maximizedListener = callback;
      return dispose;
    });

    const { unmount } = renderMenuBar();
    const maximizeControl = screen.getByTestId('window-control-maximize');

    expect(maximizeControl).toHaveAttribute('aria-label', 'Maximize Window');
    expect(maximizeControl.querySelector('.lucide-square')).toBeInTheDocument();

    act(() => {
      maximizedListener?.(true);
    });

    expect(maximizeControl).toHaveAttribute('aria-label', 'Restore Window');
    expect(maximizeControl.querySelector('.lucide-copy')).toBeInTheDocument();

    act(() => {
      maximizedListener?.(false);
    });

    expect(maximizeControl).toHaveAttribute('aria-label', 'Maximize Window');
    expect(maximizeControl.querySelector('.lucide-square')).toBeInTheDocument();

    unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the close window icon neutral until hover', () => {
    mockPersistedSettingsConfig({ codeViewerLayoutMode: 'compact' });

    renderMenuBar();

    const closeControl = screen.getByTestId('window-control-close');

    expect(closeControl).toHaveClass('text-ide-text-muted', 'hover:bg-ide-close', 'hover:text-primary-foreground');
    expect(closeControl).not.toHaveClass('text-ide-close');
  });

  it('keeps the close window icon neutral in minimal layout until hover', () => {
    mockPersistedSettingsConfig({ codeViewerLayoutMode: 'minimal' });

    renderMenuBar();

    const closeControl = screen.getByTestId('window-control-close');

    expect(closeControl).toHaveClass('text-ide-unified-chrome-fg/80', 'hover:bg-ide-close', 'hover:text-primary-foreground');
    expect(closeControl).not.toHaveClass('text-ide-close');
  });

  it('expands the application menu on hover and collapses after leaving when unlocked', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    const toggle = screen.getByTestId('menu-menubar-toggle');
    const shell = screen.getByTestId('menu-menubar-shell');

    expect(shell).toHaveAttribute('data-expanded', 'false');
    expect(shell).toHaveAttribute('data-locked', 'false');
    expect(screen.queryByText('File')).not.toBeInTheDocument();

    await user.hover(toggle);

    expect(shell).toHaveAttribute('data-expanded', 'true');
    expect(await screen.findByText('File')).toBeVisible();

    await user.unhover(toggle);

    expect(shell).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByText('File')).not.toBeInTheDocument();
  });

  it('expands the application menu when the pointer enters the toggle directly', async () => {
    renderMenuBar();

    const collapsible = screen.getByTestId('menu-menubar-collapsible');
    const toggle = screen.getByTestId('menu-menubar-toggle');
    const shell = screen.getByTestId('menu-menubar-shell');

    expect(shell).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByText('File')).not.toBeInTheDocument();

    fireEvent.pointerEnter(toggle);

    expect(shell).toHaveAttribute('data-expanded', 'true');
    expect(await screen.findByText('File')).toBeVisible();

    fireEvent.pointerLeave(collapsible);

    expect(shell).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByText('File')).not.toBeInTheDocument();
  });

  it('locks the application menu open when toggled and collapses again after unlocking', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    const toggle = screen.getByTestId('menu-menubar-toggle');
    const shell = screen.getByTestId('menu-menubar-shell');
    const themeToggle = screen.getByTestId('toggle-theme');

    await user.click(toggle);

    expect(shell).toHaveAttribute('data-locked', 'true');
    expect(shell).toHaveAttribute('data-expanded', 'true');
    expect(await screen.findByText('Help')).toBeVisible();

    await user.hover(themeToggle);
    expect(shell).toHaveAttribute('data-expanded', 'true');

    await user.click(toggle);
    expect(shell).toHaveAttribute('data-locked', 'false');

    await user.hover(themeToggle);

    expect(shell).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
  });

  it('renders Ctrl-based menu shortcuts on non-macOS platforms', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await lockApplicationMenuBar(user);
    await user.click(screen.getByText('File'));

    expect(await screen.findByText(hasNormalizedTextContent('New ProjectCtrl+Shift+N'))).toBeInTheDocument();
    expect(screen.getByText(hasNormalizedTextContent('SaveCtrl+S'))).toBeInTheDocument();
    expect(screen.getByText(hasNormalizedTextContent('Save As...Ctrl+Shift+S'))).toBeInTheDocument();
    expect(screen.getByText(hasNormalizedTextContent('CloseCtrl+Q'))).toBeInTheDocument();
  });

  it('hides the window-local app icon, menu items, and trailing avatar separator on macOS', () => {
    window.electronAPI!.platform = 'darwin';

    renderMenuBar();

    expect(screen.getByTestId('macos-traffic-light-clearance')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-app-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-menubar')).not.toBeInTheDocument();
    expect(screen.queryByText('File')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-avatar-separator')).not.toBeInTheDocument();
    expect(screen.getByTestId('toggle-theme')).toBeInTheDocument();
    expect(screen.getByTestId('menu-settings-button')).toBeInTheDocument();
    expect(screen.getByTestId('user-avatar-button')).toBeInTheDocument();
  });

  it('opens sign-in and sign-up actions from the user account popover when signed out', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await user.click(screen.getByTestId('user-avatar-button'));
    expect(await screen.findByTestId('user-account-popover')).toBeInTheDocument();

    await user.click(screen.getByTestId('user-sign-in-button'));
    await user.click(screen.getByTestId('user-sign-up-button'));

    expect(openAccountPageMock).toHaveBeenNthCalledWith(1, 'login');
    expect(openAccountPageMock).toHaveBeenNthCalledWith(2, 'signup');
  });

  it('shows the signed-in account summary and sync actions in the user account popover', async () => {
    const user = userEvent.setup();

    userMockState.status = 'signed-in';
    userMockState.session = {
      avatarUrl: 'https://example.com/avatar.png',
      email: 'alice@example.com',
      syncedAt: '2026-04-18T12:00:00.000Z',
      userId: 'user-1',
      username: 'Alice Chen',
    };

    renderMenuBar();

    await user.click(screen.getByTestId('user-avatar-button'));

    expect(await screen.findByTestId('user-account-name')).toHaveTextContent('Alice Chen');
    expect(screen.getByTestId('user-account-email')).toHaveTextContent('alice@example.com');
    expect(screen.getByTestId('user-account-sync-status')).toHaveTextContent('Synced');

    await user.click(screen.getByTestId('user-sync-config-button'));
    await user.click(screen.getByTestId('user-sign-out-button'));

    expect(syncCloudConfigMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('restores the signed-out placeholder avatar after signing out from a signed-in session', () => {
    userMockState.status = 'signed-in';
    userMockState.session = {
      avatarUrl: 'https://example.com/avatar.png',
      email: 'alice@example.com',
      syncedAt: '2026-04-18T12:00:00.000Z',
      userId: 'user-1',
      username: 'Alice Chen',
    };

    const view = renderMenuBar();

    expect(screen.getByTestId('user-avatar-button').querySelector('svg')).toBeNull();

    userMockState.status = 'signed-out';
    userMockState.session = null;
    view.rerender(
      <MenuBarTestHarness />,
    );

    expect(screen.getByTestId('user-avatar-button').querySelector('svg')).toBeInTheDocument();
  });

  it('keeps the activity bar trigger position on macOS maximize and only left-aligns it in full-screen', () => {
    let fullScreenListener: ((fullScreen: boolean) => void) | undefined;
    const dispose = vi.fn();

    window.electronAPI!.platform = 'darwin';
    vi.mocked(window.electronAPI!.isMaximized).mockReturnValue(true);
    vi.mocked(window.electronAPI!.onFullScreenChange).mockImplementation((callback: (fullScreen: boolean) => void) => {
      fullScreenListener = callback;
      return dispose;
    });

    const { unmount } = renderMenuBar();
    const trigger = screen.getByTestId('toggle-activity-bar');

    expect(screen.getByTestId('macos-traffic-light-clearance')).toBeInTheDocument();
    expect(trigger).toHaveClass('ml-1');
    expect(window.electronAPI!.onMaximizedChange).not.toHaveBeenCalled();

    act(() => {
      fullScreenListener?.(true);
    });

    expect(screen.queryByTestId('macos-traffic-light-clearance')).not.toBeInTheDocument();
    expect(trigger).toHaveClass('ml-2');
    expect(trigger).not.toHaveClass('ml-1');

    act(() => {
      fullScreenListener?.(false);
    });

    expect(screen.getByTestId('macos-traffic-light-clearance')).toBeInTheDocument();
    expect(trigger).toHaveClass('ml-1');

    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('opens About from the Help menu using the shared attribution data', async () => {
    const user = userEvent.setup();
    const firstAttributionSection = openSourceAttributionSections[0];
    const firstAttributionItem = openSourceAttributionSections[0]?.items[0];

    if (!firstAttributionSection || !firstAttributionItem) {
      throw new Error('Expected at least one attribution item');
    }

    renderMenuBar();

  await lockApplicationMenuBar(user);
    await user.click(screen.getByText('Help'));
    await user.click(await screen.findByText('About'));

    expect(await screen.findByTestId('about-dialog')).toBeVisible();

    for (const section of openSourceAttributionSections) {
      expect(screen.getByText(section.title)).toBeInTheDocument();
    }

    const firstAttributionRow = screen.getByTestId(
      `about-item-${firstAttributionSection.id}-${firstAttributionItem.id}`,
    );

    expect(firstAttributionRow).toHaveTextContent(firstAttributionItem.name);
    expect(firstAttributionRow).toHaveTextContent(firstAttributionItem.url);
    expect(firstAttributionRow).toHaveTextContent(firstAttributionItem.author);
  });

  it('opens New Project from the File menu with the default project configuration', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await lockApplicationMenuBar(user);
    await user.click(screen.getByText('File'));
    await user.click(await screen.findByText('New Project'));

    expect(await screen.findByTestId('create-project-dialog')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'New Project' })).toBeInTheDocument();
    expect(screen.getByTestId('create-project-mode')).toHaveTextContent('rtl2gds');
    expect(screen.getByTestId('create-project-process')).toHaveTextContent('ics55');
    expect(screen.getByTestId('create-project-type')).toHaveTextContent('retroSoC');
    expect(screen.getByTestId('create-project-mgnt')).toHaveTextContent('none');
    expect(screen.getByTestId('create-project-padframe')).toHaveTextContent('QFN32');
  });

  it('opens New Project from the platform project shortcut', () => {
    renderMenuBar();

    fireEvent.keyDown(window, {
      key: 'n',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(screen.getByTestId('create-project-dialog')).toBeVisible();
  });

  it('opens New Project from native menu commands on macOS', async () => {
    window.electronAPI!.platform = 'darwin';

    renderMenuBar();

    const menuCommandHandler = vi.mocked(window.electronAPI!.menu.onCommand).mock.calls[0]?.[0];
    await act(async () => {
      menuCommandHandler?.({ action: 'open-new-project' });
    });

    expect(await screen.findByTestId('create-project-dialog')).toBeVisible();
  });

  it('opens About from native menu commands on macOS', async () => {
    window.electronAPI!.platform = 'darwin';

    renderMenuBar();

    const menuCommandHandler = vi.mocked(window.electronAPI!.menu.onCommand).mock.calls[0]?.[0];
    await act(async () => {
      menuCommandHandler?.({ action: 'open-about' });
    });

    expect(await screen.findByTestId('about-dialog')).toBeVisible();
    expect(screen.getByText('Bundled Binaries & Extra Resources')).toBeInTheDocument();
  });

  it('reveals bundled notice files from the Help menu and About dialog', async () => {
    const user = userEvent.setup();

    renderMenuBar();

  await lockApplicationMenuBar(user);
    await user.click(screen.getByText('Help'));
    await user.click(await screen.findByText('Open Notice Files'));

    expect(window.electronAPI?.notices.revealBundledFiles).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText('Help'));
    await user.click(await screen.findByText('About'));
    await user.click(await screen.findByTestId('about-open-notice-files-button'));

    expect(window.electronAPI?.notices.revealBundledFiles).toHaveBeenCalledTimes(2);
  });

  it('reveals bundled notice files from native menu commands on macOS', async () => {
    window.electronAPI!.platform = 'darwin';

    renderMenuBar();

    const menuCommandHandler = vi.mocked(window.electronAPI!.menu.onCommand).mock.calls[0]?.[0];
    await act(async () => {
      menuCommandHandler?.({ action: 'open-notice-files' });
    });

    expect(window.electronAPI?.notices.revealBundledFiles).toHaveBeenCalledTimes(1);
  });

  it('routes save, undo, and redo through the shared workspace commands', async () => {
    const user = userEvent.setup();

    renderMenuBarWithControls();

    await clickByText(user, 'open-reg');
    await clickByText(user, 'edit-reg');
    await clickByText(user, 'register-editor');

  await lockApplicationMenuBar(user);
    await user.click(screen.getByText('File'));
    await user.click(await screen.findByText('Save'));
    await user.click(screen.getByText('Edit'));
    await user.click(await screen.findByText('Undo'));
    await user.click(screen.getByText('Edit'));
    await user.click(await screen.findByText('Redo'));

    expect(window.electronAPI?.fs.writeFile).toHaveBeenCalledWith('rtl/core/reg_file.v', 'module reg_file; logic dirty; endmodule');
    expect(undoActionRun).toHaveBeenCalledTimes(1);
    expect(redoActionRun).toHaveBeenCalledTimes(1);
  });

  it('routes Save All through the shared workspace command', async () => {
    const user = userEvent.setup();

    renderMenuBarWithControls();

    await clickByText(user, 'open-reg');
    await clickByText(user, 'edit-reg');
    await clickByText(user, 'open-alu');
    await clickByText(user, 'edit-alu');

    await lockApplicationMenuBar(user);
    await user.click(screen.getByText('File'));
    await user.click(await screen.findByText('Save All'));

    expect(window.electronAPI?.fs.writeFile).toHaveBeenCalledWith('rtl/core/reg_file.v', 'module reg_file; logic dirty; endmodule');
    expect(window.electronAPI?.fs.writeFile).toHaveBeenCalledWith('rtl/core/alu.v', 'module alu; logic dirty; endmodule');
  });

  it('routes native macOS save, Save All, and undo commands through the same workspace actions', async () => {
    window.electronAPI!.platform = 'darwin';

    renderMenuBarWithControls();

    const user = userEvent.setup();

    await clickByText(user, 'open-reg');
    await clickByText(user, 'edit-reg');
    await clickByText(user, 'open-alu');
    await clickByText(user, 'edit-alu');
    await clickByText(user, 'register-editor');

    const menuCommandHandler = vi.mocked(window.electronAPI!.menu.onCommand).mock.calls[0]?.[0];

    await act(async () => {
      menuCommandHandler?.({ action: 'save-file' });
      menuCommandHandler?.({ action: 'save-all-files' });
      menuCommandHandler?.({ action: 'undo-editor' });
    });

    expect(window.electronAPI?.fs.writeFile).toHaveBeenCalledWith('rtl/core/alu.v', 'module alu; logic dirty; endmodule');
    expect(window.electronAPI?.fs.writeFile).toHaveBeenCalledWith('rtl/core/reg_file.v', 'module reg_file; logic dirty; endmodule');
    expect(undoActionRun).toHaveBeenCalledTimes(1);
  });


  it('closes the app from the File menu using the shared close behavior', async () => {
    const user = userEvent.setup();

    renderMenuBar();

  await lockApplicationMenuBar(user);
    await user.click(screen.getByText('File'));
    await user.click(await screen.findByText('Close'));

    expect(window.electronAPI?.close).toHaveBeenCalledTimes(1);
  });

  it('closes the app with the platform close shortcut', () => {
    const isMacOS = window.electronAPI?.platform === 'darwin';

    renderMenuBar();

    fireEvent.keyDown(window, {
      key: 'q',
      ctrlKey: !isMacOS,
      metaKey: isMacOS,
    });

    expect(window.electronAPI?.close).toHaveBeenCalledTimes(1);
  });

  it('closes the app with Command+Q on macOS', () => {
    window.electronAPI!.platform = 'darwin';

    renderMenuBar();

    fireEvent.keyDown(window, {
      key: 'q',
      metaKey: true,
    });

    expect(window.electronAPI?.close).toHaveBeenCalledTimes(1);
  });

  it('keeps the menubar theme toggle wired to the shared theme action', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await user.click(screen.getByTestId('toggle-theme'));

    expect(toggleThemeMock).toHaveBeenCalledTimes(1);
  });

  it('does not render the select project dropdown or upgrade button', () => {
    renderMenuBar();

    expect(screen.queryByRole('button', { name: /select project/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upgrade to pro/i })).not.toBeInTheDocument();
  });

  it('calls the panel toggle callbacks from the layout icons', async () => {
    const user = userEvent.setup();
    const onShowLeftPanelChange = vi.fn();
    const onShowBottomPanelChange = vi.fn();
    const onShowRightPanelChange = vi.fn();

    renderMenuBar({
      onShowLeftPanelChange,
      onShowBottomPanelChange,
      onShowRightPanelChange,
    });

    await clickByTestId(user, 'toggle-left-panel');
    await clickByTestId(user, 'toggle-bottom-panel');
    await clickByTestId(user, 'toggle-right-panel');

    expect(onShowLeftPanelChange).toHaveBeenCalledTimes(1);
    expect(onShowLeftPanelChange).toHaveBeenCalledWith(true);
    expect(onShowBottomPanelChange).toHaveBeenCalledTimes(1);
    expect(onShowBottomPanelChange).toHaveBeenCalledWith(true);
    expect(onShowRightPanelChange).toHaveBeenCalledTimes(1);
    expect(onShowRightPanelChange).toHaveBeenCalledWith(true);
  });

  it('disables layout icons on unsupported code pages and only disables the activity bar toggle outside code', async () => {
    const user = userEvent.setup();
    const onShowLeftPanelChange = vi.fn();
    const onShowBottomPanelChange = vi.fn();
    const onShowRightPanelChange = vi.fn();

    renderMenuBarWithControls({
      onShowLeftPanelChange,
      onShowBottomPanelChange,
      onShowRightPanelChange,
    });

    await clickByText(user, 'set-synthesis');

    expect(screen.getByTestId('toggle-left-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-bottom-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-right-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-activity-bar')).not.toBeDisabled();

    await clickByText(user, 'set-physical');

    expect(screen.getByTestId('toggle-left-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-bottom-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-right-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-activity-bar')).not.toBeDisabled();

    await clickByText(user, 'set-factory');

    expect(screen.getByTestId('toggle-left-panel')).toBeDisabled();
    expect(screen.getByTestId('toggle-bottom-panel')).toBeDisabled();
    expect(screen.getByTestId('toggle-right-panel')).toBeDisabled();
    expect(screen.getByTestId('toggle-activity-bar')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-left-panel')).toHaveClass('cursor-not-allowed');
    expect(screen.getByTestId('toggle-bottom-panel')).toHaveClass('cursor-not-allowed');
    expect(screen.getByTestId('toggle-right-panel')).toHaveClass('cursor-not-allowed');
    expect(screen.getByTestId('toggle-activity-bar')).not.toHaveClass('cursor-not-allowed');

    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('collapsed');
    await clickByTestId(user, 'toggle-left-panel');
    await clickByTestId(user, 'toggle-bottom-panel');
    await clickByTestId(user, 'toggle-right-panel');
    await clickByTestId(user, 'toggle-activity-bar');

    expect(onShowLeftPanelChange).not.toHaveBeenCalled();
    expect(onShowBottomPanelChange).not.toHaveBeenCalled();
    expect(onShowRightPanelChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('expanded');

    await clickByText(user, 'set-simulation');

    expect(screen.getByTestId('toggle-left-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-bottom-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-right-panel')).not.toBeDisabled();
    expect(screen.getByTestId('toggle-activity-bar')).not.toBeDisabled();

    await clickByText(user, 'set-whiteboard');
    expect(screen.getByTestId('toggle-left-panel')).toBeDisabled();
    expect(screen.getByTestId('toggle-bottom-panel')).toBeDisabled();
    expect(screen.getByTestId('toggle-right-panel')).toBeDisabled();
    expect(screen.getByTestId('toggle-activity-bar')).toBeDisabled();
    expect(screen.getByTestId('toggle-activity-bar')).not.toHaveClass('cursor-not-allowed');

    await clickByTestId(user, 'toggle-activity-bar');
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('expanded');
  });

  it('reflects active panel visibility on the layout buttons', () => {
    renderMenuBar({
      showLeftPanel: true,
      showBottomPanel: false,
      showRightPanel: true,
    });

    expect(screen.getByTestId('toggle-left-panel')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('toggle-bottom-panel')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('toggle-right-panel')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the centered view switcher interactive inside the title bar', () => {
    renderMenuBar();

    const switcher = screen.getByTestId('center-view-switcher') as HTMLDivElement;

    expect(switcher.style.pointerEvents).toBe('auto');
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Whiteboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-activity-bar')).toBeInTheDocument();
  });

  it('renders the activity bar trigger after the menu items and toggles the shared sidebar state', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    const trigger = screen.getByTestId('toggle-activity-bar');
    const readFilledRect = () => trigger.querySelector('rect[fill="currentColor"]');

    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('collapsed');
    expect(trigger).toHaveAttribute('aria-pressed', 'false');
    expect(readFilledRect()).toBeNull();

    await user.click(trigger);
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('expanded');
    expect(trigger).toHaveAttribute('aria-pressed', 'true');
    expect(readFilledRect()).not.toBeNull();

    await user.click(trigger);
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('collapsed');
    expect(trigger).toHaveAttribute('aria-pressed', 'false');
    expect(readFilledRect()).toBeNull();
  });

  it('shows a visible selected style on the active center view button and updates it after switching', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    const centerViewButtons = Array.from(
      screen.getByTestId('center-view-switcher').querySelectorAll('[data-testid^="center-view-"]'),
    ).map((element) => element.getAttribute('data-testid'));
    const codeButton = screen.getByTestId('center-view-code');
    const whiteboardButton = screen.getByTestId('center-view-whiteboard');

    expect(centerViewButtons).toEqual([
      'center-view-whiteboard',
      'center-view-code',
      'center-view-workflow',
    ]);
    expect(codeButton).toHaveAttribute('data-state', 'on');
    expect(codeButton).toHaveClass('data-[state=on]:bg-ide-bg', 'data-[state=on]:shadow-[inset_0_1px_0_var(--ide-border)]', 'data-[state=on]:border-ide-border/80');
    expect(whiteboardButton).toHaveAttribute('data-state', 'off');

    await user.click(whiteboardButton);

    expect(codeButton).toHaveAttribute('data-state', 'off');
    expect(whiteboardButton).toHaveAttribute('data-state', 'on');
  });

  it('adds a pointer cursor on hover to the interactive menubar controls', () => {
    renderMenuBar();

    expect(screen.getByLabelText('Code')).toHaveClass('hover:cursor-pointer');
    expect(screen.getByLabelText('Whiteboard')).toHaveClass('hover:cursor-pointer');
    expect(screen.getByLabelText('Workflow')).toHaveClass('hover:cursor-pointer');
    expect(screen.getByTestId('toggle-left-panel')).toHaveClass('hover:cursor-pointer');
    expect(screen.getByTestId('toggle-bottom-panel')).toHaveClass('hover:cursor-pointer');
    expect(screen.getByTestId('toggle-right-panel')).toHaveClass('hover:cursor-pointer');
    expect(screen.getByTestId('toggle-theme')).toHaveClass('hover:cursor-pointer');
    expect(screen.getByTestId('user-avatar-button')).toHaveClass('hover:cursor-pointer');
  });

  it('renders shadcn tooltip content for the center view switcher on hover', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await user.hover(screen.getByLabelText('Code'));
    expect(await screen.findByRole('tooltip', { name: 'Code' })).toBeInTheDocument();
  });
});
