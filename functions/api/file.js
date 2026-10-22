/* GET /api/file?id=...&exp=...&sig=...   the uploaded STEP file, for the GitHub Action that scans it.
   GitHub has no Cloudflare login, so this one path is left open in Cloudflare Access (a "bypass" app
   for cubit-builder.pages.dev/api/file). Instead each link is signed with IMPORT_SECRET and dies after
   an hour, so only the link the site handed to the Action works, and only for that one file. */
import { mac } from '../_sign.js';
export async function onRequestGet({ request, env }){
  const u = new URL(request.url), id = u.searchParams.get('id')||'', exp = +u.searchParams.get('exp')||0, sig = u.searchParams.get('sig')||'';
  if(!env.IMPORT_SECRET || !env.STEPS || !/^\d{14}-[a-z0-9]{1,8}$/.test(id) || exp < Date.now()/1000) return new Response('Not found', { status:404 });
  const want = await mac(env, `${id}.${exp}`);
  let diff = want.length ^ sig.length; for(let i=0;i<want.length;i++) diff |= want.charCodeAt(i) ^ (sig.charCodeAt(i)||0);
  if(diff) return new Response('Not found', { status:404 });
  const obj = await env.STEPS.get(`incoming/${id}.step`);
  if(!obj) return new Response('Not found', { status:404 });
  return new Response(obj.body, { headers:{ 'content-type':'application/octet-stream', 'content-length': String(obj.size), 'cache-control':'no-store' } });
}
