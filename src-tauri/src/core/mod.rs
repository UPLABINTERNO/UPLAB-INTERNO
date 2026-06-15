pub mod auth;
pub mod db;
pub mod error;
pub mod logging;
pub mod models;
pub mod permissions;
pub mod repository;
pub mod state;

/// Epoch atual em segundos (UTC).
pub fn now_epoch() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}
