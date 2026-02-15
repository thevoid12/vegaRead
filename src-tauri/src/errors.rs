use serde::{Deserialize, Serialize};

/// Serializable error returned from Tauri commands for store operations.
#[derive(Serialize, Deserialize, Debug)]
pub struct ApplicationError {
    pub code: u8,
    pub message: Option<String>,
}

pub mod codes {
    /// Failed to read/create the directory (permissions, not found, etc.)
    pub const DIRECTORY_ERROR: u8 = 1;
}