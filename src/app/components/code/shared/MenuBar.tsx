import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Settings, Sun, Moon } from 'lucide-react';
import {
  type AppMenuAction,
  type MenuCommandEvent,
} from '../../../menu/applicationMenu';
import { isMacOSPlatform } from '../../../menu/shortcutLabels';
import { canToggleLayoutPanels as canUseLayoutPanels } from '../../../codeViewPanels';
import { useWorkspaceEditor, useWorkspaceFiles, useWorkspaceProject, useWorkspaceView } from '../../../context/WorkspaceContext';
import { useTheme } from '../../../context/ThemeContext';
import { useCodeViewerLayout } from '../../../context/CodeViewerLayoutContext';
import { Toggle } from '../../ui/toggle';
import { Separator } from '../../ui/separator';
import { Button } from '../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { useSidebar } from '../../ui/sidebar';
import { AboutDialog } from './AboutDialog';
import { CreateProjectDialog } from './CreateProjectDialog';
import { MenuBarApplicationMenuCollapsible } from './MenuBarApplicationMenuCollapsible';
import { MenuBarSettingsDialogs, useMenuBarSettingsController } from './MenuBarSettingsDialog';
import { UserAccountPopover } from './MenuBarUserAccountPopover';
import { MenuBarViewSwitcher } from './MenuBarViewSwitcher';
import { MenuBarWindowControls } from './MenuBarWindowControls';
import { useProjectDialogStore } from './useProjectDialogStore';

const noDrag = { WebkitAppRegion: 'no-drag' as const };
const noDragInteractive = {
  WebkitAppRegion: 'no-drag' as const,
  pointerEvents: 'auto' as const,
};

function isCloseShortcutPressed(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'q' || event.altKey || event.shiftKey) {
    return false;
  }

  if (isMacOSPlatform()) {
    return event.metaKey && !event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}

function isNewProjectShortcutPressed(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'n' || event.altKey || !event.shiftKey) {
    return false;
  }

  if (isMacOSPlatform()) {
    return event.metaKey && !event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}

function isOpenProjectShortcutPressed(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'o' || event.altKey || event.shiftKey) {
    return false;
  }

  if (isMacOSPlatform()) {
    return event.metaKey && !event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}

function TooltipIconButton({
  content,
  children,
  side = 'bottom',
  wrapTrigger = true,
}: {
  content: string;
  children: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipContent>['side'];
  wrapTrigger?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {wrapTrigger ? <span className="inline-flex h-full">{children}</span> : children}
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/* Custom panel-toggle icons with optional rectangle fill */
const PanelLeftIcon = ({ size = 15, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {filled && <rect x="3" y="3" width="6" height="18" rx="2" fill="currentColor" stroke="none" />}
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

const PanelBottomIcon = ({ size = 15, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {filled && <rect x="3" y="15" width="18" height="6" rx="2" fill="currentColor" stroke="none" />}
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 15h18" />
  </svg>
);

const PanelRightIcon = ({ size = 15, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {filled && <rect x="12" y="3" width="9" height="18" rx="2" fill="currentColor" stroke="none" />}
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M12 3v18" />
  </svg>
);

interface MenuBarProps {
  onNotificationProgressDemo?: () => void;
  showLeftPanel?: boolean;
  showBottomPanel?: boolean;
  showRightPanel?: boolean;
  onShowLeftPanelChange?: (show: boolean) => void;
  onShowBottomPanelChange?: (show: boolean) => void;
  onShowRightPanelChange?: (show: boolean) => void;
}

export function MenuBar({
  onNotificationProgressDemo,
  showLeftPanel = false,
  showBottomPanel = false,
  showRightPanel = false,
  onShowLeftPanelChange,
  onShowBottomPanelChange,
  onShowRightPanelChange,
}: MenuBarProps) {
  const isMacOS = isMacOSPlatform();
  const [windowFullScreen, setWindowFullScreen] = useState(() => window.electronAPI?.isFullScreen() === true);
  const showWindowMenu = !isMacOS;
  const showMacOSLeadingSpace = isMacOS && !windowFullScreen;
  const {
    activeView,
    mainContentView,
    setMainContentView,
  } = useWorkspaceView();
  const {
    redoActiveEditor,
    undoActiveEditor,
  } = useWorkspaceEditor();
  const {
    saveActiveFile,
    saveAllFiles,
  } = useWorkspaceFiles();
  const { closeProject, openProject } = useWorkspaceProject();
  const { theme, toggleTheme } = useTheme();
  const { layoutMode } = useCodeViewerLayout();
  const settingsController = useMenuBarSettingsController();
  const { state: activityBarState, toggleSidebar } = useSidebar();
  const ref = useRef<HTMLDivElement>(null);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const createProjectDialogOpen = useProjectDialogStore((state) => state.createProjectDialogOpen);
  const openCreateProjectDialog = useProjectDialogStore((state) => state.openCreateProjectDialog);
  const setCreateProjectDialogOpen = useProjectDialogStore((state) => state.setCreateProjectDialogOpen);
  const layoutIconsEnabled = canUseLayoutPanels(mainContentView, activeView);
  const activityBarToggleEnabled = mainContentView === 'code';
  const isMinimalLayout = layoutMode === 'minimal';
  const chromeRootClassName = isMinimalLayout
    ? 'bg-ide-unified-chrome-bg text-ide-unified-chrome-fg'
    : 'border-b border-ide-border bg-ide-menubar-bg text-ide-text';
  const chromeControlTextClassName = isMinimalLayout
    ? 'text-ide-unified-chrome-fg/80 data-[state=on]:text-ide-unified-chrome-fg'
    : 'text-ide-text-muted data-[state=on]:text-ide-text';
  const chromeControlHoverClassName = isMinimalLayout
    ? 'hover:bg-ide-unified-chrome-hover hover:text-ide-unified-chrome-fg'
    : 'hover:bg-ide-hover hover:text-ide-text';
  const chromeIconButtonClassName = `w-8 h-full rounded-none ${chromeControlTextClassName} hover:cursor-pointer ${chromeControlHoverClassName}`;
  const chromeSeparatorClassName = isMinimalLayout ? 'h-4 mx-1 bg-transparent' : 'h-4 mx-1 bg-ide-border';
  const layoutIconClassName = [
    'w-8 h-full rounded-none border-0',
    chromeControlTextClassName,
    layoutIconsEnabled
      ? `hover:cursor-pointer ${chromeControlHoverClassName}`
      : 'cursor-not-allowed opacity-40',
  ].join(' ');
  const activityBarTriggerClassName = [
    `${isMacOS ? (windowFullScreen ? 'ml-2 ' : 'ml-1 ') : 'ml-1 '}w-8 h-full rounded-none border-0`,
    chromeControlTextClassName,
    activityBarToggleEnabled
      ? `hover:cursor-pointer ${chromeControlHoverClassName}`
      : 'opacity-40',
  ].join(' ');
  const openAboutDialog = () => {
    setAboutDialogOpen(true);
  };

  const openProjectDialog = () => {
    void openProject();
  };

  const requestProjectClose = () => {
    void closeProject();
  };

  const revealBundledNoticeFiles = () => {
    void window.electronAPI?.notices.revealBundledFiles();
  };

  const requestAppClose = () => {
    void window.electronAPI?.close();
  };

  const handleMenuItemSelect = (action: AppMenuAction | null) => {
    if (action === 'open-new-project') {
      openCreateProjectDialog();
      return;
    }

    if (action === 'open-project') {
      openProjectDialog();
      return;
    }

    if (action === 'close-project') {
      requestProjectClose();
      return;
    }

    if (action === 'open-settings') {
      settingsController.openSettingsDialog();
      return;
    }

    if (action === 'open-about') {
      openAboutDialog();
      return;
    }

    if (action === 'open-notice-files') {
      revealBundledNoticeFiles();
      return;
    }

    if (action === 'run-notification-progress-demo') {
      onNotificationProgressDemo?.();
      return;
    }

    if (action === 'save-file') {
      void saveActiveFile();
      return;
    }

    if (action === 'save-all-files') {
      void saveAllFiles();
      return;
    }

    if (action === 'undo-editor') {
      void undoActiveEditor();
      return;
    }

    if (action === 'redo-editor') {
      void redoActiveEditor();
      return;
    }

    if (action === 'close-app') {
      requestAppClose();
    }
  };

  const handleNativeMenuCommand = useEffectEvent((payload: MenuCommandEvent) => {
    if (payload.action === 'open-new-project') {
      openCreateProjectDialog();
      return;
    }

    if (payload.action === 'open-project') {
      openProjectDialog();
      return;
    }

    if (payload.action === 'close-project') {
      requestProjectClose();
      return;
    }

    if (payload.action === 'open-settings') {
      settingsController.openSettingsDialog();
      return;
    }

    if (payload.action === 'open-about') {
      openAboutDialog();
      return;
    }

    if (payload.action === 'open-notice-files') {
      revealBundledNoticeFiles();
      return;
    }

    if (payload.action === 'run-notification-progress-demo') {
      onNotificationProgressDemo?.();
      return;
    }

    if (payload.action === 'save-file') {
      void saveActiveFile();
      return;
    }

    if (payload.action === 'save-all-files') {
      void saveAllFiles();
      return;
    }

    if (payload.action === 'undo-editor') {
      void undoActiveEditor();
      return;
    }

    if (payload.action === 'redo-editor') {
      void redoActiveEditor();
    }
  });

  useEffect(() => {
    if (!isMacOS) {
      return;
    }

    setWindowFullScreen(window.electronAPI?.isFullScreen() === true);

    const dispose = window.electronAPI?.onFullScreenChange((fullScreen) => {
      setWindowFullScreen(fullScreen);
    });

    return () => {
      dispose?.();
    };
  }, [isMacOS]);

  useEffect(() => {
    const dispose = window.electronAPI?.menu.onCommand((payload) => {
      handleNativeMenuCommand(payload);
    });

    return () => {
      dispose?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isNewProjectShortcutPressed(event)) {
        event.preventDefault();
        openCreateProjectDialog();
        return;
      }

      if (isOpenProjectShortcutPressed(event)) {
        event.preventDefault();
        openProjectDialog();
        return;
      }

      if (!isCloseShortcutPressed(event)) {
        return;
      }

      event.preventDefault();
      requestAppClose();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <>
        <div
          data-testid="menu-bar-root"
          ref={ref}
          data-code-viewer-layout-mode={layoutMode}
          className={`flex items-center h-8 select-none shrink-0 z-50 ${chromeRootClassName}`}
          style={{ userSelect: 'none', WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* macOS traffic light clearance */}
          {showMacOSLeadingSpace && <div data-testid="macos-traffic-light-clearance" className="w-20 shrink-0" />}

          {/* App icon / title */}
          {showWindowMenu && (
            <div className="flex items-center gap-1.5 px-3 pr-2" data-testid="menu-app-icon" style={noDrag as React.CSSProperties}>
              <div className="w-4 h-4 rounded-sm bg-ide-accent flex items-center justify-center">
                <span className="text-primary-foreground text-[9px] font-bold">P</span>
              </div>
            </div>
          )}

          {/* Menu items — shadcn Menubar */}
          {showWindowMenu && (
            <MenuBarApplicationMenuCollapsible
              interactiveStyle={noDragInteractive as React.CSSProperties}
              menuStyle={noDrag as React.CSSProperties}
              onSelectAction={handleMenuItemSelect}
            />
          )}


          <TooltipIconButton content="Toggle activity bar" wrapTrigger={false}>
            <Toggle
              aria-label="Toggle activity bar"
              aria-disabled={!activityBarToggleEnabled}
              data-testid="toggle-activity-bar"
              disabled={!activityBarToggleEnabled}
              pressed={activityBarToggleEnabled ? activityBarState === 'expanded' : false}
              className={activityBarTriggerClassName}
              onPressedChange={() => {
                if (!activityBarToggleEnabled) {
                  return;
                }

                toggleSidebar();
              }}
              style={noDragInteractive as React.CSSProperties}
            >
              <PanelLeftIcon size={15} filled={activityBarState === 'expanded'} />
            </Toggle>
          </TooltipIconButton>

          {/* Center view switcher — absolutely centered */}
          <MenuBarViewSwitcher
            value={mainContentView}
            onValueChange={setMainContentView}
            interactiveStyle={noDragInteractive as React.CSSProperties}
          />

          {/* Right side controls */}
          <div
            data-testid="right-side-controls"
            className="ml-auto flex items-center h-full"
            style={noDrag as React.CSSProperties}
          >

          {/* Layout icons */}
          <TooltipIconButton content="Toggle left sidebar">
            <Toggle
              aria-label="Toggle left sidebar"
              aria-disabled={!layoutIconsEnabled}
              pressed={layoutIconsEnabled ? showLeftPanel : false}
              data-testid="toggle-left-panel"
              disabled={!layoutIconsEnabled}
              className={layoutIconClassName}
              onPressedChange={(nextPressed) => {
                if (!layoutIconsEnabled) {
                  return;
                }

                onShowLeftPanelChange?.(nextPressed);
              }}
            >
              <PanelLeftIcon size={15} filled={showLeftPanel} />
            </Toggle>
          </TooltipIconButton>
          <TooltipIconButton content="Toggle bottom panel">
            <Toggle
              aria-label="Toggle bottom panel"
              aria-disabled={!layoutIconsEnabled}
              pressed={layoutIconsEnabled ? showBottomPanel : false}
              data-testid="toggle-bottom-panel"
              disabled={!layoutIconsEnabled}
              className={layoutIconClassName}
              onPressedChange={(nextPressed) => {
                if (!layoutIconsEnabled) {
                  return;
                }

                onShowBottomPanelChange?.(nextPressed);
              }}
            >
              <PanelBottomIcon size={15} filled={showBottomPanel} />
            </Toggle>
          </TooltipIconButton>
          <TooltipIconButton content="Toggle right sidebar">
            <Toggle
              aria-label="Toggle right sidebar"
              aria-disabled={!layoutIconsEnabled}
              pressed={layoutIconsEnabled ? showRightPanel : false}
              data-testid="toggle-right-panel"
              disabled={!layoutIconsEnabled}
              className={layoutIconClassName}
              onPressedChange={(nextPressed) => {
                if (!layoutIconsEnabled) {
                  return;
                }

                onShowRightPanelChange?.(nextPressed);
              }}
            >
              <PanelRightIcon size={15} filled={showRightPanel} />
            </Toggle>
          </TooltipIconButton>

          <Separator orientation="vertical" className={chromeSeparatorClassName} />

          {/* Theme toggle */}
          <TooltipIconButton content="Toggle theme" wrapTrigger={false}>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              data-testid="toggle-theme"
              className={chromeIconButtonClassName}
              onClick={toggleTheme}
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </Button>
          </TooltipIconButton>

          {/* Settings */}
          <TooltipIconButton content="Settings" wrapTrigger={false}>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              data-testid="menu-settings-button"
              className={chromeIconButtonClassName}
              onClick={settingsController.openSettingsDialog}
            >
              <Settings size={15} />
            </Button>
          </TooltipIconButton>

          <UserAccountPopover interactiveStyle={noDragInteractive as React.CSSProperties} />

          {showWindowMenu && <Separator data-testid="menu-avatar-separator" orientation="vertical" className={chromeSeparatorClassName} />}

          {/* Window controls (hidden on macOS — native traffic lights used instead) */}
          {!isMacOS && (
            <MenuBarWindowControls
              interactiveStyle={noDragInteractive as React.CSSProperties}
              onRequestClose={requestAppClose}
            />
          )}

          </div>
        </div>

        <AboutDialog
          open={aboutDialogOpen}
          onOpenChange={setAboutDialogOpen}
          onRevealBundledNoticeFiles={revealBundledNoticeFiles}
          canRevealBundledNoticeFiles={Boolean(window.electronAPI?.notices?.revealBundledFiles)}
          dialogStyle={noDragInteractive as React.CSSProperties}
        />

        <CreateProjectDialog
          open={createProjectDialogOpen}
          onOpenChange={setCreateProjectDialogOpen}
          dialogStyle={noDragInteractive as React.CSSProperties}
        />

        <MenuBarSettingsDialogs
          controller={settingsController}
          dialogStyle={noDragInteractive as React.CSSProperties}
        />
      </>
    </TooltipProvider>
  );
}
