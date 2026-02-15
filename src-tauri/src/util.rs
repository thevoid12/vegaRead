// this folder contains all utility files for vagarread

use crate::errors::{codes, ApplicationError};
use std::fs;
use tauri::Manager;

// with the help of tauri we can create a permanent directory for our project
// tauri will take care of the type of os and file system for us
pub fn create_app_directory(app: &tauri::AppHandle) -> Result<(), ApplicationError> {
    let data_dir = app.path().app_data_dir().map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to read directory: {e}")),
    })?;
    fs::create_dir_all(&data_dir).map_err(|e| ApplicationError {
        code: codes::DIRECTORY_ERROR,
        message: Some(format!("unable to create directory: {e}")),
    })
}
