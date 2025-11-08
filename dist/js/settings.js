import { PromptAPI, ClientAPI } from "./api.js";
import { showToast, showConfirm, showLoading, hideLoading } from "./utils.js";
import { initTheme, createThemeToggleButton, updateThemeIcon } from "./theme.js";

const state = {
  prompts: [],
  clients: [],
  editingPromptId: null,
  editingClientId: null,
};

const elements = {
  promptTable: null,
  clientTable: null,
  emptyStatePrompt: null,
  emptyStateClient: null,
  modalPrompt: null,
  modalClient: null,
  modalPromptTitle: null,
  modalClientTitle: null,
  formPrompt: null,
  formClient: null,
  inputPromptName: null,
  inputPromptTags: null,
  inputPromptContent: null,
  inputClientId: null,
  inputClientName: null,
  inputClientPath: null,
  inputClientAutoTag: null,
  btnNewPrompt: null,
  btnExportPrompts: null,
  btnImportPrompts: null,
  inputImportPrompts: null,
  btnNewClient: null,
  tagSuggestions: null,
  settingsDropdown: null,
  settingsDropdownToggle: null,
  settingsDropdownLabel: null,
  settingsDropdownPanel: null,
  settingsDropdownList: null,
  promptActions: null,
};

const withLoading = async (task) => {
  showLoading();
  try {
    return await task();
  } finally {
    hideLoading();
  }
};

const cacheElements = () => {
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
  elements.btnExportPrompts = document.getElementById("btnExportPrompts");
  elements.btnImportPrompts = document.getElementById("btnImportPrompts");
  elements.inputImportPrompts = document.getElementById("inputImportPrompts");
  elements.btnNewClient = document.getElementById("btnNewClient");
  elements.tagSuggestions = document.getElementById("tagSuggestions");
  elements.settingsDropdown = document.getElementById("settingsDropdown");
  elements.settingsDropdownToggle = document.getElementById("settingsDropdownToggle");
  elements.settingsDropdownLabel = document.getElementById("settingsDropdownLabel");
  elements.settingsDropdownPanel = document.getElementById("settingsDropdownPanel");
  elements.settingsDropdownList = document.getElementById("settingsDropdownList");
  elements.promptActions = document.getElementById("promptActions");
};

const bindEvents = () => {
  elements.btnNewPrompt?.addEventListener("click", () => showPromptModal());
  elements.btnExportPrompts?.addEventListener("click", handleExportPrompts);
  elements.btnImportPrompts?.addEventListener("click", () =>
    elements.inputImportPrompts?.click()
  );
  elements.inputImportPrompts?.addEventListener("change", handleImportFileChange);
  elements.btnNewClient?.addEventListener("click", () => showClientModal());
  elements.formPrompt?.addEventListener("submit", handlePromptSubmit);
  elements.formClient?.addEventListener("submit", handleClientSubmit);
  elements.settingsDropdownToggle?.addEventListener("click", toggleSettingsDropdown);
  elements.settingsDropdownList?.addEventListener("click", (event) => {
    const option =
      event.target instanceof Element ? event.target.closest(".client-dropdown__option") : null;
    if (!option) return;
    const targetId = option.getAttribute("data-target");
    if (targetId) {
      switchTab(targetId);
      closeSettingsDropdown();
    }
  });
  document.addEventListener("click", (event) => {
    if (elements.settingsDropdown && !elements.settingsDropdown.contains(event.target)) {
      closeSettingsDropdown();
    }
  });
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
      closeSettingsDropdown();
    }
  });
};

const initButtonTooltips = () => {
  const tooltip = document.getElementById("buttonTooltip");
  if (!tooltip) return;

  let activeTarget = null;
  let removeActiveListeners = null;

  const releaseActiveTarget = () => {
    if (removeActiveListeners) {
      removeActiveListeners();
      removeActiveListeners = null;
    }
    activeTarget = null;
  };

  const hideTooltip = () => {
    releaseActiveTarget();
    tooltip.classList.add("hidden");
    tooltip.textContent = "";
    tooltip.style.left = "";
    tooltip.style.top = "";
    tooltip.setAttribute("aria-hidden", "true");
  };

  const updatePosition = (clientX, clientY) => {
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = clientX + 10;
    let top = clientY + 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
      left = clientX - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight - 10) {
      top = clientY - tooltipRect.height - 10;
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const handleEnter = (event) => {
    const candidate =
      event.target instanceof Element ? event.target.closest("[data-tooltip]") : null;
    if (!candidate || candidate === activeTarget) {
      return;
    }
    const text = candidate.getAttribute("data-tooltip");
    if (!text) {
      return;
    }

    releaseActiveTarget();
    tooltip.textContent = text;
    tooltip.classList.remove("hidden");
    tooltip.setAttribute("aria-hidden", "false");
    updatePosition(event.clientX, event.clientY);
    activeTarget = candidate;

    const handleMouseMove = (moveEvent) => updatePosition(moveEvent.clientX, moveEvent.clientY);
    const handleMouseLeave = () => {
      candidate.removeEventListener("mousemove", handleMouseMove);
      candidate.removeEventListener("mouseleave", handleMouseLeave);
      hideTooltip();
    };

    candidate.addEventListener("mousemove", handleMouseMove);
    candidate.addEventListener("mouseleave", handleMouseLeave, { once: true });
    removeActiveListeners = () => {
      candidate.removeEventListener("mousemove", handleMouseMove);
      candidate.removeEventListener("mouseleave", handleMouseLeave);
    };
  };

  document.addEventListener("mouseenter", handleEnter, true);
  document.addEventListener("scroll", hideTooltip, true);
  document.addEventListener("pointerdown", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hideTooltip();
    }
  });
};

const initSettings = async () => {
  // 初始化主题
  initTheme();

  // 添加主题切换按钮
  const themeContainer = document.getElementById('themeToggleContainer');
  if (themeContainer) {
    themeContainer.appendChild(createThemeToggleButton());
    updateThemeIcon();
  }

  cacheElements();
  bindEvents();
  switchTab("tabPrompts");
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
    row.className = "hover:bg-gray-50 dark:hover:bg-gray-700";

    const nameCell = document.createElement("td");
    nameCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    nameCell.textContent = prompt.name;

    const tagCell = document.createElement("td");
    tagCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    if (prompt.tags?.length) {
      const group = document.createElement("div");
      group.className = "flex flex-wrap gap-2";
      prompt.tags.forEach((tag) => {
        const badge = document.createElement("span");
        badge.className = "inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-primary-50 dark:bg-primary/20 border border-transparent dark:border-primary/30";
        badge.style.color = "var(--color-muted)";
        badge.textContent = tag;
        group.appendChild(badge);
      });
      tagCell.appendChild(group);
    } else {
      tagCell.textContent = "—";
    }

    const timeCell = document.createElement("td");
    timeCell.className = "px-4 py-3 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700";
    timeCell.textContent = formatDateTime(prompt.created_at);

    const actionCell = document.createElement("td");
    actionCell.className = "px-4 py-3 text-sm text-right border-b border-gray-200 dark:border-gray-700";
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "flex items-center justify-end gap-2";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-icon btn-icon-primary";
    editBtn.setAttribute("aria-label", "编辑提示词");
    editBtn.setAttribute("data-tooltip", "编辑");
    editBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>
    `;
    editBtn.addEventListener("click", () => showPromptModal(prompt.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-icon btn-icon-primary";
    deleteBtn.setAttribute("aria-label", "删除提示词");
    deleteBtn.setAttribute("data-tooltip", "删除");
    deleteBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    `;
    deleteBtn.addEventListener("click", () => deletePrompt(prompt.id));

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    actionCell.appendChild(actionsDiv);

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
    row.className = "hover:bg-gray-50 dark:hover:bg-gray-700";

    const idCell = document.createElement("td");
    idCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 font-mono";
    idCell.textContent = client.id;

    const nameCell = document.createElement("td");
    nameCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    nameCell.textContent = client.name;

    const pathCell = document.createElement("td");
    pathCell.className = "px-4 py-3 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 font-mono text-xs";
    pathCell.textContent = client.config_file_path;

    const autoTagCell = document.createElement("td");
    autoTagCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    autoTagCell.textContent = client.auto_tag ? "是" : "否";

    const builtinCell = document.createElement("td");
    builtinCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    builtinCell.textContent = client.is_builtin ? "是" : "否";

    const actionCell = document.createElement("td");
    actionCell.className = "px-4 py-3 text-sm text-right border-b border-gray-200 dark:border-gray-700";
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "flex items-center justify-end gap-2";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-icon btn-icon-primary";
    editBtn.setAttribute("aria-label", "编辑客户端");
    editBtn.setAttribute("data-tooltip", "编辑");
    editBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>
    `;
    editBtn.addEventListener("click", () => showClientModal(client.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-icon btn-icon-primary";
    deleteBtn.setAttribute("aria-label", "删除客户端");
    deleteBtn.setAttribute("data-tooltip", "删除");
    deleteBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    `;
    // 只有一个客户端时不允许删除
    const isOnlyClient = state.clients.length <= 1;
    deleteBtn.disabled = isOnlyClient;
    deleteBtn.title = isOnlyClient ? "至少需要保留一个客户端" : "";
    deleteBtn.addEventListener("click", () => deleteClient(client.id));

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    actionCell.appendChild(actionsDiv);

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

const handleExportPrompts = async () => {
  try {
    const data = await withLoading(async () => PromptAPI.exportPrompts());
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prompts_backup_${formatExportTimestamp()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("提示词已导出", "success");
  } catch (error) {
    showToast(getErrorMessage(error) || "导出提示词失败", "error");
  }
};

const handleImportFileChange = async (event) => {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    const content = await file.text();
    validateImportPayload(content);
    const importResult = await withLoading(async () => {
      const result = await PromptAPI.importPrompts(content);
      await loadPrompts();
      return result;
    });
    const { total = 0, added = 0, updated = 0 } = importResult || {};
    let message;
    if (total === 0) {
      message = "未导入任何提示词";
    } else if (added === total) {
      message = `成功导入 ${total} 个新提示词`;
    } else if (added === 0) {
      message = `已更新 ${updated} 个提示词`;
    } else {
      message = `成功导入 ${total} 个提示词（新增 ${added} 个，更新 ${updated} 个）`;
    }
    showToast(message, "success");
  } catch (error) {
    showToast(getErrorMessage(error) || "导入提示词失败", "error");
  } finally {
    if (event.target) {
      event.target.value = "";
    }
  }
};

const validateImportPayload = (jsonText) => {
  if (!jsonText.trim()) {
    throw new Error("导入文件为空");
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error("JSON 格式无效");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("JSON 内容必须是提示词数组");
  }
};

const deleteClient = async (clientId) => {
  if (!clientId) return;
  // 检查是否只有一个客户端
  if (state.clients.length <= 1) {
    showToast("至少需要保留一个客户端", "error");
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

const formatExportTimestamp = () => {
  const now = new Date();
  const pad = (value) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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

const toggleSettingsDropdown = () => {
  const toggle = elements.settingsDropdownToggle;
  const panel = elements.settingsDropdownPanel;
  if (!toggle || !panel) return;

  const isOpen = panel.getAttribute("aria-hidden") === "false";
  if (isOpen) {
    closeSettingsDropdown();
  } else {
    panel.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
  }
};

const closeSettingsDropdown = () => {
  const toggle = elements.settingsDropdownToggle;
  const panel = elements.settingsDropdownPanel;
  if (!toggle || !panel) return;
  panel.setAttribute("aria-hidden", "true");
  toggle.setAttribute("aria-expanded", "false");
};

const updateSettingsDropdownLabel = (targetId) => {
  const label = elements.settingsDropdownLabel;
  if (!label) return;
  const labelText = targetId === "tabPrompts" ? "提示词管理" : "客户端管理";
  label.textContent = labelText;
};

const switchTab = (targetId) => {
  document.querySelectorAll('[role="tabpanel"]').forEach((panel) => {
    const isActive = panel.id === targetId;
    panel.classList.toggle("hidden", !isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
  });

  document.querySelectorAll(".client-dropdown__option").forEach((option) => {
    const isActive = option.getAttribute("data-target") === targetId;
    option.setAttribute("aria-selected", String(isActive));
  });

  updateSettingsDropdownLabel(targetId);

  if (elements.promptActions) {
    elements.promptActions.classList.toggle("hidden", targetId !== "tabPrompts");
  }
};

const getErrorMessage = (error) => (typeof error === "string" ? error : error?.message);

document.addEventListener("DOMContentLoaded", () => {
  initButtonTooltips();
  initSettings();
});
