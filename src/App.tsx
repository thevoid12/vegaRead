import { useState, useEffect, useCallback } from 'react';
import { AppShell } from './components/layout/AppShell';
import { LibraryPage } from './components/library/LibraryPage';
import { ImportModal } from './components/ui/ImportModal';
import { ErrorToast } from './components/ui/ErrorToast';
import { fetchAllBooks, uploadFile } from './api/tauri';
import type { Book } from './types';

function App() {
  const [books, setBooks]                     = useState<Book[]>([]);
  const [isLoading, setIsLoading]             = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toastError, setToastError]           = useState<string | null>(null);

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

  // Called by ImportModal with a validated .epub absolute path
  const handleImport = useCallback(async (filePath: string) => {
    await uploadFile(filePath);
    await refreshLibrary();
    setShowImportModal(false);
  }, [refreshLibrary]);

  const handleBookClick = useCallback((book: Book) => {
    // TODO: navigate to reading view
    console.log('Open book:', book.vagaread_id);
  }, []);

  const openImportModal = useCallback(() => setShowImportModal(true), []);

  return (
    <>
      <AppShell onOpenImport={openImportModal}>
        <LibraryPage
          books={books}
          isLoading={isLoading}
          onBookClick={handleBookClick}
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
        <ErrorToast
          message={toastError}
          onDismiss={() => setToastError(null)}
        />
      )}
    </>
  );
}

export default App;
