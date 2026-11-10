/* Cubit Builder — the unstructured database (MongoDB), through the cubit-mongo gateway Worker (workers/mongo).

   What lives here: documents whose shape varies, kept whole.
     projects           each home's design (pods, walls, picks, decks, kitchens …), _id = the project id.
                        Its name, customer, revision and lock are in MariaDB (projects); a home is the two together
     project_versions   every earlier save of a home, whole
     drafts             each person's drafts
     walls, layers, shapes, submodels, units, adopted, kitchens, devices
                        the team's library: one document per item (_id = its id)
     history            every earlier version of a library item: { coll, item, stamp, doc }
     library_edits      renames / deletions / hand-made features laid over the library (one document)
     settings           shared settings: casework, wallrules
     customer_docs      a customer's selections (whatever the home's choices were)
     signed_records     the summary signed and both signatures, for every signing
     seed               the Cubit catalogue that used to ship as data/*.json in the repo: models, pods, decks, walls,
                        layers, units, families, brands, stores, projects, submodels, sinks, fixtures — one document per
                        item: { _id:"<set>:<key>", set, key, ord, doc }; seed_sets says how each set is put back
                        together ({ _id:<set>, shape:'list' | 'map' | 'wrap:<field>' | 'one' })

   Setting (Cloudflare Pages → Settings → Bindings): a service binding named MONGO → Worker cubit-mongo,
   entrypoint MongoGateway. */

export function mongo(env){
  if(!env.MONGO) throw new Error('The document database is not set up (service binding MONGO → cubit-mongo).');
  const run = ops => env.MONGO.run(ops);
  const one = async op => (await run([op]))[0];
  const coll = c => ({
    find: (filter={}, opts={}) => one({ c, op:'find', filter, opts }),
    get: id => one({ c, op:'findOne', filter:{ _id:id } }),
    findOne: (filter={}, opts={}) => one({ c, op:'findOne', filter, opts }),
    put: doc => one({ c, op:'replaceOne', filter:{ _id:doc._id }, doc, opts:{ upsert:true } }),
    insert: doc => one({ c, op:'insertOne', doc }),
    insertMany: docs => one({ c, op:'insertMany', docs }),
    update: (filter, update, opts={}) => one({ c, op:'updateOne', filter, update, opts }),
    swap: (filter, update, opts={}) => one({ c, op:'findOneAndUpdate', filter, update, opts }),
    del: id => one({ c, op:'deleteOne', filter:{ _id:id } }),
    delMany: filter => one({ c, op:'deleteMany', filter }),
    count: (filter={}) => one({ c, op:'countDocuments', filter }),
    bulk: ops2 => one({ c, op:'bulkWrite', ops2 }),
  });
  return { run, coll };
}

/* a time as a sortable stamp, as the R2 keys used to be (2026-11-10T16-03-22-123Z) */
export const stamp = t => String(t||new Date().toISOString()).replace(/[:.]/g,'-');
/* strip the database's own fields off a document before handing it to the app */
export const bare = d => { if(!d) return d; const { _id, ord, owner_key, ...rest } = d; return rest; };

/* keep the version of a library item that's about to be replaced or removed */
export async function keepVersion(M, coll, item, extra=''){
  if(!item) return;
  const st = stamp(item.saved || item.at || new Date().toISOString()) + extra;
  await M.coll('history').put({ _id:`${coll}:${item.id}:${st}`, coll, item:item.id, stamp:st, doc:bare(item) });
}

/* the version of each library item as it was at a moment (for homes locked then): { id: item | null } */
export async function asOf(M, coll, ids, at){
  const out = {}, A = stamp(at);
  const ok = ids.filter(id => /^[A-Z]{1,3}\d{2}-[A-Z0-9]{1,8}$/.test(id)).slice(0,200);
  if(!ok.length) return out;
  const cur = await M.coll(coll).find({ _id:{ $in:ok } });
  for(const id of ok){
    const c = cur.find(x => x._id === id);
    if(c && c.saved && stamp(c.saved) <= A){ out[id] = bare(c); continue; }
    const h = await M.coll('history').find({ coll, item:id, stamp:{ $lte:A } }, { sort:{ stamp:-1 }, limit:1 });
    out[id] = h[0] ? h[0].doc : null;
  }
  return out;
}
