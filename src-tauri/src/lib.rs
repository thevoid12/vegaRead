mod db;
mod errors;
mod handlers;
mod util;
mod epub_util;
use handlers as handler;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();// handle is a clone of the apphandler. its tauri's reference to the running application. 
            // app handler is similar to ctx in golang but this app handler carries app-wide data and services for the entire lifetime of the app unlike ctx
            tauri::async_runtime::block_on(async {
                let pool = db::init_db(&handle).await.expect("failed to init database");
                handle.manage(pool);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![handler::show_home_page_handler])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
