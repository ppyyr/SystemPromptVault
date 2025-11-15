### Code Sections

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:285~304` (createAutoSnapshot): 自动快照创建函数，处理内容未变化情况

  ```javascript
  const createAutoSnapshot = async (clientId, prefix = null) => {
    if (!clientId) {
      throw new Error(t("errors.missingClientId", "Missing client ID, cannot create snapshot"));
    }
    const name = formatSnapshotName(prefix);

    try {
      await SnapshotAPI.create(clientId, name, true, "");
      await Promise.all([SnapshotAPI.refreshTrayMenu(), SnapshotAPI.refreshAppMenu()]);
      console.log(`[Snapshot] 已创建快照: ${name} (客户端: ${clientId})`);
      return name;
    } catch (error) {
      if (error && typeof error === "string" && error.includes("内容未变化")) {
        console.log(`[Snapshot] 内容未变化,跳过快照: ${prefix} (客户端: ${clientId})`);
        return null;
      }
      console.warn(`[Snapshot] 创建快照失败:`, error);
      return null;
    }
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:327~357` (ensureProtectiveSnapshotBeforeNavigation): 导航前保护快照函数，存在逻辑错误

  ```javascript
  const ensureProtectiveSnapshotBeforeNavigation = async (prefix) => {
    if (!state.currentClientId) {
      return true;
    }
    const resolvedPrefix =
      typeof prefix === "string" && prefix.trim().length
        ? prefix
        : t("snapshots.beforeSettingsPrefix", "Before Settings");

    if (state.editorDirty) {
      console.log("[Navigation] Unsaved changes detected, auto-saving before navigation...");
      const saved = await saveConfigFile({ silent: true, createSnapshot: false });
      if (!saved) {
        console.warn("[Navigation] Auto-save before navigation failed, aborting");
        return false;
      }
      console.log("[Navigation] Auto-save completed, proceeding to snapshot");
    }

    const snapshotName = await createAutoSnapshot(state.currentClientId, resolvedPrefix);
    if (snapshotName) {
      console.log("[Navigation] Protective auto snapshot created:", snapshotName);
    } else {
      console.warn("[Navigation] Protective auto snapshot skipped or failed");
      showToast(
        t("snapshots.createFailedWarning", "Failed to create protective snapshot"),
        "warning"
      );
    }
    return true;
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:359~368` (navigateToSettingsTab): 设置页面导航函数

  ```javascript
  const navigateToSettingsTab = async (hash = "#general") => {
    const prefix = t("snapshots.beforeSettingsPrefix", "Before Settings");
    const prepared = await ensureProtectiveSnapshotBeforeNavigation(prefix);
    if (!prepared) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.location.href = `settings.html${hash}`;
    return true;
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/api.js:74~88` (SnapshotAPI.create): 前端 API 封装

  ```javascript
  export const SnapshotAPI = {
    create: (clientId, name, isAuto = false, content = "") => {
      const normalizedIsAuto =
        typeof isAuto === "string"
          ? isAuto.toLowerCase() === "auto"
          : Boolean(isAuto);
      const safeContent = typeof content === "string" ? content : "";
      return call("create_snapshot", {
        clientId,
        name,
        content: safeContent,
        isAuto: normalizedIsAuto,
      });
    },
    // ...
  };
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/storage/snapshot_repository.rs:40~49` (create_snapshot): Rust 端快照创建逻辑，包含内容未变化检查

  ```rust
  if is_auto {
      if let Some(latest) = config
          .snapshots
          .iter()
          .max_by(|a, b| a.created_at.cmp(&b.created_at))
      {
          if latest.content_hash == content_hash {
              return Err("内容未变化,跳过快照创建".to_string());
          }
      }
  }
  ```

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/commands/snapshot.rs:52~85` (create_snapshot): Rust 端命令处理函数

  ```rust
  #[tauri::command]
  pub fn create_snapshot(
      snapshot_repository: State<'_, Arc<Mutex<SnapshotRepository>>>,
      client_repository: State<'_, Arc<Mutex<ClientRepository>>>,
      client_id: String,
      name: String,
      content: String,
      is_auto: bool,
  ) -> Result<Snapshot, String> {
      // 验证客户端，读取配置文件，创建快照
      // 成功时返回 Ok(Snapshot)，失败时返回 Err(String)
  }
  ```

### Report

#### conclusions

- 问题根源: `ensureProtectiveSnapshotBeforeNavigation` 函数无法区分 `createAutoSnapshot` 返回 `null` 的原因，将"内容未变化"（正常情况）误判为"快照创建失败"（错误情况）
- 调用链: Settings 菜单点击 → `navigateToSettingsTab` → `ensureProtectiveSnapshotBeforeNavigation` → `createAutoSnapshot` → `SnapshotAPI.create` → Rust `create_snapshot`
- 期望行为: 内容未变化时不显示警告，只有在真正出错时才显示警告
- 影响范围: 所有通过 `ensureProtectiveSnapshotBeforeNavigation` 进行导航的场景

#### relations

- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:327~357` → `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:285~304`: 调用 `createAutoSnapshot` 并处理返回值
- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js:285~304` → `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/api.js:74~88`: 调用 `SnapshotAPI.create`
- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/api.js:74~88` → `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/commands/snapshot.rs:52~85`: Tauri 命令调用
- `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/commands/snapshot.rs:52~85` → `/Volumes/PC811/Users/user/apps/SystemPromptVault/src-tauri/src/storage/snapshot_repository.rs:40~49`: 内容变化检查
- `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/utils.js:54`: 警告显示函数

#### result

前端快照逻辑存在以下关键问题:

1. **逻辑缺陷**: `ensureProtectiveSnapshotBeforeNavigation` 函数第 346-355 行存在错误逻辑，无法区分 `createAutoSnapshot` 返回 `null` 的两种不同原因:
   - 正常情况: 内容未变化，跳过快照创建（返回 null 是预期行为）
   - 错误情况: 真正的创建失败（返回 null 表示错误）

2. **误导性警告**: 在内容未变化的正常情况下，用户会看到 "Failed to create protective snapshot" 警告，造成困惑

3. **调用位置**: 目前仅在第 361 行的 `navigateToSettingsTab` 中调用，影响 Settings 菜单的用户体验

4. **源码位置**:
   - 前端源码: `/Volumes/PC811/Users/user/apps/SystemPromptVault/dist/js/main.js`
   - 构建配置: 使用 Vite，源码目录 `dist/`，构建输出目录 `build/`

5. **错误处理**: Rust 端通过 `Err("内容未变化,跳过快照创建".to_string())` 返回特定错误信息，前端通过字符串匹配 "内容未变化" 来识别正常情况

#### attention

- `ensureProtectiveSnapshotBeforeNavigation` 函数需要能够区分两种不同的 `null` 返回原因
- 建议修改 `createAutoSnapshot` 函数，使用明确的返回值来区分不同情况
- 需要同时更新相关的错误处理逻辑，确保只有真正的错误才显示警告
- 修改需要保持向后兼容性，不破坏现有的快照功能