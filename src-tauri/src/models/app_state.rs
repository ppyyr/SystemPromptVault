use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 应用运行时状态，例如当前客户端与更新时间
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub current_client_id: String,
    pub last_updated_at: DateTime<Utc>,
    #[serde(default)]
    pub window_state: Option<WindowState>,
}

/// 主窗口位置与尺寸
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_client_id: "claude".to_string(),
            last_updated_at: Utc::now(),
            window_state: None,
        }
    }
}
