/* GET  /api/stores                         the team's own stores (local or online) and their product lists
   POST /api/stores {op:'save', store}       editors and admins: add or change a store (with its lists)
        /api/stores {op:'delete', id}        editors and admins: take a store off
   A store: { id, name, kind:'local'|'online', url, address, phone, note, cats:{ '<library category>':[product] } }
   A product: { sku, name, brand, model, price, url, note, w, h, d }. Kept in the R2 bucket (binding STEPS) as
   stores/team.json. The stores that come with the app are in data/stores.json.
   POST {op:'info', key, info}            editors and admins: a product's photos, documents and extra details
        (key store:<store>:<sku> or cubit:<item>; info null takes them off). Returned with the stores as info. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
const KEY = 'stores/team.json';
async function loadAll(env){ const o=await env.STEPS.get(KEY); if(!o) return { stores:[], info:{} }; try{ const j=await o.json(); return { stores:Array.isArray(j.stores)?j.stores:[], info:j.info&&typeof j.info==='object'?j.info:{} }; }catch(e){ return { stores:[], info:{} }; } }
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json({ stores:[], info:{} });
  return json(await loadAll(env));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null); if(!b || !b.op) return json({ error:'Bad request.' }, 400);
  const all = await loadAll(env); let L = all.stores, info = all.info;
  if(b.op==='info'){
    if(!/^(store:[a-z0-9-]{2,40}:[A-Za-z0-9._-]{1,60}|cubit:[A-Za-z0-9._-]{1,60})$/.test(b.key||'')) return json({ error:'Bad product key.' }, 400);
    if(b.info && JSON.stringify(b.info).length > 60000) return json({ error:'Too much for one product.' }, 400);
    info = { ...info }; if(b.info) info[b.key] = { ...b.info, by:me.email, at:new Date().toISOString() }; else delete info[b.key];
  } else if(b.op==='save'){
    const s=b.store; if(!s || typeof s!=='object' || !/^[a-z0-9-]{2,40}$/.test(s.id||'') || !String(s.name||'').trim()) return json({ error:'A store needs a name.' }, 400);
    if(JSON.stringify(s).length > 400000) return json({ error:'That store is too big.' }, 400);
    const st={ ...s, team:true, by:me.email, at:new Date().toISOString() };
    L = [st, ...L.filter(x=>x.id!==s.id)];
  } else if(b.op==='delete'){ L = L.filter(x=>x.id!==b.id); }
  else return json({ error:'Bad request.' }, 400);
  await env.STEPS.put(KEY, JSON.stringify({ stores:L, info }), { httpMetadata:{ contentType:'application/json' } });
  return json({ stores:L, info });
}
