import { invoke } from '@tauri-apps/api/core';
import type { Book, SpineItem, BookResponse, ContentResponse, AppSettings } from '../types';

/**
 * Fetches all non-deleted books from the local SQLite database.
 * Maps to the Rust `show_home_page_handler` command.
 */
export async function fetchAllBooks(): Promise<Book[]> {
  return invoke<Book[]>('show_home_page_handler');
}

/**
 * Imports an EPUB file into the library by its absolute path on disk.
 * Maps to `upload_file_handler` (UploadFileRequestRaw).
 */
export async function uploadFile(filePath: string): Promise<ContentResponse> {
  return invoke<ContentResponse>('upload_file_handler', {
    req: { file_path: filePath },
  });
}

/**
 * Fetches paginated HTML content for a book chapter.
 * Maps to `get_ebook_content_handler` (GetEbookContentRequestRaw).
 */
export async function getBookContent(
  fileId: string,
  spineIdx: number,
  charOffset: number,
): Promise<BookResponse> {
  return invoke<BookResponse>('get_ebook_content_handler', {
    req: { file_id: fileId, spine_idx: spineIdx, char_offset: charOffset },
  });
}

/**
 * Fetches the ordered spine (chapter list) for a book.
 * Maps to `list_spine_handler` (ListSpineRequestRaw).
 */
export async function listSpine(fileId: string): Promise<SpineItem[]> {
  return invoke<SpineItem[]>('list_spine_handler', {
    req: { file_id: fileId },
  });
}

/**
 * Returns the cover image as a data URI, or null if none.
 * Maps to `get_cover_image_handler` (GetCoverImageRequestRaw).
 */
export async function getCoverImage(fileId: string): Promise<string | null> {
  return invoke<string | null>('get_cover_image_handler', {
    req: { file_id: fileId },
  });
}

/**
 * Saves reading position including the visual page within the current chunk.
 * Maps to `save_reading_progress_handler` (SaveReadingProgressRequestRaw).
 */
export async function saveReadingProgress(
  fileId: string,
  spineIdx: number,
  charOffset: number,
  currentPage: number,
): Promise<void> {
  return invoke<void>('save_reading_progress_handler', {
    req: {
      file_id: fileId,
      spine_idx: spineIdx,
      char_offset: charOffset,
      current_page: currentPage,
    },
  });
}

/**
 * Sends current speed-reader position to the backend for logging.
 * Maps to `save_sr_position_handler` (SaveSrPositionRequestRaw).
 */
export async function saveSrPosition(
  fileId: string,
  spineIdx: number,
  charOffset: number,
  currentPage: number,
  wordIdx: number,
  mode: string,
): Promise<void> {
  return invoke<void>('save_sr_position_handler', {
    req: {
      file_id: fileId,
      spine_idx: spineIdx,
      char_offset: charOffset,
      current_page: currentPage,
      word_idx: wordIdx,
      mode,
    },
  });
}

/**
 * Loads persisted global reader settings from the DB.
 * Maps to `get_settings_handler`.
 */
export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_settings_handler');
}

/**
 * Saves global reader settings to the DB.
 * Maps to `save_settings_handler`.
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>('save_settings_handler', { req: settings });
}
