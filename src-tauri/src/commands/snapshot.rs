use crate::commands::config_file::expand_tilde;
use crate::file_watcher::ConfigFileWatcher;
use crate::models::{ClientConfig, Snapshot, SnapshotConfig};
use crate::storage::{
    client_repository::ClientRepository, snapshot_repository::SnapshotRepository,
};
use crate::tray;
use crate::utils::file_ops::atomic_write;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Runtime, State};

const CONFIG_RELOAD_SILENT_EVENT: &str = "config-reload-silent";

#[derive(Serialize, Clone)]
struct ConfigReloadPayload {
    client_id: String,
    path: String,
}

fn lock_snapshot_repo<'a>(
    state: &'a State<'_, Arc<Mutex<SnapshotRepository>>>,
) -> Result<std::sync::MutexGuard<'a, SnapshotRepository>, String> {
    lock_snapshot_arc(state.inner())
}

fn lock_client_repo<'a>(
    state: &'a State<'_, Arc<Mutex<ClientRepository>>>,
) -> Result<std::sync::MutexGuard<'a, ClientRepository>, String> {
    lock_client_arc(state.inner())
}

fn lock_snapshot_arc<'a>(
    repo: &'a Arc<Mutex<SnapshotRepository>>,
) -> Result<std::sync::MutexGuard<'a, SnapshotRepository>, String> {
    repo.lock()
        .map_err(|e| format!("获取快照仓库锁失败: {}", e))
}

fn lock_client_arc<'a>(
    repo: &'a Arc<Mutex<ClientRepository>>,
) -> Result<std::sync::MutexGuard<'a, ClientRepository>, String> {
    repo.lock()
        .map_err(|e| format!("获取客户端仓库锁失败: {}", e))
}

#[tauri::command]
pub fn create_snapshot(
    snapshot_repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_repository: State<'_, Arc<Mutex<ClientRepository>>>,
    client_id: String,
    name: String,
    content: String,
    is_auto: bool,
) -> Result<Snapshot, String> {
    let client = {
        let repo = lock_client_repo(&client_repository)?;
        repo.get_by_id(&client_id)?
            .ok_or_else(|| "未找到指定客户端".to_string())?
    };

    if client.config_file_paths.is_empty() {
        return Err("客户端未配置任何配置文件路径,无法创建快照".to_string());
    }

    let file_contents = read_client_config_files(&client)?;
    let legacy_content = client
        .default_config_path()
        .and_then(|path| file_contents.get(path).cloned())
        .unwrap_or_else(|| content.clone());

    let repo = lock_snapshot_repo(&snapshot_repository)?;
    repo.create_snapshot(
        &client_id,
        name,
        legacy_content,
        Some(file_contents),
        is_auto,
    )
}

#[tauri::command]
pub fn get_snapshots(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
) -> Result<SnapshotConfig, String> {
    let repo = lock_snapshot_repo(&repository)?;
    repo.get_config(&client_id)
}

#[tauri::command]
pub fn restore_snapshot(
    app_handle: AppHandle,
    snapshot_repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_repository: State<'_, Arc<Mutex<ClientRepository>>>,
    watcher_state: State<'_, Arc<Mutex<ConfigFileWatcher>>>,
    client_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    restore_snapshot_core(
        app_handle,
        Arc::clone(snapshot_repository.inner()),
        Arc::clone(client_repository.inner()),
        Arc::clone(watcher_state.inner()),
        client_id,
        snapshot_id,
    )
}

pub fn restore_snapshot_from_tray<R: Runtime>(
    app_handle: AppHandle<R>,
    snapshot_repository: Arc<Mutex<SnapshotRepository>>,
    client_repository: Arc<Mutex<ClientRepository>>,
    watcher_state: Arc<Mutex<ConfigFileWatcher>>,
    client_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    restore_snapshot_core(
        app_handle,
        snapshot_repository,
        client_repository,
        watcher_state,
        client_id,
        snapshot_id,
    )
}

#[tauri::command]
pub fn delete_snapshot(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    let repo = lock_snapshot_repo(&repository)?;
    repo.delete_snapshot(&client_id, &snapshot_id)
}

#[tauri::command]
pub fn rename_snapshot(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    snapshot_id: String,
    new_name: String,
) -> Result<(), String> {
    let repo = lock_snapshot_repo(&repository)?;
    repo.rename_snapshot(&client_id, &snapshot_id, new_name)
}

#[tauri::command]
pub fn set_max_snapshots(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    max: usize,
) -> Result<(), String> {
    let repo = lock_snapshot_repo(&repository)?;
    repo.set_max_snapshots(&client_id, max)
}

#[tauri::command]
pub fn set_max_auto_snapshots(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    max: usize,
) -> Result<(), String> {
    let repo = lock_snapshot_repo(&repository)?;
    repo.set_max_auto_snapshots(&client_id, max)
}

#[tauri::command]
pub fn set_max_manual_snapshots(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    max: usize,
) -> Result<(), String> {
    let repo = lock_snapshot_repo(&repository)?;
    repo.set_max_manual_snapshots(&client_id, max)
}

#[tauri::command]
pub fn refresh_tray_menu(app_handle: tauri::AppHandle) -> Result<(), String> {
    tray::refresh_tray_menu(&app_handle).map_err(|err| err.to_string())
}

fn restore_snapshot_core<R: Runtime>(
    app_handle: AppHandle<R>,
    snapshot_repository: Arc<Mutex<SnapshotRepository>>,
    client_repository: Arc<Mutex<ClientRepository>>,
    watcher_state: Arc<Mutex<ConfigFileWatcher>>,
    client_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    let snapshot = {
        let repo = lock_snapshot_arc(&snapshot_repository)?;
        repo.restore_snapshot(&client_id, &snapshot_id)?
    };

    let client = {
        let repo = lock_client_arc(&client_repository)?;
        repo.get_by_id(&client_id)?
            .ok_or_else(|| "未找到指定客户端".to_string())?
    };

    let previous_watch_path = pause_watcher(&watcher_state)?;

    let write_result = if snapshot.is_multi_file() {
        restore_multi_file_snapshot(snapshot.get_file_contents())
    } else {
        let target_path = client
            .resolve_config_path(None)
            .map_err(|err| format!("解析配置文件路径失败: {}", err))?;
        write_files_atomically(vec![(target_path, snapshot.content.clone())])
    };

    let resume_result = resume_watcher(&watcher_state, &app_handle, previous_watch_path);

    match write_result {
        Ok(updated_paths) => {
            if let Err(err) = resume_result {
                return Err(err);
            }
            emit_config_reload_events(&app_handle, &client_id, &updated_paths);
            Ok(())
        }
        Err(err) => {
            if let Err(resume_err) = resume_result {
                eprintln!("[Snapshot] 恢复失败后重启监听器失败: {}", resume_err);
            }
            Err(err)
        }
    }
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

fn restore_multi_file_snapshot(contents: HashMap<String, String>) -> Result<Vec<String>, String> {
    if contents.is_empty() {
        return Err("快照未包含任何配置文件内容".to_string());
    }
    let mut entries: Vec<(String, String)> = contents.into_iter().collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    write_files_atomically(entries)
}

struct WrittenFile {
    path: PathBuf,
    existed: bool,
    original_content: String,
}

fn write_files_atomically(entries: Vec<(String, String)>) -> Result<Vec<String>, String> {
    let mut written: Vec<WrittenFile> = Vec::new();
    let mut updated_paths = Vec::new();

    for (path, content) in entries {
        let expanded = expand_tilde(&path);
        let read_result = fs::read_to_string(&expanded);
        let (existed, original_content) = match read_result {
            Ok(value) => (true, value),
            Err(err) if err.kind() == ErrorKind::NotFound => (false, String::new()),
            Err(err) => {
                rollback_written_files(&written);
                return Err(format!("读取配置文件失败: {} ({})", path, err));
            }
        };

        if let Err(err) = atomic_write(&expanded, &content) {
            rollback_written_files(&written);
            return Err(format!("写入配置文件失败: {} ({})", path, err));
        }

        updated_paths.push(expanded.to_string_lossy().to_string());
        written.push(WrittenFile {
            path: expanded,
            existed,
            original_content,
        });
    }

    Ok(updated_paths)
}

fn rollback_written_files(written: &[WrittenFile]) {
    for file in written.iter().rev() {
        if file.existed {
            if let Err(err) = atomic_write(&file.path, &file.original_content) {
                eprintln!("[Snapshot] 回滚写入失败: {} ({})", file.path.display(), err);
            }
        } else if file.path.exists() {
            if let Err(err) = fs::remove_file(&file.path) {
                eprintln!(
                    "[Snapshot] 删除临时文件失败: {} ({})",
                    file.path.display(),
                    err
                );
            }
        }
    }
}

fn pause_watcher(watcher_state: &Arc<Mutex<ConfigFileWatcher>>) -> Result<Option<PathBuf>, String> {
    let mut watcher = watcher_state
        .lock()
        .map_err(|e| format!("获取文件监听器失败: {}", e))?;
    let watched = watcher.current_path();
    watcher.stop();
    Ok(watched)
}

fn resume_watcher<R: Runtime>(
    watcher_state: &Arc<Mutex<ConfigFileWatcher>>,
    app_handle: &AppHandle<R>,
    path: Option<PathBuf>,
) -> Result<(), String> {
    if let Some(path) = path {
        let mut watcher = watcher_state
            .lock()
            .map_err(|e| format!("获取文件监听器失败: {}", e))?;
        watcher
            .watch_file(path, app_handle.clone())
            .map_err(|err| format!("重新启动文件监听器失败: {}", err))?;
    }
    Ok(())
}

fn emit_config_reload_events<R: Runtime>(
    app_handle: &AppHandle<R>,
    client_id: &str,
    paths: &[String],
) {
    for path in paths {
        let payload = ConfigReloadPayload {
            client_id: client_id.to_string(),
            path: path.clone(),
        };
        if let Err(err) = app_handle.emit(CONFIG_RELOAD_SILENT_EVENT, payload) {
            eprintln!("[Snapshot] 发送配置刷新事件失败: {}", err);
        }
    }
}
