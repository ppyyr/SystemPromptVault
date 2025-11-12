# i18n 国际化功能实现

## 1. Purpose

SystemPromptVault 的国际化（i18n）功能提供完整的多语言支持，包括系统语言自动检测、用户手动语言切换、界面文本动态翻译、跨窗口语言同步等功能。系统支持英文（en）和中文（zh）两种语言，通过模块化设计实现高效的翻译管理和 DOM 自动更新。

## 2. How it Works

### 2.1 系统架构设计

```mermaid
graph TB
    subgraph "i18n 核心模块"
        Detection[语言检测模块]
        Loader[语言加载器]
        Cache[翻译缓存]
        Resolver[嵌套键解析器]
        DOMUpdater[DOM更新器]
    end

    subgraph "语言资源"
        EN[英文资源文件]
        ZH[中文资源文件]
    end

    subgraph "存储层"
        LocalStorage[本地存储]
        StorageEvent[跨窗口同步]
    end

    subgraph "UI层"
        DataAttributes[data-* 属性]
        HTMLLang[html lang 属性]
        EventListeners[语言变更监听器]
    end

    Detection --> Loader
    Loader --> Cache
    Cache --> Resolver
    Resolver --> DOMUpdater

    EN --> Loader
    ZH --> Loader

    Loader --> LocalStorage
    LocalStorage --> StorageEvent
    StorageEvent --> Detection

    DOMUpdater --> DataAttributes
    DOMUpdater --> HTMLLang
    DOMUpdater --> EventListeners
```

### 2.2 语言检测与初始化流程

```mermaid
sequenceDiagram
    participant App as 应用启动
    participant I18n as i18n模块
    participant Browser as 浏览器API
    participant Storage as localStorage
    participant Files as 语言文件

    App->>I18n: initI18n()
    I18n->>Storage: 读取 app_language
    alt 存储中已有语言设置
        Storage-->>I18n: 返回存储的语言
    else 首次启动
        I18n->>Browser: navigator.languages
        Browser-->>I18n: 系统语言列表
        I18n->>I18n: normalizeLanguage()
    end
    I18n->>Files: fetch(locale.json)
    Files-->>I18n: 翻译数据
    I18n->>I18n: applyLanguage()
    I18n->>Storage: 持久化语言选择
    I18n->>App: 初始化完成
```

### 2.3 翻译键值解析系统

i18n 系统支持嵌套键值结构，使用点号分隔的路径访问深层翻译：

```javascript
// 翻译文件结构
{
  "common": {
    "appTitle": "System Prompt Vault",
    "actions": {
      "save": "Save",
      "cancel": "Cancel"
    }
  },
  "prompts": {
    "sectionTitle": "Prompts",
    "empty": "No prompts found"
  }
}

// 使用方式
t("common.appTitle")           // "System Prompt Vault"
t("common.actions.save")       // "Save"
t("prompts.sectionTitle")      // "Prompts"
t("prompts.empty")             // "No prompts found"
```

### 2.4 DOM 自动更新机制

系统通过扫描特定 `data-*` 属性自动更新界面文本：

**支持的属性类型**:
- `data-i18n`: 元素文本内容
- `data-i18n-placeholder`: 输入框占位符
- `data-i18n-aria`: ARIA 标签
- `data-i18n-tooltip`: 工具提示
- `data-i18n-title`: 标题属性
- `data-i18n-value`: 表单元素值

**HTML 示例**:
```html
<!-- 基本文本翻译 -->
<h1 data-i18n="clients.header">Clients</h1>

<!-- 占位符翻译 -->
<input type="text" data-i18n-placeholder="tags.searchPlaceholder">

<!-- ARIA 标签翻译 -->
<button data-i18n-aria="actions.saveConfig" aria-label="Save">

<!-- 工具提示翻译 -->
<div data-i18n-tooltip="editor.preview" data-tooltip="Preview">
```

### 2.5 跨窗口语言同步

```mermaid
sequenceDiagram
    participant Window1 as 窗口1
    participant Storage as localStorage
    participant Window2 as 窗口2

    Window1->>Storage: setLanguage("zh")
    Storage->>Storage: 触发 storage 事件
    Storage->>Window2: storage 事件
    Window2->>Window2: 检测语言变化
    Window2->>Window2: loadLanguage("zh")
    Window2->>Window2: 更新界面语言
```

### 2.6 语言切换完整流程

```mermaid
flowchart TD
    A[用户选择语言] --> B[setLanguage lang]
    B --> C[normalizeLanguage lang]
    C --> D[检查是否当前语言]
    D --> E{相同且已加载?}
    E -->|是| F[直接返回]
    E -->|否| G[fetchLocale lang]
    G --> H{加载成功?}
    H -->|是| I[applyLanguage localeData]
    H -->|否| J{是否为默认语言?}
    J -->|否| K[加载默认语言]
    J -->|是| L[抛出错误]
    K --> M[applyLanguage fallbackData]
    I --> N[更新 translations]
    M --> N
    N --> O[更新 currentLanguage]
    O --> P[localStorage 持久化]
    P --> Q[设置 html lang 属性]
    Q --> R[扫描并更新 DOM 元素]
    R --> S[触发 languageListeners]
    S --> T[完成语言切换]
    L --> U[初始化失败]
```

### 2.7 应用初始化中的 i18n 集成

```mermaid
sequenceDiagram
    participant DOM as DOM加载
    participant I18n as i18n模块
    participant Theme as 主题系统
    participant App as 应用逻辑
    participant UI as UI渲染

    DOM->>I18n: initI18n()
    I18n->>I18n: 检测系统语言
    I18n->>I18n: 加载语言文件
    I18n->>I18n: 应用翻译
    I18n->>DOM: 设置 html lang
    I18n-->>DOM: 初始化完成
    DOM->>Theme: initTheme()
    Theme-->>DOM: 主题初始化完成
    DOM->>App: 应用逻辑初始化
    App->>UI: 渲染界面
    UI->>I18n: 应用翻译到动态内容
```

## 3. Relevant Code Modules

### 核心模块
- `dist/js/i18n.js`: 国际化核心实现（211行），包含语言检测、翻译加载、DOM更新、跨窗口同步
- `dist/locales/en.json`: 英文翻译资源文件（228行）
- `dist/locales/zh.json`: 中文翻译资源文件（228行）

### 集成模块
- `dist/js/main.js`: 主应用模块，集成 i18n 初始化和翻译函数使用
- `dist/js/settings.js`: 设置页面模块，集成语言设置界面和翻译函数
- `dist/js/utils.js`: 工具函数模块，Toast 系统国际化
- `dist/index.html`: 主页面，添加 data-i18n 属性支持
- `dist/settings.html`: 设置页面，添加语言设置界面和 data-i18n 属性

### 配置文件
- `dist/js/i18n.js`: 定义常量 `SUPPORTED_LANGUAGES`, `DEFAULT_LANGUAGE`, `LANGUAGE_STORAGE_KEY`

## 4. Attention

### 性能优化注意事项

1. **翻译缓存**: 使用 `Map` 缓存已加载的语言文件，避免重复网络请求
2. **防抖机制**: 语言切换操作使用防抖，避免频繁切换导致的性能问题
3. **DOM 更新优化**: 只更新包含 `data-*` 属性的元素，减少不必要的 DOM 操作
4. **懒加载**: 语言文件按需加载，首次启动只加载所需语言

### 开发注意事项

1. **翻译键命名**: 使用点号分隔的嵌套结构，保持逻辑分组（如 `common.actions.save`）
2. **回退机制**: 翻译缺失时使用键名作为回退，确保界面可用性
3. **HTML 属性**: 为所有需要翻译的元素添加适当的 `data-*` 属性
4. **动态内容**: 动态生成的内容需要手动调用 `applyTranslations()` 或 `t()` 函数

### 国际化最佳实践

1. **文本外化**: 所有用户可见的文本都必须提取到翻译文件中
2. **上下文保持**: 翻译时保持文本的上下文含义，避免直译导致的信息丢失
3. **占位符处理**: 包含变量的文本使用占位符格式，便于翻译时的词序调整
4. **测试覆盖**: 测试时需要验证两种语言的显示效果和功能完整性

### 存储和同步注意事项

1. **持久化键**: 使用固定键名 `app_language` 存储用户语言选择
2. **跨窗口同步**: 通过 `storage` 事件实现多窗口语言自动同步
3. **错误处理**: 语言加载失败时自动回退到默认语言，确保应用可用性