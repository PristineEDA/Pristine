import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Bot, CircuitBoard, Code2, Cpu, Monitor, Palette, Search, Settings2, Shapes, Workflow, X, type LucideIcon } from 'lucide-react';
import { useEditorSettings } from '../../../context/EditorSettingsContext';
import { useSchematicSettings } from '../../../context/SchematicSettingsContext';
import {
  WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY,
  parseCodeViewerLayoutMode,
  useCodeViewerLayout,
  type CodeViewerLayoutMode,
} from '../../../context/CodeViewerLayoutContext';
import { useTheme } from '../../../context/ThemeContext';
import {
  DEFAULT_EDITOR_BRACKET_PAIR_GUIDES,
  DEFAULT_EDITOR_FONT_LIGATURES,
  DEFAULT_EDITOR_GLYPH_MARGIN,
  DEFAULT_EDITOR_INLINE_GIT_DIFF_ENABLED,
  DEFAULT_EDITOR_INLINE_GIT_DIFF_STATE_BACKGROUNDS_ENABLED,
  DEFAULT_EDITOR_INDENT_GUIDES,
  DEFAULT_EDITOR_MINIMAP_ENABLED,
  DEFAULT_EDITOR_SCROLL_BEYOND_LAST_LINE,
  DEFAULT_EDITOR_SMOOTH_SCROLLING,
  EDITOR_BRACKET_PAIR_GUIDES_CONFIG_KEY,
  EDITOR_CURSOR_BLINKING_CONFIG_KEY,
  EDITOR_FOLDING_STRATEGY_CONFIG_KEY,
  EDITOR_FONT_FAMILY_CONFIG_KEY,
  EDITOR_FONT_LIGATURES_CONFIG_KEY,
  EDITOR_FONT_SIZE_CONFIG_KEY,
  EDITOR_GLYPH_MARGIN_CONFIG_KEY,
  EDITOR_INLINE_GIT_DIFF_ENABLED_CONFIG_KEY,
  EDITOR_INLINE_GIT_DIFF_STATE_BACKGROUNDS_ENABLED_CONFIG_KEY,
  EDITOR_INDENT_GUIDES_CONFIG_KEY,
  EDITOR_LINE_NUMBERS_CONFIG_KEY,
  EDITOR_MINIMAP_ENABLED_CONFIG_KEY,
  EDITOR_RENDER_CONTROL_CHARACTERS_CONFIG_KEY,
  EDITOR_RENDER_WHITESPACE_CONFIG_KEY,
  EDITOR_SCROLL_BEYOND_LAST_LINE_CONFIG_KEY,
  EDITOR_SMOOTH_SCROLLING_CONFIG_KEY,
  EDITOR_TAB_SIZE_CONFIG_KEY,
  EDITOR_WORD_WRAP_CONFIG_KEY,
  editorCursorBlinkingOptions,
  editorFoldingStrategyOptions,
  editorFontFamilyOptions,
  editorLineNumbersOptions,
  editorRenderWhitespaceOptions,
  editorTabSizeOptions,
  editorWordWrapOptions,
  parseEditorCursorBlinking,
  parseEditorFoldingStrategy,
  parseEditorFontFamily,
  parseEditorFontSize,
  parseEditorLineNumbers,
  parseEditorRenderControlCharacters,
  parseEditorRenderWhitespace,
  parseEditorTabSize,
  parseEditorWordWrap,
} from '../../../editor/editorSettings';
import {
  MAX_SCHEMATIC_GRID_SIZE,
  MIN_SCHEMATIC_GRID_SIZE,
  SCHEMATIC_ALIGNMENT_GUIDES_ENABLED_CONFIG_KEY,
  SCHEMATIC_GRID_ENABLED_CONFIG_KEY,
  SCHEMATIC_GRID_SIZE_CONFIG_KEY,
  SCHEMATIC_SNAP_TO_GRID_CONFIG_KEY,
  parseSchematicAlignmentGuidesEnabled,
  parseSchematicGridEnabled,
  parseSchematicGridSize,
  parseSchematicSnapToGrid,
} from '../../../schematic/schematicSettings';
import {
  parseConfiguredColorThemeId,
  parseImportedColorThemeRecords,
  WORKBENCH_COLOR_THEME_CONFIG_KEY,
  WORKBENCH_IMPORTED_THEMES_CONFIG_KEY,
} from '../../../theme/colorThemeRegistry';
import type { ColorThemeOption } from '../../../theme/colorThemeTypes';
import { Button } from '../../ui/button';
import { Combobox, type ComboboxOption } from '../../ui/combobox';
import {
  commandSearchInputClassName,
  commandSearchInputForegroundStyle,
  commandSearchInputIconClassName,
  commandSearchInputWrapperClassName,
} from '../../ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import { ScrollArea } from '../../ui/scroll-area';
import { Slider } from '../../ui/slider';
import { Switch } from '../../ui/switch';
import { cn } from '@/lib/utils';
import { setProgressHideCompleted } from '../../../progress/useProgressStore';
import { parseWslUbuntuDistro, wslUbuntuDistroOptions, type WslUbuntuDistro } from '../../../../../types/wsl';
import { EditorFontAdvancedDialog } from './EditorFontAdvancedDialog';
import { EditorThemeAdvancedDialog } from './EditorThemeAdvancedDialog';
import { ColorThemePreviewCard, EditorFontPreviewCard } from './PickerPreviewCards';
import { useSettingsDialogSessionStore, type SettingsPageId } from './useSettingsDialogSessionStore';

const CLOSE_ACTION_CONFIG_KEY = 'window.closeActionPreference';
const FLOATING_INFO_VISIBLE_CONFIG_KEY = 'ui.floatingInfoWindow.visible';
const NOTIFICATION_DISMISS_SECONDS_CONFIG_KEY = 'notifications.dismissSeconds';
const PROGRESS_HIDE_COMPLETED_CONFIG_KEY = 'progress.hideCompleted';
export const EDA_WSL_UBUNTU_DISTRO_CONFIG_KEY = 'eda.wslUbuntuDistro';
const DEFAULT_NOTIFICATION_DISMISS_SECONDS = 5;
const MIN_NOTIFICATION_DISMISS_SECONDS = 1;
const MAX_NOTIFICATION_DISMISS_SECONDS = 10;
const THEME_PICKER_LAYOUT_MODE_CONFIG_KEY = 'workbench.themePickerLayoutMode';
const settingsSectionClassName = 'overflow-hidden rounded-md border border-border/75 bg-background/35';
const settingsSectionTitleClassName = 'text-[13px] font-medium';
const settingsSectionDescriptionClassName = 'text-[12px] text-muted-foreground';

type ThemePickerLayoutMode = 'grouped' | 'list';
interface SettingsPageMetadata {
  id: SettingsPageId;
  description: string;
  icon: LucideIcon;
  label: string;
}

interface SettingsItemDefinition {
  description: string;
  element: ReactNode;
  id: string;
  keywords: string[];
  pageId: SettingsPageId;
  title: string;
}

const settingsPages: SettingsPageMetadata[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Core workbench layout preferences.',
    icon: Settings2,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme and visual presentation.',
    icon: Palette,
  },
  {
    id: 'editor',
    label: 'Editor',
    description: 'Code editing fonts, behavior, and display aids.',
    icon: Code2,
  },
  {
    id: 'design',
    label: 'Design',
    description: 'Design workspace preferences.',
    icon: Shapes,
  },
  {
    id: 'schematic',
    label: 'Schematic',
    description: 'Canvas grid, snapping, and alignment preferences.',
    icon: CircuitBoard,
  },
  {
    id: 'eda',
    label: 'EDA',
    description: 'EDA tool preferences.',
    icon: Workflow,
  },
  {
    id: 'pdk',
    label: 'PDK',
    description: 'Process design kit preferences.',
    icon: Cpu,
  },
  {
    id: 'agent',
    label: 'Agent',
    description: 'Agent service preferences.',
    icon: Bot,
  },
  {
    id: 'window',
    label: 'Window',
    description: 'Window closing and floating info behavior.',
    icon: Monitor,
  },
];
const defaultSettingsPage = settingsPages[0] as SettingsPageMetadata;

const codeViewerLayoutModeOptions: Array<{
  value: CodeViewerLayoutMode;
  label: string;
  description: string;
}> = [
  {
    value: 'compact',
    label: 'Compact',
    description: 'Use the current dense code viewer layout.',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Use rounded, separated code viewer regions with lighter chrome.',
  },
];

const wslUbuntuDistroSettingOptions: Array<{
  value: WslUbuntuDistro;
  label: string;
  description: string;
}> = wslUbuntuDistroOptions.map((value) => ({
  value,
  label: value,
  description: value === 'Ubuntu-24.04'
    ? 'Use Ubuntu 24.04 for the Pristine EDA WSL environment.'
    : 'Use Ubuntu 22.04 for the Pristine EDA WSL environment.',
}));

export interface MenuBarSettingsState {
  codeViewerLayoutMode: CodeViewerLayoutMode;
  closeToTrayEnabled: boolean;
  floatingInfoWindowVisible: boolean;
  notificationDismissSeconds: number;
  progressHideCompleted: boolean;
  wslUbuntuDistro: WslUbuntuDistro;
  themeId: string;
  themePickerLayoutMode: ThemePickerLayoutMode;
  editorCursorBlinking: ReturnType<typeof getConfiguredEditorCursorBlinking>;
  editorBracketPairGuides: ReturnType<typeof getConfiguredEditorBracketPairGuides>;
  editorFontFamily: ReturnType<typeof getConfiguredEditorFontFamily>;
  editorFontLigatures: ReturnType<typeof getConfiguredEditorFontLigatures>;
  editorFontSize: ReturnType<typeof getConfiguredEditorFontSize>;
  editorFoldingStrategy: ReturnType<typeof getConfiguredEditorFoldingStrategy>;
  editorGlyphMargin: ReturnType<typeof getConfiguredEditorGlyphMargin>;
  editorInlineGitDiffEnabled: ReturnType<typeof getConfiguredEditorInlineGitDiffEnabled>;
  editorInlineGitDiffStateBackgroundsEnabled: ReturnType<typeof getConfiguredEditorInlineGitDiffStateBackgroundsEnabled>;
  editorIndentGuides: ReturnType<typeof getConfiguredEditorIndentGuides>;
  editorLineNumbers: ReturnType<typeof getConfiguredEditorLineNumbers>;
  editorMinimapEnabled: ReturnType<typeof getConfiguredEditorMinimapEnabled>;
  editorRenderControlCharacters: ReturnType<typeof getConfiguredEditorRenderControlCharacters>;
  editorRenderWhitespace: ReturnType<typeof getConfiguredEditorRenderWhitespace>;
  editorScrollBeyondLastLine: ReturnType<typeof getConfiguredEditorScrollBeyondLastLine>;
  editorSmoothScrolling: ReturnType<typeof getConfiguredEditorSmoothScrolling>;
  editorTabSize: ReturnType<typeof getConfiguredEditorTabSize>;
  editorWordWrap: ReturnType<typeof getConfiguredEditorWordWrap>;
  schematicAlignmentGuidesEnabled: ReturnType<typeof getConfiguredSchematicAlignmentGuidesEnabled>;
  schematicGridEnabled: ReturnType<typeof getConfiguredSchematicGridEnabled>;
  schematicGridSize: ReturnType<typeof getConfiguredSchematicGridSize>;
  schematicSnapToGrid: ReturnType<typeof getConfiguredSchematicSnapToGrid>;
}

function getConfiguredCloseAction(): 'quit' | 'tray' {
  const value = window.electronAPI?.config.get(CLOSE_ACTION_CONFIG_KEY);
  return value === 'tray' ? 'tray' : 'quit';
}

function getFloatingInfoWindowVisible(): boolean {
  return window.electronAPI?.config.get(FLOATING_INFO_VISIBLE_CONFIG_KEY) === true;
}

function parseNotificationDismissSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_NOTIFICATION_DISMISS_SECONDS;
  }

  return Math.min(
    MAX_NOTIFICATION_DISMISS_SECONDS,
    Math.max(MIN_NOTIFICATION_DISMISS_SECONDS, Math.round(value)),
  );
}

function getConfiguredNotificationDismissSeconds(): number {
  return parseNotificationDismissSeconds(window.electronAPI?.config.get(NOTIFICATION_DISMISS_SECONDS_CONFIG_KEY));
}

function getConfiguredProgressHideCompleted(): boolean {
  return window.electronAPI?.config.get(PROGRESS_HIDE_COMPLETED_CONFIG_KEY) !== false;
}

export function getConfiguredWslUbuntuDistro(): WslUbuntuDistro {
  return parseWslUbuntuDistro(window.electronAPI?.config.get(EDA_WSL_UBUNTU_DISTRO_CONFIG_KEY));
}

function getConfiguredThemeId(): string {
  return parseConfiguredColorThemeId(
    window.electronAPI?.config.get(WORKBENCH_COLOR_THEME_CONFIG_KEY),
    parseImportedColorThemeRecords(window.electronAPI?.config.get(WORKBENCH_IMPORTED_THEMES_CONFIG_KEY)),
  );
}

function parseThemePickerLayoutMode(value: unknown): ThemePickerLayoutMode {
  return value === 'grouped' ? 'grouped' : 'list';
}

function getConfiguredThemePickerLayoutMode(): ThemePickerLayoutMode {
  return parseThemePickerLayoutMode(window.electronAPI?.config.get(THEME_PICKER_LAYOUT_MODE_CONFIG_KEY));
}

function getConfiguredCodeViewerLayoutMode(): CodeViewerLayoutMode {
  return parseCodeViewerLayoutMode(window.electronAPI?.config.get(WORKBENCH_CODE_VIEWER_LAYOUT_MODE_CONFIG_KEY));
}

function getConfiguredEditorFontSize(): number {
  return parseEditorFontSize(window.electronAPI?.config.get(EDITOR_FONT_SIZE_CONFIG_KEY));
}

function getConfiguredEditorFontFamily() {
  return parseEditorFontFamily(window.electronAPI?.config.get(EDITOR_FONT_FAMILY_CONFIG_KEY));
}

function getConfiguredEditorWordWrap() {
  return parseEditorWordWrap(window.electronAPI?.config.get(EDITOR_WORD_WRAP_CONFIG_KEY));
}

function getConfiguredEditorRenderWhitespace() {
  return parseEditorRenderWhitespace(window.electronAPI?.config.get(EDITOR_RENDER_WHITESPACE_CONFIG_KEY));
}

function getConfiguredEditorFontLigatures() {
  return getConfiguredEditorBooleanSetting(EDITOR_FONT_LIGATURES_CONFIG_KEY, DEFAULT_EDITOR_FONT_LIGATURES);
}

function getConfiguredEditorTabSize() {
  return parseEditorTabSize(window.electronAPI?.config.get(EDITOR_TAB_SIZE_CONFIG_KEY));
}

function getConfiguredEditorCursorBlinking() {
  return parseEditorCursorBlinking(window.electronAPI?.config.get(EDITOR_CURSOR_BLINKING_CONFIG_KEY));
}

function getConfiguredEditorRenderControlCharacters() {
  return parseEditorRenderControlCharacters(window.electronAPI?.config.get(EDITOR_RENDER_CONTROL_CHARACTERS_CONFIG_KEY));
}

function getConfiguredEditorLineNumbers() {
  return parseEditorLineNumbers(window.electronAPI?.config.get(EDITOR_LINE_NUMBERS_CONFIG_KEY));
}

function getConfiguredEditorSmoothScrolling() {
  return getConfiguredEditorBooleanSetting(EDITOR_SMOOTH_SCROLLING_CONFIG_KEY, DEFAULT_EDITOR_SMOOTH_SCROLLING);
}

function getConfiguredEditorScrollBeyondLastLine() {
  return getConfiguredEditorBooleanSetting(
    EDITOR_SCROLL_BEYOND_LAST_LINE_CONFIG_KEY,
    DEFAULT_EDITOR_SCROLL_BEYOND_LAST_LINE,
  );
}

function getConfiguredEditorFoldingStrategy() {
  return parseEditorFoldingStrategy(window.electronAPI?.config.get(EDITOR_FOLDING_STRATEGY_CONFIG_KEY));
}

function getConfiguredEditorBooleanSetting(configKey: string, defaultValue: boolean) {
  const value = window.electronAPI?.config.get(configKey);
  return typeof value === 'boolean' ? value : defaultValue;
}

function getConfiguredEditorMinimapEnabled() {
  return getConfiguredEditorBooleanSetting(EDITOR_MINIMAP_ENABLED_CONFIG_KEY, DEFAULT_EDITOR_MINIMAP_ENABLED);
}

function getConfiguredEditorGlyphMargin() {
  return getConfiguredEditorBooleanSetting(EDITOR_GLYPH_MARGIN_CONFIG_KEY, DEFAULT_EDITOR_GLYPH_MARGIN);
}

function getConfiguredEditorInlineGitDiffEnabled() {
  return getConfiguredEditorBooleanSetting(
    EDITOR_INLINE_GIT_DIFF_ENABLED_CONFIG_KEY,
    DEFAULT_EDITOR_INLINE_GIT_DIFF_ENABLED,
  );
}

function getConfiguredEditorInlineGitDiffStateBackgroundsEnabled() {
  return getConfiguredEditorBooleanSetting(
    EDITOR_INLINE_GIT_DIFF_STATE_BACKGROUNDS_ENABLED_CONFIG_KEY,
    DEFAULT_EDITOR_INLINE_GIT_DIFF_STATE_BACKGROUNDS_ENABLED,
  );
}

function getConfiguredEditorBracketPairGuides() {
  return getConfiguredEditorBooleanSetting(EDITOR_BRACKET_PAIR_GUIDES_CONFIG_KEY, DEFAULT_EDITOR_BRACKET_PAIR_GUIDES);
}

function getConfiguredEditorIndentGuides() {
  return getConfiguredEditorBooleanSetting(EDITOR_INDENT_GUIDES_CONFIG_KEY, DEFAULT_EDITOR_INDENT_GUIDES);
}

function getConfiguredSchematicGridEnabled() {
  return parseSchematicGridEnabled(window.electronAPI?.config.get(SCHEMATIC_GRID_ENABLED_CONFIG_KEY));
}

function getConfiguredSchematicGridSize() {
  return parseSchematicGridSize(window.electronAPI?.config.get(SCHEMATIC_GRID_SIZE_CONFIG_KEY));
}

function getConfiguredSchematicSnapToGrid() {
  return parseSchematicSnapToGrid(window.electronAPI?.config.get(SCHEMATIC_SNAP_TO_GRID_CONFIG_KEY));
}

function getConfiguredSchematicAlignmentGuidesEnabled() {
  return parseSchematicAlignmentGuidesEnabled(window.electronAPI?.config.get(SCHEMATIC_ALIGNMENT_GUIDES_ENABLED_CONFIG_KEY));
}

function getPersistedSettingsState(): MenuBarSettingsState {
  return {
    codeViewerLayoutMode: getConfiguredCodeViewerLayoutMode(),
    closeToTrayEnabled: getConfiguredCloseAction() === 'tray',
    floatingInfoWindowVisible: getFloatingInfoWindowVisible(),
    notificationDismissSeconds: getConfiguredNotificationDismissSeconds(),
    progressHideCompleted: getConfiguredProgressHideCompleted(),
    wslUbuntuDistro: getConfiguredWslUbuntuDistro(),
    themeId: getConfiguredThemeId(),
    themePickerLayoutMode: getConfiguredThemePickerLayoutMode(),
    editorCursorBlinking: getConfiguredEditorCursorBlinking(),
    editorBracketPairGuides: getConfiguredEditorBracketPairGuides(),
    editorFontFamily: getConfiguredEditorFontFamily(),
    editorFontLigatures: getConfiguredEditorFontLigatures(),
    editorFontSize: getConfiguredEditorFontSize(),
    editorFoldingStrategy: getConfiguredEditorFoldingStrategy(),
    editorGlyphMargin: getConfiguredEditorGlyphMargin(),
    editorInlineGitDiffEnabled: getConfiguredEditorInlineGitDiffEnabled(),
    editorInlineGitDiffStateBackgroundsEnabled: getConfiguredEditorInlineGitDiffStateBackgroundsEnabled(),
    editorIndentGuides: getConfiguredEditorIndentGuides(),
    editorLineNumbers: getConfiguredEditorLineNumbers(),
    editorMinimapEnabled: getConfiguredEditorMinimapEnabled(),
    editorRenderControlCharacters: getConfiguredEditorRenderControlCharacters(),
    editorRenderWhitespace: getConfiguredEditorRenderWhitespace(),
    editorScrollBeyondLastLine: getConfiguredEditorScrollBeyondLastLine(),
    editorSmoothScrolling: getConfiguredEditorSmoothScrolling(),
    editorTabSize: getConfiguredEditorTabSize(),
    editorWordWrap: getConfiguredEditorWordWrap(),
    schematicAlignmentGuidesEnabled: getConfiguredSchematicAlignmentGuidesEnabled(),
    schematicGridEnabled: getConfiguredSchematicGridEnabled(),
    schematicGridSize: getConfiguredSchematicGridSize(),
    schematicSnapToGrid: getConfiguredSchematicSnapToGrid(),
  };
}

function SettingsSwitchRow({
  checked,
  description,
  onCheckedChange,
  testId,
  title,
}: {
  checked: boolean;
  description: string;
  onCheckedChange: (checked: boolean) => void;
  testId: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className={settingsSectionTitleClassName}>{title}</p>
        <p className={settingsSectionDescriptionClassName} data-testid={`${testId}-description`}>
          {description}
        </p>
      </div>
      <Switch className="shrink-0" checked={checked} data-testid={testId} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SettingsComboboxSection({
  action,
  description,
  emptyText,
  onValueChange,
  options,
  previewPaneTestId,
  renderOptionPreview,
  searchPlaceholder,
  testId,
  title,
  value,
}: {
  action?: ReactNode;
  description: string;
  emptyText: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  previewPaneTestId?: string;
  renderOptionPreview?: (option: ComboboxOption) => ReactNode;
  searchPlaceholder: string;
  testId: string;
  title: string;
  value: string;
}) {
  return (
    <div className={settingsSectionClassName}>
      <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] md:items-center">
        <div className="min-w-0 space-y-1">
          <p className={settingsSectionTitleClassName}>{title}</p>
          <p className={settingsSectionDescriptionClassName} data-testid={`${testId}-description`}>
            {description}
          </p>
        </div>
        <div className="min-w-0">
          <div className={action ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2' : undefined}>
            <div className={action ? 'min-w-0 flex-1' : undefined}>
              <Combobox
                value={value}
                onValueChange={onValueChange}
                options={options}
                placeholder={options.find((option) => option.value === value)?.label ?? options[0]?.label ?? ''}
                previewPaneTestId={previewPaneTestId}
                renderOptionPreview={renderOptionPreview}
                searchPlaceholder={searchPlaceholder}
                emptyText={emptyText}
                triggerTestId={testId}
                getOptionTestId={(optionValue) => `${testId.replace('-combobox', '-option')}-${optionValue}`}
              />
            </div>
            {action}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSliderSection({
  children,
  description,
  title,
  testId,
}: {
  children: ReactNode;
  description: string;
  title: string;
  testId: string;
}) {
  return (
    <div className={settingsSectionClassName}>
      <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] md:items-center">
        <div className="min-w-0 space-y-1">
          <p className={settingsSectionTitleClassName}>{title}</p>
          <p className={settingsSectionDescriptionClassName} data-testid={`${testId}-description`}>
            {description}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsNumberSection({
  description,
  max,
  min,
  onValueChange,
  step,
  testId,
  title,
  unit,
  value,
}: {
  description: string;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  step: number;
  testId: string;
  title: string;
  unit: string;
  value: number;
}) {
  return (
    <div className={settingsSectionClassName}>
      <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] md:items-center">
        <div className="min-w-0 space-y-1">
          <p className={settingsSectionTitleClassName}>{title}</p>
          <p className={settingsSectionDescriptionClassName} data-testid={`${testId}-description`}>
            {description}
          </p>
        </div>
        <label
          className={cn(
            'flex h-9 min-w-0 items-center gap-2 rounded-md border border-ide-border bg-ide-tab-bg px-3',
            'text-ide-text',
          )}
          data-testid={`${testId}-control`}
        >
          <input
            aria-label={title}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-normal text-[var(--ide-text)] outline-none placeholder:text-ide-text-muted"
            data-testid={testId}
            max={max}
            min={min}
            onChange={(event) => onValueChange(Number(event.currentTarget.value))}
            step={step}
            style={{ color: 'var(--ide-text)' }}
            type="number"
            value={value}
          />
          <span className="shrink-0 text-[12px] font-medium text-ide-text-muted">{unit}</span>
        </label>
      </div>
    </div>
  );
}

function SettingsInfoSection({
  description,
  testId,
  title,
}: {
  description: string;
  testId: string;
  title: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/25 px-4 py-3">
      <div className="space-y-1">
        <p className={settingsSectionTitleClassName}>{title}</p>
        <p className={settingsSectionDescriptionClassName} data-testid={`${testId}-description`}>
          {description}
        </p>
      </div>
    </div>
  );
}

function SettingsItemSection({
  item,
}: {
  item: SettingsItemDefinition;
}) {
  return (
    <div data-testid={`settings-item-${item.id}`}>
      {item.element}
    </div>
  );
}

function SettingsItemsList({
  items,
}: {
  items: SettingsItemDefinition[];
}) {
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <SettingsItemSection key={item.id} item={item} />
      ))}
    </div>
  );
}

function SettingsSearchResults({
  items,
}: {
  items: SettingsItemDefinition[];
}) {
  if (items.length === 0) {
    return (
      <div
        className="flex min-h-56 flex-col items-center justify-center rounded-md border border-dashed border-border/80 bg-muted/20 px-6 text-center"
        data-testid="settings-search-empty-state"
      >
        <p className="text-[13px] font-medium text-foreground">No settings found</p>
        <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">
          Try searching by setting name, category, or a related keyword.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="settings-search-results">
      {settingsPages.map((page) => {
        const pageItems = items.filter((item) => item.pageId === page.id);

        if (pageItems.length === 0) {
          return null;
        }

        return (
          <section key={page.id} className="space-y-2.5" data-testid={`settings-search-results-${page.id}`}>
            <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              <page.icon className="size-3.5" />
              {page.label}
            </div>
            <SettingsItemsList items={pageItems} />
          </section>
        );
      })}
    </div>
  );
}

function SettingsPageContent({
  items,
  page,
}: {
  items: SettingsItemDefinition[];
  page: SettingsPageMetadata;
}) {
  const placeholderDescription = getSettingsPlaceholderDescription(page.id);

  return (
    <div className="space-y-4" data-testid={`settings-page-${page.id}`}>
      <div className="space-y-1">
        <p className="text-[18px] font-semibold leading-none text-foreground">{page.label}</p>
        <p className="text-[13px] text-muted-foreground">{page.description}</p>
      </div>
      {placeholderDescription ? (
        <SettingsInfoSection
          title={page.label}
          description={placeholderDescription}
          testId={`settings-${page.id}-placeholder`}
        />
      ) : (
        <SettingsItemsList items={items} />
      )}
    </div>
  );
}

function getSettingsPlaceholderDescription(pageId: SettingsPageId) {
  switch (pageId) {
    case 'design':
      return 'Design settings will appear here.';
    case 'pdk':
      return 'PDK settings will appear here.';
    case 'agent':
      return 'Agent settings will appear here.';
    default:
      return null;
  }
}

function settingMatchesQuery(item: SettingsItemDefinition, page: SettingsPageMetadata, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }

  const searchableText = [
    item.title,
    item.description,
    page.label,
    page.description,
    ...item.keywords,
  ].join(' ').toLowerCase();

  return searchableText.includes(normalizedQuery);
}

export function useMenuBarSettingsController() {
  const { setLayoutMode: setCodeViewerLayoutMode } = useCodeViewerLayout();
  const {
    setCursorBlinking: setEditorCursorBlinking,
    setBracketPairGuides: setEditorBracketPairGuides,
    setFontFamily: setEditorFontFamily,
    setFontLigatures: setEditorFontLigatures,
    setFontSize: setEditorFontSize,
    setFoldingStrategy: setEditorFoldingStrategy,
    setGlyphMargin: setEditorGlyphMargin,
    setInlineGitDiffEnabled: setEditorInlineGitDiffEnabled,
    setInlineGitDiffStateBackgroundsEnabled: setEditorInlineGitDiffStateBackgroundsEnabled,
    setIndentGuides: setEditorIndentGuides,
    setLineNumbers: setEditorLineNumbers,
    setMinimapEnabled: setEditorMinimapEnabled,
    setRenderControlCharacters: setEditorRenderControlCharacters,
    setRenderWhitespace: setEditorRenderWhitespace,
    setScrollBeyondLastLine: setEditorScrollBeyondLastLine,
    setSmoothScrolling: setEditorSmoothScrolling,
    setTabSize: setEditorTabSize,
    setWordWrap: setEditorWordWrap,
  } = useEditorSettings();
  const {
    setAlignmentGuidesEnabled: setSchematicAlignmentGuidesEnabled,
    setGridEnabled: setSchematicGridEnabled,
    setGridSize: setSchematicGridSize,
    setSnapToGrid: setSchematicSnapToGrid,
  } = useSchematicSettings();
  const {
    availableThemes,
    getThemePreview,
    importTheme,
    isImportingTheme,
    setTheme,
  } = useTheme();
  const [editorFontAdvancedDialogOpen, setEditorFontAdvancedDialogOpen] = useState(false);
  const [themeAdvancedDialogOpen, setThemeAdvancedDialogOpen] = useState(false);
  const [importedThemeOptionOverride, setImportedThemeOptionOverride] = useState<ColorThemeOption | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsState, setSettingsState] = useState<MenuBarSettingsState>(getPersistedSettingsState);

  const availableThemeOptions = useMemo(() => {
    if (!importedThemeOptionOverride) {
      return availableThemes;
    }

    if (availableThemes.some((option) => option.value === importedThemeOptionOverride.value)) {
      return availableThemes;
    }

    return [...availableThemes, importedThemeOptionOverride];
  }, [availableThemes, importedThemeOptionOverride]);

  const patchSettingsState = useCallback((partialState: Partial<MenuBarSettingsState>) => {
    setSettingsState((current) => ({ ...current, ...partialState }));
  }, []);

  const handleSettingsDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setSettingsState(getPersistedSettingsState());
      setImportedThemeOptionOverride(null);
    } else {
      setEditorFontAdvancedDialogOpen(false);
      setThemeAdvancedDialogOpen(false);
    }

    setSettingsDialogOpen(nextOpen);
  }, []);

  const handleEditorFontAdvancedDialogOpenChange = useCallback((nextOpen: boolean) => {
    setEditorFontAdvancedDialogOpen(nextOpen);
  }, []);

  const handleThemeAdvancedDialogOpenChange = useCallback((nextOpen: boolean) => {
    setThemeAdvancedDialogOpen(nextOpen);
  }, []);

  const handleThemePickerLayoutModeChange = useCallback((layoutMode: ThemePickerLayoutMode) => {
    patchSettingsState({ themePickerLayoutMode: layoutMode });
    void window.electronAPI?.config.set(THEME_PICKER_LAYOUT_MODE_CONFIG_KEY, layoutMode);
  }, [patchSettingsState]);

  const handleCodeViewerLayoutModeChange = useCallback((value: string) => {
    const nextLayoutMode = parseCodeViewerLayoutMode(value);

    patchSettingsState({ codeViewerLayoutMode: nextLayoutMode });
    setCodeViewerLayoutMode(nextLayoutMode);
  }, [patchSettingsState, setCodeViewerLayoutMode]);

  const handleCloseToTrayChange = (checked: boolean) => {
    patchSettingsState({ closeToTrayEnabled: checked });
    void window.electronAPI?.config.set(CLOSE_ACTION_CONFIG_KEY, checked ? 'tray' : 'quit');
  };

  const handleFloatingInfoWindowVisibleChange = (checked: boolean) => {
    patchSettingsState({ floatingInfoWindowVisible: checked });
    void window.electronAPI?.config.set(FLOATING_INFO_VISIBLE_CONFIG_KEY, checked);
    void window.electronAPI?.setFloatingInfoWindowVisible(checked);
  };

  const handleNotificationDismissSecondsChange = (value: number) => {
    const nextValue = parseNotificationDismissSeconds(value);
    patchSettingsState({ notificationDismissSeconds: nextValue });
    void window.electronAPI?.config.set(NOTIFICATION_DISMISS_SECONDS_CONFIG_KEY, nextValue);
  };

  const handleProgressHideCompletedChange = (checked: boolean) => {
    patchSettingsState({ progressHideCompleted: checked });
    setProgressHideCompleted(checked);
    void window.electronAPI?.config.set(PROGRESS_HIDE_COMPLETED_CONFIG_KEY, checked);
  };

  const handleWslUbuntuDistroChange = (value: string) => {
    const nextDistro = parseWslUbuntuDistro(value);
    patchSettingsState({ wslUbuntuDistro: nextDistro });
    void window.electronAPI?.config.set(EDA_WSL_UBUNTU_DISTRO_CONFIG_KEY, nextDistro);
  };

  const handleThemeChange = useCallback((value: string) => {
    patchSettingsState({ themeId: value });
    setTheme(value);
  }, [patchSettingsState, setTheme]);

  const handleThemeImport = useCallback(async () => {
    const importedTheme = await importTheme();

    if (!importedTheme) {
      return;
    }

    setImportedThemeOptionOverride(importedTheme);
    patchSettingsState({ themeId: importedTheme.value });
  }, [importTheme, patchSettingsState]);

  const handleEditorFontSizeChange = (value: number[]) => {
    const nextValue = value[0] ?? settingsState.editorFontSize;
    patchSettingsState({ editorFontSize: nextValue });
  };

  const handleEditorFontSizeCommit = (value: number[]) => {
    const nextValue = value[0] ?? settingsState.editorFontSize;
    patchSettingsState({ editorFontSize: nextValue });
    setEditorFontSize(nextValue);
  };

  const handleEditorFontFamilyChange = (value: string) => {
    const nextFontFamily = parseEditorFontFamily(value);
    patchSettingsState({ editorFontFamily: nextFontFamily });
    setEditorFontFamily(nextFontFamily);
  };

  const handleEditorFontAdvancedSelect = useCallback((value: string) => {
    handleEditorFontFamilyChange(value);
    setEditorFontAdvancedDialogOpen(false);
  }, [handleEditorFontFamilyChange]);

  const handleEditorFontLigaturesChange = (checked: boolean) => {
    patchSettingsState({ editorFontLigatures: checked });
    setEditorFontLigatures(checked);
  };

  const handleEditorTabSizeChange = (value: string) => {
    const nextTabSize = parseEditorTabSize(value);
    patchSettingsState({ editorTabSize: nextTabSize });
    setEditorTabSize(nextTabSize);
  };

  const handleEditorCursorBlinkingChange = (value: string) => {
    const nextCursorBlinking = parseEditorCursorBlinking(value);
    patchSettingsState({ editorCursorBlinking: nextCursorBlinking });
    setEditorCursorBlinking(nextCursorBlinking);
  };

  const handleThemeAdvancedSelect = useCallback((value: string) => {
    handleThemeChange(value);
    setThemeAdvancedDialogOpen(false);
  }, [handleThemeChange]);

  const handleEditorWordWrapChange = (value: string) => {
    const nextWordWrap = parseEditorWordWrap(value);
    patchSettingsState({ editorWordWrap: nextWordWrap });
    setEditorWordWrap(nextWordWrap);
  };

  const handleEditorRenderWhitespaceChange = (value: string) => {
    const nextRenderWhitespace = parseEditorRenderWhitespace(value);
    patchSettingsState({ editorRenderWhitespace: nextRenderWhitespace });
    setEditorRenderWhitespace(nextRenderWhitespace);
  };

  const handleEditorLineNumbersChange = (value: string) => {
    const nextLineNumbers = parseEditorLineNumbers(value);
    patchSettingsState({ editorLineNumbers: nextLineNumbers });
    setEditorLineNumbers(nextLineNumbers);
  };

  const handleEditorSmoothScrollingChange = (checked: boolean) => {
    patchSettingsState({ editorSmoothScrolling: checked });
    setEditorSmoothScrolling(checked);
  };

  const handleEditorScrollBeyondLastLineChange = (checked: boolean) => {
    patchSettingsState({ editorScrollBeyondLastLine: checked });
    setEditorScrollBeyondLastLine(checked);
  };

  const handleEditorFoldingStrategyChange = (value: string) => {
    const nextFoldingStrategy = parseEditorFoldingStrategy(value);
    patchSettingsState({ editorFoldingStrategy: nextFoldingStrategy });
    setEditorFoldingStrategy(nextFoldingStrategy);
  };

  const handleEditorRenderControlCharactersChange = (checked: boolean) => {
    patchSettingsState({ editorRenderControlCharacters: checked });
    setEditorRenderControlCharacters(checked);
  };

  const handleEditorMinimapEnabledChange = (checked: boolean) => {
    patchSettingsState({ editorMinimapEnabled: checked });
    setEditorMinimapEnabled(checked);
  };

  const handleEditorGlyphMarginChange = (checked: boolean) => {
    patchSettingsState({ editorGlyphMargin: checked });
    setEditorGlyphMargin(checked);
  };

  const handleEditorInlineGitDiffEnabledChange = (checked: boolean) => {
    patchSettingsState({ editorInlineGitDiffEnabled: checked });
    setEditorInlineGitDiffEnabled(checked);
  };

  const handleEditorInlineGitDiffStateBackgroundsEnabledChange = (checked: boolean) => {
    patchSettingsState({ editorInlineGitDiffStateBackgroundsEnabled: checked });
    setEditorInlineGitDiffStateBackgroundsEnabled(checked);
  };

  const handleEditorBracketPairGuidesChange = (checked: boolean) => {
    patchSettingsState({ editorBracketPairGuides: checked });
    setEditorBracketPairGuides(checked);
  };

  const handleEditorIndentGuidesChange = (checked: boolean) => {
    patchSettingsState({ editorIndentGuides: checked });
    setEditorIndentGuides(checked);
  };

  const handleSchematicGridEnabledChange = (checked: boolean) => {
    patchSettingsState({ schematicGridEnabled: checked });
    setSchematicGridEnabled(checked);
  };

  const handleSchematicGridSizeChange = (value: number[]) => {
    patchSettingsState({ schematicGridSize: parseSchematicGridSize(value[0] ?? settingsState.schematicGridSize) });
  };

  const handleSchematicGridSizeCommit = (value: number[]) => {
    const nextValue = parseSchematicGridSize(value[0] ?? settingsState.schematicGridSize);
    patchSettingsState({ schematicGridSize: nextValue });
    setSchematicGridSize(nextValue);
  };

  const handleSchematicSnapToGridChange = (checked: boolean) => {
    patchSettingsState({ schematicSnapToGrid: checked });
    setSchematicSnapToGrid(checked);
  };

  const handleSchematicAlignmentGuidesEnabledChange = (checked: boolean) => {
    patchSettingsState({ schematicAlignmentGuidesEnabled: checked });
    setSchematicAlignmentGuidesEnabled(checked);
  };

  const openSettingsDialog = useCallback(() => {
    handleSettingsDialogOpenChange(true);
  }, [handleSettingsDialogOpenChange]);

  return {
    editorFontAdvancedDialogOpen,
    availableThemeOptions,
    getThemePreview,
    handleCodeViewerLayoutModeChange,
    handleCloseToTrayChange,
    handleEditorBracketPairGuidesChange,
    handleEditorCursorBlinkingChange,
    handleEditorFoldingStrategyChange,
    handleEditorFontAdvancedDialogOpenChange,
    handleEditorFontAdvancedSelect,
    handleEditorFontFamilyChange,
    handleEditorFontLigaturesChange,
    handleEditorFontSizeChange,
    handleEditorFontSizeCommit,
    handleEditorGlyphMarginChange,
    handleEditorInlineGitDiffEnabledChange,
    handleEditorInlineGitDiffStateBackgroundsEnabledChange,
    handleEditorIndentGuidesChange,
    handleEditorLineNumbersChange,
    handleEditorMinimapEnabledChange,
    handleEditorRenderControlCharactersChange,
    handleEditorRenderWhitespaceChange,
    handleEditorScrollBeyondLastLineChange,
    handleEditorSmoothScrollingChange,
    handleEditorTabSizeChange,
    handleThemeAdvancedDialogOpenChange,
    handleThemePickerLayoutModeChange,
    handleThemeAdvancedSelect,
    handleThemeChange,
    handleThemeImport,
    handleEditorWordWrapChange,
    handleFloatingInfoWindowVisibleChange,
    handleNotificationDismissSecondsChange,
    handleProgressHideCompletedChange,
    handleWslUbuntuDistroChange,
    handleSchematicAlignmentGuidesEnabledChange,
    handleSchematicGridEnabledChange,
    handleSchematicGridSizeChange,
    handleSchematicGridSizeCommit,
    handleSchematicSnapToGridChange,
    handleSettingsDialogOpenChange,
    isImportingTheme,
    openSettingsDialog,
    settingsDialogOpen,
    settingsState,
    themeAdvancedDialogOpen,
  };
}

export type MenuBarSettingsController = ReturnType<typeof useMenuBarSettingsController>;

export function MenuBarSettingsDialogs({
  controller,
  dialogStyle,
}: {
  controller: MenuBarSettingsController;
  dialogStyle?: CSSProperties;
}) {
  const {
    editorFontAdvancedDialogOpen,
    availableThemeOptions,
    getThemePreview,
    handleCodeViewerLayoutModeChange,
    handleCloseToTrayChange,
    handleEditorBracketPairGuidesChange,
    handleEditorCursorBlinkingChange,
    handleEditorFoldingStrategyChange,
    handleEditorFontAdvancedDialogOpenChange,
    handleEditorFontAdvancedSelect,
    handleEditorFontFamilyChange,
    handleEditorFontLigaturesChange,
    handleEditorFontSizeChange,
    handleEditorFontSizeCommit,
    handleEditorGlyphMarginChange,
    handleEditorInlineGitDiffEnabledChange,
    handleEditorInlineGitDiffStateBackgroundsEnabledChange,
    handleEditorIndentGuidesChange,
    handleEditorLineNumbersChange,
    handleEditorMinimapEnabledChange,
    handleEditorRenderControlCharactersChange,
    handleEditorRenderWhitespaceChange,
    handleEditorScrollBeyondLastLineChange,
    handleEditorSmoothScrollingChange,
    handleEditorTabSizeChange,
    handleThemeAdvancedDialogOpenChange,
    handleThemePickerLayoutModeChange,
    handleThemeAdvancedSelect,
    handleThemeChange,
    handleThemeImport,
    handleEditorWordWrapChange,
    handleFloatingInfoWindowVisibleChange,
    handleNotificationDismissSecondsChange,
    handleProgressHideCompletedChange,
    handleWslUbuntuDistroChange,
    handleSchematicAlignmentGuidesEnabledChange,
    handleSchematicGridEnabledChange,
    handleSchematicGridSizeChange,
    handleSchematicGridSizeCommit,
    handleSchematicSnapToGridChange,
    handleSettingsDialogOpenChange,
    isImportingTheme,
    settingsDialogOpen,
    settingsState,
    themeAdvancedDialogOpen,
  } = controller;
  const activePageId = useSettingsDialogSessionStore((state) => state.activePageId);
  const settingsSearchQuery = useSettingsDialogSessionStore((state) => state.settingsSearchQuery);
  const clearSettingsSearchQuery = useSettingsDialogSessionStore((state) => state.clearSettingsSearchQuery);
  const setActivePageId = useSettingsDialogSessionStore((state) => state.setActivePageId);
  const setSettingsSearchQuery = useSettingsDialogSessionStore((state) => state.setSettingsSearchQuery);
  const normalizedSearchQuery = settingsSearchQuery.trim().toLowerCase();

  useEffect(() => {
    if (!settingsDialogOpen) {
      setActivePageId('general');
      clearSettingsSearchQuery();
    }
  }, [clearSettingsSearchQuery, setActivePageId, settingsDialogOpen]);

  const availableThemeOptionsById = useMemo(
    () => new Map(availableThemeOptions.map((option) => [option.value, option])),
    [availableThemeOptions],
  );

  const settingsItems = useMemo<SettingsItemDefinition[]>(() => [
    {
      id: 'code-viewer-layout',
      pageId: 'general',
      title: 'Code viewer layout',
      description: 'Choose how the code viewer arranges side panels, editor regions, bottom panels, and tabs.',
      keywords: ['layout', 'code viewer', 'panels', 'tabs', 'minimal', 'compact'],
      element: (
        <SettingsComboboxSection
          value={settingsState.codeViewerLayoutMode}
          onValueChange={handleCodeViewerLayoutModeChange}
          options={codeViewerLayoutModeOptions.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
          title="Code viewer layout"
          description="Choose how the code viewer arranges side panels, editor regions, bottom panels, and tabs."
          searchPlaceholder="Search code viewer layouts..."
          emptyText="No code viewer layout found."
          testId="settings-code-viewer-layout-combobox"
        />
      ),
    },
    {
      id: 'notification-duration',
      pageId: 'general',
      title: 'Notification duration',
      description: 'Choose how long native OS notifications stay open before Pristine asks the system to close them.',
      keywords: ['notification', 'duration', 'timeout', 'system', 'os'],
      element: (
        <SettingsNumberSection
          value={settingsState.notificationDismissSeconds}
          onValueChange={handleNotificationDismissSecondsChange}
          min={MIN_NOTIFICATION_DISMISS_SECONDS}
          max={MAX_NOTIFICATION_DISMISS_SECONDS}
          step={1}
          unit="seconds"
          title="Notification duration"
          description="Choose how long native OS notifications stay open before Pristine asks the system to close them."
          testId="settings-notification-duration-input"
        />
      ),
    },
    {
      id: 'progress-hide-completed',
      pageId: 'general',
      title: 'Hide completed progress',
      description: 'Hide the status bar progress widget after all active progress sessions finish.',
      keywords: ['progress', 'status bar', 'complete', 'hide', 'done'],
      element: (
        <div className={settingsSectionClassName}>
          <SettingsSwitchRow
            checked={settingsState.progressHideCompleted}
            description="Hide the status bar progress widget after all active progress sessions finish."
            onCheckedChange={handleProgressHideCompletedChange}
            testId="settings-progress-hide-completed-switch"
            title="Hide completed progress"
          />
        </div>
      ),
    },
    {
      id: 'ui-theme',
      pageId: 'appearance',
      title: 'UI theme',
      description: 'Choose the color theme used across Pristine UI, Monaco, and the terminal.',
      keywords: ['theme', 'appearance', 'color', 'monaco', 'terminal', 'import'],
      element: (
        <SettingsComboboxSection
          value={settingsState.themeId}
          onValueChange={handleThemeChange}
          options={availableThemeOptions.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
          title="UI theme"
          description="Choose the color theme used across Pristine UI, Monaco, and the terminal. Imported themes fall back to the matching built-in 2026 base theme for missing tokens."
          searchPlaceholder="Search UI themes..."
          emptyText="No UI theme found."
          previewPaneTestId="settings-theme-combobox-preview-pane"
          renderOptionPreview={(option) => {
            const themeOption = availableThemeOptionsById.get(option.value);

            if (!themeOption) {
              return null;
            }

            return (
              <ColorThemePreviewCard
                isSelected={themeOption.value === settingsState.themeId}
                option={themeOption}
                preview={getThemePreview(themeOption.value)}
                testIdPrefix="settings-theme-combobox-preview"
              />
            );
          }}
          testId="settings-theme-combobox"
          action={(
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="settings-theme-advanced-button"
                className="hover:cursor-pointer"
                onClick={() => handleThemeAdvancedDialogOpenChange(true)}
              >
                Advanced
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="settings-theme-import-button"
                className="hover:cursor-pointer"
                disabled={isImportingTheme}
                onClick={() => {
                  void handleThemeImport();
                }}
              >
                {isImportingTheme ? 'Importing...' : 'Import'}
              </Button>
            </div>
          )}
        />
      ),
    },
    {
      id: 'editor-font-family',
      pageId: 'editor',
      title: 'Code editor font',
      description: 'Choose the bundled monospace font used in Monaco editor tabs.',
      keywords: ['editor', 'font', 'font family', 'monospace', 'monaco', 'code'],
      element: (
        <SettingsComboboxSection
          value={settingsState.editorFontFamily}
          onValueChange={handleEditorFontFamilyChange}
          options={editorFontFamilyOptions.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
          title="Code editor font"
          description="Choose the bundled monospace font used in Monaco editor tabs."
          searchPlaceholder="Search editor fonts..."
          emptyText="No editor font found."
          previewPaneTestId="settings-editor-font-family-combobox-preview-pane"
          renderOptionPreview={(option) => {
            const fontFamily = parseEditorFontFamily(option.value);

            return (
              <EditorFontPreviewCard
                fontFamily={fontFamily}
                isSelected={fontFamily === settingsState.editorFontFamily}
                testIdPrefix="settings-editor-font-family-combobox-preview"
              />
            );
          }}
          testId="settings-editor-font-family-combobox"
          action={(
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="settings-editor-font-family-advanced-button"
              className="shrink-0 hover:cursor-pointer"
              onClick={() => handleEditorFontAdvancedDialogOpenChange(true)}
            >
              Advanced
            </Button>
          )}
        />
      ),
    },
    {
      id: 'editor-font-size',
      pageId: 'editor',
      title: 'Code editor font size',
      description: 'Adjust the Monaco editor font size used in code tabs.',
      keywords: ['editor', 'font', 'size', 'monaco', 'code'],
      element: (
        <SettingsSliderSection
          title="Code editor font size"
          description="Adjust the Monaco editor font size used in code tabs."
          testId="editor-font-size"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Slider
              aria-label="Code editor font size"
              data-testid="settings-editor-font-size-slider"
              min={10}
              max={24}
              step={1}
              value={[settingsState.editorFontSize]}
              onValueChange={handleEditorFontSizeChange}
              onValueCommit={handleEditorFontSizeCommit}
            />
            <span
              className="min-w-10 shrink-0 text-right text-[13px] font-medium text-foreground"
              data-testid="settings-editor-font-size-value"
            >
              {settingsState.editorFontSize}px
            </span>
          </div>
        </SettingsSliderSection>
      ),
    },
    {
      id: 'editor-behavior-display',
      pageId: 'editor',
      title: 'Editor behavior & display',
      description: 'Configure Monaco behavior and display aids such as indentation, caret motion, wrapping, gutters, and guides.',
      keywords: ['editor', 'behavior', 'display', 'monaco', 'guides', 'gutter'],
      element: (
        <SettingsInfoSection
          title="Editor behavior & display"
          description="Configure Monaco behavior and display aids such as indentation, caret motion, wrapping, gutters, and guides."
          testId="editor-display"
        />
      ),
    },
    {
      id: 'editor-word-wrap',
      pageId: 'editor',
      title: 'Word wrap',
      description: 'Control how Monaco wraps long lines inside the current editor viewport.',
      keywords: ['editor', 'word wrap', 'wrap', 'line wrapping'],
      element: (
        <SettingsComboboxSection
          value={settingsState.editorWordWrap}
          onValueChange={handleEditorWordWrapChange}
          options={editorWordWrapOptions.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
          title="Word wrap"
          description="Control how Monaco wraps long lines inside the current editor viewport."
          searchPlaceholder="Search word wrap modes..."
          emptyText="No word wrap mode found."
          testId="settings-editor-word-wrap-combobox"
        />
      ),
    },
    {
      id: 'editor-tab-size',
      pageId: 'editor',
      title: 'Tab size',
      description: 'Choose how many spaces Monaco inserts and aligns when indentation uses tabs as spaces.',
      keywords: ['editor', 'tab', 'tab size', 'spaces', 'indentation'],
      element: (
        <SettingsComboboxSection
          value={String(settingsState.editorTabSize)}
          onValueChange={handleEditorTabSizeChange}
          options={editorTabSizeOptions.map((option) => ({
            value: String(option.value),
            label: option.label,
            description: option.description,
          }))}
          title="Tab size"
          description="Choose how many spaces Monaco inserts and aligns when indentation uses tabs as spaces."
          searchPlaceholder="Search tab sizes..."
          emptyText="No tab size found."
          testId="settings-editor-tab-size-combobox"
        />
      ),
    },
    {
      id: 'editor-cursor-blinking',
      pageId: 'editor',
      title: 'Cursor blinking',
      description: 'Control the caret animation Monaco uses while the editor has focus.',
      keywords: ['editor', 'cursor', 'caret', 'blinking', 'animation'],
      element: (
        <SettingsComboboxSection
          value={settingsState.editorCursorBlinking}
          onValueChange={handleEditorCursorBlinkingChange}
          options={editorCursorBlinkingOptions.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
          title="Cursor blinking"
          description="Control the caret animation Monaco uses while the editor has focus."
          searchPlaceholder="Search cursor blinking modes..."
          emptyText="No cursor blinking mode found."
          testId="settings-editor-cursor-blinking-combobox"
        />
      ),
    },
    {
      id: 'editor-render-whitespace',
      pageId: 'editor',
      title: 'Whitespace rendering',
      description: 'Choose when visible whitespace markers should appear in the editor.',
      keywords: ['editor', 'whitespace', 'spaces', 'markers', 'render'],
      element: (
        <SettingsComboboxSection
          value={settingsState.editorRenderWhitespace}
          onValueChange={handleEditorRenderWhitespaceChange}
          options={editorRenderWhitespaceOptions.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
          title="Whitespace rendering"
          description="Choose when visible whitespace markers should appear in the editor."
          searchPlaceholder="Search whitespace modes..."
          emptyText="No whitespace mode found."
          testId="settings-editor-render-whitespace-combobox"
        />
      ),
    },
    {
      id: 'editor-line-numbers',
      pageId: 'editor',
      title: 'Line numbers',
      description: 'Choose whether the editor gutter shows absolute, relative, or interval line numbers.',
      keywords: ['editor', 'line numbers', 'gutter', 'relative', 'interval'],
      element: (
        <SettingsComboboxSection
          value={settingsState.editorLineNumbers}
          onValueChange={handleEditorLineNumbersChange}
          options={editorLineNumbersOptions.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
          title="Line numbers"
          description="Choose whether the editor gutter shows absolute, relative, or interval line numbers."
          searchPlaceholder="Search line number modes..."
          emptyText="No line number mode found."
          testId="settings-editor-line-numbers-combobox"
        />
      ),
    },
    {
      id: 'editor-folding-strategy',
      pageId: 'editor',
      title: 'Folding strategy',
      description: 'Choose whether Monaco folds from indentation only or uses language-aware providers when possible.',
      keywords: ['editor', 'folding', 'strategy', 'indentation', 'language'],
      element: (
        <SettingsComboboxSection
          value={settingsState.editorFoldingStrategy}
          onValueChange={handleEditorFoldingStrategyChange}
          options={editorFoldingStrategyOptions.map((option) => ({
            value: option.value,
            label: option.label,
            description: option.description,
          }))}
          title="Folding strategy"
          description="Choose whether Monaco folds from indentation only or uses language-aware providers when possible."
          searchPlaceholder="Search folding strategies..."
          emptyText="No folding strategy found."
          testId="settings-editor-folding-strategy-combobox"
        />
      ),
    },
    {
      id: 'editor-display-switches',
      pageId: 'editor',
      title: 'Display and guide toggles',
      description: 'Enable editor ligatures, scrolling, minimap, glyph margin, inline Git diff, and guide rendering.',
      keywords: ['editor', 'ligatures', 'smooth scrolling', 'minimap', 'glyph margin', 'inline git diff', 'bracket pair guides', 'indent guides'],
      element: (
        <div className={settingsSectionClassName}>
          <div className="divide-y divide-border/70">
            <SettingsSwitchRow checked={settingsState.editorFontLigatures} description="Enable Monaco font ligatures when the selected code font supports them." onCheckedChange={handleEditorFontLigaturesChange} testId="settings-editor-font-ligatures-switch" title="Font ligatures" />
            <SettingsSwitchRow checked={settingsState.editorSmoothScrolling} description="Animate editor scrolling with Monaco's smooth scrolling behavior." onCheckedChange={handleEditorSmoothScrollingChange} testId="settings-editor-smooth-scrolling-switch" title="Smooth scrolling" />
            <SettingsSwitchRow checked={settingsState.editorScrollBeyondLastLine} description="Keep extra blank space after the final line so the cursor can scroll below the file end." onCheckedChange={handleEditorScrollBeyondLastLineChange} testId="settings-editor-scroll-beyond-last-line-switch" title="Scroll beyond last line" />
            <SettingsSwitchRow checked={settingsState.editorRenderControlCharacters} description="Render control characters such as tabs and other non-printable glyphs using Monaco's built-in markers." onCheckedChange={handleEditorRenderControlCharactersChange} testId="settings-editor-render-control-characters-switch" title="Render control characters" />
            <SettingsSwitchRow checked={settingsState.editorMinimapEnabled} description="Show Monaco's minimap overview on the right side of the editor." onCheckedChange={handleEditorMinimapEnabledChange} testId="settings-editor-minimap-switch" title="Show minimap" />
            <SettingsSwitchRow checked={settingsState.editorGlyphMargin} description="Keep the glyph margin visible for breakpoints, decorations, and code markers." onCheckedChange={handleEditorGlyphMarginChange} testId="settings-editor-glyph-margin-switch" title="Show glyph margin" />
            <SettingsSwitchRow checked={settingsState.editorInlineGitDiffEnabled} description="Show HEAD versus workspace changes inline inside opened modified files." onCheckedChange={handleEditorInlineGitDiffEnabledChange} testId="settings-editor-inline-git-diff-switch" title="Inline Git Diff" />
            <SettingsSwitchRow checked={settingsState.editorInlineGitDiffStateBackgroundsEnabled} description="Fill changed line numbers and editor rows with the inline Git diff state background." onCheckedChange={handleEditorInlineGitDiffStateBackgroundsEnabledChange} testId="settings-editor-inline-git-diff-backgrounds-switch" title="Inline Git Diff Backgrounds" />
            <SettingsSwitchRow checked={settingsState.editorBracketPairGuides} description="Render Monaco's bracket pair guide lines to make nested scopes easier to scan." onCheckedChange={handleEditorBracketPairGuidesChange} testId="settings-editor-bracket-pair-guides-switch" title="Bracket pair guides" />
            <SettingsSwitchRow checked={settingsState.editorIndentGuides} description="Render indentation guide lines that follow the current block structure." onCheckedChange={handleEditorIndentGuidesChange} testId="settings-editor-indent-guides-switch" title="Indent guides" />
          </div>
        </div>
      ),
    },
    {
      id: 'schematic-grid-size',
      pageId: 'schematic',
      title: 'Grid size',
      description: 'Adjust the visible schematic grid and keyboard pan step size.',
      keywords: ['schematic', 'grid', 'size', 'canvas', 'pan', 'keyboard'],
      element: (
        <SettingsSliderSection
          title="Grid size"
          description="Adjust the visible schematic grid and keyboard pan step size."
          testId="schematic-grid-size"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Slider
              aria-label="Schematic grid size"
              data-testid="settings-schematic-grid-size-slider"
              min={MIN_SCHEMATIC_GRID_SIZE}
              max={MAX_SCHEMATIC_GRID_SIZE}
              step={1}
              value={[settingsState.schematicGridSize]}
              onValueChange={handleSchematicGridSizeChange}
              onValueCommit={handleSchematicGridSizeCommit}
            />
            <span
              className="min-w-10 shrink-0 text-right text-[13px] font-medium text-foreground"
              data-testid="settings-schematic-grid-size-value"
            >
              {settingsState.schematicGridSize}px
            </span>
          </div>
        </SettingsSliderSection>
      ),
    },
    {
      id: 'schematic-display-interaction',
      pageId: 'schematic',
      title: 'Display and interaction toggles',
      description: 'Configure the schematic grid, drag snapping, and temporary alignment guides.',
      keywords: ['schematic', 'grid', 'snap', 'drag', 'alignment', 'guides'],
      element: (
        <div className={settingsSectionClassName}>
          <div className="divide-y divide-border/70">
            <SettingsSwitchRow checked={settingsState.schematicGridEnabled} description="Show the background grid across the full schematic viewport." onCheckedChange={handleSchematicGridEnabledChange} testId="settings-schematic-grid-switch" title="Show grid" />
            <SettingsSwitchRow checked={settingsState.schematicSnapToGrid} description="Snap dragged modules to the configured grid points." onCheckedChange={handleSchematicSnapToGridChange} testId="settings-schematic-snap-to-grid-switch" title="Snap dragging to grid" />
            <SettingsSwitchRow checked={settingsState.schematicAlignmentGuidesEnabled} description="Show temporary edge and center alignment guides while dragging modules." onCheckedChange={handleSchematicAlignmentGuidesEnabledChange} testId="settings-schematic-alignment-guides-switch" title="Alignment guides" />
          </div>
        </div>
      ),
    },
    {
      id: 'eda-wsl-ubuntu-distro',
      pageId: 'eda',
      title: 'WSL Ubuntu distribution',
      description: 'Choose which Ubuntu release Pristine installs for the local EDA WSL environment.',
      keywords: ['eda', 'wsl', 'ubuntu', 'linux', 'distribution'],
      element: (
        <SettingsComboboxSection
          value={settingsState.wslUbuntuDistro}
          onValueChange={handleWslUbuntuDistroChange}
          options={wslUbuntuDistroSettingOptions}
          title="WSL Ubuntu distribution"
          description="Choose which Ubuntu release Pristine installs for the local EDA WSL environment."
          searchPlaceholder="Search Ubuntu distributions..."
          emptyText="No Ubuntu distribution found."
          testId="settings-eda-wsl-ubuntu-distro-combobox"
        />
      ),
    },
    {
      id: 'close-to-tray',
      pageId: 'window',
      title: 'Close to tray',
      description: 'Keep Pristine running in the tray when the window is closed.',
      keywords: ['window', 'close', 'tray', 'quit'],
      element: (
        <div className={settingsSectionClassName}>
          <SettingsSwitchRow checked={settingsState.closeToTrayEnabled} description="Keep Pristine running in the tray when the window is closed." onCheckedChange={handleCloseToTrayChange} testId="settings-close-to-tray-switch" title="Close to tray" />
        </div>
      ),
    },
    {
      id: 'floating-info-window',
      pageId: 'window',
      title: 'Show floating info window',
      description: 'Display a detached always-on-top info window even while Pristine is hidden to tray.',
      keywords: ['window', 'floating', 'info', 'tray', 'always on top'],
      element: (
        <div className={settingsSectionClassName}>
          <SettingsSwitchRow checked={settingsState.floatingInfoWindowVisible} description="Display a detached always-on-top info window even while Pristine is hidden to tray." onCheckedChange={handleFloatingInfoWindowVisibleChange} testId="settings-floating-info-window-switch" title="Show floating info window" />
        </div>
      ),
    },
  ], [
    availableThemeOptions,
    availableThemeOptionsById,
    getThemePreview,
    handleCloseToTrayChange,
    handleCodeViewerLayoutModeChange,
    handleEditorBracketPairGuidesChange,
    handleEditorCursorBlinkingChange,
    handleEditorFoldingStrategyChange,
    handleEditorFontAdvancedDialogOpenChange,
    handleEditorFontFamilyChange,
    handleEditorFontLigaturesChange,
    handleEditorFontSizeChange,
    handleEditorFontSizeCommit,
    handleEditorGlyphMarginChange,
    handleEditorIndentGuidesChange,
    handleEditorInlineGitDiffEnabledChange,
    handleEditorInlineGitDiffStateBackgroundsEnabledChange,
    handleEditorLineNumbersChange,
    handleEditorMinimapEnabledChange,
    handleEditorRenderControlCharactersChange,
    handleEditorRenderWhitespaceChange,
    handleEditorScrollBeyondLastLineChange,
    handleEditorSmoothScrollingChange,
    handleEditorTabSizeChange,
    handleEditorWordWrapChange,
    handleFloatingInfoWindowVisibleChange,
    handleNotificationDismissSecondsChange,
    handleProgressHideCompletedChange,
    handleWslUbuntuDistroChange,
    handleSchematicAlignmentGuidesEnabledChange,
    handleSchematicGridEnabledChange,
    handleSchematicGridSizeChange,
    handleSchematicGridSizeCommit,
    handleSchematicSnapToGridChange,
    handleThemeAdvancedDialogOpenChange,
    handleThemeChange,
    handleThemeImport,
    isImportingTheme,
    settingsState,
  ]);
  const settingsItemsByPage = useMemo(() => new Map(settingsPages.map((page) => [
    page.id,
    settingsItems.filter((item) => item.pageId === page.id),
  ])), [settingsItems]);
  const activePage = settingsPages.find((page) => page.id === activePageId) ?? defaultSettingsPage;
  const activePageItems = settingsItemsByPage.get(activePage.id) ?? [];
  const filteredSettingsItems = useMemo(() => settingsItems.filter((item) => {
    const page = settingsPages.find((candidate) => candidate.id === item.pageId);
    return Boolean(page && settingMatchesQuery(item, page, normalizedSearchQuery));
  }), [normalizedSearchQuery, settingsItems]);
  const hasSettingsSearchQuery = settingsSearchQuery.length > 0;
  const showingSearchResults = normalizedSearchQuery.length > 0;

  return (
    <>
      <Dialog open={settingsDialogOpen} onOpenChange={handleSettingsDialogOpenChange}>
        <DialogContent
          data-testid="settings-dialog"
          className="h-[min(760px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] gap-0 overflow-hidden border-ide-border bg-ide-bg p-0 text-ide-text shadow-2xl sm:max-w-6xl"
          showCloseButton={false}
          style={dialogStyle}
        >
          <div className="flex h-full min-h-0">
            <aside className="flex w-64 shrink-0 flex-col border-r border-ide-border bg-ide-sidebar-bg/80 px-3 py-4">
              <DialogTitle className="px-2 text-[20px] font-semibold text-ide-text">Settings</DialogTitle>
              <DialogDescription className="sr-only">
                Manage workbench appearance, editor behavior, and window preferences.
              </DialogDescription>
              <nav className="mt-7 space-y-1" aria-label="Settings sections">
                {settingsPages.map((page) => {
                  const Icon = page.icon;
                  const isActive = activePage.id === page.id && !showingSearchResults;

                  return (
                    <button
                      key={page.id}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      data-testid={`settings-nav-${page.id}`}
                      className={cn(
                        'flex h-10 w-full items-center rounded-md px-3 text-left text-[13px] font-medium leading-4 transition-colors hover:bg-ide-hover hover:text-ide-text',
                        isActive ? 'bg-ide-selection text-ide-accent' : 'text-ide-text-muted',
                      )}
                      onClick={() => {
                        setActivePageId(page.id);
                        clearSettingsSearchQuery();
                      }}
                    >
                      <span className="flex min-w-0 items-end gap-3">
                        <Icon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                          data-testid={`settings-nav-${page.id}-icon`}
                        />
                        <span className="truncate leading-4" data-testid={`settings-nav-${page.id}-label`}>
                          {page.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-3 border-b border-ide-border px-6 py-4">
                <div
                  className={cn(
                    commandSearchInputWrapperClassName,
                    'min-w-0 flex-1 rounded-md border border-ide-border bg-ide-tab-bg transition-colors focus-within:border-ide-accent',
                  )}
                  data-slot="settings-search-input-wrapper"
                >
                  <Search
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none transition-opacity duration-150',
                      commandSearchInputIconClassName,
                      hasSettingsSearchQuery ? 'opacity-0' : 'opacity-100',
                    )}
                    data-testid="settings-search-icon"
                  />
                  <input
                    type="search"
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    data-testid="settings-search-input"
                    spellCheck={false}
                    value={settingsSearchQuery}
                    onChange={(event) => setSettingsSearchQuery(event.target.value)}
                    placeholder="Search settings..."
                    className={cn(
                      commandSearchInputClassName,
                      'h-9 appearance-none py-0 text-[13px] leading-4 selection:bg-ide-selection selection:text-ide-text',
                    )}
                    style={commandSearchInputForegroundStyle}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close settings"
                  data-testid="settings-close-button"
                  className="text-ide-text-muted hover:bg-ide-hover hover:text-ide-text"
                  onClick={() => handleSettingsDialogOpenChange(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="px-6 py-5 pr-8">
                  {showingSearchResults ? (
                    <div className="space-y-4" data-testid="settings-page-search">
                      <div className="space-y-1">
                        <p className="text-[18px] font-semibold leading-none text-foreground">Search results</p>
                        <p className="text-[13px] text-muted-foreground">Matching settings across all sections.</p>
                      </div>
                      <SettingsSearchResults items={filteredSettingsItems} />
                    </div>
                  ) : (
                    <SettingsPageContent page={activePage} items={activePageItems} />
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EditorFontAdvancedDialog
        open={editorFontAdvancedDialogOpen}
        onOpenChange={handleEditorFontAdvancedDialogOpenChange}
        onSelectFontFamily={handleEditorFontAdvancedSelect}
        selectedFontFamily={settingsState.editorFontFamily}
        dialogStyle={dialogStyle}
      />

      <EditorThemeAdvancedDialog
        availableThemes={availableThemeOptions}
        dialogStyle={dialogStyle}
        getThemePreview={getThemePreview}
        layoutMode={settingsState.themePickerLayoutMode}
        open={themeAdvancedDialogOpen}
        onOpenChange={handleThemeAdvancedDialogOpenChange}
        onLayoutModeChange={handleThemePickerLayoutModeChange}
        onSelectTheme={handleThemeAdvancedSelect}
        selectedTheme={settingsState.themeId}
      />
    </>
  );
}
