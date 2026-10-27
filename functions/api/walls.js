/* GET  /api/walls                    walls made in the wall builder (everyone who can log in)
   POST /api/walls {op:'save', wall}  admins: add or replace one (the version it replaces is kept)
        {op:'delete', id}
   Kept in the R2 bucket (binding STEPS): walls/index.json, earlier versions under walls/history/<id>/. */
import { whoIs, json } from '../_auth.js';
const KEY='walls/index.json';
async function read(env){ const o=await env.STEPS.get(KEY); if(!o) return []; try{ const v=await o.json(); return Array.isArray(v)?v:[]; }catch(e){ return []; } }
const put=(env,k,v)=>env.STEPS.put(k, JSON.stringify(v), { httpMetadata:{ contentType:'application/json' } });
export async function onRequestGet({ request, env }){
  const me=await whoIs(request, env); if(me.role==='none') return json({ error:'Not signed in.' }, 401);
  return json(env.STEPS ? await read(env) : []);
}
export async function onRequestPost({ request, env }){
  const me=await whoIs(request, env); if(me.role!=='admin') return json({ error:'Only admins can change the wall library.' }, 403);
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b=await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  let L=await read(env);
  const id = b.op==='save' ? b.wall?.id : b.id;
  if(typeof id!=='string' || !/^[A-Z]{1,3}\d{2}-[A-Z0-9]{1,8}$/.test(id)) return json({ error:'Bad wall id.' }, 400);
  const was=L.find(w=>w.id===id); if(was) await put(env, `walls/history/${id}/${(was.saved||new Date().toISOString()).replace(/[:.]/g,'-')}.json`, was);
  if(b.op==='save'){
    const w=b.wall; if(![4,8,12,16,20,24].includes(w.len) || !['ext','int'].includes(w.type) || JSON.stringify(w).length>200000) return json({ error:'Bad wall.' }, 400);
    w.by=me.email; w.saved=new Date().toISOString(); L=[w, ...L.filter(x=>x.id!==id)];
  } else L=L.filter(x=>x.id!==id);
  await put(env, KEY, L);
  return json({ ok:true, walls:L });
}
