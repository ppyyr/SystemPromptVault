#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};

use systemprompt_vault::file_watcher::ConfigFileWatcher;
use systemprompt_vault::storage::{
    client_repository::ClientRepository, prompt_repository::PromptRepository,
    snapshot_repository::SnapshotRepository,
};
use systemprompt_vault::{commands, tray};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

const DEFAULT_WINDOW_WIDTH: u32 = 1200;
const DEFAULT_WINDOW_HEIGHT: u32 = 1200;

fn main() {
    let data_dir = commands::ensure_app_dir().expect("初始化应用目录失败");
    let prompt_repository = Arc::new(Mutex::new(
        PromptRepository::new(data_dir.clone()).expect("初始化提示词存储失败"),
    ));
    let client_repository = Arc::new(Mutex::new(
        ClientRepository::new(data_dir.clone()).expect("初始化客户端存储失败"),
    ));
    let snapshot_repository = Arc::new(Mutex::new(
        SnapshotRepository::new(data_dir).expect("初始化快照存储失败"),
    ));
    let file_watcher = Arc::new(Mutex::new(ConfigFileWatcher::new()));

    tauri::Builder::default()
        .manage(prompt_repository)
        .manage(client_repository)
        .manage(snapshot_repository)
        .manage(file_watcher)
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            tray::init_tray(app).map_err(|err| Box::<dyn std::error::Error>::from(err))?;
            if let Some(window) = app.get_webview_window("main") {
                if let Err(err) = restore_window_state(&window) {
                    eprintln!("恢复窗口状态失败: {}", err);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::template::get_templates,
            commands::template::create_template,
            commands::template::update_template,
            commands::template::delete_template,
            commands::template::import_template_from_project,
            commands::project::select_project_directory,
            commands::project::apply_template,
            commands::project::get_project_config,
            commands::project::get_project_history,
            commands::backup::create_backup,
            commands::backup::list_backups,
            commands::backup::restore_backup,
            commands::backup::clean_old_backups,
            commands::prompt::get_all_prompts,
            commands::prompt::get_prompt_by_id,
            commands::prompt::get_prompts_by_tags,
            commands::prompt::create_prompt,
            commands::prompt::update_prompt,
            commands::prompt::delete_prompt,
            commands::prompt::export_prompts,
            commands::prompt::import_prompts,
            commands::client::get_all_clients,
            commands::client::get_client_by_id,
            commands::client::add_custom_client,
            commands::client::update_client,
            commands::client::delete_client,
            commands::client::export_clients,
            commands::client::import_clients,
            commands::config_file::read_config_file,
            commands::config_file::write_config_file,
            commands::config_file::get_user_home_dir,
            commands::file_watcher::start_watching_config,
            commands::file_watcher::stop_watching_config,
            commands::app_state::get_app_state,
            commands::app_state::set_current_client,
            commands::app_state::save_window_state,
            commands::app_state::get_window_state,
            commands::app_state::set_window_behavior,
            commands::app_state::get_window_behavior,
            commands::snapshot::create_snapshot,
            commands::snapshot::get_snapshots,
            commands::snapshot::restore_snapshot,
            commands::snapshot::delete_snapshot,
            commands::snapshot::rename_snapshot,
            commands::snapshot::set_max_snapshots,
            commands::snapshot::set_max_auto_snapshots,
            commands::snapshot::set_max_manual_snapshots,
            commands::snapshot::refresh_tray_menu,
        ])
        .run(tauri::generate_context!())
        .expect("SystemPromptVault Tauri 运行失败");
}

fn restore_window_state(window: &WebviewWindow) -> Result<(), String> {
    let saved = match commands::app_state::get_window_state()? {
        Some(state) => state,
        None => return Ok(()),
    };

    let desired_width = saved.width.max(1);
    let desired_height = saved.height.max(1);
    let monitors = window
        .available_monitors()
        .map_err(|err| format!("获取显示器信息失败: {}", err))?;

    if is_rect_visible(saved.x, saved.y, desired_width, desired_height, &monitors) {
        window
            .set_size(PhysicalSize::new(desired_width, desired_height))
            .map_err(|err| format!("设置窗口尺寸失败: {}", err))?;
        window
            .set_position(PhysicalPosition::new(saved.x, saved.y))
            .map_err(|err| format!("设置窗口位置失败: {}", err))?;
    } else {
        window
            .set_size(PhysicalSize::new(
                DEFAULT_WINDOW_WIDTH,
                DEFAULT_WINDOW_HEIGHT,
            ))
            .map_err(|err| format!("恢复默认窗口尺寸失败: {}", err))?;
        window
            .set_position(PhysicalPosition::new(0, 0))
            .map_err(|err| format!("恢复默认窗口位置失败: {}", err))?;
    }

    Ok(())
}

fn is_rect_visible(x: i32, y: i32, width: u32, height: u32, monitors: &[tauri::Monitor]) -> bool {
    if width == 0 || height == 0 {
        return false;
    }
    let rect_left = x;
    let rect_top = y;
    let rect_right = x.saturating_add(width as i32);
    let rect_bottom = y.saturating_add(height as i32);

    monitors.iter().any(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        let mon_left = position.x;
        let mon_top = position.y;
        let mon_right = mon_left.saturating_add(size.width as i32);
        let mon_bottom = mon_top.saturating_add(size.height as i32);

        rect_right > mon_left
            && rect_left < mon_right
            && rect_bottom > mon_top
            && rect_top < mon_bottom
    })
}
