/* Cubit Builder — sink-window.js : a window centred over the sink below it.

   The window moves in this home's own copy of the wall (the library wall stays as it is): its middle goes over the
   middle of the sink (a docked sink's hole, else the sink base). If that would leave a strip of SIP narrower than 6″
   beside a panel joint, the window's edge goes onto the joint instead (as in the Panel builder) and says so.
   The window keeps its unit and handing. Moving the sink to the window instead: furniture.js centreUnderWindow. */
import { state, pickFor } from './state.js';
import { bodyWall, panelSpans } from './panels.js';
import { sinksOnWall } from './furniture.js';
import { saveWallFor } from './wall-builder.js';

const JOINT_SNAP = 6;
const clone = o => JSON.parse(JSON.stringify(o));

/* the plan for one window: { ok, x (new left edge, as fitted), raw (new x in the library wall), dx, joint, why, name } */
function planWindowOverSink(slot, o){
  const lib=pickFor(slot), w=bodyWall(slot, lib); if(!w || !lib) return { ok:false, why:'No wall here.' };
  const tl=w.trim?.[0]||0, mid=o.x+o.w/2+tl;
  const S=sinksOnWall(slot.id).sort((a,b)=>Math.abs(a.t-mid)-Math.abs(b.t-mid))[0];
  if(!S) return { ok:false, why:'No sink base backed onto this wall.' };
  // only the window nearest that sink is offered (another window in the wall may be the one over it)
  const others=(w.openings||[]).filter(q=>q.kind==='window' && q!==o && Math.abs(q.x-o.x)>0.5);
  if(others.some(q=>Math.abs(q.x+q.w/2+tl-S.t) < Math.abs(mid-S.t))) return { ok:false, why:'Another window is nearer the sink.' };
  let x=S.t-tl-o.w/2, joint=0;
  const spans=panelSpans(w), seams=[]; for(let i=0;i+1<spans.length;i++) if(Math.abs(spans[i][1]-spans[i+1][0])<0.01) seams.push(spans[i][1]);
  const st=seams.flatMap(sm=>[x, x+o.w].map(e=>sm-e)).filter(d=>Math.abs(d)>0.01 && Math.abs(d)<JOINT_SNAP).sort((a,b)=>Math.abs(a)-Math.abs(b))[0];
  if(st!=null){ x+=st; joint=st; }
  if(x<0.5 || x+o.w>w.L-0.5) return { ok:false, why:'Centred over the sink, the window would run past the end of the wall.' };
  return { ok:true, x:+x.toFixed(4), raw:+(x+tl).toFixed(4), dx:+(x-o.x).toFixed(4), joint:+joint.toFixed(4), name:S.name };
}
/* do it: a copy of the wall for this home with the window moved, put on this wall */
async function centreWindowOverSink(slot, o){
  const P=planWindowOverSink(slot, o); if(!P.ok) return P;
  if(Math.abs(P.dx)<0.01) return { ...P, same:true };
  const lib=pickFor(slot), w=bodyWall(slot, lib), tl=w.trim?.[0]||0, key=o.key ?? `${o.kind}@${Math.round(o.x+tl)}`;
  const nw=clone(lib), i=(nw.openings||[]).findIndex(q=>q.kind===o.kind && Math.abs(q.x-(o.x+tl))<0.6 && Math.abs(q.w-o.w)<0.6);
  if(i<0) return { ok:false, why:'Couldn’t find that window in the wall.' };
  nw.openings[i]={ ...nw.openings[i], x:P.raw, key };          // the same key: the window keeps its unit and handing
  nw.name=`${lib.name||lib.id} · window over the sink`; nw.model=state.model; nw.source=`Window centred over the sink ${new Date().toISOString().slice(0,10)}`;
  const r=await saveWallFor(nw, slot);
  return { ...P, id:r.id, shared:r.shared };
}
export { planWindowOverSink, centreWindowOverSink };
