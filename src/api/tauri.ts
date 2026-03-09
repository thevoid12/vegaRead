import { invoke } from '@tauri-apps/api/core';
import type { Book, SpineItem, BookResponse, ContentResponse, AppSettings } from '../types';

export async function fetchAllBooks(): Promise<Book[]> {
  return invoke<Book[]>('show_home_page_handler');
}

export async function uploadFile(filePath: string): Promise<ContentResponse> {
  return invoke<ContentResponse>('upload_file_handler', {
    req: { file_path: filePath },
  });
}

export async function getBookContent(
  fileId: string,
  spineIdx: number,
  charOffset: number,
): Promise<BookResponse> {
  return invoke<BookResponse>('get_ebook_content_handler', {
    req: { file_id: fileId, spine_idx: spineIdx, char_offset: charOffset },
  });
}

export async function listSpine(fileId: string): Promise<SpineItem[]> {
  return invoke<SpineItem[]>('list_spine_handler', {
    req: { file_id: fileId },
  });
}


export async function getCoverImage(fileId: string): Promise<string | null> {
  return invoke<string | null>('get_cover_image_handler', {
    req: { file_id: fileId },
  });
}


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


export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_settings_handler');
}


export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>('save_settings_handler', { req: settings });
}
