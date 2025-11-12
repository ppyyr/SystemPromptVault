# 提示词追加功能实现调查

## 研究问题

1. appendPrompt函数的完整实现代码是什么?在哪个文件的哪一行?
2. 当前是如何向编辑器追加内容的?直接操作textarea还是使用Monaco API?
3. 如何判断当前是编辑模式还是预览模式?(state.editorMode的值)
4. 追加操作后是如何保存配置文件的?调用了什么函数?
5. 是否有applyPrompt函数?它的实现方式与appendPrompt有何不同?
6. 配置编辑器(configEditor)是什么类型的元素?是Monaco实例还是textarea?

## Code Sections

### appendPrompt 函数完整实现

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:1335-1349` (appendPrompt函数): 提示词追加到编辑器的完整实现

```javascript
const appendPrompt = async (promptId) => {
  const prompt = state.prompts.find((item) => item.id === promptId);
  if (!prompt) {
    showToast("未找到提示词", "error");
    return;
  }
  const currentValue = getEditorContent();
  const needsSpacer = currentValue.trim().length > 0;
  const nextValue = `${currentValue}${needsSpacer ? "\n\n" : ""}${prompt.content ?? ""}`;
  setEditorContent(nextValue);
  const saved = await saveConfigFile({ silent: true });
  if (saved) {
    showToast(`已追加提示词「${prompt.name}」`, "success");
  }
};
```

### applyPrompt 函数完整实现

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:1322-1333` (applyPrompt函数): 提示词替换编辑器内容的完整实现

```javascript
const applyPrompt = async (promptId) => {
  const prompt = state.prompts.find((item) => item.id === promptId);
  if (!prompt) {
    showToast("未找到提示词", "error");
    return;
  }
  setEditorContent(prompt.content ?? "");
  const saved = await saveConfigFile({ silent: true });
  if (saved) {
    showToast(`已应用提示词「${prompt.name}」`, "success");
  }
};
```

### 编辑器内容操作函数

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:542-550` (getEditorContent函数): 获取编辑器内容的统一接口

```javascript
const getEditorContent = () => {
  if (state.monacoEditor) {
    return state.monacoEditor.getValue();
  }
  if (elements.configEditor) {
    return elements.configEditor.value ?? "";
  }
  return state.configContent ?? "";
};
```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:561-574` (setEditorContent函数): 设置编辑器内容的统一接口

```javascript
const setEditorContent = (value) => {
  const nextValue = value ?? "";
  state.configContent = nextValue;
  if (state.monacoEditor && state.monacoEditor.getValue() !== nextValue) {
    runWithEditorSyncSuppressed(() => {
      state.monacoEditor.setValue(nextValue);
    });
  } else if (elements.configEditor) {
    elements.configEditor.value = nextValue;
  }
  if (state.editorMode === "preview") {
    renderMarkdownPreview();
  }
};
```

### 编辑器模式状态管理

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:27` (state对象): 编辑器模式状态定义

```javascript
const state = {
  editorMode: "edit",  // "edit" 或 "preview"
  monacoEditor: null,
  // ...其他状态
};
```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:180` (Monaco容器元素): Monaco编辑器容器元素引用

```javascript
elements.monacoEditorContainer = document.getElementById("monacoEditorContainer");
```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:513-517` (Monaco编辑器创建): Monaco编辑器实例创建

```javascript
state.monacoEditor = monacoInstance.editor.create(elements.monacoEditorContainer, {
  value: state.configContent ?? "",
  language: "markdown",
  theme: currentTheme === "dark" ? "vs-dark" : "vs-light",
  wordWrap: "on",
  minimap: { enabled: false },
  automaticLayout: false,
  scrollBeyondLastLine: false,
});
```

### 配置文件保存函数

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:1251-1279` (saveConfigFile函数): 保存配置文件的核心实现

```javascript
const saveConfigFile = async ({ silent = false, createSnapshot = false } = {}) => {
  if (!state.currentClientId) return false;
  const content = getEditorContent();
  state.configContent = content;
  try {
    state.isSavingInternally = true;
    await withLoading(async () => {
      await ConfigFileAPI.write(state.currentClientId, state.configContent);
    });
    setTimeout(() => {
      state.isSavingInternally = false;
    }, 1000);
    state.editorDirty = false;
    if (!silent) {
      showToast("配置已保存", "success");
    }
    // ...快照创建逻辑
    return true;
  } catch (error) {
    showToast("保存失败", "error");
    return false;
  }
};
```

## Report

### 结论

1. **appendPrompt函数位置**: 完整实现位于 `dist/js/main.js:1335-1349` 行

2. **编辑器操作方式**: 使用统一的编辑器操作接口，支持Monaco API和textarea两种方式:
   - Monaco模式: `monacoEditor.getValue()` 和 `monacoEditor.setValue()`
   - Textarea模式: `configEditor.value` 直接赋值
   - 自动检测: 优先使用 `state.monacoEditor` 实例

3. **编辑器模式判断**: 通过 `state.editorMode` 值判断:
   - `"edit"`: 编辑模式 (默认)
   - `"preview"`: 预览模式

4. **配置文件保存**: 调用 `saveConfigFile({ silent: true })` 函数:
   - 获取当前编辑器内容
   - 调用 `ConfigFileAPI.write()` 写入文件
   - 设置 `editorDirty = false` 标记
   - 显示成功/失败提示

5. **applyPrompt函数差异**:
   - `applyPrompt`: 完全替换编辑器内容 (`setEditorContent(prompt.content)`)
   - `appendPrompt`: 在现有内容后追加 (`添加换行符 + prompt.content`)

6. **配置编辑器类型**: 动态适配，支持两种类型:
   - Monaco编辑器实例: `state.monacoEditor` (主要方式)
   - 备用textarea: `elements.configEditor` (降级方式)

### 关系

1. **函数调用关系**:
   - `appendPrompt()` → `getEditorContent()` → `setEditorContent()` → `saveConfigFile()`
   - `applyPrompt()` → `setEditorContent()` → `saveConfigFile()`

2. **编辑器适配关系**:
   - `getEditorContent()` 和 `setEditorContent()` 提供统一接口
   - 自动检测使用 Monaco API 或 textarea 操作

3. **状态管理关系**:
   - `state.editorMode` 控制编辑器显示模式
   - `state.monacoEditor` 存储Monaco实例引用
   - `state.configContent` 同步编辑器内容

### 结果

当前系统使用双层编辑器架构: Monaco编辑器作为主要编辑器，textarea作为备用选择。appendPrompt函数通过统一接口操作编辑器，在文件末尾追加提示词内容。系统区分编辑模式("edit")和预览模式("preview")，并在追加操作后自动保存配置文件。applyPrompt和appendPrompt的主要区别在于前者替换全部内容，后者在现有内容后追加。

### 注意事项

1. **当前追加位置**: appendPrompt总是在文件末尾追加，不支持光标位置插入
2. **编辑器切换**: Monaco编辑器和textarea之间的切换机制需要进一步了解
3. **模式影响**: 追加操作在预览模式下会触发markdown重新渲染
4. **保存机制**: 使用 `silent: true` 参数避免重复的用户提示
5. **错误处理**: 函数包含完整的错误处理和用户反馈机制