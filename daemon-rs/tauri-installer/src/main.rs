// Tauri installer entry point
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use tauri_installer::commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::check_requirements,
            commands::download_daemon,
            commands::install_daemon,
            commands::create_storage_folder,
            commands::validate_installation,
            commands::uninstall_daemon,
            commands::get_installation_status,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                app.get_webview_window("main").unwrap().open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
