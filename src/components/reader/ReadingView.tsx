import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ReadingTopbar } from './ReadingTopbar';
import type { SrState, SrMode } from './ReadingTopbar';
import { SpineList } from './SpineList';
import { BookContent } from './BookContent';
import { FocusOverlay } from './FocusOverlay';
import { SettingsPanel } from './SettingsPanel';
import { getBookContent, listSpine, saveReadingProgress, saveSrPosition, getSettings, saveSettings } from '../../api/tauri';
import { wrapWordsInSpans, extractWords, sanitizeEpubHtml } from '../../utils/speedReader';
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

const SR_HIGHLIGHT_DEFAULT   = '#fbbf24';
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
 * SR position is saved to DB on: pause, stop (resets to 0), back, close,
 * and manual chapter navigation while SR is active.
 *
 * On book open, if book.sr_word_idx > 0 the saved position is restored —
 * the topbar Inline/Focus buttons will start from that word.
 * Right-click any word to start from a specific position via the context menu.
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
  const [currentPage, setCurrentPage] = useState(0);
  const [initialPage, setInitialPage] = useState(0);

  // ── Speed reader state ────────────────────────────────────────────────────
  // Initialise word index and mode from saved DB position (0 / 'inline' if none)
  const savedSrMode = (book.sr_mode === 'inline' || book.sr_mode === 'focus')
    ? book.sr_mode as SrMode
    : 'inline';

  const [srState,         setSrState]         = useState<SrState>('idle');
  const [srMode,          setSrMode]          = useState<SrMode>(savedSrMode);
  const [srReady,         setSrReady]         = useState(false);
  const [srWordIdx,       setSrWordIdx]       = useState(book.sr_word_idx);
  const [srWords,         setSrWords]         = useState<string[]>([]);
  const [srWrappedHtml,   setSrWrappedHtml]   = useState('');
  const [srWordCount,     setSrWordCount]     = useState(0);
  const [srFocusFontSize, setSrFocusFontSize] = useState(SR_FOCUS_FONT_DEFAULT);
  const [srWpm,           setSrWpm]           = useState(SR_WPM_DEFAULT);

  // Stable ref for srWrappedHtml — lets handleStartSRFrom check it without
  // adding srWrappedHtml as a dependency (which would cause stale closures).
  const srWrappedHtmlRef = useRef('');

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settingsOpen,        setSettingsOpen]        = useState(false);
  const [srHighlightColor,    setSrHighlightColor]    = useState(SR_HIGHLIGHT_DEFAULT);
  const [focusWordColor,      setFocusWordColor]      = useState(SR_FOCUS_COLOR_DEFAULT);
  const [focusBackgroundMode, setFocusBackgroundMode] = useState<'static' | 'tracking' | 'opaque'>('tracking');
  const saveSettingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted settings once on mount.
  useEffect(() => {
    getSettings().then((s) => {
      setSrWpm(s.wpm);
      setFontSize(s.font_size);
      setSrFocusFontSize(s.focus_font_size);
      setSrHighlightColor(s.inline_highlight_color);
      setFocusWordColor(s.focus_word_color);
      if (s.focus_background_mode === 'static' || s.focus_background_mode === 'tracking' || s.focus_background_mode === 'opaque') {
        setFocusBackgroundMode(s.focus_background_mode);
      }
    }).catch(() => { /* use defaults on error */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce-save settings to DB whenever any value changes.
  useEffect(() => {
    if (saveSettingsTimerRef.current) clearTimeout(saveSettingsTimerRef.current);
    saveSettingsTimerRef.current = setTimeout(() => {
      saveSettings({
        wpm: srWpm,
        font_size: fontSize,
        focus_font_size: srFocusFontSize,
        inline_highlight_color: srHighlightColor,
        focus_word_color: focusWordColor,
        focus_background_mode: focusBackgroundMode,
      }).catch(() => {});
    }, 500);
    return () => {
      if (saveSettingsTimerRef.current) clearTimeout(saveSettingsTimerRef.current);
    };
  }, [srWpm, fontSize, srFocusFontSize, srHighlightColor, focusWordColor, focusBackgroundMode]);

  // ── SR entry mode (crosshair — click a word to start SR directly in that mode) ─
  // false = inactive; 'inline' | 'focus' = waiting for user to click a word
  const [srEntryMode, setSrEntryMode] = useState<false | SrMode>(false);
  const srEntryModeRef = useRef<false | SrMode>(false);
  useEffect(() => { srEntryModeRef.current = srEntryMode; }, [srEntryMode]);

  // ── Context menu (right-click a word to start SR from it) ─────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wordIdx: number } | null>(null);

  // ── Refs that the setInterval callback reads — never stale ────────────────
  const isFirstLoadRef  = useRef(true);               // skip SR reset on initial content load
  const srIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const srWordIdxRef    = useRef(book.sr_word_idx);   // restored from DB or 0
  const srWordCountRef  = useRef(0);
  const srWpmRef        = useRef(SR_WPM_DEFAULT);
  const srOnEndRef      = useRef<(() => void) | null>(null);
  const srAutoRestartRef = useRef(false);

  // Refs for stable reads in callbacks (avoids stale closures)
  const hasNextRef        = useRef(false);
  const nextSpineIdxRef   = useRef(book.current_spine);
  const nextCharOffsetRef = useRef(0);

  useEffect(() => { hasNextRef.current      = nextSpineIdx < spineItems.length; },
    [nextSpineIdx, spineItems.length]);
  useEffect(() => { nextSpineIdxRef.current   = nextSpineIdx;   }, [nextSpineIdx]);
  useEffect(() => { nextCharOffsetRef.current = nextCharOffset; }, [nextCharOffset]);

  const currentSpineIdxRef = useRef(book.current_spine);
  const charOffsetRef      = useRef(book.current_read_idx);
  const currentPageRef     = useRef(0);
  const srModeRef          = useRef<SrMode>(savedSrMode);
  const srStateRef         = useRef<SrState>('idle');
  useEffect(() => { currentSpineIdxRef.current = currentSpineIdx; }, [currentSpineIdx]);
  useEffect(() => { charOffsetRef.current      = charOffset;      }, [charOffset]);
  useEffect(() => { currentPageRef.current     = currentPage;     }, [currentPage]);
  useEffect(() => { srModeRef.current          = srMode;          }, [srMode]);
  useEffect(() => { srStateRef.current         = srState;         }, [srState]);
  useEffect(() => { srWrappedHtmlRef.current   = srWrappedHtml;   }, [srWrappedHtml]);

  // Debounce timer for within-chunk page saves
  const saveProgressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref bundle for the close handler (always fresh values)
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

  // ── App close: save reading + SR progress before window closes ────────────
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isSavingClose = false;

    getCurrentWindow().onCloseRequested(async (event) => {
      if (isSavingClose) return;
      event.preventDefault();
      isSavingClose = true;
      if (saveProgressDebounceRef.current) {
        clearTimeout(saveProgressDebounceRef.current);
        saveProgressDebounceRef.current = null;
      }
      const { bookId, spineIdx, charOffset: co, currentPage: cp } = closeDataRef.current;
      try {
        // Always save reading progress; also save SR position if active
        if (srStateRef.current !== 'idle') {
          await saveSrPosition(bookId, spineIdx, co, cp, srWordIdxRef.current, srModeRef.current);
        } else {
          await saveReadingProgress(bookId, spineIdx, co, cp);
        }
      } catch (e) {
        console.error('[close save]', e);
      }
      await getCurrentWindow().close();
    }).then(fn => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []); // attach once on mount, reads fresh state via refs

  // ── Timer helpers ─────────────────────────────────────────────────────────
  const clearSRTimer = useCallback(() => {
    if (srIntervalRef.current !== null) {
      clearInterval(srIntervalRef.current);
      srIntervalRef.current = null;
    }
  }, []);

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

  // ── SR position save helper ────────────────────────────────────────────────
  /** Fire-and-forget save of the current SR position. */
  const saveSrPos = useCallback((wordIdx: number) => {
    saveSrPosition(
      book.vagaread_id,
      currentSpineIdxRef.current,
      charOffsetRef.current,
      currentPageRef.current,
      wordIdx,
      srModeRef.current,
    ).catch(console.error);
  }, [book.vagaread_id]);

  // ── Speed reader handlers ─────────────────────────────────────────────────

  /**
   * Open SR in the chosen mode starting from the restored / last word index.
   * Focus opens in "ready" state; inline starts immediately.
   */
  const handleStartSR = useCallback((mode: SrMode) => {
    const startFrom = srWordIdxRef.current;

    setSrEntryMode(false);
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
      const words = extractWords(htmlContent);
      setSrWords(words);
      setSrWordCount(words.length);
      srWordCountRef.current = words.length;
      setSrReady(true);
      setSrState('paused');
    }
  }, [htmlContent, startSRTimerFrom]);

  /** Called when the user clicks "Start Reading" inside the focus overlay. */
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
    saveSrPos(srWordIdxRef.current);
  }, [clearSRTimer, saveSrPos]);

  /** Resume keeps srOnEndRef as-is so auto-advance survives pause/resume. */
  const handleResumeSR = useCallback(() => {
    setSrState('running');
    startSRTimerFrom(srWordIdxRef.current);
  }, [startSRTimerFrom]);

  const handleStopSR = useCallback(() => {
    clearSRTimer();
    srOnEndRef.current = null;
    srAutoRestartRef.current = false;
    setSrReady(false);
    setSrState('idle');
    // Keep word position so user can resume from same spot
    saveSrPos(srWordIdxRef.current);
  }, [clearSRTimer, saveSrPos]);

  // ── Settings handlers ─────────────────────────────────────────────────────
  const handleOpenSettings = useCallback(() => {
    if (srState === 'running') handlePauseSR();
    setSettingsOpen(true);
  }, [srState, handlePauseSR]);

  const handleWpmChange = useCallback((wpm: number) => {
    srWpmRef.current = wpm;
    setSrWpm(wpm);
    if (srState === 'running') {
      clearSRTimer();
      startSRTimerFrom(srWordIdxRef.current);
    }
  }, [srState, clearSRTimer, startSRTimerFrom]);

  const increaseFocusFontSize = useCallback(
    () => setSrFocusFontSize(f => Math.min(f + SR_FOCUS_FONT_STEP, SR_FOCUS_FONT_MAX)), []);
  const decreaseFocusFontSize = useCallback(
    () => setSrFocusFontSize(f => Math.max(f - SR_FOCUS_FONT_STEP, SR_FOCUS_FONT_MIN)), []);

  // ── Context-menu (right-click to start SR from a specific word) ────────────
  const handleWordRightClick = useCallback((wordIdx: number, x: number, y: number) => {
    const clampedX = Math.min(x, window.innerWidth  - 192);
    const clampedY = Math.min(y, window.innerHeight - 80);
    setCtxMenu({ x: clampedX, y: clampedY, wordIdx });
  }, []);

  /**
   * Start SR from a specific word index — used by the right-click context menu.
   * If inline SR is already active we jump in-place (no iframe remount).
   */
  const handleStartSRFrom = useCallback((mode: SrMode, fromWordIdx: number) => {
    srOnEndRef.current = null;
    setSrEntryMode(false);
    setSrMode(mode);
    setSrWordIdx(fromWordIdx);
    srWordIdxRef.current = fromWordIdx;

    if (mode === 'inline') {
      if (srState !== 'idle' && srMode === 'inline') {
        // Already in inline SR — just jump to the new position
        clearSRTimer();
        setSrState('running');
        startSRTimerFrom(fromWordIdx);
      } else {
        // Reuse existing wrapped HTML if available (e.g. set by entry mode) to
        // avoid an unnecessary iframe remount. Only regenerate when needed.
        if (!srWrappedHtmlRef.current) {
          const { html, wordCount } = wrapWordsInSpans(htmlContent);
          setSrWrappedHtml(html);
          setSrWordCount(wordCount);
          srWordCountRef.current = wordCount;
        }
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

  /**
   * Activate entry mode for the given SR mode.
   * Generates wrapped HTML immediately so data-sr spans exist in the iframe.
   */
  const handleActivateEntryMode = useCallback((mode: SrMode) => {
    if (!srWrappedHtml && htmlContent) {
      const { html, wordCount } = wrapWordsInSpans(htmlContent);
      setSrWrappedHtml(html);
      setSrWordCount(wordCount);
      srWordCountRef.current = wordCount;
    }
    setSrEntryMode(mode);
  }, [htmlContent, srWrappedHtml]);

  /**
   * Called by BookContent when user clicks a word while entry mode is active.
   * Directly starts SR in the chosen mode — no context menu needed.
   */
  const handleSrWordClick = useCallback((wordIdx: number) => {
    const mode = srEntryModeRef.current;
    if (!mode) return;
    handleStartSRFrom(mode, wordIdx);
  }, [handleStartSRFrom]);

  // Close context menu on any left-click outside it
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  // ── Stop / auto-restart when chapter content changes ─────────────────────
  useEffect(() => {
    if (!htmlContent) return; // wait for real content

    if (srAutoRestartRef.current) {
      srAutoRestartRef.current = false;
      const words = extractWords(htmlContent);
      setSrWords(words);
      setSrWordCount(words.length);
      srWordCountRef.current = words.length;
      setSrWordIdx(0);
      srWordIdxRef.current = 0;
      startSRTimerFrom(0);
      return;
    }

    // First load: restore saved highlight position without starting SR
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      if (srWordIdxRef.current > 0) {
        const { html, wordCount } = wrapWordsInSpans(htmlContent);
        setSrWrappedHtml(html);
        setSrWordCount(wordCount);
        srWordCountRef.current = wordCount;
      }
      return;
    }

    // Normal chapter change — stop the reader completely
    clearSRTimer();
    srOnEndRef.current = null;
    setSrReady(false);
    setSrState('idle');
    setSrEntryMode(false);
    setSrWordIdx(0);
    srWordIdxRef.current = 0;
    setSrWrappedHtml('');
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
        setHtmlContent(sanitizeEpubHtml(res.content.content));
        setNextSpineIdx(res.content.spine_idx);
        setNextCharOffset(res.content.next_char_offset);
        setPageSize(res.content.page_size);
        setInitialPage(res.content.current_page);
      })
      .catch(console.error)
      .finally(() => setIsLoadingContent(false));
  }, [book.vagaread_id, currentSpineIdx, charOffset]);

  // ── Page-change callback ──────────────────────────────────────────────────
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
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

  /** Save SR position before changing chapter (if SR is active). */
  const saveSrBeforeNav = useCallback(() => {
    if (srStateRef.current !== 'idle') {
      saveSrPos(srWordIdxRef.current);
    }
  }, [saveSrPos]);

  const handleSpineSelect = useCallback((idx: number) => {
    saveSrBeforeNav();
    setCurrentSpineIdx(idx);
    setCharOffset(0);
  }, [saveSrBeforeNav]);

  const handleNext = useCallback(() => {
    saveSrBeforeNav();
    setCurrentSpineIdx(nextSpineIdx);
    setCharOffset(nextCharOffset);
  }, [nextSpineIdx, nextCharOffset, saveSrBeforeNav]);

  const handlePrev = useCallback(() => {
    saveSrBeforeNav();
    if (charOffset > 0 && pageSize > 0) {
      setCharOffset((o) => Math.max(0, o - pageSize));
    } else if (currentSpineIdx > 0) {
      setCurrentSpineIdx((i) => i - 1);
      setCharOffset(0);
    }
  }, [charOffset, currentSpineIdx, pageSize, saveSrBeforeNav]);

  // ── Back button: flush saves then navigate ────────────────────────────────
  const handleBack = useCallback(async () => {
    if (saveProgressDebounceRef.current) {
      clearTimeout(saveProgressDebounceRef.current);
      saveProgressDebounceRef.current = null;
    }
    try {
      if (srStateRef.current !== 'idle') {
        await saveSrPosition(
          book.vagaread_id, currentSpineIdx, charOffset, currentPage,
          srWordIdxRef.current, srModeRef.current,
        );
      } else {
        await saveReadingProgress(book.vagaread_id, currentSpineIdx, charOffset, currentPage);
      }
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

  // Show wrapped HTML when SR is active (any mode), idle with saved position,
  // or entry mode is active. Keeping the clean, script-free wrapped HTML in the
  // iframe during focus SR prevents it from reverting to htmlContent (which has
  // script tags that are blocked by the sandbox and cause spurious errors).
  const showSrHtml =
    (srState !== 'idle' && srWrappedHtml !== '') ||
    (srState === 'idle' && srWordIdx > 0 && srWrappedHtml !== '') ||
    (srEntryMode !== false && srWrappedHtml !== '');

  const displayHtml = showSrHtml ? srWrappedHtml : htmlContent;
  const showFocusOverlay = srMode === 'focus' && srState !== 'idle';

  // During active focus SR, only track the word in the background when mode is 'tracking'.
  // In 'static' and 'opaque' the highlight stays fixed (or hidden behind a solid bg).
  const inlineSrWordIdx = showSrHtml
    ? (showFocusOverlay && focusBackgroundMode !== 'tracking' ? undefined : srWordIdx)
    : undefined;

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
        srEntryMode={srEntryMode}
        onActivateEntryMode={handleActivateEntryMode}
        onCancelEntryMode={() => setSrEntryMode(false)}
      />

      <div className="relative flex flex-1 overflow-hidden">
        <SpineList
          items={spineItems}
          isLoading={isLoadingSpine}
          currentIndex={currentSpineIdx}
          onSelect={handleSpineSelect}
        />

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
            srEntryMode={srEntryMode}
            onSrWordClick={handleSrWordClick}
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
              backgroundMode={focusBackgroundMode}
              onFontSizeIncrease={increaseFocusFontSize}
              onFontSizeDecrease={decreaseFocusFontSize}
              onStart={handleBeginSR}
              onPause={handlePauseSR}
              onResume={handleResumeSR}
              onStop={handleStopSR}
            />
          )}
        </div>

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
          focusBackgroundMode={focusBackgroundMode}
          onFocusBackgroundModeChange={setFocusBackgroundMode}
        />
      </div>

      {/* ── Right-click context menu ─────────────────────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-[200]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
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
