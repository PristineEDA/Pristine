import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getEditorFontFamilyLabel } from '../../../editor/editorSettings';
import { useProgressStore } from '../../../progress/useProgressStore';
import {
  ensureEditorFontFamilyLoadedMock,
  importThemeMock,
  lockApplicationMenuBar,
  mockPersistedSettingsConfig,
  renderMenuBar,
  setEditorBracketPairGuidesMock,
  setEditorCursorBlinkingMock,
  setEditorFoldingStrategyMock,
  setEditorFontFamilyMock,
  setEditorFontLigaturesMock,
  setEditorGlyphMarginMock,
  setEditorInlineGitDiffEnabledMock,
  setEditorInlineGitDiffStateBackgroundsEnabledMock,
  setEditorIndentGuidesMock,
  setEditorLineNumbersMock,
  setEditorMinimapEnabledMock,
  setEditorRenderControlCharactersMock,
  setEditorRenderWhitespaceMock,
  setEditorScrollBeyondLastLineMock,
  setEditorSmoothScrollingMock,
  setEditorTabSizeMock,
  setEditorWordWrapMock,
  setSchematicAlignmentGuidesEnabledMock,
  setSchematicGridEnabledMock,
  setSchematicSnapToGridMock,
  setThemeMock,
} from './MenuBar.testSupport';

const SETTINGS_DIALOG_TEST_TIMEOUT_MS = 30000;
const SETTINGS_PICKER_TEST_TIMEOUT_MS = 15000;

async function openSettingsPage(user: ReturnType<typeof userEvent.setup>, page: 'general' | 'appearance' | 'editor' | 'design' | 'schematic' | 'eda' | 'pdk' | 'agent' | 'window') {
  await user.click(screen.getByTestId(`settings-nav-${page}`));
  expect(screen.getByTestId(`settings-page-${page}`)).toBeVisible();
}

async function applyBundledThemeFromAdvancedPicker(
  user: ReturnType<typeof userEvent.setup>,
  theme: {
    searchText: string;
    themeId: string;
    label: string;
    author: string;
  },
) {
  await user.click(screen.getByTestId('menu-settings-button'));
  expect(await screen.findByTestId('settings-dialog')).toBeVisible();

  await openSettingsPage(user, 'appearance');
  await user.click(screen.getByTestId('settings-theme-advanced-button'));
  expect(await screen.findByTestId('settings-theme-advanced-dialog')).toBeVisible();

  const searchInput = screen.getByTestId('settings-theme-advanced-search-input');
  await user.clear(searchInput);
  await user.type(searchInput, theme.searchText);

  expect(screen.getByTestId(`settings-theme-preview-card-${theme.themeId}`)).toHaveAttribute('data-state', 'unselected');
  expect(screen.getByTestId(`settings-theme-preview-label-${theme.themeId}`)).toHaveTextContent(theme.label);
  expect(screen.getByTestId(`settings-theme-preview-author-${theme.themeId}`)).toHaveTextContent(theme.author);
  expect(screen.getByTestId(`settings-theme-preview-line-module-${theme.themeId}`)).toHaveTextContent('module alu(clk)');

  await user.click(screen.getByTestId(`settings-theme-preview-card-${theme.themeId}`));

  await waitFor(() => {
    expect(screen.queryByTestId('settings-theme-advanced-dialog')).not.toBeInTheDocument();
  });

  expect(screen.getByTestId('settings-theme-combobox')).toHaveTextContent(theme.label);
  expect(setThemeMock).toHaveBeenCalledWith(theme.themeId);
}

describe('MenuBar settings', () => {
  it('opens settings from native menu commands on macOS', async () => {
    const user = userEvent.setup();
    window.electronAPI!.platform = 'darwin';
    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
      closeAction: 'tray',
      floatingInfoWindowVisible: true,
      fontFamily: 'fira-code',
      fontSize: 18,
    });

    renderMenuBar();

    const menuCommandHandler = vi.mocked(window.electronAPI!.menu.onCommand).mock.calls[0]?.[0];
    await act(async () => {
      menuCommandHandler?.({ action: 'open-settings' });
    });

    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'editor');
    expect(screen.getByTestId('settings-editor-font-family-combobox')).toHaveTextContent(getEditorFontFamilyLabel('fira-code'));
    expect(screen.queryByTestId('settings-code-layout-margin-slider')).not.toBeInTheDocument();
  });

  it('opens settings from the File menu using the shared settings behavior', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
      closeAction: 'tray',
      floatingInfoWindowVisible: true,
      fontFamily: 'fira-code',
      fontSize: 18,
    });

    renderMenuBar();

    await lockApplicationMenuBar(user);
    await user.click(screen.getByText('File'));
    expect(await screen.findByText('Ctrl+Q')).toBeInTheDocument();
    await user.click(await screen.findByText('Setting...'));

    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    expect(screen.getByTestId('settings-nav-general')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-page-general')).toBeVisible();
    expect(screen.getByTestId('settings-code-viewer-layout-combobox')).toHaveTextContent('Minimal');

    await openSettingsPage(user, 'editor');
    expect(screen.getByTestId('settings-editor-font-family-combobox')).toHaveTextContent(getEditorFontFamilyLabel('fira-code'));
    expect(screen.getByTestId('settings-editor-font-family-advanced-button')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-size-value')).toHaveTextContent('18px');
    expect(screen.queryByTestId('settings-code-layout-margin-slider')).not.toBeInTheDocument();

    await openSettingsPage(user, 'appearance');
    expect(screen.getByTestId('settings-theme-advanced-button')).toBeVisible();
    expect(screen.getByTestId('settings-theme-import-button')).toBeVisible();
    expect(screen.getByTestId('settings-theme-combobox')).toHaveTextContent('Dark 2026');
  });

  it('navigates settings subpages and searches across pages', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    expect(screen.getByTestId('settings-nav-general')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-page-general')).toBeVisible();
    expect(screen.getByTestId('settings-nav-general')).toHaveClass('leading-4');
    expect(screen.getByTestId('settings-nav-general-icon')).toHaveClass('size-4');
    expect(screen.getByTestId('settings-nav-general-label')).toHaveClass('leading-4');
    const settingsNav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(Array.from(settingsNav.querySelectorAll('button[data-testid^="settings-nav-"]')).map((item) => item.textContent)).toEqual([
      'General',
      'Appearance',
      'Editor',
      'Design',
      'Schematic',
      'EDA',
      'PDK',
      'Agent',
      'Window',
    ]);

    await user.click(screen.getByTestId('settings-code-viewer-layout-combobox'));
    const codeViewerLayoutSearchInput = screen.getByPlaceholderText('Search code viewer layouts...');
    expect(codeViewerLayoutSearchInput).toHaveAttribute('data-slot', 'command-input');
    expect(codeViewerLayoutSearchInput).toHaveClass('pristine-command-search-input');
    expect(codeViewerLayoutSearchInput).toHaveStyle('color: var(--ide-text)');
    expect(codeViewerLayoutSearchInput.parentElement).toHaveAttribute('data-slot', 'command-input-wrapper');
    expect(codeViewerLayoutSearchInput.parentElement).toHaveClass('flex h-9 items-center gap-2 border-b px-3');
    await user.keyboard('{Escape}');

    await openSettingsPage(user, 'appearance');
    expect(screen.getByTestId('settings-nav-appearance')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-theme-combobox')).toBeVisible();

    await openSettingsPage(user, 'editor');
    expect(screen.getByTestId('settings-nav-editor')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-editor-font-family-combobox')).toBeVisible();

    await openSettingsPage(user, 'design');
    expect(screen.getByTestId('settings-nav-design')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-design-placeholder-description')).toHaveTextContent('Design settings will appear here.');

    await openSettingsPage(user, 'schematic');
    expect(screen.getByTestId('settings-nav-schematic')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-schematic-grid-size-slider')).toBeVisible();
    expect(screen.getByTestId('settings-schematic-grid-size-value')).toHaveTextContent('40px');
    expect(screen.getByTestId('settings-schematic-grid-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-schematic-snap-to-grid-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-schematic-alignment-guides-switch')).toHaveAttribute('data-state', 'checked');

    await openSettingsPage(user, 'eda');
    expect(screen.getByTestId('settings-nav-eda')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-eda-wsl-ubuntu-distro-combobox')).toBeVisible();
    expect(screen.getByTestId('settings-eda-wsl-ubuntu-distro-combobox')).toHaveTextContent('Ubuntu-22.04');

    await openSettingsPage(user, 'pdk');
    expect(screen.getByTestId('settings-nav-pdk')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-pdk-placeholder-description')).toHaveTextContent('PDK settings will appear here.');

    await openSettingsPage(user, 'agent');
    expect(screen.getByTestId('settings-nav-agent')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-agent-placeholder-description')).toHaveTextContent('Agent settings will appear here.');

    await openSettingsPage(user, 'window');
    expect(screen.getByTestId('settings-nav-window')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-close-to-tray-switch')).toBeVisible();

    const searchInput = screen.getByTestId('settings-search-input');
    expect(searchInput).toHaveAttribute('autocomplete', 'off');
    expect(searchInput).toHaveAttribute('autocapitalize', 'none');
    expect(searchInput).toHaveAttribute('spellcheck', 'false');
    expect(searchInput).toHaveClass('pristine-command-search-input');
    expect(searchInput).toHaveStyle('color: var(--ide-text)');
    expect(searchInput.parentElement).toHaveAttribute('data-slot', 'settings-search-input-wrapper');
    expect(searchInput.parentElement).toHaveClass('flex h-9 items-center gap-2 px-3');
    expect(screen.getByTestId('settings-search-icon')).toHaveClass('opacity-100');

    await user.type(searchInput, 'font');

    expect(screen.getByTestId('settings-page-search')).toBeVisible();
    expect(screen.getByTestId('settings-search-results-editor')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-family-combobox')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-size-slider')).toBeVisible();
    expect(screen.queryByTestId('settings-search-empty-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-search-icon')).toHaveClass('opacity-0');

    await user.clear(searchInput);
    expect(screen.getByTestId('settings-search-icon')).toHaveClass('opacity-100');
    await user.type(searchInput, 'zzzzzz');

    expect(screen.getByTestId('settings-search-empty-state')).toBeVisible();
    expect(screen.getByTestId('settings-search-icon')).toHaveClass('opacity-0');

    await user.click(screen.getByTestId('settings-nav-general'));

    expect(screen.getByTestId('settings-search-input')).toHaveValue('');
    expect(screen.getByTestId('settings-search-icon')).toHaveClass('opacity-100');
    expect(screen.getByTestId('settings-nav-general')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-page-general')).toBeVisible();

    await openSettingsPage(user, 'editor');
    await user.type(screen.getByTestId('settings-search-input'), 'font');
    expect(screen.getByTestId('settings-page-search')).toBeVisible();

    await user.click(screen.getByTestId('settings-close-button'));
    await waitFor(() => {
      expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument();
    });

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    expect(screen.getByTestId('settings-nav-general')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-search-input')).toHaveValue('');
    expect(screen.getByTestId('settings-page-general')).toBeVisible();
  }, SETTINGS_DIALOG_TEST_TIMEOUT_MS);

  it('updates schematic grid and guide preferences from settings', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();

    await openSettingsPage(user, 'schematic');
    await user.click(screen.getByTestId('settings-schematic-grid-switch'));
    expect(setSchematicGridEnabledMock).toHaveBeenCalledWith(false);

    await user.click(screen.getByTestId('settings-schematic-snap-to-grid-switch'));
    expect(setSchematicSnapToGridMock).toHaveBeenCalledWith(false);

    await user.click(screen.getByTestId('settings-schematic-alignment-guides-switch'));
    expect(setSchematicAlignmentGuidesEnabledMock).toHaveBeenCalledWith(false);

    expect(screen.getByTestId('settings-schematic-grid-size-value')).toHaveTextContent('40px');
  });

  it('shows editor settings plus the unified theme, close-to-tray and floating info window visibility', async () => {
    const user = userEvent.setup();
    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
      bracketPairGuides: false,
      closeAction: 'tray',
      cursorBlinking: 'solid',
      floatingInfoWindowVisible: true,
      fontFamily: 'fira-code',
      fontLigatures: false,
      fontSize: 18,
      foldingStrategy: 'auto',
      glyphMargin: false,
      inlineGitDiffEnabled: false,
      inlineGitDiffStateBackgroundsEnabled: false,
      indentGuides: false,
      lineNumbers: 'relative',
      minimapEnabled: false,
      notificationDismissSeconds: 7,
      progressHideCompleted: false,
      renderControlCharacters: true,
      renderWhitespace: 'all',
      scrollBeyondLastLine: true,
      smoothScrolling: false,
      tabSize: 8,
      wordWrap: 'bounded',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));

    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    expect(screen.getByTestId('settings-code-viewer-layout-combobox')).toHaveTextContent('Minimal');
    expect(screen.getByTestId('settings-notification-duration-input-control')).toHaveClass(
      'border-ide-border',
      'bg-ide-tab-bg',
      'text-ide-text',
    );
    expect(screen.getByTestId('settings-notification-duration-input-control')).not.toHaveClass('focus-within:border-ide-accent');
    expect(screen.getByTestId('settings-notification-duration-input')).toHaveClass(
      'bg-transparent',
      'text-[var(--ide-text)]',
      'placeholder:text-ide-text-muted',
    );
    expect(screen.getByTestId('settings-notification-duration-input')).toHaveStyle('color: var(--ide-text)');
    expect(screen.getByTestId('settings-notification-duration-input')).toHaveValue(7);
    expect(screen.getByTestId('settings-notification-duration-input')).toHaveAttribute('min', '1');
    expect(screen.getByTestId('settings-notification-duration-input')).toHaveAttribute('max', '10');
    expect(screen.getByTestId('settings-notification-duration-input')).toHaveAttribute('step', '1');
    expect(screen.getByTestId('settings-progress-hide-completed-switch')).toHaveAttribute('data-state', 'unchecked');

    fireEvent.change(screen.getByTestId('settings-notification-duration-input'), { target: { value: '9' } });
    expect(screen.getByTestId('settings-notification-duration-input')).toHaveValue(9);
    await user.click(screen.getByTestId('settings-progress-hide-completed-switch'));
    expect(screen.getByTestId('settings-progress-hide-completed-switch')).toHaveAttribute('data-state', 'checked');
    expect(useProgressStore.getState().hideCompleted).toBe(true);

    await openSettingsPage(user, 'appearance');
    expect(screen.getByTestId('settings-theme-combobox')).toHaveTextContent('Dark 2026');

    await openSettingsPage(user, 'editor');
    expect(screen.getByTestId('settings-editor-font-family-combobox')).toHaveTextContent(getEditorFontFamilyLabel('fira-code'));
    expect(screen.queryByTestId('settings-code-layout-margin-slider')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-editor-font-size-value')).toHaveTextContent('18px');
    expect(screen.getByTestId('settings-editor-word-wrap-combobox')).toHaveTextContent('Bounded');
    expect(screen.getByTestId('settings-editor-tab-size-combobox')).toHaveTextContent('8 spaces');
    expect(screen.getByTestId('settings-editor-cursor-blinking-combobox')).toHaveTextContent('Solid');
    expect(screen.getByTestId('settings-editor-render-whitespace-combobox')).toHaveTextContent('All');
    expect(screen.getByTestId('settings-editor-line-numbers-combobox')).toHaveTextContent('Relative');
    expect(screen.getByTestId('settings-editor-folding-strategy-combobox')).toHaveTextContent('Auto');
    expect(screen.getByTestId('settings-editor-font-ligatures-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-render-control-characters-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-editor-smooth-scrolling-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-scroll-beyond-last-line-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-editor-minimap-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-glyph-margin-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-inline-git-diff-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-inline-git-diff-backgrounds-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-bracket-pair-guides-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-indent-guides-switch')).toHaveAttribute('data-state', 'unchecked');

    await openSettingsPage(user, 'window');
    expect(screen.getByTestId('settings-close-to-tray-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-floating-info-window-switch')).toHaveAttribute('data-state', 'checked');

    await openSettingsPage(user, 'editor');
    await user.click(screen.getByTestId('settings-editor-font-family-combobox'));
    await user.click(await screen.findByTestId('settings-editor-font-family-option-victor-mono'));
    await user.click(screen.getByTestId('settings-editor-word-wrap-combobox'));
    await user.click(await screen.findByTestId('settings-editor-word-wrap-option-on'));
    await user.click(screen.getByTestId('settings-editor-tab-size-combobox'));
    await user.click(await screen.findByTestId('settings-editor-tab-size-option-2'));
    await user.click(screen.getByTestId('settings-editor-cursor-blinking-combobox'));
    await user.click(await screen.findByTestId('settings-editor-cursor-blinking-option-phase'));
    await user.click(screen.getByTestId('settings-editor-render-whitespace-combobox'));
    await user.click(await screen.findByTestId('settings-editor-render-whitespace-option-boundary'));
    await user.click(screen.getByTestId('settings-editor-line-numbers-combobox'));
    await user.click(await screen.findByTestId('settings-editor-line-numbers-option-interval'));
    await user.click(screen.getByTestId('settings-editor-folding-strategy-combobox'));
    await user.click(await screen.findByTestId('settings-editor-folding-strategy-option-indentation'));
    await user.click(screen.getByTestId('settings-editor-font-ligatures-switch'));
    await user.click(screen.getByTestId('settings-editor-render-control-characters-switch'));
    await user.click(screen.getByTestId('settings-editor-smooth-scrolling-switch'));
    await user.click(screen.getByTestId('settings-editor-scroll-beyond-last-line-switch'));
    await user.click(screen.getByTestId('settings-editor-minimap-switch'));
    await user.click(screen.getByTestId('settings-editor-glyph-margin-switch'));
    await user.click(screen.getByTestId('settings-editor-inline-git-diff-switch'));
    await user.click(screen.getByTestId('settings-editor-inline-git-diff-backgrounds-switch'));
    await user.click(screen.getByTestId('settings-editor-bracket-pair-guides-switch'));
    await user.click(screen.getByTestId('settings-editor-indent-guides-switch'));

    expect(screen.getByTestId('settings-editor-font-family-combobox')).toHaveTextContent('Victor Mono');
    expect(screen.getByTestId('settings-editor-word-wrap-combobox')).toHaveTextContent('On');
    expect(screen.getByTestId('settings-editor-tab-size-combobox')).toHaveTextContent('2 spaces');
    expect(screen.getByTestId('settings-editor-font-ligatures-switch')).toHaveAttribute('data-state', 'checked');

    await openSettingsPage(user, 'appearance');
    await user.click(screen.getByTestId('settings-theme-combobox'));
    await user.click(await screen.findByTestId('settings-theme-option-vscode-2026-light'));
    expect(screen.getByTestId('settings-theme-combobox')).toHaveTextContent('Light 2026');

    await openSettingsPage(user, 'window');
    await user.click(screen.getByTestId('settings-close-to-tray-switch'));
    await user.click(screen.getByTestId('settings-floating-info-window-switch'));
    expect(screen.getByTestId('settings-close-to-tray-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-floating-info-window-switch')).toHaveAttribute('data-state', 'unchecked');

    expect(setEditorFontFamilyMock).toHaveBeenCalledWith('victor-mono');
    expect(setEditorWordWrapMock).toHaveBeenCalledWith('on');
    expect(setEditorTabSizeMock).toHaveBeenCalledWith(2);
    expect(setEditorCursorBlinkingMock).toHaveBeenCalledWith('phase');
    expect(setEditorRenderWhitespaceMock).toHaveBeenCalledWith('boundary');
    expect(setEditorLineNumbersMock).toHaveBeenCalledWith('interval');
    expect(setEditorFoldingStrategyMock).toHaveBeenCalledWith('indentation');
    expect(setEditorFontLigaturesMock).toHaveBeenCalledWith(true);
    expect(setEditorRenderControlCharactersMock).toHaveBeenCalledWith(false);
    expect(setEditorSmoothScrollingMock).toHaveBeenCalledWith(true);
    expect(setEditorScrollBeyondLastLineMock).toHaveBeenCalledWith(false);
    expect(setEditorMinimapEnabledMock).toHaveBeenCalledWith(true);
    expect(setEditorGlyphMarginMock).toHaveBeenCalledWith(true);
    expect(setEditorInlineGitDiffEnabledMock).toHaveBeenCalledWith(true);
    expect(setEditorInlineGitDiffStateBackgroundsEnabledMock).toHaveBeenCalledWith(true);
    expect(setEditorBracketPairGuidesMock).toHaveBeenCalledWith(true);
    expect(setEditorIndentGuidesMock).toHaveBeenCalledWith(true);
    expect(setThemeMock).toHaveBeenCalledWith('vscode-2026-light');
    expect(window.electronAPI?.config.set).toHaveBeenCalledWith('window.closeActionPreference', 'quit');
    expect(window.electronAPI?.config.set).toHaveBeenCalledWith('ui.floatingInfoWindow.visible', false);
    expect(window.electronAPI?.config.set).toHaveBeenCalledWith('notifications.dismissSeconds', 9);
    expect(window.electronAPI?.config.set).toHaveBeenCalledWith('progress.hideCompleted', true);
    expect(window.electronAPI?.setFloatingInfoWindowVisible).toHaveBeenCalledWith(false);
  }, SETTINGS_DIALOG_TEST_TIMEOUT_MS);

  it('persists the code viewer layout mode from settings', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      codeViewerLayoutMode: 'compact',
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    expect(screen.getByTestId('settings-code-viewer-layout-combobox')).toHaveTextContent('Compact');

    await user.click(screen.getByTestId('settings-code-viewer-layout-combobox'));
    await user.click(await screen.findByTestId('settings-code-viewer-layout-option-minimal'));

    expect(screen.getByTestId('settings-code-viewer-layout-combobox')).toHaveTextContent('Minimal');
    expect(window.electronAPI?.config.set).toHaveBeenCalledWith('workbench.codeViewerLayoutMode', 'minimal');

    await user.click(screen.getByTestId('settings-close-button'));

    mockPersistedSettingsConfig({
      codeViewerLayoutMode: 'minimal',
      colorTheme: 'vscode-2026-dark',
    });

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    expect(screen.getByTestId('settings-code-viewer-layout-combobox')).toHaveTextContent('Minimal');
  });

  it('opens the advanced editor font picker, filters preview cards, and applies the selected preview card', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      fontFamily: 'fira-code',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'editor');

    await user.click(screen.getByTestId('settings-editor-font-family-advanced-button'));

    expect(await screen.findByTestId('settings-editor-font-family-advanced-dialog')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-family-advanced-dialog')).toHaveClass('h-[85vh]');
    expect(screen.getByTestId('settings-editor-font-family-advanced-scroll-area')).toHaveClass('h-full');
    expect(screen.getByTestId('settings-editor-font-family-current-section')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-family-available-section')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-family-advanced-grid')).toBeVisible();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Available fonts')).toBeInTheDocument();
    const searchInput = screen.getByTestId('settings-editor-font-family-advanced-search-input');
    expect(searchInput).toHaveAttribute('placeholder', 'Search editor fonts...');
    expect(searchInput).toHaveClass('border-foreground/20');
    await waitFor(() => {
      expect(searchInput).not.toHaveFocus();
      expect(screen.getByTestId('settings-editor-font-family-advanced-close-button')).toHaveFocus();
    });
    expect(screen.getByTestId('settings-editor-font-family-current-card-fira-code')).toHaveAttribute('data-state', 'unselected');
    expect(screen.getByTestId('settings-editor-font-family-current-author-fira-code')).toHaveTextContent('Nikita Prokopov');
    expect(screen.getByTestId('settings-editor-font-family-preview-card-fira-code')).toHaveAttribute('data-state', 'selected');
    expect(screen.getByTestId('settings-editor-font-family-preview-letters-victor-mono')).toHaveTextContent('AaBbCcDdEe');
    expect(screen.getByTestId('settings-editor-font-family-preview-digits-victor-mono')).toHaveTextContent('0123456789');
    expect(screen.getByTestId('settings-editor-font-family-preview-author-victor-mono')).toHaveTextContent('Rubjo Vampjoen');
    expect(ensureEditorFontFamilyLoadedMock).toHaveBeenCalledWith('victor-mono');

    await user.type(searchInput, 'fira');

    expect(screen.getByTestId('settings-editor-font-family-current-card-fira-code')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-family-preview-card-fira-code')).toHaveAttribute('data-state', 'selected');
    expect(screen.queryByTestId('settings-editor-font-family-preview-card-victor-mono')).not.toBeInTheDocument();

    await user.clear(searchInput);
    fireEvent.change(searchInput, { target: { value: 'zzz' } });

    expect(screen.getByTestId('settings-editor-font-family-current-card-fira-code')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-family-advanced-empty-state')).toHaveTextContent('No editor font found.');
    expect(screen.queryByTestId('settings-editor-font-family-preview-card-fira-code')).not.toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'victor');

    expect(screen.getByTestId('settings-editor-font-family-preview-card-victor-mono')).toHaveAttribute('data-state', 'unselected');
    expect(screen.queryByTestId('settings-editor-font-family-preview-card-fira-code')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('settings-editor-font-family-preview-card-victor-mono'));

    await waitFor(() => {
      expect(screen.queryByTestId('settings-editor-font-family-advanced-dialog')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('settings-editor-font-family-combobox')).toHaveTextContent('Victor Mono');
    expect(setEditorFontFamilyMock).toHaveBeenCalledWith('victor-mono');
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('opens the advanced theme picker, filters preview cards, and applies the selected preview card', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'appearance');

    await user.click(screen.getByTestId('settings-theme-advanced-button'));

    expect(await screen.findByTestId('settings-theme-advanced-dialog')).toBeVisible();
    expect(screen.getByTestId('settings-theme-advanced-dialog')).toHaveClass('h-[85vh]');
    expect(screen.getByTestId('settings-theme-advanced-scroll-area')).toHaveClass('h-full');
    expect(screen.getByTestId('settings-theme-current-section')).toBeVisible();
    expect(screen.getByTestId('settings-theme-available-section')).toBeVisible();
    expect(screen.getByTestId('settings-theme-advanced-grid')).toBeVisible();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Available themes')).toBeInTheDocument();
    const searchInput = screen.getByTestId('settings-theme-advanced-search-input');
    expect(searchInput).toHaveAttribute('placeholder', 'Search UI themes...');
    expect(searchInput).toHaveClass('border-foreground/20');
    await waitFor(() => {
      expect(searchInput).not.toHaveFocus();
      expect(screen.getByTestId('settings-theme-advanced-close-button')).toHaveFocus();
    });
    expect(screen.getByTestId('settings-theme-current-card-vscode-2026-dark')).toHaveAttribute('data-state', 'unselected');
    expect(screen.getByTestId('settings-theme-current-author-vscode-2026-dark')).toHaveTextContent('Microsoft');
    expect(screen.getByTestId('settings-theme-current-editor-vscode-2026-dark')).toBeVisible();
    expect(screen.getByTestId('settings-theme-preview-card-vscode-2026-dark')).toHaveAttribute('data-state', 'selected');
    expect(screen.getByTestId('settings-theme-preview-label-vscode-2026-light')).toHaveClass('truncate');
    expect(screen.getByTestId('settings-theme-preview-label-vscode-2026-light')).toHaveClass('w-full');
    expect(screen.getByTestId('settings-theme-preview-author-vscode-2026-light')).toHaveTextContent('Microsoft');
    expect(screen.getByTestId('settings-theme-preview-editor-vscode-2026-light')).toBeVisible();
    expect(screen.getByTestId('settings-theme-preview-line-module-vscode-2026-light')).toHaveTextContent('module alu(clk)');
    expect(screen.getByTestId('settings-theme-preview-selection-vscode-2026-light')).toHaveTextContent("sum = calc('RUN')");

    await user.type(searchInput, 'zzz');

    expect(screen.getByTestId('settings-theme-current-card-vscode-2026-dark')).toBeVisible();
    expect(screen.getByTestId('settings-theme-advanced-empty-state')).toHaveTextContent('No UI theme found.');
    expect(screen.queryByTestId('settings-theme-preview-card-vscode-2026-dark')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'light' } });

    expect(screen.getByTestId('settings-theme-preview-card-vscode-2026-light')).toHaveAttribute('data-state', 'unselected');
    expect(screen.queryByTestId('settings-theme-preview-card-vscode-2026-dark')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('settings-theme-preview-card-vscode-2026-light'));

    await waitFor(() => {
      expect(screen.queryByTestId('settings-theme-advanced-dialog')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('settings-theme-combobox')).toHaveTextContent('Light 2026');
    expect(setThemeMock).toHaveBeenCalledWith('vscode-2026-light');
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows an animated preview card when hovering UI theme options in the settings combobox', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'appearance');

    await user.click(screen.getByTestId('settings-theme-combobox'));

    const themeSearchInput = screen.getByPlaceholderText('Search UI themes...');
    expect(themeSearchInput).toHaveAttribute('data-slot', 'command-input');
    expect(themeSearchInput).toHaveClass('pristine-command-search-input');
    expect(themeSearchInput).toHaveStyle('color: var(--ide-text)');
    expect(themeSearchInput.parentElement).toHaveClass('flex h-9 items-center gap-2 border-b px-3');

    expect(screen.getByTestId('settings-theme-combobox-popover-surface')).toHaveClass('w-(--radix-popover-trigger-width)');

    const previewPane = screen.getByTestId('settings-theme-combobox-preview-pane');
    expect(previewPane.parentElement).toBe(document.body);
    expect(previewPane).toHaveAttribute('data-state', 'hidden');

    fireEvent.mouseEnter(await screen.findByTestId('settings-theme-option-vscode-2026-light'));

    expect(previewPane).toHaveAttribute('data-state', 'visible');
    expect(previewPane).toHaveAttribute('data-side', 'right');
    expect(previewPane).toHaveAttribute('data-anchor-option', 'vscode-2026-light');
    expect(screen.getByTestId('settings-theme-combobox-preview-card-vscode-2026-light')).toBeVisible();
    expect(screen.getByTestId('settings-theme-combobox-preview-line-module-vscode-2026-light')).toHaveTextContent('module alu(clk)');

    fireEvent.mouseLeave(screen.getByTestId('settings-theme-combobox-popover-content'));

    expect(previewPane).toHaveAttribute('data-state', 'hidden');
  });

  it('shows an animated preview card when hovering editor font options in the settings combobox', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      fontFamily: 'fira-code',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'editor');

    await user.click(screen.getByTestId('settings-editor-font-family-combobox'));

    expect(screen.getByTestId('settings-editor-font-family-combobox-popover-surface')).toHaveClass('w-(--radix-popover-trigger-width)');

    const previewPane = screen.getByTestId('settings-editor-font-family-combobox-preview-pane');
    expect(previewPane.parentElement).toBe(document.body);
    expect(previewPane).toHaveAttribute('data-state', 'hidden');

    fireEvent.mouseEnter(await screen.findByTestId('settings-editor-font-family-option-victor-mono'));

    expect(previewPane).toHaveAttribute('data-state', 'visible');
    expect(previewPane).toHaveAttribute('data-side', 'right');
    expect(previewPane).toHaveAttribute('data-anchor-option', 'victor-mono');
    expect(screen.getByTestId('settings-editor-font-family-combobox-preview-card-victor-mono')).toBeVisible();
    expect(screen.getByTestId('settings-editor-font-family-combobox-preview-author-victor-mono')).toHaveTextContent('Rubjo Vampjoen');

    fireEvent.mouseLeave(screen.getByTestId('settings-editor-font-family-combobox-popover-content'));

    expect(previewPane).toHaveAttribute('data-state', 'hidden');
  });

  it('shows the advanced theme picker in list mode by default', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
      themePickerLayoutMode: 'list',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'appearance');

    await user.click(screen.getByTestId('settings-theme-advanced-button'));
    expect(await screen.findByTestId('settings-theme-advanced-dialog')).toBeVisible();

    expect(screen.getByTestId('settings-theme-advanced-layout-list-button')).toHaveAttribute('aria-label', 'List layout');
    expect(screen.getByTestId('settings-theme-advanced-layout-list-button')).not.toHaveTextContent('List');
    expect(screen.getByTestId('settings-theme-advanced-layout-grouped-button')).toHaveAttribute('aria-label', 'Grouped layout');
    expect(screen.getByTestId('settings-theme-advanced-layout-grouped-button')).not.toHaveTextContent('Grouped');
    expect(screen.getByTestId('settings-theme-advanced-layout-list-button')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('settings-theme-advanced-layout-grouped-button')).toHaveAttribute('data-state', 'off');
    expect(screen.getByTestId('settings-theme-advanced-grid')).toBeVisible();
    expect(screen.queryByTestId('settings-theme-advanced-dark-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-theme-advanced-light-section')).not.toBeInTheDocument();
  });

  it('persists the grouped layout selection for the advanced theme picker', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
      themePickerLayoutMode: 'list',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'appearance');

    await user.click(screen.getByTestId('settings-theme-advanced-button'));
    expect(await screen.findByTestId('settings-theme-advanced-dialog')).toBeVisible();

    await user.click(screen.getByTestId('settings-theme-advanced-layout-grouped-button'));

    expect(screen.getByTestId('settings-theme-advanced-layout-grouped-button')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('settings-theme-advanced-layout-list-button')).toHaveAttribute('data-state', 'off');
    expect(screen.getByTestId('settings-theme-advanced-dark-section')).toBeVisible();
    expect(screen.getByTestId('settings-theme-advanced-dark-grid')).toBeVisible();
    expect(screen.getByTestId('settings-theme-advanced-light-section')).toBeVisible();
    expect(screen.getByTestId('settings-theme-advanced-light-grid')).toBeVisible();
    expect(window.electronAPI?.config.set).toHaveBeenCalledWith('workbench.themePickerLayoutMode', 'grouped');

    await user.click(screen.getByTestId('settings-theme-advanced-close-button'));
    await user.click(screen.getByTestId('settings-close-button'));

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
      themePickerLayoutMode: 'grouped',
    });

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'appearance');

    await user.click(screen.getByTestId('settings-theme-advanced-button'));
    expect(await screen.findByTestId('settings-theme-advanced-dialog')).toBeVisible();

    expect(screen.getByTestId('settings-theme-advanced-layout-grouped-button')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('settings-theme-advanced-dark-section')).toBeVisible();
    expect(screen.getByTestId('settings-theme-advanced-light-section')).toBeVisible();
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('keeps the advanced editor font picker as a flat list without grouping controls', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      fontFamily: 'fira-code',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'editor');

    await user.click(screen.getByTestId('settings-editor-font-family-advanced-button'));
    expect(await screen.findByTestId('settings-editor-font-family-advanced-dialog')).toBeVisible();

    expect(screen.getByTestId('settings-editor-font-family-advanced-grid')).toBeVisible();
    expect(screen.queryByTestId('settings-theme-advanced-layout-toggle')).not.toBeInTheDocument();
    expect(screen.queryByText('Dark themes')).not.toBeInTheDocument();
    expect(screen.queryByText('Light themes')).not.toBeInTheDocument();
  });

  it('shows bundled third-party UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'pink',
      themeId: 'pink-cat-boo',
      label: 'Pink Cat Boo',
      author: 'Fiona Fan',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows vendored upstream bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'one dark',
      themeId: 'one-dark-pro',
      label: 'One Dark Pro',
      author: 'Binaryify',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows second-batch vendored upstream light bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'github light default',
      themeId: 'github-light-default',
      label: 'GitHub Light Default',
      author: 'GitHub',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows third-batch vendored upstream dark bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'gruvbox dark medium',
      themeId: 'gruvbox-dark-medium',
      label: 'Gruvbox Dark Medium',
      author: 'jdinhify',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows fourth-batch vendored upstream light bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'noctis lux',
      themeId: 'noctis-lux',
      label: 'Noctis Lux',
      author: 'Liviu Schera',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows fifth-batch vendored upstream macOS Modern bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'low key',
      themeId: 'macos-modern-light-ventura-xcode-low-key',
      label: 'MacOS Modern Light - Ventura Xcode Low Key',
      author: 'David B. Waters',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows sixth-batch vendored upstream Dobri bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'amethyst',
      themeId: 'dobri-next-a06-amethyst',
      label: 'Dobri Next -A06- Amethyst',
      author: 'Sergio Dobri',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows seventh-batch vendored upstream dark bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'night flat',
      themeId: 'one-dark-pro-night-flat',
      label: 'One Dark Pro Night Flat',
      author: 'Binaryify',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows seventh-batch vendored upstream light bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'light high contrast',
      themeId: 'github-light-high-contrast',
      label: 'GitHub Light High Contrast',
      author: 'GitHub',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows eighth-batch official vendored upstream dark bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'copilot theme - higher contrast',
      themeId: 'copilot-theme-higher-contrast',
      label: 'Copilot Theme - Higher Contrast',
      author: 'Benjamin Benais',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows eighth-batch official vendored upstream light bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'light (visual studio',
      themeId: 'visual-studio-light-cpp',
      label: 'Light (Visual Studio - C/C++)',
      author: 'Microsoft',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows ninth-batch vendored upstream dark bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'vue theme high contrast',
      themeId: 'vue-theme-high-contrast',
      label: 'Vue Theme High Contrast',
      author: 'Mario Rodeghiero',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows ninth-batch vendored upstream light bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'light owl',
      themeId: 'light-owl',
      label: 'Light Owl',
      author: 'Sarah Drasner',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows tenth-batch vendored upstream dark bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'andromeda',
      themeId: 'andromeda',
      label: 'Andromeda',
      author: 'Eliver Lara',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows tenth-batch vendored upstream light bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'atom one light',
      themeId: 'atom-one-light',
      label: 'Atom One Light',
      author: 'akamud',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows eleventh-batch vendored upstream dark bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'slack theme aubergine dark',
      themeId: 'slack-aubergine-dark-editor',
      label: 'Slack Theme Aubergine Dark',
      author: 'Felipe Mendes',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows eleventh-batch vendored upstream light bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'github light theme - gray',
      themeId: 'github-light-theme-gray',
      label: 'Github Light Theme - Gray',
      author: 'Hyzeta',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows final-batch vendored upstream dark bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'winter is coming',
      themeId: 'winter-is-coming-dark',
      label: 'Winter is Coming (Dark)',
      author: 'John Papa',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('shows final-batch vendored upstream light bundled UI themes in the advanced picker and applies them through the shared theme setting', async () => {
    const user = userEvent.setup();

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await applyBundledThemeFromAdvancedPicker(user, {
      searchText: 'alabaster',
      themeId: 'alabaster',
      label: 'Alabaster',
      author: 'Nikita Prokopov',
    });
  }, SETTINGS_PICKER_TEST_TIMEOUT_MS);

  it('imports a local UI theme from settings and selects it immediately', async () => {
    const user = userEvent.setup();

    importThemeMock.mockResolvedValue({
      value: 'imported-solarized-dark',
      label: 'Solarized Dark',
      description: 'Imported from solarized-dark.json.',
      author: 'Imported theme',
      kind: 'dark',
      source: 'imported',
    });

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'appearance');

    await user.click(screen.getByTestId('settings-theme-import-button'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-theme-combobox')).toHaveTextContent('Solarized Dark');
    });
    expect(importThemeMock).toHaveBeenCalledTimes(1);
  });

  it('re-reads persisted settings each time the dialog opens', async () => {
    const user = userEvent.setup();
    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-dark',
      bracketPairGuides: false,
      closeAction: 'tray',
      cursorBlinking: 'solid',
      floatingInfoWindowVisible: true,
      fontFamily: 'fira-code',
      fontLigatures: false,
      fontSize: 18,
      foldingStrategy: 'auto',
      glyphMargin: false,
      indentGuides: false,
      lineNumbers: 'relative',
      minimapEnabled: false,
      renderControlCharacters: true,
      renderWhitespace: 'all',
      scrollBeyondLastLine: true,
      smoothScrolling: false,
      tabSize: 8,
      wordWrap: 'bounded',
    });

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));

    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'editor');
    expect(screen.getByTestId('settings-editor-font-family-combobox')).toHaveTextContent(getEditorFontFamilyLabel('fira-code'));
    expect(screen.queryByTestId('settings-code-layout-margin-slider')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-editor-font-size-value')).toHaveTextContent('18px');
    expect(screen.getByTestId('settings-editor-word-wrap-combobox')).toHaveTextContent('Bounded');
    expect(screen.getByTestId('settings-editor-tab-size-combobox')).toHaveTextContent('8 spaces');
    expect(screen.getByTestId('settings-editor-cursor-blinking-combobox')).toHaveTextContent('Solid');
    expect(screen.getByTestId('settings-editor-render-whitespace-combobox')).toHaveTextContent('All');
    expect(screen.getByTestId('settings-editor-line-numbers-combobox')).toHaveTextContent('Relative');
    expect(screen.getByTestId('settings-editor-folding-strategy-combobox')).toHaveTextContent('Auto');
    expect(screen.getByTestId('settings-editor-font-ligatures-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-render-control-characters-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-editor-smooth-scrolling-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-scroll-beyond-last-line-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-editor-minimap-switch')).toHaveAttribute('data-state', 'unchecked');

    await openSettingsPage(user, 'appearance');
    expect(screen.getByTestId('settings-theme-combobox')).toHaveTextContent('Dark 2026');

    await openSettingsPage(user, 'window');
    expect(screen.getByTestId('settings-close-to-tray-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-floating-info-window-switch')).toHaveAttribute('data-state', 'checked');

    await user.click(screen.getByTestId('settings-close-button'));

    mockPersistedSettingsConfig({
      colorTheme: 'vscode-2026-light',
      bracketPairGuides: true,
      closeAction: 'quit',
      cursorBlinking: 'smooth',
      floatingInfoWindowVisible: false,
      fontFamily: 'jetbrains-mono',
      fontLigatures: true,
      fontSize: 12,
      foldingStrategy: 'indentation',
      glyphMargin: true,
      indentGuides: true,
      lineNumbers: 'on',
      minimapEnabled: true,
      renderControlCharacters: false,
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 4,
      wordWrap: 'off',
    });

    await user.click(screen.getByTestId('menu-settings-button'));

    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'editor');
    expect(screen.getByTestId('settings-editor-font-family-combobox')).toHaveTextContent('JetBrains Mono');
    expect(screen.queryByTestId('settings-code-layout-margin-slider')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-editor-font-size-value')).toHaveTextContent('12px');
    expect(screen.getByTestId('settings-editor-word-wrap-combobox')).toHaveTextContent('Off');
    expect(screen.getByTestId('settings-editor-tab-size-combobox')).toHaveTextContent('4 spaces');
    expect(screen.getByTestId('settings-editor-cursor-blinking-combobox')).toHaveTextContent('Smooth');
    expect(screen.getByTestId('settings-editor-render-whitespace-combobox')).toHaveTextContent('Selection');
    expect(screen.getByTestId('settings-editor-line-numbers-combobox')).toHaveTextContent('On');
    expect(screen.getByTestId('settings-editor-folding-strategy-combobox')).toHaveTextContent('Indentation');
    expect(screen.getByTestId('settings-editor-font-ligatures-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-editor-render-control-characters-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-smooth-scrolling-switch')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('settings-editor-scroll-beyond-last-line-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-editor-minimap-switch')).toHaveAttribute('data-state', 'checked');

    await openSettingsPage(user, 'appearance');
    expect(screen.getByTestId('settings-theme-combobox')).toHaveTextContent('Light 2026');

    await openSettingsPage(user, 'window');
    expect(screen.getByTestId('settings-close-to-tray-switch')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('settings-floating-info-window-switch')).toHaveAttribute('data-state', 'unchecked');
  });

  it('renders newly downloaded Monaco font options in the settings combobox', async () => {
    const user = userEvent.setup();

    renderMenuBar();

    await user.click(screen.getByTestId('menu-settings-button'));
    expect(await screen.findByTestId('settings-dialog')).toBeVisible();
    await openSettingsPage(user, 'editor');
    await user.click(screen.getByTestId('settings-editor-font-family-combobox'));

    expect(await screen.findByTestId('settings-editor-font-family-option-liberation-mono')).toHaveTextContent('Liberation Mono');
    expect(screen.getByTestId('settings-editor-font-family-option-zxproto')).toHaveTextContent('ZxProto');
    expect(screen.getByTestId('settings-editor-font-family-option-m-plus-code-latin-50')).toHaveTextContent('M PLUS Code Latin 50');
    expect(screen.getByTestId('settings-editor-font-family-option-meslo-lg-dz')).toHaveTextContent('Meslo LG DZ');
    expect(screen.getByTestId('settings-editor-font-family-option-meslo-lg-mdz')).toHaveTextContent('Meslo LG MDZ');
    expect(screen.getByTestId('settings-editor-font-family-option-meslo-lg-sdz')).toHaveTextContent('Meslo LG SDZ');
    expect(await screen.findByTestId('settings-editor-font-family-option-monaspace-neon')).toHaveTextContent('Monaspace Neon');
    expect(screen.getByTestId('settings-editor-font-family-option-0xproto')).toHaveTextContent('0xProto');
    expect(screen.getByTestId('settings-editor-font-family-option-julia-mono')).toHaveTextContent('JuliaMono');
  });
});
