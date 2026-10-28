import {HomeAuth} from './auth.mjs';
import {ReaderStore,ReaderService,ReaderError,secretMatches} from './reader.mjs';

// Replaced by build-worker.mjs. No runtime credentials are included in this asset map.
const ASSETS = __MY_HOME_ASSETS__;

const decodedAssets = new WeakMap;

function assetBytes(asset) {
  let bytes = decodedAssets.get(asset);
  if (bytes) return bytes;
  const binary = atob(asset.data);
  bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  decodedAssets.set(asset, bytes);
  return bytes;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

async function payload(request) {
  if (Number(request.headers.get("content-length")) > 524288) throw new ReaderError("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return {};
  // Readwise Test Endpoint sends an empty POST, not JSON.
  const chunks = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 524288) {
      await reader.cancel();
      throw new ReaderError("body_too_large");
    }
    chunks.push(value);
  }
  if (size === 0) return {};
  // Only truly empty bodies are endpoint probes.
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const value of chunks) {
    bytes.set(value, offset);
    offset += value.length;
  }
  try {
    const data = JSON.parse((new TextDecoder).decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data;
  } catch {
    throw new ReaderError("invalid_payload");
  }
}

async function handle(request, env, ctx, timing) {
  const url = new URL(request.url), path = url.pathname, auth = new HomeAuth(env);
  const assetPath = path === "/" ? "/index.html" : path === "/fast" ? "/fast.html" : path;
  const asset = ASSETS[assetPath];
  let profile, credentials;
  try {
    if (path === "/login" || path === "/password-reset" || path === "/password-change" || path.startsWith("/api/auth/") || path === "/reader-setup.html" || path === "/api/reader/settings") return await auth.route(request);
    // Missing resources are 404s, independent of the login state or database availability.
    if (!path.startsWith("/api/") && !asset) return new Response(request.method === "HEAD" ? null : "Not found", {status: 404});
    if (![ "/style.css", "/theme.js", "/clock.js", "/device.js", "/sw.js" ].includes(path) && !/^\/app-shell\.[a-f0-9]+\.html$/.test(path)) {
      if (!auth.ready()) return json({
        error: "login_unavailable"
      }, 503);
      const started = performance.now();
      profile = await (path.startsWith("/api/reader/") ? auth.profile() : auth.sessionProfile());
      timing.push("profile;dur=" + (performance.now() - started).toFixed(2));
      const verification = performance.now();
      if (path !== "/api/reader/webhook" && !await auth.authorized(request, profile)) return path.startsWith("/api/") ? json({
        error: "login_required"
      }, 401) : new Response(null, {
        status: 303,
        headers: {
          Location: "/login",
          "Cache-Control": "private, no-store"
        }
      });
      timing.push("session;dur=" + (performance.now() - verification).toFixed(2));
    }
    if (path.startsWith("/api/reader/")) credentials = await auth.readerCredentials(profile);
  } catch {
    return json({
      error: "login_unavailable"
    }, 503);
  }
  // Login styling/time scripts contain no user content. Content/metadata still require the password cookie.
  if (path.startsWith("/api/reader/")) {
    try {
      if (!env.DB) throw new ReaderError("cache_unavailable");
      const store = new ReaderStore(env.DB), service = new ReaderService(store, credentials.token);
      if (path === "/api/reader/webhook" && request.method === "GET") return json({
        endpoint: "Reader Webhook"
      });
      if (path === "/api/reader/webhook" && request.method === "POST") {
        const data = await payload(request);
        if (!data.id && !data.event_type && !data.secret) return json({
          test: true
        });
        if (!await secretMatches(data.secret, credentials.secret)) return json({
          error: "unauthorized"
        }, 401);
        if (!data.id && !data.event_type) return json({
          test: true
        });
        // authenticated endpoint probe; never writes cache
                const result = await service.notification(data);
        // Cache mutation is awaited before acknowledgement, even when no browser is open.
                if (result.refill && credentials.token) ctx.waitUntil(service.sync().catch(() => {}));
        return json({
          accepted: true,
          ...result
        });
      }
      if (path === "/api/reader/inbox" && request.method === "GET") {
        const data = await service.list(), etag = '"reader-' + data.version + "-" + Number(data.connected) + "-" + Number(data.syncing) + "-" + Number(!!credentials.secret) + '"';
        if (request.headers.get("if-none-match") === etag) return new Response(null, {
          status: 304,
          headers: {
            ETag: etag,
            "Cache-Control": "private, no-cache"
          }
        });
        return json({
          ...data,
          webhookConfigured: !!credentials.secret,
          checkIntervalSeconds: 60
        }, 200, {
          ETag: etag,
          "Cache-Control": "private, no-cache"
        });
      }
      if (path === "/api/reader/sync" && request.method === "POST") {
        // Manual sync is a same-origin browser action.
        const origin = request.headers.get("origin");
        if (origin !== url.origin) return json({
          error: "forbidden"
        }, 403);
        const result = await service.sync();
        return json(result, result.status === "updated" ? 200 : 202, result.retryAfter ? {
          "Retry-After": String(result.retryAfter)
        } : {});
      }
      return json({
        error: "not_found"
      }, 404);
    } catch (error) {
      // Never return/log the token, supplied webhook secret, raw Reader responses or payload content.
      const code = error instanceof ReaderError ? error.code : "cache_unavailable";
      console.warn(JSON.stringify({
        component: "reader",
        route: path,
        code
      }));
      const status = code === "body_too_large" ? 413 : code.startsWith("invalid_") || code === "incomplete_document" ? 400 : code === "rate_limited" ? 429 : 503;
      return json({
        error: code
      }, status, error.retryAfter ? {
        "Retry-After": String(error.retryAfter)
      } : {});
    }
  }
  if (![ "GET", "HEAD" ].includes(request.method)) return new Response("Method not allowed", {
    status: 405
  });
  if (!asset) return new Response("Not found", {
    status: 404
  });
  const css = [ "/style.css", "/device.js" ].includes(path), program = /^\/app-shell\.[a-f0-9]+\.html$/.test(path), sw = path === "/sw.js";
  const cache = sw ? "public, max-age=0, must-revalidate" : program ? "public, max-age=31536000, immutable" : css ? url.searchParams.get("v") === asset.version ? "public, max-age=31536000, immutable" : "public, max-age=300" : asset.cache;
  const headers = {
    "Content-Type": asset.type,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin"
  };
  if (program) headers["X-MyHome-Program"] = asset.version;
  if (sw) headers["Service-Worker-Allowed"] = "/";
  // The authorization above runs even for matching validators. Never return a cached
  // content response to an expired or revoked cookie. Sensitive HTML stays no-store.
  if (!cache.includes("no-store")) {
    headers.ETag = asset.etag;
    const validators = request.headers.get("if-none-match")?.split(",").map(value => value.trim().replace(/^W\//, "")) || [];
    if (validators.includes(asset.etag) || validators.includes("*")) return new Response(null, {
      status: 304,
      headers
    });
  }
  if ([ "/", "/index.html", "/fast", "/fast.html" ].includes(path) && request.method !== "HEAD") {
    const grant = await auth.deviceGrant(request, profile), html = (new TextDecoder).decode(assetBytes(asset));
    // Only the authenticated live response contains initialization data. SW caches
    // the distinct public app-shell hash, never this HTML or any login response.
        return new Response(html.replace("\x3c!-- server-device-grant --\x3e", () => '<script id="home-server-grant" type="application/json">' + JSON.stringify(grant).replaceAll("<", "\\u003c") + "<\/script>"), {
      headers
    });
  }
  return new Response(request.method === "HEAD" ? null : assetBytes(asset), {
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const started = performance.now(), timing = [];
    const result = await handle(request, env, ctx, timing);
    timing.push("app;dur=" + (performance.now() - started).toFixed(2));
    const response = new Response(result.body, result);
    response.headers.set("Server-Timing", timing.join(", "));
    return response;
  }
};
