/* GET  /api/prices                       the price book (salespeople and up, and anyone given Prices): { items:{ key:{ cost, unit?, name?, by, at, prev } }, at, by }
   POST /api/prices { set:{ key: { cost, unit?, name? } | null } }   editors, admins and anyone given Prices (an inventory
                                                                    person, whatever their role): change some prices
   Cubit's costs (what Cubit pays), one per product. A save sends only the prices that changed, each written on its
   own row, so two people pricing at once never undo each other. Each price keeps who set it, when, and the values it
   replaced (the last 5 are handed back as prev). Kept in MariaDB: prices and price_history. */
import { whoIs, json, atLeast, denied, canPrice } from '../_auth.js';
import { withSql, toDT, toISO } from '../_sql.js';
const MAX = 4000;
const num = v => v == null ? null : +v;
async function book(db){
  const rows = await db.q('SELECT product_key, cost, unit, name, set_by, set_at FROM prices');
  const hist = await db.q(`SELECT product_key, cost, set_by, set_at FROM (
      SELECT h.*, ROW_NUMBER() OVER (PARTITION BY product_key ORDER BY id DESC) AS n FROM price_history h) x WHERE n <= 5 ORDER BY product_key, n`);
  const prev = {}; for(const h of hist) (prev[h.product_key] ||= []).push({ cost:num(h.cost), by:h.set_by, at:toISO(h.set_at) });
  const items = {}; let at = null, by = null;
  for(const r of rows){
    items[r.product_key] = { cost:num(r.cost), ...(r.unit ? { unit:r.unit } : {}), ...(r.name ? { name:r.name } : {}), by:r.set_by, at:toISO(r.set_at), prev:prev[r.product_key]||[] };
    if(r.set_at && (!at || r.set_at > at)){ at = r.set_at; by = r.set_by; }
  }
  return { items, ...(at ? { at:toISO(at), by } : {}) };
}
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'sales') && !canPrice(me)) return denied('sales');
  return json(await withSql(env, book));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!canPrice(me)) return denied('prices');
  const b = await request.json().catch(()=>null);
  const set = b?.set;
  if(!set || typeof set !== 'object' || Array.isArray(set)) return json({ error:'Bad request.' }, 400);
  const keys = Object.keys(set);
  if(!keys.length || keys.length > MAX || JSON.stringify(set).length > 400000) return json({ error:'Too many changes at once.' }, 400);
  for(const k of keys){ const v=set[k];
    if(typeof k !== 'string' || k.length > 200) return json({ error:'Bad product key.' }, 400);
    if(v !== null && (typeof v !== 'object' || !(v.cost === null || (typeof v.cost === 'number' && isFinite(v.cost) && v.cost >= 0 && v.cost < 1e7)))) return json({ error:`Bad price for ${k}.` }, 400); }
  const at = toDT(new Date().toISOString());
  return json(await withSql(env, async db => {
    await db.tx(async q => {
      for(const k of keys){ const n = set[k];
        const o = (await q('SELECT cost, unit, name, set_by, set_at FROM prices WHERE product_key=? FOR UPDATE', [k]))[0];
        if(n === null){ if(o) await q('DELETE FROM prices WHERE product_key=?', [k]); continue; }
        if(o && num(o.cost) !== n.cost) await q('INSERT INTO price_history (product_key, cost, set_by, set_at) VALUES (?,?,?,?)', [k, o.cost, o.set_by, o.set_at]);
        await q(`INSERT INTO prices (product_key, cost, unit, name, set_by, set_at) VALUES (?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE cost=VALUES(cost), unit=VALUES(unit), name=VALUES(name), set_by=VALUES(set_by), set_at=VALUES(set_at)`,
          [k, n.cost, n.unit ? String(n.unit).slice(0,40) : (o?.unit ?? null), n.name ? String(n.name).slice(0,160) : (o?.name ?? null), me.email, at]);
      }
    });
    return book(db);
  }));
}
