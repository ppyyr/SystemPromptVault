# Monaco Editor 在原生 JavaScript 环境中的加载与集成技术方案

## 1. Purpose

本文档详细研究 Monaco Editor 在 SystemPromptVault 项目(Tauri v2 + 原生 JavaScript)中的具体加载方式、配置选项、性能优化策略以及与现有架构的深度集成方案。

## 2. Code Sections

### 2.1 Monaco Editor CDN 加载实现

- **CDN 加载脚本方案**: 基于 jsDelivr CDN 的 Monaco Editor 加载
  ```javascript
  // Monaco Editor 加载函数
  function loadMonacoEditor() {
    return new Promise((resolve, reject) => {
      // 检查是否已加载
      if (window.monaco) {
        resolve(window.monaco);
        return;
      }

      // 创建 Monaco Editor 所需的 script 标签
      const scripts = [
        'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js',
        'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/editor/editor.main.js'
      ];

      let loadedCount = 0;

      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
          loadedCount++;
          if (loadedCount === scripts.length) {
            // 配置 Monaco Editor 基础路径
            require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
            require(['vs/editor/editor.main'], () => {
              resolve(window.monaco);
            });
          }
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    });
  }
  ```

### 2.2 Monaco Editor 容器准备与初始化

- **HTML 容器结构**: 在 dist/index.html 中替换现有 textarea
  ```html
  <!-- 替换原有的 textarea 元素 -->
  <div id="monacoEditorContainer" class="w-full flex-1 border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden" style="height: 400px; min-height: 300px;">
    <!-- Monaco Editor 将在此处渲染 -->
  </div>
  ```

- **编辑器初始化逻辑**: 扩展现有的 syncEditor 函数
  ```javascript
  let monacoEditor = null;

  const syncEditor = async () => {
    if (!monacoEditor) {
      // 首次初始化 Monaco Editor
      try {
        await loadMonacoEditor();
        const container = document.getElementById('monacoEditorContainer');
        if (container) {
          monacoEditor = monaco.editor.create(container, {
            value: state.configContent,
            language: 'markdown',
            theme: getCurrentMonacoTheme(),
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 14,
            fontFamily: '"Fira Code", "JetBrains Mono", Consolas, "Courier New", monospace',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true }
          });

          // 监听内容变化
          monacoEditor.onDidChangeModelContent((e) => {
            state.configContent = monacoEditor.getValue();
          });
        }
      } catch (error) {
        console.error('Monaco Editor 初始化失败:', error);
        // 降级到 textarea
        fallbackToTextarea();
      }
    } else {
      // 更新现有编辑器内容
      monacoEditor.setValue(state.configContent);
    }
    updateEditorAvailability();
    updateConfigFileName();
  };
  ```

### 2.3 主题系统集成方案

- **Monaco 主题配置**: 与现有主题系统深度集成
  ```javascript
  function getCurrentMonacoTheme() {
    const currentTheme = getCurrentTheme();
    return currentTheme === THEME_DARK ? 'vs-dark' : 'vs';
  }

  function updateMonacoTheme() {
    if (monacoEditor) {
      const newTheme = getCurrentMonacoTheme();
      monaco.editor.setTheme(newTheme);
    }
  }

  // 扩展现有的主题切换逻辑
  const originalToggleTheme = toggleTheme;
  export function toggleTheme() {
    const result = originalToggleTheme();
    updateMonacoTheme();
    return result;
  }

  // 监听主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    setTimeout(updateMonacoTheme, 100); // 延迟执行确保 DOM 更新完成
  });
  ```

- **自定义主题配置**: 匹配项目的暗色主题配色
  ```javascript
  function defineCustomThemes() {
    if (!window.monaco) return;

    // 定义匹配项目配色的暗色主题
    monaco.editor.defineTheme('systemprompt-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a737d' },
        { token: 'keyword', foreground: 'f97583' },
        { token: 'string', foreground: '9ecbff' },
        { token: 'number', foreground: '79b8ff' }
      ],
      colors: {
        'editor.background': '#0f0f0f',
        'editor.foreground': '#e8e8e8',
        'editor.lineHighlightBackground': '#1a1a1a',
        'editorCursor.foreground': '#5b9fff',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3a3a'
      }
    });

    // 定义匹配项目配色的亮色主题
    monaco.editor.defineTheme('systemprompt-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a737d' },
        { token: 'keyword', foreground: 'd73a49' },
        { token: 'string', foreground: '032f62' },
        { token: 'number', foreground: '005cc5' }
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#24292e',
        'editor.lineHighlightBackground': '#f6f8fa',
        'editorCursor.foreground': '#044289',
        'editor.selectionBackground': '#0366d6',
        'editor.inactiveSelectionBackground': '#f6f8fa'
      }
    });
  }

  // 在 Monaco 加载完成后定义自定义主题
  loadMonacoEditor().then(() => {
    defineCustomThemes();
    // 更新主题映射
    function getCurrentMonacoTheme() {
      const currentTheme = getCurrentTheme();
      return currentTheme === THEME_DARK ? 'systemprompt-dark' : 'systemprompt-light';
    }
  });
  ```

### 2.4 搜索替换功能实现

- **内置搜索功能启用**: Monaco Editor 内置搜索替换功能
  ```javascript
  // 在编辑器初始化时启用搜索功能
  monacoEditor = monaco.editor.create(container, {
    value: state.configContent,
    language: 'markdown',
    theme: getCurrentMonacoTheme(),
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    fontSize: 14,
    fontFamily: '"Fira Code", "JetBrains Mono", Consolas, "Courier New", monospace',
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    // 启用搜索快捷键
    find: {
      addExtraSpaceOnTop: false,
      autoFindInSelection: 'never',
      seedSearchStringFromSelection: 'always'
    }
  });

  // 添加搜索快捷键支持
  monacoEditor.addAction({
    id: 'find-action',
    label: '查找',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
    run: function(ed) {
      ed.trigger('keyboard', 'actions.find');
    }
  });

  monacoEditor.addAction({
    id: 'replace-action',
    label: '替换',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH],
    run: function(ed) {
      ed.trigger('keyboard', 'actions.replace');
    }
  });
  ```

- **搜索配置自定义**: 配置搜索选项和行为
  ```javascript
  function configureSearchOptions() {
    if (!monacoEditor) return;

    // 设置搜索选项
    const searchOptions = {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      preserveCase: true
    };

    // 监听搜索状态变化
    monacoEditor.onDidChangeModelContent(() => {
      // 内容变化时保持搜索状态
    });
  }
  ```

### 2.5 状态同步与保存机制

- **内容变化监听**: 与现有状态管理系统集成
  ```javascript
  // 替换原有的 input 事件监听
  elements.configEditor?.addEventListener("input", (event) => {
    state.configContent = event.target.value;
  });

  // 新的 Monaco Editor 内容变化监听
  let saveTimeout = null;
  monacoEditor.onDidChangeModelContent((e) => {
    state.configContent = monacoEditor.getValue();

    // 防抖保存机制(可选)
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveConfigFile({ silent: true });
    }, 2000); // 2秒后自动保存
  });
  ```

- **保存逻辑适配**: 修改保存函数以支持 Monaco Editor
  ```javascript
  const saveConfigFile = async ({ silent = false } = {}) => {
    if (!state.currentClientId) return false;

    // 确保获取最新的编辑器内容
    if (monacoEditor) {
      state.configContent = monacoEditor.getValue();
    }

    try {
      await withLoading(async () => {
        await ConfigFileAPI.write(state.currentClientId, state.configContent);
      });
      if (!silent) {
        showToast("配置已保存", "success");
      }
      return true;
    } catch (error) {
      showToast(getErrorMessage(error) || "保存配置失败", "error");
      return false;
    }
  };
  ```

### 2.6 性能优化与错误处理

- **加载性能优化**: 异步加载和错误降级
  ```javascript
  let monacoLoadPromise = null;

  async function ensureMonacoLoaded() {
    if (monacoLoadPromise) {
      return monacoLoadPromise;
    }

    monacoLoadPromise = loadMonacoEditor().catch(error => {
      console.error('Monaco Editor 加载失败:', error);
      showToast('编辑器加载失败，使用基础模式', 'warning');
      throw error;
    });

    return monacoLoadPromise;
  }

  // 降级方案
  function fallbackToTextarea() {
    const container = document.getElementById('monacoEditorContainer');
    if (container) {
      container.innerHTML = `
        <textarea id="configEditor" class="w-full h-full border-0 bg-transparent p-4 font-mono text-sm resize-none outline-none" placeholder="在此编辑选中客户端的配置文件">${state.configContent}</textarea>
      `;
      // 重新绑定原始事件
      const textarea = document.getElementById('configEditor');
      textarea.addEventListener('input', (e) => {
        state.configContent = e.target.value;
      });
    }
  }
  ```

- **内存管理**: 正确的编辑器销毁和重建
  ```javascript
  function destroyMonacoEditor() {
    if (monacoEditor) {
      monacoEditor.dispose();
      monacoEditor = null;
    }
  }

  // 在客户端切换时重新初始化
  const originalSwitchClient = switchClient;
  async function switchClient(clientId) {
    if (clientId === state.currentClientId) return;

    // 销毁当前编辑器实例
    destroyMonacoEditor();

    // 执行原有的客户端切换逻辑
    await originalSwitchClient(clientId);

    // 重新初始化编辑器
    await syncEditor();
  }
  ```

## 3. Report

### 3.1 conclusions

1. **CDN 加载可行性**: Monaco Editor 可通过 jsDelivr CDN 完整加载，无需构建工具，适合 Tauri 原生 JavaScript 环境
2. **主题深度集成**: 通过 defineTheme API 可创建匹配项目配色的自定义主题，与现有主题系统无缝集成
3. **功能完备性**: Monaco Editor 内置搜索替换、语法高亮、代码补全等功能，显著提升编辑体验
4. **性能可控**: 通过异步加载、错误降级和内存管理机制，确保编辑器性能和稳定性
5. **状态兼容性**: 通过 onDidChangeModelContent 事件可完美集成现有的状态管理和保存机制

### 3.2 relations

1. **loadMonacoEditor() ↔ syncEditor()**: Monaco 加载完成后才能初始化编辑器，需要异步处理
2. **getCurrentTheme() ↔ updateMonacoTheme()**: 主题变化时需要同步更新 Monaco Editor 主题配置
3. **onDidChangeModelContent ↔ state.configContent**: 内容变化监听替代原有的 input 事件，保持状态同步
4. **switchClient() ↔ destroyMonacoEditor()**: 客户端切换时需要销毁旧编辑器实例，避免内存泄漏
5. **saveConfigFile() ↔ monacoEditor.getValue()**: 保存时需要确保获取最新编辑器内容

### 3.3 result

1. **CDN 加载方案**: 使用 jsDelivr CDN 加载 Monaco Editor，通过 Promise 和异步初始化确保可靠性
2. **自定义主题**: 创建 'systemprompt-dark' 和 'systemprompt-light' 主题，匹配项目现有的深蓝色配色方案
3. **搜索功能**: 利用内置 Find Widget (Ctrl+F) 和 Replace Widget (Ctrl+H)，无需额外开发
4. **错误降级**: 加载失败时自动降级到 textarea 模式，确保基础功能可用
5. **性能优化**: 通过防抖保存、内存管理和异步加载优化用户体验

### 3.4 attention

1. **网络依赖**: CDN 加载需要网络连接，离线环境下需要预加载方案或本地资源
2. **加载时间**: Monaco Editor 首次加载约 1-2MB，需要显示加载状态避免用户困惑
3. **主题差异**: 自定义主题可能无法完全匹配项目 CSS 变量系统，需要视觉调优
4. **快捷键冲突**: Monaco Editor 的快捷键可能与浏览器或 Tauri 系统快捷键冲突，需要测试和调整
5. **响应式适配**: 在小屏幕设备上需要确保 Monaco Editor 正确响应和布局调整
6. **Tauri 权限**: 可能需要在 tauri.conf.json 中配置网络权限以允许 CDN 资源加载