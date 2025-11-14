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
| Vite | 7.2.2 | 构建工具和开发服务器，支持 HMR 热重载 |
| Tailwind CSS | 3.4.18 | 原子化 CSS 框架，实用优先设计 |
| Monaco Editor | 最新 | VS Code 编辑器核心，提供专业代码编辑 |
| 原生 JavaScript | ES6+ | 前端逻辑实现，无框架依赖 |
| PostCSS | 8.4.35 | CSS 处理器 |
| Autoprefixer | 10.4.16 | CSS 浏览器前缀自动添加 |
| DOMPurify | 3.3.0 | XSS 防护，安全渲染 HTML |
| Marked | 17.0.0 | Markdown 解析器 |

### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Rust | 2024 Edition | 后端核心语言 |
| Tauri | 2.9.0+ | 跨平台桌面应用框架 |
| serde | 1.0 | 序列化/反序列化，支持 derive 宏 |
| serde_json | 1.0 | JSON 数据处理 |
| notify | 6.0 | 文件系统监听，实时检测配置文件变化 |
| dirs | 5.0 | 跨平台系统路径获取 |
| chrono | 0.4 | 日期时间处理，支持 serde |
| uuid | 1.0 | UUID 生成（v4） |
| sha2 | 0.10 | 哈希算法，用于快照去重 |
| tauri-plugin-dialog | 2.0 | 文件选择对话框 |

### 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| Bun | 1.0+ | 包管理器和运行时，2-10x 性能提升 |
| @tauri-apps/cli | 2.9.4 | Tauri CLI 工具 |
| @vitejs/plugin-legacy | 7.2.1 | 浏览器兼容性支持 |
| @tailwindcss/typography | 0.5.19 | Tailwind 排版插件 |

---

## 项目结构

```
SystemPromptVault/
├── dist/                          # 前端源代码（非构建产物）
│   ├── index.html                 # 主界面（客户端切换、配置编辑、快照管理）
│   ├── settings.html              # 设置界面（提示词/客户端管理、导入导出）
│   ├── css/
│   │   ├── tailwind.css           # Tailwind CSS 源文件
│   │   ├── output.css             # Tailwind 编译产物
│   │   ├── main.css               # 自定义样式、主题变量
│   │   └── components.css         # 组件样式（Toast、按钮等）
│   ├── js/
│   │   ├── main.js                # 主页逻辑、Monaco 编辑器、快照触发
│   │   ├── settings.js            # 设置页逻辑、提示词/客户端管理
│   │   ├── api.js                 # Tauri 命令封装、错误处理
│   │   ├── utils.js               # 工具函数、Toast 系统
│   │   ├── i18n.js                # 国际化模块、语言检测、跨窗口同步
│   │   ├── i18n-antifouc.js       # i18n 防闪烁机制
│   │   ├── theme.js               # 主题管理模块
│   │   ├── tauri-bridge.js        # Tauri Bridge 封装
│   │   └── vendor/                # 第三方库（Monaco Editor）
│   └── locales/
│       ├── en.json                # 英文翻译资源
│       └── zh.json                # 中文翻译资源
│
├── build/                         # Vite 构建输出（生产构建）
│   ├── index.html
│   ├── settings.html
│   └── assets/                    # 打包后的 JS/CSS（哈希命名）
│
├── src-tauri/                     # Rust 后端
│   ├── src/
│   │   ├── main.rs                # Rust 主入口、托盘初始化
│   │   ├── lib.rs                 # Tauri 构建器、命令注册
│   │   ├── models/                # 数据模型
│   │   │   ├── prompt.rs          # Prompt 模型
│   │   │   ├── client.rs          # ClientConfig 模型
│   │   │   ├── app_state.rs       # AppState 模型
│   │   │   └── snapshot.rs        # Snapshot 模型
│   │   ├── storage/               # 数据访问层
│   │   │   ├── prompt_repository.rs    # Prompt 仓储
│   │   │   ├── client_repository.rs    # Client 仓储
│   │   │   ├── snapshot_repository.rs  # Snapshot 仓储
│   │   │   └── json_store.rs           # JSON 存储抽象层
│   │   ├── commands/              # Tauri 命令接口
│   │   │   ├── prompt.rs          # 提示词命令
│   │   │   ├── client.rs          # 客户端命令
│   │   │   ├── config_file.rs     # 配置文件读写
│   │   │   ├── app_state.rs       # 应用状态同步
│   │   │   ├── snapshot.rs        # 快照命令
│   │   │   └── file_watcher.rs    # 文件监听命令
│   │   ├── file_watcher.rs        # 文件监听器核心实现
│   │   ├── tray.rs                # System Tray 完整实现
│   │   └── utils/
│   ├── Cargo.toml                 # Rust 依赖配置
│   └── tauri.conf.json            # Tauri 应用配置、权限配置
│
├── llmdoc/                        # 项目开发文档（面向开发者）
│   ├── index.md                   # 文档索引
│   ├── architecture/              # 架构设计文档
│   ├── features/                  # 功能模块文档
│   ├── modules/                   # 核心模块文档
│   ├── guides/                    # 技术指南
│   └── conventions/               # 项目规范
│
├── vite.config.js                 # Vite 构建配置
├── tailwind.config.js             # Tailwind CSS 配置
├── package.json                   # 包管理、构建脚本
├── bun.lock                       # Bun 锁文件（替代 package-lock.json）
├── README.md                      # 项目说明文档
├── AGENTS.md                      # AI 代理开发指南（本文件）
└── .gitignore                     # Git 忽略配置
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

### 6. 系统托盘 (`src-tauri/src/tray.rs`)

**职责**: 提供快速访问、快照恢复和后台运行

**核心功能**:
- 显示/隐藏主窗口
- 快照恢复菜单（自动/手动快照列表）
- 文件监听控制开关
- 快速打开配置目录
- 系统通知
- 退出应用

**关键特性**:
- 动态菜单构建（快照列表实时更新）
- 事件处理和命令分发
- 跨平台图标支持

**文档参考**: `llmdoc/modules/system-tray-module.md`

---

### 7. 国际化系统 (`dist/js/i18n.js`)

**职责**: 多语言支持和语言切换

**关键文件**:
- `i18n.js`: 核心国际化模块
- `i18n-antifouc.js`: 防闪烁机制
- `dist/locales/en.json`: 英文翻译资源
- `dist/locales/zh.json`: 中文翻译资源

**核心功能**:
- 系统语言自动检测
- 动态语言切换
- DOM 元素自动更新 (`data-i18n` 属性)
- 跨窗口语言同步 (localStorage + storage 事件)
- 防闪烁机制 (CSS 属性选择器 + 伪元素)

**使用方式**:
```javascript
// HTML 元素自动翻译
<button data-i18n="save">Save</button>

// JavaScript 中获取翻译
import { t } from './i18n.js';
const text = t('welcome.message');

// 切换语言
import { setLanguage } from './i18n.js';
setLanguage('zh');  // 或 'en'
```

**文档参考**: `llmdoc/features/i18n-internationalization.md`

---

### 8. 主题系统 (`dist/js/theme.js`)

**职责**: 暗色/亮色主题管理

**核心功能**:
- 系统主题自动检测
- 手动主题切换
- 主题状态持久化 (localStorage)
- 主题变更事件监听
- CSS 变量动态更新

**支持模式**:
- `light`: 亮色主题
- `dark`: 暗色主题
- `system`: 跟随系统主题

**使用方式**:
```javascript
import { setTheme, getTheme } from './theme.js';

// 设置主题
setTheme('dark');

// 获取当前主题
const current = getTheme();  // 'light' | 'dark' | 'system'
```

**文档参考**: `llmdoc/features/theme-system-implementation.md`

---

### 9. Monaco 编辑器集成 (`dist/js/main.js`)

**职责**: 提供专业级代码编辑体验

**核心功能**:
- 语法高亮 (Markdown)
- 代码提示和补全
- 撤销/重做 (Ctrl+Z / Ctrl+Y)
- 查找/替换 (Ctrl+F)
- 行号和折叠
- 主题切换（随应用主题自动切换）

**编辑器状态管理**:
- `editorDirty`: 跟踪未保存修改
- `editorChangeBlocked`: 防止循环更新
- 滚动位置保持

**事件处理**:
```javascript
// 编辑器内容变化
monacoEditor.onDidChangeModelContent(() => {
    if (!state.editorChangeBlocked) {
        state.editorDirty = true;
        updateSaveButtonState();
    }
});
```

**文档参考**: `llmdoc/features/editor-mode-state-management.md`

---

### 10. Toast 通知系统 (`dist/js/utils.js`)

**职责**: 用户交互反馈

**核心功能**:
- 普通 Toast (`showToast`)
- 带按钮的 ActionToast (`showActionToast`)
- 自动消失机制
- 多种样式（success、error、info、warning）

**使用示例**:
```javascript
import { showToast, showActionToast } from './utils.js';

// 普通通知
showToast('保存成功', 'success');

// 带按钮的通知
showActionToast(
    '配置文件已被外部修改',
    [
        { text: '重新加载', onClick: () => loadConfig() },
        { text: '忽略', onClick: () => dismissToast() }
    ],
    0  // 不自动消失
);
```

---

## 开发工作流

### 环境准备

1. **安装开发工具**:
```bash
# 1. 安装 Rust（如未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. 安装 Bun（如未安装）
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# 或使用 Homebrew (macOS)
brew install bun

# Windows: 参考官方文档 https://bun.sh/docs/installation

# 3. 验证安装
rustc --version
bun --version
```

2. **项目初始化**:
```bash
# 克隆项目
git clone <repository-url>
cd SystemPromptVault

# 使用 Bun 安装依赖（2-10x 速度提升）
bun install
```

3. **配置检查**:
- 确保 Rust 工具链已安装
- 确保 Bun 1.0+ 已安装
- 确认 `src-tauri/tauri.conf.json` 配置正确

---

### 开发流程

#### 1. 启动开发环境

```bash
# 方式 1: 使用 Bun 脚本（推荐）
bun run tauri:dev

# 方式 2: 直接使用 Cargo（等效）
cd src-tauri && cargo tauri dev
```

**开发模式特性**:
- Vite HMR 热重载，代码变更自动刷新
- Tailwind CSS 实时编译（通过 `beforeDevCommand`）
- 支持 Source Maps 调试
- 自动打开开发者工具
- Rust 修改自动重新编译

**Tauri 配置集成** (`src-tauri/tauri.conf.json`):
```json
{
  "build": {
    "beforeDevCommand": "bun run dev",
    "beforeBuildCommand": "bun run build",
    "frontendDist": "../build",
    "devUrl": "http://localhost:1420"
  }
}
```

---

#### 2. 前端开发

**修改前端代码**:
1. 编辑 `dist/js/` 目录下的 JavaScript 文件
2. 修改 `dist/css/main.css` 或 `dist/css/components.css` 样式
3. 更新 `dist/index.html` 或 `dist/settings.html` 结构
4. 编辑 `dist/locales/*.json` 添加或修改翻译

**CSS 开发**:
```bash
# 实时监听模式（开发时推荐）
bun run watch:css

# 单次构建（生产模式）
bun run build:css
```

**Vite 开发服务器（独立前端调试）**:
```bash
# 启动 Vite 开发服务器（端口 1420）
bun run dev
```

**调试前端**:
- 打开 DevTools（`Cmd+Option+I` / `Ctrl+Shift+I`）
- 使用 `console.log()` 或 `console.error()` 调试
- 使用 Monaco Editor 的内置调试功能
- 检查网络请求和 Tauri 事件

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

#### 构建生产版

```bash
# 标准构建（推荐）
bun run tauri:build

# macOS Universal 构建（支持 Intel + Apple Silicon）
bun run tauri:build:universal
```

**构建流程**:
1. Vite 构建前端（`bun run build`）
   - 代码压缩和优化
   - Tree-shaking 去除未使用代码
   - 资源哈希命名
   - 输出到 `build/` 目录
2. Cargo 编译 Rust 后端
   - Release 模式编译优化
   - 静态链接依赖
3. Tauri 打包桌面应用
   - 生成平台特定的安装包
   - 代码签名（如配置）

**产物位置**:
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Windows**: `src-tauri/target/release/bundle/nsis/`
- **Linux**: `src-tauri/target/release/bundle/deb/`

**性能优化**:
- Rust 编译优化级别在 `src-tauri/Cargo.toml` 中配置
- Vite 自动应用生产优化（minify、代码分割）
- Bun 构建速度比 npm 快 2-10x

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

- **项目维护者**: Saul <p@sora.im>
- **问题反馈**: https://github.com/ppyyr/SystemPromptVault/issues
- **文档更新**: 请更新 `llmdoc/` 目录下的相关文档

---

## 附录：快速参考

### 常用命令

| 命令 | 说明 |
|------|------|
| `bun install` | 安装项目依赖 |
| `bun run tauri:dev` | 启动开发环境（Vite + Tauri） |
| `bun run dev` | 启动 Vite 开发服务器（纯前端） |
| `bun run build` | 构建前端（生产模式） |
| `bun run build:css` | 构建 Tailwind CSS（生产模式） |
| `bun run watch:css` | 监听 CSS 变化（开发模式） |
| `bun run tauri:build` | 构建 Tauri 应用 |
| `bun run tauri:build:universal` | 构建 macOS Universal 应用 |
| `bun add <package>` | 添加依赖 |
| `bun add -d <package>` | 添加开发依赖 |
| `bun remove <package>` | 移除依赖 |
| `bun update` | 更新所有依赖 |
| `cargo fmt` | 格式化 Rust 代码 |
| `cargo clippy` | 检查 Rust 代码质量 |
| `RUST_LOG=debug bun run tauri:dev` | 启用 Rust 日志调试 |

### 关键文件速查

| 文件 | 说明 |
|------|------|
| `dist/index.html` | 主界面结构 |
| `dist/settings.html` | 设置页面结构 |
| `dist/js/main.js` | 主页逻辑（编辑器、快照） |
| `dist/js/settings.js` | 设置页逻辑（提示词、客户端） |
| `dist/js/api.js` | Tauri 命令封装 |
| `dist/js/i18n.js` | 国际化模块 |
| `dist/js/theme.js` | 主题管理模块 |
| `src-tauri/src/main.rs` | Rust 主入口、托盘初始化 |
| `src-tauri/src/lib.rs` | Tauri 构建器、命令注册 |
| `src-tauri/src/tray.rs` | System Tray 实现 |
| `src-tauri/src/file_watcher.rs` | 文件监听器 |
| `src-tauri/tauri.conf.json` | Tauri 配置、权限 |
| `package.json` | 项目配置、构建脚本 |
| `src-tauri/Cargo.toml` | Rust 依赖配置 |
| `vite.config.js` | Vite 构建配置 |
| `tailwind.config.js` | Tailwind CSS 配置 |
| `bun.lock` | Bun 锁文件 |

### Tauri Commands 速查

#### 配置文件操作
| 命令 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `config_file_read` | 读取配置文件 | `path: String` | `Result<String, String>` |
| `config_file_write` | 写入配置文件 | `path: String, content: String` | `Result<(), String>` |

#### 提示词管理
| 命令 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `get_prompts` | 获取所有提示词 | - | `Result<Vec<Prompt>, String>` |
| `create_prompt` | 创建提示词 | `prompt: Prompt` | `Result<Prompt, String>` |
| `update_prompt` | 更新提示词 | `prompt: Prompt` | `Result<Prompt, String>` |
| `delete_prompt` | 删除提示词 | `id: String` | `Result<(), String>` |

#### 客户端管理
| 命令 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `get_clients` | 获取所有客户端 | - | `Result<Vec<ClientConfig>, String>` |
| `create_client` | 创建客户端 | `client: ClientConfig` | `Result<ClientConfig, String>` |
| `update_client` | 更新客户端 | `client: ClientConfig` | `Result<ClientConfig, String>` |
| `delete_client` | 删除客户端 | `id: String` | `Result<(), String>` |

#### 快照管理
| 命令 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `create_snapshot` | 创建快照 | `snapshot_type: String, client_id: String, config_path: String, content: String` | `Result<Snapshot, String>` |
| `get_snapshots` | 获取快照列表 | `client_id: Option<String>` | `Result<Vec<Snapshot>, String>` |
| `restore_snapshot` | 恢复快照 | `snapshot_id: String` | `Result<String, String>` |
| `delete_snapshot` | 删除快照 | `snapshot_id: String` | `Result<(), String>` |

#### 文件监听
| 命令 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `start_file_watcher` | 启动文件监听 | `paths: Vec<String>, client_id: String` | `Result<(), String>` |
| `stop_file_watcher` | 停止文件监听 | - | `Result<(), String>` |

#### 应用状态
| 命令 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `get_app_state` | 获取应用状态 | - | `Result<AppState, String>` |
| `update_app_state` | 更新应用状态 | `state: AppState` | `Result<(), String>` |

---

**文档版本**: 2.0.0
**最后更新**: 2025-11-14
**项目版本**: 0.1.0
**维护者**: SystemPromptVault 开发团队 & AI Agents

**更新记录**:
- 2.0.0 (2025-11-14): 全面更新项目结构、技术栈版本、新增功能模块（i18n、主题、Monaco、文件监听、快照管理）、更新开发工作流
- 1.0.0 (2025-01-11): 初始版本
