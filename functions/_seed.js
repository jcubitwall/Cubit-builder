/* Cubit Builder — the Cubit catalogue in MongoDB (what used to ship as data/*.json in the repo).

   Each set (walls, layers, pods, decks, models, units, families, brands, stores, projects, submodels, sinks, sinks/<id>,
   fixtures-…) is stored one document per item in the collection `seed`:
       { _id:"<set>:<key>", set, key, ord, doc }
   and seed_sets remembers how to put the set back together for the app:
       list        an array of items (key = the item's id, else its place)
       map         an object of items (key = the property name), e.g. models
       wrap:<f>    { <f>: [items] }, e.g. brands, stores
       one         a single object, e.g. a fixture's meshes
   Every item a write replaces or removes is kept in history ({ coll:"seed:<set>", item:key, … }). */
import { stamp } from './_mongo.js';
export const okSet = s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,60}(\/[a-z0-9][a-z0-9_-]{0,60})?$/.test(s);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export function shapeOf(v){
  if(Array.isArray(v)) return 'list';
  if(isObj(v)){
    const ks = Object.keys(v);
    if(ks.length === 1 && Array.isArray(v[ks[0]])) return `wrap:${ks[0]}`;
    if(ks.length && ks.every(k => isObj(v[k])) && !('parts' in v)) return 'map';
  }
  return 'one';
}
function itemsOf(v, shape){
  const list = a => { const ids = a.map(x => isObj(x) && typeof x.id === 'string' ? x.id : null);
    const unique = ids.every(Boolean) && new Set(ids).size === ids.length;
    return a.map((x, i) => [unique ? ids[i] : String(i).padStart(5,'0'), x]); };
  if(shape === 'list') return list(v);
  if(shape.startsWith('wrap:')) return list(v[shape.slice(5)] || []);
  if(shape === 'map') return Object.entries(v);
  return [['_', v]];
}
export async function readSet(M, set){
  const meta = await M.coll('seed_sets').get(set); if(!meta) return undefined;
  const docs = await M.coll('seed').find({ set }, { sort:{ ord:1 } });
  const S = meta.shape;
  if(S === 'list') return docs.map(d => d.doc);
  if(S.startsWith('wrap:')) return { [S.slice(5)]: docs.map(d => d.doc) };
  if(S === 'map') return Object.fromEntries(docs.map(d => [d.key, d.doc]));
  return docs[0]?.doc ?? null;
}
/* replace a whole set; only the items that changed are rewritten (and their old versions kept) */
export async function writeSet(M, set, value, by){
  const shape = shapeOf(value), items = itemsOf(value, shape), t = new Date().toISOString();
  const cur = await M.coll('seed').find({ set });
  const C = Object.fromEntries(cur.map(d => [d.key, d]));
  const ops = [], hist = [], seen = new Set();
  items.forEach(([key, doc], ord) => {
    seen.add(key); const was = C[key];
    if(was && was.ord === ord && JSON.stringify(was.doc) === JSON.stringify(doc)) return;
    if(was && JSON.stringify(was.doc) !== JSON.stringify(doc)) hist.push(was);
    ops.push({ replaceOne:{ filter:{ _id:`${set}:${key}` }, replacement:{ _id:`${set}:${key}`, set, key, ord, doc }, upsert:true } });
  });
  for(const d of cur) if(!seen.has(d.key)){ hist.push(d); ops.push({ deleteOne:{ filter:{ _id:d._id } } }); }
  const st = stamp(t);
  if(hist.length) await M.coll('history').bulk(hist.map(d => ({ replaceOne:{ filter:{ _id:`seed:${set}:${d.key}:${st}` }, replacement:{ _id:`seed:${set}:${d.key}:${st}`, coll:`seed:${set}`, item:d.key, stamp:st, doc:d.doc }, upsert:true } })));
  for(let i=0; i<ops.length; i+=200) await M.coll('seed').bulk(ops.slice(i, i+200));
  await M.coll('seed_sets').put({ _id:set, shape, by:by||'', at:t, count:items.length });
  return { set, shape, items:items.length, changed:ops.length };
}
