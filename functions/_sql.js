/* Cubit Builder — the structured database (MariaDB), reached through Cloudflare Hyperdrive.

   What lives here: the business records, in tables with keys and types.
     team_members      who has which role
     customers         one row per customer; customer_log (their history) and customer_homes (which homes are theirs)
     projects          one row per home: name, customer, revision, who saved it and when, signed / locked, deleted.
                       The design itself (pods, walls, choices) is a document in MongoDB (see _mongo.js)
     project_unlocks   every unlock of a signed home: who, when, why, fee
     signings          every signing: customer, home, rep, client. The signatures and the summary signed are a
                       document in MongoDB (signed_records)
     prices            the price book, one row per product; price_history keeps the values each one replaced
     shop_ticks        what's been ticked off on a home's shopping list
     step_imports      the log of STEP files scanned into the library
     files             one row per photo, signed PDF and STEP file; the bytes are in R2 (binding STEPS)

   Reached through the cubit-db gateway Worker (workers/db, service binding DB), which holds the driver and talks to
   MariaDB through Cloudflare Hyperdrive (Hyperdrive keeps the real connections warm). */

export const SCHEMA = [
`CREATE TABLE IF NOT EXISTS team_members (
  email VARCHAR(254) NOT NULL PRIMARY KEY,
  role ENUM('user','sales','editor','admin') NOT NULL DEFAULT 'user',
  prices TINYINT(1) NOT NULL DEFAULT 0,
  set_by VARCHAR(254) NULL, set_at DATETIME(3) NULL
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  name VARCHAR(80) NOT NULL, company VARCHAR(80) NULL, email VARCHAR(120) NULL, phone VARCHAR(40) NULL,
  address VARCHAR(200) NULL, site VARCHAR(200) NULL, notes TEXT NULL, status VARCHAR(40) NULL,
  created_at DATETIME(3) NULL, created_by VARCHAR(254) NULL,
  deleted_at DATETIME(3) NULL, deleted_by VARCHAR(254) NULL,
  ord BIGINT NOT NULL DEFAULT 0,
  KEY by_name (name), KEY by_deleted (deleted_at)
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS customer_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(40) NOT NULL, at DATETIME(3) NOT NULL, by_email VARCHAR(254) NULL, what VARCHAR(300) NOT NULL,
  KEY by_customer (customer_id, id)
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS customer_homes (
  customer_id VARCHAR(40) NOT NULL, project_id VARCHAR(40) NOT NULL, pos INT NOT NULL DEFAULT 0,
  PRIMARY KEY (customer_id, project_id), KEY by_project (project_id)
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  name VARCHAR(80) NOT NULL, customer_id VARCHAR(40) NULL, size VARCHAR(40) NULL,
  rev INT NOT NULL DEFAULT 0, saved_at DATETIME(3) NULL, saved_by VARCHAR(254) NULL,
  restored_from DATETIME(3) NULL,
  locked_at DATETIME(3) NULL, locked_by VARCHAR(254) NULL, lock_customer VARCHAR(40) NULL, lock_rep VARCHAR(80) NULL, lock_client VARCHAR(80) NULL,
  deleted_at DATETIME(3) NULL, deleted_by VARCHAR(254) NULL, last_version VARCHAR(40) NULL,
  ord BIGINT NOT NULL DEFAULT 0,
  KEY by_customer (customer_id), KEY by_deleted (deleted_at)
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS project_unlocks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(40) NOT NULL, at DATETIME(3) NOT NULL, by_email VARCHAR(254) NULL,
  reason VARCHAR(300) NOT NULL, fee VARCHAR(40) NULL,
  was_at DATETIME(3) NULL, was_by VARCHAR(254) NULL, was_customer VARCHAR(40) NULL, was_rep VARCHAR(80) NULL, was_client VARCHAR(80) NULL,
  KEY by_project (project_id, id)
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS signings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(40) NOT NULL, project_id VARCHAR(40) NOT NULL, at DATETIME(3) NOT NULL, by_email VARCHAR(254) NULL,
  rep VARCHAR(80) NULL, client VARCHAR(80) NULL, record_id VARCHAR(120) NOT NULL DEFAULT '',
  KEY by_customer_home (customer_id, project_id, at)
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS prices (
  product_key VARCHAR(200) NOT NULL PRIMARY KEY,
  cost DECIMAL(16,4) NULL, unit VARCHAR(40) NULL, name VARCHAR(160) NULL,
  set_by VARCHAR(254) NULL, set_at DATETIME(3) NULL
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS price_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_key VARCHAR(200) NOT NULL, cost DECIMAL(16,4) NULL, set_by VARCHAR(254) NULL, set_at DATETIME(3) NULL,
  KEY by_product (product_key, id)
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS shop_ticks (
  home VARCHAR(80) NOT NULL, line_key VARCHAR(200) NOT NULL, by_email VARCHAR(254) NULL, at DATETIME(3) NOT NULL,
  PRIMARY KEY (home, line_key)
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS step_imports (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  kind VARCHAR(60) NULL, name VARCHAR(160) NULL, file VARCHAR(200) NULL, by_email VARCHAR(254) NULL,
  started DATETIME(3) NULL, finished DATETIME(3) NULL, status VARCHAR(20) NULL,
  summary JSON NULL, error TEXT NULL
) CHARACTER SET utf8mb4`,
`CREATE TABLE IF NOT EXISTS files (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  r2_key VARCHAR(300) NOT NULL UNIQUE,
  kind ENUM('photo','signed_pdf','step_upload','source_step') NOT NULL,
  customer_id VARCHAR(40) NULL, project_id VARCHAR(40) NULL,
  name VARCHAR(160) NULL, filename VARCHAR(200) NULL, content_type VARCHAR(80) NULL, size BIGINT NULL,
  created_by VARCHAR(254) NULL, created_at DATETIME(3) NOT NULL,
  KEY by_customer (customer_id, kind, created_at)
) CHARACTER SET utf8mb4`,
];

/* ISO string ⇄ DATETIME(3) (UTC) */
export const toDT = iso => { if(!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d.toISOString().slice(0,23).replace('T',' '); };
export const toISO = v => { if(v == null) return null; if(v instanceof Date) return v.toISOString(); const s = String(v); return /Z$/.test(s) ? s : new Date(s.replace(' ','T')+'Z').toISOString(); };

/* one connection for this request: sql(env) → { q(sql, args) → rows, one, tx(fn), end() } */
export async function sql(env){
  if(!env.DB) throw new Error('The database is not set up (service binding DB → cubit-db).');
  const c = await env.DB.sql();
  const q = (s, a=[]) => c.q(s, a);
  return {
    q,
    one: async (s, a=[]) => (await q(s, a))[0] || null,
    /* a transaction: fn(q) runs between BEGIN and COMMIT; anything thrown rolls it back */
    async tx(fn){ await c.begin(); try{ const r = await fn(q); await c.commit(); return r; }catch(e){ try{ await c.rollback(); }catch(_){} throw e; } },
    end: () => c.end().catch(()=>{}),
  };
}
/* run fn with a connection and close it after */
export async function withSql(env, fn){
  const db = await sql(env);
  try{ return await fn(db); } finally{ await db.end(); }
}
export async function ensureSchema(db){ for(const s of SCHEMA) await db.q(s); }
