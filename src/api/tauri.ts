import { invoke } from '@tauri-apps/api/core';
import type { Book } from '../types';

/**
 * Fetches all non-deleted books from the local SQLite database.
 * Maps to the Rust `show_home_page_handler` command.
 */
export async function fetchAllBooks(): Promise<Book[]> {
  return invoke<Book[]>('show_home_page_handler');
}

/**
 * Imports an EPUB file into the library.
 * Maps to the Rust `load_file_handler` command.
 * Returns the initial paginated content chunk.
 */
export async function loadFile(filePath: string): Promise<string> {
  return invoke<string>('load_file_handler', { filePath });
}
