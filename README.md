# System Prompt Vault

基于 Tauri v2 的单文件 Prompt 管理与客户端切换工具，专注于在 `.claude/CLAUDE.md`、`.codex/AGENTS.md`、`.gemini/GEMINI.md` 等配置文件之间实现快速、可视化的配置管理。

## 功能特性

### 核心功能

- ✅ **客户端切换**：在 Claude、Codex、Gemini 等客户端之间秒级切换
- ✅ **全局配置编辑**：直接编辑 `~/.claude/CLAUDE.md` 等用户级配置文件
- ✅ **Monaco 编辑器**：集成 Monaco Editor，提供代码高亮、语法提示、撤销重做
- ✅ **提示词库管理**：创建、编辑、删除单文件提示词并即时预览
- ✅ **智能标签系统**：支持多标签、自动客户端标签、自由标签输入、下拉菜单选择器
- ✅ **标签过滤**：通过标签快速筛选出合适的提示词，最近使用标签自动记忆
- ✅ **一键应用**：将提示词内容智能追加到当前客户端配置
- ✅ **可扩展客户端**：允许用户自定义新的客户端与存储路径
- ✅ **导入导出**：批量导入导出提示词，支持数据备份与迁移

### 高级特性

- ✅ **快照版本管理**：自动/手动快照配置文件，支持历史版本快速恢复，分类 FIFO 清理
- ✅ **配置文件监听**：实时检测配置文件变化，支持多客户端路径监听，自动提示重新加载
- ✅ **系统托盘集成**：快速访问快照恢复、文件监听控制，支持自定义通知
- ✅ **国际化支持**：中英双语界面，自动检测系统语言，跨窗口语言同步，防闪烁机制
- ✅ **主题系统**：暗色/亮色主题自动切换，跟随系统主题，状态持久化
- ✅ **跨平台**：支持 macOS、Windows、Linux 三大平台
- ✅ **无障碍支持**：ARIA 属性、键盘导航、屏幕阅读器友好

## 技术架构

### 前端技术栈

- **核心框架**：原生 JavaScript (ES6+)，无第三方前端框架依赖
- **构建系统**：Vite 7 + Tailwind CSS 3，支持 HMR 热重载和代码分割
- **包管理器**：Bun (替代 npm)，2-10x 更快的依赖安装速度
- **UI 组件**：模块化设计，主页 (`main.js`) 负责配置编辑，设置页 (`settings.js`) 负责管理
- **编辑器**：Monaco Editor 集成，提供专业级代码编辑体验
- **国际化**：自研 i18n 模块 (`i18n.js`)，支持语言检测、DOM 自动更新、防闪烁机制
- **主题系统**：独立主题模块 (`theme.js`)，支持暗色/亮色主题和系统主题跟随
- **样式方案**：Tailwind CSS + 自定义 CSS，响应式设计，无障碍支持

### 后端技术栈

- **核心框架**：Rust + Tauri v2，提供原生桌面应用能力
- **命令系统**：模块化命令接口（prompt、client、config_file、snapshot、file_watcher）
- **数据存储**：JSON 文件存储 + Repository 模式，支持原子写入和数据持久化
- **系统服务**：
  - System Tray：托盘菜单、快照恢复、通知系统
  - File Watcher：配置文件变化检测，支持多客户端路径监听
  - Snapshot Manager：快照版本管理、FIFO 清理策略
- **配置读写**：安全的文件系统 API，直接读写全局配置文件（如 `~/.claude/CLAUDE.md`）

### 核心架构特点

- **模块化设计**：前端按功能模块划分 (`api.js`、`utils.js`、`i18n.js`、`theme.js`)，后端按命令和存储分层
- **事件驱动**：Tauri 事件系统实现前后端通信，支持跨窗口事件同步
- **状态管理**：集中式状态管理，应用状态持久化到 JSON 文件
- **安全性**：Tauri capabilities 系统控制文件访问权限，输入验证和错误处理

## 核心概念

- **客户端 (Client)**：指 AI 工具的配置文件描述（ID、名称、路径），例如 Claude/Codex/Gemini
- **提示词 (Prompt)**：单个独立的 Prompt 文件，包含名称、正文和可配置标签
- **标签 (Tag)**：用于组织与过滤提示词的分类标记，可自动识别客户端标签并支持自定义
- **全局配置文件**：真实生效的用户级配置文件（如 `~/.claude/CLAUDE.md`），应用会直接写入这些文件

## 快速开始

### 前置要求

- **Rust 1.70+**：用于编译 Tauri 应用
- **Bun 1.0+**：现代包管理器和 JavaScript 运行时（替代 npm）
- **操作系统**：macOS / Windows / Linux

### 环境安装

```bash
# 1. 安装 Rust (如未安装)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. 安装 Bun (如未安装)
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# 或使用 Homebrew (macOS)
brew install bun

# Windows (PowerShell)
# 参考官方文档: https://bun.sh/docs/installation

# 3. 验证安装
rustc --version
bun --version
```

### 项目初始化

```bash
# 克隆项目
git clone https://github.com/your-username/SystemPromptVault.git
cd SystemPromptVault

# 使用 Bun 安装依赖（2-10x 速度提升）
bun install
```

### 开发模式

```bash
# 方式 1: 使用 Bun 脚本 (推荐)
bun run tauri:dev

# 方式 2: 直接使用 Cargo (等效)
cd src-tauri && cargo tauri dev
```

**开发模式特性**：
- Vite HMR 热重载，代码变更自动刷新
- Tailwind CSS 实时编译
- 支持 Source Maps 调试
- 自动打开开发者工具

### 构建生产版本

```bash
# 标准构建
bun run tauri:build

# macOS Universal 构建（支持 Intel + Apple Silicon）
bun run tauri:build:universal
```

**构建产物位置**：
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Windows**: `src-tauri/target/release/bundle/nsis/`
- **Linux**: `src-tauri/target/release/bundle/deb/`

### 常用开发命令

```bash
# 前端开发（Vite 开发服务器）
bun run dev                  # 启动 Vite 开发服务器（端口 1420）

# CSS 构建
bun run build:css            # 编译 Tailwind CSS（生产模式）
bun run watch:css            # 监听 CSS 变化（开发模式）

# Tauri 开发
bun run tauri:dev            # 启动 Tauri 开发模式
bun run tauri:build          # 构建 Tauri 应用

# 依赖管理
bun add <package>            # 添加依赖
bun add -d <package>         # 添加开发依赖
bun remove <package>         # 移除依赖
bun update                   # 更新所有依赖
```

## 使用指南

### 1. 客户端管理

1. 打开应用右上角的“设置”页面
2. 切换到“客户端管理”标签页
3. 点击“+ 添加客户端”
4. 填写客户端 ID、展示名称、配置文件路径
5. 保存后即可在主页客户端下拉框中切换

### 2. 提示词管理

1. 在“设置”页面切换到“提示词管理”
2. 点击“+ 新建提示词”
3. 输入名称、正文内容与标签（可多选或自由输入）
4. 保存立即写入 `prompts.json`，列表会实时刷新

### 3. 使用提示词

1. 在主页左侧编辑器中查看当前客户端配置文件内容
2. 在右侧提示词库中浏览已保存的提示词
3. 使用标签按钮过滤出需要的提示词
4. 点击提示词卡片上的“应用”按钮
5. 提示词正文会自动追加到左侧编辑器
6. 点击“保存”将内容同步至客户端配置文件

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
├── build/                         # Vite 构建输出（生产构建）
│   ├── index.html
│   ├── settings.html
│   └── assets/                    # 打包后的 JS/CSS（哈希命名）
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                # 应用入口、托盘初始化
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
├── llmdoc/                        # 项目开发文档（面向开发者）
│   ├── index.md                   # 文档索引
│   ├── architecture/              # 架构设计文档
│   ├── features/                  # 功能模块文档
│   ├── modules/                   # 核心模块文档
│   ├── guides/                    # 技术指南
│   └── conventions/               # 项目规范
├── vite.config.js                 # Vite 构建配置
├── tailwind.config.js             # Tailwind CSS 配置
├── package.json                   # 包管理、构建脚本
├── bun.lock                       # Bun 锁文件（替代 package-lock.json）
└── README.md                      # 项目说明文档
```

## 数据存储

### 配置文件位置

- **macOS**：`~/Library/Application Support/com.example.systemprompt-vault/`
- **Windows**：`C:\Users\<User>\AppData\Roaming\com.example.systemprompt-vault\`
- **Linux**：`~/.config/systemprompt-vault/`

### 存储结构

```
<app_data_dir>/
├── prompts.json              # 提示词库数据
├── clients.json              # 客户端配置
├── app_state.json            # 应用状态（当前客户端、语言设置等）
├── snapshots/                # 快照版本管理
│   ├── auto/                 # 自动快照（FIFO 清理，最多 10 个）
│   └── manual/               # 手动快照（FIFO 清理，最多 20 个）
└── logs/                     # 应用日志（可选）
```

### 快照管理

**自动快照**：应用启动时自动创建当前配置的快照，用于快速恢复
**手动快照**：用户手动保存的配置版本，支持自定义标签
**FIFO 清理**：自动清理最旧的快照，保持存储空间在合理范围内
**托盘恢复**：通过系统托盘菜单快速恢复历史快照

## 开发指南

详细的开发文档位于 `llmdoc/` 目录，包含架构设计、功能实现、技术指南等完整文档。以下是快速开发参考：

### 添加新功能模块

1. **前端模块**：在 `dist/js/` 创建新模块，通过 `api.js` 调用后端命令
2. **后端命令**：在 `src-tauri/src/commands/` 添加新命令，在 `lib.rs` 中注册
3. **数据模型**：在 `src-tauri/src/models/` 定义数据结构
4. **存储层**：在 `src-tauri/src/storage/` 实现数据持久化逻辑

### 添加新客户端类型

1. 在设置页面的"客户端管理"标签页点击"+ 添加客户端"
2. 或在 `src-tauri/src/models/client.rs` 中扩展 `ClientConfig` 数据模型
3. 前端 `dist/js/settings.js` 中同步表单字段和验证逻辑

### 国际化（i18n）支持

1. 在 `dist/locales/` 添加或修改语言文件（`en.json`、`zh.json`）
2. HTML 元素添加 `data-i18n="key"` 属性实现自动翻译
3. JavaScript 中使用 `i18n.t('key')` 获取翻译文本
4. 参考文档：`llmdoc/features/i18n-internationalization.md`

### 主题系统定制

1. 在 `dist/css/main.css` 中定义 CSS 变量
2. 使用 `data-theme="light|dark"` 自动应用主题
3. JavaScript 中调用 `theme.setTheme(mode)` 切换主题
4. 参考文档：`llmdoc/features/theme-system-implementation.md`

### 文件监听和快照管理

1. 配置文件监听：`src-tauri/src/file_watcher.rs`
2. 快照仓储：`src-tauri/src/storage/snapshot_repository.rs`
3. 托盘菜单：`src-tauri/src/tray.rs`
4. 参考文档：`llmdoc/features/snapshot-version-management.md`

### 构建和调试

```bash
# 前端调试（浏览器开发者工具）
bun run dev

# Rust 日志调试
RUST_LOG=debug bun run tauri:dev

# 清理构建缓存
cargo clean --manifest-path src-tauri/Cargo.toml
rm -rf build/ dist/css/output.css
bun install
```

### 推荐开发工具

- **VS Code** + Rust Analyzer + Tauri 插件
- **Rust 工具链**：rustfmt、clippy
- **前端工具**：ESLint、Prettier（可选）
- **调试工具**：Chrome DevTools、Tauri DevTools

## 核心依赖

### 后端依赖（Rust）

```toml
# Tauri 核心框架
tauri = "2.0"
tauri-plugin-dialog = "2.0"

# 序列化和 JSON 处理
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# 系统集成
dirs = "5.0"                      # 跨平台路径
notify = "6.0"                    # 文件监听

# 工具库
chrono = { version = "0.4", features = ["serde"] }  # 时间处理
uuid = { version = "1.0", features = ["v4"] }       # UUID 生成
sha2 = "0.10"                                       # 哈希算法
```

### 前端依赖（JavaScript）

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.9.0",
    "dompurify": "^3.3.0",          // XSS 防护
    "marked": "^17.0.0"             // Markdown 解析
  },
  "devDependencies": {
    "vite": "^7.2.2",               // 构建工具
    "tailwindcss": "^3.4.18",       // CSS 框架
    "@vitejs/plugin-legacy": "^7.2.1",  // 浏览器兼容性
    "autoprefixer": "^10.4.16",     // CSS 前缀
    "postcss": "^8.4.35"            // CSS 处理
  }
}
```

## 常见问题

### 1. 编译失败

**问题**：`cargo build` 或 `bun run tauri:build` 报错
**解决**：

```bash
# 更新工具链
rustup update

# 清理缓存
cargo clean --manifest-path src-tauri/Cargo.toml
rm -rf build/ node_modules/

# 重新安装依赖
bun install

# 重新构建
bun run tauri:build
```

### 2. 应用无法启动

**问题**：双击应用无反应或闪退
**解决**：
- **macOS**：在"系统偏好设置 > 安全性与隐私"中允许应用运行
- **Windows**：右键应用 > 属性 > 解除锁定
- **Linux**：确保应用有执行权限 `chmod +x <app_path>`
- 查看日志：`RUST_LOG=debug` 启动应用查看详细错误信息

### 3. 依赖安装失败

**问题**：`bun install` 报错或卡住
**解决**：

```bash
# 清理缓存
rm -rf node_modules/ bun.lock

# 重新安装
bun install

# 或使用 npm 作为备选方案
npm install
```

### 4. 权限错误

**问题**：无法写入客户端配置文件
**解决**：
- 确认目标配置文件目录具有写权限
- 检查该文件是否被其他程序占用
- macOS/Linux：使用 `chmod` 修改权限
- Windows：以管理员身份运行应用

### 5. 配置文件监听无效

**问题**：修改配置文件后应用未检测到变化
**解决**：
- 检查系统托盘菜单中"文件监听"是否开启
- 确认配置文件路径正确
- 某些编辑器（如 VS Code）可能使用临时文件，需重启监听器

### 6. 快照恢复失败

**问题**：托盘菜单恢复快照后配置未更新
**解决**：
- 检查配置文件是否被其他程序占用
- 手动刷新应用页面
- 查看系统通知中的错误提示

## 文档与资源

### 项目文档

- **完整开发文档**：`llmdoc/` 目录（架构设计、功能模块、技术指南）
- **文档索引**：`llmdoc/index.md`
- **架构文档**：`llmdoc/architecture/systemprompt-vault-architecture.md`
- **功能文档**：`llmdoc/features/`（主题系统、i18n、快照管理等）
- **技术指南**：`llmdoc/guides/`（Vite 构建、Bun 迁移、CI/CD 等）

### 外部资源

- **Tauri 文档**：https://tauri.app/
- **Vite 文档**：https://vitejs.dev/
- **Bun 文档**：https://bun.sh/docs
- **Tailwind CSS**：https://tailwindcss.com/
- **Monaco Editor**：https://microsoft.github.io/monaco-editor/

## 许可证

MIT License

## 贡献

欢迎提交 Issue 与 Pull Request！

### 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 开发规范

- 遵循项目现有的代码风格
- 为新功能添加测试（如适用）
- 更新相关文档（`llmdoc/` 和 `README.md`）
- 确保 `cargo fmt` 和 `cargo clippy` 通过
- 参考：`llmdoc/conventions/` 中的项目规范

## 致谢

### 核心技术

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [Rust](https://www.rust-lang.org/) - 系统编程语言
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [Bun](https://bun.sh/) - 高性能 JavaScript 运行时和包管理器
- [Tailwind CSS](https://tailwindcss.com/) - 实用优先的 CSS 框架

### 第三方库

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code 编辑器核心
- [DOMPurify](https://github.com/cure53/DOMPurify) - XSS 过滤器
- [Marked](https://marked.js.org/) - Markdown 解析器
- [Notify](https://docs.rs/notify/) - 文件监听库

---

**项目版本**：0.1.0
**最后更新**：2025-11
**维护者**：SystemPromptVault 开发团队
