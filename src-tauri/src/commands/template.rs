use crate::models::Template;
use crate::utils::{get_config_path, ConfigFileType};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use super::{load_store, normalize_project_path_str};

const CONFIG_TYPES: [ConfigFileType; 3] = [
    ConfigFileType::Claude,
    ConfigFileType::Codex,
    ConfigFileType::Gemini,
];

#[tauri::command]
pub fn get_templates() -> Result<Vec<Template>, String> {
    let store = load_store()?;
    Ok(store.config().templates.clone())
}

#[tauri::command]
pub fn create_template(name: String, files: HashMap<String, String>) -> Result<Template, String> {
    let mut store = load_store()?;
    let template = Template::new(name, files);
    let created = template.clone();
    store.config_mut().templates.push(template);
    store.save()?;
    Ok(created)
}

#[tauri::command]
pub fn update_template(
    id: String,
    name: String,
    files: HashMap<String, String>,
) -> Result<Template, String> {
    let mut store = load_store()?;
    let target = store
        .config_mut()
        .templates
        .iter_mut()
        .find(|tpl| tpl.id == id)
        .ok_or_else(|| "未找到指定模板".to_string())?;
    target.name = name;
    target.files = files;
    target.touch();
    let updated = target.clone();
    store.save()?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_template(id: String) -> Result<(), String> {
    let mut store = load_store()?;
    let before = store.config().templates.len();
    store
        .config_mut()
        .templates
        .retain(|template| template.id != id);
    if before == store.config().templates.len() {
        return Err("未找到指定模板".to_string());
    }
    store.save()?;
    Ok(())
}

#[tauri::command]
pub fn import_template_from_project(
    project_path: String,
    name: String,
) -> Result<Template, String> {
    let project_path = normalize_project_path_str(&project_path)?;
    let files = collect_project_files(&project_path)?;
    if files.is_empty() {
        return Err("指定项目中未找到可导入的配置文件".to_string());
    }

    let mut store = load_store()?;
    let template = Template::new(name, files);
    let created = template.clone();
    store.config_mut().templates.push(template);
    store.save()?;
    Ok(created)
}

fn collect_project_files(project_path: &Path) -> Result<HashMap<String, String>, String> {
    let mut files = HashMap::new();
    for file_type in CONFIG_TYPES {
        let config_path = get_config_path(project_path, file_type);
        if config_path.exists() {
            let content =
                fs::read_to_string(&config_path).map_err(|e| format!("读取配置失败: {}", e))?;
            let relative = format!("{}/{}", file_type.directory(), file_type.file_name());
            files.insert(relative, content);
        }
    }
    Ok(files)
}
