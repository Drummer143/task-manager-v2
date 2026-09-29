//! Prints the error code catalog as JSON: `cargo run -p error_handlers --example error_codes --features openapi`.

fn main() {
    let catalog = error_handlers::openapi::catalog();
    println!(
        "{}",
        serde_json::to_string_pretty(&catalog).expect("catalog is serializable")
    );
}
