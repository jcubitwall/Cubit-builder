/* GET /api/imports → the latest STEP imports (data/imports.json straight from GitHub, so it is current
   before the site has redeployed). Admins only. */
import { whoIs, json } from '../_auth.js';
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env);
  if(me.role !== 'admin') return json({ error:'Admins only.' }, 403);
  if(!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json([]);
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/imports.json?ref=main`, {
    headers:{ 'Authorization':`Bearer ${env.GITHUB_TOKEN}`, 'Accept':'application/vnd.github.raw+json', 'User-Agent':'cubit-builder' }
  });
  if(r.status===404) return json([]);
  if(!r.ok) return json({ error:`GitHub ${r.status}` }, 502);
  return new Response(await r.text(), { headers:{ 'content-type':'application/json', 'cache-control':'no-store' } });
}
