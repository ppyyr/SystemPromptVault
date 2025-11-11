use crate::models::Snapshot;
use crate::storage::snapshot_repository::SnapshotRepository;
use crate::tray;
use std::sync::{Arc, Mutex};
use tauri::State;

fn lock_repo<'a>(
    state: &'a State<'_, Arc<Mutex<SnapshotRepository>>>,
) -> Result<std::sync::MutexGuard<'a, SnapshotRepository>, String> {
    state
        .lock()
        .map_err(|e| format!("获取快照仓库锁失败: {}", e))
}

#[tauri::command]
pub fn create_snapshot(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    name: String,
    content: String,
    is_auto: bool,
) -> Result<Snapshot, String> {
    let repo = lock_repo(&repository)?;
    repo.create_snapshot(&client_id, name, content, is_auto)
}

#[tauri::command]
pub fn get_snapshots(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
) -> Result<Vec<Snapshot>, String> {
    let repo = lock_repo(&repository)?;
    repo.get_snapshots(&client_id)
}

#[tauri::command]
pub fn restore_snapshot(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    snapshot_id: String,
) -> Result<String, String> {
    let repo = lock_repo(&repository)?;
    repo.restore_snapshot(&client_id, &snapshot_id)
}

#[tauri::command]
pub fn delete_snapshot(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    let repo = lock_repo(&repository)?;
    repo.delete_snapshot(&client_id, &snapshot_id)
}

#[tauri::command]
pub fn rename_snapshot(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    snapshot_id: String,
    new_name: String,
) -> Result<(), String> {
    let repo = lock_repo(&repository)?;
    repo.rename_snapshot(&client_id, &snapshot_id, new_name)
}

#[tauri::command]
pub fn set_max_snapshots(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    max: usize,
) -> Result<(), String> {
    let repo = lock_repo(&repository)?;
    repo.set_max_snapshots(&client_id, max)
}

#[tauri::command]
pub fn refresh_tray_menu(app_handle: tauri::AppHandle) -> Result<(), String> {
    tray::refresh_tray_menu(&app_handle).map_err(|err| err.to_string())
}
