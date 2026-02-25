pub const CREATE_VB_RECORD: &str =
    "INSERT INTO vagaread (id, internal_book_path, meta_data, current_read_idx, current_spine, created_on, updated_on, is_deleted) \
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)";

pub const UPDATE_VB_RECORD: &str =
    "UPDATE vagaread SET current_read_idx = ?, current_spine = ?, updated_on = datetime('now') WHERE id = ?";

pub const LIST_ALL_RECORD: &str =
"SELECT * FROM vagaread where is_deleted=false";