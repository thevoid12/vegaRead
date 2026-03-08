pub const CREATE_VB_RECORD: &str =
    "INSERT INTO vagaread (id, internal_book_path, meta_data, current_read_idx, current_spine, current_page, speed_read_pointer, created_on, updated_on, is_deleted) \
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)";

pub const UPDATE_VB_RECORD: &str =
    "UPDATE vagaread SET current_read_idx = ?, current_spine = ?, current_page = ?, updated_on = datetime('now') WHERE id = ?";

pub const UPDATE_SR_POSITION: &str =
    "UPDATE vagaread SET speed_read_pointer = ?, updated_on = datetime('now') WHERE id = ?";

pub const LIST_ALL_RECORD: &str = "SELECT * FROM vagaread where is_deleted=false";

pub const GET_VB_RECORD_BY_ID: &str = "SELECT * FROM vagaread where id=? AND is_deleted=false";

pub const GET_SETTINGS: &str = "SELECT settings_json FROM vagaread WHERE id = 'app_settings'";

pub const UPDATE_SETTINGS: &str =
    "UPDATE vagaread SET settings_json = ?, updated_on = datetime('now') WHERE id = 'app_settings'";
