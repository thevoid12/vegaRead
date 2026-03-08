// this folder contains all utility files for vagarread

use crate::errors::{codes, ApplicationError};
use std::fs;
use tauri::Manager;

// with the help of tauri we can create a permanent directory for our project
// tauri will take care of the type of os and file system for us
pub fn create_app_directory(app: &tauri::AppHandle) -> Result<(), ApplicationError> {
    let data_dir = app.path().app_data_dir().map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to read app directory: {e}")),
    })?;
    fs::create_dir_all(&data_dir).map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to create directory: {e}")),
    })
}

// the destination file
pub fn copy_to_app_directory(
    app: &tauri::AppHandle,
    file_path: &str,
) -> Result<String, ApplicationError> {
    let data_dir = app.path().app_data_dir().map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to read app directory: {e}")),
    })?;
    let unique_name = uuid::Uuid::new_v4().to_string();
    let dest = data_dir.join(&unique_name);

    fs::copy(file_path, &dest).map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to perform copy to directory: {e}")),
    })?;

    Ok(dest.to_string_lossy().into_owned())
}
