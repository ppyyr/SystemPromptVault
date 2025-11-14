# 客户端管理导入导出UI交互模式调研

## 1. Purpose

调研 SystemPromptVault 项目中现有的UI交互模式，重点关注对话框、确认框、Toast通知系统以及冲突处理的实现方式，为客户端管理tab实现导入导出功能提供技术参考和最佳实践指导。

## 2. How it Works

### 2.1 现有对话框系统架构

项目实现了完整的模态对话框和确认框系统，包含三个核心组件：

#### 2.1.1 模态对话框（Modal Dialog）

**用途**: 复杂表单编辑（新建/编辑提示词、客户端）

```html
<!-- 模态对话框结构 -->
<div id="modalPrompt" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="modalPromptTitle">
  <div class="modal-content">
    <div class="modal-header">
      <h3 id="modalPromptTitle">Modal Title</h3>
      <button data-close-modal="modalPrompt">&times;</button>
    </div>
    <form class="modal-form">
      <!-- 表单内容 -->
    </form>
  </div>
</div>
```

**核心逻辑** (`dist/js/settings.js:2319-2322`):
```javascript
const toggleModal = (modal, visible) => {
  if (!modal) return;
  modal.classList.toggle("hidden", !visible);
  modal.setAttribute("aria-hidden", String(!visible));
};
```

#### 2.1.2 确认框（Confirm Dialog）

**用途**: 危险操作确认（删除提示词、客户端、快照）

**实现** (`dist/js/utils.js:159-199`):
```javascript
export const showConfirm = (message) =>
  new Promise((resolve) => {
    const overlay = ensureConfirmOverlay();
    const messageNode = overlay.querySelector(".confirm-message");
    messageNode.textContent = message;
    overlay.classList.remove("hidden");

    const cleanup = (result) => {
      overlay.classList.add("hidden");
      // 清理事件监听器
      resolve(result);
    };

    const clickHandler = (event) => {
      const action = event.target.dataset.action;
      if (action === "confirm") {
        cleanup(true);
      } else if (action === "cancel" || target === overlay) {
        cleanup(false);
      }
    };
  });
```

**样式** (`dist/css/components.css:156-186`):
```css
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1800;
}

.confirm-dialog {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: min(420px, 90vw);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

#### 2.1.3 输入框（Prompt Dialog）

**用途**: 用户输入（重命名快照、快照命名）

**实现** (`dist/js/utils.js:201-261`):
```javascript
export const showPrompt = (message, defaultValue = "") =>
  new Promise((resolve) => {
    const overlay = ensurePromptOverlay();
    const inputNode = overlay.querySelector(".prompt-input");

    messageNode.textContent = message;
    inputNode.value = defaultValue;
    overlay.classList.remove("hidden");

    requestAnimationFrame(() => {
      inputNode.focus();
      inputNode.select();
    });

    // 处理确认/取消逻辑
  });
```

### 2.2 Toast通知系统

**用途**: 操作反馈、状态提示、错误信息

**实现** (`dist/js/utils.js:54-96`):
```javascript
export const showToast = (message, type = "success") => {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
  }, TOAST_DURATION - 400);

  setTimeout(() => {
    toast.remove();
  }, TOAST_DURATION);
};

export const showActionToast = (message, actionLabel, onAction) => {
  // 带操作按钮的Toast，支持用户交互
};
```

### 2.3 现有导入导出模式分析

#### 2.3.1 提示词导入导出流程

**导出功能** (`dist/js/settings.js:1620-1630`):
```javascript
const handleExportPrompts = async () => {
  try {
    const data = await PromptAPI.exportPrompts();
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prompts_backup_${formatExportTimestamp()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(t("toast.promptsExported", "Prompts exported"), "success");
  } catch (error) {
    showToast(/* 错误处理 */, "error");
  }
};
```

**导入功能** (`dist/js/settings.js:1633-1656`):
```javascript
const handleImportFileChange = async (event) => {
  const file = event.target?.files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    validateImportPayload(content);
    const importResult = await withLoading(async () => {
      const result = await PromptAPI.importPrompts(content);
      await loadPrompts();
      return result;
    });

    const { total = 0, added = 0, updated = 0 } = importResult || {};
    showToast(formatImportResultMessage(total, added, updated), "success");
  } catch (error) {
    showToast(/* 错误处理 */, "error");
  }
};
```

**结果处理** (`dist/js/settings.js:1658-1678`):
```javascript
const formatImportResultMessage = (total, added, updated) => {
  if (total === 0) {
    return t("toast.importNone", "No prompts were imported");
  }
  if (added === total) {
    return t("toast.importAllNew", "Imported {total} new prompts").replace("{total}", `${total}`);
  }
  if (added === 0) {
    return t("toast.importUpdatedOnly", "Updated {updated} prompts").replace("{updated}", `${updated}`);
  }
  return t("toast.importMixed", "Imported {total} prompts ({added} new, {updated} updated)")
    .replace("{total}", `${total}`)
    .replace("{added}", `${added}`)
    .replace("{updated}", `${updated}`);
};
```

#### 2.3.2 冲突处理分析

**当前模式**: 自动处理，无用户选择
- 新增：直接添加
- 冲突：自动更新（保持原创建时间）

**后端逻辑** (参考提示词导入):
```rust
// 提示词导入的冲突处理逻辑
match self.prompts.get(&prompt.id) {
    Some(existing) => {
        // 自动更新现有提示词，保持原创建时间
        let mut updated_prompt = prompt;
        updated_prompt.created_at = existing.created_at;
        self.prompts.insert(prompt.id.clone(), updated_prompt);
        result.updated += 1;
    }
    None => {
        // 添加新提示词
        self.prompts.insert(prompt.id.clone(), prompt);
        result.added += 1;
    }
}
```

### 2.4 客户端数据结构

**ClientConfig模型** (`src-tauri/src/models/client.rs:5-12`):
```rust
pub struct ClientConfig {
    pub id: String,                    // 客户端唯一标识
    pub name: String,                  // 显示名称
    pub config_file_paths: Vec<String>, // 配置文件路径列表
    pub active_config_path: Option<String>, // 当前激活路径
    pub auto_tag: bool,                // 自动标签
    pub is_builtin: bool,              // 是否内置
}
```

**冲突检测关键点**:
- `id`字段：唯一标识，冲突判断依据
- `is_builtin`字段：内置客户端不允许删除/覆盖

### 2.5 UI交互最佳实践

#### 2.5.1 无障碍支持

**ARIA属性使用**:
```html
<div role="dialog" aria-modal="true" aria-labelledby="modalTitle">
<button aria-label="Close modal" data-close-modal="modalId">
<button aria-expanded="false" aria-haspopup="listbox">
```

**键盘导航**:
- ESC键关闭对话框/确认框
- Enter键确认操作
- Tab键焦点管理

#### 2.5.2 事件处理模式

**事件委托**:
```javascript
// 全局事件委托处理动态元素
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-close-modal]");
  if (target) {
    const modalId = target.dataset.closeModal;
    closeModal(modalId);
  }
});
```

**覆盖层点击关闭**:
```javascript
const registerModalDismiss = (modal, handler) => {
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      handler(); // 点击遮罩层关闭
    }
  });
};
```

#### 2.5.3 样式一致性

**z-index层级**:
- 确认框: 1800
- Tooltip: 1500-1900
- 模态框: 基础层级

**主题适配**:
```css
.confirm-dialog {
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.dark .confirm-dialog {
  background: rgba(15, 23, 42, 0.9);
}
```

## 3. Relevant Code Modules

### 前端UI组件
- `dist/js/utils.js`: 核心对话框和Toast系统实现 (第54-262行)
- `dist/js/settings.js`: 模态框管理、导入导出逻辑 (第1594-1705行)
- `dist/css/components.css`: 对话框样式定义 (第156-186行)

### 后端数据模型
- `src-tauri/src/models/client.rs`: ClientConfig数据结构 (第5-197行)
- `src-tauri/src/commands/client.rs`: 客户端CRUD操作 (第32-56行)

### 导入导出参考实现
- `dist/js/settings.js`: 提示词导入导出完整流程 (第1620-1678行)
- `src-tauri/src/commands/prompt.rs`: 后端导入处理逻辑参考

## 4. Attention

### 现有系统的技术限制

1. **冲突处理缺乏用户选择**: 当前导入功能自动处理冲突，无"跳过/更新"选项
2. **确认框功能单一**: showConfirm只支持确认/取消，不支持自定义按钮文本
3. **Toast持续时间固定**: 3.6秒可能不适合复杂操作的反馈

### 客户端导入的特殊考虑

1. **内置客户端保护**: `is_builtin: true`的客户端不允许覆盖删除
2. **ID唯一性**: 客户端ID冲突检测和用户选择机制
3. **路径验证**: 配置文件路径的有效性检查
4. **向后兼容**: 支持旧版单路径格式的数据迁移

### 推荐的改进方案

1. **扩展确认框系统**: 支持自定义按钮和选项列表
2. **冲突解决对话框**: 专门的冲突处理界面，显示冲突项列表
3. **批量操作支持**: 支持用户选择性导入/更新特定客户端
4. **预览功能**: 导入前显示将要操作的客户端列表

### 实现建议

基于现有架构，客户端导入导出功能应该：

1. **复用Toast系统**: 提供操作反馈和状态提示
2. **扩展确认框**: 实现冲突选择的自定义对话框
3. **参考提示词导入**: 沿用文件处理和验证流程
4. **增强安全性**: 严格的客户端数据验证和权限检查

这样的设计既保持了与现有系统的一致性，又满足了客户端管理的特殊需求。