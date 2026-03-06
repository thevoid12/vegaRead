/**
 * Raw EPUB metadata as extracted by the Rust backend.
 * Each field is an array of strings (EPUB spec allows multiple values per property).
 * The keys are the raw EPUB metadata property names.
 */
export interface BookMetadata {
  title?: string[];
  creator?: string[];       // author(s)
  publisher?: string[];
  language?: string[];
  description?: string[];
  subject?: string[];       // genre / tags
  date?: string[];
  identifier?: string[];    // ISBN or other identifier
  rights?: string[];
  [key: string]: string[] | undefined;
}

/**
 * Mirrors the Rust `vagaread` struct serialized over Tauri IPC.
 */
export interface Book {
  vagaread_id: string;
  internal_fp: string;
  meta_data: BookMetadata;
  current_read_idx: number;
  current_spine: number;
  current_page: number;
  sr_word_idx: number;   // restored SR word position within the loaded chunk (0 = none saved)
  sr_mode: string;       // "inline" | "focus"
  is_deleted: boolean;
}

/**
 * Mirrors `models::SpineItemResponse` — one ordered item in the EPUB spine.
 * href  = actual file path within the EPUB archive (resolved from the manifest resources map)
 * title = human-readable label from the EPUB NCX / NAV table of contents (preferred for display)
 */
export interface SpineItem {
  idref: string;
  href: string | null;
  title: string | null;
  id: string | null;
  properties: string | null;
  linear: boolean;
}

/**
 * Mirrors `models::Content_response` — the raw content chunk returned by the backend.
 * content       = EPUB chapter HTML for this chunk
 * spine_idx     = spine index to pass on the NEXT call (may have advanced if chunk exhausted the chapter)
 * next_char_offset = char offset within spine_idx to pass on the next call
 */
export interface ContentResponse {
  content: string;
  spine_idx: number;
  next_char_offset: number;
  page_size: number;  // chunk size used by the backend — used by the frontend to step back on Prev
  current_page: number; // visual page to restore (0 on navigation, saved value on book open/restore)
}

/**
 * Mirrors `models::book_response` — the full response from get_ebook_content_handler.
 * vagaread_id = the book's UUID
 * content     = the nested ContentResponse chunk
 */
export interface BookResponse {
  vagaread_id: string;
  content: ContentResponse;
}
