use crate::storage::client_repository::ClientRepository;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
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
pub fn read_config_file(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    client_id: String,
) -> Result<String, String> {
    let repo = lock_repo(&repository)?;
    let client = repo
        .get_by_id(&client_id)?
        .ok_or_else(|| "未找到指定客户端".to_string())?;
    let path = expand_tilde(&client.config_file_path);
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(err) => Err(format!("读取配置文件失败: {}", err)),
    }
}

#[tauri::command]
pub fn write_config_file(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    client_id: String,
    content: String,
) -> Result<(), String> {
    let repo = lock_repo(&repository)?;
    let client = repo
        .get_by_id(&client_id)?
        .ok_or_else(|| "未找到指定客户端".to_string())?;
    let path = expand_tilde(&client.config_file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("写入配置文件失败: {}", e))
}

fn expand_tilde(path: &str) -> PathBuf {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            if let Some(stripped) = path.strip_prefix("~/") {
                return home.join(stripped);
            }
        }
    } else if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    Path::new(path).to_path_buf()
}
