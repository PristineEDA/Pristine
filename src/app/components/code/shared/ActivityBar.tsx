import {
  FileCode, BugPlay, Cog, LucideLayers3, Grid2X2Plus, Hammer, Pause, Play,
  // BookOpen,
  Package,
  Frame,
  GalleryVerticalEnd,
  PieChart,
  // Settings2,
  Map,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
  SidebarHeader,
} from '../../ui/sidebar';
import { NavDesignSwitcher } from './NavDesignSwitcher';
import { NavMain } from './NavMain';
import { NavProjects } from './NavProjects';
import type { CodeView } from '../../../codeViewPanels';
import { useCodeViewerLayout } from '../../../context/CodeViewerLayoutContext';


interface ActivityBarProps {
  activeView: string;
  canConfigureProject?: boolean;
  canRunDevelopmentEnvironment?: boolean;
  isDevelopmentEnvironmentActive?: boolean;
  onItemSelect: (view: string) => void;
  onProjectConfigure?: () => void;
  onRunAction?: () => void;
}

const actionItems = [
  { id: 'configure', icon: Hammer, label: 'Configure' },
  { id: 'run', icon: Play, label: 'Run' },
] as const;

const data = {
  designs: [
    {
      name: "retroSoC",
      logo: GalleryVerticalEnd,
      plan: "SoC",
    },
    {
      name: "demo",
      logo: Package,
      plan: "module",
    },
    {
      name: "gcd",
      logo: Package,
      plan: "module",
    },
  ],
  navMain: [
    {
      id: 'explorer' as CodeView,
      title: "Editor",
      url: "#",
      icon: FileCode,
      isActive: true,
    },
    {
      id: 'simulation' as CodeView,
      title: "Simulation",
      url: "#",
      icon: BugPlay,
    },
    {
      id: 'synthesis' as CodeView,
      title: "Synthesis",
      url: "#",
      icon: Cog,
    },
    {
      id: 'physical' as CodeView,
      title: "Physical",
      url: "#",
      icon: LucideLayers3,
      items: [
        {
          title: "Floorplan",
          url: "#",
        },
        {
          title: "Place",
          url: "#",
        },
        {
          title: "CTS",
          url: "#",
        },
        {
          title: "Route",
          url: "#",
        },
        {
          title: "DRC",
          url: "#",
        },
      ],
    },
    {
      id: 'factory' as CodeView,
      title: "Factory",
      url: "#",
      icon: Grid2X2Plus,
    },
  ],
  projects: [
    {
      name: "Design Engineering",
      url: "#",
      icon: Frame,
    },
    {
      name: "Sales & Marketing",
      url: "#",
      icon: PieChart,
    },
    {
      name: "Travel",
      url: "#",
      icon: Map,
    },
  ],
}

const activityBarButtonBaseClass = 'relative min-h-10 rounded-md transition-colors hover:cursor-pointer group-data-[collapsible=icon]:h-10! group-data-[collapsible=icon]:w-full! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:px-0!';

export function ActivityBar({
  activeView,
  canConfigureProject = false,
  canRunDevelopmentEnvironment = false,
  isDevelopmentEnvironmentActive = false,
  onItemSelect,
  onProjectConfigure,
  onRunAction,
}: ActivityBarProps) {
  const { state } = useSidebar();
  const { layoutMode } = useCodeViewerLayout();
  const isExpanded = state === 'expanded';
  const isMinimalLayout = layoutMode === 'minimal';
  const activityBarThemeStyle = {
    '--sidebar': isMinimalLayout ? 'var(--ide-unified-chrome-bg)' : 'var(--ide-activitybar-bg)',
    '--sidebar-foreground': isMinimalLayout ? 'var(--ide-unified-chrome-fg)' : 'var(--ide-text-muted)',
    '--sidebar-accent': isMinimalLayout ? 'var(--ide-unified-chrome-hover)' : 'var(--ide-hover)',
    '--sidebar-accent-foreground': isMinimalLayout ? 'var(--ide-unified-chrome-fg)' : 'var(--ide-text)',
    '--sidebar-primary': 'var(--ide-accent)',
    '--sidebar-primary-foreground': 'var(--primary-foreground)',
    '--sidebar-border': isMinimalLayout ? 'transparent' : 'var(--ide-border)',
    '--sidebar-ring': 'var(--ide-accent)',
  } as CSSProperties;
  const actionButtonClassName = `${activityBarButtonBaseClass} text-ide-success hover:bg-sidebar-accent hover:text-ide-success disabled:pointer-events-none disabled:opacity-40 ${isExpanded ? 'h-10 w-full justify-start' : 'h-10 w-full justify-center px-0'
    }`;

  return (
    <Sidebar
      collapsible="icon"
      className="top-8 h-[calc(100svh-3.5rem)]"
      data-code-viewer-layout-mode={layoutMode}
      data-testid="activity-bar"
      showSideBorder={!isMinimalLayout}
      side="left"
      style={activityBarThemeStyle}
    >
      <SidebarHeader>
        <NavDesignSwitcher designs={data.designs} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} activeView={activeView} onItemSelect={onItemSelect} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {actionItems.map(({ id, icon: Icon, label }) => {
            const isConfigureAction = id === 'configure';
            const isRunAction = id === 'run';
            const ActionIcon = isRunAction && isDevelopmentEnvironmentActive ? Pause : Icon;
            const actionLabel = isRunAction && isDevelopmentEnvironmentActive ? 'Pause' : label;
            const handleActionClick = isConfigureAction ? onProjectConfigure : onRunAction;
            const isDisabled = isConfigureAction
              ? !canConfigureProject
              : isRunAction && !canRunDevelopmentEnvironment;
            return (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton
                tooltip={actionLabel}
                aria-label={actionLabel}
                data-testid={`activity-action-${id}`}
                disabled={isDisabled}
                className={`${actionButtonClassName} [&>svg]:size-[18px]`}
                onClick={handleActionClick}
              >
                <ActionIcon size={18} strokeWidth={1.7} />
                {isExpanded ? <span className="text-sm font-medium">{actionLabel}</span> : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
          })}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
