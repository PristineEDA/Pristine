import type { KeyboardEvent } from 'react';

import {
  getEditorFontFamilyAuthor,
  getEditorFontFamilyLabel,
  getEditorFontFamilyStack,
  type EditorFontFamilyId,
} from '../../../editor/editorSettings';
import type { ColorThemeOption, ColorThemePreviewPalette } from '../../../theme/colorThemeTypes';
import { cn } from '../../../../lib/utils';
import { Card, CardContent, CardFooter } from '../../ui/card';

const previewCardBaseClassName = 'gap-0 overflow-hidden py-0 transition-[border-color,background-color,box-shadow]';
const interactivePreviewCardClassName = 'hover:cursor-pointer hover:border-accent-foreground/20 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const previewCardSelectedClassName = 'border-black shadow-sm';

const fontPreviewLetters = 'AaBbCcDdEe';
const fontPreviewDigits = '0123456789';

function handleInteractiveCardKeyDown<T>(
  event: KeyboardEvent<HTMLDivElement>,
  value: T,
  onSelect?: (value: T) => void,
) {
  if (!onSelect) {
    return;
  }

  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  onSelect(value);
}

export interface ColorThemePreviewCardProps {
  isSelected: boolean;
  onSelect?: (themeId: string) => void;
  option: ColorThemeOption;
  preview: ColorThemePreviewPalette;
  testIdPrefix: string;
}

export function ColorThemePreviewCard({
  isSelected,
  onSelect,
  option,
  preview,
  testIdPrefix,
}: ColorThemePreviewCardProps) {
  const isInteractive = Boolean(onSelect);
  const handleSelect = onSelect ? () => onSelect(option.value) : undefined;

  return (
    <Card
      aria-label={`Select ${option.label}`}
      aria-pressed={isInteractive ? isSelected : undefined}
      className={cn(
        previewCardBaseClassName,
        isInteractive && interactivePreviewCardClassName,
        isSelected && previewCardSelectedClassName,
      )}
      data-state={isSelected ? 'selected' : 'unselected'}
      data-testid={`${testIdPrefix}-card-${option.value}`}
      onClick={handleSelect}
      onKeyDown={isInteractive ? (event) => handleInteractiveCardKeyDown(event, option.value, onSelect) : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <CardContent className="flex min-h-32 items-center justify-center px-3 py-6 sm:px-4">
        <div
          className="w-full max-w-[15rem] overflow-hidden rounded-md border shadow-sm"
          data-testid={`${testIdPrefix}-editor-${option.value}`}
          style={{
            backgroundColor: preview.background,
            borderColor: `${preview.comment}44`,
          }}
        >
          <div className="grid grid-cols-[2rem_minmax(0,1fr)] text-left font-mono text-[9px] leading-[1.15rem] sm:text-[10px]">
            <div
              className="border-r px-1.5 py-2 text-right"
              style={{
                backgroundColor: preview.surface,
                borderColor: `${preview.comment}33`,
                color: preview.comment,
              }}
            >
              <div>1</div>
              <div>2</div>
              <div>3</div>
              <div>4</div>
            </div>
            <div className="space-y-0.5 px-2 py-2" style={{ color: preview.foreground }}>
              <div className="truncate" data-testid={`${testIdPrefix}-line-comment-${option.value}`}>
                <span style={{ color: preview.comment }}>{'// timing path'}</span>
              </div>
              <div className="truncate" data-testid={`${testIdPrefix}-line-module-${option.value}`}>
                <span style={{ color: preview.pink }}>module</span>{' '}
                <span style={{ color: preview.cyan }}>alu</span>
                <span style={{ color: preview.foreground }}>(</span>
                <span style={{ color: preview.orange }}>clk</span>
                <span style={{ color: preview.foreground }}>)</span>
              </div>
              <div
                className="truncate rounded-sm px-1"
                data-testid={`${testIdPrefix}-selection-${option.value}`}
                style={{ backgroundColor: preview.selection }}
              >
                <span style={{ color: preview.orange }}>sum</span>{' '}
                <span style={{ color: preview.foreground }}>=</span>{' '}
                <span style={{ color: preview.green }}>calc</span>
                <span style={{ color: preview.foreground }}>(</span>
                <span style={{ color: preview.yellow }}>'RUN'</span>
                <span style={{ color: preview.foreground }}>)</span>
              </div>
              <div className="truncate" data-testid={`${testIdPrefix}-line-end-${option.value}`}>
                <span style={{ color: preview.pink }}>endmodule</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="relative h-11 justify-center overflow-hidden border-t border-border/70 bg-muted/35 px-3 py-2.5 text-[13px] font-medium text-foreground">
        <div className="absolute inset-x-0 top-1/2 flex min-w-0 -translate-y-1/2 flex-col items-center leading-none">
          <span
            className="block w-full truncate px-3 text-center"
            data-testid={`${testIdPrefix}-label-${option.value}`}
          >
            {option.label}
          </span>
          <span
            className="mt-px text-[10px] font-normal text-muted-foreground"
            data-testid={`${testIdPrefix}-author-${option.value}`}
          >
            {option.author}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}

export interface EditorFontPreviewCardProps {
  fontFamily: EditorFontFamilyId;
  isSelected: boolean;
  onSelect?: (fontFamily: EditorFontFamilyId) => void;
  testIdPrefix: string;
}

export function EditorFontPreviewCard({
  fontFamily,
  isSelected,
  onSelect,
  testIdPrefix,
}: EditorFontPreviewCardProps) {
  const author = getEditorFontFamilyAuthor(fontFamily);
  const label = getEditorFontFamilyLabel(fontFamily);
  const stack = getEditorFontFamilyStack(fontFamily);
  const isInteractive = Boolean(onSelect);
  const handleSelect = onSelect ? () => onSelect(fontFamily) : undefined;

  return (
    <Card
      aria-label={`Select ${label}`}
      aria-pressed={isInteractive ? isSelected : undefined}
      className={cn(
        previewCardBaseClassName,
        isInteractive && interactivePreviewCardClassName,
        isSelected && previewCardSelectedClassName,
      )}
      data-state={isSelected ? 'selected' : 'unselected'}
      data-testid={`${testIdPrefix}-card-${fontFamily}`}
      onClick={handleSelect}
      onKeyDown={isInteractive ? (event) => handleInteractiveCardKeyDown(event, fontFamily, onSelect) : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <CardContent className="flex min-h-32 items-center justify-center px-3 py-6 sm:px-4">
        <div className="space-y-1.5 text-center text-foreground" style={{ fontFamily: stack }}>
          <p
            className="text-[1.35rem] leading-none font-medium tracking-[0.02em]"
            data-testid={`${testIdPrefix}-letters-${fontFamily}`}
          >
            {fontPreviewLetters}
          </p>
          <p
            className="text-[0.95rem] leading-none tracking-[0.08em]"
            data-testid={`${testIdPrefix}-digits-${fontFamily}`}
          >
            {fontPreviewDigits}
          </p>
        </div>
      </CardContent>
      <CardFooter className="relative h-10 justify-center overflow-hidden border-t border-border/70 bg-muted/35 px-3 py-2.5 text-[13px] font-medium text-foreground">
        <div className="absolute inset-x-0 top-1/2 flex min-w-0 -translate-y-1/2 flex-col items-center leading-none">
          <span
            className="block w-full truncate px-3 text-center"
            data-testid={`${testIdPrefix}-label-${fontFamily}`}
          >
            {label}
          </span>
          <span
            className="mt-px text-[10px] font-normal text-muted-foreground"
            data-testid={`${testIdPrefix}-author-${fontFamily}`}
          >
            {author}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
