//! Workspaces (access spec §1, §9.1). A member has a set of roles; a member without any is a
//! guest. The owner is a flag on one member, not a role. The built-in Admin role
//! (`builtin = 'admin'`) has every grantable capability without storing them.

pub mod controllers;
pub mod dto;
pub mod middleware;
pub mod repo;
pub mod router;
pub mod service;
pub mod utils;
