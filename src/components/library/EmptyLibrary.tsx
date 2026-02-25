interface EmptyLibraryProps {
  onImport: () => void;
  isImporting: boolean;
}

/**
 * Shown on the home page when the library has no books yet.
 */
export function EmptyLibrary({ onImport, isImporting }: EmptyLibraryProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 py-20 text-center">
      {/* Icon container */}
      <div className="w-20 h-20 rounded-full bg-app-surface border border-app-border flex items-center justify-center">
        <svg
          className="w-10 h-10 text-fg-muted"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
        </svg>
      </div>

      {/* Copy */}
      <div>
        <h2 className="text-fg-primary text-lg font-semibold mb-1.5">Your library is empty</h2>
        <p className="text-fg-secondary text-sm leading-relaxed max-w-xs">
          Import an EPUB file to start building your reading list
        </p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onImport}
        disabled={isImporting}
        className="
          inline-flex items-center gap-2
          bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed
          text-white rounded-lg px-5 py-2.5
          text-sm font-medium transition-colors duration-150
        "
      >
        {isImporting ? (
          <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
        ) : (
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v16m8-8H4" />
          </svg>
        )}
        {isImporting ? 'Importing…' : 'Import Book'}
      </button>
    </div>
  );
}
