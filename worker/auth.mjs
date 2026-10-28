import {annotateMarkup,localizeMarkup,requestLanguage} from '../src/shared/i18n.mjs';
const encoder = new TextEncoder, YEAR = 365 * 86400, COOKIE = "__Host-myhome";

const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

const escape = value => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  }
});

function redirect(path, cookie) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": "private, no-store",
      ...cookie ? {
        "Set-Cookie": cookie
      } : {}
    }
  });
}

function cookie(value, age = YEAR) {
  return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
}

async function form(request) {
  if (Number(request.headers.get("content-length")) > 8192) throw Error("large");
  const text = await request.text();
  if (text.length > 8192) throw Error("large");
  return new URLSearchParams(text);
}

function originOK(request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

// no-referrer makes Chromium's native form POST Origin opaque ("null").
// Keep same-origin form identity while suppressing referrers to external sites.
function page(title, body, language="zh-CN") {
  return new Response(localizeMarkup(annotateMarkup(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="same-origin"><title>${title} · My Home</title><script src="/i18n.js?v=__HOME_I18N_VERSION__"><\/script><script src="/theme.js"><\/script><link rel="stylesheet" href="/style.css"><script src="/clock.js" defer><\/script><script src="/device.js?v=__HOME_DEVICE_VERSION__" defer><\/script></head><body><main class="auth-shell"><section class="section-panel auth-panel"><div class="auth-language"><label for="auth-language">Language / 中文</label><select id="auth-language" class="language-select" data-home-language="true" aria-label="Language"><option value="en">English</option><option value="zh-CN">简体中文</option></select></div><h1 class="brand">My Home</h1>${body}</section></main></body></html>`),language), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}

export class HomeAuth {
  constructor(env, now = () => Date.now()) {
    this.env = env;
    this.db = env.DB;
    this.now = now;
  }
  ready() {
    try { return unb64(this.env.HOME_SECURITY_KEY).length === 32 && !!this.db; } catch { return false; }
  }
  recoveryReady() {
    const value = this.env.HOME_RECOVERY_KEY;
    try { return /^[A-Za-z0-9_-]{43}$/.test(value) && unb64(value).length === 32; } catch { return false; }
  }
  async recoveryAuthorized(value) {
    if (!this.recoveryReady() || typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
    // Compare fixed-size MACs with Web Crypto verification, never trust identity headers.
    const key = await this.key({name: "HMAC", hash: "SHA-256"}, ["sign", "verify"]);
    const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(this.env.HOME_RECOVERY_KEY));
    return crypto.subtle.verify("HMAC", key, expected, encoder.encode(value));
  }
  async profile() {
    return this.db.prepare("SELECT * FROM home_security WHERE id='home'").first();
  }
  // Static content needs only the current session revision, never passwords or Reader secrets.
  async sessionProfile() {
    return this.db.prepare("SELECT revision FROM home_security WHERE id='home'").first();
  }
  async key(algorithm, uses) {
    return crypto.subtle.importKey("raw", unb64(this.env.HOME_SECURITY_KEY), algorithm, false, uses);
  }
  async sign(text) {
    const key = await this.key({
      name: "HMAC",
      hash: "SHA-256"
    }, [ "sign" ]);
    return b64(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
  }
  async hashPassword(password, salt) {
    // A runtime-secret pepper prevents a copied DB hash from being an offline password oracle.
    const peppered = await this.sign(password), key = await crypto.subtle.importKey("raw", encoder.encode(peppered), "PBKDF2", false, [ "deriveBits" ]);
    return b64(await crypto.subtle.deriveBits({
      name: "PBKDF2",
      hash: "SHA-256",
      salt: unb64(salt),
      iterations: 1e5
    }, key, 256));
  }
  async passwordRecord(password) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    return JSON.stringify({
      salt,
      hash: await this.hashPassword(password, salt)
    });
  }
  async verifyPassword(password, profile) {
    try {
      const record = JSON.parse(profile.password_hash);
      return await this.hashPassword(password, record.salt) === record.hash;
    } catch {
      return false;
    }
  }
  async session(profile) {
    const value = b64(encoder.encode(JSON.stringify({
      v: profile.revision,
      exp: Math.floor(this.now() / 1e3) + YEAR
    })));
    return cookie(value + "." + await this.sign(value));
  }
  async sessionData(request, profile) {
    if (!this.ready() || !profile) return null;
    try {
      const token = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
      if (!token || token.length > 1e3) return false;
      const [value, signature, ...extra] = token.split(".");
      if (extra.length || !signature) return false;
      const key = await this.key({
        name: "HMAC",
        hash: "SHA-256"
      }, [ "verify" ]);
      if (!await crypto.subtle.verify("HMAC", key, unb64(signature), encoder.encode(value))) return false;
      const data = JSON.parse((new TextDecoder).decode(unb64(value)));
      return data.v === profile.revision && Number.isSafeInteger(data.exp) && data.exp > Math.floor(this.now() / 1e3) && data.exp <= Math.floor(this.now() / 1e3) + YEAR + 60 ? data : null;
    } catch {
      return null;
    }
  }
  async authorized(request, profile) {
    return !!await this.sessionData(request, profile);
  }
  async deviceGrant(request, profile) {
    const data = await this.sessionData(request, profile);
    return data ? {
      authenticated: true,
      revision: data.v,
      expiresAt: data.exp * 1e3
    } : null;
  }
  async loginResponse(profile, wantsJSON) {
    const signed = await this.session(profile);
    if (!wantsJSON) return redirect("/", signed);
    const value = signed.slice(COOKIE.length + 1).split(".")[0], data = JSON.parse((new TextDecoder).decode(unb64(value)));
    return response({
      authenticated: true,
      revision: data.v,
      expiresAt: data.exp * 1e3
    }, 200, {
      "Set-Cookie": signed
    });
  }
  async encrypt(value) {
    const iv = crypto.getRandomValues(new Uint8Array(12)), key = await this.key("AES-GCM", [ "encrypt" ]);
    return b64(iv) + "." + b64(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv
    }, key, encoder.encode(JSON.stringify(value))));
  }
  async readerCredentials(profile) {
    let configured = {};
    if (profile?.reader_secrets) {
      const [iv, data] = profile.reader_secrets.split("."), key = await this.key("AES-GCM", [ "decrypt" ]);
      configured = JSON.parse((new TextDecoder).decode(await crypto.subtle.decrypt({
        name: "AES-GCM",
        iv: unb64(iv)
      }, key, unb64(data))));
    }
    return {
      token: configured.token || this.env.READER_TOKEN || "",
      secret: configured.secret || this.env.READER_WEBHOOK_SECRET || ""
    };
  }
  async loginLimit(request, scope = "login") {
    const key = await this.sign(scope + "-ip:" + request.headers.get("cf-connecting-ip")), now = this.now();
    const row = await this.db.prepare(`INSERT INTO home_login_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count`).bind(key, now + 6e5, now, now).first();
    await this.db.prepare("DELETE FROM home_login_limits WHERE expires<?").bind(now - 36e5).run();
    return row.count <= 10;
  }
  async route(request) {
    const language=requestLanguage(request);
    const authPage=(title,body)=>page(title,body,language);
    const url = new URL(request.url), path = url.pathname, wantsJSON = request.headers.get("Accept")?.includes("application/json");
    if (path === "/api/auth/logout" && request.method === "POST") {
      if (!originOK(request)) return response({
        error: "forbidden"
      }, 403);
      return wantsJSON ? response({
        loggedOut: true
      }, 200, {
        "Set-Cookie": cookie("", 0)
      }) : redirect("/login", cookie("", 0));
    }
    if (!this.ready()) return path.startsWith("/api/") ? response({
      error: "login_unavailable"
    }, 503) : page("暂时无法登录", '<p class="auth-copy">登录服务暂不可用，请稍后重试。</p>');
    if (path === "/api/auth/session" && request.method === "GET") {
      try {
        const data = await this.sessionData(request, await this.sessionProfile());
        return data ? response({
          authenticated: true,
          revision: data.v,
          expiresAt: data.exp * 1e3
        }) : response({
          authenticated: false,
          error: "login_required"
        }, 401);
      } catch {
        return response({
          error: "login_unavailable"
        }, 503);
      }
    }
    const profile = await this.profile(), authorized = await this.authorized(request, profile);
    if (request.method === "GET" && (path === "/login" || path === "/password-reset" || path === "/password-change")) {
      if (authorized && path === "/login") return redirect("/");
      const changing = path === "/password-change";
      if (changing && !authorized) return redirect("/login");
      const setting = !changing && (!profile || path === "/password-reset");
      if (setting && !this.recoveryReady()) return authPage("恢复暂不可用", '<p class="auth-copy">尚未配置安全恢复密钥，请由网站管理员在 Cloudflare Secrets 中配置 HOME_RECOVERY_KEY。</p>');
      const errors = {
        wrong: "密码不正确。",
        recovery: "恢复密钥不正确。",
        conflict: "密码已被另一请求修改，请重新登录后重试。",
        rate: "尝试过于频繁，请十分钟后再试。",
        invalid: "密码至少 8 位，且两次输入须一致。",
        unavailable: "暂时无法登录，请稍后重试。"
      };
      return authPage(changing ? "修改密码" : setting ? "设置密码" : "输入密码", `<p class="auth-copy">${changing ? "验证当前密码后设置新密码，其他设备联网时需要重新登录。" : setting ? "请输入保存在密码管理器中的恢复密钥，再设置新密码。" : "输入密码，打开你的 My Home。"}</p><form action="${changing ? "/api/auth/change-password" : setting ? "/api/auth/password" : "/api/auth/login"}" method="post">${setting ? '<label class="auth-label" for="recovery">恢复密钥</label><input class="auth-input" id="recovery" name="recovery" type="password" autocomplete="off" minlength="43" maxlength="43" required>' : changing ? '<label class="auth-label" for="current">当前密码</label><input class="auth-input" id="current" name="current" type="password" autocomplete="current-password" maxlength="128" required>' : ""}<label class="auth-label" for="password">${setting || changing ? "新密码" : "密码"}</label><input class="auth-input" id="password" name="password" type="password" autocomplete="${setting || changing ? "new-password" : "current-password"}" minlength="8" maxlength="128" required autofocus>${setting || changing ? '<label class="auth-label" for="confirm">再次输入</label><input class="auth-input" id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>' : ""}<p class="auth-error" role="alert">${errors[url.searchParams.get("error")] || ""}</p><button class="button button-primary auth-submit" type="submit">${setting || changing ? "保存并进入" : "进入 My Home"}</button></form><p class="auth-hint">此浏览器记住登录一年。退出或清除 Cookie 后需重新输入。</p>${!setting && !changing ? '<a class="auth-reset" href="/password-reset">忘记密码</a>' : ""}`);
    }
    if (path === "/reader-setup.html" && request.method === "GET") {
      if (!authorized) return redirect("/login");
      const creds = await this.readerCredentials(profile), endpoint = url.origin + "/api/reader/webhook";
      return authPage("连接 Reader", `<h2 class="auth-subtitle">连接 Reader</h2><p class="auth-copy">填写后直接保存，不需要重新发布网站。</p><form action="/api/reader/settings" method="post"><label class="auth-label" for="token">Reader Token${creds.token ? " · 已保存" : ""}</label><input class="auth-input" id="token" name="token" type="password" autocomplete="off" maxlength="512" placeholder="${creds.token ? "留空保留现有 Token" : "从 Readwise Token 页面复制"}"><p class="auth-hint"><a href="https://readwise.io/access_token" target="_blank" rel="noopener noreferrer">打开 Readwise Token 页面</a></p><label class="auth-label" for="secret">Webhook 验证密钥${creds.secret ? " · 已保存" : ""}</label><input class="auth-input" id="secret" name="secret" type="password" autocomplete="off" maxlength="512" placeholder="${creds.secret ? "留空保留现有密钥" : "创建 Webhook 后复制回来"}"><button class="button button-primary auth-submit" type="submit">保存连接</button></form><p class="auth-copy">在 Readwise Webhooks 设置中填入下方地址，点击 Test Endpoint，再创建通知并复制验证密钥回来。</p><input class="auth-input" value="${escape(endpoint)}" readonly aria-label="Webhook 接收地址"><p class="auth-hint">订阅新文档创建、移入 Inbox、归档、Later、Shortlist、finished 和 tags_updated。</p><a class="button button-quiet auth-submit" href="/">返回 My Home</a>`);
    }
    if (request.method === "POST" && path.startsWith("/api/auth/")) {
      if (!originOK(request)) return response({
        error: "forbidden"
      }, 403);
      const data = await form(request), password = data.get("password") || "";
      if (path === "/api/auth/password" || path === "/api/auth/change-password") {
        const changing = path === "/api/auth/change-password";
        const failurePath = changing ? "/password-change" : profile ? "/password-reset" : "/login";
        if (!changing && !this.recoveryReady()) return response({error: "recovery_unavailable"}, 503);
        if (changing && !authorized) return response({error: "forbidden"}, 403);
        if (!await this.loginLimit(request, changing ? "change" : "recovery")) return wantsJSON ? response({error: "rate_limited"}, 429) : redirect(failurePath + "?error=rate");
        if (changing ? !await this.verifyPassword(data.get("current") || "", profile) : !await this.recoveryAuthorized(data.get("recovery"))) return wantsJSON ? response({error: changing ? "wrong_password" : "invalid_recovery"}, 403) : redirect(failurePath + "?error=" + (changing ? "wrong" : "recovery"));
        if (password.length < 8 || password.length > 128 || password !== data.get("confirm")) return wantsJSON ? response({
          error: "invalid_password"
        }, 400) : redirect(failurePath + "?error=invalid");
        const hash = await this.passwordRecord(password);
        const result = profile
          ? await this.db.prepare("UPDATE home_security SET password_hash=?,revision=revision+1 WHERE id='home' AND revision=?").bind(hash, profile.revision).run()
          : await this.db.prepare("INSERT INTO home_security (id,password_hash,revision) VALUES ('home',?,1) ON CONFLICT(id) DO NOTHING").bind(hash).run();
        if (result.meta.changes !== 1) return wantsJSON ? response({error: "password_conflict"}, 409) : redirect(failurePath + "?error=conflict");
        // Sign only the revision written by this request, even if another reset follows.
        return this.loginResponse({revision: profile ? profile.revision + 1 : 1}, wantsJSON);
      }
      if (path === "/api/auth/login") {
        if (!await this.loginLimit(request)) return wantsJSON ? response({
          error: "rate_limited"
        }, 429) : redirect("/login?error=rate");
        if (!profile || password.length > 128 || !await this.verifyPassword(password, profile)) return wantsJSON ? response({
          authenticated: false,
          error: "wrong_password"
        }, 401) : redirect("/login?error=wrong");
        return this.loginResponse(profile, wantsJSON);
      }
    }
    if (request.method === "POST" && path === "/api/reader/settings") {
      if (!authorized || !originOK(request)) return response({
        error: "forbidden"
      }, 403);
      const data = await form(request), existing = await this.readerCredentials(profile);
      const token = (data.get("token") || "").trim(), secret = (data.get("secret") || "").trim();
      if (token.length > 512 || secret.length > 512) return response({
        error: "invalid_input"
      }, 400);
      const encrypted = await this.encrypt({
        token: token || existing.token,
        secret: secret || existing.secret
      });
      await this.db.batch([ this.db.prepare("UPDATE home_security SET reader_secrets=? WHERE id='home'").bind(encrypted), ...token && token !== existing.token ? [ this.db.prepare("UPDATE reader_state SET initialized=0,stale=1,last_error=NULL,revision=revision+1,cooldown_until=0,stage=NULL WHERE key='inbox'") ] : [] ]);
      return redirect("/reader-setup.html?saved=1");
    }
    return response({
      error: "not_found"
    }, 404);
  }
}
