import { invoke } from "@tauri-apps/api/core";

const call = async (command, params = {}) => {
  try {
    return await invoke(command, params);
  } catch (error) {
    console.error(`调用命令 ${command} 失败:`, error);
    throw error;
  }
};

export const PromptAPI = {
  getAll: () => call("get_all_prompts"),
  getById: (id) => call("get_prompt_by_id", { id }),
  getByTags: (tags) => call("get_prompts_by_tags", { tags }),
  create: (name, content, tags) => call("create_prompt", { name, content, tags }),
  update: (id, name, content, tags) => call("update_prompt", { id, name, content, tags }),
  delete: (id) => call("delete_prompt", { id }),
  exportPrompts: () => call("export_prompts"),
  importPrompts: (jsonData) => call("import_prompts", { jsonData }),
};

export const ClientAPI = {
  getAll: () => call("get_all_clients"),
  getById: (id) => call("get_client_by_id", { id }),
  add: (id, name, configFilePaths) =>
    call("add_custom_client", { id, name, configFilePaths }),
  update: (id, name, configFilePaths, activeConfigPath, autoTag) => {
    const params = { id };
    if (name !== undefined) params.name = name;
    if (configFilePaths !== undefined) params.configFilePaths = configFilePaths;
    if (activeConfigPath !== undefined) params.activeConfigPath = activeConfigPath;
    if (autoTag !== undefined) params.autoTag = autoTag;
    return call("update_client", params);
  },
  delete: (id) => call("delete_client", { id }),
};

export const ConfigFileAPI = {
  read: (clientId, configPath = null) => {
    const params = { clientId };
    if (configPath !== null && configPath !== undefined) {
      params.configPath = configPath;
    }
    return call("read_config_file", params);
  },
  write: (clientId, content, configPath = null) => {
    const params = { clientId, content };
    if (configPath !== null && configPath !== undefined) {
      params.configPath = configPath;
    }
    return call("write_config_file", params);
  },
};

export const AppStateAPI = {
  get: () => call("get_app_state"),
  setCurrentClient: (clientId) => call("set_current_client", { clientId }),
  saveWindowState: (x, y, width, height) =>
    call("save_window_state", { x, y, width, height }),
  getWindowState: () => call("get_window_state"),
  setWindowBehavior: (closeBehavior) =>
    call("set_window_behavior", { closeBehavior }),
  getWindowBehavior: () => call("get_window_behavior"),
};

export const SnapshotAPI = {
  create: (clientId, name, isAuto = false, content = "") => {
    // Accept legacy string values ("Auto"/"Manual") while preferring boolean input.
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
  getAll: (clientId) => call("get_snapshots", { clientId }),
  restore: (clientId, snapshotId) => call("restore_snapshot", { clientId, snapshotId }),
  delete: (clientId, snapshotId) => call("delete_snapshot", { clientId, snapshotId }),
  rename: (clientId, snapshotId, newName) =>
    call("rename_snapshot", { clientId, snapshotId, newName }),
  setMaxSnapshots: (clientId, max) => call("set_max_snapshots", { clientId, max }),
  setMaxAutoSnapshots: (clientId, max) => call("set_max_auto_snapshots", { clientId, max }),
  setMaxManualSnapshots: (clientId, max) => call("set_max_manual_snapshots", { clientId, max }),
  refreshTrayMenu: () => call("refresh_tray_menu"),
};
