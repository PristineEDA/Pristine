import type { CodeView, MainContentView, PanelVisibilityState } from '../src/app/codeViewPanels';
import type { EditorGroup, EditorLayoutNode } from '../src/app/editor/editorLayout';

export interface ProjectWindowBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface ProjectWindowState {
  bounds: ProjectWindowBounds | null;
  maximized: boolean;
}

export interface ProjectConfig {
  mode: string;
  process: string;
  type: string;
  mgnt: string;
  padframe: string;
}

export type ProjectExplorerLeftTab = 'explorer' | 'git';
export type ProjectExplorerLeftSecondaryTab = 'hierarchy' | 'libraries';
export type ProjectExplorerRightTab = 'ai' | 'static' | 'references' | 'outline';
export type ProjectExplorerRightSecondaryTab = 'module-info' | 'resource-usage' | 'x-propagation';
export type ProjectPhysicalLeftTab = 'layout' | 'constraints';
export type ProjectPhysicalRightTab = 'layers' | 'checks';
export type ProjectPhysicalBottomTab = 'reports' | 'console';

export interface ProjectSidePanelSession {
  assistantThreadListExpanded: boolean;
  assistantThreadListWidth: number;
  leftPrimaryTab: ProjectExplorerLeftTab;
  leftSecondaryTab: ProjectExplorerLeftSecondaryTab;
  leftSplitVisible: boolean;
  physicalBottomTab: ProjectPhysicalBottomTab;
  physicalLeftSplitVisible: boolean;
  physicalLeftTab: ProjectPhysicalLeftTab;
  physicalRightSplitVisible: boolean;
  physicalRightTab: ProjectPhysicalRightTab;
  rightPrimaryTab: ProjectExplorerRightTab;
  rightSecondaryTab: ProjectExplorerRightSecondaryTab;
  rightSplitVisible: boolean;
}

export interface ProjectExplorerTreeSelectedNode {
  path: string;
  type: 'file' | 'folder';
}

export interface ProjectExplorerTreeSession {
  expandedPaths: string[];
  scrollTop: number;
  selectedNode: ProjectExplorerTreeSelectedNode | null;
}

export interface ProjectBottomPanelTabLayout {
  focusedPaneId: string;
  nextPaneIndex: number;
  panes: ProjectBottomPanelPane[];
}

export interface ProjectBottomPanelSession {
  activeTab: ProjectBottomPanelTabId;
  tabs: Partial<Record<ProjectBottomPanelTabId, ProjectBottomPanelTabLayout>>;
}

export type ProjectBottomPanelTabId =
  | 'terminal'
  | 'output'
  | 'problems'
  | 'debug'
  | 'lsp'
  | 'schematic'
  | 'waveform'
  | 'synthesis';

export type ProjectBottomPaneContent =
  | { kind: 'tab'; tab: ProjectBottomPanelTabId }
  | { kind: 'empty' }
  | { kind: 'placeholder'; label: string; icon: 'file' | 'boxes' };

export interface ProjectBottomPanelPane {
  content: ProjectBottomPaneContent;
  id: string;
  size: number;
}

export interface ProjectSessionSnapshot {
  activeTabId?: string;
  activeView: CodeView;
  bottomPanelSession?: ProjectBottomPanelSession;
  editorGroups: EditorGroup[];
  editorLayout: EditorLayoutNode | null;
  explorerTreeSession?: ProjectExplorerTreeSession;
  focusedGroupId: string | null;
  mainContentView: MainContentView;
  panelStateByView: Record<CodeView, PanelVisibilityState>;
  panelWidths?: Record<string, number>;
  sidePanelSession?: ProjectSidePanelSession;
  version: 1;
  windowState?: ProjectWindowState;
}

export interface ProjectState {
  config: ProjectConfig;
  name: string;
  rootPath: string;
  session: ProjectSessionSnapshot | null;
}

export interface CreateProjectInput extends ProjectConfig {
  name: string;
  path: string;
}

export interface ProjectCreateResult {
  project: ProjectState;
}

export interface ProjectOpenResult {
  project: ProjectState;
}

export interface ProjectCloseResult {
  closed: boolean;
}

export type ProjectUpdateConfigInput = ProjectConfig;

export interface ProjectUpdateConfigResult {
  project: ProjectState;
}

export type ProjectChangedEvent = ProjectState | null;
