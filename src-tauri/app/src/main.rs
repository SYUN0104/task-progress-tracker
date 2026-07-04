// Prevents an additional console window on Windows in release builds. Do not remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Placeholder command: delegates to the `persist` crate's stub. Task #3
/// wires this up to real domain-state (de)serialization and the atomic
/// save sequence (plan D7).
#[tauri::command]
fn save_state(json: String) -> Result<(), String> {
    persist::save(&json).map_err(|e| e.to_string())
}

/// Placeholder command: delegates to the `persist` crate's stub. Task #3
/// wires this up to the real load-with-fallback sequence (plan D7).
#[tauri::command]
fn load_state() -> Result<String, String> {
    persist::load().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_state, load_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
