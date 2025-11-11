use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub name: String,
    pub content: String,
    pub client_id: String,
    pub created_at: DateTime<Utc>,
    pub is_auto: bool,
}

impl Snapshot {
    pub fn new(
        client_id: impl Into<String>,
        name: impl Into<String>,
        content: impl Into<String>,
        is_auto: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            content: content.into(),
            client_id: client_id.into(),
            created_at: Utc::now(),
            is_auto,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotConfig {
    pub client_id: String,
    #[serde(default = "SnapshotConfig::default_max_snapshots")]
    pub max_snapshots: usize,
    #[serde(default)]
    pub snapshots: Vec<Snapshot>,
}

impl SnapshotConfig {
    pub fn new(client_id: impl Into<String>) -> Self {
        Self {
            client_id: client_id.into(),
            max_snapshots: Self::default_max_snapshots(),
            snapshots: Vec::new(),
        }
    }

    pub fn default_max_snapshots() -> usize {
        5
    }
}

impl Default for SnapshotConfig {
    fn default() -> Self {
        Self::new(String::new())
    }
}
