use super::config_file::expand_tilde;
use crate::file_watcher::{ConfigFileWatcher, LEGACY_CLIENT_ID};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn start_watching_config(
    client_id: Option<String>,
    file_paths: Option<Vec<String>>,
    file_path: Option<String>,
    app_handle: AppHandle,
    watcher: State<'_, Arc<Mutex<ConfigFileWatcher>>>,
) -> Result<(), String> {
    let client_id = client_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| LEGACY_CLIENT_ID.to_string());

    let mut provided_paths = file_paths.unwrap_or_default();
    if provided_paths.is_empty() {
        if let Some(single) = file_path {
            provided_paths.push(single);
        }
    }

    if provided_paths.is_empty() {
        return Err("未提供任何配置文件路径".to_string());
    }

    let mut expanded_paths = Vec::with_capacity(provided_paths.len());
    for raw_path in provided_paths {
        if raw_path.trim().is_empty() {
            continue;
        }
        let expanded = expand_tilde(&raw_path);
        if !expanded.exists() {
            return Err(format!("文件不存在: {}", raw_path));
        }
        expanded_paths.push(expanded);
    }

    if expanded_paths.is_empty() {
        return Err("提供的配置文件路径均无效".to_string());
    }

    let mut watcher_guard = watcher
        .lock()
        .map_err(|e| format!("锁定文件监听器失败: {}", e))?;
    watcher_guard.watch_files(client_id, expanded_paths, app_handle)?;
    Ok(())
}

#[tauri::command]
pub fn stop_watching_config(
    watcher: State<'_, Arc<Mutex<ConfigFileWatcher>>>,
) -> Result<(), String> {
    let mut watcher_guard = watcher
        .lock()
        .map_err(|e| format!("锁定文件监听器失败: {}", e))?;
    watcher_guard.stop();
    Ok(())
}
