const WPM_MIN = 50;
const WPM_MAX = 1000;

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Speed
  wpm: number;
  onWpmChange: (wpm: number) => void;
  // Reading font size
  fontSize: number;
  onFontSizeIncrease: () => void;
  onFontSizeDecrease: () => void;
  // Focus word size
  focusFontSize: number;
  onFocusFontSizeIncrease: () => void;
  onFocusFontSizeDecrease: () => void;
  // Colors
  inlineHighlightColor: string;
  onInlineHighlightColorChange: (color: string) => void;
  focusWordColor: string;
  onFocusWordColorChange: (color: string) => void;
  focusBackgroundMode: 'static' | 'tracking' | 'opaque';
  onFocusBackgroundModeChange: (mode: 'static' | 'tracking' | 'opaque') => void;
}

/**
 * Right-side settings drawer that slides in from the edge.
 * Positioned absolutely inside the reading area's relative wrapper so it
 * overlays both the spine list and the book content.
 */
export function SettingsPanel({
  isOpen,
  onClose,
  wpm,
  onWpmChange,
  fontSize,
  onFontSizeIncrease,
  onFontSizeDecrease,
  focusFontSize,
  onFocusFontSizeIncrease,
  onFocusFontSizeDecrease,
  inlineHighlightColor,
  onInlineHighlightColorChange,
  focusWordColor,
  onFocusWordColorChange,
  focusBackgroundMode,
  onFocusBackgroundModeChange,
}: SettingsPanelProps) {
  return (
    <>
      {/* Click-away backdrop */}
      <div
        className={`absolute inset-0 z-30 bg-black/20 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`
          absolute top-0 right-0 h-full z-40 w-72
          bg-white/85 backdrop-blur-2xl
          border-l border-app-border shadow-2xl
          flex flex-col
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-label="Reading settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-app-border shrink-0">
          <span className="text-sm font-semibold text-fg-primary">Reading Settings</span>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg-primary hover:bg-app-hover transition-colors"
            aria-label="Close settings"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-7">

          {/* ── Speed ── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wider">Speed</span>
              <span className="text-sm font-semibold text-fg-primary tabular-nums">{wpm} wpm</span>
            </div>
            <input
              type="range"
              min={WPM_MIN}
              max={WPM_MAX}
              step={10}
              value={wpm}
              onChange={e => onWpmChange(Number(e.target.value))}
              className="w-full accent-accent"
              aria-label="Words per minute"
            />
            <div className="flex justify-between text-[10px] text-fg-muted select-none">
              <span>{WPM_MIN}</span>
              <span>500</span>
              <span>{WPM_MAX}</span>
            </div>
          </section>

          <div className="h-px bg-app-border" />

          {/* ── Reading font size ── */}
          <section className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wider">Reading Font</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onFontSizeDecrease}
                className="flex-1 py-1.5 rounded-md bg-app-hover hover:bg-app-border text-fg-secondary hover:text-fg-primary text-xs font-bold transition-colors select-none"
                aria-label="Decrease reading font size"
              >
                A−
              </button>
              <span className="w-14 text-center text-sm text-fg-primary tabular-nums font-medium select-none">
                {fontSize}px
              </span>
              <button
                type="button"
                onClick={onFontSizeIncrease}
                className="flex-1 py-1.5 rounded-md bg-app-hover hover:bg-app-border text-fg-secondary hover:text-fg-primary text-xs font-bold transition-colors select-none"
                aria-label="Increase reading font size"
              >
                A+
              </button>
            </div>
          </section>

          {/* ── Focus word size ── */}
          <section className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wider">Focus Word Size</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onFocusFontSizeDecrease}
                className="flex-1 py-1.5 rounded-md bg-app-hover hover:bg-app-border text-fg-secondary hover:text-fg-primary text-xs font-bold transition-colors select-none"
                aria-label="Decrease focus word size"
              >
                A−
              </button>
              <span className="w-14 text-center text-sm text-fg-primary tabular-nums font-medium select-none">
                {focusFontSize}px
              </span>
              <button
                type="button"
                onClick={onFocusFontSizeIncrease}
                className="flex-1 py-1.5 rounded-md bg-app-hover hover:bg-app-border text-fg-secondary hover:text-fg-primary text-xs font-bold transition-colors select-none"
                aria-label="Increase focus word size"
              >
                A+
              </button>
            </div>
          </section>

          <div className="h-px bg-app-border" />

          {/* ── Inline highlight color ── */}
          <section className="flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wider">Inline Highlight</span>
            <label className="flex items-center gap-3 cursor-pointer group">
              <span className="relative shrink-0">
                <span
                  className="block w-9 h-9 rounded-lg border border-app-border shadow-sm group-hover:shadow-md transition-shadow"
                  style={{ background: inlineHighlightColor }}
                />
                <input
                  type="color"
                  value={inlineHighlightColor}
                  onChange={e => onInlineHighlightColorChange(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  aria-label="Inline highlight color"
                />
              </span>
              <span className="text-sm font-mono text-fg-primary">{inlineHighlightColor}</span>
            </label>
          </section>

          {/* ── Focus background mode ── */}
          <section className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wider">Focus Background</span>
            <div className="flex rounded-lg overflow-hidden border border-app-border text-xs font-medium">
              {(['static', 'tracking', 'opaque'] as const).map((mode, i) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onFocusBackgroundModeChange(mode)}
                  className={`flex-1 py-1.5 transition-colors select-none ${i > 0 ? 'border-l border-app-border' : ''} ${focusBackgroundMode === mode ? 'bg-accent text-white' : 'text-fg-secondary hover:bg-app-hover'}`}
                >
                  {mode === 'static' ? 'Static' : mode === 'tracking' ? 'Tracking' : 'Opaque'}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-fg-muted">
              {focusBackgroundMode === 'static' && 'Book visible behind overlay, no word tracking'}
              {focusBackgroundMode === 'tracking' && 'Book visible, highlight follows current word'}
              {focusBackgroundMode === 'opaque' && 'Solid dark background, no book visible'}
            </span>
          </section>

          {/* ── Focus word color ── */}
          <section className="flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold text-fg-secondary uppercase tracking-wider">Focus Word Color</span>
            <label className="flex items-center gap-3 cursor-pointer group">
              <span className="relative shrink-0">
                <span
                  className="block w-9 h-9 rounded-lg border border-app-border shadow-sm group-hover:shadow-md transition-shadow"
                  style={{ background: focusWordColor }}
                />
                <input
                  type="color"
                  value={focusWordColor}
                  onChange={e => onFocusWordColorChange(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  aria-label="Focus word color"
                />
              </span>
              <span className="text-sm font-mono text-fg-primary">{focusWordColor}</span>
            </label>
          </section>

        </div>
      </div>
    </>
  );
}
