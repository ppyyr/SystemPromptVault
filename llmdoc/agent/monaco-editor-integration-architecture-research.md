# Monaco Editor 在 Tauri 原生 JavaScript 环境中的集成架构调研

## 1. Purpose

本文档深入调研 Monaco Editor 在 SystemPromptVault 项目中的集成架构方案，重点关注在 Tauri v2 + 原生 JavaScript(非模块打包工具)环境中的加载方式、主题适配机制、搜索替换功能实现以及与现有编辑器系统的集成方案。

## 2. Code Sections

### 2.1 当前编辑器实现分析

- `dist/index.html:76`: 当前 textarea 编辑器实现
  ```html
  <textarea id="configEditor" class="w-full flex-1 border border-gray-300 dark:border-gray-600 rounded-md p-4 font-mono text-sm resize-none bg-gray-50 dark:bg-gray-700 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 disabled:bg-gray-100 disabled:dark:bg-gray-800 disabled:cursor-not-allowed" placeholder="在此编辑选中客户端的配置文件"></textarea>
  ```

- `dist/js/main.js:84`: 编辑器元素缓存
  ```javascript
  elements.configEditor = document.getElementById("configEditor");
  ```

- `dist/js/main.js:125-127`: 编辑器输入事件绑定
  ```javascript
  elements.configEditor?.addEventListener("input", (event) => {
    state.configContent = event.target.value;
  });
  ```

- `dist/js/main.js:571-576`: 配置文件加载逻辑
  ```javascript
  const loadConfigFile = async (clientId) => {
    if (!clientId) return;
    try {
      const content = await ConfigFileAPI.read(clientId);
      state.configContent = content ?? "";
    } catch (error) {
      state.configContent = "";
      showToast(getErrorMessage(error) || "读取配置文件失败", "error");
    }
    syncEditor();
  };
  ```

- `dist/js/main.js:1118-1124`: 编辑器同步逻辑
  ```javascript
  const syncEditor = () => {
    if (elements.configEditor) {
      elements.configEditor.value = state.configContent;
    }
    updateEditorAvailability();
    updateConfigFileName();
  };
  ```

- `dist/js/main.js:579-593`: 配置文件保存逻辑
  ```javascript
  const saveConfigFile = async ({ silent = false } = {}) => {
    if (!state.currentClientId) return false;
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

### 2.2 状态管理系统

- `dist/js/main.js:13`: 配置内容状态管理
  ```javascript
  configContent: "",
  ```

- `dist/js/main.js:5`: 应用状态结构
  ```javascript
  const state = {
    clients: [],
    currentClientId: "claude",
    prompts: [],
    selectedTags: [],
    recentTags: [],
    tagDropdownOpen: false,
    tagSearchQuery: "",
    configContent: "",
    splitRatio: 0.5,
  };
  ```

### 2.3 主题系统接口

- `dist/js/theme.js:9-16`: 当前主题获取逻辑
  ```javascript
  export function getCurrentTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === THEME_DARK || stored === THEME_LIGHT) {
      return stored;
    }
    // 默认使用系统主题
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT;
  }
  ```

- `dist/js/theme.js:21-28`: 主题应用逻辑
  ```javascript
  export function applyTheme(theme) {
    if (theme === THEME_DARK) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }
  ```

- `dist/js/theme.js:43-56`: 主题初始化和系统主题监听
  ```javascript
  export function initTheme() {
    const theme = getCurrentTheme();
    applyTheme(theme);

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const stored = localStorage.getItem(THEME_KEY);
      // 只有在没有手动设置时才自动切换
      if (!stored) {
        applyTheme(e.matches ? THEME_DARK : THEME_LIGHT);
        updateThemeIcon();
      }
    });
  }
  ```

### 2.4 项目构建配置

- `src-tauri/tauri.conf.json:8-9`: Tauri 构建配置
  ```json
  "beforeBuildCommand": "npm run build:css",
  "beforeDevCommand": "npm run watch:css",
  ```

- `package.json:11-12`: CSS 构建脚本
  ```json
  "build:css": "tailwindcss -i ./dist/css/tailwind.css -o ./dist/css/output.css --minify",
  "watch:css": "tailwindcss -i ./dist/css/tailwind.css -o ./dist/css/output.css --watch"
  ```

## 3. Report

### 3.1 conclusions

1. **当前编辑器架构**: 使用原生 textarea 元素，通过 input 事件同步到 state.configContent，支持基础的 CRUD 操作
2. **Tauri v2 环境**: 项目使用原生 JavaScript，无 Webpack/Vite 等模块打包工具，Monaco Editor 需通过 CDN 或独立脚本加载
3. **主题系统成熟**: 完整的暗色/亮色主题切换系统，基于 .dark 类和 CSS 变量，支持系统主题自动跟随
4. **状态管理集中**: configContent 集中在主 state 中管理，与 Monaco Editor 的 getValue/setValue API 可以直接集成
5. **保存机制完善**: 已有自动保存和手动保存逻辑，Monaco Editor 可通过 onChange 事件集成现有保存机制

### 3.2 relations

1. **configEditor ↔ state.configContent**: 当前双向绑定关系需要扩展为 Monaco Editor 的 getValue/setValue
2. **theme.js ↔ Monaco Editor**: 主题切换时需要同步更新 Monaco Editor 的主题配置
3. **saveConfigFile() ↔ Monaco Editor**: 保存逻辑需要从 textarea.value 改为 monacoEditor.getValue()
4. **loadConfigFile() ↔ Monaco Editor**: 加载逻辑需要从 textarea.value = 改为 monacoEditor.setValue()
5. **configSection DOM**: 需要为 Monaco Editor 预留容器，替换现有 textarea 元素

### 3.3 result

1. **加载方式推荐**: 使用 CDN 加载 Monaco Editor，通过创建 <script> 标签动态加载，避免构建工具依赖
2. **主题适配方案**: 监听 getCurrentTheme() 返回值变化，调用 monaco.editor.setTheme() 切换预定义主题
3. **搜索替换功能**: Monaco Editor 内置 Find Widget (Ctrl+F) 和 Replace Widget (Ctrl+H)，无需额外开发
4. **状态同步策略**: 使用 Monaco Editor 的 onDidChangeModelContent 事件替代 input 事件，保持与现有状态管理的兼容
5. **DOM 容器设计**: 在 configSection 中使用 <div id="monacoEditorContainer"> 替换 textarea，配置最小高度和响应式布局

### 3.4 attention

1. **性能风险**: Monaco Editor 体积较大(~2MB)，CDN 加载可能影响首次加载速度，需要考虑 loading 状态
2. **主题兼容性**: Monaco Editor 的内置主题(VS/Dark)与项目自定义主题颜色可能不完全匹配，需要定制主题配置
3. **内存管理**: Monaco Editor 实例需要正确销毁和重建，避免客户端切换时的内存泄漏
4. **事件系统**: 需要正确处理 Monaco Editor 的生命周期事件，确保与现有的 debounce 机制兼容
5. **响应式布局**: Monaco Editor 在小屏幕设备上的自适应需要额外配置，可能影响现有的分割面板系统
6. **Tauri 安全策略**: 可能需要更新 Tauri 的 capabilities 配置以允许 CDN 资源加载