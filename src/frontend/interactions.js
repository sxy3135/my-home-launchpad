// Single-target execution, guarded course launching and pointer/keyboard sorting.
(function(root) {
  "use strict";
  const t = message => (typeof window === "undefined" ? globalThis : window).HomeI18n?.t(message) ?? message;
  function openTarget(target, browser = root) {
    if (target.kind !== "web") {
      try {
        browser.open(target.url, "_self");
        return "external";
      } catch {
        return "failed";
      }
    }
    let tab;
    try {
      tab = browser.open("about:blank", "_blank");
      if (!tab) return "blocked";
      tab.opener = null;
      tab.location.replace(target.url);
      return "web";
    } catch {
      try {
        tab?.close();
      } catch {}
      return "failed";
    }
  }
  function createLauncher(browser = root, clock = () => Date.now()) {
    const last = new Map;
    return function(id, targets) {
      const now = clock();
      if (last.has(id) && now - last.get(id) < 1800) return {
        repeat: true
      };
      if (!targets.length) return {
        empty: true
      };
      last.set(id, now);
      let web = 0, blocked = 0, external = 0, failed = 0;
      // Every request is synchronous within the originating click. No retries or deferred launches.
            for (const target of targets) {
        const result = openTarget(target, browser);
        if (result === "web") web++; else if (result === "blocked") blocked++; else if (result === "external") external++; else failed++;
      }
      return {
        web,
        blocked,
        external,
        failed
      };
    };
  }
  // Choose the nearest peer, then insert horizontally beside peers or vertically beside full-width modules.
  function moduleInsertionAt(rects, x, y) {
    if (!rects.length) return null;
    let nearest = 0, distance = Infinity;
    rects.forEach((r, i) => {
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = dx * dx + dy * dy + .001 * ((x - (r.left + r.right) / 2) ** 2 + (y - (r.top + r.bottom) / 2) ** 2);
      if (d < distance) { nearest = i; distance = d; }
    });
    const rect = rects[nearest];
    const horizontal = rects.some((other, i) => i !== nearest && Math.min(other.bottom, rect.bottom) - Math.max(other.top, rect.top) > 8 && (other.right <= rect.left + 1 || other.left >= rect.right - 1));
    const after = horizontal ? x > (rect.left + rect.right) / 2 : y > (rect.top + rect.bottom) / 2;
    return {index: nearest + (after ? 1 : 0), rect, horizontal, after};
  }
  function createSorter({onDrop, onNotice, enabled}, browser = root, doc = root.document) {
    let group = null, drag = null, frame = 0, tailClick = null;
    const bound = new WeakSet;
    function cleanup(notice) {
      if (!drag) return;
      const d = drag;
      drag = null;
      browser.cancelAnimationFrame(frame);
      frame = 0;
      if (d.placeholder) {
        d.source.hidden = d.wasHidden;
        d.container.append(...d.items.map(i => i.element));
        d.placeholder.remove();
      }
      d.source.classList.remove("drag-source");
      d.container.classList.remove("drag-container");
      d.ghost?.remove();
      d.marker?.remove();
      doc.body.classList.remove("is-sorting");

      try {
        if (d.capture.hasPointerCapture?.(d.pointer)) d.capture.releasePointerCapture(d.pointer);
      } catch {}
      if (d.started) tailClick = {source: d.source, capture: d.capture, x: d.x, y: d.y, until: Date.now() + 400};
      if (notice && d.started) onNotice?.(notice);
    }
    function reset() {
      cleanup(t("拖动已取消"));
      group = null;
    }
    function register(container, items) {
      group = {container, items};
    }
    // Only named layout containers are blank space. Interactive descendants and
    // native scrollbar gutters are excluded before cancelling any default action.
    function blank(panel, event) {
      let node = event.target;
      const allowed = ["section-panel", "section-heading", "module-scroll-frame", "module-scroll", "module-content", "section-links", "course-grid", "reader-items", "reader-widget"];
      if (!node || !allowed.some(c => node.classList?.contains(c))) return false;
      for (let n = node; n && n !== panel; n = n.parentElement) {
        if (["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "H2", "H3", "P", "ARTICLE", "DIALOG"].includes((n.tagName || n.tag)?.toUpperCase()) ||
            ["section-item", "course-card", "reader-item", "course-toolbar", "module-toolbar", "course-more-wrap", "reader-widget-heading"].some(c => n.classList?.contains(c))) return false;
        if (n.classList?.contains("module-scroll")) {
          const r = n.getBoundingClientRect(), left = r.left + (n.clientLeft || 0), top = r.top + (n.clientTop || 0);
          if (event.clientX < left || event.clientX >= left + n.clientWidth || event.clientY < top || event.clientY >= top + n.clientHeight) return false;
        }
      }
      return panel.contains(node);
    }
    function bindModule(panel) {
      if (bound.has(panel)) return;
      bound.add(panel);
      panel.addEventListener("pointerdown", e => {
        const id = panel.dataset.moduleId;
        // Touch keeps native scrolling; module menus supply accessible ordering.
        if (!enabled() || drag || e.pointerType === "touch" || e.button !== 0 || e.isPrimary === false || !blank(panel, e)) return;
        const source = group?.items.find(i => i.id === id)?.element;
        if (!source) return;
        e.preventDefault();
        e.stopPropagation();
        drag = {...group, id, source, capture: group.container, pointer: e.pointerId,
          x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, started: false, before: undefined};
        try { drag.capture.setPointerCapture(e.pointerId); } catch { cleanup(); }
      });
    }
    function start() {
      const d = drag, r = d.source.getBoundingClientRect();
      d.started = true;
      d.source.classList.add("drag-source");
      d.container.classList.add("drag-container");
      doc.body.classList.add("is-sorting");

      d.offsetX = d.startX - r.left;
      d.offsetY = d.startY - r.top;
      d.ghost = d.source.cloneNode(true);
      d.ghost.classList.remove("drag-source");
      d.ghost.classList.add("drag-ghost");
      d.ghost.removeAttribute("id");
      d.ghost.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
      d.ghost.setAttribute("aria-hidden", "true");
      d.ghost.inert = true;
      Object.assign(d.ghost.style, {
        width: r.width + "px",
        height: r.height + "px"
      });
      doc.body.append(d.ghost);
      d.marker = doc.createElement("div");
      d.marker.className = "drag-insertion";
      d.marker.setAttribute("aria-hidden", "true");
      doc.body.append(d.marker);
      {
        d.moduleRects = d.items.filter(i => i.id !== d.id).map(item => ({
          item,
          rect: (() => {
            const r = item.element.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
              width: r.width,
              height: r.height
            };
          })()
        }));
        d.startScroll = browser.scrollY || 0;
        d.placeholder = doc.createElement("div");
        d.placeholder.className = "module-placeholder " + d.source.className.split(" ").filter(c => c.startsWith("module-size-")).join(" ");
        d.placeholder.style.setProperty("--module-height-units", d.source.style.getPropertyValue("--module-height-units"));
        d.placeholder.textContent = t("放置模块");
        d.placeholder.setAttribute("aria-hidden", "true");
        d.wasHidden = d.source.hidden;
        d.container.insertBefore(d.placeholder, d.source);
        d.source.hidden = true;
      }
      onNotice?.(t("拖动到插入位置，按 Esc 取消"));
      tick();
    }
    function update() {
      const d = drag;
      if (!d?.started) return;
      const box = d.container.getBoundingClientRect(), inside = d.x >= box.left - 12 && d.x <= box.right + 12 && d.y >= box.top - 12 && d.y <= box.bottom + 12;
      // Peer rectangles are captured once; page scrolling only adjusts their origins.
      const dy = (browser.scrollY || 0) - d.startScroll;
      const measured = d.moduleRects.map(({item, rect}) => ({item, rect: {...rect, top: rect.top - dy, bottom: rect.bottom - dy}}));
      const others = measured.map(x => x.item), point = inside ? moduleInsertionAt(measured.map(x => x.rect), d.x, d.y) : null;
      d.ghost.style.transform = "translate3d(" + (d.x - d.offsetX) + "px," + (d.y - d.offsetY) + "px,0)";
      if (!point) {
        d.before = undefined;
        d.marker.hidden = true;
        return;
      }
      d.before = others[point.index]?.id ?? null;
      d.marker.hidden = false;
      const before = others[point.index]?.element || null;
      d.container.insertBefore(d.placeholder, before);
      const r = d.placeholder.getBoundingClientRect();
      Object.assign(d.marker.style, {left: r.left + "px", top: r.top - 2 + "px", width: r.width + "px", height: "4px"});
    }
    function tick() {
      if (!drag?.started) return;
      const edge = Math.min(72, browser.innerHeight / 5), y = drag.y, delta = y < edge ? -Math.min(18, (edge - y) / 3) : y > browser.innerHeight - edge ? Math.min(18, (y - browser.innerHeight + edge) / 3) : 0;
      try {
        if (delta) browser.scrollBy({top: delta, behavior: "instant"});
      } catch { cleanup(t("拖动已取消")); return; }
      try { update(); frame = browser.requestAnimationFrame(tick); } catch { cleanup(t("拖动已取消")); }
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.pointer) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 7) {
        try { start(); } catch { cleanup(t("拖动已取消")); return; }
      }
      // The running frame loop coalesces pointer events; pointerup still flushes the final position.
            if (drag?.started) e.preventDefault();
    }
    function finish(e) {
      if (!drag || e.pointerId !== drag.pointer) return;
      const d = drag;
      if (d.started) {
        e.preventDefault();
        d.x = e.clientX;
        d.y = e.clientY;
        try { update(); } catch { cleanup(t("拖动已取消")); return; }
      }
      const drop = d.started && d.before !== undefined;
      cleanup();
      if (drop) onDrop({
        id: d.id,
        beforeId: d.before
      }); else if (d.started) onNotice?.(t("排序未改变"));
    }
    doc.addEventListener("pointermove", move, {
      passive: false
    });
    doc.addEventListener("pointerup", finish);
    doc.addEventListener("pointercancel", e => {
      if (drag?.pointer === e.pointerId) cleanup(t("拖动已取消"));
    });
    doc.addEventListener("lostpointercapture", e => {
      if (drag?.pointer === e.pointerId) cleanup(t("拖动已取消"));
    });
    doc.addEventListener("keydown", e => {
      if (e.key === "Escape" && drag) {
        e.preventDefault();
        cleanup(t("拖动已取消"));
      }
    });
    doc.addEventListener("click", e => {
      const tail = tailClick;
      if (!tail) return;
      tailClick = null;
      if (Date.now() < tail.until && e.detail !== 0 && (tail.source.contains(e.target) || e.target === tail.capture) &&
          Math.hypot((e.clientX ?? tail.x) - tail.x, (e.clientY ?? tail.y) - tail.y) < 8) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    doc.addEventListener("dragstart", e => {
      if (drag) e.preventDefault();
    });
    doc.addEventListener("visibilitychange", () => {
      if (doc.hidden) cleanup(t("拖动已取消"));
    });
    browser.addEventListener("blur", () => cleanup(t("拖动已取消")));
    browser.addEventListener("resize", () => cleanup(t("拖动已取消")));
    return {
      reset,
      register,
      bindModule,
      cancel: () => cleanup(t("拖动已取消")),
      active: () => !!drag
    };
  }
  root.HomeInteractions = {
    openTarget,
    createLauncher,
    moduleInsertionAt,
    createSorter
  };
})(typeof window === "undefined" ? globalThis : window);
