//! # File Upload Flow
//!
//! This module implements a resumable file upload system with deduplication.
//!
//! ## Flow Diagram
//!
//! ```text
//!                              ┌──────────────────┐
//!                              │   upload init    │
//!                              │  (hash + size)   │
//!                              └────────┬─────────┘
//!                                       │
//!                    ┌──────────────────┼──────────────────┐
//!                    │                  │                  │
//!           (blob exists)        (new large file)    (new small file)
//!                    │                  │                  │
//!                    ▼                  ▼                  ▼
//!          ┌─────────────────┐  ┌───────────────┐  ┌────────────────┐
//!          │  verify ranges  │  │ upload chunked│  │  upload whole  │
//!          │ (random ranges) │  │  (5MB chunks) │  │ (single POST)  │
//!          └────────┬────────┘  └──────┬────────┘  └──────┬─────────┘
//!                   │                  │                  │
//!                   │                  ▼                  │
//!                   │         ┌────────────────┐          │
//!                   │         │ upload chunk   │◄─────┐   │
//!                   │         │  (concurrent)  │      │   │
//!                   │         └───────┬────────┘      │   │
//!                   │                 │               │   │
//!                   │                 ▼               │   │
//!                   │         ┌────────────────┐      │   │
//!                   │         │ more chunks?   │──yes─┘   │
//!                   │         └───────┬────────┘          │
//!                   │                 │ no                │
//!                   │                 ▼                   │
//!                   │        ┌─────────────────┐          │
//!                   │        │ upload complete │          │
//!                   │        │  (hash verify)  │          │
//!                   │        └────────┬────────┘          │
//!                   │                 │                   │
//!                   ▼                 ▼                   ▼
//!                 ┌─────────────────────────────────────────┐
//!                 │              blob_id returned           │
//!                 └─────────────────────────────────────────┘
//! ```
//!
//! ## Resumable Upload Support
//!
//! For chunked uploads, the client can resume by:
//! 1. Calling `upload_status` with `transactionId` to get `missingChunks`
//! 2. Re-uploading only the missing chunks
//! 3. Calling `upload_complete` when done
//!
//! ## Deduplication
//!
//! If a file with the same hash already exists:
//! - Server returns `verifyRanges` step
//! - Client sends random byte ranges for verification
//! - If verified, existing `blob_id` is returned (no upload needed)
//!
//! ## Cancellation
//!
//! Call `upload_cancel` with `transactionId` to abort an upload:
//! - Deletes the temporary file (if created)
//! - Removes the transaction from Redis
//!
//! ## API Endpoints
//!
//! | Endpoint                          | Method    | Description                                       |
//! |-----------------------------------|-----------|---------------------------------------------------|
//! | `/actions/upload/init`            | POST      | Start upload, get `transactionId` and next step   |
//! | `/actions/upload/{id}/status`     | GET       | Get upload status and `missingChunks`             |
//! | `/actions/upload/{id}/chunk`      | POST      | Upload a single chunk                             |
//! | `/actions/upload/{id}/complete`   | POST      | Finalize upload, verify hash                      |
//! | `/actions/upload/{id}/verify`     | POST      | Verify ownership of existing blob                 |
//! | `/actions/upload/{id}/whole`      | POST      | Upload small file in one request                  |
//! | `/actions/upload/{id}/cancel`     | DELETE    | Cancel upload, cleanup resources                  |

pub mod controller;
pub mod dto;
pub mod router;
pub mod service;

pub(super) mod shared;
