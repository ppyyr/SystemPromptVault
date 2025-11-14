# SystemPromptVault 开发文档索引

本目录包含 SystemPromptVault 项目的完整开发文档，仅面向项目开发者。

## 架构文档

- [SystemPromptVault 整体架构设计](architecture/systemprompt-vault-architecture.md): 系统整体架构设计，包含前端模块化、后端命令系统、数据流设计
- [Tauri v2 项目架构初始化指南](agent/tauri-v2-project-architecture-initialization-guide.md): Tauri v2 项目结构、配置文件、构建流程详解
- [前端后端通信架构](agent/tauri-v2-command-system-frontend-backend-communication.md): Tauri 命令系统、API 设计、前后端数据交互

## 功能模块文档

- [主题系统实现](features/theme-system-implementation.md): 暗色/亮色主题切换、主题状态管理、系统集成
- [i18n 国际化功能实现](features/i18n-internationalization.md): 完整的多语言支持、系统语言自动检测、DOM 自动更新、跨窗口同步、防闪烁机制
- [i18n 防闪烁（Anti-FOUC）实现](features/i18n-anti-fouc-implementation.md): 基于CSS属性选择器和伪元素的优雅防闪烁方案，通过模块化设计实现代码复用，包含与主题系统一致的极简模式和防重复处理机制
- [提示词管理模块](features/prompt-management-module.md): 提示词过滤算法、下拉菜单标签选择器、智能追加操作、Monaco编辑器集成、撤销重做支持
- [UI 交互优化](features/ui-interaction-optimization.md): Tooltip 系统、下拉菜单标签选择器、防抖机制、无障碍支持、CSS Grid 布局
- [编辑器模式状态管理](features/editor-mode-state-management.md): 编辑器模式切换、状态同步修复、滚动容器约束、按钮可见性控制、Monaco编辑器深度集成
- [导入导出功能](features/import-export-functionality.md): 提示词批量导入导出、文件处理、数据验证
- [客户端配置管理](features/client-configuration-management.md): 多客户端支持、配置文件读写、自动标签
- [快照版本管理系统](features/snapshot-version-management.md): 配置文件快照、内容去重、分类FIFO清理、System Tray集成、自动/手动快照分别管理
- [配置文件变化检测与重新加载](features/config-file-change-detection.md): 多配置文件路径监听、客户端事件隔离、实时文件变化检测、Toast文件名显示、冲突保护、托盘恢复优化机制、资源优化（单一Watcher实例）
- [设置页面窗口生命周期与行为管理](features/settings-window-lifecycle-management.md): 设置页面窗口关闭事件处理、窗口行为配置系统、跨窗口配置同步、Tauri API集成
- [About 窗口功能](features/about-window-functionality.md): 应用信息展示、PNG图标显示、应用名称层次结构、版本号动态获取、透明背景设计、系统菜单集成
- [Tauri v2 框架技术限制](features/tauri-v2-technical-limitations.md): Tauri v2 已知技术限制、架构决策、应对策略、窗口最小化按钮事件拦截限制、权限静默失败

## 核心模块文档

- [主题管理模块](modules/theme-module.md): `theme.js` 模块详解，包含主题切换逻辑、状态持久化
- [i18n 国际化模块](modules/i18n-module.md): `i18n.js` 模块详解，包含语言检测、翻译加载、DOM更新、跨窗口同步
- [API 接口模块](modules/api-module.md): 前端 API 封装、错误处理、状态管理
- [命令处理模块](modules/command-handling-module.md): Rust 端命令实现、参数验证、错误处理
- [存储管理模块](modules/storage-module.md): JSON 数据存储、文件操作、数据持久化
- [System Tray 模块](modules/system-tray-module.md): 系统托盘实现、菜单构建、快照恢复、事件处理、通知系统、文件监听器控制
- [应用菜单模块](modules/app-menu-module.md): macOS 原生应用菜单、File/Help 菜单构建、事件处理、系统集成

## 技术指南

- [Vite 构建配置指南](guides/vite-build-configuration.md): Vite构建系统、开发服务器、生产构建、静态资源复制、legacy浏览器支持、Tauri集成
- [CI/CD 构建流程](guides/ci-cd-build-workflow.md): GitHub Actions多平台自动化构建、macOS通用二进制、Windows和Linux发布、版本管理、发布流程
- [Tailwind CSS 集成指南](guides/tailwind-css-integration-guide.md): Tailwind CSS CLI 构建集成、自定义配置、构建流程和最佳实践
- [Bun 包管理器迁移指南](guides/bun-migration-guide.md): 从 npm 迁移到 Bun 的完整指南，包含新工作流和性能优势
- [无障碍开发指南](guides/accessibility-development-guide.md): ARIA 属性使用、键盘导航、屏幕阅读器支持
- [性能优化指南](guides/performance-optimization-guide.md): 防抖节流、事件优化、内存管理

## 项目规范

- [项目命名规范与演进历史](conventions/project-naming-conventions.md): 项目重命名历史、命名规范、迁移指南
- [代码风格规范](conventions/code-style-conventions.md): JavaScript/TypeScript 编码规范、Rust 代码规范
- [文件组织规范](conventions/file-organization-conventions.md): 目录结构、命名约定、模块划分原则
- [Git 提交规范](conventions/git-commit-conventions.md): 提交信息格式、分支管理、版本发布

## Agent 生成文档

此目录包含由自动化工具生成的技术分析文档：
- [agent/](agent/): 自动生成的代码分析、架构研究、技术实现指南

### 已废弃文档
- ~~[Tauri v2 剪贴板功能实现和 Command 系统调研报告](agent/tauri-v2-clipboard-integration-technical-research.md)~~ - 项目已采用浏览器原生 Clipboard API，移除 Tauri 插件依赖

**更新日期**: 2025-11-14
**项目版本**: 0.1.0
**维护者**: SystemPromptVault 开发团队
**最近更新**: About 窗口界面优化，包括PNG图标替换emoji、透明背景设计、应用名称层次结构新增；应用菜单模块完善，支持 File/Help 菜单、事件处理、系统集成；Vite 构建配置更新，新增 about.html 入口支持