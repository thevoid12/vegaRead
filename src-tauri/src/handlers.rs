// this file will have all the core logic which we reciven
// for our frontend

use crate::models::Content_response;
use crate::util;
use crate::errors::ApplicationError;
use crate::epub_util;
use crate::models;
use uuid::Uuid;
use crate::db;
use sqlx::SqlitePool;
use tauri::{Manager, State};

// this will be the first screen that user sees when he opens
// vaga read
#[tauri::command]
pub async fn show_home_page_handler(app: tauri::AppHandle, pool: State<'_, SqlitePool>) -> Result<Vec<models::vagaread>, ApplicationError> {
        if let Ok(path) = app.path().app_data_dir() {
            println!("app data dir: {:?}", path);
        }

        list_all_books(pool.inner()).await.map_err(|e|{
               println!("the error is err {:?}", e);
        e
        })
}

// this handler is called when user uploads a file
#[tauri::command]
pub async fn upload_file_handler(app: tauri::AppHandle, file_path: String, pool: State<'_, SqlitePool>) -> Result<Content_response, ApplicationError> {
    // TODO: backend sanitization and validation needs to be learnt and done
    load_file_core(&app, &file_path, pool.inner()).await
}

#[tauri::command]
pub async fn get_ebook_content_handler(_app: tauri::AppHandle, file_id: uuid::Uuid,spine_idx: usize,char_offset: usize, pool: State<'_, SqlitePool>) -> Result<models::book_response, ApplicationError> {
    // TODO: backend sanitization and validation needs to be learnt and done
    get_ebook_content_paginated(pool.inner(),file_id,spine_idx,char_offset).await
}

#[tauri::command]
pub async fn list_spine_handler(file_id: uuid::Uuid, pool: State<'_, SqlitePool>) -> Result<Vec<models::Spine_item_response>, ApplicationError> {
        let record = db::get_vb_record_by_id(pool.inner(), file_id.to_string()).await?; // TODO: lets me think and find a way to find a way to just fetch once and use it all the time store it in tauri storage hashmap where key is file id
        epub_util::get_epub_spine(&record.internal_fp)
}

/// Returns the cover image as a data URI ("data:image/jpeg;base64,..."), or null if none.
#[tauri::command]
pub async fn get_cover_image_handler(file_id: uuid::Uuid, pool: State<'_, SqlitePool>) -> Result<Option<String>, ApplicationError> {
    let record = db::get_vb_record_by_id(pool.inner(), file_id.to_string()).await?;
    epub_util::extract_cover_as_data_uri(&record.internal_fp)
}

/// Saves reading progress for within-chunk page turns (spine_idx + char_offset + visual page).
/// Called by the frontend whenever the user turns a page within the same content chunk.
#[tauri::command]
pub async fn save_reading_progress_handler(
    file_id: uuid::Uuid,
    spine_idx: usize,
    char_offset: usize,
    current_page: usize,
    pool: State<'_, SqlitePool>,
) -> Result<(), ApplicationError> {
    let record = db::get_vb_record_by_id(pool.inner(), file_id.to_string()).await?;
    println!(
        "[progress] book={} spine={} char_offset={} page={}",
        file_id, spine_idx, char_offset, current_page
    );
    db::update_vb_record(pool.inner(), models::update_vr {
        vagaread_id: record.vagaread_id.to_string(),
        current_read_idx: char_offset,
        current_spine: spine_idx,
        current_page,
    }).await
}

/// Receives the current speed-reader position when SR is paused or stopped.
/// For now just prints — the SR position table will be designed separately.
#[tauri::command]
pub async fn save_sr_position_handler(
    file_id: uuid::Uuid,
    spine_idx: usize,
    char_offset: usize,
    current_page: usize,
    word_idx: usize,
    mode: String,
) -> Result<(), ApplicationError> {
    println!(
        "[SR position] book={} spine={} char_offset={} page={} word={} mode={}",
        file_id, spine_idx, char_offset, current_page, word_idx, mode
    );
    Ok(())
}

// core logic shared by both handlers — takes &SqlitePool directly, no State wrapper
async fn list_all_books(pool: &SqlitePool) -> Result<Vec<models::vagaread>, ApplicationError> {
    let records = db::list_all_vb_records(pool).await?;
    Ok(records)
}

// core logic shared by both handlers — takes &SqlitePool directly, no State wrapper
async fn load_file_core(app: &tauri::AppHandle, file_path: &str, pool: &SqlitePool) -> Result<Content_response, ApplicationError> {
    let new_fp = util::copy_to_app_directory(app, file_path)?;
    println!("the new updated file path is:{}", new_fp);
    let metadata_str = epub_util::extract_epub_metadata(&new_fp)?;
    let metadata: serde_json::Value = serde_json::from_str(&metadata_str).map_err(|e| ApplicationError {
        code: crate::errors::codes::DATABASE_ERROR,
        message: Some(format!("invalid metadata json: {e}")),
    })?;
    let vr_record = models::vagaread{
        vagaread_id: Uuid::new_v4(),
        internal_fp: new_fp.to_string(),
        meta_data: metadata,
        current_read_idx: 0,
        current_spine: 0,
        current_page: 0,
        is_deleted: false,
    };
    db::create_record(pool, vr_record).await?;
    let content = epub_util::get_paginated_content(&new_fp, 0, 0, models::PAGINATE_CHAR)?;

    Ok(content)
}

async fn get_ebook_content_paginated(pool: &SqlitePool, file_id: uuid::Uuid, mut spine_idx: usize, mut char_offset: usize) -> Result<models::book_response, ApplicationError> {
    let record = db::get_vb_record_by_id(pool, file_id.to_string()).await?;

    let restore_page;
    if spine_idx == record.current_spine && char_offset == record.current_read_idx {
        // Requested position matches what's saved in DB — this is either opening the book
        // or returning to the same chunk. Return the saved visual page so the frontend
        // can restore the exact page the user was on. Do NOT save (nothing changed).
        restore_page = record.current_page;
    } else {
        // Navigating to a new chunk — save new position; new chunk starts at visual page 0
        restore_page = 0;
        update_ebook_page_state_async(pool.clone(), models::update_vr {
            vagaread_id: record.vagaread_id.to_string(),
            current_read_idx: char_offset,
            current_spine: spine_idx,
            current_page: 0,
        }); // fire and forget — does not block page load
    }

    let mut content = epub_util::get_paginated_content(&record.internal_fp, spine_idx, char_offset, models::PAGINATE_CHAR)?;
    content.current_page = restore_page;
    Ok(models::book_response { vagaread_id: record.vagaread_id, content })
}

fn update_ebook_page_state_async(pool: SqlitePool, data_model: models::update_vr) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = db::update_vb_record(&pool, data_model).await {
            eprintln!("[error] failed to save page state: {:?}", e);
        }
    });
}
