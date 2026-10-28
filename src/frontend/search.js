// Search providers and focus mode; lift, blur, inert background and input survive pointer leave.
(function() {
  "use strict";
  const root = document.getElementById("home-search");
  const input = document.getElementById("search-query");
  const trigger = document.getElementById("search-engine");
  const label = document.getElementById("search-engine-name");
  const brand = document.getElementById("search-engine-icon");
  const menu = document.getElementById("search-engine-options");
  const scrim = document.getElementById("search-scrim");
  if (!root || !input || !trigger || !label || !menu || !scrim) return;
  const options = Array.from(menu.querySelectorAll(".engine-option"));
  const background = Array.from(document.querySelectorAll(".search-background"));
  const storageKey = "myhome.search-engine";
  const engines = {
    google: {
      name: "Google",
      url: "https://www.google.com/search",
      key: "q"
    },
    bing: {
      name: "Bing",
      url: "https://www.bing.com/search",
      key: "q"
    },
    baidu: {
      name: "百度",
      url: "https://www.baidu.com/s",
      key: "wd"
    },
    reader: {
      name: "Reader",
      url: "https://read.readwise.io/search",
      key: "q"
    }
  };
  // Hover belongs to CSS. Focus mode is the only persistent interaction state;
  // menu visibility is independent and must never end focus mode.
  const state = {
    focused: false,
    engine: "google",
    composing: false,
    background: []
  };
  function selectEngine(value) {
    if (!Object.hasOwn(engines, value)) return;
    state.engine = value;
    const name = engines[value].name;
    label.textContent = name;
    trigger.setAttribute("aria-label", "搜索引擎：" + name);
    trigger.title = "搜索引擎：" + name;
    if (brand) brand.innerHTML = options.find(option => option.dataset.engine === value)?.querySelector(".engine-brand")?.innerHTML || "";
    for (const option of options) option.setAttribute("aria-selected", String(option.dataset.engine === value));
  }
  // All background locking/restoration and the visual mode change happen here.
  // Repeated input/selector focus events are idempotent, preserving prior state.
  function setFocused(focused) {
    if (state.focused === focused) return;
    state.focused = focused;
    if (focused) {
      window.HomeUI?.closeSelect();
      state.background = background.map(node => ({
        node,
        inert: node.inert,
        aria: node.getAttribute("aria-hidden")
      }));
      for (const {node} of state.background) {
        node.inert = true;
        node.setAttribute("aria-hidden", "true");
      }
    } else {
      for (const {node, inert, aria} of state.background) {
        node.inert = inert;
        if (aria == null) node.removeAttribute("aria-hidden"); else node.setAttribute("aria-hidden", aria);
      }
      state.background = [];
    }
    document.body.classList.toggle("search-active", focused);
  }
  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  function openMenu(index = options.findIndex(option => option.dataset.engine === state.engine)) {
    if (!options.length) return;
    setFocused(true);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    options[(index + options.length) % options.length].focus({
      preventScroll: true
    });
  }
  function focusInput() {
    setFocused(true);
    closeMenu();
    input.focus({
      preventScroll: true
    });
  }
  function exit() {
    closeMenu();
    setFocused(false);
    state.composing = false;
    // The form itself does not activate focus mode; preserve the typed query.
        if (root.contains(document.activeElement)) root.focus({
      preventScroll: true
    });
  }
  function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  try {
    selectEngine(localStorage.getItem(storageKey));
  } catch {}
  selectEngine(state.engine);
  closeMenu();
  root.addEventListener("focusin", event => {
    if (event.target !== root) setFocused(true);
  });
  root.addEventListener("click", event => {
    if (event.target === input || trigger.contains(event.target) || menu.contains(event.target)) return;
    focusInput();
  });
  trigger.addEventListener("click", event => {
    event.stopPropagation();
    if (menu.hidden) openMenu(); else {
      closeMenu();
      trigger.focus({
        preventScroll: true
      });
    }
  });
  for (const option of options) option.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    selectEngine(option.dataset.engine);
    try {
      localStorage.setItem(storageKey, state.engine);
    } catch {}
    closeMenu();
    trigger.focus({
      preventScroll: true
    });
  });
  trigger.addEventListener("keydown", event => {
    if (![ "ArrowDown", "ArrowUp", "Home", "End" ].includes(event.key)) return;
    event.preventDefault();
    openMenu(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : undefined);
  });
  menu.addEventListener("keydown", event => {
    const index = options.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      options[index].click();
      return;
    }
    if (![ "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End" ].includes(event.key)) return;
    event.preventDefault();
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (forward ? 1 : -1) + options.length) % options.length;
    options[next].focus({
      preventScroll: true
    });
  });
  // Capture before any background handlers. Exit clicks are consumed, never replayed.
    document.addEventListener("click", event => {
    if (!state.focused || root.contains(event.target)) return;
    consume(event);
    exit();
  }, true);
  document.addEventListener("keydown", event => {
    if (!state.focused) return;
    if (event.key === "Escape") {
      consume(event);
      exit();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const inMenu = menu.contains(document.activeElement);
    const target = inMenu ? event.shiftKey ? trigger : input : document.activeElement === input ? trigger : input;
    closeMenu();
    target.focus({
      preventScroll: true
    });
  }, true);
  document.addEventListener("focusin", event => {
    if (state.focused && !root.contains(event.target)) focusInput();
  }, true);
  scrim.addEventListener("pointerdown", event => event.preventDefault());
  input.addEventListener("focus", closeMenu);
  window.addEventListener("myhome:lock", () => {
    closeMenu();
    setFocused(false);
  });
  input.addEventListener("compositionstart", () => state.composing = true);
  input.addEventListener("compositionend", () => state.composing = false);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && (state.composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  root.addEventListener("submit", event => {
    event.preventDefault();
    if (state.composing) return;
    const query = input.value.trim();
    if (!query) {
      focusInput();
      return;
    }
    const engine = engines[state.engine], url = new URL(engine.url);
    url.searchParams.set(engine.key, query);
    // Open synchronously from the user gesture; no suggestions, prefetch or delayed clicks.
        window.open(url.href, "_blank", "noopener,noreferrer");
    exit();
  });
  window.addEventListener("pagehide", exit);
  window.performance?.mark?.("myhome:search-ready");
})();
