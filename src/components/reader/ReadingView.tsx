import { useState, useEffect, useCallback, useRef } from 'react';
import { ReadingTopbar } from './ReadingTopbar';
import type { SrState, SrMode } from './ReadingTopbar';
import { SpineList } from './SpineList';
import { BookContent } from './BookContent';
import { FocusOverlay } from './FocusOverlay';
import { getBookContent, listSpine } from '../../api/tauri';
import { wrapWordsInSpans, extractWords } from '../../utils/speedReader';
import type { Book, SpineItem } from '../../types';

const FONT_SIZE_MIN     = 12;
const FONT_SIZE_MAX     = 32;
const FONT_SIZE_STEP    = 2;
const FONT_SIZE_DEFAULT = 18;

const SR_WPM         = 250;
const SR_INTERVAL_MS = Math.round(60_000 / SR_WPM); // 240 ms per word

interface ReadingViewProps {
  book: Book;
  onBack: () => void;
}

/**
 * Full-page reading experience.
 *
 * Layout:
 *   ReadingTopbar (back · title · zoom · speed-read controls)
 *   ├── SpineList  (chapter sidebar)
 *   └── relative wrapper
 *       ├── BookContent (two-page iframe renderer + page/chapter nav)
 *       └── FocusOverlay (shown only in focus SR mode)
 *
 * Speed reader:
 *   - "Inline" mode wraps every word in <span data-sr="N"> and passes the
 *     modified HTML to BookContent, which highlights and scrolls to each word.
 *   - "Focus" mode extracts plain-text words and displays them one at a time
 *     in a glassmorphism overlay (FocusOverlay).
 *   - Timer uses refs (srWordIdxRef, srWordCountRef) to avoid stale closures
 *     inside setInterval.
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
  const [srState,       setSrState]       = useState<SrState>('idle');
  const [srMode,        setSrMode]        = useState<SrMode>('inline');
  const [srWordIdx,     setSrWordIdx]     = useState(0);
  const [srWords,       setSrWords]       = useState<string[]>([]);    // focus mode
  const [srWrappedHtml, setSrWrappedHtml] = useState('');              // inline mode
  const [srWordCount,   setSrWordCount]   = useState(0);

  // Refs so the setInterval callback never captures stale values
  const srIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const srWordIdxRef   = useRef(0);
  const srWordCountRef = useRef(0);

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
        // Reached end of chunk — stop
        clearInterval(srIntervalRef.current!);
        srIntervalRef.current = null;
        setSrState('idle');
        setSrWordIdx(Math.max(0, srWordCountRef.current - 1));
        srWordIdxRef.current = Math.max(0, srWordCountRef.current - 1);
      } else {
        srWordIdxRef.current = next;
        setSrWordIdx(next);
      }
    }, SR_INTERVAL_MS);
  }, [clearSRTimer]);

  // ── Speed reader handlers ─────────────────────────────────────────────────
  const handleStartSR = useCallback((mode: SrMode) => {
    setSrMode(mode);
    setSrWordIdx(0);
    srWordIdxRef.current = 0;

    if (mode === 'inline') {
      const { html, wordCount } = wrapWordsInSpans(htmlContent);
      setSrWrappedHtml(html);
      setSrWordCount(wordCount);
      srWordCountRef.current = wordCount;
    } else {
      const words = extractWords(htmlContent);
      setSrWords(words);
      setSrWordCount(words.length);
      srWordCountRef.current = words.length;
    }

    setSrState('running');
    startSRTimerFrom(0);
  }, [htmlContent, startSRTimerFrom]);

  const handlePauseSR = useCallback(() => {
    clearSRTimer();
    setSrState('paused');
  }, [clearSRTimer]);

  const handleResumeSR = useCallback(() => {
    setSrState('running');
    startSRTimerFrom(srWordIdxRef.current);
  }, [startSRTimerFrom]);

  const handleStopSR = useCallback(() => {
    clearSRTimer();
    setSrState('idle');
    setSrWordIdx(0);
    srWordIdxRef.current = 0;
  }, [clearSRTimer]);

  // Stop speed reader when chapter content changes (user navigated)
  useEffect(() => {
    clearSRTimer();
    setSrState('idle');
    setSrWordIdx(0);
    srWordIdxRef.current = 0;
  }, [htmlContent, clearSRTimer]);

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

  // ── Font size controls ────────────────────────────────────────────────────
  const increaseFontSize = useCallback(
    () => setFontSize((f) => Math.min(f + FONT_SIZE_STEP, FONT_SIZE_MAX)),
    [],
  );
  const decreaseFontSize = useCallback(
    () => setFontSize((f) => Math.max(f - FONT_SIZE_STEP, FONT_SIZE_MIN)),
    [],
  );

  const title  = book.meta_data.title?.[0]   ?? 'Untitled';
  const author = book.meta_data.creator?.[0] ?? '';

  const hasNext = nextSpineIdx < spineItems.length;
  const hasPrev = charOffset > 0 || currentSpineIdx > 0;

  // Which HTML to pass to the iframe: word-wrapped (inline SR) or raw chapter
  const displayHtml =
    srState !== 'idle' && srMode === 'inline' ? srWrappedHtml : htmlContent;

  // srWordIdx only reaches BookContent in inline mode
  const inlineSrWordIdx =
    srState !== 'idle' && srMode === 'inline' ? srWordIdx : undefined;

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
        onStartSR={handleStartSR}
        onPauseSR={handlePauseSR}
        onResumeSR={handleResumeSR}
        onStopSR={handleStopSR}
      />

      <div className="flex flex-1 overflow-hidden">
        <SpineList
          items={spineItems}
          isLoading={isLoadingSpine}
          currentIndex={currentSpineIdx}
          onSelect={handleSpineSelect}
        />

        {/* Relative wrapper scopes FocusOverlay to the reading area only */}
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
          />

          {/* Focus (RSVP) overlay — only rendered in focus SR mode */}
          {srState !== 'idle' && srMode === 'focus' && (
            <FocusOverlay
              word={srWords[srWordIdx] ?? ''}
              wordIdx={srWordIdx}
              wordCount={srWordCount}
              isRunning={srState === 'running'}
              wpm={SR_WPM}
              onPause={handlePauseSR}
              onResume={handleResumeSR}
              onStop={handleStopSR}
            />
          )}
        </div>
      </div>
    </div>
  );
}
