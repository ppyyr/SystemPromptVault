# SystemPromptVault 项目技术栈与架构分析报告

## Code Sections

### 项目配置文件

- `package.json:1-38` (前端依赖配置): Node.js 项目配置，使用 Bun 包管理器
  ```json
  {
    "name": "systemprompt-vault",
    "version": "1.0.0",
    "scripts": {
      "dev": "vite",
      "build": "bun run build:css && vite build",
      "build:css": "tailwindcss -i ./dist/css/tailwind.css -o ./dist/css/output.css --minify",
      "tauri:dev": "cargo tauri dev",
      "tauri:build": "cargo tauri build"
    }
  }
  ```

- `src-tauri/Cargo.toml:1-35` (Rust 后端依赖): Tauri v2 框架配置
  ```toml
  [dependencies]
  tauri = { version = "2.0", features = ["tray-icon"] }
  serde = { version = "1.0", features = ["derive"] }
  dirs = "5.0"
  chrono = { version = "0.4", features = ["serde"] }
  uuid = { version = "1.0", features = ["v4", "serde"] }
  notify = { version = "6.1", default-features = false, features = ["macos_fsevent"] }
  ```

- `src-tauri/tauri.conf.json:1-59` (Tauri 应用配置): 应用构建和安全配置
  ```json
  {
    "productName": "SystemPromptVault",
    "version": "0.1.0",
    "build": {
      "beforeBuildCommand": "bun run build",
      "beforeDevCommand": "bun run dev",
      "frontendDist": "../build"
    }
  }
  ```

### 前端技术栈

- `vite.config.js:1-26` (构建配置): Vite 构建工具配置
  ```javascript
  export default defineConfig({
    root: rootDir,
    plugins: [legacy()],
    build: {
      outDir: resolve(rootDir, '../build'),
      rollupOptions: {
        input: {
          main: resolve(rootDir, 'index.html'),
          settings: resolve(rootDir, 'settings.html')
        }
      }
    }
  });
  ```

- `tailwind.config.js:1-41` (CSS 框架配置): Tailwind CSS 主题配置
  ```javascript
  module.exports = {
    darkMode: 'class',
    content: ["./dist/**/*.{html,js}"],
    theme: {
      extend: {
        fontFamily: {
          sans: ['"SF Pro Display"', '"Segoe UI"', 'system-ui'],
          mono: ['"SF Mono"', '"JetBrains Mono"', 'monospace']
        }
      }
    }
  }
  ```

### 后端架构

- `src-tauri/src/main.rs:16-90` (应用入口): Tauri 应用初始化和命令注册
  ```rust
  fn main() {
    tauri::Builder::default()
      .manage(prompt_repository)
      .manage(client_repository)
      .manage(snapshot_repository)
      .manage(file_watcher)
      .invoke_handler(tauri::generate_handler![
        commands::prompt::get_all_prompts,
        commands::client::get_all_clients,
        commands::config_file::read_config_file,
        // ... 更多命令
      ])
      .run(tauri::generate_context!())
  }
  ```

- `src-tauri/src/models/prompt.rs:5-60` (提示词数据模型): 核心业务实体
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct Prompt {
    pub id: String,
    pub name: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
  }
  ```

- `src-tauri/src/models/client.rs:4-55` (客户端配置模型): 客户端管理
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct ClientConfig {
    pub id: String,
    pub name: String,
    pub config_file_path: String,
    pub auto_tag: bool,
    pub is_builtin: bool,
  }
  ```

### 前端架构

- `dist/js/api.js:1-50` (API 封装): Tauri 命令调用封装
  ```javascript
  export const PromptAPI = {
    getAll: () => call("get_all_prompts"),
    create: (name, content, tags) => call("create_prompt", { name, content, tags }),
    update: (id, name, content, tags) => call("update_prompt", { id, name, content, tags })
  };
  ```

- `dist/js/main.js:1-50` (主页面逻辑): 前端状态管理和UI交互
  ```javascript
  const state = {
    clients: [],
    currentClientId: "claude",
    prompts: [],
    selectedTags: [],
    configContent: "",
    editorMode: "edit"
  };
  ```

## Report

### 结论

> SystemPromptVault 是基于 Tauri v2 构建的桌面应用，采用前后端分离架构，专注于 AI 工具配置文件管理

- **项目类型**: Tauri v2 跨平台桌面应用
- **核心功能**: AI 客户端配置文件管理和提示词库管理
- **架构模式**: 前端 HTML/CSS/JS + 后端 Rust，通过 Tauri 命令系统通信
- **数据存储**: JSON 文件存储在用户数据目录

### 关系

> 模块间依赖关系和通信架构

- **前端到后端**: 通过 `dist/js/api.js` 封装 Tauri invoke 调用
- **数据层**: `src-tauri/src/storage/` 包含所有数据访问逻辑
- **命令层**: `src-tauri/src/commands/` 处理前端请求
- **模型层**: `src-tauri/src/models/` 定义数据结构
- **工具模块**: `src-tauri/src/utils/` 提供通用功能

### 结果

> 完整技术栈清单和架构分析

**前端技术栈**:
- **构建工具**: Vite 7.2.2 + Legacy 插件
- **CSS 框架**: Tailwind CSS 3.4.18 + Typography 插件
- **包管理**: Bun (从 npm 迁移)
- **JavaScript**: 原生 ES6+，无框架依赖
- **Markdown 处理**: marked 17.0.0 + DOMPurify 3.3.0

**后端技术栈**:
- **框架**: Tauri 2.0 + System Tray 支持
- **语言**: Rust 2021 Edition
- **序列化**: serde + serde_json
- **文件系统**: notify 6.1 (文件监听)
- **时间处理**: chrono 0.4
- **唯一标识**: uuid 1.0

**核心模块**:
- **提示词管理**: 增删改查、标签过滤、导入导出
- **客户端管理**: 内置/自定义客户端配置
- **配置文件操作**: 读写用户配置文件
- **快照系统**: 自动备份和版本管理
- **文件监听**: 实时检测配置文件变化
- **系统托盘**: 快速访问和快照恢复

**开发工作流**:
- **开发命令**: `bun run tauri:dev` 启动开发服务器
- **构建命令**: `bun run tauri:build` 构建生产版本
- **CSS 构建**: Tailwind CLI 独立构建流程
- **前端构建**: Vite 处理 JavaScript 和静态资源

### 注意

> 潜在问题和需要关注的架构特点

- **无测试框架**: package.json 中测试脚本为空，缺乏自动化测试
- **无 CI/CD**: 项目未配置 GitHub Actions 或其他 CI/CD 流水线
- **依赖管理**: 从 npm 迁移到 Bun，需确保兼容性
- **文件监听**: 使用 notify crate 进行文件变化检测，需注意跨平台兼容性
- **数据持久化**: 纯 JSON 文件存储，缺乏数据版本迁移策略
- **错误处理**: API 调用需要完善的错误处理机制
- **安全性**: 直接写入用户配置文件，需要权限验证和备份机制