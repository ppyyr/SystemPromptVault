# 配置文件下拉菜单右键菜单功能 - 前端组件模式调研

## Code Sections

### 1. 现有上下文菜单组件调研

**发现结果：项目中不存在右键上下文菜单组件**

- 通过全面搜索（`contextmenu`, `right-click`, `context menu`等关键词），项目中没有发现任何右键菜单组件
- 现有的交互模式主要基于左键点击的下拉菜单和悬浮提示

### 2. 现有下拉菜单定位逻辑

- `dist/js/main.js:879-889` (toggleConfigFileDropdown): 配置文件下拉菜单的开关逻辑
- `dist/js/main.js:891-906` (openConfigFileDropdown): 打开菜单的状态管理和焦点控制
- `dist/js/main.js:908-928` (closeConfigFileDropdown): 关闭菜单和焦点恢复逻辑
- `dist/js/main.js:936-947` (焦点管理): `focusConfigFileDropdownOption`, 键盘导航支持
- `dist/js/main.js:1033-1047` (handleDocumentClickForDropdown): 外部点击关闭机制，使用事件委托
- `dist/js/main.js:1049-1054` (handleDocumentKeydownForDropdown): ESC键关闭支持
- `dist/css/main.css:138-165` (下拉面板样式): `client-dropdown__panel` 统一样式系统
- `dist/css/main.css:155-159` (暗色主题适配): 完整的主题变量系统

### 3. Toast 提示系统

- `dist/js/utils.js:54-66` (showToast函数): 核心Toast提示系统，支持success/error/info/warning类型
- `dist/js/utils.js:68-95` (showActionToast函数): 支持操作按钮的增强Toast
- `dist/css/components.css:72-101` (Toast样式): 完整的视觉样式和状态样式
- `dist/css/components.css:103-124` (Action Toast样式): 操作按钮Toast的专用样式
- 自动隐藏机制：3秒后自动消失 (`TOAST_DURATION`)
- 国际化支持：现有系统支持，但Toast主要使用直接文本

### 4. 剪贴板操作相关代码

**发现结果：项目已实现剪贴板操作功能**

- 通过搜索（`clipboard`, `copy`, `navigator.clipboard`等），项目已在 `dist/js/main.js:1212` 中实现 `copyFilePathToClipboard` 函数
- 实现方式：使用浏览器原生 `navigator.clipboard.writeText()` API
- 应用场景：配置文件右键菜单的"复制完整路径"功能
- **技术决策**：项目选择使用浏览器原生 API 而非 Tauri 插件，简化了依赖和权限配置

### 5. 事件监听模式

- `dist/js/main.js:179-186` (全局事件监听): 使用事件捕获阶段进行tooltip事件处理
- `dist/js/main.js:828-832` (配置下拉菜单事件): 绑定点击和键盘事件监听器
- `dist/js/main.js:834-856` (键盘导航处理): `handleConfigFileToggleKeydown`, 完整的键盘支持
- `dist/js/main.js:1033-1047` (外部点击检测): 标准的事件委托模式，包含`composedPath`兼容性处理
- 统一使用事件委托处理动态元素，支持键盘导航和辅助功能

### 6. 国际化系统

- `dist/js/i18n.js:176-182` (t函数): 核心翻译函数，支持嵌套key和fallback
- `dist/js/i18n.js:156-162` (initI18n): 初始化和语言检测逻辑
- `dist/js/i18n.js:184-190` (setLanguage): 语言切换功能
- 支持属性：`data-i18n`, `data-i18n-tooltip`, `data-i18n-aria`, `data-i18n-[attr]`
- 自动DOM更新机制，支持跨窗口同步

### 7. 目标元素位置与状态

- `dist/index.html:112` (配置文件下拉菜单标签): `#configFileDropdownLabel` span元素
- 当前为显示文件名的文本元素，位于button内部，无右键事件绑定
- 父元素：`#configFileDropdownToggle` button，已有完整的事件监听系统
- 位置信息：位于页面顶部的配置编辑器头部区域，使用CSS Grid三列布局

### 8. CSS变量和主题系统

- `dist/css/main.css:138-165` 使用的主题变量：
  - `--color-border`: 边框颜色
  - `--radius-md`: 圆角大小
  - 完整的暗色主题适配系统
- `dist/css/components.css:87-101` Toast颜色变量：
  - `--color-success`, `--color-error`, `--color-warning`

## Report

### conclusions

1. **无现成右键菜单组件**：项目中不存在任何右键上下文菜单组件，需要从零实现
2. **成熟的下拉菜单系统**：项目有完善的下拉菜单定位逻辑，可直接复用到右键菜单
3. **完整的Toast提示系统**：项目有成熟的Toast系统，可用于复制成功后的反馈
4. **已实现剪贴板功能**：项目已通过浏览器原生 `navigator.clipboard.writeText()` API 实现剪贴板复制功能，简化了依赖
5. **统一的事件监听模式**：项目使用事件委托和捕获阶段监听，可为右键菜单提供参考
6. **完善的国际化支持**：项目的i18n系统支持DOM自动更新，右键菜单文本可无缝集成

### relations

1. **下拉菜单复用关系**：现有的 `client-dropdown` 定位逻辑 → 可扩展为右键菜单定位系统
2. **Toast集成关系**：右键菜单复制操作 → 现有的 `showToast` 函数用于操作反馈
3. **事件监听复用**：现有的事件委托模式 → 右键菜单的事件处理机制
4. **国际化集成**：右键菜单文本 → 现有的 `data-i18n` 翻译系统
5. **主题适配关系**：右键菜单样式 → 现有的暗色/亮色主题变量系统

### result

项目具备了实现右键菜单功能的大部分基础设施：

**可复用的现有模式**：
1. **成熟的下拉菜单系统**：
   - 完整的状态管理（`state.configFileDropdownOpen`, `state.configFileDropdownFocusIndex`）
   - 标准化的开关逻辑（`toggleConfigFileDropdown`, `openConfigFileDropdown`, `closeConfigFileDropdown`）
   - 完善的键盘导航支持（Arrow keys, Enter, Space, ESC）
   - 统一的CSS样式系统和主题适配（`.client-dropdown__panel`样式类）

2. **完善的事件处理框架**：
   - 外部点击关闭机制（`handleDocumentClickForDropdown`），包含`composedPath`兼容性处理
   - 标准的事件委托模式，适用于动态元素
   - 完整的键盘事件处理（`handleConfigFileToggleKeydown`）

3. **统一的视觉系统**：
   - CSS变量驱动的主题系统（`--color-border`, `--radius-md`等）
   - 完整的暗色/亮色主题适配
   - 统一的过渡动画系统（`transform`, `opacity`, `transition`）

4. **成熟的Toast反馈系统**：
   - 多类型支持（success/error/info/warning）
   - 操作按钮支持（`showActionToast`）
   - 自动消失机制和完整的样式系统

5. **完善的国际化支持**：
   - 嵌套key翻译系统（`t()`函数）
   - 多属性支持（`data-i18n`, `data-i18n-tooltip`, `data-i18n-aria`）
   - 自动DOM更新和跨窗口同步

**需要全新实现的功能**：
1. **右键菜单核心组件**：
   - contextmenu事件的处理逻辑
   - 右键菜单的HTML结构设计
   - 位置计算算法（适配鼠标右下角显示）

2. **菜单项交互逻辑**：
   - 复制文件路径的具体实现（可复用现有 `copyFilePathToClipboard` 函数）
   - 菜单项的点击事件处理
   - 操作后的状态反馈（可复用现有 Toast 系统）

**技术实现路径**：

**Phase 1: 基础结构**
```javascript
// 扩展现有的下拉菜单CSS类
.context-menu {
  position: fixed;  // 使用fixed定位，跟随鼠标
  // 复用 .client-dropdown__panel 的所有其他样式
}

// 复用现有的状态管理模式
const state = {
  ...existingState,
  contextMenuOpen: false,
  contextMenuTarget: null,
};
```

**Phase 2: 事件处理**
```javascript
// 复用现有的事件委托模式
const handleContextMenu = (event) => {
  const target = event.target.closest('#configFileDropdownLabel');
  if (!target) return;

  event.preventDefault(); // 阻止浏览器默认右键菜单
  showContextMenu(event.clientX, event.clientY, target.textContent);
};

// 复用现有的外部点击关闭机制
const handleDocumentClickForContextMenu = (event) => {
  if (!state.contextMenuOpen) return;
  // 复用 handleDocumentClickForDropdown 的逻辑
};
```

**Phase 3: 剪贴板集成**
```javascript
// 复用现有的 copyFilePathToClipboard 函数 (dist/js/main.js:1212)
const copyFilePathToClipboard = async (filePath) => {
  try {
    await navigator.clipboard.writeText(filePath);
    showToast(t('contextMenu.copySuccess'), 'success');
  } catch (error) {
    console.error('Clipboard copy failed:', error);
    showToast(t('contextMenu.copyFailed'), 'error');
  }
};
```

**Phase 4: 国际化集成**
```javascript
// 添加新的翻译key
const contextMenuTranslations = {
  'contextMenu.copyPath': 'Copy File Path',
  'contextMenu.copySuccess': 'File path copied to clipboard',
  'contextMenu.copyFailed': 'Failed to copy file path',
};
```

**设计考虑**：
1. **位置计算**：右键菜单应出现在鼠标右下方，避免超出视口边界
2. **事件冲突**：需要与现有的tooltip系统协调，避免同时显示
3. **键盘支持**：右键菜单应支持键盘导航（ESC关闭，方向键选择）
4. **性能优化**：复用现有的事件监听器，避免重复绑定
5. **无障碍支持**：添加适当的ARIA属性和屏幕阅读器支持

### attention

**技术实现风险**：
1. **事件冲突处理**：右键菜单需要阻止浏览器默认的contextmenu事件，同时避免与现有的tooltip系统产生冲突
   - 现有的tooltip系统使用`mouseenter`/`mouseleave`事件，与contextmenu事件基本无冲突
   - 需要在显示右键菜单时隐藏当前显示的tooltip

2. **剪贴板权限限制**：
   - 现代浏览器要求HTTPS或localhost环境才能使用剪贴板API
   - **技术决策**：项目已选择浏览器原生 API 方案，无需 Tauri 插件依赖
   - 仍需实现fallback机制（如：document.execCommand('copy')作为最后备选）

3. **定位算法复杂性**：
   - 现有下拉菜单使用`top: calc(100% + 0.5rem)`相对于触发元素定位
   - 右键菜单需要使用`position: fixed`和绝对坐标（event.clientX, event.clientY）
   - 需要完整的边界检测逻辑，避免菜单超出视口

**架构集成挑战**：
4. **状态管理扩展**：
   - 现有的state对象需要扩展：`contextMenuOpen`, `contextMenuTarget`, `contextMenuPosition`
   - 需要考虑右键菜单与其他弹出组件（tooltip、下拉菜单）的互斥显示逻辑

5. **CSS样式复用限制**：
   - 现有的`.client-dropdown__panel`使用`position: absolute`，右键菜单需要`position: fixed`
   - 需要创建新的CSS类`.context-menu`但复用颜色、边框、阴影等样式属性
   - 暗色主题适配可以完全复用现有的变量系统

**性能和用户体验**：
6. **事件监听器管理**：
   - 右键菜单需要在document级别添加contextmenu事件监听器
   - 需要避免与现有的配置文件下拉菜单事件监听器冲突
   - 考虑使用事件委托模式，避免直接绑定到动态元素

7. **无障碍支持要求**：
   - 右键菜单应支持键盘导航（Tab, Enter, ESC, 方向键）
   - 需要添加适当的ARIA属性：`role="menu"`, `aria-hidden`, `aria-activedescendant`
   - 屏幕阅读器支持：菜单项应使用`role="menuitem"`

8. **国际化文本扩展**：
   - 需要在现有的翻译文件中添加右键菜单相关条目
   - 支持中英文双语：英文"Copy File Path"，中文"复制文件路径"
   - 成功/失败提示文本也需要国际化

**测试和兼容性**：
9. **浏览器兼容性**：
   - `navigator.clipboard.writeText()`在较老浏览器中不支持
   - `event.composedPath()`在某些情况下不可用，已有兼容性处理代码可复用
   - CSS变量在IE11中不支持，但项目主要面向现代浏览器

10. **环境兼容性考虑**：
    - **技术决策**：项目统一使用浏览器原生 `navigator.clipboard.writeText()` API
    - 无需针对 Tauri 环境实现特殊的剪贴板处理
    - 降低了技术复杂度和依赖管理负担

**推荐实现优先级**：
1. **高优先级**：基础右键菜单显示/隐藏逻辑
2. **中优先级**：剪贴板复制功能和Toast反馈
3. **低优先级**：键盘导航和高级无障碍支持

这样可以确保核心功能快速实现，用户体验逐步完善。