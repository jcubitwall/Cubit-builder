/* GET  /api/units   the Cubit window & door library's team units: adopted from a maker's catalogue, or edited
                     (laid over the catalogue's units when the app loads; same id = replaces it)
   POST /api/units   editors and admins only: {op:'save', item}  ·  {op:'delete', id}
        item = { id, name, type, w, h, d, brand, maker, style, rso, bm, hand, swing, place, adoptedFrom, … }.
        Every version replaced or removed is kept (MongoDB history). Homes keep working: an opening stores the
        unit id, and a removed unit just stops being offered.
   Kept in MongoDB: collection units. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, keepVersion } from '../_mongo.js';
import { listOf, putItem, now } from '../_lib.js';
const okId = id => typeof id === 'string' && /^[A-Za-z0-9-]{1,48}$/.test(id);
const TYPES = ['picture','casement','awning','single','double','slider','slider3','dslider','bay','bow','entry','patio','round'];
const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  return json(await listOf(mongo(env), 'units'));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(b).length > 200_000) return json({ error:'Too big.' }, 413);
  const M = mongo(env), t = now();
  if(b.op === 'save'){
    const it = b.item;
    if(!it || !okId(it.id) || !String(it.name||'').trim() || !TYPES.includes(it.type) || !num(it.w,4,240) || !num(it.h,4,240) || !num(it.d??4.5,1,24)) return json({ error:'Bad unit (id, name, type, width and height 4–240″).' }, 400);
    const cur = await M.coll('units').get(it.id);
    const out = { ...it, name:String(it.name).trim().slice(0,100), by:me.email, saved:t, rev:(cur?.rev||0)+1, src:'team' };
    await keepVersion(M, 'units', await putItem(M, 'units', out, { front:false }));
  } else {
    const was = await M.coll('units').get(b.id); if(!was) return json({ error:'No such team unit.' }, 404);
    await keepVersion(M, 'units', { ...was, saved:t }, '-deleted'); await M.coll('units').del(b.id);
  }
  return json({ ok:true, units:await listOf(M, 'units') });
}
