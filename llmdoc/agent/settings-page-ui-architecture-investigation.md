# 设置页面 UI 架构与搜索栏实现调研

## Code Sections

- `dist/settings.html:158-289` (#promptActions 容器): 提示词操作区域，包含导入导出、新增按钮和标签筛选器
  ```html
  <div class="flex items-center gap-2 flex-wrap" id="promptActions">
    <!-- 导入导出和新增按钮组 -->
    <button class="btn-icon btn-icon-primary">...</button>
    <!-- 标签筛选器 -->
    <div class="tag-filter tag-dropdown" id="tagFilterSettings">
      <button class="tag-dropdown__toggle" id="tagDropdownToggleSettings">...</button>
    </div>
  </div>
  ```

- `dist/css/main.css:497-511` (标签筛选器按钮样式): flex 布局，带内边距、圆角、过渡动画
  ```css
  .tag-dropdown__toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: none;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    transition: all 0.2s ease;
    cursor: pointer;
  }
  ```

- `dist/css/main.css:602-613` (搜索框输入样式): 简洁无边框设计，透明背景
  ```css
  .tag-dropdown__search-input {
    width: 100%;
    padding: 8px 0;
    border: none;
    background: transparent;
    color: var(--color-text);
    font-size: 0.9rem;
  }
  ```

- `dist/css/main.css:376-401` (图标按钮样式): 圆角按钮，带 hover 效果
  ```css
  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid transparent;
    transition: all 0.2s ease;
  }
  ```

- `dist/locales/en.json:142-156` (国际化标签相关): 包含搜索相关的翻译条目
  ```json
  "tags": {
    "searchLabel": "Search Tags",
    "searchPlaceholder": "Search tags...",
    "filter": "Filter Tags"
  }
  ```

## Report

### 结论

**#promptActions 容器结构分析**:
- 容器使用 `flex items-center gap-2 flex-wrap` 布局，水平排列元素并支持换行
- 包含 3 个 `btn-icon btn-icon-primary` 样式的图标按钮（导出、导入、新增）
- 标签筛选器使用 `tag-filter tag-dropdown` 样式类，带有完整的下拉面板功能
- 元素间距通过 `gap-2`（8px）统一控制

**标签筛选器按钮样式特征**:
- 尺寸：使用 `padding: 0.5rem 1rem`，高度约 40px（含内边距）
- 样式：无边框设计，背景使用 `--color-surface` 变量，圆角 8px
- 颜色：文字使用 `--color-text-secondary`，hover 时变为 `--color-primary`
- 动画：0.2s 平滑过渡效果，支持深色主题
- 无障碍：完整的 ARIA 属性支持

**输入框样式方案**:
- 现有搜索框样式：`tag-dropdown__search-input` - 简洁的透明背景无边框设计
- 内边距：`padding: 8px 0`，仅上下内边距
- 字体大小：`0.9rem`，与整体设计保持一致
- 焦点状态：无轮廓线设计，保持简洁

**国际化实现方式**:
- 翻译键格式：使用点分隔的命名空间（如 `tags.searchLabel`）
- HTML 属性：`data-i18n-*` 系列属性支持文本、占位符、aria-label 等的国际化
- 现有键值：已存在 `tags.searchLabel` 和 `tags.searchPlaceholder` 可复用

### 关联关系

**文件关联**:
- `settings.html` → `main.css` → `components.css`：HTML 结构引用统一样式系统
- `settings.html` → `en.json/zh.json`：HTML 元素通过 `data-i18n-*` 属性绑定翻译
- `settings.html` → `settings.js`：DOM 元素 ID 用于 JavaScript 交互逻辑

**样式类继承**:
- `btn-icon` → `btn-icon-primary`：基础图标按钮样式继承
- `tag-dropdown` → `tag-dropdown__toggle` → `tag-dropdown__search-input`：下拉菜单组件样式层次
- `flex items-center gap-2`：容器使用统一 flex 布局模式

**交互模式**:
- 标签筛选器的搜索框位于下拉面板内部，采用展开式设计
- Tooltip 系统通过 `data-tooltip` 属性统一实现
- 按钮状态通过 CSS 类切换实现视觉反馈

### 结果

**推荐的搜索栏设计方案**:

1. **HTML 结构**：
   ```html
   <div class="prompt-search">
     <input
       type="text"
       class="prompt-search__input"
       placeholder="Search prompts..."
       aria-label="Search Prompts"
       data-i18n-placeholder="prompts.searchPlaceholder"
       data-i18n-aria="prompts.searchLabel"
     />
   </div>
   ```

2. **CSS 样式类**：
   - 容器类：`prompt-search` - 使用 flex 布局与按钮对齐
   - 输入框类：`prompt-search__input` - 参考现有按钮高度和圆角
   - 建议高度：40px（与 `btn-icon` 按钮保持一致）
   - 建议样式：带边框设计，与表单输入框保持视觉统一

3. **国际化键值**：
   - 新增 `prompts.searchPlaceholder`："Search prompts..." / "搜索提示词..."
   - 新增 `prompts.searchLabel`："Search Prompts" / "搜索提示词"

4. **布局位置**：
   - 插入位置：`#promptActions` 容器内，`#tagDropdownToggleSettings` 按钮之前
   - 间距控制：使用 `gap-2` 与其他元素保持 8px 间距
   - 响应式：在小屏幕上支持换行显示

5. **样式协调**：
   - 参考标签筛选器的视觉设计语言
   - 使用相同的颜色变量和圆角半径
   - 保持与 `btn-icon` 按钮相同的高度比例
   - 支持 hover 和 focus 状态的视觉反馈

### 注意事项

**样式一致性**:
- 搜索框高度应与现有按钮保持一致（约 40px）
- 需要使用项目统一的 CSS 变量（`--color-*`）确保主题适配
- 圆角半径建议使用 6px-8px，与按钮设计保持协调

**无障碍支持**:
- 必须添加 `aria-label` 属性用于屏幕阅读器
- 支持键盘导航和焦点管理
- 与现有 Tooltip 系统保持一致的交互体验

**国际化集成**:
- 使用项目的标准国际化属性格式
- 占位符文本需要支持中英文切换
- 考虑文本长度变化对布局的影响

**响应式设计**:
- 在小屏幕设备上搜索框可能占据更多空间
- 考虑添加最小宽度限制确保可用性
- 与现有 flex-wrap 布局配合，支持元素换行