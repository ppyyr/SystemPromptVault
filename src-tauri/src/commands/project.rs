use crate::models::{ApplyResult, HistoryEntry, Project, ProjectConfig, Template};
use crate::storage::JsonStore;
use crate::utils::{atomic_write, get_config_path, ConfigFileType};
use chrono::Utc;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use super::backup::BackupManager;
use super::{append_history_entry, load_store, normalize_project_path_str, read_history_entries};

#[tauri::command]
pub fn select_project_directory(app_handle: AppHandle) -> Result<String, String> {
    let folder = app_handle.dialog().file().blocking_pick_folder();
    match folder {
        Some(path) => {
            let path_buf = path
                .into_path()
                .map_err(|e| format!("转换目录路径失败: {}", e))?;
            Ok(path_buf.to_string_lossy().to_string())
        }
        None => Err("用户取消了项目目录选择".to_string()),
    }
}

#[tauri::command]
pub fn apply_template(project_path: String, template_id: String) -> Result<ApplyResult, String> {
    let project_path = normalize_project_path_str(&project_path)?;
    let mut store = load_store()?;
    let template = store
        .config()
        .templates
        .iter()
        .find(|tpl| tpl.id == template_id)
        .cloned()
        .ok_or_else(|| "指定模板不存在".to_string())?;

    let manager = BackupManager::new()?;
    let backup = manager.create_with_label(&project_path, &template.name)?;
    match apply_template_files(&project_path, &template) {
        Ok(modified_files) => {
            update_project_record(&mut store, &project_path, &template.id);
            store.save()?;

            let history_entry = HistoryEntry {
                action: "apply".to_string(),
                template_name: template.name.clone(),
                timestamp: Utc::now().to_rfc3339(),
                backup_id: Some(backup.id.clone()),
            };
            append_history_entry(&project_path, history_entry)?;

            Ok(ApplyResult {
                success: true,
                backup_id: Some(backup.id),
                modified_files,
            })
        }
        Err(err) => {
            if let Err(restore_err) = manager.restore_backup(&project_path, &backup.id) {
                return Err(format!("应用模板失败: {}，回滚失败: {}", err, restore_err));
            }
            Err(format!("应用模板失败: {}", err))
        }
    }
}

#[tauri::command]
pub fn get_project_config(project_path: String) -> Result<ProjectConfig, String> {
    let project_path = normalize_project_path_str(&project_path)?;
    let claude = read_optional_config(&project_path, ConfigFileType::Claude)?;
    let codex = read_optional_config(&project_path, ConfigFileType::Codex)?;
    let gemini = read_optional_config(&project_path, ConfigFileType::Gemini)?;

    Ok(ProjectConfig {
        claude,
        codex,
        gemini,
    })
}

#[tauri::command]
pub fn get_project_history(project_path: String) -> Result<Vec<HistoryEntry>, String> {
    let project_path = normalize_project_path_str(&project_path)?;
    read_history_entries(&project_path)
}

fn apply_template_files(project_path: &Path, template: &Template) -> Result<Vec<String>, String> {
    let mut modified = Vec::new();
    for (relative, content) in &template.files {
        if relative.trim().is_empty() {
            continue;
        }
        let target = project_path.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
        atomic_write(&target, content)?;
        modified.push(target.to_string_lossy().to_string());
    }
    Ok(modified)
}

fn update_project_record(store: &mut JsonStore, project_path: &Path, template_id: &str) {
    let config = store.config_mut();
    if let Some(project) = config
        .projects
        .iter_mut()
        .find(|proj| proj.path == project_path)
    {
        project.update_template(template_id.to_string());
    } else {
        let mut project = Project::new(project_path.to_path_buf());
        project.update_template(template_id.to_string());
        config.projects.push(project);
    }
}

fn read_optional_config(
    project_path: &Path,
    file_type: ConfigFileType,
) -> Result<Option<String>, String> {
    let config_path = get_config_path(project_path, file_type);
    if !config_path.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(&config_path).map_err(|e| format!("读取配置文件失败: {}", e))?;
    Ok(Some(content))
}
