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
 * Container width (px) below which single-page vertical-scroll mode is used
 * instead of the two-page CSS column spread.
 */
const TWO_PAGE_MIN_WIDTH = 600;

/**
 * CSS injected into the EPUB iframe.
 *
 * Two modes:
 *
 * ── Two-page spread (container ≥ 600 px) ───────────────────────────────────
 * Uses CSS multi-column (column-count: 2) on body. Columns flow to the right;
 * html clips the visible area. body.style.transform reveals successive pairs.
 *
 * Zero-drift invariant: column-gap = 2 × horizontal-padding in the same unit.
 *   pair_advance = 2·(col_width + gap) = content_width + gap
 *                = (W − 4rem) + 4rem = W  for any W
 * body must NOT be clipped — we force overflow: visible !important to override
 * any EPUB stylesheet that sets overflow: hidden on body, which would make
 * body.scrollWidth = body.clientWidth and give totalPages = 1.
 *
 * ── Single-page scroll (container < 600 px) ────────────────────────────────
 * No CSS columns. body scrolls vertically inside the iframe (overflow-y: auto).
 * totalPages is always 1; navigation is chapter-level only.
 */
function buildReadingStyles(fontSize: number, isTwoPage: boolean): string {
  const common = `
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

  if (isTwoPage) {
    return `
      html { height: 100%; overflow: hidden; background: #fefcf9; }
      body {
        height: 100% !important;
        overflow: visible !important;
        column-count: 2;
        column-gap: 4rem;
        column-fill: auto;
        box-sizing: border-box;
        margin: 0 !important;
        padding: 2.5rem 2rem;
        background: #fefcf9;
        font-family: Georgia, 'Palatino Linotype', Palatino, serif;
        font-size: ${fontSize}px;
        line-height: 1.8;
        color: #2a2a2a;
        word-break: break-word;
      }
      ${common}
    `;
  }

  // Single-page scroll mode — no columns, body scrolls vertically.
  // height: 100% !important is required: the body must be a fixed-height scroll
  // container equal to the iframe viewport. With height: auto the body grows to
  // fit all content (scrollHeight = clientHeight) and overflow-y: auto has no
  // effect — there is nothing to scroll.
  return `
    html { height: 100%; overflow: hidden; background: #fefcf9; }
    body {
      height: 100% !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      box-sizing: border-box;
      margin: 0 !important;
      padding: 1.5rem 1.25rem;
      background: #fefcf9;
      font-family: Georgia, 'Palatino Linotype', Palatino, serif;
      font-size: ${fontSize}px;
      line-height: 1.8;
      color: #2a2a2a;
      word-break: break-word;
    }
    ${common}
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
  const iframeRef      = useRef<HTMLIFrameElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  // Width snapshot from the last refresh — used in goToPage to avoid drift
  // from minor iframe reflows between refresh and navigation.
  const viewWidthRef   = useRef<number>(0);
  // RAF id for the pending fade-in so rapid navigation can cancel it.
  const animFrameRef   = useRef<number>(0);
  // True while refresh() is still computing totalPages inside its RAFs.
  // Prevents a click during that window from firing chapter navigation before
  // totalPages has been updated from the default 1.
  const isMeasuringRef = useRef<boolean>(false);

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages,  setTotalPages]  = useState(1);

  /**
   * Inject reading CSS and — for two-page mode — compute the total page count.
   *
   * isTwoPage is derived from the container's current pixel width so the
   * column-count in CSS and the page measurement are always consistent.
   *
   * Single-page mode: totalPages is fixed at 1; no measurement needed.
   *
   * Two-page mode:
   *   pages = ceil(body.scrollWidth / viewWidth)
   *   body.scrollWidth reflects all off-screen columns because we force
   *   overflow: visible !important — overriding any EPUB CSS that would
   *   otherwise clip the scroll dimension and give a false pages = 1.
   *
   * Two nested RAFs wait for the style injection to take effect and for the
   * column layout reflow to complete before measuring scrollWidth.
   */
  const refresh = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.head || !doc?.body) return;

    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const isTwoPage = containerWidth >= TWO_PAGE_MIN_WIDTH;

    let styleEl = doc.getElementById('vr-reading-styles') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'vr-reading-styles';
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = buildReadingStyles(fontSize, isTwoPage);

    if (!isTwoPage) {
      // Vertical scroll mode: clear any leftover column transform and fix at 1 page
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      doc.body.style.transition = 'none';
      doc.body.style.transform  = 'none';
      doc.body.style.opacity    = '1';
      setTotalPages(1);
      setCurrentPage(0);
      return;
    }

    // Two-page column mode: measure after layout reflow.
    // Mark as measuring so navigation clicks during this window are ignored.
    isMeasuringRef.current = true;

    // Reset body to position 0 before measuring so probe offsets are correct.
    doc.body.style.transition = 'none';
    doc.body.style.transform  = 'translateX(0px)';
    doc.body.style.opacity    = '1';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewWidth = doc.documentElement.clientWidth;
        if (!viewWidth) { isMeasuringRef.current = false; return; }
        viewWidthRef.current = viewWidth;

        // Probe element at end of body: its offsetLeft (relative to its offset
        // parent) tells us which column it landed in. This is more reliable than
        // body.scrollWidth which some WebKit builds report as clientWidth when
        // overflow: visible is set on body.
        //
        // offsetLeft is unaffected by CSS transforms and overflow clipping, so
        // it gives the true layout position regardless of the current transform.
        //
        // Probe formula: pages = floor(probe.offsetLeft / viewWidth) + 1
        // because each page starts at exactly k * viewWidth (zero-drift invariant).
        const probe = doc.createElement('div');
        probe.style.cssText = 'height:0;width:0;break-inside:avoid;visibility:hidden;';
        doc.body.appendChild(probe);
        const probeLeft = probe.offsetLeft;
        doc.body.removeChild(probe);

        const pages = Math.max(1, Math.floor(probeLeft / viewWidth) + 1);

        isMeasuringRef.current = false;
        setTotalPages(pages);
        setCurrentPage(0);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
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

  // Recompute pages and column mode when the reading area is resized
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (iframeRef.current?.contentDocument?.body) refresh();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [refresh]);

  /**
   * Navigate to page N with a crossfade so both columns switch as a unit.
   * Instantly jumps to the new position (invisible) then fades in, so neither
   * column slides past the viewport edge independently.
   * cancelAnimationFrame prevents stale fade-ins from stacking on rapid taps.
   */
  const goToPage = useCallback((page: number) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const viewWidth = viewWidthRef.current || doc.documentElement.clientWidth;
    const body = doc.body;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    body.style.transition = 'none';
    body.style.opacity    = '0';
    body.style.transform  = `translateX(-${page * viewWidth}px)`;

    animFrameRef.current = requestAnimationFrame(() => {
      body.style.transition = 'opacity 0.15s ease';
      body.style.opacity    = '1';
      animFrameRef.current  = 0;
    });

    setCurrentPage(page);
  }, []);

  const handleNext = () => {
    // Ignore clicks while refresh() is still computing totalPages — otherwise
    // a fast click during the brief RAF window fires onNext() when totalPages
    // is still at its reset value of 1 (0 < 0 is false → chapter advance).
    if (isMeasuringRef.current || isLoading) return;
    if (currentPage < totalPages - 1) goToPage(currentPage + 1);
    else if (hasNext) onNext();
  };

  const handlePrev = () => {
    if (isMeasuringRef.current || isLoading) return;
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
