/* GET  /api/seed/<set>        the Cubit catalogue: walls, layers, pods, decks, models, units, families, brands, stores,
                               projects, submodels, sinks, sinks/<id>, fixtures-… (everyone who can log in)
   GET  /api/seed              the sets there are: [{ set, shape, count, by, at }]
   POST /api/seed/<set>        admins: replace a whole set (e.g. after re-running tools/brands/north_air.py):
                               body = the set as the app reads it
   Kept in MongoDB (seed, seed_sets: see _seed.js). The STEP importer writes through /api/file instead. */
import { whoIs, json, atLeast, denied } from '../../_auth.js';
import { mongo, bare } from '../../_mongo.js';
import { okSet, readSet, writeSet } from '../../_seed.js';
const setOf = params => [].concat(params.path || []).join('/');
export async function onRequestGet({ request, env, params }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  const M = mongo(env), set = setOf(params);
  if(!set) return json((await M.coll('seed_sets').find({}, { sort:{ _id:1 } })).map(s => ({ set:s._id, shape:s.shape, count:s.count, by:s.by, at:s.at })));
  if(!okSet(set)) return json({ error:'Bad set.' }, 400);
  const v = await readSet(M, set);
  if(v === undefined) return json({ error:'No such set.' }, 404);
  return new Response(JSON.stringify(v), { headers:{ 'content-type':'application/json', 'cache-control':'no-cache' } });
}
export async function onRequestPost({ request, env, params }){
  const me = await whoIs(request, env); if(!atLeast(me,'admin')) return denied('admin');
  const set = setOf(params); if(!okSet(set)) return json({ error:'Bad set.' }, 400);
  const v = await request.json().catch(()=>undefined);
  if(v === undefined || v === null || typeof v !== 'object') return json({ error:'Send the set as JSON.' }, 400);
  return json({ ok:true, ...(await writeSet(mongo(env), set, v, me.email)) });
}
