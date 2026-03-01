# vegaRead Backend Documentation

## Overview

The backend is a Tauri 2 Rust application. All business logic is in the **src-tauri/src/** directory. The frontend communicates with the backend exclusively through Tauri commands registered in **lib.rs**.

---

## Technology Stack

- **Tauri 2** for the desktop application shell and IPC
- **Rust** (async with tokio runtime)
- **sqlx** for async SQLite access
- **epub** crate for parsing EPUB files
- **uuid** crate for generating and handling UUIDs
- **serde / serde_json** for serialisation of all IPC return values
- **tauri-plugin-dialog** for the native file picker (called from the frontend)
- **tauri-plugin-opener** for opening files with the OS default application

---

## File Overview

```
src-tauri/src/
  lib.rs          — Tauri app builder, plugin registration, invoke_handler registration
  handlers.rs     — all #[tauri::command] functions and shared core logic
  models.rs       — Rust structs that serialise to JSON for the frontend
  epub_util.rs    — EPUB parsing: metadata, spine, paginated content
  db.rs           — SQLite queries (create, list, get by id, update)
  util.rs         — file system utilities (copy to app data directory)
  errors.rs       — ApplicationError type and error code constants
```

---

## Registered Tauri Commands

All commands are registered in **lib.rs** inside the **invoke_handler** macro. Each command corresponds to a public async function in **handlers.rs**.

### show_home_page_handler

**Frontend call:** fetchAllBooks()
**Returns:** Vec of vagaread structs (serialised as a JSON array)

Calls **db::list_all_vb_records** and returns all non-deleted book records. This is the first call made when the app opens.

### upload_file_handler

**Frontend call:** uploadFile(filePath)
**Parameters:** file_path: String
**Returns:** Content_response

Core steps (executed in **load_file_core**):
1. Copies the EPUB to the app data directory via **util::copy_to_app_directory**.
2. Extracts metadata via **epub_util::extract_epub_metadata** and parses it to serde_json::Value.
3. Creates a new **vagaread** record in the database via **db::create_record**.
4. Calls **epub_util::get_paginated_content** with spine_idx=0 and char_offset=0 to return the first chunk of content.

### get_ebook_content_handler

**Frontend call:** getBookContent(fileId, spineIdx, charOffset)
**Parameters:** file_id: uuid::Uuid, spine_idx: usize, char_offset: usize
**Returns:** book_response

Fetches the database record for the given file_id to get the internal file path, then calls **epub_util::get_paginated_content** to extract the HTML for the requested spine item starting at the given character offset.

### list_spine_handler

**Frontend call:** listSpine(fileId)
**Parameters:** file_id: uuid::Uuid
**Returns:** Vec of SpineItemResponse

Fetches the database record by ID to get the internal file path, then calls **epub_util::get_epub_spine** to extract the ordered spine from the EPUB.

---

## Models (models.rs)

### vagaread

One database record per imported book.

Fields:
- **vagaread_id** — uuid::Uuid, primary key
- **internal_fp** — String, absolute path to the EPUB inside the app data directory
- **meta_data** — serde_json::Value, the full EPUB metadata as a JSON object
- **current_read_idx** — usize, character offset within current_spine (reading progress)
- **current_spine** — usize, spine index of the last read position
- **is_deleted** — bool, soft-delete flag

### Content_response

Returned by **get_paginated_content** in epub_util.rs.

Fields:
- **content** — String, the EPUB chapter HTML for this chunk
- **spine_idx** — usize, the spine index to use on the next call (may advance past the current chapter if it fitted within PAGINATE_CHAR)
- **next_char_offset** — usize, the character offset within spine_idx to use on the next call

### book_response

Wraps Content_response with the book identity. Returned by **get_ebook_content_handler**.

Fields:
- **vagaread_id** — uuid::Uuid
- **content** — Content_response

The frontend accesses the HTML via **res.content.content**.

### SpineItemResponse

One item from the EPUB spine. Returned as a Vec by **list_spine_handler**.

Fields:
- **idref** — String, references the manifest item id
- **id** — Option<String>, the spine itemref id attribute (often absent)
- **properties** — Option<String>, EPUB properties (e.g. cover-image)
- **linear** — bool, whether this item is part of the linear reading order

### update_vr

Internal struct (not yet used in an active handler). Holds the fields needed to update reading progress for a record.

Fields: vagaread_id, current_read_idx, current_spine.

### Constants

**PAGINATE_CHAR** = 1_000_000 — the maximum number of characters returned in a single content chunk. At this size essentially all EPUB chapters fit in a single call.

---

## EPUB Utilities (epub_util.rs)

### extract_epub_metadata(fp)

Opens the EPUB file and iterates over **doc.metadata** (a Vec of MetadataItem). Groups values by property name into a **HashMap<String, Vec<String>>** and serialises it to a JSON string.

### get_epub_spine(fp)

Opens the EPUB file and maps **doc.spine** (a Vec of SpineItem from the epub crate) into a Vec of **SpineItemResponse**.

### get_paginated_content(fp, spine_idx, char_offset, chunk_size)

Opens the EPUB file, resolves the spine item at spine_idx to a manifest idref, then calls **doc.get_resource_str** to get the raw XHTML string for that chapter.

It then takes a slice of characters starting at char_offset of length chunk_size:
- If the remainder of the chapter fits within chunk_size, spine_idx is incremented and char_offset is reset to 0.
- Otherwise, char_offset is advanced by chunk_size and spine_idx stays the same.

Returns a **Content_response** with the HTML slice and the updated position.

---

## Error Handling

All handlers return **Result<T, ApplicationError>**. **ApplicationError** is a serialisable struct with fields **code** (a string constant from errors::codes) and **message** (Option<String>). Tauri serialises errors to JSON and delivers them as rejected promises on the frontend.

Error codes defined in **errors::codes**:
- **DATABASE_ERROR** — SQLite operation failed
- **EPUB_ERROR** — EPUB file could not be opened or parsed
- Additional codes as needed

---

## Plugin Registration (lib.rs)

```
.plugin(tauri_plugin_opener::init())
.plugin(tauri_plugin_dialog::init())
```

The dialog plugin enables the native file picker used in the Import modal on the frontend. The opener plugin is registered for future use (e.g. opening the app data folder in Finder / Files).

---

## Future Work

- Call **db::update_vb_record** (or a new handler) whenever the user advances to a new spine item or page, to persist reading progress.
- Extract EPUB cover images from the manifest and serve them to the frontend to replace the gradient placeholder.
- Implement the speed reader (RSVP word-by-word) handler.
