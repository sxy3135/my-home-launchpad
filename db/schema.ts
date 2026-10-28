import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';

export const readerDocuments = sqliteTable("reader_documents", {
  id: text("id").primaryKey(),
  item: text("item"),
  stateAt: integer("state_at").notNull(),
  observedAt: integer("observed_at").notNull()
}, t => [ index("reader_inbox_candidates").on(t.observedAt).where(sql`${t.item} IS NOT NULL`) ]);

export const readerState = sqliteTable("reader_state", {
  key: text("key").primaryKey(),
  revision: integer("revision").notNull().default(0),
  initialized: integer("initialized").notNull().default(0),
  stale: integer("stale").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
  lockOwner: text("lock_owner"),
  lockUntil: integer("lock_until").notNull().default(0),
  cooldownUntil: integer("cooldown_until").notNull().default(0),
  apiWindow: integer("api_window").notNull().default(0),
  apiCount: integer("api_count").notNull().default(0),
  stage: text("stage"),
  lastError: text("last_error")
});

export const homeSecurity = sqliteTable("home_security", {
  id: text("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  revision: integer("revision").notNull().default(1),
  readerSecrets: text("reader_secrets")
});

export const homeLoginLimits = sqliteTable("home_login_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull()
});
