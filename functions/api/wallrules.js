/* GET  /api/wallrules           the wall builder's default heights, depths and locks (everyone who can log in)
   POST /api/wallrules {rules}   admins: save them (shared by the whole team, used by every wall built after)
   Kept in the R2 bucket (binding STEPS) as wallrules/rules.json. */
import { whoIs, json } from '../_auth.js';
const KEY = 'wallrules/rules.json';
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json({});
  const o = await env.STEPS.get(KEY); if(!o) return json({});
  try{ return json(await o.json()); }catch(e){ return json({}); }
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(me.role !== 'admin') return json({ error:'Only admins can change the wall rules.' }, 403);
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(!b || typeof b.rules !== 'object' || JSON.stringify(b.rules).length > 20000) return json({ error:'Bad request.' }, 400);
  const s = { ...b.rules, by:me.email, at:new Date().toISOString() };
  await env.STEPS.put(KEY, JSON.stringify(s), { httpMetadata:{ contentType:'application/json' } });
  return json(s);
}
