# vagaread Frontend Documentation

## Overview

The frontend is a React 19 + TypeScript application built with Vite 7 and styled with Tailwind CSS v3. It communicates with the Tauri 2 Rust backend exclusively through the `invoke` IPC mechanism, wrapped in a typed API layer. All frontend assets are embedded into the Rust binary at compile time.

---

## Technology Stack

- **React 19** with hooks (useState, useEffect, useCallback, useRef)
- **TypeScript** for static type safety across all components and API calls
- **Tailwind CSS v3** with a custom Adwaita light-theme color palette
- **Vite 7** — dev server and bundler (ESNext target in production)
- **@tauri-apps/api** — IPC, window events, app lifecycle
- **@tauri-apps/plugin-dialog** — native OS file picker

---

## Directory Structure

```
src/
  api/
    tauri.ts           — all invoke() calls, single source of truth for IPC
  components/
    common/
      BookCover.tsx    — cover image or deterministic gradient placeholder
    layout/
      AppShell.tsx     — header bar with logo and Import Book button
    library/
      BookCard.tsx     — individual book card in the grid
      EmptyLibrary.tsx — empty state with import CTA
      LibraryPage.tsx  — responsive grid of BookCards
    reader/
      BookContent.tsx  — iframe renderer with CSS column pagination and SR word tokenisation
      ReadingTopbar.tsx — back, title, zoom, SR entry (crosshair toggle)
      ReadingView.tsx  — reader state orchestrator
      SpineList.tsx    — left chapter sidebar
    ui/
      ErrorToast.tsx   — auto-dismissing error popup
      ImportModal.tsx  — drag-drop / browse import modal
  types/
    index.ts           — all shared TypeScript interfaces mirroring Rust structs
  App.tsx              — root component, owns activeBook navigation state
  main.tsx             — entry point
  index.css            — Tailwind directives, animations, scrollbar utilities
```

---

## Types (src/types/index.ts)

### BookMetadata

Mirrors `HashMap<String, Vec<String>>` from the Rust backend. Each key is a raw EPUB metadata property name; each value is an array of strings.

### Book

Mirrors the Rust `Vagaread` struct. One record per imported book.

Fields: `vagaread_id`, `internal_fp`, `meta_data` (BookMetadata), `current_read_idx`, `current_spine`, `current_page`, `sr_word_idx`, `sr_mode`, `is_deleted`.

### SpineItem

Mirrors `SpineItemResponse`. One item from the EPUB spine.

Fields: `idref`, `href` (nullable), `title` (nullable, from NCX/NAV TOC), `id` (nullable), `properties` (nullable), `linear`.

### ContentResponse

Mirrors the Rust `ContentResponse`.

Fields: `content` (raw EPUB HTML), `spine_idx`, `next_char_offset`, `page_size` (always 10,000), `current_page`.

### BookResponse

Wraps `ContentResponse` with `vagaread_id`. Returned by `getBookContent`.

### AppSettings

Global reader settings. Fields: `wpm`, `font_size`, `focus_font_size`, `inline_highlight_color`, `focus_word_color`, `focus_background_mode`.

---

## API Layer (src/api/tauri.ts)

All backend calls are centralised here. No component calls `invoke` directly.

| Function | Command | Description |
|---|---|---|
| `fetchAllBooks()` | `show_home_page_handler` | Load the library on app start |
| `uploadFile(filePath)` | `upload_file_handler` | Import an EPUB |
| `getBookContent(fileId, spineIdx, charOffset)` | `get_ebook_content_handler` | Fetch a content chunk |
| `listSpine(fileId)` | `list_spine_handler` | Fetch all spine items |
| `getCoverImage(fileId)` | `get_cover_image_handler` | Fetch cover as base64 data URI |
| `saveReadingProgress(fileId, spineIdx, charOffset, currentPage)` | `save_reading_progress_handler` | Persist visual page position |
| `saveSrPosition(fileId, spineIdx, charOffset, currentPage, wordIdx, mode)` | `save_sr_position_handler` | Persist SR word pointer |
| `getSettings()` | `get_settings_handler` | Load global settings |
| `saveSettings(settings)` | `save_settings_handler` | Persist global settings |

---

## Navigation Model

A single `activeBook: Book | null` state in `App.tsx` controls the top-level view. No router is used.

- `null` → library (AppShell + LibraryPage)
- non-null → full-page reader (ReadingView)

Clicking a book card calls `setActiveBook(book)`. The back button in the reader awaits `saveReadingProgress` then calls `setActiveBook(null)`.

### Window Close Handling

`App.tsx` registers a Tauri `onCloseRequested` listener that `preventDefault()`s the close event, awaits `saveReadingProgress` (if a book is open), then calls `getCurrentWindow().close()`. This prevents progress loss on abrupt close.

---

## Reader Components

### ReadingView

State: `spineItems`, `currentSpineIdx`, `charOffset`, `htmlContent`, `isLoadingContent`, `isLoadingSpine`, `fontSize`, `currentPage`, `srState`, `ctxMenu`.

Two effects:
1. On mount: calls `listSpine` to populate the sidebar
2. When `currentSpineIdx` or `charOffset` changes: calls `getBookContent`, stores the HTML, and restores the saved visual page

Progress is saved via a debounced `saveReadingProgress` call (500 ms) triggered on page navigation. On back and close it is awaited directly.

### ReadingTopbar

Contains back button, book title, font size controls, and the SR entry toggle (crosshair cursor mode). The crosshair toggle is only visible in the idle SR state. Activating it injects a `<style id="sr-entry-cursor">` into the iframe body to change the cursor. Deactivating it removes the style element.

### BookContent

Renders EPUB HTML inside an isolated iframe via `srcDoc`. Injects reading CSS (Georgia serif, line height, margins) and handles pagination and SR.

**Two-page spread mode (container >= 600 px)**

Uses CSS multi-column (`column-count: 2`) on the iframe body. Columns flow to the right; the html element clips with `overflow: hidden`. Pages advance by translating `body.style.transform`.

Zero-drift invariant: `column-gap` must equal `2 * horizontal-padding` in the same unit. With `padding: 0 2rem` and `column-gap: 4rem`, each page advance equals exactly the viewport width regardless of zoom level.

Page measurement: `totalPages = Math.ceil(body.scrollWidth / viewWidth)`. `viewWidth` is captured in a ref at measurement time and reused for navigation to avoid drift from minor reflows. Two nested `requestAnimationFrame` calls wait for style injection and column layout reflow.

Page transitions use a crossfade (opacity 0 → translate → opacity 1) so both columns flip as a unit.

**Single-page scroll mode (container < 600 px)**

No CSS columns. Body scrolls vertically. `totalPages` is always 1; navigation is chapter-level only.

**Shared behaviour**

A `ResizeObserver` on the container calls `refresh()` on size changes, which re-evaluates `isTwoPage`, re-injects CSS, and recomputes `totalPages`. Crossing the 600 px threshold resets to page 0.

When the `html` prop changes (new chapter), a `useEffect` resets page state. The iframe remounts via `key={html}`.

**SR word tokenisation**

When SR entry cursor mode is active, `handleIframeLoad` tokenises all text nodes in the iframe into `<span data-wi="N">` word spans and attaches a click listener. Clicking a word calls `onSrEntryWordClick(wordIdx)` with the word's index.

`onSrEntryWordClick` shows the inline/focus picker menu (`ctxMenu`) positioned at the clicked word's bounding rect (as a `position: fixed` div updated via a direct DOM ref — no re-renders). The menu is rendered in `ReadingView`.

### SpineList

Displays the EPUB spine as a scrollable sidebar. `formatLabel` resolves the best display label per item in priority order:

1. `title` from the NCX/NAV TOC (exact chapter name)
2. `href` basename — strips directory prefix, extension, EPUB suffix/prefix patterns, replaces separators, capitalises
3. `idref` — raw manifest ID, used as last resort

Clicking an item calls `onSelect(idx)`, which sets `currentSpineIdx` to the clicked index and resets `charOffset` to 0.

---

## Design System

Custom Tailwind color tokens in `tailwind.config.js` (Adwaita light palette):

| Token | Value | Usage |
|---|---|---|
| `app-bg` | #f6f5f4 | Window / page background |
| `app-surface` | #ffffff | Header bar, modals |
| `app-card` | #ffffff | Book cards |
| `app-hover` | #f0eeec | Hover state backgrounds |
| `app-border` | #deddda | Borders and dividers |
| `fg-primary` | #1c1c1c | Primary text |
| `fg-secondary` | #5c5c5c | Secondary text |
| `fg-muted` | #9a9a9a | Placeholder / label text |
| `accent` | #3584e4 | Adwaita blue, CTAs, active states |
| `accent-hover` | #2269c4 | Darker accent on hover |
| `accent-muted` | rgba(53,132,228,0.12) | Selected state tint |

---

## CSS Animations

Defined in `src/index.css`:

- **toast-in** — slides ErrorToast down from above with fade-in
- **modal-in** — scales ImportModal from 96% with fade-in

Both are applied via inline style on mount so they always replay on first render rather than depending on class toggle timing.
