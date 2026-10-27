/* GET  /api/shapes                     shapes drawn in the Shape studio (everyone who can log in)
   POST /api/shapes {op:'save', shape}  admins: add or replace one (the version it replaces is kept)
        {op:'delete', id}
   Kept in the R2 bucket (binding STEPS): shapes/index.json, earlier versions under shapes/history/<id>/. */
import { whoIs, json } from '../_auth.js';
const KEY='shapes/index.json';
async function read(env){ const o=await env.STEPS.get(KEY); if(!o) return []; try{ const v=await o.json(); return Array.isArray(v)?v:[]; }catch(e){ return []; } }
const put=(env,k,v)=>env.STEPS.put(k, JSON.stringify(v), { httpMetadata:{ contentType:'application/json' } });
export async function onRequestGet({ request, env }){
  const me=await whoIs(request, env); if(me.role==='none') return json({ error:'Not signed in.' }, 401);
  return json(env.STEPS ? await read(env) : []);
}
export async function onRequestPost({ request, env }){
  const me=await whoIs(request, env); if(me.role!=='admin') return json({ error:'Only admins can change the shape library.' }, 403);
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b=await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  let L=await read(env);
  const id = b.op==='save' ? b.shape?.id : b.id;
  if(typeof id!=='string' || !/^SH-[A-Z0-9]{1,10}$/.test(id)) return json({ error:'Bad shape id.' }, 400);
  const was=L.find(s=>s.id===id); if(was) await put(env, `shapes/history/${id}/${(was.saved||new Date().toISOString()).replace(/[:.]/g,'-')}.json`, was);
  if(b.op==='save'){
    const s=b.shape; if(typeof s.name!=='string' || !Array.isArray(s.contours) || JSON.stringify(s).length>500000) return json({ error:'Bad shape.' }, 400);
    s.by=me.email; s.saved=new Date().toISOString(); L=[s, ...L.filter(x=>x.id!==id)];
  } else L=L.filter(x=>x.id!==id);
  await put(env, KEY, L);
  return json({ ok:true, shapes:L });
}
