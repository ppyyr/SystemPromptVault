# 提示词搜索功能过滤逻辑调研报告

## 1. Purpose

本文档深入调研设置页面现有的提示词过滤逻辑、状态管理机制和防抖实现，为在标签筛选器前方添加提示词搜索栏提供技术分析和实现方案。

## 2. Code Sections

### 2.1 现有过滤逻辑实现

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:1538~1548` (getFilteredPrompts 函数): 当前基于标签的过滤逻辑实现

```javascript
const getFilteredPrompts = () => {
  if (!state.selectedTags.length) {
    return [...state.prompts];
  }
  return state.prompts.filter((prompt) => {
    const promptTags = Array.isArray(prompt.tags) ? prompt.tags : [];
    if (!promptTags.length) {
      return false;
    }
    return state.selectedTags.some((tag) => promptTags.includes(tag));
  });
};
```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:1410~1460` (renderPromptTable 函数): 提示词表格渲染函数

```javascript
const renderPromptTable = () => {
  const tbody = elements.promptTable;
  if (!tbody) return;
  // ... 空状态处理
  const filteredPrompts = getFilteredPrompts();
  if (!filteredPrompts.length) {
    appendEmptyRow(tbody, 4, t("settings.promptFilterEmpty", "No prompts match selected tags"));
    return;
  }
  const sorted = [...filteredPrompts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  sorted.forEach((prompt) => {
    const row = document.createElement("tr");
    // ... 渲染逻辑
  });
};
```

### 2.2 状态管理结构

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:62~82` (state 对象): 核心状态管理对象

```javascript
const state = {
  prompts: [],
  clients: [],
  selectedTags: [],
  recentTags: [],
  tagDropdownOpen: false,
  tagSearchQuery: "",
  editingPromptId: null,
  // ... 其他状态字段
};
```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:819~822` (handleTagSearchInput 函数): 标签搜索输入处理

```javascript
const handleTagSearchInput = (event) => {
  state.tagSearchQuery = event?.target?.value ?? "";
  renderTagFilter();
};
```

### 2.3 防抖函数实现

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:209~227` (createDebounced 函数): 项目已有的防抖函数实现

```javascript
const createDebounced = (fn, delay) => {
  let timerId = null;
  const debounced = (...args) => {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = window.setTimeout(() => {
      timerId = null;
      fn(...args);
    }, delay);
  };
  debounced.cancel = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };
  return debounced;
};
```

### 2.4 提示词数据结构

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/api.js:11~20` (PromptAPI): 提示词API定义

```javascript
export const PromptAPI = {
  getAll: () => call("get_all_prompts"),
  getById: (id) => call("get_prompt_by_id", { id }),
  getByTags: (tags) => call("get_prompts_by_tags", { tags }),
  create: (name, content, tags) => call("create_prompt", { name, content, tags }),
  update: (id, name, content, tags) => call("update_prompt", { id, name, content, tags }),
  delete: (id) => call("delete_prompt", { id }),
};
```

### 2.5 标签搜索UI结构

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/settings.html:229~241` (现有标签搜索框): 标签下拉菜单中的搜索框结构

```html
<div class="tag-dropdown__search flex items-center gap-2">
  <label for="tagDropdownSearchSettings" class="sr-only" data-i18n="tags.searchLabel">Search Tags</label>
  <input
    type="text"
    id="tagDropdownSearchSettings"
    class="tag-dropdown__search-input flex-1"
    placeholder="Search tags..."
    data-i18n-placeholder="tags.searchPlaceholder"
    autocomplete="off"
    spellcheck="false"
    aria-label="Search Tags"
    data-i18n-aria="tags.searchLabel"
  />
</div>
```

## 3. Report

### conclusions

> 过滤逻辑分析结果

- 当前过滤逻辑使用 OR 逻辑匹配标签（`state.selectedTags.some()`），与需求文档描述的 AND 逻辑不一致
- 状态管理采用集中式 state 对象，包含 `prompts`、`selectedTags`、`tagSearchQuery` 等关键字段
- 项目已有完整的防抖函数实现 `createDebounced`，已在 tooltip 系统中使用
- 提示词数据结构包含 `id`、`name`、`content`、`tags`、`created_at` 等字段
- 渲染流程为：`getFilteredPrompts()` → `renderPromptTable()` → DOM 更新

> 技术实现要点

- 需要在 state 中新增 `promptSearchQuery` 字段管理搜索关键词
- 需要改造 `getFilteredPrompts()` 函数支持搜索与标签的 OR 逻辑组合
- 需要使用 300ms 防抖优化搜索性能
- 搜索需要在提示词的 `name` 和 `content` 字段中进行匹配

### relations

> 文件与函数关系

- `dist/js/settings.js`: 主要的状态管理和过滤逻辑文件
  - `state` 对象：管理全局状态
  - `getFilteredPrompts()`: 核心过滤逻辑
  - `renderPromptTable()`: UI 渲染函数
  - `handleTagSearchInput()`: 标签搜索输入处理

- `dist/js/main.js`: 提供 `createDebounced()` 防抖函数工具

- `dist/settings.html`: 包含现有的标签筛选器UI结构，需要在标签筛选器前方添加搜索栏

- `dist/js/api.js`: 提供提示词相关的后端API调用

### result

> 实现方案分析

**状态管理扩展**：
```javascript
// 需要在 state 对象中添加
const state = {
  // 现有字段...
  promptSearchQuery: "", // 新增：提示词搜索关键词
  promptSearchDebounced: null, // 新增：防抖函数引用
};
```

**过滤逻辑改造**：
```javascript
const getFilteredPrompts = () => {
  const hasSearchQuery = Boolean(state.promptSearchQuery?.trim());
  const hasSelectedTags = Boolean(state.selectedTags.length);

  // 无筛选条件时返回全部
  if (!hasSearchQuery && !hasSelectedTags) {
    return [...state.prompts];
  }

  return state.prompts.filter((prompt) => {
    const searchMatch = hasSearchQuery ?
      (prompt.name?.toLowerCase().includes(state.promptSearchQuery.toLowerCase()) ||
       prompt.content?.toLowerCase().includes(state.promptSearchQuery.toLowerCase())) :
      true;

    const tagMatch = hasSelectedTags ?
      (state.selectedTags.some((tag) => prompt.tags?.includes(tag))) :
      true;

    // OR 逻辑：搜索或标签任一匹配即可
    return searchMatch && tagMatch;
  });
};
```

**防抖搜索处理**：
```javascript
// 在初始化时创建防抖函数
const debouncedPromptSearch = createDebounced(() => {
  renderPromptTable();
}, 300);

const handlePromptSearchInput = (event) => {
  state.promptSearchQuery = event?.target?.value ?? "";
  debouncedPromptSearch();
};
```

### attention

> 潜在问题和注意事项

- **过滤逻辑差异**：当前代码使用 OR 逻辑匹配标签，与需求文档描述的 AND 逻辑不一致，需要确认业务逻辑
- **搜索性能**：对 `content` 字段进行搜索可能影响性能，但 300ms 防抖可以缓解
- **搜索范围**：需要确认是否要搜索 HTML 内容（如果 content 包含 HTML）
- **状态同步**：搜索栏与标签筛选器的状态需要独立管理
- **国际化支持**：搜索栏的 placeholder 和 label 需要支持多语言
- **无障碍支持**：需要添加适当的 ARIA 属性和键盘导航支持
- **UI 布局**：在标签筛选器前方添加搜索栏可能需要调整 CSS 布局
- **清空功能**：建议为搜索栏添加清空按钮，提升用户体验