/* GET  /api/adopted   products the team adopted from a store catalogue into the Cubit library
   POST /api/adopted   editors and admins only: {op:'save', item}  ·  {op:'delete', id}
        item = { id:'<store>:<cat>:<sku>', store, cat, product:{ sku, brand, model, name, kind, w, h, d, … } }.
        Every version replaced or removed is kept (MongoDB history). Kept in MongoDB: collection adopted. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, keepVersion } from '../_mongo.js';
import { listOf, putItem, now } from '../_lib.js';
const okId = id => typeof id === 'string' && /^[a-z0-9-]{2,32}:[a-z0-9-]{1,24}:[A-Za-z0-9-]{1,32}$/.test(id);
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  return json(await listOf(mongo(env), 'adopted'));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(b).length > 100_000) return json({ error:'Too big.' }, 413);
  const M = mongo(env), t = now();
  if(b.op === 'save'){
    const it = b.item; const P = it?.product;
    if(!it || !okId(it.id) || !P || !String(P.name||'').trim() || !(+P.w>0 && +P.h>0 && +P.d>0)) return json({ error:'Bad product.' }, 400);
    const out = { id:it.id, store:String(it.store), cat:String(it.cat), product:P, by:me.email, at:t };
    await keepVersion(M, 'adopted', await putItem(M, 'adopted', out, { front:false }));
  } else {
    const was = await M.coll('adopted').get(b.id); if(!was) return json({ error:'Not adopted.' }, 404);
    await keepVersion(M, 'adopted', { ...was, at:t }, '-deleted'); await M.coll('adopted').del(b.id);
  }
  return json({ ok:true, adopted:await listOf(M, 'adopted') });
}
