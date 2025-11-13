# 客户端多配置文件支持 - 修改文件清单

## Code Sections

### 1. 核心数据模型文件

- `src-tauri/src/models/client.rs`: ClientConfig 结构体定义
  - **修改位置**: 第8行 `config_file_path: String`
  - **目标变更**: 改为 `config_file_paths: Vec<String>`
  - **影响范围**: 所有构造方法 `new_builtin` 和 `new_custom`

### 2. 客户端命令接口文件

- `src-tauri/src/commands/client.rs`: 客户端 CRUD 操作命令
  - **修改位置**: 第36行 `config_file_path: String` 参数
  - **修改位置**: 第64行 `config_file_path: Option<String>` 参数
  - **影响范围**: `add_custom_client` 和 `update_client` 函数签名

### 3. 配置文件操作命令

- `src-tauri/src/commands/config_file.rs`: 配置文件读写操作
  - **修改位置**: 第25行和第43行 `client.config_file_path` 使用
  - **需要新增**: 路径索引参数或默认路径选择逻辑
  - **影响范围**: `read_config_file` 和 `write_config_file` 函数

### 4. 存储层实现

- `src-tauri/src/storage/client_repository.rs`: 客户端数据持久化
  - **修改位置**: 第58-63行 `load_clients` 反序列化逻辑
  - **需要新增**: 数据迁移逻辑和向后兼容支持
  - **影响范围**: JSON 序列化/反序列化格式

### 5. System Tray 集成

- `src-tauri/src/tray.rs`: 系统托盘快照恢复功能
  - **修改位置**: 第169行 `client.config_file_path` 使用
  - **需要确定**: 多配置文件时的默认选择策略
  - **影响范围**: 快照恢复时的文件路径选择

## Report

### conclusions

> 需要修改的文件清单和优先级

- **核心文件** (5个): `models/client.rs`, `commands/client.rs`, `commands/config_file.rs`, `storage/client_repository.rs`, `tray.rs`
- **测试文件** (预估2-3个): 需要为修改的功能编写对应的单元测试
- **文档文件** (1个): 需要更新 API 文档和使用说明
- **总修改量**: 预计约 15-20 个函数需要修改或新增

### relations

> 文件间的依赖关系和修改顺序

1. **第一步**: 修改 `models/client.rs` - 定义新的数据结构
2. **第二步**: 修改 `storage/client_repository.rs` - 实现数据迁移和存储逻辑
3. **第三步**: 修改 `commands/client.rs` - 适配命令接口
4. **第四步**: 修改 `commands/config_file.rs` - 适配文件操作逻辑
5. **第五步**: 修改 `tray.rs` - 适配托盘集成功能
6. **第六步**: 编写测试 - 确保功能正确性

### result

> 详细的修改清单和实现要点

#### 1. models/client.rs 修改要点

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub id: String,
    pub name: String,
    #[serde(deserialize_with = "deserialize_config_paths")]
    pub config_file_paths: Vec<String>, // 改为路径数组
    pub auto_tag: bool,
    pub is_builtin: bool,
}

// 向后兼容的反序列化函数
fn deserialize_config_paths<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    // 实现新旧格式的兼容反序列化
}
```

#### 2. storage/client_repository.rs 修改要点

```rust
impl ClientRepository {
    fn load_clients(path: &Path) -> Result<IndexMap<String, ClientConfig>, String> {
        // 实现数据迁移逻辑
        // 支持新旧格式自动检测和转换
    }

    fn migrate_legacy_data(&self) -> Result<(), String> {
        // 执行从单路径到多路径的数据迁移
    }
}
```

#### 3. commands/client.rs 修改要点

```rust
#[tauri::command]
pub fn add_custom_client(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    id: String,
    name: String,
    config_file_paths: Vec<String>, // 改为数组参数
) -> Result<ClientConfig, String> {
    // 验证路径数组非空且有效
}

#[tauri::command]
pub fn update_client(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    id: String,
    name: Option<String>,
    config_file_paths: Option<Vec<String>>, // 改为数组参数
    auto_tag: Option<bool>,
) -> Result<ClientConfig, String> {
    // 支持路径数组的更新逻辑
}
```

#### 4. commands/config_file.rs 修改要点

```rust
#[tauri::command]
pub fn read_config_file(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    client_id: String,
    path_index: Option<usize>, // 新增路径索引参数
) -> Result<String, String> {
    // 使用指定索引的配置文件路径，默认使用第一个
}

#[tauri::command]
pub fn write_config_file(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    client_id: String,
    content: String,
    path_index: Option<usize>, // 新增路径索引参数
) -> Result<(), String> {
    // 写入到指定索引的配置文件路径
}

// 新增多文件读取命令
#[tauri::command]
pub fn read_all_config_files(
    repository: State<'_, Arc<Mutex<ClientRepository>>>,
    client_id: String,
) -> Result<Vec<String>, String> {
    // 读取所有配置文件内容
}
```

#### 5. tray.rs 修改要点

```rust
// 在恢复快照时需要确定使用哪个配置文件路径
fn restore_snapshot(...) -> Result<(), Box<dyn std::error::Error>> {
    // 默认使用第一个配置文件路径进行恢复
    // 或者需要用户选择具体路径
}
```

### attention

> 修改过程中的关键注意事项

- **API 破坏性**: 所有涉及 `config_file_path` 的 Tauri 命令接口都会发生变化
- **前端适配**: 前端 JavaScript 代码需要适配新的多路径参数格式
- **默认行为**: 明确定义多配置文件时的默认读写行为（通常使用第一个路径）
- **错误处理**: 增强路径索引越界等边界情况的错误处理
- **性能考虑**: 多文件操作时的性能优化和并发安全
- **向后兼容**: 确保旧版本客户端能够正常迁移到新格式
- **测试覆盖**: 需要为每个修改的函数编写充分的单元测试和集成测试

#### 额外需要的修改

- **错误消息**: 更新所有错误消息以支持多路径上下文
- **日志记录**: 增强日志记录以跟踪多路径操作
- **配置验证**: 增加对多个配置文件路径的有效性验证
- **UI 界面**: 前端需要增加路径选择器和多文件管理界面