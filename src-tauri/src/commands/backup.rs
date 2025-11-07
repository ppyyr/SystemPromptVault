use crate::models::{Backup, HistoryEntry};
use crate::utils::atomic_write;
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use super::{append_history_entry, ensure_backups_dir, normalize_project_path_str, project_hash};

const CONFIG_DIRS: [&str; 3] = [".claude", ".codex", ".gemini"];
const METADATA_FILE: &str = "metadata.json";

#[derive(Debug, Clone)]
pub struct BackupManager {
    root: PathBuf,
}

impl BackupManager {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            root: ensure_backups_dir()?,
        })
    }

    pub fn create_with_label(
        &self,
        project_path: &Path,
        template_name: &str,
    ) -> Result<Backup, String> {
        let now = Utc::now();
        let bucket = self.project_bucket(project_path);
        fs::create_dir_all(&bucket).map_err(|e| format!("创建项目备份目录失败: {}", e))?;

        let backup_id = format!("backup_{}_{}", now.format("%Y%m%d_%H%M%S"), Uuid::new_v4());
        let backup_dir = bucket.join(&backup_id);
        fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败: {}", e))?;

        let mut files = Vec::new();
        for dir_name in CONFIG_DIRS {
            let source = project_path.join(dir_name);
            if source.exists() {
                let target = backup_dir.join(dir_name);
                copy_dir_with_tracking(&source, &target, project_path, &mut files)?;
            }
        }

        let backup = Backup {
            id: backup_id,
            project_path: project_path.to_string_lossy().to_string(),
            template_name: template_name.to_string(),
            created_at: now.to_rfc3339(),
            files,
        };
        self.write_metadata(&backup_dir, &backup)?;
        Ok(backup)
    }

    pub fn list(&self, project_path: &Path) -> Result<Vec<Backup>, String> {
        let bucket = self.project_bucket(project_path);
        if !bucket.exists() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        for entry in fs::read_dir(&bucket).map_err(|e| format!("读取备份目录失败: {}", e))?
        {
            let entry = entry.map_err(|e| format!("遍历备份目录失败: {}", e))?;
            if entry
                .file_type()
                .map_err(|e| format!("读取文件类型失败: {}", e))?
                .is_dir()
            {
                if let Some(backup) = self.read_metadata(&entry.path())? {
                    backups.push(backup);
                }
            }
        }
        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(backups)
    }

    pub fn restore_backup(&self, project_path: &Path, backup_id: &str) -> Result<Backup, String> {
        let bucket = self.project_bucket(project_path);
        let backup_dir = bucket.join(backup_id);
        if !backup_dir.exists() {
            return Err("指定备份不存在".to_string());
        }

        let backup = self
            .read_metadata(&backup_dir)?
            .ok_or_else(|| "备份元数据缺失".to_string())?;

        for dir_name in CONFIG_DIRS {
            let target = project_path.join(dir_name);
            if target.exists() {
                fs::remove_dir_all(&target).map_err(|e| format!("清理项目目录失败: {}", e))?;
            }
            let source = backup_dir.join(dir_name);
            if source.exists() {
                copy_dir_simple(&source, &target)?;
            }
        }
        Ok(backup)
    }

    pub fn clean_old(&self, retention_count: u32) -> Result<u32, String> {
        if !self.root.exists() {
            return Ok(0);
        }

        let mut removed = 0;
        for entry in fs::read_dir(&self.root).map_err(|e| format!("读取备份根目录失败: {}", e))?
        {
            let entry = entry.map_err(|e| format!("遍历备份根目录失败: {}", e))?;
            if !entry
                .file_type()
                .map_err(|e| format!("读取目录类型失败: {}", e))?
                .is_dir()
            {
                continue;
            }

            let mut backups = Vec::new();
            for backup_entry in
                fs::read_dir(entry.path()).map_err(|e| format!("读取备份列表失败: {}", e))?
            {
                let backup_entry = backup_entry.map_err(|e| format!("遍历备份列表失败: {}", e))?;
                if backup_entry
                    .file_type()
                    .map_err(|e| format!("读取备份类型失败: {}", e))?
                    .is_dir()
                {
                    if let Some(backup) = self.read_metadata(&backup_entry.path())? {
                        backups.push((backup_entry.path(), backup));
                    }
                }
            }

            backups.sort_by(|a, b| b.1.created_at.cmp(&a.1.created_at));
            let retain = retention_count as usize;
            if retain >= backups.len() {
                continue;
            }

            for (path, _) in backups.into_iter().skip(retain) {
                fs::remove_dir_all(&path).map_err(|e| format!("删除过期备份失败: {}", e))?;
                removed += 1;
            }
        }

        Ok(removed)
    }

    fn project_bucket(&self, project_path: &Path) -> PathBuf {
        self.root.join(project_hash(project_path))
    }

    fn write_metadata(&self, backup_dir: &Path, backup: &Backup) -> Result<(), String> {
        let path = backup_dir.join(METADATA_FILE);
        let content = serde_json::to_string_pretty(backup)
            .map_err(|e| format!("序列化备份信息失败: {}", e))?;
        atomic_write(&path, &content)
    }

    fn read_metadata(&self, backup_dir: &Path) -> Result<Option<Backup>, String> {
        let path = backup_dir.join(METADATA_FILE);
        if !path.exists() {
            return Ok(None);
        }
        let raw = fs::read_to_string(&path).map_err(|e| format!("读取备份信息失败: {}", e))?;
        let backup =
            serde_json::from_str::<Backup>(&raw).map_err(|e| format!("解析备份信息失败: {}", e))?;
        Ok(Some(backup))
    }
}

#[tauri::command]
pub fn create_backup(project_path: String) -> Result<String, String> {
    let project_path = normalize_project_path_str(&project_path)?;
    let manager = BackupManager::new()?;
    let backup = manager.create_with_label(&project_path, "manual")?;
    let history_entry = HistoryEntry {
        action: "backup".to_string(),
        template_name: backup.template_name.clone(),
        timestamp: Utc::now().to_rfc3339(),
        backup_id: Some(backup.id.clone()),
    };
    append_history_entry(&project_path, history_entry)?;
    Ok(backup.id)
}

#[tauri::command]
pub fn list_backups(project_path: String) -> Result<Vec<Backup>, String> {
    let project_path = normalize_project_path_str(&project_path)?;
    let manager = BackupManager::new()?;
    manager.list(&project_path)
}

#[tauri::command]
pub fn restore_backup(project_path: String, backup_id: String) -> Result<(), String> {
    let project_path = normalize_project_path_str(&project_path)?;
    let manager = BackupManager::new()?;
    let backup = manager.restore_backup(&project_path, &backup_id)?;
    let history_entry = HistoryEntry {
        action: "restore".to_string(),
        template_name: backup.template_name.clone(),
        timestamp: Utc::now().to_rfc3339(),
        backup_id: Some(backup.id),
    };
    append_history_entry(&project_path, history_entry)?;
    Ok(())
}

#[tauri::command]
pub fn clean_old_backups(retention_count: u32) -> Result<u32, String> {
    let manager = BackupManager::new()?;
    manager.clean_old(retention_count)
}

fn copy_dir_with_tracking(
    source: &Path,
    target: &Path,
    project_path: &Path,
    files: &mut Vec<String>,
) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| format!("创建备份目录失败: {}", e))?;
    for entry in fs::read_dir(source).map_err(|e| format!("遍历目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
        let entry_path = entry.path();
        let target_path = target.join(entry.file_name());
        let metadata = entry
            .metadata()
            .map_err(|e| format!("读取文件元数据失败: {}", e))?;
        if metadata.is_dir() {
            copy_dir_with_tracking(&entry_path, &target_path, project_path, files)?;
        } else if metadata.is_file() {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
            }
            fs::copy(&entry_path, &target_path).map_err(|e| format!("复制文件失败: {}", e))?;
            if let Ok(relative) = entry_path.strip_prefix(project_path) {
                files.push(relative.to_string_lossy().to_string());
            }
        }
    }
    Ok(())
}

fn copy_dir_simple(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(target).map_err(|e| format!("创建目录失败: {}", e))?;
    for entry in fs::read_dir(source).map_err(|e| format!("遍历备份条目失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取备份条目失败: {}", e))?;
        let entry_path = entry.path();
        let target_path = target.join(entry.file_name());
        let metadata = entry
            .metadata()
            .map_err(|e| format!("读取文件元数据失败: {}", e))?;
        if metadata.is_dir() {
            copy_dir_simple(&entry_path, &target_path)?;
        } else if metadata.is_file() {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
            }
            fs::copy(&entry_path, &target_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    Ok(())
}
