# SystemPromptVault 快捷键和事件处理机制调查报告

## Code Sections

### 1. 主应用键盘事件处理

- `dist/js/main.js:223~235`: 全局键盘事件监听器

```javascript
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeClientDropdown();
    return;
  }
  const loweredKey = typeof event.key === "string" ? event.key.toLowerCase() : "";
  const hasSaveModifier = event.metaKey || event.ctrlKey;
  if (hasSaveModifier && loweredKey === "s") {
    event.preventDefault();
    const createSnapshot = Boolean(event.shiftKey);
    saveConfigFile({ createSnapshot });
  }
});
```

- `dist/js/main.js:28`: 状态管理中的 Monaco 编辑器实例

```javascript
const state = {
  monacoEditor: null,
  // ... 其他状态
};
```

### 2. Monaco 编辑器配置

- `dist/js/main.js:513~526`: Monaco 编辑器初始化配置

```javascript
state.monacoEditor = monacoInstance.editor.create(elements.monacoEditorContainer, {
  value: state.configContent,
  language: "markdown",
  theme: getCurrentMonacoTheme(),
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: "on",
  fontSize: 14,
  fontFamily: '"JetBrains Mono", "SF Mono", Consolas, "Courier New", monospace',
  lineNumbers: "on",
  renderWhitespace: "selection",
  bracketPairColorization: { enabled: true },
});
```

### 3. 下拉菜单键盘导航模式

- `dist/js/main.js:673~677`: 下拉菜单键盘事件绑定

```javascript
elements.tagDropdownSearch?.addEventListener("keydown", handleTagSearchKeyNavigation);
elements.tagDropdownPanel?.addEventListener("keydown", handleTagPanelKeydown);
document.addEventListener("keydown", handleDocumentKeydownForDropdown);
```

- `dist/js/main.js:734~789`: 下拉菜单键盘处理函数

```javascript
const handleDocumentKeydownForDropdown = (event) => {
  if (event.key === "Escape" && state.tagDropdownOpen) {
    event.preventDefault();
    closeTagDropdown();
  }
};

const handleTagSearchKeyNavigation = (event) => {
  if (!state.tagDropdownOpen) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusAdjacentTagOption(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    focusAdjacentTagOption(-1);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeTagDropdown();
  }
};
```

### 4. 设置页面键盘事件

- `dist/js/settings.js:180~186`: 设置页面模态框键盘事件

```javascript
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePromptModal();
    closeClientModal();
    closeSettingsDropdown();
  }
});
```

### 5. Tauri 权限配置

- `src-tauri/tauri.conf.json:28~48`: 应用权限配置（无全局快捷键权限）

```json
"permissions": [
  "core:default",
  "core:event:default",
  "core:event:allow-listen",
  "core:event:allow-emit",
  "core:window:default",
  "core:window:allow-set-title",
  "core:window:allow-close",
  "core:window:allow-destroy",
  "core:window:allow-available-monitors",
  "core:window:allow-outer-position",
  "core:window:allow-outer-size",
  "core:window:allow-set-position",
  "core:window:allow-set-size",
  "core:webview:default",
  "core:webview:allow-webview-position",
  "core:webview:allow-webview-size",
  "core:app:default",
  "core:tray:default"
]
```

### 6. Tauri 依赖配置

- `src-tauri/Cargo.toml:20`: Tauri 核心依赖（仅包含 tray-icon 功能）

```toml
tauri = { version = "2.0", features = ["tray-icon"] }
```

## Report

### conclusions

1. **现有快捷键机制**: 项目使用纯前端 JavaScript 键盘事件监听，没有使用 Tauri 全局快捷键 API
2. **修饰键检测**: 使用 `event.metaKey || event.ctrlKey` 来检测 macOS 的 Cmd 键和 Windows/Linux 的 Ctrl 键
3. **Monaco 编辑器内置功能**: Monaco 编辑器默认支持 Cmd+Z/Ctrl+Z 的 undo/redo 功能
4. **事件处理模式**: 使用 `document.addEventListener("keydown")` 进行全局键盘事件监听
5. **权限配置**: 当前 Tauri 权限配置中不包含全局快捷键权限

### relations

1. **主键盘监听器与下拉菜单监听器**: 两个独立的 `document.addEventListener("keydown")` 监听器，需要协调避免冲突
2. **Monaco 编辑器与全局键盘事件**: Monaco 编辑器内部的键盘事件可能与全局监听器产生冲突
3. **修饰键检测逻辑**: `event.metaKey || event.ctrlKey` 模式在项目中统一使用
4. **保存快捷键与目标快捷键**: 现有的 Cmd/Ctrl+S 保存功能与计划的 Cmd+Z undo 功能存在潜在冲突

### result

**快捷键处理现状**:
- 项目使用纯前端键盘事件监听，无 Tauri 全局快捷键
- 现有全局监听器处理 Escape（关闭下拉菜单）和 Cmd/Ctrl+S（保存）
- Monaco 编辑器配置完整，支持基础编辑功能

**键盘事件处理模式**:
- 使用 `document.addEventListener("keydown")` 全局监听
- 修饰键检测：`event.metaKey || event.ctrlKey` 跨平台兼容
- 事件预处理：使用 `event.preventDefault()` 阻止默认行为
- 组件级监听：下拉菜单使用专门的键盘导航处理

**权限和依赖状态**:
- Tauri 权限配置中无全局快捷键权限
- 依赖仅包含基础的 `tray-icon` 功能
- 无 `tauri-plugin-global-shortcut` 或类似依赖

### attention

1. **Monaco 编辑器默认快捷键**: Monaco 编辑器已内置 Cmd+Z/Ctrl+Z undo/redo 功能，需要确认是否需要自定义实现或阻止默认行为
2. **键盘事件冲突**: 全局键盘监听器可能干扰 Monaco 编辑器的内部键盘处理，需谨慎处理事件优先级
3. **跨平台修饰键**: 现有的 `event.metaKey || event.ctrlKey` 模式正确支持 macOS 和 Windows/Linux，但需要测试实际行为
4. **焦点状态管理**: 需要考虑快捷键是否应在 Monaco 编辑器获得焦点时才触发
5. **权限需求**: 如果需要全局快捷键，需要添加 `tauri-plugin-global-shortcut` 依赖和相应权限配置

**实现建议**:
1. 优先测试 Monaco 编辑器默认 undo/redo 是否满足需求
2. 如需自定义，在现有全局键盘监听器中添加 Cmd+Z/Shift+Cmd+Z 处理逻辑
3. 考虑添加焦点检测，仅在编辑器获得焦点时触发快捷键
4. 遵循现有的键盘事件处理模式保持代码一致性