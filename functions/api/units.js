/* GET  /api/units   the Cubit window & door library's team units: adopted from a maker's catalogue, or edited
                     (laid over data/units.json when the app loads; same id = replaces it)
   POST /api/units   editors and admins only: {op:'save', item}  ·  {op:'delete', id}
        item = { id, name, type, w, h, d, brand, maker, style, rso, bm, hand, swing, place, adoptedFrom, … }.
        Every version replaced or removed is kept under units/history/<id>/. Homes keep working: an opening
        stores the unit id, and a removed unit just stops being offered. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { atomic, putJSON } from '../_store.js';
const KEY = 'catalog/units.json';
const okId = id => typeof id === 'string' && /^[A-Za-z0-9-]{1,48}$/.test(id);
const TYPES = ['picture','casement','awning','single','double','slider','slider3','dslider','bay','bow','entry','patio','round'];
const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
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
  if(JSON.stringify(b).length > 200_000) return json({ error:'Too big.' }, 413);
  const now = new Date().toISOString();
  const r = await atomic(env, KEY, ()=>[], async L=>{
    if(!Array.isArray(L)) L=[];
    if(b.op === 'save'){
      const it = b.item;
      if(!it || !okId(it.id) || !String(it.name||'').trim() || !TYPES.includes(it.type) || !num(it.w,4,240) || !num(it.h,4,240) || !num(it.d??4.5,1,24)) return json({ error:'Bad unit (id, name, type, width and height 4–240″).' }, 400);
      const i = L.findIndex(u=>u.id===it.id);
      if(i >= 0) await putJSON(env, `units/history/${it.id}/${(L[i].saved||now).replace(/[:.]/g,'-')}.json`, L[i]);
      const out = { ...it, name:String(it.name).trim().slice(0,100), by:me.email, saved:now, rev:(i>=0 ? (L[i].rev||0) : 0)+1, src:'team' };
      if(i >= 0) L[i] = out; else L.unshift(out);
    } else {
      const i = L.findIndex(u=>u.id===b.id); if(i < 0) return json({ error:'No such team unit.' }, 404);
      await putJSON(env, `units/history/${b.id}/${now.replace(/[:.]/g,'-')}-deleted.json`, L[i]); L.splice(i,1);
    }
    return { value:L };
  });
  if(r.response) return r.response;
  return json({ ok:true, units:r.value });
}
