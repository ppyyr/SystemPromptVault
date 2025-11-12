# 后端 config-file-changed 事件发送机制技术调查报告

## Code Sections

### 当前事件发送位置

- `src-tauri/src/file_watcher.rs:37` (ConfigFileWatcher::watch_file 函数): 文件系统监听器发送 config-file-changed 事件

  ```rust
  let _ = emitter_app.emit("config-file-changed", path_str);
  ```

- `src-tauri/src/tray.rs:177` (restore_snapshot_from_menu 函数): 托盘恢复快照时发送 config-reload-silent 事件

  ```rust
  match app_handle.emit(CONFIG_RELOAD_SILENT_EVENT, path_str) {
      Ok(_) => eprintln!("[Tray] Event emitted successfully"),
      Err(e) => eprintln!("[Tray] Failed to emit event: {}", e),
  }
  ```

- `src-tauri/src/tray.rs:21` (常量定义): config-reload-silent 事件名称常量

  ```rust
  const CONFIG_RELOAD_SILENT_EVENT: &str = "config-reload-silent";
  ```

### 前端事件监听位置

- `dist/js/main.js:1208` (listenToFileChanges 函数): 前端监听 config-file-changed 事件

  ```javascript
  state.fileChangeUnlisten = await listen("config-file-changed", async (event) => {
    console.log("[FileWatcher] Config file changed:", event.payload);
    await handleConfigFileChanged();
  });
  ```

- `dist/js/main.js:1225` (listenToFileChanges 函数): 前端监听 config-reload-silent 事件

  ```javascript
  state.silentReloadUnlisten = await listen("config-reload-silent", async (event) => {
    console.log("[FileWatcher] Silent reload event received:", event.payload);
    await reloadConfigSilently();
  });
  ```

### 依赖配置

- `src-tauri/Cargo.toml:20-23` (Tauri 和序列化依赖): 支持结构化 payload 的依赖

  ```toml
  tauri = { version = "2.0", features = ["tray-icon"] }
  serde = { version = "1.0", features = ["derive"] }
  serde_json = "1.0"
  ```

## Report

### conclusions

> 当前 config-file-changed 和 config-reload-silent 事件都使用简单的字符串 payload（文件路径），项目已具备发送结构化 JSON payload 的技术基础

- 当前 file_watcher.rs 在第37行发送 config-file-changed 事件，payload 是字符串格式的文件路径
- 当前 tray.rs 在第177行发送 config-reload-silent 事件，payload 也是字符串格式的文件路径
- Tauri 的 emit 函数支持任意实现了 Serialize trait 的类型，包括结构体、枚举、数组等
- 项目已引入 serde 和 serde_json 依赖，支持结构化数据的序列化和反序列化
- 前端通过 event.payload 接收数据，可以处理字符串或对象格式的 payload

### relations

> 两个事件发送位置和前端监听器之间存在直接的对应关系，修改 payload 格式需要同时更新前端代码

- file_watcher.rs:37 发送 config-file-changed → main.js:1208 监听 config-file-changed
- tray.rs:177 发送 config-reload-silent → main.js:1225 监听 config-reload-silent
- 两个事件的前端处理逻辑不同：config-file-changed 触发 handleConfigFileChanged，config-reload-silent 触发 reloadConfigSilently
- 修改 payload 格式时需要同步更新两个事件监听器中的 event.payload 处理逻辑

### result

> 提供为 config-file-changed 事件添加 source 字段的完整技术方案，包括新增 Rust 结构体定义和前后端代码修改

**1. 新增事件数据结构定义**

在 `src-tauri/src/models/` 目录下创建新文件 `event_models.rs`：

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "source")]
pub enum ConfigFileChangeSource {
    #[serde(rename = "file_watcher")]
    FileWatcher,
    #[serde(rename = "tray_restore")]
    TrayRestore,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFileChangedEvent {
    pub source: ConfigFileChangeSource,
    pub path: String,
}

impl ConfigFileChangedEvent {
    pub fn new(source: ConfigFileChangeSource, path: String) -> Self {
        Self { source, path }
    }
}
```

**2. 修改 file_watcher.rs 事件发送**

将第37行的简单字符串 payload 改为结构化 payload：

```rust
// 原代码
// let _ = emitter_app.emit("config-file-changed", path_str);

// 新代码
use crate::models::event_models::{ConfigFileChangedEvent, ConfigFileChangeSource};
let event = ConfigFileChangedEvent::new(ConfigFileChangeSource::FileWatcher, path_str);
let _ = emitter_app.emit("config-file-changed", event);
```

**3. 修改 tray.rs 事件发送**

将第177行的 config-reload-silent 事件改为发送带 source 的 config-file-changed 事件：

```rust
// 原代码
// match app_handle.emit(CONFIG_RELOAD_SILENT_EVENT, path_str) {

// 新代码
use crate::models::event_models::{ConfigFileChangedEvent, ConfigFileChangeSource};
let event = ConfigFileChangedEvent::new(ConfigFileChangeSource::TrayRestore, path_str);
match app_handle.emit("config-file-changed", event) {
```

**4. 更新前端事件处理逻辑**

在 main.js 中修改事件监听器，根据 source 字段决定处理方式：

```javascript
// 合并两个事件监听器为一个
state.fileChangeUnlisten = await listen("config-file-changed", async (event) => {
  console.log("[FileWatcher] Config file changed:", event.payload);

  try {
    if (event.payload?.source === "tray_restore") {
      // 托盘恢复快照 - 静默重新加载
      await reloadConfigSilently();
    } else if (event.payload?.source === "file_watcher") {
      // 文件系统变化 - 检查脏状态并提示
      await handleConfigFileChanged();
    } else {
      // 兼容旧版本字符串 payload
      await handleConfigFileChanged();
    }
  } catch (error) {
    console.warn("[FileWatcher] Failed to process config change:", error);
  }
});
```

**5. 模块注册**

在 `src-tauri/src/models/mod.rs` 中添加新模块：

```rust
pub mod event_models;
```

**6. 向后兼容性处理**

为确保平滑升级，新的事件结构支持标签枚举，前端可以同时处理新旧格式的 payload。

### attention

> 修改事件 payload 格式涉及前后端多个文件的协调更新，需要特别注意兼容性和测试覆盖

- **兼容性风险**: 修改 payload 格式会破坏现有的事件监听逻辑，需要确保前端能同时处理新旧格式
- **依赖关系**: file_watcher.rs 需要新增对 models::event_models 的依赖，需要检查 mod.rs 中的模块导出
- **测试要求**: 需要同时测试文件系统变化和托盘恢复快照两种场景，确保 source 字段正确传递
- **错误处理**: Tauri 的 emit 函数在序列化失败时会返回错误，需要添加适当的错误处理
- **性能影响**: 结构化 payload 的序列化会有轻微的性能开销，但在事件频率不高的场景下可以忽略