# vagaread Backend Documentation

## Overview

The backend is a Tauri 2 Rust application. All business logic lives in `src-tauri/src/`. The frontend communicates with the backend exclusively through Tauri IPC commands registered in `lib.rs`.

---

## Technology Stack

- **Tauri 2** — desktop shell, IPC, window management
- **Rust** with async/await via the Tokio runtime (provided by Tauri)
- **sqlx** — async SQLite access with a connection pool
- **epub** crate — EPUB file parsing
- **uuid** — UUID v4 generation and serde support
- **serde / serde_json** — serialisation for all IPC return values
- **tauri-plugin-log** — structured logging to stdout and platform log file
- **tauri-plugin-dialog** — native OS file picker
- **tauri-plugin-opener** — open files with OS default application

---

## File Overview

```
src-tauri/
  src/
    lib.rs          — Tauri builder, plugin registration, panic hook, invoke_handler
    handlers.rs     — all #[tauri::command] functions and shared internal logic
    models.rs       — request/response structs, validation newtypes, DB model structs
    db.rs           — all SQLite operations (no raw SQL outside this file)
    epub_util.rs    — EPUB parsing: metadata, spine, cover image, paginated content
    util.rs         — file system helpers (copy to app data directory)
    errors.rs       — ApplicationError type and error code constants
  migrations/
    schema.sql      — initial table creation (run once on new DB)
    queries.rs      — SQL query string constants (included into the binary)
```

---

## Startup (lib.rs)

On launch, `lib.rs` runs the Tauri builder in this order:

1. Registers `tauri_plugin_log` (stdout + platform log file at `vagaread`)
2. Registers `tauri_plugin_opener` and `tauri_plugin_dialog`
3. In `.setup`: calls `db::init_db` (creates DB and schema if first launch), injects the pool into managed state, and installs a `std::panic::set_hook` that logs panics via `log::error!` before the process aborts
4. Registers all IPC command handlers via `invoke_handler`

---

## Registered Commands

All commands are public async functions in `handlers.rs`, registered in `lib.rs`.

### show_home_page_handler

**Frontend:** `fetchAllBooks()`
**Returns:** `Vec<Vagaread>`

Returns all non-deleted book records from the database. Called on app start and after every import.

### upload_file_handler

**Frontend:** `uploadFile(filePath)`
**Parameters:** `file_path: String`
**Returns:** `ContentResponse`

Executed in `load_file_core`:
1. Copies the EPUB to the app data directory (`util::copy_to_app_directory`)
2. Extracts metadata (`epub_util::extract_epub_metadata`), parses to `serde_json::Value`
3. Inserts a new `vagaread` record with a fresh UUID v4
4. Returns the first content chunk (spine 0, offset 0)

### get_ebook_content_handler

**Frontend:** `getBookContent(fileId, spineIdx, charOffset)`
**Parameters:** `file_id: Uuid`, `spine_idx: usize`, `char_offset: usize`
**Returns:** `BookResponse`

Fetches the DB record to resolve the file path, then calls `epub_util::get_paginated_content`. If the requested position differs from the saved position, saves the new position fire-and-forget via `update_ebook_page_state_async`. Returns the saved visual page number when restoring a previously visited position, or 0 when navigating to a new chunk.

### list_spine_handler

**Frontend:** `listSpine(fileId)`
**Parameters:** `file_id: Uuid`
**Returns:** `Vec<SpineItemResponse>`

Resolves the file path from the DB, then calls `epub_util::get_epub_spine`.

### get_cover_image_handler

**Frontend:** `getCoverImage(fileId)`
**Parameters:** `file_id: Uuid`
**Returns:** `Option<String>`

Returns the cover image as a `data:image/...;base64,...` data URI, or `null` if the EPUB has no cover. Calls `epub_util::extract_cover_as_data_uri`.

### save_reading_progress_handler

**Frontend:** `saveReadingProgress(fileId, spineIdx, charOffset, currentPage)`
**Parameters:** `file_id: Uuid`, `spine_idx: usize`, `char_offset: usize`, `current_page: usize`
**Returns:** `()`

Persists spine index, character offset, and visual page number for within-chunk page turns. Called debounced from the frontend on page navigation and awaited before the back button and window close actions complete.

### save_sr_position_handler

**Frontend:** `saveSrPosition(fileId, spineIdx, charOffset, currentPage, wordIdx, mode)`
**Parameters:** `file_id: Uuid`, `spine_idx: usize`, `char_offset: usize`, `current_page: usize`, `word_idx: usize`, `mode: String`
**Returns:** `()`

Saves both the reading position and the SR word pointer atomically in two sequential DB writes: `update_vb_record` then `update_sr_position`. Called on SR pause, stop, back, and window close.

### get_settings_handler

**Frontend:** `getSettings()`
**Returns:** `AppSettings`

Reads the `settings_json` column from the sentinel row (`id = 'app_settings'`). Returns `AppSettings::default()` if no sentinel row exists yet (first launch).

### save_settings_handler

**Frontend:** `saveSettings(settings)`
**Parameters:** `SaveSettingsRequestRaw` (wpm, font sizes, colors, focus mode)
**Returns:** `()`

Validates all fields, serialises to JSON, and upserts the sentinel settings row.

---

## Models (models.rs)

### Request validation

Raw request structs (`*Raw`) are the Tauri deserialization targets. Each is converted to a validated struct via a `validate()` method that returns `ApplicationError` on bad input. Validated structs use newtypes (`SpineIndex`, `CharOffset`, `CurrentPage`, `WordIdx`, `SrMode`, `FilePath`) to enforce range and format constraints.

### Vagaread

One DB record per imported book, returned to the frontend by `show_home_page_handler`.

| Field | Type | Description |
|---|---|---|
| `vagaread_id` | `Uuid` | Primary key |
| `internal_fp` | `String` | Absolute path to EPUB in app data directory |
| `meta_data` | `serde_json::Value` | Full EPUB metadata as a JSON object |
| `current_read_idx` | `usize` | Character offset within current spine (saved progress) |
| `current_spine` | `usize` | Spine index of last read position |
| `current_page` | `usize` | Visual (CSS column) page within the current chunk |
| `sr_word_idx` | `usize` | Word index within chunk where SR was last paused |
| `sr_mode` | `String` | `"inline"` or `"focus"` |
| `is_deleted` | `bool` | Soft-delete flag |

### ContentResponse

Returned by `epub_util::get_paginated_content`.

| Field | Description |
|---|---|
| `content` | Raw EPUB chapter HTML for this chunk |
| `spine_idx` | Spine index for the next call |
| `next_char_offset` | Character offset within `spine_idx` for the next call |
| `page_size` | Always `PAGINATE_CHAR` (10,000) — tells the frontend the step size for Prev |
| `current_page` | Visual page to restore to (0 when navigating, saved value when restoring) |

### BookResponse

Wraps `ContentResponse` with the book UUID. Returned by `get_ebook_content_handler`.

### SpineItemResponse

One item from the EPUB spine.

| Field | Description |
|---|---|
| `idref` | Manifest item ID |
| `href` | Resolved file path within the EPUB archive |
| `title` | Human-readable title from the NCX/NAV table of contents, if matched |
| `id` | `itemref` id attribute (often absent) |
| `properties` | EPUB properties attribute |
| `linear` | Whether this item is in the linear reading order |

### AppSettings

Global reader settings stored in the DB sentinel row. Defaults: wpm=250, font_size=18, focus_font_size=72, inline_highlight_color=#fbbf24, focus_word_color=#000000, focus_background_mode=tracking.

### Constants

- `PAGINATE_CHAR = 10_000` — maximum characters per content chunk

---

## EPUB Utilities (epub_util.rs)

### extract_epub_metadata(fp)

Iterates `doc.metadata` and groups values into a `HashMap<String, Vec<String>>` by property name, then serialises to JSON.

### get_epub_spine(fp)

Maps `doc.spine` items into `Vec<SpineItemResponse>`. Resolves each `idref` to an `href` via the manifest resources map, and matches the `href` against the NCX/NAV TOC to find the chapter title. Filename matching falls back to basename comparison when full path does not match.

### extract_cover_as_data_uri(fp)

Finds the cover item in the EPUB manifest (by `cover-image` property or `cover` id convention), reads the raw bytes, and encodes them as a base64 data URI. Returns `None` if no cover is found.

### get_paginated_content(fp, spine_idx, char_offset, chunk_size)

Opens the EPUB, resolves `spine_idx` to a manifest resource, and gets the raw XHTML. Takes a `chunk_size`-character slice starting at `char_offset`. If the remainder fits within `chunk_size`, advances `spine_idx` by 1 and resets offset to 0. Returns a `ContentResponse`.

---

## Error Handling

All handlers return `Result<T, ApplicationError>`. `ApplicationError` is serialisable with fields `code: &str` and `message: Option<String>`. Tauri delivers errors as rejected promises on the frontend.

Error codes (`errors::codes`):
- `DATABASE_ERROR` — SQLite operation failed
- `EPUB_ERROR` — EPUB could not be opened or parsed
- `VALIDATION_ERROR` — request field failed validation
- `DIRECTORY_ERROR` — app data directory could not be resolved or created

---

## Panic Handling

A `std::panic::set_hook` is installed in `lib.rs` after the logger initialises. Any panic logs via `log::error!` before the process aborts. Panics in Tokio-spawned tasks are caught by the runtime and do not propagate to the main thread.
