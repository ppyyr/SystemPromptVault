// 主题管理模块
const THEME_KEY = 'app-theme';
const THEME_DARK = 'dark';
const THEME_LIGHT = 'light';
const themeSubscribers = new Set();

const notifyThemeSubscribers = (theme) => {
  themeSubscribers.forEach((callback) => {
    try {
      callback(theme);
    } catch (error) {
      console.error('主题订阅回调执行失败', error);
    }
  });
};

/**
 * 获取当前主题
 */
export function getCurrentTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === THEME_DARK || stored === THEME_LIGHT) {
    return stored;
  }
  // 默认使用系统主题
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT;
}

/**
 * 应用主题
 */
export function applyTheme(theme) {
  if (theme === THEME_DARK) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem(THEME_KEY, theme);
  notifyThemeSubscribers(theme);
}

/**
 * 切换主题
 */
export function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
  applyTheme(next);
  return next;
}

export function subscribeThemeChange(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  themeSubscribers.add(callback);
  return () => {
    themeSubscribers.delete(callback);
  };
}

/**
 * 初始化主题
 */
export function initTheme() {
  const theme = getCurrentTheme();
  applyTheme(theme);

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const stored = localStorage.getItem(THEME_KEY);
    // 只有在没有手动设置时才自动切换
    if (!stored) {
      applyTheme(e.matches ? THEME_DARK : THEME_LIGHT);
      updateThemeIcon();
    }
  });
}

/**
 * 更新主题图标
 */
export function updateThemeIcon() {
  const isDark = getCurrentTheme() === THEME_DARK;
  const buttons = document.querySelectorAll('.theme-toggle-btn');

  buttons.forEach(btn => {
    const sunIcon = btn.querySelector('.theme-icon-sun');
    const moonIcon = btn.querySelector('.theme-icon-moon');

    if (sunIcon && moonIcon) {
      if (isDark) {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
      } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
      }
    }
  });
}

/**
 * 创建主题切换按钮 HTML
 */
export function createThemeToggleButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle-btn btn-icon btn-icon-primary';
  button.setAttribute('aria-label', '切换主题');
  button.setAttribute('data-tooltip', '切换主题');

  button.innerHTML = `
    <svg class="theme-icon-sun w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
    </svg>
    <svg class="theme-icon-moon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
    </svg>
  `;

  button.addEventListener('click', () => {
    toggleTheme();
    updateThemeIcon();
  });

  return button;
}
