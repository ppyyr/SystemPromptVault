use std::sync::{Arc, Mutex};

use crate::commands;
use crate::file_watcher::ConfigFileWatcher;
use crate::models::{ClientConfig, Snapshot};
use crate::storage::{
    client_repository::ClientRepository, snapshot_repository::SnapshotRepository,
};
use chrono::{DateTime, Local, Utc};
use serde::Serialize;
use tauri::menu::{IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Emitter, Manager, Runtime};

const TRAY_ID: &str = "systempromptvault_tray";
const SNAPSHOT_MENU_PREFIX: &str = "restore_snapshot_";
const SHOW_MAIN_WINDOW_MENU_ID: &str = "show_main_window";
const QUIT_MENU_ID: &str = "quit";
const SNAPSHOT_EVENT_NAME: &str = "tray://snapshot-restored";

#[derive(Debug, Clone, Serialize)]
struct SnapshotRestoredPayload {
    snapshot_name: String,
    created_at: String,
}

pub type TrayResult<T> = Result<T, TrayError>;

#[derive(Debug)]
pub struct TrayError(String);

impl TrayError {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }

    fn from_poison(target: &str) -> Self {
        Self(format!("获取 {target} 锁失败"))
    }
}

impl std::fmt::Display for TrayError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for TrayError {}

impl From<tauri::Error> for TrayError {
    fn from(value: tauri::Error) -> Self {
        Self::new(value.to_string())
    }
}

impl From<String> for TrayError {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

/// Initialize the tray icon during the Tauri `setup` hook.
pub fn init_tray(app: &App) -> TrayResult<()> {
    let handle = app.handle();
    let menu = build_tray_menu(&handle)?;
    create_tray_icon(&handle, menu)
}

/// Rebuild the tray menu contents in-place.
pub fn refresh_tray_menu<R: Runtime>(app_handle: &AppHandle<R>) -> TrayResult<()> {
    let menu = build_tray_menu(app_handle)?;
    if let Some(tray) = app_handle.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu)).map_err(TrayError::from)
    } else {
        create_tray_icon(app_handle, menu)
    }
}

/// Handle tray menu click events registered via `on_menu_event`.
pub fn handle_tray_event<R: Runtime>(
    app_handle: &AppHandle<R>,
    event: &MenuEvent,
) -> TrayResult<()> {
    let id = event.id().as_ref();
    if id == SHOW_MAIN_WINDOW_MENU_ID {
        show_main_window(app_handle)
    } else if id == QUIT_MENU_ID {
        app_handle.exit(0);
        Ok(())
    } else if let Some(rest) = id.strip_prefix(SNAPSHOT_MENU_PREFIX) {
        if let Some(idx) = rest.rfind('_') {
            let (client_raw, snapshot_raw) = rest.split_at(idx);
            let snapshot_id = &snapshot_raw[1..];
            restore_snapshot_from_menu(app_handle, client_raw, snapshot_id)
        } else {
            Ok(())
        }
    } else {
        Ok(())
    }
}

fn create_tray_icon<R: Runtime>(app_handle: &AppHandle<R>, menu: Menu<R>) -> TrayResult<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            if let Err(err) = crate::tray::handle_tray_event(app, &event) {
                eprintln!("托盘菜单处理失败: {}", err);
            }
        });

    if let Some(icon) = app_handle.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder
        .build(app_handle)
        .map_err(TrayError::from)
        .map(|_| ())
}

fn show_main_window<R: Runtime>(app_handle: &AppHandle<R>) -> TrayResult<()> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| TrayError::new("未找到主窗口"))?;
    window.show().map_err(TrayError::from)?;
    window.set_focus().map_err(TrayError::from)
}

fn restore_snapshot_from_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
    client_id: &str,
    snapshot_id: &str,
) -> TrayResult<()> {
    let snapshot_state = app_handle.state::<Arc<Mutex<SnapshotRepository>>>();
    let snapshot_repo = Arc::clone(snapshot_state.inner());
    let client_state = app_handle.state::<Arc<Mutex<ClientRepository>>>();
    let watcher_state = app_handle.state::<Arc<Mutex<ConfigFileWatcher>>>();

    commands::snapshot::restore_snapshot_from_tray(
        app_handle.clone(),
        Arc::clone(snapshot_state.inner()),
        Arc::clone(client_state.inner()),
        Arc::clone(watcher_state.inner()),
        client_id.to_string(),
        snapshot_id.to_string(),
    )
    .map_err(TrayError::from)?;

    let (snapshot_name, created_at_iso) = {
        let repo = snapshot_repo
            .lock()
            .map_err(|_| TrayError::from_poison("快照仓库"))?;
        let snapshots = repo.get_snapshots(client_id).map_err(TrayError::from)?;
        snapshots
            .iter()
            .find(|s| s.id == snapshot_id)
            .map(|s| (s.name.clone(), s.created_at.to_rfc3339()))
            .unwrap_or_else(|| ("未知快照".to_string(), Utc::now().to_rfc3339()))
    };
    eprintln!(
        "[Tray] Restored snapshot '{}' for client '{}'",
        snapshot_name, client_id
    );

    notify_snapshot_restored(app_handle, &snapshot_name, &created_at_iso);
    Ok(())
}

fn build_tray_menu<R: Runtime>(app_handle: &AppHandle<R>) -> TrayResult<Menu<R>> {
    let menu = Menu::new(app_handle).map_err(TrayError::from)?;

    let show_item = MenuItem::with_id(
        app_handle,
        SHOW_MAIN_WINDOW_MENU_ID,
        "Open",
        true,
        None::<&str>,
    )
    .map_err(TrayError::from)?;
    menu.append(&show_item).map_err(TrayError::from)?;

    let first_separator = PredefinedMenuItem::separator(app_handle).map_err(TrayError::from)?;
    menu.append(&first_separator).map_err(TrayError::from)?;

    let client_submenus = build_client_submenus(app_handle)?;
    if client_submenus.is_empty() {
        let placeholder = MenuItem::new(app_handle, "暂无可用快照", false, None::<&str>)
            .map_err(TrayError::from)?;
        menu.append(&placeholder).map_err(TrayError::from)?;
    } else {
        for submenu in client_submenus {
            menu.append(&submenu).map_err(TrayError::from)?;
        }
    }

    let second_separator = PredefinedMenuItem::separator(app_handle).map_err(TrayError::from)?;
    menu.append(&second_separator).map_err(TrayError::from)?;

    let quit_item = MenuItem::with_id(app_handle, QUIT_MENU_ID, "Quit", true, None::<&str>)
        .map_err(TrayError::from)?;
    menu.append(&quit_item).map_err(TrayError::from)?;

    Ok(menu)
}

fn build_client_submenus<R: Runtime>(app_handle: &AppHandle<R>) -> TrayResult<Vec<Submenu<R>>> {
    let mut clients = collect_clients(app_handle)?;
    clients.sort_by(|a, b| a.name.cmp(&b.name));

    let snapshot_state = app_handle.state::<Arc<Mutex<SnapshotRepository>>>();
    let snapshot_repo = Arc::clone(snapshot_state.inner());

    let mut data: Vec<(ClientConfig, Vec<Snapshot>)> = Vec::new();
    {
        let repo = snapshot_repo
            .lock()
            .map_err(|_| TrayError::from_poison("快照仓库"))?;
        for client in &clients {
            let snapshots = repo.get_snapshots(&client.id).map_err(TrayError::from)?;
            data.push((client.clone(), snapshots));
        }
    }

    let mut submenus = Vec::new();
    for (client, snapshots) in data {
        submenus.push(build_client_submenu(app_handle, &client, snapshots)?);
    }
    Ok(submenus)
}

fn build_client_submenu<R: Runtime>(
    app_handle: &AppHandle<R>,
    client: &ClientConfig,
    snapshots: Vec<Snapshot>,
) -> TrayResult<Submenu<R>> {
    let snapshot_count = snapshots.len();
    let mut menu_items: Vec<MenuItem<R>> = Vec::new();

    if snapshots.is_empty() {
        menu_items.push(
            MenuItem::new(app_handle, "暂无快照", false, None::<&str>).map_err(TrayError::from)?,
        );
    } else {
        for snapshot in snapshots {
            let item_id = format!(
                "{SNAPSHOT_MENU_PREFIX}{}_{}",
                client.id.as_str(),
                snapshot.id
            );
            menu_items.push(
                MenuItem::with_id(
                    app_handle,
                    item_id,
                    format_snapshot_label(&snapshot, snapshot.is_auto),
                    true,
                    None::<&str>,
                )
                .map_err(TrayError::from)?,
            );
        }
    }

    let mut item_refs: Vec<&dyn IsMenuItem<R>> = Vec::with_capacity(menu_items.len());
    for item in &menu_items {
        item_refs.push(item as &dyn IsMenuItem<R>);
    }

    Submenu::with_id_and_items(
        app_handle,
        format!("client_menu_{}", client.id),
        format_client_label(client, snapshot_count),
        true,
        &item_refs,
    )
    .map_err(TrayError::from)
}

fn collect_clients<R: Runtime>(app_handle: &AppHandle<R>) -> TrayResult<Vec<ClientConfig>> {
    let client_state = app_handle.state::<Arc<Mutex<ClientRepository>>>();
    let repo = client_state
        .inner()
        .lock()
        .map_err(|_| TrayError::from_poison("客户端仓库"))?;
    repo.get_all().map_err(TrayError::from)
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

fn notify_snapshot_restored<R: Runtime>(
    app_handle: &AppHandle<R>,
    snapshot_name: &str,
    created_at: &str,
) {
    let payload = SnapshotRestoredPayload {
        snapshot_name: snapshot_name.to_string(),
        created_at: created_at.to_string(),
    };

    if let Err(err) = app_handle.emit(SNAPSHOT_EVENT_NAME, payload) {
        eprintln!("通知发送失败: {}", err);
    }
}
