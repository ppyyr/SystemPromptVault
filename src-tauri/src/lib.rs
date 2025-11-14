pub mod commands;
pub mod file_watcher;
pub mod models;
pub mod storage;
pub mod tray;
pub mod utils;

use std::sync::{Arc, Mutex};

use commands::ensure_app_dir;
use file_watcher::ConfigFileWatcher;
use storage::client_repository::ClientRepository;
use storage::prompt_repository::PromptRepository;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = ensure_app_dir().expect("初始化应用目录失败");
    let prompt_repository = Arc::new(Mutex::new(
        PromptRepository::new(data_dir.clone()).expect("初始化提示词存储失败"),
    ));
    let client_repository = Arc::new(Mutex::new(
        ClientRepository::new(data_dir).expect("初始化客户端存储失败"),
    ));
    let file_watcher = Arc::new(Mutex::new(ConfigFileWatcher::new()));

    tauri::Builder::default()
        .manage(prompt_repository)
        .manage(client_repository)
        .manage(file_watcher)
        .plugin(tauri_plugin_dialog::init())
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
            commands::file_watcher::start_watching_config,
            commands::file_watcher::stop_watching_config,
            commands::app_state::get_app_state,
            commands::app_state::set_current_client
        ])
        .run(tauri::generate_context!())
        .expect("SystemPromptVault Tauri 运行失败");
}
