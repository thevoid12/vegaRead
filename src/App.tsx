import { useState, useEffect, useCallback } from 'react';
import { AppShell } from './components/layout/AppShell';
import { LibraryPage } from './components/library/LibraryPage';
import { ReadingView } from './components/reader/ReadingView';
import { ImportModal } from './components/ui/ImportModal';
import { ErrorToast } from './components/ui/ErrorToast';
import { fetchAllBooks, uploadFile } from './api/tauri';
import type { Book } from './types';

function App() {
  const [books, setBooks]                     = useState<Book[]>([]);
  const [isLoading, setIsLoading]             = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toastError, setToastError]           = useState<string | null>(null);
  const [activeBook, setActiveBook]           = useState<Book | null>(null);

  const refreshLibrary = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fetchAllBooks();
      setBooks(result);
    } catch (err) {
      console.error('Failed to load library:', err);
      setToastError('Failed to load library. Please restart the app.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const handleImport = useCallback(async (filePath: string) => {
    await uploadFile(filePath);
    await refreshLibrary();
    setShowImportModal(false);
  }, [refreshLibrary]);

  const openImportModal = useCallback(() => setShowImportModal(true), []);

  if (activeBook) {
    return (
      <>
        <ReadingView
          book={activeBook}
          onBack={() => { setActiveBook(null); refreshLibrary(); }}
        />
        {toastError && (
          <ErrorToast message={toastError} onDismiss={() => setToastError(null)} />
        )}
      </>
    );
  }

  // Library view
  return (
    <>
      <AppShell onOpenImport={openImportModal}>
        <LibraryPage
          books={books}
          isLoading={isLoading}
          onBookClick={setActiveBook}
          onOpenImport={openImportModal}
        />
      </AppShell>

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        onError={setToastError}
      />

      {toastError && (
        <ErrorToast message={toastError} onDismiss={() => setToastError(null)} />
      )}
    </>
  );
}

export default App;
