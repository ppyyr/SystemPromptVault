use std::path::PathBuf;

use tauri::command;

use crate::utils::path_utils::{expand_tilde, normalize_path};

#[command]
pub fn expand_path(path: String) -> Result<String, String> {
    let normalized = expand_and_normalize(&path)?;
    Ok(normalized.to_string_lossy().into_owned())
}

#[command]
pub fn get_filename(path: String) -> Result<String, String> {
    let normalized = expand_and_normalize(&path)?;
    normalized
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .ok_or_else(|| "无法解析文件名".to_string())
}

/// 返回相对于用户主目录的路径（`~/` 开头），若不在主目录下则返回绝对路径。
#[command]
pub fn get_relative_path(path: String) -> Result<String, String> {
    let normalized = expand_and_normalize(&path)?;

    if let Some(home) = dirs::home_dir() {
        let home_normalized = normalize_path(home);
        let normalized_path = normalized.as_path();

        if normalized_path.starts_with(&home_normalized) {
            if let Ok(remainder) = normalized_path.strip_prefix(&home_normalized) {
                if remainder.as_os_str().is_empty() {
                    return Ok("~".to_string());
                }

                let mut tilde_path = PathBuf::from("~");
                tilde_path.push(remainder);
                return Ok(tilde_path.to_string_lossy().into_owned());
            }
        }
    }

    Ok(normalized.to_string_lossy().into_owned())
}

fn expand_and_normalize(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("路径不能为空".to_string());
    }
    let expanded = expand_tilde(path);
    Ok(normalize_path(expanded))
}
