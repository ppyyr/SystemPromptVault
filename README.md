# SysPromptSwitcher

基于 Tauri v2 的单文件 Prompt 管理与客户端切换工具，专注于在 `.claude/CLAUDE.md`、`.codex/AGENTS.md`、`.gemini/GEMINI.md` 等配置文件之间实现快速、可视化的配置管理。

## 功能特性

- ✅ **客户端切换**：在 Claude、Codex、Gemini 等客户端之间秒级切换
- ✅ **全局配置编辑**：直接编辑 `~/.claude/CLAUDE.md` 等用户级配置文件
- ✅ **提示词库管理**：创建、编辑、删除单文件提示词并即时预览
- ✅ **智能标签系统**：支持多标签、自动客户端标签、自由标签输入
- ✅ **标签过滤**：通过标签快速筛选出合适的提示词
- ✅ **一键应用**：将提示词内容立即同步到当前客户端配置
- ✅ **可扩展客户端**：允许用户自定义新的客户端与存储路径
- ✅ **跨平台**：支持 macOS、Windows、Linux 三大平台

## 技术架构

- **前端**：静态 HTML/CSS + 原生 JavaScript，主页负责客户端切换与配置编辑，设置页负责提示词库与客户端管理
- **后端**：Rust + Tauri v2，提供命令式 API（prompt、client、config_file、app_state 等）
- **数据存储**：应用数据目录中的 JSON 文件，分别存储提示词、客户端以及应用状态
- **配置文件读写**：通过 `config_file` 命令将内容同步到真实的全局配置（例如 `~/.claude/CLAUDE.md`）

## 核心概念

- **客户端 (Client)**：指 AI 工具的配置文件描述（ID、名称、路径），例如 Claude/Codex/Gemini
- **提示词 (Prompt)**：单个独立的 Prompt 文件，包含名称、正文和可配置标签
- **标签 (Tag)**：用于组织与过滤提示词的分类标记，可自动识别客户端标签并支持自定义
- **全局配置文件**：真实生效的用户级配置文件（如 `~/.claude/CLAUDE.md`），应用会直接写入这些文件

## 快速开始

### 前置要求

- Rust 1.70+
- Node.js 16+（可选，仅用于前端开发）
- 操作系统：macOS / Windows / Linux

### 安装依赖

```bash
# 安装 Rust (如果未安装)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 进入项目目录
cd /Volumes/PC811/Users/user/apps/SysPromptSwitcher
```

### 开发模式

```bash
# 运行开发服务器
cd src-tauri && cargo tauri dev
```

### 构建生产版本

```bash
# 构建应用
cd src-tauri && cargo tauri build

# 输出位置：
# macOS: src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux: src-tauri/target/release/bundle/deb/
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
SysPromptSwitcher/
├── dist/                          # 前端静态资源
│   ├── index.html                 # 主界面（客户端切换、配置编辑）
│   ├── settings.html              # 设置界面（提示词/客户端管理）
│   ├── css/
│   │   ├── main.css
│   │   └── components.css
│   └── js/
│       ├── main.js                # 主页逻辑
│       ├── settings.js            # 设置页逻辑
│       ├── api.js                 # Tauri API 封装（新增）
│       └── utils.js               # 通用工具函数
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                # 应用入口
│   │   ├── lib.rs                 # Tauri 构建器
│   │   ├── models/                # 数据模型
│   │   │   ├── prompt.rs          # Prompt 模型（新增）
│   │   │   ├── client.rs          # ClientConfig 模型（新增）
│   │   │   ├── app_state.rs       # AppState 模型（新增）
│   │   │   ├── template.rs        # 旧模板模型（待移除）
│   │   │   ├── project.rs
│   │   │   └── operations.rs
│   │   ├── storage/               # 数据访问层
│   │   │   ├── prompt_repository.rs   # Prompt 仓储（新增）
│   │   │   ├── client_repository.rs   # Client 仓储（新增）
│   │   │   └── json_store.rs
│   │   ├── commands/              # Tauri 命令
│   │   │   ├── prompt.rs          # Prompt 命令（新增）
│   │   │   ├── client.rs          # Client 命令（新增）
│   │   │   ├── config_file.rs     # 全局配置读写（新增）
│   │   │   ├── app_state.rs       # 应用状态同步（新增）
│   │   │   ├── template.rs        # 旧模板命令（待移除）
│   │   │   ├── project.rs
│   │   │   └── backup.rs
│   │   └── utils/
│   ├── Cargo.toml
│   └── tauri.conf.json
└── docs/
    └── plan.md                    # 项目规划
```

## 数据存储

### 配置文件位置

- **macOS**：`~/Library/Application Support/com.example.syspromptswitcher/`
- **Windows**：`C:\Users\<User>\AppData\Roaming\com.example.syspromptswitcher\`
- **Linux**：`~/.config/syspromptswitcher/`

### 存储结构

```
<app_data_dir>/
├── prompts.json              # 提示词库数据
├── clients.json              # 客户端配置
├── app_state.json            # 应用状态（当前客户端等）
└── backups/                  # 预留备份目录（未来功能）
```

## 开发指南

### 添加新客户端类型

1. 在 `src-tauri/src/models/client.rs` 中扩展 `ClientConfig` 字段
2. 在 `src-tauri/src/storage/client_repository.rs` 中处理新的持久化需求
3. 前端 `dist/js/settings.js` 中同步表单字段，确保通过 `api.js` 触发 `client` 命令

### 扩展提示词能力

1. 更新 `src-tauri/src/models/prompt.rs` 与 `prompt_repository.rs` 中的结构
2. 在 `src-tauri/src/commands/prompt.rs` 中定义新的 Tauri 命令
3. 前端 `dist/js/settings.js`、`dist/js/main.js` 中对应地增加数据绑定或过滤逻辑

### 自定义配置文件读写

1. 修改 `src-tauri/src/commands/config_file.rs` 以适配新的存储策略
2. 调整 `dist/js/api.js` 中的 `invoke("config_file_*")` 调用
3. 若需要多客户端同步，记得更新 `app_state.rs` 以记录活跃客户端

## 依赖包

```toml
tauri = "2.0"
tauri-plugin-dialog = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
dirs = "5.0"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4"] }
sha2 = "0.10"
```

## 常见问题

### 1. 编译失败

**问题**：`cargo build` 报错  
**解决**：

```bash
rustup update
cargo clean --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml
```

### 2. 应用无法启动

**问题**：双击应用无反应  
**解决**：
- macOS：在“系统偏好设置 > 安全性与隐私”中允许应用运行
- Windows：右键应用 > 属性 > 解除锁定

### 3. 权限错误

**问题**：无法写入客户端配置文件  
**解决**：
- 确认目标配置文件目录具有写权限
- 检查该文件是否被其他程序占用

## 许可证

MIT License

## 贡献

欢迎提交 Issue 与 Pull Request！

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [Rust](https://www.rust-lang.org/) - 系统编程语言
