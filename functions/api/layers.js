/* GET  /api/layers                     floors, ceilings and roofs made in the layer builder (everyone who can log in)
   POST /api/layers {op:'save', layer}  admins: add or replace one (the version it replaces is kept)
        {op:'delete', id}
   Kept in the R2 bucket (binding STEPS): layers/index.json, earlier versions under layers/history/<id>/. */
import { whoIs, json } from '../_auth.js';
const KEY='layers/index.json';
const KINDS=['floor-ext','floor-int','ceiling-int','roof'];
async function read(env){ const o=await env.STEPS.get(KEY); if(!o) return []; try{ const v=await o.json(); return Array.isArray(v)?v:[]; }catch(e){ return []; } }
const put=(env,k,v)=>env.STEPS.put(k, JSON.stringify(v), { httpMetadata:{ contentType:'application/json' } });
export async function onRequestGet({ request, env }){
  const me=await whoIs(request, env); if(me.role==='none') return json({ error:'Not signed in.' }, 401);
  return json(env.STEPS ? await read(env) : []);
}
export async function onRequestPost({ request, env }){
  const me=await whoIs(request, env); if(me.role!=='admin') return json({ error:'Only admins can change the layer library.' }, 403);
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b=await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  let L=await read(env);
  const id = b.op==='save' ? b.layer?.id : b.id;
  if(typeof id!=='string' || !/^[A-Z]{1,3}\d{2}-[A-Z0-9]{1,8}$/.test(id)) return json({ error:'Bad layer id.' }, 400);
  const was=L.find(l=>l.id===id); if(was) await put(env, `layers/history/${id}/${(was.saved||new Date().toISOString()).replace(/[:.]/g,'-')}.json`, was);
  if(b.op==='save'){
    const l=b.layer; if(![8,16,24].includes(l.len) || !KINDS.includes(l.kind) || !Array.isArray(l.holes) || JSON.stringify(l).length>400000) return json({ error:'Bad layer.' }, 400);
    l.by=me.email; l.saved=new Date().toISOString(); L=[l, ...L.filter(x=>x.id!==id)];
  } else L=L.filter(x=>x.id!==id);
  await put(env, KEY, L);
  return json({ ok:true, layers:L });
}
