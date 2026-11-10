/* GET /api/imports → the latest STEP imports, newest first (MariaDB step_imports). Admins only. */
import { whoIs, json } from '../_auth.js';
import { withSql, toISO } from '../_sql.js';
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env);
  if(me.role !== 'admin') return json({ error:'Admins only.' }, 403);
  const rows = await withSql(env, db => db.q('SELECT * FROM step_imports ORDER BY started DESC, id DESC LIMIT 200'));
  return json(rows.map(r => {
    const e = { id:r.id, kind:r.kind, name:r.name, file:r.file||'', by:r.by_email||'', started:toISO(r.started), status:r.status };
    if(r.finished) e.finished = toISO(r.finished);
    if(r.summary != null) e.summary = typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary;
    if(r.error) e.error = r.error;
    return e;
  }));
}
