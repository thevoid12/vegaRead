import { useEffect } from 'react';

interface ErrorToastProps {
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Defaults to 4000. */
  duration?: number;
}

/**
 * A fixed-position red popup that auto-dismisses after `duration` ms.
 * Shown when an unsupported file is dropped or an import fails.
 */
export function ErrorToast({ message, onDismiss, duration = 4000 }: ErrorToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="
        fixed top-4 right-4 z-[200]
        flex items-start gap-3
        bg-white border border-red-200
        text-red-800
        rounded-xl px-4 py-3
        shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(239,68,68,0.15)]
        max-w-sm w-[calc(100vw-2rem)]
      "
      style={{ animation: 'toast-in 0.2s ease-out' }}
    >
      <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
        <svg
          className="w-3 h-3 text-red-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      </div>

      <p className="flex-1 text-sm leading-snug">{message}</p>

      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 -mr-1 -mt-0.5 w-6 h-6 flex items-center justify-center rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
