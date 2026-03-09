interface BookCoverProps {
  title: string;
  author?: string;
  coverSrc?: string;
  className?: string;
}

export function BookCover({ title, author, coverSrc, className = '' }: BookCoverProps) {
  if (coverSrc) {
    return (
      <img
        src={coverSrc}
        alt={`Cover of ${title}`}
        className={`w-full h-full object-cover ${className}`}
      />
    );
  }

  const hue = title
    .split('')
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) & 0xffff, 0) % 360;

  const gradientFrom = `hsl(${hue}, 35%, 28%)`;
  const gradientTo   = `hsl(${(hue + 40) % 360}, 30%, 16%)`;

  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-end overflow-hidden select-none ${className}`}
      style={{ background: `linear-gradient(160deg, ${gradientFrom} 0%, ${gradientTo} 100%)` }}
      aria-label={`Cover placeholder for ${title}`}
    >
      {/* Subtle open-book watermark */}
      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-16 h-16 opacity-[0.18] text-white"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
      </svg>

      {/* Title / author caption at the bottom */}
      <div className="relative z-10 w-full px-2.5 pb-2.5 pt-8 bg-gradient-to-t from-black/50 to-transparent">
        <p className="text-white/90 text-[11px] font-medium leading-tight text-center line-clamp-2">
          {title}
        </p>
        {author && (
          <p className="text-white/55 text-[9px] mt-0.5 text-center truncate">{author}</p>
        )}
      </div>
    </div>
  );
}
