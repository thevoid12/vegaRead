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
  srWordIdx?: number;
  srHighlightColor?: string;

  onWordRightClick?: (wordIdx: number, x: number, y: number) => void;
  onIframeClick?: () => void;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  srEntryMode?: false | string;
  onSrWordClick?: (wordIdx: number) => void;
}
const TWO_PAGE_MIN_WIDTH = 600;

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

const SR_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'NOSCRIPT']);


function getWordIndexAtPoint(doc: Document, x: number, y: number): number | null {
  type DocWithCaret = Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const range = (doc as DocWithCaret).caretRangeFromPoint?.(x, y);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const clickedNode = range.startContainer;
  let wordIdx = 0;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      const parent = (node as Text).parentElement;
      if (parent && SR_SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode() && walker.currentNode !== clickedNode) {
    wordIdx += (walker.currentNode.textContent ?? '').split(/\s+/).filter(Boolean).length;
  }

  const before = (clickedNode.textContent ?? '').slice(0, range.startOffset);
  wordIdx += before.split(/\s+/).filter(Boolean).length;

  return wordIdx;
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
  srWordIdx,
  srHighlightColor = '#fbbf24',
  onWordRightClick,
  onIframeClick,
  initialPage,
  onPageChange,
  srEntryMode,
  onSrWordClick,
}: BookContentProps) {
  const iframeRef      = useRef<HTMLIFrameElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);

  const viewWidthRef   = useRef<number>(0);
  const animFrameRef   = useRef<number>(0);

  const isMeasuringRef = useRef<boolean>(false);
  const onWordRightClickRef = useRef(onWordRightClick);
  const onIframeClickRef    = useRef(onIframeClick);
  const onPageChangeRef     = useRef(onPageChange);
  const onSrWordClickRef    = useRef(onSrWordClick);
  onWordRightClickRef.current = onWordRightClick;
  onIframeClickRef.current    = onIframeClick;
  onPageChangeRef.current     = onPageChange;
  onSrWordClickRef.current    = onSrWordClick;

  const [iframeVersion, setIframeVersion] = useState(0);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.head) return;

    if (!srEntryMode) {
      doc.getElementById('sr-entry-cursor')?.remove();
      return;
    }

    let styleEl = doc.getElementById('sr-entry-cursor') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'sr-entry-cursor';
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      * { cursor: crosshair !important; }
      [data-sr]:hover { background: rgba(59,130,246,0.18) !important; border-radius: 2px; }
    `;

    function handleEntryClick(e: MouseEvent) {
      const srSpan = (e.target as Element).closest?.('[data-sr]') as HTMLElement | null;
      if (!srSpan) return;
      const wordIdx = parseInt(srSpan.getAttribute('data-sr') ?? '', 10);
      if (isNaN(wordIdx) || wordIdx < 0) return;
      onSrWordClickRef.current?.(wordIdx);
    }

    doc.addEventListener('click', handleEntryClick);
    return () => {
      doc.removeEventListener('click', handleEntryClick);
      doc.getElementById('sr-entry-cursor')?.remove();
    };
  }, [srEntryMode, iframeVersion]);

  const pendingInitialPageRef = useRef(0);
  const pendingKeepPageRef    = useRef(0);
  const currentPageRef = useRef(0);

  const [currentPage,   setCurrentPage]   = useState(0);
  const [totalPages,    setTotalPages]    = useState(1);

  currentPageRef.current = currentPage;

  useEffect(() => {
    pendingInitialPageRef.current = initialPage ?? 0;
  }, [initialPage]);

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
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      doc.body.style.transition = 'none';
      doc.body.style.transform  = 'none';
      doc.body.style.opacity    = '1';
      setTotalPages(1);
      setCurrentPage(0);
      onPageChangeRef.current?.(0);
      pendingInitialPageRef.current = 0; // no pages to restore in scroll mode
      return;
    }

    isMeasuringRef.current = true;

    doc.body.style.transition = 'none';
    doc.body.style.transform  = 'translateX(0px)';
    doc.body.style.opacity    = '1';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewWidth = doc.documentElement.clientWidth;
        if (!viewWidth) { isMeasuringRef.current = false; return; }
        viewWidthRef.current = viewWidth;

        
        const probe = doc.createElement('div');
        probe.style.cssText = 'height:0;width:0;break-inside:avoid;visibility:hidden;';
        doc.body.appendChild(probe);
        const probeLeft = probe.offsetLeft;
        doc.body.removeChild(probe);

        const pages = Math.max(1, Math.floor(probeLeft / viewWidth) + 1);

        isMeasuringRef.current = false;
        setTotalPages(pages);
        setCurrentPage(0);
        onPageChangeRef.current?.(0);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      });
    });
  }, [fontSize]);

  const handleIframeLoad = useCallback(() => {
    refresh();
    setIframeVersion(v => v + 1);
  }, [refresh]);

 
  useEffect(() => {
    const fromInitial = pendingInitialPageRef.current;
    const fromKeep    = pendingKeepPageRef.current;
    pendingInitialPageRef.current = 0;
    pendingKeepPageRef.current    = 0;
    const target = fromInitial > 0 ? fromInitial : fromKeep;
    if (target > 0 && totalPages > 1) {
      goToPage(Math.min(target, totalPages - 1));
    }
  }, [totalPages]);

  
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let rightClickHasWord = false;

    function attach() {
      const doc = iframe!.contentDocument;
      if (!doc?.body) return;

      doc.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 2) return;
        rightClickHasWord = false;

        const wordIdx = getWordIndexAtPoint(doc, e.clientX, e.clientY);
        if (wordIdx === null) return;

        rightClickHasWord = true;
        doc.getSelection()?.removeAllRanges();

        const rect = iframe!.getBoundingClientRect();
        onWordRightClickRef.current?.(
          wordIdx,
          rect.left + e.clientX,
          rect.top  + e.clientY,
        );
      });

      doc.addEventListener('contextmenu', (e: MouseEvent) => {
        if (rightClickHasWord) e.preventDefault();
      });

      doc.addEventListener('click', () => {
        onIframeClickRef.current?.();
      });
    }

    iframe.addEventListener('load', attach);
    attach(); // try immediately if already loaded

    return () => iframe.removeEventListener('load', attach);
  }, [html]); // re-run when html changes (iframe remounts)


  useEffect(() => {
    if (pendingInitialPageRef.current === 0) {
      pendingKeepPageRef.current = currentPageRef.current;
    }
    refresh();
  }, [refresh]);


  useEffect(() => {
    setCurrentPage(0);
    setTotalPages(1);
  }, [html]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (iframeRef.current?.contentDocument?.body) refresh();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [refresh]);


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
    onPageChangeRef.current?.(page);
  }, []);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.head) return;

    let styleEl = doc.getElementById('sr-hl') as HTMLStyleElement | null;

    if (srWordIdx === undefined) {
      styleEl?.remove();
      return;
    }

    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'sr-hl';
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = `[data-sr="${srWordIdx}"] { background: ${srHighlightColor} !important; border-radius: 2px; padding: 0 1px; color: #1c1c1c !important; }`;

    const el = doc.querySelector(`[data-sr="${srWordIdx}"]`) as HTMLElement | null;
    if (!el) return;

    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const isTwoPage = containerWidth >= TWO_PAGE_MIN_WIDTH;

    if (isTwoPage) {
      const viewWidth = viewWidthRef.current || doc.documentElement.clientWidth;
      if (viewWidth > 0) {
        const targetPage = Math.floor(el.offsetLeft / viewWidth);
        if (targetPage !== currentPage) goToPage(targetPage);
      }
    } else {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [srWordIdx, srHighlightColor, currentPage, goToPage, iframeVersion]);

  const handleNext = () => {

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
          sandbox="allow-same-origin allow-scripts"
        />
      </div>

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
