# SystemPromptVault 核心功能模块与开发规范分析

## Code Sections

### 核心数据模型

- `src-tauri/src/models/prompt.rs:16-60` (提示词实体操作): 提示词业务逻辑方法
  ```rust
  impl Prompt {
    pub fn new(name: impl Into<String>, content: impl Into<String>, tags: Vec<String>) -> Self
    pub fn update_content(&mut self, new_content: impl Into<String>)
    pub fn add_tag(&mut self, tag: impl Into<String>)
    pub fn remove_tag(&mut self, tag: &str) -> bool
    pub fn has_tag(&self, tag: &str) -> bool
  }
  ```

- `src-tauri/src/models/client.rs:47-55` (默认客户端配置): 内置客户端定义
  ```rust
  pub fn default_clients() -> Vec<ClientConfig> {
    vec![
      ClientConfig::new_builtin("Claude", "Claude", "~/.claude/CLAUDE.md", true),
      ClientConfig::new_builtin("Codex", "Codex", "~/.codex/AGENTS.md", true),
      ClientConfig::new_builtin("Gemini", "Gemini", "~/.gemini/GEMINI.md", true)
    ]
  }
  ```

### 存储层架构

- `src-tauri/src/storage/prompt_repository.rs` (提示词仓储): 数据访问层实现
- `src-tauri/src/storage/client_repository.rs` (客户端仓储): 客户端数据管理
- `src-tauri/src/storage/snapshot_repository.rs` (快照仓储): 版本备份管理
- `src-tauri/src/storage/json_store.rs` (JSON 存储基础): 底层文件操作

### 命令系统

- `src-tauri/src/commands/prompt.rs` (提示词命令): 提示词相关 Tauri 命令
- `src-tauri/src/commands/client.rs` (客户端命令): 客户端管理命令
- `src-tauri/src/commands/config_file.rs` (配置文件命令): 全局配置读写
- `src-tauri/src/commands/snapshot.rs` (快照命令): 快照管理命令
- `src-tauri/src/commands/app_state.rs` (应用状态命令): 应用状态同步

### 前端功能模块

- `dist/js/main.js:17-35` (前端状态管理): 主页面状态定义
  ```javascript
  const state = {
    clients: [],
    currentClientId: "claude",
    prompts: [],
    selectedTags: [],
    configContent: "",
    editorMode: "edit",
    editorDirty: false
  };
  ```

- `dist/js/settings.js` (设置页面): 提示词和客户端管理界面
- `dist/js/theme.js` (主题系统): 暗色/亮色主题切换
- `dist/js/utils.js` (工具函数): 通用功能和 UI 组件

### 文档系统

- `llmdoc/index.md:1-52` (开发文档索引): 完整技术文档体系
- `README.md:1-228` (项目说明): 功能特性、快速开始、使用指南

## Report

### 结论

> 系统采用模块化架构，包含提示词管理、客户端切换、配置文件操作、快照备份等核心功能

- **功能模块**: 6 个核心功能模块，职责分离清晰
- **数据流**: 前端状态管理 ↔ API 封装 ↔ Tauri 命令 ↔ 存储层
- **文件结构**: 按功能域组织，前后端代码分离
- **文档体系**: 完善的技术文档和开发指南

### 关系

> 模块间的数据流和依赖关系

- **数据层关系**:
  - `PromptRepository` ↔ `prompts.json`
  - `ClientRepository` ↔ `clients.json`
  - `SnapshotRepository` ↔ `snapshots/`

- **命令层关系**:
  - `prompt commands` → `PromptRepository`
  - `client commands` → `ClientRepository`
  - `config_file commands` → 文件系统操作

- **前端层关系**:
  - `main.js` ↔ `api.js` ↔ Tauri commands
  - `settings.js` ↔ 提示词/客户端管理
  - `theme.js` ↔ CSS 主题切换

### 结果

> 核心功能模块清单和开发规范总结

**核心功能模块**:

1. **提示词管理模块** (`src-tauri/src/commands/prompt.rs`)
   - 增删改查提示词
   - 标签过滤和搜索
   - 导入导出功能
   - 批量操作支持

2. **客户端管理模块** (`src-tauri/src/commands/client.rs`)
   - 内置客户端配置 (Claude, Codex, Gemini)
   - 自定义客户端添加
   - 客户端切换和状态同步

3. **配置文件操作模块** (`src-tauri/src/commands/config_file.rs`)
   - 读取用户配置文件内容
   - 写入配置文件
   - 文件变化监听

4. **快照备份模块** (`src-tauri/src/commands/snapshot.rs`)
   - 自动创建配置快照
   - 手动快照管理
   - System Tray 快速恢复

5. **应用状态模块** (`src-tauri/src/commands/app_state.rs`)
   - 当前客户端状态
   - 窗口位置和大小记忆
   - 应用配置持久化

6. **文件监听模块** (`src-tauri/src/commands/file_watcher.rs`)
   - 实时检测配置文件外部修改
   - 冲突提示和重新加载

**开发工作流**:

- **开发环境**: `cargo tauri dev` 启动热重载开发服务器
- **构建流程**:
  1. `bun run build:css` 编译 Tailwind CSS
  2. `vite build` 构建前端资源
  3. `cargo tauri build` 打包桌面应用
- **测试现状**: 当前无自动化测试配置
- **代码规范**:
  - Rust 代码遵循 `rustfmt` 格式化
  - JavaScript 使用 ES6+ 语法
  - CSS 遵循 Tailwind 约定

**目录结构规范**:

```
SystemPromptVault/
├── dist/                    # 前端静态资源
│   ├── index.html           # 主界面
│   ├── settings.html        # 设置界面
│   ├── css/                 # 样式文件
│   └── js/                  # JavaScript 模块
├── src-tauri/               # Rust 后端代码
│   ├── src/
│   │   ├── commands/        # Tauri 命令
│   │   ├── models/          # 数据模型
│   │   ├── storage/         # 数据访问层
│   │   └── utils/           # 工具函数
│   └── Cargo.toml           # Rust 依赖配置
└── llmdoc/                  # 项目文档
```

**现有文档概览**:

- **架构文档**: 系统整体设计、通信架构、初始化指南
- **功能模块**: 各功能模块的详细实现说明
- **技术指南**: Vite、Tailwind CSS、Bun 等工具使用指南
- **项目规范**: 命名规范、代码风格、文件组织原则

### 注意

> 开发过程中需要关注的技术要点和潜在问题

- **数据一致性**: JSON 文件存储需要处理并发访问和文件锁定
- **错误处理**: Tauri 命令需要完善的错误传播和用户提示
- **跨平台兼容性**: 文件路径处理需要适配不同操作系统
- **性能考虑**: 大量提示词时的前端渲染和搜索性能
- **用户体验**: 文件监听和冲突处理的用户交互设计
- **安全权限**: 写入用户配置文件需要适当的权限检查
- **版本迁移**: 数据结构变更时的向后兼容性处理
- **测试覆盖**: 缺乏单元测试和集成测试，需要补充测试用例