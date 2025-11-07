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
  tbody.innerHTML = "";
  if (!state.prompts.length) {
    appendEmptyRow(tbody, 4, "暂无提示词");
    return;
  }
  const sorted = [...state.prompts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  sorted.forEach((prompt) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = prompt.name;

    const tagCell = document.createElement("td");
    if (prompt.tags?.length) {
      const group = document.createElement("div");
      group.className = "tag-group";
      prompt.tags.forEach((tag) => {
        const badge = document.createElement("span");
        badge.className = "prompt-tag";
        badge.textContent = tag;
        group.appendChild(badge);
      });
      tagCell.appendChild(group);
    } else {
      tagCell.textContent = "—";
    }

    const timeCell = document.createElement("td");
    timeCell.textContent = formatDateTime(prompt.created_at);

    const actionCell = document.createElement("td");
    actionCell.className = "table-actions table-actions-column";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary-outline";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => showPromptModal(prompt.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-secondary-outline";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => deletePrompt(prompt.id));

    actionCell.appendChild(editBtn);
    actionCell.appendChild(deleteBtn);

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
  tbody.innerHTML = "";
  if (!state.clients.length) {
    appendEmptyRow(tbody, 6, "暂无客户端");
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
    const idCell = document.createElement("td");
    idCell.textContent = client.id;

    const nameCell = document.createElement("td");
    nameCell.textContent = client.name;

    const pathCell = document.createElement("td");
    pathCell.textContent = client.config_file_path;

    const autoTagCell = document.createElement("td");
    autoTagCell.textContent = client.auto_tag ? "是" : "否";

    const builtinCell = document.createElement("td");
    builtinCell.textContent = client.is_builtin ? "是" : "否";

    const actionCell = document.createElement("td");
    actionCell.className = "table-actions table-actions-column";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary-outline";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => showClientModal(client.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-secondary-outline";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => deleteClient(client.id));

    actionCell.appendChild(editBtn);
    actionCell.appendChild(deleteBtn);

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
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  Object.entries(elements.tabPanels).forEach(([id, panel]) => {
    panel?.classList.toggle("active", id === targetId);
  });
};

const getErrorMessage = (error) => (typeof error === "string" ? error : error?.message);

document.addEventListener("DOMContentLoaded", initSettings);
