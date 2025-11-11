# 设置页面提示词管理表格实现详细调查

## 1. Purpose

本文档详细调查设置页面提示词管理功能的实现，包括表格结构、操作按钮、编辑模式触发机制以及如何添加复制功能的实现方案。

## 2. How it Works

### 2.1 HTML 表格结构

设置页面的提示词管理表格位于 `dist/settings.html` 第 141-167 行：

```html
<section class="flex flex-col gap-4" id="tabPrompts" role="tabpanel" aria-labelledby="settingsDropdownToggle">
  <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
    <table class="w-full border-collapse">
      <thead>
        <tr>
          <th class="px-4 py-3 text-left text-sm font-semibold text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600">名称</th>
          <th class="px-4 py-3 text-left text-sm font-semibold text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600">标签</th>
          <th class="px-4 py-3 text-left text-sm font-semibold text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600">创建时间</th>
          <th class="px-4 py-3 text-right text-sm font-semibold text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600 w-[180px]">操作</th>
        </tr>
      </thead>
      <tbody id="promptTable" class="bg-white dark:bg-gray-800 [&>tr]:border-b [&>tr]:border-gray-200 [&>tr]:dark:border-gray-700 [&>tr:hover]:bg-gray-50 dark:[&>tr:hover]:bg-gray-700">
        <!-- 空状态行 -->
        <tr id="emptyState" class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <td colspan="4" class="px-4 py-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800">
            <div class="flex flex-col items-center gap-2">
              <svg class="w-12 h-12 text-gray-300 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <p class="text-base font-medium text-gray-600 dark:text-gray-300">暂无提示词</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">点击"新建提示词"开始创建</p>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</section>
```

### 2.2 表格渲染逻辑

表格数据渲染位于 `dist/js/settings.js` 第 337-431 行的 `renderPromptTable()` 函数：

```javascript
const renderPromptTable = () => {
  const tbody = elements.promptTable;
  if (!tbody) return;

  // 隐藏或显示空状态
  if (elements.emptyStatePrompt) {
    if (state.prompts.length === 0) {
      elements.emptyStatePrompt.classList.remove("hidden");
    } else {
      elements.emptyStatePrompt.classList.add("hidden");
    }
  }

  // 清除除空状态行之外的所有行
  const rows = Array.from(tbody.querySelectorAll("tr")).filter(
    (row) => row.id !== "emptyState"
  );
  rows.forEach((row) => row.remove());

  if (!state.prompts.length) {
    return;
  }

  // 按创建时间排序（最新的在前）
  const sorted = [...state.prompts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  sorted.forEach((prompt) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-gray-50 dark:hover:bg-gray-700";

    // 名称单元格
    const nameCell = document.createElement("td");
    nameCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    nameCell.textContent = prompt.name;

    // 标签单元格
    const tagCell = document.createElement("td");
    tagCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    if (prompt.tags?.length) {
      const group = document.createElement("div");
      group.className = "flex flex-wrap gap-2";
      prompt.tags.forEach((tag) => {
        const badge = document.createElement("span");
        badge.className = "inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-primary-50 dark:bg-primary/20 border border-transparent dark:border-primary/30";
        badge.style.color = "var(--color-muted)";
        badge.textContent = tag;
        group.appendChild(badge);
      });
      tagCell.appendChild(group);
    } else {
      tagCell.textContent = "—";
    }

    // 时间单元格
    const timeCell = document.createElement("td");
    timeCell.className = "px-4 py-3 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700";
    timeCell.textContent = formatDateTime(prompt.created_at);

    // 操作单元格
    const actionCell = document.createElement("td");
    actionCell.className = "px-4 py-3 text-sm text-right border-b border-gray-200 dark:border-gray-700";
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "flex items-center justify-end gap-2";

    // 添加操作按钮到 actionsDiv
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    actionCell.appendChild(actionsDiv);

    row.appendChild(nameCell);
    row.appendChild(tagCell);
    row.appendChild(timeCell);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  });
};
```

### 2.3 操作按钮实现

#### 2.3.1 编辑按钮（第 397-407 行）

```javascript
const editBtn = document.createElement("button");
editBtn.type = "button";
editBtn.className = "btn-icon btn-icon-primary";
editBtn.setAttribute("aria-label", "编辑提示词");
editBtn.setAttribute("data-tooltip", "编辑");
editBtn.innerHTML = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
  </svg>
`;
editBtn.addEventListener("click", () => showPromptModal(prompt.id));
```

#### 2.3.2 删除按钮（第 409-419 行）

```javascript
const deleteBtn = document.createElement("button");
deleteBtn.type = "button";
deleteBtn.className = "btn-icon btn-icon-primary";
deleteBtn.setAttribute("aria-label", "删除提示词");
deleteBtn.setAttribute("data-tooltip", "删除");
deleteBtn.innerHTML = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
  </svg>
`;
deleteBtn.addEventListener("click", () => deletePrompt(prompt.id));
```

### 2.4 编辑模式触发机制

#### 2.4.1 模态框显示函数（第 594-610 行）

```javascript
const showPromptModal = (promptId = null) => {
  if (!elements.modalPrompt) return;
  state.editingPromptId = promptId;
  elements.modalPromptTitle.textContent = promptId ? "编辑提示词" : "新建提示词";
  elements.formPrompt?.reset();
  if (promptId) {
    const prompt = state.prompts.find((item) => item.id === promptId);
    if (!prompt) {
      showToast("未找到提示词", "error");
      return;
    }
    // 填充表单数据
    elements.inputPromptName.value = prompt.name;
    elements.inputPromptTags.value = prompt.tags?.join(", ") ?? "";
    elements.inputPromptContent.value = prompt.content;
  }
  toggleModal(elements.modalPrompt, true);
};
```

#### 2.4.2 编辑模态框 HTML 结构（第 306-350 行）

```html
<div id="modalPrompt" class="fixed inset-0 z-[1800] flex items-center justify-center bg-black/45 hidden" role="dialog" aria-modal="true">
  <div class="bg-white dark:bg-gray-800 rounded-lg p-5 w-full max-w-[520px] shadow-xl flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3">
      <h3 id="modalPromptTitle" class="text-lg font-semibold text-gray-900 dark:text-white">新建提示词</h3>
      <button type="button" class="text-2xl leading-none text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-transparent border-none cursor-pointer" data-close-modal="modalPrompt">&times;</button>
    </div>
    <form id="formPrompt" class="flex flex-col gap-4" novalidate>
      <label class="flex flex-col gap-2 font-semibold text-gray-900 dark:text-gray-200">
        <span>名称</span>
        <input type="text" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" id="inputPromptName" placeholder="输入提示词名称" required />
      </label>
      <label class="flex flex-col gap-2 font-semibold text-gray-900 dark:text-gray-200">
        <span>标签（用逗号或空格分隔）</span>
        <input type="text" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" id="inputPromptTags" placeholder="如：claude, system" list="tagSuggestions" />
      </label>
      <label class="flex flex-col gap-2 font-semibold text-gray-900 dark:text-gray-200">
        <span>内容</span>
        <textarea id="inputPromptContent" rows="8" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y min-h-[160px] font-mono text-sm" placeholder="输入提示词内容" required></textarea>
      </label>
      <div class="flex justify-end gap-3">
        <button type="button" class="bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2 font-semibold hover:border-primary hover:text-primary dark:hover:border-primary dark:hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-200" data-close-modal="modalPrompt">取消</button>
        <button type="submit" class="bg-primary text-white px-4 py-2 rounded-md font-semibold hover:bg-primary-dark transition-colors">保存</button>
      </div>
    </form>
  </div>
</div>
```

### 2.5 表单提交处理（第 647-670 行）

```javascript
const handlePromptSubmit = async (event) => {
  event.preventDefault();
  const name = elements.inputPromptName.value.trim();
  const content = elements.inputPromptContent.value.trim();
  if (!name || !content) {
    showToast("名称和内容不能为空", "warning");
    return;
  }
  const tags = parseTags(elements.inputPromptTags.value);
  try {
    await withLoading(async () => {
      if (state.editingPromptId) {
        await PromptAPI.update(state.editingPromptId, name, content, tags);
      } else {
        await PromptAPI.create(name, content, tags);
      }
      await loadPrompts();
    });
    showToast(state.editingPromptId ? "提示词已更新" : "提示词已创建", "success");
    closePromptModal();
  } catch (error) {
    showToast(getErrorMessage(error) || "保存提示词失败", "error");
  }
};
```

### 2.6 API 接口定义

`dist/js/api.js` 第 12-21 行定义了提示词相关的 API：

```javascript
export const PromptAPI = {
  getAll: () => call("get_all_prompts"),
  getById: (id) => call("get_prompt_by_id", { id }),
  getByTags: (tags) => call("get_prompts_by_tags", { tags }),
  create: (name, content, tags) => call("create_prompt", { name, content, tags }),
  update: (id, name, content, tags) => call("update_prompt", { id, name, content, tags }),
  delete: (id) => call("delete_prompt", { id }),
  exportPrompts: () => call("export_prompts"),
  importPrompts: (jsonData) => call("import_prompts", { jsonData }),
};
```

## 3. Relevant Code Sections

- `dist/settings.html:141-167`: 提示词管理表格 HTML 结构
- `dist/js/settings.js:337-431`: `renderPromptTable()` 函数，负责渲染表格数据
- `dist/js/settings.js:397-419`: 编辑和删除按钮的创建和事件绑定
- `dist/js/settings.js:594-610`: `showPromptModal()` 函数，处理编辑模式触发
- `dist/js/settings.js:647-670`: `handlePromptSubmit()` 函数，处理表单提交
- `dist/settings.html:306-350`: 编辑模态框的 HTML 结构
- `dist/js/api.js:12-21`: PromptAPI 接口定义

## 4. 复制功能实现方案

### 4.1 复制按钮插入位置

要添加复制按钮，应该在 `dist/js/settings.js` 第 421 行的位置插入，即在编辑和删除按钮之间：

```javascript
// 当前代码（第 421-423 行）
actionsDiv.appendChild(editBtn);
actionsDiv.appendChild(deleteBtn);

// 修改后
actionsDiv.appendChild(editBtn);
actionsDiv.appendChild(copyBtn);  // 新增复制按钮
actionsDiv.appendChild(deleteBtn);
```

### 4.2 复制按钮实现代码

在第 419 行后添加复制按钮的创建代码：

```javascript
// 复制按钮
const copyBtn = document.createElement("button");
copyBtn.type = "button";
copyBtn.className = "btn-icon btn-icon-primary";
copyBtn.setAttribute("aria-label", "复制提示词");
copyBtn.setAttribute("data-tooltip", "复制");
copyBtn.innerHTML = `
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
  </svg>
`;
copyBtn.addEventListener("click", () => copyPrompt(prompt.id, prompt.name, prompt.content));
```

### 4.3 复制功能实现函数

在文件末尾添加复制功能处理函数：

```javascript
const copyPrompt = async (promptId, promptName, promptContent) => {
  try {
    await navigator.clipboard.writeText(promptContent);
    showToast(`提示词「${promptName}」已复制到剪贴板`, "success");
  } catch (error) {
    // 降级方案：使用传统的 textarea 复制方法
    const textArea = document.createElement("textarea");
    textArea.value = promptContent;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(`提示词「${promptName}」已复制到剪贴板`, "success");
    } catch (fallbackError) {
      showToast("复制失败，请手动复制", "error");
    } finally {
      document.body.removeChild(textArea);
    }
  }
};
```

### 4.4 需要的 API 调用

复制功能不需要额外的 API 调用，因为提示词内容已经在表格数据中获取。但如果需要从后端重新获取数据，可以使用现有的 `PromptAPI.getById(id)` 接口。

## 5. 注意事项

### 5.1 样式一致性

复制按钮应使用与现有按钮相同的样式类：
- `btn-icon btn-icon-primary` 用于基础样式
- `data-tooltip` 属性用于悬停提示
- SVG 图标使用相同的尺寸和样式

### 5.2 无障碍支持

- 设置正确的 `aria-label` 属性
- 确保键盘导航支持
- 提供清晰的操作反馈

### 5.3 错误处理

- 现代浏览器使用 `navigator.clipboard.writeText()`
- 提供降级方案支持旧浏览器
- 显示明确的成功/失败提示

### 5.4 用户体验

- 复制操作应该是即时的，不需要加载状态
- 复制后显示成功提示，包含提示词名称
- 如果复制失败，提供明确的错误信息和可能的解决方案