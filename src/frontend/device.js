// Synchronous device gate, server-verified trust, offline logout and bounded background work.
(function(root) {
  "use strict";
  const t = message => (typeof window === "undefined" ? globalThis : window).HomeI18n?.t(message) ?? message;
  const doc = root.document, TRUST = "myhome.device.v1", BLOCK = "myhome.device.lock.v1", PENDING = "myhome.logout.pending.v1", YEAR = 365 * 864e5;
  let unlocked = false, persistent = false, record = null, channel = null, sessionTask = null, logoutTask = null, registration = null, backgroundTimer = null, expiryTimer = null, disposed = false, checkingAt = 0, updatingAt = 0;
  const controllers = new Set;
  const read = key => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const valid = data => data?.version === 1 && Number.isSafeInteger(data.revision) && Number.isFinite(data.expiresAt) && data.expiresAt > Date.now() && data.expiresAt <= Date.now() + YEAR + 6e4;
  function status(text) {
    const e = doc.getElementById("device-status");
    if (e) e.textContent = text;
  }
  function message(text) {
    const e = doc.getElementById("device-login-error") || doc.querySelector(".auth-error");
    if (e) e.textContent = text;
  }
  function show() {
    doc.documentElement.setAttribute("data-device", unlocked ? "trusted" : "locked");
    const login = doc.getElementById("device-login");
    if (login) login.hidden = unlocked;
    const page = doc.querySelector(".page-shell");
    if (page) page.inert = !unlocked;
  }
  function notify() {
    try {
      channel?.postMessage({
        type: "locked"
      });
    } catch {}
  }
  function abortBackground() {
    clearTimeout(backgroundTimer);
    backgroundTimer = null;
    for (const c of controllers) c.abort();
    controllers.clear();
  }
  function lock(reason = t("登录已失效，请重新登录。"), broadcast = true) {
    const was = unlocked;
    unlocked = false;
    record = null;
    if (broadcast) {
      write(TRUST, null);
      write(BLOCK, {
        at: Date.now()
      });
    }
    abortBackground();
    clearTimeout(expiryTimer);
    show();
    if (was) root.dispatchEvent(new Event("myhome:lock"));
    message(reason);
    if (broadcast) notify();
    if (root.location?.pathname === "/reader-setup.html") root.location.replace("/login");
  }
  function expiry() {
    clearTimeout(expiryTimer);
    if (!unlocked) return;
    if (!valid(record)) {
      lock(t("设备信任已到期，请重新登录。"));
      return;
    }
    expiryTimer = setTimeout(expiry, Math.min(2147483647, record.expiresAt - Date.now() + 10));
  }
  function accept(data, explicit = false) {
    const next = {
      version: 1,
      revision: data?.revision,
      expiresAt: data?.expiresAt
    };
    if (data?.authenticated !== true || !valid(next) || !explicit && (read(BLOCK) || read(PENDING))) return false;
    record = next;
    if (explicit) {
      write(PENDING, null);
      write(BLOCK, null);
    }
    persistent = write(TRUST, next);
    if (!persistent) write(TRUST, null);
    unlocked = true;
    show();
    expiry();
    if (!persistent) status(t("浏览器无法保存设备信任，下次需联网登录。"));
    return true;
  }
  // This decision runs in the head, before any personal DOM is rendered.
  let grant = null;
  try {
    grant = JSON.parse(doc.getElementById("home-server-grant")?.textContent || "null");
  } catch {}
  const stored = read(TRUST);
  if (stored && !valid(stored)) {
    write(TRUST, null);
    write(BLOCK, {
      at: Date.now()
    });
  }
  if (grant && !read(BLOCK) && !read(PENDING) && (!stored || grant.revision === stored.revision)) accept(stored ? {
    ...grant,
    expiresAt: Math.min(grant.expiresAt, stored.expiresAt)
  } : grant); else if (grant && stored && grant.authenticated === true && grant.revision !== stored.revision) lock(t("登录状态已变更，请重新登录。")); else if (!read(BLOCK) && !read(PENDING) && valid(stored)) {
    record = stored;
    unlocked = true;
    persistent = true;
    show();
    expiry();
  } else show();
  doc.getElementById("home-server-grant")?.remove();
  async function request(path, options = {}) {
    const controller = new AbortController;
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 8e3);
    try {
      const result = await fetch(path, {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        ...options,
        signal: controller.signal
      });
      const text = await result.text();
      return new Response(text, {
        status: result.status,
        headers: result.headers
      });
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  function authFlow(task, wait = false) {
    const locks = root.navigator?.locks;
    return locks?.request ? locks.request("myhome-auth-flow", {
      mode: "exclusive",
      ...wait ? {} : {
        ifAvailable: true
      }
    }, lock => lock ? task() : false) : task();
  }
  function flushLogout(wait = false) {
    if (logoutTask) return logoutTask;
    logoutTask = authFlow(async () => {
      const pending = read(PENDING);
      if (!pending) return true;
      try {
        const response = await request("/api/auth/logout", {
          method: "POST",
          headers: {
            Accept: "application/json"
          }
        });
        if (!response.ok) return false;
        const data = await response.json();
        if (data.loggedOut !== true) return false;
        if (read(PENDING)?.id === pending.id) write(PENDING, null);
        return true;
      } catch {
        return false;
      }
    }, wait).finally(() => {
      logoutTask = null;
    });
    return logoutTask;
  }
  function logout() {
    write(TRUST, null);
    write(PENDING, {
      id: root.crypto?.randomUUID?.() || String(Date.now()),
      at: Date.now()
    });
    lock(t("已退出。课程和入口配置仍保留。"));
    if (root.navigator?.onLine !== false) flushLogout();
  }
  function checkSession() {
    if (sessionTask || !unlocked || doc.hidden || disposed || root.navigator?.onLine === false) return sessionTask || Promise.resolve();
    clearTimeout(backgroundTimer);
    backgroundTimer = null;
    checkingAt = Date.now();
    sessionTask = authFlow(async () => {
      const before = record;
      try {
        const response = await request("/api/auth/session");
        if (!unlocked || record !== before) return;
        if (response.status === 401 || response.status === 403) {
          lock();
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        if (!unlocked || record !== before) return;
        if (data.authenticated === false || data.authenticated === true && data.revision !== record.revision) {
          lock(t("登录状态已变更，请重新登录。"));
          return;
        }
        if (data.authenticated === true && Number.isFinite(data.expiresAt) && data.expiresAt < record.expiresAt) {
          record = {
            ...record,
            expiresAt: data.expiresAt
          };
          write(TRUST, record);
          expiry();
        }
      } catch {/* Offline, timeout and server errors retain local trust. */}
    }).finally(() => {
      sessionTask = null;
      if (unlocked && !doc.hidden && !disposed) backgroundTimer = setTimeout(checkSession, 3e5);
    });
    return sessionTask;
  }
  async function prepareProgram() {
    if (!unlocked) return;
    if (!persistent) {
      status(t("浏览器无法保存设备信任，下次需联网登录。"));
      return;
    }
    if (!root.navigator?.serviceWorker || !root.isSecureContext) {
      status(t("此浏览器暂不支持本地启动，当前使用联网模式。"));
      return;
    }
    try {
      updatingAt = Date.now();
      registration = await root.navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none"
      });
      const waiting = () => {
        if (registration.waiting) status(t("新版已准备，关闭所有 My Home 标签页后重新打开即可启用。"));
      };
      waiting();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") {
            if (registration.active) waiting(); else status(t("此设备已保存本地启动程序。"));
          }
        });
      });
      root.navigator.serviceWorker.ready.then(() => {
        if (!registration.waiting && unlocked) status(t("此设备可从本地启动。"));
      }).catch(() => {});
    } catch {
      status(t("本地启动程序未能保存，联网时仍可使用。"));
    }
  }
  function resume() {
    if (disposed) return;
    expiry();
    if (doc.hidden) {
      clearTimeout(backgroundTimer);
      return;
    }
    if (read(PENDING) && root.navigator?.onLine !== false) flushLogout();
    if (unlocked && Date.now() - checkingAt > 3e4) checkSession();
    if (unlocked && registration && root.navigator?.onLine !== false && Date.now() - updatingAt > 3e5) {
      updatingAt = Date.now();
      registration.update().catch(() => {});
    }
  }
  async function login(event) {
    if (!root.fetch) return;
    event.preventDefault();
    const form = event.currentTarget || event.target, input = form.querySelector('input[name="password"]'), button = form.querySelector('button[type="submit"]');
    if (!input || button?.disabled) return;
    if (root.navigator?.onLine === false) {
      message(t("当前离线，请联网后输入密码。"));
      return;
    }
    if (button) button.disabled = true;
    message("");
    try {
      if (read(PENDING) && !await flushLogout(true)) {
        message(t("上次退出尚未完成，请联网后重试。"));
        return;
      }
      const password = input.value, path = form.getAttribute("action"), confirm = form.querySelector('input[name="confirm"]'), recovery = form.querySelector('input[name="recovery"]'), current = form.querySelector('input[name="current"]');
      const response = await authFlow(() => request(path, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          password,
          ...(recovery ? {recovery: recovery.value} : {}),
          ...(current ? {current: current.value} : {}),
          ...confirm ? {
            confirm: confirm.value
          } : {}
        })
      }), true);
      const data = await response.json();
      input.value = "";
      if (confirm) confirm.value = "";
      if (recovery) recovery.value = "";
      if (current) current.value = "";
      if (!response.ok || data.authenticated !== true) {
        message(data.error === "rate_limited" ? t("尝试过于频繁，请十分钟后再试。") : data.error === "invalid_password" ? t("密码至少 8 位，且两次输入须一致。") : data.error === "invalid_recovery" ? t("恢复密钥不正确。") : data.error === "password_conflict" ? t("密码已被修改，请重新登录后重试。") : data.error === "wrong_password" ? t("密码不正确。") : data.error === "forbidden" ? t("请重新登录，并使用当前密码验证。") : response.status === 401 ? t("密码不正确。") : t("登录服务暂不可用，请稍后重试。"));
        return;
      }
      if (!accept(data, true)) {
        message(t("登录结果无效，请重试。"));
        return;
      }
      // Native navigation also works without Service Worker or writable Cache Storage.
            root.location.replace(persistent ? "/" : "/?online=1");
    } catch {
      message(t("暂时无法连接，请检查网络后重试。"));
    } finally {
      if (button) button.disabled = false;
    }
  }
  function ready() {
    show();
    try {
      channel = new BroadcastChannel("myhome-device");
      channel.onmessage = event => {
        if (event.data?.type === "locked") lock(t("此设备已在另一标签页退出，请重新登录。"), false);
      };
    } catch {}
    for (const path of ["login", "password", "change-password"]) {
      doc.querySelectorAll('form[action="/api/auth/' + path + '"]').forEach(f => f.addEventListener("submit", login));
    }
    doc.querySelector(".footer-logout")?.addEventListener("submit", event => {
      event.preventDefault();
      logout();
    });
    if (!unlocked) {
      message(read(PENDING) ? t("已退出。联网后会完成服务器退出。") : read(BLOCK) ? t("请重新输入密码。") : "");
      if (read(PENDING)) flushLogout();
    }
    if (unlocked) {
      prepareProgram();
      checkSession();
    }
  }
  root.HomeDevice = {
    get unlocked() {
      return unlocked;
    },
    lock,
    logout,
    checkSession,
    checkExpiry: expiry
  };
  root.addEventListener("storage", event => {
    if (event.key === TRUST || event.key === BLOCK || event.key === PENDING) {
      if (read(BLOCK) || read(PENDING) || !valid(read(TRUST))) lock(t("此设备已锁定，请重新登录。"), false);
    }
  });
  root.addEventListener("online", resume);
  root.addEventListener("focus", resume);
  doc.addEventListener("visibilitychange", resume);
  root.addEventListener("pagehide", () => {
    disposed = true;
    abortBackground();
    clearTimeout(expiryTimer);
    channel?.close();
    channel = null;
  });
  root.addEventListener("pageshow", () => {
    if (disposed) {
      disposed = false;
      const saved = read(TRUST);
      if (read(BLOCK) || read(PENDING) || !valid(saved)) lock(t("请重新登录。"), false); else {
        record = saved;
        expiry();
      }
      try {
        channel = new BroadcastChannel("myhome-device");
        channel.onmessage = e => {
          if (e.data?.type === "locked") lock(t("此设备已锁定，请重新登录。"), false);
        };
      } catch {}
      resume();
    }
  });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", ready, {
    once: true
  }); else ready();
})(window);
