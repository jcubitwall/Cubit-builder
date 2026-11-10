/* GET  /api/projects                 the team's projects (everyone who can log in)
   GET  /api/projects?versions=<id>   earlier saves of one project [{at, by, name, key}]
   GET  /api/projects?deleted=1       deleted projects (editors and up): [{id, name, customer, size, at, by, last}]
                                      last = the key of its last save, for {op:'restore', id, at:last}
   POST /api/projects                 save / rename / lock: salespeople and up; delete / restore / unlock: editors and up
        {op:'save', item, baseRev}   save a project (the save before it is kept as an earlier version).
                                     baseRev = the version (rev) the saver started from. If someone saved since,
                                     nothing is saved: 409 {changed:true, current} so the app can merge the two
                                     and save again (sync.js)
        {op:'rename', id, name}
        {op:'delete', id}            removed from the list; kept with its earlier versions so it can come back
        {op:'restore', id, at}       bring back an earlier version (or a deleted project: at = its last save)
        {op:'lock', id, lock}        signed by the customer and the rep: no more saves until it's unlocked
        {op:'unlock', id, reason, fee}  editors and admins: opens a signed home for changes (logged on the project)
   A project with a customer (item.customer = the customer's id) is that customer's home; without one it's
   Unassigned, waiting for the team to adopt it into Cubit Homes.

   A home is kept in two halves:
     MariaDB  projects         id, name, customer, size, revision, who saved it and when, the lock, deleted
              project_unlocks  every unlock
     MongoDB  projects         the design (everything else in the item), _id = the project id
              project_versions every earlier save, whole: { _id:"<id>:<stamp>", project, stamp, saved, by, name, doc }
   Each change runs in a MariaDB transaction holding the project's row, so two saves of one home never cross. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { withSql, toDT, toISO } from '../_sql.js';
import { mongo, stamp } from '../_mongo.js';
const okId = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
const META = ['id','name','customer','rev','saved','by','locked','unlocks','restoredFrom'];
const now = () => new Date().toISOString();

/* the row + its unlocks + its design → the project as the app knows it */
function whole(r, doc, unlocks){
  const p = { ...(doc||{}) }; delete p._id;
  p.id = r.id; p.name = r.name;
  if(r.customer_id) p.customer = r.customer_id; else delete p.customer;
  p.rev = r.rev; p.saved = toISO(r.saved_at); p.by = r.saved_by || '';
  if(r.restored_from) p.restoredFrom = toISO(r.restored_from);
  p.locked = r.locked_at ? { at:toISO(r.locked_at), by:r.locked_by, customer:r.lock_customer||'', rep:r.lock_rep||'', client:r.lock_client||'' } : null;
  const U = (unlocks||[]).map(u => ({ at:toISO(u.at), by:u.by_email, reason:u.reason, fee:u.fee||'',
    was: u.was_at ? { at:toISO(u.was_at), by:u.was_by, customer:u.was_customer||'', rep:u.was_rep||'', client:u.was_client||'' } : null }));
  if(U.length) p.unlocks = U;
  return p;
}
/* the design half of a project (what goes to MongoDB) */
const designOf = p => { const d = { ...p }; for(const k of META) delete d[k]; return d; };

async function readAll(db, M, ids=null){
  const rows = ids ? (ids.length ? await db.q('SELECT * FROM projects WHERE id IN (?) AND deleted_at IS NULL', [ids]) : [])
                   : await db.q('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY ord DESC, id');
  if(!rows.length) return [];
  const us = await db.q('SELECT * FROM project_unlocks WHERE project_id IN (?) ORDER BY id', [rows.map(r=>r.id)]);
  const docs = await M.coll('projects').find({ _id:{ $in:rows.map(r=>r.id) } });
  const D = Object.fromEntries(docs.map(d => [d._id, d]));
  return rows.map(r => whole(r, D[r.id], us.filter(u => u.project_id === r.id)));
}
async function readOne(db, M, id){ return (await readAll(db, M, [id]))[0] || null; }
/* keep a whole project as an earlier version */
async function keep(M, p){
  if(!p) return;
  const st = stamp(p.saved || now());
  await M.coll('project_versions').put({ _id:`${p.id}:${st}`, project:p.id, stamp:st, saved:p.saved||null, by:p.by||'', name:p.name, doc:p });
}
/* write both halves of a project (q = inside the transaction) */
async function write(q, M, p, ord){
  await M.coll('projects').put({ _id:p.id, ...designOf(p) });
  const L = p.locked || null;
  await q(`INSERT INTO projects (id, name, customer_id, size, rev, saved_at, saved_by, restored_from, locked_at, locked_by, lock_customer, lock_rep, lock_client, deleted_at, deleted_by, last_version, ord)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name), customer_id=VALUES(customer_id), size=VALUES(size), rev=VALUES(rev), saved_at=VALUES(saved_at), saved_by=VALUES(saved_by),
      restored_from=VALUES(restored_from), locked_at=VALUES(locked_at), locked_by=VALUES(locked_by), lock_customer=VALUES(lock_customer), lock_rep=VALUES(lock_rep), lock_client=VALUES(lock_client),
      deleted_at=NULL, deleted_by=NULL, last_version=NULL, ord=IF(projects.deleted_at IS NULL, projects.ord, VALUES(ord))`,
    [p.id, p.name, p.customer||null, String(p.model?.size||'').slice(0,40)||null, p.rev||0, toDT(p.saved), p.by||null, toDT(p.restoredFrom),
     toDT(L?.at), L?.by||null, L?.customer||null, L?.rep||null, L?.client||null, ord ?? Date.now()]);
}

export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env);
  if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  const q = new URL(request.url).searchParams, M = mongo(env);
  return withSql(env, async db => {
    if(q.get('deleted')){
      if(!atLeast(me,'editor')) return json([]);
      const rows = await db.q('SELECT id, name, customer_id, size, deleted_at, deleted_by, last_version FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 300');
      return json(rows.map(r => ({ id:r.id, name:r.name, customer:r.customer_id||null, size:r.size||'', at:toISO(r.deleted_at), by:r.deleted_by, last:r.last_version })));
    }
    const v = q.get('versions');
    if(v){
      if(!okId(v)) return json({ error:'Bad id.' }, 400);
      const L = await M.coll('project_versions').find({ project:v }, { sort:{ stamp:-1 }, limit:40, projection:{ doc:0 } });
      return json(L.map(x => ({ at:x.saved, by:x.by||'', name:x.name, key:x.stamp })));
    }
    return json(await readAll(db, M));
  });
}

export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env);
  if(!atLeast(me,'sales')) return denied('sales');
  const b = await request.json().catch(()=>null);
  if(!b || !['save','rename','delete','restore','lock','unlock'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(['delete','restore','unlock'].includes(b.op) && !atLeast(me,'editor')) return denied('editor');
  if(JSON.stringify(b).length > 4_000_000) return json({ error:'Too big.' }, 413);
  const M = mongo(env);
  const id = b.op === 'save' ? b.item?.id : b.id;
  if(!okId(id)) return json({ error: b.op === 'save' ? 'Bad project.' : 'Bad id.' }, 400);

  return withSql(env, async db => {
    const res = await db.tx(async q => {
      // hold this project's row until the change is done
      const row = (await q('SELECT * FROM projects WHERE id=? FOR UPDATE', [id]))[0] || null;
      const cur = row && !row.deleted_at ? await readOne(db, M, id) : null;
      const t = now();
      if(b.op === 'save'){
        const it = b.item;
        if(typeof it.name !== 'string' || !it.model || !Array.isArray(it.model.pods)) return json({ error:'Bad project.' }, 400);
        // someone saved this project after the saver opened it: hand theirs back to be merged, save nothing
        if(cur && b.baseRev != null && (cur.rev||0) !== b.baseRev) return json({ changed:true, current:cur }, 409);
        if(cur?.locked) return json({ error:'This home is signed and locked. Unlock it first (editors and admins).', locked:cur.locked }, 423);
        it.locked = null; if(cur?.unlocks) it.unlocks = cur.unlocks; else delete it.unlocks;
        if(cur) await keep(M, cur);
        it.by = me.email; it.saved = t; it.name = it.name.trim().slice(0,80) || 'Untitled'; it.rev = (cur?.rev||0) + 1;
        delete it.restoredFrom;
        if(b.merged) it.merged = b.merged; else delete it.merged;
        await write(q, M, it);
        return null;
      }
      if(b.op === 'restore'){
        const key = `${id}:${String(b.at||'').replace(/[^0-9TZ-]/g,'')}`;
        const old = (await M.coll('project_versions').get(key))?.doc;
        if(!old) return json({ error:'That version is gone.' }, 404);
        if(cur) await keep(M, cur);
        const it = { ...old, id, saved:t, by:me.email, restoredFrom:old.saved, rev:((cur ? cur.rev : old.rev)||0)+1, unlocks:cur?.unlocks };
        await write(q, M, it, cur ? undefined : Date.now());
        return null;
      }
      if(!cur) return json({ error:'No such project.' }, 404);
      if(b.op === 'rename'){
        const nm = String(b.name||'').trim().slice(0,80); if(!nm) return json({ error:'A name is needed.' }, 400);
        await q('UPDATE projects SET name=? WHERE id=?', [nm, id]);
      }
      else if(b.op === 'lock'){
        await keep(M, cur); const l = b.lock || {};
        await q('UPDATE projects SET locked_at=?, locked_by=?, lock_customer=?, lock_rep=?, lock_client=? WHERE id=?',
          [toDT(t), me.email, String(l.customer||cur.customer||'').slice(0,40), String(l.rep||'').slice(0,80), String(l.client||'').slice(0,80), id]);
      }
      else if(b.op === 'unlock'){
        const reason = String(b.reason||'').trim().slice(0,300); if(!reason) return json({ error:'Say why it is being unlocked.' }, 400);
        await keep(M, cur); const w = cur.locked;
        await q(`INSERT INTO project_unlocks (project_id, at, by_email, reason, fee, was_at, was_by, was_customer, was_rep, was_client) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [id, toDT(t), me.email, reason, String(b.fee||'').slice(0,40), toDT(w?.at), w?.by||null, w?.customer||null, w?.rep||null, w?.client||null]);
        await q('UPDATE projects SET locked_at=NULL, locked_by=NULL, lock_customer=NULL, lock_rep=NULL, lock_client=NULL WHERE id=?', [id]);
      }
      else {   // delete: off the list, kept with its versions so it can come back
        await keep(M, cur);
        await q('UPDATE projects SET deleted_at=?, deleted_by=?, last_version=? WHERE id=?', [toDT(t), me.email, stamp(cur.saved||t), id]);
      }
      return null;
    });
    if(res) return res;   // a refusal (409, 423, 400 …): nothing was changed
    return json({ ok:true, projects:await readAll(db, M) });
  });
}
