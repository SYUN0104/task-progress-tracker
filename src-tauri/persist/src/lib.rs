//! Pure persistence logic for the Task Progress Tracker.
//!
//! This crate deliberately has NO dependency on `tauri` so it can be built
//! and unit-tested on any host -- including WSL2, which lacks the system
//! webview libraries required to compile the `app` crate.
//!
//! Implements plan decision D7 (2-step atomic replace) and D10 (rename
//! retry with backoff). See `save_state` and `load_state` below.

use std::fmt;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const STATE_FILE: &str = "state.json";
const BACKUP_FILE: &str = "state.json.bak";
const TMP_FILE: &str = "state.json.tmp";

/// Backoff delays applied before each retry of the final rename step, in
/// addition to the initial (unblocked) attempt -- so up to 4 total attempts.
/// Windows AV/file-indexer processes can transiently hold a handle open on
/// the destination file, causing a spurious `ERROR_ACCESS_DENIED`; a short
/// wait usually lets the holder release it.
const RENAME_RETRY_DELAYS_MS: [u64; 3] = [50, 200, 800];

/// Error type for persistence operations.
#[derive(Debug)]
pub struct PersistError(String);

impl fmt::Display for PersistError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for PersistError {}

/// Result of a load attempt: `Some(json)` if a usable state was found (in
/// either `state.json` or its backup), `None` if neither was usable (first
/// launch, or both copies missing/corrupt).
pub type LoadResult = Option<String>;

/// Atomically persists `json` as `state.json` inside `dir`.
///
/// Sequence (plan D7):
/// 1. If `state.json` already exists, copy it to `state.json.bak` (a copy,
///    not a move, so `state.json` is never briefly absent).
/// 2. Write the new content to `state.json.tmp` and `fsync` it, so the bytes
///    are durable on disk before anything references the new name.
/// 3. Atomically rename `state.json.tmp` -> `state.json`. `std::fs::rename`
///    uses `MoveFileExW(MOVEFILE_REPLACE_EXISTING)` on Windows and `rename(2)`
///    on Linux, both of which replace the destination atomically.
///
/// With this ordering, a crash at any point still leaves `state.json`
/// present: the old file before the rename, the new one after.
pub fn save_state(dir: &Path, json: &str) -> Result<(), PersistError> {
    fs::create_dir_all(dir)
        .map_err(|e| PersistError(format!("failed to create state dir {}: {e}", dir.display())))?;

    let state_path = dir.join(STATE_FILE);
    let backup_path = dir.join(BACKUP_FILE);
    let tmp_path = dir.join(TMP_FILE);

    if state_path.exists() {
        fs::copy(&state_path, &backup_path).map_err(|e| {
            PersistError(format!(
                "failed to back up {} to {}: {e}",
                state_path.display(),
                backup_path.display()
            ))
        })?;
    }

    {
        let mut file = File::create(&tmp_path)
            .map_err(|e| PersistError(format!("failed to create {}: {e}", tmp_path.display())))?;
        file.write_all(json.as_bytes())
            .map_err(|e| PersistError(format!("failed to write {}: {e}", tmp_path.display())))?;
        file.sync_all()
            .map_err(|e| PersistError(format!("failed to fsync {}: {e}", tmp_path.display())))?;
    }

    rename_with_retry(&tmp_path, &state_path)
}

/// Renames `from` to `to`, replacing `to` if it exists. Retries on failure
/// with the backoff schedule in [`RENAME_RETRY_DELAYS_MS`] (initial attempt
/// plus up to 3 retries).
fn rename_with_retry(from: &Path, to: &Path) -> Result<(), PersistError> {
    let mut last_err = None;

    for delay_ms in std::iter::once(0).chain(RENAME_RETRY_DELAYS_MS) {
        if delay_ms > 0 {
            thread::sleep(Duration::from_millis(delay_ms));
        }
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) => last_err = Some(e),
        }
    }

    Err(PersistError(format!(
        "failed to atomically replace {} after {} attempts: {}",
        to.display(),
        RENAME_RETRY_DELAYS_MS.len() + 1,
        last_err.map(|e| e.to_string()).unwrap_or_default()
    )))
}

/// Loads persisted state from `dir`, falling back from `state.json` to its
/// backup, per plan D7.
///
/// - `state.json` missing or not valid JSON -> try `state.json.bak`.
/// - If that also fails, give up and return `None`, but first preserve
///   whichever file(s) actually existed-but-failed-to-parse as
///   `state.corrupt-<unix_ts>.json`, so a corrupted write is never silently
///   discarded. A merely-missing file needs no preservation.
pub fn load_state(dir: &Path) -> LoadResult {
    let state_path = dir.join(STATE_FILE);
    let backup_path = dir.join(BACKUP_FILE);

    if let Some(json) = read_valid_json(&state_path) {
        return Some(json);
    }
    if let Some(json) = read_valid_json(&backup_path) {
        return Some(json);
    }

    preserve_if_corrupt(&state_path);
    preserve_if_corrupt(&backup_path);

    None
}

/// Reads `path` and returns its content only if it both exists and parses
/// as valid JSON. A file that exists but fails to parse (truncated/corrupted
/// write) is treated the same as a missing one by callers -- neither yields
/// usable state.
fn read_valid_json(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<serde_json::Value>(&content).ok()?;
    Some(content)
}

/// If `path` exists (but failed the `read_valid_json` check above -- callers
/// only reach this once both state.json and its backup are unusable),
/// renames it out of the way as evidence instead of leaving it to be
/// silently overwritten by the next `save_state` call.
fn preserve_if_corrupt(path: &Path) {
    if !path.exists() {
        return;
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let dest = unique_corrupt_path(dir, ts);
    // Best-effort: if this fails there's nothing else productive to do, and
    // the caller still needs to return its fallback result either way.
    let _ = fs::rename(path, dest);
}

/// Picks a `state.corrupt-<ts>.json` path that doesn't already exist,
/// disambiguating with a numeric suffix in the rare case both `state.json`
/// and `state.json.bak` are corrupt within the same second.
fn unique_corrupt_path(dir: &Path, ts: u64) -> PathBuf {
    let mut candidate = dir.join(format!("state.corrupt-{ts}.json"));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("state.corrupt-{ts}-{n}.json"));
        n += 1;
    }
    candidate
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn roundtrip_save_then_load() {
        let dir = tempdir().unwrap();
        save_state(dir.path(), r#"{"a":1}"#).unwrap();
        assert_eq!(load_state(dir.path()), Some(r#"{"a":1}"#.to_string()));
    }

    #[test]
    fn second_save_backs_up_previous_version() {
        let dir = tempdir().unwrap();
        save_state(dir.path(), r#"{"v":1}"#).unwrap();
        save_state(dir.path(), r#"{"v":2}"#).unwrap();

        let bak = fs::read_to_string(dir.path().join("state.json.bak")).unwrap();
        assert_eq!(bak, r#"{"v":1}"#);
        assert_eq!(load_state(dir.path()), Some(r#"{"v":2}"#.to_string()));
    }

    #[test]
    fn corrupt_main_falls_back_to_backup() {
        let dir = tempdir().unwrap();
        save_state(dir.path(), r#"{"v":1}"#).unwrap();
        save_state(dir.path(), r#"{"v":2}"#).unwrap(); // bak now holds v1

        // Corrupt state.json directly (simulating a truncated/garbled write).
        fs::write(dir.path().join("state.json"), "{ not valid json").unwrap();

        assert_eq!(load_state(dir.path()), Some(r#"{"v":1}"#.to_string()));
        // The corrupt main file is left untouched -- it was never preserved
        // because the fallback to backup succeeded (only the "both fail"
        // path preserves corrupt files).
        assert!(dir.path().join("state.json").exists());
    }

    #[test]
    fn both_missing_returns_none() {
        let dir = tempdir().unwrap();
        assert_eq!(load_state(dir.path()), None);
    }

    #[test]
    fn corrupt_file_is_preserved_with_corrupt_prefix() {
        let dir = tempdir().unwrap();
        let garbage = "{ this is not json";
        fs::write(dir.path().join("state.json"), garbage).unwrap();
        // No backup exists, so both candidates fail and we hit the "both
        // fail" preservation path.

        assert_eq!(load_state(dir.path()), None);
        assert!(!dir.path().join("state.json").exists());

        let preserved = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .find(|e| {
                let name = e.file_name();
                let name = name.to_string_lossy();
                name.starts_with("state.corrupt-") && name.ends_with(".json")
            })
            .expect("expected a preserved state.corrupt-*.json file");

        assert_eq!(fs::read_to_string(preserved.path()).unwrap(), garbage);
    }

    #[test]
    fn save_state_creates_missing_directory() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("nested").join("state-dir");
        save_state(&nested, r#"{"a":1}"#).unwrap();
        assert_eq!(load_state(&nested), Some(r#"{"a":1}"#.to_string()));
    }
}
