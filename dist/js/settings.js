import { PromptAPI, ClientAPI, SnapshotAPI, AppStateAPI } from "./api.js";
import { showToast, showConfirm, showLoading, hideLoading, showPrompt } from "./utils.js";
import { initTheme, createThemeToggleButton, updateThemeIcon } from "./theme.js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { initI18n, t, setLanguage, getCurrentLanguage, applyTranslations, onLanguageChange } from "./i18n.js";

const SNAPSHOT_LOAD_DEBOUNCE = 300;
const DEFAULT_MAX_AUTO_SNAPSHOTS = 3;
const DEFAULT_MAX_MANUAL_SNAPSHOTS = 10;
const TAB_LABEL_MAP = {
  tabPrompts: () => t("settings.promptTab", "Prompt Management"),
  tabClients: () => t("settings.clientTab", "Client Management"),
  tabGeneral: () => t("settings.generalTab", "General Settings"),
  tabSnapshots: () => t("settings.snapshotTab", "Snapshot Management"),
};

const WINDOW_BEHAVIOR_STORAGE_KEY = "spv.windowBehavior";
const WINDOW_BEHAVIOR_EVENT = "window-behavior-updated";
const DEFAULT_WINDOW_BEHAVIOR = Object.freeze({
  closeBehavior: "tray",
});

const normalizeWindowBehavior = (behavior) => {
  if (!behavior || typeof behavior !== "object") {
    return null;
  }
  const normalized = {};
  const closeBehavior =
    typeof behavior.closeBehavior === "string"
      ? behavior.closeBehavior
      : typeof behavior.close_behavior === "string"
        ? behavior.close_behavior
        : null;

  if (closeBehavior) {
    normalized.closeBehavior = closeBehavior;
  }

  return Object.keys(normalized).length ? normalized : null;
};

const resolveWindowBehavior = (behavior) => {
  const normalized = normalizeWindowBehavior(behavior) ?? {};
  return {
    closeBehavior: normalized.closeBehavior ?? DEFAULT_WINDOW_BEHAVIOR.closeBehavior,
  };
};

const areWindowBehaviorsEqual = (first, second) => {
  const resolvedFirst = resolveWindowBehavior(first);
  const resolvedSecond = resolveWindowBehavior(second);
  return resolvedFirst.closeBehavior === resolvedSecond.closeBehavior;
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
  generalMaxAutoSnapshots: DEFAULT_MAX_AUTO_SNAPSHOTS,
  generalMaxManualSnapshots: DEFAULT_MAX_MANUAL_SNAPSHOTS,
  activeTabId: "tabPrompts",
  windowBehavior: { ...DEFAULT_WINDOW_BEHAVIOR },
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
  clientActions: null,
  snapshotActions: null,
  formGeneralSettings: null,
  inputMaxAutoSnapshots: null,
  inputMaxManualSnapshots: null,
  generalClientSelector: null,
  btnSaveGeneralSettings: null,
  snapshotClientSelector: null,
  snapshotTable: null,
  emptyStateSnapshot: null,
  snapshotEmptyMessage: null,
  btnRefreshSnapshots: null,
  languageOptions: null,
  languageRadios: [],
  closeBehaviorRadios: [],
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
      console.log("[SettingsWindow] 已阻止默认关闭行为");

      const behavior = resolveWindowBehavior(state.windowBehavior);
      console.log(`[SettingsWindow] closeBehavior=${behavior.closeBehavior}`);

      if (behavior.closeBehavior === "tray") {
        console.log("[SettingsWindow] 采用托盘模式，尝试隐藏窗口");
        try {
          await appWindow.hide();
          console.log("[SettingsWindow] 窗口已隐藏到托盘");
        } catch (error) {
          console.error("[SettingsWindow] 隐藏到托盘失败，尝试销毁窗口:", error);
          try {
            await appWindow.destroy();
            console.log("[SettingsWindow] 托盘失败后窗口销毁成功");
          } catch (destroyError) {
            console.error("[SettingsWindow] 托盘失败后的销毁操作也失败:", destroyError);
          }
        }
        return;
      }

      console.log("[SettingsWindow] 采用退出模式，尝试销毁窗口");
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
  elements.clientActions = document.getElementById("clientActions");
  elements.snapshotActions = document.getElementById("snapshotActions");
  elements.formGeneralSettings = document.getElementById("formGeneralSettings");
  elements.inputMaxAutoSnapshots = document.getElementById("inputMaxAutoSnapshots");
  elements.inputMaxManualSnapshots = document.getElementById("inputMaxManualSnapshots");
  elements.generalClientSelector = document.getElementById("generalClientSelector");
  elements.btnSaveGeneralSettings =
    elements.formGeneralSettings?.querySelector('button[type="submit"]') ?? null;
  elements.snapshotClientSelector = document.getElementById("snapshotClientSelector");
  elements.snapshotTable = document.getElementById("snapshotTable");
  elements.emptyStateSnapshot = document.getElementById("emptyStateSnapshot");
  elements.snapshotEmptyMessage = document.getElementById("snapshotEmptyMessage");
  elements.btnRefreshSnapshots = document.getElementById("btnRefreshSnapshots");
  elements.languageOptions = document.getElementById("languageOptions");
  elements.languageRadios = Array.from(document.querySelectorAll(".language-radio"));
  elements.closeBehaviorRadios = Array.from(
    document.querySelectorAll('input[name="closeBehavior"]')
  );
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
      showToast(t("toast.noClientsAvailable", "No clients available"), "warning");
      return;
    }
    loadSnapshotsTable(state.snapshotClientId, { silent: false });
  });
  elements.snapshotTable?.addEventListener("click", handleSnapshotActionClick);
  elements.languageOptions?.addEventListener("change", handleLanguageSelectionChange);
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

const updateLanguageRadios = (selected = getCurrentLanguage()) => {
  if (Array.isArray(elements.languageRadios)) {
    elements.languageRadios.forEach((radio) => {
      if (radio instanceof HTMLInputElement) {
        radio.checked = radio.value === selected;
      }
    });
  }
  document.querySelectorAll(".language-card").forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    const isActive = card.dataset.language === selected;
    card.classList.toggle("border-primary", isActive);
    card.classList.toggle("ring-2", isActive);
    card.classList.toggle("ring-primary/40", isActive);
  });
};

const handleLanguageSelectionChange = async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.name !== "languageSetting") {
    return;
  }
  const lang = target.value;
  if (!lang || lang === getCurrentLanguage()) {
    updateLanguageRadios();
    return;
  }
  try {
    await setLanguage(lang);
    updateLanguageRadios(lang);
    showToast(t("toast.languageUpdated", "Language updated"), "success");
  } catch (error) {
    console.error("[Language] Failed to change language:", error);
    showToast(
      getErrorMessage(error) || t("toast.languageUpdateFailed", "Failed to update language"),
      "error"
    );
    updateLanguageRadios();
  }
};

const readStoredWindowBehavior = () => {
  try {
    const payload = window.localStorage?.getItem(WINDOW_BEHAVIOR_STORAGE_KEY);
    if (!payload) return {};
    const parsed = JSON.parse(payload);
    return normalizeWindowBehavior(parsed) ?? {};
  } catch (error) {
    console.warn("[Settings] Failed to read window behavior settings:", error);
    return {};
  }
};

const setRadioGroupValue = (radios, value, fallback) => {
  if (!Array.isArray(radios) || radios.length === 0) return;
  const targetValue = value ?? fallback;
  let hasMatch = false;
  radios.forEach((radio) => {
    if (!(radio instanceof HTMLInputElement)) return;
    const shouldCheck = radio.value === targetValue;
    radio.checked = shouldCheck;
    if (shouldCheck) {
      hasMatch = true;
    }
  });
  if (!hasMatch) {
    const fallbackRadio = radios.find((radio) => radio instanceof HTMLInputElement);
    if (fallbackRadio) {
      fallbackRadio.checked = true;
    }
  }
};

const getRadioGroupValue = (radios, fallback) => {
  if (!Array.isArray(radios) || radios.length === 0) return fallback;
  const active = radios.find(
    (radio) => radio instanceof HTMLInputElement && radio.checked && radio.value
  );
  return active?.value ?? fallback;
};

const updateWindowBehaviorInputs = () => {
  const closeValue = state.windowBehavior.closeBehavior ?? DEFAULT_WINDOW_BEHAVIOR.closeBehavior;
  setRadioGroupValue(elements.closeBehaviorRadios, closeValue, DEFAULT_WINDOW_BEHAVIOR.closeBehavior);
};

const persistWindowBehaviorSettings = () => {
  try {
    window.localStorage?.setItem(
      WINDOW_BEHAVIOR_STORAGE_KEY,
      JSON.stringify(state.windowBehavior)
    );
  } catch (error) {
    console.warn("[Settings] Failed to persist window behavior settings:", error);
  }
};

const loadWindowBehaviorSettings = async () => {
  state.windowBehavior = resolveWindowBehavior(readStoredWindowBehavior());
  updateWindowBehaviorInputs();

  try {
    const backendBehavior = await AppStateAPI.getWindowBehavior();
    const normalizedBackend = normalizeWindowBehavior(backendBehavior);
    if (!normalizedBackend) {
      return;
    }
    const mergedBehavior = resolveWindowBehavior(normalizedBackend);
    if (areWindowBehaviorsEqual(state.windowBehavior, mergedBehavior)) {
      return;
    }
    state.windowBehavior = mergedBehavior;
    persistWindowBehaviorSettings();
    updateWindowBehaviorInputs();
  } catch (error) {
    console.warn("[Settings] Failed to load window behavior from backend:", error);
  }
};

const syncWindowBehaviorWithBackend = async (behavior) => {
  if (!behavior) return;
  const resolved = resolveWindowBehavior(behavior);
  try {
    await AppStateAPI.setWindowBehavior(resolved.closeBehavior);
    try {
      await emit(WINDOW_BEHAVIOR_EVENT, resolved);
      console.log(
        `[Settings] Emitted window behavior update: close=${resolved.closeBehavior}`
      );
    } catch (emitError) {
      console.warn("[Settings] Failed to emit window behavior update:", emitError);
    }
  } catch (error) {
    console.warn("[Settings] Failed to sync window behavior:", error);
    showToast(
      getErrorMessage(error) ||
        t("toast.windowBehaviorSyncFailed", "Failed to sync window behavior"),
      "warning"
    );
  }
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
  try {
    await initI18n();
  } catch (error) {
    console.error("[i18n] Initialization failed:", error);
  }
  applyTranslations(document);

  // 初始化主题
  initTheme();

  // 添加主题切换按钮
  const themeContainer = document.getElementById("themeToggleContainer");
  if (themeContainer) {
    themeContainer.appendChild(createThemeToggleButton());
    updateThemeIcon();
  }

  cacheElements();
  await loadWindowBehaviorSettings();
  await setupWindowCloseHandler();
  bindEvents();
  updateLanguageRadios();
  switchTab(state.activeTabId);
  initButtonTooltips();

  onLanguageChange(() => {
    applyTranslations(document);
    updateLanguageRadios();
    renderPromptTable();
    renderClientTable();
    const cachedSnapshots = state.snapshotCache[state.snapshotClientId]?.snapshots ?? [];
    renderSnapshotTable(cachedSnapshots);
    updateSettingsDropdownLabel(state.activeTabId);
    initButtonTooltips();
  });

  try {
    await withLoading(async () => {
      await loadPrompts();
      await loadClients();
      await hydrateAppState();
      await loadSnapshotClients();
    });
  } catch (error) {
    showToast(getErrorMessage(error) || t("toast.settingsInitFailed", "Failed to initialize settings"), "error");
  }
};

const loadPrompts = async () => {
  try {
    const prompts = await PromptAPI.getAll();
    state.prompts = Array.isArray(prompts) ? prompts : [];
    renderPromptTable();
    updateTagSuggestions();
  } catch (error) {
    throw new Error(getErrorMessage(error) || t("errors.loadPromptsFailed", "Failed to load prompts"));
  }
};

const loadClients = async () => {
  try {
    const clients = await ClientAPI.getAll();
    state.clients = Array.isArray(clients) ? clients : [];
    renderClientTable();
  } catch (error) {
    throw new Error(getErrorMessage(error) || t("errors.loadClientsFailed", "Failed to load clients"));
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
      showToast(
        getErrorMessage(error) ||
          t("toast.loadAppStateFailed", "Failed to load app state, using default client"),
        "warning"
      );
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
    editBtn.setAttribute("aria-label", t("prompts.editAction", "Edit prompt"));
    editBtn.setAttribute("data-tooltip", t("prompts.edit", "Edit"));
    editBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>
    `;
    editBtn.addEventListener("click", () => showPromptModal(prompt.id));

    const duplicateBtn = document.createElement("button");
    duplicateBtn.type = "button";
    duplicateBtn.className = "btn-icon btn-icon-primary";
    duplicateBtn.setAttribute("aria-label", t("prompts.duplicateAction", "Duplicate prompt"));
    duplicateBtn.setAttribute("data-tooltip", t("prompts.duplicate", "Duplicate"));
    duplicateBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V5a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
      </svg>
    `;
    duplicateBtn.addEventListener("click", () => {
      const prefillData = {
        name: `${prompt.name} ${t("prompts.copySuffix", "(Copy)")}`,
        content: prompt.content,
        tags: prompt.tags,
        sourcePromptId: prompt.id,
      };
      showPromptModal(null, "create", prefillData);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-icon btn-icon-primary";
    deleteBtn.setAttribute("aria-label", t("prompts.deleteAction", "Delete prompt"));
    deleteBtn.setAttribute("data-tooltip", t("prompts.delete", "Delete"));
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
    autoTagCell.textContent = client.auto_tag
      ? t("common.yes", "Yes")
      : t("common.no", "No");

    const builtinCell = document.createElement("td");
    builtinCell.className = "px-4 py-3 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700";
    builtinCell.textContent = client.is_builtin ? t("common.yes", "Yes") : t("common.no", "No");

    const actionCell = document.createElement("td");
    actionCell.className = "px-4 py-3 text-sm text-right border-b border-gray-200 dark:border-gray-700";
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "flex items-center justify-end gap-2";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-icon btn-icon-primary";
    editBtn.setAttribute("aria-label", t("clients.editAction", "Edit client"));
    editBtn.setAttribute("data-tooltip", t("common.edit", "Edit"));
    editBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>
    `;
    editBtn.addEventListener("click", () => showClientModal(client.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-icon btn-icon-primary";
    deleteBtn.setAttribute("aria-label", t("clients.deleteAction", "Delete client"));
    deleteBtn.setAttribute("data-tooltip", t("common.delete", "Delete"));
    deleteBtn.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    `;
    // Only one client, deletion not allowed
    const isOnlyClient = state.clients.length <= 1;
    deleteBtn.disabled = isOnlyClient;
    deleteBtn.title = isOnlyClient ? t("toast.keepOneClient", "At least one client must remain") : "";
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
    state.generalMaxAutoSnapshots = DEFAULT_MAX_AUTO_SNAPSHOTS;
    state.generalMaxManualSnapshots = DEFAULT_MAX_MANUAL_SNAPSHOTS;
    setGeneralSettingsDisabled(true);
    updateGeneralSettingsInput({
      auto: DEFAULT_MAX_AUTO_SNAPSHOTS,
      manual: DEFAULT_MAX_MANUAL_SNAPSHOTS,
    });
    elements.btnRefreshSnapshots?.setAttribute("disabled", "true");
    renderSnapshotTable([]);
    setSnapshotEmptyState(t("snapshots.noClients", "No clients available"));
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
    option.textContent = t("settings.noClientsOption", "No clients available");
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
    showToast(t("toast.promptNotFound", "Prompt not found"), "error");
    return;
  }
  state.editingPromptId = resolvedMode === "edit" ? promptId : null;
  state.sourcePromptId = prefillData?.sourcePromptId ?? null;
  const promptTitleKey =
    resolvedMode === "edit" ? "settings.promptModalEditTitle" : "settings.promptModalTitle";
  const promptTitleFallback = resolvedMode === "edit" ? "Edit Prompt" : "New Prompt";
  elements.modalPromptTitle.textContent = t(promptTitleKey, promptTitleFallback);
  elements.formPrompt?.reset();
  if (resolvedMode === "edit") {
    const prompt = state.prompts.find((item) => item.id === promptId);
    if (!prompt) {
      showToast(t("toast.promptNotFound", "Prompt not found"), "error");
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
  const clientTitleKey = clientId ? "settings.clientModalEditTitle" : "settings.clientModalTitle";
  const clientTitleFallback = clientId ? "Edit Client" : "New Client";
  elements.modalClientTitle.textContent = t(clientTitleKey, clientTitleFallback);
  elements.formClient?.reset();
  elements.inputClientId.disabled = Boolean(clientId);
  if (clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    if (!client) {
    showToast(t("toast.clientNotFound", "Client not found"), "error");
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
    showToast(t("toast.promptMissingFields", "Name and content are required"), "warning");
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
            showToast(
              t(
                "toast.promptDuplicateContent",
                "Hint: content matches the original prompt. Adjust before saving."
              ),
              "warning"
            );
            }
          }
        }
        await PromptAPI.create(name, content, tags);
      }
      await loadPrompts();
    });
    state.sourcePromptId = null;
    const messageKey = state.editingPromptId ? "toast.promptUpdated" : "toast.promptCreated";
    const fallback = state.editingPromptId ? "Prompt updated" : "Prompt created";
    showToast(t(messageKey, fallback), "success");
    closePromptModal();
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.savePromptFailed", "Failed to save prompt"),
      "error"
    );
  }
};

const handleClientSubmit = async (event) => {
  event.preventDefault();
  const id = elements.inputClientId.value.trim();
  const name = elements.inputClientName.value.trim();
  const path = elements.inputClientPath.value.trim();
  if (!id || !name || !path) {
    showToast(t("toast.clientMissingFields", "Please complete all client information"), "warning");
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
      await SnapshotAPI.refreshTrayMenu();
    });
    const messageKey = state.editingClientId ? "toast.clientUpdated" : "toast.clientCreated";
    const fallback = state.editingClientId ? "Client updated" : "Client created";
    showToast(t(messageKey, fallback), "success");
    closeClientModal();
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.saveClientFailed", "Failed to save client"),
      "error"
    );
  }
};

const deletePrompt = async (promptId) => {
  if (!promptId) return;
  const confirmed = await showConfirm(
    t("dialogs.deletePromptConfirm", "Delete this prompt?")
  );
  if (!confirmed) return;
  try {
    await withLoading(async () => {
      await PromptAPI.delete(promptId);
      await loadPrompts();
    });
    showToast(t("toast.promptDeleted", "Prompt deleted"), "success");
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.deletePromptFailed", "Failed to delete prompt"),
      "error"
    );
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
    showToast(t("toast.promptsExported", "Prompts exported"), "success");
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.exportPromptsFailed", "Failed to export prompts"),
      "error"
    );
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
    showToast(formatImportResultMessage(total, added, updated), "success");
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.importPromptsFailed", "Failed to import prompts"),
      "error"
    );
  } finally {
    if (event.target) {
      event.target.value = "";
    }
  }
};

const formatImportResultMessage = (total, added, updated) => {
  if (total === 0) {
    return t("toast.importNone", "No prompts were imported");
  }
  if (added === total) {
    return t("toast.importAllNew", "Imported {total} new prompts").replace("{total}", `${total}`);
  }
  if (added === 0) {
    return t("toast.importUpdatedOnly", "Updated {updated} prompts").replace(
      "{updated}",
      `${updated}`
    );
  }
  return t(
    "toast.importMixed",
    "Imported {total} prompts ({added} new, {updated} updated)"
  )
    .replace("{total}", `${total}`)
    .replace("{added}", `${added}`)
    .replace("{updated}", `${updated}`);
};

const validateImportPayload = (jsonText) => {
  if (!jsonText.trim()) {
    throw new Error(t("errors.importFileEmpty", "Import file is empty"));
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(t("errors.importInvalidJson", "Invalid JSON format"));
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      t("errors.importInvalidStructure", "JSON content must be an array of prompts")
    );
  }
};

const deleteClient = async (clientId) => {
  if (!clientId) return;
  // 检查是否只有一个客户端
  if (state.clients.length <= 1) {
    showToast(t("toast.keepOneClient", "At least one client must remain"), "error");
    return;
  }
  const confirmed = await showConfirm(t("dialogs.deleteClientConfirm", "Delete this client?"));
  if (!confirmed) return;
  try {
    await withLoading(async () => {
      await ClientAPI.delete(clientId);
      await loadClients();
      await loadSnapshotClients();
      await SnapshotAPI.refreshTrayMenu();
    });
    showToast(t("toast.clientDeleted", "Client deleted"), "success");
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.deleteClientFailed", "Failed to delete client"),
      "error"
    );
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
  const empty = {
    snapshots: [],
    maxSnapshots: null,
    maxAutoSnapshots: null,
    maxManualSnapshots: null,
  };

  if (Array.isArray(payload)) {
    return { ...empty, snapshots: payload };
  }

  if (payload && typeof payload === "object") {
    const source =
      payload.config && typeof payload.config === "object" ? payload.config : payload;
    const snapshots = Array.isArray(payload.snapshots)
      ? payload.snapshots
      : Array.isArray(source.snapshots)
      ? source.snapshots
      : [];

    const readNumber = (...keys) => {
      for (const key of keys) {
        if (typeof source[key] === "number") {
          return source[key];
        }
      }
      return null;
    };

    const maxAutoSnapshots = readNumber("maxAutoSnapshots", "max_auto_snapshots");
    const maxManualSnapshots = readNumber("maxManualSnapshots", "max_manual_snapshots");
    const maxSnapshots =
      readNumber("maxSnapshots", "max_snapshots") ?? maxManualSnapshots ?? maxAutoSnapshots;

    return { snapshots, maxSnapshots, maxAutoSnapshots, maxManualSnapshots };
  }

  return empty;
};

const loadSnapshotsTable = async (clientId, { silent = false } = {}) => {
  const targetId = clientId ?? state.snapshotClientId;
  if (!targetId) {
    renderSnapshotTable([]);
    setSnapshotEmptyState(t("snapshots.selectClientPrompt", "Please select a client"));
    return [];
  }
  try {
    const response = await SnapshotAPI.getAll(targetId);
    const { snapshots, maxAutoSnapshots, maxManualSnapshots } = normalizeSnapshotResponse(response);
    const cacheEntry = {
      snapshots,
      maxAutoSnapshots:
        typeof maxAutoSnapshots === "number"
          ? maxAutoSnapshots
          : state.snapshotCache[targetId]?.maxAutoSnapshots ?? null,
      maxManualSnapshots:
        typeof maxManualSnapshots === "number"
          ? maxManualSnapshots
          : state.snapshotCache[targetId]?.maxManualSnapshots ?? null,
    };
    state.snapshotCache[targetId] = cacheEntry;
    if (targetId === state.snapshotClientId) {
      renderSnapshotTable(snapshots);
    }
    if (state.generalSettingsClientId && targetId === state.generalSettingsClientId) {
      if (typeof cacheEntry.maxAutoSnapshots === "number") {
        state.generalMaxAutoSnapshots = cacheEntry.maxAutoSnapshots;
      }
      if (typeof cacheEntry.maxManualSnapshots === "number") {
        state.generalMaxManualSnapshots = cacheEntry.maxManualSnapshots;
      }
      updateGeneralSettingsInput({
        auto: state.generalMaxAutoSnapshots,
        manual: state.generalMaxManualSnapshots,
      });
    }
    return snapshots;
  } catch (error) {
    if (!silent) {
      showToast(
        getErrorMessage(error) || t("toast.loadSnapshotsFailed", "Failed to load snapshots"),
        "error"
      );
    }
    if (targetId === state.snapshotClientId) {
      renderSnapshotTable([]);
      setSnapshotEmptyState(t("snapshots.loadFailed", "Unable to load snapshots"));
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
    setSnapshotEmptyState(
      state.snapshotClientId
        ? t("snapshots.empty", "No snapshots")
        : t("snapshots.selectClientPrompt", "Please select a client")
    );
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
    nameCell.textContent = formatSnapshotLabel(snapshot);

    const timeCell = document.createElement("td");
    timeCell.className = "px-4 py-3 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700";
    timeCell.textContent = "—";

    const typeCell = document.createElement("td");
    typeCell.className = "px-4 py-3 text-sm border-b border-gray-200 dark:border-gray-700";
    const badge = document.createElement("span");
    badge.className = `inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
      snapshot.is_auto
        ? "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200"
        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"
    }`;
    badge.textContent = snapshot.is_auto
      ? t("snapshots.autoBadge", "Auto")
      : t("snapshots.manualBadge", "Manual");
    typeCell.appendChild(badge);

    const actionCell = document.createElement("td");
    actionCell.className =
      "px-4 py-3 text-right text-sm border-b border-gray-200 dark:border-gray-700";
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "flex items-center justify-end gap-2";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "btn-icon btn-icon-primary";
    renameBtn.setAttribute("aria-label", t("snapshots.rename", "Rename snapshot"));
    renameBtn.setAttribute("data-tooltip", t("snapshots.renameAction", "Rename"));
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
    deleteBtn.setAttribute("aria-label", t("snapshots.delete", "Delete snapshot"));
    deleteBtn.setAttribute("data-tooltip", t("snapshots.deleteAction", "Delete"));
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

const updateGeneralSettingsInput = (payload = {}) => {
  const { auto, manual } =
    typeof payload === "number"
      ? { auto: payload, manual: payload }
      : payload ?? {};

  if (elements.inputMaxAutoSnapshots) {
    const resolvedAuto =
      auto ?? state.generalMaxAutoSnapshots ?? DEFAULT_MAX_AUTO_SNAPSHOTS;
    elements.inputMaxAutoSnapshots.value = String(resolvedAuto);
  }

  if (elements.inputMaxManualSnapshots) {
    const resolvedManual =
      manual ?? state.generalMaxManualSnapshots ?? DEFAULT_MAX_MANUAL_SNAPSHOTS;
    elements.inputMaxManualSnapshots.value = String(resolvedManual);
  }
};

const setGeneralSettingsDisabled = (disabled) => {
  [
    elements.inputMaxAutoSnapshots,
    elements.inputMaxManualSnapshots,
    elements.generalClientSelector,
    elements.btnSaveGeneralSettings,
  ].forEach((control) => {
    if (!control) return;
    if (disabled) {
      control.setAttribute("disabled", "true");
    } else {
      control.removeAttribute("disabled");
    }
  });
  if (elements.formGeneralSettings) {
    elements.formGeneralSettings.classList.toggle("opacity-60", disabled);
  }
};

const loadGeneralSettings = async (clientId) => {
  if (!elements.inputMaxAutoSnapshots || !elements.inputMaxManualSnapshots) {
    return;
  }

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
    state.generalMaxAutoSnapshots = DEFAULT_MAX_AUTO_SNAPSHOTS;
    state.generalMaxManualSnapshots = DEFAULT_MAX_MANUAL_SNAPSHOTS;
    updateGeneralSettingsInput({
      auto: DEFAULT_MAX_AUTO_SNAPSHOTS,
      manual: DEFAULT_MAX_MANUAL_SNAPSHOTS,
    });
    return;
  }

  setGeneralSettingsDisabled(false);

  const cached = state.snapshotCache[targetId];
  if (
    cached &&
    (typeof cached.maxAutoSnapshots === "number" || typeof cached.maxManualSnapshots === "number")
  ) {
    if (typeof cached.maxAutoSnapshots === "number") {
      state.generalMaxAutoSnapshots = cached.maxAutoSnapshots;
    }
    if (typeof cached.maxManualSnapshots === "number") {
      state.generalMaxManualSnapshots = cached.maxManualSnapshots;
    }
    updateGeneralSettingsInput({
      auto: state.generalMaxAutoSnapshots,
      manual: state.generalMaxManualSnapshots,
    });
    return;
  }

  try {
    const response = await SnapshotAPI.getAll(targetId);
    const { snapshots, maxAutoSnapshots, maxManualSnapshots } = normalizeSnapshotResponse(response);
    state.snapshotCache[targetId] = {
      snapshots,
      maxAutoSnapshots: typeof maxAutoSnapshots === "number" ? maxAutoSnapshots : null,
      maxManualSnapshots: typeof maxManualSnapshots === "number" ? maxManualSnapshots : null,
    };
    if (typeof maxAutoSnapshots === "number") {
      state.generalMaxAutoSnapshots = maxAutoSnapshots;
    }
    if (typeof maxManualSnapshots === "number") {
      state.generalMaxManualSnapshots = maxManualSnapshots;
    }
    updateGeneralSettingsInput({
      auto: state.generalMaxAutoSnapshots,
      manual: state.generalMaxManualSnapshots,
    });
  } catch (error) {
    showToast(
      getErrorMessage(error) ||
        t("toast.loadSnapshotSettingsFailed", "Failed to load snapshot settings"),
      "error"
    );
    updateGeneralSettingsInput();
  }
};

const saveGeneralSettings = async (event) => {
  event.preventDefault();
  if (!state.generalSettingsClientId) {
    showToast(t("toast.selectClientFirst", "Please select a client first"), "warning");
    return;
  }

  const fallbackAuto = state.generalMaxAutoSnapshots ?? DEFAULT_MAX_AUTO_SNAPSHOTS;
  const fallbackManual = state.generalMaxManualSnapshots ?? DEFAULT_MAX_MANUAL_SNAPSHOTS;

  let maxAuto = Number.parseInt(elements.inputMaxAutoSnapshots?.value ?? "", 10);
  if (Number.isNaN(maxAuto)) {
    maxAuto = fallbackAuto;
  }
  let maxManual = Number.parseInt(elements.inputMaxManualSnapshots?.value ?? "", 10);
  if (Number.isNaN(maxManual)) {
    maxManual = fallbackManual;
  }

  maxAuto = clampNumber(maxAuto, 1, 20);
  maxManual = clampNumber(maxManual, 1, 20);
  updateGeneralSettingsInput({ auto: maxAuto, manual: maxManual });

  const pendingWindowBehavior = {
    closeBehavior:
      getRadioGroupValue(
        elements.closeBehaviorRadios,
        state.windowBehavior.closeBehavior ?? DEFAULT_WINDOW_BEHAVIOR.closeBehavior
      ) || DEFAULT_WINDOW_BEHAVIOR.closeBehavior,
  };

  const shouldSyncWindowBehavior = !areWindowBehaviorsEqual(
    state.windowBehavior,
    pendingWindowBehavior
  );

  try {
    await withLoading(async () => {
      await Promise.all([
        SnapshotAPI.setMaxAutoSnapshots(state.generalSettingsClientId, maxAuto),
        SnapshotAPI.setMaxManualSnapshots(state.generalSettingsClientId, maxManual),
      ]);
      await SnapshotAPI.refreshTrayMenu();
      if (shouldSyncWindowBehavior) {
        await syncWindowBehaviorWithBackend(pendingWindowBehavior);
      }
    });

    state.generalMaxAutoSnapshots = maxAuto;
    state.generalMaxManualSnapshots = maxManual;
    const cache = state.snapshotCache[state.generalSettingsClientId];
    if (cache) {
      cache.maxAutoSnapshots = maxAuto;
      cache.maxManualSnapshots = maxManual;
    } else {
      state.snapshotCache[state.generalSettingsClientId] = {
        snapshots: [],
        maxAutoSnapshots: maxAuto,
        maxManualSnapshots: maxManual,
      };
    }

    if (shouldSyncWindowBehavior) {
      state.windowBehavior = pendingWindowBehavior;
      persistWindowBehaviorSettings();
    }

    showToast(t("toast.settingsSaved", "Settings saved"), "success");
    await loadSnapshotsTable(state.generalSettingsClientId, { silent: true });
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.saveSettingsFailed", "Failed to save settings"),
      "error"
    );
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
    console.warn("[Snapshot] No client selected, cannot proceed", state.snapshotClientId);
    showToast(t("toast.selectClientFirst", "Please select a client first"), "warning");
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
  const confirmed = await showConfirm(t("dialogs.deleteSnapshotConfirm", "Delete this snapshot?"));
  if (!confirmed) return;
  try {
    await withLoading(async () => {
      await SnapshotAPI.delete(clientId, snapshotId);
      await SnapshotAPI.refreshTrayMenu();
    });
    showToast(t("toast.snapshotDeleted", "Snapshot deleted"), "success");
    await loadSnapshotsTable(clientId, { silent: true });
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.deleteSnapshotFailed", "Failed to delete snapshot"),
      "error"
    );
  }
};

const renameSnapshot = async (clientId, snapshotId, currentName) => {
  if (!clientId || !snapshotId) return;
  const nextName = await showPrompt(
    t("dialogs.renameSnapshotPrompt", "Enter a new snapshot name"),
    currentName || ""
  );
  if (nextName === null) {
    return;
  }
  const normalized = nextName.trim();
  if (!normalized) {
    showToast(t("toast.snapshotNameRequired", "Snapshot name cannot be empty"), "warning");
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
    showToast(t("toast.snapshotRenamed", "Snapshot renamed"), "success");
    await loadSnapshotsTable(clientId, { silent: true });
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.renameSnapshotFailed", "Failed to rename snapshot"),
      "error"
    );
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
  if (!iso) return t("time.unknown", "Unknown");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const formatSnapshotLabel = (snapshot) => {
  const timestamp = formatDateTime(snapshot.created_at);
  if (snapshot.is_auto) {
    return t("snapshots.autoLabelWithTime", "Auto saved {time}").replace("{time}", timestamp);
  }
  const name = snapshot.name || t("prompts.untitled", "Untitled prompt");
  return t("snapshots.manualLabelWithTime", "{name} {time}")
    .replace("{name}", name)
    .replace("{time}", timestamp);
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
  const resolver = TAB_LABEL_MAP[targetId];
  if (typeof resolver === "function") {
    label.textContent = resolver();
    return;
  }
  label.textContent = t("settings.header", "Settings");
};

const switchTab = (targetId) => {
  state.activeTabId = targetId;
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

  if (elements.clientActions) {
    elements.clientActions.classList.toggle("hidden", targetId !== "tabClients");
  }

  if (elements.snapshotActions) {
    elements.snapshotActions.classList.toggle("hidden", targetId !== "tabSnapshots");
  }
};

const getErrorMessage = (error) => (typeof error === "string" ? error : error?.message);

document.addEventListener("DOMContentLoaded", () => {
  initSettings();
});
