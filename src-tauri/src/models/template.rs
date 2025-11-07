use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// 代表一个可供切换的模板集合
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub files: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Template {
    pub fn new(name: impl Into<String>, files: HashMap<String, String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            files,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }
}
