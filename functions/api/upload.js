/* PUT /api/upload?kind=wall|pod|home&name=...&filename=...   body = the STEP file (raw bytes)
   Admins only. The file is streamed into the R2 bucket (binding STEPS) and the GitHub Action
   "Import STEP" is started with its key; the Action scans it, adds what's new to the libraries
   and commits — Cloudflare then redeploys the site with the new walls / pods / home.

   Settings: GITHUB_TOKEN (fine-grained, this repo, Actions: read & write, Contents: read),
             GITHUB_REPO (e.g. jcubitwall/Cubit-builder); R2 bucket bound as STEPS. */
import { whoIs, json } from '../_auth.js';
const KINDS = ['wall','pod','home'];
export async function onRequestPut({ request, env }){
  const me = await whoIs(request, env);
  if(me.role !== 'admin') return json({ error:'Only admins can upload STEP files.' }, 403);
  if(!env.STEPS || !env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error:'Uploads are not set up yet (R2 bucket STEPS, GITHUB_TOKEN, GITHUB_REPO).' }, 500);
  const u = new URL(request.url);
  const kind = u.searchParams.get('kind'), name = (u.searchParams.get('name')||'').trim().slice(0,120), filename = (u.searchParams.get('filename')||'upload.step').slice(0,160);
  if(!KINDS.includes(kind)) return json({ error:'Pick Wall, Pod or Home.' }, 400);
  if(!name) return json({ error:'Give it a name.' }, 400);
  if(!/\.(step|stp)$/i.test(filename)) return json({ error:'That is not a STEP file (.step / .stp).' }, 400);
  const size = +request.headers.get('content-length') || 0;
  if(size > 200*1024*1024) return json({ error:'That file is over 200 MB.' }, 413);
  const id = new Date().toISOString().replace(/[-:T]/g,'').slice(0,14) + '-' + Math.random().toString(36).slice(2,6);
  const key = `incoming/${id}.step`;
  await env.STEPS.put(key, request.body, { customMetadata:{ kind, name, filename, by: me.email } });
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/import-step.yml/dispatches`, {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${env.GITHUB_TOKEN}`, 'Accept':'application/vnd.github+json', 'User-Agent':'cubit-builder', 'Content-Type':'application/json' },
    body: JSON.stringify({ ref:'main', inputs:{ id, key, kind, name, filename, by: me.email } })
  });
  if(!r.ok) return json({ error:`The file was saved but the scan could not be started (GitHub ${r.status}).`, id }, 502);
  return json({ id, kind, name, status:'queued' });
}
