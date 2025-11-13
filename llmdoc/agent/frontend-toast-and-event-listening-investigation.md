# 前端 Toast 系统和事件监听调查报告

## Code Sections

- `dist/js/utils.js:54-66` (showToast 函数): 简单的 Toast 通知系统，支持消息内容和类型
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
  ```

- `dist/js/utils.js:18-50` (formatDate 函数): 智能时间格式化函数，支持相对时间显示
  ```javascript
  export const formatDate = (isoString) => {
    if (!isoString) return t("time.unknown", "Unknown");
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    const diffMs = Date.now() - date.getTime();
    const locale = getCurrentLanguage() === "zh" ? "zh-CN" : "en-US";
    // ... 相对时间计算逻辑
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  ```

- `dist/js/main.js:10` (Tauri event 导入): 从 @tauri-apps/api/event 导入 listen 函数
  ```javascript
  import { listen } from "@tauri-apps/api/event";
  ```

- `dist/js/main.js:1605-1617` (现有事件监听示例): config-file-changed 事件的监听实现
  ```javascript
  state.fileChangeUnlisten = await listen("config-file-changed", async (event) => {
    console.log("[FileWatcher] Config file changed:", event.payload);
    try {
      await handleConfigFileChanged();
    } catch (error) {
      console.warn("[FileWatcher] Failed to process config change:", error);
    }
  });
  ```

- `src-tauri/src/tray.rs:20` (事件名称定义): 快照恢复事件的 Tauri 事件名称
  ```rust
  const SNAPSHOT_EVENT_NAME: &str = "tray://snapshot-restored";
  ```

- `src-tauri/src/tray.rs:295-304` (事件发送): 快照恢复后发送 Tauri 事件
  ```rust
  fn notify_snapshot_restored<R: Runtime>(app_handle: &AppHandle<R>, snapshot_name: &str) {
    let message = format!("已恢复快照「{}」", snapshot_name);

    #[cfg(target_os = "macos")]
    if let Err(err) = show_macos_notification("SystemPromptVault", &message) {
        eprintln!("通知发送失败: {}", err);
    }

    let _ = app_handle.emit(SNAPSHOT_EVENT_NAME, message);
  }
  ```

- `dist/js/main.js:1248-1327` (initApp 函数): 应用初始化入口，是设置事件监听的最佳位置
  ```javascript
  const initApp = async () => {
    try {
      await initI18n();
    } catch (error) {
      console.error("[i18n] Initialization failed:", error);
    }
    // ... 其他初始化逻辑
  };
  ```

- `dist/js/main.js:41-44` (事件监听器状态管理): 用于存储和清理事件监听器的状态变量
  ```javascript
  fileChangeUnlisten: null,
  silentReloadUnlisten: null,
  windowBehaviorUnlisten: null,
  ```

## Report

### 结论

1. **showToast 函数签名**: `showToast(message, type = "success")`，接受消息内容和类型两个参数，类型包括 success、error、warning、info，默认显示 3600ms
2. **当前无 tray 事件监听**: 代码中不存在对 "tray://snapshot-restored" 事件的监听，需要新增
3. **Tauri 事件监听语法**: 使用 `await listen("event-name", callback)`，返回 unlisten 函数用于清理
4. **时间格式化函数**: 已有 `formatDate(isoString)` 函数，支持智能相对时间显示（刚刚、几分钟前、昨天等）
5. **Toast 消息组织**: 推荐格式为 `"已恢复快照「快照名称」 - 时间 ago"`，使用 success 类型（绿色背景）
6. **事件监听位置**: 应在 `initApp()` 函数中设置监听，并将 unlisten 函数存储在 state 中以便清理

### 关系

- `dist/js/utils.js` → `dist/js/main.js`: showToast 函数从 utils 导入到 main.js 使用
- `src-tauri/src/tray.rs` → `dist/js/main.js`: 后端通过 emit 发送事件，前端通过 listen 接收事件
- `dist/js/utils.js`: formatDate 函数可用于格式化快照时间显示
- `dist/js/main.js`: initApp 函数是所有事件监听器的统一设置位置
- 现有事件监听模式（fileChangeUnlisten、silentReloadUnlisten）可作为快照事件监听的参考模式

### 结果

通过分析代码发现，项目已具备完整的 Toast 系统和事件监听基础设施。要实现通过 Toast 替代 macOS 系统通知显示快照信息，需要：

1. 在 `initApp()` 函数中添加对 "tray://snapshot-restored" 事件的监听
2. 事件 payload 包含格式为 "已恢复快照「快照名称」" 的消息字符串
3. 使用现有的 `showToast(message, "success")` 函数显示绿色成功 Toast
4. 如需显示时间信息，可修改后端事件发送包含更多快照数据，或在前端解析消息中的快照名称

### 注意事项

- 事件监听器需要妥善管理，在组件卸载时调用 unlisten 函数避免内存泄漏
- Toast 类型使用 "success" 以匹配成功恢复快照的语义
- 当前后端发送的消息格式为简单字符串，如需显示快照时间等额外信息需要扩展事件 payload 结构
- 事件监听应设置在应用初始化阶段，确保从应用启动就能接收托盘快照恢复事件
- 现有的国际化系统 (i18n) 可用于本地化 Toast 消息内容