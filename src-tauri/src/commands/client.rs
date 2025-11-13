use crate::models::ClientConfig;
use crate::storage::client_repository::ClientRepository;
use std::sync::{Arc, Mutex};
use tauri::State;

fn lock_repo<'a>(
    state: &'a State<'_, Arc<Mutex<ClientRepository>>>,
) -> Result<std::sync::MutexGuard<'a, ClientRepository>, String> {
    state
        .lock()
        .map_err(|e| format!("获取客户端仓库锁失败: {}", e))
}

#[tauri::command]
pub fn get_all_clients(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
) -> Result<Vec<ClientConfig>, String> {
    let repo = lock_repo(&repository)?;
    repo.get_all()
}

#[tauri::command]
pub fn get_client_by_id(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    id: String,
) -> Result<Option<ClientConfig>, String> {
    let repo = lock_repo(&repository)?;
    repo.get_by_id(&id)
}

#[tauri::command]
pub fn add_custom_client(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    id: String,
    name: String,
    config_file_paths: Vec<String>,
) -> Result<ClientConfig, String> {
    if id.trim().is_empty() {
        return Err("客户端 ID 不能为空".to_string());
    }
    if name.trim().is_empty() {
        return Err("客户端名称不能为空".to_string());
    }

    let sanitized_paths = sanitize_config_paths(config_file_paths)?;

    let mut repo = lock_repo(&repository)?;
    if repo.get_by_id(&id)?.is_some() {
        return Err("客户端 ID 已存在".to_string());
    }

    let client = ClientConfig::new_custom(id, name, sanitized_paths, false);
    let created = client.clone();
    repo.save(client)?;
    Ok(created)
}

#[tauri::command]
pub fn update_client(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    id: String,
    name: Option<String>,
    config_file_paths: Option<Vec<String>>,
    active_config_path: Option<String>,
    auto_tag: Option<bool>,
) -> Result<ClientConfig, String> {
    let mut repo = lock_repo(&repository)?;
    let mut client = repo
        .get_by_id(&id)?
        .ok_or_else(|| "未找到指定客户端".to_string())?;

    if let Some(new_name) = name {
        if new_name.trim().is_empty() {
            return Err("客户端名称不能为空".to_string());
        }
        client.name = new_name;
    }

    let sanitized_active = sanitize_optional_path(active_config_path)?;

    if let Some(paths) = config_file_paths {
        let sanitized_paths = sanitize_config_paths(paths)?;
        client.config_file_paths = sanitized_paths;

        if let Some(active) = client.active_config_path.clone() {
            if !client.has_config_path(&active) {
                client.active_config_path = client.config_file_paths.first().cloned();
            }
        } else {
            client.active_config_path = client.config_file_paths.first().cloned();
        }
    }

    if let Some(active_path) = sanitized_active {
        if !client.has_config_path(&active_path) {
            return Err("激活的配置文件路径必须包含在路径列表中".to_string());
        }
        client.active_config_path = Some(active_path);
    }

    if let Some(auto_tag) = auto_tag {
        client.auto_tag = auto_tag;
    }

    repo.save(client.clone())?;
    Ok(client)
}

#[tauri::command]
pub fn delete_client(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    id: String,
) -> Result<bool, String> {
    let mut repo = lock_repo(&repository)?;
    let client = repo
        .get_by_id(&id)?
        .ok_or_else(|| "未找到指定客户端".to_string())?;
    if client.is_builtin {
        return Err("内置客户端不允许删除".to_string());
    }

    repo.delete(&id)
}

fn sanitize_config_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    let paths: Vec<String> = paths
        .into_iter()
        .map(|path| path.trim().to_string())
        .collect();

    if paths.is_empty() {
        return Err("配置文件路径列表不能为空".to_string());
    }

    if paths.iter().any(|path| path.is_empty()) {
        return Err("配置文件路径不能为空".to_string());
    }

    Ok(paths)
}

fn sanitize_optional_path(path: Option<String>) -> Result<Option<String>, String> {
    match path {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Err("配置文件路径不能为空".to_string())
            } else {
                Ok(Some(trimmed.to_string()))
            }
        }
        None => Ok(None),
    }
}
