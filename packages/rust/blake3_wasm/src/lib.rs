//! BLAKE3 for the upload worker in the browser.
//!
//! storage-service identifies files by the BLAKE3 hash of their content (lowercase hex). The
//! browser hashes files of any size before uploading them, so the hasher is incremental: the file
//! is fed slice by slice and never held in memory as a whole.

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Default)]
pub struct Blake3Hasher(blake3::Hasher);

#[wasm_bindgen]
impl Blake3Hasher {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    /// Feeds the next bytes. A `Uint8Array` on the JS side; it is copied into Wasm memory.
    pub fn update(&mut self, data: &[u8]) {
        self.0.update(data);
    }

    /// The hash of everything fed so far, as lowercase hex. The hasher can keep going afterwards.
    pub fn finalize(&self) -> String {
        self.0.finalize().to_hex().to_string()
    }

    /// Bytes fed so far.
    #[wasm_bindgen(getter, js_name = bytesHashed)]
    pub fn bytes_hashed(&self) -> f64 {
        // u64 would be a BigInt in JS; files fit in f64's 53-bit integer range
        self.0.count() as f64
    }

    pub fn reset(&mut self) {
        self.0.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_empty_input_matches_the_reference_vector() {
        assert_eq!(
            Blake3Hasher::new().finalize(),
            "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
        );
    }

    #[test]
    fn feeding_in_slices_matches_hashing_at_once() {
        // Longer than one BLAKE3 chunk (1 KiB), so the tree is actually built
        let data: Vec<u8> = (0..10_000u32).map(|i| (i % 251) as u8).collect();
        let mut hasher = Blake3Hasher::new();

        for slice in data.chunks(777) {
            hasher.update(slice);
        }

        // What storage-service computes (`blake3::hash(..).to_string()`)
        assert_eq!(hasher.finalize(), blake3::hash(&data).to_string());
        assert_eq!(hasher.bytes_hashed(), data.len() as f64);
    }

    #[test]
    fn reset_starts_over() {
        let mut hasher = Blake3Hasher::new();
        hasher.update(b"something");
        hasher.reset();

        assert_eq!(hasher.finalize(), Blake3Hasher::new().finalize());
        assert_eq!(hasher.bytes_hashed(), 0.0);
    }
}
