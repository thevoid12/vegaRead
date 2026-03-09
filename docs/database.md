# vagaread Database Documentation

## Overview

vagaread uses SQLite accessed through the sqlx async Rust library. The database file is stored in the Tauri platform app-data directory and initialised automatically on first launch.

---

## Technology

- **SQLite** — embedded, serverless, file-based
- **sqlx** — async Rust library, raw SQL with manual row mapping (no ORM)
- **SqlitePool** — connection pool (max 5 connections) injected into Tauri managed state; all command handlers receive it as `State<'_, SqlitePool>`

---

## Schema

Defined in `src-tauri/migrations/schema.sql`, executed once on a new database.

### vagaread table

One row per imported EPUB book, plus one sentinel row for global settings.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | NOT NULL | UUID v4 primary key. Sentinel settings row uses `'app_settings'` |
| `internal_book_path` | TEXT | NOT NULL | Absolute path to the EPUB copy in the app data directory |
| `meta_data` | JSON | NOT NULL | Full EPUB metadata as a JSON string |
| `current_read_idx` | TEXT | NOT NULL | Character offset within the current spine item (stored as string) |
| `current_spine` | TEXT | NOT NULL | Spine index of the last read position (stored as string) |
| `current_page` | TEXT | NOT NULL DEFAULT '0' | Visual CSS column page within the current chunk |
| `speed_read_pointer` | TEXT | NOT NULL DEFAULT '0:inline' | SR position as `"{word_idx}:{mode}"` |
| `settings_json` | TEXT | NOT NULL DEFAULT '{}' | Global reader settings JSON (only used on sentinel row) |
| `created_on` | TIMESTAMP | NOT NULL | Insertion timestamp |
| `updated_on` | TIMESTAMP | NOT NULL | Last update timestamp |
| `is_deleted` | BOOL | NOT NULL | Soft-delete flag |

**Note:** `current_read_idx`, `current_spine`, and `current_page` are stored as TEXT because SQLite's dynamic typing made string storage simplest given the Rust `usize` types. They are parsed back to `usize` on read.

---

## Sentinel Row (Global Settings)

Rather than a separate settings table, a single sentinel row with `id = 'app_settings'` and `is_deleted = true` stores global reader settings in the `settings_json` column. This row must be inserted once before settings can be saved. Book queries exclude it via `WHERE is_deleted = false`.

---

## SQL Queries (migrations/queries.rs)

All SQL constants are defined here and included into the binary at compile time.

| Constant | Operation |
|---|---|
| `CREATE_VB_RECORD` | INSERT new book row |
| `UPDATE_VB_RECORD` | UPDATE `current_read_idx`, `current_spine`, `current_page` by id |
| `UPDATE_SR_POSITION` | UPDATE `speed_read_pointer` by id |
| `LIST_ALL_RECORD` | SELECT all rows WHERE `is_deleted = false` |
| `GET_VB_RECORD_BY_ID` | SELECT single row by id WHERE `is_deleted = false` |
| `GET_SETTINGS` | SELECT `settings_json` WHERE `id = 'app_settings'` |
| `UPDATE_SETTINGS` | UPDATE `settings_json` WHERE `id = 'app_settings'` |

---

## Database Module (db.rs)

All SQL operations are in `src-tauri/src/db.rs`. No raw SQL exists elsewhere.

### init_db(app)

Resolves the app-data directory, creates it if missing, opens the SQLite pool with `create_if_missing(true)`. On first launch (DB file did not exist), calls `create_tables` which executes `schema.sql`.

### create_record(pool, record)

Inserts a new book row. `meta_data` is serialised from `serde_json::Value` to string. `speed_read_pointer` is formatted as `"{sr_word_idx}:{sr_mode}"`.

### list_all_vb_records(pool)

SELECT all rows WHERE `is_deleted = false`. Parses each TEXT column back to its Rust type. `current_page` uses `unwrap_or(0)` for backwards compatibility with rows created before that column existed. `speed_read_pointer` is parsed by `parse_sr_pointer` into `(usize, String)`.

### get_vb_record_by_id(pool, id)

Fetches a single row by id. Same parsing logic as `list_all_vb_records`.

### update_vb_record(pool, data)

Updates `current_read_idx`, `current_spine`, `current_page`, and `updated_on` for a given `vagaread_id`.

### update_sr_position(pool, id, pointer)

Updates `speed_read_pointer` and `updated_on` for a given id. The pointer string is formatted by the caller as `"{word_idx}:{mode}"`.

### get_settings(pool)

SELECT `settings_json` from the sentinel row. Deserialises via `serde_json::from_str`, falling back to `AppSettings::default()` on parse failure or missing row.

### update_settings(pool, req)

Serialises the validated settings struct to a JSON object and UPDATE the sentinel row's `settings_json`.

---

## Reading Progress Save Model

Progress is saved in three situations:

1. **Cross-chunk navigation** — `get_ebook_content_handler` detects a position change and calls `update_ebook_page_state_async` (fire-and-forget Tokio task) so the content response is not delayed
2. **Within-chunk page turn** — frontend calls `saveReadingProgress` debounced at 500 ms
3. **Back button and window close** — frontend awaits `saveReadingProgress` before proceeding, ensuring the last position is never lost

SR position is saved via `save_sr_position_handler` which writes both `update_vb_record` and `update_sr_position` sequentially in the same handler call.

---

## Connection Pool Lifecycle

The pool is created once in `lib.rs` during app setup, injected into Tauri managed state with `.manage(pool)`, and lives for the entire process lifetime. Each command handler receives `pool: State<'_, SqlitePool>` and passes `pool.inner()` to db functions.

---

## File Storage

Imported EPUBs are copied to the Tauri `app_data_dir` by `util::copy_to_app_directory`. The absolute path of the copy is stored in `internal_book_path`. The original file is not modified. This ensures the library works correctly even if the user moves or deletes the original file, at the cost of additional disk usage.
