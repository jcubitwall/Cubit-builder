/* GET  /api/stores                         the team's own stores (local or online) and their product lists
   POST /api/stores {op:'save', store}       editors and admins: add or change a store (with its lists)
        /api/stores {op:'delete', id}        editors and admins: take a store off
   A store: { id, name, kind:'local'|'online', url, address, phone, note, cats:{ '<library category>':[product] } }
   A product: { sku, name, brand, model, price, url, note, w, h, d }. Kept in MongoDB: settings, _id 'stores'.
   The stores that come with the app are the catalogue set 'stores' (api/seed/stores). */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, bare } from '../_mongo.js';
async function load(env){ const d=bare(await mongo(env).coll('settings').get('stores')); return Array.isArray(d?.stores) ? d.stores : []; }
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  return json({ stores: await load(env) });
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null); if(!b || !b.op) return json({ error:'Bad request.' }, 400);
  let L = await load(env);
  if(b.op==='save'){
    const s=b.store; if(!s || typeof s!=='object' || !/^[a-z0-9-]{2,40}$/.test(s.id||'') || !String(s.name||'').trim()) return json({ error:'A store needs a name.' }, 400);
    if(JSON.stringify(s).length > 400000) return json({ error:'That store is too big.' }, 400);
    L = [{ ...s, team:true, by:me.email, at:new Date().toISOString() }, ...L.filter(x=>x.id!==s.id)];
  } else if(b.op==='delete'){ L = L.filter(x=>x.id!==b.id); }
  else return json({ error:'Bad request.' }, 400);
  await mongo(env).coll('settings').put({ _id:'stores', stores:L, at:new Date().toISOString() });
  return json({ stores:L });
}
