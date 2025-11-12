import { t, getCurrentLanguage, applyTranslations } from "./i18n.js";

const TOAST_DURATION = 3600;
let loadingCounter = 0;
let confirmOverlay;
let activeConfirmHandlers = null;
let promptOverlay;
let activePromptHandlers = null;

const requireElement = (id) => {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`${t("errors.missingElement", "Missing element")}: ${id}`);
  }
  return el;
};

export const formatDate = (isoString) => {
  if (!isoString) return t("time.unknown", "Unknown");
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const diffMs = Date.now() - date.getTime();
  const locale = getCurrentLanguage() === "zh" ? "zh-CN" : "en-US";
  const replaceValue = (template, value) =>
    (template || "").includes("{value}")
      ? template.replace("{value}", String(value))
      : `${value} ${template}`;
  if (diffMs < 0) {
    return date.toLocaleString(locale, { hour12: false });
  }
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return t("time.justNow", "Just now");
  if (diffMinutes < 60) {
    return replaceValue(t("time.minutesAgo", "{value} minutes ago"), diffMinutes);
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return replaceValue(t("time.hoursAgo", "{value} hours ago"), diffHours);
  }
  if (diffHours < 48) return t("time.yesterday", "Yesterday");
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return replaceValue(t("time.daysAgo", "{value} days ago"), diffDays);
  }
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const ensureToastContainer = () => requireElement("toastContainer");

export const showToast = (message, type = "success") => {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("hide");
  }, TOAST_DURATION - 400);
  setTimeout(() => {
    toast.remove();
  }, TOAST_DURATION);
};

export const showActionToast = (message, actionLabel, onAction) => {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = "toast toast-info action-toast";

  const messageSpan = document.createElement("span");
  messageSpan.textContent = message;

  const button = document.createElement("button");
  button.className = "toast-action-btn";
  button.textContent = actionLabel;
  button.onclick = () => {
    if (typeof onAction === "function") {
      onAction();
    }
    toast.remove();
  };

  toast.appendChild(messageSpan);
  toast.appendChild(button);
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 400);
  }, 30000);

  return toast;
};

export const showLoading = () => {
  const overlay = requireElement("loadingOverlay");
  loadingCounter += 1;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
};

export const hideLoading = () => {
  const overlay = requireElement("loadingOverlay");
  loadingCounter = Math.max(0, loadingCounter - 1);
  if (loadingCounter === 0) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
};

const ensureConfirmOverlay = () => {
  if (confirmOverlay) return confirmOverlay;
  const overlay = document.createElement("div");
  overlay.id = "confirmOverlay";
  overlay.className = "confirm-overlay hidden";
  overlay.innerHTML = `
    <div class="confirm-dialog" role="dialog" aria-modal="true">
      <p class="confirm-message"></p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" data-action="cancel" data-i18n="common.cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="confirm" data-i18n="common.confirm">Confirm</button>
      </div>
    </div>
  `;
  applyTranslations(overlay);
  document.body.appendChild(overlay);
  confirmOverlay = overlay;
  return overlay;
};

const ensurePromptOverlay = () => {
  if (promptOverlay) return promptOverlay;
  const overlay = document.createElement("div");
  overlay.id = "promptOverlay";
  overlay.className = "confirm-overlay hidden";
  overlay.innerHTML = `
    <div class="confirm-dialog" role="dialog" aria-modal="true">
      <p class="confirm-message"></p>
      <input
        type="text"
        class="prompt-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        value=""
      />
      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" data-action="cancel" data-i18n="common.cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="confirm" data-i18n="common.confirm">Confirm</button>
      </div>
    </div>
  `;
  applyTranslations(overlay);
  document.body.appendChild(overlay);
  promptOverlay = overlay;
  return overlay;
};

export const showConfirm = (message) =>
  new Promise((resolve) => {
    const overlay = ensureConfirmOverlay();
    const messageNode = overlay.querySelector(".confirm-message");
    messageNode.textContent = message;
    overlay.classList.remove("hidden");

    const cleanup = (result) => {
      overlay.classList.add("hidden");
      if (activeConfirmHandlers) {
        overlay.removeEventListener("click", activeConfirmHandlers.clickHandler);
        document.removeEventListener("keydown", activeConfirmHandlers.keyHandler);
        activeConfirmHandlers = null;
      }
      resolve(result);
    };

    const clickHandler = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (action === "confirm") {
        cleanup(true);
      } else if (action === "cancel" || target === overlay) {
        cleanup(false);
      }
    };

    const keyHandler = (event) => {
      if (event.key === "Escape") {
        cleanup(false);
      }
      if (event.key === "Enter") {
        cleanup(true);
      }
    };

    overlay.addEventListener("click", clickHandler);
    document.addEventListener("keydown", keyHandler);
    activeConfirmHandlers = { clickHandler, keyHandler };
  });

export const showPrompt = (message, defaultValue = "") =>
  new Promise((resolve) => {
    const overlay = ensurePromptOverlay();
    const messageNode = overlay.querySelector(".confirm-message");
    const inputNode = overlay.querySelector(".prompt-input");
    if (!inputNode || !messageNode) {
      resolve(null);
      return;
    }

    messageNode.textContent = message;
    inputNode.value = typeof defaultValue === "string" ? defaultValue : "";
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      inputNode.focus();
      inputNode.select();
    });

    const cleanup = (result) => {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
      if (activePromptHandlers) {
        overlay.removeEventListener("click", activePromptHandlers.clickHandler);
        document.removeEventListener("keydown", activePromptHandlers.keyHandler);
        activePromptHandlers = null;
      }
      resolve(result);
    };

    const clickHandler = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (action === "confirm") {
        cleanup(inputNode.value);
      } else if (action === "cancel" || target === overlay) {
        cleanup(null);
      }
    };

    const keyHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(null);
        return;
      }
      if (event.key === "Enter") {
        if (!(event.target instanceof Node) || !overlay.contains(event.target)) {
          return;
        }
        event.preventDefault();
        cleanup(inputNode.value);
      }
    };

    overlay.addEventListener("click", clickHandler);
    document.addEventListener("keydown", keyHandler);
    activePromptHandlers = { clickHandler, keyHandler };
  });
