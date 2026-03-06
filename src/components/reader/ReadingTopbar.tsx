export type SrState = 'idle' | 'running' | 'paused';
export type SrMode  = 'inline' | 'focus';

interface ReadingTopbarProps {
  bookTitle: string;
  author: string;
  fontSize: number;
  onBack: () => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  // Speed reader
  srState: SrState;
  srWordIdx: number;
  srWordCount: number;
  srWpm: number;
  onStartSR: (mode: SrMode) => void;
  onPauseSR: () => void;
  onResumeSR: () => void;
  onStopSR: () => void;
  onOpenSettings: () => void;
  /**
   * false = inactive
   * 'inline' | 'focus' = waiting for user to click a word in the iframe
   */
  srEntryMode: false | SrMode;
  onActivateEntryMode: (mode: SrMode) => void;
  onCancelEntryMode: () => void;
}

/**
 * Topbar shown while reading a book.
 *
 * Right section — three states:
 *   idle       → font controls + [▶ Inline] [⊕] [▶ Focus] [⊕] + settings
 *   entry mode → "Inline/Focus — click any word to start" + Cancel
 *   sr active  → word counter · Pause/Resume · Stop · settings
 */
export function ReadingTopbar({
  bookTitle,
  author,
  fontSize,
  onBack,
  onIncreaseFontSize,
  onDecreaseFontSize,
  srState,
  srWordIdx,
  srWordCount,
  srWpm,
  onStartSR,
  onPauseSR,
  onResumeSR,
  onStopSR,
  onOpenSettings,
  srEntryMode,
  onActivateEntryMode,
  onCancelEntryMode,
}: ReadingTopbarProps) {
  const srActive = srState !== 'idle';

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

      {/* ── Title (centre, fills available space) ─────────── */}
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

        {srActive ? (
          /* ── Speed-reader active controls ── */
          <>
            {/* Word counter */}
            <span className="text-fg-muted text-[11px] tabular-nums select-none px-1">
              {srWordIdx + 1}&thinsp;/&thinsp;{srWordCount}
              &ensp;&middot;&ensp;{srWpm}&thinsp;wpm
            </span>

            {/* Pause / Resume */}
            <button
              type="button"
              onClick={srState === 'running' ? onPauseSR : onResumeSR}
              className="
                inline-flex items-center gap-1
                text-fg-secondary hover:text-fg-primary
                rounded-md px-2.5 py-1.5
                text-xs font-medium transition-colors hover:bg-app-hover
              "
              aria-label={srState === 'running' ? 'Pause speed reading' : 'Resume speed reading'}
            >
              {srState === 'running' ? (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                  Resume
                </>
              )}
            </button>

            {/* Stop */}
            <button
              type="button"
              onClick={onStopSR}
              className="
                inline-flex items-center gap-1
                text-fg-secondary hover:text-fg-primary
                rounded-md px-2.5 py-1.5
                text-xs font-medium transition-colors hover:bg-app-hover
              "
              aria-label="Stop speed reading"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="4" y="4" width="16" height="16" rx="1" />
              </svg>
              Stop
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="
                w-7 h-7 flex items-center justify-center
                text-fg-secondary hover:text-fg-primary
                rounded-md transition-colors hover:bg-app-hover ml-0.5
              "
              aria-label="Open reading settings"
              title="Settings"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </>

        ) : srEntryMode !== false ? (
          /* ── Entry mode: waiting for user to click a word ── */
          <>
            <span className="text-fg-secondary text-xs select-none">
              <span className="font-semibold text-fg-primary capitalize">{srEntryMode}</span>
              {' '}mode&thinsp;—&thinsp;click any word to start
            </span>
            <button
              type="button"
              onClick={onCancelEntryMode}
              className="
                inline-flex items-center gap-1
                text-fg-secondary hover:text-fg-primary
                rounded-md px-2.5 py-1.5 ml-1
                text-xs font-medium transition-colors hover:bg-app-hover
                border border-app-border
              "
              aria-label="Cancel entry mode"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Cancel
            </button>
          </>

        ) : (
          /* ── Idle: font controls + start buttons + entry mode ── */
          <>
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

            {/* Inline speed-read group: start + pick word */}
            <div className="flex items-center ml-1 rounded-md overflow-hidden border border-app-border">
              <button
                type="button"
                onClick={() => onStartSR('inline')}
                className="
                  inline-flex items-center gap-1.5
                  bg-app-hover text-fg-secondary hover:text-fg-primary
                  px-2.5 py-1.5
                  text-xs font-medium transition-colors hover:bg-app-border
                  select-none border-r border-app-border
                "
                title="Inline speed read — highlight word-by-word in the book"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Inline
              </button>
              <button
                type="button"
                onClick={() => onActivateEntryMode('inline')}
                className="
                  w-7 h-full flex items-center justify-center
                  bg-app-hover text-fg-secondary hover:text-fg-primary hover:bg-app-border
                  transition-colors select-none
                "
                title="Pick a word to start Inline SR from that position"
                aria-label="Start Inline SR from a specific word"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
              </button>
            </div>

            {/* Focus (RSVP) speed-read group: start + pick word */}
            <div className="flex items-center rounded-md overflow-hidden border border-accent">
              <button
                type="button"
                onClick={() => onStartSR('focus')}
                className="
                  inline-flex items-center gap-1.5
                  bg-accent text-white hover:bg-accent/90
                  px-2.5 py-1.5
                  text-xs font-medium transition-colors
                  select-none border-r border-accent/50
                "
                title="Focus speed read — one word at a time in an overlay"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Focus
              </button>
              <button
                type="button"
                onClick={() => onActivateEntryMode('focus')}
                className="
                  w-7 h-full flex items-center justify-center
                  bg-accent text-white/80 hover:text-white hover:bg-accent/90
                  transition-colors select-none
                "
                title="Pick a word to start Focus SR from that position"
                aria-label="Start Focus SR from a specific word"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
              </button>
            </div>

            {/* Settings */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="
                w-7 h-7 flex items-center justify-center
                text-fg-secondary hover:text-fg-primary
                rounded-md transition-colors hover:bg-app-hover ml-0.5
              "
              aria-label="Open reading settings"
              title="Settings"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
