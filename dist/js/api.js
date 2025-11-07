// 获取 Tauri invoke 函数
const getInvoke = async () => {
  // Tauri v2 使用 __TAURI_INTERNALS__
  if (window.__TAURI_INTERNALS__) {
    const { invoke } = window.__TAURI_INTERNALS__;
    return invoke;
  }

  // 等待 Tauri 加载 (最多等待5秒)
  const timeout = 5000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (window.__TAURI_INTERNALS__) {
      const { invoke } = window.__TAURI_INTERNALS__;
      return invoke;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error("Tauri API 加载超时");
};

const call = async (command, params = {}) => {
  try {
    const invoke = await getInvoke();
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
};
