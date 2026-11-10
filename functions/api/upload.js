/* PUT /api/upload?kind=wall|pod|home&name=...&filename=...   body = the STEP file (raw bytes)
   Admins only. The file is streamed into the R2 bucket (binding STEPS), indexed in MariaDB (files, and a
   'queued' line in step_imports), and the GitHub Action "Import STEP" is started with a one-hour signed link;
   the Action fetches the file and the library through it, scans the file, and sends back what's new (api/file.js),
   which is written straight into the catalogue: no commit, no redeploy.

   Settings: GITHUB_TOKEN (fine-grained, this repo, Actions: read & write, Contents: read),
             GITHUB_REPO (e.g. jcubitwall/Cubit-builder); R2 bucket bound as STEPS;
             IMPORT_SECRET (any long random string: signs the one-hour download link, see api/file.js). */
import { whoIs, json } from '../_auth.js';
import { signLink } from '../_sign.js';
import { withSql, toDT } from '../_sql.js';
const KINDS = ['wall','pod','home','sink-top','sink-bottom'], UNIT = /^unit-(picture|casement|awning|single|slider|entry|patio)-[LR]-(in|out)$/;
export async function onRequestPut({ request, env }){
  const me = await whoIs(request, env);
  if(me.role !== 'admin') return json({ error:'Only admins can upload STEP files.' }, 403);
  if(!env.STEPS || !env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.IMPORT_SECRET) return json({ error:'Uploads are not set up yet (R2 bucket STEPS, IMPORT_SECRET, GITHUB_TOKEN, GITHUB_REPO).' }, 500);
  const u = new URL(request.url);
  const kind = u.searchParams.get('kind'), name = (u.searchParams.get('name')||'').trim().slice(0,120), filename = (u.searchParams.get('filename')||'upload.step').slice(0,160);
  if(!KINDS.includes(kind) && !UNIT.test(kind||'')) return json({ error:'Pick Wall, Pod, Home, Window / door or Sink.' }, 400);
  if(!name) return json({ error:'Give it a name.' }, 400);
  if(!/\.(step|stp)$/i.test(filename)) return json({ error:'That is not a STEP file (.step / .stp).' }, 400);
  const size = +request.headers.get('content-length') || 0;
  if(size > 95*1024*1024) return json({ error:'That file is over 95 MB (the upload limit). Export it without hidden bodies, or as a pod or wall.' }, 413);
  const id = new Date().toISOString().replace(/[-:T]/g,'').slice(0,14) + '-' + Math.random().toString(36).slice(2,6);
  const key = `incoming/${id}.step`;
  await env.STEPS.put(key, request.body, { customMetadata:{ kind, name, filename, by: me.email } });
  const t = toDT(new Date().toISOString());
  await withSql(env, async db => {
    await db.q(`INSERT INTO files (r2_key, kind, name, filename, content_type, size, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)`, [key, 'step_upload', name, filename, 'application/step', size||null, me.email, t]);
    await db.q(`INSERT INTO step_imports (id, kind, name, file, by_email, started, status) VALUES (?,?,?,?,?,?,?)`, [id, kind, name, filename, me.email, t, 'queued']);
  });
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/import-step.yml/dispatches`, {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${env.GITHUB_TOKEN}`, 'Accept':'application/vnd.github+json', 'User-Agent':'cubit-builder', 'Content-Type':'application/json' },
    // the Action fetches the file through a one-hour download link, so GitHub needs no Cloudflare keys
    body: JSON.stringify({ ref:'main', inputs:{ id, url: await signLink(env, u.origin, id), kind, name, filename, by: me.email } })
  });
  if(!r.ok) return json({ error:`The file was saved but the scan could not be started (GitHub ${r.status}).`, id }, 502);
  return json({ id, kind, name, status:'queued' });
}
