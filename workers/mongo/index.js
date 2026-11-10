/* Cubit Builder — the MongoDB gateway (a small Worker of its own, "cubit-mongo").

   The site's server code (Pages Functions) can't keep a database connection open between requests, and MongoDB
   can't go through Hyperdrive. So this Worker holds ONE MongoClient inside a Durable Object, which stays alive
   between requests and keeps the connection warm (~35 ms a query instead of ~300 ms for a fresh one).
   The site calls it through a service binding (MONGO → this Worker's MongoGateway entrypoint):
       await env.MONGO.run([{ c:'walls', op:'find', filter:{}, opts:{ sort:{ ord:-1 } } }, …])
   → one result per op, in order. Only plain JSON goes in and out: every _id is a string, every time an ISO string.

   Settings (this Worker → Settings → Variables and secrets):
     MONGODB_URI   secret: the Atlas connection string (mongodb+srv://user:password@cluster…/)
     MONGODB_DB    the database name (default "cubit") */
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { MongoClient } from 'mongodb';

const OPS = new Set(['find','findOne','insertOne','insertMany','replaceOne','updateOne','updateMany','deleteOne','deleteMany','countDocuments','findOneAndUpdate','bulkWrite','createIndex','distinct']);
const COLL = /^[a-z][a-z0-9_]{1,40}$/;

export class MongoHolder extends DurableObject {
  async db(){
    if(!this.client){
      if(!this.env.MONGODB_URI) throw new Error('MONGODB_URI is not set on the cubit-mongo Worker.');
      this.client = new MongoClient(this.env.MONGODB_URI, { maxPoolSize:8, serverSelectionTimeoutMS:8000, connectTimeoutMS:8000, retryWrites:true });
      this.ready = this.client.connect().catch(e=>{ this.client = null; throw e; });
    }
    await this.ready;
    return this.client.db(this.env.MONGODB_DB || 'cubit');
  }
  async run(ops){
    const db = await this.db();
    const out = [];
    for(const o of ops){
      if(!o || !COLL.test(o.c||'') || !OPS.has(o.op)) throw new Error(`Bad database call: ${o?.c}.${o?.op}`);
      const C = db.collection(o.c), f = o.filter || {}, opts = o.opts || {};
      let r;
      switch(o.op){
        case 'find': { let cur = C.find(f, { projection:opts.projection }); if(opts.sort) cur = cur.sort(opts.sort); if(opts.skip) cur = cur.skip(opts.skip); if(opts.limit) cur = cur.limit(opts.limit); r = await cur.toArray(); break; }
        case 'findOne': r = await C.findOne(f, { projection:opts.projection, sort:opts.sort }); break;
        case 'insertOne': r = (await C.insertOne(o.doc)).acknowledged; break;
        case 'insertMany': r = o.docs?.length ? (await C.insertMany(o.docs, { ordered:false })).insertedCount : 0; break;
        case 'replaceOne': { const x = await C.replaceOne(f, o.doc, { upsert:!!opts.upsert }); r = { matched:x.matchedCount, upserted:x.upsertedCount }; break; }
        case 'updateOne': { const x = await C.updateOne(f, o.update, { upsert:!!opts.upsert }); r = { matched:x.matchedCount, modified:x.modifiedCount, upserted:x.upsertedCount }; break; }
        case 'updateMany': { const x = await C.updateMany(f, o.update); r = { matched:x.matchedCount, modified:x.modifiedCount }; break; }
        case 'deleteOne': r = (await C.deleteOne(f)).deletedCount; break;
        case 'deleteMany': r = (await C.deleteMany(f)).deletedCount; break;
        case 'countDocuments': r = await C.countDocuments(f); break;
        case 'distinct': r = await C.distinct(o.key, f); break;
        case 'findOneAndUpdate': r = await C.findOneAndUpdate(f, o.update, { upsert:!!opts.upsert, returnDocument:opts.after===false ? 'before' : 'after', projection:opts.projection }); break;
        case 'bulkWrite': { const x = o.ops2?.length ? await C.bulkWrite(o.ops2, { ordered:false }) : null; r = x ? { inserted:x.insertedCount, upserted:x.upsertedCount, modified:x.modifiedCount, deleted:x.deletedCount } : {}; break; }
        case 'createIndex': r = await C.createIndex(o.keys, opts); break;
      }
      out.push(r ?? null);
    }
    // only plain JSON back (no ObjectIds or Dates cross the binding)
    return JSON.parse(JSON.stringify(out));
  }
}

/* what the site calls: env.MONGO.run(ops) */
export class MongoGateway extends WorkerEntrypoint {
  async run(ops){
    if(!Array.isArray(ops) || !ops.length || ops.length > 500) throw new Error('Bad database call.');
    const stub = this.env.HOLDER.get(this.env.HOLDER.idFromName('main'));
    return stub.run(ops);
  }
}
export default { async fetch(){ return new Response('Cubit Builder database gateway. Nothing to see here.', { status:404 }); } };
