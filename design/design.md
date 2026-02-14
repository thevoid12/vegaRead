# vaga read:
- this document contains my design ideas and feature list which I aim to build for me to reference while building the app

# flow:
- user uploads a ebook
- we open the epub page wise
- we can set speed and it will start reading word by word like a book where only that letter is bold and others are in grey
- we can pause at anytime
- if we exit we should be able to continue from wherever we stopped
- we can have a catelog of books that are being imported before. we can pick from that whenever we want
- a timer of 5,4,3,2,1 and it starts word by word (configurable in settings)

# my design
┌─────────────────────────────────────┐
│  File System                        │
│  ~/.speedreader/books/              │
│    └── {book_id}.epub               │
└─────────────────────────────────────┘
                  ↑
                  │ read on-demand
                  │
┌─────────────────────────────────────┐
│  SQLite (metadata only)             │
│  - books: id, title, author, path   │
│  - progress: chunk_index, word_idx  │
└─────────────────────────────────────┘
                  ↑
                  │
┌─────────────────────────────────────┐
│  Rust Backend                       │
│  get_words_for_reading()            │
│    → parse EPUB every time          │
│    → return 500 words               │
└─────────────────────────────────────┘
                  ↑
                  │
┌─────────────────────────────────────┐
│  Frontend (React state)             │
│  - Keep 3 chunks in memory          │
│  - Prefetch next chunk              │
│  - Display word-by-word             │
└─────────────────────────────────────┘