// everything related to database is stored here!

use crate::errors::{codes, ApplicationError};
use crate::models;
use crate::util;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use tauri::Manager;

/// Creates the SQLite connection pool.
/// The DB file is placed inside the Tauri app-data directory.
/// On first launch (when vagaread.db doesn't exist), the schema is created.
pub async fn init_db(app: &tauri::AppHandle) -> Result<SqlitePool, ApplicationError> {
    let data_dir = app.path().app_data_dir().map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to resolve app data dir: {e}")),
    })?;

    util::create_app_directory(app)?;

    let db_path = data_dir.join("vagaread.db");
    let is_new_db = !db_path.exists();

    let options = SqliteConnectOptions::from_str(db_path.to_str().ok_or(ApplicationError {
        code: codes::DATABASE_ERROR,
        message: Some("invalid db path".into()),
    })?)
    .map_err(|e| ApplicationError {
        code: codes::DATABASE_ERROR,
        message: Some(format!("bad connect options: {e}")),
    })?
    .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to open database: {e}")),
        })?;

    if is_new_db {
        create_tables(&pool).await?;
    }

    ensure_settings_row(&pool).await?;

    Ok(pool)
}

/// Inserts the app_settings sentinel row if it doesn't exist yet.
/// Idempotent — safe to run on every startup.
async fn ensure_settings_row(pool: &SqlitePool) -> Result<(), ApplicationError> {
    sqlx::query(crate::queries::SEED_SETTINGS_ROW)
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to seed settings row: {e}")),
        })?;
    Ok(())
}

// we create the initial schema which is in /migrations/schema.sql
async fn create_tables(pool: &SqlitePool) -> Result<(), ApplicationError> {
    sqlx::raw_sql(include_str!("../migrations/schema.sql"))
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to create tables: {e}")),
        })?;

    Ok(())
}

/// Parse the stored "word_idx:mode" pointer string into its two components.
fn parse_sr_pointer(sp: &str) -> (usize, String) {
    if let Some(colon) = sp.find(':') {
        let idx = sp[..colon].parse::<usize>().unwrap_or(0);
        let mode = sp[colon + 1..].to_string();
        let mode = if mode == "inline" || mode == "focus" {
            mode
        } else {
            "inline".to_string()
        };
        (idx, mode)
    } else {
        (0, "inline".to_string())
    }
}

pub async fn create_record(
    pool: &SqlitePool,
    data_model: models::Vagaread,
) -> Result<(), ApplicationError> {
    let sr_pointer = format!("{}:{}", data_model.sr_word_idx, data_model.sr_mode);
    sqlx::query(crate::queries::CREATE_VB_RECORD)
        .bind(data_model.vagaread_id.to_string())
        .bind(data_model.internal_fp)
        .bind(data_model.meta_data.to_string())
        .bind(data_model.current_read_idx.to_string())
        .bind(data_model.current_spine.to_string())
        .bind(data_model.current_page.to_string())
        .bind(sr_pointer)
        .bind(data_model.is_deleted)
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to create record: {e}")),
        })?;

    Ok(())
}

pub async fn update_vb_record(
    pool: &SqlitePool,
    data_model: models::UpdateVr,
) -> Result<(), ApplicationError> {
    sqlx::query(crate::queries::UPDATE_VB_RECORD)
        .bind(data_model.current_read_idx.to_string())
        .bind(data_model.current_spine.to_string())
        .bind(data_model.current_page.to_string())
        .bind(data_model.vagaread_id)
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to update record: {e}")),
        })?;

    Ok(())
}

pub async fn update_sr_position(
    pool: &SqlitePool,
    id: &str,
    pointer: &str,
) -> Result<(), ApplicationError> {
    sqlx::query(crate::queries::UPDATE_SR_POSITION)
        .bind(pointer)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to update sr position: {e}")),
        })?;

    Ok(())
}

pub async fn get_vb_record_by_id(
    pool: &SqlitePool,
    id: String,
) -> Result<models::Vagaread, ApplicationError> {
    use sqlx::Row;

    let row = sqlx::query(crate::queries::GET_VB_RECORD_BY_ID)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to get record: {e}")),
        })?;

    let vagaread_id =
        uuid::Uuid::parse_str(row.get::<&str, _>("id")).map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("invalid uuid in db: {e}")),
        })?;
    let current_read_idx = row
        .get::<&str, _>("current_read_idx")
        .parse::<usize>()
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("invalid current_read_idx in db: {e}")),
        })?;
    let current_spine = row
        .get::<&str, _>("current_spine")
        .parse::<usize>()
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("invalid current_spine in db: {e}")),
        })?;
    let current_page = row
        .get::<&str, _>("current_page")
        .parse::<usize>()
        .unwrap_or(0);
    let (sr_word_idx, sr_mode) = parse_sr_pointer(
        row.try_get::<&str, _>("speed_read_pointer")
            .unwrap_or("0:inline"),
    );
    let meta: serde_json::Value =
        serde_json::from_str(row.get::<&str, _>("meta_data")).map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("invalid metadata json in db: {e}")),
        })?;

    Ok(models::Vagaread {
        vagaread_id,
        internal_fp: row.get("internal_book_path"),
        meta_data: meta,
        current_read_idx,
        current_spine,
        current_page,
        sr_word_idx,
        sr_mode,
        is_deleted: row.get("is_deleted"),
    })
}

pub async fn list_all_vb_records(
    pool: &SqlitePool,
) -> Result<Vec<models::Vagaread>, ApplicationError> {
    use sqlx::Row;

    let rows = sqlx::query(crate::queries::LIST_ALL_RECORD)
        .fetch_all(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to list records: {e}")),
        })?;

    let records = rows
        .iter()
        .map(|row| -> Result<models::Vagaread, ApplicationError> {
            let vagaread_id =
                uuid::Uuid::parse_str(row.get::<&str, _>("id")).map_err(|e| ApplicationError {
                    code: codes::DATABASE_ERROR,
                    message: Some(format!("invalid uuid in db: {e}")),
                })?;
            let current_read_idx = row
                .get::<&str, _>("current_read_idx")
                .parse::<usize>()
                .map_err(|e| ApplicationError {
                    code: codes::DATABASE_ERROR,
                    message: Some(format!("invalid current_read_idx in db: {e}")),
                })?;
            let current_spine = row
                .get::<&str, _>("current_spine")
                .parse::<usize>()
                .map_err(|e| ApplicationError {
                    code: codes::DATABASE_ERROR,
                    message: Some(format!("invalid current_spine in db: {e}")),
                })?;
            let current_page = row
                .get::<&str, _>("current_page")
                .parse::<usize>()
                .unwrap_or(0);
            let (sr_word_idx, sr_mode) = parse_sr_pointer(
                row.try_get::<&str, _>("speed_read_pointer")
                    .unwrap_or("0:inline"),
            );
            let meta: serde_json::Value = serde_json::from_str(row.get::<&str, _>("meta_data"))
                .map_err(|e| ApplicationError {
                    code: codes::DATABASE_ERROR,
                    message: Some(format!("invalid metadata json in db: {e}")),
                })?;
            Ok(models::Vagaread {
                vagaread_id,
                internal_fp: row.get("internal_book_path"),
                meta_data: meta,
                current_read_idx,
                current_spine,
                current_page,
                sr_word_idx,
                sr_mode,
                is_deleted: row.get("is_deleted"),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(records)
}

pub async fn get_settings(pool: &SqlitePool) -> Result<models::AppSettings, ApplicationError> {
    use sqlx::Row;
    let row = sqlx::query(crate::queries::GET_SETTINGS)
        .fetch_optional(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to fetch settings: {e}")),
        })?;

    if let Some(row) = row {
        let json: &str = row.get("settings_json");
        Ok(serde_json::from_str(json).unwrap_or_default())
    } else {
        Ok(models::AppSettings::default())
    }
}

pub async fn update_settings(
    pool: &SqlitePool,
    req: &models::SaveSettingsRequest,
) -> Result<(), ApplicationError> {
    let json = serde_json::json!({
        models::SETTINGS_WPM:              req.wpm(),
        models::SETTINGS_FONT_SIZE:        req.font_size(),
        models::SETTINGS_FOCUS_FONT_SIZE:  req.focus_font_size(),
        models::SETTINGS_INLINE_HIGHLIGHT: req.inline_highlight_color(),
        models::SETTINGS_FOCUS_WORD_COLOR: req.focus_word_color(),
        models::SETTINGS_FOCUS_BG_MODE:    req.focus_background_mode(),
    })
    .to_string();
    sqlx::query(crate::queries::UPDATE_SETTINGS)
        .bind(json)
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to update settings: {e}")),
        })?;
    Ok(())
}
