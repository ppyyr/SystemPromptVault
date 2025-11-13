// i18n Anti-FOUC (Flash of Unstyled Content) Script
// 必须在页面渲染前同步执行,防止文本闪烁
(function () {
  const LANGUAGE_STORAGE_KEY = "app_language";
  const DEFAULT_LANGUAGE = "en";

  // 检测语言:优先localStorage > 浏览器语言 > 默认
  const detectLanguage = () => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;

    const browserLang = navigator.languages?.[0] || navigator.language || "";
    return browserLang.toLowerCase().startsWith("zh") ? "zh" : DEFAULT_LANGUAGE;
  };

  // 应用语言属性
  const lang = detectLanguage();
  const locale = lang === "zh" ? "zh-CN" : "en";

  document.documentElement.setAttribute("data-lang", lang);
  document.documentElement.lang = locale;
})();
