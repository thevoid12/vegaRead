mod handlers;
use handlers as handler; // rust does not support mod abc as def like python

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![handler::show_home_page_handler])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
