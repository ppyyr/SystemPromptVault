use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 应用运行时状态，例如当前客户端与更新时间
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub current_client_id: String,
    pub last_updated_at: DateTime<Utc>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_client_id: "claude".to_string(),
            last_updated_at: Utc::now(),
        }
    }
}
