# Tauri v2 项目架构和初始化指南

## Code Sections

### 标准项目结构示例

- `src-tauri/tauri.conf.json` (Tauri 主配置文件): 应用标识符、窗口配置、插件设置

  ```json
  {
    "productName": "SystemPromptVault",
    "version": "1.0.0",
    "identifier": "com.systemprompt-vault.app",
    "build": {
      "beforeDevCommand": "",
      "beforeBuildCommand": "",
      "devUrl": "http://localhost:1420",
      "distDir": "../dist"
    },
    "app": {
      "windows": [
        {
          "title": "SysPrompt Switcher",
          "width": 800,
          "height": 600,
          "resizable": true,
          "fullscreen": false
        }
      ]
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
    }
  }
  ```

- `src-tauri/src/main.rs` (桌面应用入口点): 调用库的运行函数

  ```rust
  // Copyright 2019-2023 Tauri Programme within the Commons Conservancy
  // SPDX-License-Identifier: Apache-2.0
  // SPDX-License-Identifier: MIT

  #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

  fn main() {
      tauri_app_lib::run()
  }
  ```

- `src-tauri/src/lib.rs` (Rust 代码和移动端入口): 主要修改文件

  ```rust
  // Copyright 2019-2023 Tauri Programme within the Commons Conservancy
  // SPDX-License-Identifier: Apache-2.0
  // SPDX-License-Identifier: MIT

  use tauri::Manager;

  #[cfg_attr(mobile, tauri::mobile_entry_point)]
  pub fn run() {
      tauri::Builder::default()
          .plugin(tauri_plugin_shell::init())
          .invoke_handler(tauri::generate_handler![greet])
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

  #[tauri::command]
  fn greet(name: &str) -> String {
      format!("Hello, {}! You've been greeted from Rust!", name)
  }
  ```

- `src-tauri/Cargo.toml` (Rust 依赖配置): 核心依赖和功能标志

  ```toml
  [package]
  name = "systemprompt-vault"
  version = "1.0.0"
  description = "A Tauri App"
  authors = ["you"]
  edition = "2021"

  [lib]
  name = "systemprompt_vault_lib"
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

  [profile.release]
  strip = true
  lto = true
  codegen-units = 1
  panic = "abort"
  ```

### 目录结构详解

- `src-tauri/capabilities/default.json` (权限配置文件): 命令和文件系统访问权限

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
        "allow": [{ "path": "$APPDATA/*" }]
      },
      {
        "identifier": "fs:allow-write-text-file",
        "allow": [{ "path": "$APPDATA/*" }]
      },
      {
        "identifier": "fs:allow-mkdir",
        "allow": [{ "path": "$APPDATA/**/*" }]
      }
    ]
  }
  ```

### 构建流程

- `src-tauri/build.rs` (构建脚本): Tauri 构建系统集成

  ```rust
  // Prevents additional console window on Windows in release, DO NOT REMOVE!!
  #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

  fn main() {
      tauri_build::build()
  }
  ```

## Report

### conclusions

- Tauri v2 项目由前端项目和位于 src-tauri/ 的 Rust 项目组成
- tauri.conf.json 是核心配置文件，包含应用标识符、窗口设置、构建配置
- src/lib.rs 是主要修改文件，包含命令定义和 invoke handler 注册
- capabilities/ 目录控制安全权限，必须在此允许命令才能在前端使用
- 构建流程先编译前端到静态文件，再编译 Rust 项目并打包这些文件

### relations

- `src-tauri/src/main.rs` → `src-tauri/src/lib.rs`：桌面入口调用库运行函数
- `src-tauri/tauri.conf.json` ← `src-tauri/capabilities/default.json`：配置文件引用权限设置
- `src-tauri/Cargo.toml` → `src-tauri/build.rs`：依赖配置影响构建过程
- `src-tauri/src/lib.rs` → `tauri::generate_handler!`：命令注册到 invoke 处理器

### result

Tauri v2 的标准项目结构包含：前端项目在根目录，Rust 项目在 src-tauri/ 子目录。关键文件包括 tauri.conf.json（主配置）、src/lib.rs（主要逻辑）、Cargo.toml（依赖管理）和 capabilities/default.json（权限配置）。项目支持平台特定配置文件（tauri.{platform}.conf.json）。

### attention

- src-tauri/src/main.rs 通常不应修改，应在 src/lib.rs 中添加代码
- tauri-build 和 tauri 依赖版本必须保持相同的最新次版本
- capabilities 系统是 v2 新增的安全机制，必须在此允许命令才能使用
- 应用数据目录需要手动创建，Tauri 不会自动创建不需要的目录