# Toast路径显示工具函数调查报告

## 1. 任务背景

需要在Toast提示中显示发生变化的配置文件名，要求：
- 将绝对路径转换为 `~` 格式（缩短显示）
- 支持多文件显示逻辑
- 处理同名文件不同路径的情况

## 2. Code Sections

### 2.1 现有路径处理函数

#### `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/commands/config_file.rs:60-73` (expand_tilde函数): 后端Rust路径展开函数

```rust
pub(crate) fn expand_tilde(path: &str) -> PathBuf {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            if let Some(stripped) = path.strip_prefix("~/") {
                return home.join(stripped);
            }
        }
    } else if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    Path::new(path).to_path_buf()
}
```

#### `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:2043-2049` (getConfigFileDisplayName函数): 前端文件名提取函数

```javascript
const getConfigFileDisplayName = (path, fallbackLabel = "") => {
  if (typeof path !== "string" || !path.length) {
    return fallbackLabel;
  }
  const fileName = path.split(/[/\\]/).filter(Boolean).pop();
  return fileName || path || fallbackLabel;
};
```

### 2.2 当前Toast显示逻辑

#### `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:1744-1781` (handleConfigFileChanged函数): 配置文件变化处理函数

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
      t("toast.configChanged", "Config file changed externally"),
      t("actions.reload", "Reload"),
      async () => {
        console.log("[FileChange] User clicked reload button (with unsaved changes)");
        const confirmed = await showConfirm(
          t(
            "dialogs.configChangedConfirm",
            "The config file was changed externally. Reload and discard local changes?"
          )
        );
        console.log(`[FileChange] User confirmed: ${confirmed}`);
        if (confirmed) {
          await reloadConfigFile();
        }
      }
    );
  } else {
    console.log("[FileChange] Showing toast (no unsaved changes)");
    state.fileChangeToast = showActionToast(
      t("toast.configUpdated", "Config file updated"),
      t("actions.reload", "Reload"),
      async () => {
        console.log("[FileChange] User clicked reload button");
        await reloadConfigFile();
      }
    );
  }
};
```

### 2.3 工具函数库

#### `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/utils.js:68-96` (showActionToast函数): 带操作按钮的Toast显示函数

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

## 3. Report

### conclusions

1. **现有工具函数情况**：
   - 后端已有 `expand_tilde()` 函数将 `~` 展开为完整路径
   - 前端已有 `getConfigFileDisplayName()` 函数提取文件名
   - 前端缺少将完整路径转换为 `~` 格式的函数
   - 前端缺少处理多文件路径显示的函数

2. **主目录获取方案**：
   - 后端使用 `dirs::home_dir()` 获取用户主目录
   - 前端需要通过Tauri API获取用户主目录路径
   - 可以新增一个Tauri命令 `get_user_home_dir` 供前端调用

3. **当前Toast显示问题**：
   - `handleConfigFileChanged` 函数当前使用通用消息，不显示具体文件名
   - 需要修改为显示具体变化的配置文件名
   - 需要支持多文件变化的显示逻辑

4. **多文件处理需求**：
   - 需要创建路径格式化函数处理单个路径
   - 需要创建多文件显示函数处理多个路径
   - 需要考虑同名文件不同路径的区分显示

### relations

1. **后端路径处理** → **前端路径显示**：
   - `src-tauri/src/commands/config_file.rs:expand_tilde()` (后端展开)
   - `dist/js/main.js:getConfigFileDisplayName()` (前端提取文件名)
   - 需要新增：前端路径缩短函数

2. **Toast显示流程**：
   - `dist/js/main.js:handleConfigFileChanged()` → `dist/js/utils.js:showActionToast()`
   - 当前：通用消息 → Toast
   - 需要：具体文件名 → 格式化消息 → Toast

3. **文件监听事件**：
   - 文件监听器 → 事件 → `handleConfigFileChanged()` → Toast显示
   - 事件包含文件路径信息，但当前未在Toast中显示

4. **Tauri API依赖**：
   - 新增后端命令：`get_user_home_dir`
   - 前端调用：获取主目录路径用于路径格式化

### result

#### 具体实现方案

1. **新增后端Tauri命令**：
```rust
// src-tauri/src/commands/system.rs
#[tauri::command]
pub fn get_user_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .and_then(|path| path.to_str().map(|s| s.to_string()))
        .ok_or_else(|| "无法获取用户主目录".to_string())
}
```

2. **新增前端路径处理工具函数**：
```javascript
// dist/js/utils.js
export const formatPathForDisplay = (fullPath, userHomeDir) => {
  if (!fullPath || typeof fullPath !== 'string') return '';

  if (userHomeDir && fullPath.startsWith(userHomeDir)) {
    return fullPath.replace(userHomeDir, '~');
  }
  return fullPath;
};

export const formatFilePathsForToast = (filePaths, userHomeDir) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return '';

  const displayPaths = filePaths
    .filter(path => path && typeof path === 'string')
    .map(path => formatPathForDisplay(path, userHomeDir))
    .filter(path => path.length > 0);

  if (displayPaths.length === 0) return '';
  if (displayPaths.length === 1) return displayPaths[0];

  // 多文件显示：显示前2个文件 + "等N个文件"
  if (displayPaths.length <= 3) {
    return displayPaths.join(', ');
  }

  return `${displayPaths.slice(0, 2).join(', ')} 等${displayPaths.length}个文件`;
};

export const getConfigFileDisplayName = (path, fallbackLabel = "", userHomeDir) => {
  if (typeof path !== "string" || !path.length) {
    return fallbackLabel;
  }

  const displayPath = formatPathForDisplay(path, userHomeDir);
  const fileName = displayPath.split(/[/\\]/).filter(Boolean).pop();
  return fileName || displayPath || fallbackLabel;
};
```

3. **修改Toast显示逻辑**：
```javascript
// dist/js/main.js
const handleConfigFileChanged = async (changedPaths = null) => {
  if (state.isSavingInternally) return;

  dismissFileChangeToast();

  // 处理多路径变化
  const paths = Array.isArray(changedPaths) ? changedPaths :
                (changedPaths ? [changedPaths] : []);

  let message;
  if (paths.length === 0) {
    message = t("toast.configChanged", "Config file changed externally");
  } else if (paths.length === 1) {
    const displayName = getConfigFileDisplayName(paths[0], "", state.userHomeDir);
    message = t("toast.fileChanged", "📝 {file} 已更新").replace("{file}", displayName);
  } else {
    const displayText = formatFilePathsForToast(paths, state.userHomeDir);
    message = t("toast.filesChanged", "📝 {files} 已更新").replace("{files}", displayText);
  }

  if (state.editorDirty) {
    state.fileChangeToast = showActionToast(
      message,
      t("actions.reload", "Reload"),
      async () => {
        const confirmed = await showConfirm(t("dialogs.configChangedConfirm", "是否重新加载？"));
        if (confirmed) await reloadConfigFile();
      }
    );
  } else {
    state.fileChangeToast = showActionToast(
      message,
      t("actions.reload", "Reload"),
      async () => await reloadConfigFile()
    );
  }
};
```

4. **初始化用户主目录**：
```javascript
// dist/js/main.js
const initializeUserHomeDir = async () => {
  try {
    state.userHomeDir = await invoke("get_user_home_dir");
    console.log(`[System] User home dir: ${state.userHomeDir}`);
  } catch (error) {
    console.warn("[System] Failed to get user home dir:", error);
    state.userHomeDir = null;
  }
};
```

### attention

1. **跨平台路径分隔符**：
   - Windows使用 `\`，Unix系统使用 `/`
   - 格式化函数需要处理两种分隔符

2. **路径长度限制**：
   - Toast显示空间有限，需要限制路径显示长度
   - 可以使用省略号处理过长路径

3. **同名文件处理**：
   - 不同目录下的同名文件需要区分显示
   - 可以显示部分路径信息来区分

4. **错误处理**：
   - 获取用户主目录失败时的fallback方案
   - 无效路径的处理和过滤

5. **性能考虑**：
   - 缓存用户主目录路径，避免重复API调用
   - 批量处理多文件路径时注意性能