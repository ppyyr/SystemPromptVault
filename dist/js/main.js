import { PromptAPI, ClientAPI, ConfigFileAPI, AppStateAPI } from "./api.js";
import { showToast, showLoading, hideLoading } from "./utils.js";
import { initTheme, createThemeToggleButton, updateThemeIcon } from "./theme.js";

const state = {
  clients: [],
  currentClientId: "claude",
  prompts: [],
  selectedTags: [],
  recentTags: [],
  tagDropdownOpen: false,
  tagSearchQuery: "",
  configContent: "",
  splitRatio: 0.5,
};

const elements = {};
const TOOLTIP_DELAY = 500;
const TOOLTIP_HIDE_DELAY = 150;
const SPLIT_RATIO_KEY = "splitRatio";
const SPLIT_MIN_RATIO = 0.2;
const SPLIT_MAX_RATIO = 0.8;
const DESKTOP_BREAKPOINT = 1024;
const RESIZER_HOVER_CLASSES = ["hover:bg-gray-400", "dark:hover:bg-gray-500"];
const RESIZER_INACTIVE_CLASSES = ["bg-gray-300", "dark:bg-gray-600"];
const RESIZER_ACTIVE_CLASSES = ["bg-primary"];
const tooltipState = {
  activePromptId: null,
  anchorHovered: false,
  tooltipHovered: false,
};
const RECENT_TAGS_KEY = "tagFilterRecentTags";
const MAX_RECENT_TAGS = 5;
const TAG_OPTION_SELECTOR = "[data-tag-option]";

const createDebounced = (fn, delay) => {
  let timerId = null;
  const debounced = (...args) => {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = window.setTimeout(() => {
      timerId = null;
      fn(...args);
    }, delay);
  };
  debounced.cancel = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };
  return debounced;
};

const scheduleTooltipShow = createDebounced(({ prompt, x, y }) => {
  showPromptTooltip(prompt, x, y);
}, TOOLTIP_DELAY);

const scheduleTooltipHide = createDebounced(() => {
  if (!tooltipState.anchorHovered && !tooltipState.tooltipHovered) {
    hidePromptTooltip();
  }
}, TOOLTIP_HIDE_DELAY);

const clampSplitRatio = (value) => Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, value));

const withLoading = async (task) => {
  showLoading();
  try {
    return await task();
  } finally {
    hideLoading();
  }
};

const cacheElements = () => {
  elements.clientDropdown = document.getElementById("clientDropdown");
  elements.clientDropdownToggle = document.getElementById("clientDropdownToggle");
  elements.clientDropdownLabel = document.getElementById("clientDropdownLabel");
  elements.clientDropdownPanel = document.getElementById("clientDropdownPanel");
  elements.clientDropdownList = document.getElementById("clientDropdownList");
  elements.configFileName = document.getElementById("configFileName");
  elements.configEditor = document.getElementById("configEditor");
  elements.btnSaveConfig = document.getElementById("btnSaveConfig");
  elements.tagFilter = document.getElementById("tagFilter");
  elements.tagDropdownToggle = document.getElementById("tagDropdownToggle");
  elements.tagDropdownBadge = document.getElementById("tagDropdownBadge");
  elements.tagDropdownPanel = document.getElementById("tagDropdownPanel");
  elements.tagDropdownSearch = document.getElementById("tagDropdownSearch");
  elements.tagDropdownRecent = document.getElementById("tagDropdownRecent");
  elements.tagDropdownList = document.getElementById("tagDropdownList");
  elements.tagDropdownCount = document.getElementById("tagDropdownCount");
  elements.promptList = document.getElementById("promptList");
  elements.promptTooltip = document.getElementById("promptTooltip");
  elements.promptTooltipTitle = elements.promptTooltip?.querySelector(".prompt-tooltip-title");
  elements.promptTooltipTags = elements.promptTooltip?.querySelector(".prompt-tooltip-tags");
  elements.promptTooltipContent = elements.promptTooltip?.querySelector(".prompt-tooltip-content");
  elements.splitContainer = document.getElementById("splitContainer");
  elements.configSection = document.getElementById("configSection");
  elements.promptSection = document.getElementById("promptSection");
  elements.splitResizer = document.getElementById("splitResizer");
};

const bindEvents = () => {
  elements.clientDropdownToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleClientDropdown();
  });
  document.addEventListener("click", (event) => {
    const dropdown = elements.clientDropdown;
    if (!dropdown) return;
    if (!dropdown.contains(event.target)) {
      closeClientDropdown();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeClientDropdown();
    }
  });
  elements.btnSaveConfig?.addEventListener("click", () => {
    saveConfigFile();
  });
  elements.configEditor?.addEventListener("input", (event) => {
    state.configContent = event.target.value;
  });
  document.addEventListener(
    "scroll",
    (event) => {
      const tooltip = elements.promptTooltip;
      if (tooltip && tooltip.contains(event.target)) {
        return;
      }
      hidePromptTooltip();
    },
    true
  );
  window.addEventListener("resize", () => {
    hidePromptTooltip();
  });
  elements.promptTooltip?.addEventListener("mouseenter", () => {
    tooltipState.tooltipHovered = true;
    scheduleTooltipHide.cancel();
  });
  elements.promptTooltip?.addEventListener("mouseleave", () => {
    tooltipState.tooltipHovered = false;
    scheduleTooltipHide();
  });
  bindTagDropdownEvents();
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

const bindTagDropdownEvents = () => {
  elements.tagDropdownToggle?.addEventListener("click", () => toggleTagDropdown());
  elements.tagDropdownSearch?.addEventListener("input", handleTagSearchInput);
  elements.tagDropdownSearch?.addEventListener("keydown", handleTagSearchKeyNavigation);
  elements.tagDropdownPanel?.addEventListener("click", handleTagOptionClick);
  elements.tagDropdownPanel?.addEventListener("keydown", handleTagPanelKeydown);
  document.addEventListener("click", handleDocumentClickForDropdown);
  document.addEventListener("keydown", handleDocumentKeydownForDropdown);
};

const toggleTagDropdown = (forceState) => {
  const toggle = elements.tagDropdownToggle;
  const panel = elements.tagDropdownPanel;
  if (!toggle || !panel || toggle.disabled) {
    return;
  }
  const nextState =
    typeof forceState === "boolean" ? forceState : !Boolean(state.tagDropdownOpen);
  if (state.tagDropdownOpen === nextState) {
    return;
  }
  state.tagDropdownOpen = nextState;
  updateTagDropdownVisibility();
};

const closeTagDropdown = () => {
  if (state.tagDropdownOpen) {
    state.tagDropdownOpen = false;
  }
  updateTagDropdownVisibility();
};

const updateTagDropdownVisibility = () => {
  const panel = elements.tagDropdownPanel;
  const toggle = elements.tagDropdownToggle;
  if (!panel || !toggle) return;
  const isOpen = Boolean(state.tagDropdownOpen) && !toggle.disabled;
  panel.classList.toggle("is-open", isOpen);
  panel.setAttribute("aria-hidden", String(!isOpen));
  toggle.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    window.requestAnimationFrame(() => {
      if (elements.tagDropdownSearch && !elements.tagDropdownSearch.disabled) {
        elements.tagDropdownSearch.focus({ preventScroll: true });
      }
    });
  } else if (
    document.activeElement &&
    panel.contains(document.activeElement) &&
    typeof toggle.focus === "function"
  ) {
    toggle.focus();
  }
};

const handleDocumentClickForDropdown = (event) => {
  if (!state.tagDropdownOpen || !elements.tagFilter) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (!elements.tagFilter.contains(target)) {
    closeTagDropdown();
  }
};

const handleDocumentKeydownForDropdown = (event) => {
  if (event.key === "Escape" && state.tagDropdownOpen) {
    event.preventDefault();
    closeTagDropdown();
  }
};

const handleTagSearchInput = (event) => {
  state.tagSearchQuery = event?.target?.value ?? "";
  renderTagFilter();
};

const handleTagSearchKeyNavigation = (event) => {
  if (!state.tagDropdownOpen) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusAdjacentTagOption(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    focusAdjacentTagOption(-1);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeTagDropdown();
  }
};

const handleTagOptionClick = (event) => {
  const origin = event.target;
  if (!(origin instanceof Element)) return;
  const target = origin.closest(TAG_OPTION_SELECTOR);
  if (!target) return;
  if (target.getAttribute("aria-disabled") === "true" || target.disabled) {
    return;
  }
  const tag = target.dataset.tagOption;
  if (tag) {
    toggleTagFilter(tag);
  }
};

const handleTagPanelKeydown = (event) => {
  if (!state.tagDropdownOpen) return;
  if (elements.tagDropdownSearch?.contains(event.target)) {
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusAdjacentTagOption(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    focusAdjacentTagOption(-1);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeTagDropdown();
  }
};

const getFocusableTagOptions = () => {
  if (!elements.tagDropdownPanel) return [];
  return Array.from(
    elements.tagDropdownPanel.querySelectorAll(".tag-dropdown__option:not([disabled])")
  );
};

const focusAdjacentTagOption = (direction = 1) => {
  const options = getFocusableTagOptions();
  if (!options.length) return;
  const activeElement = document.activeElement;
  let currentIndex = options.indexOf(activeElement);
  if (currentIndex === -1) {
    currentIndex = direction > 0 ? -1 : options.length;
  }
  const nextIndex = (currentIndex + direction + options.length) % options.length;
  const nextOption = options[nextIndex];
  if (nextOption) {
    nextOption.focus();
  }
};

const initResizer = () => {
  const container = elements.splitContainer;
  const leftPanel = elements.configSection;
  const rightPanel = elements.promptSection;
  const resizer = elements.splitResizer;
  if (!container || !leftPanel || !rightPanel || !resizer) {
    return;
  }

  const storedRatio = (() => {
    try {
      const value = localStorage.getItem(SPLIT_RATIO_KEY);
      if (value !== null) {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) {
          return clampSplitRatio(parsed);
        }
      }
    } catch {
      // 忽略存储读取异常
    }
    return null;
  })();
  if (storedRatio !== null) {
    state.splitRatio = storedRatio;
  }

  let frameId = null;
  let isDragging = false;

  const requestLayoutUpdate = () => {
    if (frameId) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      applySplitWidths();
    });
  };

  const applySplitWidths = () => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) {
      leftPanel.style.removeProperty("width");
      rightPanel.style.removeProperty("width");
      return;
    }
    leftPanel.style.width = `${state.splitRatio * 100}%`;
    rightPanel.style.width = `${(1 - state.splitRatio) * 100}%`;
  };

  const persistSplitRatio = () => {
    try {
      localStorage.setItem(SPLIT_RATIO_KEY, String(state.splitRatio));
    } catch {
      // 忽略写入异常
    }
  };

  const toggleBodySelection = (locked) => {
    if (!document.body) return;
    document.body.classList.toggle("select-none", locked);
  };

  const setResizerDraggingState = (active) => {
    if (active) {
      RESIZER_ACTIVE_CLASSES.forEach((className) => resizer.classList.add(className));
      RESIZER_INACTIVE_CLASSES.forEach((className) => resizer.classList.remove(className));
      RESIZER_HOVER_CLASSES.forEach((className) => resizer.classList.remove(className));
    } else {
      RESIZER_ACTIVE_CLASSES.forEach((className) => resizer.classList.remove(className));
      RESIZER_INACTIVE_CLASSES.forEach((className) => resizer.classList.add(className));
      RESIZER_HOVER_CLASSES.forEach((className) => resizer.classList.add(className));
    }
  };

  const updateRatioFromPointer = (clientX) => {
    if (typeof clientX !== "number") return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relativeX = clientX - rect.left;
    const ratio = clampSplitRatio(relativeX / rect.width);
    if (!Number.isFinite(ratio) || Math.abs(ratio - state.splitRatio) < 0.001) {
      return;
    }
    state.splitRatio = ratio;
    requestLayoutUpdate();
  };

  const handlePointerMove = (event) => {
    if (!isDragging) return;
    event.preventDefault();
    updateRatioFromPointer(event.clientX);
  };

  const stopDragging = () => {
    if (!isDragging) return;
    isDragging = false;
    toggleBodySelection(false);
    setResizerDraggingState(false);
    window.removeEventListener("mousemove", handlePointerMove);
    window.removeEventListener("mouseup", stopDragging);
    persistSplitRatio();
  };

  const startDragging = (event) => {
    if (event.button !== 0) return;
    if (window.innerWidth < DESKTOP_BREAKPOINT) {
      return;
    }
    event.preventDefault();
    isDragging = true;
    toggleBodySelection(true);
    setResizerDraggingState(true);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopDragging);
  };

  const handleWindowResize = () => {
    if (isDragging && window.innerWidth < DESKTOP_BREAKPOINT) {
      stopDragging();
    }
    requestLayoutUpdate();
  };

  resizer.addEventListener("mousedown", startDragging);
  window.addEventListener("resize", handleWindowResize);
  applySplitWidths();
};

const initApp = async () => {
  // 初始化主题
  initTheme();

  // 添加主题切换按钮
  const themeContainer = document.getElementById("themeToggleContainer");
  if (themeContainer) {
    themeContainer.appendChild(createThemeToggleButton());
    updateThemeIcon();
  }

  cacheElements();
  initButtonTooltips();
  hydrateRecentTags();
  bindEvents();
  initResizer();
  try {
    await withLoading(async () => {
      await loadClients();
      await hydrateAppState();
      await loadPrompts();
      await loadConfigFile(state.currentClientId);
    });
    renderClientDropdown();
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
  state.tagSearchQuery = "";
  closeTagDropdown();
  closeClientDropdown();
  renderClientDropdown();
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

const filterTagsByQuery = (tags, query) => {
  if (!Array.isArray(tags) || !tags.length) return [];
  const normalized = query?.trim()?.toLowerCase();
  if (!normalized) return [...tags];
  return tags.filter((tag) => tag.toLowerCase().includes(normalized));
};

const hydrateRecentTags = () => {
  try {
    const stored = localStorage.getItem(RECENT_TAGS_KEY);
    if (!stored) {
      state.recentTags = [];
      return;
    }
    const parsed = JSON.parse(stored);
    state.recentTags = Array.isArray(parsed)
      ? parsed.filter((tag) => typeof tag === "string" && tag.trim())
      : [];
  } catch {
    state.recentTags = [];
  }
};

const persistRecentTags = () => {
  try {
    localStorage.setItem(RECENT_TAGS_KEY, JSON.stringify(state.recentTags));
  } catch {
    // 忽略写入异常
  }
};

const updateRecentTags = (tag) => {
  if (typeof tag !== "string" || !tag.trim()) return;
  const normalized = tag.trim();
  const nextRecent = [normalized, ...state.recentTags.filter((item) => item !== normalized)];
  state.recentTags = nextRecent.slice(0, MAX_RECENT_TAGS);
  persistRecentTags();
};

const toggleTagFilter = (tag) => {
  if (!tag) return;
  const index = state.selectedTags.indexOf(tag);
  let added = false;
  if (index >= 0) {
    state.selectedTags.splice(index, 1);
  } else {
    state.selectedTags.push(tag);
    added = true;
  }
  if (added) {
    updateRecentTags(tag);
  }
  renderTagFilter();
  renderPromptList();
};

const renderClientDropdown = () => {
  const list = elements.clientDropdownList;
  const toggle = elements.clientDropdownToggle;
  if (!list || !toggle) return;

  list.innerHTML = "";
  const hasClients = state.clients.length > 0;
  toggle.disabled = !hasClients;
  if (!hasClients) {
    toggle.setAttribute("aria-disabled", "true");
    updateClientDropdownLabel();
    closeClientDropdown();
    updateEditorAvailability();
    return;
  }
  toggle.removeAttribute("aria-disabled");

  const fragment = document.createDocumentFragment();
  state.clients.forEach((client) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "client-dropdown__option";
    option.textContent = client.name;
    option.dataset.clientId = client.id;
    option.setAttribute("role", "option");
    const isSelected = client.id === state.currentClientId;
    option.setAttribute("aria-selected", String(isSelected));
    option.addEventListener("click", () => {
      if (client.id === state.currentClientId) {
        closeClientDropdown();
        return;
      }
      switchClient(client.id);
    });
    fragment.appendChild(option);
  });
  list.appendChild(fragment);
  updateClientDropdownLabel();
  updateEditorAvailability();
};

const updateClientDropdownLabel = () => {
  const label = elements.clientDropdownLabel;
  if (!label) return;
  const client = getCurrentClient();
  label.textContent = client ? client.name : "选择客户端";
};

const toggleClientDropdown = () => {
  const toggle = elements.clientDropdownToggle;
  const panel = elements.clientDropdownPanel;
  if (!toggle || !panel || toggle.disabled) return;
  const isOpen = panel.getAttribute("aria-hidden") === "false";
  if (isOpen) {
    closeClientDropdown();
  } else {
    panel.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
  }
};

const closeClientDropdown = () => {
  const toggle = elements.clientDropdownToggle;
  const panel = elements.clientDropdownPanel;
  if (!toggle || !panel) return;
  panel.setAttribute("aria-hidden", "true");
  toggle.setAttribute("aria-expanded", "false");
};

const renderTagFilter = () => {
  const toggle = elements.tagDropdownToggle;
  const searchInput = elements.tagDropdownSearch;
  if (!toggle || !elements.tagDropdownPanel) return;

  const tags = getAllTags();
  const hasTags = tags.length > 0;
  const autoTags = new Set(getAutoTags());
  const selectedTagSet = new Set(state.selectedTags);
  let hasSearchQuery = Boolean(state.tagSearchQuery?.trim());

  toggle.disabled = !hasTags;
  toggle.setAttribute("aria-disabled", String(!hasTags));
  toggle.classList.toggle("is-disabled", !hasTags);
  if (!hasTags) {
    toggle.title = "暂无可用标签";
    state.tagSearchQuery = "";
    closeTagDropdown();
    hasSearchQuery = false;
  } else {
    toggle.removeAttribute("title");
  }

  if (searchInput) {
    searchInput.disabled = !hasTags;
    if (searchInput.value !== state.tagSearchQuery) {
      searchInput.value = state.tagSearchQuery;
    }
    searchInput.placeholder = hasTags ? "搜索标签..." : "暂无可用标签";
  }

  if (elements.tagDropdownBadge) {
    const count = state.selectedTags.length;
    elements.tagDropdownBadge.textContent = String(count);
    elements.tagDropdownBadge.classList.toggle("hidden", count === 0);
  }

  const filteredTags = hasTags ? filterTagsByQuery(tags, state.tagSearchQuery) : [];
  const recentTags = hasTags ? state.recentTags.filter((tag) => tags.includes(tag)) : [];
  if (hasTags && recentTags.length !== state.recentTags.length) {
    state.recentTags = recentTags;
    persistRecentTags();
  }
  const filteredRecent = filterTagsByQuery(recentTags, state.tagSearchQuery);

  renderTagList(elements.tagDropdownList, filteredTags, {
    autoTags,
    selectedTagSet,
    emptyLabel: hasTags ? (hasSearchQuery ? "无匹配标签" : "暂无标签") : "暂无标签",
  });
  renderTagList(elements.tagDropdownRecent, filteredRecent, {
    autoTags,
    selectedTagSet,
    emptyLabel: hasSearchQuery ? "最近使用无匹配标签" : "暂无最近使用",
  });

  if (elements.tagDropdownCount) {
    if (!hasTags) {
      elements.tagDropdownCount.textContent = "";
    } else if (hasSearchQuery) {
      elements.tagDropdownCount.textContent = `匹配 ${filteredTags.length} / ${tags.length}`;
    } else {
      elements.tagDropdownCount.textContent = `共 ${tags.length} 个`;
    }
  }

  updateTagDropdownVisibility();
};

const renderTagList = (container, tags, { autoTags, selectedTagSet, emptyLabel }) => {
  if (!container) return;
  container.innerHTML = "";
  if (!tags.length) {
    if (emptyLabel) {
      const empty = document.createElement("p");
      empty.className = "tag-dropdown__empty";
      empty.textContent = emptyLabel;
      container.appendChild(empty);
    }
    return;
  }
  const fragment = document.createDocumentFragment();
  tags.forEach((tag) => {
    fragment.appendChild(
      createTagDropdownOption(tag, {
        isAuto: autoTags.has(tag),
        isActive: autoTags.has(tag) || selectedTagSet.has(tag),
      })
    );
  });
  container.appendChild(fragment);
};

const createTagDropdownOption = (tag, { isAuto, isActive }) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tag-dropdown__option";
  button.dataset.tagOption = tag;
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", String(Boolean(isActive)));
  if (isActive) {
    button.classList.add("is-active");
  }
  if (isAuto) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.classList.add("is-auto");
    button.title = "由当前客户端自动应用";
  }

  const label = document.createElement("span");
  label.className = "tag-dropdown__option-label";
  label.textContent = tag;
  button.appendChild(label);

  if (isAuto) {
    const meta = document.createElement("span");
    meta.className = "tag-dropdown__option-meta";
    meta.textContent = "自动";
    button.appendChild(meta);
  }

  return button;
};

const renderPromptList = () => {
  const container = elements.promptList;
  if (!container) return;
  container.setAttribute("role", "list");
  hidePromptTooltip();
  container.innerHTML = "";
  const prompts = getFilteredPrompts();
  if (!prompts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂无符合条件的提示词";
    container.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  prompts.forEach((prompt) => {
    fragment.appendChild(createPromptListItem(prompt));
  });
  container.appendChild(fragment);
};

const createPromptListItem = (prompt) => {
  const item = document.createElement("div");
  item.className = "prompt-list-item";
  item.dataset.promptId = String(prompt.id ?? "");
  item.setAttribute("role", "listitem");

  const title = document.createElement("span");
  title.className = "prompt-item-title";
  title.textContent = prompt.name || "未命名提示词";
  item.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "prompt-item-actions";
  actions.appendChild(
    createPromptActionButton("apply", "应用提示词", () => applyPrompt(prompt.id))
  );
  actions.appendChild(
    createPromptActionButton("append", "追加提示词", () => appendPrompt(prompt.id))
  );
  item.appendChild(actions);

  attachPromptHoverHandlers(title, prompt);
  return item;
};

const createPromptActionButton = (type, label, handler) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `prompt-action-btn prompt-action-${type}`;
  button.setAttribute("aria-label", label);
  button.setAttribute("data-tooltip", label);

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "w-4 h-4");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  if (type === "apply") {
    path.setAttribute("d", "M5 3l14 9-14 9V3z");
  } else if (type === "append") {
    path.setAttribute("d", "M12 5v14m-7-7h14");
  }

  icon.appendChild(path);
  button.appendChild(icon);

  button.addEventListener("click", () => {
    hidePromptTooltip();
    handler();
  });

  return button;
};

const attachPromptHoverHandlers = (element, prompt) => {
  element.addEventListener("mouseenter", (event) => {
    tooltipState.anchorHovered = true;
    scheduleTooltipHide.cancel();
    scheduleTooltipShow({ prompt, x: event.clientX, y: event.clientY });
  });
  element.addEventListener("mousemove", (event) => {
    tooltipState.anchorHovered = true;
    if (!isPromptTooltipVisible(prompt.id)) {
      scheduleTooltipShow({ prompt, x: event.clientX, y: event.clientY });
    }
  });
  element.addEventListener("mouseleave", () => {
    tooltipState.anchorHovered = false;
    scheduleTooltipShow.cancel();
    scheduleTooltipHide();
  });
  element.addEventListener(
    "touchstart",
    () => {
      scheduleTooltipShow.cancel();
      hidePromptTooltip();
    },
    { passive: true }
  );
};

const isPromptTooltipVisible = (promptId) => {
  const tooltip = elements.promptTooltip;
  if (!tooltip) return false;
  if (tooltip.classList.contains("hidden")) {
    return false;
  }
  if (!promptId) {
    return true;
  }
  return tooltipState.activePromptId === promptId;
};

const showPromptTooltip = (prompt, clientX, clientY) => {
  const tooltip = elements.promptTooltip;
  if (!tooltip) return;
  tooltipState.activePromptId = prompt.id;
  tooltip.dataset.promptId = String(prompt.id ?? "");
  if (elements.promptTooltipTitle) {
    elements.promptTooltipTitle.textContent = prompt.name || "未命名提示词";
  }
  if (elements.promptTooltipTags) {
    elements.promptTooltipTags.innerHTML = "";
    const tags = Array.isArray(prompt.tags) ? prompt.tags : [];
    if (tags.length) {
      tags.forEach((tag) => {
        const badge = document.createElement("span");
        badge.className = "prompt-tooltip-tag";
        badge.textContent = tag;
        elements.promptTooltipTags.appendChild(badge);
      });
    } else {
      const emptyTag = document.createElement("span");
      emptyTag.className = "prompt-tooltip-tag muted";
      emptyTag.textContent = "无标签";
      elements.promptTooltipTags.appendChild(emptyTag);
    }
  }
  if (elements.promptTooltipContent) {
    elements.promptTooltipContent.textContent = prompt.content ?? "";
  }
  tooltip.classList.remove("hidden");
  tooltip.setAttribute("aria-hidden", "false");
  positionPromptTooltip(clientX, clientY);
};

const hidePromptTooltip = () => {
  scheduleTooltipShow.cancel();
  scheduleTooltipHide.cancel();
  const tooltip = elements.promptTooltip;
  if (!tooltip) return;
  tooltip.classList.add("hidden");
  tooltip.setAttribute("aria-hidden", "true");
  tooltipState.activePromptId = null;
  tooltipState.anchorHovered = false;
  tooltipState.tooltipHovered = false;
  delete tooltip.dataset.promptId;
};

const positionPromptTooltip = (clientX = 0, clientY = 0) => {
  const tooltip = elements.promptTooltip;
  if (!tooltip) return;
  const offsetX = 18;
  const offsetY = 10;
  const padding = 12;
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  let left = clientX + offsetX;
  let top = clientY + offsetY;
  const maxLeft = window.innerWidth - tooltipWidth - padding;
  const maxTop = window.innerHeight - tooltipHeight - padding;
  left = Math.min(Math.max(padding, left), Math.max(padding, maxLeft));
  top = Math.min(Math.max(padding, top), Math.max(padding, maxTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
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
