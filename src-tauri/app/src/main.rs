// Prevents an additional console window on Windows in release builds. Do not remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

/// Resolves the directory used to persist app state (`state.json` and its
/// `.bak`/`.corrupt-*` siblings). `persist::save_state` creates it on first
/// write if it doesn't exist yet, so no eager creation is needed here.
fn state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))
}

/// Persists the given serialized `AppState` JSON via the `persist` crate's
/// atomic 2-step replace sequence (plan D7).
#[tauri::command]
fn save_state(app: AppHandle, json: String) -> Result<(), String> {
    let dir = state_dir(&app)?;
    persist::save_state(&dir, &json).map_err(|e| e.to_string())
}

/// Loads the persisted state, falling back from `state.json` to its backup
/// per plan D7. Returns `None` if no usable state exists yet (first launch,
/// or both copies were missing/corrupt) -- the frontend should initialize an
/// empty `AppState` in that case.
#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let dir = state_dir(&app)?;
    Ok(persist::load_state(&dir))
}

/// Synchronous flush command for the window's `CloseRequested` event (plan
/// D10): the frontend awaits this before letting the window actually close,
/// so any mutation made within the last debounce window isn't lost. It is
/// functionally identical to `save_state` -- kept as a separately named
/// command purely so the close-flush call site in the frontend reads as
/// intentional rather than an arbitrary extra debounced save.
#[tauri::command]
fn flush_state(app: AppHandle, json: String) -> Result<(), String> {
    save_state(app, json)
}

/// Opens a native "Save As" dialog and writes `json` to the chosen path.
/// Returns the chosen path on success, or `None` if the user cancelled.
#[tauri::command]
fn export_json(
    app: AppHandle,
    json: String,
    default_file_name: Option<String>,
) -> Result<Option<String>, String> {
    let mut dialog = app.dialog().file().add_filter("JSON", &["json"]);
    if let Some(name) = default_file_name.as_deref() {
        dialog = dialog.set_file_name(name);
    }

    let Some(file_path) = dialog.blocking_save_file() else {
        return Ok(None); // user closed the dialog without choosing a path
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("failed to write {}: {e}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

/// Opens a native "Open" dialog and returns the chosen file's raw contents.
/// The frontend validates/parses the JSON itself before applying it as the
/// new `AppState`. Returns `None` if the user cancelled.
#[tauri::command]
fn import_json(app: AppHandle) -> Result<Option<String>, String> {
    let Some(file_path) = app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file()
    else {
        return Ok(None); // user closed the dialog without choosing a file
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    fs::read_to_string(&path).map(Some).map_err(|e| format!("failed to read {}: {e}", path.display()))
}

fn main() {
    let mut builder = tauri::Builder::default();

    // Single-instance guard (plan D10): two processes writing state.json
    // with last-write-wins semantics would silently corrupt user data, so a
    // second launch just focuses the existing window instead. Registered as
    // the first plugin so it can intercept the second-instance launch before
    // anything else runs.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    // No capability/ACL entries are needed for `export_json`/`import_json`:
    // they call the dialog plugin's Rust extension trait (`DialogExt`)
    // directly from within our own app-level commands, rather than exposing
    // the dialog plugin's own IPC commands to the frontend. The frontend
    // only ever invokes our five commands below, which -- being app-level
    // commands, not plugin commands -- aren't gated by the ACL system.
    builder
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_state,
            load_state,
            flush_state,
            export_json,
            import_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
