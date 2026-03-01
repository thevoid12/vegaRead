# vegaRead Frontend Documentation

## Overview

The frontend is a React 19 + TypeScript application built with Vite 7 and styled with Tailwind CSS v3. It communicates with the Tauri 2 Rust backend exclusively through the **invoke** IPC mechanism wrapped in a typed API layer.

---

## Technology Stack

- **React 19** with hooks (useState, useEffect, useCallback, useRef)
- **TypeScript** for static type safety across all components and API calls
- **Tailwind CSS v3** with a custom Foliate light-theme color palette
- **Vite 7** as the dev server and bundler
- **@tauri-apps/api** for IPC and window event bindings
- **@tauri-apps/plugin-dialog** for the native file picker

---

## Directory Structure

```
src/
  api/
    tauri.ts           — all invoke() calls, single source of truth for backend communication
  components/
    common/
      BookCover.tsx    — renders a cover image or a deterministic gradient placeholder
    layout/
      AppShell.tsx     — app header bar with logo and Import Book button
    library/
      BookCard.tsx     — individual book card in the grid
      EmptyLibrary.tsx — empty state with CTA
      LibraryPage.tsx  — responsive grid of BookCards
    reader/
      BookContent.tsx  — two-page iframe renderer with CSS column pagination
      ReadingTopbar.tsx — top bar with back, title, zoom, Start stub
      ReadingView.tsx  — reader state orchestrator (spine, content, font size)
      SpineList.tsx    — left chapter sidebar
    ui/
      ErrorToast.tsx   — auto-dismissing red error popup
      ImportModal.tsx  — drag-drop / browse file import modal
  types/
    index.ts           — all shared TypeScript interfaces mirroring Rust structs
  App.tsx              — root component, owns global navigation state
  main.tsx             — entry point, imports index.css
  index.css            — Tailwind directives, keyframe animations, scrollbar utilities
```

---

## Types (src/types/index.ts)

### BookMetadata

Mirrors the Rust **HashMap<String, Vec<String>>** extracted from EPUB metadata. Each key is a raw EPUB property name; each value is a list of strings.

Fields: title, creator, publisher, language, description, subject, date, identifier, rights, and any additional EPUB extension properties via the index signature.

### Book

Mirrors the Rust **vagaread** struct. Represents one book record from the database.

Fields: vagaread_id (UUID string), internal_fp (path in app data directory), meta_data (BookMetadata), current_read_idx (char offset), current_spine (spine index), is_deleted.

### SpineItem

Mirrors **SpineItemResponse**. One item from the EPUB spine (ordered chapter list).

Fields: idref, id (nullable), properties (nullable), linear.

### ContentResponse

Mirrors **Content_response**. The raw content chunk returned by the backend for one chapter read.

Fields:
- **content** — the EPUB chapter HTML as a string
- **spine_idx** — the spine index to pass on the next call (may have advanced past the current chapter if it fit within the chunk limit)
- **next_char_offset** — the character offset within spine_idx for the next call (0 when the chapter was fully read)

### BookResponse

Mirrors **book_response**. Wraps a ContentResponse together with the book's UUID.

Fields: vagaread_id, content (ContentResponse).

---

## API Layer (src/api/tauri.ts)

All calls to the Tauri backend are centralised here. No component calls **invoke** directly.

### fetchAllBooks

Returns **Book[]**. Maps to `show_home_page_handler`. Called on app start and after every import.

### uploadFile(filePath)

Returns **ContentResponse**. Maps to `upload_file_handler`. Imports the EPUB at the given absolute path into the app data directory, extracts metadata, stores a database record, and returns the first chunk of content.

### getBookContent(fileId, spineIdx, charOffset)

Returns **BookResponse**. Maps to `get_ebook_content_handler`. Fetches the HTML for one chapter (or chunk if the chapter exceeds PAGINATE_CHAR). The HTML is at **res.content.content**.

### listSpine(fileId)

Returns **SpineItem[]**. Maps to `list_spine_handler`. Fetches the ordered spine for a book so the sidebar can be populated.

---

## Navigation Model

Navigation is handled by a single **activeBook: Book | null** state in **App.tsx**.

- **null** → library view (AppShell + LibraryPage)
- **non-null** → full-page reading view (ReadingView)

No router is used. Clicking a book card calls **setActiveBook(book)**. Clicking the back button calls **setActiveBook(null)**.

---

## Reader Components

### ReadingView

Owns all reader state: spineItems, currentSpineIdx, charOffset, htmlContent, isLoadingContent, isLoadingSpine, fontSize.

Two effects:
1. On mount: calls **listSpine** to populate the sidebar.
2. When currentSpineIdx or charOffset changes: calls **getBookContent** and stores **res.content.content** as htmlContent.

Navigation handlers:
- **handleSpineSelect(idx)** — sets currentSpineIdx to the clicked index and resets charOffset to 0, causing the content effect to fire.
- **handleNext** — increments currentSpineIdx by 1, resets charOffset. Called by BookContent when the last page of the current chapter is passed.
- **handlePrev** — decrements currentSpineIdx by 1, resets charOffset.

### BookContent

Renders the EPUB HTML inside an isolated **iframe**. Automatically switches between two layout modes based on the container's pixel width.

**TWO_PAGE_MIN_WIDTH = 600 px** — threshold constant. Above: two-page spread. Below: single-page scroll.

---

**Two-page spread mode (container ≥ 600 px)**

Uses CSS multi-column (column-count: 2) on the body element. Columns flow freely to the right; the html element clips the visible area with overflow:hidden. Successive column pairs are revealed by translating body.style.transform.

Zero-drift invariant: column-gap must equal exactly 2 times the horizontal padding in the same unit (rem). With padding-left = padding-right = 2rem and column-gap = 4rem:

    pair_advance = 2 * (col_width + 4rem)
                 = content_width + gap
                 = (viewport_width - 4rem) + 4rem
                 = viewport_width

The pair_advance equals the viewport width for any viewport width and any rem resolution. The invariant also holds for column-count: 1 with the same padding and gap values.

CSS applied inside the iframe:
- **html**: height 100%, overflow hidden (clips the viewport)
- **body**: height 100% !important, overflow visible !important, column-count 2, column-gap 4rem, padding 2.5rem 2rem

The overflow: visible !important is critical. EPUB stylesheets frequently set body overflow: hidden, which clips body.scrollWidth to equal body.clientWidth and gives totalPages = 1, breaking in-chapter pagination entirely.

Page measurement:
- Total pages = Math.ceil(body.scrollWidth / viewWidth)
- viewWidth is captured in viewWidthRef at measurement time and reused in goToPage to avoid drift from minor reflows
- Two nested requestAnimationFrames wait for style injection and column layout reflow to complete

Page navigation uses a crossfade (opacity 0 → reposition → opacity 1) so both columns switch as a single unit rather than sliding past the viewport edge independently. cancelAnimationFrame prevents stale fade-ins from stacking on rapid navigation.

---

**Single-page scroll mode (container < 600 px)**

No CSS columns. The body scrolls vertically within the iframe (overflow-y: auto). The user scrolls through chapter content with mouse wheel or touch. totalPages is always 1; navigation is chapter-level only (no in-chapter page buttons).

CSS applied inside the iframe:
- **html**: height 100%, overflow hidden
- **body**: height auto !important, overflow-y auto !important, overflow-x hidden !important, padding 1.5rem 1.25rem

---

**Shared behaviour**

A ResizeObserver on the container div calls refresh() whenever the reading area changes size. refresh() reads the container's current clientWidth to determine isTwoPage, injects the appropriate CSS, and recomputes totalPages. Switching between modes (resize crossing 600 px) resets to page 0 and clears any leftover body transform.

When the html prop changes (new chapter or new chunk), a useEffect immediately resets currentPage and totalPages. The iframe remounts via key={html} and handleIframeLoad recomputes the layout once the new content has loaded.

Navigation button labels:
- Prev Page (when on page > 0) / Prev Chapter (when on page 0)
- Next Page (when not on last page) / Next Chapter (when on last page)
- The pg X/Y counter is hidden when totalPages = 1 (single-page scroll mode)

### SpineList

Displays the EPUB spine in a left sidebar. The **formatLabel** function resolves the best available display label for each spine item using priority order:

1. **title** — from the EPUB NCX / NAV table of contents (exact chapter name, e.g. "Chapter 3: The Journey"). Used when available.
2. **href** filename — the actual file path inside the EPUB archive (e.g. OEBPS/Text/chapter03.xhtml is more descriptive than the manifest ID "idx").
3. **idref** — the raw manifest item ID, used only as a last resort.

For option 2 and 3, the filename is cleaned:
- Take the final path segment (strip directory prefix)
- Strip file extension (.xhtml, .html, .xml)
- Strip trailing EPUB suffix patterns such as _xhtml, _html, _xml
- Strip leading EPUB prefix patterns such as x_, xhtml_, html_
- Replace underscores and hyphens with spaces, capitalize each word

Clicking any item calls **onSelect(idx)** which maps to **handleSpineSelect** in ReadingView, jumping directly to the start of that chapter (spine_idx = clicked, char_offset = 0).

---

## Design System

Custom Tailwind color tokens defined in **tailwind.config.js** (Foliate light theme):

- **app-bg** #f6f5f4 — page background
- **app-surface** #ffffff — cards, modals, topbars
- **app-card** #ffffff — book cards
- **app-hover** #f0eeec — hover state backgrounds
- **app-border** #deddda — borders and dividers
- **fg-primary** #1c1c1c — primary text
- **fg-secondary** #5c5c5c — secondary text
- **fg-muted** #9a9a9a — muted / label text
- **accent** #3584e4 — Adwaita blue, used for active states, links, CTA buttons
- **accent-hover** #2269c4 — darker accent for hover
- **accent-muted** rgba(53,132,228,0.12) — light accent tint for selected states

---

## CSS Animations

Defined in **src/index.css**:

- **toast-in** — slides the ErrorToast down from above and fades it in
- **modal-in** — scales the ImportModal in from 96% and fades it in

Both are applied via the style attribute on mount rather than a class toggle so they always replay when the element is first rendered.
