# Tauri 后端窗口管理、配置存储和命令系统调查报告

## Code Sections

### 主要配置和窗口管理文件

- `src-tauri/src/main.rs` (主应用入口): Tauri应用初始化、命令注册、窗口状态恢复

  ```rust
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
      // 命令注册
      commands::app_state::save_window_state,
      commands::app_state::get_window_state,
      // ... 其他命令
  ])
  ```

- `src-tauri/src/commands/app_state.rs` (应用状态管理): 窗口状态保存和获取

  ```rust
  #[tauri::command]
  pub fn save_window_state(x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
      let mut state = load_state()?.unwrap_or_default();
      state.window_state = Some(WindowState { x, y, width, height });
      state.last_updated_at = Utc::now();
      save_state(&state)
  }

  #[tauri::command]
  pub fn get_window_state() -> Result<Option<WindowState>, String> {
      Ok(load_state()?.and_then(|state| state.window_state))
  }
  ```

- `src-tauri/src/models/app_state.rs` (状态数据结构): 应用状态和窗口状态数据模型

  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct AppState {
      pub current_client_id: String,
      pub last_updated_at: DateTime<Utc>,
      #[serde(default)]
      pub window_state: Option<WindowState>,
  }

  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct WindowState {
      pub x: i32,
      pub y: i32,
      pub width: u32,
      pub height: u32,
  }
  ```

### System Tray 窗口控制

- `src-tauri/src/tray.rs` (系统托盘): 托盘菜单窗口显示控制

  ```rust
  fn show_main_window<R: Runtime>(app_handle: &AppHandle<R>) -> TrayResult<()> {
      let window = app_handle
          .get_webview_window("main")
          .ok_or_else(|| TrayError::new("未找到主窗口"))?;
      window.show().map_err(TrayError::from)?;
      window.set_focus().map_err(TrayError::from)
  }

  pub fn handle_tray_event<R: Runtime>(
      app_handle: &AppHandle<R>,
      event: &MenuEvent,
  ) -> TrayResult<()> {
      let id = event.id().as_ref();
      if id == SHOW_MAIN_WINDOW_MENU_ID {
          show_main_window(app_handle)
      }
      // ... 其他事件处理
  }
  ```

### 配置存储系统

- `src-tauri/src/storage/json_store.rs` (JSON存储): 应用配置数据存储

  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct AppConfig {
      pub templates: Vec<Template>,
      pub projects: Vec<Project>,
      pub settings: AppSettings,
      pub updated_at: DateTime<Utc>,
  }

  pub struct JsonStore {
      path: PathBuf,
      config: AppConfig,
  }
  ```

- `src-tauri/src/commands/mod.rs` (工具函数): 应用目录创建和配置路径管理

  ```rust
  pub fn ensure_app_dir() -> Result<PathBuf, String> {
      let mut dir = dirs::data_dir().ok_or_else(|| "无法定位应用数据目录".to_string())?;
      dir.push(APP_DIR_NAME);
      fs::create_dir_all(&dir).map_err(|e| format!("创建应用目录失败: {}", e))?;
      Ok(dir)
  }
  ```

### 文件监听系统

- `src-tauri/src/file_watcher.rs` (文件监听器): 配置文件变更监听和事件发送

  ```rust
  pub struct ConfigFileWatcher {
      watcher: Option<RecommendedWatcher>,
      watched_path: Option<PathBuf>,
  }

  impl ConfigFileWatcher {
      pub fn watch_file<R: Runtime>(
          &mut self,
          path: PathBuf,
          app_handle: AppHandle<R>,
      ) -> Result<(), String> {
          let (tx, rx) = mpsc::channel::<Event>();
          let emitter_app = app_handle.clone();

          std::thread::spawn(move || {
              while let Ok(event) = rx.recv() {
                  let path_str = event.paths.first()
                      .map(|p| p.to_string_lossy().to_string());
                  let _ = emitter_app.emit("config-file-changed", path_str);
              }
          });
      }
  }
  ```

### Tauri 权限配置

- `src-tauri/tauri.conf.json` (应用配置): 窗口和事件权限设置

  ```json
  {
    "app": {
      "security": {
        "capabilities": [
          {
            "identifier": "main-capability",
            "permissions": [
              "core:window:default",
              "core:window:allow-set-title",
              "core:window:allow-close",
              "core:window:allow-set-position",
              "core:window:allow-set-size",
              "core:window:allow-hide",
              "core:window:allow-show",
              "core:window:allow-minimize",
              "core:window:allow-unminimize",
              "core:window:allow-maximize",
              "core:window:allow-unmaximize",
              "core:window:allow-is-minimized",
              "core:window:allow-is-maximized",
              "core:window:allow-is-focused",
              "core:window:allow-center",
              "core:event:default",
              "core:event:allow-listen",
              "core:event:allow-emit",
              "core:tray:default"
            ]
          }
        ]
      }
    }
  }
  ```

### 前端调用接口

- `dist/js/api.js` (前端API): 窗口状态管理API调用

  ```javascript
  export const AppStateAPI = {
    get: () => call("get_app_state"),
    setCurrentClient: (clientId) => call("set_current_client", { clientId }),
    saveWindowState: (x, y, width, height) =>
      call("save_window_state", { x, y, width, height }),
    getWindowState: () => call("get_window_state"),
    setWindowBehavior: (closeBehavior) =>
      call("set_window_behavior", { closeBehavior }),
    getWindowBehavior: () => call("get_window_behavior"),
  };
  ```

## Report

### conclusions

1. **窗口管理API**: Tauri提供了完整的窗口控制API，包括show(), hide(), minimize(), set_focus()等方法
2. **配置存储**: 使用JSON格式存储在用户数据目录，路径为`dirs::data_dir()/SystemPromptVault/app_state.json`
3. **命令注册系统**: 通过`#[tauri::command]`宏定义命令，使用`tauri::generate_handler!`批量注册
4. **状态管理**: 使用AppState结构体统一管理应用状态，支持窗口位置、尺寸和行为的持久化
5. **事件通信**: 前后端通过Tauri事件系统通信，支持config-file-changed等自定义事件
6. **文件监听**: 使用notify库实现配置文件变更监听，支持实时热更新
7. **System Tray集成**: 托盘菜单可以直接控制窗口显示/隐藏，已实现show_main_window功能
8. **窗口行为配置**: 新增窗口关闭行为配置系统，支持"最小化到托盘"和"直接退出"两种模式
9. **权限配置完善**: 已配置15个窗口操作权限，确保所有窗口操作的正常执行
10. **跨窗口同步**: 实现localStorage + Tauri自定义事件的双通道配置同步机制

### relations

- `src-tauri/src/main.rs` → `src-tauri/src/commands/app_state.rs`: 主应用调用窗口状态管理命令
- `src-tauri/src/commands/app_state.rs` → `src-tauri/src/models/app_state.rs`: 命令使用状态数据结构
- `src-tauri/src/tray.rs` → Tauri Window API: 托盘模块调用窗口显示API
- `src-tauri/src/file_watcher.rs` → Tauri Event API: 文件监听器发送事件到前端
- `dist/js/api.js` → `src-tauri/src/commands/`: 前端通过invoke调用后端命令
- `src-tauri/src/storage/json_store.rs` → 文件系统: 配置数据持久化存储

### result

Tauri后端实现了完整的窗口管理和配置存储系统。窗口状态通过AppState结构体持久化，支持位置、尺寸的保存和恢复。配置存储使用JSON格式，位于系统标准数据目录。命令系统采用声明式注册，前端通过统一的API层调用后端功能。文件监听器提供配置热更新能力，System Tray集成了基础的窗口控制功能。

### attention

1. **✅ 已实现窗口行为配置**: 窗口关闭行为配置系统已完整实现，支持托盘和退出两种模式
2. **✅ 窗口关闭事件已拦截**: 主窗口和设置窗口均已实现 onCloseRequested 事件处理
3. **✅ 跨窗口配置同步**: 已实现 localStorage + Tauri 自定义事件的双通道同步机制
4. **✅ 权限配置完善**: 已添加 15 个窗口操作权限，涵盖所有必要的窗口控制操作
5. **⚠️ 最小化按钮限制**: Tauri v2 不支持拦截最小化按钮事件，此为框架技术限制（详见 `tauri-v2-technical-limitations.md`）
6. **⚠️ 权限静默失败**: 缺少权限时窗口操作会静默失败，需要详细的日志记录和降级策略
7. **⚠️ 跨平台窗口行为**: 不同操作系统的窗口管理策略可能存在差异，需要充分测试

## 已实现的功能模块

### 窗口行为配置命令 ✅
- `set_window_behavior`: 设置窗口关闭行为（已实现）
- `get_window_behavior`: 获取当前窗口行为配置（已实现）
- 窗口关闭时根据配置执行托盘隐藏或直接退出（已实现）

### 窗口事件监听 ✅
- 窗口关闭事件拦截器（已实现，主窗口和设置窗口）
- 跨窗口配置同步事件（已实现，使用 window-behavior-updated 事件）
- localStorage storage 事件监听（已实现）

### 配置数据结构 ✅
- `WindowBehavior` 结构体（已实现，单字段设计）
- `AppState` 扩展支持窗口行为配置（已实现）
- 前端配置标准化和验证函数（已实现）

## 技术限制与改进建议

1. **最小化按钮处理**: 由于框架限制，无法拦截最小化按钮事件，建议在用户文档中说明
2. **权限排查工具**: 建议开发自动化工具检查 tauri.conf.json 权限配置的完整性
3. **跨平台测试**: 需要在 macOS、Windows、Linux 上全面测试窗口行为的一致性
4. **降级策略完善**: 继续完善窗口操作失败时的降级策略和错误提示
5. **文档完善**: 建议在用户手册中说明窗口行为配置的使用方法和注意事项