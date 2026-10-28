// Official contracts: https://readwise.io/reader_api and https://docs.readwise.io/readwise/docs/webhooks
// This module never stores document bodies, summaries, credentials, feeds or archived metadata.
export const EVENTS = new Set([ "reader.any_document.created", "reader.non_feed_document.created", "reader.feed_document.created", "reader.document.moved_to_inbox", "reader.document.archived", "reader.document.moved_to_later", "reader.document.shortlisted", "reader.document.finished", "reader.document.tags_updated" ]);

export class ReaderError extends Error {
  constructor(code, retryAfter = 0) {
    super(code);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const stamp = value => {
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
};

const preciseStamp = value => {
  const ms = stamp(value);
  if (!ms) return 0;
  const fraction = String(value).match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/)?.[1] || "";
  return ms * 1e3 + Number(fraction.slice(3, 6).padEnd(3, "0"));
};

export function documentState(doc) {
  if (!doc || typeof doc.id !== "string" || !doc.id || doc.id.length > 200) throw new ReaderError("invalid_document");
  const stateAt = Math.max(preciseStamp(doc.updated_at), preciseStamp(doc.last_moved_at));
  if (![ "new", "later", "archive", "feed", "shortlist" ].includes(doc.location) || !stateAt) throw new ReaderError("incomplete_document");
  let item = null;
  if (doc.location === "new" && !doc.parent_id && ![ "highlight", "note" ].includes(doc.category)) {
    const savedAt = stamp(doc.saved_at);
    if (!savedAt) throw new ReaderError("incomplete_document");
    let source = typeof doc.site_name === "string" ? doc.site_name.trim() : "";
    if (!source) {
      try {
        const u = new URL(doc.source_url);
        if (/^https?:$/.test(u.protocol)) source = u.hostname.replace(/^www\./, "");
      } catch {}
    }
    // Only an official Reader URL or a canonical URL derived from the API's document ID.
        let url = "https://read.readwise.io/read/" + encodeURIComponent(doc.id);
    try {
      const u = new URL(doc.url);
      if (u.protocol === "https:" && u.hostname === "read.readwise.io" && /\/read\//.test(u.pathname)) url = u.href;
    } catch {}
    item = {
      id: doc.id,
      title: typeof doc.title === "string" && doc.title.trim() ? doc.title.trim().slice(0, 2e3) : "未命名文章",
      source: source.slice(0, 300),
      savedAt,
      savedOrder: preciseStamp(doc.saved_at),
      url
    };
  }
  return {
    id: doc.id,
    stateAt,
    item
  };
}

export async function secretMatches(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  const digest = async s => new Uint8Array(await crypto.subtle.digest("SHA-256", (new TextEncoder).encode(s)));
  const [x, y] = await Promise.all([ digest(a), digest(b) ]);
  let mismatch = 0;
  for (let i = 0; i < x.length; i++) mismatch |= x[i] ^ y[i];
  return mismatch === 0;
}

export class ReaderStore {
  constructor(db, now = () => Date.now()) {
    this.db = db;
    this.now = now;
  }
  prepare(sql, ...values) {
    return this.db.prepare(sql).bind(...values);
  }
  async ensure() {
    await this.prepare("INSERT INTO reader_state (key) VALUES ('inbox') ON CONFLICT(key) DO NOTHING").run();
  }
  async state() {
    await this.ensure();
    return this.prepare("SELECT * FROM reader_state WHERE key='inbox'").first();
  }
  async document(id) {
    return this.prepare("SELECT * FROM reader_documents WHERE id=?", id).first();
  }
  async items() {
    const r = await this.prepare("SELECT item FROM reader_documents WHERE item IS NOT NULL").all();
    return r.results.map(x => JSON.parse(x.item)).sort((a, b) => (b.savedOrder || b.savedAt * 1e3) - (a.savedOrder || a.savedAt * 1e3) || a.id.localeCompare(b.id));
  }
  async fail(error) {
    await this.ensure();
    const code = error instanceof ReaderError ? error.code : "cache_unavailable";
    await this.prepare("UPDATE reader_state SET revision=revision+1,stale=1,last_error=? WHERE key='inbox'", JSON.stringify({
      code,
      at: this.now(),
      ...error?.transport ? {
        transport: error.transport
      } : {}
    })).run();
  }
  async apply(doc, {authoritative = false, expectedObserved = null} = {}) {
    await this.ensure();
    const encoded = doc.item ? JSON.stringify(doc.item) : null, old = await this.document(doc.id);
    if (old && old.item === encoded && doc.stateAt <= old.state_at) return false;
    const sql = `INSERT INTO reader_documents (id,item,state_at,observed_at) VALUES (?,?,?,?)\n   ON CONFLICT(id) DO UPDATE SET item=excluded.item,state_at=MAX(reader_documents.state_at,excluded.state_at),observed_at=excluded.observed_at\n   WHERE excluded.state_at>reader_documents.state_at OR (?=1 AND reader_documents.observed_at=?)`;
    const r = await this.db.batch([ this.prepare(sql, doc.id, encoded, doc.stateAt, this.now(), authoritative ? 1 : 0, expectedObserved), this.prepare("UPDATE reader_state SET revision=revision+1,updated_at=? WHERE key='inbox' AND changes()>0", this.now()) ]);
    return (r[0].meta?.changes || 0) > 0;
  }
  async reserveApi() {
    await this.ensure();
    const now = this.now(), window = Math.floor(now / 6e4) * 6e4;
    const row = await this.prepare(`UPDATE reader_state SET api_count=CASE WHEN api_window=? THEN api_count+1 ELSE 1 END,api_window=? WHERE key='inbox' AND (api_window<>? OR api_count<18) RETURNING api_count`, window, window, window).first();
    if (!row) throw new ReaderError("rate_limited", Math.ceil((window + 6e4 - now) / 1e3));
  }
  async lease() {
    await this.ensure();
    const now = this.now(), owner = crypto.randomUUID();
    const row = await this.prepare(`UPDATE reader_state SET lock_owner=?,lock_until=? WHERE key='inbox' AND lock_until<? AND cooldown_until<=? RETURNING *`, owner, now + 9e4, now, now).first();
    return row ? {
      ...row,
      owner
    } : null;
  }
  async stage(owner, value) {
    await this.prepare("UPDATE reader_state SET stage=? WHERE key='inbox' AND lock_owner=?", value === null ? null : JSON.stringify(value), owner).run();
  }
  async release(owner, cooldown = 0) {
    await this.prepare("UPDATE reader_state SET lock_owner=NULL,lock_until=0,cooldown_until=MAX(cooldown_until,?) WHERE key='inbox' AND lock_owner=?", this.now() + cooldown, owner).run();
  }
  async snapshot(owner, docs, started) {
    const now = this.now(), encoded = JSON.stringify(docs);
    // One D1 transaction: no partial Inbox snapshot can become visible on failure.
        await this.db.batch([ this.prepare(`INSERT INTO reader_documents (id,item,state_at,observed_at)\n    SELECT json_extract(value,'$.id'),CASE WHEN json_type(value,'$.item')='null' THEN NULL ELSE json_extract(value,'$.item') END,json_extract(value,'$.stateAt'),?\n    FROM json_each(?) WHERE EXISTS(SELECT 1 FROM reader_state WHERE key='inbox' AND lock_owner=?)\n    ON CONFLICT(id) DO UPDATE SET item=excluded.item,state_at=MAX(reader_documents.state_at,excluded.state_at),observed_at=excluded.observed_at WHERE reader_documents.observed_at<?`, now, encoded, owner, started), this.prepare(`UPDATE reader_documents SET item=NULL,state_at=MAX(state_at,?),observed_at=? WHERE item IS NOT NULL AND observed_at<? AND id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND EXISTS(SELECT 1 FROM reader_state WHERE key='inbox' AND lock_owner=?)`, started * 1e3, now, started, encoded, owner), this.prepare("UPDATE reader_state SET revision=revision+1,initialized=1,stale=0,last_error=NULL,updated_at=?,stage=NULL WHERE key='inbox' AND lock_owner=?", now, owner) ]);
  }
}

export class ReaderService {
  constructor(store, token, {fetcher = fetch, now = () => Date.now()} = {}) {
    this.store = store;
    this.token = token;
    this.fetcher = fetcher.bind(globalThis);
    this.now = now;
  }
  async api(params) {
    if (!this.token) throw new ReaderError("not_connected");
    let u = new URL("https://readwise.io/api/v3/list/");
    for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined) u.searchParams.set(key, value);
    u.searchParams.set("withHtmlContent", "false");
    let response, retried = false, redirects = 0;
    const signal = AbortSignal.timeout(18e3);
    while (true) {
      await this.store.reserveApi();
      try {
        response = await this.fetcher(u.href, {
          headers: {
            Authorization: "Token " + this.token
          },
          signal,
          redirect: "manual"
        });
      } catch (error) {
        if (!retried && !signal.aborted) {
          retried = true;
          continue;
        }
        const code = signal.aborted || [ "TimeoutError", "AbortError" ].includes(error?.name) ? "reader_timeout" : "reader_network_error";
        const failure = new ReaderError(code);
        failure.transport = {
          name: String(error?.name || "Error").slice(0, 40),
          reason: String(error?.message || "Fetch failed").split(this.token).join("[redacted]").replace(/https?:\/\/[^\s]+/g, "[url]").slice(0, 500)
        };
        throw failure;
      }
      if ([ 301, 302, 303, 307, 308 ].includes(response.status)) {
        let next;
        try {
          next = new URL(response.headers.get("Location"), u);
        } catch {
          throw new ReaderError("reader_redirect_invalid");
        }
        // Never forward the Token outside the documented API origin or to non-API routes.
                if (next.origin !== "https://readwise.io" || !next.pathname.startsWith("/api/") || ++redirects > 2) throw new ReaderError("reader_redirect_invalid");
        u = next;
        continue;
      }
      if ([ 500, 502, 503, 504 ].includes(response.status) && !retried) {
        retried = true;
        continue;
      }
      break;
    }
    if (!response.ok) throw new ReaderError(response.status === 429 ? "rate_limited" : response.status === 401 || response.status === 403 ? "invalid_token" : "reader_http_" + response.status, response.status === 429 ? Number(response.headers.get("Retry-After")) || 60 : 0);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new ReaderError("invalid_response");
    }
    if (!Array.isArray(data.results)) throw new ReaderError("invalid_response");
    return data;
  }
  async sync() {
    const lease = await this.store.lease();
    if (!lease) {
      const state = await this.store.state();
      return {
        status: "busy",
        retryAfter: Math.max(1, Math.ceil((Math.max(state.lock_until, state.cooldown_until) - this.now()) / 1e3))
      };
    }
    let stage = lease.stage ? JSON.parse(lease.stage) : {
      started: this.now(),
      cursor: null,
      docs: [],
      pages: 0
    };
    try {
      // One operation over Inbox only. Large Inbox jobs retain their cursor across rate limits.
      for (let i = 0; i < 16; i++) {
        const data = await this.api({
          location: "new",
          limit: 100,
          pageCursor: stage.cursor
        });
        for (const raw of data.results) {
          const doc = documentState(raw);
          if (doc.item) stage.docs.push(doc);
        }
        stage.pages++;
        stage.cursor = data.nextPageCursor || null;
        if (!stage.cursor) {
          const unique = new Map;
          for (const d of stage.docs) if (!unique.has(d.id) || d.stateAt > unique.get(d.id).stateAt) unique.set(d.id, d);
          await this.store.snapshot(lease.owner, [ ...unique.values() ], stage.started);
          await this.store.release(lease.owner, 6e4);
          return {
            status: "updated",
            retryAfter: 60
          };
        }
        if (stage.pages > 2e3) throw new ReaderError("invalid_pagination");
        await this.store.stage(lease.owner, stage);
      }
      await this.store.stage(lease.owner, stage);
      await this.store.release(lease.owner, 6e4);
      return {
        status: "continuing",
        retryAfter: 60
      };
    } catch (error) {
      if (error.code === "rate_limited") {
        await this.store.stage(lease.owner, stage);
        await this.store.release(lease.owner, (error.retryAfter || 60) * 1e3);
        return {
          status: "continuing",
          retryAfter: error.retryAfter || 60
        };
      }
      // Drop failed partial snapshot so a manual retry starts with a fresh, complete view.
            await this.store.stage(lease.owner, null);
      await this.store.fail(error);
      await this.store.release(lease.owner, 6e4);
      throw error;
    }
  }
  async notification(payload) {
    if (!EVENTS.has(payload.event_type)) return {
      ignored: true
    };
    if (typeof payload.id !== "string" || !payload.id) throw new ReaderError("invalid_document");
    const old = await this.store.document(payload.id);
    let doc, query = false;
    try {
      doc = documentState(payload);
    } catch (error) {
      if (error.code === "incomplete_document") query = true; else throw error;
    }
    if (doc && old) {
      const encoded = doc.item ? JSON.stringify(doc.item) : null;
      if (doc.stateAt < old.state_at) return {
        ignored: true
      };
      if (doc.stateAt === old.state_at) {
        if (old.item === encoded) return {
          duplicate: true
        };
        query = true;
      }
    }
    if (query) {
      try {
        const data = await this.api({
          id: payload.id,
          limit: 1
        });
        const raw = data.results.find(d => d.id === payload.id);
        doc = raw ? documentState(raw) : {
          id: payload.id,
          stateAt: this.now() * 1e3,
          item: null
        };
      } catch (error) {
        await this.store.fail(error);
        throw error;
      }
    }
    if (!doc.item && !old) return {
      ignored: true
    };
    const changed = await this.store.apply(doc, {
      authoritative: query,
      expectedObserved: old?.observed_at ?? null
    });
    let refill = false;
    if (changed && old?.item && !doc.item) {
      const candidates = await this.store.items();
      refill = candidates.length < 3;
    }
    return {
      changed,
      refill
    };
  }
  async list() {
    const [state, items] = await Promise.all([ this.store.state(), this.store.items() ]);
    return {
      version: state.revision,
      lastError: state.last_error ? (({code, at}) => ({
        code,
        at
      }))(JSON.parse(state.last_error)) : null,
      initialized: !!state.initialized,
      stale: !!state.stale,
      updatedAt: state.updated_at || null,
      items: items.slice(0, 3).map(({savedOrder, ...item}) => item),
      connected: !!this.token,
      syncing: !!state.stage || state.lock_until > this.now()
    };
  }
}
