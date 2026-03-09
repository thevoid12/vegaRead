import { useState, useEffect } from 'react';
import type { Book } from '../../types';
import { BookCover } from '../common/BookCover';
import { getCoverImage } from '../../api/tauri';

interface BookCardProps {
  book: Book;
  onClick: (book: Book) => void;
}


export function BookCard({ book, onClick }: BookCardProps) {
  const title  = book.meta_data.title?.[0]   ?? 'Untitled';
  const author = book.meta_data.creator?.[0];
  const hasProgress = book.current_read_idx > 0 || book.current_spine > 0;

  const [coverSrc, setCoverSrc] = useState<string | undefined>();
  useEffect(() => {
    getCoverImage(book.vagaread_id).then(src => {
      if (src) setCoverSrc(src);
    }).catch(() => {});
  }, [book.vagaread_id]);

  return (
    <button
      type="button"
      onClick={() => onClick(book)}
      className="
        group flex flex-col w-full text-left
        bg-app-card rounded-card overflow-hidden
        border border-app-border
        shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)]
        hover:border-accent/40
        hover:shadow-[0_4px_12px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.07)]
        hover:-translate-y-0.5
        transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-app-bg
      "
    >
      <div className="aspect-[2/3] w-full overflow-hidden">
        <BookCover title={title} author={author} coverSrc={coverSrc} />
      </div>

      <div className="px-3 pt-2.5 pb-3 flex flex-col gap-0.5 min-w-0">
        <h3 className="text-fg-primary text-sm font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {title}
        </h3>

        {author && (
          <p className="text-fg-muted text-xs truncate">{author}</p>
        )}

        {hasProgress && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-accent text-[10px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            In progress
          </span>
        )}
      </div>
    </button>
  );
}
