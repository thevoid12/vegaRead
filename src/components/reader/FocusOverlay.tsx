interface FocusOverlayProps {
  word: string;
  wordIdx: number;
  wordCount: number;
  isRunning: boolean;
  wpm: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/**
 * RSVP (Rapid Serial Visual Presentation) focus overlay.
 * Covers the reading area with a semi-transparent blurred backdrop and shows
 * one word at a time in a centred glassmorphism card.
 */
export function FocusOverlay({
  word,
  wordIdx,
  wordCount,
  isRunning,
  wpm,
  onPause,
  onResume,
  onStop,
}: FocusOverlayProps) {
  const progress = wordCount > 0 ? (wordIdx + 1) / wordCount : 0;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px]">
      {/* ── Word card ──────────────────────────────────────── */}
      <div className="w-full max-w-sm mx-6 rounded-2xl bg-white/15 backdrop-blur border border-white/25 shadow-2xl px-8 py-10 flex flex-col items-center gap-5">

        {/* Current word */}
        <div
          className="text-4xl font-bold text-white tracking-wide text-center min-h-[3rem] flex items-center select-none"
          aria-live="polite"
          aria-atomic="true"
        >
          {word}
        </div>

        {/* Progress bar */}
        <div className="w-full h-0.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/70 rounded-full"
            style={{ width: `${progress * 100}%`, transition: 'width 0.1s linear' }}
          />
        </div>

        {/* Stats */}
        <div className="text-white/50 text-xs tabular-nums select-none">
          {wordIdx + 1}&thinsp;/&thinsp;{wordCount} words&ensp;&middot;&ensp;{wpm}&thinsp;wpm
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 mt-1">
          <button
            type="button"
            onClick={isRunning ? onPause : onResume}
            className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {isRunning ? (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
                Pause
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Resume
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="4" y="4" width="16" height="16" rx="1" />
            </svg>
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
