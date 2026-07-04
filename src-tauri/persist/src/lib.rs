//! Pure persistence logic for the Task Progress Tracker.
//!
//! This crate deliberately has NO dependency on `tauri` so it can be built
//! and unit-tested on any host — including WSL2, which lacks the system
//! webview libraries required to compile the `app` crate.
//!
//! These are scaffolding stubs. Task #3 replaces them with the real 2-step
//! atomic replace (copy -> .bak, write+fsync tmp, rename -> state.json) and
//! load-with-fallback sequence described in plan decision D7.

use std::fmt;

/// Error type for persistence operations.
#[derive(Debug)]
pub struct PersistError(String);

impl fmt::Display for PersistError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for PersistError {}

/// Placeholder save: currently a no-op that always succeeds, just to give the
/// `app` crate something to link against during scaffolding. Task #3 replaces
/// this with the atomic copy/tmp+fsync/rename sequence.
pub fn save(_json: &str) -> Result<(), PersistError> {
    Ok(())
}

/// Placeholder load: currently returns an empty JSON object. Task #3 replaces
/// this with the real state.json -> .bak -> empty-state fallback chain.
pub fn load() -> Result<String, PersistError> {
    Ok("{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_and_load_stubs_do_not_error() {
        assert!(save("{}").is_ok());
        assert_eq!(load().unwrap(), "{}");
    }
}
