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
import { ErrorToast } from '../ui/ErrorToast';
import type { Book, SpineItem, AppSettings } from '../../types';

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

export function ReadingView({ book, onBack }: ReadingViewProps) {
  // ── Reading state ─────────────────────────────────────────────────────────
  const [toastError,       setToastError]       = useState<string | null>(null);
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

  const srWrappedHtmlRef = useRef('');

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settingsOpen,        setSettingsOpen]        = useState(false);
  const [srHighlightColor,    setSrHighlightColor]    = useState(SR_HIGHLIGHT_DEFAULT);
  const [focusWordColor,      setFocusWordColor]      = useState(SR_FOCUS_COLOR_DEFAULT);
  const [focusBackgroundMode, setFocusBackgroundMode] = useState<'static' | 'tracking' | 'opaque'>('tracking');
  const [pageMode,            setPageMode]            = useState<'single' | 'double'>('double');
  const saveSettingsTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsRef    = useRef<AppSettings | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      srWpmRef.current = s.wpm;
      setSrWpm(s.wpm);
      setFontSize(s.font_size);
      setSrFocusFontSize(s.focus_font_size);
      setSrHighlightColor(s.inline_highlight_color);
      setFocusWordColor(s.focus_word_color);
      if (s.focus_background_mode === 'static' || s.focus_background_mode === 'tracking' || s.focus_background_mode === 'opaque') {
        setFocusBackgroundMode(s.focus_background_mode);
      }
      if (s.page_mode === 'single' || s.page_mode === 'double') {
        setPageMode(s.page_mode);
      }
    }).catch(() => { /* use defaults on error */ });
  }, []);

  useEffect(() => {
    const s: AppSettings = {
      wpm: srWpm,
      font_size: fontSize,
      focus_font_size: srFocusFontSize,
      inline_highlight_color: srHighlightColor,
      focus_word_color: focusWordColor,
      focus_background_mode: focusBackgroundMode,
      page_mode: pageMode,
    };
    pendingSettingsRef.current = s;
    if (saveSettingsTimerRef.current) clearTimeout(saveSettingsTimerRef.current);
    saveSettingsTimerRef.current = setTimeout(() => {
      pendingSettingsRef.current = null;
      saveSettings(s).catch(() => {});
    }, 500);
    return () => {
      if (saveSettingsTimerRef.current) clearTimeout(saveSettingsTimerRef.current);
    };
  }, [srWpm, fontSize, srFocusFontSize, srHighlightColor, focusWordColor, focusBackgroundMode, pageMode]);

  const [srEntryMode, setSrEntryMode] = useState<false | SrMode>(false);
  const srEntryModeRef = useRef<false | SrMode>(false);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wordIdx: number } | null>(null);

  const isFirstLoadRef    = useRef(true);               // skip SR reset on initial content load
  const srIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const srWordIdxRef      = useRef(book.sr_word_idx);   // restored from DB or 0
  const srWordCountRef    = useRef(0);
  const srWpmRef          = useRef(SR_WPM_DEFAULT);
  const srOnEndRef        = useRef<(() => void) | null>(null);
  const srAutoRestartRef  = useRef(false);
  const hasNextRef        = useRef(false);
  const nextSpineIdxRef   = useRef(book.current_spine);
  const nextCharOffsetRef = useRef(0);
  const currentSpineIdxRef = useRef(book.current_spine);
  const charOffsetRef      = useRef(book.current_read_idx);
  const currentPageRef     = useRef(0);
  const pageSizeRef        = useRef(0);
  const srModeRef          = useRef<SrMode>(savedSrMode);
  const srStateRef         = useRef<SrState>('idle');

  const saveProgressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      // Remove listener first so re-triggering close doesn't loop
      unlisten?.();
      unlisten = null;
      // Flush pending settings
      if (saveSettingsTimerRef.current) {
        clearTimeout(saveSettingsTimerRef.current);
        saveSettingsTimerRef.current = null;
      }
      const pendingS = pendingSettingsRef.current;
      if (pendingS) {
        pendingSettingsRef.current = null;
        await saveSettings(pendingS).catch(() => {});
      }
      // Flush pending reading progress
      if (saveProgressDebounceRef.current) {
        clearTimeout(saveProgressDebounceRef.current);
        saveProgressDebounceRef.current = null;
      }
      const bookId   = book.vagaread_id;
      const spineIdx = currentSpineIdxRef.current;
      const co       = charOffsetRef.current;
      const cp       = currentPageRef.current;
      try {
        if (srStateRef.current !== 'idle') {
          await saveSrPosition(bookId, spineIdx, co, cp, srWordIdxRef.current, srModeRef.current);
        } else {
          await saveReadingProgress(bookId, spineIdx, co, cp);
        }
      } catch (e) {
        console.error('[close save]', e);
      }
      try {
        await getCurrentWindow().close();
      } catch (e) {
        console.error('[close]', e);
      }
    }).then(fn => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []); // attach once on mount, reads fresh state via refs

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
    saveSrPos(srWordIdxRef.current);
  }, [clearSRTimer, saveSrPos]);

  const handleOpenSettings = useCallback(() => {
    if (srStateRef.current === 'running') handlePauseSR();
    setSettingsOpen(true);
  }, [handlePauseSR]);

  const handleWpmChange = useCallback((wpm: number) => {
    srWpmRef.current = wpm;
    setSrWpm(wpm);
    if (srStateRef.current === 'running') {
      clearSRTimer();
      startSRTimerFrom(srWordIdxRef.current);
    }
  }, [clearSRTimer, startSRTimerFrom]);

  const increaseFocusFontSize = useCallback(
    () => setSrFocusFontSize(f => Math.min(f + SR_FOCUS_FONT_STEP, SR_FOCUS_FONT_MAX)), []);
  const decreaseFocusFontSize = useCallback(
    () => setSrFocusFontSize(f => Math.max(f - SR_FOCUS_FONT_STEP, SR_FOCUS_FONT_MIN)), []);

  const handleWordRightClick = useCallback((wordIdx: number, x: number, y: number) => {
    const clampedX = Math.min(x, window.innerWidth  - 192);
    const clampedY = Math.min(y, window.innerHeight - 80);
    setCtxMenu({ x: clampedX, y: clampedY, wordIdx });
  }, []);

  const handleStartSRFrom = useCallback((mode: SrMode, fromWordIdx: number) => {
    srOnEndRef.current = null;
    setSrEntryMode(false);
    setSrMode(mode);
    setSrWordIdx(fromWordIdx);
    srWordIdxRef.current = fromWordIdx;

    if (mode === 'inline') {
      if (srStateRef.current !== 'idle' && srModeRef.current === 'inline') {
        clearSRTimer();
        setSrState('running');
        startSRTimerFrom(fromWordIdx);
      } else {
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
  }, [htmlContent, clearSRTimer, startSRTimerFrom]);

  const handleActivateEntryMode = useCallback((mode: SrMode) => {
    if (!srWrappedHtmlRef.current && htmlContent) {
      const { html, wordCount } = wrapWordsInSpans(htmlContent);
      setSrWrappedHtml(html);
      setSrWordCount(wordCount);
      srWordCountRef.current = wordCount;
    }
    setSrEntryMode(mode);
  }, [htmlContent]);

  const handleSrWordClick = useCallback((wordIdx: number) => {
    const mode = srEntryModeRef.current;
    if (!mode) return;
    handleStartSRFrom(mode, wordIdx);
  }, [handleStartSRFrom]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

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

    clearSRTimer();
    srOnEndRef.current = null;
    setSrReady(false);
    setSrState('idle');
    setSrEntryMode(false);
    setSrWordIdx(0);
    srWordIdxRef.current = 0;
    setSrWrappedHtml('');
  }, [htmlContent, clearSRTimer, startSRTimerFrom]);

  useEffect(() => () => { clearSRTimer(); }, [clearSRTimer]);

  useEffect(() => {
    setIsLoadingSpine(true);
    listSpine(book.vagaread_id)
      .then(setSpineItems)
      .catch(() => setToastError('Failed to load chapter list. Try reopening the book.'))
      .finally(() => setIsLoadingSpine(false));
  }, [book.vagaread_id]);

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
      .catch(() => setToastError('Failed to load chapter content. Try navigating to another chapter.'))
      .finally(() => setIsLoadingContent(false));
  }, [book.vagaread_id, currentSpineIdx, charOffset]);

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
    setCurrentSpineIdx(nextSpineIdxRef.current);
    setCharOffset(nextCharOffsetRef.current);
  }, [saveSrBeforeNav]);

  const handlePrev = useCallback(() => {
    saveSrBeforeNav();
    if (charOffsetRef.current > 0 && pageSizeRef.current > 0) {
      setCharOffset((o) => Math.max(0, o - pageSizeRef.current));
    } else if (currentSpineIdxRef.current > 0) {
      setCurrentSpineIdx((i) => i - 1);
      setCharOffset(0);
    }
  }, [saveSrBeforeNav]);

  const handleBack = useCallback(async () => {
    if (saveSettingsTimerRef.current) {
      clearTimeout(saveSettingsTimerRef.current);
      saveSettingsTimerRef.current = null;
    }
    const pendingS = pendingSettingsRef.current;
    if (pendingS) {
      pendingSettingsRef.current = null;
      await saveSettings(pendingS).catch(() => {});
    }
    if (saveProgressDebounceRef.current) {
      clearTimeout(saveProgressDebounceRef.current);
      saveProgressDebounceRef.current = null;
    }
    try {
      if (srStateRef.current !== 'idle') {
        await saveSrPosition(
          book.vagaread_id, currentSpineIdxRef.current, charOffsetRef.current, currentPageRef.current,
          srWordIdxRef.current, srModeRef.current,
        );
      } else {
        await saveReadingProgress(book.vagaread_id, currentSpineIdxRef.current, charOffsetRef.current, currentPageRef.current);
      }
    } catch (e) {
      console.error('[back save]', e);
    }
    onBack();
  }, [book.vagaread_id, onBack]);

  const increaseFontSize = useCallback(
    () => setFontSize((f) => Math.min(f + FONT_SIZE_STEP, FONT_SIZE_MAX)), []);
  const decreaseFontSize = useCallback(
    () => setFontSize((f) => Math.max(f - FONT_SIZE_STEP, FONT_SIZE_MIN)), []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey; // Cmd on macOS, Ctrl on Linux/Windows
    if (isMod && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      setFontSize((f) => Math.min(f + FONT_SIZE_STEP, FONT_SIZE_MAX));
      return;
    }
    if (isMod && e.key === '-') {
      e.preventDefault();
      setFontSize((f) => Math.max(f - FONT_SIZE_STEP, FONT_SIZE_MIN));
      return;
    }
    if (e.key === ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const state = srStateRef.current;
      if (state === 'running') {
        e.preventDefault();
        handlePauseSR();
      } else if (state === 'paused') {
        e.preventDefault();
        handleResumeSR();
      }
    }
  }, [handlePauseSR, handleResumeSR]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const title  = book.meta_data.title?.[0]   ?? 'Untitled';
  const author = book.meta_data.creator?.[0] ?? '';

  const hasNext = nextSpineIdx < spineItems.length;
  const hasPrev = charOffset > 0 || currentSpineIdx > 0;

  currentSpineIdxRef.current = currentSpineIdx;
  charOffsetRef.current      = charOffset;
  currentPageRef.current     = currentPage;
  pageSizeRef.current        = pageSize;
  srModeRef.current          = srMode;
  srStateRef.current         = srState;
  srWrappedHtmlRef.current   = srWrappedHtml;
  hasNextRef.current         = hasNext;
  nextSpineIdxRef.current    = nextSpineIdx;
  nextCharOffsetRef.current  = nextCharOffset;
  srEntryModeRef.current     = srEntryMode;

  const showSrHtml =
    (srState !== 'idle' && srWrappedHtml !== '') ||
    (srState === 'idle' && srWordIdx > 0 && srWrappedHtml !== '') ||
    (srEntryMode !== false && srWrappedHtml !== '');

  const displayHtml = showSrHtml ? srWrappedHtml : htmlContent;
  const showFocusOverlay = srMode === 'focus' && srState !== 'idle';
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
            pageMode={pageMode}
            onKeyDown={handleKeyDown}
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
          pageMode={pageMode}
          onPageModeChange={setPageMode}
        />
      </div>

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

      {toastError && (
        <ErrorToast message={toastError} onDismiss={() => setToastError(null)} />
      )}
    </div>
  );
}
