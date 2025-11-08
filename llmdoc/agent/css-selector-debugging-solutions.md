### Code Sections

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/css/main.css:200-207` (prompt-list 样式): 提示词列表容器的布局和样式

  ```css
  .prompt-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    padding-right: 4px;
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/css/main.css:209-224` (prompt-card 和 prompt-card-header 样式): 卡片及其头部的布局结构

  ```css
  .prompt-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #fafafa;
  }

  .prompt-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/css/components.css:5-31` (按钮样式层级): 按钮的基础样式和主要按钮样式

  ```css
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: none;
    border-radius: 999px;
    padding: 8px 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .btn-primary {
    background: var(--color-primary);
    color: #fff;
    box-shadow: 0 4px 12px rgba(0, 102, 204, 0.3);
  }
  ```

### Report

#### conclusions

> CSS 选择器问题的根本原因和解决方案

- **DOM 层级结构确认**: 实际结构为 `div#promptList > article.prompt-card > div.prompt-card-header > button.btn.btn-primary`
- **选择器错误分析**: 用户 XPath `//*[@id="promptList"]/article[1]/div/button` 过于宽泛，缺少具体的 class 属性限制
- **渲染时机问题**: 提示词卡片通过 `renderPromptList()` 函数动态生成，需要在 DOM 完全渲染后执行选择器
- **样式特异性**: 按钮样式具有多层 CSS 类覆盖，简单的 button 标签选择器可能受到样式继承影响

#### relations

> 影响选择器生效的相关因素

- **数据流依赖**: 按钮生成依赖 `loadPrompts()` → `getFilteredPrompts()` → `renderPromptList()` 的执行链
- **事件系统**: 每个按钮都有独立的 `click` 事件监听器绑定到 `applyPrompt(prompt.id)` 函数
- **样式继承链**: `button` → `.btn` → `.btn-primary` → hover/disabled 状态样式
- **布局影响**: `prompt-card-header` 使用 `justify-content: space-between` 布局，影响按钮位置

#### result

> 完整的问题诊断和解决方案

**问题诊断**:

1. **XPath 表达式不准确**:
   - 原始表达式: `//*[@id="promptList"]/article[1]/div/button`
   - 问题: `div` 选择器过于宽泛，应该指定具体的 class `prompt-card-header`

2. **执行时机不当**:
   - DOM 元素通过 JavaScript 动态创建
   - 需要等待 `renderPromptList()` 函数执行完成

3. **可能的空状态**:
   - 当没有符合条件的提示词时，显示的是 `div.empty-state` 而非 `article` 元素

**正确的选择器方案**:

1. **修正的 XPath 选择器**:
   ```xpath
   //*[@id="promptList"]/article[1]/div[@class="prompt-card-header"]/button
   ```
   或者更宽松的版本:
   ```xpath
   //*[@id="promptList"]//article[1]//button[contains(@class, "btn-primary")]
   ```

2. **CSS 选择器 (推荐)**:
   ```css
   #promptList .prompt-card:first-child .btn-primary
   ```
   或者:
   ```css
   #promptList article:first-child .prompt-card-header button
   ```

3. **JavaScript 实现**:
   ```javascript
   // 等待 DOM 加载完成
   document.addEventListener('DOMContentLoaded', function() {
     // 方法1: 直接查询
     const firstButton = document.querySelector('#promptList .prompt-card:first-child .btn-primary');

     // 方法2: 等待内容渲染（更可靠）
     setTimeout(() => {
       const button = document.querySelector('#promptList .prompt-card:first-child .btn-primary');
       if (button) {
         // 执行操作
         button.click();
       }
     }, 100);

     // 方法3: 监听 DOM 变化（最可靠）
     const observer = new MutationObserver((mutations) => {
       const button = document.querySelector('#promptList .prompt-card:first-child .btn-primary');
       if (button) {
         // 执行操作
         button.click();
         observer.disconnect(); // 执行后停止监听
       }
     });

     observer.observe(document.getElementById('promptList'), {
       childList: true,
       subtree: true
     });
   });
   ```

**调试步骤**:

1. **验证 DOM 结构**:
   ```javascript
   // 在浏览器控制台执行
   console.log(document.getElementById('promptList'));
   console.log(document.querySelectorAll('#promptList article'));
   console.log(document.querySelector('#promptList .prompt-card:first-child .btn-primary'));
   ```

2. **检查数据状态**:
   ```javascript
   // 检查是否有提示词数据
   console.log(window.state?.prompts?.length);
   console.log(window.state?.selectedTags);
   ```

3. **时机验证**:
   ```javascript
   // 在 renderPromptList 函数执行后检查
   // 或者在控制台手动执行
   setTimeout(() => {
     const button = document.querySelector('#promptList .prompt-card:first-child .btn-primary');
     console.log('Button found:', button);
   }, 500);
   ```

#### attention

> 其他可能影响选择器生效的因素

- **标签过滤状态**: 如果启用了标签过滤，可能导致第一个提示词不是预期的那个
- **客户端切换**: 切换客户端会重新渲染整个提示词列表，需要重新获取元素
- **异步加载**: 提示词数据通过 API 异步加载，存在网络延迟的可能
- **空状态处理**: 当没有提示词或过滤后无结果时，DOM 结构会发生变化
- **响应式布局**: 在移动端布局下，DOM 结构可能保持不变，但样式和可见性会发生变化
- **Tauri 环境**: 作为桌面应用，DOM 渲染时机可能与纯 Web 环境略有不同