# 客户端多配置文件支持 - 数据迁移策略

## Code Sections

### 1. 现有数据格式分析

- `src-tauri/src/storage/client_repository.rs:58-63` (load_clients): 客户端数据加载逻辑
  ```rust
  fn load_clients(path: &Path) -> Result<IndexMap<String, ClientConfig>, String> {
      let raw = fs::read_to_string(path).map_err(|e| format!("读取客户端配置失败: {}", e))?;
      let clients: Vec<ClientConfig> = serde_json::from_str(&raw)
          .map_err(|e| format!("解析客户端配置失败: {}", e))?;
      Ok(clients.into_iter().map(|c| (c.id.clone(), c)).collect())
  }
  ```

### 2. 默认客户端数据

- `src-tauri/src/models/client.rs:48-54` (default_clients): 内置客户端初始化
  ```rust
  pub fn default_clients() -> Vec<ClientConfig> {
      vec![
          ClientConfig::new_builtin("Claude", "Claude", "~/.claude/CLAUDE.md", true),
          ClientConfig::new_builtin("Codex", "Codex", "~/.codex/AGENTS.md", true),
          ClientConfig::new_builtin("Gemini", "Gemini", "~/.gemini/GEMINI.md", true),
      ]
  }
  ```

## Report

### conclusions

> 数据迁移策略的核心要点

- **存储位置**: 客户端数据存储在 `{APP_DATA}/SystemPromptVault/clients.json`
- **现有格式**: JSON 数组包含单一路段 `config_file_path`
- **目标格式**: JSON 数组包含路径数组 `config_file_paths`
- **迁移时机**: 应用启动时检测数据格式并自动迁移
- **向后兼容**: 保持对旧版本数据的完全兼容

### relations

> 迁移流程涉及的组件关系

- **存储层**: `ClientRepository::load_clients()` 是迁移的关键执行点
- **数据模型**: `ClientConfig` 结构体需要支持反序列化两种格式
- **默认客户端**: `default_clients()` 函数需要适配新的多路径格式
- **应用初始化**: `main.rs` 中 `ClientRepository::new()` 是迁移触发点

### result

> 完整的数据迁移实施方案

#### 迁移策略设计

1. **双格式反序列化支持**
   - 使用 `#[serde(deserialize_with = "...")]` 或自定义 `Deserialize` 实现
   - 优先尝试新格式，失败后回退到旧格式
   - 自动将旧格式数据转换为新格式

2. **自动迁移触发点**
   - 在 `ClientRepository::new()` 中执行迁移检查
   - 检测到旧格式数据时自动执行迁移
   - 迁移完成后立即持久化新格式数据

3. **数据转换规则**
   - 单一路径 → 包含一个元素的路径数组
   - 保持所有其他字段不变
   - 维护客户端 ID 的唯一性

#### 迁移实现步骤

```rust
impl ClientConfig {
    // 向后兼容的反序列化
    pub fn migrate_from_legacy(legacy: LegacyClientConfig) -> Self {
        Self {
            id: legacy.id,
            name: legacy.name,
            config_file_paths: vec![legacy.config_file_path], // 单路径转数组
            auto_tag: legacy.auto_tag,
            is_builtin: legacy.is_builtin,
        }
    }
}

fn load_clients_with_migration(path: &Path) -> Result<IndexMap<String, ClientConfig>, String> {
    let raw = fs::read_to_string(path)?;

    // 尝试新格式
    if let Ok(clients) = serde_json::from_str::<Vec<ClientConfig>>(&raw) {
        return Ok(clients.into_iter().map(|c| (c.id.clone(), c)).collect());
    }

    // 回退到旧格式并迁移
    let legacy_clients: Vec<LegacyClientConfig> = serde_json::from_str(&raw)?;
    let migrated_clients: Vec<ClientConfig> = legacy_clients
        .into_iter()
        .map(ClientConfig::migrate_from_legacy)
        .collect();

    // 立即持久化新格式
    let content = serde_json::to_string_pretty(&migrated_clients)?;
    atomic_write(path, &content)?;

    Ok(migrated_clients.into_iter().map(|c| (c.id.clone(), c)).collect())
}
```

### attention

> 迁移过程中的风险点和注意事项

- **数据完整性**: 迁移前验证旧格式数据完整性，迁移后验证新格式数据正确性
- **原子性**: 迁移操作应具备原子性，避免部分迁移导致数据损坏
- **回滚机制**: 提供迁移失败时的回滚能力，确保用户数据不丢失
- **性能考虑**: 大量客户端数据时的迁移性能优化
- **并发安全**: 多实例同时启动时的迁移竞争条件处理
- **测试覆盖**: 需要覆盖各种边界情况的迁移测试用例

#### 迁移失败恢复策略

1. **备份机制**: 迁移前自动备份原始 `clients.json` 文件
2. **错误日志**: 详细记录迁移失败的原因和上下文信息
3. **降级处理**: 迁移失败时尝试使用旧格式继续运行
4. **用户通知**: 必要时向用户显示迁移状态和错误信息

#### 测试用例设计

- 空的 `clients.json` 文件处理
- 仅包含内置客户端的默认配置
- 包含自定义客户端的混合配置
- 损坏的 JSON 文件处理
- 权限不足等文件系统错误处理
- 新旧格式混合存在的情况