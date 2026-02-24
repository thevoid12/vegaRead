pub const CREATE_VB_RECORD: &str =
    "INSERT INTO vagaread (id, internal_book_path, meta_data, current_read_idx, current_spine) \
     VALUES (?, ?, ?, ?, ?)";