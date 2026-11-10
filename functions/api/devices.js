/* GET  /api/devices   switch, plug and data devices the team added to the Library (everyone who can log in)
   POST /api/devices   editors and admins: {op:'save', item}
        item = { id, kind:'sw'|'rc'|'dt', name, way?, amp?, n?, feats?, note? }. The built-in ones are in js/devices.js;
        renames and deletions of any device go through the library edits (kind 'devices'). Every saved version is
        kept (MongoDB history). Kept in MongoDB: collection devices, in the order they were added. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, keepVersion } from '../_mongo.js';
import { listOf, putItem, now } from '../_lib.js';
const okId = id => typeof id === 'string' && /^[a-z0-9-]{3,48}$/i.test(id);
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  return json(await listOf(mongo(env), 'devices', 1));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null);
  if(!b || b.op!=='save') return json({ error:'Bad request.' }, 400);
  const it=b.item; if(!it || !okId(it.id) || !['sw','rc','dt'].includes(it.kind) || !String(it.name||'').trim()) return json({ error:'Bad device.' }, 400);
  const out=JSON.parse(JSON.stringify({ id:it.id, kind:it.kind, name:String(it.name).trim().slice(0,80), way:[1,3,4].includes(+it.way)?+it.way:undefined, amp:+it.amp||undefined, n:[1,2,3].includes(+it.n)?+it.n:undefined,
    look:String(it.look||'').slice(0,20)||undefined, feats:Array.isArray(it.feats)?it.feats.slice(0,12).map(f=>String(f).slice(0,20)):[], note:String(it.note||'').slice(0,300), custom:true, by:me.email, saved:now() }));
  const M=mongo(env);
  await keepVersion(M, 'devices', await putItem(M, 'devices', out, { front:false }));
  return json({ ok:true, devices:await listOf(M, 'devices', 1) });
}
