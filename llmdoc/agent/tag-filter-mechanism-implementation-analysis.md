# 标签过滤机制完整实现分析

## Code Sections

- `dist/js/main.js:5~12` (State Management): 应用状态中的 `selectedTags` 数组存储用户选中标签

- `dist/js/main.js:385~394` (Toggle Logic): `toggleTagFilter()` 实现标签选中/取消，触发重新渲染

- `dist/js/main.js:414~445` (Render Function): `renderTagFilter()` 渲染标签按钮，支持 active 类和禁用状态

- `dist/js/main.js:641~651` (Tags Extraction): `getAllTags()` 从所有提示词收集标签并按汉语拼音排序

- `dist/js/main.js:653~659` (Auto Tags): `getAutoTags()` 返回当前客户端的自动标签

- `dist/js/main.js:661~665` (Active Tags): `getActiveTags()` 合并自动标签和用户选中标签，去重返回

- `dist/js/main.js:633~639` (Filter Logic): `getFilteredPrompts()` 用 AND 逻辑过滤：提示词需包含所有激活标签

- `dist/js/main.js:447~466` (List Rendering): `renderPromptList()` 渲染过滤后的提示词列表

- `dist/js/main.js:332~347` (Client Switching): `switchClient()` 切换客户端时清空 `selectedTags`

- `dist/index.html:55` (HTML Container): `id="tagFilter"` 容器在提示词区头部，flex 布局右对齐

- `dist/css/main.css:205~242` (Tag Button Styles): 标签按钮的基础样式、hover 状态、active 状态、禁用状态

## Report

### Conclusions

1. **状态管理**: `state.selectedTags` 是内存中的字符串数组，无持久化。每次切换客户端自动重置为空

2. **标签收集**: `getAllTags()` 使用 `Set` 去重，支持跨客户端标签统一收集。仅包含 `tag?.trim()` 非空的标签

3. **过滤逻辑**: 多标签 AND 过滤 - 提示词必须包含所有激活标签（自动 + 用户选中）才会显示

4. **自动标签**: 客户端若设置 `auto_tag=true`，其 ID 自动激活，对应按钮禁用且不可点击，强制应用过滤

5. **渲染流程**: 用户点击标签 → `toggleTagFilter()` 更新状态 → `renderTagFilter()` 更新按钮外观 → `renderPromptList()` 更新列表内容

6. **DOM 更新**: 每次渲染都清空容器（`innerHTML = ""`）并重新创建所有按钮，无差异更新

### Relations

- `toggleTagFilter(tag)` 修改 `state.selectedTags`，同时调用两个渲染函数
- `renderTagFilter()` 调用 `getAllTags()` 和 `getAutoTags()` 确定按钮状态
- `renderPromptList()` 调用 `getActiveTags()` 和 `getFilteredPrompts()` 执行过滤
- `switchClient()` 重置 `selectedTags` 并调用三个渲染函数
- CSS 类 `.tag-filter-btn.active` 样式定义在 `main.css` 第 228-232 行

### Result

完整工作流：
1. 初始化加载提示词到 `state.prompts`
2. `renderTagFilter()` 渲染所有可用标签按钮，标记 active/disabled 状态
3. 用户点击标签按钮 → `toggleTagFilter()` 更新 `selectedTags` → 重新渲染按钮和列表
4. `getFilteredPrompts()` 返回包含所有激活标签的提示词
5. 切换客户端时完全重置标签选择

关键特性：多标签 AND 过滤、自动标签强制应用、按字典序排序、状态仅内存维护

### Attention

1. **状态持久化缺失**: `selectedTags` 无 localStorage，页面刷新丢失（与 `splitRatio` 对比）
2. **性能成本**: `renderTagFilter()` 每次清空重建所有按钮元素
3. **自动标签混淆**: UI 仅通过禁用区分，用户可能不理解其含义
4. **样式硬编码**: JS 中硬编码类名 `"tag-filter-btn"`、`"active"` 与 CSS 耦合
5. **边界情况**: 空字符串标签检查在 `getAllTags()` 但不在 `getFilteredPrompts()` 中
