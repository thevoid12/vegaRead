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

pub async fn create_record(pool: &SqlitePool, vr: models::vagaread) -> Result<(), ApplicationError> {
    sqlx::query(crate::queries::CREATE_VB_RECORD)
        .bind(vr.vagaread_id.to_string())
        .bind(vr.internal_fp)
        .bind(vr.meta_data)
        .bind(vr.current_read_idx as i64)
        .bind(vr.current_spine as i64)
        .execute(pool)
        .await
        .map_err(|e| ApplicationError {
            code: codes::DATABASE_ERROR,
            message: Some(format!("failed to create record: {e}")),
        })?;

    Ok(())
}