pub mod app_state;
pub mod backup;
pub mod client;
pub mod config_file;
pub mod project;
pub mod prompt;
pub mod template;

pub use backup::{clean_old_backups, create_backup, list_backups, restore_backup, BackupManager};
pub use project::{
    apply_template, get_project_config, get_project_history, select_project_directory,
};
pub use template::{
    create_template, delete_template, get_templates, import_template_from_project, update_template,
};

use crate::models::HistoryEntry;
use crate::storage::JsonStore;
use crate::utils::{atomic_write, normalize_path};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

const APP_DIR_NAME: &str = "SystemPromptVault";
const BACKUPS_DIR_NAME: &str = "backups";
const HISTORY_DIR_NAME: &str = "history";

pub(crate) fn load_store() -> Result<JsonStore, String> {
    let mut store = JsonStore::new()?;
    store.load()?;
    Ok(store)
}

pub(crate) fn normalize_project_path_str(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("项目路径不能为空".to_string());
    }
    Ok(normalize_path(path))
}

pub(crate) fn ensure_app_dir() -> Result<PathBuf, String> {
    let mut dir = dirs::data_dir().ok_or_else(|| "无法定位应用数据目录".to_string())?;
    dir.push(APP_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("创建应用目录失败: {}", e))?;
    Ok(dir)
}

pub(crate) fn ensure_backups_dir() -> Result<PathBuf, String> {
    let mut dir = ensure_app_dir()?;
    dir.push(BACKUPS_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("创建备份目录失败: {}", e))?;
    Ok(dir)
}

pub(crate) fn ensure_history_dir() -> Result<PathBuf, String> {
    let mut dir = ensure_app_dir()?;
    dir.push(HISTORY_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("创建历史目录失败: {}", e))?;
    Ok(dir)
}

pub(crate) fn project_hash(path: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    path.to_string_lossy().to_lowercase().hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

pub(crate) fn history_file_path(project_path: &Path) -> Result<PathBuf, String> {
    let mut dir = ensure_history_dir()?;
    dir.push(format!("{}.json", project_hash(project_path)));
    Ok(dir)
}

pub(crate) fn read_history_entries(project_path: &Path) -> Result<Vec<HistoryEntry>, String> {
    let path = history_file_path(project_path)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("读取历史记录失败: {}", e))?;
    let entries: Vec<HistoryEntry> =
        serde_json::from_str(&raw).map_err(|e| format!("解析历史记录失败: {}", e))?;
    Ok(entries)
}

pub(crate) fn append_history_entry(project_path: &Path, entry: HistoryEntry) -> Result<(), String> {
    let mut entries = read_history_entries(project_path)?;
    entries.push(entry);
    write_history_entries(project_path, &entries)
}

pub(crate) fn write_history_entries(
    project_path: &Path,
    entries: &[HistoryEntry],
) -> Result<(), String> {
    let path = history_file_path(project_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建历史目录失败: {}", e))?;
    }
    let content =
        serde_json::to_string_pretty(entries).map_err(|e| format!("序列化历史记录失败: {}", e))?;
    atomic_write(&path, &content)
}
