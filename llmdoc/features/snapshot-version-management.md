# 快照版本管理系统

## 1. Purpose

快照版本管理系统为配置文件提供轻量级的版本控制功能，支持自动和手动快照创建、快速恢复、System Tray集成。本文档详细描述快照系统的技术实现、数据模型、触发机制和用户交互流程。

## 2. How it Works

### 2.1 快照系统架构

```mermaid
graph TB
    subgraph "前端层 (JavaScript)"
        MainApp[主应用 main.js]
        SettingsPage[设置页面 settings.js]
        SnapshotAPI[SnapshotAPI 封装]
    end

    subgraph "Tauri 桥接层"
        Commands[快照命令]
        TrayMenu[System Tray 菜单]
    end

    subgraph "后端层 (Rust)"
        SnapshotRepo[快照仓库]
        TrayBuilder[托盘菜单构建器]
        Storage[JSON 存储]
    end

    subgraph "文件系统"
        SnapshotFiles[快照文件 {client_id}.json]
    end

    MainApp --> SnapshotAPI
    SettingsPage --> SnapshotAPI
    SnapshotAPI --> Commands
    Commands --> SnapshotRepo
    SnapshotRepo --> Storage
    Storage --> SnapshotFiles
    TrayMenu --> Commands
    TrayBuilder --> SnapshotRepo
```

### 2.2 数据模型

#### 2.2.1 快照结构

```rust
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

#### 2.2.2 快照配置结构

```rust
pub struct SnapshotConfig {
    pub client_id: String,       // 客户端ID
    pub max_snapshots: usize,    // 最大快照保存数量（默认10，向后兼容）
    #[serde(default = "SnapshotConfig::default_max_auto_snapshots")]
    pub max_auto_snapshots: usize,    // 最大自动快照数量（默认3）
    #[serde(default = "SnapshotConfig::default_max_manual_snapshots")]
    pub max_manual_snapshots: usize,  // 最大手动快照数量（默认10）
    #[serde(default)]
    pub snapshots: Vec<Snapshot>, // 快照列表
}
```

#### 2.2.3 存储位置

```
{APP_DATA}/snapshots/{client_id}.json
```

**示例文件内容**：
```json
{
  "client_id": "claude",
  "max_snapshots": 10,
  "max_auto_snapshots": 3,
  "max_manual_snapshots": 10,
  "snapshots": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "优化后的配置",
      "content": "You are an expert AI assistant...",
      "client_id": "claude",
      "created_at": "2025-11-10T14:20:30Z",
      "is_auto": false,
      "content_hash": "a1b2c3d4e5f6..."
    },
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "name": "自动保存 2025-11-10 14:15",
      "content": "...",
      "client_id": "claude",
      "created_at": "2025-11-10T14:15:22Z",
      "is_auto": true,
      "content_hash": "f6e5d4c3b2a1..."
    }
  ]
}
```

### 2.3 快照触发机制

#### 2.3.1 自动触发场景

| 触发时机 | 快照名称格式 | is_auto | 说明 |
|---------|------------|---------|-----|
| **程序启动时** | `启动时自动快照 YYYY-MM-DD HH:mm` | `true` | 每次打开应用自动创建 |
| **切换客户端前** | `自动保存 YYYY-MM-DD HH:mm` | `true` | 保存当前客户端状态 |
| **手动触发** | 用户输入的名称 | `false` | Shift+点击保存或Shift+Cmd/Ctrl+S |

#### 2.3.2 自动快照实现

```javascript
// 格式化快照名称
const formatSnapshotName = (prefix) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${prefix} ${year}-${month}-${day} ${hours}:${minutes}`;
};

// 创建自动快照（统一函数）
const createAutoSnapshot = async (clientId, content, prefix) => {
  try {
    const name = formatSnapshotName(prefix);
    await SnapshotAPI.create(clientId, name, content, true);
    await SnapshotAPI.refreshTrayMenu();
    console.log(`[Snapshot] 已创建快照: ${name} (客户端: ${clientId})`);
  } catch (error) {
    if (error && typeof error === "string" && error.includes("内容未变化")) {
      console.log(`[Snapshot] 内容未变化,跳过快照: ${prefix} (客户端: ${clientId})`);
      return null;
    }
    console.warn(`[Snapshot] 创建快照失败:`, error);
    return null;
  }
};
```

#### 2.3.3 启动时快照

```javascript
// 在 initApp() 函数中
try {
  const content = await ConfigFileAPI.read(state.currentClientId);
  await createAutoSnapshot(state.currentClientId, content, "启动时自动快照");
} catch (error) {
  console.warn("创建启动快照失败:", error);
}
```

#### 2.3.4 切换客户端时快照

```javascript
// 在 selectClient(clientId) 函数中
if (state.currentClientId && state.currentClientId !== clientId) {
  try {
    const currentContent = getEditorContent();
    await createAutoSnapshot(state.currentClientId, currentContent, "自动保存");
  } catch (error) {
    console.warn("切换客户端时保存快照失败:", error);
  }
}
```

#### 2.3.5 手动快照（Shift+保存）

```javascript
// 在 saveConfigFile() 函数中
if (createSnapshot) {
  const name = await showPrompt("请输入快照名称（留空取消）：", "");
  const trimmedName = name?.trim();
  if (trimmedName) {
    try {
      await SnapshotAPI.create(state.currentClientId, trimmedName, content, false);
      await SnapshotAPI.refreshTrayMenu();
      showToast(`快照「${trimmedName}」已创建`, "success");
    } catch (error) {
      showToast("创建快照失败", "error");
    }
  }
}
```

**快捷键支持**：
- **Shift+点击保存按钮**：触发快照创建
- **Shift+Cmd+S (macOS)** 或 **Shift+Ctrl+S (Windows/Linux)**：保存并创建快照

### 2.4 FIFO 清理策略

#### 2.4.1 分类清理逻辑

快照系统现在采用分类FIFO清理策略，自动快照和手动快照分别管理：

```rust
fn enforce_limit(config: &mut SnapshotConfig) -> bool {
    if config.snapshots.is_empty() {
        return false;
    }
    Self::normalize_limits(config);
    config
        .snapshots
        .sort_by(|a, b| a.created_at.cmp(&b.created_at));

    // 分别统计自动快照和手动快照数量
    let auto_count = config.snapshots.iter().filter(|s| s.is_auto).count();
    let manual_count = config.snapshots.iter().filter(|s| !s.is_auto).count();

    // 计算需要删除的数量
    let mut auto_to_remove = auto_count.saturating_sub(config.max_auto_snapshots);
    let mut manual_to_remove = manual_count.saturating_sub(config.max_manual_snapshots);

    if auto_to_remove == 0 && manual_to_remove == 0 {
        return false;
    }

    let mut changed = false;
    // 按创建时间顺序，分别删除超过限制的自动和手动快照
    config.snapshots.retain(|snapshot| {
        if snapshot.is_auto && auto_to_remove > 0 {
            auto_to_remove -= 1;
            changed = true;
            false
        } else if !snapshot.is_auto && manual_to_remove > 0 {
            manual_to_remove -= 1;
            changed = true;
            false
        } else {
            true
        }
    });
    changed
}
```

#### 2.4.2 内容去重机制

为避免重复快照，系统使用SHA-256哈希进行内容去重：

```rust
fn create_snapshot() -> Result<Snapshot, String> {
    let mut config = self.load_config(&client_id)?;
    let content_hash = Self::calculate_content_hash(&content);

    // 与最新快照对比，内容相同时跳过创建
    if let Some(latest) = config
        .snapshots
        .iter()
        .max_by(|a, b| a.created_at.cmp(&b.created_at))
    {
        if latest.content_hash == content_hash {
            return Err("内容未变化,跳过快照创建".to_string());
        }
    }

    // 创建新快照...
}

fn calculate_content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}
```

#### 2.4.3 清理时机

- **创建新快照后**：`create_snapshot()` 自动调用分类清理
- **设置限制后**：立即清理多余快照
- **内容去重**：检测到内容无变化时跳过创建，避免重复

### 2.5 System Tray 集成

#### 2.5.1 托盘菜单结构

```
├── Claude(5)
│   ├── 优化后的配置 2025-11-10 14:20:30
│   ├── Auto Saved 2025-11-10 14:20:22
│   └── Auto Saved 2025-11-10 09:30:15
├── ChatGPT(3)
│   ├── 初始配置 2025-11-08 10:15:30
│   └── Auto Saved 2025-11-10 13:45:22
├── ---
├── Open
└── Quit
```

#### 2.5.2 菜单构建逻辑

```rust
pub fn build_tray_menu(app_handle: &AppHandle) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app_handle);

    // 获取所有客户端
    let clients = get_all_clients(app_handle)?;

    for client in clients {
        // 获取该客户端的快照列表
        let snapshots = get_snapshots(client.id.clone(), app_handle)?;

        // 创建子菜单
        let submenu = SubmenuBuilder::new(app_handle, format!("{}({})", client.name, snapshots.len()));

        // 按创建时间降序排列（最新在上）
        let mut sorted = snapshots;
        sorted.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        for snapshot in sorted {
            let item = MenuItemBuilder::new(format_snapshot_label(&snapshot, snapshot.is_auto))
                .id(&format!("restore_snapshot_{}_{}", client.id, snapshot.id))
                .build(app_handle)?;
            submenu.item(&item);
        }

        menu.item(&submenu.build()?);
    }

    menu.separator()
        .item(&MenuItemBuilder::new("Open").id("show_main_window").build(app_handle)?)
        .item(&MenuItemBuilder::new("Quit").id("quit").build(app_handle)?)
        .build()
}
```

#### 2.5.3 事件处理

```rust
pub fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    if let TrayIconEvent::Click { id, .. } = event {
        let id_str = id.as_ref();

        // 恢复快照
        if id_str.starts_with("restore_snapshot_") {
            let parts: Vec<&str> = id_str.split('_').collect();
            if parts.len() >= 4 {
                let client_id = parts[2];
                let snapshot_id = parts[3];

                // 恢复快照内容
                match restore_snapshot(client_id.to_string(), snapshot_id.to_string(), app) {
                    Ok(content) => {
                        // 写入配置文件
                        let _ = write_config_file(client_id.to_string(), content, app);

                        // 显示通知 (macOS)
                        let _ = std::process::Command::new("osascript")
                            .args(&["-e", &format!("display notification \"已恢复快照\" with title \"SystemPromptVault\"")])
                            .output();
                    }
                    Err(e) => eprintln!("恢复快照失败: {}", e),
                }
            }
        }

        // 其他菜单项
        match id_str {
            "show_main_window" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        }
    }
}
```

### 2.6 设置页面管理

#### 2.6.1 General Settings Tab

**功能**：
- 配置最大自动快照保存数量（1-20，默认3）
- 配置最大手动快照保存数量（1-50，默认10）
- 每个客户端独立配置
- 修改后立即生效并触发分类FIFO清理

**UI 结构**：
```html
<section id="tabGeneral">
  <h2>常规设置</h2>
  <form id="formGeneralSettings">
    <label for="inputMaxAutoSnapshots">最大自动快照保存数量</label>
    <input type="number" id="inputMaxAutoSnapshots" min="1" max="20" value="3" />
    <p class="form-help-text">自动快照超过此数量时将自动删除最旧的（默认3个，包括启动时快照和切换客户端前快照）</p>

    <label for="inputMaxManualSnapshots">最大手动快照保存数量</label>
    <input type="number" id="inputMaxManualSnapshots" min="1" max="50" value="10" />
    <p class="form-help-text">手动快照（Shift+保存）超过此数量时将自动删除最旧的（默认10个）</p>

    <button type="submit" class="btn-primary">保存设置</button>
  </form>
</section>
```

**逻辑实现**：
```javascript
const loadGeneralSettings = async (clientId) => {
  try {
    const response = await SnapshotAPI.getAll(clientId);
    const { maxAutoSnapshots, maxManualSnapshots } = normalizeSnapshotResponse(response);

    state.generalMaxAutoSnapshots = maxAutoSnapshots || DEFAULT_MAX_AUTO_SNAPSHOTS;
    state.generalMaxManualSnapshots = maxManualSnapshots || DEFAULT_MAX_MANUAL_SNAPSHOTS;

    updateGeneralSettingsInput({
      auto: state.generalMaxAutoSnapshots,
      manual: state.generalMaxManualSnapshots,
    });
  } catch (error) {
    console.error("加载常规设置失败:", error);
  }
};

const saveGeneralSettings = async (event) => {
  event.preventDefault();

  const maxAuto = Math.max(1, Math.min(20, parseInt(elements.inputMaxAutoSnapshots.value, 10) || DEFAULT_MAX_AUTO_SNAPSHOTS));
  const maxManual = Math.max(1, Math.min(50, parseInt(elements.inputMaxManualSnapshots.value, 10) || DEFAULT_MAX_MANUAL_SNAPSHOTS));

  try {
    await Promise.all([
      SnapshotAPI.setMaxAutoSnapshots(state.generalSettingsClientId, maxAuto),
      SnapshotAPI.setMaxManualSnapshots(state.generalSettingsClientId, maxManual),
    ]);
    await SnapshotAPI.refreshTrayMenu();
    showToast("设置已保存", "success");
  } catch (error) {
    showToast("保存设置失败", "error");
  }
};
```

#### 2.6.2 Snapshots Management Tab

**功能**：
- 查看所有快照列表（支持客户端切换）
- 删除快照
- 重命名快照
- 手动刷新列表

**UI 结构**：
```html
<section id="tabSnapshots">
  <div class="flex items-center justify-between">
    <h2>快照管理</h2>
    <div>
      <label>选择客户端：</label>
      <select id="snapshotClientSelector">
        <!-- 动态填充 -->
      </select>
      <button id="btnRefreshSnapshots">刷新</button>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>快照名称</th>
        <th>创建时间</th>
        <th>类型</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody id="snapshotTable">
      <!-- 动态渲染 -->
    </tbody>
  </table>
</section>
```

**表格渲染**：
```javascript
const renderSnapshotTable = (snapshots) => {
  const tbody = elements.snapshotTable;
  tbody.innerHTML = "";

  if (!snapshots || snapshots.length === 0) {
    tbody.innerHTML = `
      <tr id="emptyStateSnapshot">
        <td colspan="4">暂无快照</td>
      </tr>
    `;
    return;
  }

  // 按创建时间降序排列
  const sorted = [...snapshots].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );

  sorted.forEach(snapshot => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(snapshot.name)}</td>
      <td>${formatDateTime(snapshot.created_at)}</td>
      <td>${snapshot.is_auto ? "自动" : "手动"}</td>
      <td>
        <button class="btn-secondary" onclick="renameSnapshot('${snapshot.id}')">重命名</button>
        <button class="btn-danger" onclick="deleteSnapshot('${snapshot.id}')">删除</button>
      </td>
    `;
    tbody.appendChild(row);
  });
};
```

**操作函数**：
```javascript
const deleteSnapshot = async (snapshotId) => {
  if (!confirm("确定要删除此快照吗？")) return;

  try {
    await SnapshotAPI.delete(state.currentClientId, snapshotId);
    await SnapshotAPI.refreshTrayMenu();
    await loadSnapshotsTable(state.currentClientId);
    showToast("快照已删除", "success");
  } catch (error) {
    showToast("删除快照失败", "error");
  }
};

const renameSnapshot = async (snapshotId) => {
  const newName = prompt("请输入新的快照名称：");
  if (!newName || !newName.trim()) return;

  try {
    await SnapshotAPI.rename(state.currentClientId, snapshotId, newName.trim());
    await SnapshotAPI.refreshTrayMenu();
    await loadSnapshotsTable(state.currentClientId);
    showToast("快照已重命名", "success");
  } catch (error) {
    showToast("重命名失败", "error");
  }
};
```

### 2.7 API 接口扩展

#### 2.7.1 新增 Tauri 命令

```rust
// 设置最大自动快照数量
#[tauri::command]
pub fn set_max_auto_snapshots(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    max: usize,
) -> Result<(), String>

// 设置最大手动快照数量
#[tauri::command]
pub fn set_max_manual_snapshots(
    repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
    client_id: String,
    max: usize,
) -> Result<(), String>
```

#### 2.7.2 前端 API 扩展

```javascript
export const SnapshotAPI = {
  // 现有方法...
  setMaxAutoSnapshots: (clientId, max) =>
    call("set_max_auto_snapshots", { clientId, max }),
  setMaxManualSnapshots: (clientId, max) =>
    call("set_max_manual_snapshots", { clientId, max }),
};
```

### 2.8 数据流

```mermaid
sequenceDiagram
    participant User as 用户
    participant MainApp as 主应用
    participant SnapshotAPI as SnapshotAPI
    participant Backend as Rust后端
    participant TrayMenu as System Tray

    User->>MainApp: 启动应用
    MainApp->>SnapshotAPI: create("claude", "启动时快照", content, true)
    SnapshotAPI->>Backend: create_snapshot
    Backend->>Backend: 保存到 {APP_DATA}/snapshots/claude.json
    Backend->>Backend: cleanup_old_snapshots (FIFO)
    Backend-->>SnapshotAPI: 返回 Snapshot
    SnapshotAPI->>Backend: refresh_tray_menu
    Backend->>TrayMenu: 重建菜单结构
    TrayMenu-->>User: 显示最新快照列表

    User->>MainApp: 切换客户端 (claude → chatgpt)
    MainApp->>SnapshotAPI: create("claude", "自动保存", content, true)
    SnapshotAPI->>Backend: create_snapshot
    Backend->>Backend: 保存快照并清理
    Backend-->>SnapshotAPI: 成功
    SnapshotAPI->>Backend: refresh_tray_menu
    TrayMenu-->>User: 更新菜单

    User->>TrayMenu: 左键点击托盘图标
    TrayMenu-->>User: 显示快照菜单
    User->>TrayMenu: 点击快照项
    TrayMenu->>Backend: restore_snapshot
    Backend->>Backend: 读取快照内容
    Backend-->>TrayMenu: 返回 content
    TrayMenu->>Backend: write_config_file
    Backend-->>TrayMenu: 保存成功
    TrayMenu-->>User: 显示通知 (macOS)
```

## 3. Relevant Code Modules

### 后端核心模块
- `src-tauri/src/models/snapshot.rs`: 快照数据模型定义，包含content_hash字段和分类限制配置
- `src-tauri/src/storage/snapshot_repository.rs`: 快照仓库实现，包含内容去重、分类FIFO清理策略和SHA-256哈希计算
- `src-tauri/src/commands/snapshot.rs`: 快照Tauri命令接口，包含新增的setMaxAutoSnapshots和setMaxManualSnapshots命令
- `src-tauri/src/tray.rs`: System Tray完整实现，包含菜单构建、事件处理、快照恢复、通知系统
- `src-tauri/src/file_watcher.rs`: 文件监听器，用于检测配置文件外部变化
- `src-tauri/src/commands/file_watcher.rs`: 文件监听Tauri命令接口
- `src-tauri/src/main.rs`: 应用启动、状态管理、托盘初始化、命令注册

### 前端核心模块
- `dist/js/api.js`: SnapshotAPI扩展，新增setMaxAutoSnapshots和setMaxManualSnapshots方法
- `dist/js/main.js`: 自动快照触发逻辑优化，包含内容去重错误处理和showPrompt替代原生prompt
- `dist/js/settings.js`: 快照管理界面优化，支持分类配置和双向数据绑定
- `dist/settings.html`: 设置页面UI更新，双输入框分别配置自动/手动快照限制
- `dist/css/components.css`: UI组件样式，包含Toast、按钮等

### 配置文件
- `src-tauri/Cargo.toml`: 依赖项配置，新增sha2 = "0.10"用于哈希计算
- `src-tauri/tauri.conf.json`: Tauri应用配置，包含完整的安全权限设置
- `vite.config.js`: Vite构建配置，支持legacy浏览器和现代构建流程

## 4. Attention

### 功能注意事项

1. **内容去重**：自动快照会与最新快照对比内容哈希，相同时跳过创建并返回特定错误信息
2. **分类FIFO策略**：自动快照和手动快照分别管理，互不影响清理策略
3. **向后兼容**：保留原有setMaxSnapshots接口，同时设置两个新限制值
4. **SHA-256哈希**：使用标准哈希算法确保内容一致性检测的准确性
5. **静默失败策略**：自动快照失败不会打断用户流程，仅在console中记录警告
6. **托盘菜单刷新**：所有快照操作（增删改）后必须调用 `refreshTrayMenu()`
7. **时间格式统一**：快照名称使用 `YYYY-MM-DD HH:mm` 格式（24小时制）

### 性能注意事项

1. **异步操作**：所有快照操作使用 `async/await`，不阻塞主线程
2. **防抖机制**：快照列表加载使用防抖，避免频繁请求
3. **批量读取**：托盘菜单构建时批量读取所有客户端的快照
4. **原子写入**：快照文件使用原子操作写入，避免数据损坏
5. **哈希计算**：内容去重使用SHA-256哈希，计算开销适中且安全性高

### 用户体验注意事项

1. **快捷键支持**：Shift+Cmd/Ctrl+S 或 Shift+点击保存按钮触发手动快照
2. **简洁的快照类型显示**：自动快照使用"Auto Saved"前缀，手动快照显示原始名称
3. **通知反馈**：托盘恢复快照后显示系统通知（macOS使用AppleScript）
4. **空状态提示**：无快照时显示明确的空状态信息
5. **时间格式统一**：快照显示使用 `YYYY-MM-DD HH:MM:SS` 格式（24小时制，精确到秒）

### 数据一致性注意事项

1. **客户端隔离**：每个客户端的快照存储在独立的JSON文件中
2. **并发安全**：使用 `Arc<Mutex<SnapshotRepository>>` 保证线程安全
3. **错误恢复**：JSON解析失败时自动创建新的空配置
4. **时间戳标准**：所有时间戳使用UTC时区，前端显示时转换为本地时间
5. **哈希一致性**：content_hash字段使用SHA-256算法，确保跨平台一致性
6. **配置迁移**：旧配置文件自动补充缺失字段，保证向后兼容

### 安全注意事项

1. **输入验证**：快照名称长度限制、max_snapshots范围验证
2. **文件路径**：使用Tauri的安全文件系统API，不直接操作路径
3. **快照内容**：不进行内容转义，保持配置文件原始格式
4. **哈希安全性**：使用SHA-256而非MD5等不安全哈希算法

### 可扩展性注意事项

1. **快照元数据**：Snapshot结构可扩展（如添加 `description`、`tags` 字段）
2. **快照过滤**：可按类型（自动/手动）、时间范围、内容哈希过滤
3. **批量操作**：可实现批量删除、导出快照等功能
4. **快照对比**：可实现快照内容diff对比功能
5. **哈希算法升级**：content_hash字段支持未来升级到更强的哈希算法
6. **分类扩展**：支持更多快照类型（如定时快照、事件触发快照）

## 5. Future Enhancements

### 短期优化
- [ ] 快照内容预览（Tooltip悬停显示前几行）
- [ ] 快照搜索过滤（按名称、日期、内容哈希搜索）
- [ ] 快照导出/导入功能
- [ ] 批量删除和重命名功能
- [ ] 快照压缩存储以节省磁盘空间

### 长期规划
- [ ] 快照内容Diff对比视图
- [ ] 定时自动快照（可配置间隔）
- [ ] 快照标签和分类系统
- [ ] 快照同步到云存储（可选）
- [ ] 快照分支管理（Git-like分支）
- [ ] 智能快照（基于内容变化检测）
- [ ] 快照统计和分析功能

## 6. Known Issues

1. **macOS通知限制**：使用AppleScript发送通知，需要终端权限
2. **托盘菜单数量限制**：快照过多时菜单可能过长（建议限制显示最近10个）
3. **快照名称冲突**：不同时间戳的快照可能有相同名称（允许重复）
4. **内容去重局限性**：仅与最新快照对比，可能错过中间的重复内容
5. **哈希碰撞**：SHA-256理论上存在碰撞风险，但实际概率极低

## 7. Testing Checklist

### 基础功能测试
- [ ] 启动应用时自动创建快照
- [ ] 切换客户端前自动保存快照
- [ ] Shift+保存触发手动快照命名
- [ ] 托盘菜单显示所有客户端的快照
- [ ] 托盘菜单快照按时间降序排列
- [ ] 点击托盘菜单快照项成功恢复配置
- [ ] 恢复快照后显示系统通知

### 分类管理测试
- [ ] 设置页面General Tab保存最大自动快照数量（默认3）
- [ ] 设置页面General Tab保存最大手动快照数量（默认10）
- [ ] 自动快照超过限制时删除最旧的自动快照
- [ ] 手动快照超过限制时删除最旧的手动快照
- [ ] 自动快照和手动快照互不影响清理

### 内容去重测试
- [ ] 内容未变化时跳过自动快照创建
- [ ] 内容变化时正常创建自动快照
- [ ] 手动快照不受内容去重限制
- [ ] 快照文件中包含content_hash字段

### API接口测试
- [ ] setMaxAutoSnapshots命令正常工作
- [ ] setMaxManualSnapshots命令正常工作
- [ ] 向后兼容setMaxSnapshots命令
- [ ] 快照配置正确加载max_auto_snapshots和max_manual_snapshots字段

### UI交互测试
- [ ] 设置页面双输入框分别显示自动/手动限制
- [ ] 手动快照命名使用showPrompt替代原生prompt
- [ ] 快照列表显示自动/手动类型标识
- [ ] 设置页面数值范围验证（自动1-20，手动1-50）

### 错误处理测试
- [ ] 快照创建失败时静默处理
- [ ] 内容去重错误正确识别和日志记录
- [ ] 无效配置值自动使用默认值
- [ ] 旧配置文件自动迁移到新格式

### 兼容性测试
- [ ] 旧版本快照文件正常加载
- [ ] 缺失字段自动补充默认值
- [ ] 暗色模式下所有UI正常显示
