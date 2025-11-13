# Tauri v2 框架技术限制与应对策略

## 1. Purpose

记录和说明 SystemPromptVault 项目在开发过程中遇到的 Tauri v2 框架技术限制，以及相应的架构决策和应对策略。此文档帮助开发者了解框架边界，避免在类似问题上重复踩坑，并为未来的技术选型提供参考。

## 2. How it Works / 记录的技术限制

### 2.1 窗口最小化按钮事件拦截限制

**技术限制描述**:
- Tauri v2 框架不支持拦截系统最小化按钮的点击事件
- 无法像处理关闭按钮事件（`onCloseRequested`）那样处理最小化按钮事件
- 此限制在所有平台上都存在，是框架设计的技术边界

**技术调研过程**:
1. **初步尝试**: 在窗口事件监听器中尝试添加 `onMinimized` 或类似事件处理
2. **官方文档查询**: 通过 Context7 MCP 查询 Tauri v2 官方文档确认限制存在
3. **社区验证**: 检查 Tauri GitHub issues 和社区讨论，确认此为已知限制
4. **框架对比**: 对比 Electron 等其他框架，发现此限制在 Tauri 中普遍存在

**根本原因**:
- 系统级窗口控件的事件处理由操作系统管理
- Tauri 出于安全性和跨平台一致性考虑，限制了对此类事件的拦截
- 最小化操作被认为是系统级行为，不应被应用层干预

### 2.2 权限系统严格性与静默失败

**技术限制描述**:
- Tauri v2 权限系统非常严格，缺少必要权限时 API 调用会静默失败
- 不会抛出明确的错误信息，导致调试困难
- 权限配置错误时应用行为异常但无明显错误提示

**受影响的操作**:
```javascript
// 以下操作在缺少权限时会静默失败
await appWindow.hide();           // 需要 core:window:allow-hide
await appWindow.show();           // 需要 core:window:allow-show
await appWindow.minimize();       // 需要 core:window:allow-minimize
await appWindow.setMaximized();   // 需要 core:window:allow-maximize
await appWindow.center();         // 需要 core:window:allow-center
```

**应对策略**:
1. **完整权限配置**: 在 `tauri.conf.json` 中显式声明所有需要的权限
2. **防御性编程**: 假设操作可能失败，提供降级策略
3. **详细日志记录**: 记录每个窗口操作的执行结果
4. **权限检查清单**: 建立权限配置检查清单，避免遗漏

### 2.3 跨窗口事件通信的复杂性

**技术限制描述**:
- Tauri 窗口间的事件通信需要特殊的配置和处理
- localStorage 的 storage 事件在同一应用的多个窗口间可能不会正常触发
- Tauri 自定义事件系统需要正确的事件通道配置

**解决方案实现**:
```javascript
// 双通道同步策略
const saveWindowBehavior = async (behavior) => {
  // 通道1: localStorage (用于同源页面)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(behavior));

  // 通道2: Tauri 自定义事件 (用于 Tauri 窗口间)
  await emit('window-behavior-updated', behavior);

  // 通道3: 后端持久化存储
  await AppStateAPI.setWindowBehavior(behavior.closeBehavior);
};
```

## 3. Relevant Code Modules

### 配置文件
- `src-tauri/tauri.conf.json`: Tauri 权限配置，包含所有窗口操作权限声明 (第 39-53 行)

### 前端实现
- `dist/js/main.js`: 窗口行为配置加载、事件监听、关闭处理逻辑 (第 130-285, 1215-1285)
- `dist/js/settings.js`: 设置窗口的配置保存、UI 交互、跨窗口同步 (第 70-180, 200-250)

### 后端实现
- `src-tauri/src/commands/app_state.rs`: 窗口行为配置的后端存储命令 (第 52-72)
- `src-tauri/src/models/app_state.rs`: 简化的窗口行为数据模型 (第 24-28)

### 架构文档
- `llmdoc/features/settings-window-lifecycle-management.md`: 窗口行为配置系统的完整实现文档
- `llmdoc/agent/tauri-backend-window-management-storage-command-system-investigation.md`: Tauri 后端窗口管理系统调查

## 4. Attention

### 架构决策原则

1. **技术限制优先**: 遇到框架限制时，优先调整架构设计而非强行突破
2. **用户体验保持**: 技术限制不应影响用户的核心使用体验
3. **向前兼容**: 保留扩展性，为框架未来的功能更新预留空间
4. **文档完善**: 详细记录技术限制和原因，避免团队重复调研

### 开发工作流调整

1. **早期技术验证**: 在架构设计阶段验证关键技术点的可行性
2. **原型驱动开发**: 对不确定的技术点先做原型验证
3. **权限配置检查**: 建立权限配置的自动化检查工具
4. **错误处理标准化**: 制定统一的错误处理和日志记录规范

### 调试和问题排查

1. **权限问题排查**: 当窗口操作异常时，首先检查 `tauri.conf.json` 权限配置
2. **事件通信验证**: 使用浏览器开发者工具监控 localStorage 和自定义事件
3. **跨平台测试**: 在不同操作系统上验证窗口行为的一致性
4. **日志分析**: 通过详细的日志记录定位问题根因

### 未来技术演进关注点

1. **Tauri 版本更新**: 关注 Tauri 框架的版本更新，特别是窗口管理相关的功能变化
2. **社区解决方案**: 跟踪社区对于窗口最小化事件等限制的解决方案
3. **替代技术调研**: 必要时评估其他桌面应用开发框架的可行性
4. **操作系统API**: 在确保跨平台性的前提下，研究特定操作系统的窗口管理API

### 团队知识共享

1. **技术分享会**: 定期分享遇到的框架限制和解决方案
2. **代码注释**: 在相关代码处添加详细的技术限制说明注释
3. **设计决策记录**: 在架构文档中记录因技术限制导致的设计决策
4. **新人培训**: 将常见技术限制纳入新团队成员的培训内容