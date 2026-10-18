//! The changes of tracked fields (`field_changes`): edit conflicts by field (backend spec §5.3)
//! now, the change history in the UI later.
//!
//! An edit runs in one transaction: lock the entity, [`repo::conflicts`] since the client's base
//! version, apply what [`dto::FieldChange::if_changed`] finds changed, bump the version,
//! [`repo::record`] the changes under the new version.

pub mod dto;
pub mod repo;
