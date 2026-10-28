// Accessible select menus: keyboard selection, positioning, focus and dismissal.
(function(root) {
  "use strict";
  const t = message => (typeof window === "undefined" ? globalThis : window).HomeI18n?.t(message) ?? message;
  let current = null;
  const node = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  function closeSelect() {
    if (current) current.close();
  }
  function select({id, name, label, options, value, onChange, icon, compact = false}) {
    const wrap = node("div", "custom-select" + (compact ? " compact-select" : "")), input = node("input"), trigger = node("button", "select-trigger"), text = node("span", "select-value"), menu = node("div", "select-menu");
    input.type = "hidden";
    input.id = id;
    input.name = name || id;
    input.value = String(value);
    trigger.type = "button";
    trigger.id = id + "-button";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-label", label);
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    menu.id = id + "-options";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", label);
    menu.hidden = true;
    const popover = typeof menu.showPopover === "function";
    if (popover) menu.setAttribute("popover", "manual");
    trigger.setAttribute("aria-controls", menu.id);
    trigger.append(text, icon("down"));
    wrap.append(input, trigger, menu);
    let items = [], highlight = 0, opened = false, search = "", lastTyped = 0;
    function setHighlight(index) {
      highlight = Math.max(0, Math.min(items.length - 1, index));
      for (let i = 0; i < menu.children.length; i++) menu.children[i].classList.toggle("is-active", i === highlight);
      if (opened && items.length) {
        trigger.setAttribute("aria-activedescendant", menu.children[highlight].id);
        menu.children[highlight].scrollIntoView?.({
          block: "nearest"
        });
      }
    }
    function close() {
      if (popover && menu.matches(":popover-open")) menu.hidePopover();
      if (!popover && menu.parentElement !== wrap) wrap.append(menu);
      menu.hidden = true;
      opened = false;
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-activedescendant");
      if (current?.wrap === wrap) current = null;
      search = "";
    }
    function update(nextOptions, nextValue) {
      close();
      items = nextOptions.map(([v, t]) => ({
        value: String(v),
        text: String(t)
      }));
      input.value = String(nextValue);
      const selected = items.findIndex(x => x.value === input.value);
      if (selected < 0 && items.length) input.value = items[0].value;
      text.textContent = items.find(x => x.value === input.value)?.text || t("请选择");
      trigger.title = text.textContent;
      trigger.disabled = !items.length;
      menu.replaceChildren();
      items.forEach((item, i) => {
        const option = node("div", "select-option");
        option.id = menu.id + "-" + i;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(item.value === input.value));
        option.append(node("span", "", item.text));
        const check = icon("check");
        check.classList.add("option-check");
        option.append(check);
        option.addEventListener("pointermove", () => setHighlight(i));
        option.addEventListener("pointerdown", e => e.preventDefault());
        option.addEventListener("click", () => choose(i));
        menu.append(option);
      });
      highlight = Math.max(0, items.findIndex(x => x.value === input.value));
    }
    function open() {
      if (!items.length) return;
      closeSelect();
      menu.hidden = false;
      opened = true;
      current = {
        wrap,
        menu,
        close
      };
      const rect = trigger.getBoundingClientRect(), availableBelow = root.innerHeight - rect.bottom - 12, availableAbove = rect.top - 12, desired = Math.min(300, items.length * 42 + 12), above = availableBelow < desired && availableAbove > availableBelow;
      const available = Math.max(60, above ? availableAbove : availableBelow), height = Math.min(desired, available), width = Math.min(Math.max(rect.width, 180), root.innerWidth - 24);
      menu.style.width = width + "px";
      menu.style.maxHeight = height + "px";
      menu.style.left = Math.min(Math.max(12, rect.left), root.innerWidth - width - 12) + "px";
      menu.style.top = (above ? Math.max(12, rect.top - height - 6) : rect.bottom + 6) + "px";
      if (popover) menu.showPopover(); else (wrap.closest("dialog") || document.body).append(menu);
      trigger.setAttribute("aria-expanded", "true");
      setHighlight(Math.max(0, items.findIndex(x => x.value === input.value)));
    }
    function choose(index, focus = true) {
      const item = items[index];
      if (!item) return;
      const changed = item.value !== input.value;
      input.value = item.value;
      text.textContent = item.text;
      trigger.title = item.text;
      for (let i = 0; i < menu.children.length; i++) menu.children[i].setAttribute("aria-selected", String(i === index));
      close();
      if (focus) trigger.focus();
      if (changed) {
        input.dispatchEvent(new Event("change", {
          bubbles: true
        }));
        onChange?.(item.value);
      }
    }
    trigger.addEventListener("click", () => opened ? close() : open());
    trigger.addEventListener("keydown", event => {
      const key = event.key;
      if ([ "ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp", "Enter", " " ].includes(key)) event.preventDefault();
      if (key === "Escape") {
        if (opened) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        return;
      }
      if (key === "Tab") {
        if (opened) choose(highlight, false);
        return;
      }
      if (key === "Enter" || key === " ") {
        opened ? choose(highlight) : open();
        return;
      }
      if ([ "ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp" ].includes(key)) {
        const wasOpen = opened;
        if (!opened) open();
        let next = highlight;
        if (key === "Home") next = 0; else if (key === "End") next = items.length - 1; else if (key === "PageDown") next += 10; else if (key === "PageUp") next -= 10; else if (wasOpen) next += key === "ArrowDown" ? 1 : -1;
        setHighlight(next);
        return;
      }
      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (!opened) open();
        const now = Date.now();
        search = now - lastTyped > 700 ? "" : search;
        lastTyped = now;
        search += key.toLocaleLowerCase();
        const repeated = [ ...search ].every(c => c === search[0]), query = repeated ? search[0] : search;
        const start = repeated ? highlight + 1 : highlight;
        for (let n = 0; n < items.length; n++) {
          const index = (start + n) % items.length;
          if (items[index].text.toLocaleLowerCase().startsWith(query)) {
            setHighlight(index);
            break;
          }
        }
      }
    });
    trigger.addEventListener("blur", () => {
      if (opened) choose(highlight, false);
    });
    update(options, value);
    return {
      element: wrap
    };
  }
  // Extra course entries remain ordinary links in a top-layer menu, outside the scroller clip.
  function menu({trigger, items, label, id}) {
    const wrap = node("div", "course-more-wrap"), panel = node("div", "select-menu course-entry-menu");
    panel.id = id;
    panel.hidden = true;
    panel.setAttribute("aria-label", label);
    panel.setAttribute("role", "menu");
    const popover = typeof panel.showPopover === "function";
    if (popover) panel.setAttribute("popover", "manual");
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-controls", id);
    trigger.setAttribute("aria-expanded", "false");
    items.forEach(item => item.setAttribute("role", "menuitem"));
    panel.append(...items);
    wrap.append(trigger, panel);
    let opened = false;
    function close(focus = false) {
      if (!opened) return;
      opened = false;
      if (focus && panel.contains(document.activeElement)) trigger.focus({preventScroll: true});
      if (popover && panel.matches(":popover-open")) panel.hidePopover();
      if (panel.parentElement === document.body) wrap.append(panel);
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (current?.wrap === wrap) current = null;
    }
    function open(focus = false) {
      closeSelect();
      const r = trigger.getBoundingClientRect(), width = Math.min(260, root.innerWidth - 24), height = Math.min(280, items.length * 38 + 12), below = root.innerHeight - r.bottom - 12;
      Object.assign(panel.style, {
        width: width + "px",
        maxHeight: Math.min(height, Math.max(below, r.top - 12)) + "px",
        left: Math.max(12, Math.min(r.left, root.innerWidth - width - 12)) + "px",
        top: (below >= height ? r.bottom + 6 : Math.max(12, r.top - height - 6)) + "px"
      });
      panel.hidden = false;
      opened = true;
      current = {wrap, menu: panel, close};
      document.body.append(panel);
      if (popover) panel.showPopover();
      trigger.setAttribute("aria-expanded", "true");
      if (focus) items.find(item => !item.disabled)?.focus();
    }
    trigger.addEventListener("click", () => opened ? close() : open());
    trigger.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        open(true);
      } else if (event.key === "Escape" && opened) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        trigger.focus({preventScroll: true});
      } else if (event.key === "Tab") {
        // Return to the invoker before native Tab advances in the course's own DOM order.
        close(true);
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const available = items.filter(item => !item.disabled), index = available.indexOf(document.activeElement), next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + available.length) % available.length;
        available[next]?.focus();
      }
    });
    panel.addEventListener("click", () => close(true));
    panel.addEventListener("focusout", event => {
      if (!wrap.contains(event.relatedTarget) && !panel.contains(event.relatedTarget)) close();
    });
    return wrap;
  }
  document.addEventListener("pointerdown", event => {
    if (current && !current.wrap.contains(event.target) && !current.menu.contains(event.target)) current.close();
  });
  root.addEventListener("resize", closeSelect);
  root.addEventListener("scroll", event => {
    if (current && !current.menu.contains(event.target)) closeSelect();
  }, {
    capture: true
  });
  root.HomeUI = {
    select,
    menu,
    closeSelect
  };
})(window);
