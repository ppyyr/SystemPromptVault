# 客户端导入导出功能技术实现方案

### Code Sections

- `src-tauri/src/models/client.rs:76-96` (ClientConfig::from_parts): 客户端配置创建和路径验证机制
  ```rust
  fn from_parts(
      id: String,
      name: String,
      config_file_paths: Vec<String>,
      active_config_path: Option<String>,
      auto_tag: bool,
      is_builtin: bool,
  ) -> Self {
      let mut config = Self { /* 初始化字段 */ };
      config.ensure_active_path(); // 确保激活路径有效性
      config
  }
  ```

- `src-tauri/src/storage/client_repository.rs:79-85` (persist): 客户端数据持久化机制
  ```rust
  fn persist(&self) -> Result<(), String> {
      let clients: Vec<ClientConfig> = self.clients.values().cloned().collect();
      let content = serde_json::to_string_pretty(&clients)
          .map_err(|e| format!("序列化客户端配置失败: {}", e))?;
      atomic_write(&self.path, &content)
  }
  ```

- `src-tauri/src/commands/config_file.rs:54-57` (write_config_file): 配置文件原子写入机制
  ```rust
  let path = expand_tilde(&resolved);
  if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
  }
  fs::write(&path, content).map_err(|e| format!("写入配置文件失败: {}", e))
  ```

- `dist/js/api.js:18-20` (PromptAPI 导入导出): 现有的提示词导入导出API参考
  ```javascript
  export const PromptAPI = {
    exportPrompts: () => call("export_prompts"),
    importPrompts: (jsonData) => call("import_prompts", { jsonData }),
  };
  ```

- `src-tauri/src/utils/file_ops.rs`: 文件操作工具函数（需要查看实现）
  ```rust
  // 假设存在原子写入和文件操作工具
  pub fn atomic_write(path: &Path, content: &str) -> Result<(), String> { /* 实现 */ }
  ```

### Report

#### conclusions

> 导入导出功能需要基于现有的架构模式设计，包含配置序列化、文件内容收集、冲突处理和数据验证

- 导出格式采用JSON结构，包含客户端元数据和配置文件内容映射
- 导入需要支持增量模式（覆盖/合并）和冲突解决策略
- 配置文件路径处理需要支持相对路径转换和目录创建
- 内置客户端的导入导出需要特殊处理，避免覆盖系统配置
- 大文件处理需要流式读取和内存优化

#### relations

> 导入导出功能与现有模块的集成关系

- **导出流程**: ClientRepository → ClientConfig → config_file read → JSON序列化 → 文件下载
- **导入流程**: 文件解析 → 数据验证 → config_file write → ClientConfig save → 仓库更新
- **API设计**: 扩展ClientAPI添加export_clients/import_clients方法
- **UI集成**: 在客户端管理tab添加导出导入按钮，参考提示词管理界面
- **错误处理**: 复用现有的错误处理机制和Toast通知系统

#### result

> 导入导出功能的具体实现架构

**导出功能设计:**
```json
{
  "version": "1.0",
  "export_type": "clients",
  "timestamp": "2025-11-13T...",
  "clients": [
    {
      "client": {
        "id": "custom-client",
        "name": "Custom Client",
        "config_file_paths": ["~/config1.md", "~/config2.md"],
        "active_config_path": "~/config1.md",
        "auto_tag": true,
        "is_builtin": false
      },
      "config_files": {
        "~/config1.md": "file content here...",
        "~/config2.md": "another file content..."
      }
    }
  ]
}
```

**导入功能设计:**
- 支持冲突解决：skip/overwrite/merge三种策略
- 路径处理：相对路径自动转换，~路径展开
- 验证机制：客户端ID唯一性检查，文件内容格式验证
- 事务性：导入失败时支持回滚操作

#### attention

> 导入导出功能开发需要重点解决的技术挑战

- **大文件处理**: 配置文件可能很大，需要分块读取和内存优化
- **路径兼容性**: 导入导出环境不同，需要路径转换和适配
- **并发安全**: 导入导出过程中的文件操作需要避免冲突
- **权限控制**: 文件读写权限验证和错误处理
- **数据完整性**: 确保导入导出过程中数据不丢失不损坏
- **向后兼容**: 导出格式版本化和向后兼容性支持