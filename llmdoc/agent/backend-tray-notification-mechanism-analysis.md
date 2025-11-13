# 后端 Tray 通知机制深度分析报告

## 1. Purpose

本报告深入分析 SystemPromptVault 项目中后端 Tray 模块中的快照恢复和通知机制，确定如何传递完整的快照信息到前端，以实现通过 Toast 替代 macOS 系统通知的功能需求。

## 2. How it Works

### 2.1 当前通知机制分析

#### 核心代码区域

- `src-tauri/src/tray.rs:295-304` (notify_snapshot_restored 函数)
- `src-tauri/src/tray.rs:20` (SNAPSHOT_EVENT_NAME 常量)
- `src-tauri/src/tray.rs:162` (restore_snapshot_from_menu 函数调用)
- `src-tauri/src/commands/snapshot.rs:114-130` (restore_snapshot_from_tray 函数)

#### 当前实现机制

```rust
// src-tauri/src/tray.rs:295-304
fn notify_snapshot_restored<R: Runtime>(app_handle: &AppHandle<R>, snapshot_name: &str) {
    let message = format!("已恢复快照「{}」", snapshot_name);

    // macOS系统通知
    #[cfg(target_os = "macos")]
    if let Err(err) = show_macos_notification("SystemPromptVault", &message) {
        eprintln!("通知发送失败: {}", err);
    }

    // 发送Tauri事件（前端可监听）
    let _ = app_handle.emit(SNAPSHOT_EVENT_NAME, message);
}
```

#### 事件名称定义

```rust
// src-tauri/src/tray.rs:20
const SNAPSHOT_EVENT_NAME: &str = "tray://snapshot-restored";
```

#### 快照信息获取机制

```rust
// src-tauri/src/tray.rs:146-156
let snapshot_name = {
    let repo = snapshot_repo
        .lock()
        .map_err(|_| TrayError::from_poison("快照仓库"))?;
    let snapshots = repo.get_snapshots(client_id).map_err(TrayError::from)?;
    snapshots
        .iter()
        .find(|s| s.id == snapshot_id)
        .map(|s| s.name.clone())
        .unwrap_or_else(|| "未知快照".to_string())
};
```

### 2.2 macOS 系统通知实现

#### AppleScript 调用机制

```rust
// src-tauri/src/tray.rs:306-319
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

#### 字符串转义处理

```rust
// src-tauri/src/tray.rs:321-324
#[cfg(target_os = "macos")]
fn escape_osascript_arg(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
```

### 2.3 前端事件监听状态

#### 当前前端事件监听机制

前端使用 `@tauri-apps/api/event` 的 `listen` 函数监听事件，主要监听：

1. `config-file-changed` - 配置文件外部更改
2. `config-reload-silent` - 配置静默重新加载
3. `window-behavior-update` - 窗口行为更新

**关键发现**：前端目前**未监听** `tray://snapshot-restored` 事件。

### 2.4 快照数据结构

#### 完整快照模型

```rust
// src-tauri/src/models/snapshot.rs
pub struct Snapshot {
    pub id: String,              // UUID v4 唯一标识符
    pub name: String,            // 快照名称（用户自定义或自动生成）
    pub content: String,         // 配置文件文本内容
    pub client_id: String,       // 所属客户端ID
    pub created_at: DateTime<Utc>, // 创建时间（UTC时间戳）
    pub is_auto: bool,          // 是否为自动生成快照
    #[serde(default)]
    pub content_hash: String,   // 内容SHA-256哈希值，用于去重
}
```

#### 快照恢复流程

```rust
// src-tauri/src/tray.rs:126-164
fn restore_snapshot_from_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
    client_id: &str,
    snapshot_id: &str,
) -> TrayResult<()> {
    // 1. 调用恢复核心逻辑
    commands::snapshot::restore_snapshot_from_tray(/* 参数 */)?;

    // 2. 获取快照名称（用于通知）
    let snapshot_name = {
        // 从仓库重新查询快照信息
    };

    // 3. 调用通知函数
    notify_snapshot_restored(app_handle, &snapshot_name);
    Ok(())
}
```

## 3. Research Questions Analysis

### 3.1 notify_snapshot_restored 函数如何工作？

**当前行为**：
- 接收 `app_handle` 和 `snapshot_name` 参数
- 创建格式化的中文消息：`"已恢复快照「{snapshot_name}」"`
- 在 macOS 上调用 AppleScript 发送系统通知
- 向前端发送 Tauri 事件，事件名称为 `"tray://snapshot-restored"`，payload 为消息字符串

**发送的数据**：
- 仅发送格式化后的消息字符串，不包含结构化的快照信息

### 3.2 当前 Tauri Event 传递的 payload 数据结构？

**当前 payload**：
```javascript
// 事件：tray://snapshot-restored
// payload: "已恢复快照「快照名称」"
```

**包含的信息**：
- ✅ 快照名称（通过消息字符串间接包含）
- ❌ 快照创建时间
- ❌ 客户端信息
- ❌ 快照类型（自动/手动）
- ❌ 结构化的数据格式

### 3.3 如何修改 notify_snapshot_restored 函数？

**推荐实现方案**：

1. **定义结构化 payload 数据结构**：
```rust
#[derive(Serialize, Clone)]
pub struct SnapshotRestoredPayload {
    pub snapshot_id: String,
    pub snapshot_name: String,
    pub client_id: String,
    pub client_name: String,
    pub created_at: String, // ISO 8601 格式
    pub is_auto: bool,
    pub restored_at: String, // 恢复时间
}
```

2. **修改 notify_snapshot_restored 函数**：
```rust
fn notify_snapshot_restored<R: Runtime>(
    app_handle: &AppHandle<R>,
    snapshot: &Snapshot,
    client: &ClientConfig
) -> Result<(), TrayError> {
    // 构建结构化 payload
    let payload = SnapshotRestoredPayload {
        snapshot_id: snapshot.id.clone(),
        snapshot_name: snapshot.name.clone(),
        client_id: client.id.clone(),
        client_name: client.name.clone(),
        created_at: snapshot.created_at.to_rfc3339(),
        is_auto: snapshot.is_auto,
        restored_at: Utc::now().to_rfc3339(),
    };

    // 移除 macOS 系统通知
    // 直接发送 Tauri 事件到前端
    app_handle.emit(SNAPSHOT_EVENT_NAME, payload)
        .map_err(|e| TrayError::new(format!("发送事件失败: {}", e)))?;

    Ok(())
}
```

3. **更新调用位置**：
```rust
// 在 restore_snapshot_from_menu 函数中
// 需要同时获取 snapshot 和 client 信息
let (snapshot, client) = {
    // 获取完整的快照和客户端信息
};
notify_snapshot_restored(app_handle, &snapshot, &client)?;
```

### 3.4 restore_snapshot_from_menu 如何获取完整信息？

**当前实现限制**：
- 只获取了快照名称
- 没有获取客户端信息
- 没有获取快照的完整结构信息

**需要修改的位置**：
```rust
// src-tauri/src/tray.rs:146-156 位置需要重写
let (snapshot, client) = {
    let snapshot_repo = snapshot_repo
        .lock()
        .map_err(|_| TrayError::from_poison("快照仓库"))?;
    let client_repo = client_state
        .lock()
        .map_err(|_| TrayError::from_poison("客户端仓库"))?;

    let snapshots = snapshot_repo.get_snapshots(client_id).map_err(TrayError::from)?;
    let snapshot = snapshots
        .iter()
        .find(|s| s.id == snapshot_id)
        .ok_or_else(|| TrayError::new("快照未找到"))?;

    let client = client_repo.get_by_id(client_id)
        .map_err(TrayError::from)?
        .ok_or_else(|| TrayError::new("客户端未找到"))?;

    (snapshot.clone(), client.clone())
};
```

### 3.5 需要定义新的数据结构吗？

**推荐的最佳实践**：

1. **创建专用的 Payload 结构**：
```rust
// src-tauri/src/models/snapshot.rs 或新建 models/events.rs
#[derive(Serialize, Clone, Debug)]
pub struct SnapshotRestoredPayload {
    pub snapshot: SnapshotInfo,
    pub client: ClientInfo,
    pub restored_at: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct SnapshotInfo {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub is_auto: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct ClientInfo {
    pub id: String,
    pub name: String,
}
```

2. **为什么需要新结构**：
- **类型安全**：避免字符串拼接和解析错误
- **扩展性**：便于未来添加更多字段
- **维护性**：明确的数据结构便于代码维护
- **一致性**：与 Tauri 最佳实践保持一致

## 4. Implementation Recommendations

### 4.1 后端修改方案

**文件修改清单**：
1. `src-tauri/src/models/snapshot.rs` - 添加新的数据结构
2. `src-tauri/src/tray.rs` - 重写 `notify_snapshot_restored` 和 `restore_snapshot_from_menu` 函数

**实现步骤**：
1. 定义 `SnapshotRestoredPayload` 数据结构
2. 修改 `restore_snapshot_from_menu` 获取完整信息
3. 重写 `notify_snapshot_restored` 发送结构化事件
4. 移除 macOS 系统通知相关代码

### 4.2 前端集成方案

**需要的修改**：
1. 在 `dist/js/main.js` 中添加 `tray://snapshot-restored` 事件监听
2. 创建 Toast 显示函数，使用结构化的快照信息
3. 处理多语言支持（当前后端发送中文消息）

**推荐的前端实现**：
```javascript
const listenToSnapshotRestoreEvents = async () => {
  try {
    await listen("tray://snapshot-restored", (event) => {
      const payload = event.payload;
      const message = t("toast.snapshotRestored", "Snapshot '{name}' restored for client '{client}'")
        .replace("{name}", payload.snapshot.name)
        .replace("{client}", payload.client.name);
      showToast(message, "success");
    });
  } catch (error) {
    console.error("[Tray] Failed to listen to snapshot restore events:", error);
  }
};
```

## 5. Relations

### 5.1 文件关系图

```
src-tauri/src/tray.rs
├── notify_snapshot_restored() (需要修改)
├── restore_snapshot_from_menu() (需要修改)
├── SNAPSHOT_EVENT_NAME (保持不变)
└── show_macos_notification() (需要移除)

src-tauri/src/commands/snapshot.rs
├── restore_snapshot_from_tray() (间接相关)
└── restore_snapshot_core() (间接相关)

src-tauri/src/models/snapshot.rs
├── Snapshot (已存在)
└── SnapshotRestoredPayload (需要新增)

dist/js/main.js
├── listen() (已存在)
├── showToast() (已存在)
└── listenToSnapshotRestoreEvents() (需要新增)
```

### 5.2 数据流关系

```
Tray Menu Click
    ↓
restore_snapshot_from_menu()
    ↓
获取完整快照和客户端信息
    ↓
notify_snapshot_restored()
    ↓
emit("tray://snapshot-restored", SnapshotRestoredPayload)
    ↓
前端事件监听器
    ↓
showToast() 显示信息
```

## 6. Result

### 6.1 主要发现

1. **当前通知机制**：同时使用 macOS 系统通知 + Tauri 事件，但前端未监听事件
2. **数据传递不完整**：只传递格式化消息字符串，缺少结构化数据
3. **前端缺失监听**：没有实现 `tray://snapshot-restored` 事件的监听器
4. **信息获取受限**：当前只获取快照名称，缺少创建时间、客户端信息等

### 6.2 核心修改建议

1. **移除 macOS 系统通知**：删除 `show_macos_notification` 相关代码
2. **实现结构化事件**：使用 `SnapshotRestoredPayload` 替代简单字符串
3. **增强信息获取**：在 `restore_snapshot_from_menu` 中获取完整的快照和客户端信息
4. **添加前端监听**：在 `main.js` 中实现事件监听和 Toast 显示
5. **多语言支持**：后端发送结构化数据，前端负责本地化显示

### 6.3 预期效果

实现后，当用户点击托盘快照恢复时：
1. 后端获取完整的快照信息（名称、时间、类型等）
2. 后端发送结构化事件到前端（不再显示 macOS 系统通知）
3. 前端接收事件并在主窗口显示 Toast 提示
4. Toast 内容包含快照名称、客户端信息等完整信息
5. 支持多语言显示

## 7. Attention

### 7.1 技术风险

1. **向后兼容性**：修改事件数据结构可能影响未来的扩展
2. **错误处理**：需要确保数据获取失败时的降级处理
3. **时序问题**：确保在前端准备好监听器之前发送事件不会丢失

### 7.2 实现注意事项

1. **多语言一致性**：后端应发送数据而非本地化消息
2. **错误恢复**：如果结构化数据获取失败，应有简单的降级方案
3. **性能影响**：获取完整快照信息可能增加数据库查询
4. **测试覆盖**：需要测试各种边界情况（快照不存在、客户端不存在等）

### 7.3 用户体验考虑

1. **即时反馈**：Toast 应在快照恢复完成后立即显示
2. **信息完整性**：Toast 应包含足够的信息让用户了解发生了什么
3. **非阻塞**：Toast 不应干扰用户的正常操作流程