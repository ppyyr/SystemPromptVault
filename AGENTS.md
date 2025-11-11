# AGENTS.md - SystemPromptVault AI 代理开发指南

## 项目概述

**项目名称**: SystemPromptVault (系统提示词保险库)
**项目类型**: 基于 Tauri v2 的跨平台桌面应用
**核心功能**: AI 工具配置文件管理和提示词库管理
**当前版本**: 0.1.0
**技术架构**: 前端 HTML/CSS/JS + 后端 Rust

### 项目定位

SystemPromptVault 是一个专为 AI 开发者和用户设计的桌面应用，用于管理和组织各类 AI 工具的配置文件（如 Claude Code、Cursor、Windsurf 等）中的系统提示词。它提供了提示词的版本控制、分类管理、快速预览和一键应用等功能。

---

## 技术栈清单

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vite | 6.0.11 | 构建工具和开发服务器 |
| Tailwind CSS | 3.4.17 | 原子化 CSS 框架 |
| Monaco Editor | 0.52.2 | 代码编辑器（预览提示词） |
| 原生 JavaScript | ES2020 | 前端逻辑实现 |
| PostCSS | 8.4.49 | CSS 处理器 |
| Autoprefixer | 10.4.20 | CSS 浏览器前缀自动添加 |

### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Rust | 2024 Edition | 后端核心语言 |
| Tauri | 2.1.1 | 桌面应用框架 |
| serde | 1.0 | 序列化/反序列化 |
| serde_json | 1.0 | JSON 处理 |
| notify | 7.0.0 | 文件系统监听 |
| tauri-plugin-dialog | 2.0 | 文件选择对话框 |
| tauri-plugin-opener | 2.0 | 打开外部应用 |

### 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| Bun | 最新 | 包管理器和运行时 |
| TypeScript | 5.7.2 | 类型检查（配置文件） |
| @tauri-apps/cli | 2.1.0 | Tauri CLI 工具 |

---

## 项目结构

```
SystemPromptVault/
├── src/                          # 前端源码
│   ├── main.js                   # 主入口文件
│   ├── clients/                  # 客户端管理模块
│   │   ├── clientsManager.js     # 客户端数据管理
│   │   └── clientsView.js        # 客户端 UI 渲染
│   ├── prompts/                  # 提示词管理模块
│   │   ├── promptsManager.js     # 提示词数据管理
│   │   └── promptsView.js        # 提示词 UI 渲染
│   ├── snapshots/                # 快照管理模块
│   │   ├── snapshotsManager.js   # 快照数据管理
│   │   └── snapshotsView.js      # 快照 UI 渲染
│   ├── utils/                    # 工具函数
│   │   ├── fileOps.js            # 文件操作封装
│   │   └── uiHelpers.js          # UI 辅助函数
│   └── styles/                   # 样式文件
│       └── main.css              # 主样式（Tailwind）
│
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # Rust 主入口
│   │   ├── commands/             # Tauri Commands
│   │   │   ├── client.rs         # 客户端操作命令
│   │   │   ├── file.rs           # 文件操作命令
│   │   │   └── snapshot.rs       # 快照操作命令
│   │   ├── models/               # 数据模型
│   │   │   ├── config.rs         # 配置数据结构
│   │   │   └── prompt.rs         # 提示词数据结构
│   │   └── utils/                # 工具模块
│   │       ├── file_watcher.rs   # 文件监听
│   │       └── backup.rs         # 备份逻辑
│   ├── Cargo.toml                # Rust 依赖配置
│   └── tauri.conf.json           # Tauri 配置文件
│
├── public/                       # 静态资源
├── dist/                         # 构建产物（生成）
├── llmdoc/                       # 项目文档（AI 代理专用）
│   ├── index.md                  # 文档索引
│   ├── architecture/             # 架构设计文档
│   ├── modules/                  # 模块说明文档
│   └── agent/                    # 代理调查报告
│
├── package.json                  # 项目配置
├── bun.lockb                     # Bun 锁文件
├── tailwind.config.js            # Tailwind 配置
├── tsconfig.json                 # TypeScript 配置
└── .gitignore                    # Git 忽略配置
```

---

## 核心功能模块

### 1. 提示词管理 (`src/prompts/`)

**职责**: 提示词的增删改查、标签过滤、搜索和导入导出

**关键文件**:
- `promptsManager.js`: 提示词数据管理逻辑
- `promptsView.js`: 提示词 UI 渲染和交互

**核心功能**:
- 添加/编辑/删除提示词
- 标签系统（多标签支持）
- 关键词搜索
- 导入/导出 JSON
- 预览编辑（Monaco Editor）

**数据结构**:
```javascript
{
  id: "uuid",
  title: "提示词标题",
  content: "提示词内容",
  tags: ["tag1", "tag2"],
  clientId: "关联的客户端ID",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z"
}
```

**Rust 对应模块**: `src-tauri/src/models/prompt.rs`

---

### 2. 客户端管理 (`src/clients/`)

**职责**: 管理内置和自定义 AI 客户端配置

**关键文件**:
- `clientsManager.js`: 客户端数据管理
- `clientsView.js`: 客户端 UI 渲染

**核心功能**:
- 内置客户端（Claude Code、Cursor、Windsurf 等）
- 自定义客户端添加
- 配置文件路径管理
- 打开配置文件目录

**数据结构**:
```javascript
{
  id: "uuid",
  name: "客户端名称",
  configPath: "/path/to/config",
  isBuiltin: true/false,
  icon: "icon-class"
}
```

**Rust 对应模块**: `src-tauri/src/commands/client.rs`

---

### 3. 配置文件操作 (`src-tauri/src/commands/file.rs`)

**职责**: 读写用户配置文件（CLAUDE.md、.cursorrules 等）

**核心 Tauri Commands**:
- `read_config_file(path: String) -> Result<String, String>`
- `write_config_file(path: String, content: String) -> Result<(), String>`
- `backup_config_file(path: String) -> Result<String, String>`

**关键特性**:
- 自动创建备份
- 错误处理和提示
- 文件系统监听（外部修改检测）

---

### 4. 快照备份 (`src/snapshots/`)

**职责**: 自动备份和版本管理

**关键文件**:
- `snapshotsManager.js`: 快照数据管理
- `snapshotsView.js`: 快照 UI 渲染
- `src-tauri/src/commands/snapshot.rs`: 快照操作命令

**核心功能**:
- 自动创建快照
- 快照列表查看
- 恢复到指定快照
- 快照删除

**数据结构**:
```javascript
{
  id: "uuid",
  timestamp: "2025-01-01T00:00:00Z",
  description: "快照描述",
  data: {
    prompts: [...],
    clients: [...]
  }
}
```

---

### 5. 文件监听 (`src-tauri/src/utils/file_watcher.rs`)

**职责**: 实时检测外部对配置文件的修改

**关键特性**:
- 基于 `notify` 库实现
- 自动刷新 UI
- 冲突检测和提示

---

### 6. 系统托盘 (`src-tauri/src/main.rs`)

**职责**: 提供快速访问和后台运行

**核心功能**:
- 显示/隐藏主窗口
- 快速打开配置目录
- 退出应用

---

## 开发工作流

### 环境准备

1. **安装依赖**:
```bash
# 安装 Bun（如果未安装）
curl -fsSL https://bun.sh/install | bash

# 安装项目依赖
bun install

# 安装 Rust 和 Tauri 依赖（如果未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. **配置检查**:
- 确保 Rust 工具链已安装
- 确保 Tauri CLI 已安装
- 确认 `src-tauri/tauri.conf.json` 配置正确

---

### 开发流程

#### 1. 启动开发环境

```bash
# 启动开发服务器（热重载）
bun run tauri:dev
```

**说明**:
- Vite 会启动前端开发服务器
- Tauri 会启动 Rust 后端和桌面窗口
- 前端修改会自动刷新
- Rust 修改需要重新编译（自动）

---

#### 2. 前端开发

**修改前端代码**:
1. 编辑 `src/` 目录下的 JavaScript 文件
2. 修改 `src/styles/main.css` 样式
3. 更新 `index.html` 结构

**样式开发**:
```bash
# 重新构建 Tailwind CSS
bun run build:css
```

**调试前端**:
- 打开 DevTools（`Cmd+Option+I` / `Ctrl+Shift+I`）
- 使用 `console.log()` 调试
- 使用 Monaco Editor 的内置调试功能

---

#### 3. 后端开发

**修改 Rust 代码**:
1. 编辑 `src-tauri/src/` 目录下的 Rust 文件
2. 添加新的 Tauri Commands
3. 更新数据模型或工具函数

**添加新 Tauri Command 示例**:
```rust
// src-tauri/src/commands/example.rs
use tauri::command;

#[command]
pub fn example_command(param: String) -> Result<String, String> {
    // 实现逻辑
    Ok(format!("Hello, {}", param))
}

// src-tauri/src/main.rs
mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::example::example_command,
            // ... 其他命令
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**前端调用**:
```javascript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('example_command', { param: 'World' });
console.log(result); // "Hello, World"
```

---

#### 4. 数据流设计

**前端 → 后端**:
```javascript
// 1. 前端调用 Tauri Command
import { invoke } from '@tauri-apps/api/core';

const data = await invoke('command_name', { arg1: value1, arg2: value2 });
```

**后端 → 前端（事件）**:
```rust
// Rust 后端发送事件
use tauri::Manager;

#[command]
pub fn trigger_event(window: tauri::Window) -> Result<(), String> {
    window.emit("event-name", "event-data")
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

```javascript
// 前端监听事件
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('event-name', (event) => {
    console.log('Received:', event.payload);
});
```

---

### 构建和发布

#### 构建开发版

```bash
# 构建桌面应用（未优化）
bun run tauri:build
```

**产物位置**:
- macOS: `src-tauri/target/release/bundle/macos/`
- Windows: `src-tauri/target/release/bundle/msi/`
- Linux: `src-tauri/target/release/bundle/deb/` 或 `appimage/`

---

#### 构建生产版

```bash
# 1. 构建优化的前端代码
bun run build

# 2. 构建 Tauri 应用
bun run tauri:build --release
```

**优化选项**:
- Rust: 编译优化级别在 `Cargo.toml` 中配置
- 前端: Vite 自动优化（minify、tree-shaking）

---

## 测试指引

### 当前测试状态

⚠️ **注意**: 项目当前 **没有自动化测试**，需要手动测试。

---

### 手动测试清单

#### 1. 提示词管理测试

- [ ] 添加新提示词
- [ ] 编辑现有提示词
- [ ] 删除提示词
- [ ] 搜索提示词
- [ ] 标签过滤
- [ ] 导入 JSON 文件
- [ ] 导出 JSON 文件
- [ ] Monaco Editor 预览

#### 2. 客户端管理测试

- [ ] 添加自定义客户端
- [ ] 编辑客户端信息
- [ ] 删除客户端
- [ ] 打开配置文件目录
- [ ] 应用提示词到客户端

#### 3. 快照备份测试

- [ ] 自动创建快照
- [ ] 查看快照列表
- [ ] 恢复到指定快照
- [ ] 删除快照
- [ ] 快照数据完整性

#### 4. 文件操作测试

- [ ] 读取配置文件
- [ ] 写入配置文件
- [ ] 备份配置文件
- [ ] 外部修改检测
- [ ] 冲突处理

#### 5. 系统托盘测试

- [ ] 显示/隐藏窗口
- [ ] 快速访问功能
- [ ] 退出应用

---

### 未来测试计划

#### 推荐添加的测试框架

**前端测试**:
- **Vitest**: 与 Vite 集成的测试框架
- **Testing Library**: 组件测试

**后端测试**:
- **Rust 内置测试**: `#[cfg(test)]` 模块
- **Integration Tests**: `tests/` 目录

#### 示例测试结构

```
tests/
├── frontend/
│   ├── prompts.test.js      # 提示词管理测试
│   └── clients.test.js      # 客户端管理测试
└── backend/
    ├── commands.rs          # Tauri Commands 测试
    └── models.rs            # 数据模型测试
```

---

## 开发规范

### 代码风格

**JavaScript**:
- 使用 ES6+ 语法
- 优先使用 `const` 和 `let`
- 使用模块化导入/导出
- 异步操作使用 `async/await`
- 错误处理使用 `try/catch`

**Rust**:
- 遵循 Rust 官方风格指南
- 使用 `cargo fmt` 格式化代码
- 使用 `cargo clippy` 检查代码
- 错误处理使用 `Result<T, E>`

---

### Git 工作流

**分支策略**:
- `main`: 主分支（稳定版本）
- `feature/*`: 功能开发分支
- `bugfix/*`: 错误修复分支

**提交规范**:
```
<type>(<scope>): <subject>

<body>
```

**类型（type）**:
- `feat`: 新功能
- `fix`: 错误修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例**:
```
feat(prompts): add bulk import functionality

- Add support for importing multiple prompts from JSON
- Add progress indicator for large imports
- Add error handling for invalid JSON
```

---

### 错误处理

**前端错误处理**:
```javascript
try {
    const result = await invoke('command_name', { args });
    // 处理成功结果
} catch (error) {
    console.error('Error:', error);
    // 显示用户友好的错误提示
    showNotification('操作失败：' + error, 'error');
}
```

**后端错误处理**:
```rust
#[command]
pub fn example_command() -> Result<String, String> {
    let result = some_operation()
        .map_err(|e| format!("操作失败: {}", e))?;
    Ok(result)
}
```

---

## 常见开发任务

### 添加新的提示词字段

1. **更新数据模型**:
```rust
// src-tauri/src/models/prompt.rs
#[derive(Serialize, Deserialize)]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub new_field: String,  // 新增字段
}
```

2. **更新前端数据结构**:
```javascript
// src/prompts/promptsManager.js
const newPrompt = {
    id: generateId(),
    title: '',
    content: '',
    tags: [],
    newField: '',  // 新增字段
};
```

3. **更新 UI 渲染**:
```javascript
// src/prompts/promptsView.js
const renderPromptForm = (prompt) => {
    return `
        <input type="text" name="title" value="${prompt.title}">
        <textarea name="content">${prompt.content}</textarea>
        <input type="text" name="newField" value="${prompt.newField}">
    `;
};
```

---

### 添加新的 Tauri Command

1. **创建命令文件**:
```rust
// src-tauri/src/commands/new_feature.rs
use tauri::command;

#[command]
pub fn new_command(param: String) -> Result<String, String> {
    // 实现逻辑
    Ok(param)
}
```

2. **注册命令**:
```rust
// src-tauri/src/main.rs
mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::new_feature::new_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

3. **前端调用**:
```javascript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('new_command', { param: 'value' });
```

---

### 添加新的客户端支持

1. **更新内置客户端列表**:
```javascript
// src/clients/clientsManager.js
const BUILTIN_CLIENTS = [
    {
        id: 'new-client',
        name: 'New Client',
        configPath: '~/.new-client/config.json',
        isBuiltin: true,
        icon: 'icon-new-client'
    },
    // ... 其他客户端
];
```

2. **测试配置文件路径**:
- 确认配置文件实际位置
- 测试读写权限
- 处理路径展开（`~` → 用户目录）

---

## 性能优化建议

### 前端优化

1. **虚拟滚动**: 大量提示词列表时使用虚拟滚动
2. **延迟加载**: Monaco Editor 延迟初始化
3. **防抖/节流**: 搜索输入框使用防抖
4. **缓存**: 缓存常用数据（客户端列表等）

### 后端优化

1. **异步 I/O**: 文件操作使用异步 API
2. **批量操作**: 减少频繁的文件读写
3. **索引优化**: 大量数据时建立索引
4. **内存管理**: 及时释放不再使用的资源

---

## 故障排查

### 常见问题

#### 1. Tauri 开发环境启动失败

**原因**: Rust 工具链未安装或版本不兼容

**解决**:
```bash
# 更新 Rust
rustup update

# 重新安装依赖
bun install
```

---

#### 2. 前端无法调用 Tauri Command

**原因**: 命令未注册或参数不匹配

**解决**:
- 检查 `src-tauri/src/main.rs` 中的 `invoke_handler`
- 确认命令名称拼写正确
- 检查参数类型和名称是否匹配

---

#### 3. 配置文件读写失败

**原因**: 权限不足或路径不存在

**解决**:
- 检查文件路径是否正确
- 确认应用有文件系统访问权限
- 在 `tauri.conf.json` 中配置 `fs` 权限

---

#### 4. 文件监听不工作

**原因**: `notify` 库配置问题或权限不足

**解决**:
- 检查 Rust 日志输出
- 确认监听路径有效
- 测试手动触发刷新功能

---

## 依赖更新

### 前端依赖更新

```bash
# 检查可更新的依赖
bun outdated

# 更新所有依赖到最新版本
bun update

# 更新特定依赖
bun update <package-name>
```

### 后端依赖更新

```bash
# 进入 Rust 项目目录
cd src-tauri

# 检查可更新的依赖
cargo outdated

# 更新所有依赖
cargo update

# 更新特定依赖
cargo update -p <crate-name>
```

---

## 文档资源

### 官方文档

- **Tauri**: https://v2.tauri.app/
- **Vite**: https://vitejs.dev/
- **Tailwind CSS**: https://tailwindcss.com/
- **Monaco Editor**: https://microsoft.github.io/monaco-editor/
- **Rust**: https://www.rust-lang.org/

### 项目文档

- `llmdoc/index.md`: 文档索引
- `llmdoc/architecture/`: 架构设计文档
- `llmdoc/modules/`: 模块说明文档
- `llmdoc/agent/`: AI 代理调查报告

---

## 贡献指南

### 如何贡献

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码审查清单

- [ ] 代码遵循项目风格指南
- [ ] 添加了必要的测试（如果有测试框架）
- [ ] 更新了相关文档
- [ ] 提交信息清晰明确
- [ ] 没有引入新的警告或错误
- [ ] 功能经过手动测试

---

## 联系方式

- **项目维护者**: [维护者名称]
- **问题反馈**: [GitHub Issues 链接]
- **文档更新**: 请更新 `llmdoc/` 目录下的相关文档

---

## 附录：快速参考

### 常用命令

| 命令 | 说明 |
|------|------|
| `bun install` | 安装依赖 |
| `bun run tauri:dev` | 启动开发环境 |
| `bun run tauri:build` | 构建应用 |
| `bun run build:css` | 构建 CSS |
| `cargo fmt` | 格式化 Rust 代码 |
| `cargo clippy` | 检查 Rust 代码 |

### 关键文件速查

| 文件 | 说明 |
|------|------|
| `src/main.js` | 前端主入口 |
| `src-tauri/src/main.rs` | Rust 主入口 |
| `src-tauri/tauri.conf.json` | Tauri 配置 |
| `package.json` | 项目配置 |
| `Cargo.toml` | Rust 依赖配置 |
| `tailwind.config.js` | Tailwind 配置 |

### Tauri Commands 速查

| 命令 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `read_config_file` | 读取配置文件 | `path: String` | `Result<String, String>` |
| `write_config_file` | 写入配置文件 | `path: String, content: String` | `Result<(), String>` |
| `backup_config_file` | 备份配置文件 | `path: String` | `Result<String, String>` |
| `list_snapshots` | 列出所有快照 | - | `Result<Vec<Snapshot>, String>` |
| `create_snapshot` | 创建快照 | `description: String` | `Result<Snapshot, String>` |
| `restore_snapshot` | 恢复快照 | `id: String` | `Result<(), String>` |

---

**文档版本**: 1.0.0
**最后更新**: 2025-01-11
**维护者**: AI Agent (Claude Code)
