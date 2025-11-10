# Monaco Editor 与 Markdown 预览功能集成方案

## 1. Purpose

本文档研究在 SystemPromptVault 项目中为 Monaco Editor 添加 Markdown 预览功能的实现方案，包括 Markdown 渲染、双向滚动同步、预览主题适配以及与现有 UI 布局的集成策略。

## 2. Code Sections

### 2.1 Markdown 预览容器设计

- **HTML 结构扩展**: 在 configSection 中添加预览面板
  ```html
  <!-- 在 dist/index.html 的 configSection 中扩展 -->
  <section id="configSection" class="resizable-panel bg-white border border-gray-200 dark:border-gray-700 rounded-lg p-5 shadow-sm flex flex-col gap-4 min-h-[520px] w-full lg:flex-none" style="background: rgba(255, 255, 255, 0.95);">
    <style>
      .dark #configSection {
        background: rgba(15, 23, 42, 0.9) !important;
        border-color: rgba(148, 163, 184, 0.2) !important;
      }
    </style>

    <div class="flex items-center justify-between gap-3">
      <!-- 现有的客户端下拉和保存按钮 -->
      <div class="client-dropdown" id="clientDropdown">...</div>
      <div class="flex items-center gap-2">
        <span id="configFileName" class="text-sm text-gray-600 dark:text-gray-400">CLAUDE.md</span>
        <button id="btnTogglePreview" class="btn-icon btn-icon-secondary" type="button" aria-label="切换预览" data-tooltip="切换预览">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button class="btn-icon btn-icon-primary" id="btnSaveConfig" type="button" aria-label="保存" data-tooltip="保存">...</button>
      </div>
    </div>

    <!-- 编辑器和预览容器 -->
    <div id="editorPreviewContainer" class="flex-1 flex gap-4">
      <!-- Monaco Editor 容器 -->
      <div id="editorContainer" class="flex-1 min-w-0">
        <div id="monacoEditorContainer" class="w-full h-full border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
          <!-- Monaco Editor 将在此处渲染 -->
        </div>
      </div>

      <!-- 分割条 -->
      <div id="editorPreviewSplitter" class="w-1 bg-gray-300 dark:bg-gray-600 cursor-col-resize hover:bg-primary transition-colors duration-200 hidden">
        <div class="h-full w-2 flex items-center justify-center">
          <div class="w-1 h-8 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
        </div>
      </div>

      <!-- Markdown 预览容器 -->
      <div id="previewContainer" class="flex-1 min-w-0 hidden">
        <div id="markdownPreview" class="w-full h-full border border-gray-300 dark:border-gray-600 rounded-md overflow-auto bg-white dark:bg-gray-800 p-4">
          <div class="markdown-body prose prose-sm max-w-none dark:prose-invert">
            <!-- Markdown 内容将在此处渲染 -->
          </div>
        </div>
      </div>
    </div>
  </section>
  ```

### 2.2 Markdown 解析与渲染

- **Marked.js 集成**: 使用 marked 库进行 Markdown 解析
  ```javascript
  // Markdown 解析器加载
  function loadMarkedLibrary() {
    return new Promise((resolve, reject) => {
      if (window.marked) {
        resolve(window.marked);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/marked@9.1.2/marked.min.js';
      script.onload = () => {
        // 配置 marked 选项
        marked.setOptions({
          highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
              return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
          },
          langPrefix: 'hljs language-',
          breaks: true,
          gfm: true
        });
        resolve(window.marked);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Highlight.js 代码高亮加载
  function loadHighlightJS() {
    return new Promise((resolve, reject) => {
      if (window.hljs) {
        resolve(window.hljs);
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/ highlight.js@11.8.0/styles/github-dark.min.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/ highlight.js@11.8.0/lib/index.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  ```

- **Markdown 渲染逻辑**: 与 Monaco Editor 内容同步
  ```javascript
  let isPreviewVisible = false;
  let markdownRenderTimeout = null;

  function renderMarkdownPreview() {
    if (!isPreviewVisible || !monacoEditor) return;

    const content = monacoEditor.getValue();
    const previewContainer = document.querySelector('#markdownPreview .markdown-body');

    if (previewContainer) {
      clearTimeout(markdownRenderTimeout);
      markdownRenderTimeout = setTimeout(() => {
        try {
          const html = marked.parse(content);
          previewContainer.innerHTML = html;

          // 重新高亮代码块
          if (window.hljs) {
            previewContainer.querySelectorAll('pre code').forEach((block) => {
              hljs.highlightElement(block);
            });
          }
        } catch (error) {
          console.error('Markdown 渲染失败:', error);
          previewContainer.innerHTML = '<p class="text-red-500">Markdown 渲染失败</p>';
        }
      }, 300); // 300ms 防抖
    }
  }

  // 监听编辑器内容变化
  monacoEditor.onDidChangeModelContent(() => {
    state.configContent = monacoEditor.getValue();
    renderMarkdownPreview(); // 实时更新预览
  });
  ```

### 2.3 预览面板交互逻辑

- **预览切换功能**: 显示/隐藏预览面板
  ```javascript
  function toggleMarkdownPreview() {
    const editorContainer = document.getElementById('editorContainer');
    const previewContainer = document.getElementById('previewContainer');
    const splitter = document.getElementById('editorPreviewSplitter');
    const toggleBtn = document.getElementById('btnTogglePreview');

    isPreviewVisible = !isPreviewVisible;

    if (isPreviewVisible) {
      // 显示预览面板
      previewContainer.classList.remove('hidden');
      splitter.classList.remove('hidden');
      editorContainer.classList.add('lg:max-w-1/2');

      // 更新按钮状态
      toggleBtn.classList.add('bg-primary', 'text-white');
      toggleBtn.classList.remove('bg-white', 'text-gray-800');

      // 渲染 Markdown 内容
      renderMarkdownPreview();
    } else {
      // 隐藏预览面板
      previewContainer.classList.add('hidden');
      splitter.classList.add('hidden');
      editorContainer.classList.remove('lg:max-w-1/2');

      // 更新按钮状态
      toggleBtn.classList.remove('bg-primary', 'text-white');
      toggleBtn.classList.add('bg-white', 'text-gray-800');
    }

    // 触发 Monaco Editor 重新布局
    if (monacoEditor) {
      monacoEditor.layout();
    }
  }

  // 绑定切换按钮事件
  document.getElementById('btnTogglePreview')?.addEventListener('click', toggleMarkdownPreview);
  ```

- **分割条拖拽功能**: 调整编辑器和预览面板比例
  ```javascript
  function initEditorPreviewSplitter() {
    const container = document.getElementById('editorPreviewContainer');
    const splitter = document.getElementById('editorPreviewSplitter');
    const editorContainer = document.getElementById('editorContainer');
    const previewContainer = document.getElementById('previewContainer');

    if (!container || !splitter) return;

    let isDragging = false;

    const startDragging = (e) => {
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const stopDragging = () => {
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const drag = (e) => {
      if (!isDragging) return;

      const containerRect = container.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const percentage = (relativeX / containerRect.width) * 100;

      if (percentage > 20 && percentage < 80) {
        editorContainer.style.flex = `0 0 ${percentage}%`;
        previewContainer.style.flex = `0 0 ${100 - percentage}%`;

        // 触发 Monaco Editor 重新布局
        if (monacoEditor) {
          monacoEditor.layout();
        }
      }
    };

    splitter.addEventListener('mousedown', startDragging);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDragging);
  }
  ```

### 2.4 预览主题适配

- **Markdown 样式定义**: 匹配项目主题的 Markdown 样式
  ```css
  /* 在 dist/css/main.css 中添加 */
  .markdown-body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-text, #333);
    background-color: transparent;
  }

  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3,
  .markdown-body h4,
  .markdown-body h5,
  .markdown-body h6 {
    margin-top: 24px;
    margin-bottom: 16px;
    font-weight: 600;
    line-height: 1.25;
    color: var(--color-text, #333);
  }

  .markdown-body h1 {
    font-size: 2em;
    border-bottom: 1px solid var(--color-border, #e0e0e0);
    padding-bottom: 0.3em;
  }

  .markdown-body h2 {
    font-size: 1.5em;
    border-bottom: 1px solid var(--color-border, #e0e0e0);
    padding-bottom: 0.3em;
  }

  .markdown-body code {
    padding: 0.2em 0.4em;
    margin: 0;
    font-size: 85%;
    background-color: var(--color-bg-secondary, #f6f8fa);
    border-radius: 6px;
    font-family: "Fira Code", "JetBrains Mono", Consolas, monospace;
  }

  .markdown-body pre {
    padding: 16px;
    overflow: auto;
    font-size: 85%;
    line-height: 1.45;
    background-color: var(--color-surface, #f6f8fa);
    border-radius: 6px;
    border: 1px solid var(--color-border, #e0e0e0);
  }

  .markdown-body pre code {
    display: inline;
    max-width: auto;
    padding: 0;
    margin: 0;
    overflow: visible;
    line-height: inherit;
    word-wrap: normal;
    background-color: transparent;
    border: 0;
  }

  .markdown-body blockquote {
    padding: 0 1em;
    color: var(--color-muted, #666);
    border-left: 0.25em solid var(--color-border, #e0e0e0);
    margin: 0 0 16px 0;
  }

  .markdown-body table {
    border-spacing: 0;
    border-collapse: collapse;
    margin: 16px 0;
    width: 100%;
  }

  .markdown-body table th,
  .markdown-body table td {
    padding: 6px 13px;
    border: 1px solid var(--color-border, #e0e0e0);
  }

  .markdown-body table tr {
    background-color: var(--color-surface, #ffffff);
    border-top: 1px solid var(--color-border, #e0e0e0);
  }

  /* 暗色主题适配 */
  .dark .markdown-body {
    color: var(--color-text, #e8e8e8);
  }

  .dark .markdown-body h1,
  .dark .markdown-body h2,
  .dark .markdown-body h3,
  .dark .markdown-body h4,
  .dark .markdown-body h5,
  .dark .markdown-body h6 {
    color: var(--color-text, #e8e8e8);
    border-bottom-color: var(--color-border, #2a2a2a);
  }

  .dark .markdown-body code {
    background-color: var(--color-surface, #1a1a1a);
  }

  .dark .markdown-body pre {
    background-color: var(--color-surface, #1a1a1a);
    border-color: var(--color-border, #2a2a2a);
  }

  .dark .markdown-body blockquote {
    color: var(--color-muted, #888);
    border-left-color: var(--color-border, #2a2a2a);
  }

  .dark .markdown-body table th,
  .dark .markdown-body table td {
    border-color: var(--color-border, #2a2a2a);
  }

  .dark .markdown-body table tr {
    background-color: var(--color-surface, #1a1a1a);
    border-top-color: var(--color-border, #2a2a2a);
  }
  ```

- **代码高亮主题切换**: 根据当前主题切换代码高亮样式
  ```javascript
  function updateCodeHighlightTheme() {
    const isDark = getCurrentTheme() === THEME_DARK;
    const highlightStylesheet = document.querySelector('link[href*="highlight.js"]');

    if (highlightStylesheet) {
      const newTheme = isDark ?
        'https://cdn.jsdelivr.net/npm/ highlight.js@11.8.0/styles/github-dark.min.css' :
        'https://cdn.jsdelivr.net/npm/ highlight.js@11.8.0/styles/github.min.css';

      highlightStylesheet.href = newTheme;
    }
  }

  // 在主题切换时更新代码高亮
  const originalToggleTheme = toggleTheme;
  export function toggleTheme() {
    const result = originalToggleTheme();
    updateMonacoTheme();
    updateCodeHighlightTheme();
    return result;
  }
  ```

### 2.5 滚动同步功能

- **双向滚动同步**: 编辑器和预览面板滚动位置同步
  ```javascript
  function initScrollSync() {
    const editorContainer = document.getElementById('monacoEditorContainer');
    const previewContainer = document.getElementById('markdownPreview');

    if (!editorContainer || !previewContainer || !monacoEditor) return;

    let isEditorScrolling = false;
    let isPreviewScrolling = false;

    // 编辑器滚动同步到预览
    editorContainer.addEventListener('scroll', () => {
      if (isEditorScrolling) return;

      isEditorScrolling = true;

      const editorScrollTop = editorContainer.scrollTop;
      const editorScrollHeight = editorContainer.scrollHeight - editorContainer.clientHeight;
      const scrollPercentage = editorScrollTop / editorScrollHeight;

      const previewScrollTop = scrollPercentage * (previewContainer.scrollHeight - previewContainer.clientHeight);
      previewContainer.scrollTop = previewScrollTop;

      setTimeout(() => {
        isEditorScrolling = false;
      }, 100);
    });

    // 预览滚动同步到编辑器
    previewContainer.addEventListener('scroll', () => {
      if (isPreviewScrolling) return;

      isPreviewScrolling = true;

      const previewScrollTop = previewContainer.scrollTop;
      const previewScrollHeight = previewContainer.scrollHeight - previewContainer.clientHeight;
      const scrollPercentage = previewScrollTop / previewScrollHeight;

      const editorScrollTop = scrollPercentage * (editorContainer.scrollHeight - editorContainer.clientHeight);
      editorContainer.scrollTop = editorScrollTop;

      setTimeout(() => {
        isPreviewScrolling = false;
      }, 100);
    });
  }

  // 在预览面板显示时初始化滚动同步
  function toggleMarkdownPreview() {
    // ... 现有的切换逻辑 ...

    if (isPreviewVisible) {
      // 延迟初始化滚动同步，确保 DOM 已更新
      setTimeout(initScrollSync, 100);
    }
  }
  ```

### 2.6 扩展功能增强

- **预览导出功能**: 将 Markdown 导出为其他格式
  ```javascript
  function addExportButton() {
    const previewHeader = document.createElement('div');
    previewHeader.className = 'flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-600';
    previewHeader.innerHTML = `
      <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">预览</h3>
      <div class="flex gap-2">
        <button id="exportHtml" class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
          导出 HTML
        </button>
        <button id="copyMarkdown" class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
          复制 Markdown
        </button>
      </div>
    `;

    const previewContainer = document.getElementById('markdownPreview');
    previewContainer.insertBefore(previewHeader, previewContainer.firstChild);

    // 绑定导出事件
    document.getElementById('exportHtml')?.addEventListener('click', exportAsHtml);
    document.getElementById('copyMarkdown')?.addEventListener('click', copyMarkdownToClipboard);
  }

  function exportAsHtml() {
    const content = monacoEditor.getValue();
    const html = marked.parse(content);

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Markdown 导出</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .markdown-body { line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="markdown-body">${html}</div>
      </body>
      </html>
    `;

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyMarkdownToClipboard() {
    const content = monacoEditor.getValue();
    try {
      await navigator.clipboard.writeText(content);
      showToast('Markdown 已复制到剪贴板', 'success');
    } catch (error) {
      console.error('复制失败:', error);
      showToast('复制失败', 'error');
    }
  }
  ```

## 3. Report

### 3.1 conclusions

1. **Markdown 渲染可行性**: 通过 marked.js 和 highlight.js 可实现完整的 Markdown 预览功能，包括代码高亮
2. **双向面板布局**: 左右分栏布局支持编辑器和预览同时显示，通过分割条可调整比例
3. **主题统一适配**: 通过 CSS 变量系统和动态样式切换，预览面板可完美适配项目的暗色/亮色主题
4. **实时同步更新**: 编辑器内容变化时可实时更新预览，支持滚动位置双向同步
5. **扩展功能丰富**: 支持导出 HTML、复制 Markdown 等实用功能，提升用户体验

### 3.2 relations

1. **monacoEditor.onDidChangeModelContent ↔ renderMarkdownPreview()**: 编辑器内容变化触发预览更新
2. **toggleTheme() ↔ updateCodeHighlightTheme()**: 主题切换时同步更新代码高亮样式
3. **btnTogglePreview ↔ toggleMarkdownPreview()**: 预览切换按钮控制面板显示状态
4. **editorPreviewSplitter ↔ drag 函数**: 分割条拖拽调整编辑器和预览面板比例
5. **exportHtml/copyMarkdown ↔ monacoEditor.getValue()**: 导出功能获取编辑器当前内容

### 3.3 result

1. **CDN 资源加载**: 使用 marked.js(9.1.2) 和 highlight.js(11.8.0) 的 CDN 版本，无需构建工具
2. **布局设计**: 左右分栏布局，编辑器占左侧，预览占右侧，支持通过分割条调整比例
3. **样式集成**: 使用 CSS 变量系统确保预览样式与项目主题完全一致
4. **滚动同步**: 实现编辑器和预览面板的双向滚动位置同步，提升阅读体验
5. **功能扩展**: 提供导出 HTML、复制 Markdown 等实用功能

### 3.4 attention

1. **额外资源加载**: Markdown 解析和代码高亮库需要额外加载约 200KB，影响首次加载速度
2. **性能优化**: 需要使用防抖机制避免频繁渲染，大文件时可能需要虚拟滚动
3. **CSS 冲突**: Markdown 样式可能与项目现有样式冲突，需要适当的样式隔离
4. **滚动同步精度**: 不同内容结构可能导致滚动同步不完全精确，需要算法优化
5. **主题切换延迟**: 代码高亮主题切换可能有短暂延迟，需要视觉过渡处理
6. **响应式适配**: 移动设备上预览面板可能需要特殊布局处理