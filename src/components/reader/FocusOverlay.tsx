interface FocusOverlayProps {
  word: string;
  wordIdx: number;
  wordCount: number;
  isRunning: boolean;
  isReady: boolean;
  wpm: number;
  focusFontSize: number;
  focusWordColor?: string;
  backgroundMode?: 'static' | 'tracking' | 'opaque';
  onFontSizeIncrease: () => void;
  onFontSizeDecrease: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function FocusOverlay({
  word,
  wordIdx,
  wordCount,
  isRunning,
  isReady,
  wpm,
  focusFontSize,
  focusWordColor = '#000000',
  backgroundMode = 'tracking',
  onFontSizeIncrease,
  onFontSizeDecrease,
  onStart,
  onPause,
  onResume,
  onStop,
}: FocusOverlayProps) {
  const progress = wordCount > 0 ? (wordIdx + 1) / wordCount : 0;

  return (
    <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center ${backgroundMode === 'opaque' ? 'bg-[#1a1a1a]' : 'bg-black/55 backdrop-blur-[3px]'}`}>

      <div className="rounded-2xl bg-white/20 backdrop-blur border border-white/30 shadow-2xl px-10 py-8 flex flex-col items-center gap-6 w-[min(480px,65vw)]">

        <div
          className="text-center select-none break-words w-full"
          style={{
            fontSize: `${focusFontSize}px`,
            fontWeight: 200,
            fontFamily: 'Georgia, "Palatino Linotype", Palatino, serif',
            color: focusWordColor,
            WebkitTextStroke: `${Math.max(3, Math.round(focusFontSize / 16))}px`,
            letterSpacing: '0.02em',
            lineHeight: 1.25,
            height: `${Math.ceil(focusFontSize * 1.4)}px`,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-live="polite"
          aria-atomic="true"
        >
          {word || '\u00A0' /* nbsp keeps height stable on empty word */}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onFontSizeDecrease}
            className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-md transition-colors text-sm font-bold select-none"
            aria-label="Decrease word size"
            title="Smaller"
          >
            A−
          </button>
          <span className="text-white/60 text-xs tabular-nums w-10 text-center select-none">
            {focusFontSize}px
          </span>
          <button
            type="button"
            onClick={onFontSizeIncrease}
            className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-md transition-colors text-sm font-bold select-none"
            aria-label="Increase word size"
            title="Larger"
          >
            A+
          </button>
        </div>

        {isReady ? (
          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-white rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors shadow"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Start Reading
            </button>
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="w-full h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/70 rounded-full"
                style={{ width: `${progress * 100}%`, transition: 'width 0.1s linear' }}
              />
            </div>

            <div className="text-white/50 text-xs tabular-nums select-none -mt-2">
              {wordIdx + 1}&thinsp;/&thinsp;{wordCount} words&ensp;&middot;&ensp;{wpm}&thinsp;wpm
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}
