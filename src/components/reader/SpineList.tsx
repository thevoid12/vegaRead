import type { SpineItem } from '../../types';

interface SpineListProps {
  items: SpineItem[];
  isLoading: boolean;
  currentIndex: number;
  onSelect: (index: number) => void;
}


function formatLabel(item: SpineItem, index: number): string {
  if (item.title && item.title.trim().length > 0) {
    return item.title.trim();
  }

  const source = item.href ?? item.idref;

  const filename = source.split('/').pop() ?? source;
  const noExt    = filename.replace(/\.[^.]+$/, '');
  const noSuffix = noExt.replace(/[-_](xhtml|html|xml)$/i, '');
  const noPrefix = noSuffix.replace(/^(x|xhtml|html)[-_]/i, '');
  const spaced   = noPrefix.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (!spaced || spaced.length < 2) return `Part ${index + 1}`;
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SpineList({ items, isLoading, currentIndex, onSelect }: SpineListProps) {
  return (
    <aside className="flex flex-col w-52 shrink-0 bg-[#f5f4f1] border-r border-app-border overflow-hidden">
      <div className="px-3 py-2.5 border-b border-app-border shrink-0">
        <h3 className="text-fg-muted text-[11px] font-semibold uppercase tracking-wider select-none">
          Contents
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-fg-muted text-xs text-center">No chapters found</p>
        ) : (
          items.map((item, idx) => {
            const isActive = idx === currentIndex;
            const label    = formatLabel(item, idx);
            return (
              <button
                key={item.idref}
                type="button"
                onClick={() => onSelect(idx)}
                title={label}
                className={`
                  w-full text-left px-3 py-2 flex items-center gap-2
                  text-sm transition-colors duration-100
                  focus:outline-none focus-visible:ring-1 focus-visible:ring-accent
                  ${isActive
                    ? 'bg-accent/10 text-accent font-medium border-l-2 border-accent pl-[10px]'
                    : 'text-fg-secondary hover:bg-app-hover hover:text-fg-primary border-l-2 border-transparent pl-[10px]'
                  }
                `}
              >
                <span className={`shrink-0 text-[10px] w-5 text-right ${isActive ? 'text-accent' : 'text-fg-muted'}`}>
                  {idx + 1}
                </span>
                <span className="truncate leading-snug">
                  {label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
