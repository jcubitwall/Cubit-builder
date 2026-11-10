/* GET  /api/casework              the shop's cabinet settings (plywood thickness, edge band, joinery, hardware)
   POST /api/casework {settings}   editors and admins: save them (shared by the whole team)
   Kept in MongoDB: settings, _id 'casework'. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, bare } from '../_mongo.js';
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  return json(bare(await mongo(env).coll('settings').get('casework')) || {});
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null);
  if(!b || typeof b.settings !== 'object' || JSON.stringify(b.settings).length > 100000) return json({ error:'Bad request.' }, 400);
  const { _id, ...rest } = b.settings;
  const s = { ...rest, by:me.email, at:new Date().toISOString() };
  await mongo(env).coll('settings').put({ _id:'casework', ...s });
  return json(s);
}
