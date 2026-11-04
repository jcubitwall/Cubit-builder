/* GET  /api/prices                       the price book (salespeople and up, and anyone given Prices): { items:{ key:{ cost, unit?, name?, by, at, prev } } }
   POST /api/prices { set:{ key: { cost, unit?, name? } | null } }   editors, admins and anyone given Prices (an inventory
                                                                    person, whatever their role): change some prices
   Cubit's costs (what Cubit pays), one per product. A save sends only the prices that changed and they're merged into
   the book as it is on the server, so two people pricing at once never undo each other. Each price keeps who set it,
   when, and its last 5 values. Kept in the R2 bucket (binding STEPS) as prices/book.json. */
import { whoIs, json, atLeast, denied, canPrice } from '../_auth.js';
import { atomic, getJSON } from '../_store.js';
const KEY = 'prices/book.json';
const empty = () => ({ items:{} });
const MAX = 4000;
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'sales') && !canPrice(me)) return denied('sales');
  if(!env.STEPS) return json(empty());
  return json(await getJSON(env, KEY, empty));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!canPrice(me)) return denied('prices');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  const set = b?.set;
  if(!set || typeof set !== 'object' || Array.isArray(set)) return json({ error:'Bad request.' }, 400);
  const keys = Object.keys(set);
  if(!keys.length || keys.length > MAX || JSON.stringify(set).length > 400000) return json({ error:'Too many changes at once.' }, 400);
  for(const k of keys){ const v=set[k];
    if(typeof k !== 'string' || k.length > 200) return json({ error:'Bad product key.' }, 400);
    if(v !== null && (typeof v !== 'object' || !(v.cost === null || (typeof v.cost === 'number' && isFinite(v.cost) && v.cost >= 0 && v.cost < 1e7)))) return json({ error:`Bad price for ${k}.` }, 400); }
  const at = new Date().toISOString();
  const r = await atomic(env, KEY, empty, v => {
    v.items ||= {};
    for(const k of keys){ const n=set[k], o=v.items[k];
      if(n === null){ delete v.items[k]; continue; }
      const prev = o && o.cost !== n.cost ? [{ cost:o.cost, by:o.by, at:o.at }, ...(o.prev||[])].slice(0,5) : (o?.prev||[]);
      v.items[k] = { cost:n.cost, ...(n.unit ? { unit:String(n.unit).slice(0,40) } : o?.unit ? { unit:o.unit } : {}),
        ...(n.name ? { name:String(n.name).slice(0,160) } : o?.name ? { name:o.name } : {}), by:me.email, at, prev }; }
    v.at = at; v.by = me.email;
    return { value:v };
  });
  if(r.response) return r.response;
  return json(r.value);
}
