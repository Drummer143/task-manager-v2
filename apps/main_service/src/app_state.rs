use std::sync::Arc;

use axum::extract::FromRef;

use crate::signals;

#[derive(Clone, FromRef)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub amqp_conn: Arc<lapin::Connection>,
    pub signals: signals::Signals,
}
