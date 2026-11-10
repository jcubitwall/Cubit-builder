/* GET  /api/wallrules           the wall builder's default heights, depths and locks (everyone who can log in)
   POST /api/wallrules {rules}   editors and admins: save them (shared by the whole team, used by every wall built after)
   Kept in MongoDB: settings, _id 'wallrules'. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, bare } from '../_mongo.js';
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  return json(bare(await mongo(env).coll('settings').get('wallrules')) || {});
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null);
  if(!b || typeof b.rules !== 'object' || JSON.stringify(b.rules).length > 20000) return json({ error:'Bad request.' }, 400);
  const { _id, ...rest } = b.rules;
  const s = { ...rest, by:me.email, at:new Date().toISOString() };
  await mongo(env).coll('settings').put({ _id:'wallrules', ...s });
  return json(s);
}
