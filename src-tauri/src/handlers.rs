// this file will have all the core logic which we reciven
// for our frontend

use crate::util;
use crate::errors::ApplicationError;
use epub::doc::EpubDoc;

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
    load_file_handler("");
    Ok("welcome to Vega Read. Please import new ebook or continue reading from the existing collection".to_string())
}

// this handler is called when user uploads a file
#[tauri::command]
pub fn load_file_handler(mut file_path: &str){

// for now we can overwrite it the hardcoded filepath but
// this will come from ui
file_path="/home/void/Downloads/dopamine_detox.epub";
let doc = EpubDoc::new(file_path);
let mut doc = doc.unwrap();
assert_eq!(0, doc.get_current_chapter());
assert_eq!("application/xhtml+xml", doc.get_current_mime().unwrap());
println!("current chapter:{:?}",doc.get_current_chapter());
let mut metadata_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
for item in &doc.metadata {
    metadata_map.entry(item.property.clone()).or_default().push(item.value.clone());
}
let metadata_json = serde_json::to_string_pretty(&metadata_map).unwrap();
println!("{}", metadata_json);
if let Some(resource) = doc.resources.get("titlepage.xhtml") {
    let test = resource.path.clone();
    println!("the titlepage path is {:?}", test);
} else {
    println!("titlepage.xhtml not found in resources");
}
//TODO: while opening the app for first time we can set a inernal folder for all
// of this project related
// todo!();
}
