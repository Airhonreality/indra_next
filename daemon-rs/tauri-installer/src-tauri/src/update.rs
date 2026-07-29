use tauri::Manager;
use tauri::api::process::Command;

/// Initialize auto-update check
/// Runs in background, checks for updates every 6 hours
pub async fn init_auto_update(app: &tauri::AppHandle) {
    let app_clone = app.clone();

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(6 * 60 * 60)).await;
            check_for_updates(&app_clone).await;
        }
    });
}

/// Check for updates from backend
async fn check_for_updates(app: &tauri::AppHandle) {
    match tauri::updater::builder(app)
        .check()
        .await
    {
        Ok(update) => {
            if update.is_update_available() {
                println!(
                    "Update available: {} -> {}",
                    update.current_version(),
                    update.latest_version()
                );

                // Mostrar notificación al usuario
                app.emit_all("update-available", serde_json::json!({
                    "current": update.current_version(),
                    "latest": update.latest_version(),
                    "changelog": update.body(),
                })).ok();
            }
        }
        Err(e) => {
            eprintln!("Update check failed: {}", e);
        }
    }
}

/// Manual update trigger
pub async fn trigger_update(app: &tauri::AppHandle) -> Result<(), String> {
    match tauri::updater::builder(app)
        .check()
        .await
    {
        Ok(update) => {
            if update.is_update_available() {
                println!("Installing update: {}", update.latest_version());
                update
                    .download_and_install()
                    .await
                    .map_err(|e| e.to_string())?;

                // Restart app
                app.restart();
            } else {
                println!("Already on latest version: {}", update.current_version());
            }
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}
