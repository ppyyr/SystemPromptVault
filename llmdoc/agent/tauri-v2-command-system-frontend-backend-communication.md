# Tauri v2 命令系统和前后端通信实现指南

## Code Sections

### 命令定义和注册

- `src-tauri/src/commands.rs` (命令模块): 独立模块的命令定义

  ```rust
  use serde::{Deserialize, Serialize};
  use tauri::State;
  use std::collections::HashMap;
  use std::path::PathBuf;
  use crate::app_state::AppState;

  #[derive(Debug, Serialize, Deserialize)]
  pub struct ConfigTemplate {
      pub id: String,
      pub name: String,
      pub description: String,
      pub content: String,
      pub created_at: String,
      pub updated_at: String,
  }

  #[derive(Debug, Serialize, Deserialize)]
  pub struct ProjectConfig {
      pub path: PathBuf,
      pub active_template: Option<String>,
      pub last_modified: String,
  }

  #[tauri::command]
  pub fn load_config_templates(state: State<AppState>) -> Result<Vec<ConfigTemplate>, String> {
      match state.config_store.get() {
          Some(config) => Ok(config.templates.values().cloned().collect()),
          None => Err("配置未初始化".to_string()),
      }
  }

  #[tauri::command]
  pub fn save_config_template(
      template: ConfigTemplate,
      state: State<AppState>,
  ) -> Result<(), String> {
      let mut config = state.config_store.lock().unwrap();
      config.templates.insert(template.id.clone(), template);

      if let Err(e) = state.config_store.save(&config) {
          return Err(format!("保存配置失败: {}", e));
      }

      Ok(())
  }

  #[tauri::command]
  pub async fn read_project_config(project_path: String) -> Result<String, String> {
      let config_path = PathBuf::from(project_path)
          .join(".claude")
          .join("CLAUDE.md");

      if !config_path.exists() {
          return Err("配置文件不存在".to_string());
      }

      match std::fs::read_to_string(config_path) {
          Ok(content) => Ok(content),
          Err(e) => Err(format!("读取文件失败: {}", e)),
      }
  }

  #[tauri::command]
  pub async fn write_project_config(
      project_path: String,
      content: String,
  ) -> Result<(), String> {
      let config_path = PathBuf::from(project_path)
          .join(".claude")
          .join("CLAUDE.md");

      // 确保目录存在
      if let Some(parent) = config_path.parent() {
          std::fs::create_dir_all(parent)
              .map_err(|e| format!("创建目录失败: {}", e))?;
      }

      match std::fs::write(config_path, content) {
          Ok(_) => Ok(()),
          Err(e) => Err(format!("写入文件失败: {}", e)),
      }
  }

  #[tauri::command]
  pub fn get_app_data_dir() -> Result<String, String> {
      match dirs::data_dir() {
          Some(mut path) => {
              path.push("SysPromptSwitcher");
              Ok(path.to_string_lossy().to_string())
          }
          None => Err("无法获取应用数据目录".to_string()),
      }
  }

  #[tauri::command]
  pub fn list_projects_in_directory(dir_path: String) -> Result<Vec<ProjectConfig>, String> {
      let path = PathBuf::from(dir_path);
      if !path.exists() || !path.is_dir() {
          return Err("目录不存在或不是有效目录".to_string());
      }

      let mut projects = Vec::new();

      match std::fs::read_dir(path) {
          Ok(entries) => {
              for entry in entries.flatten() {
                  let entry_path = entry.path();
                  if entry_path.is_dir() {
                      let config_path = entry_path.join(".claude").join("CLAUDE.md");
                      if config_path.exists() {
                          let metadata = std::fs::metadata(&config_path);
                          let last_modified = metadata
                              .map(|m| m.modified().ok())
                              .flatten()
                              .map(|t| format!("{:?}", t))
                              .unwrap_or_default();

                          projects.push(ProjectConfig {
                              path: entry_path,
                              active_template: None,
                              last_modified,
                          });
                      }
                  }
              }
              Ok(projects)
          }
          Err(e) => Err(format!("读取目录失败: {}", e)),
      }
  }
  ```

- `src-tauri/src/app_state.rs` (应用状态管理): 共享状态和配置存储

  ```rust
  use serde::{Deserialize, Serialize};
  use std::collections::HashMap;
  use std::sync::Mutex;
  use crate::commands::ConfigTemplate;
  use crate::storage::JsonStore;

  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct AppConfig {
      pub templates: HashMap<String, ConfigTemplate>,
      pub settings: AppSettings,
  }

  impl Default for AppConfig {
      fn default() -> Self {
          Self {
              templates: HashMap::new(),
              settings: AppSettings::default(),
          }
      }
  }

  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct AppSettings {
      pub auto_backup: bool,
      pub backup_count: usize,
      pub default_project_path: Option<String>,
  }

  impl Default for AppSettings {
      fn default() -> Self {
          Self {
              auto_backup: true,
              backup_count: 10,
              default_project_path: None,
          }
      }
  }

  pub struct AppState {
      pub config_store: JsonStore<AppConfig>,
  }
  ```

### 主应用集成

- `src-tauri/src/lib.rs` (主库文件): 命令注册和状态管理

  ```rust
  mod commands;
  mod app_state;
  mod storage;

  use commands::*;
  use app_state::*;
  use storage::*;
  use tauri::Manager;
  use std::path::PathBuf;

  #[cfg_attr(mobile, tauri::mobile_entry_point)]
  pub fn run() {
      // 初始化应用状态
      let app_data_dir = dirs::data_dir()
          .map(|mut path| {
              path.push("SysPromptSwitcher");
              std::fs::create_dir_all(&path).ok();
              path.join("config.json")
          })
          .unwrap_or_else(|| PathBuf::from("config.json"));

      let config_store = JsonStore::<AppConfig>::new(app_data_dir);
      let app_state = AppState { config_store };

      tauri::Builder::default()
          .plugin(tauri_plugin_shell::init())
          .plugin(tauri_plugin_dialog::init())
          .plugin(tauri_plugin_fs::init())
          .manage(app_state)
          .invoke_handler(tauri::generate_handler![
              load_config_templates,
              save_config_template,
              read_project_config,
              write_project_config,
              get_app_data_dir,
              list_projects_in_directory,
          ])
          .setup(|app| {
              // 初始化配置
              let state = app.state::<AppState>();
              let mut store = state.config_store.lock().unwrap();
              store.load().unwrap_or_else(|_| {
                  let default_config = AppConfig::default();
                  store.save(&default_config).ok();
              });

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

### 前端调用示例

- `dist/js/app.js` (前端 JavaScript): Tauri 命令调用和错误处理

  ```javascript
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';

  class ConfigManager {
      constructor() {
          this.templates = [];
          this.currentProject = null;
      }

      // 加载配置模板
      async loadConfigTemplates() {
          try {
              this.templates = await invoke('load_config_templates');
              this.renderTemplates();
          } catch (error) {
              console.error('加载配置模板失败:', error);
              this.showError('加载配置模板失败: ' + error);
          }
      }

      // 保存配置模板
      async saveConfigTemplate(template) {
          try {
              await invoke('save_config_template', { template });
              await this.loadConfigTemplates(); // 重新加载
              this.showSuccess('配置模板保存成功');
          } catch (error) {
              console.error('保存配置模板失败:', error);
              this.showError('保存配置模板失败: ' + error);
          }
      }

      // 选择项目目录
      async selectProjectDirectory() {
          try {
              const selected = await open({
                  directory: true,
                  multiple: false,
                  title: '选择项目目录'
              });

              if (selected) {
                  this.currentProject = selected;
                  await this.loadProjectConfig(selected);
              }
          } catch (error) {
              console.error('选择目录失败:', error);
              this.showError('选择目录失败: ' + error);
          }
      }

      // 读取项目配置
      async loadProjectConfig(projectPath) {
          try {
              const content = await invoke('read_project_config', {
                  projectPath
              });
              document.getElementById('config-content').value = content;
              document.getElementById('project-path').textContent = projectPath;
          } catch (error) {
              console.error('读取项目配置失败:', error);
              this.showError('读取项目配置失败: ' + error);
              // 清空内容
              document.getElementById('config-content').value = '';
          }
      }

      // 保存项目配置
      async saveProjectConfig() {
          if (!this.currentProject) {
              this.showError('请先选择项目目录');
              return;
          }

          try {
              const content = document.getElementById('config-content').value;
              await invoke('write_project_config', {
                  projectPath: this.currentProject,
                  content
              });
              this.showSuccess('项目配置保存成功');
          } catch (error) {
              console.error('保存项目配置失败:', error);
              this.showError('保存项目配置失败: ' + error);
          }
      }

      // 获取应用数据目录
      async getAppDataDirectory() {
          try {
              const appDataDir = await invoke('get_app_data_dir');
              console.log('应用数据目录:', appDataDir);
              return appDataDir;
          } catch (error) {
              console.error('获取应用数据目录失败:', error);
              return null;
          }
      }

      // 列出目录中的项目
      async listProjects(directory) {
          try {
              const projects = await invoke('list_projects_in_directory', {
                  dirPath: directory
              });
              this.renderProjectsList(projects);
          } catch (error) {
              console.error('列出项目失败:', error);
              this.showError('列出项目失败: ' + error);
          }
      }

      // 应用配置模板到项目
      async applyTemplate(templateId) {
          if (!this.currentProject) {
              this.showError('请先选择项目目录');
              return;
          }

          const template = this.templates.find(t => t.id === templateId);
          if (!template) {
              this.showError('模板不存在');
              return;
          }

          try {
              await invoke('write_project_config', {
                  projectPath: this.currentProject,
                  content: template.content
              });

              // 重新加载配置内容
              await this.loadProjectConfig(this.currentProject);
              this.showSuccess(`已应用模板: ${template.name}`);
          } catch (error) {
              console.error('应用模板失败:', error);
              this.showError('应用模板失败: ' + error);
          }
      }

      // UI 辅助方法
      renderTemplates() {
          const container = document.getElementById('templates-list');
          container.innerHTML = '';

          this.templates.forEach(template => {
              const div = document.createElement('div');
              div.className = 'template-item';
              div.innerHTML = `
                  <h3>${template.name}</h3>
                  <p>${template.description}</p>
                  <button onclick="configManager.applyTemplate('${template.id}')">
                      应用模板
                  </button>
              `;
              container.appendChild(div);
          });
      }

      renderProjectsList(projects) {
          const container = document.getElementById('projects-list');
          container.innerHTML = '';

          projects.forEach(project => {
              const div = document.createElement('div');
              div.className = 'project-item';
              div.innerHTML = `
                  <span>${project.path}</span>
                  <span>最后修改: ${project.last_modified}</span>
                  <button onclick="configManager.selectProjectFromList('${project.path}')">
                      选择项目
                  </button>
              `;
              container.appendChild(div);
          });
      }

      selectProjectFromList(projectPath) {
          this.currentProject = projectPath;
          this.loadProjectConfig(projectPath);
      }

      showSuccess(message) {
          // 显示成功消息
          this.showMessage(message, 'success');
      }

      showError(message) {
          // 显示错误消息
          this.showMessage(message, 'error');
      }

      showMessage(message, type) {
          // 实现消息显示逻辑
          console.log(`[${type.toUpperCase()}] ${message}`);
          alert(message); // 简单实现，实际应用中应使用更好的 UI
      }
  }

  // 初始化应用
  const configManager = new ConfigManager();

  // 页面加载完成后初始化
  document.addEventListener('DOMContentLoaded', async () => {
      await configManager.loadConfigTemplates();
      await configManager.getAppDataDirectory();
  });
  ```

### 错误处理模式

- `src-tauri/src/error.rs` (错误处理): 统一错误类型和处理

  ```rust
  use thiserror::Error;

  #[derive(Debug, Error)]
  pub enum AppError {
      #[error("IO 错误: {0}")]
      Io(#[from] std::io::Error),

      #[error("JSON 错误: {0}")]
      Json(#[from] serde_json::Error),

      #[error("配置错误: {0}")]
      Config(String),

      #[error("路径错误: {0}")]
      Path(String),

      #[error("权限错误: {0}")]
      Permission(String),
  }

  pub type AppResult<T> = Result<T, AppError>;

  // 为 Tauri 命令实现错误转换
  impl From<AppError> for String {
      fn from(error: AppError) -> Self {
          error.to_string()
      }
  }
  ```

## Report

### conclusions

- Tauri 命令使用 `#[tauri::command]` 宏定义，参数和返回值必须实现 serde 序列化
- 命令通过 `tauri::generate_handler!` 注册，前端使用 `invoke()` API 调用
- 应用状态通过 `tauri::State` 共享，支持跨命令数据共享
- 错误处理使用 `Result<T, String>` 模式，自定义错误类型可转换为 String
- 异步命令使用 `async fn` 定义，自动支持非阻塞执行

### relations

- `src-tauri/src/lib.rs` → `src-tauri/src/commands.rs`：主库注册命令模块
- `src-tauri/src/commands.rs` → `src-tauri/src/app_state.rs`：命令使用共享状态
- `src-tauri/src/app_state.rs` → `src-tauri/src/storage.rs`：状态管理使用存储层
- `dist/js/app.js` → `src-tauri/src/commands.rs`：前端调用后端命令

### result

Tauri v2 的命令系统提供了类型安全的前后端通信机制。命令定义支持参数传递、状态共享和异步执行。前端通过 invoke API 调用 Rust 命令，支持 Promise 基础的异步处理。错误处理通过 Result 类型实现统一的错误传递机制。

### attention

- JavaScript 使用 camelCase，Rust 使用 snake_case，参数名会自动转换
- 借用类型（如 &str）在异步命令中需要转换为 owned 类型
- 命令必须在 capabilities 文件中被允许才能在前端使用
- 复杂数据结构必须实现 serde 的 Serialize 和 Deserialize traits