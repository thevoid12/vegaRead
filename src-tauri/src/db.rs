// everything related to database is stored here!

use crate::errors::{codes, ApplicationError};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use tauri::Manager;
use crate::util;
use crate::models;

/// Creates the SQLite connection pool.
/// The DB file is placed inside the Tauri app-data directory.
/// On first launch (when vagaread.db doesn't exist), the schema is created.
pub async fn init_db(app: &tauri::AppHandle) -> Result<SqlitePool, ApplicationError> {
    let data_dir = app.path().app_data_dir().map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to resolve app data dir: {e}")),
    })?;

    util::create_app_directory(app)?;
    // std::fs::create_dir_all(&data_dir).map_err(|e| ApplicationError {
    //     code: codes::DIRECTORY_ERROR,
    //     message: Some(format!("unable to create app data dir: {e}")),
    // })?;

    let db_path = data_dir.join("vagaread.db");
    let is_new_db = !db_path.exists();

    let options = SqliteConnectOptions::from_str(
        db_path
            .to_str()
            .ok_or(ApplicationError {
                code: codes::DATABASE_ERROR,
                message: Some("invalid db path".into()),
            })?,
    )
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

    Ok(pool)
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

pub async fn create_record(pool: &SqlitePool, data_model: models::vagaread) -> Result<(), ApplicationError> {
    sqlx::query(crate::queries::CREATE_VB_RECORD)
        .bind(data_model.vagaread_id.to_string())
        .bind(data_model.internal_fp)
        .bind(data_model.meta_data.to_string())
        .bind(data_model.current_read_idx.to_string())
        .bind(data_model.current_spine.to_string())
        .bind(data_model.is_deleted)
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to create record: {e}")),
        })?;

    Ok(())
}

pub async fn update_vb_record(pool: &SqlitePool, data_model: models::update_vr) -> Result<(), ApplicationError> {
    sqlx::query(crate::queries::UPDATE_VB_RECORD)
        .bind(data_model.current_read_idx.to_string())
        .bind(data_model.current_spine.to_string())
        .bind(data_model.vagaread_id)
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to update record: {e}")),
        })?;

    Ok(())
    }

pub async fn list_all_vb_records(pool: &SqlitePool) -> Result<Vec<models::vagaread>, ApplicationError> {
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
        .map(|row| -> Result<models::vagaread, ApplicationError> {
            let vagaread_id = uuid::Uuid::parse_str(row.get::<&str, _>("id"))
                .map_err(|e| ApplicationError {
                    code: codes::DATABASE_ERROR,
                    message: Some(format!("invalid uuid in db: {e}")),
                })?;
            let current_read_idx = row.get::<&str, _>("current_read_idx")
                .parse::<usize>()
                .map_err(|e| ApplicationError {
                    code: codes::DATABASE_ERROR,
                    message: Some(format!("invalid current_read_idx in db: {e}")),
                })?;
            let current_spine = row.get::<&str, _>("current_spine")
                .parse::<usize>()
                .map_err(|e| ApplicationError {
                    code: codes::DATABASE_ERROR,
                    message: Some(format!("invalid current_spine in db: {e}")),
                })?;
            let meta: serde_json::Value = serde_json::from_str(row.get::<&str, _>("meta_data"))
                .map_err(|e| ApplicationError {
                    code: codes::DATABASE_ERROR,
                    message: Some(format!("invalid metadata json in db: {e}")),
                })?;
            Ok(models::vagaread {
                vagaread_id,
                internal_fp: row.get("internal_book_path"),
                meta_data: meta,
                current_read_idx,
                current_spine,
                is_deleted: row.get("is_deleted"),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(records)
}