# UI 下拉菜单组件设计参考指南

## Code Sections

- `tailwind.config.js:1~38` (Tailwind Config): 项目配置了 `darkMode: 'class'`，主题扩展定义了颜色、字体、圆角、阴影

- `dist/css/main.css:1~34` (CSS Variables): 完整的主题变量系统（两套：亮色根节点和 `.dark` 暗色），包含颜色、阴影、圆角

- `dist/css/main.css:374~401` (Tooltip Pattern): 浮动容器设计参考，使用 `position: fixed`、`z-index: 1900`、`backdrop-filter: blur`、`box-shadow`

- `dist/css/main.css:697~732` (Modal Pattern): 浮层对话框设计参考，展示背景遮罩、居中布局、边框、阴影、暗色主题支持

- `dist/css/components.css:5~60` (Button System): 基础按钮样式系统，定义了 `.btn`、`.btn-primary`、`.btn-secondary` 及其变体和禁用状态

- `dist/css/main.css:205~242` (Tag Filter Buttons): 现有标签按钮实现，提供 active/disabled 状态参考

- `dist/js/main.js:30~58` (Debounce Pattern): 防抖机制实现，用于 UI 操作的延迟处理，包含取消功能

- `dist/js/theme.js:1~56` (Theme System): 完整的主题切换实现，支持系统主题检测、localStorage 持久化、实时切换

- `dist/js/main.js:530~546` (Hover Handler): 悬停事件处理模式，展示如何管理交互状态和防抖调度

- `dist/css/main.css:1123~1174` (Responsive Design): 响应式断点（1080px、768px）和对应的布局调整规则

## Report

### Conclusions

1. **CSS 架构混合模式**: Tailwind CSS（原子类）+ 自定义 CSS（组件级）。CSS 变量系统使用 custom properties 实现主题切换，支持亮色/暗色双主题

2. **下拉菜单不存在**: 项目中无任何下拉菜单、select、menu 组件实现。需要参考现有模式设计新组件

3. **可复用的浮动容器模式**:
   - Tooltip: `position: fixed` + `z-index: 1900` + 视口边界检测 + 防抖显示/隐藏
   - Modal: `position: fixed` + 全屏遮罩 + 居中布局 + `z-index: 1800`

4. **主题系统**:
   - HTML 预加载主题类到 `<html>` 元素，防止闪烁
   - CSS 通过 `:root` 和 `.dark` 选择器定义双套变量
   - JS 通过 `applyTheme()` 操作类名，`localStorage` 存储用户选择
   - Tailwind 使用 `darkMode: 'class'` 模式，支持 `dark:` 前缀响应式类

5. **按钮和交互元素**:
   - 基础按钮：inline-flex、圆形边框（`border-radius: 999px`）、0.15s 过渡、禁用状态处理
   - 标签按钮：border + active 高亮样式、禁用时 opacity 降低

6. **响应式设计**: Flexbox/Grid 布局，断点在 1080px（桌面/平板分界）和 768px（平板/手机分界）。关键容器在小屏幕时改为全宽或堆叠

7. **无第三方组件库**: 项目完全自定义实现，无依赖 Bootstrap、Material Design 等库

### Relations

- `tailwind.config.js` 的 `colors`、`fontFamily`、`boxShadow` 配置被 HTML 中的 Tailwind 类引用
- `main.css` 的 CSS 变量与 Tailwind 配置的颜色值一致（`--color-primary: #0066cc`）
- `theme.js` 的 `applyTheme()` 操作 `document.documentElement.classList`，与 `output.css` 的 `.dark` 选择器配套
- Tooltip 和 Modal 的 `position: fixed` + `z-index` 设计可直接用于下拉菜单
- 防抖模式可复用于菜单的打开/关闭延迟

### Result

**下拉菜单设计建议**:

1. **状态管理**: 创建状态对象（如 `dropdownState = { isOpen: false, activeIndex: -1 }`）
2. **DOM 结构**: 触发按钮 + 浮动菜单容器，菜单使用 `position: fixed` 定位
3. **样式**: 继承 CSS 变量系统，在 `main.css` 中定义 `.dropdown`、`.dropdown-menu`、`.dropdown-item` 等类，添加 `.dark .dropdown-*` 对应暗色样式
4. **交互**:
   - 点击按钮切换菜单打开/关闭
   - 点击菜单项执行回调
   - 点击外部区域关闭菜单
   - 支持键盘导航（↑↓ 选择，Enter 确认，Esc 关闭）
5. **响应式**: 小屏幕时改为全屏弹出或侧滑菜单，参考现有布局适配
6. **无障碍**: 添加 `role="listbox"`、`aria-expanded`、`aria-label` 等 ARIA 属性

**Z-index 规划**: 菜单应设为 1700~1799（低于 Tooltip 1900 和 Modal 1800，高于内容）

### Attention

1. **Z-index 冲突**: 项目分散定义 z-index（1500、1800、1900、2000），下拉菜单需小心选择
2. **Tailwind 原子类与自定义样式混用**: 新组件需保持一致的设计语言
3. **CSS 变量不完整**: 部分 RGBA 颜色在暗色模式中硬编码，系统性不够强
4. **字体兼容性**: SF Pro Display 等 macOS 字体在其他平台可能无法加载（已有后备字体）
5. **无现成下拉菜单**: 需要完全自实现，可参考 WAI-ARIA 标准的 Listbox 或 Menu 模式
