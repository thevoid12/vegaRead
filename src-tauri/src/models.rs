use uuid;
// 
pub const PAGINATE_CHAR: usize = 10_000;

// each book will have 1 vagaread recor
#[derive(serde::Serialize)]
pub struct vagaread{
    pub vagaread_id: uuid::Uuid,
    pub internal_fp: String,
    pub meta_data: serde_json::Value,
    pub current_read_idx: usize,
    pub current_spine: usize,
    pub is_deleted: bool,
}

pub struct update_vr{
    pub vagaread_id: String, // primary key
    pub current_read_idx: usize,
    pub current_spine: usize,
}

#[derive(serde::Serialize)]
pub struct Content_response {
    pub content: String,
    pub spine_idx: usize,
    pub next_char_offset: usize,  // pass this back on the next call to continue reading
    pub page_size: usize,         // always Self::PAGE_SIZE — tells the frontend how far to step back on Prev
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

