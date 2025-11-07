use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyResult {
    pub success: bool,
    pub backup_id: Option<String>,
    pub modified_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub claude: Option<String>,
    pub codex: Option<String>,
    pub gemini: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backup {
    pub id: String,
    pub project_path: String,
    pub template_name: String,
    pub created_at: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub action: String,
    pub template_name: String,
    pub timestamp: String,
    pub backup_id: Option<String>,
}
