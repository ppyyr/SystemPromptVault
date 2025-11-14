# 客户端导入导出数据模型适配分析

## 1. Purpose

分析客户端配置 (ClientConfig) 和提示词 (Prompt) 的数据结构差异，为客户端管理tab的导入导出功能开发提供数据模型适配方案和验证逻辑设计。

## 2. How it Works

### 2.1 数据结构对比分析

#### 2.1.1 提示词数据模型 (Prompt)

从现有导入导出功能实现推断，提示词数据结构包含以下字段：

```rust
pub struct Prompt {
    pub id: String,           // 唯一标识符
    pub name: String,         // 提示词名称
    pub content: String,      // 提示词内容
    pub tags: Vec<String>,    // 标签列表
    pub created_at: DateTime<Utc>,  // 创建时间
    pub updated_at: DateTime<Utc>,  // 更新时间
}
```

**验证要求**:
- 所有字段均为必需字段
- 字符串字段不能为空
- tags 必须是数组，但可以为空数组
- 日期时间字段必须是有效的 ISO 8601 格式字符串

#### 2.1.2 客户端配置数据模型 (ClientConfig)

基于 `src-tauri/src/models/client.rs:5-12` 的实现：

```rust
pub struct ClientConfig {
    pub id: String,                     // 客户端唯一标识符
    pub name: String,                   // 客户端显示名称
    pub config_file_paths: Vec<String>, // 配置文件路径列表
    pub active_config_path: Option<String>, // 当前活跃的配置文件路径
    pub auto_tag: bool,                 // 是否自动标签
    pub is_builtin: bool,               // 是否内置客户端
}
```

**字段说明**:
- `id`: 必需，唯一标识符，不可重复
- `name`: 必需，用户可见的显示名称
- `config_file_paths`: 必需，至少包含一个路径
- `active_config_path`: 可选，必须存在于 `config_file_paths` 中
- `auto_tag`: 必需，布尔值
- `is_builtin`: 必需，布尔值，导入时强制为 false

### 2.2 数据模型对比表

| 字段名 | Prompt | ClientConfig | 验证差异 |
|-------|--------|--------------|---------|
| id | String (必需) | String (必需) | 相同 - 非空字符串 |
| name | String (必需) | String (必需) | 相同 - 非空字符串 |
| content | String (必需) | N/A | 提示词特有 |
| tags | Vec<String> (必需) | N/A | 提示词特有 |
| created_at | DateTime (必需) | N/A | 提示词特有 - 时间戳 |
| updated_at | DateTime (必需) | N/A | 提示词特有 - 时间戳 |
| config_file_paths | N/A | Vec<String> (必需) | 客户端特有 - 至少一个路径 |
| active_config_path | N/A | Option<String> | 客户端特有 - 可选但需验证 |
| auto_tag | N/A | bool (必需) | 客户端特有 - 布尔值 |
| is_builtin | N/A | bool (必需) | 客户端特有 - 导入时强制为 false |

### 2.3 客户端导入导出的关键设计决策

#### 2.3.1 内置客户端保护策略

基于 `src-tauri/src/models/client.rs:175-196`，系统定义了三个内置客户端：

```rust
pub fn default_clients() -> Vec<ClientConfig> {
    vec![
        ClientConfig::new_builtin("Claude", "Claude", vec!["~/.claude/CLAUDE.md"], true),
        ClientConfig::new_builtin("Codex", "Codex", vec!["~/.codex/AGENTS.md"], true),
        ClientConfig::new_builtin("Gemini", "Gemini", vec!["~/.gemini/GEMINI.md"], true),
    ]
}
```

**导入策略**:
1. **强制设置 `is_builtin: false`**: 导入的客户端永远不应标记为内置
2. **ID 冲突处理**: 如果导入的客户端 ID 与内置客户端冲突，应该拒绝导入或提示用户修改 ID
3. **权限限制**: 不允许通过导入覆盖内置客户端配置

#### 2.3.2 导出时的数据过滤策略

**问题**: 是否应该导出内置客户端？

**推荐方案**:
```rust
#[tauri::command]
pub fn export_clients(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
) -> Result<String, String> {
    let repo = lock_repo(&repository)?;
    let all_clients = repo.get_all()?;

    // 仅导出自定义客户端，排除内置客户端
    let custom_clients: Vec<ClientConfig> = all_clients
        .into_iter()
        .filter(|client| !client.is_builtin)
        .collect();

    serde_json::to_string_pretty(&custom_clients)
        .map_err(|e| format!("序列化客户端配置失败: {}", e))
}
```

**理由**:
1. 内置客户端在每个安装中都相同，无需导出
2. 避免用户在不同系统间传播内置客户端的配置差异
3. 减少导出文件大小

#### 2.3.3 active_config_path 的自动修复机制

基于 `src-tauri/src/models/client.rs:97-112` 的实现：

```rust
fn ensure_active_path(&mut self) {
    if self.config_file_paths.is_empty() {
        self.active_config_path = None;
        return;
    }

    let has_valid_active = self.active_config_path
        .as_ref()
        .map(|target| self.config_file_paths.iter().any(|path| path == target))
        .unwrap_or(false);

    if !has_valid_active {
        self.active_config_path = self.config_file_paths.first().cloned();
    }
}
```

**导入策略**:
1. 如果导入的数据中 `active_config_path` 不在 `config_file_paths` 中，自动设置为第一个路径
2. 如果 `config_file_paths` 为空，设置 `active_config_path` 为 `None`
3. 这个逻辑应该在导入验证阶段执行，确保数据一致性

### 2.4 客户端导入验证逻辑设计

基于提示词导入验证逻辑 (`src-tauri/src/commands/prompt.rs:144-251`)，为客户端设计类似的验证流程：

#### 2.4.1 数据解析和验证函数框架

```rust
fn parse_and_validate_clients(json_data: &str) -> Result<Vec<ClientConfig>, String> {
    let trimmed = json_data.trim();
    if trimmed.is_empty() {
        return Err("导入数据不能为空".to_string());
    }

    // 1. JSON 解析
    let value: Value = serde_json::from_str(trimmed)
        .map_err(|e| format!("解析客户端配置 JSON 失败: {}", e))?;

    // 2. 数组结构验证
    let entries = value.as_array()
        .ok_or_else(|| "导入数据必须是客户端配置数组".to_string())?;

    // 3. 逐条字段验证
    validate_client_entries(entries)?;

    // 4. 转换为 ClientConfig 对象
    let clients: Vec<ClientConfig> = serde_json::from_value(value)
        .map_err(|e| format!("转换客户端配置数据失败: {}", e))?;

    // 5. 数据模型验证和修复
    let validated_clients = validate_and_fix_client_models(clients)?;

    Ok(validated_clients)
}
```

#### 2.4.2 字段级别验证逻辑

```rust
fn validate_client_entries(entries: &[Value]) -> Result<(), String> {
    for (index, entry) in entries.iter().enumerate() {
        let obj = entry.as_object()
            .ok_or_else(|| format!("第{}个条目必须是对象", index + 1))?;

        // 验证必需字段
        ensure_string_field(obj, "id", index)?;
        ensure_string_field(obj, "name", index)?;
        ensure_string_array_field(obj, "config_file_paths", index)?;
        ensure_bool_field(obj, "auto_tag", index)?;

        // active_config_path 可选，但如果存在必须是字符串
        if let Some(value) = obj.get("active_config_path") {
            if !value.is_null() && !value.is_string() {
                return Err(format!(
                    "第{}个客户端的 active_config_path 必须是字符串或 null",
                    index + 1
                ));
            }
        }
    }
    Ok(())
}

fn ensure_string_array_field(
    obj: &serde_json::Map<String, Value>,
    field: &str,
    index: usize,
) -> Result<(), String> {
    match obj.get(field) {
        Some(Value::Array(arr)) if !arr.is_empty() => {
            // 验证数组中的每个元素都是非空字符串
            for (i, item) in arr.iter().enumerate() {
                match item {
                    Value::String(s) if !s.trim().is_empty() => {},
                    Value::String(_) => {
                        return Err(format!(
                            "第{}个客户端的 {} 数组中第{}个元素不能为空字符串",
                            index + 1, field, i + 1
                        ));
                    },
                    _ => {
                        return Err(format!(
                            "第{}个客户端的 {} 数组中第{}个元素必须是字符串",
                            index + 1, field, i + 1
                        ));
                    },
                }
            }
            Ok(())
        },
        Some(Value::Array(_)) => Err(format!(
            "第{}个客户端的 {} 不能为空数组",
            index + 1, field
        )),
        Some(_) => Err(format!(
            "第{}个客户端的 {} 必须是数组",
            index + 1, field
        )),
        None => Err(format!(
            "第{}个客户端缺少 {} 字段",
            index + 1, field
        )),
    }
}

fn ensure_bool_field(
    obj: &serde_json::Map<String, Value>,
    field: &str,
    index: usize,
) -> Result<(), String> {
    match obj.get(field) {
        Some(Value::Bool(_)) => Ok(()),
        Some(_) => Err(format!(
            "第{}个客户端的 {} 必须是布尔值",
            index + 1, field
        )),
        None => Err(format!(
            "第{}个客户端缺少 {} 字段",
            index + 1, field
        )),
    }
}
```

#### 2.4.3 数据模型验证和自动修复

```rust
fn validate_and_fix_client_models(
    mut clients: Vec<ClientConfig>
) -> Result<Vec<ClientConfig>, String> {
    for (index, client) in clients.iter_mut().enumerate() {
        // 1. 验证 ID 和名称不为空
        if client.id.trim().is_empty() {
            return Err(format!("第{}个客户端的 ID 不能为空", index + 1));
        }
        if client.name.trim().is_empty() {
            return Err(format!("第{}个客户端的名称不能为空", index + 1));
        }

        // 2. 验证配置文件路径列表
        if client.config_file_paths.is_empty() {
            return Err(format!(
                "第{}个客户端至少需要一个配置文件路径",
                index + 1
            ));
        }
        for (path_index, path) in client.config_file_paths.iter().enumerate() {
            if path.trim().is_empty() {
                return Err(format!(
                    "第{}个客户端的第{}个配置文件路径不能为空",
                    index + 1,
                    path_index + 1
                ));
            }
        }

        // 3. 强制设置为非内置客户端
        client.is_builtin = false;

        // 4. 自动修复 active_config_path
        if let Some(active_path) = &client.active_config_path {
            if !client.config_file_paths.contains(active_path) {
                // 无效的 active_config_path，自动设置为第一个路径
                client.active_config_path = client.config_file_paths.first().cloned();
            }
        } else {
            // 未设置 active_config_path，自动设置为第一个路径
            client.active_config_path = client.config_file_paths.first().cloned();
        }
    }

    Ok(clients)
}
```

### 2.5 客户端仓库导入逻辑设计

基于 `src-tauri/src/storage/prompt_repository.rs:61-91`，设计客户端仓库的导入逻辑：

```rust
impl ClientRepository {
    pub fn import_clients(&mut self, clients: Vec<ClientConfig>) -> Result<ImportResult, String> {
        if clients.is_empty() {
            return Ok(ImportResult {
                total: 0,
                added: 0,
                updated: 0,
            });
        }

        let mut merged = self.clients.clone();
        let mut added = 0usize;
        let mut updated = 0usize;
        let mut skipped = 0usize;

        for client in clients {
            // 检查是否与内置客户端冲突
            if let Some(existing) = merged.get(&client.id) {
                if existing.is_builtin {
                    // 不允许覆盖内置客户端
                    skipped += 1;
                    continue;
                }
                updated += 1;
            } else {
                added += 1;
            }
            merged.insert(client.id.clone(), client);
        }

        // 持久化到文件
        self.clients = merged;
        self.persist()?;

        Ok(ImportResult {
            total: added + updated,
            added,
            updated,
        })
    }
}
```

### 2.6 前端数据验证逻辑适配

基于 `dist/js/settings.js:1680-1695`，为客户端导入设计前端验证：

```javascript
const validateClientImportPayload = (jsonText) => {
  // 1. 基础空值检查
  if (!jsonText.trim()) {
    throw new Error(t("errors.importFileEmpty", "Import file is empty"));
  }

  let parsed;
  try {
    // 2. JSON 格式解析
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(t("errors.importInvalidJson", "Invalid JSON format"));
  }

  // 3. 数据结构验证 - 必须是数组
  if (!Array.isArray(parsed)) {
    throw new Error(
      t("errors.importInvalidStructure", "JSON content must be an array of clients")
    );
  }

  // 4. 基础字段检查
  parsed.forEach((client, index) => {
    if (!client.id || typeof client.id !== 'string' || !client.id.trim()) {
      throw new Error(
        t("errors.clientMissingId", "Client {index} is missing a valid ID")
          .replace("{index}", `#${index + 1}`)
      );
    }
    if (!client.name || typeof client.name !== 'string' || !client.name.trim()) {
      throw new Error(
        t("errors.clientMissingName", "Client {index} is missing a valid name")
          .replace("{index}", `#${index + 1}`)
      );
    }
    if (!Array.isArray(client.config_file_paths) || client.config_file_paths.length === 0) {
      throw new Error(
        t("errors.clientMissingPaths", "Client {index} must have at least one config file path")
          .replace("{index}", `#${index + 1}`)
      );
    }
  });
};
```

## 3. Relevant Code Modules

### 数据模型定义
- `src-tauri/src/models/client.rs:5-172` - ClientConfig 数据结构定义和辅助方法
- `src-tauri/src/models/client.rs:175-196` - 内置客户端定义

### 参考实现
- `src-tauri/src/commands/prompt.rs:144-251` - 提示词导入验证逻辑 (可复用)
- `src-tauri/src/storage/prompt_repository.rs:61-91` - 提示词导入仓库逻辑 (可复用)
- `src-tauri/src/storage/client_repository.rs:59-84` - 客户端仓库持久化实现

### 前端验证
- `dist/js/settings.js:1680-1695` - 提示词导入前端验证 (可复用)

## 4. Attention

### 4.1 关键设计决策

1. **内置客户端保护**: 必须实现机制防止导入覆盖内置客户端
2. **导出过滤**: 仅导出自定义客户端，排除内置客户端
3. **active_config_path 自动修复**: 确保路径有效性，自动修复无效配置
4. **is_builtin 强制设置**: 导入的客户端始终设置为非内置

### 4.2 验证层次

1. **前端验证**: 基础格式和结构检查，快速失败
2. **后端字段验证**: 详细的字段类型和内容验证
3. **模型验证**: 业务逻辑验证和数据一致性检查
4. **自动修复**: 在导入过程中自动修复可修复的问题

### 4.3 错误处理策略

1. **清晰的错误消息**: 指明具体的错误位置和原因 (例如: "第3个客户端的 config_file_paths 不能为空数组")
2. **操作原子性**: 导入失败时不改变现有数据
3. **部分导入处理**: 如果某些客户端与内置客户端冲突，跳过这些客户端但继续导入其他客户端

### 4.4 UI/UX 考虑

1. **导入结果详情**: 显示新增、更新和跳过的客户端数量
2. **冲突提示**: 如果有客户端因为与内置客户端冲突而被跳过，应该特别提示用户
3. **文件命名**: 使用类似 `clients_backup_YYYYMMDD_HHMMSS.json` 的格式