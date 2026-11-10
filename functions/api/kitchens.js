/* GET  /api/kitchens   the saved kitchens (and other cabinet groups) everyone can drop into a home
   POST /api/kitchens   editors and admins: {op:'save', item, overwrite}  ·  {op:'delete', id}
        item = { id, name, note, items:[recipe…] }. Saving over an existing kitchen needs overwrite:true (the app
        asks first); the version it replaces is kept (MongoDB history). Homes that already use a kitchen keep their
        own copy: a saved kitchen only changes what's dropped in from now on. Kept in MongoDB: collection kitchens. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, keepVersion } from '../_mongo.js';
import { listOf, putItem, now } from '../_lib.js';
const okId = id => typeof id === 'string' && /^[a-z0-9-]{1,48}$/.test(id);
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  return json((await listOf(mongo(env), 'kitchens')).filter(k=>!k.deleted));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null);
  if(!b || !['save','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(b).length > 2_000_000) return json({ error:'Too big.' }, 413);
  const M = mongo(env), t = now();
  if(b.op === 'save'){
    const it = b.item; if(!it || !okId(it.id) || !String(it.name||'').trim() || !Array.isArray(it.items) || !it.items.length) return json({ error:'Bad kitchen.' }, 400);
    const cur = await M.coll('kitchens').get(it.id);
    if(cur && !cur.deleted && !b.overwrite) return json({ error:'A kitchen with that id exists. Confirm to save over it.', exists:true }, 409);
    const out = { id:it.id, name:String(it.name).trim().slice(0,80), note:String(it.note||'').slice(0,300), items:it.items.slice(0,200), by:me.email, saved:t, rev:(cur?.rev||0)+1 };
    await keepVersion(M, 'kitchens', await putItem(M, 'kitchens', out, { front:false }));
  } else {
    const was = await M.coll('kitchens').get(b.id); if(!was) return json({ error:'No such kitchen.' }, 404);
    await keepVersion(M, 'kitchens', { ...was, saved:t }, '-deleted'); await M.coll('kitchens').del(b.id);
  }
  return json({ ok:true, kitchens:(await listOf(M, 'kitchens')).filter(k=>!k.deleted) });
}
