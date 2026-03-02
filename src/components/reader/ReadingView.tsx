import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ReadingTopbar } from './ReadingTopbar';
import type { SrState, SrMode } from './ReadingTopbar';
import { SpineList } from './SpineList';
import { BookContent } from './BookContent';
import { FocusOverlay } from './FocusOverlay';
import { SettingsPanel } from './SettingsPanel';
import { getBookContent, listSpine, saveReadingProgress, saveSrPosition } from '../../api/tauri';
import { wrapWordsInSpans, extractWords } from '../../utils/speedReader';
import type { Book, SpineItem } from '../../types';

const FONT_SIZE_MIN     = 12;
const FONT_SIZE_MAX     = 32;
const FONT_SIZE_STEP    = 2;
const FONT_SIZE_DEFAULT = 18;

const SR_WPM_DEFAULT        = 250;
const SR_FOCUS_FONT_DEFAULT = 72;
const SR_FOCUS_FONT_MIN     = 40;
const SR_FOCUS_FONT_MAX     = 120;
const SR_FOCUS_FONT_STEP    = 8;

const SR_HIGHLIGHT_DEFAULT  = '#fbbf24';
const SR_FOCUS_COLOR_DEFAULT = '#000000';

interface ReadingViewProps {
  book: Book;
  onBack: () => void;
}

/**
 * Full-page reading experience.
 *
 * Speed reader — two modes:
 *
 * "Inline": wraps every word in <span data-sr="N">, BookContent highlights
 *   and auto-scrolls/pages to the current word. Starts immediately.
 *
 * "Focus" (RSVP): shows FocusOverlay. Opens in "ready" state so the user
 *   can adjust zoom before clicking Start. When the last word of a chunk is
 *   reached the reader auto-advances to the next chapter chunk seamlessly.
 *
 * Timer design: uses srWordIdxRef / srWordCountRef / srWpmRef refs inside
 * setInterval so the callback never captures stale React state. srOnEndRef
 * holds the "what to do when the last word is reached" callback and is set
 * fresh each time the user presses Start/Resume.
 */
export function ReadingView({ book, onBack }: ReadingViewProps) {
  // ── Reading state ─────────────────────────────────────────────────────────
  const [spineItems,       setSpineItems]       = useState<SpineItem[]>([]);
  const [isLoadingSpine,   setIsLoadingSpine]   = useState(true);
  const [currentSpineIdx,  setCurrentSpineIdx]  = useState(book.current_spine);
  const [charOffset,       setCharOffset]       = useState(book.current_read_idx);
  const [htmlContent,      setHtmlContent]      = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [fontSize,         setFontSize]         = useState(FONT_SIZE_DEFAULT);
  const [nextSpineIdx,     setNextSpineIdx]     = useState(book.current_spine);
  const [nextCharOffset,   setNextCharOffset]   = useState(0);
  const [pageSize,         setPageSize]         = useState(0);

  // ── Page tracking ─────────────────────────────────────────────────────────
  // currentPage: visual page within the current content chunk (reported by BookContent)
  // initialPage: visual page to restore to when content loads (from backend)
  const [currentPage, setCurrentPage] = useState(0);
  const [initialPage, setInitialPage] = useState(0);

  // ── Speed reader state ────────────────────────────────────────────────────
  const [srState,         setSrState]         = useState<SrState>('idle');
  const [srMode,          setSrMode]          = useState<SrMode>('inline');
  const [srReady,         setSrReady]         = useState(false);
  const [srWordIdx,       setSrWordIdx]       = useState(0);
  const [srWords,         setSrWords]         = useState<string[]>([]);
  const [srWrappedHtml,   setSrWrappedHtml]   = useState('');
  const [srWordCount,     setSrWordCount]     = useState(0);
  const [srFocusFontSize, setSrFocusFontSize] = useState(SR_FOCUS_FONT_DEFAULT);
  const [srWpm,           setSrWpm]           = useState(SR_WPM_DEFAULT);

  // ── SR selection start: word index detected from iframe text selection ────
  const [srStartWordIdx, setSrStartWordIdx] = useState<number | null>(null);
  const srStartWordIdxRef = useRef<number | null>(null);
  useEffect(() => { srStartWordIdxRef.current = srStartWordIdx; }, [srStartWordIdx]);

  // ── Settings state ────────────────────────────────────────────────────────
  const [settingsOpen,        setSettingsOpen]        = useState(false);
  const [srHighlightColor,    setSrHighlightColor]    = useState(SR_HIGHLIGHT_DEFAULT);
  const [focusWordColor,      setFocusWordColor]      = useState(SR_FOCUS_COLOR_DEFAULT);

  // ── Context menu state (right-click / SR-entry-click to start SR) ─────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wordIdx: number } | null>(null);

  // Refs that the setInterval callback reads — never stale
  const srIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const srWordIdxRef     = useRef(0);
  const srWordCountRef   = useRef(0);
  const srWpmRef         = useRef(SR_WPM_DEFAULT);
  // Called when the last word is reached; set before each timer start
  const srOnEndRef       = useRef<(() => void) | null>(null);
  // Set to true by the auto-advance end-callback; checked in useEffect([htmlContent])
  const srAutoRestartRef = useRef(false);

  // Refs for values read inside the auto-advance end-callback (avoids stale closures)
  const hasNextRef        = useRef(false);
  const nextSpineIdxRef   = useRef(book.current_spine);
  const nextCharOffsetRef = useRef(0);

  useEffect(() => { hasNextRef.current      = nextSpineIdx < spineItems.length; },
    [nextSpineIdx, spineItems.length]);
  useEffect(() => { nextSpineIdxRef.current   = nextSpineIdx;   }, [nextSpineIdx]);
  useEffect(() => { nextCharOffsetRef.current = nextCharOffset; }, [nextCharOffset]);

  // Refs for values read inside save callbacks (avoids stale closures in timers/effects)
  const currentSpineIdxRef = useRef(book.current_spine);
  const charOffsetRef      = useRef(book.current_read_idx);
  const currentPageRef     = useRef(0);
  const srModeRef          = useRef<SrMode>('inline');
  useEffect(() => { currentSpineIdxRef.current = currentSpineIdx; }, [currentSpineIdx]);
  useEffect(() => { charOffsetRef.current      = charOffset;      }, [charOffset]);
  useEffect(() => { currentPageRef.current     = currentPage;     }, [currentPage]);
  useEffect(() => { srModeRef.current          = srMode;          }, [srMode]);

  // Debounce timer for within-chunk page saves
  const saveProgressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref bundle used by the app-close handler (always reads fresh values)
  const closeDataRef = useRef({
    bookId: book.vagaread_id,
    spineIdx: book.current_spine,
    charOffset: book.current_read_idx,
    currentPage: 0,
  });
  useEffect(() => {
    closeDataRef.current = {
      bookId: book.vagaread_id,
      spineIdx: currentSpineIdx,
      charOffset,
      currentPage,
    };
  }, [book.vagaread_id, currentSpineIdx, charOffset, currentPage]);

  // ── App close: save progress before the window closes ────────────────────
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isSavingClose = false;

    getCurrentWindow().onCloseRequested(async (event) => {
      if (isSavingClose) return; // second close event after our own window.close() — allow it
      event.preventDefault();
      isSavingClose = true;
      if (saveProgressDebounceRef.current) {
        clearTimeout(saveProgressDebounceRef.current);
        saveProgressDebounceRef.current = null;
      }
      const { bookId, spineIdx, charOffset: co, currentPage: cp } = closeDataRef.current;
      try {
        await saveReadingProgress(bookId, spineIdx, co, cp);
      } catch (e) {
        console.error('[close save]', e);
      }
      await getCurrentWindow().close();
    }).then(fn => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []); // attach once on mount, reads fresh state via closeDataRef

  // Clear selection start index when speed reader starts (selection is no longer relevant)
  useEffect(() => {
    if (srState !== 'idle') {
      setSrStartWordIdx(null);
      srStartWordIdxRef.current = null;
    }
  }, [srState]);

  // ── Timer helpers ─────────────────────────────────────────────────────────
  const clearSRTimer = useCallback(() => {
    if (srIntervalRef.current !== null) {
      clearInterval(srIntervalRef.current);
      srIntervalRef.current = null;
    }
  }, []);

  /**
   * Start the word-advance timer from startIdx.
   * Reads srWpmRef.current for the interval so WPM changes take effect immediately
   * on the next startSRTimerFrom call without capturing stale closures.
   */
  const startSRTimerFrom = useCallback((startIdx: number) => {
    clearSRTimer();
    srWordIdxRef.current = startIdx;
    srIntervalRef.current = setInterval(() => {
      const next = srWordIdxRef.current + 1;
      if (next >= srWordCountRef.current) {
        clearInterval(srIntervalRef.current!);
        srIntervalRef.current = null;
        if (srOnEndRef.current) {
          srOnEndRef.current();
        } else {
          // Inline mode default: stop at last word
          const last = Math.max(0, srWordCountRef.current - 1);
          srWordIdxRef.current = last;
          setSrWordIdx(last);
          setSrState('idle');
        }
      } else {
        srWordIdxRef.current = next;
        setSrWordIdx(next);
      }
    }, Math.round(60_000 / srWpmRef.current));
  }, [clearSRTimer]);

  // ── Speed reader handlers ─────────────────────────────────────────────────

  /**
   * Open SR in the chosen mode. If the user has text selected in the iframe,
   * starts from the selected word; otherwise starts from the beginning.
   * Focus opens in "ready" state; inline starts immediately.
   */
  const handleStartSR = useCallback((mode: SrMode) => {
    const startFrom = srStartWordIdxRef.current ?? 0;
    setSrStartWordIdx(null);
    srStartWordIdxRef.current = null;

    setSrMode(mode);
    setSrWordIdx(startFrom);
    srWordIdxRef.current = startFrom;
    srOnEndRef.current = null;

    if (mode === 'inline') {
      const { html, wordCount } = wrapWordsInSpans(htmlContent);
      setSrWrappedHtml(html);
      setSrWordCount(wordCount);
      srWordCountRef.current = wordCount;
      setSrState('running');
      startSRTimerFrom(startFrom);
    } else {
      // Extract words, open overlay in ready state — timer not started yet
      const words = extractWords(htmlContent);
      setSrWords(words);
      setSrWordCount(words.length);
      srWordCountRef.current = words.length;
      setSrReady(true);
      setSrState('paused');
    }
  }, [htmlContent, startSRTimerFrom]);

  /**
   * Called when the user clicks "Start Reading" inside the focus overlay.
   * Sets the auto-advance end-callback and begins the timer.
   */
  const handleBeginSR = useCallback(() => {
    setSrReady(false);
    setSrState('running');
    srOnEndRef.current = () => {
      if (hasNextRef.current) {
        srAutoRestartRef.current = true;
        setCurrentSpineIdx(nextSpineIdxRef.current);
        setCharOffset(nextCharOffsetRef.current);
      } else {
        const last = Math.max(0, srWordCountRef.current - 1);
        srWordIdxRef.current = last;
        setSrWordIdx(last);
        setSrState('idle');
      }
    };
    startSRTimerFrom(srWordIdxRef.current);
  }, [startSRTimerFrom]);

  const handlePauseSR = useCallback(() => {
    clearSRTimer();
    setSrReady(false);
    setSrState('paused');
    // Log SR position to backend
    saveSrPosition(
      book.vagaread_id,
      currentSpineIdxRef.current,
      charOffsetRef.current,
      currentPageRef.current,
      srWordIdxRef.current,
      srModeRef.current,
    ).catch(console.error);
  }, [clearSRTimer, book.vagaread_id]);

  /** Resume keeps srOnEndRef as-is so auto-advance survives pause/resume. */
  const handleResumeSR = useCallback(() => {
    setSrState('running');
    startSRTimerFrom(srWordIdxRef.current);
  }, [startSRTimerFrom]);

  const handleStopSR = useCallback(() => {
    const lastWordIdx = srWordIdxRef.current; // capture before reset
    clearSRTimer();
    srOnEndRef.current = null;
    srAutoRestartRef.current = false;
    setSrReady(false);
    setSrState('idle');
    setSrWordIdx(0);
    srWordIdxRef.current = 0;
    // Log SR position to backend (where reading stopped)
    if (lastWordIdx > 0) {
      saveSrPosition(
        book.vagaread_id,
        currentSpineIdxRef.current,
        charOffsetRef.current,
        currentPageRef.current,
        lastWordIdx,
        srModeRef.current,
      ).catch(console.error);
    }
  }, [clearSRTimer, book.vagaread_id]);

  // ── Settings handlers ─────────────────────────────────────────────────────

  /** Open settings panel; auto-pause if SR is running. */
  const handleOpenSettings = useCallback(() => {
    if (srState === 'running') handlePauseSR();
    setSettingsOpen(true);
  }, [srState, handlePauseSR]);

  /**
   * Change WPM. If the reader is currently running we restart the timer so
   * the new speed kicks in immediately.
   */
  const handleWpmChange = useCallback((wpm: number) => {
    srWpmRef.current = wpm;
    setSrWpm(wpm);
    if (srState === 'running') {
      clearSRTimer();
      startSRTimerFrom(srWordIdxRef.current);
    }
  }, [srState, clearSRTimer, startSRTimerFrom]);

  // Focus word size
  const increaseFocusFontSize = useCallback(
    () => setSrFocusFontSize(f => Math.min(f + SR_FOCUS_FONT_STEP, SR_FOCUS_FONT_MAX)), []);
  const decreaseFocusFontSize = useCallback(
    () => setSrFocusFontSize(f => Math.max(f - SR_FOCUS_FONT_STEP, SR_FOCUS_FONT_MIN)), []);

  // ── Context-menu (right-click / SR-entry-click to start SR from a word) ───

  const handleWordRightClick = useCallback((wordIdx: number, x: number, y: number) => {
    // Clamp so the menu never overflows the viewport edge
    const clampedX = Math.min(x, window.innerWidth  - 192);
    const clampedY = Math.min(y, window.innerHeight - 80);
    setCtxMenu({ x: clampedX, y: clampedY, wordIdx });
  }, []);

  /** Called when the user makes (or clears) a text selection inside the iframe. */
  const handleSelectionChange = useCallback((wordIdx: number | null) => {
    setSrStartWordIdx(wordIdx);
    srStartWordIdxRef.current = wordIdx;
  }, []);

  /**
   * Start SR from a specific word index — used by the right-click context menu.
   * If inline SR is already active we jump in-place (no iframe remount).
   * Focus mode opens in the "ready" state so the user can still click Start.
   */
  const handleStartSRFrom = useCallback((mode: SrMode, fromWordIdx: number) => {
    srOnEndRef.current = null;
    setSrMode(mode);
    setSrWordIdx(fromWordIdx);
    srWordIdxRef.current = fromWordIdx;

    if (mode === 'inline') {
      if (srState !== 'idle' && srMode === 'inline') {
        // SR already running/paused in inline mode — just reposition the timer
        clearSRTimer();
        setSrState('running');
        startSRTimerFrom(fromWordIdx);
      } else {
        const { html, wordCount } = wrapWordsInSpans(htmlContent);
        setSrWrappedHtml(html);
        setSrWordCount(wordCount);
        srWordCountRef.current = wordCount;
        setSrState('running');
        startSRTimerFrom(fromWordIdx);
      }
    } else {
      const words = extractWords(htmlContent);
      setSrWords(words);
      setSrWordCount(words.length);
      srWordCountRef.current = words.length;
      setSrReady(true);
      setSrState('paused');
    }
  }, [htmlContent, srState, srMode, clearSRTimer, startSRTimerFrom]);

  // Close context menu on any left-click outside it
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  // ── Stop / auto-restart when chapter content changes ─────────────────────
  useEffect(() => {
    if (srAutoRestartRef.current) {
      // Content changed because focus SR auto-advanced to the next chunk.
      // Extract new words and restart the timer immediately.
      srAutoRestartRef.current = false;
      const words = extractWords(htmlContent);
      setSrWords(words);
      setSrWordCount(words.length);
      srWordCountRef.current = words.length;
      setSrWordIdx(0);
      srWordIdxRef.current = 0;
      startSRTimerFrom(0); // srOnEndRef is still the auto-advance callback
      // srState stays 'running' — no need to set it
      return;
    }
    // Normal chapter change (user navigated) — stop the reader completely
    clearSRTimer();
    srOnEndRef.current = null;
    setSrReady(false);
    setSrState('idle');
    setSrWordIdx(0);
    srWordIdxRef.current = 0;
    setSrStartWordIdx(null);
    srStartWordIdxRef.current = null;
  }, [htmlContent, clearSRTimer, startSRTimerFrom]);

  // Clean up timer on unmount
  useEffect(() => () => { clearSRTimer(); }, [clearSRTimer]);

  // ── Load spine list once on mount ─────────────────────────────────────────
  useEffect(() => {
    setIsLoadingSpine(true);
    listSpine(book.vagaread_id)
      .then(setSpineItems)
      .catch(console.error)
      .finally(() => setIsLoadingSpine(false));
  }, [book.vagaread_id]);

  // ── Load chapter content whenever position changes ────────────────────────
  useEffect(() => {
    setIsLoadingContent(true);
    getBookContent(book.vagaread_id, currentSpineIdx, charOffset)
      .then((res) => {
        setHtmlContent(res.content.content);
        setNextSpineIdx(res.content.spine_idx);
        setNextCharOffset(res.content.next_char_offset);
        setPageSize(res.content.page_size);
        setInitialPage(res.content.current_page); // page to restore after BookContent mounts
      })
      .catch(console.error)
      .finally(() => setIsLoadingContent(false));
  }, [book.vagaread_id, currentSpineIdx, charOffset]);

  // ── Page-change callback (called by BookContent on every page turn) ───────
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    // Debounce save so rapid page turns don't flood the backend
    if (saveProgressDebounceRef.current) clearTimeout(saveProgressDebounceRef.current);
    saveProgressDebounceRef.current = setTimeout(() => {
      saveProgressDebounceRef.current = null;
      saveReadingProgress(
        book.vagaread_id,
        currentSpineIdxRef.current,
        charOffsetRef.current,
        page,
      ).catch(console.error);
    }, 500);
  }, [book.vagaread_id]);

  // ── Navigation handlers ───────────────────────────────────────────────────
  const handleSpineSelect = useCallback((idx: number) => {
    setCurrentSpineIdx(idx);
    setCharOffset(0);
  }, []);

  const handleNext = useCallback(() => {
    setCurrentSpineIdx(nextSpineIdx);
    setCharOffset(nextCharOffset);
  }, [nextSpineIdx, nextCharOffset]);

  const handlePrev = useCallback(() => {
    if (charOffset > 0 && pageSize > 0) {
      setCharOffset((o) => Math.max(0, o - pageSize));
    } else if (currentSpineIdx > 0) {
      setCurrentSpineIdx((i) => i - 1);
      setCharOffset(0);
    }
  }, [charOffset, currentSpineIdx, pageSize]);

  // ── Back button: flush save then navigate ─────────────────────────────────
  const handleBack = useCallback(async () => {
    if (saveProgressDebounceRef.current) {
      clearTimeout(saveProgressDebounceRef.current);
      saveProgressDebounceRef.current = null;
    }
    try {
      await saveReadingProgress(book.vagaread_id, currentSpineIdx, charOffset, currentPage);
    } catch (e) {
      console.error('[back save]', e);
    }
    onBack();
  }, [book.vagaread_id, currentSpineIdx, charOffset, currentPage, onBack]);

  // ── Reading font size controls ────────────────────────────────────────────
  const increaseFontSize = useCallback(
    () => setFontSize((f) => Math.min(f + FONT_SIZE_STEP, FONT_SIZE_MAX)), []);
  const decreaseFontSize = useCallback(
    () => setFontSize((f) => Math.max(f - FONT_SIZE_STEP, FONT_SIZE_MIN)), []);

  const title  = book.meta_data.title?.[0]   ?? 'Untitled';
  const author = book.meta_data.creator?.[0] ?? '';

  const hasNext = nextSpineIdx < spineItems.length;
  const hasPrev = charOffset > 0 || currentSpineIdx > 0;

  const displayHtml =
    srState !== 'idle' && srMode === 'inline' ? srWrappedHtml : htmlContent;

  const inlineSrWordIdx =
    srState !== 'idle' && srMode === 'inline' ? srWordIdx : undefined;

  const showFocusOverlay = srMode === 'focus' && srState !== 'idle';

  return (
    <div className="flex flex-col h-full bg-[#fefcf9] text-fg-primary font-sans antialiased">
      <ReadingTopbar
        bookTitle={title}
        author={author}
        fontSize={fontSize}
        onBack={handleBack}
        onIncreaseFontSize={increaseFontSize}
        onDecreaseFontSize={decreaseFontSize}
        srState={srState}
        srWordIdx={srWordIdx}
        srWordCount={srWordCount}
        srWpm={srWpm}
        onStartSR={handleStartSR}
        onPauseSR={handlePauseSR}
        onResumeSR={handleResumeSR}
        onStopSR={handleStopSR}
        onOpenSettings={handleOpenSettings}
      />

      {/* relative so SettingsPanel can be positioned absolutely inside */}
      <div className="relative flex flex-1 overflow-hidden">
        <SpineList
          items={spineItems}
          isLoading={isLoadingSpine}
          currentIndex={currentSpineIdx}
          onSelect={handleSpineSelect}
        />

        {/* Relative wrapper scopes FocusOverlay to the reading area */}
        <div className="relative flex-1 overflow-hidden flex">
          <BookContent
            html={displayHtml}
            fontSize={fontSize}
            isLoading={isLoadingContent}
            onNext={handleNext}
            onPrev={handlePrev}
            hasNext={hasNext}
            hasPrev={hasPrev}
            currentChapterIdx={currentSpineIdx}
            totalChapters={spineItems.length}
            srWordIdx={inlineSrWordIdx}
            srHighlightColor={srHighlightColor}
            onWordRightClick={handleWordRightClick}
            onIframeClick={() => setCtxMenu(null)}
            initialPage={initialPage}
            onPageChange={handlePageChange}
            onSelectionChange={handleSelectionChange}
          />

          {showFocusOverlay && (
            <FocusOverlay
              word={srWords[srWordIdx] ?? ''}
              wordIdx={srWordIdx}
              wordCount={srWordCount}
              isRunning={srState === 'running'}
              isReady={srReady}
              wpm={srWpm}
              focusFontSize={srFocusFontSize}
              focusWordColor={focusWordColor}
              onFontSizeIncrease={increaseFocusFontSize}
              onFontSizeDecrease={decreaseFocusFontSize}
              onStart={handleBeginSR}
              onPause={handlePauseSR}
              onResume={handleResumeSR}
              onStop={handleStopSR}
            />
          )}
        </div>

        {/* Settings panel overlays the full reading area (spine + content) */}
        <SettingsPanel
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          wpm={srWpm}
          onWpmChange={handleWpmChange}
          fontSize={fontSize}
          onFontSizeIncrease={increaseFontSize}
          onFontSizeDecrease={decreaseFontSize}
          focusFontSize={srFocusFontSize}
          onFocusFontSizeIncrease={increaseFocusFontSize}
          onFocusFontSizeDecrease={decreaseFocusFontSize}
          inlineHighlightColor={srHighlightColor}
          onInlineHighlightColorChange={setSrHighlightColor}
          focusWordColor={focusWordColor}
          onFocusWordColorChange={setFocusWordColor}
        />
      </div>

      {/* ── Right-click / SR-entry context menu ──────────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-[200]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()} // prevent window listener from immediately closing
        >
          <div className="bg-white rounded-lg shadow-xl border border-app-border overflow-hidden py-1 min-w-[176px]">
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-app-hover flex items-center gap-2.5 transition-colors"
              onClick={() => { handleStartSRFrom('inline', ctxMenu.wordIdx); setCtxMenu(null); }}
            >
              <svg className="w-3 h-3 shrink-0 text-fg-secondary" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Inline from here
            </button>
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-app-hover flex items-center gap-2.5 transition-colors"
              onClick={() => { handleStartSRFrom('focus', ctxMenu.wordIdx); setCtxMenu(null); }}
            >
              <svg className="w-3 h-3 shrink-0 text-fg-secondary" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Focus from here
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
