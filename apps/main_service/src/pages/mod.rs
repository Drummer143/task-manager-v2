//! Pages (pages spec, part 1): the tree of a workspace, the pages' titles, icons and types, and
//! the trash. A page's body is a Yjs document that socket_service writes; here it is only created
//! with its page (`docs/pages-backend.md` §1).

pub mod controllers;
pub mod dto;
pub mod position;
pub mod repo;
pub mod router;
pub mod service;
pub mod short_id;
pub mod updates;

#[cfg(test)]
mod tests;
