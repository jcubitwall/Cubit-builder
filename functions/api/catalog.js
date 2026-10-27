/* GET  /api/catalog   the shared sub-models (everyone who can log in)
   POST /api/catalog   admins only: {op:'upsert', item, baseRev} or {op:'delete', id}
                       baseRev = the version the saver started from; if someone saved since: 409 {changed, current}
   Sub-models are home layouts filed under one of the model names (LifePod, Nest, Haven, Cove, Panorama,
   Expanse). They are kept as one JSON file in the R2 bucket (binding STEPS, key catalog/submodels.json).
   An item with `over: <model key>` is a Cubit model saved over (it replaces that model for everyone).
   Every version replaced or removed is kept under catalog/history/<id>/. */
import { whoIs, json } from '../_auth.js';
import { atomic } from '../_store.js';
const KEY = 'catalog/submodels.json';
async function read(env){ const o = await env.STEPS.get(KEY); if(!o) return []; try{ const v = await o.json(); return Array.isArray(v) ? v : []; }catch(e){ return []; } }
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env);
  if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json([]);
  return json(await read(env));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env);
  if(me.role !== 'admin') return json({ error:'Only admins can change the models.' }, 403);
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const body = await request.json().catch(()=>null);
  if(!body || !['upsert','delete'].includes(body.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(body).length > 2_000_000) return json({ error:'Too big.' }, 413);
  // every version that gets replaced or removed is kept: catalog/history/<id>/<time>.json
  const keep = async it => { if(it) await env.STEPS.put(`catalog/history/${it.id}/${(it.saved||new Date().toISOString()).replace(/[:.]/g,'-')}.json`, JSON.stringify(it), { httpMetadata:{ contentType:'application/json' } }); };
  const r = await atomic(env, KEY, ()=>[], async list=>{
    if(!Array.isArray(list)) list=[];
    const was = list.find(x => x.id === (body.op==='upsert' ? body.item?.id : body.id));
    if(body.op === 'upsert'){
      const it = body.item;
      if(!it || typeof it.id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(it.id) || typeof it.name !== 'string' || !it.model || !Array.isArray(it.model.pods)) return json({ error:'Bad sub-model.' }, 400);
      if(was && body.baseRev != null && (was.rev||0) !== body.baseRev) return json({ changed:true, current:was }, 409);
      if(was) await keep(was);
      it.by = me.email; it.saved = new Date().toISOString(); it.rev = (was?.rev||0) + 1;
      if(body.merged) it.merged = body.merged; else delete it.merged;
      list = [it, ...list.filter(x => x.id !== it.id)];
    } else { if(was) await keep(was); list = list.filter(x => x.id !== body.id); }
    return { value:list, item: body.op==='upsert' ? body.item : null };
  });
  if(r.response) return r.response;
  return json({ ok:true, count:r.value.length, item:r.item });
}
