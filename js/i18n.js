/* ===================================================================
   INDÚSTRIA 360 — i18n engine
   - PT é o idioma nativo do HTML (nada muda se o visitante ficar em PT).
   - EN/ES/ZH são carregados via fetch de js/i18n/<lang>.json e aplicados
     trocando textContent/innerHTML/atributos dos elementos marcados com
     data-i18n / data-i18n-html / data-i18n-placeholder /
     data-i18n-aria-label / data-i18n-alt.
   - A escolha do idioma fica salva em localStorage e é reaplicada
     automaticamente na próxima visita (inclusive antes do gate).
   =================================================================== */

(function () {
  var SUPPORTED = ["pt", "en", "es", "zh"];
  var STORAGE_KEY = "i360_lang";
  var cache = {}; // { lang: dictObject }

  function getSavedLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    return "pt";
  }

  function saveLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function fetchDict(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);
    return fetch("js/i18n/" + lang + ".json")
      .then(function (res) { return res.json(); })
      .then(function (dict) { cache[lang] = dict; return dict; })
      .catch(function () { return {}; });
  }

  function applyDict(dict) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-html");
      if (dict[key] !== undefined) el.innerHTML = dict[key];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (dict[key] !== undefined) el.setAttribute("placeholder", dict[key]);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria-label");
      if (dict[key] !== undefined) el.setAttribute("aria-label", dict[key]);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-alt");
      if (dict[key] !== undefined) el.setAttribute("alt", dict[key]);
    });
    document.querySelectorAll("[data-i18n-value]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-value");
      if (dict[key] !== undefined) el.value = dict[key];
    });
    document.querySelectorAll("[data-i18n-src]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-src");
      if (dict[key] === undefined) return;
      var novoSrc = dict[key];
      var fallback = el.getAttribute("data-i18n-src-fallback") || el.getAttribute("src");
      // se o arquivo daquele idioma ainda não existir no servidor, volta
      // silenciosamente pra thumbnail padrão em vez de mostrar imagem quebrada
      var testeImg = new Image();
      testeImg.onload = function () { el.setAttribute("src", novoSrc); };
      testeImg.onerror = function () { el.setAttribute("src", fallback); };
      testeImg.src = novoSrc;
    });
  }

  function setActiveButtons(lang) {
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      var isActive = btn.getAttribute("data-lang-btn") === lang;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  var currentLang = "pt";
  var currentDict = {};

  function setLanguage(lang, opts) {
    if (SUPPORTED.indexOf(lang) === -1) lang = "pt";
    var persist = !opts || opts.persist !== false;

    fetchDict(lang).then(function (dict) {
      currentLang = lang;
      currentDict = dict;
      applyDict(dict);
      document.documentElement.setAttribute("lang", lang === "pt" ? "pt-BR" : lang);
      setActiveButtons(lang);
      if (persist) saveLang(lang);
      document.dispatchEvent(new CustomEvent("i360:langchange", { detail: { lang: lang } }));
    });
  }

  // utilitário para outros scripts (ex.: conteúdo dinâmico dos modais de
  // badges em main.js) buscarem um texto traduzido, com fallback em PT
  window.i360GetText = function (key, fallback) {
    return currentDict[key] !== undefined ? currentDict[key] : fallback;
  };
  window.i360GetLang = function () { return currentLang; };

  // expõe globalmente para os botões de idioma (onclick) e para debug
  window.i360SetLanguage = setLanguage;

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setLanguage(btn.getAttribute("data-lang-btn"));
      });
    });
    setLanguage(getSavedLang(), { persist: false });
  });
})();
