import { Copy, Minus, Square, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useCodeViewerLayout } from '../../../context/CodeViewerLayoutContext';

interface MenuBarWindowControlsProps {
  interactiveStyle: CSSProperties;
  onRequestClose: () => void;
}

export function MenuBarWindowControls({
  interactiveStyle,
  onRequestClose,
}: MenuBarWindowControlsProps) {
  const { layoutMode } = useCodeViewerLayout();
  const [isMaximized, setIsMaximized] = useState(() => window.electronAPI?.isMaximized() === true);
  const isMinimalLayout = layoutMode === 'minimal';
  const controlBaseClassName = 'w-9 h-full flex items-center justify-center transition-colors';
  const controlClassName = isMinimalLayout
    ? `${controlBaseClassName} text-ide-unified-chrome-fg/80 hover:text-ide-unified-chrome-fg hover:bg-ide-unified-chrome-hover`
    : `${controlBaseClassName} text-ide-text-muted hover:text-ide-text hover:bg-ide-hover`;
  const closeControlClassName = isMinimalLayout
    ? `${controlBaseClassName} text-ide-unified-chrome-fg/80 hover:text-primary-foreground hover:bg-ide-close`
    : `${controlBaseClassName} text-ide-text-muted hover:text-primary-foreground hover:bg-ide-close`;
  const maximizeLabel = isMaximized ? 'Restore Window' : 'Maximize Window';

  useEffect(() => window.electronAPI?.onMaximizedChange(setIsMaximized), []);

  return (
    <>
      <button
        type="button"
        data-testid="window-control-minimize"
        className={controlClassName}
        style={interactiveStyle}
        onClick={() => window.electronAPI?.minimize()}
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        data-testid="window-control-maximize"
        aria-label={maximizeLabel}
        title={maximizeLabel}
        className={controlClassName}
        style={interactiveStyle}
        onClick={() => window.electronAPI?.maximize()}
      >
        {isMaximized ? <Copy size={13} /> : <Square size={12} />}
      </button>
      <button
        type="button"
        data-testid="window-control-close"
        className={closeControlClassName}
        style={interactiveStyle}
        onClick={onRequestClose}
      >
        <X size={14} />
      </button>
    </>
  );
}
