const TOAST_DURATION = 3600;
let loadingCounter = 0;
let confirmOverlay;
let activeConfirmHandlers = null;

const requireElement = (id) => {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`缺少元素: ${id}`);
  }
  return el;
};

export const formatDate = (isoString) => {
  if (!isoString) return "未知";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    return date.toLocaleString("zh-CN", { hour12: false });
  }
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffHours < 48) return "昨天";
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString("zh-CN", {
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
        <button type="button" class="btn btn-secondary" data-action="cancel">取消</button>
        <button type="button" class="btn btn-primary" data-action="confirm">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  confirmOverlay = overlay;
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
