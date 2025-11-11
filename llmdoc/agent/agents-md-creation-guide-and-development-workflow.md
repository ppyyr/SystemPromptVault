# SystemPromptVault AGENTS.md 创建指南与开发工作流

## Code Sections

### 项目配置与依赖管理

- `package.json:9-18` (构建脚本): 开发和构建命令定义
  ```json
  "scripts": {
    "dev": "vite",
    "build": "bun run build:css && vite build",
    "build:css": "tailwindcss -i ./dist/css/tailwind.css -o ./dist/css/output.css --minify",
    "tauri:dev": "cargo tauri dev",
    "tauri:build": "cargo tauri build"
  }
  ```

- `package.json:23-37` (开发依赖): 前端构建工具链
  ```json
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.19",
    "@tauri-apps/api": "^2.9.0",
    "@tauri-apps/cli": "^2.9.4",
    "@vitejs/plugin-legacy": "^7.2.1",
    "tailwindcss": "^3.4.18",
    "vite": "^7.2.2"
  }
  ```

- `package.json:33-37` (运行时依赖): 前端功能库
  ```json
  "dependencies": {
    "dompurify": "^3.3.0",
    "marked": "^17.0.0"
  }
  ```

### 构建配置

- `postcss.config.js:1-6` (PostCSS 配置): CSS 处理管道
  ```javascript
  module.exports = {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  }
  ```

- `vite.config.js:16-25` (多页面构建): Vite 多入口配置
  ```javascript
  build: {
    outDir: resolve(rootDir, '../build'),
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        settings: resolve(rootDir, 'settings.html')
      }
    }
  }
  ```

### Git 配置

- `.gitignore:1-69` (版本控制忽略规则): 完整的忽略配置
  ```
  # Rust 构建输出
  /target/
  src-tauri/target/

  # Tauri 构建产物
  src-tauri/target/release/bundle/

  # 前端构建输出
  build/
  .vite/

  # CSS 编译输出
  dist/css/output.css

  # 系统和临时文件
  .DS_Store
  *.log
  *.tmp
  ```

### 文档系统

- `llmdoc/index.md:1-52` (文档索引): 结构化技术文档体系
- `README.md:94-136` (项目结构): 详细的目录结构说明
- `README.md:31-65` (快速开始): 开发环境搭建指南

## Report

### 结论

> 项目具备完整的开发工具链和文档体系，为 AGENTS.md 创建提供了充分的技术基础

- **包管理**: 从 npm 迁移到 Bun，提供更快的构建速度
- **构建系统**: Vite + Tailwind CSS CLI 的分离构建流程
- **代码质量**: 完善的 Git 忽略配置和文档体系
- **开发体验**: 热重载开发服务器和多环境支持

### 关系

> 开发工作流中各组件的协作关系

- **依赖关系**:
  - `bun run build` → `bun run build:css` + `vite build`
  - `tauri:dev` → `bun run dev` (前端开发服务器)
  - `tauri:build` → `bun run build` (生产构建)

- **工具链集成**:
  - Vite 处理 JavaScript 和静态资源
  - Tailwind CSS CLI 独立处理样式编译
  - PostCSS 提供 CSS 处理管道
  - Tauri CLI 负责应用打包和分发

### 结果

> 完整的开发工作流清单和 AGENTS.md 创建建议

**技术栈清单**:

**前端技术栈**:
- **语言**: JavaScript (ES6+)
- **构建工具**: Vite 7.2.2 + Legacy 插件
- **CSS 框架**: Tailwind CSS 3.4.18 + Typography 插件
- **包管理器**: Bun 1.x
- **CSS 处理**: PostCSS + Autoprefixer
- **Markdown**: marked 17.0.0
- **HTML 净化**: DOMPurify 3.3.0
- **编辑器**: Monaco Editor (CDN)

**后端技术栈**:
- **语言**: Rust 2021 Edition
- **框架**: Tauri 2.0
- **序列化**: serde + serde_json
- **文件系统**: notify 6.1
- **时间处理**: chrono 0.4
- **UUID**: uuid 1.0
- **目录操作**: dirs 5.0

**开发工作流**:

**1. 环境准备**:
```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 安装依赖
bun install
```

**2. 开发模式**:
```bash
# 启动开发服务器 (包含热重载)
bun run tauri:dev

# 单独启动前端开发服务器
bun run dev

# 单独启动 CSS 监听
bun run watch:css
```

**3. 构建流程**:
```bash
# 完整构建流程
bun run tauri:build

# 分步构建
bun run build:css  # 编译 Tailwind CSS
vite build        # 构建前端资源

# 平台特定构建
bun run tauri:build:universal  # macOS Universal Binary
```

**核心目录结构**:

```
SystemPromptVault/
├── 📄 package.json              # 前端项目配置
├── 📄 bun.lockb                 # Bun 锁定文件
├── 📄 vite.config.js            # Vite 构建配置
├── 📄 tailwind.config.js        # Tailwind CSS 配置
├── 📄 postcss.config.js         # PostCSS 配置
├── 📄 .gitignore               # Git 忽略规则
├──
├── 📁 dist/                    # 前端源码目录
│   ├── 📄 index.html           # 主界面
│   ├── 📄 settings.html        # 设置界面
│   ├── 📁 css/                 # 样式文件
│   │   ├── 📄 main.css         # 主样式
│   │   ├── 📄 components.css   # 组件样式
│   │   └── 📄 tailwind.css     # Tailwind 入口
│   └── 📁 js/                  # JavaScript 模块
│       ├── 📄 main.js          # 主页逻辑
│       ├── 📄 settings.js      # 设置页逻辑
│       ├── 📄 api.js           # Tauri API 封装
│       ├── 📄 theme.js         # 主题系统
│       └── 📄 utils.js         # 工具函数
├──
├── 📁 src-tauri/               # Rust 后端
│   ├── 📄 Cargo.toml           # Rust 依赖配置
│   ├── 📄 tauri.conf.json      # Tauri 应用配置
│   └── 📁 src/                 # Rust 源码
│       ├── 📄 main.rs          # 应用入口
│       ├── 📄 lib.rs           # 库入口
│       ├── 📁 commands/        # Tauri 命令
│       ├── 📁 models/          # 数据模型
│       ├── 📁 storage/         # 数据访问层
│       └── 📁 utils/           # 工具函数
├──
├── 📁 llmdoc/                  # 项目文档
│   ├── 📄 index.md             # 文档索引
│   ├── 📁 architecture/        # 架构文档
│   ├── 📁 features/            # 功能模块文档
│   ├── 📁 modules/             # 核心模块文档
│   ├── 📁 guides/              # 技术指南
│   └── 📁 agent/               # Agent 生成文档
└──
└── 📁 build/                   # 构建输出 (Tauri 前端资源)
```

**现有文档概览**:

- **架构文档**: 系统设计、通信机制、初始化指南
- **功能文档**: 6 大核心功能的详细实现说明
- **模块文档**: 数据模型、API 接口、存储层设计
- **技术指南**: 构建工具、CSS 框架、包管理器使用
- **规范文档**: 命名约定、代码风格、提交规范

### 注意

> 为 AGENTS.md 创建提供的重要提醒和建议

- **测试现状**: 项目当前缺乏自动化测试，建议优先补充
- **CI/CD 缺失**: 未配置持续集成流水线，影响代码质量保障
- **文档更新**: 部分 README 内容可能与实际代码不完全同步
- **依赖管理**: Bun 迁移后需要验证所有构建脚本的兼容性
- **安全考虑**: 直接写入用户配置文件需要完善的权限检查
- **跨平台测试**: 需要在 Windows/Linux 平台验证功能完整性
- **性能优化**: 大量提示词时的前端搜索和渲染性能需要关注
- **错误处理**: 用户友好的错误提示和恢复机制需要完善