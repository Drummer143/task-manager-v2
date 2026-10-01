use uuid::Uuid;

pub fn build_path_to_temp_file(path_to_temp_folder: &String, transaction_id: &Uuid) -> String {
    format!("{}/{}", path_to_temp_folder, transaction_id)
}

pub fn build_path_to_assets_file(path_to_assets_folder: &String, hash: &String, size: u64) -> String {
    format!("{}/{}_{}", path_to_assets_folder, hash, size)
}
