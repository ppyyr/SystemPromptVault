# Tauri v2 快速初始化和命令系统实战指南

## Code Sections

### 基础项目结构模板

- `src-tauri/Cargo.toml` (核心依赖配置): 必需的运行时和编译时依赖

  ```toml
  [package]
  name = "sysprompt-switcher"
  version = "1.0.0"
  description = "配置文件切换工具"
  authors = ["you"]
  edition = "2021"

  [lib]
  name = "sysprompt_switcher_lib"
  crate-type = ["cdylib", "staticlib", "lib"]

  [build-dependencies]
  tauri-build = { version = "2.0", features = [] }

  [dependencies]
  tauri = { version = "2.0", features = ["shell-open"] }
  serde = { version = "1.0", features = ["derive"] }
  serde_json = "1.0"
  chrono = { version = "0.4", features = ["serde"] }
  dirs = "5.0"
  uuid = { version = "1.0", features = ["v4"] }
  tokio = { version = "1", features = ["full"] }
  thiserror = "1.0"

  [profile.release]
  strip = true
  lto = true
  codegen-units = 1
  panic = "abort"
  ```

- `src-tauri/src/main.rs` (桌面应用入口): 标准入口点，不应修改

  ```rust
  #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

  fn main() {
      tauri_app_lib::run()
  }
  ```

- `src-tauri/src/lib.rs` (主库文件): 命令注册和应用初始化

  ```rust
  use tauri::Manager;

  #[cfg_attr(mobile, tauri::mobile_entry_point)]
  pub fn run() {
      tauri::Builder::default()
          .plugin(tauri_plugin_shell::init())
          .plugin(tauri_plugin_dialog::init())
          .plugin(tauri_plugin_fs::init())
          .invoke_handler(tauri::generate_handler![
              get_app_data_dir,
              select_directory,
              read_config_file,
              write_config_file
          ])
          .setup(|app| {
              #[cfg(debug_assertions)]
              {
                  let window = app.get_webview_window("main").unwrap();
                  window.open_devtools();
              }
              Ok(())
          })
          .run(tauri::generate_context!())
          .expect("error while running tauri application");
  }
  ```

### 命令定义和注册

- `src-tauri/src/commands.rs` (命令模块): 核心 API 功能实现

  ```rust
  use serde::{Deserialize, Serialize};
  use tauri::command;
  use std::path::PathBuf;

  #[derive(Debug, Serialize, Deserialize)]
  pub struct ConfigFile {
      pub path: String,
      pub content: String,
      pub modified: String,
  }

  #[command]
  pub fn get_app_data_dir() -> Result<String, String> {
      match dirs::data_dir() {
          Some(mut path) => {
              path.push("SysPromptSwitcher");
              std::fs::create_dir_all(&path)
                  .map_err(|e| format!("创建目录失败: {}", e))?;
              Ok(path.to_string_lossy().to_string())
          }
          None => Err("无法获取应用数据目录".to_string()),
      }
  }

  #[command]
  pub async fn select_directory() -> Result<Option<String>, String> {
      use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

      // 这里应该使用 dialog API，简化示例
      Ok(Some("/path/to/selected".to_string()))
  }

  #[command]
  pub async fn read_config_file(file_path: String) -> Result<String, String> {
      let path = PathBuf::from(&file_path);

      if !path.exists() {
          return Err("文件不存在".to_string());
      }

      match std::fs::read_to_string(&path) {
          Ok(content) => Ok(content),
          Err(e) => Err(format!("读取文件失败: {}", e)),
      }
  }

  #[command]
  pub async fn write_config_file(
      file_path: String,
      content: String
  ) -> Result<(), String> {
      let path = PathBuf::from(&file_path);

      // 确保父目录存在
      if let Some(parent) = path.parent() {
          std::fs::create_dir_all(parent)
              .map_err(|e| format!("创建目录失败: {}", e))?;
      }

      match std::fs::write(&path, content) {
          Ok(_) => Ok(()),
          Err(e) => Err(format!("写入文件失败: {}", e)),
      }
  }

  #[command]
  pub async fn list_config_files(directory: String) -> Result<Vec<ConfigFile>, String> {
      let dir_path = PathBuf::from(directory);

      if !dir_path.exists() || !dir_path.is_dir() {
          return Err("目录不存在或不是有效目录".to_string());
      }

      let mut configs = Vec::new();

      match std::fs::read_dir(dir_path) {
          Ok(entries) => {
              for entry in entries.flatten() {
                  let path = entry.path();
                  if path.is_file() {
                      if let Some(extension) = path.extension() {
                          if extension == "md" || extension == "json" || extension == "yaml" {
                              let metadata = std::fs::metadata(&path);
                              let modified = metadata
                                  .and_then(|m| m.modified())
                                  .map(|t| format!("{:?}", t))
                                  .unwrap_or_default();

                              let content = std::fs::read_to_string(&path)
                                  .unwrap_or_default();

                              configs.push(ConfigFile {
                                  path: path.to_string_lossy().to_string(),
                                  content,
                                  modified,
                              });
                          }
                      }
                  }
              }
              Ok(configs)
          }
          Err(e) => Err(format!("读取目录失败: {}", e)),
      }
  }
  ```

- `src-tauri/capabilities/default.json` (权限配置): 命令和文件系统访问权限

  ```json
  {
    "identifier": "default",
    "description": "Default capability set",
    "windows": ["main"],
    "permissions": [
      "core:default",
      "fs:default",
      "dialog:default",
      {
        "identifier": "fs:allow-read-text-file",
        "allow": [{ "path": "**/*" }]
      },
      {
        "identifier": "fs:allow-write-text-file",
        "allow": [{ "path": "**/*" }]
      },
      {
        "identifier": "fs:allow-mkdir",
        "allow": [{ "path": "**/*" }]
      }
    ]
  }
  ```

- `src-tauri/tauri.conf.json` (应用配置): 窗口和构建设置

  ```json
  {
    "productName": "SysPromptSwitcher",
    "version": "1.0.0",
    "identifier": "com.syspromptswitcher.app",
    "build": {
      "beforeDevCommand": "npm run dev",
      "beforeBuildCommand": "npm run build",
      "devUrl": "http://localhost:1420",
      "distDir": "../dist"
    },
    "app": {
      "windows": [
        {
          "label": "main",
          "title": "SysPrompt Switcher",
          "width": 900,
          "height": 700,
          "resizable": true,
          "fullscreen": false
        }
      ]
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "icon": ["icons/32x32.png", "icons/128x128.png"]
    }
  }
  ```

### 前端调用示例

- `dist/js/main.js` (前端 API 调用): JavaScript 与 Rust 通信

  ```javascript
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';

  class SysPromptSwitcher {
      constructor() {
          this.appDataDir = null;
          this.currentDirectory = null;
      }

      // 获取应用数据目录
      async getAppDataDir() {
          try {
              this.appDataDir = await invoke('get_app_data_dir');
              console.log('应用数据目录:', this.appDataDir);
              return this.appDataDir;
          } catch (error) {
              console.error('获取应用数据目录失败:', error);
              throw error;
          }
      }

      // 选择目录
      async selectDirectory() {
          try {
              const selected = await open({
                  directory: true,
                  multiple: false,
                  title: '选择配置目录'
              });

              if (selected) {
                  this.currentDirectory = selected;
                  await this.loadConfigFiles(selected);
              }
              return selected;
          } catch (error) {
              console.error('选择目录失败:', error);
              throw error;
          }
      }

      // 加载配置文件列表
      async loadConfigFiles(directory) {
          try {
              const files = await invoke('list_config_files', {
                  directory: directory
              });
              this.renderFileList(files);
              return files;
          } catch (error) {
              console.error('加载配置文件失败:', error);
              throw error;
          }
      }

      // 读取配置文件
      async readConfigFile(filePath) {
          try {
              const content = await invoke('read_config_file', {
                  filePath: filePath
              });
              return content;
          } catch (error) {
              console.error('读取配置文件失败:', error);
              throw error;
          }
      }

      // 写入配置文件
      async writeConfigFile(filePath, content) {
          try {
              await invoke('write_config_file', {
                  filePath: filePath,
                  content: content
              });
              console.log('配置文件保存成功');
          } catch (error) {
              console.error('写入配置文件失败:', error);
              throw error;
          }
      }

      // UI 渲染方法
      renderFileList(files) {
          const container = document.getElementById('file-list');
          container.innerHTML = '';

          files.forEach(file => {
              const fileItem = document.createElement('div');
              fileItem.className = 'file-item';
              fileItem.innerHTML = `
                  <div class="file-info">
                      <div class="file-path">${file.path}</div>
                      <div class="file-modified">修改时间: ${file.modified}</div>
                  </div>
                  <div class="file-actions">
                      <button onclick="app.editFile('${file.path}')">编辑</button>
                      <button onclick="app.switchToFile('${file.path}')">切换</button>
                  </div>
              `;
              container.appendChild(fileItem);
          });
      }

      async editFile(filePath) {
          try {
              const content = await this.readConfigFile(filePath);
              const editor = document.getElementById('config-editor');
              const filePathDisplay = document.getElementById('current-file-path');

              editor.value = content;
              filePathDisplay.textContent = filePath;
              editor.dataset.filePath = filePath;
          } catch (error) {
              this.showError('编辑文件失败: ' + error);
          }
      }

      async saveCurrentFile() {
          const editor = document.getElementById('config-editor');
          const filePath = editor.dataset.filePath;

          if (!filePath) {
              this.showError('没有正在编辑的文件');
              return;
          }

          try {
              await this.writeConfigFile(filePath, editor.value);
              this.showSuccess('文件保存成功');
          } catch (error) {
              this.showError('保存文件失败: ' + error);
          }
      }

      async switchToFile(filePath) {
          // 实现配置切换逻辑
          console.log('切换到配置:', filePath);
          // 这里可以添加实际的配置切换实现
      }

      showError(message) {
          alert('错误: ' + message);
      }

      showSuccess(message) {
          alert('成功: ' + message);
      }
  }

  // 初始化应用
  const app = new SysPromptSwitcher();

  // 页面加载完成后初始化
  document.addEventListener('DOMContentLoaded', async () => {
      try {
          await app.getAppDataDir();
          console.log('SysPromptSwitcher 初始化完成');
      } catch (error) {
          console.error('应用初始化失败:', error);
      }
  });

  // 保存按钮事件
  document.getElementById('save-btn')?.addEventListener('click', () => {
      app.saveCurrentFile();
  });

  // 选择目录按钮事件
  document.getElementById('select-dir-btn')?.addEventListener('click', () => {
      app.selectDirectory();
  });
  ```

## Report

### conclusions

- Tauri v2 项目使用前后端分离架构：前端静态文件 + Rust 后端服务
- 命令使用 `#[tauri::command]` 宏定义，通过 `tauri::generate_handler!` 注册
- capabilities/default.json 控制安全权限，必须在此允许命令才能在前端使用
- 前端通过 `invoke()` API 调用 Rust 命令，支持 Promise 基础的异步处理
- 文件系统操作需要相应的权限配置，支持读写、目录创建等操作

### relations

- `src-tauri/src/lib.rs` → `src-tauri/src/commands.rs`：主库注册命令模块
- `src-tauri/capabilities/default.json` ← `src-tauri/src/commands.rs`：权限配置控制命令访问
- `dist/js/main.js` → `src-tauri/src/commands.rs`：前端通过 invoke 调用后端命令
- `src-tauri/Cargo.toml` → `src-tauri/src/lib.rs`：依赖配置影响可用功能

### result

Tauri v2 提供了类型安全的命令系统，支持前后端异步通信。项目初始化需要配置 Cargo.toml、tauri.conf.json 和 capabilities。命令定义支持参数传递、错误处理和文件系统访问。前端使用 invoke API 实现与 Rust 后端的交互。

### attention

- JavaScript 使用 camelCase，Rust 使用 snake_case，参数名会自动转换
- 异步命令必须使用 `async fn` 定义，返回类型为 `Result<T, String>`
- 文件路径建议使用 PathBuf 进行跨平台处理
- capabilities 权限配置是 v2 新增安全机制，必须正确配置
- 开发时需要安装 Tauri CLI: `npm install -g @tauri-apps/cli`