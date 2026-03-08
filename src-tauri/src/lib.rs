mod db;
mod epub_util;
mod errors;
mod handlers;
mod models;
#[path = "../migrations/queries.rs"]
mod queries;
mod util;
use handlers as handler;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("vagaread".to_string()),
                    }),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone(); // handle is a clone of the apphandler. its tauri's reference to the running application.
                                               // app handler is similar to ctx in golang but this app handler carries app-wide data and services for the entire lifetime of the app unlike ctx
            tauri::async_runtime::block_on(async {
                let pool = db::init_db(&handle).await.expect("failed to init database");
                handle.manage(pool);
            });
            std::panic::set_hook(Box::new(|info| {
                log::error!("[PANIC] {info}");
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            handler::show_home_page_handler,
            handler::upload_file_handler,
            handler::get_ebook_content_handler,
            handler::list_spine_handler,
            handler::get_cover_image_handler,
            handler::save_reading_progress_handler,
            handler::save_sr_position_handler,
            handler::get_settings_handler,
            handler::save_settings_handler,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
