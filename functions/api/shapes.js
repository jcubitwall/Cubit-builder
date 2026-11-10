/* GET  /api/shapes                     shapes drawn in the Shape studio (everyone who can log in)
   POST /api/shapes {op:'save', shape}  editors and admins: add or replace one (the version it replaces is kept)
        {op:'delete', id}
   Kept in MongoDB: collection shapes, earlier versions in history. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, keepVersion } from '../_mongo.js';
import { listOf, putItem, now } from '../_lib.js';
export async function onRequestGet({ request, env }){
  const me=await whoIs(request, env); if(me.role==='none') return json({ error:'Not signed in.' }, 401);
  return json(await listOf(mongo(env), 'shapes'));
}
export async function onRequestPost({ request, env }){
  const me=await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b=await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  const id = b.op==='save' ? b.shape?.id : b.id;
  if(typeof id!=='string' || !/^SH-[A-Z0-9]{1,10}$/.test(id)) return json({ error:'Bad shape id.' }, 400);
  const M=mongo(env);
  if(b.op==='save'){
    const s=b.shape; if(typeof s.name!=='string' || !(Array.isArray(s.contours) || Array.isArray(s.regs)) || JSON.stringify(s).length>500000) return json({ error:'Bad shape.' }, 400);
    s.by=me.email; s.saved=now();
    await keepVersion(M, 'shapes', await putItem(M, 'shapes', s));
  } else { const was=await M.coll('shapes').get(id); if(was){ await keepVersion(M, 'shapes', was); await M.coll('shapes').del(id); } }
  return json({ ok:true, shapes:await listOf(M, 'shapes') });
}
