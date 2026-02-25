import { useState, useEffect, useCallback } from 'react';
import { AppShell } from './components/layout/AppShell';
import { LibraryPage } from './components/library/LibraryPage';
import { fetchAllBooks, loadFile } from './api/tauri';
import type { Book } from './types';

function App() {
  const [books, setBooks]             = useState<Book[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const refreshLibrary = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await fetchAllBooks();
      setBooks(result);
    } catch (err) {
      console.error('Failed to load library:', err);
      setError('Failed to load library. Please restart the app.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const handleImport = useCallback(async () => {
    if (isImporting) return;
    try {
      setIsImporting(true);
      // file_path is currently hardcoded on the Rust side for development
      await loadFile('');
      await refreshLibrary();
    } catch (err) {
      console.error('Failed to import book:', err);
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, refreshLibrary]);

  const handleBookClick = useCallback((book: Book) => {
    // TODO: navigate to reading view
    console.log('Open book:', book.vagaread_id);
  }, []);

  return (
    <AppShell onImport={handleImport} isImporting={isImporting}>
      {error ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : (
        <LibraryPage
          books={books}
          isLoading={isLoading}
          isImporting={isImporting}
          onBookClick={handleBookClick}
          onImport={handleImport}
        />
      )}
    </AppShell>
  );
}

export default App;
