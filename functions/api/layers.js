/* GET  /api/layers                     floors, ceilings and roofs made in the layer builder (everyone who can log in)
   POST /api/layers {op:'save', layer}  editors and admins: add or replace one (the version it replaces is kept)
        {op:'delete', id}
   GET  ?asof=<ISO>&ids=a,b            each as it was at that time (homes locked then keep that version)
   Kept in MongoDB: collection layers (one document per layer), earlier versions in history. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, keepVersion, asOf } from '../_mongo.js';
import { listOf, putItem, now } from '../_lib.js';
const KINDS=['floor-ext','floor-int','ceiling-int','roof','floor-up'];
export async function onRequestGet({ request, env }){
  const me=await whoIs(request, env); if(me.role==='none') return json({ error:'Not signed in.' }, 401);
  const M=mongo(env), u=new URL(request.url), at=u.searchParams.get('asof');
  if(at){ if(isNaN(Date.parse(at))) return json({ error:'Bad time.' }, 400); return json(await asOf(M, 'layers', (u.searchParams.get('ids')||'').split(',').filter(Boolean), at)); }
  return json(await listOf(M, 'layers'));
}
export async function onRequestPost({ request, env }){
  const me=await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b=await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  const id = b.op==='save' ? b.layer?.id : b.id;
  if(typeof id!=='string' || !/^[A-Z]{1,3}\d{2}-[A-Z0-9]{1,8}$/.test(id)) return json({ error:'Bad layer id.' }, 400);
  const M=mongo(env);
  if(b.op==='save'){
    const l=b.layer; if(![8,16,24].includes(l.len) || !KINDS.includes(l.kind) || !Array.isArray(l.holes) || JSON.stringify(l).length>400000) return json({ error:'Bad layer.' }, 400);
    l.by=me.email; l.saved=now();
    await keepVersion(M, 'layers', await putItem(M, 'layers', l));
  } else { const was=await M.coll('layers').get(id); if(was){ await keepVersion(M, 'layers', was); await M.coll('layers').del(id); } }
  return json({ ok:true, layers:await listOf(M, 'layers') });
}
