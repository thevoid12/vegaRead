import { useState, useCallback, useRef, useEffect } from 'react';
import { useTauriDragDrop } from '../../hooks/useTauriDragDrop';
import type { Book } from '../../types';
import { BookCard } from './BookCard';
import { EmptyLibrary } from './EmptyLibrary';

interface LibraryPageProps {
  books: Book[];
  isLoading: boolean;
  onBookClick: (book: Book) => void;
  onOpenImport: () => void;
  onImport: (filePath: string) => Promise<void>;
  onError: (message: string) => void;
  dragEnabled?: boolean;
}

export function LibraryPage({
  books,
  isLoading,
  onBookClick,
  onOpenImport,
  onImport,
  onError,
  dragEnabled = true,
}: LibraryPageProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const processFilePath = useCallback(async (filePath: string) => {
    if (!filePath.toLowerCase().endsWith('.epub')) {
      onError('Only EPUB files are supported. Please select a .epub file.');
      return;
    }
    if (!mountedRef.current) return;
    setIsProcessing(true);
    try {
      await onImport(filePath);
    } catch {
      if (mountedRef.current) {
        onError('Failed to import the book. The file may be corrupt or unreadable.');
      }
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  }, [onImport, onError]);

  const isDragOver = useTauriDragDrop(dragEnabled, processFilePath);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-y-auto scrollbar-thin">
      {/* Full-window drag-drop overlay */}
      {(isDragOver || isProcessing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px]">
          <div className={`
            flex flex-col items-center gap-4
            bg-app-surface rounded-2xl border-2 border-dashed
            px-16 py-12
            shadow-[0_20px_60px_rgba(0,0,0,0.18)]
            transition-all duration-150
            ${isDragOver ? 'border-accent scale-[1.02]' : 'border-app-border'}
          `}>
            {isProcessing ? (
              <>
                <span className="w-12 h-12 rounded-full border-[3px] border-accent border-t-transparent animate-spin" />
                <p className="text-fg-secondary text-sm font-medium">Importing book…</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
                  <svg className="w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="text-accent font-semibold text-base">Release to import</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="px-6 py-6">
        {books.length === 0 ? (
          <EmptyLibrary onImport={onOpenImport} />
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-fg-primary text-base font-semibold tracking-tight">Library</h2>
              <span className="text-fg-muted text-xs">
                {books.length} {books.length === 1 ? 'book' : 'books'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {books.map((book) => (
                <BookCard key={book.vagaread_id} book={book} onClick={onBookClick} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
