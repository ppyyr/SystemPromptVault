use crate::commands::config_file::expand_tilde;
use crate::models::ClientConfig;
use crate::storage::client_repository::ClientRepository;
use crate::utils::file_ops::atomic_write;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientExportData {
    pub id: String,
    pub name: String,
    pub config_file_paths: Vec<String>,
    pub active_config_path: Option<String>,
    pub auto_tag: bool,
    pub is_builtin: bool,
    pub config_contents: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientImportResult {
    pub total: usize,
    pub added: usize,
    pub updated: usize,
}

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

#[tauri::command]
pub fn export_clients(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
) -> Result<String, String> {
    let clients = {
        let repo = lock_repo(&repository)?;
        repo.get_all()?
    };

    let mut exports = Vec::new();
    for client in clients {
        let contents = read_client_config_files(&client)?;
        exports.push(ClientExportData {
            id: client.id,
            name: client.name,
            config_file_paths: client.config_file_paths,
            active_config_path: client.active_config_path,
            auto_tag: client.auto_tag,
            is_builtin: client.is_builtin,
            config_contents: contents,
        });
    }

    serde_json::to_string_pretty(&exports).map_err(|e| format!("序列化客户端数据失败: {}", e))
}

#[tauri::command]
pub fn import_clients(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    json_data: String,
    overwrite_ids: Option<Vec<String>>,
) -> Result<ClientImportResult, String> {
    let clients = parse_and_validate_clients(&json_data)?;
    let total = clients.len();
    if total == 0 {
        return Ok(ClientImportResult {
            total: 0,
            added: 0,
            updated: 0,
        });
    }

    let overwrite_filter = overwrite_ids.map(|ids| {
        ids.into_iter()
            .filter_map(|id| {
                let trimmed = id.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            })
            .collect::<HashSet<_>>()
    });

    let mut repo = lock_repo(&repository)?;
    let mut added = 0;
    let mut updated = 0;

    for entry in clients {
        let sanitized_id = entry.id.trim().to_string();
        let sanitized_name = entry.name.trim().to_string();
        let paths = sanitize_config_paths(entry.config_file_paths.clone())?;
        let active_path = sanitize_optional_path(entry.active_config_path.clone())?;
        if let Some(ref active) = active_path {
            if !paths.iter().any(|path| path == active) {
                return Err(format!(
                    "客户端 {} 的激活配置文件路径必须包含在路径列表中",
                    sanitized_id
                ));
            }
        }

        let mut client = ClientConfig::new_custom(
            sanitized_id.clone(),
            sanitized_name,
            paths.clone(),
            entry.auto_tag,
        );
        client.active_config_path = active_path;

        let existing = repo.get_by_id(&sanitized_id)?;
        if existing.is_some() {
            if let Some(filter) = overwrite_filter.as_ref() {
                if !filter.contains(&sanitized_id) {
                    continue;
                }
            }
        }

        write_client_config_files(&client, &entry.config_contents)?;
        repo.save(client.clone())?;

        if existing.is_some() {
            updated += 1;
        } else {
            added += 1;
        }
    }

    Ok(ClientImportResult {
        total,
        added,
        updated,
    })
}

fn parse_and_validate_clients(json_data: &str) -> Result<Vec<ClientExportData>, String> {
    let trimmed = json_data.trim();
    if trimmed.is_empty() {
        return Err("导入数据不能为空".to_string());
    }

    let value: Value =
        serde_json::from_str(trimmed).map_err(|e| format!("解析客户端 JSON 失败: {}", e))?;
    let entries = value
        .as_array()
        .ok_or_else(|| "导入数据必须是客户端数组".to_string())?;
    validate_client_entries(entries)?;

    let clients: Vec<ClientExportData> =
        serde_json::from_value(value).map_err(|e| format!("转换客户端数据失败: {}", e))?;
    validate_client_models(&clients)?;
    Ok(clients)
}

fn validate_client_entries(entries: &[Value]) -> Result<(), String> {
    for (index, entry) in entries.iter().enumerate() {
        let obj = entry
            .as_object()
            .ok_or_else(|| format!("第{}个客户端必须是对象", index + 1))?;

        ensure_client_string_field(obj, "id", index)?;
        ensure_client_string_field(obj, "name", index)?;

        match obj.get("config_file_paths") {
            Some(Value::Array(paths)) if !paths.is_empty() => {
                for path_value in paths {
                    if let Some(path) = path_value.as_str() {
                        if path.trim().is_empty() {
                            return Err(format!("第{}个客户端包含空的配置文件路径", index + 1));
                        }
                    } else {
                        return Err(format!("第{}个客户端的配置文件路径必须是字符串", index + 1));
                    }
                }
            }
            Some(Value::Array(_)) => {
                return Err(format!("第{}个客户端至少需要一个配置文件路径", index + 1))
            }
            Some(_) => {
                return Err(format!(
                    "第{}个客户端的config_file_paths必须是字符串数组",
                    index + 1
                ))
            }
            None => return Err(format!("第{}个客户端缺少config_file_paths字段", index + 1)),
        }

        match obj.get("config_contents") {
            Some(Value::Object(map)) => {
                for (path, value) in map {
                    if !value.is_string() {
                        return Err(format!(
                            "第{}个客户端的配置文件 {} 内容必须是字符串",
                            index + 1,
                            path
                        ));
                    }
                }
            }
            Some(_) => {
                return Err(format!(
                    "第{}个客户端的config_contents必须是对象",
                    index + 1
                ))
            }
            None => return Err(format!("第{}个客户端缺少config_contents字段", index + 1)),
        }

        match obj.get("auto_tag") {
            Some(Value::Bool(_)) => {}
            Some(_) => return Err(format!("第{}个客户端的auto_tag必须是布尔值", index + 1)),
            None => return Err(format!("第{}个客户端缺少auto_tag字段", index + 1)),
        }

        if let Some(value) = obj.get("active_config_path") {
            if !(value.is_string() || value.is_null()) {
                return Err(format!(
                    "第{}个客户端的active_config_path必须是字符串或null",
                    index + 1
                ));
            }
        }
    }
    Ok(())
}

fn ensure_client_string_field(
    obj: &serde_json::Map<String, Value>,
    field: &str,
    index: usize,
) -> Result<(), String> {
    match obj.get(field) {
        Some(Value::String(value)) if !value.trim().is_empty() => Ok(()),
        Some(Value::String(_)) => Err(format!("第{}个客户端的{}不能为空", index + 1, field)),
        Some(_) => Err(format!("第{}个客户端的{}必须是字符串", index + 1, field)),
        None => Err(format!("第{}个客户端缺少{}字段", index + 1, field)),
    }
}

fn validate_client_models(clients: &[ClientExportData]) -> Result<(), String> {
    for (index, client) in clients.iter().enumerate() {
        if client.id.trim().is_empty() {
            return Err(format!("第{}个客户端的ID不能为空", index + 1));
        }
        if client.name.trim().is_empty() {
            return Err(format!("第{}个客户端的名称不能为空", index + 1));
        }
        if client.config_file_paths.is_empty() {
            return Err(format!("第{}个客户端未提供配置文件路径", index + 1));
        }
        if client
            .config_file_paths
            .iter()
            .any(|path| path.trim().is_empty())
        {
            return Err(format!("第{}个客户端包含空的配置文件路径", index + 1));
        }
        if let Some(active) = client.active_config_path.as_ref() {
            if active.trim().is_empty() {
                return Err(format!("第{}个客户端的激活配置路径不能为空", index + 1));
            }
            if !client.config_file_paths.iter().any(|path| path == active) {
                return Err(format!(
                    "第{}个客户端的激活配置路径不在路径列表中",
                    index + 1
                ));
            }
        }
        for path in &client.config_file_paths {
            if !client.config_contents.contains_key(path) {
                return Err(format!(
                    "第{}个客户端缺少配置文件 {} 的内容",
                    index + 1,
                    path
                ));
            }
        }
    }
    Ok(())
}

fn read_client_config_files(client: &ClientConfig) -> Result<HashMap<String, String>, String> {
    let mut contents = HashMap::new();
    for path in &client.config_file_paths {
        let expanded = expand_tilde(path);
        let content = match fs::read_to_string(&expanded) {
            Ok(value) => value,
            Err(err) if err.kind() == ErrorKind::NotFound => String::new(),
            Err(err) => {
                return Err(format!("读取配置文件失败: {} ({})", path, err));
            }
        };
        contents.insert(path.clone(), content);
    }
    Ok(contents)
}

fn write_client_config_files(
    client: &ClientConfig,
    contents: &HashMap<String, String>,
) -> Result<(), String> {
    for path in &client.config_file_paths {
        let data = contents
            .get(path)
            .ok_or_else(|| format!("客户端 {} 缺少配置文件 {} 的内容", client.id, path))?;
        let expanded = expand_tilde(path);
        atomic_write(&expanded, data)?;
    }
    Ok(())
}
