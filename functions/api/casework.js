/* GET  /api/casework              the shop's cabinet settings (plywood thickness, edge band, joinery, hardware)
   POST /api/casework {settings}   admins: save them (shared by the whole team)
   Kept in the R2 bucket (binding STEPS) as casework/settings.json. */
import { whoIs, json } from '../_auth.js';
const KEY = 'casework/settings.json';
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json({});
  const o = await env.STEPS.get(KEY); if(!o) return json({});
  try{ return json(await o.json()); }catch(e){ return json({}); }
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(me.role !== 'admin') return json({ error:'Only admins can change the shop settings.' }, 403);
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(!b || typeof b.settings !== 'object' || JSON.stringify(b.settings).length > 100000) return json({ error:'Bad request.' }, 400);
  const s = { ...b.settings, by:me.email, at:new Date().toISOString() };
  await env.STEPS.put(KEY, JSON.stringify(s), { httpMetadata:{ contentType:'application/json' } });
  return json(s);
}
