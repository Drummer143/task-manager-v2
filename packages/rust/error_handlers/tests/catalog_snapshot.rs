//! Guards the public error contract. `error-codes.snapshot.json` is the committed catalog; any
//! change to a code, status, params or description shows up as a diff in review.
//!
//! Renaming or removing a code breaks clients (their translations are keyed by it). Adding one is
//! fine. After an intentional change, refresh the file with `pnpm nx run error_handlers:update-snapshot`.
#![cfg(feature = "openapi")]

use std::{env, fs, path::PathBuf};

const UPDATE_VAR: &str = "UPDATE_SNAPSHOT";

fn snapshot_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("error-codes.snapshot.json")
}

fn current() -> String {
    let mut json =
        serde_json::to_string_pretty(&error_handlers::openapi::catalog()).expect("serializable");
    json.push('\n');
    json
}

fn normalize(text: &str) -> String {
    text.replace("\r\n", "\n")
}

#[test]
fn error_code_catalog_matches_snapshot() {
    let path = snapshot_path();
    let actual = current();

    if env::var_os(UPDATE_VAR).is_some() {
        fs::write(&path, &actual).expect("write snapshot");
        return;
    }

    let expected = fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!(
            "missing {}; create it with `{UPDATE_VAR}=1 cargo test -p error_handlers --all-features`",
            path.display()
        )
    });

    assert!(
        normalize(&expected) == actual,
        "the error code catalog changed.\n\
         If intentional (adding a code is fine; renaming or removing one breaks clients), run\n  \
         pnpm nx run error_handlers:update-snapshot\n\
         and commit the updated {}.\n\n--- current catalog ---\n{actual}",
        path.display()
    );
}

/// Removed or renamed codes are the dangerous kind of change, so name them explicitly.
#[test]
fn no_code_from_the_snapshot_disappeared() {
    let Ok(expected) = fs::read_to_string(snapshot_path()) else {
        return; // reported by the snapshot test above
    };
    let snapshot: Vec<serde_json::Value> = serde_json::from_str(&expected).expect("valid snapshot");
    let now: Vec<_> = error_handlers::openapi::catalog()
        .iter()
        .map(|entry| entry.code)
        .collect();

    let missing: Vec<_> = snapshot
        .iter()
        .filter_map(|entry| entry["code"].as_str())
        .filter(|code| !now.contains(code))
        .collect();

    assert!(
        missing.is_empty(),
        "codes removed or renamed (breaking for clients): {missing:?}"
    );
}
