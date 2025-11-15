use std::io::{Error as IoError, ErrorKind};
use std::sync::{Arc, Mutex};

use crate::commands;
use crate::file_watcher::ConfigFileWatcher;
use crate::models::{ClientConfig, Snapshot};
use crate::storage::{
    client_repository::ClientRepository, snapshot_repository::SnapshotRepository,
};
use chrono::{DateTime, Local};
use serde::Serialize;
use tauri::menu::{IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const SNAPSHOT_MENU_PREFIX: &str = "restore_snapshot_";
const SNAPSHOT_CREATE_ID: &str = "snapshot-create";
const SNAPSHOT_MANAGE_ID: &str = "snapshot-manage";
const SNAPSHOT_EVENT_NAME: &str = "tray://snapshot-restored";
const NO_SNAPSHOT_PLACEHOLDER: &str = "暂无可用快照";
const NO_CLIENT_SNAPSHOT_PLACEHOLDER: &str = "暂无快照";
const CLIENT_MENU_PREFIX: &str = "client_menu_";

/// 创建macOS应用菜单
pub fn build_app_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let menu = Menu::new(app_handle)?;

    // File 菜单
    let file_menu = build_file_menu(app_handle)?;
    menu.append(&file_menu)?;

    // Edit 菜单 (必须添加,否则macOS系统编辑快捷键会失效)
    let edit_menu = build_edit_menu(app_handle)?;
    menu.append(&edit_menu)?;

    // Snapshot 菜单
    let snapshot_menu = build_snapshot_menu(app_handle)?;
    menu.append(&snapshot_menu)?;

    // Help 菜单
    let help_menu = build_help_menu(app_handle)?;
    menu.append(&help_menu)?;

    Ok(menu)
}

/// Rebuild the app menu contents in-place.
pub fn refresh_app_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<(), tauri::Error> {
    let menu = build_app_menu(app_handle)?;
    app_handle.set_menu(menu)?;
    Ok(())
}

/// 构建 File 菜单
fn build_file_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    // 创建 Open 菜单项
    let open_item = MenuItem::with_id(app_handle, "open", "Open", true, None::<&str>)?;

    // 创建 Settings 菜单项 (macOS标准 Cmd+,)
    let settings_item = MenuItem::with_id(
        app_handle,
        "settings",
        "Settings",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    // 创建分隔符
    let separator = PredefinedMenuItem::separator(app_handle)?;

    // 创建 Close Window 菜单项
    let close_item = PredefinedMenuItem::close_window(app_handle, None)?;

    // 创建第二个分隔符和 Quit 菜单项
    let separator2 = PredefinedMenuItem::separator(app_handle)?;
    let quit_item = MenuItem::with_id(app_handle, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;

    // 创建 File 子菜单
    let file_submenu = Submenu::with_id_and_items(
        app_handle,
        "file",
        "File",
        true,
        &[
            &open_item,
            &settings_item,
            &separator,
            &close_item,
            &separator2,
            &quit_item,
        ],
    )?;

    Ok(file_submenu)
}

/// 构建 Edit 菜单 (macOS标准编辑菜单,提供系统级快捷键支持)
fn build_edit_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    // 使用Tauri预定义的标准编辑菜单项,自动包含快捷键
    let undo_item = PredefinedMenuItem::undo(app_handle, None)?;
    let redo_item = PredefinedMenuItem::redo(app_handle, None)?;
    let separator1 = PredefinedMenuItem::separator(app_handle)?;
    let cut_item = PredefinedMenuItem::cut(app_handle, None)?;
    let copy_item = PredefinedMenuItem::copy(app_handle, None)?;
    let paste_item = PredefinedMenuItem::paste(app_handle, None)?;
    let select_all_item = PredefinedMenuItem::select_all(app_handle, None)?;

    // 创建 Edit 子菜单
    let edit_submenu = Submenu::with_id_and_items(
        app_handle,
        "edit",
        "Edit",
        true,
        &[
            &undo_item,
            &redo_item,
            &separator1,
            &cut_item,
            &copy_item,
            &paste_item,
            &select_all_item,
        ],
    )?;

    Ok(edit_submenu)
}

fn build_snapshot_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    let create_item =
        MenuItem::with_id(app_handle, SNAPSHOT_CREATE_ID, "Create", true, None::<&str>)?;
    let manage_item =
        MenuItem::with_id(app_handle, SNAPSHOT_MANAGE_ID, "Manage", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app_handle)?;

    let client_submenus = build_client_submenus_for_app_menu(app_handle)?;
    let placeholder_item = if client_submenus.is_empty() {
        Some(MenuItem::new(
            app_handle,
            NO_SNAPSHOT_PLACEHOLDER,
            false,
            None::<&str>,
        )?)
    } else {
        None
    };

    let mut items: Vec<&dyn IsMenuItem<R>> = Vec::new();
    items.push(&create_item);
    items.push(&manage_item);
    items.push(&separator);

    if let Some(placeholder) = placeholder_item.as_ref() {
        items.push(placeholder as &dyn IsMenuItem<R>);
    } else {
        for submenu in &client_submenus {
            items.push(submenu as &dyn IsMenuItem<R>);
        }
    }

    Submenu::with_id_and_items(app_handle, "snapshot", "Snapshot", true, &items)
}

/// 构建 Help 菜单
fn build_help_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Submenu<R>, tauri::Error> {
    // 创建 About 菜单项
    let about_item = MenuItem::with_id(app_handle, "about", "About", true, None::<&str>)?;

    // 创建 Help 子菜单
    let help_submenu =
        Submenu::with_id_and_items(app_handle, "help", "Help", true, &[&about_item])?;

    Ok(help_submenu)
}

/// 处理应用菜单事件
pub fn handle_menu_event<R: Runtime>(
    app_handle: &AppHandle<R>,
    event: &MenuEvent,
) -> Result<(), String> {
    let id = event.id().as_ref();

    match id {
        "open" => {
            // 显示文件选择对话框
            if let Some(window) = app_handle.get_webview_window("main") {
                window.show().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
                // 向前端发送打开文件事件
                window
                    .emit("menu://file-open", ())
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        "settings" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                window.show().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
                window
                    .emit("menu://settings", ())
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        SNAPSHOT_CREATE_ID => {
            if let Some(window) = app_handle.get_webview_window("main") {
                window.show().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
                window
                    .emit("menu://snapshot-create", ())
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        SNAPSHOT_MANAGE_ID => {
            if let Some(window) = app_handle.get_webview_window("main") {
                window.show().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
                window
                    .emit("menu://snapshot-manage", ())
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        "about" => {
            show_about_dialog(app_handle);
            Ok(())
        }
        "quit" => handle_quit_menu(app_handle),
        _ => {
            if let Some(rest) = id.strip_prefix(SNAPSHOT_MENU_PREFIX) {
                if let Some(idx) = rest.rfind('_') {
                    let (client_raw, snapshot_raw) = rest.split_at(idx);
                    let snapshot_id = &snapshot_raw[1..];
                    restore_snapshot_from_app_menu(app_handle, client_raw, snapshot_id)?;
                }
            }
            Ok(())
        }
    }
}

/// 处理退出菜单
fn handle_quit_menu<R: Runtime>(app_handle: &AppHandle<R>) -> Result<(), String> {
    // 向主窗口发送退出前事件,让前端创建快照
    if let Some(window) = app_handle.get_webview_window("main") {
        window.emit("menu://quit", ()).map_err(|e| e.to_string())?;
    }

    // 给前端200ms时间创建快照,然后退出应用
    let app = app_handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        app.exit(0);
    });

    Ok(())
}

/// 显示关于对话框
fn show_about_dialog<R: Runtime>(app_handle: &AppHandle<R>) {
    // 检查About窗口是否已存在
    if let Some(about_window) = app_handle.get_webview_window("about") {
        let _ = about_window.set_focus();
        return;
    }

    // 使用独立的 about.html 文件
    let _ = WebviewWindowBuilder::new(app_handle, "about", WebviewUrl::App("about.html".into()))
        .title("About")
        .inner_size(320.0, 240.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
        .build();
}

fn build_client_submenus_for_app_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<Vec<Submenu<R>>, tauri::Error> {
    let mut clients = collect_clients_for_menu(app_handle)?;
    clients.sort_by(|a, b| a.name.cmp(&b.name));

    let snapshot_state = app_handle.state::<Arc<Mutex<SnapshotRepository>>>();
    let snapshot_repo = Arc::clone(snapshot_state.inner());

    let client_snapshot_pairs: Vec<(ClientConfig, Vec<Snapshot>)> = {
        let repo = snapshot_repo
            .lock()
            .map_err(|_| menu_error("获取快照仓库锁失败"))?;
        let mut data = Vec::with_capacity(clients.len());
        for client in &clients {
            let snapshots = repo
                .get_snapshots(&client.id)
                .map_err(|err| menu_error(err))?;
            data.push((client.clone(), snapshots));
        }
        data
    };

    let mut submenus = Vec::with_capacity(client_snapshot_pairs.len());
    for (client, snapshots) in client_snapshot_pairs {
        submenus.push(build_client_submenu_for_app(
            app_handle, &client, snapshots,
        )?);
    }

    Ok(submenus)
}

fn collect_clients_for_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<Vec<ClientConfig>, tauri::Error> {
    let client_state = app_handle.state::<Arc<Mutex<ClientRepository>>>();
    let repo = client_state
        .inner()
        .lock()
        .map_err(|_| menu_error("获取客户端仓库锁失败"))?;

    repo.get_all().map_err(|err| menu_error(err))
}

fn build_client_submenu_for_app<R: Runtime>(
    app_handle: &AppHandle<R>,
    client: &ClientConfig,
    snapshots: Vec<Snapshot>,
) -> Result<Submenu<R>, tauri::Error> {
    let snapshot_count = snapshots.len();
    let mut menu_items: Vec<MenuItem<R>> = Vec::new();

    if snapshots.is_empty() {
        menu_items.push(MenuItem::new(
            app_handle,
            NO_CLIENT_SNAPSHOT_PLACEHOLDER,
            false,
            None::<&str>,
        )?);
    } else {
        for snapshot in snapshots {
            let item_id = format!(
                "{SNAPSHOT_MENU_PREFIX}{}_{}",
                client.id.as_str(),
                snapshot.id
            );
            menu_items.push(MenuItem::with_id(
                app_handle,
                item_id,
                format_snapshot_label(&snapshot, snapshot.is_auto),
                true,
                None::<&str>,
            )?);
        }
    }

    let mut item_refs: Vec<&dyn IsMenuItem<R>> = Vec::with_capacity(menu_items.len());
    for item in &menu_items {
        item_refs.push(item as &dyn IsMenuItem<R>);
    }

    Submenu::with_id_and_items(
        app_handle,
        format!("{CLIENT_MENU_PREFIX}{}", client.id),
        format_client_label(client, snapshot_count),
        true,
        &item_refs,
    )
}

fn format_client_label(client: &ClientConfig, snapshot_count: usize) -> String {
    format!("{}({})", client.name, snapshot_count)
}

fn format_snapshot_label(snapshot: &Snapshot, is_auto: bool) -> String {
    let local_time: DateTime<Local> = snapshot.created_at.with_timezone(&Local);
    let timestamp = local_time.format("%Y-%m-%d %H:%M:%S");
    if is_auto {
        format!("Auto Saved {}", timestamp)
    } else {
        format!("{} {}", snapshot.name, timestamp)
    }
}

fn restore_snapshot_from_app_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
    client_id: &str,
    snapshot_id: &str,
) -> Result<(), String> {
    let snapshot_state = app_handle.state::<Arc<Mutex<SnapshotRepository>>>();
    let snapshot_repo = Arc::clone(snapshot_state.inner());
    let client_state = app_handle.state::<Arc<Mutex<ClientRepository>>>();
    let watcher_state = app_handle.state::<Arc<Mutex<ConfigFileWatcher>>>();

    commands::snapshot::restore_snapshot_from_tray(
        app_handle.clone(),
        Arc::clone(&snapshot_repo),
        Arc::clone(client_state.inner()),
        Arc::clone(watcher_state.inner()),
        client_id.to_string(),
        snapshot_id.to_string(),
    )?;

    if let Err(err) =
        notify_snapshot_restored_from_menu(app_handle, snapshot_repo, client_id, snapshot_id)
    {
        eprintln!("通知发送失败: {}", err);
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
struct SnapshotRestoredPayload {
    snapshot_name: String,
    created_at: String,
}

fn notify_snapshot_restored_from_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
    snapshot_repo: Arc<Mutex<SnapshotRepository>>,
    client_id: &str,
    snapshot_id: &str,
) -> Result<(), String> {
    let (snapshot_name, created_at_iso) = {
        let repo = snapshot_repo
            .lock()
            .map_err(|e| format!("获取快照仓库锁失败: {}", e))?;
        let snapshots = repo.get_snapshots(client_id)?;
        snapshots
            .into_iter()
            .find(|snapshot| snapshot.id == snapshot_id)
            .map(|snapshot| (snapshot.name, snapshot.created_at.to_rfc3339()))
            .unwrap_or_else(|| ("未知快照".to_string(), Local::now().to_rfc3339()))
    };

    let payload = SnapshotRestoredPayload {
        snapshot_name,
        created_at: created_at_iso,
    };

    app_handle
        .emit(SNAPSHOT_EVENT_NAME, payload)
        .map_err(|e| e.to_string())
}

fn menu_error(message: impl Into<String>) -> tauri::Error {
    tauri::Error::from(IoError::new(ErrorKind::Other, message.into()))
}
