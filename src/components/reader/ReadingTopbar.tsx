interface ReadingTopbarProps {
  bookTitle: string;
  author: string;
  fontSize: number;
  onBack: () => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
}

/**
 * Topbar shown while reading a book.
 * Contains: back-to-library, title, zoom controls, and a stubbed Speed Read button.
 */
export function ReadingTopbar({
  bookTitle,
  author,
  fontSize,
  onBack,
  onIncreaseFontSize,
  onDecreaseFontSize,
}: ReadingTopbarProps) {
  return (
    <header className="flex items-center gap-3 px-3 py-2 bg-app-surface border-b border-app-border shrink-0">
      {/* ── Back button ───────────────────────────────────── */}
      <button
        type="button"
        onClick={onBack}
        className="
          shrink-0 inline-flex items-center gap-1
          text-fg-secondary hover:text-fg-primary
          rounded-md px-2 py-1.5 -ml-1
          text-xs font-medium transition-colors
          hover:bg-app-hover
        "
        aria-label="Back to library"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Library
      </button>

      {/* ── Title (center, fills available space) ─────────── */}
      <div className="flex flex-col min-w-0 flex-1 text-center">
        <span className="text-fg-primary text-sm font-semibold leading-tight truncate">
          {bookTitle}
        </span>
        {author && (
          <span className="text-fg-muted text-[11px] leading-tight truncate">{author}</span>
        )}
      </div>

      {/* ── Right controls ────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1">
        {/* Font size controls */}
        <div className="flex items-center gap-0.5 bg-app-bg rounded-md border border-app-border px-1 py-0.5">
          <button
            type="button"
            onClick={onDecreaseFontSize}
            className="w-6 h-6 flex items-center justify-center text-fg-secondary hover:text-fg-primary rounded transition-colors"
            aria-label="Decrease font size"
            title="Decrease font size"
          >
            <span className="text-[11px] font-bold leading-none select-none">A</span>
            <span className="text-[7px] leading-none select-none mb-0.5">−</span>
          </button>

          <span className="text-fg-muted text-[10px] w-7 text-center select-none tabular-nums">
            {fontSize}px
          </span>

          <button
            type="button"
            onClick={onIncreaseFontSize}
            className="w-6 h-6 flex items-center justify-center text-fg-secondary hover:text-fg-primary rounded transition-colors"
            aria-label="Increase font size"
            title="Increase font size"
          >
            <span className="text-[13px] font-bold leading-none select-none">A</span>
            <span className="text-[7px] leading-none select-none mb-0.5">+</span>
          </button>
        </div>

        {/* Speed Read — placeholder, not yet implemented */}
        <button
          type="button"
          disabled
          title="Speed reader — coming soon"
          className="
            inline-flex items-center gap-1.5
            bg-app-hover text-fg-muted
            border border-app-border
            rounded-md px-3 py-1.5 ml-1
            text-xs font-medium
            cursor-not-allowed opacity-60
            select-none
          "
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <polygon points="5,3 19,12 5,21" />
          </svg>
          Start
        </button>
      </div>
    </header>
  );
}
