// this file will have all the core logic which we reciven
// for our frontend

use crate::util;
use crate::errors::ApplicationError;
use crate::epub_util;
use crate::models;
// what all we need to do while initialization is added here
// init is the first function we call
// fn init(app: &tauri::AppHandle) -> Result<(), ApplicationError> {
//     util::create_app_directory(app)?;
//     Ok(())
// }

// this will be the first screen that user sees when he opens
// vaga read
#[tauri::command]
pub fn show_home_page_handler(app: tauri::AppHandle) -> Result<String, ApplicationError> {
    // init(&app)?;
    let content=load_file_handler(app,"")?;
    Ok(format!{"welcome to Vega Read. Please import new ebook or continue reading from the existing collection. content:{}",content})
}

// this handler is called when user uploads a file
#[tauri::command]
pub fn load_file_handler(app: tauri::AppHandle,mut file_path: &str) -> Result<String,ApplicationError> { // TODO: remove the mut here after testing // for now we can overwrite it the hardcoded filepath but // this will come from ui
file_path="/home/void/Downloads/dopamine_detox.epub";

let new_fp=util::copy_to_app_directory(&app,file_path)?;
println!("the new updated file path is:{}",new_fp);
let metadata= epub_util::extract_epub_metadata(&new_fp)?;
// TODO: store the metadata in the db and other details in the db

// Open the book!
// step1: check for db for where we stopped,if nothing we start from first
let content=epub_util::get_paginated_content(&new_fp,0,0,models::PAGINATE_CHAR)?;

// read the first n pages current index is 0
// then next n chunk

Ok(content)
}
