# 多配置文件监听器架构设计方案

## 1. 调查目标

调查当前ConfigFileWatcher的单路径监听限制，设计支持多配置文件监听的扩展方案，确保与现有客户端多配置文件架构的兼容性。

## 2. 核心代码分析

### 2.1 ConfigFileWatcher 结构体限制

**文件**: `src-tauri/src/file_watcher.rs:6-9`

```rust
pub struct ConfigFileWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_path: Option<PathBuf>,  // 仅支持单路径
}
```

**问题分析**:
- `watched_path: Option<PathBuf>` 只能存储单个路径
- `watch_file()` 方法在调用 `self.stop()` 后只能监听一个新路径
- 现有API设计不支持同时监听多个配置文件

### 2.2 客户端多配置文件模型

**文件**: `src-tauri/src/models/client.rs:8-10`

```rust
pub struct ClientConfig {
    pub config_file_paths: Vec<String>,      // 多配置文件路径列表
    pub active_config_path: Option<String>,  // 当前活跃路径
}
```

**多配置文件功能支持**:
- `config_file_paths: Vec<String>` 支持多个配置文件路径
- `active_config_path: Option<String>` 标记当前活跃配置
- `ensure_active_path()` 自动确保活跃路径有效性
- `default_config_path()` 获取默认配置路径（优先active，其次首个）

### 2.3 notify crate 多路径监听能力

**调查结论**: notify crate 的 RecommendedWatcher 完全支持多路径监听

**实现方式**:
```rust
// 方式1: 多次调用 watch() 方法
watcher.watch(&path1, RecursiveMode::NonRecursive)?;
watcher.watch(&path2, RecursiveMode::NonRecursive)?;

// 方式2: 批量操作 (性能更优)
let mut watcher_paths = watcher.paths_mut();
for path in many_paths_to_add {
    watcher_paths.add(path, RecursiveMode::NonRecursive)?;
}
watcher_paths.commit()?;
```

### 2.4 文件事件路径识别机制

**当前实现**: `src-tauri/src/file_watcher.rs:40-46`

```rust
let path_str = event
    .paths
    .first()                    // 仅取第一个路径
    .map(|p| p.to_string_lossy().to_string())
    .unwrap_or_else(|| fallback_path.clone());
```

**问题**: 多路径监听时需要通过 `event.paths` 识别具体哪个文件发生了变化。

### 2.5 托盘恢复快照的监听器控制

**文件**: `src-tauri/src/commands/snapshot.rs:207-218`

```rust
let previous_watch_path = pause_watcher(&watcher_state)?;
// ... 恢复快照操作 ...
let resume_result = resume_watcher(&watcher_state, &app_handle, previous_watch_path);
```

**现有机制**:
- `pause_watcher()`: 临时停止监听并记录当前路径
- `resume_watcher()`: 恢复之前监听的路径
- 单路径设计在多配置文件场景下需要扩展

## 3. 扩展设计方案

### 3.1 ConfigFileWatcher 结构体重构

```rust
use std::collections::HashSet;
use std::path::PathBuf;

pub struct ConfigFileWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_paths: HashSet<PathBuf>,           // 支持多路径监听
    client_id: Option<String>,                 // 关联客户端ID
}

impl ConfigFileWatcher {
    pub fn new() -> Self {
        Self {
            watcher: None,
            watched_paths: HashSet::new(),
            client_id: None,
        }
    }

    pub fn current_paths(&self) -> Vec<PathBuf> {
        self.watched_paths.iter().cloned().collect()
    }

    pub fn watch_files<R: Runtime>(
        &mut self,
        paths: Vec<PathBuf>,
        client_id: String,
        app_handle: AppHandle<R>,
    ) -> Result<(), String> {
        // 过滤已监听的路径
        let new_paths: Vec<PathBuf> = paths
            .into_iter()
            .filter(|path| !self.watched_paths.contains(path))
            .collect();

        if new_paths.is_empty() {
            return Ok(());
        }

        self.stop();

        let (tx, rx) = mpsc::channel::<Event>();
        let emitter_app = app_handle.clone();
        let client_id_clone = client_id.clone();

        std::thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                for path in &event.paths {
                    let path_str = path.to_string_lossy().to_string();
                    let _ = emitter_app.emit("config-file-changed", ConfigChangeEvent {
                        client_id: client_id_clone.clone(),
                        path: path_str,
                        event_kind: event.kind,
                    });
                }
            }
        });

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(
                    event.kind,
                    EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                ) {
                    let _ = tx.send(event);
                }
            }
        }).map_err(|e| format!("创建文件监听器失败: {}", e))?;

        // 批量监听路径
        for path in &new_paths {
            watcher
                .watch(path, RecursiveMode::NonRecursive)
                .map_err(|e| format!("监听文件失败: {} ({})", e, path.display()))?;
            self.watched_paths.insert(path.clone());
        }

        self.watcher = Some(watcher);
        self.client_id = Some(client_id);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.watcher = None;
        self.watched_paths.clear();
        self.client_id = None;
    }
}

#[derive(serde::Serialize)]
pub struct ConfigChangeEvent {
    pub client_id: String,
    pub path: String,
    pub event_kind: EventKind,
}
```

### 3.2 命令接口扩展

**文件**: `src-tauri/src/commands/file_watcher.rs`

```rust
#[tauri::command]
pub fn start_watching_config(
    file_paths: Vec<String>,  // 支持多路径
    client_id: String,        // 新增客户端ID
    app_handle: AppHandle,
    watcher: State<'_, Arc<Mutex<ConfigFileWatcher>>>,
) -> Result<(), String> {
    let paths: Vec<PathBuf> = file_paths
        .into_iter()
        .map(|path| expand_tilde(&path))
        .collect();

    // 验证所有文件存在
    for path in &paths {
        if !path.exists() {
            return Err(format!("文件不存在: {}", path.display()));
        }
    }

    let mut watcher_guard = watcher
        .lock()
        .map_err(|e| format!("锁定文件监听器失败: {}", e))?;

    watcher_guard.watch_files(paths, client_id, app_handle)?;
    Ok(())
}

// 保持向后兼容的单路径接口
#[tauri::command]
pub fn start_watching_single_config(
    file_path: String,
    client_id: String,
    app_handle: AppHandle,
    watcher: State<'_, Arc<Mutex<ConfigFileWatcher>>>,
) -> Result<(), String> {
    start_watching_config(vec![file_path], client_id, app_handle, watcher)
}
```

### 3.3 托盘恢复快照的监听器控制扩展

**文件**: `src-tauri/src/commands/snapshot.rs`

```rust
fn pause_watcher(
    watcher_state: &Arc<Mutex<ConfigFileWatcher>>,
) -> Result<(Vec<PathBuf>, Option<String>), String> {
    let mut watcher = watcher_state
        .lock()
        .map_err(|e| format!("获取文件监听器失败: {}", e))?;
    let watched = watcher.current_paths();
    let client_id = watcher.client_id.clone();
    watcher.stop();
    Ok((watched, client_id))
}

fn resume_watcher<R: Runtime>(
    watcher_state: &Arc<Mutex<ConfigFileWatcher>>,
    app_handle: &AppHandle<R>,
    paths: Vec<PathBuf>,
    client_id: Option<String>,
) -> Result<(), String> {
    if !paths.is_empty() && client_id.is_some() {
        let mut watcher = watcher_state
            .lock()
            .map_err(|e| format!("获取文件监听器失败: {}", e))?;
        watcher
            .watch_files(paths, client_id.unwrap(), app_handle.clone())
            .map_err(|err| format!("重新启动文件监听器失败: {}", err))?;
    }
    Ok(())
}

fn restore_snapshot_core<R: Runtime>(
    app_handle: AppHandle<R>,
    // ... 其他参数 ...
    client_id: String,
    snapshot_id: String,
) -> Result<(), String> {
    // ... 快照恢复逻辑 ...

    let (previous_watch_paths, previous_client_id) = pause_watcher(&watcher_state)?;

    let write_result = if snapshot.is_multi_file() {
        restore_multi_file_snapshot(snapshot.get_file_contents())
    } else {
        // ... 单文件恢复逻辑
    };

    let resume_result = resume_watcher(
        &watcher_state,
        &app_handle,
        previous_watch_paths,
        previous_client_id
    );

    // ... 错误处理和事件发送 ...
}
```

### 3.4 前端事件处理更新

**JavaScript 事件监听器**:
```javascript
// 更新事件结构处理
const listenToFileChanges = async () => {
    try {
        const { listen } = window.__TAURI_INTERNALS_;

        await listen("config-file-changed", async (event) => {
            const { client_id, path, event_kind } = event.payload;
            console.log(`[FileWatcher] File change detected: ${path} for client ${client_id}`);

            // 检查是否为当前活跃客户端和配置文件
            if (client_id === state.currentClientId &&
                path === state.currentConfigPath) {
                await handleConfigFileChanged();
            }
        });

        // ... 其他事件监听器 ...
    } catch (error) {
        console.error("[FileWatcher] Failed to setup event listener:", error);
    }
};

// 更新文件监听启动函数
const startFileWatcher = async (clientId) => {
    try {
        const client = state.clients.find(c => c.id === clientId);
        if (!client) {
            console.warn(`[FileWatcher] Client not found: ${clientId}`);
            return;
        }

        const invoke = await getInvoke();
        await invoke("start_watching_config", {
            filePaths: client.config_file_paths,  // 传递所有配置文件路径
            clientId: client.id
        });

        console.log(`[FileWatcher] Started watching ${client.config_file_paths.length} files for client ${clientId}`);
    } catch (error) {
        console.error("[FileWatcher] Failed to start watching:", error);
    }
};
```

## 4. 实现优先级建议

### 4.1 第一阶段：向后兼容扩展
1. 保持现有的 `start_watching_config(file_path: String)` 接口
2. 新增 `start_watching_multiple_configs(file_paths: Vec<String>)` 接口
3. 前端根据客户端配置选择使用哪个接口

### 4.2 第二阶段：统一多路径接口
1. 将主接口改为 `start_watching_config(file_paths: Vec<String>)`
2. 保留单路径包装器函数确保兼容性
3. 逐步迁移前端调用代码

### 4.3 第三阶段：事件结构优化
1. 完善事件结构，包含客户端ID和完整路径信息
2. 更新前端事件处理逻辑
3. 优化多配置文件场景下的用户体验

## 5. 风险评估

### 5.1 技术风险
- **低风险**: notify crate 确认支持多路径监听
- **中风险**: 事件处理逻辑需要适配，避免重复处理
- **低风险**: 现有单路径客户端保持兼容

### 5.2 兼容性风险
- **向后兼容**: 保留现有API，渐进式迁移
- **数据结构**: 客户端模型已支持多配置文件
- **前端适配**: 需要更新事件处理逻辑

### 5.3 性能影响
- **内存占用**: 每个监听路径约1-2MB，多路径线性增加
- **CPU开销**: 仅在文件变化时工作，无额外CPU消耗
- **响应性能**: notify crate 对多路径监听进行了优化

## 6. 测试建议

### 6.1 功能测试
- [ ] 单客户端单配置文件监听（向后兼容）
- [ ] 单客户端多配置文件监听
- [ ] 多客户端配置文件隔离
- [ ] 文件事件路径识别准确性
- [ ] 托盘恢复快照的监听器暂停/恢复

### 6.2 性能测试
- [ ] 多配置文件同时监听的资源占用
- [ ] 大量文件变化的响应性能
- [ ] 长时间运行的稳定性测试

### 6.3 边界条件测试
- [ ] 重复监听相同路径的处理
- [ ] 监听路径不存在的情况
- [ ] 监听器启动失败后的恢复机制
- [ ] 配置文件动态添加/移除的处理