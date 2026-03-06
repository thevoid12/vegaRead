use uuid;

use crate::errors::{ApplicationError, codes::VALIDATION_ERROR};
pub const PAGINATE_CHAR: usize = 10_000;

// ── Newtype validators ───────────────────────────────────────────────────────

pub struct FilePath(String);

impl FilePath {
    pub fn parse(v: String) -> Result<Self, ApplicationError> {
        if v.is_empty() {
            return Err(ApplicationError { code: VALIDATION_ERROR, message: Some("file_path must not be empty".to_string()) });
        }
        if !v.to_lowercase().ends_with(".epub") {
            return Err(ApplicationError { code: VALIDATION_ERROR, message: Some("file_path must point to an .epub file".to_string()) });
        }
        Ok(Self(v))
    }
    pub fn get(&self) -> &str {
        &self.0
    }
}

pub struct SpineIndex(usize);

impl SpineIndex {
    pub fn parse(v: usize) -> Result<Self, ApplicationError> {
        if v > 10_000 {
            return Err(ApplicationError { code: VALIDATION_ERROR, message: Some(format!("spine_idx {v} out of range (max 10000)")) });
        }
        Ok(Self(v))
    }
    pub fn get(&self) -> usize {
        self.0
    }
}

pub struct CharOffset(usize);

impl CharOffset {
    pub fn parse(v: usize) -> Result<Self, ApplicationError> {
        if v > 5_000_000 {
            return Err(ApplicationError { code: VALIDATION_ERROR, message: Some(format!("char_offset {v} out of range (max 5000000)")) });
        }
        Ok(Self(v))
    }
    pub fn get(&self) -> usize {
        self.0
    }
}

pub struct CurrentPage(usize);

impl CurrentPage {
    pub fn parse(v: usize) -> Result<Self, ApplicationError> {
        if v > 100_000 {
            return Err(ApplicationError { code: VALIDATION_ERROR, message: Some(format!("current_page {v} out of range (max 100000)")) });
        }
        Ok(Self(v))
    }
    pub fn get(&self) -> usize {
        self.0
    }
}

pub struct WordIdx(usize);

impl WordIdx {
    pub fn parse(v: usize) -> Result<Self, ApplicationError> {
        Ok(Self(v))
    }
    pub fn get(&self) -> usize {
        self.0
    }
}

pub struct SrMode(String);

impl SrMode {
    pub fn parse(v: String) -> Result<Self, ApplicationError> {
        if v != "inline" && v != "focus" {
            return Err(ApplicationError { code: VALIDATION_ERROR, message: Some(format!("unknown SR mode '{v}' (expected inline or focus)")) });
        }
        Ok(Self(v))
    }
    pub fn get(&self) -> &str {
        &self.0
    }
}

// ── Raw request structs (Tauri deserialization targets) ──────────────────────

#[derive(serde::Deserialize)]
pub struct UploadFileRequestRaw {
    pub file_path: String,
}

#[derive(serde::Deserialize)]
pub struct GetEbookContentRequestRaw {
    pub file_id: uuid::Uuid,
    pub spine_idx: usize,
    pub char_offset: usize,
}

#[derive(serde::Deserialize)]
pub struct ListSpineRequestRaw {
    pub file_id: uuid::Uuid,
}

#[derive(serde::Deserialize)]
pub struct GetCoverImageRequestRaw {
    pub file_id: uuid::Uuid,
}

#[derive(serde::Deserialize)]
pub struct SaveReadingProgressRequestRaw {
    pub file_id: uuid::Uuid,
    pub spine_idx: usize,
    pub char_offset: usize,
    pub current_page: usize,
}

#[derive(serde::Deserialize)]
pub struct SaveSrPositionRequestRaw {
    pub file_id: uuid::Uuid,
    pub spine_idx: usize,
    pub char_offset: usize,
    pub current_page: usize,
    pub word_idx: usize,
    pub mode: String,
}

// ── Validated request structs ────────────────────────────────────────────────

pub struct UploadFileRequest {
    file_path: FilePath,
}

impl UploadFileRequest {
    pub fn validate(raw: UploadFileRequestRaw) -> Result<Self, ApplicationError> {
        Ok(Self { file_path: FilePath::parse(raw.file_path)? })
    }
    pub fn file_path(&self) -> &str {
        self.file_path.get()
    }
}

pub struct GetEbookContentRequest {
    file_id: uuid::Uuid,
    spine_idx: SpineIndex,
    char_offset: CharOffset,
}

impl GetEbookContentRequest {
    pub fn validate(raw: GetEbookContentRequestRaw) -> Result<Self, ApplicationError> {
        Ok(Self {
            file_id: raw.file_id,
            spine_idx: SpineIndex::parse(raw.spine_idx)?,
            char_offset: CharOffset::parse(raw.char_offset)?,
        })
    }
    pub fn file_id(&self) -> uuid::Uuid { self.file_id }
    pub fn spine_idx(&self) -> usize { self.spine_idx.get() }
    pub fn char_offset(&self) -> usize { self.char_offset.get() }
}

pub struct ListSpineRequest {
    file_id: uuid::Uuid,
}

impl ListSpineRequest {
    pub fn validate(raw: ListSpineRequestRaw) -> Result<Self, ApplicationError> {
        Ok(Self { file_id: raw.file_id })
    }
    pub fn file_id(&self) -> uuid::Uuid { self.file_id }
}

pub struct GetCoverImageRequest {
    file_id: uuid::Uuid,
}

impl GetCoverImageRequest {
    pub fn validate(raw: GetCoverImageRequestRaw) -> Result<Self, ApplicationError> {
        Ok(Self { file_id: raw.file_id })
    }
    pub fn file_id(&self) -> uuid::Uuid { self.file_id }
}

pub struct SaveReadingProgressRequest {
    file_id: uuid::Uuid,
    spine_idx: SpineIndex,
    char_offset: CharOffset,
    current_page: CurrentPage,
}

impl SaveReadingProgressRequest {
    pub fn validate(raw: SaveReadingProgressRequestRaw) -> Result<Self, ApplicationError> {
        Ok(Self {
            file_id: raw.file_id,
            spine_idx: SpineIndex::parse(raw.spine_idx)?,
            char_offset: CharOffset::parse(raw.char_offset)?,
            current_page: CurrentPage::parse(raw.current_page)?,
        })
    }
    pub fn file_id(&self) -> uuid::Uuid { self.file_id }
    pub fn spine_idx(&self) -> usize { self.spine_idx.get() }
    pub fn char_offset(&self) -> usize { self.char_offset.get() }
    pub fn current_page(&self) -> usize { self.current_page.get() }
}

pub struct SaveSrPositionRequest {
    file_id: uuid::Uuid,
    spine_idx: SpineIndex,
    char_offset: CharOffset,
    current_page: CurrentPage,
    word_idx: WordIdx,
    mode: SrMode,
}

impl SaveSrPositionRequest {
    pub fn validate(raw: SaveSrPositionRequestRaw) -> Result<Self, ApplicationError> {
        Ok(Self {
            file_id: raw.file_id,
            spine_idx: SpineIndex::parse(raw.spine_idx)?,
            char_offset: CharOffset::parse(raw.char_offset)?,
            current_page: CurrentPage::parse(raw.current_page)?,
            word_idx: WordIdx::parse(raw.word_idx)?,
            mode: SrMode::parse(raw.mode)?,
        })
    }
    pub fn file_id(&self) -> uuid::Uuid { self.file_id }
    pub fn spine_idx(&self) -> usize { self.spine_idx.get() }
    pub fn char_offset(&self) -> usize { self.char_offset.get() }
    pub fn current_page(&self) -> usize { self.current_page.get() }
    pub fn word_idx(&self) -> usize { self.word_idx.get() }
    pub fn mode(&self) -> &str { self.mode.get() }
}

// ── End request structs ──────────────────────────────────────────────────────

// each book will have 1 vagaread recor
#[derive(serde::Serialize)]
pub struct vagaread{
    pub vagaread_id: uuid::Uuid,
    pub internal_fp: String,
    pub meta_data: serde_json::Value,
    pub current_read_idx: usize,
    pub current_spine: usize,
    pub current_page: usize,
    pub sr_word_idx: usize,  // parsed from speed_read_pointer
    pub sr_mode: String,     // parsed from speed_read_pointer
    pub is_deleted: bool,
}

pub struct update_vr{
    pub vagaread_id: String, // primary key
    pub current_read_idx: usize,
    pub current_spine: usize,
    pub current_page: usize,
}

#[derive(serde::Serialize)]
pub struct Content_response {
    pub content: String,
    pub spine_idx: usize,
    pub next_char_offset: usize,  // pass this back on the next call to continue reading
    pub page_size: usize,         // always Self::PAGE_SIZE — tells the frontend how far to step back on Prev
    pub current_page: usize,      // visual page to restore to (0 when navigating, saved value when restoring)
}

impl Content_response {
    pub const PAGE_SIZE: usize = PAGINATE_CHAR;
}

#[derive(serde::Serialize)]
pub struct book_response{
    pub vagaread_id: uuid::Uuid,
    pub content: Content_response,
}

#[derive(serde::Serialize)]
pub struct Spine_item_response {
    pub idref: String,
    /// Actual file path within the EPUB (e.g. "OEBPS/Text/chapter01.xhtml"),
    /// resolved from the EPUB manifest resources map by idref.
    pub href: Option<String>,
    /// Human-readable chapter title sourced from the EPUB NCX / NAV table of contents.
    /// None when the TOC has no entry whose content path matches this spine item's href.
    pub title: Option<String>,
    pub id: Option<String>,
    pub properties: Option<String>,
    pub linear: bool,
}
