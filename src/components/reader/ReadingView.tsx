import { useState, useEffect, useCallback } from 'react';
import { ReadingTopbar } from './ReadingTopbar';
import { SpineList } from './SpineList';
import { BookContent } from './BookContent';
import { getBookContent, listSpine } from '../../api/tauri';
import type { Book, SpineItem } from '../../types';

const FONT_SIZE_MIN     = 12;
const FONT_SIZE_MAX     = 32;
const FONT_SIZE_STEP    = 2;
const FONT_SIZE_DEFAULT = 18;


interface ReadingViewProps {
  book: Book;
  onBack: () => void;
}

/**
 * Full-page reading experience.
 *
 * Layout:
 *   ReadingTopbar (back · title · zoom · Start stub)
 *   ├── SpineList  (chapter sidebar)
 *   └── BookContent (two-page iframe renderer + page/chapter nav)
 *
 * Navigation:
 *   - Click a spine item → jump to that chapter (spine_idx = clicked, char_offset = 0)
 *   - Next / Prev buttons inside BookContent advance pages within the chapter,
 *     then advance or retreat one chapter when at the boundary
 */
export function ReadingView({ book, onBack }: ReadingViewProps) {
  const [spineItems,       setSpineItems]       = useState<SpineItem[]>([]);
  const [isLoadingSpine,   setIsLoadingSpine]   = useState(true);
  const [currentSpineIdx,  setCurrentSpineIdx]  = useState(book.current_spine);
  const [charOffset,       setCharOffset]       = useState(book.current_read_idx);
  const [htmlContent,      setHtmlContent]      = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [fontSize,         setFontSize]         = useState(FONT_SIZE_DEFAULT);
  // Next page position and chunk size returned by the backend
  const [nextSpineIdx,     setNextSpineIdx]     = useState(book.current_spine);
  const [nextCharOffset,   setNextCharOffset]   = useState(0);
  const [pageSize,         setPageSize]         = useState(0);

  // ── Load spine list once on mount ────────────────────────────────────────
  useEffect(() => {
    setIsLoadingSpine(true);
    listSpine(book.vagaread_id)
      .then(setSpineItems)
      .catch(console.error)
      .finally(() => setIsLoadingSpine(false));
  }, [book.vagaread_id]);

  // ── Load chapter content whenever position changes ────────────────────────
  // The backend returns book_response { vagaread_id, content: Content_response }.
  // The actual HTML lives at res.content.content.
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

  // ── Navigation handlers ────────────────────────────────────────────────────
  /** Jump directly to the start of a spine item from the sidebar */
  const handleSpineSelect = useCallback((idx: number) => {
    setCurrentSpineIdx(idx);
    setCharOffset(0);
  }, []);

  /**
   * Advance to the position returned by the last backend response.
   * If the chunk exhausted the chapter, the backend already set nextSpineIdx to
   * currentSpineIdx + 1 and nextCharOffset to 0, so this naturally crosses
   * chapter boundaries without any extra logic here.
   */
  const handleNext = useCallback(() => {
    setCurrentSpineIdx(nextSpineIdx);
    setCharOffset(nextCharOffset);
  }, [nextSpineIdx, nextCharOffset]);

  /** Go back one chunk within the chapter, or to the previous chapter. */
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

  // Backend sets nextSpineIdx = currentSpineIdx + 1 when a chunk exhausts the
  // chapter, so nextSpineIdx >= spineItems.length means we are on the last chunk
  // of the last chapter.
  const hasNext = nextSpineIdx < spineItems.length;
  const hasPrev = charOffset > 0 || currentSpineIdx > 0;

  return (
    <div className="flex flex-col h-full bg-[#fefcf9] text-fg-primary font-sans antialiased">
      <ReadingTopbar
        bookTitle={title}
        author={author}
        fontSize={fontSize}
        onBack={onBack}
        onIncreaseFontSize={increaseFontSize}
        onDecreaseFontSize={decreaseFontSize}
      />

      <div className="flex flex-1 overflow-hidden">
        <SpineList
          items={spineItems}
          isLoading={isLoadingSpine}
          currentIndex={currentSpineIdx}
          onSelect={handleSpineSelect}
        />

        <BookContent
          html={htmlContent}
          fontSize={fontSize}
          isLoading={isLoadingContent}
          onNext={handleNext}
          onPrev={handlePrev}
          hasNext={hasNext}
          hasPrev={hasPrev}
          currentChapterIdx={currentSpineIdx}
          totalChapters={spineItems.length}
        />
      </div>
    </div>
  );
}
