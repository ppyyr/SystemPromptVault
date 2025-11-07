import { PromptAPI, ClientAPI, ConfigFileAPI, AppStateAPI } from "./api.js";
import { showToast, showLoading, hideLoading } from "./utils.js";

const state = {
  clients: [],
  currentClientId: "claude",
  prompts: [],
  selectedTags: [],
  configContent: "",
};

const elements = {};

const withLoading = async (task) => {
  showLoading();
  try {
    return await task();
  } finally {
    hideLoading();
  }
};

const cacheElements = () => {
  elements.clientTabs = document.getElementById("clientTabs");
  elements.configFileName = document.getElementById("configFileName");
  elements.configEditor = document.getElementById("configEditor");
  elements.btnSaveConfig = document.getElementById("btnSaveConfig");
  elements.tagFilter = document.getElementById("tagFilter");
  elements.promptList = document.getElementById("promptList");
};

const bindEvents = () => {
  elements.btnSaveConfig?.addEventListener("click", () => {
    saveConfigFile();
  });
  elements.configEditor?.addEventListener("input", (event) => {
    state.configContent = event.target.value;
  });
};

const initApp = async () => {
  cacheElements();
  bindEvents();
  try {
    await withLoading(async () => {
      await loadClients();
      await hydrateAppState();
      await loadPrompts();
      await loadConfigFile(state.currentClientId);
    });
    renderClientTabs();
    renderTagFilter();
    renderPromptList();
  } catch (error) {
    showToast(getErrorMessage(error) || "初始化失败", "error");
  }
};

const loadClients = async () => {
  const clients = await ClientAPI.getAll();
  state.clients = Array.isArray(clients) ? clients : [];
  if (!state.clients.length) {
    throw new Error("尚未配置任何客户端");
  }
};

const hydrateAppState = async () => {
  try {
    const appState = await AppStateAPI.get();
    if (appState?.current_client_id) {
      state.currentClientId = appState.current_client_id;
    }
  } catch (error) {
    showToast(getErrorMessage(error) || "加载应用状态失败，已使用默认客户端", "warning");
  }
  if (!state.clients.some((client) => client.id === state.currentClientId)) {
    state.currentClientId = state.clients[0].id;
  }
};

const loadPrompts = async () => {
  try {
    const prompts = await PromptAPI.getAll();
    state.prompts = Array.isArray(prompts) ? prompts : [];
  } catch (error) {
    throw new Error(getErrorMessage(error) || "加载提示词失败");
  }
};

const loadConfigFile = async (clientId) => {
  if (!clientId) return;
  try {
    const content = await ConfigFileAPI.read(clientId);
    state.configContent = content ?? "";
  } catch (error) {
    state.configContent = "";
    showToast(getErrorMessage(error) || "读取配置文件失败", "error");
  }
  syncEditor();
};

const saveConfigFile = async ({ silent = false } = {}) => {
  if (!state.currentClientId) return false;
  try {
    await withLoading(async () => {
      await ConfigFileAPI.write(state.currentClientId, state.configContent);
    });
    if (!silent) {
      showToast("配置已保存", "success");
    }
    return true;
  } catch (error) {
    showToast(getErrorMessage(error) || "保存配置失败", "error");
    return false;
  }
};

const switchClient = async (clientId) => {
  if (clientId === state.currentClientId) return;
  state.currentClientId = clientId;
  state.selectedTags = [];
  renderClientTabs();
  renderTagFilter();
  renderPromptList();
  try {
    await withLoading(async () => {
      await AppStateAPI.setCurrentClient(clientId);
      await loadConfigFile(clientId);
    });
  } catch (error) {
    showToast(getErrorMessage(error) || "切换客户端失败", "error");
  }
};

const applyPrompt = async (promptId) => {
  const prompt = state.prompts.find((item) => item.id === promptId);
  if (!prompt) {
    showToast("未找到提示词", "error");
    return;
  }
  const editor = elements.configEditor;
  if (!editor) return;
  // 直接替换内容，而不是追加
  editor.value = prompt.content;
  state.configContent = prompt.content;
  const saved = await saveConfigFile({ silent: true });
  if (saved) {
    showToast(`已应用提示词「${prompt.name}」`, "success");
  }
};

const appendPrompt = async (promptId) => {
  const prompt = state.prompts.find((item) => item.id === promptId);
  if (!prompt) {
    showToast("未找到提示词", "error");
    return;
  }
  const editor = elements.configEditor;
  if (!editor) return;
  // 追加内容到现有内容后面
  const needsSpacer = editor.value.trim().length > 0;
  const nextValue = `${editor.value}${needsSpacer ? "\n\n" : ""}${prompt.content}`;
  editor.value = nextValue;
  state.configContent = nextValue;
  const saved = await saveConfigFile({ silent: true });
  if (saved) {
    showToast(`已追加提示词「${prompt.name}」`, "success");
  }
};

const toggleTagFilter = (tag) => {
  const index = state.selectedTags.indexOf(tag);
  if (index >= 0) {
    state.selectedTags.splice(index, 1);
  } else {
    state.selectedTags.push(tag);
  }
  renderTagFilter();
  renderPromptList();
};

const renderClientTabs = () => {
  const container = elements.clientTabs;
  if (!container) return;
  container.innerHTML = "";
  state.clients.forEach((client) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "client-tab";
    tab.textContent = client.name;
    if (client.id === state.currentClientId) {
      tab.classList.add("active");
    }
    tab.addEventListener("click", () => switchClient(client.id));
    container.appendChild(tab);
  });
  updateEditorAvailability();
};

const renderTagFilter = () => {
  const container = elements.tagFilter;
  if (!container) return;
  container.innerHTML = "";
  const tags = getAllTags();
  if (!tags.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "暂无标签";
    container.appendChild(empty);
    return;
  }
  const autoTags = getAutoTags();
  tags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-filter-btn";
    btn.textContent = tag;
    const isAuto = autoTags.includes(tag);
    const isSelected = state.selectedTags.includes(tag) || isAuto;
    if (isSelected) {
      btn.classList.add("active");
    }
    if (isAuto) {
      btn.disabled = true;
      btn.title = "由当前客户端自动应用";
    } else {
      btn.addEventListener("click", () => toggleTagFilter(tag));
    }
    container.appendChild(btn);
  });
};

const renderPromptList = () => {
  const container = elements.promptList;
  if (!container) return;
  container.innerHTML = "";
  const prompts = getFilteredPrompts();
  if (!prompts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂无符合条件的提示词";
    container.appendChild(empty);
    return;
  }
  prompts.forEach((prompt) => {
    const card = document.createElement("article");
    card.className = "prompt-card";

    const header = document.createElement("div");
    header.className = "prompt-card-header";

    const info = document.createElement("div");
    info.className = "prompt-info";
    const title = document.createElement("h4");
    title.textContent = prompt.name;
    info.appendChild(title);

    const tags = document.createElement("div");
    tags.className = "prompt-tags";
    (prompt.tags ?? []).forEach((tag) => {
      const badge = document.createElement("span");
      badge.className = "prompt-tag";
      badge.textContent = tag;
      tags.appendChild(badge);
    });
    info.appendChild(tags);

    header.appendChild(info);

    const buttonContainer = document.createElement("div");
    buttonContainer.className = "prompt-card-buttons";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "btn btn-primary";
    applyBtn.textContent = "应用";
    applyBtn.addEventListener("click", () => applyPrompt(prompt.id));
    buttonContainer.appendChild(applyBtn);

    const appendBtn = document.createElement("button");
    appendBtn.type = "button";
    appendBtn.className = "btn btn-secondary-outline";
    appendBtn.textContent = "追加";
    appendBtn.addEventListener("click", () => appendPrompt(prompt.id));
    buttonContainer.appendChild(appendBtn);

    header.appendChild(buttonContainer);

    const content = document.createElement("pre");
    content.className = "prompt-content";
    content.textContent = prompt.content;

    card.appendChild(header);
    card.appendChild(content);
    container.appendChild(card);
  });
};

const getFilteredPrompts = () => {
  const activeTags = getActiveTags();
  if (!activeTags.length) return state.prompts;
  return state.prompts.filter((prompt) =>
    activeTags.every((tag) => (prompt.tags ?? []).includes(tag))
  );
};

const getAllTags = () => {
  const tagSet = new Set();
  state.prompts.forEach((prompt) => {
    (prompt.tags ?? []).forEach((tag) => {
      if (tag?.trim()) {
        tagSet.add(tag);
      }
    });
  });
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
};

const getAutoTags = () => {
  const client = getCurrentClient();
  if (client?.auto_tag) {
    return [client.id];
  }
  return [];
};

const getActiveTags = () => {
  const candidates = [...getAutoTags(), ...state.selectedTags];
  if (!candidates.length) return [];
  return Array.from(new Set(candidates));
};

const getCurrentClient = () => state.clients.find((client) => client.id === state.currentClientId);

const syncEditor = () => {
  if (elements.configEditor) {
    elements.configEditor.value = state.configContent;
  }
  updateEditorAvailability();
  updateConfigFileName();
};

const updateConfigFileName = () => {
  if (!elements.configFileName) return;
  const client = getCurrentClient();
  if (!client) {
    elements.configFileName.textContent = "未选择客户端";
    return;
  }
  const filePath = client.config_file_path || "";
  const fileName = filePath.split(/[/\\]/).filter(Boolean).pop();
  elements.configFileName.textContent = fileName || filePath || client.name;
};

const updateEditorAvailability = () => {
  const hasClient = Boolean(getCurrentClient());
  if (elements.configEditor) {
    elements.configEditor.disabled = !hasClient;
  }
  if (elements.btnSaveConfig) {
    elements.btnSaveConfig.disabled = !hasClient;
  }
};

const getErrorMessage = (error) => (typeof error === "string" ? error : error?.message);

document.addEventListener("DOMContentLoaded", initApp);
