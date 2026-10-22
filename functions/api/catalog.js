/* GET  /api/catalog   the shared sub-models (everyone who can log in)
   POST /api/catalog   admins only: {op:'upsert', item} or {op:'delete', id}
   Sub-models are home layouts filed under one of the model names (LifePod, Nest, Haven, Cove, Panorama,
   Expanse). They are kept as one JSON file in the R2 bucket (binding STEPS, key catalog/submodels.json). */
import { whoIs, json } from '../_auth.js';
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
  let list = await read(env);
  if(body.op === 'upsert'){
    const it = body.item;
    if(!it || typeof it.id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(it.id) || typeof it.name !== 'string' || !it.model || !Array.isArray(it.model.pods)) return json({ error:'Bad sub-model.' }, 400);
    it.by = me.email; it.saved = new Date().toISOString();
    list = [it, ...list.filter(x => x.id !== it.id)];
  } else list = list.filter(x => x.id !== body.id);
  await env.STEPS.put(KEY, JSON.stringify(list), { httpMetadata:{ contentType:'application/json' } });
  return json({ ok:true, count:list.length });
}
