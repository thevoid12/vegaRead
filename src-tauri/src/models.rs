use uuid;
// 
pub const PAGINATE_CHAR: usize=1_000_000;

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