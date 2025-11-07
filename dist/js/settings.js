import { PromptAPI, ClientAPI } from "./api.js";
import { showToast, showConfirm, showLoading, hideLoading } from "./utils.js";

const state = {
  prompts: [],
  clients: [],
  editingPromptId: null,
  editingClientId: null,
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
  elements.tabButtons = Array.from(document.querySelectorAll(".settings-tab"));
  elements.tabPanels = {
    tabPrompts: document.getElementById("tabPrompts"),
    tabClients: document.getElementById("tabClients"),
  };
  elements.promptTable = document.getElementById("promptTable");
  elements.clientTable = document.getElementById("clientTable");
  elements.emptyStatePrompt = document.getElementById("emptyState");
  elements.emptyStateClient = document.getElementById("emptyStateClient");
  elements.modalPrompt = document.getElementById("modalPrompt");
  elements.modalClient = document.getElementById("modalClient");
  elements.modalPromptTitle = document.getElementById("modalPromptTitle");
  elements.modalClientTitle = document.getElementById("modalClientTitle");
  elements.formPrompt = document.getElementById("formPrompt");
  elements.formClient = document.getElementById("formClient");
  elements.inputPromptName = document.getElementById("inputPromptName");
  elements.inputPromptTags = document.getElementById("inputPromptTags");
  elements.inputPromptContent = document.getElementById("inputPromptContent");
  elements.inputClientId = document.getElementById("inputClientId");
  elements.inputClientName = document.getElementById("inputClientName");
  elements.inputClientPath = document.getElementById("inputClientPath");
  elements.inputClientAutoTag = document.getElementById("inputClientAutoTag");
  elements.btnNewPrompt = document.getElementById("btnNewPrompt");
  elements.btnNewClient = document.getElementById("btnNewClient");
  elements.tagSuggestions = document.getElementById("tagSuggestions");
};

const bindEvents = () => {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.target);
    });
  });
  elements.btnNewPrompt?.addEventListener("click", () => showPromptModal());
  elements.btnNewClient?.addEventListener("click", () => showClientModal());
  elements.formPrompt?.addEventListener("submit", handlePromptSubmit);
  elements.formClient?.addEventListener("submit", handleClientSubmit);
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.closeModal;
      const modal = targetId ? document.getElementById(targetId) : null;
      if (modal === elements.modalPrompt) {
        closePromptModal();
      } else if (modal === elements.modalClient) {
        closeClientModal();
      }
    });
  });
  registerModalDismiss(elements.modalPrompt, closePromptModal);
  registerModalDismiss(elements.modalClient, closeClientModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePromptModal();
      closeClientModal();
    }
  });
};

const initSettings = async () => {
  cacheElements();
  bindEvents();
  setActiveTab("tabPrompts");
  try {
    await withLoading(async () => {
      await loadPrompts();
      await loadClients();
    });
  } catch (error) {
    showToast(getErrorMessage(error) || "初始化设置页失败", "error");
  }
};

const loadPrompts = async () => {
  try {
    const prompts = await PromptAPI.getAll();
    state.prompts = Array.isArray(prompts) ? prompts : [];
    renderPromptTable();
    updateTagSuggestions();
  } catch (error) {
    throw new Error(getErrorMessage(error) || "加载提示词失败");
  }
};

const loadClients = async () => {
  try {
    const clients = await ClientAPI.getAll();
    state.clients = Array.isArray(clients) ? clients : [];
    renderClientTable();
  } catch (error) {
    throw new Error(getErrorMessage(error) || "加载客户端失败");
  }
};

const renderPromptTable = () => {
  const tbody = elements.promptTable;
  if (!tbody) return;

  // 隐藏或显示空状态
  if (elements.emptyStatePrompt) {
    if (state.prompts.length === 0) {
      elements.emptyStatePrompt.classList.remove("hidden");
    } else {
      elements.emptyStatePrompt.classList.add("hidden");
    }
  }

  // 清除除空状态行之外的所有行
  const rows = Array.from(tbody.querySelectorAll("tr")).filter(
    (row) => row.id !== "emptyState"
  );
  rows.forEach((row) => row.remove());

  if (!state.prompts.length) {
    return;
  }

  const sorted = [...state.prompts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  sorted.forEach((prompt) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-gray-50/50";

    const nameCell = document.createElement("td");
    nameCell.className = "px-4 py-3 text-sm text-gray-900 border-b border-gray-200";
    nameCell.textContent = prompt.name;

    const tagCell = document.createElement("td");
    tagCell.className = "px-4 py-3 text-sm text-gray-900 border-b border-gray-200";
    if (prompt.tags?.length) {
      const group = document.createElement("div");
      group.className = "flex flex-wrap gap-2";
      prompt.tags.forEach((tag) => {
        const badge = document.createElement("span");
        badge.className = "inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-primary-50 text-primary";
        badge.textContent = tag;
        group.appendChild(badge);
      });
      tagCell.appendChild(group);
    } else {
      tagCell.textContent = "—";
    }

    const timeCell = document.createElement("td");
    timeCell.className = "px-4 py-3 text-sm text-gray-600 border-b border-gray-200";
    timeCell.textContent = formatDateTime(prompt.created_at);

    const actionCell = document.createElement("td");
    actionCell.className = "px-4 py-3 text-sm text-right border-b border-gray-200";
    const buttonGroup = document.createElement("div");
    buttonGroup.className = "flex justify-end gap-2 flex-wrap";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "bg-white text-gray-700 border border-gray-300 rounded-md px-3 py-1 text-sm font-semibold hover:border-primary hover:text-primary transition-all duration-200";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => showPromptModal(prompt.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "bg-white text-error border border-error rounded-md px-3 py-1 text-sm font-semibold hover:opacity-90 transition-all duration-200";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => deletePrompt(prompt.id));

    buttonGroup.appendChild(editBtn);
    buttonGroup.appendChild(deleteBtn);
    actionCell.appendChild(buttonGroup);

    row.appendChild(nameCell);
    row.appendChild(tagCell);
    row.appendChild(timeCell);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  });
};

const renderClientTable = () => {
  const tbody = elements.clientTable;
  if (!tbody) return;

  // 隐藏或显示空状态
  if (elements.emptyStateClient) {
    if (state.clients.length === 0) {
      elements.emptyStateClient.classList.remove("hidden");
    } else {
      elements.emptyStateClient.classList.add("hidden");
    }
  }

  // 清除除空状态行之外的所有行
  const rows = Array.from(tbody.querySelectorAll("tr")).filter(
    (row) => row.id !== "emptyStateClient"
  );
  rows.forEach((row) => row.remove());

  if (!state.clients.length) {
    return;
  }

  const sorted = [...state.clients].sort((a, b) => {
    if (a.is_builtin === b.is_builtin) {
      return a.name.localeCompare(b.name, "zh-CN");
    }
    return a.is_builtin ? -1 : 1;
  });
  sorted.forEach((client) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-gray-50/50";

    const idCell = document.createElement("td");
    idCell.className = "px-4 py-3 text-sm text-gray-900 border-b border-gray-200 font-mono";
    idCell.textContent = client.id;

    const nameCell = document.createElement("td");
    nameCell.className = "px-4 py-3 text-sm text-gray-900 border-b border-gray-200";
    nameCell.textContent = client.name;

    const pathCell = document.createElement("td");
    pathCell.className = "px-4 py-3 text-sm text-gray-600 border-b border-gray-200 font-mono text-xs";
    pathCell.textContent = client.config_file_path;

    const autoTagCell = document.createElement("td");
    autoTagCell.className = "px-4 py-3 text-sm text-gray-900 border-b border-gray-200";
    autoTagCell.textContent = client.auto_tag ? "是" : "否";

    const builtinCell = document.createElement("td");
    builtinCell.className = "px-4 py-3 text-sm text-gray-900 border-b border-gray-200";
    builtinCell.textContent = client.is_builtin ? "是" : "否";

    const actionCell = document.createElement("td");
    actionCell.className = "px-4 py-3 text-sm text-right border-b border-gray-200";
    const buttonGroup = document.createElement("div");
    buttonGroup.className = "flex justify-end gap-2 flex-wrap";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "bg-white text-gray-700 border border-gray-300 rounded-md px-3 py-1 text-sm font-semibold hover:border-primary hover:text-primary transition-all duration-200";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => showClientModal(client.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "bg-white text-error border border-error rounded-md px-3 py-1 text-sm font-semibold hover:opacity-90 transition-all duration-200";
    deleteBtn.textContent = "删除";
    deleteBtn.disabled = client.is_builtin;
    deleteBtn.title = client.is_builtin ? "内置客户端不可删除" : "";
    deleteBtn.addEventListener("click", () => deleteClient(client.id));

    buttonGroup.appendChild(editBtn);
    if (!client.is_builtin) {
      buttonGroup.appendChild(deleteBtn);
    }
    actionCell.appendChild(buttonGroup);

    row.appendChild(idCell);
    row.appendChild(nameCell);
    row.appendChild(pathCell);
    row.appendChild(autoTagCell);
    row.appendChild(builtinCell);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  });
};

const showPromptModal = (promptId = null) => {
  if (!elements.modalPrompt) return;
  state.editingPromptId = promptId;
  elements.modalPromptTitle.textContent = promptId ? "编辑提示词" : "新建提示词";
  elements.formPrompt?.reset();
  if (promptId) {
    const prompt = state.prompts.find((item) => item.id === promptId);
    if (!prompt) {
      showToast("未找到提示词", "error");
      return;
    }
    elements.inputPromptName.value = prompt.name;
    elements.inputPromptTags.value = prompt.tags?.join(", ") ?? "";
    elements.inputPromptContent.value = prompt.content;
  }
  toggleModal(elements.modalPrompt, true);
};

const closePromptModal = () => {
  if (!elements.modalPrompt || elements.modalPrompt.classList.contains("hidden")) return;
  state.editingPromptId = null;
  elements.formPrompt?.reset();
  toggleModal(elements.modalPrompt, false);
};

const showClientModal = (clientId = null) => {
  if (!elements.modalClient) return;
  state.editingClientId = clientId;
  elements.modalClientTitle.textContent = clientId ? "编辑客户端" : "新建客户端";
  elements.formClient?.reset();
  elements.inputClientId.disabled = Boolean(clientId);
  if (clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    if (!client) {
      showToast("未找到客户端", "error");
      return;
    }
    elements.inputClientId.value = client.id;
    elements.inputClientName.value = client.name;
    elements.inputClientPath.value = client.config_file_path;
    elements.inputClientAutoTag.checked = Boolean(client.auto_tag);
  }
  toggleModal(elements.modalClient, true);
};

const closeClientModal = () => {
  if (!elements.modalClient || elements.modalClient.classList.contains("hidden")) return;
  state.editingClientId = null;
  elements.formClient?.reset();
  elements.inputClientId.disabled = false;
  toggleModal(elements.modalClient, false);
};

const handlePromptSubmit = async (event) => {
  event.preventDefault();
  const name = elements.inputPromptName.value.trim();
  const content = elements.inputPromptContent.value.trim();
  if (!name || !content) {
    showToast("名称和内容不能为空", "warning");
    return;
  }
  const tags = parseTags(elements.inputPromptTags.value);
  try {
    await withLoading(async () => {
      if (state.editingPromptId) {
        await PromptAPI.update(state.editingPromptId, name, content, tags);
      } else {
        await PromptAPI.create(name, content, tags);
      }
      await loadPrompts();
    });
    showToast(state.editingPromptId ? "提示词已更新" : "提示词已创建", "success");
    closePromptModal();
  } catch (error) {
    showToast(getErrorMessage(error) || "保存提示词失败", "error");
  }
};

const handleClientSubmit = async (event) => {
  event.preventDefault();
  const id = elements.inputClientId.value.trim();
  const name = elements.inputClientName.value.trim();
  const path = elements.inputClientPath.value.trim();
  if (!id || !name || !path) {
    showToast("请填写完整客户端信息", "warning");
    return;
  }
  const autoTag = elements.inputClientAutoTag.checked;
  try {
    await withLoading(async () => {
      if (state.editingClientId) {
        await ClientAPI.update(id, name, path, autoTag);
      } else {
        await ClientAPI.add(id, name, path);
        if (autoTag) {
          await ClientAPI.update(id, undefined, undefined, autoTag);
        }
      }
      await loadClients();
    });
    showToast(state.editingClientId ? "客户端已更新" : "客户端已创建", "success");
    closeClientModal();
  } catch (error) {
    showToast(getErrorMessage(error) || "保存客户端失败", "error");
  }
};

const deletePrompt = async (promptId) => {
  if (!promptId) return;
  const confirmed = await showConfirm("确定要删除该提示词吗？");
  if (!confirmed) return;
  try {
    await withLoading(async () => {
      await PromptAPI.delete(promptId);
      await loadPrompts();
    });
    showToast("提示词已删除", "success");
  } catch (error) {
    showToast(getErrorMessage(error) || "删除提示词失败", "error");
  }
};

const deleteClient = async (clientId) => {
  if (!clientId) return;
  const client = state.clients.find((item) => item.id === clientId);
  if (client?.is_builtin) {
    showToast("内置客户端不可删除", "error");
    return;
  }
  const confirmed = await showConfirm("确定要删除该客户端吗？");
  if (!confirmed) return;
  try {
    await withLoading(async () => {
      await ClientAPI.delete(clientId);
      await loadClients();
    });
    showToast("客户端已删除", "success");
  } catch (error) {
    showToast(getErrorMessage(error) || "删除客户端失败", "error");
  }
};

const appendEmptyRow = (tbody, colspan, message) => {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = colspan;
  cell.className = "table-empty";
  cell.textContent = message;
  row.appendChild(cell);
  tbody.appendChild(row);
};

const parseTags = (raw) =>
  raw
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter((tag, index, arr) => tag && arr.indexOf(tag) === index);

const updateTagSuggestions = () => {
  if (!elements.tagSuggestions) return;
  elements.tagSuggestions.innerHTML = "";
  getAllPromptTags().forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    elements.tagSuggestions.appendChild(option);
  });
};

const getAllPromptTags = () => {
  const set = new Set();
  state.prompts.forEach((prompt) => {
    (prompt.tags ?? []).forEach((tag) => {
      if (tag?.trim()) {
        set.add(tag);
      }
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
};

const formatDateTime = (iso) => {
  if (!iso) return "未知";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
};

const registerModalDismiss = (modal, handler) => {
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      handler();
    }
  });
};

const toggleModal = (modal, visible) => {
  if (!modal) return;
  modal.classList.toggle("hidden", !visible);
  modal.setAttribute("aria-hidden", String(!visible));
};

const setActiveTab = (targetId) => {
  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.target === targetId;

    // 更新按钮样式
    if (isActive) {
      button.className = "border border-primary bg-primary text-white rounded-full px-4 py-2 font-semibold shadow-sm transition-all duration-200";
      button.setAttribute("aria-selected", "true");
    } else {
      button.className = "border border-gray-300 bg-white text-gray-700 rounded-full px-4 py-2 font-semibold hover:border-primary hover:text-primary transition-all duration-200";
      button.setAttribute("aria-selected", "false");
    }
  });

  // 切换面板显示
  Object.entries(elements.tabPanels).forEach(([id, panel]) => {
    if (!panel) return;
    if (id === targetId) {
      panel.classList.remove("hidden");
    } else {
      panel.classList.add("hidden");
    }
  });
};

const getErrorMessage = (error) => (typeof error === "string" ? error : error?.message);

document.addEventListener("DOMContentLoaded", initSettings);
