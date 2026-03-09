# vagaread

A lightweight EPUB speed reader built with RSVP (Rapid Serial Visual Presentation) technique. Words are presented one at a time at a configurable WPM, reducing subvocalization and training faster reading.

[Demo video](https://drive.google.com/file/d/1b43rOIUWBz2sDuOHy4m1x-WBNwqLpQnP/view?usp=sharing)

## Installation

Download the appropriate file from the [Releases](../../releases) tab:

| Platform | File | Notes |
|---|---|---|
| Linux | `.AppImage` | Portable, no install — `chmod +x` and run |
| Linux | `.deb` | Debian, Ubuntu, Mint — install via `dpkg -i` |
| Linux | `.rpm` | Fedora, RHEL, openSUSE — install via `rpm -i` |
| macOS | `.dmg` | Universal binary — runs on Intel and Apple Silicon |
| Windows | `.msi` or `.exe` | Standard installer |

**macOS note:** 
- The app is not notarized yet. On first open mac will give you a stupid malware error, 
- Try to open the app normally,it will be blocked
- Go to System Settings → Privacy & Security
Scroll down to the Security section
- You'll see a message like "[App] was blocked",click "Open Anyway"
- Enter your password if prompted
## Features

- EPUB library with cover images and reading progress persistence
- Chapter-by-chapter reading via spine navigation with a sidebar
- RSVP speed reader:configurable WPM, inline and focus display modes
- Word-level entry: click any word in the reader to start SR from that point
- Per-book reading position saved automatically (spine index, char offset, visual page)
- Global settings: WPM, font sizes, highlight color, focus background mode

## Architecture

vagaread is a [Tauri 2](https://tauri.app) desktop application. The frontend runs inside the OS native webview; the backend is a Rust process that handles all file I/O, EPUB parsing, and database access.

```
Frontend (React 19 + TypeScript + Vite)
    invoke() calls over IPC
Backend (Rust + Tokio + SQLite via sqlx)
    reads EPUB files, serves paginated content chunks
    embeds frontend assets at compile time (no HTTP server at runtime)
```

**Frontend** — React 19, TypeScript, Vite 7, Tailwind CSS v3. State is colocated — `App.tsx` holds `activeBook` which switches between the library view and the reader. No router. All Tauri calls are centralized in `src/api/tauri.ts`.

**Backend** — Async Rust with Tokio. EPUB parsing via the `epub` crate. Content is served in 10,000-character chunks (paginated by the backend, paged visually by CSS columns in the frontend iframe). SQLite stores one row per book with reading position and SR pointer.

**IPC commands:**

| Command | Description |
|---|---|
| `show_home_page_handler` | List all books in the library |
| `upload_file_handler` | Import an EPUB by file path |
| `get_ebook_content_handler` | Fetch a paginated content chunk |
| `list_spine_handler` | Get all spine items (chapters) |
| `get_cover_image_handler` | Extract cover as base64 data URI |
| `save_reading_progress_handler` | Persist spine + char offset + visual page |
| `save_sr_position_handler` | Persist SR word index and mode |
| `get_settings_handler` | Load global reader settings |
| `save_settings_handler` | Persist global reader settings |

**Database** — Single SQLite file in the Tauri app-data directory. One `vagaread` table stores book records and a sentinel row (`id = 'app_settings'`) for global settings.

## Development

**Prerequisites:** [Rust](https://rustup.rs), [Bun](https://bun.sh), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (WebKitGTK on Linux).

```bash
bun install
bun tauri dev
```

**Common commands:**

```bash
make              # fmt-check + clippy + cargo check
make dev          # run dev server
make lint-fix     # auto-fix clippy warnings
make fmt          # format Rust code
make audit        # cargo security audit
make local-release  # build release bundle for the current platform
make release v=1.0.0  # tag and push — triggers GitHub Actions release
```

Local release output: `src-tauri/target/release/bundle/`

## Release

Pushing a version tag triggers a GitHub Actions workflow that builds on native runners for each platform in parallel and creates a draft GitHub Release with all artifacts attached.

```bash
make release v=1.0.0
```

Review and publish the draft at the Releases page once all three CI jobs pass.
