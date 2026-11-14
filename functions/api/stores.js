/* GET  /api/stores                         the team's own stores (local or online) and their product lists, and
                                            the team's product details (info)
   POST /api/stores {op:'save', store}       editors and admins: add or change a store (with its lists)
        /api/stores {op:'delete', id}        editors and admins: take a store off
        /api/stores {op:'info', key, info}   editors and admins: a product's photos, documents and extra details
                                            (key store:<store>:<sku> or cubit:<item>; info null takes them off)
   A store: { id, name, kind:'local'|'online', url, address, phone, note, cats:{ '<library category>':[product] } }
   Kept in MongoDB: settings, _id 'stores' (the stores) and _id 'productinfo' (the details).
   The stores that come with the app are the catalogue set 'stores' (api/seed/stores). */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, bare } from '../_mongo.js';
async function load(env){ const d=bare(await mongo(env).coll('settings').get('stores')); return Array.isArray(d?.stores) ? d.stores : []; }
async function loadInfo(env){ const d=bare(await mongo(env).coll('settings').get('productinfo')); return d?.info && typeof d.info==='object' ? d.info : {}; }
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  const [stores, info] = await Promise.all([load(env), loadInfo(env)]);
  return json({ stores, info });
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null); if(!b || !b.op) return json({ error:'Bad request.' }, 400);
  if(b.op==='info'){
    if(!/^(store:[a-z0-9-]{2,40}:[A-Za-z0-9._-]{1,60}|cubit:[A-Za-z0-9._-]{1,60})$/.test(b.key||'')) return json({ error:'Bad product key.' }, 400);
    if(b.info && JSON.stringify(b.info).length > 60000) return json({ error:'Too much for one product.' }, 400);
    const info = { ...(await loadInfo(env)) };
    if(b.info) info[b.key] = { ...b.info, by:me.email, at:new Date().toISOString() }; else delete info[b.key];
    await mongo(env).coll('settings').put({ _id:'productinfo', info, at:new Date().toISOString() });
    return json({ info });
  }
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
