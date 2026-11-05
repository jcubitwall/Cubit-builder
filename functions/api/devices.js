/* GET  /api/devices   switch, plug and data devices the team added to the Library (everyone who can log in)
   POST /api/devices   editors and admins: {op:'save', item}
        item = { id, kind:'sw'|'rc'|'dt', name, way?, amp?, n?, feats?, note? }. The built-in ones are in js/devices.js;
        renames and deletions of any device go through the library edits (kind 'devices'). Every saved version is
        kept under devices/history/<id>/. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { atomic, putJSON } from '../_store.js';
const KEY = 'catalog/devices.json';
const okId = id => typeof id === 'string' && /^[a-z0-9-]{3,48}$/i.test(id);
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
  if(!b || b.op!=='save') return json({ error:'Bad request.' }, 400);
  const it=b.item; if(!it || !okId(it.id) || !['sw','rc','dt'].includes(it.kind) || !String(it.name||'').trim()) return json({ error:'Bad device.' }, 400);
  const now=new Date().toISOString();
  const r = await atomic(env, KEY, ()=>[], async L=>{
    if(!Array.isArray(L)) L=[];
    const i=L.findIndex(x=>x.id===it.id);
    if(i>=0) await putJSON(env, `devices/history/${it.id}/${(L[i].saved||now).replace(/[:.]/g,'-')}.json`, L[i]);
    const out={ id:it.id, kind:it.kind, name:String(it.name).trim().slice(0,80), way:[1,3,4].includes(+it.way)?+it.way:undefined, amp:+it.amp||undefined, n:[1,2,3].includes(+it.n)?+it.n:undefined,
      look:String(it.look||'').slice(0,20)||undefined, feats:Array.isArray(it.feats)?it.feats.slice(0,12).map(f=>String(f).slice(0,20)):[], note:String(it.note||'').slice(0,300), custom:true, by:me.email, saved:now };
    if(i>=0) L[i]=out; else L.push(out);
    return { value:L };
  });
  if(r.response) return r.response;
  return json({ ok:true, devices:r.value });
}
