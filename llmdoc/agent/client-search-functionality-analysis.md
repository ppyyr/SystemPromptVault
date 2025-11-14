# 客户端管理搜索功能实现分析

### Code Sections

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:76~98` (state对象搜索相关状态): 当前缺少客户端搜索状态

  ```javascript
  const state = {
    clients: [],                    // 客户端数据
    selectedTags: [],              // 标签筛选（仅用于提示词）
    promptSearchQuery: "",         // 提示词搜索查询
    // 缺少: clientSearchQuery: "",
    // 缺少: filteredClients: [],
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/settings.js:1550~1602` (filterPrompts函数): 提示词搜索筛选逻辑参考实现

  ```javascript
  const filterPrompts = () => {
    const searchLower = state.promptSearchQuery.toLowerCase().trim();
    const hasSearchQuery = searchLower.length > 0;
    const hasSelectedTags = state.selectedTags.length > 0;

    const filtered = state.prompts.filter((prompt) => {
      // 搜索匹配逻辑
      let matchesSearch = true;
      if (hasSearchQuery) {
        matchesSearch =
          prompt.name.toLowerCase().includes(searchLower) ||
          prompt.content.toLowerCase().includes(searchLower) ||
          (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(searchLower)));
      }

      // 标签匹配逻辑
      let matchesTags = true;
      if (hasSelectedTags) {
        matchesTags = state.selectedTags.every(selectedTag =>
          prompt.tags && prompt.tags.includes(selectedTag)
        );
      }

      // AND逻辑：同时满足搜索和标签条件
      return matchesSearch && matchesTags;
    });

    return filtered;
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/locales/en.json:21~28` (clients翻译key): 客户端相关国际化文本

  ```json
  "clients": {
    "header": "Clients",
    "listAria": "Client list",
    "selectClient": "Select Client",
    "noClientSelected": "No Client Selected",
    "editAction": "Edit client",
    "deleteAction": "Delete client"
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/locales/zh.json:21~28` (clients翻译key): 中文翻译对照

  ```json
  "clients": {
    "header": "客户端",
    "listAria": "客户端列表",
    "selectClient": "选择客户端",
    "noClientSelected": "未选择客户端",
    "editAction": "编辑客户端",
    "deleteAction": "删除客户端"
  }
  ```

### Report

#### conclusions

- 当前客户端管理缺少搜索功能，需要在state对象中添加clientSearchQuery和相关状态
- 提示词管理已有完整的搜索筛选实现(filterPrompts函数)，可作为客户端搜索功能的设计参考
- 客户端搜索需要覆盖id、name、config_file_paths等关键字段
- i18n翻译系统已具备clients相关的翻译key基础，但需要添加搜索相关的翻译条目
- 搜索功能应与现有的排序逻辑兼容，保持内置客户端优先排序

#### relations

- filterPrompts函数 → 客户端搜索功能实现：可复用搜索逻辑模式
- state.promptSearchQuery → state.clientSearchQuery：状态扩展模式参考
- 提示词搜索UI → 客户端搜索UI：界面交互模式一致性
- 现有排序逻辑 → 搜索结果排序：保持用户体验一致性
- i18n系统 → 搜索相关翻译：国际化支持扩展

#### result

客户端搜索功能需要从以下几个方面实现：

1. **状态管理扩展**：添加clientSearchQuery、filteredClients等状态
2. **搜索算法实现**：参考filterPrompts函数，实现多字段搜索(id/name/paths)
3. **UI组件添加**：搜索输入框和清空按钮
4. **翻译key扩展**：添加搜索相关的i18n条目
5. **渲染逻辑修改**：renderClientTable函数需要使用过滤后的数据

#### attention

- 搜索应该是实时进行，不需要用户点击搜索按钮
- 搜索应该忽略大小写，支持部分匹配
- 需要考虑搜索高亮显示（可选功能）
- 搜索结果应该保持现有的排序逻辑（内置优先+名称排序）
- 需要处理搜索空状态，显示"无搜索结果"的提示
- 搜索功能应该与现有的标签筛选功能保持交互模式一致