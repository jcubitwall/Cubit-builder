/* PUT /api/media?name=...   body = a photo (jpg, png, webp, gif) or a PDF, up to 20 MB. Editors and admins.
   Kept in the R2 bucket (binding STEPS) under media/; answers { url } to put on a product.
   GET /api/media?id=...      the file (everyone signed in), cached a long time: a file never changes. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
const TYPES = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif', 'application/pdf':'pdf' };
export async function onRequestPut({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'editor')) return denied('editor');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const type = (request.headers.get('content-type')||'').split(';')[0].trim(), ext = TYPES[type];
  if(!ext) return json({ error:'Photos (JPG, PNG, WebP, GIF) or PDFs only.' }, 400);
  const size = +request.headers.get('content-length') || 0; if(size > 20*1024*1024) return json({ error:'That file is over 20 MB.' }, 413);
  const u = new URL(request.url), name = (u.searchParams.get('name')||'').slice(0,160);
  const id = new Date().toISOString().replace(/[-:T]/g,'').slice(0,14) + '-' + Math.random().toString(36).slice(2,8) + '.' + ext;
  await env.STEPS.put('media/'+id, request.body, { httpMetadata:{ contentType:type }, customMetadata:{ name, by:me.email } });
  return json({ url:`api/media?id=${id}`, id, name, type });
}
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return new Response('Not signed in', { status:401 });
  const id = new URL(request.url).searchParams.get('id')||''; if(!/^\d{14}-[a-z0-9]{1,8}\.(jpg|png|webp|gif|pdf)$/.test(id) || !env.STEPS) return new Response('Not found', { status:404 });
  const o = await env.STEPS.get('media/'+id); if(!o) return new Response('Not found', { status:404 });
  return new Response(o.body, { headers:{ 'content-type': o.httpMetadata?.contentType || 'application/octet-stream', 'cache-control':'private, max-age=31536000, immutable' } });
}
