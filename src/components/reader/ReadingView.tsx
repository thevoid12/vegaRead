import { useState, useEffect, useCallback, useRef } from 'react';
import { ReadingTopbar } from './ReadingTopbar';
import type { SrState, SrMode } from './ReadingTopbar';
import { SpineList } from './SpineList';
import { BookContent } from './BookContent';
import { FocusOverlay } from './FocusOverlay';
import { SettingsPanel } from './SettingsPanel';
import { getBookContent, listSpine } from '../../api/tauri';
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

  // ── Settings state ────────────────────────────────────────────────────────
  const [settingsOpen,        setSettingsOpen]        = useState(false);
  const [srHighlightColor,    setSrHighlightColor]    = useState(SR_HIGHLIGHT_DEFAULT);
  const [focusWordColor,      setFocusWordColor]      = useState(SR_FOCUS_COLOR_DEFAULT);

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

  /** Open SR in the chosen mode. Focus opens in "ready" state; inline starts immediately. */
  const handleStartSR = useCallback((mode: SrMode) => {
    setSrMode(mode);
    setSrWordIdx(0);
    srWordIdxRef.current = 0;
    srOnEndRef.current = null;

    if (mode === 'inline') {
      const { html, wordCount } = wrapWordsInSpans(htmlContent);
      setSrWrappedHtml(html);
      setSrWordCount(wordCount);
      srWordCountRef.current = wordCount;
      setSrState('running');
      startSRTimerFrom(0);
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
  }, [clearSRTimer]);

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
    setSrWordIdx(0);
    srWordIdxRef.current = 0;
  }, [clearSRTimer]);

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
      })
      .catch(console.error)
      .finally(() => setIsLoadingContent(false));
  }, [book.vagaread_id, currentSpineIdx, charOffset]);

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
        onBack={onBack}
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
    </div>
  );
}
