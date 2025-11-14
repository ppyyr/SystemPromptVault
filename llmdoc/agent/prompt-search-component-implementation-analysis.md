# 提示词搜索组件完整实现分析

## Code Sections

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/settings.html:159~183` (HTML结构): 提示词搜索框的完整DOM结构

  ```html
  <div class="prompt-search" id="promptSearch">
    <svg class="w-4 h-4 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35m1.6-4.15a6 6 0 11-12 0 6 6 0 0112 0z" />
    </svg>
    <label class="sr-only" for="inputPromptSearch" data-i18n="prompts.searchLabel">Search prompts</label>
    <input type="text" id="inputPromptSearch" class="prompt-search__input" placeholder="Search by name or content" data-i18n-placeholder="prompts.searchPlaceholder" autocomplete="off" spellcheck="false" aria-label="Search prompts" data-i18n-aria="prompts.searchLabel" />
  </div>
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/css/main.css:588~623` (CSS样式): .prompt-search相关样式定义

  ```css
  .prompt-search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 12px;
    border-radius: var(--radius-md, 10px);
    border: 1px solid var(--color-border);
    background: rgba(15, 23, 42, 0.02);
    width: 200px;
    flex-shrink: 1;
    min-width: 150px;
  }

  .dark .prompt-search {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(148, 163, 184, 0.3);
  }

  .prompt-search__input {
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--color-text);
    font-size: 0.95rem;
  }

  .prompt-search__input::placeholder {
    color: var(--color-muted);
  }

  .prompt-search__input:focus {
    outline: none;
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:8~9` (常量定义): 防抖延迟设置

  ```javascript
  const PROMPT_SEARCH_DEBOUNCE = 300;
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:80` (状态管理): 搜索查询状态存储

  ```javascript
  const state = {
    promptSearchQuery: "",
    // ...
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:63~74` (防抖函数): 通用防抖函数实现

  ```javascript
  const debounce = (fn, delay = 300) => {
    let timerId = null;
    return (...args) => {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        timerId = null;
        fn(...args);
      }, delay);
    };
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:342~361` (搜索处理): 搜索输入处理逻辑

  ```javascript
  const sanitizePromptSearchValue = (value) => (typeof value === "string" ? value : "");

  const applyPromptSearchQuery = (value) => {
    const sanitized = sanitizePromptSearchValue(value);
    if (elements.promptSearchInput && elements.promptSearchInput.value !== sanitized) {
      elements.promptSearchInput.value = sanitized;
    }
    if (state.promptSearchQuery === sanitized) {
      return;
    }
    state.promptSearchQuery = sanitized;
    renderPromptTable();
  };

  const debouncedPromptSearchChange = debounce(applyPromptSearchQuery, PROMPT_SEARCH_DEBOUNCE);

  const handlePromptSearchInput = (event) => {
    const value = event?.target?.value ?? "";
    debouncedPromptSearchChange(value);
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:1580~1605` (过滤逻辑): 提示词过滤算法实现

  ```javascript
  const getFilteredPrompts = () => {
    const searchQuery = state.promptSearchQuery?.trim().toLowerCase() ?? "";
    const hasSearch = searchQuery.length > 0;
    const hasTags = state.selectedTags.length > 0;

    if (!hasSearch && !hasTags) {
      return [...state.prompts];
    }

    return state.prompts.filter((prompt) => {
      const promptName = typeof prompt?.name === "string" ? prompt.name.toLowerCase() : "";
      const promptContent = typeof prompt?.content === "string" ? prompt.content.toLowerCase() : "";
      const promptTags = Array.isArray(prompt?.tags) ? prompt.tags : [];

      const matchesSearch =
        !hasSearch || promptName.includes(searchQuery) || promptContent.includes(searchQuery);

      const matchesTags = !hasTags || promptTags.some((tag) => state.selectedTags.includes(tag));

      return matchesSearch && matchesTags;
    });
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:370` (事件绑定): 搜索输入框事件监听

  ```javascript
  const bindEvents = () => {
    elements.promptSearchInput?.addEventListener("input", handlePromptSearchInput);
    // ...
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:301~304` (元素初始化): 搜索输入框元素缓存和状态同步

  ```javascript
  elements.promptSearchInput = document.getElementById("inputPromptSearch");
  if (elements.promptSearchInput) {
    elements.promptSearchInput.value = state.promptSearchQuery;
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/settings.html:316~319` (Tab切换容器): 搜索框所在的父容器

  ```html
  <div class="flex items-center gap-2 flex-nowrap" id="promptActions">
    <div class="prompt-search" id="promptSearch">
      <!-- 搜索框内容 -->
    </div>
    <!-- 其他操作按钮 -->
  </div>
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:3186~3188` (显示/隐藏逻辑): Tab切换时的可见性控制

  ```javascript
  if (elements.promptActions) {
    elements.promptActions.classList.toggle("hidden", targetId !== "tabPrompts");
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/locales/en.json:48~49` (国际化配置): 搜索相关文本

  ```json
  "prompts": {
    "searchLabel": "Search prompts",
    "searchPlaceholder": "Search by name or content"
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:1475` (渲染触发): 过滤后的提示词渲染调用

  ```javascript
  const filteredPrompts = getFilteredPrompts();
  if (!filteredPrompts.length) {
    appendEmptyRow(tbody, 4, t("settings.promptFilterEmpty", "No prompts match current filters"));
    return;
  }
  ```

## Report

### conclusions

- 提示词搜索功能采用防抖机制（300ms延迟）优化性能，避免频繁的过滤操作
- 搜索支持名称和内容的模糊匹配，使用不区分大小写的字符串包含算法
- 搜索框只在提示词管理tab中显示，其他tab时通过CSS隐藏整个操作栏
- 使用状态管理存储搜索查询，支持页面刷新后保持搜索状态
- 国际化支持完善，包含无障碍访问的aria-label和屏幕阅读器支持
- 搜索与标签过滤功能结合使用，支持复合条件筛选

### relations

- HTML结构 (`settings.html:159~183`) → CSS样式 (`main.css:588~623`)：DOM元素与样式定义关联
- 搜索输入框 (`inputPromptSearch`) → 事件处理器 (`handlePromptSearchInput`)：用户输入触发搜索逻辑
- 防抖函数 (`debounce`) → 搜索处理 (`applyPromptSearchQuery`)：性能优化机制
- 状态存储 (`state.promptSearchQuery`) → 过滤算法 (`getFilteredPrompts`)：数据驱动的过滤逻辑
- 过滤结果 (`getFilteredPrompts`) → 表格渲染 (`renderPromptTable`)：过滤后更新UI显示
- Tab切换逻辑 (`switchTab`) → 显示/隐藏控制：基于当前tab控制搜索框可见性
- 国际化配置 (`locales/*.json`) → DOM属性 (`data-i18n-*`)：多语言文本映射

### result

提示词搜索组件是一个完整的、性能优化的搜索实现，包含：
- 完整的HTML结构和响应式CSS样式
- 300ms防抖机制优化性能
- 支持名称和内容的模糊匹配搜索
- 与标签过滤功能的复合筛选
- 基于tab切换的智能显示/隐藏逻辑
- 完善的国际化支持和无障碍访问
- 状态管理保证搜索体验的连续性

### attention

- 搜索框在客户端管理、快照管理等其他tab中会隐藏（通过`promptActions`容器的`hidden`类控制）
- 搜索与标签过滤是联合作用的关系，需要同时满足两个条件才会显示结果
- 防抖机制确保在快速输入时不会触发过多的过滤操作，提升用户体验
- 搜索状态存储在`state.promptSearchQuery`中，支持页面刷新后的状态恢复
- 国际化文本通过`data-i18n-*`属性绑定，支持动态语言切换