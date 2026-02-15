// this file will have all the core logic which we reciven
// for our frontend

use crate::util;
use crate::errors::ApplicationError;

// what all we need to do while initialization is added here
// init is the first function we call
fn init(app: &tauri::AppHandle) -> Result<(), ApplicationError> {
    util::create_app_directory(app)?;
    Ok(())
}

// this will be the first screen that user sees when he opens
// vaga read
#[tauri::command]
pub fn show_home_page_handler(app: tauri::AppHandle) -> Result<String, ApplicationError> {
    init(&app)?;
    Ok("welcome to Vega Read. Please import new ebook or continue reading from the existing collection".to_string())
}

// this handler is called when user uploads a file
#[tauri::command]
pub fn load_file_handler(file_path: &str){

// for now we can overwrite it the hardcoded filepath but
// this will come from ui
// file_path="/home/void/Downloads/dopamine_detox.epub"
//TODO: while opening the app for first time we can set a inernal folder for all
// of this project related
todo!();
}
