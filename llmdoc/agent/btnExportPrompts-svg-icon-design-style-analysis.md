### Code Sections

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/settings.html:111~113` (#btnExportPrompts SVG结构): 导出按钮的SVG图标定义，使用outline style线性图标

  ```html
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/settings.html:105~114` (按钮容器结构): 按钮使用btn-icon和btn-icon-primary类

  ```html
  <button
    class="btn-icon btn-icon-primary"
    id="btnExportPrompts"
    type="button"
    aria-label="导出提示词"
    data-tooltip="导出提示词"
  >
    <!-- SVG内容 -->
  </button>
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/css/main.css:214~224` (.btn-icon基础样式): 按钮的基础样式定义

  ```css
  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid transparent;
    transition: all 0.2s ease;
    background: transparent;
    color: inherit;
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/css/main.css:226~239` (.btn-icon-primary样式): 主要按钮变体的样式定义

  ```css
  .btn-icon-primary {
    background: transparent;
    color: var(--color-text-secondary, #6b7280);
    border: none;
  }

  .dark .btn-icon-primary {
    color: var(--color-text-secondary, #9ca3af);
  }

  .btn-icon-primary:hover {
    background: var(--color-surface-hover, rgba(59, 130, 246, 0.1));
    color: var(--color-primary, #3b82f6);
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/css/main.css:7~8` (主题色彩定义): 亮色主题的主色调

  ```css
  --color-primary: #0066cc;
  --color-primary-dark: #0053a3;
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/css/main.css:27~28` (暗色主题色彩): 暗色模式下的主色调

  ```css
  --color-primary: #5b9fff;
  --color-primary-dark: #4a8eef;
  ```

### Report

#### conclusions

- SVG图标使用 **outline style**（线性图标）设计，通过 `stroke="currentColor"` 实现动态颜色
- 图标尺寸固定为 **20x20px**（w-5 h-5），viewBox为标准 **24x24** 比例
- 线条样式：`stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- **无渐变、无阴影效果**，采用极简扁平化设计
- 设计风格接近 **Heroicons** 和 **Feather Icons** 的outline变体
- 颜色系统：亮色模式主色 `#0066cc`，暗色模式 `#5b9fff`
- hover状态使用半透明背景叠加效果

#### relations

- CSS文件层级关系：main.css 定义基础样式 → components.css 扩展组件样式 → HTML 应用样式类
- 颜色变量依赖关系：`--color-primary` → `stroke="currentColor"` → SVG动态着色
- 按钮状态关系：normal(灰色) → hover(蓝色+背景) → focus-visible(轮廓)
- 主题切换关系：亮色主色 `#0066cc` ↔ 暗色主色 `#5b9fff`

#### result

`#btnExportPrompts` 图标采用 **现代线性图标设计风格**，具有以下特征：

1. **视觉风格**：Outline/线性图标，无填充，纯线条描边
2. **尺寸规格**：20x20px显示尺寸，基于24x24 viewBox坐标系
3. **线条特征**：2px粗细，圆角端点和连接处
4. **色彩方案**：动态currentColor系统，支持亮/暗主题切换
5. **交互效果**：悬停时颜色变蓝并添加半透明背景
6. **设计系统归属**：符合Heroicons/Feather Icons设计规范

#### attention

- `--color-text-secondary` 变量未在CSS变量定义中显式声明，依赖fallback值
- SVG path数据包含复杂的贝塞尔曲线，需保持原始数据完整性
- hover状态的 `rgba(59, 130, 246, 0.1)` 硬编码颜色可能与主题不一致
- 按钮的focus状态使用 `--color-primary` 但有fallback值 `#3b82f6`，存在颜色不统一风险