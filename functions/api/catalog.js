/* GET  /api/catalog   the shared sub-models (everyone who can log in)
   POST /api/catalog   editors and admins: {op:'upsert', item, baseRev} or {op:'delete', id}
                       baseRev = the version the saver started from; if someone saved since: 409 {changed, current}
   Sub-models are home layouts filed under one of the model names (LifePod, Nest, Haven, Cove, Panorama,
   Expanse). An item with `over: <model key>` is a Cubit model saved over (it replaces that model for everyone).
   Kept in MongoDB: collection submodels; every version replaced or removed is kept in history. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, keepVersion, bare } from '../_mongo.js';
import { listOf, putItem, now } from '../_lib.js';
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  return json(await listOf(mongo(env), 'submodels'));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const body = await request.json().catch(()=>null);
  if(!body || !['upsert','delete'].includes(body.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(body).length > 2_000_000) return json({ error:'Too big.' }, 413);
  const M = mongo(env);
  if(body.op === 'upsert'){
    const it = body.item;
    if(!it || typeof it.id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(it.id) || typeof it.name !== 'string' || !it.model || !Array.isArray(it.model.pods)) return json({ error:'Bad sub-model.' }, 400);
    const was = bare(await M.coll('submodels').get(it.id));
    if(was && body.baseRev != null && (was.rev||0) !== body.baseRev) return json({ changed:true, current:was }, 409);
    it.by = me.email; it.saved = now(); it.rev = (was?.rev||0) + 1;
    if(body.merged) it.merged = body.merged; else delete it.merged;
    await keepVersion(M, 'submodels', await putItem(M, 'submodels', it));
    return json({ ok:true, count:await M.coll('submodels').count(), item:it });
  }
  const was = await M.coll('submodels').get(body.id);
  if(was){ await keepVersion(M, 'submodels', bare(was)); await M.coll('submodels').del(body.id); }
  return json({ ok:true, count:await M.coll('submodels').count(), item:null });
}
