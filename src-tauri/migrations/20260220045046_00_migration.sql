-- Add migration script here
CREATE TABLE vagaread(
    id TEXT NOT NULL,
    book_path TEXT NOT NULL,
    meta_data JSON NOT NULL    
)

CREATE TABLE reading(
    id TEXT NOT NULL,
    vagaread_id TEXT NOT NULL,  -- foreign key
    current_read_idx TEXT NOT NULL -- read index is the stop point from which we will continue all the time 
)

