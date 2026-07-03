import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, vi } from 'vitest';
import { MenuBar } from './MenuBar';
import type { DesktopAuthSession } from '../../../auth/types';
import { WorkspaceProvider, useWorkspace } from '../../../context/WorkspaceContext';
import { resetWorkspaceSessionStoreForTests } from '../../../context/useWorkspaceSessionStore';
import { CodeViewerLayoutProvider, type CodeViewerLayoutMode } from '../../../context/CodeViewerLayoutContext';
import type { ColorThemeOption, ColorThemePreviewPalette, ResolvedColorTheme } from '../../../theme/colorThemeTypes';
import { SidebarProvider, useSidebar } from '../../ui/sidebar';
import { resetMenuChromeStoreForTests } from './useMenuChromeStore';
import { resetProjectDialogStoreForTests } from './useProjectDialogStore';
import { resetSettingsDialogSessionForTests } from './useSettingsDialogSessionStore';

export const ensureEditorFontFamilyLoadedMock = vi.fn<(fontFamily: string) => Promise<void>>(() => Promise.resolve());
export const setEditorFontSizeMock = vi.fn();
export const setEditorFontFamilyMock = vi.fn();
export const setEditorFontLigaturesMock = vi.fn();
export const setEditorTabSizeMock = vi.fn();
export const setEditorCursorBlinkingMock = vi.fn();
export const setEditorWordWrapMock = vi.fn();
export const setEditorRenderWhitespaceMock = vi.fn();
export const setEditorRenderControlCharactersMock = vi.fn();
export const setEditorSmoothScrollingMock = vi.fn();
export const setEditorScrollBeyondLastLineMock = vi.fn();
export const setEditorFoldingStrategyMock = vi.fn();
export const setEditorLineNumbersMock = vi.fn();
export const setEditorMinimapEnabledMock = vi.fn();
export const setEditorGlyphMarginMock = vi.fn();
export const setEditorInlineGitDiffEnabledMock = vi.fn();
export const setEditorInlineGitDiffStateBackgroundsEnabledMock = vi.fn();
export const setEditorBracketPairGuidesMock = vi.fn();
export const setEditorIndentGuidesMock = vi.fn();
export const setEditorThemeMock = vi.fn();
export const setThemeMock = vi.fn();
export const toggleThemeMock = vi.fn();
export const setSchematicAlignmentGuidesEnabledMock = vi.fn();
export const setSchematicGridEnabledMock = vi.fn();
export const setSchematicGridSizeMock = vi.fn();
export const setSchematicSnapToGridMock = vi.fn();
export const importThemeMock = vi.fn<() => Promise<ColorThemeOption | null>>();
export const getThemePreviewMock = vi.fn<(themeId: string) => ColorThemePreviewPalette>();
export const clearUserErrorMock = vi.fn();
export const openAccountPageMock = vi.fn(() => Promise.resolve(true));
export const signOutMock = vi.fn(() => Promise.resolve(true));
export const syncCloudConfigMock = vi.fn(() => Promise.resolve(true));
export const undoActionRun = vi.fn(() => Promise.resolve());
export const redoActionRun = vi.fn(() => Promise.resolve());

const defaultColorThemeOptions: ColorThemeOption[] = [
  {
    value: 'vscode-2026-dark',
    label: 'Dark 2026',
    description: 'Built-in 2026 dark color theme.',
    author: 'Microsoft',
    kind: 'dark',
    source: 'builtin',
  },
  {
    value: 'vscode-2026-light',
    label: 'Light 2026',
    description: 'Built-in 2026 light color theme.',
    author: 'Microsoft',
    kind: 'light',
    source: 'builtin',
  },
  {
    value: 'pink-cat-boo',
    label: 'Pink Cat Boo',
    description: 'Playful dark theme with rose-pink chrome, powder-blue accents, and warm banana-yellow strings.',
    author: 'Fiona Fan',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'one-dark-pro',
    label: 'One Dark Pro',
    description: 'Balanced dark theme with familiar tones.',
    author: 'Binaryify',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'one-dark-pro-night-flat',
    label: 'One Dark Pro Night Flat',
    description: 'Near-black flat variant for lower-glare editing.',
    author: 'Binaryify',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'github-light-default',
    label: 'GitHub Light Default',
    description: 'Modern GitHub light default with clean paper surfaces and refined Primer accent colors.',
    author: 'GitHub',
    kind: 'light',
    source: 'bundled',
  },
  {
    value: 'github-light-high-contrast',
    label: 'GitHub Light High Contrast',
    description: 'High-contrast GitHub light variant tuned for strong borders, deep ink, and accessible focus states.',
    author: 'GitHub',
    kind: 'light',
    source: 'bundled',
  },
  {
    value: 'gruvbox-dark-medium',
    label: 'Gruvbox Dark Medium',
    description: 'Balanced Gruvbox dark variant with warm retro contrast.',
    author: 'jdinhify',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'night-owl',
    label: 'Night Owl',
    description: 'High-contrast dark palette for long coding sessions.',
    author: 'Sarah Drasner',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'light-owl',
    label: 'Light Owl',
    description: 'Daylight counterpart to Night Owl with airy surfaces and saturated jewel tones.',
    author: 'Sarah Drasner',
    kind: 'light',
    source: 'bundled',
  },
  {
    value: 'noctis-lux',
    label: 'Noctis Lux',
    description: 'Bright light variant of Noctis with vivid editorial accents.',
    author: 'Liviu Schera',
    kind: 'light',
    source: 'bundled',
  },
  {
    value: 'macos-modern-dark-ventura-xcode-default',
    label: 'MacOS Modern Dark - Ventura Xcode Default',
    description: 'Graphite macOS dark chrome with bright blue focus accents and classic Xcode-style syntax colors.',
    author: 'David B. Waters',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'macos-modern-light-ventura-xcode-low-key',
    label: 'MacOS Modern Light - Ventura Xcode Low Key',
    description: 'Muted macOS light variant with restrained blue-gray syntax, plum strings, and olive commentary on the same native chrome.',
    author: 'David B. Waters',
    kind: 'light',
    source: 'bundled',
  },
  {
    value: 'dobri-next-a06-amethyst',
    label: 'Dobri Next -A06- Amethyst',
    description: 'Deep amethyst editor chrome with neon-violet highlights and saturated candy syntax accents.',
    author: 'Sergio Dobri',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'copilot-theme-higher-contrast',
    label: 'Copilot Theme - Higher Contrast',
    description: 'Higher-contrast Copilot variant with brighter ink and stronger symbol separation.',
    author: 'Benjamin Benais',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'andromeda',
    label: 'Andromeda',
    description: 'Spacey dark theme with cyan, coral, and violet contrast.',
    author: 'Eliver Lara',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'atom-one-light',
    label: 'Atom One Light',
    description: 'Soft Atom-inspired light theme with crisp syntax and clean workbench neutrals.',
    author: 'akamud',
    kind: 'light',
    source: 'bundled',
  },
  {
    value: 'slack-aubergine-dark-editor',
    label: 'Slack Theme Aubergine Dark',
    description: 'True dark Slack aubergine variant with plum editor surfaces, rose alerts, and material-style neon syntax accents.',
    author: 'Felipe Mendes',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'github-light-theme-gray',
    label: 'Github Light Theme - Gray',
    description: 'Muted gray-background variant of the classic GitHub light theme with the same yellow selections and legacy syntax colors.',
    author: 'Hyzeta',
    kind: 'light',
    source: 'bundled',
  },
  {
    value: 'winter-is-coming-dark',
    label: 'Winter is Coming (Dark)',
    description: 'Neutral charcoal variant of Winter is Coming with icy syntax accents.',
    author: 'John Papa',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'alabaster',
    label: 'Alabaster',
    description: 'Minimal light theme that highlights only the essentials.',
    author: 'Nikita Prokopov',
    kind: 'light',
    source: 'bundled',
  },
  {
    value: 'vue-theme-high-contrast',
    label: 'Vue Theme High Contrast',
    description: 'High-contrast Vue variant with deep teal panels, electric pink syntax, and neon cyan links.',
    author: 'Mario Rodeghiero',
    kind: 'dark',
    source: 'bundled',
  },
  {
    value: 'visual-studio-light-cpp',
    label: 'Light (Visual Studio - C/C++)',
    description: 'Modern Visual Studio-style light theme with crisp paper surfaces and classic C/C++ syntax colors.',
    author: 'Microsoft',
    kind: 'light',
    source: 'bundled',
  },
];

const defaultThemePreviews: Record<string, ColorThemePreviewPalette> = {
  'vscode-2026-dark': {
    surface: '#181818',
    background: '#101010',
    input: '#202020',
    selection: '#264f78',
    comment: '#8b949e',
    foreground: '#f5f5f5',
    brightForeground: '#ffffff',
    pink: '#c586c0',
    purple: '#d2a8ff',
    cyan: '#79c0ff',
    green: '#7ee787',
    yellow: '#dcdcaa',
    red: '#f48771',
    orange: '#ffa657',
  },
  'vscode-2026-light': {
    surface: '#f4f4f5',
    background: '#ffffff',
    input: '#f8fafc',
    selection: '#dbeafe',
    comment: '#6b7280',
    foreground: '#111827',
    brightForeground: '#0f172a',
    pink: '#a21caf',
    purple: '#7c3aed',
    cyan: '#0284c7',
    green: '#059669',
    yellow: '#b45309',
    red: '#dc2626',
    orange: '#ea580c',
  },
  'pink-cat-boo': {
    surface: '#2d2f42',
    background: '#202330',
    input: '#202330',
    selection: '#472541',
    comment: '#6D7A72',
    foreground: '#FFF0F5',
    brightForeground: '#ffffff',
    pink: '#FF4791',
    purple: '#DCBFF2',
    cyan: '#A2C2EB',
    green: '#58B896',
    yellow: '#FAE8B6',
    red: '#FF62A5',
    orange: '#ffc85b',
  },
  'one-dark-pro': {
    surface: '#21252b',
    background: '#282c34',
    input: '#1d1f23',
    selection: '#67769660',
    comment: '#5c6370',
    foreground: '#abb2bf',
    brightForeground: '#d7dae0',
    pink: '#c678dd',
    purple: '#c678dd',
    cyan: '#56b6c2',
    green: '#98c379',
    yellow: '#e5c07b',
    red: '#e06c75',
    orange: '#d19a66',
  },
  'one-dark-pro-night-flat': {
    surface: '#16191d',
    background: '#16191d',
    input: '#1d1f23',
    selection: '#67769660',
    comment: '#667187',
    foreground: '#abb2bf',
    brightForeground: '#d7dae0',
    pink: '#c678dd',
    purple: '#c678dd',
    cyan: '#61afef',
    green: '#98c379',
    yellow: '#e5c07b',
    red: '#e06c75',
    orange: '#d19a66',
  },
  'github-light-default': {
    surface: '#f6f8fa',
    background: '#ffffff',
    input: '#ffffff',
    selection: '#ddf4ff',
    comment: '#6e7781',
    foreground: '#1f2328',
    brightForeground: '#24292f',
    pink: '#bf3989',
    purple: '#8250df',
    cyan: '#0550ae',
    green: '#116329',
    yellow: '#9a6700',
    red: '#cf222e',
    orange: '#953800',
  },
  'github-light-high-contrast': {
    surface: '#ffffff',
    background: '#ffffff',
    input: '#ffffff',
    selection: '#0e1116',
    comment: '#66707b',
    foreground: '#0e1116',
    brightForeground: '#0e1116',
    pink: '#971368',
    purple: '#622cbc',
    cyan: '#023b95',
    green: '#024c1a',
    yellow: '#744500',
    red: '#a0111f',
    orange: '#702c00',
  },
  'gruvbox-dark-medium': {
    surface: '#282828',
    background: '#282828',
    input: '#282828',
    selection: '#689d6a40',
    comment: '#928374',
    foreground: '#ebdbb2',
    brightForeground: '#fbf1c7',
    pink: '#b16286',
    purple: '#d3869b',
    cyan: '#8ec07c',
    green: '#b8bb26',
    yellow: '#fabd2f',
    red: '#fb4934',
    orange: '#fe8019',
  },
  'night-owl': {
    surface: '#102131',
    background: '#011627',
    input: '#122d42',
    selection: '#1d3b53',
    comment: '#637777',
    foreground: '#d6deeb',
    brightForeground: '#ffffff',
    pink: '#c792ea',
    purple: '#c792ea',
    cyan: '#82aaff',
    green: '#addb67',
    yellow: '#ecc48d',
    red: '#ef5350',
    orange: '#f78c6c',
  },
  'light-owl': {
    surface: '#F0F0F0',
    background: '#FBFBFB',
    input: '#F0F0F0',
    selection: '#E0E0E0',
    comment: '#989FB1',
    foreground: '#403F53',
    brightForeground: '#111111',
    pink: '#AA0982',
    purple: '#994CC3',
    cyan: '#4876D6',
    green: '#0C969B',
    yellow: '#E0AF02',
    red: '#DE3D3B',
    orange: '#C96765',
  },
  'noctis-lux': {
    surface: '#f2edde',
    background: '#fef8ec',
    input: '#fef8ec',
    selection: '#ade2eb',
    comment: '#8ca6a6',
    foreground: '#005661',
    brightForeground: '#000000',
    pink: '#ff5792',
    purple: '#9075d8',
    cyan: '#00c6e0',
    green: '#8ce99a',
    yellow: '#f49725',
    red: '#ff4000',
    orange: '#e9a149',
  },
  'macos-modern-dark-ventura-xcode-default': {
    surface: '#353333',
    background: '#232222',
    input: '#403e3e',
    selection: '#6e6e6e',
    comment: '#6C7986',
    foreground: '#ffffffd8',
    brightForeground: '#ffffff',
    pink: '#FC5FA3',
    purple: '#9686F5',
    cyan: '#53A5FB',
    green: '#91D462',
    yellow: '#ffc501',
    red: '#FC6A5D',
    orange: '#FD8F3F',
  },
  'macos-modern-light-ventura-xcode-low-key': {
    surface: '#f8f8f7',
    background: '#ffffff',
    input: '#fcfcfc',
    selection: '#b5d5ff',
    comment: '#546348',
    foreground: '#000000',
    brightForeground: '#434343',
    pink: '#B73999',
    purple: '#853e64',
    cyan: '#587EA8',
    green: '#255E22',
    yellow: '#546348',
    red: '#853e64',
    orange: '#323E7D',
  },
  'dobri-next-a06-amethyst': {
    surface: '#150022',
    background: '#150022',
    input: '#0b1015',
    selection: '#3F005B',
    comment: '#5C6370',
    foreground: '#f5f5f5',
    brightForeground: '#A61EFF',
    pink: '#FB467B',
    purple: '#CB6CFE',
    cyan: '#56D6D6',
    green: '#C3E88D',
    yellow: '#FFCC00',
    red: '#FB467B',
    orange: '#F78C6C',
  },
  'copilot-theme-higher-contrast': {
    surface: '#1A2023',
    background: '#232A2F',
    input: '#232A2F',
    selection: '#204062',
    comment: '#707A84',
    foreground: '#A8B2BA',
    brightForeground: '#D4DCE4',
    pink: '#FF8AD1',
    purple: '#BA8EF7',
    cyan: '#89DDFF',
    green: '#5BEC95',
    yellow: '#FFEA6B',
    red: '#FF6A80',
    orange: '#FFA763',
  },
  andromeda: {
    surface: '#0F111B',
    background: '#0F111B',
    input: '#0F111B',
    selection: '#1A1D2B',
    comment: '#384854',
    foreground: '#CFD9DB',
    brightForeground: '#FFFFFF',
    pink: '#FF6B6B',
    purple: '#C792EA',
    cyan: '#00D4FF',
    green: '#7EC699',
    yellow: '#FFB86C',
    red: '#FF6B6B',
    orange: '#FFA500',
  },
  'atom-one-light': {
    surface: '#F5F5F5',
    background: '#FAFAFA',
    input: '#FFFFFF',
    selection: '#E5E5E6',
    comment: '#A0A1A7',
    foreground: '#383A42',
    brightForeground: '#121417',
    pink: '#CA1243',
    purple: '#A626A4',
    cyan: '#0184BC',
    green: '#50A14F',
    yellow: '#C18401',
    red: '#E45649',
    orange: '#986801',
  },
  'slack-aubergine-dark-editor': {
    surface: '#4F384A',
    background: '#3E313C',
    input: '#4F384A',
    selection: '#8A7A86',
    comment: '#697098',
    foreground: '#F6F6F4',
    brightForeground: '#FFFFFF',
    pink: '#FF5572',
    purple: '#C792EA',
    cyan: '#82AAFF',
    green: '#C3E88D',
    yellow: '#FFCB6B',
    red: '#F44C5E',
    orange: '#F78C6C',
  },
  'github-light-theme-gray': {
    surface: '#F0F0F0',
    background: '#F0F0F0',
    input: '#F0F0F0',
    selection: '#FED442',
    comment: '#6A737D',
    foreground: '#000000',
    brightForeground: '#000000',
    pink: '#D73A49',
    purple: '#6F42C1',
    cyan: '#005CC5',
    green: '#22863A',
    yellow: '#735C0F',
    red: '#D73A49',
    orange: '#E36209',
  },
  'winter-is-coming-dark': {
    surface: '#0B2942',
    background: '#282822',
    input: '#0B253A',
    selection: '#103362',
    comment: '#999999',
    foreground: '#A7DBF7',
    brightForeground: '#D6DEEB',
    pink: '#D29FFC',
    purple: '#C792EA',
    cyan: '#57CDFF',
    green: '#78BD65',
    yellow: '#F7ECB5',
    red: '#EF5350',
    orange: '#FFCA28',
  },
  alabaster: {
    surface: '#F0F0F0',
    background: '#F7F7F7',
    input: '#FFFFFF',
    selection: '#BFDBFE',
    comment: '#AA3731',
    foreground: '#000000',
    brightForeground: '#434343',
    pink: '#E64CE6',
    purple: '#7A3E9D',
    cyan: '#0083B2',
    green: '#448C27',
    yellow: '#CB9000',
    red: '#AA3731',
    orange: '#FFBC5D',
  },
  'vue-theme-high-contrast': {
    surface: '#002933',
    background: '#002933',
    input: '#002933',
    selection: '#000000',
    comment: '#9E9E9E',
    foreground: '#E6E6E6',
    brightForeground: '#FFFFFF',
    pink: '#FF6A9B',
    purple: '#DD8AA3',
    cyan: '#09CBDD',
    green: '#64FFDB',
    yellow: '#FFBE79',
    red: '#FF0E56',
    orange: '#FF5622',
  },
  'visual-studio-light-cpp': {
    surface: '#F3F3F3',
    background: '#FFFFFF',
    input: '#F3F3F3',
    selection: '#ADD6FF80',
    comment: '#008000',
    foreground: '#000000',
    brightForeground: '#000000',
    pink: '#811F3F',
    purple: '#000080',
    cyan: '#2B91AF',
    green: '#098658',
    yellow: '#800000',
    red: '#CD3131',
    orange: '#A31515',
  },
};

function resolveThemeOption(themeId: string, options: readonly ColorThemeOption[] = defaultColorThemeOptions): ColorThemeOption {
  return options.find((option) => option.value === themeId)
    ?? defaultColorThemeOptions.find((option) => option.value === themeId)
    ?? defaultColorThemeOptions[0]!;
}

function createResolvedTheme(themeId: string, options: readonly ColorThemeOption[] = defaultColorThemeOptions): ResolvedColorTheme {
  const option = resolveThemeOption(themeId, options);
  const preview = defaultThemePreviews[option.value] ?? defaultThemePreviews['vscode-2026-dark']!;

  return {
    id: option.value,
    label: option.label,
    description: option.description,
    author: option.author,
    kind: option.kind,
    source: option.source,
    colors: {
      'editor.background': preview.background,
      foreground: preview.foreground,
      'panel.background': preview.surface,
    },
    tokenColors: [],
    semanticHighlighting: true,
    semanticTokenColors: {},
  };
}

function applyThemeSelection(themeId: string) {
  const option = resolveThemeOption(themeId, themeMockState.availableThemes);
  themeMockState.themeId = option.value;
  themeMockState.theme = option.kind;
  themeMockState.activeTheme = createResolvedTheme(option.value, themeMockState.availableThemes);
}

interface EditorSettingsMockState {
  bracketPairGuides: boolean;
  cursorBlinking: string;
  fontFamily: string;
  fontLigatures: boolean;
  fontSize: number;
  foldingStrategy: string;
  glyphMargin: boolean;
  inlineGitDiffEnabled: boolean;
  inlineGitDiffStateBackgroundsEnabled: boolean;
  indentGuides: boolean;
  lineNumbers: string;
  minimapEnabled: boolean;
  renderControlCharacters: boolean;
  renderWhitespace: string;
  scrollBeyondLastLine: boolean;
  smoothScrolling: boolean;
  tabSize: number;
  theme: string;
  wordWrap: string;
}

interface UserMockState {
  errorMessage: string | null;
  isSyncing: boolean;
  session: DesktopAuthSession | null;
  status: 'loading' | 'signed-in' | 'signed-out';
}

const defaultEditorSettingsMockState: EditorSettingsMockState = {
  bracketPairGuides: true,
  cursorBlinking: 'smooth',
  fontFamily: 'jetbrains-mono',
  fontLigatures: true,
  fontSize: 13,
  foldingStrategy: 'indentation',
  glyphMargin: true,
  inlineGitDiffEnabled: true,
  inlineGitDiffStateBackgroundsEnabled: true,
  indentGuides: true,
  lineNumbers: 'on',
  minimapEnabled: true,
  renderControlCharacters: false,
  renderWhitespace: 'selection',
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  tabSize: 4,
  theme: 'dracula',
  wordWrap: 'off',
};

interface SchematicSettingsMockState {
  alignmentGuidesEnabled: boolean;
  gridEnabled: boolean;
  gridSize: number;
  snapToGrid: boolean;
}

const defaultSchematicSettingsMockState: SchematicSettingsMockState = {
  alignmentGuidesEnabled: true,
  gridEnabled: true,
  gridSize: 40,
  snapToGrid: true,
};

const defaultUserMockState: UserMockState = {
  errorMessage: null,
  isSyncing: false,
  session: null,
  status: 'signed-out',
};

const editorSettingsMockState: EditorSettingsMockState = { ...defaultEditorSettingsMockState };
const schematicSettingsMockState: SchematicSettingsMockState = { ...defaultSchematicSettingsMockState };
const themeMockState: {
  activeTheme: ResolvedColorTheme;
  availableThemes: ColorThemeOption[];
  importedThemes: Array<{ author: string; description: string; id: string; kind: 'light' | 'dark'; label: string; path: string }>;
  isImportingTheme: boolean;
  theme: 'light' | 'dark';
  themeId: string;
} = {
  activeTheme: createResolvedTheme('vscode-2026-dark'),
  availableThemes: [...defaultColorThemeOptions],
  importedThemes: [],
  isImportingTheme: false,
  theme: 'dark',
  themeId: 'vscode-2026-dark',
};
export const userMockState: UserMockState = { ...defaultUserMockState };

vi.mock('../../../context/EditorSettingsContext', () => ({
  useEditorSettings: () => ({
    bracketPairGuides: editorSettingsMockState.bracketPairGuides,
    cursorBlinking: editorSettingsMockState.cursorBlinking,
    fontFamilies: [],
    fontFamily: editorSettingsMockState.fontFamily,
    fontLigatures: editorSettingsMockState.fontLigatures,
    fontSize: editorSettingsMockState.fontSize,
    foldingStrategy: editorSettingsMockState.foldingStrategy,
    glyphMargin: editorSettingsMockState.glyphMargin,
    inlineGitDiffEnabled: editorSettingsMockState.inlineGitDiffEnabled,
    inlineGitDiffStateBackgroundsEnabled: editorSettingsMockState.inlineGitDiffStateBackgroundsEnabled,
    indentGuides: editorSettingsMockState.indentGuides,
    lineNumbers: editorSettingsMockState.lineNumbers,
    minimapEnabled: editorSettingsMockState.minimapEnabled,
    renderControlCharacters: editorSettingsMockState.renderControlCharacters,
    renderWhitespace: editorSettingsMockState.renderWhitespace,
    scrollBeyondLastLine: editorSettingsMockState.scrollBeyondLastLine,
    smoothScrolling: editorSettingsMockState.smoothScrolling,
    tabSize: editorSettingsMockState.tabSize,
    setBracketPairGuides: setEditorBracketPairGuidesMock,
    setCursorBlinking: setEditorCursorBlinkingMock,
    setFontFamily: setEditorFontFamilyMock,
    setFontLigatures: setEditorFontLigaturesMock,
    setFontSize: setEditorFontSizeMock,
    setFoldingStrategy: setEditorFoldingStrategyMock,
    setGlyphMargin: setEditorGlyphMarginMock,
    setInlineGitDiffEnabled: setEditorInlineGitDiffEnabledMock,
    setInlineGitDiffStateBackgroundsEnabled: setEditorInlineGitDiffStateBackgroundsEnabledMock,
    setIndentGuides: setEditorIndentGuidesMock,
    setLineNumbers: setEditorLineNumbersMock,
    setMinimapEnabled: setEditorMinimapEnabledMock,
    setRenderControlCharacters: setEditorRenderControlCharactersMock,
    setRenderWhitespace: setEditorRenderWhitespaceMock,
    setScrollBeyondLastLine: setEditorScrollBeyondLastLineMock,
    setSmoothScrolling: setEditorSmoothScrollingMock,
    setTabSize: setEditorTabSizeMock,
    setTheme: setEditorThemeMock,
    setWordWrap: setEditorWordWrapMock,
    theme: editorSettingsMockState.theme,
    themes: [],
    wordWrap: editorSettingsMockState.wordWrap,
  }),
}));

vi.mock('../../../context/SchematicSettingsContext', () => ({
  useSchematicSettings: () => ({
    alignmentGuidesEnabled: schematicSettingsMockState.alignmentGuidesEnabled,
    gridEnabled: schematicSettingsMockState.gridEnabled,
    gridSize: schematicSettingsMockState.gridSize,
    snapToGrid: schematicSettingsMockState.snapToGrid,
    setAlignmentGuidesEnabled: setSchematicAlignmentGuidesEnabledMock,
    setGridEnabled: setSchematicGridEnabledMock,
    setGridSize: setSchematicGridSizeMock,
    setSnapToGrid: setSchematicSnapToGridMock,
  }),
}));

vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: themeMockState.theme,
    themeId: themeMockState.themeId,
    activeTheme: themeMockState.activeTheme,
    availableThemes: themeMockState.availableThemes,
    importedThemes: themeMockState.importedThemes,
    isImportingTheme: themeMockState.isImportingTheme,
    getThemePreview: getThemePreviewMock,
    importTheme: importThemeMock,
    setTheme: setThemeMock,
    toggleTheme: toggleThemeMock,
  }),
}));

vi.mock('../../../context/UserContext', () => ({
  useUser: () => ({
    clearError: clearUserErrorMock,
    errorMessage: userMockState.errorMessage,
    isSyncing: userMockState.isSyncing,
    openAccountPage: openAccountPageMock,
    session: userMockState.session,
    signOut: signOutMock,
    status: userMockState.status,
    syncCloudConfig: syncCloudConfigMock,
  }),
}));

vi.mock('../../../editor/fontLoader', () => ({
  ensureEditorFontFamilyLoaded: (fontFamily: string) => ensureEditorFontFamilyLoadedMock(fontFamily),
}));

function resetContextMockState() {
  Object.assign(editorSettingsMockState, defaultEditorSettingsMockState);
  Object.assign(schematicSettingsMockState, defaultSchematicSettingsMockState);
  Object.assign(userMockState, defaultUserMockState);
  themeMockState.availableThemes = [...defaultColorThemeOptions];
  themeMockState.importedThemes = [];
  themeMockState.isImportingTheme = false;
  applyThemeSelection('vscode-2026-dark');
}

function resetEditorSettingsMocks() {
  ensureEditorFontFamilyLoadedMock.mockReset();
  ensureEditorFontFamilyLoadedMock.mockResolvedValue(undefined);
  setEditorBracketPairGuidesMock.mockReset();
  setEditorCursorBlinkingMock.mockReset();
  setEditorFontFamilyMock.mockReset();
  setEditorFontLigaturesMock.mockReset();
  setEditorFontSizeMock.mockReset();
  setEditorFoldingStrategyMock.mockReset();
  setEditorGlyphMarginMock.mockReset();
  setEditorInlineGitDiffEnabledMock.mockReset();
  setEditorInlineGitDiffStateBackgroundsEnabledMock.mockReset();
  setEditorIndentGuidesMock.mockReset();
  setEditorLineNumbersMock.mockReset();
  setEditorMinimapEnabledMock.mockReset();
  setEditorRenderControlCharactersMock.mockReset();
  setEditorRenderWhitespaceMock.mockReset();
  setEditorScrollBeyondLastLineMock.mockReset();
  setEditorSmoothScrollingMock.mockReset();
  setEditorTabSizeMock.mockReset();
  setEditorThemeMock.mockReset();
  setEditorWordWrapMock.mockReset();
}

function resetSchematicSettingsMocks() {
  setSchematicAlignmentGuidesEnabledMock.mockReset();
  setSchematicGridEnabledMock.mockReset();
  setSchematicGridSizeMock.mockReset();
  setSchematicSnapToGridMock.mockReset();
}

function resetThemeMocks() {
  importThemeMock.mockReset();
  importThemeMock.mockResolvedValue(null);
  getThemePreviewMock.mockReset();
  getThemePreviewMock.mockImplementation((themeId: string) => defaultThemePreviews[themeId] ?? defaultThemePreviews['vscode-2026-dark']!);
  setThemeMock.mockReset();
  setThemeMock.mockImplementation((theme: string) => {
    if (theme === 'light') {
      applyThemeSelection('vscode-2026-light');
      return;
    }

    if (theme === 'dark') {
      applyThemeSelection('vscode-2026-dark');
      return;
    }

    applyThemeSelection(theme);
  });
  toggleThemeMock.mockReset();
  toggleThemeMock.mockImplementation(() => {
    applyThemeSelection(themeMockState.theme === 'dark' ? 'vscode-2026-light' : 'vscode-2026-dark');
  });
}

function resetUserMocks() {
  clearUserErrorMock.mockReset();
  openAccountPageMock.mockReset();
  openAccountPageMock.mockResolvedValue(true);
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(true);
  syncCloudConfigMock.mockReset();
  syncCloudConfigMock.mockResolvedValue(true);
}

function resetWorkspaceCommandMocks() {
  undoActionRun.mockClear();
  redoActionRun.mockClear();
}

function resetElectronApiMocks() {
  window.electronAPI!.platform = 'win32';
  vi.mocked(window.electronAPI!.minimize).mockReset();
  vi.mocked(window.electronAPI!.maximize).mockReset();
  vi.mocked(window.electronAPI!.close).mockReset();
  vi.mocked(window.electronAPI!.isMaximized).mockReset();
  vi.mocked(window.electronAPI!.isMaximized).mockReturnValue(false);
  vi.mocked(window.electronAPI!.isFullScreen).mockReset();
  vi.mocked(window.electronAPI!.isFullScreen).mockReturnValue(false);
  vi.mocked(window.electronAPI!.onMaximizedChange).mockReset();
  vi.mocked(window.electronAPI!.onMaximizedChange).mockImplementation(() => vi.fn());
  vi.mocked(window.electronAPI!.onFullScreenChange).mockReset();
  vi.mocked(window.electronAPI!.onFullScreenChange).mockImplementation(() => vi.fn());
  vi.mocked(window.electronAPI!.config.get).mockReset();
  vi.mocked(window.electronAPI!.config.set).mockReset();
  vi.mocked(window.electronAPI!.setFloatingInfoWindowVisible).mockReset();
  vi.mocked(window.electronAPI!.menu.onCommand).mockReset();
  vi.mocked(window.electronAPI!.notices.revealBundledFiles).mockReset();
  vi.mocked(window.electronAPI!.notices.revealBundledFiles).mockResolvedValue(true);
}

beforeEach(() => {
  resetMenuChromeStoreForTests();
  resetProjectDialogStoreForTests();
  resetSettingsDialogSessionForTests();
  resetWorkspaceSessionStoreForTests();
  resetContextMockState();
  resetEditorSettingsMocks();
  resetSchematicSettingsMocks();
  resetThemeMocks();
  resetUserMocks();
  resetWorkspaceCommandMocks();
  resetElectronApiMocks();
});

export type PersistedSettingsOptions = {
  bracketPairGuides?: boolean;
  closeAction?: 'quit' | 'tray';
  colorTheme?: string;
  cursorBlinking?: string;
  floatingInfoWindowVisible?: boolean;
  fontFamily?: string;
  fontLigatures?: boolean;
  fontSize?: number;
  foldingStrategy?: string;
  glyphMargin?: boolean;
  inlineGitDiffEnabled?: boolean;
  inlineGitDiffStateBackgroundsEnabled?: boolean;
  indentGuides?: boolean;
  lineNumbers?: string;
  minimapEnabled?: boolean;
  notificationDismissSeconds?: number;
  progressHideCompleted?: boolean;
  renderControlCharacters?: boolean;
  renderWhitespace?: string;
  scrollBeyondLastLine?: boolean;
  smoothScrolling?: boolean;
  tabSize?: number;
  editorTheme?: string;
  codeViewerLayoutMode?: CodeViewerLayoutMode;
  themePickerLayoutMode?: 'grouped' | 'list';
  wordWrap?: string;
};

export function mockPersistedSettingsConfig(options: PersistedSettingsOptions = {}) {
  const persisted = {
    bracketPairGuides: true,
    closeAction: 'quit' as const,
    colorTheme: 'vscode-2026-dark',
    cursorBlinking: 'smooth',
    floatingInfoWindowVisible: false,
    fontFamily: 'jetbrains-mono',
    fontLigatures: true,
    fontSize: 13,
    foldingStrategy: 'indentation',
    glyphMargin: true,
    inlineGitDiffEnabled: true,
    inlineGitDiffStateBackgroundsEnabled: true,
    indentGuides: true,
    lineNumbers: 'on',
    minimapEnabled: true,
    notificationDismissSeconds: 5,
    progressHideCompleted: true,
    renderControlCharacters: false,
    renderWhitespace: 'selection',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 4,
    editorTheme: 'dracula',
    codeViewerLayoutMode: 'minimal' as const,
    themePickerLayoutMode: 'list' as const,
    wordWrap: 'off',
    ...options,
  };

  applyThemeSelection(persisted.colorTheme);

  vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) => {
    switch (key) {
      case 'workbench.colorTheme':
        return persisted.colorTheme;
      case 'workbench.importedColorThemes':
        return themeMockState.importedThemes;
      case 'workbench.themePickerLayoutMode':
        return persisted.themePickerLayoutMode;
      case 'workbench.codeViewerLayoutMode':
        return persisted.codeViewerLayoutMode;
      case 'editor.guides.bracketPairs':
        return persisted.bracketPairGuides;
      case 'window.closeActionPreference':
        return persisted.closeAction;
      case 'editor.cursorBlinking':
        return persisted.cursorBlinking;
      case 'ui.floatingInfoWindow.visible':
        return persisted.floatingInfoWindowVisible;
      case 'editor.fontFamily':
        return persisted.fontFamily;
      case 'editor.fontLigatures':
        return persisted.fontLigatures;
      case 'editor.fontSize':
        return persisted.fontSize;
      case 'editor.foldingStrategy':
        return persisted.foldingStrategy;
      case 'editor.glyphMargin':
        return persisted.glyphMargin;
      case 'editor.inlineGitDiff.enabled':
        return persisted.inlineGitDiffEnabled;
      case 'editor.inlineGitDiff.stateBackgrounds.enabled':
        return persisted.inlineGitDiffStateBackgroundsEnabled;
      case 'editor.guides.indentation':
        return persisted.indentGuides;
      case 'editor.lineNumbers':
        return persisted.lineNumbers;
      case 'editor.minimap.enabled':
        return persisted.minimapEnabled;
      case 'notifications.dismissSeconds':
        return persisted.notificationDismissSeconds;
      case 'progress.hideCompleted':
        return persisted.progressHideCompleted;
      case 'editor.renderControlCharacters':
        return persisted.renderControlCharacters;
      case 'editor.renderWhitespace':
        return persisted.renderWhitespace;
      case 'editor.scrollBeyondLastLine':
        return persisted.scrollBeyondLastLine;
      case 'editor.smoothScrolling':
        return persisted.smoothScrolling;
      case 'editor.tabSize':
        return persisted.tabSize;
      case 'editor.theme':
        return persisted.editorTheme;
      case 'editor.wordWrap':
        return persisted.wordWrap;
      default:
        return null;
    }
  });

  return persisted;
}

export interface MenuBarTestHarnessProps {
  menuBarProps?: React.ComponentProps<typeof MenuBar>;
  withWorkspaceControls?: boolean;
}

export function MenuBarTestHarness({
  menuBarProps = {},
  withWorkspaceControls = false,
}: MenuBarTestHarnessProps) {
  return (
    <SidebarProvider defaultOpen={false} keyboardShortcut={false}>
      <WorkspaceProvider>
        <CodeViewerLayoutProvider>
          <SidebarStateProbe />
          {withWorkspaceControls && <WorkspaceControls />}
          <MenuBar {...menuBarProps} />
        </CodeViewerLayoutProvider>
      </WorkspaceProvider>
    </SidebarProvider>
  );
}

export function renderMenuBar(props: React.ComponentProps<typeof MenuBar> = {}) {
  return render(
    <MenuBarTestHarness menuBarProps={props} />,
  );
}

export function renderMenuBarWithControls(props: React.ComponentProps<typeof MenuBar> = {}) {
  return render(
    <MenuBarTestHarness menuBarProps={props} withWorkspaceControls />,
  );
}

function SidebarStateProbe() {
  const { state } = useSidebar();

  return <span data-testid="sidebar-state">{state}</span>;
}

function WorkspaceControls() {
  const {
    openFile,
    registerEditorRef,
    setActiveView,
    setMainContentView,
    updateFileContentInGroup,
  } = useWorkspace();

  return (
    <div>
      <button type="button" onClick={() => setActiveView('simulation')}>set-simulation</button>
      <button type="button" onClick={() => setActiveView('synthesis')}>set-synthesis</button>
      <button type="button" onClick={() => setActiveView('physical')}>set-physical</button>
      <button type="button" onClick={() => setActiveView('factory')}>set-factory</button>
      <button type="button" onClick={() => setMainContentView('whiteboard')}>set-whiteboard</button>
      <button type="button" onClick={() => setMainContentView('code')}>set-code</button>
      <button type="button" onClick={() => openFile('rtl/core/reg_file.v', 'reg_file.v')}>open-reg</button>
      <button type="button" onClick={() => openFile('rtl/core/alu.v', 'alu.v')}>open-alu</button>
      <button type="button" onClick={() => updateFileContentInGroup('group-1', 'rtl/core/reg_file.v', 'module reg_file; logic dirty; endmodule')}>edit-reg</button>
      <button type="button" onClick={() => updateFileContentInGroup('group-1', 'rtl/core/alu.v', 'module alu; logic dirty; endmodule')}>edit-alu</button>
      <button type="button" onClick={() => registerEditorRef('group-1', {
        getAction: (actionId: string) => ({ run: actionId === 'undo' ? undoActionRun : redoActionRun }),
      })}>register-editor</button>
    </div>
  );
}

export function hasNormalizedTextContent(expectedText: string) {
  const normalizedExpectedText = expectedText.replace(/\s+/g, '');

  return (_content: string, element?: Element | null) =>
    element?.textContent?.replace(/\s+/g, '') === normalizedExpectedText;
}

export async function clickByText(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByText(text));
}

export async function clickByTestId(user: ReturnType<typeof userEvent.setup>, testId: string) {
  await user.click(screen.getByTestId(testId));
}

export async function lockApplicationMenuBar(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.getByTestId('menu-menubar-toggle');
  const shell = screen.getByTestId('menu-menubar-shell');

  if (shell.getAttribute('data-locked') !== 'true') {
    await user.click(toggle);
  }

  expect(shell).toHaveAttribute('data-locked', 'true');
  expect(shell).toHaveAttribute('data-expanded', 'true');
  expect(await screen.findByText('File')).toBeVisible();
}
