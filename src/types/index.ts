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
  is_deleted: boolean;
}
