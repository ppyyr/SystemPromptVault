const SUPPORTED_LANGUAGES = ["en", "zh"];
const DEFAULT_LANGUAGE = "en";
const LANGUAGE_STORAGE_KEY = "app_language";
const LOCALE_BASE_PATH = "locales";

let currentLanguage = DEFAULT_LANGUAGE;
let translations = {};
let initPromise = null;
const translationCache = new Map();
const languageListeners = new Set();

const normalizeLanguage = (lang) => {
  if (typeof lang !== "string" || !lang.trim()) {
    return DEFAULT_LANGUAGE;
  }
  const lower = lang.toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(lower)) {
    return lower;
  }
  if (lower.startsWith("zh")) {
    return "zh";
  }
  return DEFAULT_LANGUAGE;
};

const detectSystemLanguage = () => {
  const candidates = Array.isArray(navigator.languages) ? navigator.languages : [];
  const primary = localStorage.getItem(LANGUAGE_STORAGE_KEY) || candidates[0] || navigator.language;
  return normalizeLanguage(primary);
};

const getLocaleUrl = (lang) => `${LOCALE_BASE_PATH}/${lang}.json`;

const fetchLocale = async (lang) => {
  if (translationCache.has(lang)) {
    return translationCache.get(lang);
  }
  const response = await fetch(getLocaleUrl(lang), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load locale: ${lang}`);
  }
  const localeData = await response.json();
  translationCache.set(lang, localeData);
  return localeData;
};

const resolveNested = (keyPath) => {
  if (!keyPath || typeof keyPath !== "string") {
    return undefined;
  }
  return keyPath.split(".").reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, translations);
};

const setDocumentLanguage = (lang) => {
  const html = document.documentElement;
  if (!html) return;
  const locale = lang === "zh" ? "zh-CN" : "en";
  html.setAttribute("lang", locale);
};

const elementsMatching = (root, selector) => {
  if (!root) {
    return [];
  }
  const nodes = [];
  if (root instanceof Element || root instanceof DocumentFragment || root instanceof Document) {
    if (root instanceof Element && root.matches(selector)) {
      nodes.push(root);
    }
    nodes.push(...root.querySelectorAll(selector));
  }
  return nodes;
};

const ATTRIBUTE_MAPPINGS = [
  { dataKey: "i18nPlaceholder", attr: "placeholder" },
  { dataKey: "i18nAria", attr: "aria-label" },
  { dataKey: "i18nTooltip", attr: "data-tooltip" },
  { dataKey: "i18nTitle", attr: "title" },
  { dataKey: "i18nValue", attr: "value" },
];

const translateElement = (element) => {
  if (!(element instanceof Element)) {
    return;
  }
  const key = element.dataset.i18n;
  if (key) {
    const translation = t(key, element.textContent ?? "");
    if (element.dataset.i18nHtml === "true") {
      element.innerHTML = translation;
    } else {
      element.textContent = translation;
    }
  }
  ATTRIBUTE_MAPPINGS.forEach(({ dataKey, attr }) => {
    const dataValue = element.dataset[dataKey];
    if (!dataValue) return;
    const translation = t(dataValue, "");
    if (!translation) return;
    element.setAttribute(attr, translation);
  });
};

const applyTranslationsToScope = (root = document) => {
  elementsMatching(root, "[data-i18n]").forEach(translateElement);
  ATTRIBUTE_MAPPINGS.forEach(({ dataKey, attr }) => {
    const selector = `[data-${dataKey.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}]`;
    elementsMatching(root, selector).forEach((element) => {
      const key = element.dataset[dataKey];
      if (!key) return;
      const translation = t(key, "");
      if (!translation) return;
      element.setAttribute(attr, translation);
    });
  });
};

const applyLanguage = (lang, localeData) => {
  translations = localeData || {};
  currentLanguage = lang;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  setDocumentLanguage(lang);
  applyTranslationsToScope(document);
  languageListeners.forEach((listener) => {
    try {
      listener(lang);
    } catch (error) {
      console.error("[i18n] language listener error:", error);
    }
  });
};

const loadLanguage = async (lang) => {
  const normalized = normalizeLanguage(lang);
  if (normalized === currentLanguage && Object.keys(translations).length) {
    return translations;
  }
  try {
    const localeData = await fetchLocale(normalized);
    applyLanguage(normalized, localeData);
    return localeData;
  } catch (error) {
    console.warn(`[i18n] Failed to load locale "${normalized}", fallback to default.`, error);
    if (normalized !== DEFAULT_LANGUAGE) {
      const fallbackData = await fetchLocale(DEFAULT_LANGUAGE);
      applyLanguage(DEFAULT_LANGUAGE, fallbackData);
      return fallbackData;
    }
    throw error;
  }
};

export const initI18n = async () => {
  if (initPromise) {
    return initPromise;
  }
  const initialLanguage = detectSystemLanguage();
  initPromise = loadLanguage(initialLanguage).catch((error) => {
    console.error("[i18n] Initialization failed:", error);
    throw error;
  });
  return initPromise;
};

export const t = (key, fallback = "") => {
  const value = resolveNested(key);
  if (value === undefined || value === null) {
    return fallback || key || "";
  }
  return String(value);
};

export const setLanguage = async (lang) => {
  await loadLanguage(lang);
};

export const getCurrentLanguage = () => currentLanguage;

export const applyTranslations = (root = document) => {
  applyTranslationsToScope(root);
};

export const onLanguageChange = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }
  languageListeners.add(listener);
  return () => languageListeners.delete(listener);
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== LANGUAGE_STORAGE_KEY || !event.newValue) {
      return;
    }
    const newLanguage = normalizeLanguage(event.newValue);
    if (newLanguage === currentLanguage) {
      return;
    }
    loadLanguage(newLanguage).catch((error) => {
      console.error("[i18n] Failed to sync language from storage event:", error);
    });
  });
}
