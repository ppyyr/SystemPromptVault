import { PromptAPI, ClientAPI, ConfigFileAPI, AppStateAPI, SnapshotAPI } from "./api.js";
import { showToast, showLoading, hideLoading, showActionToast, showConfirm } from "./utils.js";
import {
  initTheme,
  createThemeToggleButton,
  updateThemeIcon,
  getCurrentTheme,
  subscribeThemeChange,
} from "./theme.js";
import { listen } from "@tauri-apps/api/event";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

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
  editorMode: "edit",
  monacoEditor: null,
  editorDirty: false,
  fileChangeToast: null,
  suppressEditorChange: false,
  fileChangeUnlisten: null,
  silentReloadUnlisten: null,
  isSavingInternally: false,
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
const EDITOR_MODE_KEY = "configEditorMode";
const MAX_RECENT_TAGS = 5;
const TAG_OPTION_SELECTOR = "[data-tag-option]";
const MONACO_BASE_URL = "https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min";
const MONACO_MODULE_ID = "vs/editor/editor.main";
const MONACO_POLL_MAX_ATTEMPTS = 80;
const MONACO_POLL_INTERVAL = 50;
const MARKDOWN_RENDER_DEBOUNCE = 200;
const MARKDOWN_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
    "span",
  ],
  ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt", "class"],
  ALLOW_DATA_ATTR: false,
};

let monacoLoaderPromise = null;
let monacoThemesDefined = false;
let previewRenderTimer = null;
let fallbackEditorListener = null;
let markedConfigured = false;

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

const formatSnapshotName = (prefix = "自动快照") => {
  const label = prefix?.trim() || "自动快照";
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`;
  return `${label} ${formatted}`;
};

const createAutoSnapshot = async (clientId, content = "", prefix = "自动快照") => {
  if (!clientId) {
    throw new Error("缺少客户端 ID，无法创建自动快照");
  }
  const snapshotContent = typeof content === "string" ? content : content ?? "";
  const name = formatSnapshotName(prefix);
  await SnapshotAPI.create(clientId, name, snapshotContent, true);
  await SnapshotAPI.refreshTrayMenu();
  console.info(`[Snapshot] 自动快照已创建：${name} (client: ${clientId})`);
  return name;
};

const handleEditorChange = () => {
  if (state.suppressEditorChange) {
    return;
  }
  state.editorDirty = true;
};

const cacheElements = () => {
  elements.clientDropdown = document.getElementById("clientDropdown");
  elements.clientDropdownToggle = document.getElementById("clientDropdownToggle");
  elements.clientDropdownLabel = document.getElementById("clientDropdownLabel");
  elements.clientDropdownPanel = document.getElementById("clientDropdownPanel");
  elements.clientDropdownList = document.getElementById("clientDropdownList");
  elements.configFileName = document.getElementById("configFileName");
  elements.configEditor = document.getElementById("configEditor");
  elements.monacoEditorContainer = document.getElementById("monacoEditorContainer");
  elements.markdownPreview = document.getElementById("markdownPreview");
  elements.markdownPreviewBody = elements.markdownPreview?.querySelector(
    ".markdown-preview__body"
  );
  elements.btnToggleEditorMode = document.getElementById("btnToggleEditorMode");
  elements.iconEditMode = document.getElementById("iconEditMode");
  elements.iconPreviewMode = document.getElementById("iconPreviewMode");
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
  if (elements.configEditor) {
    elements.configEditor.addEventListener("input", handleEditorChange);
  }
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
      return;
    }
    const loweredKey = typeof event.key === "string" ? event.key.toLowerCase() : "";
    const hasSaveModifier = event.metaKey || event.ctrlKey;
    if (hasSaveModifier && loweredKey === "s") {
      event.preventDefault();
      const createSnapshot = Boolean(event.shiftKey);
      saveConfigFile({ createSnapshot });
    }
  });
  elements.btnSaveConfig?.addEventListener("click", (event) => {
    const createSnapshot = Boolean(event.shiftKey);
    saveConfigFile({ createSnapshot });
  });
  elements.btnToggleEditorMode?.addEventListener("click", () => {
    const nextMode = state.editorMode === "edit" ? "preview" : "edit";
    toggleEditorMode(nextMode);
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
    if (state.monacoEditor) {
      state.monacoEditor.layout();
    }
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

const waitForMonacoLoader = () =>
  new Promise((resolve, reject) => {
    if (typeof window.require === "function" && typeof window.require.config === "function") {
      resolve(window.require);
      return;
    }
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (typeof window.require === "function" && typeof window.require.config === "function") {
        window.clearInterval(timer);
        resolve(window.require);
        return;
      }
      if (attempts >= MONACO_POLL_MAX_ATTEMPTS) {
        window.clearInterval(timer);
        reject(new Error("Monaco Editor 加载器不可用"));
      }
    }, MONACO_POLL_INTERVAL);
  });

const ensureMonacoLoaded = async () => {
  if (window.monaco?.editor) {
    return window.monaco;
  }
  if (monacoLoaderPromise) {
    return monacoLoaderPromise;
  }
  monacoLoaderPromise = waitForMonacoLoader().then(
    (loader) =>
      new Promise((resolve, reject) => {
        try {
          loader.config({
            paths: {
              vs: `${MONACO_BASE_URL}/vs`,
            },
          });
          if (!window.MonacoEnvironment) {
            window.MonacoEnvironment = {
              getWorkerUrl() {
                const workerSource = `self.MonacoEnvironment = { baseUrl: '${MONACO_BASE_URL}/' };\nimportScripts('${MONACO_BASE_URL}/vs/base/worker/workerMain.js');`;
                return `data:text/javascript;charset=utf-8,${encodeURIComponent(workerSource)}`;
              },
            };
          }
          loader(
            [MONACO_MODULE_ID],
            () => {
              if (window.monaco?.editor) {
                resolve(window.monaco);
              } else {
                reject(new Error("Monaco Editor 未能初始化"));
              }
            },
            (error) => reject(error)
          );
        } catch (error) {
          reject(error);
        }
      })
  );
  return monacoLoaderPromise;
};

const defineMonacoThemes = (monacoInstance) => {
  if (monacoThemesDefined || !monacoInstance?.editor?.defineTheme) {
    return;
  }
  monacoInstance.editor.defineTheme("systemprompt-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a737d" },
      { token: "keyword", foreground: "f97583" },
      { token: "string", foreground: "9ecbff" },
      { token: "number", foreground: "79b8ff" },
    ],
    colors: {
      "editor.background": "#0f172a",
      "editor.foreground": "#e2e8f0",
      "editor.lineHighlightBackground": "#1e293b",
      "editorCursor.foreground": "#60a5fa",
      "editor.selectionBackground": "#334155",
      "editor.inactiveSelectionBackground": "#475569",
    },
  });
  monacoInstance.editor.defineTheme("systemprompt-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a737d" },
      { token: "keyword", foreground: "d73a49" },
      { token: "string", foreground: "032f62" },
      { token: "number", foreground: "005cc5" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1f2933",
      "editor.lineHighlightBackground": "#f1f5f9",
      "editorCursor.foreground": "#0f172a",
      "editor.selectionBackground": "#c7d2fe",
      "editor.inactiveSelectionBackground": "#e0e7ff",
    },
  });
  monacoThemesDefined = true;
};

const getCurrentMonacoTheme = () => (getCurrentTheme() === "dark" ? "systemprompt-dark" : "systemprompt-light");

const updateMonacoTheme = () => {
  if (!window.monaco?.editor || !monacoThemesDefined) return;
  window.monaco.editor.setTheme(getCurrentMonacoTheme());
};

const disposeMonacoEditor = () => {
  if (state.monacoEditor) {
    state.monacoEditor.dispose();
    state.monacoEditor = null;
  }
};

const attachFallbackEditor = () => {
  const container = elements.monacoEditorContainer;
  if (!container) return;
  disposeMonacoEditor();
  container.innerHTML = "";
  const textarea = document.createElement("textarea");
  textarea.id = "configEditorFallback";
  textarea.className =
    "w-full h-full border-0 bg-transparent p-4 font-mono text-sm resize-none outline-none";
  textarea.placeholder = "在此编辑选中客户端的配置文件";
  textarea.value = state.configContent;
  if (fallbackEditorListener && elements.configEditor) {
    elements.configEditor.removeEventListener("input", fallbackEditorListener);
  }
  container.appendChild(textarea);
  elements.configEditor = textarea;
  fallbackEditorListener = (event) => {
    state.configContent = event.target.value;
    if (state.editorMode === "preview") {
      renderMarkdownPreview();
    }
    handleEditorChange();
  };
  textarea.addEventListener("input", fallbackEditorListener);
  showToast("编辑器加载失败，已切换到基础模式", "warning");
  updateEditorAvailability();
};

const initMonacoEditor = async () => {
  if (state.monacoEditor || elements.configEditor) {
    return;
  }
  if (!elements.monacoEditorContainer) {
    return;
  }
  try {
    const monacoInstance = await ensureMonacoLoaded();
    defineMonacoThemes(monacoInstance);
    state.monacoEditor = monacoInstance.editor.create(elements.monacoEditorContainer, {
      value: state.configContent,
      language: "markdown",
      theme: getCurrentMonacoTheme(),
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: "on",
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "SF Mono", Consolas, "Courier New", monospace',
      lineNumbers: "on",
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
    });
    state.monacoEditor.onDidChangeModelContent(() => {
      state.configContent = state.monacoEditor.getValue();
      if (state.editorMode === "preview") {
        renderMarkdownPreview();
      }
      handleEditorChange();
    });
    updateMonacoTheme();
    updateEditorAvailability();
  } catch (error) {
    console.error("Monaco Editor 初始化失败", error);
    attachFallbackEditor();
  }
};

const getEditorContent = () => {
  if (state.monacoEditor) {
    return state.monacoEditor.getValue();
  }
  if (elements.configEditor) {
    return elements.configEditor.value ?? "";
  }
  return state.configContent ?? "";
};

const runWithEditorSyncSuppressed = (task) => {
  state.suppressEditorChange = true;
  try {
    task();
  } finally {
    state.suppressEditorChange = false;
  }
};

const setEditorContent = (value) => {
  const nextValue = value ?? "";
  state.configContent = nextValue;
  if (state.monacoEditor && state.monacoEditor.getValue() !== nextValue) {
    runWithEditorSyncSuppressed(() => {
      state.monacoEditor.setValue(nextValue);
    });
  } else if (elements.configEditor) {
    elements.configEditor.value = nextValue;
  }
  if (state.editorMode === "preview") {
    renderMarkdownPreview();
  }
};

const configureMarked = () => {
  if (markedConfigured) return;
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
  markedConfigured = true;
};

const renderMarkdownPreview = () => {
  if (state.editorMode !== "preview" || !elements.markdownPreviewBody) {
    return;
  }
  if (previewRenderTimer) {
    window.clearTimeout(previewRenderTimer);
  }

  // 显示加载状态
  elements.markdownPreviewBody.innerHTML = `
    <div class="flex items-center justify-center p-8">
      <div class="text-sm text-gray-500 dark:text-gray-400">正在加载预览...</div>
    </div>
  `;

  previewRenderTimer = window.setTimeout(() => {
    previewRenderTimer = null;

    configureMarked();
    const markdownText = getEditorContent();

    try {
      const rawHtml = marked.parse(markdownText ?? "");
      const cleanHtml = DOMPurify.sanitize(rawHtml, MARKDOWN_SANITIZE_OPTIONS);
      elements.markdownPreviewBody.innerHTML = cleanHtml;
    } catch (error) {
      console.error("Markdown 渲染失败", error);
      elements.markdownPreviewBody.innerHTML =
        '<p class="text-sm text-red-500">Markdown 渲染失败: ' + error.message + '</p>';
    }
  }, MARKDOWN_RENDER_DEBOUNCE);
};

const setModeToggleState = () => {
  const isPreview = state.editorMode === "preview";

  // 切换图标显示：编辑模式显示预览图标，预览模式显示编辑图标
  if (elements.iconEditMode && elements.iconPreviewMode) {
    if (isPreview) {
      elements.iconEditMode.classList.add("hidden");
      elements.iconPreviewMode.classList.remove("hidden");
    } else {
      elements.iconEditMode.classList.remove("hidden");
      elements.iconPreviewMode.classList.add("hidden");
    }
  }

  // 更新 tooltip 提示
  if (elements.btnToggleEditorMode) {
    elements.btnToggleEditorMode.setAttribute("data-tooltip", isPreview ? "编辑" : "预览");
    elements.btnToggleEditorMode.setAttribute("aria-label", isPreview ? "切换到编辑模式" : "切换到预览模式");
  }
};

const toggleEditorMode = (mode) => {
  if (!mode || (mode !== "edit" && mode !== "preview")) {
    return;
  }

  // 更新状态（如果需要）
  const stateChanged = state.editorMode !== mode;
  if (stateChanged) {
    state.editorMode = mode;
    persistEditorMode(); // 保存模式状态到 localStorage
  }

  // 执行视图切换（即使状态相同也要执行，用于重启后恢复视图）
  if (mode === "preview") {
    elements.monacoEditorContainer?.classList.add("hidden");
    elements.markdownPreview?.classList.remove("hidden");
    elements.btnSaveConfig?.classList.add("hidden");  // 预览模式隐藏保存按钮
    renderMarkdownPreview();
  } else {
    elements.markdownPreview?.classList.add("hidden");
    elements.monacoEditorContainer?.classList.remove("hidden");
    elements.btnSaveConfig?.classList.remove("hidden");  // 编辑模式显示保存按钮
    if (state.monacoEditor) {
      state.monacoEditor.layout();
    }
  }

  // 更新按钮状态
  setModeToggleState();
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
    if (state.monacoEditor) {
      state.monacoEditor.layout();
    }
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
  subscribeThemeChange(() => {
    updateMonacoTheme();
    if (state.editorMode === "preview") {
      renderMarkdownPreview();
    }
  });

  // 添加主题切换按钮
  const themeContainer = document.getElementById("themeToggleContainer");
  if (themeContainer) {
    themeContainer.appendChild(createThemeToggleButton());
    updateThemeIcon();
  }

  cacheElements();
  initButtonTooltips();
  hydrateRecentTags();
  hydrateEditorMode(); // 恢复上次的编辑/预览模式
  bindEvents();
  toggleEditorMode(state.editorMode);
  initResizer();
  await registerWindowStatePersistence();
  try {
    await withLoading(async () => {
      await initMonacoEditor();
      await loadClients();
      await hydrateAppState();
      await loadPrompts();
      await loadConfigFile(state.currentClientId);
    });
    renderClientDropdown();
    renderTagFilter();
    renderPromptList();
    if (state.currentClientId) {
      try {
        const content = await ConfigFileAPI.read(state.currentClientId);
        await createAutoSnapshot(state.currentClientId, content ?? "", "启动时自动快照");
      } catch (error) {
        console.warn("创建启动快照失败:", error);
      }
    }
    await listenToFileChanges();
    await startFileWatcher(state.currentClientId);
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

const persistWindowState = async () => {
  if (!appWindow) return;
  try {
    const [position, size] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);
    if (!position || !size) {
      return;
    }
    const x = Number.isFinite(position.x) ? Math.round(position.x) : 0;
    const y = Number.isFinite(position.y) ? Math.round(position.y) : 0;
    const width = Number.isFinite(size.width) ? Math.max(1, Math.round(size.width)) : 0;
    const height = Number.isFinite(size.height) ? Math.max(1, Math.round(size.height)) : 0;
    if (!width || !height) {
      return;
    }
    await AppStateAPI.saveWindowState(x, y, width, height);
  } catch (error) {
    console.warn("[WindowState] 保存窗口状态失败:", error);
  }
};

const registerWindowStatePersistence = async () => {
  if (!appWindow?.onCloseRequested) return;
  try {
    await appWindow.onCloseRequested(async (event) => {
      console.log("[WindowState] 关闭请求触发");
      event.preventDefault();
      console.log("[WindowState] 已阻止默认关闭行为");

      console.log("[WindowState] 开始保存窗口状态...");
      await persistWindowState();
      console.log("[WindowState] 窗口状态保存完成");

      console.log("[WindowState] 开始销毁窗口...");
      try {
        await appWindow.destroy();
        console.log("[WindowState] 窗口销毁成功");
      } catch (error) {
        console.error("[WindowState] 关闭窗口失败:", error);
      }
    });
    console.log("[WindowState] 窗口关闭事件监听器注册成功");
  } catch (error) {
    console.error("[WindowState] 注册窗口关闭事件失败:", error);
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
  if (!clientId) return false;
  let success = true;
  try {
    console.log(`[LoadConfig] Reading config for client: ${clientId}`);
    const content = await ConfigFileAPI.read(clientId);
    state.configContent = content ?? "";
    console.log(`[LoadConfig] Content loaded, length: ${state.configContent.length}`);
  } catch (error) {
    success = false;
    state.configContent = "";
    showToast(getErrorMessage(error) || "读取配置文件失败", "error");
  }
  console.log("[LoadConfig] Syncing editor...");
  syncEditor();
  state.editorDirty = false;
  console.log("[LoadConfig] Editor synced, dirty flag cleared");
  return success;
};

const startFileWatcher = async (clientId) => {
  if (!clientId) return;
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") {
    return;
  }
  const client = state.clients.find((item) => item.id === clientId);
  if (!client?.config_file_path) {
    return;
  }
  try {
    await invoke("start_watching_config", { filePath: client.config_file_path });
    console.log(`[FileWatcher] Started watching: ${client.config_file_path}`);
  } catch (error) {
    console.warn("[FileWatcher] Failed to start watching:", error);
  }
};

const stopFileWatcher = async () => {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") {
    return;
  }
  try {
    await invoke("stop_watching_config");
    console.log("[FileWatcher] Stopped watching");
  } catch (error) {
    console.warn("[FileWatcher] Failed to stop watching:", error);
  }
};

const dismissFileChangeToast = () => {
  if (state.fileChangeToast) {
    state.fileChangeToast.remove();
    state.fileChangeToast = null;
  }
};

const reloadConfigFile = async () => {
  console.log("[Reload] Starting config file reload...");
  if (!state.currentClientId) {
    console.warn("[Reload] No current client ID");
    return;
  }
  const success = await loadConfigFile(state.currentClientId);
  if (success) {
    dismissFileChangeToast();
    console.log("[Reload] Config reloaded successfully");
    showToast("配置已重新加载", "success");
  } else {
    console.error("[Reload] Config reload failed");
    showToast("重新加载失败", "error");
  }
};

const reloadConfigSilently = async () => {
  console.log("[ReloadSilent] Starting silent config reload...");
  if (!state.currentClientId) {
    console.warn("[ReloadSilent] No current client ID");
    return;
  }
  const success = await loadConfigFile(state.currentClientId);
  if (success) {
    dismissFileChangeToast();
    console.log("[ReloadSilent] Config reloaded silently");
  } else {
    console.warn("[ReloadSilent] Silent reload failed");
  }
};

const handleConfigFileChanged = async () => {
  if (state.isSavingInternally) {
    console.log("[FileChange] Ignoring file change during internal save");
    return;
  }
  console.log(`[FileChange] Config file changed, editorDirty: ${state.editorDirty}`);
  dismissFileChangeToast();
  if (state.editorDirty) {
    console.log("[FileChange] Showing toast with confirmation (has unsaved changes)");
    state.fileChangeToast = showActionToast(
      "配置文件已在外部修改",
      "重新加载",
      async () => {
        console.log("[FileChange] User clicked reload button (with unsaved changes)");
        const confirmed = await showConfirm(
          "配置文件已在外部修改，是否重新加载？（将丢失未保存的修改）"
        );
        console.log(`[FileChange] User confirmed: ${confirmed}`);
        if (confirmed) {
          await reloadConfigFile();
        }
      }
    );
  } else {
    console.log("[FileChange] Showing toast (no unsaved changes)");
    state.fileChangeToast = showActionToast("配置文件已更新", "重新加载", async () => {
      console.log("[FileChange] User clicked reload button");
      await reloadConfigFile();
    });
  }
};

const listenToFileChanges = async () => {
  console.log("[FileWatcher] listenToFileChanges() called");
  const hasExternalListener = typeof state.fileChangeUnlisten === "function";
  const hasSilentListener = typeof state.silentReloadUnlisten === "function";
  if (hasExternalListener && hasSilentListener) {
    console.log("[FileWatcher] Already listening, skipping...");
    return;
  }

  if (!hasExternalListener) {
    console.log("[FileWatcher] Registering config-file-changed listener...");
    try {
      state.fileChangeUnlisten = await listen("config-file-changed", async (event) => {
        console.log("[FileWatcher] Config file changed:", event.payload);
        try {
          await handleConfigFileChanged();
        } catch (error) {
          console.warn("[FileWatcher] Failed to process config change:", error);
        }
      });
      console.log("[FileWatcher] config-file-changed listener registered successfully!");
    } catch (error) {
      console.error("[FileWatcher] Failed to register config-file-changed listener:", error);
    }
  }

  if (!hasSilentListener) {
    console.log("[FileWatcher] Registering config-reload-silent listener...");
    try {
      state.silentReloadUnlisten = await listen("config-reload-silent", async (event) => {
        console.log("[FileWatcher] Silent reload event received:", event.payload);
        try {
          await reloadConfigSilently();
        } catch (error) {
          console.warn("[FileWatcher] Failed to process silent reload:", error);
        }
      });
      console.log("[FileWatcher] config-reload-silent listener registered successfully!");
    } catch (error) {
      console.error("[FileWatcher] Failed to register config-reload-silent listener:", error);
    }
  }
};

const cleanupFileChangeListener = () => {
  if (typeof state.fileChangeUnlisten === "function") {
    state.fileChangeUnlisten();
    state.fileChangeUnlisten = null;
  }
  if (typeof state.silentReloadUnlisten === "function") {
    state.silentReloadUnlisten();
    state.silentReloadUnlisten = null;
  }
};

const saveConfigFile = async ({ silent = false, createSnapshot = false } = {}) => {
  if (!state.currentClientId) return false;
  const content = getEditorContent();
  state.configContent = content;
  try {
    state.isSavingInternally = true;
    await withLoading(async () => {
      await ConfigFileAPI.write(state.currentClientId, state.configContent);
    });
    setTimeout(() => {
      state.isSavingInternally = false;
    }, 1000);
    state.editorDirty = false;
    if (!silent) {
      showToast("配置已保存", "success");
    }
    if (createSnapshot) {
      const name = prompt("请输入快照名称（留空取消）：");
      const trimmedName = name?.trim();
      if (trimmedName) {
        try {
          await SnapshotAPI.create(state.currentClientId, trimmedName, content ?? "", false);
          await SnapshotAPI.refreshTrayMenu();
          console.info(`[Snapshot] 手动快照已创建：${trimmedName} (client: ${state.currentClientId})`);
          showToast(`快照「${trimmedName}」已创建`, "success");
        } catch (error) {
          console.warn("手动创建快照失败:", error);
          showToast("创建快照失败", "error");
        }
      }
    }
    return true;
  } catch (error) {
    state.isSavingInternally = false;
    showToast(getErrorMessage(error) || "保存配置失败", "error");
    return false;
  }
};

const switchClient = async (clientId) => {
  if (clientId === state.currentClientId) return;
  const previousClientId = state.currentClientId;
  if (previousClientId) {
    try {
      const currentContent = getEditorContent();
      await createAutoSnapshot(previousClientId, currentContent, "自动保存");
    } catch (error) {
      console.warn("切换客户端时保存快照失败:", error);
    }
  }
  state.currentClientId = clientId;
  state.selectedTags = [];
  state.tagSearchQuery = "";
  dismissFileChangeToast();
  closeTagDropdown();
  closeClientDropdown();
  renderClientDropdown();
  renderTagFilter();
  renderPromptList();
  try {
    await stopFileWatcher();
    await withLoading(async () => {
      await AppStateAPI.setCurrentClient(clientId);
      await loadConfigFile(clientId);
    });
    await startFileWatcher(clientId);
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
  setEditorContent(prompt.content ?? "");
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
  const currentValue = getEditorContent();
  const needsSpacer = currentValue.trim().length > 0;
  const nextValue = `${currentValue}${needsSpacer ? "\n\n" : ""}${prompt.content ?? ""}`;
  setEditorContent(nextValue);
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

const hydrateEditorMode = () => {
  try {
    const stored = localStorage.getItem(EDITOR_MODE_KEY);
    if (stored === "edit" || stored === "preview") {
      state.editorMode = stored;
    }
  } catch {
    // 忽略读取异常，保持默认值
  }
};

const persistEditorMode = () => {
  try {
    localStorage.setItem(EDITOR_MODE_KEY, state.editorMode);
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
  if (state.monacoEditor) {
    const currentValue = state.monacoEditor.getValue();
    console.log(`[SyncEditor] Monaco editor current length: ${currentValue.length}, new length: ${state.configContent.length}`);
    if (state.configContent !== currentValue) {
      console.log("[SyncEditor] Updating Monaco editor value");
      runWithEditorSyncSuppressed(() => {
        state.monacoEditor.setValue(state.configContent ?? "");
      });
      console.log("[SyncEditor] Monaco editor updated");
    } else {
      console.log("[SyncEditor] Monaco editor content unchanged, skipping update");
    }
  } else if (elements.configEditor) {
    console.log(`[SyncEditor] Using fallback editor, length: ${state.configContent.length}`);
    elements.configEditor.value = state.configContent ?? "";
  }
  updateEditorAvailability();
  updateConfigFileName();
  if (state.editorMode === "preview") {
    console.log("[SyncEditor] Rendering preview");
    renderMarkdownPreview();
  }
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
  if (state.monacoEditor) {
    state.monacoEditor.updateOptions({ readOnly: !hasClient });
  }
  if (elements.configEditor) {
    elements.configEditor.disabled = !hasClient;
  }
  if (elements.btnSaveConfig) {
    elements.btnSaveConfig.disabled = !hasClient;
  }
};

const getErrorMessage = (error) => (typeof error === "string" ? error : error?.message);

window.addEventListener("beforeunload", () => {
  persistWindowState();
  stopFileWatcher();
  cleanupFileChangeListener();
});

document.addEventListener("DOMContentLoaded", initApp);
