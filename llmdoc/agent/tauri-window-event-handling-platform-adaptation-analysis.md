# Tauri 窗口事件处理和平台适配实现分析

## Code Sections

### 窗口状态恢复实现

- `src-tauri/src/main.rs` (窗口状态恢复): 应用启动时的窗口位置和尺寸恢复逻辑

  ```rust
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
          // 恢复默认位置和尺寸
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
  ```

- `src-tauri/src/main.rs` (显示器可见性检查): 确保窗口在可用显示器范围内

  ```rust
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
  ```

### 前端窗口事件监听

- `dist/js/main.js` (Tauri事件监听): 配置文件变更和窗口状态同步

  ```javascript
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from '@tauri-apps/api/window';

  const appWindow = getCurrentWindow();
  const state = {
    fileChangeUnlisten: null,
    silentReloadUnlisten: null,
    isSavingInternally: false,
  };

  // 文件变更监听器设置
  async function setupFileWatcher(clientId) {
    if (state.fileChangeUnlisten) {
      await state.fileChangeUnlisten();
    }

    state.fileChangeUnlisten = await listen("config-file-changed", async (event) => {
      if (state.isSavingInternally) return;

      const payload = event.payload;
      if (payload && typeof payload === 'string' && payload.includes(currentClientConfig.value?.path)) {
        handleConfigFileChanged();
      }
    });
  }

  // 静默重载监听器
  async function setupSilentReloadListener() {
    if (state.silentReloadUnlisten) {
      await state.silentReloadUnlisten();
    }

    state.silentReloadUnlisten = await listen("config-reload-silent", async (event) => {
      const payload = event.payload;
      if (payload && typeof payload === 'string' && payload.includes(currentClientConfig.value?.path)) {
        await loadClientConfig(currentClientId);
        showToast(t('toast.configUpdated'), 'info');
      }
    });
  }
  ```

### Tauri窗口API使用模式

- `src-tauri/src/tray.rs` (窗口显示控制): 从托盘恢复窗口显示

  ```rust
  fn show_main_window<R: Runtime>(app_handle: &AppHandle<R>) -> TrayResult<()> {
      let window = app_handle
          .get_webview_window("main")
          .ok_or_else(|| TrayError::new("未找到主窗口"))?;

      // 显示窗口并设置焦点
      window.show().map_err(TrayError::from)?;
      window.set_focus().map_err(TrayError::from)
  }
  ```

### 平台特定配置

- `src-tauri/src/tray.rs` (macOS通知): 平台特定的系统通知实现

  ```rust
  #[cfg(target_os = "macos")]
  fn notify_snapshot_restored<R: Runtime>(app_handle: &AppHandle<R>, snapshot_name: &str) {
      let message = format!("已恢复快照「{}」", snapshot_name);

      if let Err(err) = show_macos_notification("SystemPromptVault", &message) {
          eprintln!("通知发送失败: {}", err);
      }

      let _ = app_handle.emit(SNAPSHOT_EVENT_NAME, message);
  }

  #[cfg(target_os = "macos")]
  fn show_macos_notification(title: &str, body: &str) -> TrayResult<()> {
      let script = format!(
          "display notification \"{}\" with title \"{}\"",
          escape_osascript_arg(body),
          escape_osascript_arg(title)
      );

      Command::new("osascript")
          .arg("-e")
          .arg(script)
          .status()
          .map_err(|err| TrayError::new(format!("调用 osascript 失败: {}", err)))?;

      Ok(())
  }
  ```

### 权限和安全配置

- `src-tauri/tauri.conf.json` (窗口权限): 详细的窗口操作权限配置

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
              "core:window:default",
              "core:window:allow-set-title",
              "core:window:allow-close",
              "core:window:allow-destroy",
              "core:window:allow-available-monitors",
              "core:window:allow-outer-position",
              "core:window:allow-outer-size",
              "core:window:allow-set-position",
              "core:window:allow-set-size",
              "core:webview:default",
              "core:webview:allow-webview-position",
              "core:webview:allow-webview-size",
              "core:app:default",
              "core:tray:default",
              "core:event:default",
              "core:event:allow-listen",
              "core:event:allow-emit"
            ]
          }
        ]
      }
    }
  }
  ```

## Report

### conclusions

1. **窗口状态管理**: 实现了完整的窗口位置和尺寸持久化，包括多显示器环境下的可见性检查
2. **事件监听系统**: 前端支持Tauri事件监听，已实现config-file-changed和config-reload-silent事件
3. **平台适配**: 已有macOS特定的通知实现，展示了条件编译的平台适配模式
4. **权限配置**: 完整的窗口操作权限配置，支持位置、尺寸、显示器等操作
5. **错误处理**: 窗口操作包含详细的错误处理和用户反馈机制
6. **状态同步**: 前端通过事件监听实现与后端状态的实时同步

### relations

- `src-tauri/src/main.rs` → Tauri Window API: 主应用直接使用窗口API进行状态恢复
- `dist/js/main.js` → Tauri Event API: 前端监听后端发送的配置变更事件
- `src-tauri/src/tray.rs` → Platform-specific code: 条件编译实现平台特定功能
- `src-tauri/src/commands/app_state.rs` → File System: 窗口状态持久化到文件系统
- Tauri Runtime → `src-tauri/src/main.rs`: 运行时提供显示器信息和窗口操作能力

### result

系统已具备基础的窗口管理能力，包括状态持久化、事件监听和平台适配。窗口状态恢复逻辑考虑了多显示器环境，确保窗口始终可见。事件系统支持前后端实时通信，已实现配置文件变更的同步机制。权限配置完整，支持所有必要的窗口操作。平台特定功能的实现模式为后续扩展提供了参考。

### attention

1. **缺少窗口关闭事件拦截**: 当前没有监听和处理窗口关闭事件的代码
2. **最小化行为未定义**: 没有实现窗口最小化到托盘的具体逻辑
3. **跨平台适配不完整**: 仅有macOS的特定实现，缺少Windows和Linux的适配
4. **窗口生命周期管理**: 缺少完整的窗口生命周期事件处理（创建、显示、隐藏、销毁）
5. **快捷键支持**: 没有发现全局快捷键或窗口快捷键的实现
6. **窗口动画效果**: 窗口显示/隐藏缺少过渡动画效果
7. **多窗口支持**: 当前架构仅支持单个主窗口，缺少多窗口管理机制
8. **性能优化**: 频繁的窗口状态保存可能影响性能，需要防抖机制

## 平台适配需求分析

### macOS特定需求
- ✅ 系统通知（已实现）
- ⚠️ 菜单栏集成（仅有基础托盘）
- ❌ 窗口代理图标
- ❌ Spaces虚拟桌面支持
- ❌ 全屏模式切换

### Windows特定需求
- ❌ 任务栏图标管理
- ❌ 系统托盘气泡提示
- ❌ 窗口闪烁提醒
- ❌ 开机自启动
- ❌ 注册表集成

### Linux特定需求
- ❌ X11/Wayland兼容性
- ❌ 系统托盘不同桌面环境适配
- ❌ 自启动文件创建
- ❌ 桌面入口文件生成

## 实现建议

### 1. 窗口事件拦截器
```rust
// 在 main.rs 的 setup 中添加
.window_event(|event| match event {
    tauri::WindowEvent::CloseRequested { .. } => {
        // 检查配置决定是否最小化到托盘
        if should_minimize_to_tray() {
            event.window().hide().unwrap();
            std::process::exit(0); // 阻止默认关闭行为
        }
    }
    _ => {}
})
```

### 2. 窗口行为配置结构
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowBehavior {
    pub close_action: CloseAction,     // MinimizeToTray | Quit | Confirm
    pub minimize_action: MinimizeAction, // ToTray | ToTaskbar
    pub start_minimized: bool,
    pub show_in_taskbar: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CloseAction {
    MinimizeToTray,
    Quit,
    Confirm,
}
```

### 3. 平台特定模块
```rust
// src-tauri/src/platform/mod.rs
#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

pub trait PlatformAdapter {
    fn setup_system_integration(&self) -> Result<(), String>;
    fn show_notification(&self, title: &str, body: &str) -> Result<(), String>;
    fn manage_taskbar_icon(&self, visible: bool) -> Result<(), String>;
}
```

### 4. 前端窗口控制API
```javascript
// 扩展 dist/js/api.js
export const WindowAPI = {
  minimize: () => call("minimize_window"),
  show: () => call("show_window"),
  hide: () => call("hide_window"),
  close: () => call("close_window"),
  setBehavior: (behavior) => call("set_window_behavior", { behavior }),
  getBehavior: () => call("get_window_behavior"),
  isMinimizedToTray: () => call("is_minimized_to_tray"),
};
```

## 实现优先级

### 高优先级（核心功能）
1. 窗口关闭事件拦截器
2. 基础窗口行为配置
3. 最小化到托盘实现
4. 前端窗口控制API

### 中优先级（用户体验）
1. 平台特定通知优化
2. 窗口显示/隐藏动画
3. 快捷键支持
4. 启动时窗口状态控制

### 低优先级（增强功能）
1. 多窗口支持
2. 高级平台集成
3. 性能优化
4. 窗口管理工具栏