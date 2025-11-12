import { PromptAPI, ClientAPI, SnapshotAPI, AppStateAPI } from "./api.js";
import { showToast, showConfirm, showLoading, hideLoading, showPrompt } from "./utils.js";
import { initTheme, createThemeToggleButton, updateThemeIcon } from "./theme.js";
import { getCurrentWindow } from "@tauri-apps/api/window";

const SNAPSHOT_LOAD_DEBOUNCE = 300;
const DEFAULT_MAX_SNAPSHOTS = 5;
const TAB_LABEL_MAP = {
  tabPrompts: "提示词管理",
  tabClients: "客户端管理",
  tabGeneral: "常规设置",
  tabSnapshots: "快照管理",
};

const appWindow = getCurrentWindow();
const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const state = {
  prompts: [],
  clients: [],
  editingPromptId: null,
  sourcePromptId: null,
  editingClientId: null,
  currentClientId: null,
  snapshotClientId: null,
  generalSettingsClientId: null,
  snapshotCache: {},
  snapshotLoadTimer: null,
  generalMaxSnapshots: DEFAULT_MAX_SNAPSHOTS,
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
  formGeneralSettings: null,
  inputMaxSnapshots: null,
  generalClientSelector: null,
  btnSaveGeneralSettings: null,
  snapshotClientSelector: null,
  snapshotTable: null,
  emptyStateSnapshot: null,
  snapshotEmptyMessage: null,
  btnRefreshSnapshots: null,
};

const withLoading = async (task) => {
  showLoading();
  try {
    return await task();
  } finally {
    hideLoading();
  }
};

// 监听窗口关闭事件，阻止默认行为并手动销毁窗口，确保设置页可通过标题栏按钮关闭
const setupWindowCloseHandler = async () => {
  if (!appWindow?.onCloseRequested) {
    return;
  }

  try {
    await appWindow.onCloseRequested(async (event) => {
      console.log("[SettingsWindow] 关闭请求触发");
      event.preventDefault();
      console.log("[SettingsWindow] 已阻止默认关闭行为，开始销毁窗口");

      try {
        await appWindow.destroy();
        console.log("[SettingsWindow] 窗口销毁成功");
      } catch (error) {
        console.error("[SettingsWindow] 关闭窗口失败:", error);
      }
    });
    console.log("[SettingsWindow] 窗口关闭事件监听器注册成功");
  } catch (error) {
    console.error("[SettingsWindow] 注册窗口关闭事件失败:", error);
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
  elements.formGeneralSettings = document.getElementById("formGeneralSettings");
  elements.inputMaxSnapshots = document.getElementById("inputMaxSnapshots");
  elements.generalClientSelector = document.getElementById("generalClientSelector");
  elements.btnSaveGeneralSettings =
    elements.formGeneralSettings?.querySelector('button[type="submit"]') ?? null;
  elements.snapshotClientSelector = document.getElementById("snapshotClientSelector");
  elements.snapshotTable = document.getElementById("snapshotTable");
  elements.emptyStateSnapshot = document.getElementById("emptyStateSnapshot");
  elements.snapshotEmptyMessage = document.getElementById("snapshotEmptyMessage");
  elements.btnRefreshSnapshots = document.getElementById("btnRefreshSnapshots");
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
  elements.formGeneralSettings?.addEventListener("submit", saveGeneralSettings);
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
  elements.generalClientSelector?.addEventListener("change", (event) => {
    const select = event.target;
    const clientId = select?.value ?? "";
    handleClientSelectionChange(clientId);
  });
  elements.snapshotClientSelector?.addEventListener("change", (event) => {
    const select = event.target;
    const clientId = select?.value ?? "";
    handleClientSelectionChange(clientId);
  });
  elements.btnRefreshSnapshots?.addEventListener("click", () => {
    if (!state.snapshotClientId) {
      showToast("暂无可用客户端", "warning");
      return;
    }
    loadSnapshotsTable(state.snapshotClientId, { silent: false });
  });
  elements.snapshotTable?.addEventListener("click", handleSnapshotActionClick);
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

  await setupWindowCloseHandler();
  cacheElements();
  bindEvents();
  switchTab("tabPrompts");
  try {
    await withLoading(async () => {
      await loadPrompts();
      await loadClients();
      await hydrateAppState();
      await loadSnapshotClients();
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

const hydrateAppState = async () => {
  try {
    const appState = await AppStateAPI.get();
    if (appState?.current_client_id) {
      state.currentClientId = appState.current_client_id;
    }
  } catch (error) {
    if (state.clients.length) {
      showToast(getErrorMessage(error) || "加载应用状态失败，已使用默认客户端", "warning");
    }
  }
  if (!state.clients.some((client) => client.id === state.currentClientId)) {
    state.currentClientId = state.clients[0]?.id ?? null;
  }
  if (!state.snapshotClientId) {
    state.snapshotClientId = state.currentClientId;
  }
  state.generalSettingsClientId = state.snapshotClientId ?? state.generalSettingsClientId;
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

    const duplicateBtn = document.createElement("button");
    duplicateBtn.type = "button";
    duplicateBtn.className = "btn-icon btn-icon-primary";
    duplicateBtn.setAttribute("aria-label", "复制提示词");
    duplicateBtn.setAttribute("data-tooltip", "复制");
    duplicateBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V5a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
      </svg>
    `;
    duplicateBtn.addEventListener("click", () => {
      const prefillData = {
        name: `${prompt.name} (副本)`,
        content: prompt.content,
        tags: prompt.tags,
        sourcePromptId: prompt.id,
      };
      showPromptModal(null, "create", prefillData);
    });

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
    actionsDiv.appendChild(duplicateBtn);
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

const loadSnapshotClients = async () => {
  const hasClients = state.clients.length > 0;
  populateClientSelector(elements.generalClientSelector, hasClients);
  populateClientSelector(elements.snapshotClientSelector, hasClients);

  if (!hasClients) {
    state.snapshotClientId = null;
    state.generalSettingsClientId = null;
    setGeneralSettingsDisabled(true);
    updateGeneralSettingsInput(DEFAULT_MAX_SNAPSHOTS);
    elements.btnRefreshSnapshots?.setAttribute("disabled", "true");
    renderSnapshotTable([]);
    setSnapshotEmptyState("暂无客户端");
    syncClientSelectors();
    return;
  }

  elements.btnRefreshSnapshots?.removeAttribute("disabled");
  setGeneralSettingsDisabled(false);

  if (!state.snapshotClientId || !state.clients.some((client) => client.id === state.snapshotClientId)) {
    state.snapshotClientId = state.currentClientId ?? state.clients[0].id;
  }
  state.generalSettingsClientId = state.snapshotClientId;
  syncClientSelectors();

  await loadSnapshotsTable(state.snapshotClientId, { silent: true });
  await loadGeneralSettings(state.snapshotClientId);
};

const populateClientSelector = (selector, hasClients) => {
  if (!selector) return;
  selector.innerHTML = "";
  if (!hasClients) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无客户端";
    selector.appendChild(option);
    selector.setAttribute("disabled", "true");
    return;
  }
  state.clients.forEach((client) => {
    const option = document.createElement("option");
    option.value = client.id;
    option.textContent = client.name;
    selector.appendChild(option);
  });
  selector.removeAttribute("disabled");
};

const syncClientSelectors = () => {
  [elements.generalClientSelector, elements.snapshotClientSelector].forEach((selector) => {
    if (!selector) return;
    if (!state.snapshotClientId) {
      selector.value = "";
    } else {
      selector.value = state.snapshotClientId;
    }
  });
};

const showPromptModal = (promptId = null, mode = null, prefillData = null) => {
  if (!elements.modalPrompt) return;
  const resolvedMode = mode ?? (promptId ? "edit" : "create");
  if (resolvedMode === "edit" && !promptId) {
    showToast("未找到提示词", "error");
    return;
  }
  state.editingPromptId = resolvedMode === "edit" ? promptId : null;
  state.sourcePromptId = prefillData?.sourcePromptId ?? null;
  elements.modalPromptTitle.textContent = resolvedMode === "edit" ? "编辑提示词" : "新建提示词";
  elements.formPrompt?.reset();
  if (resolvedMode === "edit") {
    const prompt = state.prompts.find((item) => item.id === promptId);
    if (!prompt) {
      showToast("未找到提示词", "error");
      return;
    }
    elements.inputPromptName.value = prompt.name;
    elements.inputPromptTags.value = prompt.tags?.join(", ") ?? "";
    elements.inputPromptContent.value = prompt.content;
  } else if (resolvedMode === "create" && prefillData) {
    if (typeof prefillData.name === "string") {
      elements.inputPromptName.value = prefillData.name;
    }
    if (prefillData.tags) {
      const tagsValue = Array.isArray(prefillData.tags)
        ? prefillData.tags.join(", ")
        : prefillData.tags;
      elements.inputPromptTags.value = tagsValue ?? "";
    }
    if (typeof prefillData.content === "string") {
      elements.inputPromptContent.value = prefillData.content;
    }
  }
  toggleModal(elements.modalPrompt, true);
};

const closePromptModal = () => {
  if (!elements.modalPrompt || elements.modalPrompt.classList.contains("hidden")) return;
  state.editingPromptId = null;
  state.sourcePromptId = null;
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
        if (state.sourcePromptId) {
          const sourcePrompt = state.prompts.find((item) => item.id === state.sourcePromptId);
          if (sourcePrompt) {
            const normalizeTags = (list) =>
              [...(Array.isArray(list) ? list : [])]
                .map((tag) => tag.trim())
                .filter((tag) => tag)
                .sort();
            const sourceTags = normalizeTags(sourcePrompt.tags);
            const newTags = normalizeTags(tags);
            const tagsEqual =
              sourceTags.length === newTags.length &&
              sourceTags.every((tag, index) => tag === newTags[index]);
            const contentEqual = (sourcePrompt.content ?? "").trim() === content;
            if (contentEqual && tagsEqual) {
              showToast("提示：内容与原提示词完全相同，请按需调整后再保存", "warning");
            }
          }
        }
        await PromptAPI.create(name, content, tags);
      }
      await loadPrompts();
    });
    state.sourcePromptId = null;
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
      await loadSnapshotClients();
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
      await loadSnapshotClients();
    });
    showToast("客户端已删除", "success");
  } catch (error) {
    showToast(getErrorMessage(error) || "删除客户端失败", "error");
  }
};

const handleClientSelectionChange = (clientId) => {
  if (!clientId || !state.clients.some((client) => client.id === clientId)) {
    return;
  }
  if (clientId === state.snapshotClientId) {
    return;
  }
  state.snapshotClientId = clientId;
  state.generalSettingsClientId = clientId;
  syncClientSelectors();
  scheduleSnapshotReload(clientId);
};

const scheduleSnapshotReload = (clientId) => {
  if (!clientId) return;
  if (state.snapshotLoadTimer) {
    window.clearTimeout(state.snapshotLoadTimer);
  }
  state.snapshotLoadTimer = window.setTimeout(() => {
    state.snapshotLoadTimer = null;
    loadSnapshotsTable(clientId, { silent: true })
      .catch(() => {})
      .finally(() => {
        loadGeneralSettings(clientId);
      });
  }, SNAPSHOT_LOAD_DEBOUNCE);
};

const normalizeSnapshotResponse = (payload) => {
  if (Array.isArray(payload)) {
    return { snapshots: payload, maxSnapshots: null };
  }
  if (payload && typeof payload === "object") {
    const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
    const maxSnapshots =
      typeof payload.maxSnapshots === "number"
        ? payload.maxSnapshots
        : typeof payload.max_snapshots === "number"
        ? payload.max_snapshots
        : null;
    return { snapshots, maxSnapshots };
  }
  return { snapshots: [], maxSnapshots: null };
};

const loadSnapshotsTable = async (clientId, { silent = false } = {}) => {
  const targetId = clientId ?? state.snapshotClientId;
  if (!targetId) {
    renderSnapshotTable([]);
    setSnapshotEmptyState("请选择客户端");
    return [];
  }
  try {
    const response = await SnapshotAPI.getAll(targetId);
    const { snapshots, maxSnapshots } = normalizeSnapshotResponse(response);
    state.snapshotCache[targetId] = {
      snapshots,
      maxSnapshots:
        typeof maxSnapshots === "number"
          ? maxSnapshots
          : state.snapshotCache[targetId]?.maxSnapshots ?? null,
    };
    if (targetId === state.snapshotClientId) {
      renderSnapshotTable(snapshots);
    }
    if (
      typeof maxSnapshots === "number" &&
      state.generalSettingsClientId &&
      targetId === state.generalSettingsClientId
    ) {
      state.generalMaxSnapshots = maxSnapshots;
      updateGeneralSettingsInput(maxSnapshots);
    }
    return snapshots;
  } catch (error) {
    if (!silent) {
      showToast(getErrorMessage(error) || "加载快照失败", "error");
    }
    if (targetId === state.snapshotClientId) {
      renderSnapshotTable([]);
      setSnapshotEmptyState("无法加载快照");
    }
    throw error;
  }
};

const renderSnapshotTable = (snapshots = []) => {
  const tbody = elements.snapshotTable;
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll("tr")).filter(
    (row) => row.id !== "emptyStateSnapshot"
  );
  rows.forEach((row) => row.remove());

  if (!snapshots.length) {
    elements.emptyStateSnapshot?.classList.remove("hidden");
    setSnapshotEmptyState(state.snapshotClientId ? "暂无快照" : "请选择客户端");
    return;
  }

  elements.emptyStateSnapshot?.classList.add("hidden");

  const ordered = [...snapshots].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  ordered.forEach((snapshot) => {
    const row = document.createElement("tr");
    row.dataset.snapshotId = snapshot.id;

    const nameCell = document.createElement("td");
    nameCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    nameCell.textContent = snapshot.name || "未命名快照";

    const timeCell = document.createElement("td");
    timeCell.className = "px-4 py-3 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700";
    timeCell.textContent = formatDateTime(snapshot.created_at);

    const typeCell = document.createElement("td");
    typeCell.className = "px-4 py-3 text-sm border-b border-gray-200 dark:border-gray-700";
    const badge = document.createElement("span");
    badge.className = `inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
      snapshot.is_auto
        ? "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200"
        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"
    }`;
    badge.textContent = snapshot.is_auto ? "自动" : "手动";
    typeCell.appendChild(badge);

    const actionCell = document.createElement("td");
    actionCell.className =
      "px-4 py-3 text-right text-sm border-b border-gray-200 dark:border-gray-700";
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "flex items-center justify-end gap-2";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "btn-icon btn-icon-primary";
    renameBtn.setAttribute("aria-label", "重命名快照");
    renameBtn.setAttribute("data-tooltip", "重命名");
    renameBtn.setAttribute("data-snapshot-action", "rename");
    renameBtn.setAttribute("data-snapshot-id", snapshot.id);
    renameBtn.setAttribute("data-snapshot-name", snapshot.name || "");
    renameBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>
    `;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-icon btn-icon-primary";
    deleteBtn.setAttribute("aria-label", "删除快照");
    deleteBtn.setAttribute("data-tooltip", "删除");
    deleteBtn.setAttribute("data-snapshot-action", "delete");
    deleteBtn.setAttribute("data-snapshot-id", snapshot.id);
    deleteBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    `;

    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);
    actionCell.appendChild(actionsDiv);

    row.appendChild(nameCell);
    row.appendChild(timeCell);
    row.appendChild(typeCell);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
};

const setSnapshotEmptyState = (message) => {
  if (elements.snapshotEmptyMessage) {
    elements.snapshotEmptyMessage.textContent = message;
  }
};

const updateGeneralSettingsInput = (value) => {
  if (!elements.inputMaxSnapshots) return;
  elements.inputMaxSnapshots.value = String(value ?? DEFAULT_MAX_SNAPSHOTS);
};

const setGeneralSettingsDisabled = (disabled) => {
  [elements.inputMaxSnapshots, elements.generalClientSelector, elements.btnSaveGeneralSettings].forEach(
    (control) => {
      if (!control) return;
      if (disabled) {
        control.setAttribute("disabled", "true");
      } else {
        control.removeAttribute("disabled");
      }
    }
  );
  if (elements.formGeneralSettings) {
    elements.formGeneralSettings.classList.toggle("opacity-60", disabled);
  }
};

const loadGeneralSettings = async (clientId) => {
  const input = elements.inputMaxSnapshots;
  if (!input) return;
  const targetId =
    clientId ??
    state.generalSettingsClientId ??
    state.snapshotClientId ??
    state.currentClientId ??
    state.clients[0]?.id ??
    null;

  state.generalSettingsClientId = targetId;
  syncClientSelectors();

  if (!targetId) {
    setGeneralSettingsDisabled(true);
    updateGeneralSettingsInput(DEFAULT_MAX_SNAPSHOTS);
    return;
  }

  setGeneralSettingsDisabled(false);

  const cached = state.snapshotCache[targetId];
  if (cached && typeof cached.maxSnapshots === "number") {
    state.generalMaxSnapshots = cached.maxSnapshots;
    updateGeneralSettingsInput(cached.maxSnapshots);
    return;
  }

  try {
    const response = await SnapshotAPI.getAll(targetId);
    const { snapshots, maxSnapshots } = normalizeSnapshotResponse(response);
    state.snapshotCache[targetId] = {
      snapshots,
      maxSnapshots: typeof maxSnapshots === "number" ? maxSnapshots : null,
    };
    if (typeof maxSnapshots === "number") {
      state.generalMaxSnapshots = maxSnapshots;
      updateGeneralSettingsInput(maxSnapshots);
    } else {
      updateGeneralSettingsInput(state.generalMaxSnapshots ?? DEFAULT_MAX_SNAPSHOTS);
    }
  } catch (error) {
    showToast(getErrorMessage(error) || "加载快照设置失败", "error");
    updateGeneralSettingsInput(state.generalMaxSnapshots ?? DEFAULT_MAX_SNAPSHOTS);
  }
};

const saveGeneralSettings = async (event) => {
  event.preventDefault();
  if (!state.generalSettingsClientId) {
    showToast("请先选择客户端", "warning");
    return;
  }
  let maxSnapshots = Number.parseInt(elements.inputMaxSnapshots.value, 10);
  if (Number.isNaN(maxSnapshots)) {
    maxSnapshots = state.generalMaxSnapshots ?? DEFAULT_MAX_SNAPSHOTS;
  }
  maxSnapshots = clampNumber(maxSnapshots, 1, 20);
  updateGeneralSettingsInput(maxSnapshots);

  try {
    await withLoading(async () => {
      await SnapshotAPI.setMaxSnapshots(state.generalSettingsClientId, maxSnapshots);
      await SnapshotAPI.refreshTrayMenu();
    });
    state.generalMaxSnapshots = maxSnapshots;
    if (state.snapshotCache[state.generalSettingsClientId]) {
      state.snapshotCache[state.generalSettingsClientId].maxSnapshots = maxSnapshots;
    }
    showToast("设置已保存", "success");
    await loadSnapshotsTable(state.generalSettingsClientId, { silent: true });
  } catch (error) {
    showToast(getErrorMessage(error) || "保存设置失败", "error");
  }
};

const handleSnapshotActionClick = (event) => {
  const rawTarget = event.target;
  console.debug("[Snapshot] Click detected", rawTarget);
  if (!(rawTarget instanceof Element)) {
    console.warn("[Snapshot] 非 Element 目标，忽略", rawTarget);
    return;
  }

  let button = typeof rawTarget.closest === "function" ? rawTarget.closest("[data-snapshot-action]") : null;
  if (!button) {
    let parent = rawTarget.parentElement;
    while (parent && parent !== event.currentTarget) {
      if (parent.matches?.("[data-snapshot-action]")) {
        button = parent;
        break;
      }
      parent = parent.parentElement;
    }
  }

  if (!button) {
    console.warn("[Snapshot] 未找到操作按钮", rawTarget);
    return;
  }
  if (button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true") {
    console.warn("[Snapshot] 操作按钮被禁用", button);
    return;
  }

  event.stopPropagation();
  const action = button.getAttribute("data-snapshot-action") ?? "";
  const snapshotId = button.getAttribute("data-snapshot-id") ?? "";
  console.debug("[Snapshot] Resolved action context", { button, action, snapshotId });

  if (!action || !snapshotId) {
    console.warn("[Snapshot] 缺少操作类型或快照 ID", { action, snapshotId });
    return;
  }
  if (!state.snapshotClientId) {
    console.warn("[Snapshot] 未选择客户端，无法执行", state.snapshotClientId);
    showToast("请选择客户端", "warning");
    return;
  }

  console.log("[Snapshot] Button clicked:", action, snapshotId);
  if (action === "delete") {
    deleteSnapshot(state.snapshotClientId, snapshotId);
  } else if (action === "rename") {
    const snapshotName = button.getAttribute("data-snapshot-name") ?? "";
    renameSnapshot(state.snapshotClientId, snapshotId, snapshotName);
  }
};

const deleteSnapshot = async (clientId, snapshotId) => {
  if (!clientId || !snapshotId) return;
  const confirmed = await showConfirm("确定要删除该快照吗？");
  if (!confirmed) return;
  try {
    await withLoading(async () => {
      await SnapshotAPI.delete(clientId, snapshotId);
      await SnapshotAPI.refreshTrayMenu();
    });
    showToast("快照已删除", "success");
    await loadSnapshotsTable(clientId, { silent: true });
  } catch (error) {
    showToast(getErrorMessage(error) || "删除快照失败", "error");
  }
};

const renameSnapshot = async (clientId, snapshotId, currentName) => {
  if (!clientId || !snapshotId) return;
  const nextName = await showPrompt("请输入新的快照名称", currentName || "");
  if (nextName === null) {
    return;
  }
  const normalized = nextName.trim();
  if (!normalized) {
    showToast("快照名称不能为空", "warning");
    return;
  }
  if (normalized === currentName) {
    return;
  }
  try {
    await withLoading(async () => {
      await SnapshotAPI.rename(clientId, snapshotId, normalized);
      await SnapshotAPI.refreshTrayMenu();
    });
    showToast("快照已重命名", "success");
    await loadSnapshotsTable(clientId, { silent: true });
  } catch (error) {
    showToast(getErrorMessage(error) || "重命名快照失败", "error");
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
  label.textContent = TAB_LABEL_MAP[targetId] ?? "设置";
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
