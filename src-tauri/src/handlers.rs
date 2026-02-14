// this will have all the core logic for our app
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// this will be the first screen that user sees when he opens
// vaga read
#[tauri::command]
pub fn show_home_page_handler() -> Result<String,String> {
    Ok("welcome to Vega Read. Please import new ebook or continue reading from the existing collection".to_string())
}