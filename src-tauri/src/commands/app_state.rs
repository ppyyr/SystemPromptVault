use crate::models::AppState;
use crate::utils::file_ops::atomic_write;
use chrono::Utc;
use std::fs;
use std::path::PathBuf;

use super::ensure_app_dir;

const APP_STATE_FILE: &str = "app_state.json";

#[tauri::command]
pub fn get_app_state() -> Result<AppState, String> {
    match load_state()? {
        Some(state) => Ok(state),
        None => Ok(AppState::default()),
    }
}

#[tauri::command]
pub fn set_current_client(client_id: String) -> Result<AppState, String> {
    if client_id.trim().is_empty() {
        return Err("客户端 ID 不能为空".to_string());
    }

    let mut state = load_state()?.unwrap_or_default();
    state.current_client_id = client_id;
    state.last_updated_at = Utc::now();
    save_state(&state)?;
    Ok(state)
}

fn load_state() -> Result<Option<AppState>, String> {
    let path = state_file_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("读取应用状态失败: {}", e))?;
    let state: AppState =
        serde_json::from_str(&raw).map_err(|e| format!("解析应用状态失败: {}", e))?;
    Ok(Some(state))
}

fn save_state(state: &AppState) -> Result<(), String> {
    let path = state_file_path()?;
    let content =
        serde_json::to_string_pretty(state).map_err(|e| format!("序列化应用状态失败: {}", e))?;
    atomic_write(&path, &content)
}

fn state_file_path() -> Result<PathBuf, String> {
    let mut dir = ensure_app_dir()?;
    dir.push(APP_STATE_FILE);
    Ok(dir)
}
