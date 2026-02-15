// everything related to database is stored here!

use crate::errors::{codes, ApplicationError};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use tauri::Manager;

/// Creates the SQLite connection pool.
/// The DB file is placed inside the Tauri app-data directory.
pub async fn init_db(app: &tauri::AppHandle) -> Result<SqlitePool, ApplicationError> {
    let data_dir = app.path().app_data_dir().map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to resolve app data dir: {e}")),
    })?;

    let db_path = data_dir.join("vagaread.db");

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

    // Run migrations / create tables here
    create_tables(&pool).await?;

    Ok(pool)
}

/// Create your tables. Add more CREATE TABLE statements as needed.
async fn create_tables(pool: &SqlitePool) -> Result<(), ApplicationError> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS books (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            path  TEXT NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| ApplicationError {
        code: codes::DATABASE_ERROR,
        message: Some(format!("failed to create tables: {e}")),
    })?;

    Ok(())
}
