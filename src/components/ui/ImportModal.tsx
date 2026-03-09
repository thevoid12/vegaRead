import { useEffect, useState, useCallback, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTauriDragDrop } from '../../hooks/useTauriDragDrop';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (filePath: string) => Promise<void>;
  onError: (message: string) => void;
}


export function ImportModal({ isOpen, onClose, onImport, onError }: ImportModalProps) {
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

  const isDragOver = useTauriDragDrop(isOpen, processFilePath);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isProcessing, onClose]);

  const handleBrowse = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'EPUB', extensions: ['epub'] }],
    });
    if (selected && typeof selected === 'string') {
      await processFilePath(selected);
    }
  }, [processFilePath]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[3px]"
        onClick={() => !isProcessing && onClose()}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import EPUB book"
        className="
          fixed z-50 top-1/2 left-1/2
          w-[460px] max-w-[calc(100vw-2rem)]
          bg-app-surface rounded-2xl
          shadow-[0_20px_60px_rgba(0,0,0,0.18),0_4px_16px_rgba(0,0,0,0.1)]
          border border-app-border
          overflow-hidden
        "
        style={{ animation: 'modal-in 0.18s ease-out forwards' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-app-border">
          <h2 className="text-fg-primary text-base font-semibold">Import Book</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-fg-secondary hover:text-fg-primary hover:bg-app-hover transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          <div
            className={`
              relative flex flex-col items-center justify-center gap-3
              rounded-xl border-2 border-dashed
              px-6 py-10
              transition-all duration-150
              ${isDragOver
                ? 'border-accent bg-accent-muted scale-[0.99]'
                : 'border-app-border bg-app-bg hover:border-accent/40 hover:bg-accent-muted/50'
              }
              ${isProcessing ? 'pointer-events-none opacity-60' : ''}
            `}
          >
            {isProcessing ? (
              <>
                <span className="w-10 h-10 rounded-full border-[3px] border-accent border-t-transparent animate-spin" />
                <p className="text-fg-secondary text-sm">Importing book…</p>
              </>
            ) : (
              <>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isDragOver ? 'bg-accent/15' : 'bg-app-hover'}`}>
                  <svg
                    className={`w-7 h-7 transition-colors ${isDragOver ? 'text-accent' : 'text-fg-muted'}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>

                {isDragOver ? (
                  <p className="text-accent font-medium text-sm">Release to import</p>
                ) : (
                  <>
                    <div className="text-center">
                      <p className="text-fg-primary text-sm font-medium">Drop your EPUB file here</p>
                      <p className="text-fg-muted text-xs mt-1">Supports .epub files only</p>
                    </div>

                    <div className="flex items-center gap-3 w-full max-w-[200px]">
                      <div className="flex-1 h-px bg-app-border" />
                      <span className="text-fg-muted text-xs">or</span>
                      <div className="flex-1 h-px bg-app-border" />
                    </div>

                    <button
                      type="button"
                      onClick={handleBrowse}
                      className="
                        inline-flex items-center gap-2
                        bg-accent hover:bg-accent-hover
                        text-white rounded-lg px-4 py-2
                        text-sm font-medium transition-colors duration-150
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                      "
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      Browse files
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
