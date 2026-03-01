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
use tauri::State;
// what all we need to do while initialization is added here
// init is the first function we call
// fn init(app: &tauri::AppHandle) -> Result<(), ApplicationError> {
//     util::create_app_directory(app)?;
//     Ok(())
// }

// this will be the first screen that user sees when he opens
// vaga read
#[tauri::command]
pub async fn show_home_page_handler(app: tauri::AppHandle, pool: State<'_, SqlitePool>) -> Result<Vec<models::vagaread>, ApplicationError> {
    // init(&app)?;
    // let content = load_file_core(&app, "", pool.inner()).await.map_err(|e| {
    //     println!("the error is err {:?}", e);
    //     e
    // })?;
        list_all_books(pool.inner()).await.map_err(|e|{
               println!("the error is err {:?}", e);
        e
        })
    // Ok(format!{"welcome to Vega Read. Please import new ebook or continue reading from the existing collection. content:{}",content})
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

// core logic shared by both handlers — takes &SqlitePool directly, no State wrapper
async fn list_all_books(pool: &SqlitePool) -> Result<Vec<models::vagaread>, ApplicationError> {
 
    let records=db::list_all_vb_records(pool).await?;
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
    // TODO: store the metadata in the db and other details in the db
    let vr_record = models::vagaread{
        vagaread_id: Uuid::new_v4(),
        internal_fp: new_fp.to_string(),
        meta_data: metadata,
        current_read_idx: 0,
        current_spine: 0,
        is_deleted: false,
    };
    db::create_record(pool, vr_record).await?;
    // Open the book!
    // step1: check for db for where we stopped, if nothing we start from first
    let content = epub_util::get_paginated_content(&new_fp, 0, 0, models::PAGINATE_CHAR)?;

    // read the first n pages current index is 0
    // then next n chunk

    Ok(content)
}

async fn get_ebook_content_paginated(pool: &SqlitePool, file_id: uuid::Uuid, spine_idx: usize, char_offset: usize) -> Result<models::book_response, ApplicationError> {
    let record = db::get_vb_record_by_id(pool, file_id.to_string()).await?;
    let content = epub_util::get_paginated_content(&record.internal_fp, spine_idx, char_offset, models::PAGINATE_CHAR)?;
    Ok(models::book_response { vagaread_id: record.vagaread_id, content })
}