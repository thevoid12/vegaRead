
CREATE TABLE IF NOT EXISTS vagaread(
    id TEXT NOT NULL,
    internal_book_path TEXT NOT NULL,
    meta_data JSON NOT NULL,
    current_read_idx TEXT NOT NULL, -- read index is the stop point from which we will continue all the time
    current_spine TEXT NOT NULL,
    current_page TEXT NOT NULL DEFAULT '0', -- visual page within the current chunk (frontend CSS column page)
    created_on TIMESTAMP NOT NULL,
    updated_on TIMESTAMP NOT NULL,
    is_deleted BOOL NOT NULL
);
