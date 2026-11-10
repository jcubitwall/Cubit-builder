/* GET  /api/customers                       every customer (salespeople and up; users see names and homes only)
   GET  /api/customers?signed=<id>&home=<p>  the signed record of one home (signatures + the summary signed)
   POST /api/customers  salespeople and up:
        {op:'save', item, note?}              add or update a customer (profile, linked homes, selections)
        {op:'sign', id, home, rec}            both signatures + the summary of the home as signed
        {op:'delete', id}                     editors and up: hidden at once, kept two weeks, then gone
        {op:'restore', id}                    editors and up: brought back within the two weeks
        {op:'photo', id, home, data}          a picture of the home (a JPEG data URL, from Build's snapshot), kept for good
   GET  /api/customers?photos=<id>           the customer's pictures: [{ key, at, size }]
   GET  /api/customers?photo=<key>           one picture (salespeople and up)

   Kept in:
     MariaDB  customers (the profile), customer_log (their history), customer_homes (their homes),
              signings (each signing: who, which home, when), files (an index row for each picture)
     MongoDB  customer_docs (their selections), signed_records (the summary signed and both signatures)
     R2       the pictures' bytes (customers/<id>/photos/…jpg) */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { withSql, toDT, toISO } from '../_sql.js';
import { mongo, stamp } from '../_mongo.js';
const KEEP = 14*24*3600*1000;
const okId = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
const str = (v, n=200) => String(v??'').slice(0, n);
const FIELDS = { name:80, company:80, email:120, phone:40, address:200, site:200, notes:2000, status:40 };
const now = () => new Date().toISOString();

/* every customer (not gone for good), whole, newest first */
async function readAll(db, M){
  await db.q('DELETE FROM customers WHERE deleted_at IS NOT NULL AND deleted_at < ?', [toDT(new Date(Date.now()-KEEP).toISOString())]);
  const rows = await db.q('SELECT * FROM customers ORDER BY ord DESC, id');
  if(!rows.length) return [];
  const ids = rows.map(r=>r.id);
  const homes = await db.q('SELECT customer_id, project_id FROM customer_homes WHERE customer_id IN (?) ORDER BY pos', [ids]);
  const logs = await db.q('SELECT customer_id, at, by_email, what FROM customer_log WHERE customer_id IN (?) ORDER BY id', [ids]);
  const signs = await db.q('SELECT customer_id, project_id, at, by_email, rep, client FROM signings WHERE customer_id IN (?) ORDER BY at', [ids]);
  const docs = Object.fromEntries((await M.coll('customer_docs').find({ _id:{ $in:ids } })).map(d=>[d._id, d]));
  return rows.map(r => {
    const c = { id:r.id };
    for(const k of Object.keys(FIELDS)) if(r[k] != null) c[k] = r[k];
    c.homes = homes.filter(h=>h.customer_id===r.id).map(h=>h.project_id);
    if(docs[r.id]?.selections) c.selections = docs[r.id].selections;
    const S = signs.filter(s=>s.customer_id===r.id); if(S.length) c.signed = Object.fromEntries(S.map(s=>[s.project_id, { at:toISO(s.at), by:s.by_email, rep:s.rep||'', client:s.client||'' }]));
    c.log = logs.filter(l=>l.customer_id===r.id).slice(-200).map(l=>({ at:toISO(l.at), by:l.by_email, what:l.what }));
    if(r.created_at) c.created = toISO(r.created_at); if(r.created_by) c.by = r.created_by;
    if(r.deleted_at) c.deleted = { at:toISO(r.deleted_at), by:r.deleted_by };
    return c;
  });
}
const log = (q, id, by, what, at=now()) => q('INSERT INTO customer_log (customer_id, at, by_email, what) VALUES (?,?,?,?)', [id, toDT(at), by, str(what,300)]);

export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  const u = new URL(request.url), sid = u.searchParams.get('signed'), home = u.searchParams.get('home');
  const pList = u.searchParams.get('photos'), pOne = u.searchParams.get('photo');
  if(pList || pOne){ if(!atLeast(me,'sales')) return denied('sales');
    if(pList){ if(!okId(pList)) return json({ error:'Bad id.' }, 400);
      const rows = await withSql(env, db => db.q(`SELECT r2_key, size, created_at FROM files WHERE customer_id=? AND kind='photo' ORDER BY r2_key DESC`, [pList]));
      return json(rows.map(o=>({ key:o.r2_key, size:+o.size, at:toISO(o.created_at) }))); }
    if(!/^customers\/[a-z0-9-]{1,40}\/photos\/[a-z0-9-]{1,80}\.jpg$/.test(pOne||'')) return json({ error:'Bad key.' }, 400);
    const obj = await env.STEPS.get(pOne); if(!obj) return new Response('Not found', { status:404 });
    return new Response(obj.body, { headers:{ 'content-type':'image/jpeg', 'cache-control':'private, max-age=86400' } }); }
  const M = mongo(env);
  if(sid){ if(!atLeast(me,'sales')) return denied('sales'); if(!okId(sid) || !okId(home)) return json({ error:'Bad id.' }, 400);
    const last = await withSql(env, db => db.one('SELECT record_id FROM signings WHERE customer_id=? AND project_id=? AND record_id<>? ORDER BY at DESC, id DESC LIMIT 1', [sid, home, '']));
    if(!last) return json(null);
    const r = await M.coll('signed_records').get(last.record_id); if(!r) return json(null);
    return json(r.rec || null); }
  const L = await withSql(env, db => readAll(db, M));
  // production (users) needs to know whose home it is, not their contact details
  return json(atLeast(me,'sales') ? L : L.filter(c=>!c.deleted).map(c=>({ id:c.id, name:c.name, homes:c.homes||[], signed:c.signed||{} })));
}

export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'sales')) return denied('sales');
  const b = await request.json().catch(()=>null);
  if(!b || !['save','sign','delete','restore','photo'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(b).length > 3_000_000) return json({ error:'Too big.' }, 413);
  if(['delete','restore'].includes(b.op) && !atLeast(me,'editor')) return denied('editor');
  const t = now(), M = mongo(env);
  if(b.op === 'photo'){
    if(!okId(b.id) || (b.home && !okId(b.home))) return json({ error:'Bad id.' }, 400);
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data||'')); if(!m) return json({ error:'A JPEG picture is needed.' }, 400);
    const bin = Uint8Array.from(atob(m[1]), c=>c.charCodeAt(0));
    const key = `customers/${b.id}/photos/${(b.home||'home')}-${t.replace(/[:.TZ]/g,'').toLowerCase()}.jpg`;
    await env.STEPS.put(key, bin, { httpMetadata:{ contentType:'image/jpeg' }, customMetadata:{ by:String(me.email||''), at:t } });
    await withSql(env, db => db.q(`INSERT INTO files (r2_key, kind, customer_id, project_id, content_type, size, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [key, 'photo', b.id, b.home||null, 'image/jpeg', bin.length, me.email, toDT(t)]));
    return json({ ok:true, key });
  }
  return withSql(env, async db => {
    const res = await db.tx(async q => {
      const cid = b.item?.id ?? b.id;
      if(!okId(cid)) return json({ error: b.op==='save' ? 'A customer needs a name.' : 'Bad id.' }, 400);
      const row = (await q('SELECT * FROM customers WHERE id=? FOR UPDATE', [cid]))[0] || null;
      if(b.op === 'save'){
        const it = b.item; if(!str(it.name).trim()) return json({ error:'A customer needs a name.' }, 400);
        const set = {}; for(const [k,n] of Object.entries(FIELDS)) if(k in it) set[k] = str(it[k], n);
        if(!row){
          await q(`INSERT INTO customers (id, name, company, email, phone, address, site, notes, status, created_at, created_by, ord) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [cid, set.name, set.company??null, set.email??null, set.phone??null, set.address??null, set.site??null, set.notes??null, set.status??null, toDT(t), me.email, Date.now()]);
          await log(q, cid, me.email, 'customer added', t);
        } else if(Object.keys(set).length){
          const ks = Object.keys(set); await q(`UPDATE customers SET ${ks.map(k=>`${k}=?`).join(', ')} WHERE id=?`, [...ks.map(k=>set[k]), cid]);
        }
        if(Array.isArray(it.homes)){
          const H = [...new Set(it.homes.filter(okId))].slice(0,40);
          await q('DELETE FROM customer_homes WHERE customer_id=?', [cid]);
          for(let i=0;i<H.length;i++) await q('INSERT INTO customer_homes (customer_id, project_id, pos) VALUES (?,?,?)', [cid, H[i], i]);
        }
        if(it.selections && typeof it.selections==='object')
          await M.coll('customer_docs').put({ _id:cid, selections:JSON.parse(JSON.stringify(it.selections).slice(0, 200000)) });
        // a customer signed while offline brings its signings along (only if the server has none yet)
        if(it.signed && typeof it.signed==='object' && !(await q('SELECT 1 FROM signings WHERE customer_id=? LIMIT 1', [cid])).length)
          for(const [home, s] of Object.entries(it.signed).slice(0,40)) if(okId(home))
            await q('INSERT INTO signings (customer_id, project_id, at, by_email, rep, client) VALUES (?,?,?,?,?,?)', [cid, home, toDT(s?.at)||toDT(t), str(s?.by,254)||me.email, str(s?.rep,80), str(s?.client,80)]);
        if(b.note) await log(q, cid, me.email, b.note, t);
        return null;
      }
      if(!row) return json({ error:'No such customer.' }, 404);
      if(b.op === 'sign'){
        if(!okId(b.home) || !b.rec?.sigRep || !b.rec?.sigClient) return json({ error:'Both signatures are needed.' }, 400);
        const rid = `${cid}:${b.home}:${stamp(t)}`;
        await M.coll('signed_records').put({ _id:rid, cust_id:cid, home_id:b.home, rec:{ ...b.rec, at:t, by:me.email } });
        await q('INSERT INTO signings (customer_id, project_id, at, by_email, rep, client, record_id) VALUES (?,?,?,?,?,?,?)', [cid, b.home, toDT(t), me.email, str(b.rec.rep,80), str(b.rec.client,80), rid]);
        await q(`UPDATE customers SET status='Signed' WHERE id=?`, [cid]);
        await log(q, cid, me.email, `home ${b.home} signed and locked`, t);
      }
      else if(b.op === 'delete'){ await q('UPDATE customers SET deleted_at=?, deleted_by=? WHERE id=?', [toDT(t), me.email, cid]); await log(q, cid, me.email, 'deleted', t); }
      else { await q('UPDATE customers SET deleted_at=NULL, deleted_by=NULL WHERE id=?', [cid]); await log(q, cid, me.email, 'restored', t); }
      return null;
    });
    if(res) return res;
    return json({ ok:true, customers:await readAll(db, M) });
  });
}
