import { invoke } from '@tauri-apps/api/core';
import type { Book, SpineItem, BookResponse, ContentResponse } from '../types';

/**
 * Fetches all non-deleted books from the local SQLite database.
 * Maps to the Rust `show_home_page_handler` command.
 */
export async function fetchAllBooks(): Promise<Book[]> {
  return invoke<Book[]>('show_home_page_handler');
}

/**
 * Imports an EPUB file into the library by its absolute path on disk.
 * Maps to the Rust `upload_file_handler` command.
 * Returns the ContentResponse for the first chunk of the newly imported book.
 */
export async function uploadFile(filePath: string): Promise<ContentResponse> {
  return invoke<ContentResponse>('upload_file_handler', { filePath });
}

/**
 * Fetches paginated HTML content for a book chapter.
 * Maps to `get_ebook_content_handler`.
 * spineIdx    = which spine item (chapter) to load, 0-based.
 * charOffset  = character offset within that spine item (0 = from the start).
 * Returns BookResponse: { vagaread_id, content: { content, spine_idx, next_char_offset } }
 */
export async function getBookContent(
  fileId: string,
  spineIdx: number,
  charOffset: number,
): Promise<BookResponse> {
  return invoke<BookResponse>('get_ebook_content_handler', {
    fileId,
    spineIdx,
    charOffset,
  });
}

/**
 * Fetches the ordered spine (chapter list) for a book.
 * Maps to `list_spine_handler`.
 */
export async function listSpine(fileId: string): Promise<SpineItem[]> {
  return invoke<SpineItem[]>('list_spine_handler', { fileId });
}

/**
 * Returns the cover image as a data URI (e.g. "data:image/jpeg;base64,..."),
 * or null if the EPUB has no declared cover image.
 * Maps to `get_cover_image_handler`.
 */
export async function getCoverImage(fileId: string): Promise<string | null> {
  return invoke<string | null>('get_cover_image_handler', { fileId });
}
