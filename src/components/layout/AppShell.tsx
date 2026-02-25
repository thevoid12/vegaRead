import type { ReactNode } from 'react';

interface AppShellProps {
  onImport: () => void;
  isImporting: boolean;
  children: ReactNode;
}

/**
 * Root application shell — headerbar + content area.
 * Modelled after Foliate's window layout: compact dark header, scrollable body.
 */
export function AppShell({ onImport, isImporting, children }: AppShellProps) {
  return (
    <div className="flex flex-col h-full bg-app-bg text-fg-primary font-sans antialiased">
      {/* ── Headerbar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-app-surface border-b border-app-border shrink-0">
        {/* Branding */}
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-accent"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
          </svg>
          <span className="text-fg-primary font-semibold text-sm tracking-tight select-none">
            vagaread
          </span>
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={onImport}
          disabled={isImporting}
          className="
            inline-flex items-center gap-1.5
            bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
            text-white rounded-md px-3 py-1.5
            text-xs font-medium transition-colors duration-150
            focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface
          "
          aria-label="Import EPUB book"
        >
          {isImporting ? (
            <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <svg
              className="w-3.5 h-3.5"
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
      </header>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="flex flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
