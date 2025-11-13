use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub name: String,
    pub content: String,
    pub client_id: String,
    pub created_at: DateTime<Utc>,
    pub is_auto: bool,
    #[serde(default)]
    pub content_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multi_file_contents: Option<HashMap<String, String>>,
}

impl Snapshot {
    pub fn new(
        client_id: impl Into<String>,
        name: impl Into<String>,
        content: impl Into<String>,
        is_auto: bool,
        content_hash: impl Into<String>,
        multi_file_contents: Option<HashMap<String, String>>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            content: content.into(),
            client_id: client_id.into(),
            created_at: Utc::now(),
            is_auto,
            content_hash: content_hash.into(),
            multi_file_contents,
        }
    }

    pub fn is_multi_file(&self) -> bool {
        self.multi_file_contents.is_some()
    }

    pub fn get_file_contents(&self) -> HashMap<String, String> {
        if let Some(ref contents) = self.multi_file_contents {
            return contents.clone();
        }

        let mut map = HashMap::new();
        if !self.content.is_empty() {
            map.insert("legacy".to_string(), self.content.clone());
        }
        map
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotConfig {
    pub client_id: String,
    #[serde(default = "SnapshotConfig::default_max_snapshots")]
    pub max_snapshots: usize,
    #[serde(default = "SnapshotConfig::default_max_auto_snapshots")]
    pub max_auto_snapshots: usize,
    #[serde(default = "SnapshotConfig::default_max_manual_snapshots")]
    pub max_manual_snapshots: usize,
    #[serde(default)]
    pub snapshots: Vec<Snapshot>,
}

impl SnapshotConfig {
    pub fn new(client_id: impl Into<String>) -> Self {
        Self {
            client_id: client_id.into(),
            max_snapshots: Self::default_max_snapshots(),
            max_auto_snapshots: Self::default_max_auto_snapshots(),
            max_manual_snapshots: Self::default_max_manual_snapshots(),
            snapshots: Vec::new(),
        }
    }

    pub fn default_max_snapshots() -> usize {
        Self::default_max_manual_snapshots()
    }

    pub fn default_max_auto_snapshots() -> usize {
        3
    }

    pub fn default_max_manual_snapshots() -> usize {
        10
    }
}

impl Default for SnapshotConfig {
    fn default() -> Self {
        Self::new(String::new())
    }
}
