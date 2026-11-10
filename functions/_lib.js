/* Cubit Builder — the team's library collections in MongoDB: one document per item, _id = its id, `ord` keeps
   the order the app shows them in (newest first, or as added for devices). */
import { bare } from './_mongo.js';
export const now = () => new Date().toISOString();
/* the whole list, in order */
export async function listOf(M, coll, dir=-1){ return (await M.coll(coll).find({}, { sort:{ ord:dir, _id:1 } })).map(bare); }
/* save one item. front: it moves to the top of the list (as a fresh save did before); otherwise it keeps its place.
   → the version it replaced (bare), or null */
export async function putItem(M, coll, item, { front=true }={}){
  const was = await M.coll(coll).get(item.id);
  const ord = (!front && was) ? was.ord : Date.now();
  await M.coll(coll).put({ ...item, _id:item.id, ord });
  return was ? bare(was) : null;
}
