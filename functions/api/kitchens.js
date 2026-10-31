/* GET  /api/kitchens   the saved kitchens (and other cabinet groups) everyone can drop into a home
   POST /api/kitchens   editors and admins: {op:'save', item, overwrite}  ·  {op:'delete', id}
        item = { id, name, note, items:[recipe…] }. Saving over an existing kitchen needs overwrite:true (the app
        asks first); the version it replaces is kept under kitchens/history/<id>/. Homes that already use a kitchen
        keep their own copy: a saved kitchen only changes what's dropped in from now on. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { atomic, putJSON } from '../_store.js';
const KEY = 'catalog/kitchens.json';
const okId = id => typeof id === 'string' && /^[a-z0-9-]{1,48}$/.test(id);
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json([]);
  const o = await env.STEPS.get(KEY); if(!o) return json([]);
  try{ const v = await o.json(); return json(Array.isArray(v) ? v.filter(k=>!k.deleted) : []); }catch(e){ return json([]); }
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(b).length > 2_000_000) return json({ error:'Too big.' }, 413);
  const now = new Date().toISOString();
  const r = await atomic(env, KEY, ()=>[], async L=>{
    if(!Array.isArray(L)) L=[];
    if(b.op === 'save'){
      const it = b.item; if(!it || !okId(it.id) || !String(it.name||'').trim() || !Array.isArray(it.items) || !it.items.length) return json({ error:'Bad kitchen.' }, 400);
      const i = L.findIndex(k=>k.id===it.id);
      if(i >= 0 && !L[i].deleted && !b.overwrite) return json({ error:'A kitchen with that id exists. Confirm to save over it.', exists:true }, 409);
      if(i >= 0) await putJSON(env, `kitchens/history/${it.id}/${(L[i].saved||now).replace(/[:.]/g,'-')}.json`, L[i]);
      const out = { id:it.id, name:String(it.name).trim().slice(0,80), note:String(it.note||'').slice(0,300), items:it.items.slice(0,200), by:me.email, saved:now, rev:(i>=0 ? (L[i].rev||0) : 0)+1 };
      if(i >= 0) L[i] = out; else L.unshift(out);
    } else {
      const i = L.findIndex(k=>k.id===b.id); if(i < 0) return json({ error:'No such kitchen.' }, 404);
      await putJSON(env, `kitchens/history/${b.id}/${now.replace(/[:.]/g,'-')}-deleted.json`, L[i]); L.splice(i,1);
    }
    return { value:L };
  });
  if(r.response) return r.response;
  return json({ ok:true, kitchens:r.value });
}
