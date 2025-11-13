import { PromptAPI, ClientAPI, ConfigFileAPI, AppStateAPI, SnapshotAPI } from "./api.js";
import { showToast, showLoading, hideLoading, showActionToast, showConfirm, showPrompt } from "./utils.js";
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
import { initI18n, t, applyTranslations, onLanguageChange } from "./i18n.js";

const appWindow = getCurrentWindow();
const WINDOW_BEHAVIOR_STORAGE_KEY = "spv.windowBehavior";
const WINDOW_BEHAVIOR_EVENT = "window-behavior-updated";
const DEFAULT_WINDOW_BEHAVIOR = Object.freeze({
  closeBehavior: "tray",
});

const state = {
  clients: [],
  currentClientId: "claude",
  prompts: [],
  selectedTags: [],
  recentTags: [],
  tagDropdownOpen: false,
  tagSearchQuery: "",
  configFileDropdownOpen: false,
  configFileDropdownFocusIndex: -1,
  configContent: "",
  currentConfigPath: null,
  splitRatio: 0.5,
  editorMode: "edit",
  monacoEditor: null,
  editorDirty: false,
  fileChangeToast: null,
  suppressEditorChange: false,
  fileChangeUnlisten: null,
  silentReloadUnlisten: null,
  windowBehaviorUnlisten: null,
  isSavingInternally: false,
  windowBehavior: { ...DEFAULT_WINDOW_BEHAVIOR },
};

const elements = {};
const TOOLTIP_DELAY = 100;
const TOOLTIP_HIDE_DELAY = 150;
const SPLIT_RATIO_KEY = "splitRatio";
const SPLIT_MIN_RATIO = 0.2;
const SPLIT_MAX_RATIO = 0.8;
const DESKTOP_BREAKPOINT = 1024;
const RESIZER_HOVER_CLASSES = ["hover:bg-gray-400", "dark:hover:bg-gray-500"];
const RESIZER_INACTIVE_CLASSES = ["bg-gray-300", "dark:bg-gray-600"];
const RESIZER_ACTIVE_CLASSES = ["bg-primary"];
const PROMPT_TOOLTIP_MIN_WIDTH = 300;
const PROMPT_TOOLTIP_MIN_HEIGHT = 200;
const TOOLTIP_VIEWPORT_PADDING = 12;
const tooltipState = {
  activePromptId: null,
  anchorHovered: false,
  tooltipHovered: false,
  isPinned: false,
  manualPosition: null,
  manualSize: null,
  pendingPosition: null,
  pendingSize: null,
  dragFrameId: null,
  resizeFrameId: null,
  drag: {
    active: false,
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0,
  },
  resize: {
    active: false,
    startX: 0,
    startY: 0,
    initialWidth: 0,
    initialHeight: 0,
  },
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

const sanitizeWindowBehaviorValue = (value, allowedValues, fallback) => {
  if (typeof value !== "string") {
    return fallback;
  }
  return allowedValues.includes(value) ? value : fallback;
};

const resolveWindowBehavior = (behavior) => {
  if (!behavior || typeof behavior !== "object") {
    return { ...DEFAULT_WINDOW_BEHAVIOR };
  }
  const closeSource = behavior.closeBehavior ?? behavior.close_behavior;
  return {
    closeBehavior: sanitizeWindowBehaviorValue(
      closeSource,
      ["exit", "tray"],
      DEFAULT_WINDOW_BEHAVIOR.closeBehavior
    ),
  };
};

const loadWindowBehavior = () => {
  let resolvedBehavior = { ...DEFAULT_WINDOW_BEHAVIOR };
  try {
    const stored = window.localStorage?.getItem(WINDOW_BEHAVIOR_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      resolvedBehavior = resolveWindowBehavior(parsed);
      console.log(
        `[WindowBehavior] Loaded from storage: close=${resolvedBehavior.closeBehavior}`
      );
    } else {
      console.log("[WindowBehavior] No stored window behavior, using defaults");
    }
  } catch (error) {
    console.warn("[WindowBehavior] Failed to read behavior from storage, using defaults:", error);
  }
  return { ...resolvedBehavior };
};

const handleWindowBehaviorStorageEvent = (event) => {
  if (!event || event.key !== WINDOW_BEHAVIOR_STORAGE_KEY) {
    return;
  }

  let updatedBehavior = { ...DEFAULT_WINDOW_BEHAVIOR };
  if (event.newValue) {
    try {
      updatedBehavior = resolveWindowBehavior(JSON.parse(event.newValue));
    } catch (error) {
      console.warn("[WindowBehavior] Failed to parse storage payload, falling back to defaults:", error);
    }
  } else {
    console.log("[WindowBehavior] Storage key removed, falling back to defaults");
  }

  const previousBehavior = state.windowBehavior?.closeBehavior;
  state.windowBehavior = { ...updatedBehavior };
  if (previousBehavior !== state.windowBehavior.closeBehavior) {
    console.log(
      `[WindowBehavior] Storage event update: close=${state.windowBehavior.closeBehavior}`
    );
  } else {
    console.log("[WindowBehavior] Storage event received but behavior unchanged");
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", handleWindowBehaviorStorageEvent);
}

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
  if (
    !tooltipState.isPinned &&
    !tooltipState.anchorHovered &&
    !tooltipState.tooltipHovered
  ) {
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

const formatSnapshotName = (prefix) => {
  const defaultLabel = t("snapshots.autoPrefix", "Auto Snapshot");
  const label = typeof prefix === "string" && prefix.trim() ? prefix.trim() : defaultLabel;
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`;
  return `${label} ${formatted}`;
};

const createAutoSnapshot = async (clientId, prefix = null) => {
  if (!clientId) {
    throw new Error(t("errors.missingClientId", "Missing client ID, cannot create snapshot"));
  }
  const name = formatSnapshotName(prefix);

  try {
    await SnapshotAPI.create(clientId, name, true, "");
    await SnapshotAPI.refreshTrayMenu();
    console.log(`[Snapshot] 已创建快照: ${name} (客户端: ${clientId})`);
    return name;
  } catch (error) {
    if (error && typeof error === "string" && error.includes("内容未变化")) {
      console.log(`[Snapshot] 内容未变化,跳过快照: ${prefix} (客户端: ${clientId})`);
      return null;
    }
    console.warn(`[Snapshot] 创建快照失败:`, error);
    return null;
  }
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
  elements.configFileSelectContainer = document.getElementById("configFileSelectContainer");
  elements.configFileDropdown = document.getElementById("configFileDropdown");
  elements.configFileDropdownToggle = document.getElementById("configFileDropdownToggle");
  elements.configFileDropdownLabel = document.getElementById("configFileDropdownLabel");
  elements.configFileDropdownPanel = document.getElementById("configFileDropdownPanel");
  elements.configFileDropdownList = document.getElementById("configFileDropdownList");
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
  elements.promptTooltipHeader = elements.promptTooltip?.querySelector(".prompt-tooltip-header");
  elements.promptTooltipPinButton = elements.promptTooltip?.querySelector("[data-action=\"pin-tooltip\"]");
  elements.promptTooltipResizeHandle = elements.promptTooltip?.querySelector(".prompt-tooltip-resize-handle");
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
    const clientDropdown = elements.clientDropdown;
    if (clientDropdown && !clientDropdown.contains(event.target)) {
      closeClientDropdown();
    }
    const configDropdown = elements.configFileDropdown;
    if (configDropdown && !configDropdown.contains(event.target)) {
      closeConfigFileDropdown();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (tooltipState.isPinned) {
        togglePinTooltip(false);
        hidePromptTooltip();
        return;
      }
      closeClientDropdown();
      closeConfigFileDropdown();
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
      if (tooltipState.isPinned) {
        return;
      }
      const tooltip = elements.promptTooltip;
      if (tooltip && tooltip.contains(event.target)) {
        return;
      }
      hidePromptTooltip();
    },
    true
  );
  window.addEventListener("resize", () => {
    if (tooltipState.isPinned) {
      ensurePinnedTooltipInViewport();
    } else {
      hidePromptTooltip();
    }
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
    if (!tooltipState.isPinned) {
      scheduleTooltipHide();
    }
  });
  bindConfigFileDropdownEvents();
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
        reject(new Error(t("errors.monacoLoaderUnavailable", "Monaco loader unavailable")));
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
                reject(new Error(t("errors.monacoInitFailed", "Monaco Editor failed to initialize")));
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
  textarea.placeholder = t("editor.fallbackPlaceholder", "Edit the selected client's config here");
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
  showToast(t("toast.editorFallback", "Editor failed to load, switched to basic mode"), "warning");
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

  const loadingText = t("editor.previewLoading", "Rendering preview...");
  elements.markdownPreviewBody.innerHTML = `
    <div class="flex items-center justify-center p-8">
      <div class="text-sm text-gray-500 dark:text-gray-400">${loadingText}</div>
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
      console.error("[Markdown] Render failed", error);
      const errorText = t("editor.previewError", "Failed to render preview");
      const safeMessage =
        typeof error?.message === "string" && error.message.trim()
          ? `: ${DOMPurify.sanitize(error.message)}`
          : "";
      elements.markdownPreviewBody.innerHTML = `<p class="text-sm text-red-500">${errorText}${safeMessage}</p>`;
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

  if (elements.btnToggleEditorMode) {
    const tooltipKey = isPreview ? "editor.edit" : "editor.preview";
    const tooltipText = t(tooltipKey, isPreview ? "Edit" : "Preview");
    const ariaLabelKey = isPreview ? "editor.switchToEdit" : "editor.switchToPreview";
    elements.btnToggleEditorMode.setAttribute("data-tooltip", tooltipText);
    elements.btnToggleEditorMode.setAttribute("aria-label", t(ariaLabelKey, "Switch editor mode"));
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

const bindConfigFileDropdownEvents = () => {
  elements.configFileDropdownToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleConfigFileDropdown();
  });
  elements.configFileDropdownToggle?.addEventListener("keydown", handleConfigFileToggleKeydown);
  elements.configFileDropdownPanel?.addEventListener("keydown", handleConfigFilePanelKeydown);
};

const handleConfigFileToggleKeydown = (event) => {
  const toggle = elements.configFileDropdownToggle;
  if (!toggle || toggle.disabled) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    openConfigFileDropdown();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    openConfigFileDropdown();
    const options = getConfigFileDropdownOptions();
    if (options.length) {
      focusConfigFileDropdownOption(options.length - 1);
    }
  } else if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    toggleConfigFileDropdown();
  }
};

const handleConfigFilePanelKeydown = (event) => {
  if (!state.configFileDropdownOpen) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveConfigFileDropdownFocus(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveConfigFileDropdownFocus(-1);
  } else if (event.key === "Home") {
    event.preventDefault();
    focusConfigFileDropdownOption(0);
  } else if (event.key === "End") {
    event.preventDefault();
    const options = getConfigFileDropdownOptions();
    if (options.length) {
      focusConfigFileDropdownOption(options.length - 1);
    }
  } else if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    activateFocusedConfigFileOption();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeConfigFileDropdown();
  }
};

const toggleConfigFileDropdown = (forceState) => {
  const toggle = elements.configFileDropdownToggle;
  if (!toggle || toggle.disabled) return;
  const shouldOpen =
    typeof forceState === "boolean" ? forceState : !state.configFileDropdownOpen;
  if (shouldOpen) {
    openConfigFileDropdown();
  } else {
    closeConfigFileDropdown();
  }
};

const openConfigFileDropdown = () => {
  const toggle = elements.configFileDropdownToggle;
  const panel = elements.configFileDropdownPanel;
  if (!toggle || !panel || toggle.disabled) return;
  state.configFileDropdownOpen = true;
  panel.setAttribute("aria-hidden", "false");
  toggle.setAttribute("aria-expanded", "true");
  const options = getConfigFileDropdownOptions();
  if (options.length) {
    const selectedIndex = options.findIndex(
      (option) => option.getAttribute("aria-selected") === "true"
    );
    const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
    focusConfigFileDropdownOption(targetIndex);
  }
};

const closeConfigFileDropdown = () => {
  const toggle = elements.configFileDropdownToggle;
  const panel = elements.configFileDropdownPanel;
  if (!toggle || !panel) return;
  const wasOpen = state.configFileDropdownOpen;
  state.configFileDropdownOpen = false;
  state.configFileDropdownFocusIndex = -1;
  panel.setAttribute("aria-hidden", "true");
  toggle.setAttribute("aria-expanded", "false");
  getConfigFileDropdownOptions().forEach((option) => {
    option.tabIndex = -1;
  });
  if (
    wasOpen &&
    document.activeElement &&
    panel.contains(document.activeElement) &&
    typeof toggle.focus === "function"
  ) {
    toggle.focus();
  }
};

const getConfigFileDropdownOptions = () => {
  const list = elements.configFileDropdownList;
  if (!list) return [];
  return Array.from(list.querySelectorAll("[data-config-path]"));
};

const focusConfigFileDropdownOption = (index) => {
  const options = getConfigFileDropdownOptions();
  if (!options.length) return;
  const clampedIndex = Math.max(0, Math.min(index, options.length - 1));
  state.configFileDropdownFocusIndex = clampedIndex;
  options.forEach((option, optionIndex) => {
    option.tabIndex = optionIndex === clampedIndex ? 0 : -1;
  });
  const target = options[clampedIndex];
  if (target) {
    target.focus({ preventScroll: true });
  }
};

const moveConfigFileDropdownFocus = (delta) => {
  const options = getConfigFileDropdownOptions();
  if (!options.length) return;
  const currentIndex = state.configFileDropdownFocusIndex;
  const nextIndex =
    currentIndex < 0
      ? delta > 0
        ? 0
        : options.length - 1
      : (currentIndex + delta + options.length) % options.length;
  focusConfigFileDropdownOption(nextIndex);
};

const activateFocusedConfigFileOption = () => {
  const options = getConfigFileDropdownOptions();
  const target = options[state.configFileDropdownFocusIndex] || null;
  if (target) {
    target.click();
  }
};

const selectConfigFilePath = (path) => {
  if (!path) return;
  closeConfigFileDropdown();
  switchConfigFile(path);
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
  try {
    await initI18n();
  } catch (error) {
    console.error("[i18n] Initialization failed:", error);
  }
  applyTranslations(document);
  onLanguageChange(() => {
    applyTranslations(document);
    updateConfigFileName();
    renderClientDropdown();
    renderTagFilter();
    renderPromptList();
    setModeToggleState();
    if (elements.configEditor?.id === "configEditorFallback") {
      elements.configEditor.placeholder = t(
        "editor.fallbackPlaceholder",
        "Edit the selected client's config here"
      );
    }
  });

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
  bindPromptTooltipInteractions();
  initButtonTooltips();
  hydrateRecentTags();
  hydrateEditorMode(); // 恢复上次的编辑/预览模式
  bindEvents();
  toggleEditorMode(state.editorMode);
  initResizer();
  state.windowBehavior = loadWindowBehavior();
  console.log(
    `[WindowBehavior] Initialized: close=${state.windowBehavior.closeBehavior}`
  );
  await registerWindowStatePersistence();
  await subscribeWindowBehaviorEvents();
  try {
    await withLoading(async () => {
      await initMonacoEditor();
      await loadClients();
      await hydrateAppState();
      await loadPrompts();
      const currentClient = getCurrentClient();
      await loadConfigFile(state.currentClientId, currentClient?.active_config_path || null);
    });
    renderClientDropdown();
    renderTagFilter();
    renderPromptList();
    if (state.currentClientId) {
      try {
        await createAutoSnapshot(
          state.currentClientId,
          t("snapshots.startupPrefix", "Startup Snapshot")
        );
      } catch (error) {
        console.warn("创建启动快照失败:", error);
      }
    }
    await listenToFileChanges();
    await startFileWatcher(state.currentClientId);
  } catch (error) {
    showToast(getErrorMessage(error) || t("toast.initFailed", "Initialization failed"), "error");
  }
};

const loadClients = async () => {
  const clients = await ClientAPI.getAll();
  state.clients = Array.isArray(clients) ? clients : [];
  if (!state.clients.length) {
    throw new Error(t("errors.noClientsConfigured", "No clients configured"));
  }
};

const hydrateAppState = async () => {
  try {
    const appState = await AppStateAPI.get();
    if (appState?.current_client_id) {
      state.currentClientId = appState.current_client_id;
    }
  } catch (error) {
    showToast(
      getErrorMessage(error) ||
        t("toast.loadAppStateFailed", "Failed to load app state, using default client"),
      "warning"
    );
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

      const behavior = loadWindowBehavior();
      state.windowBehavior = behavior;
      console.log(`[WindowState] Using latest closeBehavior=${behavior.closeBehavior}`);

      console.log("[WindowState] 开始保存窗口状态...");
      await persistWindowState();
      console.log("[WindowState] 窗口状态保存完成");

      if (behavior.closeBehavior === "tray") {
        console.log("[WindowState] 采用托盘模式，尝试隐藏窗口");
        try {
          await appWindow.hide();
          console.log("[WindowState] 窗口已隐藏到托盘");
        } catch (error) {
          console.error("[WindowState] 隐藏到托盘失败，尝试直接销毁:", error);
          try {
            await appWindow.destroy();
            console.log("[WindowState] 托盘失败后窗口销毁成功");
          } catch (destroyError) {
            console.error("[WindowState] 托盘失败后的销毁操作也失败:", destroyError);
          }
        }
        return;
      }

      console.log("[WindowState] 采用退出模式，开始销毁窗口...");
      try {
        await appWindow.destroy();
        console.log("[WindowState] 窗口销毁成功");
      } catch (error) {
        console.error("[WindowState] 退出模式下关闭窗口失败:", error);
      }
    });
    console.log("[WindowState] 窗口关闭事件监听器注册成功");
  } catch (error) {
    console.error("[WindowState] 注册窗口关闭事件失败:", error);
  }
};

const subscribeWindowBehaviorEvents = async () => {
  if (typeof state.windowBehaviorUnlisten === "function") {
    return;
  }
  try {
    state.windowBehaviorUnlisten = await listen(WINDOW_BEHAVIOR_EVENT, (event) => {
      const payload = event?.payload ?? null;
      const resolved = resolveWindowBehavior(payload);
      const previousBehavior = state.windowBehavior?.closeBehavior;
      state.windowBehavior = resolved;
      if (previousBehavior !== resolved.closeBehavior) {
        console.log(
          `[WindowBehavior] Event bus update: close=${resolved.closeBehavior}`
        );
      }
    });
    console.log("[WindowBehavior] Subscribed to cross-window updates");
  } catch (error) {
    console.warn("[WindowBehavior] Failed to subscribe to event bus updates:", error);
  }
};

const cleanupWindowBehaviorListener = () => {
  if (typeof state.windowBehaviorUnlisten === "function") {
    state.windowBehaviorUnlisten();
    state.windowBehaviorUnlisten = null;
  }
};

const loadPrompts = async () => {
  try {
    const prompts = await PromptAPI.getAll();
    state.prompts = Array.isArray(prompts) ? prompts : [];
  } catch (error) {
    throw new Error(getErrorMessage(error) || t("errors.loadPromptsFailed", "Failed to load prompts"));
  }
};

const loadConfigFile = async (clientId, configPath = null) => {
  if (!clientId) return false;
  let success = true;
  try {
    console.log(`[LoadConfig] Reading config for client: ${clientId}, path: ${configPath ?? "default"}`);
    const content = await ConfigFileAPI.read(clientId, configPath);
    state.configContent = content ?? "";
    console.log(`[LoadConfig] Content loaded, length: ${state.configContent.length}`);
    state.currentConfigPath = configPath;
  } catch (error) {
    success = false;
    state.configContent = "";
    showToast(getErrorMessage(error) || t("toast.readConfigFailed", "Failed to read config file"), "error");
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
  const success = await loadConfigFile(state.currentClientId, state.currentConfigPath || null);
  if (success) {
    dismissFileChangeToast();
    console.log("[Reload] Config reloaded successfully");
    showToast(t("toast.configReloaded", "Configuration reloaded"), "success");
  } else {
    console.error("[Reload] Config reload failed");
    showToast(t("toast.reloadFailed", "Reload failed"), "error");
  }
};

const reloadConfigSilently = async () => {
  console.log("[ReloadSilent] Starting silent config reload...");
  if (!state.currentClientId) {
    console.warn("[ReloadSilent] No current client ID");
    return;
  }
  const success = await loadConfigFile(state.currentClientId, state.currentConfigPath || null);
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
      t("toast.configChanged", "Config file changed externally"),
      t("actions.reload", "Reload"),
      async () => {
        console.log("[FileChange] User clicked reload button (with unsaved changes)");
        const confirmed = await showConfirm(
          t(
            "dialogs.configChangedConfirm",
            "The config file was changed externally. Reload and discard local changes?"
          )
        );
        console.log(`[FileChange] User confirmed: ${confirmed}`);
        if (confirmed) {
          await reloadConfigFile();
        }
      }
    );
  } else {
    console.log("[FileChange] Showing toast (no unsaved changes)");
    state.fileChangeToast = showActionToast(
      t("toast.configUpdated", "Config file updated"),
      t("actions.reload", "Reload"),
      async () => {
        console.log("[FileChange] User clicked reload button");
        await reloadConfigFile();
      }
    );
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
          const payload = event?.payload;
          const payloadIsObject = typeof payload === "object" && payload !== null;
          const targetClientId = payloadIsObject
            ? payload.client_id ?? payload.clientId ?? null
            : null;
          const targetPath = payloadIsObject
            ? payload.path ?? null
            : typeof payload === "string"
              ? payload
              : null;

          if (targetClientId && targetClientId !== state.currentClientId) {
            console.log(
              `[FileWatcher] Switching client from ${state.currentClientId} to ${targetClientId} for silent reload (path: ${
                targetPath ?? "unknown"
              })`
            );
            await switchClient(targetClientId);
          } else if (!targetClientId) {
            console.log("[FileWatcher] Silent reload payload missing client_id, using current client");
          }

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
      showToast(t("toast.configSaved", "Configuration saved"), "success");
    }
    if (createSnapshot) {
      const name = await showPrompt(
        t("dialogs.snapshotNamePrompt", "Enter a snapshot name (leave blank to cancel):"),
        ""
      );
      const trimmedName = name?.trim();
      if (trimmedName) {
        try {
          await SnapshotAPI.create(state.currentClientId, trimmedName, false, "");
          await SnapshotAPI.refreshTrayMenu();
          console.info(`[Snapshot] 手动快照已创建：${trimmedName} (client: ${state.currentClientId})`);
          const messageTemplate = t("toast.snapshotCreated", 'Snapshot "{value}" created');
          showToast(messageTemplate.replace("{value}", trimmedName), "success");
        } catch (error) {
          console.warn("手动创建快照失败:", error);
          showToast(t("toast.snapshotFailed", "Failed to create snapshot"), "error");
        }
      }
    }
    return true;
  } catch (error) {
    state.isSavingInternally = false;
    showToast(
      getErrorMessage(error) || t("toast.saveConfigFailed", "Failed to save configuration"),
      "error"
    );
    return false;
  }
};

const switchClient = async (clientId) => {
  if (clientId === state.currentClientId) return;
  const previousClientId = state.currentClientId;
  if (previousClientId) {
    try {
      await createAutoSnapshot(
        previousClientId,
        t("snapshots.autoSavePrefix", "Auto Save")
      );
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
  const client = getCurrentClient();
  try {
    await stopFileWatcher();
    await withLoading(async () => {
      await AppStateAPI.setCurrentClient(clientId);
      await loadConfigFile(clientId, client?.active_config_path || null);
    });
    await startFileWatcher(clientId);
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.switchClientFailed", "Failed to switch client"),
      "error"
    );
  }
};

const switchConfigFile = async (configPath) => {
  if (!state.currentClientId) return;
  if (configPath === state.currentConfigPath) return;

  const client = getCurrentClient();
  if (!client || !client.config_file_paths?.includes(configPath)) {
    showToast(t("toast.invalidConfigPath", "Invalid config path"), "error");
    return;
  }

  try {
    await withLoading(async () => {
      if (state.editorDirty) {
        await saveConfigFile();
      }

      await ClientAPI.update(
        state.currentClientId,
        undefined,
        undefined,
        configPath,
        undefined
      );

      await loadConfigFile(state.currentClientId, configPath);

      await loadClients();

      renderClientDropdown();
      renderConfigFileDropdown();
    });

    showToast(t("toast.configSwitched", "Config file switched"), "success");
  } catch (error) {
    showToast(
      getErrorMessage(error) || t("toast.switchConfigFailed", "Failed to switch config"),
      "error"
    );
  }
};

const getConfigFileDisplayName = (path, fallbackLabel = "") => {
  if (typeof path !== "string" || !path.length) {
    return fallbackLabel;
  }
  const fileName = path.split(/[/\\]/).filter(Boolean).pop();
  return fileName || path || fallbackLabel;
};

const renderConfigFileDropdown = () => {
  const client = getCurrentClient();
  const container = elements.configFileSelectContainer;
  const label = elements.configFileDropdownLabel;
  const toggle = elements.configFileDropdownToggle;
  const list = elements.configFileDropdownList;
  const noClientLabel = t("clients.noClientSelected", "No Client Selected");

  const configPaths = client?.config_file_paths ?? [];

  // 始终显示容器
  container?.classList.remove("hidden");

  if (!client || configPaths.length === 0) {
    closeConfigFileDropdown();
    if (label) {
      label.textContent = noClientLabel;
    }
    if (list) {
      list.innerHTML = "";
    }
    if (toggle) {
      toggle.disabled = true;
      toggle.setAttribute("aria-disabled", "true");
      toggle.style.cursor = "default";
      // 隐藏下拉图标
      const icon = toggle.querySelector(".client-dropdown__icon");
      if (icon) icon.style.display = "none";
    }
    return;
  }

  let activePath =
    state.currentConfigPath || client.active_config_path || configPaths[0];
  if (!configPaths.includes(activePath)) {
    activePath = configPaths[0];
  }
  const activeLabel = getConfigFileDisplayName(activePath, client.name || noClientLabel);
  if (label) {
    label.textContent = activeLabel;
  }

  if (configPaths.length === 1) {
    closeConfigFileDropdown();
    if (list) {
      list.innerHTML = "";
    }
    if (toggle) {
      toggle.disabled = true;
      toggle.setAttribute("aria-disabled", "true");
      toggle.style.cursor = "default";
      // 隐藏下拉图标
      const icon = toggle.querySelector(".client-dropdown__icon");
      if (icon) icon.style.display = "none";
    }
    return;
  }

  // 多文件情况，启用下拉菜单
  if (toggle) {
    toggle.disabled = false;
    toggle.setAttribute("aria-disabled", "false");
    toggle.style.cursor = "pointer";
    // 显示下拉图标
    const icon = toggle.querySelector(".client-dropdown__icon");
    if (icon) icon.style.display = "";
  }
  if (!list) return;

  list.innerHTML = "";
  const fragment = document.createDocumentFragment();
  configPaths.forEach((path) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "client-dropdown__option";
    option.textContent = getConfigFileDisplayName(path, client.name || path);
    option.dataset.configPath = path;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(path === activePath));
    option.tabIndex = -1;
    option.addEventListener("click", () => selectConfigFilePath(path));
    fragment.appendChild(option);
  });
  list.appendChild(fragment);

  if (state.configFileDropdownOpen) {
    const selectedIndex = configPaths.indexOf(activePath);
    if (selectedIndex >= 0) {
      focusConfigFileDropdownOption(selectedIndex);
    }
  } else {
    state.configFileDropdownFocusIndex = -1;
  }
};

const applyPrompt = async (promptId) => {
  const prompt = state.prompts.find((item) => item.id === promptId);
  if (!prompt) {
    showToast(t("toast.promptNotFound", "Prompt not found"), "error");
    return;
  }
  setEditorContent(prompt.content ?? "");
  const saved = await saveConfigFile({ silent: true });
  if (saved) {
    const messageTemplate = t("toast.promptApplied", 'Prompt "{value}" applied');
    const promptName = prompt.name || t("prompts.untitled", "Untitled prompt");
    showToast(messageTemplate.replace("{value}", promptName), "success");
  }
};

const appendPrompt = async (promptId) => {
  const prompt = state.prompts.find((item) => item.id === promptId);
  if (!prompt) {
    showToast(t("toast.promptNotFound", "Prompt not found"), "error");
    return;
  }
  const currentValue = getEditorContent();
  const promptContent = prompt.content ?? "";
  const needsSpacer = currentValue.trim().length > 0;
  const insertionText = `${needsSpacer ? "\n\n" : ""}${promptContent}`;
  let handledByMonaco = false;

  if (state.editorMode === "edit" && state.monacoEditor) {
    const position = state.monacoEditor.getPosition();
    if (position) {
      // 使用 Monaco 内置编辑操作以保持撤销/重做栈
      state.monacoEditor.executeEdits(
        "appendPrompt",
        [
          {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
            text: insertionText,
            forceMoveMarkers: true,
          },
        ]
      );
      handledByMonaco = true;
    }
  }

  if (!handledByMonaco) {
    const nextValue = `${currentValue}${insertionText}`;
    setEditorContent(nextValue);
  }

  const saved = await saveConfigFile({ silent: true });
  if (saved) {
    const messageTemplate = t("toast.promptAppended", 'Prompt "{value}" appended');
    const promptName = prompt.name || t("prompts.untitled", "Untitled prompt");
    showToast(messageTemplate.replace("{value}", promptName), "success");
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
  label.textContent = client ? client.name : "Select Client";
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
  const noTagsAvailable = t("tags.noAvailable", "No tags available");
  const searchPlaceholder = t("tags.searchPlaceholder", "Search tags...");
  const noTagsLabel = t("tags.noTags", "No tags");
  const noMatchLabel = t("tags.noMatch", "No matching tags");
  const noRecentLabel = t("tags.noRecent", "No recent tags");
  const noRecentMatchLabel = t("tags.noRecentMatch", "No matching tags in recent");

  toggle.disabled = !hasTags;
  toggle.setAttribute("aria-disabled", String(!hasTags));
  toggle.classList.toggle("is-disabled", !hasTags);
  if (!hasTags) {
    toggle.title = noTagsAvailable;
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
    searchInput.placeholder = hasTags ? searchPlaceholder : noTagsAvailable;
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
    emptyLabel: hasTags ? (hasSearchQuery ? noMatchLabel : noTagsLabel) : noTagsLabel,
  });
  renderTagList(elements.tagDropdownRecent, filteredRecent, {
    autoTags,
    selectedTagSet,
    emptyLabel: hasSearchQuery ? noRecentMatchLabel : noRecentLabel,
  });

  if (elements.tagDropdownCount) {
    if (!hasTags) {
      elements.tagDropdownCount.textContent = "";
    } else if (hasSearchQuery) {
      const template = t("tags.countMatched", "{matched} / {total} matched");
      elements.tagDropdownCount.textContent = template
        .replace("{matched}", String(filteredTags.length))
        .replace("{total}", String(tags.length));
    } else {
      const template = t("tags.countTotal", "{total} total");
      elements.tagDropdownCount.textContent = template.replace("{total}", String(tags.length));
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
    button.title = t("tags.autoApplyTooltip", "Applied automatically by current client");
  }

  const label = document.createElement("span");
  label.className = "tag-dropdown__option-label";
  label.textContent = tag;
  button.appendChild(label);

  if (isAuto) {
    const meta = document.createElement("span");
    meta.className = "tag-dropdown__option-meta";
    meta.textContent = t("tags.autoLabel", "Auto");
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
    empty.textContent = t("prompts.empty", "No prompts found");
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
  title.textContent = prompt.name || t("prompts.untitled", "Untitled prompt");
  item.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "prompt-item-actions";
  actions.appendChild(
    createPromptActionButton("apply", t("prompts.applyAction", "Apply Prompt"), () =>
      applyPrompt(prompt.id)
    )
  );
  actions.appendChild(
    createPromptActionButton("append", t("prompts.appendAction", "Append Prompt"), () =>
      appendPrompt(prompt.id)
    )
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
    // 即使有固定的 tooltip,也允许显示新的悬停 tooltip
    scheduleTooltipHide.cancel();
    scheduleTooltipShow({ prompt, x: event.clientX, y: event.clientY });
  });
  element.addEventListener("mousemove", (event) => {
    tooltipState.anchorHovered = true;
    // 只有当前显示的就是这个 prompt 且已固定时才阻止更新
    const isCurrentPromptPinned = tooltipState.isPinned && tooltipState.activePromptId === prompt.id;
    if (isCurrentPromptPinned) {
      return;
    }
    // 只在 tooltip 还未显示时触发显示，显示后不再跟随鼠标
    if (!isPromptTooltipVisible(prompt.id)) {
      scheduleTooltipShow({ prompt, x: event.clientX, y: event.clientY });
    }
  });
  element.addEventListener("mouseleave", () => {
    tooltipState.anchorHovered = false;
    // 固定状态下不隐藏 tooltip,因为用户可能在浏览其他提示词
    if (!tooltipState.isPinned) {
      scheduleTooltipShow.cancel();
      scheduleTooltipHide();
    }
  });
  element.addEventListener(
    "touchstart",
    () => {
      tooltipState.anchorHovered = true;
      // 触摸事件允许切换 tooltip
      scheduleTooltipShow.cancel();
      if (!tooltipState.isPinned) {
        hidePromptTooltip();
      }
    },
    { passive: true }
  );
};

const clampPinnedPosition = (left, top, width, height) => {
  const padding = TOOLTIP_VIEWPORT_PADDING;
  const maxLeft = Math.max(padding, window.innerWidth - width - padding);
  const maxTop = Math.max(padding, window.innerHeight - height - padding);
  return {
    left: Math.min(Math.max(padding, left), maxLeft),
    top: Math.min(Math.max(padding, top), maxTop),
  };
};

const clampPinnedSize = (width, height, left, top) => {
  const padding = TOOLTIP_VIEWPORT_PADDING;
  const maxWidth = Math.max(PROMPT_TOOLTIP_MIN_WIDTH, window.innerWidth - left - padding);
  const maxHeight = Math.max(PROMPT_TOOLTIP_MIN_HEIGHT, window.innerHeight - top - padding);
  return {
    width: Math.min(Math.max(PROMPT_TOOLTIP_MIN_WIDTH, width), maxWidth),
    height: Math.min(Math.max(PROMPT_TOOLTIP_MIN_HEIGHT, height), maxHeight),
  };
};

const schedulePinnedPositionUpdate = (left, top) => {
  tooltipState.pendingPosition = { left, top };
  if (tooltipState.dragFrameId) {
    return;
  }
  tooltipState.dragFrameId = window.requestAnimationFrame(() => {
    tooltipState.dragFrameId = null;
    if (!tooltipState.pendingPosition) {
      return;
    }
    const tooltip = elements.promptTooltip;
    if (!tooltip) {
      return;
    }
    const width = tooltipState.manualSize?.width || tooltip.offsetWidth;
    const height = tooltipState.manualSize?.height || tooltip.offsetHeight;
    const clamped = clampPinnedPosition(
      tooltipState.pendingPosition.left,
      tooltipState.pendingPosition.top,
      width,
      height
    );
    tooltipState.manualPosition = clamped;
    tooltip.style.left = `${clamped.left}px`;
    tooltip.style.top = `${clamped.top}px`;
    tooltipState.pendingPosition = null;
  });
};

const schedulePinnedSizeUpdate = (width, height) => {
  tooltipState.pendingSize = { width, height };
  if (tooltipState.resizeFrameId) {
    return;
  }
  tooltipState.resizeFrameId = window.requestAnimationFrame(() => {
    tooltipState.resizeFrameId = null;
    if (!tooltipState.pendingSize) {
      return;
    }
    const tooltip = elements.promptTooltip;
    if (!tooltip) {
      return;
    }
    const currentPosition =
      tooltipState.manualPosition ?? (() => {
        const rect = tooltip.getBoundingClientRect();
        return { left: rect.left, top: rect.top };
      })();
    const clampedSize = clampPinnedSize(
      tooltipState.pendingSize.width,
      tooltipState.pendingSize.height,
      currentPosition.left,
      currentPosition.top
    );
    tooltipState.manualSize = clampedSize;
    tooltip.style.width = `${clampedSize.width}px`;
    tooltip.style.height = `${clampedSize.height}px`;
    tooltipState.pendingSize = null;
    const clampedPosition = clampPinnedPosition(
      currentPosition.left,
      currentPosition.top,
      clampedSize.width,
      clampedSize.height
    );
    tooltipState.manualPosition = clampedPosition;
    tooltip.style.left = `${clampedPosition.left}px`;
    tooltip.style.top = `${clampedPosition.top}px`;
  });
};

const applyPinnedGeometry = () => {
  if (!tooltipState.isPinned) {
    return;
  }
  const tooltip = elements.promptTooltip;
  if (!tooltip) {
    return;
  }
  if (tooltipState.manualSize) {
    tooltip.style.width = `${tooltipState.manualSize.width}px`;
    tooltip.style.height = `${tooltipState.manualSize.height}px`;
  }
  if (tooltipState.manualPosition) {
    const clampedPosition = clampPinnedPosition(
      tooltipState.manualPosition.left,
      tooltipState.manualPosition.top,
      tooltipState.manualSize?.width || tooltip.offsetWidth,
      tooltipState.manualSize?.height || tooltip.offsetHeight
    );
    tooltipState.manualPosition = clampedPosition;
    tooltip.style.left = `${clampedPosition.left}px`;
    tooltip.style.top = `${clampedPosition.top}px`;
  }
};

const ensurePinnedTooltipInViewport = () => {
  if (!tooltipState.isPinned) {
    return;
  }
  const tooltip = elements.promptTooltip;
  if (!tooltip) {
    return;
  }
  const rect = tooltip.getBoundingClientRect();
  const size = tooltipState.manualSize ?? { width: rect.width, height: rect.height };
  const position = tooltipState.manualPosition ?? { left: rect.left, top: rect.top };
  const clampedSize = clampPinnedSize(size.width, size.height, position.left, position.top);
  tooltipState.manualSize = clampedSize;
  const clampedPosition = clampPinnedPosition(
    position.left,
    position.top,
    clampedSize.width,
    clampedSize.height
  );
  tooltipState.manualPosition = clampedPosition;
  tooltip.style.width = `${clampedSize.width}px`;
  tooltip.style.height = `${clampedSize.height}px`;
  tooltip.style.left = `${clampedPosition.left}px`;
  tooltip.style.top = `${clampedPosition.top}px`;
};

const handleTooltipDragStart = (event) => {
  if (event.button !== 0) {
    return;
  }
  if (!tooltipState.isPinned || tooltipState.resize.active) {
    return;
  }
  const isPinButton =
    event.target instanceof Element && event.target.closest(".prompt-tooltip-pin-button");
  if (isPinButton) {
    return;
  }
  const tooltip = elements.promptTooltip;
  if (!tooltip) {
    return;
  }
  event.preventDefault();
  tooltipState.drag.active = true;
  tooltipState.drag.startX = event.clientX;
  tooltipState.drag.startY = event.clientY;
  const rect = tooltip.getBoundingClientRect();
  tooltipState.drag.initialLeft = rect.left;
  tooltipState.drag.initialTop = rect.top;
  elements.promptTooltipHeader?.classList.add("is-dragging");
};

const handleTooltipResizeStart = (event) => {
  if (event.button !== 0) {
    return;
  }
  if (!tooltipState.isPinned || tooltipState.drag.active) {
    return;
  }
  const tooltip = elements.promptTooltip;
  if (!tooltip) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  tooltipState.resize.active = true;
  tooltipState.resize.startX = event.clientX;
  tooltipState.resize.startY = event.clientY;
  const rect = tooltip.getBoundingClientRect();
  tooltipState.resize.initialWidth = rect.width;
  tooltipState.resize.initialHeight = rect.height;
  tooltip.classList.add("is-resizing");
};

const handleTooltipPointerMove = (event) => {
  if (tooltipState.drag.active) {
    event.preventDefault();
    const left = tooltipState.drag.initialLeft + (event.clientX - tooltipState.drag.startX);
    const top = tooltipState.drag.initialTop + (event.clientY - tooltipState.drag.startY);
    schedulePinnedPositionUpdate(left, top);
    return;
  }
  if (tooltipState.resize.active) {
    event.preventDefault();
    const width = tooltipState.resize.initialWidth + (event.clientX - tooltipState.resize.startX);
    const height = tooltipState.resize.initialHeight + (event.clientY - tooltipState.resize.startY);
    schedulePinnedSizeUpdate(width, height);
  }
};

const handleTooltipPointerUp = () => {
  if (tooltipState.drag.active) {
    tooltipState.drag.active = false;
    elements.promptTooltipHeader?.classList.remove("is-dragging");
  }
  if (tooltipState.resize.active) {
    tooltipState.resize.active = false;
    elements.promptTooltip?.classList.remove("is-resizing");
  }
};

document.addEventListener("mousemove", handleTooltipPointerMove);
document.addEventListener("mouseup", handleTooltipPointerUp);

const togglePinTooltip = (nextState) => {
  const tooltip = elements.promptTooltip;
  if (!tooltip) {
    return;
  }
  const shouldPin =
    typeof nextState === "boolean" ? nextState : !tooltipState.isPinned;
  if (shouldPin === tooltipState.isPinned) {
    return;
  }
  if (shouldPin && tooltip.classList.contains("hidden")) {
    return;
  }
  tooltipState.isPinned = shouldPin;
  tooltip.classList.toggle("is-pinned", shouldPin);
  elements.promptTooltipHeader?.classList.toggle("is-draggable", shouldPin);
  const pinButton = elements.promptTooltipPinButton;
  if (pinButton) {
    pinButton.setAttribute("aria-pressed", shouldPin ? "true" : "false");
    const labelKey = shouldPin ? "prompts.unpinTooltip" : "prompts.pinTooltip";
    const fallback = shouldPin ? "Unpin prompt" : "Pin prompt";
    pinButton.setAttribute("aria-label", t(labelKey, fallback));
  }
  if (shouldPin) {
    const rect = tooltip.getBoundingClientRect();
    // 锁定当前尺寸,避免CSS重新计算导致大小变化
    tooltipState.manualSize = { width: rect.width, height: rect.height };
    tooltipState.manualPosition = clampPinnedPosition(rect.left, rect.top, rect.width, rect.height);
    tooltip.style.width = `${rect.width}px`;
    tooltip.style.height = `${rect.height}px`;
    tooltip.style.left = `${tooltipState.manualPosition.left}px`;
    tooltip.style.top = `${tooltipState.manualPosition.top}px`;
    tooltipState.pendingPosition = null;
    tooltipState.pendingSize = null;
    scheduleTooltipShow.cancel();
    scheduleTooltipHide.cancel();
  } else {
    tooltipState.drag.active = false;
    tooltipState.resize.active = false;
    tooltipState.manualPosition = null;
    tooltipState.manualSize = null;
    tooltipState.pendingPosition = null;
    tooltipState.pendingSize = null;
    if (tooltipState.dragFrameId) {
      cancelAnimationFrame(tooltipState.dragFrameId);
      tooltipState.dragFrameId = null;
    }
    if (tooltipState.resizeFrameId) {
      cancelAnimationFrame(tooltipState.resizeFrameId);
      tooltipState.resizeFrameId = null;
    }
    tooltip.classList.remove("is-resizing");
    elements.promptTooltipHeader?.classList.remove("is-dragging");
    tooltip.style.width = "";
    tooltip.style.height = "";
  }
  return tooltipState.isPinned;
};

const bindPromptTooltipInteractions = () => {
  elements.promptTooltipPinButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePinTooltip();
  });
  elements.promptTooltipHeader?.addEventListener("mousedown", handleTooltipDragStart);
  elements.promptTooltipResizeHandle?.addEventListener("mousedown", handleTooltipResizeStart);
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

  // 如果当前 tooltip 已固定且是同一个 prompt,则不做任何操作
  if (tooltipState.isPinned && tooltipState.activePromptId === prompt.id) {
    return;
  }

  // 更新 tooltip 内容(包括固定状态下也可以更新)
  tooltipState.activePromptId = prompt.id;
  tooltip.dataset.promptId = String(prompt.id ?? "");
  if (elements.promptTooltipTitle) {
    elements.promptTooltipTitle.textContent = prompt.name || t("prompts.untitled", "Untitled prompt");
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
      emptyTag.textContent = t("prompts.noTags", "No tags");
      elements.promptTooltipTags.appendChild(emptyTag);
    }
  }
  if (elements.promptTooltipContent) {
    elements.promptTooltipContent.textContent = prompt.content ?? "";
  }
  tooltip.classList.remove("hidden");
  tooltip.setAttribute("aria-hidden", "false");

  // 只有在未固定状态下才更新位置
  if (!tooltipState.isPinned) {
    positionPromptTooltip(clientX, clientY);
  }
};

const hidePromptTooltip = () => {
  scheduleTooltipShow.cancel();
  scheduleTooltipHide.cancel();
  togglePinTooltip(false);
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
  if (tooltipState.isPinned) {
    applyPinnedGeometry();
    return;
  }
  const offsetX = 24;
  const offsetY = -8;
  const padding = TOOLTIP_VIEWPORT_PADDING;
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;

  // 尝试在右侧显示
  let left = clientX + offsetX;
  let top = clientY + offsetY;

  // 如果右侧空间不足，则显示在左侧
  if (left + tooltipWidth + padding > window.innerWidth) {
    left = clientX - tooltipWidth - offsetX;
  }

  // 确保在视口范围内
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
  renderConfigFileDropdown();
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
  cleanupWindowBehaviorListener();
});

document.addEventListener("DOMContentLoaded", initApp);
