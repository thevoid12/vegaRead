import type { Book } from '../../types';
import { BookCard } from './BookCard';
import { EmptyLibrary } from './EmptyLibrary';

interface LibraryPageProps {
  books: Book[];
  isLoading: boolean;
  onBookClick: (book: Book) => void;
  onOpenImport: () => void;
}


export function LibraryPage({
  books,
  isLoading,
  onBookClick,
  onOpenImport,
}: LibraryPageProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (books.length === 0) {
    return <EmptyLibrary onImport={onOpenImport} />;
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6">
      {/* Section header */}
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-fg-primary text-base font-semibold tracking-tight">Library</h2>
        <span className="text-fg-muted text-xs">
          {books.length} {books.length === 1 ? 'book' : 'books'}
        </span>
      </div>

      {/* Responsive grid — 2 cols baseline, up to 6 on wide screens */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {books.map((book) => (
          <BookCard key={book.vagaread_id} book={book} onClick={onBookClick} />
        ))}
      </div>
    </div>
  );
}
