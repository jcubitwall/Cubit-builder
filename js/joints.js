/* Cubit Builder — joints.js : the two walls where pods meet always match.

   Where two pods join, each pod keeps its own 4½″ interior wall (layout.js). A door, window, HRV hole or any other
   opening goes right through both, so the openings of the two walls are always the same, mirrored: one wall leads
   and the other takes its openings (in its own coordinates, so they line up exactly in plan).

   Which wall leads:
     · the one picked (or built in the Panel builder) most recently — MODELS[k].joint.lead[wkey] = time picked;
     · nothing picked yet (stock homes, new pods): both walls' openings are put together, the lower-numbered
       pod's first; an opening on the other side that overlaps one of those is dropped (it's the same opening,
       drawn a little off).
   Everything else stays each wall's own: plugs, switches, data boxes, pockets and recesses on its face, its name.
   A pair can be let go (MODELS[k].joint.free[wkey], set on both walls) when the two really must differ.
   Wall keys (state.js wkey) survive moves and turns, like the electrical ones. */
import { MODELS, saveCustomModels } from './data.js';
import { state, pickFor, wkey, setChooseHook } from './state.js';
import { slotsFor, partnerOf } from './layout.js';
import { bodyWallRaw, setJointHook, mapX, isShaped } from './panels.js';
import { ensureDraft } from './pods.js';
import { checkpoint } from './history.js';
import { FT } from './config.js';

const jointOf = (k=state.model) => MODELS[k]?.joint || null;

/* the home's walls (with their trims), worked out once per layout */
let cache={ sig:null, slots:null };
function slotsNow(){
  const k=state.model, m=MODELS[k]; if(!m) return [];
  const sig=JSON.stringify([k, m.pods, m.picks, state.picks?.[k], m.wallA, state.wallA?.[k]]);
  if(cache.sig!==sig){ cache={ sig, slots:null }; cache.slots=slotsFor(k); }
  return cache.slots;
}
const partnerSlot = slot => { const all=slotsNow(), me=all.find(s=>s.id===slot.id); return me ? { me, q:partnerOf(me, all) } : {}; };

/* this wall and its neighbour, or null */
function pairFor(slot){
  if(!slot || slot.type!=='int' || !slot.pod) return null;
  const { me, q }=partnerSlot(slot); return q ? { me, q } : null;
}
const isFree = (slot, k=state.model) => !!jointOf(k)?.free?.[wkey(slot)];
/* which of the two leads: 'me' | 'q' | null (nothing picked: both put together) */
function leadOf(me, q, k=state.model){
  const L=jointOf(k)?.lead||{}, a=L[wkey(me)]||0, b=L[wkey(q)]||0;
  if(!a && !b) return null;
  return a>=b ? 'me' : 'q';
}

/* an opening of wall A (fitted, x from A's left end seen from outside, after A's trim) in wall B's coordinates */
const along = (s, x) => { const r=[s.n[1],-s.n[0]], t=(x+(s.trim?.[0]||0))/FT; return [s.p0[0]+r[0]*t, s.p0[1]+r[1]*t]; };
const onto = (s, P) => { const r=[s.n[1],-s.n[0]]; return ((P[0]-s.p0[0])*r[0]+(P[1]-s.p0[1])*r[1])*FT-(s.trim?.[0]||0); };
function carry(o, A, B, LB){
  const f = x => +onto(B, along(A, x)).toFixed(4);
  const x0=f(o.x), x1=f(o.x+o.w), lo=Math.min(x0,x1), hi=Math.max(x0,x1);
  const raw=Math.round(lo+(B.trim?.[0]||0));
  const out={ ...(isShaped(o) ? mapX(o, f) : o), x:lo, w:+(hi-lo).toFixed(4), key:`${o.kind}@${raw}`, mirrored:true };
  if(isShaped(o)) return lo+out.w<=0 || lo>=LB ? null : out;
  const c0=Math.max(0,lo), c1=Math.min(LB,hi); return c1-c0>0.5 ? { ...out, x:c0, w:c1-c0 } : null;
}
const overlaps = (a, b) => a.x < b.x+b.w-1 && b.x < a.x+a.w-1 && a.y < b.y+b.h-1 && b.y < a.y+a.h-1;

/* the openings this wall should have: its own, its neighbour's (carried across), or both put together */
function jointOpenings(slot, bw){
  const P=pairFor(slot); if(!P || isFree(P.me)) return null;
  const { me, q }=P, lead=leadOf(me, q);
  const qw=bodyWallRaw(q, pickFor(q)); if(!qw) return null;
  const mine=bw.openings||[], theirs=(qw.openings||[]).map(o=>carry(o, q, me, bw.L)).filter(Boolean);
  if(lead==='me') return mine;
  if(lead==='q') return theirs;
  const first = me.pod.i<=q.pod.i ? mine : theirs, second = first===mine ? theirs : mine;
  return [...first, ...second.filter(o=>!first.some(f=>overlaps(f,o)))].sort((a,b)=>a.x-b.x);
}
setJointHook((slot, bw)=>{
  if(!slot || slot.type!=='int' || !bw) return bw;
  const ops=jointOpenings(slot, bw);
  return ops ? { ...bw, openings:ops } : bw;
});

/* a wall picked or built for a slot leads its joint; the neighbour takes its openings (and its plugs and switches
   go by the rules, since its openings changed) */
setChooseHook((slot, m, { follow }={})=>{
  if(slot.type!=='int' || follow) return;
  const J = m.joint ||= {}; (J.lead ||= {})[wkey(slot)] = Date.now();
  const P=pairFor(slot);
  if(P && !m.elec?.auto) m.elec={ ...(m.elec||{}), walls:{ ...(m.elec?.walls||{}), [wkey(P.q)]:true } };
});

/* ---------------------------------------------------------------- changes from the wall panel */
function edit(fn){
  checkpoint(); const k=ensureDraft(), m=MODELS[k]; if(!m) return;
  fn(m.joint ||= {}); if(m.custom) saveCustomModels();
}
/* this wall leads: its neighbour takes its openings */
function makeLead(slot){ edit(J=>{ (J.lead ||= {})[wkey(slot)]=Date.now(); }); }
/* let the pair differ (or match again) */
function setFree(slot, on){
  const P=pairFor(slot); if(!P) return;
  edit(J=>{ J.free ||= {}; [P.me, P.q].forEach(s=>{ if(on) J.free[wkey(s)]=true; else delete J.free[wkey(s)]; }); });
}
/* for the wall panel: { other, leads:'me'|'q'|null, free } or null */
function jointInfo(slot){
  const P=pairFor(slot); if(!P) return null;
  return { other:P.q, leads:leadOf(P.me, P.q), free:isFree(P.me) };
}
/* do the two walls' openings differ (only possible when let go)? */
function differs(slot){
  const P=pairFor(slot); if(!P) return false;
  const a=bodyWallRaw(P.me, pickFor(P.me)), b=bodyWallRaw(P.q, pickFor(P.q)); if(!a || !b) return false;
  const B=(b.openings||[]).map(o=>carry(o, P.q, P.me, a.L)).filter(Boolean), A=a.openings||[];
  return A.length!==B.length || A.some(o=>!B.some(x=>Math.abs(x.x-o.x)<0.5 && Math.abs(x.w-o.w)<0.5 && Math.abs(x.y-o.y)<0.5 && Math.abs(x.h-o.h)<0.5));
}

export { jointOf, jointInfo, makeLead, setFree, differs };
