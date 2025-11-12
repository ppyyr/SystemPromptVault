# 基于 event.payload.source 的差异化事件处理实现方案

## Code Sections

### 现有事件处理函数
- `dist/js/main.js:1164~1194` (handleConfigFileChanged 函数): 当前事件处理逻辑

  ```javascript
  const handleConfigFileChanged = async () => {
    if (state.isSavingInternally) {
      console.log("[FileChange] Ignoring file change during internal save");
      return;
    }
    console.log(`[FileChange] Config file changed, editorDirty: ${state.editorDirty}`);
    dismissFileChangeToast();
    if (state.editorDirty) {
      console.log("[FileChange] Showing toast with confirmation (has unsaved changes)");
      state.fileChangeToast = showActionToast(
        "配置文件已在外部修改",
        "重新加载",
        async () => {
          console.log("[FileChange] User clicked reload button (with unsaved changes)");
          const confirmed = await showConfirm(
            "配置文件已在外部修改，是否重新加载？（将丢失未保存的修改）"
          );
          console.log(`[FileChange] User confirmed: ${confirmed}`);
          if (confirmed) {
            await reloadConfigFile();
          }
        }
      );
    } else {
      console.log("[FileChange] Showing toast (no unsaved changes)");
      state.fileChangeToast = showActionToast("配置文件已更新", "重新加载", async () => {
        console.log("[FileChange] User clicked reload button");
        await reloadConfigFile();
      });
    }
  };
  ```

### 事件监听器
- `dist/js/main.js:1206~1215` (config-file-changed 监听器): 当前事件监听逻辑

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

## Report

### conclusions

- 现有系统已通过事件类型区分实现差异化处理，无需额外 source 字段
- config-file-changed 和 config-reload-silent 事件已满足不同场景需求
- 如需基于 source 字段实现，需要修改后端事件发送结构

### relations

- **事件处理链**: 事件监听器 → handleConfigFileChanged → 显示 Toast/确认对话框 → reloadConfigFile
- **状态依赖**: editorDirty 状态影响 Toast 显示内容和交互逻辑
- **UI 函数链**: showActionToast → showConfirm → reloadConfigFile

### result

#### 方案一：使用现有事件类型机制（推荐）

现有系统已实现完美差异化：

1. **托盘恢复场景**: 发送 `config-reload-silent` 事件 → 直接静默重载
2. **文件监听场景**: 发送 `config-file-changed` 事件 → 根据 editorDirty 状态显示提示

无需任何修改，现有机制已满足所有需求。

#### 方案二：基于 event.payload.source 字段的修改方案（如需统一事件类型）

如果需要统一使用 `config-file-changed` 事件并通过 source 字段区分，需要进行以下修改：

##### 1. 修改后端事件发送结构

**文件监听器修改**:
```rust
// src-tauri/src/file_watcher.rs
let _ = emitter_app.emit("config-file-changed", serde_json::json!({
    "path": path_str,
    "source": "file_watcher"
}));
```

**托盘恢复修改**:
```rust
// src-tauri/src/tray.rs
match app_handle.emit("config-file-changed", serde_json::json!({
    "path": path_str,
    "source": "tray"
})) {
    Ok(_) => eprintln!("[Tray] Event emitted successfully"),
    Err(e) => eprintln!("[Tray] Failed to emit event: {}", e),
}
```

##### 2. 修改前端事件监听器

```javascript
// dist/js/main.js
state.fileChangeUnlisten = await listen("config-file-changed", async (event) => {
  console.log("[FileWatcher] Config file changed:", event.payload);
  try {
    await handleConfigFileChanged(event.payload);
  } catch (error) {
    console.warn("[FileWatcher] Failed to process config change:", error);
  }
});
```

##### 3. 修改 handleConfigFileChanged 函数

```javascript
const handleConfigFileChanged = async (payload) => {
  if (state.isSavingInternally) {
    console.log("[FileChange] Ignoring file change during internal save");
    return;
  }

  // 解析 payload 获取 source 字段
  const source = payload?.source || "file_watcher";
  console.log(`[FileChange] Config file changed from source: ${source}, editorDirty: ${state.editorDirty}`);

  dismissFileChangeToast();

  // 根据 source 字段实现差异化处理
  if (source === "tray") {
    // 托盘恢复：直接重新加载，不管是否有未保存修改
    console.log("[FileChange] Tray source - reloading directly");
    await reloadConfigFile();
    showToast("配置已从托盘恢复", "success");
  } else {
    // 文件监听：保持现有行为
    if (state.editorDirty) {
      console.log("[FileChange] File watcher source with unsaved changes - showing confirmation");
      state.fileChangeToast = showActionToast(
        "配置文件已在外部修改",
        "重新加载",
        async () => {
          console.log("[FileChange] User clicked reload button (with unsaved changes)");
          const confirmed = await showConfirm(
            "配置文件已在外部修改，是否重新加载？（将丢失未保存的修改）"
          );
          console.log(`[FileChange] User confirmed: ${confirmed}`);
          if (confirmed) {
            await reloadConfigFile();
          }
        }
      );
    } else {
      console.log("[FileChange] File watcher source with no unsaved changes - showing reload button");
      state.fileChangeToast = showActionToast("配置文件已更新", "重新加载", async () => {
        console.log("[FileChange] User clicked reload button");
        await reloadConfigFile();
      });
    }
  }
};
```

#### UI 函数差异说明

- **showToast(message, type)**: 显示普通消息 Toast
  - 参数：message (消息内容), type (样式类型，默认 "success")
  - 行为：3.6秒自动消失，无交互按钮
  - 返回值：undefined

- **showActionToast(message, actionLabel, onAction)**: 显示带操作按钮的 Toast
  - 参数：message (消息内容), actionLabel (按钮文本), onAction (点击回调函数)
  - 行为：30秒自动消失，点击按钮执行回调后消失
  - 返回值：Toast DOM 元素引用，用于手动移除

#### 实现建议

**推荐使用方案一（现有机制）**，原因：

1. **无需修改**: 现有系统已完美实现差异化处理
2. **逻辑清晰**: 事件类型直接反映意图，易于理解和维护
3. **性能更好**: 避免解析 JSON payload 和判断 source 字段
4. **向后兼容**: 不破坏现有的事件处理逻辑

**仅在以下情况考虑方案二**：
- 需要统一所有配置文件变更到单一事件类型
- 需要支持更多的事件来源（不限于托盘和文件监听）
- 需要在事件中传递更多元数据信息

### attention

- **方案一**无破坏性修改，推荐使用
- **方案二**需要修改前后端多处代码，增加系统复杂度
- 现有的 editorDirty 状态检测机制在两种方案中都有效
- 内部保存检测（state.isSavingInternally）在两种方案中都应保留
- Toast 消息的国际化文本需要相应调整