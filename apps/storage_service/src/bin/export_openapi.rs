use std::path::PathBuf;

fn main() {
    let json = storage_app::openapi_json();

    let out_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("openapi-storage.json"));

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).expect("Failed to create output directory");
    }

    std::fs::write(&out_path, json).expect("Failed to write OpenAPI spec");
    eprintln!("OpenAPI spec written to {}", out_path.display());
}
