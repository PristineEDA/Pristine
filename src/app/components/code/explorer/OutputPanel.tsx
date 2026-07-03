import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { useOutputLog } from '../../../../data/mockDataLoader';
import { TooltipIconButton } from '../../ui/tooltip-icon-button';

const levelConfig = {
  info: { className: 'text-ide-info', label: 'INFO' },
  warn: { className: 'text-ide-warning', label: 'WARN' },
  error: { className: 'text-ide-error', label: 'ERROR' },
};

const outputFilterInputStyle = {
  color: 'var(--input-foreground)',
  WebkitTextFillColor: 'var(--input-foreground)',
};

export function OutputPanel() {
  const outputLog = useOutputLog();
  const [filterText, setFilterText] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');

  const filtered = useMemo(() => outputLog.filter((entry) => {
    const matchLevel = levelFilter === 'all' || entry.level === levelFilter;
    const matchText = !filterText || entry.text.toLowerCase().includes(filterText.toLowerCase());
    return matchLevel && matchText;
  }), [filterText, levelFilter, outputLog]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-ide-border shrink-0">
        <div className="flex items-center gap-1 bg-input-background rounded px-2 py-0.5 flex-1 max-w-48">
          <Search size={11} className="text-ide-text-muted" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter output..."
            className="bg-transparent outline-none text-input-foreground flex-1 text-[11px] placeholder:text-ide-text-dimmer"
            style={outputFilterInputStyle}
          />
        </div>
        {(['all', 'info', 'warn', 'error'] as const).map((l) => (
          <button
            type="button"
            key={l}
            onClick={() => setLevelFilter(l)}
            className={`px-2 py-0.5 rounded transition-colors ${
              levelFilter === l ? 'bg-ide-accent text-primary-foreground' : 'text-ide-text-muted hover:text-ide-text'
            } text-[10px]`}
          >
            {l === 'all' ? 'All' : l.toUpperCase()}
          </button>
        ))}
        <TooltipIconButton content="Clear">
          <button type="button" aria-label="Clear" className="ml-auto p-1 text-ide-text-muted hover:text-ide-text transition-colors">
            <Trash2 size={12} />
          </button>
        </TooltipIconButton>
      </div>
      <div className="bottom-panel-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-[12px]">
        {filtered.map((entry, i) => {
          const cfg = levelConfig[entry.level as keyof typeof levelConfig];
          return (
            <div key={i} className="flex items-start gap-2 hover:bg-ide-hover px-1 py-0.5 rounded">
              <span className="text-ide-text-muted/70 shrink-0 text-[11px]">{entry.time}</span>
              <span
                className={`px-1 rounded shrink-0 text-[9px] font-bold bg-ide-tab-bg leading-[16px] ${cfg?.className ?? 'text-ide-text'}`}
              >
                {cfg?.label || entry.level.toUpperCase()}
              </span>
              <span className={cfg?.className ?? 'text-ide-text'}>{entry.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
