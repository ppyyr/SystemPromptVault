# Tauri v2 剪贴板功能实现和 Command 系统调研报告

> **状态**: 已废弃
> **废弃原因**: 项目已采用浏览器原生 Clipboard API 实现，移除了 Tauri 剪贴板插件依赖
> **废弃日期**: 2025-11-13

## Code Sections

### 现有项目架构分析

- `src-tauri/src/lib.rs` (主库文件): 现有命令注册模式和状态管理

  ```rust
  pub mod commands;
  pub mod file_watcher;
  pub mod models;
  pub mod storage;
  pub mod tray;
  pub mod utils;

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
              // ... 更多命令
          ])
          .run(tauri::generate_context!())
          .expect("SystemPromptVault Tauri 运行失败");
  }
  ```

- `src-tauri/src/commands/mod.rs` (命令模块): 公共函数和工具函数

  ```rust
  pub mod app_state;
  pub mod backup;
  pub mod client;
  pub mod config_file;
  pub mod file_watcher;
  pub mod project;
  pub mod prompt;
  pub mod snapshot;
  pub mod template;

  use crate::models::HistoryEntry;
  use crate::storage::JsonStore;
  use crate::utils::{atomic_write, normalize_path};

  pub fn ensure_app_dir() -> Result<PathBuf, String> {
      let mut dir = dirs::data_dir().ok_or_else(|| "无法定位应用数据目录".to_string())?;
      dir.push(APP_DIR_NAME);
      fs::create_dir_all(&dir).map_err(|e| format!("创建应用目录失败: {}", e))?;
      Ok(dir)
  }
  ```

- `src-tauri/src/commands/config_file.rs` (配置文件命令): 现有文件操作命令示例

  ```rust
  use tauri::command;
  use std::path::PathBuf;

  #[command]
  pub async fn read_config_file(path: String) -> Result<String, String> {
      let path = PathBuf::from(&path);
      if !path.exists() {
          return Err("配置文件不存在".to_string());
      }
      std::fs::read_to_string(&path)
          .map_err(|e| format!("读取配置文件失败: {}", e))
  }

  #[command]
  pub async fn write_config_file(path: String, content: String) -> Result<(), String> {
      let path = PathBuf::from(&path);
      if let Some(parent) = path.parent() {
          std::fs::create_dir_all(parent)
              .map_err(|e| format!("创建目录失败: {}", e))?;
      }
      std::fs::write(&path, content)
          .map_err(|e| format!("写入配置文件失败: {}", e))
  }
  ```

- `src-tauri/Cargo.toml` (依赖配置): 当前依赖项

  ```toml
  [dependencies]
  tauri = { version = "2.0", features = ["tray-icon"] }
  tauri-plugin-dialog = "2.0"
  serde = { version = "1.0", features = ["derive"] }
  serde_json = "1.0"
  dirs = "5.0"
  chrono = { version = "0.4", features = ["serde"] }
  uuid = { version = "1.0", features = ["v4", "serde"] }
  # ... 其他依赖
  ```

- `src-tauri/tauri.conf.json` (Tauri 配置): 权限和能力配置

  ```json
  {
    "app": {
      "security": {
        "capabilities": [
          {
            "identifier": "main-capability",
            "description": "Main application capabilities",
            "windows": ["main"],
            "permissions": [
              "core:default",
              "core:event:default",
              "core:event:allow-listen",
              "core:event:allow-emit",
              "core:window:default",
              "core:tray:default"
            ]
          }
        ]
      }
    }
  }
  ```

### 剪贴板插件集成示例

- `src-tauri/Cargo.toml` (更新后的依赖): 添加剪贴板插件

  ```toml
  [dependencies]
  tauri = { version = "2.0", features = ["tray-icon"] }
  tauri-plugin-dialog = "2.0"
  tauri-plugin-clipboard-manager = "2.0"  # 新增剪贴板插件
  # ... 其他现有依赖保持不变
  ```

- `src-tauri/src/commands/clipboard.rs` (新增剪贴板命令模块): 剪贴板操作命令

  ```rust
  use tauri::command;
  use tauri_plugin_clipboard_manager::ClipboardExt;

  #[command]
  pub async fn copy_text_to_clipboard(text: String) -> Result<(), String> {
      let app_handle = tauri::AppHandle::current();
      let clipboard = app_handle.clipboard();

      clipboard
          .write_text(&text)
          .map_err(|e| format!("复制到剪贴板失败: {}", e))
  }

  #[command]
  pub async fn get_clipboard_text() -> Result<String, String> {
      let app_handle = tauri::AppHandle::current();
      let clipboard = app_handle.clipboard();

      clipboard
          .read_text()
          .map_err(|e| format!("读取剪贴板失败: {}", e))?
          .ok_or_else(|| "剪贴板为空或不包含文本".to_string())
  }
  ```

- `src-tauri/src/commands/mod.rs` (更新模块导出): 添加剪贴板模块

  ```rust
  // 现有模块导入...
  pub mod clipboard;  // 新增剪贴板模块

  // 现有导出...
  pub use clipboard::{copy_text_to_clipboard, get_clipboard_text};  // 新增导出
  ```

- `src-tauri/src/lib.rs` (更新主库文件): 注册剪贴板命令

  ```rust
  tauri::Builder::default()
      .manage(prompt_repository)
      .manage(client_repository)
      .manage(file_watcher)
      .plugin(tauri_plugin_dialog::init())
      .plugin(tauri_plugin_clipboard_manager::init())  // 新增剪贴板插件初始化
      .invoke_handler(tauri::generate_handler![
          // 现有命令...
          commands::clipboard::copy_text_to_clipboard,  // 新增剪贴板命令
          commands::clipboard::get_clipboard_text,
      ])
      .run(tauri::generate_context!())
      .expect("SystemPromptVault Tauri 运行失败");
  ```

- `src-tauri/tauri.conf.json` (更新权限配置): 添加剪贴板权限

  ```json
  {
    "app": {
      "security": {
        "capabilities": [
          {
            "identifier": "main-capability",
            "description": "Main application capabilities",
            "windows": ["main"],
            "permissions": [
              "core:default",
              "core:event:default",
              "core:event:allow-listen",
              "core:event:allow-emit",
              "core:window:default",
              "core:tray:default",
              "clipboard-manager:allow-write-text",  // 新增剪贴板写入权限
              "clipboard-manager:allow-read-text"    // 新增剪贴板读取权限
            ]
          }
        ]
      }
    }
  }
  ```

### 前端集成示例

- `src/js/clipboard.js` (前端剪贴板服务): 封装剪贴板操作

  ```javascript
  import { invoke } from '@tauri-apps/api/core';

  export class ClipboardService {
      static async copyText(text) {
          try {
              await invoke('copy_text_to_clipboard', { text });
              return { success: true, message: '已复制到剪贴板' };
          } catch (error) {
              console.error('复制失败:', error);
              return { success: false, message: error };
          }
      }

      static async getClipboardText() {
          try {
              const text = await invoke('get_clipboard_text');
              return { success: true, text };
          } catch (error) {
              console.error('读取剪贴板失败:', error);
              return { success: false, error };
          }
      }
  }
  ```

- `src/js/components/config-dropdown.js` (配置下拉菜单组件): 右键菜单集成

  ```javascript
  import { ClipboardService } from '../clipboard.js';

  export class ConfigDropdown {
      constructor(container, configs) {
          this.container = container;
          this.configs = configs;
          this.init();
      }

      init() {
          this.render();
          this.setupContextMenu();
      }

      setupContextMenu() {
          this.container.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              const configItem = e.target.closest('[data-config-path]');
              if (configItem) {
                  const configPath = configItem.dataset.configPath;
                  this.showContextMenu(e.pageX, e.pageY, configPath);
              }
          });

          document.addEventListener('click', () => {
              this.hideContextMenu();
          });
      }

      showContextMenu(x, y, configPath) {
          const existingMenu = document.getElementById('context-menu');
          if (existingMenu) {
              existingMenu.remove();
          }

          const menu = document.createElement('div');
          menu.id = 'context-menu';
          menu.className = 'context-menu';
          menu.innerHTML = `
              <div class="context-menu-item" data-action="copy-path">
                  <span class="icon">📋</span>
                  复制完整路径
              </div>
          `;

          menu.style.left = x + 'px';
          menu.style.top = y + 'px';

          menu.addEventListener('click', async (e) => {
              const action = e.target.dataset.action;
              if (action === 'copy-path') {
                  const result = await ClipboardService.copyText(configPath);
                  if (result.success) {
                      this.showToast('路径已复制到剪贴板');
                  } else {
                      this.showToast('复制失败: ' + result.message, 'error');
                  }
              }
          });

          document.body.appendChild(menu);
      }

      hideContextMenu() {
          const menu = document.getElementById('context-menu');
          if (menu) {
              menu.remove();
          }
      }

      showToast(message, type = 'success') {
          // 实现提示消息显示
          console.log(`[${type.toUpperCase()}] ${message}`);
          alert(message); // 简单实现，可替换为更好的UI组件
      }
  }
  ```

## Report

### conclusions

- 项目使用模块化命令结构，命令按功能分类到不同文件中（template、project、config_file 等）
- Tauri v2 官方提供 `tauri-plugin-clipboard-manager` 插件支持剪贴板操作
- 剪贴板功能需要显式权限配置，包含在 capabilities 配置中
- 错误处理使用 `Result<T, String>` 模式，错误信息自动传递给前端
- 前端通过 `invoke()` API 调用后端命令，支持 Promise 基础的异步处理

### relations

- `src-tauri/src/lib.rs` → `src-tauri/src/commands/clipboard.rs`：主库注册剪贴板命令
- `src-tauri/src/commands/mod.rs` → `src-tauri/src/commands/clipboard.rs`：模块导出剪贴板函数
- `src-tauri/Cargo.toml` → `tauri-plugin-clipboard-manager`：依赖管理
- `src-tauri/tauri.conf.json` → `clipboard-manager:*`：权限配置
- 前端服务 `src/js/clipboard.js` → `invoke('copy_text_to_clipboard')`：前端调用后端命令

### result

项目现有的 Tauri Command 实现模式使用模块化结构，命令通过 `#[tauri::command]` 宏定义，在 `lib.rs` 中注册。剪贴板功能通过官方 `tauri-plugin-clipboard-manager` 插件实现，需要在 Cargo.toml 中添加依赖，在 tauri.conf.json 中配置权限，并创建专门的剪贴板命令模块。

### attention

- 剪贴板插件需要显式权限配置，默认不启用任何权限
- 错误处理必须使用 `Result<T, String>` 返回类型，错误信息会自动传递给前端
- 命令参数和返回值必须实现 serde 的 `Serialize` 和 `Deserialize` traits
- JavaScript 使用 camelCase，Rust 使用 snake_case，参数名会自动转换
- 新增命令必须在 capabilities 配置中被允许才能在前端使用
- 前端调用时参数名会自动从 camelCase 转换为 snake_case