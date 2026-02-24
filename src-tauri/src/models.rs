use uuid;
// 
pub const PAGINATE_CHAR: usize=1_000_000;

// each book will have 1 vagaread record
pub struct vagaread{
    pub vagaread_id: uuid::Uuid,
    pub internal_fp: String,
    pub meta_data: String, 
    pub current_read_idx: usize, 
    pub current_spine:usize,
}
