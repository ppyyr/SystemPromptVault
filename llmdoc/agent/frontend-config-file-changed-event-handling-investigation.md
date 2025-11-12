# 前端 config-file-changed 事件处理逻辑调查报告

## Code Sections

### 事件监听器建立
- `dist/js/main.js:1196~1238` (listenToFileChanges 函数): 建立 config-file-changed 和 config-reload-silent 事件监听器

  ```javascript
  const listenToFileChanges = async () => {
    // 注册 config-file-changed 监听器
    state.fileChangeUnlisten = await listen("config-file-changed", async (event) => {
      console.log("[FileWatcher] Config file changed:", event.payload);
      try {
        await handleConfigFileChanged();
      } catch (error) {
        console.warn("[FileWatcher] Failed to process config change:", error);
      }
    });

    // 注册 config-reload-silent 监听器
    state.silentReloadUnlisten = await listen("config-reload-silent", async (event) => {
      console.log("[FileWatcher] Silent reload event received:", event.payload);
      try {
        await reloadConfigSilently();
      } catch (error) {
        console.warn("[FileWatcher] Failed to process silent reload:", error);
      }
    });
  }
  ```

- `src-tauri/src/file_watcher.rs:19~60` (ConfigFileWatcher::watch_file): 文件监听器实现，发送 config-file-changed 事件

  ```rust
  pub fn watch_file(&mut self, path: PathBuf, app_handle: AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
      while let Ok(event) = rx.recv() {
        let path_str = event.paths.first()
          .map(|p| p.to_string_lossy().to_string())
          .unwrap_or_else(|| fallback_path.clone());
        let _ = emitter_app.emit("config-file-changed", path_str);
      }
    });
  }
  ```

- `src-tauri/src/tray.rs:158~183` (restore_snapshot_from_menu): 托盘恢复快照，发送 config-reload-silent 事件

  ```rust
  // 主动通知监听器，避免托盘恢复后主窗口不同步（静默刷新，不触发外部更改提示）
  match app_handle.emit(CONFIG_RELOAD_SILENT_EVENT, path_str) {
    Ok(_) => eprintln!("[Tray] Event emitted successfully"),
    Err(e) => eprintln!("[Tray] Failed to emit event: {}", e),
  }
  ```

### 事件处理逻辑
- `dist/js/main.js:1164~1194` (handleConfigFileChanged 函数): 处理 config-file-changed 事件

  ```javascript
  const handleConfigFileChanged = async () => {
    if (state.isSavingInternally) {
      console.log("[FileChange] Ignoring file change during internal save");
      return;
    }
    dismissFileChangeToast();

    if (state.editorDirty) {
      // 有未保存修改 - 显示警告Toast
      state.fileChangeToast = showActionToast(
        "配置文件已在外部修改",
        "重新加载",
        async () => {
          const confirmed = await showConfirm(
            "配置文件已在外部修改，是否重新加载？（将丢失未保存的修改）"
          );
          if (confirmed) {
            await reloadConfigFile();
          }
        }
      );
    } else {
      // 无未保存修改 - 显示普通Toast
      state.fileChangeToast = showActionToast("配置文件已更新", "重新加载", async () => {
        await reloadConfigFile();
      });
    }
  };
  ```

- `dist/js/main.js:1132~1147` (reloadConfigFile 函数): 重新加载配置文件

  ```javascript
  const reloadConfigFile = async () => {
    if (!state.currentClientId) {
      console.warn("[Reload] No current client ID");
      return;
    }
    const success = await loadConfigFile(state.currentClientId);
    if (success) {
      dismissFileChangeToast();
      showToast("配置已重新加载", "success");
    } else {
      showToast("重新加载失败", "error");
    }
  };
  ```

- `dist/js/main.js:1149~1162` (reloadConfigSilently 函数): 静默重新加载配置文件

  ```javascript
  const reloadConfigSilently = async () => {
    if (!state.currentClientId) {
      console.warn("[ReloadSilent] No current client ID");
      return;
    }
    const success = await loadConfigFile(state.currentClientId);
    if (success) {
      dismissFileChangeToast();
    } else {
      console.warn("[ReloadSilent] Silent reload failed");
    }
  };
  ```

### 编辑器状态管理
- `dist/js/main.js:17~35` (state 对象): 全局状态管理

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
    editorMode: "edit",
    monacoEditor: null,
    editorDirty: false,
    fileChangeToast: null,
    suppressEditorChange: false,
    fileChangeUnlisten: null,
    silentReloadUnlisten: null,
    isSavingInternally: false,
  };
  ```

- `dist/js/main.js:165~170` (handleEditorChange 函数): 编辑器变化处理

  ```javascript
  const handleEditorChange = () => {
    if (state.suppressEditorChange) {
      return;
    }
    state.editorDirty = true;
  };
  ```

### UI 工具函数
- `dist/js/utils.js:41~53` (showToast 函数): 显示普通 Toast

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

- `dist/js/utils.js:55~83` (showActionToast 函数): 显示带操作按钮的 Toast

  ```javascript
  export const showActionToast = (message, actionLabel, onAction) => {
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    toast.className = "toast toast-info action-toast";

    const messageSpan = document.createElement("span");
    messageSpan.textContent = message;

    const button = document.createElement("button");
    button.className = "toast-action-btn";
    button.textContent = actionLabel;
    button.onclick = () => {
      if (typeof onAction === "function") {
        onAction();
      }
      toast.remove();
    };

    toast.appendChild(messageSpan);
    toast.appendChild(button);
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 400);
    }, 30000);

    return toast;
  };
  ```

- `dist/js/utils.js:144~184` (showConfirm 函数): 显示确认对话框

  ```javascript
  export const showConfirm = (message) =>
    new Promise((resolve) => {
      const overlay = ensureConfirmOverlay();
      const messageNode = overlay.querySelector(".confirm-message");
      messageNode.textContent = message;
      overlay.classList.remove("hidden");

      const cleanup = (result) => {
        overlay.classList.add("hidden");
        // 清理事件监听器
        resolve(result);
      };

      // 处理点击和键盘事件
      const clickHandler = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const action = target.dataset.action;
        if (action === "confirm") {
          cleanup(true);
        } else if (action === "cancel" || target === overlay) {
          cleanup(false);
        }
      };
    });
  ```

## Report

### conclusions

- 事件数据结构：config-file-changed 事件 payload 为字符串（文件路径），config-reload-silent 事件 payload 也为字符串（文件路径）
- 事件来源差异：config-file-changed 来自文件监听器（file_watcher），config-reload-silent 来自托盘恢复（tray）
- 处理逻辑差异：config-file-changed 根据 editorDirty 状态显示不同 Toast，config-reload-silent 直接静默重载
- 内部保存检测：state.isSavingInternally 标志用于避免内部保存时触发重载提示

### relations

- **事件监听关系**: `file_watcher.rs` → `config-file-changed` → `handleConfigFileChanged()`
- **托盘恢复关系**: `tray.rs` → `config-reload-silent` → `reloadConfigSilently()`
- **状态管理关系**: `editorDirty` 状态控制 Toast 显示逻辑
- **UI 函数关系**: `handleConfigFileChanged()` → `showActionToast()` → `showConfirm()` → `reloadConfigFile()`

### result

#### 当前事件处理流程

1. **文件监听器事件（config-file-changed）**:
   - 来源：外部编辑器修改配置文件
   - Payload: 文件路径字符串
   - 处理：检查 editorDirty 状态，显示不同 Toast

2. **托盘恢复事件（config-reload-silent）**:
   - 来源：托盘恢复快照
   - Payload: 文件路径字符串
   - 处理：直接静默重新加载，不显示提示

#### event.payload 数据结构

```javascript
// config-file-changed 事件
event.payload = "/path/to/config/file.json"  // 字符串

// config-reload-silent 事件
event.payload = "/path/to/config/file.json"  // 字符串
```

#### editorDirty 状态判断逻辑

- `state.editorDirty = true`：编辑器内容有未保存修改
- `state.editorDirty = false`：编辑器内容已保存
- `state.isSavingInternally = true`：正在内部保存（忽略外部变更事件）

#### Toast 显示逻辑

1. **有未保存修改（editorDirty = true）**:
   - 显示：`"⚠️ 配置文件已在外部修改"`
   - 操作：点击"重新加载"→显示确认对话框→确认后重载

2. **无未保存修改（editorDirty = false）**:
   - 显示：`"📝 配置文件已更新"`
   - 操作：点击"重新加载"→直接重载

#### 差异化处理方案

由于现有系统已通过不同事件类型（config-file-changed vs config-reload-silent）实现了差异化处理，无需修改 `handleConfigFileChanged` 函数。现有机制已经满足了需求：

- **托盘恢复**: 发送 `config-reload-silent` 事件，直接静默重载
- **文件监听**: 发送 `config-file-changed` 事件，根据 editorDirty 状态显示提示

#### UI 函数差异

- **showToast**: 显示普通消息 Toast，3.6秒自动消失，无交互按钮
- **showActionToast**: 显示带操作按钮的 Toast，30秒自动消失，有交互按钮，返回 Toast 元素引用

### attention

- **事件混淆风险**: 两种事件类型已明确区分用途，避免混淆
- **内部保存检测**: `state.isSavingInternally` 标志防止内部保存触发外部变更提示
- **Toast 自动清理**: 两种 Toast 都有自动消失机制，避免界面堆积
- **兼容性**: 现有设计已支持差异化处理，无需破坏性修改