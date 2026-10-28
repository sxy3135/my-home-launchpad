// Learning/shortcut tracks and native module scroll boundaries. Reader rows always fill one column.
(function(root) {
  "use strict";
  function cardWidth({width, columns, gap, padding, clearance, cardGap = 12, min = 248, max = 352}) {
    // A half-width panel defines two common tracks, even when the outer layout has two columns.
    // This lets narrower panels and wider panels reuse the same tracks without stretching a last item.
    const track = (width - gap * 3) / 4;
    let available = columns === 1 ? width - padding * 2 - clearance : track * 2 + gap - padding * 2 - clearance;
    let count = columns === 1 ? Math.max(1, Math.min(2, Math.floor((available + cardGap) / (min + cardGap)))) : 2;
    if (columns === 2 && (available - cardGap) / 2 < min) {
      available = width - padding * 2 - clearance;
      count = Math.max(1, Math.min(4, Math.floor((available + cardGap) / (min + cardGap))));
    }
    return Math.max(min, Math.min(max, (available - cardGap * (count - 1)) / count));
  }
  function columnsFor(width, track, gap = 12) {
    return Math.max(1, Math.min(4, Math.floor((width + gap + .5) / (track + gap))));
  }
  function shortcutWidth({width, columns, gap, padding, clearance, shortcutGap = 8, min = 104}) {
    const small = Math.max(1, (width - gap * (columns - 1)) / columns - padding * 2 - clearance);
    const half = (small - shortcutGap) / 2;
    return half >= min ? half : small;
  }
  function shortcutColumnsFor(width, track, gap = 8) {
    return Math.max(1, Math.floor((width + gap + .5) / (track + gap)));
  }
  function scrollEdges(top, height, viewport) {
    const max = Math.max(0, height - viewport), position = Math.max(0, Math.min(max, top));
    const size = Math.min(20, Math.max(16, viewport * .12));
    const strength = distance => {
      const t = Math.max(0, Math.min(1, distance / 20));
      return t * t * (3 - 2 * t);
    };
    return {max, position, size, top: viewport > 0 ? strength(position) : 0, bottom: viewport > 0 ? strength(max - position) * .72 : 0};
  }
  let active = null;
  function create(grid) {
    active?.stop();
    const states = new Map;
    let stopped = false, queued = false;
    const style = node => root.getComputedStyle?.(node);
    const number = (css, name, fallback) => parseFloat(css?.getPropertyValue(name)) || fallback;
    const set = (node, name, value) => {
      if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
    };
    function fades(state) {
      const {scroller, frame} = state;
      const edge = scrollEdges(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
      state.edgeSize = edge.size;
      set(frame, "--scroll-edge-size", edge.size + "px");
      set(frame, "--scroll-edge-top", edge.top.toFixed(6));
      set(frame, "--scroll-edge-bottom", edge.bottom.toFixed(6));
      // Binary indicators are only used by the reduced-transparency separator fallback.
      frame.classList.toggle("can-scroll-up", edge.top > 0);
      frame.classList.toggle("can-scroll-down", edge.bottom > 0);
    }
    function revealFocus(state, target) {
      const {scroller} = state;
      if (!target || target === scroller || !scroller.contains(target) || !target.getBoundingClientRect) return;
      if (!target.matches?.(":focus-visible")) return;
      const box = scroller.getBoundingClientRect(), rect = target.getBoundingClientRect();
      if (rect.bottom <= box.top || rect.top >= box.bottom) return;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight), position = Math.max(0, Math.min(max, scroller.scrollTop));
      const inset = (state.edgeSize || 20) + 4, top = box.top + inset, bottom = box.bottom - inset;
      if (rect.height > bottom - top) return;
      const delta = rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
      const next = Math.max(0, Math.min(max, position + delta));
      if (next !== position) scroller.scrollTop = next;
    }
    function attach(panel) {
      const scroller = panel.querySelector(".module-scroll"), frame = panel.querySelector(".module-scroll-frame"), content = panel.querySelector(".module-content");
      const state = {panel, scroller, frame, content};
      state.onScroll = () => fades(state);
      state.onFocus = event => {
        const target = event.target;
        // Allow existing renderers to restore offsets first; ignore obsolete focus targets.
        Promise.resolve().then(() => {
          if (!stopped && states.get(panel) === state && root.document.activeElement === target) revealFocus(state, target);
        });
      };
      scroller.addEventListener("scroll", state.onScroll, {passive: true});
      scroller.addEventListener("focusin", state.onFocus);
      resize?.observe(scroller);
      resize?.observe(content);
      states.set(panel, state);
      return state;
    }
    function detach(state) {
      resize?.unobserve(state.scroller);
      resize?.unobserve(state.content);
      state.scroller.removeEventListener("scroll", state.onScroll);
      state.scroller.removeEventListener("focusin", state.onFocus);
    }
    function syncPanels() {
      for (const [panel, state] of states) if (!grid.contains(panel)) {
        detach(state);
        states.delete(panel);
      }
      const panels = [...grid.querySelectorAll(".section-panel")];
      for (const panel of panels) if (!states.has(panel)) attach(panel);
    }
    function refresh() {
      if (stopped) return;
      syncPanels();
      const css = style(grid), columns = number(css, "--workspace-columns", 4), cardGap = number(css, "--module-grid-gap", 12);
      const gutter = Math.max(0, ...[...states.values()].map(s => (s.scroller.offsetWidth || 0) - (s.scroller.clientWidth || 0)));
      const width = grid.clientWidth || grid.getBoundingClientRect().width, gap = number(css, "--module-gap", 16), padding = number(css, "--module-padding", 16);
      const clearance = 2 + number(css, "--module-focus-inset", 4) * 2 + gutter;
      const shared = cardWidth({
        width,
        columns,
        gap,
        padding,
        clearance,
        cardGap,
        min: number(css, "--card-min-width", 248),
        max: number(css, "--card-max-width", 352)
      });
      // Two readable buttons in a small module; no course width or column-limit dependency.
      const shortcutGap = number(css, "--shortcut-gap", 8);
      const shortcut = shortcutWidth({width, columns, gap, padding, clearance, shortcutGap, min: number(css, "--shortcut-min-width", 104)});
      for (const [panel, state] of states) {
        if (panel.hidden) continue;
        const available = state.scroller.clientWidth - number(style(state.scroller), "padding-left", 4) - number(style(state.scroller), "padding-right", 4);
        const edgeGutter = Math.max(8, state.scroller.offsetWidth - state.scroller.clientWidth), surface = style(panel)?.getPropertyValue("background-color");
        if (available > 0) {
          const reader = panel.dataset.moduleType === "reader";
          set(panel, "--card-width", (reader ? available : Math.min(available, shared)) + "px");
          set(panel, "--card-columns", reader ? "1" : String(columnsFor(available, shared, cardGap)));
          set(panel, "--shortcut-width", Math.min(available, shortcut) + "px");
          set(panel, "--shortcut-columns", String(shortcutColumnsFor(available, shortcut, shortcutGap)));
        }
        const frame = state.frame;
        set(frame, "--scroll-edge-gutter", edgeGutter + "px");
        if (surface && surface !== "transparent" && surface !== "rgba(0, 0, 0, 0)") set(frame, "--scroll-edge-surface", surface);
        fades(state);
      }
    }
    function schedule() {
      if (queued || stopped) return;
      queued = true;
      Promise.resolve().then(() => {
        queued = false;
        refresh();
      });
    }
    const resize = root.ResizeObserver ? new root.ResizeObserver(schedule) : null;
    resize?.observe(grid);
    function snapshot() {
      return new Map([...states].map(([panel, state]) => [panel, state.scroller.scrollTop]));
    }
    function restore(offsets, resetPanel = null) {
      if (stopped) return;
      syncPanels();
      for (const [panel, state] of states) {
        if (panel === resetPanel) {
          state.scroller.scrollTop = 0;
        } else if (offsets?.has(panel)) state.scroller.scrollTop = offsets.get(panel);
      }
      refresh();
    }
    function stop() {
      stopped = true;
      resize?.disconnect();
      for (const state of states.values()) detach(state);
      states.clear();
      root.removeEventListener("resize", schedule);
      root.removeEventListener("myhome:lock", stop);
    }
    root.addEventListener("resize", schedule);
    root.addEventListener("myhome:lock", stop);
    active = {refresh, snapshot, restore, stop};
    return active;
  }
  root.HomeModuleLayout = {create, cardWidth, columnsFor, shortcutWidth, shortcutColumnsFor, scrollEdges, refresh: () => active?.refresh()};
})(window);
