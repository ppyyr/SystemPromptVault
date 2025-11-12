# Monaco编辑器集成深度调查

## 1. 调查目标

分析SystemPromptVault项目中Monaco编辑器的初始化、配置和API使用方式，为实现在光标位置追加提示词并支持Undo/Redo功能提供技术依据。

## 2. Code Sections

### Monaco编辑器初始化和配置

- `dist/js/main.js:503-540` (`initMonacoEditor`): Monaco编辑器初始化函数

  ```javascript
  const initMonacoEditor = async () => {
    if (state.monacoEditor || elements.configEditor) {
      return;
    }
    if (!elements.monacoEditorContainer) {
      return;
    }
    try {
      const monacoInstance = await ensureMonacoLoaded();
      defineMonacoThemes(monacoInstance);
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
      state.monacoEditor.onDidChangeModelContent(() => {
        state.configContent = state.monacoEditor.getValue();
        if (state.editorMode === "preview") {
          renderMarkdownPreview();
        }
        handleEditorChange();
      });
      updateMonacoTheme();
      updateEditorAvailability();
    } catch (error) {
      console.error("Monaco Editor 初始化失败", error);
      attachFallbackEditor();
    }
  };
  ```

- `dist/js/main.js:17-35` (state对象): 编辑器实例存储位置

  ```javascript
  const state = {
    // ... 其他状态
    monacoEditor: null,
    // ... 其他状态
  };
  ```

- `dist/js/main.js:172-190` (`cacheElements`): DOM元素缓存，包含Monaco容器

  ```javascript
  const cacheElements = () => {
    // ... 其他元素
    elements.monacoEditorContainer = document.getElementById("monacoEditorContainer");
    // ... 其他元素
  };
  ```

- `dist/index.html:89-95` (Monaco容器HTML): Monaco编辑器容器DOM结构

  ```html
  <div class="config-editor-shell flex-1">
    <div
      id="monacoEditorContainer"
      class="monaco-editor-container"
      role="region"
      aria-label="配置文件编辑器"
    ></div>
    <!-- ... 预览容器 -->
  </div>
  ```

### 当前文本操作API

- `dist/js/main.js:542-550` (`getEditorContent`): 获取编辑器内容

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

- `dist/js/main.js:561-574` (`setEditorContent`): 设置编辑器全部内容

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

### 现有提示词应用和追加操作

- `dist/js/main.js:1322-1333` (`applyPrompt`): 应用提示词（替换全部内容）

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

- `dist/js/main.js:1335-1349` (`appendPrompt`): 追加提示词（在末尾添加）

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

### 编辑器实例管理

- `dist/js/main.js:468-473` (`disposeMonacoEditor`): 销毁编辑器实例

  ```javascript
  const disposeMonacoEditor = () => {
    if (state.monacoEditor) {
      state.monacoEditor.dispose();
      state.monacoEditor = null;
    }
  };
  ```

- `dist/js/main.js:1874-1882` (`updateEditorAvailability`): 更新编辑器只读状态

  ```javascript
  const updateEditorAvailability = () => {
    const hasClient = Boolean(getCurrentClient());
    if (state.monacoEditor) {
      state.monacoEditor.updateOptions({ readOnly: !hasClient });
    }
    if (elements.configEditor) {
      elements.configEditor.disabled = !hasClient;
    }
    if (elements.btnSaveConfig) {
      elements.btnSaveConfig.disabled = !hasClient;
    }
  };
  ```

## 3. Report

### conclusions

- Monaco编辑器实例存储在`state.monacoEditor`中，通过`monacoInstance.editor.create()`初始化
- 当前仅使用基础的`getValue()`和`setValue()`API进行内容操作
- 现有的`appendPrompt`功能是在文档末尾追加内容，而非光标位置插入
- 编辑器配置支持Markdown语法高亮、自动换行、括号配对着色等高级功能
- 存在完整的内容同步机制和状态管理逻辑

### relations

- `state.monacoEditor` ↔ `elements.monacoEditorContainer`: 实例与容器的对应关系
- `getEditorContent()`/`setEditorContent()` ↔ `state.monacoEditor.getValue()/setValue()`: 内容操作封装层
- `appendPrompt()` → `setEditorContent()`: 当前追加操作通过全量替换实现
- `onDidChangeModelContent` → `handleEditorChange()`: 内容变化事件处理链

### result

**Monaco编辑器关键API使用现状：**

1. **初始化位置**：`dist/js/main.js:513`行，使用`monacoInstance.editor.create(elements.monacoEditorContainer, config)`
2. **实例访问**：通过全局状态`state.monacoEditor`访问编辑器实例
3. **内容操作**：当前仅使用`getValue()`和`setValue()`进行全量内容操作
4. **缺失API**：未发现使用`getPosition()`、`setPosition()`、`insertText()`、`undo()`、`redo()`等精确操作API

**光标位置插入和Undo/Redo所需的Monaco API：**

- `state.monacoEditor.getPosition()`: 获取当前光标位置
- `state.monacoEditor.setPosition(position)`: 设置光标位置
- `state.monacoEditor.getModel().applyEdits(operations)`: 在指定位置插入文本
- `state.monacoEditor.trigger()`: 触发编辑器操作（包括undo/redo）
- `state.monacoEditor.getModel().pushEditOperations()`: 支持Undo/Redo的文本编辑

**实现路径：**
需要扩展现有的`appendPrompt`函数，添加新的`insertPromptAtCursor`函数，使用Monaco的精确编辑API实现在光标位置插入内容并支持撤销重做。

### attention

- 当前编辑器配置禁用了minimap和滚动超最后一行，这可能会影响光标位置的用户体验
- 存在fallback编辑器机制，需要在Monaco加载失败时仍能正常工作
- 编辑器内容变化会触发`handleEditorChange()`，需要确保新操作不破坏现有的事件处理逻辑
- `runWithEditorSyncSuppressed()`机制用于避免循环更新，在实现新功能时需要正确使用