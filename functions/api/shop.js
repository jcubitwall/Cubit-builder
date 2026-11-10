/* GET  /api/shop?home=<key>          what's been ticked off on that home's shopping list (editors and admins)
   POST /api/shop {home, key, done}   tick or untick one line
   Kept in MariaDB: shop_ticks (one row per ticked line), shared by everyone in the shop. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { withSql, toDT, toISO } from '../_sql.js';
const ok = h => typeof h==='string' && /^[a-z0-9_-]{1,80}$/i.test(h);
const read = (db, home) => db.q('SELECT line_key, by_email, at FROM shop_ticks WHERE home=?', [home])
  .then(rows => Object.fromEntries(rows.map(r => [r.line_key, { by:r.by_email, at:toISO(r.at) }])));
export async function onRequestGet({ request, env }){
  const me=await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const home=new URL(request.url).searchParams.get('home'); if(!ok(home)) return json({ error:'Bad home.' }, 400);
  return json(await withSql(env, db => read(db, home)));
}
export async function onRequestPost({ request, env }){
  const me=await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b=await request.json().catch(()=>null);
  if(!b || !ok(b.home) || typeof b.key!=='string' || b.key.length>200) return json({ error:'Bad request.' }, 400);
  return json(await withSql(env, async db => {
    if(b.done) await db.q('INSERT INTO shop_ticks (home, line_key, by_email, at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE by_email=VALUES(by_email), at=VALUES(at)', [b.home, b.key, me.email, toDT(new Date().toISOString())]);
    else await db.q('DELETE FROM shop_ticks WHERE home=? AND line_key=?', [b.home, b.key]);
    return read(db, b.home);
  }));
}
