/* POST /api/migrate {step, cursor?, force?}   admins: move the data out of files into the two databases.
   Run from /migrate.html, which calls every step in order and shows what moved.

   Steps (each one small, so no call runs long; a step with more to do hands back `cursor` to call it again):
     schema     create the MariaDB tables and the MongoDB indexes. force: empty both databases first
     team       R2 catalog/team.json                         → MariaDB team_members
     customers  R2 customers/index.json, signed-*.json, photos → MariaDB customers, customer_log, customer_homes,
                                                               signings, files · MongoDB customer_docs, signed_records
     projects   R2 projects/index.json, deleted.json           → MariaDB projects, project_unlocks · MongoDB projects
     versions   R2 projects/history/**                         → MongoDB project_versions
     drafts     R2 drafts/**                                   → MongoDB drafts
     library    R2 walls, layers, shapes, sub-models, units, adopted, kitchens, devices, library edits, settings
                                                             → MongoDB (one document per item)
     history    R2 <library>/history/**                        → MongoDB history
     prices     R2 prices/book.json                            → MariaDB prices, price_history
     shop       R2 shop/*.json                                 → MariaDB shop_ticks
     seed       the repo's data/*.json (as deployed)           → MongoDB seed, seed_sets
     imports    the repo's data/imports.json, R2 incoming/*.step, data/*.step → MariaDB step_imports, files (+ R2)
     check      counts, file against database, for every step
     cleanup    delete the JSON files in R2 that were moved (photos and STEP files stay: they're bytes, indexed)
   Nothing in R2 is changed until cleanup. Every step can be run again: it rewrites what it moved. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { withSql, ensureSchema, toDT } from '../_sql.js';
import { mongo, stamp } from '../_mongo.js';
import { writeSet } from '../_seed.js';

const SEED = ['walls','layers','pods','decks','models','units','families','brands','stores','projects','submodels','siding','membranes',
  'fixtures-lifepodgo-shower','fixtures-maax-biarritz','fixtures-maax-biarritz-85'];
const SOURCE_STEPS = ['fixtures-maax-biarritz.step','fixtures-maax-biarritz-85.step'];
const LIB = [   // R2 list file → collection, the order key, and where its history is
  { key:'walls/index.json',            coll:'walls',     hist:'walls/history/' },
  { key:'layers/index.json',           coll:'layers',    hist:'layers/history/' },
  { key:'shapes/index.json',           coll:'shapes',    hist:'shapes/history/' },
  { key:'catalog/submodels.json',      coll:'submodels', hist:'catalog/history/' },
  { key:'catalog/units.json',          coll:'units',     hist:'units/history/' },
  { key:'catalog/adopted.json',        coll:'adopted',   hist:'adopted/history/', unescape:true },
  { key:'catalog/kitchens.json',       coll:'kitchens',  hist:'kitchens/history/' },
  { key:'catalog/devices.json',        coll:'devices',   hist:'devices/history/', append:true },
];
const SINGLE = ['catalog/team.json','customers/index.json','projects/index.json','projects/deleted.json','catalog/library-edits.json',
  'casework/settings.json','wallrules/rules.json','prices/book.json', ...LIB.map(l=>l.key)];
const MONGO_COLLS = ['projects','project_versions','drafts','walls','layers','shapes','submodels','units','adopted','kitchens','devices',
  'history','library_edits','settings','customer_docs','signed_records','seed','seed_sets'];
const TABLES = ['team_members','customers','customer_log','customer_homes','projects','project_unlocks','signings','prices','price_history','shop_ticks','step_imports','files'];

const getJ = async (env, key) => { const o = await env.STEPS.get(key); if(!o) return undefined; try{ return await o.json(); }catch(e){ return undefined; } };
const page = (env, prefix, cursor, limit=60) => env.STEPS.list({ prefix, cursor:cursor||undefined, limit, include:['customMetadata'] });
// a file of the deployed site (a missing one comes back as the home page, so anything HTML counts as missing)
const asset = async (env, request, path) => { const r = await env.ASSETS.fetch(new URL(path, request.url)); return r.ok && !/text\/html/.test(r.headers.get('content-type')||'') ? r : null; };

export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'admin')) return denied('admin');
  const b = await request.json().catch(()=>({}));
  const M = mongo(env), step = b.step;
  try{
    return json(await withSql(env, async db => {
      const q = db.q;
      switch(step){

      case 'schema': {
        await ensureSchema(db);
        if(b.force){
          for(const t of TABLES) await q(`DELETE FROM ${t}`);
          for(const c of MONGO_COLLS) await M.coll(c).delMany({});
        }
        await M.run([
          { c:'project_versions', op:'createIndex', keys:{ project:1, stamp:-1 } },
          { c:'history', op:'createIndex', keys:{ coll:1, item:1, stamp:-1 } },
          { c:'seed', op:'createIndex', keys:{ set:1, ord:1 } },
          { c:'drafts', op:'createIndex', keys:{ owner_key:1 } },
          ...['walls','layers','shapes','submodels','units','adopted','kitchens','devices'].map(c => ({ c, op:'createIndex', keys:{ ord:-1 } })),
        ]);
        return { step, tables:TABLES.length, collections:MONGO_COLLS.length, emptied:!!b.force };
      }

      case 'team': {
        const v = await getJ(env, 'catalog/team.json'); const m = v?.members || {}; let n = 0;
        for(const [email, t] of Object.entries(m)){
          await q(`INSERT INTO team_members (email, role, prices, set_by, set_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role), prices=VALUES(prices), set_by=VALUES(set_by), set_at=VALUES(set_at)`,
            [email.toLowerCase(), ['user','sales','editor','admin'].includes(t.role) ? t.role : 'user', t.prices?1:0, t.by||null, toDT(t.at)]); n++; }
        return { step, members:n };
      }

      case 'customers': {
        const L = (await getJ(env, 'customers/index.json')) || [];
        await q('DELETE FROM customer_log'); await q('DELETE FROM customer_homes'); await q('DELETE FROM signings'); await q(`DELETE FROM files WHERE kind='photo'`);
        let ord = Date.now(), recs = 0, photos = 0;
        for(const c of L){
          await q(`REPLACE INTO customers (id, name, company, email, phone, address, site, notes, status, created_at, created_by, deleted_at, deleted_by, ord) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [c.id, String(c.name||'').slice(0,80)||'—', c.company??null, c.email??null, c.phone??null, c.address??null, c.site??null, c.notes??null, c.status??null,
             toDT(c.created), c.by||null, toDT(c.deleted?.at), c.deleted?.by||null, ord--]);
          for(const l of (c.log||[])) await q('INSERT INTO customer_log (customer_id, at, by_email, what) VALUES (?,?,?,?)', [c.id, toDT(l.at)||toDT(c.created)||toDT(new Date().toISOString()), l.by||null, String(l.what||'').slice(0,300)]);
          const H = [...new Set(c.homes||[])]; for(let i=0;i<H.length;i++) await q('INSERT IGNORE INTO customer_homes (customer_id, project_id, pos) VALUES (?,?,?)', [c.id, H[i], i]);
          if(c.selections) await M.coll('customer_docs').put({ _id:c.id, selections:c.selections });
          // every signing kept for this customer, with its record
          const signedHomes = new Set();
          let cur; do{ const r = await page(env, `customers/${c.id}/`, cur, 500); cur = r.truncated ? r.cursor : null;
            for(const o of r.objects){
              const name = o.key.slice(`customers/${c.id}/`.length);
              const s = /^signed-(.+)-(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.json$/.exec(name);
              if(s){ const rec = await getJ(env, o.key); if(!rec) continue; const rid = `${c.id}:${s[1]}:${s[2]}`;
                await M.coll('signed_records').put({ _id:rid, cust_id:c.id, home_id:s[1], rec });
                await q('INSERT INTO signings (customer_id, project_id, at, by_email, rep, client, record_id) VALUES (?,?,?,?,?,?,?)', [c.id, s[1], toDT(rec.at)||toDT(o.uploaded), rec.by||null, String(rec.rep||'').slice(0,80), String(rec.client||'').slice(0,80), rid]);
                signedHomes.add(s[1]); recs++; continue; }
              const p = /^photos\/(.+)-\d{4}-\d{2}-\d{11}\.jpg$/.exec(name);
              if(p || name.startsWith('photos/')){
                await q(`INSERT INTO files (r2_key, kind, customer_id, project_id, content_type, size, created_by, created_at) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE size=VALUES(size)`,
                  [o.key, 'photo', c.id, p && p[1] !== 'home' ? p[1] : null, 'image/jpeg', o.size, o.customMetadata?.by||null, toDT(o.uploaded)]); photos++; }
            } }while(cur);
          // signed on the list but with no record kept
          for(const [home, s] of Object.entries(c.signed||{})) if(!signedHomes.has(home))
            await q('INSERT INTO signings (customer_id, project_id, at, by_email, rep, client) VALUES (?,?,?,?,?,?)', [c.id, home, toDT(s.at)||toDT(new Date().toISOString()), s.by||null, String(s.rep||'').slice(0,80), String(s.client||'').slice(0,80)]);
        }
        return { step, customers:L.length, signedRecords:recs, photos };
      }

      case 'projects': {
        const L = (await getJ(env, 'projects/index.json')) || [], D = (await getJ(env, 'projects/deleted.json')) || [];
        await q('DELETE FROM project_unlocks');
        const META = ['id','name','customer','rev','saved','by','locked','unlocks','restoredFrom'];
        let ord = Date.now();
        const put = async (p, del) => {
          const d = { ...p }; for(const k of META) delete d[k];
          if(!del || !(await M.coll('projects').get(p.id))) await M.coll('projects').put({ _id:p.id, ...d });
          const L_ = del ? null : p.locked;
          await q(`REPLACE INTO projects (id, name, customer_id, size, rev, saved_at, saved_by, restored_from, locked_at, locked_by, lock_customer, lock_rep, lock_client, deleted_at, deleted_by, last_version, ord) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [p.id, String(p.name||'Untitled').slice(0,80), p.customer||null, String(p.model?.size||p.size||'').slice(0,40)||null, p.rev||0, toDT(p.saved), p.by||null, toDT(p.restoredFrom),
             toDT(L_?.at), L_?.by||null, L_?.customer||null, L_?.rep||null, L_?.client||null, del ? toDT(del.at) : null, del ? del.by||null : null, del ? del.last||null : null, ord--]);
          if(!del) for(const u of (p.unlocks||[])) await q(`INSERT INTO project_unlocks (project_id, at, by_email, reason, fee, was_at, was_by, was_customer, was_rep, was_client) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [p.id, toDT(u.at), u.by||null, String(u.reason||'—').slice(0,300), String(u.fee||'').slice(0,40), toDT(u.was?.at), u.was?.by||null, u.was?.customer||null, u.was?.rep||null, u.was?.client||null]);
        };
        for(const p of L) await put(p);
        let dels = 0;
        for(const d of D){ if(L.some(p=>p.id===d.id)) continue;
          // the design of a deleted project is its last save, in its history
          const last = await getJ(env, `projects/history/${d.id}/${d.last}.json`) || { id:d.id, name:d.name, customer:d.customer, model:{ pods:[], size:d.size } };
          await put({ ...last, id:d.id, name:d.name||last.name }, d); dels++; }
        return { step, projects:L.length, deleted:dels };
      }

      case 'versions': case 'drafts': case 'history': {
        const prefixes = step === 'versions' ? ['projects/history/'] : step === 'drafts' ? ['drafts/'] : LIB.map(l=>l.hist);
        // cursor = "<prefix index>|<R2 cursor>"
        let [pi, rc] = String(b.cursor||'0|').split('|'); pi = +pi||0;
        const prefix = prefixes[pi]; if(!prefix) return { step, done:true };
        const r = await page(env, prefix, rc, 40); let n = 0;
        for(const o of r.objects){
          const v = await getJ(env, o.key); if(v === undefined) continue;
          const rest = o.key.slice(prefix.length).replace(/\.json$/,'');
          if(step === 'versions'){ const [id, st] = rest.split('/');
            await M.coll('project_versions').put({ _id:`${id}:${st}`, project:id, stamp:st, saved:v.saved||null, by:v.by||'', name:v.name||'', doc:v }); }
          else if(step === 'drafts'){ const [folder] = rest.split('/'); if(!v.key) continue; const owner = String(v.owner||folder).toLowerCase();
            await M.coll('drafts').put({ ...v, _id:`${owner}/${v.key}`, owner_key:owner }); }
          else { const l = LIB[pi], i = rest.lastIndexOf('/'); let item = rest.slice(0, i); const st = rest.slice(i+1);
            if(l.unescape) item = item.replace(/_/g, ':');
            await M.coll('history').put({ _id:`${l.coll}:${item}:${st}`, coll:l.coll, item, stamp:st, doc:v }); }
          n++;
        }
        const next = r.truncated ? `${pi}|${r.cursor}` : (prefixes[pi+1] ? `${pi+1}|` : null);
        return { step, moved:n, prefix, cursor:next, done:!next };
      }

      case 'library': {
        const out = {};
        for(const l of LIB){
          const L = (await getJ(env, l.key)) || []; let ord = l.append ? 1 : Date.now(); const ops = [];
          for(const it of L){ if(!it?.id) continue; ops.push({ replaceOne:{ filter:{ _id:it.id }, replacement:{ ...it, _id:it.id, ord: l.append ? ord++ : ord-- }, upsert:true } }); }
          for(let i=0;i<ops.length;i+=100) await M.coll(l.coll).bulk(ops.slice(i,i+100));
          out[l.coll] = ops.length;
        }
        const ed = await getJ(env, 'catalog/library-edits.json');
        if(ed) await M.coll('library_edits').put({ _id:'edits', names:ed.names||{}, gone:ed.gone||{}, hand:ed.hand||{}, fams:ed.fams||[], rev:1 });
        for(const [id, key] of [['casework','casework/settings.json'], ['wallrules','wallrules/rules.json']]){ const v = await getJ(env, key); if(v) await M.coll('settings').put({ ...v, _id:id }); out[id] = v ? 1 : 0; }
        out.libraryEdits = ed ? 1 : 0;
        return { step, ...out };
      }

      case 'prices': {
        const v = (await getJ(env, 'prices/book.json')) || { items:{} };
        await q('DELETE FROM price_history'); let n = 0;
        for(const [k, p] of Object.entries(v.items||{})){
          await q(`REPLACE INTO prices (product_key, cost, unit, name, set_by, set_at) VALUES (?,?,?,?,?,?)`, [k.slice(0,200), p.cost, p.unit||null, p.name||null, p.by||null, toDT(p.at)]);
          for(const h of [...(p.prev||[])].reverse()) await q('INSERT INTO price_history (product_key, cost, set_by, set_at) VALUES (?,?,?,?)', [k.slice(0,200), h.cost, h.by||null, toDT(h.at)]);
          n++; }
        return { step, prices:n };
      }

      case 'shop': {
        let cur, n = 0, homes = 0;
        do{ const r = await page(env, 'shop/', cur, 200); cur = r.truncated ? r.cursor : null;
          for(const o of r.objects){ const home = o.key.slice(5).replace(/\.json$/,''); const v = await getJ(env, o.key) || {}; homes++;
            for(const [k, t] of Object.entries(v)){ await q('REPLACE INTO shop_ticks (home, line_key, by_email, at) VALUES (?,?,?,?)', [home.slice(0,80), k.slice(0,200), t?.by||null, toDT(t?.at)||toDT(new Date().toISOString())]); n++; } } }while(cur);
        return { step, homes, ticks:n };
      }

      case 'seed': {   // one set per call (Cloudflare caps the calls one request may make); cursor = the next set's place
        const ALL = [...SEED, 'sinks'], i = Math.max(0, parseInt(b.cursor||'0',10)||0), s = ALL[i];
        const next = i+1 < ALL.length ? String(i+1) : null;
        if(s !== 'sinks'){ const r = await asset(env, request, `/data/${s}.json`);
          const items = r ? (await writeSet(M, s, await r.json(), `moved from the repo by ${me.email}`)).items : 'not in the repo';
          return { step, set:s, items, cursor:next }; }
        // sinks uploaded as STEP files: data/sinks.json and each sink's meshes (none yet: an empty list, so the app's request finds it)
        const sk = await asset(env, request, '/data/sinks.json'); let n = 0;
        if(sk){ const L = await sk.json(); n = L.length;
          for(const x of L){ const f = x.file && await asset(env, request, '/'+x.file); if(f){ await writeSet(M, `sinks/${x.id}`, await f.json(), me.email); x.file = `api/seed/sinks/${x.id}`; } }
          await writeSet(M, 'sinks', L, me.email); }
        else await writeSet(M, 'sinks', [], me.email);
        return { step, set:'sinks', items:n, cursor:next };
      }

      case 'imports': {
        const r = await asset(env, request, '/data/imports.json'); const L = r ? await r.json() : []; let n = 0;
        for(const e of L){ await q(`REPLACE INTO step_imports (id, kind, name, file, by_email, started, finished, status, summary, error) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [e.id, e.kind||null, e.name||null, e.file||null, e.by||null, toDT(e.started), toDT(e.finished), e.status||null, e.summary ? JSON.stringify(e.summary) : null, e.error||null]); n++; }
        let cur, steps = 0;
        do{ const p = await page(env, 'incoming/', cur, 500); cur = p.truncated ? p.cursor : null;
          for(const o of p.objects){ const m = o.customMetadata||{};
            await q(`INSERT INTO files (r2_key, kind, name, filename, content_type, size, created_by, created_at) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE size=VALUES(size)`,
              [o.key, 'step_upload', m.name||null, m.filename||null, 'application/step', o.size, m.by||null, toDT(o.uploaded)]); steps++; } }while(cur);
        // the fixtures' source STEP files that sat in the repo: their bytes go to R2, indexed
        let src = 0;
        for(const f of SOURCE_STEPS){ const a = await asset(env, request, `/data/${f}`); if(!a) continue; const bytes = await a.arrayBuffer(); const key = `source/${f}`;
          await env.STEPS.put(key, bytes, { httpMetadata:{ contentType:'application/step' } });
          await q(`INSERT INTO files (r2_key, kind, name, filename, content_type, size, created_by, created_at) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE size=VALUES(size)`,
            [key, 'source_step', f.replace(/\.step$/,''), f, 'application/step', bytes.byteLength, me.email, toDT(new Date().toISOString())]); src++; }
        return { step, imports:n, uploads:steps, sourceSteps:src };
      }

      case 'check': {
        const n = async sql_ => +(await db.one(sql_)).n;
        const count = async prefix => { let c = 0, cur; do{ const r = await page(env, prefix, cur, 1000); cur = r.truncated ? r.cursor : null; c += r.objects.length; }while(cur); return c; };
        const len = async key => { const v = await getJ(env, key); return Array.isArray(v) ? v.length : v ? Object.keys(v.members || v.items || v).length : 0; };
        const part = b.cursor === '1' ? 1 : 0;   // two halves (the cap on calls per request)
        const rows = part === 0 ? [
          ['team', await len('catalog/team.json'), await n('SELECT COUNT(*) n FROM team_members')],
          ['customers', await len('customers/index.json'), await n('SELECT COUNT(*) n FROM customers')],
          ['projects (on the list)', await len('projects/index.json'), await n('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NULL')],
          ['project versions', await count('projects/history/'), await M.coll('project_versions').count()],
          ['drafts', await count('drafts/'), await M.coll('drafts').count()],
          ...await Promise.all(LIB.map(async l => [l.coll, await len(l.key), await M.coll(l.coll).count()])),
        ] : [
          ['library history', (await Promise.all(LIB.map(l => count(l.hist)))).reduce((a,b)=>a+b, 0), await M.coll('history').count({ coll:{ $in:LIB.map(l=>l.coll) } })],
          ['prices', await len('prices/book.json'), await n('SELECT COUNT(*) n FROM prices')],
          ['shop list ticks', await (async () => { let c = 0, cur; do{ const r = await page(env, 'shop/', cur, 200); cur = r.truncated ? r.cursor : null;
            for(const o of r.objects) c += Object.keys(await getJ(env, o.key) || {}).length; }while(cur); return c; })(), await n('SELECT COUNT(*) n FROM shop_ticks')],
          ['photos', null, await n(`SELECT COUNT(*) n FROM files WHERE kind='photo'`)],
          ['catalogue sets (repo)', SEED.length, await M.coll('seed_sets').count()],
        ];
        return { step, rows:rows.map(([what, files, db_]) => ({ what, files, db:db_, ok: files == null || db_ >= files })), cursor: part === 0 ? '1' : null };
      }

      case 'cleanup': {
        if(!b.confirm) return { step, error:'Say confirm:true: this deletes the JSON files in R2 that were moved.' };
        let gone = 0;
        for(const k of SINGLE){ const o = await env.STEPS.head(k); if(o){ await env.STEPS.delete(k); gone++; } }
        for(const prefix of ['projects/history/','drafts/','shop/', ...LIB.map(l=>l.hist)]){
          let cur; do{ const r = await page(env, prefix, cur, 500); cur = r.truncated ? r.cursor : null;
            const keys = r.objects.map(o=>o.key).filter(k=>k.endsWith('.json')); if(keys.length){ await env.STEPS.delete(keys); gone += keys.length; } }while(cur); }
        // the signed records (now in MongoDB); the photos stay
        let cur; do{ const r = await page(env, 'customers/', cur, 500); cur = r.truncated ? r.cursor : null;
          const keys = r.objects.map(o=>o.key).filter(k=>/\/signed-.+\.json$/.test(k)); if(keys.length){ await env.STEPS.delete(keys); gone += keys.length; } }while(cur);
        return { step, deleted:gone };
      }

      default: return { error:'Unknown step.' };
      }
    }));
  }catch(e){ return json({ step, error:String(e.message||e) }, 500); }
}
