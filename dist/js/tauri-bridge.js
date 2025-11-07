// 等待 Tauri API 就绪
const waitForTauri = () => {
  return new Promise((resolve, reject) => {
    if (window.__TAURI__) {
      resolve(window.__TAURI__);
      return;
    }

    let attempts = 0;
    const maxAttempts = 50; // 5秒超时

    const checkTauri = () => {
      if (window.__TAURI__) {
        resolve(window.__TAURI__);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(checkTauri, 100);
      } else {
        reject(new Error("Tauri API 加载超时"));
      }
    };

    checkTauri();
  });
};

let tauriApi = null;

const getInvoke = async () => {
  if (!tauriApi) {
    tauriApi = await waitForTauri();
  }

  if (tauriApi?.core?.invoke) {
    return tauriApi.core.invoke;
  }
  if (tauriApi?.invoke) {
    return tauriApi.invoke;
  }
  throw new Error("Tauri invoke 方法不可用");
};

const call = async (command, payload = {}) => {
  try {
    const invoke = await getInvoke();
    return await invoke(command, payload);
  } catch (error) {
    console.error(`执行命令 ${command} 失败`, error);
    throw error;
  }
};

export const getTemplates = () => call("get_templates");
export const createTemplate = (name, files) =>
  call("create_template", { name, files });
export const updateTemplate = (id, name, files) =>
  call("update_template", { id, name, files });
export const deleteTemplate = (id) => call("delete_template", { id });
export const importTemplateFromProject = (projectPath, name) =>
  call("import_template_from_project", { project_path: projectPath, name });
export const selectProjectDirectory = () => call("select_project_directory");
export const applyTemplate = (projectPath, templateId) =>
  call("apply_template", { project_path: projectPath, template_id: templateId });
export const getProjectConfig = (projectPath) =>
  call("get_project_config", { project_path: projectPath });
export const listBackups = (projectPath) =>
  call("list_backups", { project_path: projectPath });
export const restoreBackup = (projectPath, backupId) =>
  call("restore_backup", { project_path: projectPath, backup_id: backupId });
export const getProjectHistory = (projectPath) =>
  call("get_project_history", { project_path: projectPath });
