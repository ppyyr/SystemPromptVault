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
  add: (id, name, configFilePath) => call("add_custom_client", { id, name, configFilePath }),
  update: (id, name, configFilePath, autoTag) =>
    call("update_client", { id, name, configFilePath, autoTag }),
  delete: (id) => call("delete_client", { id }),
};

export const ConfigFileAPI = {
  read: (clientId) => call("read_config_file", { clientId }),
  write: (clientId, content) => call("write_config_file", { clientId, content }),
};

export const AppStateAPI = {
  get: () => call("get_app_state"),
  setCurrentClient: (clientId) => call("set_current_client", { clientId }),
  saveWindowState: (x, y, width, height) =>
    call("save_window_state", { x, y, width, height }),
  getWindowState: () => call("get_window_state"),
};

export const SnapshotAPI = {
  create: (clientId, name, content, isAuto) =>
    call("create_snapshot", { clientId, name, content, isAuto }),
  getAll: (clientId) => call("get_snapshots", { clientId }),
  restore: (clientId, snapshotId) => call("restore_snapshot", { clientId, snapshotId }),
  delete: (clientId, snapshotId) => call("delete_snapshot", { clientId, snapshotId }),
  rename: (clientId, snapshotId, newName) =>
    call("rename_snapshot", { clientId, snapshotId, newName }),
  setMaxSnapshots: (clientId, max) => call("set_max_snapshots", { clientId, max }),
  refreshTrayMenu: () => call("refresh_tray_menu"),
};
