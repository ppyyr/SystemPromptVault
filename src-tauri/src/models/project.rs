use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub path: PathBuf,
    pub last_template: Option<String>,
    pub last_applied_at: Option<DateTime<Utc>>,
}

impl Project {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            last_template: None,
            last_applied_at: None,
        }
    }

    pub fn update_template(&mut self, template_id: impl Into<String>) {
        self.last_template = Some(template_id.into());
        self.last_applied_at = Some(Utc::now());
    }
}
