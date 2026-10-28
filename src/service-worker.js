"use strict";

const VERSION = __HOME_PROGRAM_VERSION__, PROGRAM = __HOME_PROGRAM_URL__, DIGEST = __HOME_PROGRAM_DIGEST__, PREFIX = "myhome-program-", CACHE = PREFIX + VERSION, COMPLETE = "/__myhome_program_complete__", STATE = "myhome-program-state";

const NAVIGATIONS = new Set([ "/", "/fast", "/index.html", "/fast.html", "/login" ]);

let repairTask = null, repairAt = 0;

async function installProgram(prune = true) {
  try {
    const response = await fetch(PROGRAM, {
      cache: "no-store",
      credentials: "omit"
    });
    if (!response.ok || response.redirected || response.headers.get("X-MyHome-Program") !== VERSION) throw Error("Invalid program");
    const bytes = await response.clone().arrayBuffer(), digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    if (digest !== DIGEST) throw Error("Incomplete program");
    const cache = await caches.open(CACHE);
    await cache.put(PROGRAM, response);
    await cache.put(COMPLETE, new Response(VERSION));
    // Retain the active program and this fully downloaded candidate only.
        const active = await (await caches.open(STATE)).match("/active"), name = active && await active.text();
    if (name && prune) for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== STATE && key !== name && key !== CACHE) await caches.delete(key);
    // Only the very first install takes over an already-open page immediately.
        if (!self.registration.active) await self.skipWaiting();
  } catch (error) {
    await caches.delete(CACHE).catch(() => {});
    throw error;
  }
}

self.addEventListener("install", event => event.waitUntil(installProgram()));

self.addEventListener("activate", event => event.waitUntil((async () => {
  // Normal lifecycle activation waits until old controlled pages have closed.
  const state = await caches.open(STATE);
  await state.put("/active", new Response(CACHE));
  for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== STATE && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));

async function navigate(request, event) {
  try {
    const cache = await caches.open(CACHE), complete = await cache.match(COMPLETE), program = await cache.match(PROGRAM);
    if (complete && program) return program;
  } catch {}
  if (!repairTask && Date.now() - repairAt > 6e4) {
    repairAt = Date.now();
    repairTask = installProgram(false).catch(() => {}).finally(() => {
      repairTask = null;
    });
    event.waitUntil(repairTask);
  }
  // An evicted/broken cache falls back to the server; never mix partial versions.
  try {
    return await fetch(request);
  } catch {
    return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>My Home</title><body><h1>My Home</h1><p lang="en">The offline app is incomplete. Reconnect and reopen My Home. Your configuration is still saved in this browser.</p><p lang="zh-CN">本地程序不完整，请联网后重新打开。配置仍保留在此浏览器。</p></body></html>', {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method === "GET" && event.request.mode === "navigate" && url.origin === self.location.origin && NAVIGATIONS.has(url.pathname) && url.searchParams.get("online") !== "1") event.respondWith(navigate(event.request, event));
  // Passwords, connection settings, Reader and all APIs always use the network.
});
