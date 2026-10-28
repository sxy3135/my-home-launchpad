// Independent Reader metadata refresh and sync; protected responses stay in memory.
(function() {
  "use strict";
  const $ = id => document.getElementById(id), list = $("reader-items"), status = $("reader-status"), refresh = $("reader-refresh"), setup = $("reader-setup-link");
  if (!list || !refresh) return;
  const shortDate = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric"
  });
  const fullDate = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  let readyMarked = false, snapshot = null, etag = "", reading = null, syncing = null, failed = false, visibleTimer = null, resumeTimer = null, cooldownTimer = null, cooldownUntil = 0, initialStarted = false, continuing = false, stopped = false, locked = false, syncError = "";
  const details = $("reader-details-dialog");
  let detailUrl = "";
  function closeDetails() {
    details.close();
    if (locked || window.HomeDevice && !window.HomeDevice.unlocked) return;
    const trigger = [...list.querySelectorAll(".reader-details-button")].find(b => b.dataset.articleUrl === detailUrl);
    (trigger || list.closest(".module-scroll"))?.focus({preventScroll: true});
  }
  function showDetails(item) {
    window.HomeUI?.closeSelect();
    detailUrl = item.url;
    $("reader-details-title").textContent = item.title;
    $("reader-details-source").textContent = item.source || "未提供来源";
    $("reader-details-time").textContent = fullDate.format(item.savedAt) + "（北京时间）";
    $("reader-details-open").href = item.url;
    details.showModal();
    $("reader-details-close").focus();
  }
  function compactTime(savedAt) {
    const elapsed = Date.now() - savedAt;
    if (elapsed < 0 || elapsed >= 864e5) return shortDate.format(savedAt);
    if (elapsed < 6e4) return "刚刚";
    if (elapsed < 36e5) return Math.floor(elapsed / 6e4) + "分钟前";
    return Math.floor(elapsed / 36e5) + "小时前";
  }
  $("reader-details-close").addEventListener("click", closeDetails);
  details.addEventListener("cancel", event => {
    event.preventDefault();
    closeDetails();
  });
  const controllers = new Set;
  const errorMessages = {
    invalid_token: "Reader Token 无效，请在连接设置中重新填写。",
    not_connected: "尚未连接 Reader",
    reader_unavailable: "Reader 接口暂时不可用，请稍后重试。",
    reader_network_error: "网站无法连接 Reader 接口。",
    reader_timeout: "Reader 请求超时，请稍后重试。",
    reader_redirect_invalid: "Reader 接口重定向异常。",
    incomplete_document: "Reader 返回的文章信息不完整，首次同步未完成。",
    invalid_response: "Reader 返回了无法识别的数据。",
    invalid_document: "Reader 返回了无法识别的文章。",
    cache_unavailable: "缓存更新失败，请稍后重试。",
    login_required: "登录已失效，请重新登录。"
  };
  function errorText(code) {
    return errorMessages[code] || (/^reader_http_\d+$/.test(code) ? "Reader 接口返回 HTTP " + code.slice(12) + "。" : "同步失败，请稍后重试。");
  }
  function message(text) {
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle("is-error", !!syncError || failed);
  }
  function controls() {
    refresh.disabled = !!syncing || Date.now() < cooldownUntil || !snapshot?.connected;
    refresh.setAttribute("aria-busy", String(!!syncing));
    refresh.title = !snapshot?.connected ? "请先连接 Reader" : Date.now() < cooldownUntil ? "稍后可再次核对 Inbox" : "重新核对 Reader Inbox";
    if (syncError) refresh.title = errorText(syncError); else if (failed || snapshot?.stale) refresh.title = "当前显示缓存文章；上次更新未完成，可重新核对 Inbox。";
    setup.hidden = syncError !== "invalid_token" && !!snapshot?.connected && !!snapshot?.webhookConfigured;
  }
  function render() {
    if (locked) return;
    const scroller = list.closest(".module-scroll"), offset = scroller?.scrollTop;
    const focused = document.activeElement, focusUrl = list.contains(focused) ? focused.dataset.articleUrl : "", focusKind = focused?.classList.contains("reader-details-button") ? ".reader-details-button" : ".reader-article";
    function finish() {
      if (focusUrl && !details.open) {
        const next = [...list.querySelectorAll(focusKind)].find(node => node.dataset.articleUrl === focusUrl);
        (next || scroller)?.focus({preventScroll: true});
      }
      if (scroller) scroller.scrollTop = offset;
      window.HomeModuleLayout?.refresh();
    }
    list.replaceChildren();
    controls();
    if (!snapshot) {
      message(failed ? "暂时无法加载 Inbox" : "正在读取 Inbox…");
      finish();
      return;
    }
    if (!snapshot.connected) {
      message("尚未连接 Reader");
      finish();
      return;
    }
    const stale = failed || snapshot.stale;
    message(syncError ? syncError === "invalid_token" ? errorMessages.invalid_token : "暂未更新 · " + errorText(syncError) : stale ? "暂未更新" : syncing || snapshot.syncing || continuing ? "正在同步 Inbox…" : !snapshot.initialized ? "尚未完成首次同步" : !snapshot.webhookConfigured ? "Webhook 尚未接入" : "");
    // Cached articles remain useful; put freshness diagnostics on the refresh control.
    if (snapshot.items.length) message("");
    for (const item of [...snapshot.items].sort((a, b) => b.savedAt - a.savedAt)) {
      const row = document.createElement("div"), a = document.createElement("a");
      row.className = "reader-item";
      a.className = "reader-article";
      a.addEventListener("click", event => { if (document.body.classList.contains("editing")) event.preventDefault(); });
      a.addEventListener("auxclick", event => { if (document.body.classList.contains("editing")) event.preventDefault(); });
      a.dataset.articleUrl = item.url;
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", item.title + (item.source ? "，来源：" + item.source : "") + "，保存于" + fullDate.format(item.savedAt));
      const title = document.createElement("strong");
      title.className = "reader-article-title";
      title.textContent = item.title;
      title.title = item.title;
      a.append(title);
      const meta = document.createElement("span");
      meta.className = "reader-article-meta";
      if (item.source) {
        const source = document.createElement("span");
        source.className = "reader-source";
        source.textContent = item.source;
        source.title = item.source;
        meta.append(source);
      }
      const time = document.createElement("time");
      time.dateTime = new Date(item.savedAt).toISOString();
      time.textContent = compactTime(item.savedAt);
      time.title = fullDate.format(item.savedAt) + "（北京时间，保存时间）";
      meta.append(time);
      a.append(meta);
      const info = document.createElement("button");
      info.className = "icon-button reader-details-button";
      info.type = "button";
      info.textContent = "…";
      info.title = "查看完整标题、来源和保存时间";
      info.setAttribute("aria-label", "查看文章信息：" + item.title);
      info.setAttribute("aria-haspopup", "dialog");
      info.setAttribute("aria-controls", "reader-details-dialog");
      info.dataset.articleUrl = item.url;
      info.addEventListener("click", () => showDetails(item));
      row.append(a, info);
      list.append(row);
    }
    if (snapshot.initialized && !snapshot.items.length && !stale && !syncError) {
      const empty = document.createElement("p");
      empty.className = "reader-empty";
      empty.textContent = "收件箱暂无文章";
      list.append(empty);
    }
    finish();
  }
  function valid(data) {
    if (!data || !Number.isSafeInteger(data.version) || typeof data.initialized !== "boolean" || typeof data.connected !== "boolean" || !Array.isArray(data.items) || data.items.length > 3) throw Error("Invalid cache");
    for (const item of data.items) {
      const u = new URL(item.url);
      if (u.protocol !== "https:" || u.hostname !== "read.readwise.io" || typeof item.title !== "string" || typeof item.source !== "string" || !Number.isFinite(item.savedAt)) throw Error("Invalid article");
    }
    return data;
  }
  function read() {
    if (locked) return Promise.resolve();
    if (reading) return reading;
    reading = (async () => {
      const controller = new AbortController, timeout = setTimeout(() => controller.abort(), 15e3);
      controllers.add(controller);
      try {
        const response = await fetch("/api/reader/inbox", {
          credentials: "same-origin",
          cache: "no-store",
          headers: etag ? {
            "If-None-Match": etag
          } : {},
          signal: controller.signal
        });
        if (locked) return;
        if (response.status === 401 || response.status === 403) {
          window.HomeDevice?.lock?.();
          if (!window.HomeDevice) window.location.replace("/login");
          return;
        }
        if (response.status !== 304) {
          if (!response.ok) throw Error();
          const data = valid(await response.json());
          if (locked) return;
          snapshot = data;
          if ("lastError" in data) syncError = data.lastError?.code || "";
          etag = response.headers.get("ETag") || "";
        }
        failed = false;
        render();
        if (!readyMarked) {
          window.performance?.mark?.("myhome:reader-ready");
          readyMarked = true;
        }
      } catch {
        failed = true;
        render();
      } finally {
        clearTimeout(timeout);
        controllers.delete(controller);
        reading = null;
      }
    })();
    return reading;
  }
  function scheduleCooldown(seconds) {
    if (locked) return;
    cooldownUntil = Date.now() + Math.max(60, seconds || 60) * 1e3;
    clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
      controls();
      if (continuing && !document.hidden) sync();
    }, cooldownUntil - Date.now() + 10);
    controls();
  }
  function sync() {
    if (locked) return Promise.resolve();
    if (syncing) return syncing;
    if (Date.now() < cooldownUntil || !snapshot?.connected) return Promise.resolve();
    const task = (async () => {
      let syncFailed = false;
      const controller = new AbortController, timeout = setTimeout(() => controller.abort(), 25e3);
      controllers.add(controller);
      try {
        const response = await fetch("/api/reader/sync", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          body: "{}",
          signal: controller.signal
        });
        if (locked) return;
        if (response.status === 401 || response.status === 403) {
          window.HomeDevice?.lock?.();
          if (!window.HomeDevice) window.location.replace("/login");
          return;
        }
        const data = await response.json();
        if (locked) return;
        scheduleCooldown(Number(response.headers.get("Retry-After")) || 60);
        if (!response.ok) {
          syncError = data.error || "sync_failed";
          throw Error();
        }
        syncError = "";
        continuing = data.status === "continuing" || data.status === "busy" && !!snapshot?.syncing;
      } catch {
        syncFailed = true;
        failed = true;
        scheduleCooldown(60);
      } finally {
        clearTimeout(timeout);
        controllers.delete(controller);
        syncing = null;
        if (!locked) {
          await read();
          if (syncFailed) {
            failed = true;
            render();
          }
          controls();
        }
      }
    })();
    syncing = task;
    render();
    return task;
  }
  async function resume() {
    if (document.hidden || stopped || locked) return;
    if (window.navigator?.onLine === false) {
      if (!snapshot) message("当前离线，联网后更新 Inbox。");
      return;
    }
    await read();
    if (locked) return;
    if (snapshot?.connected && !snapshot.initialized && !initialStarted) {
      initialStarted = true;
      sync();
    } else if (continuing && Date.now() >= cooldownUntil) sync();
  }
  function scheduleResume() {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => resume(), 80);
  }
  function visibility() {
    clearInterval(visibleTimer);
    visibleTimer = null;
    if (document.hidden || locked) {
      clearTimeout(resumeTimer);
      return;
    }
    scheduleResume();
    visibleTimer = setInterval(() => {
      if (!document.hidden) resume();
    }, 6e4);
  }
  refresh.addEventListener("click", () => sync());
  window.addEventListener("focus", () => {
    if (!document.hidden && !locked) scheduleResume();
  });
  window.addEventListener("online", () => {
    if (!document.hidden && !locked) scheduleResume();
  });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", () => {
    stopped = true;
    clearInterval(visibleTimer);
    clearTimeout(resumeTimer);
    clearTimeout(cooldownTimer);
  });
  window.addEventListener("pageshow", () => {
    if (stopped) {
      stopped = false;
      visibility();
    }
  });
  window.addEventListener("myhome:lock", () => {
    locked = true;
    stopped = true;
    snapshot = null;
    etag = "";
    clearInterval(visibleTimer);
    clearTimeout(resumeTimer);
    clearTimeout(cooldownTimer);
    for (const c of controllers) c.abort();
    controllers.clear();
    list.replaceChildren();
    if (details.open) details.close();
    detailUrl = "";
    for (const id of ["reader-details-title", "reader-details-source", "reader-details-time"]) $(id).textContent = "";
    $("reader-details-open").removeAttribute("href");
    status.textContent = "";
    refresh.disabled = true;
  });
  render();
  visibility();
})();
