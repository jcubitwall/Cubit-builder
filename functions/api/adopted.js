/* GET  /api/adopted   products the team adopted from a store catalogue (data/stores.json) into the Cubit library
   POST /api/adopted   editors and admins only: {op:'save', item}  ·  {op:'delete', id}
        item = { id:'<store>:<cat>:<sku>', store, cat, product:{ sku, brand, model, name, kind, w, h, d, … } }.
        Every version replaced or removed is kept under adopted/history/<id>/. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { atomic, putJSON } from '../_store.js';
const KEY = 'catalog/adopted.json';
const okId = id => typeof id === 'string' && /^[a-z0-9-]{2,32}:[a-z0-9-]{1,24}:[A-Za-z0-9-]{1,32}$/.test(id);
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json([]);
  const o = await env.STEPS.get(KEY); if(!o) return json([]);
  try{ const v = await o.json(); return json(Array.isArray(v) ? v : []); }catch(e){ return json([]); }
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(b).length > 100_000) return json({ error:'Too big.' }, 413);
  const now = new Date().toISOString();
  const r = await atomic(env, KEY, ()=>[], async L=>{
    if(!Array.isArray(L)) L=[];
    if(b.op === 'save'){
      const it = b.item; const P = it?.product;
      if(!it || !okId(it.id) || !P || !String(P.name||'').trim() || !(+P.w>0 && +P.h>0 && +P.d>0)) return json({ error:'Bad product.' }, 400);
      const i = L.findIndex(x=>x.id===it.id);
      if(i >= 0) await putJSON(env, `adopted/history/${it.id.replace(/:/g,'_')}/${(L[i].at||now).replace(/[:.]/g,'-')}.json`, L[i]);
      const out = { id:it.id, store:String(it.store), cat:String(it.cat), product:P, by:me.email, at:now };
      if(i >= 0) L[i] = out; else L.unshift(out);
    } else {
      const i = L.findIndex(x=>x.id===b.id); if(i < 0) return json({ error:'Not adopted.' }, 404);
      await putJSON(env, `adopted/history/${b.id.replace(/:/g,'_')}/${now.replace(/[:.]/g,'-')}-deleted.json`, L[i]); L.splice(i,1);
    }
    return { value:L };
  });
  if(r.response) return r.response;
  return json({ ok:true, adopted:r.value });
}
