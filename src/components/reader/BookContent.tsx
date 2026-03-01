import { useState, useRef, useCallback, useEffect } from 'react';

interface BookContentProps {
  html: string;
  fontSize: number;
  isLoading: boolean;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  currentChapterIdx: number;
  totalChapters: number;
}

/**
 * CSS injected into the EPUB iframe for the two-page spread layout.
 *
 * Zero-drift invariant: column-gap must equal exactly 2 × horizontal padding.
 *   padding-left = padding-right = 2rem  →  column-gap = 4rem
 *
 * Why this matters:
 *   col_width  = (viewport_width - 2·pad_h - gap) / 2
 *   pair_advance = 2·(col_width + gap) = viewport_width - 2·pad_h + gap
 *   pair_advance = viewport_width  iff  gap = 2·pad_h
 *
 * When gap = 2·pad_h the column pairs advance by exactly one viewport width
 * per page, so translateX(-N·viewWidth) always reveals the correct pair
 * regardless of N. Without this, drift accumulates by (viewWidth - pair_advance)
 * per page, which becomes ~2rem (~32px) every page, visibly worsening with N.
 *
 * The invariant holds at any rem resolution (even if the EPUB overrides the
 * html font-size) because padding and gap are expressed in the same unit.
 *
 * body has NO overflow constraint — columns flow freely to the right so that
 * body.scrollWidth reflects the true total width of all column pairs.
 * html clips the visible area with overflow:hidden.
 * The smooth page turn is a CSS transition on body.transform.
 */
function buildReadingStyles(fontSize: number): string {
  return `
    html {
      height: 100%;
      overflow: hidden;
      background: #fefcf9;
    }
    body {
      height: 100%;
      column-count: 2;
      column-gap: 4rem;
      column-fill: auto;
      box-sizing: border-box;
      margin: 0;
      padding: 2.5rem 2rem;
      background: #fefcf9;
      font-family: Georgia, 'Palatino Linotype', Palatino, serif;
      font-size: ${fontSize}px;
      line-height: 1.8;
      color: #2a2a2a;
      word-break: break-word;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    img { max-width: 100%; height: auto; display: block; margin: 1em auto; break-inside: avoid; }
    p   { margin: 0 0 1.1em; text-align: justify; hyphens: auto; }
    h1  { font-size: 1.65em; margin: 2em 0 0.6em; break-after: avoid; }
    h2  { font-size: 1.35em; margin: 1.8em 0 0.5em; break-after: avoid; }
    h3  { font-size: 1.15em; margin: 1.5em 0 0.4em; break-after: avoid; }
    h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.3em; break-after: avoid; }
    blockquote {
      border-left: 3px solid #deddda; margin: 1.2em 0; padding: 0.4em 1.4em;
      color: #5a5a5a; font-style: italic; break-inside: avoid;
    }
    a { color: #3584e4; }
    pre { background: #f2f0ed; padding: 1em; border-radius: 6px; overflow: hidden;
          font-size: 0.85em; break-inside: avoid; }
    code { font-family: monospace; background: #f2f0ed; padding: 0.15em 0.35em;
           border-radius: 3px; font-size: 0.875em; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; break-inside: avoid; }
    th, td { border: 1px solid #deddda; padding: 0.5em 0.75em; }
    th { background: #f5f4f1; font-weight: 600; }
  `;
}

export function BookContent({
  html,
  fontSize,
  isLoading,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  currentChapterIdx,
  totalChapters,
}: BookContentProps) {
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages,  setTotalPages]  = useState(1);

  /**
   * Inject reading CSS and compute the total page count.
   *
   * Page count  = ceil(body.scrollWidth / viewWidth)
   * Page offset = N × viewWidth  (zero-drift guaranteed by gap = 2·pad_h)
   *
   * Two nested requestAnimationFrames: the first waits for the style injection
   * to be applied; the second waits for the browser to complete the column
   * layout reflow so body.scrollWidth is accurate.
   */
  const refresh = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.head || !doc?.body) return;

    let styleEl = doc.getElementById('vr-reading-styles') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'vr-reading-styles';
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = buildReadingStyles(fontSize);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewWidth = doc.documentElement.clientWidth;
        if (!viewWidth) return;

        // body.scrollWidth includes all off-screen column pairs because
        // body has no overflow constraint
        const pages = Math.max(1, Math.ceil(doc.body.scrollWidth / viewWidth));

        setTotalPages(pages);
        setCurrentPage(0);

        // Reset to page 0 without triggering the slide animation
        doc.body.style.transition = 'none';
        doc.body.style.transform  = 'translateX(0px)';
        requestAnimationFrame(() => {
          if (doc.body) doc.body.style.transition = '';
        });
      });
    });
  }, [fontSize]);

  // Run refresh when the iframe loads new content
  const handleIframeLoad = useCallback(() => refresh(), [refresh]);

  // Re-inject styles and recompute pages when font size changes
  useEffect(() => { refresh(); }, [refresh]);

  // Reset page state immediately when the chapter html prop changes.
  // The iframe remounts (key={html}), so stale page state would flash briefly
  // without this guard.
  useEffect(() => {
    setCurrentPage(0);
    setTotalPages(1);
  }, [html]);

  // Recompute pages when the reading area is resized (window resize, sidebar
  // toggle, etc.) so page boundaries stay accurate and responsive
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (iframeRef.current?.contentDocument?.body) refresh();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [refresh]);

  // Slide body to page N. Page advance = viewWidth (zero-drift invariant holds)
  const goToPage = useCallback((page: number) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const viewWidth = doc.documentElement.clientWidth;
    doc.body.style.transform = `translateX(-${page * viewWidth}px)`;
    setCurrentPage(page);
  }, []);

  const handleNext = () => {
    if (currentPage < totalPages - 1) goToPage(currentPage + 1);
    else if (hasNext) onNext();
  };

  const handlePrev = () => {
    if (currentPage > 0) goToPage(currentPage - 1);
    else if (hasPrev) onPrev();
  };

  const canGoNext = currentPage < totalPages - 1 || hasNext;
  const canGoPrev = currentPage > 0 || hasPrev;

  return (
    <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden bg-[#fefcf9] min-w-0">

      {/* ── Reading area ────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#fefcf9]">
            <span className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={html}
          srcDoc={html || '<html><body></body></html>'}
          title="Book content"
          className="w-full h-full border-none block"
          onLoad={handleIframeLoad}
          sandbox="allow-same-origin"
        />
      </div>

      {/* ── Navigation bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-app-surface border-t border-app-border shrink-0 select-none min-w-0">
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canGoPrev}
          className="
            inline-flex items-center gap-1
            text-fg-secondary hover:text-fg-primary
            disabled:opacity-30 disabled:cursor-not-allowed
            text-xs font-medium transition-colors rounded px-2 py-1
            hover:bg-app-hover shrink-0
          "
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {currentPage > 0 ? 'Prev Page' : 'Prev Chapter'}
        </button>

        <span className="text-fg-muted text-[11px] tabular-nums text-center truncate px-2">
          Ch.&nbsp;{currentChapterIdx + 1}&nbsp;/&nbsp;{totalChapters}
          {totalPages > 1 && <>&nbsp;&middot;&nbsp;pg&nbsp;{currentPage + 1}&nbsp;/&nbsp;{totalPages}</>}
        </span>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          className="
            inline-flex items-center gap-1
            text-fg-secondary hover:text-fg-primary
            disabled:opacity-30 disabled:cursor-not-allowed
            text-xs font-medium transition-colors rounded px-2 py-1
            hover:bg-app-hover shrink-0
          "
        >
          {currentPage < totalPages - 1 ? 'Next Page' : 'Next Chapter'}
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
