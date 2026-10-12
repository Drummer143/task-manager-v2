//! Assets: Verso's references to stored files (blobs), with their owner and so their access rules
//! (backend spec §4.4). Bytes live in storage_service; it asks here who may read what.

pub mod cleanup;
pub mod controllers;
pub mod owner;
pub mod repo;
pub mod router;
pub mod upload_token;
