/* Cubit Builder — unitdrop.js : a window or door dragged from the tray onto a wall (Build).

   Where it lands, in this order:
     1. an opening already in the wall that the unit fits, within 3′ of the drop: the unit goes in it
     2. another wall layout from the library for this wall with an opening it fits near the drop: that layout is
        picked (the neighbour's wall follows, mirrored, between pods) and the unit goes in it
     3. editors: this home's own copy of the wall with a new rough opening at the drop, sized from the unit (RSO),
        its edges kept off the panel joints (an edge within 6″ of a joint goes onto the joint), clear of the wall's
        ends and its other openings; windows at their default sill from the library (else the standard head
        height), doors on the floor
   Anyone else is told which layouts take it, or to ask an editor (Panel builder). */
import { state, pickFor, choose } from './state.js';
import { optionsFor, mirrorId, LIB } from './data.js';
import { slotsFor, partnerOf } from './layout.js';
import { bodyWall, panelSpans } from './panels.js';
import { TYPES, fits, setUnit, okey } from './units.js';
import { rsoOf } from './brands.js';
import { canEdit } from './role.js';

const HEAD = 83.75;        // top of a window's rough opening, as a patio door's (inches off the floor)
const JOINT = 6, END = 4, GAP = 6;
const clone = o => JSON.parse(JSON.stringify(o));
const kindOf = u => TYPES[u.type]?.cat || 'window';
/* the drop: u = the unit, s = the wall slot, at = inches along the wall from its start (bodyWall's frame) */
async function placeUnit(u, s, at){
  const kind=kindOf(u), round=!!TYPES[u.type]?.round;
  const put=(slot, o)=>{ setUnit(slot, o, { u:u.id, hand:'L', swing:'in' }); };
  // 1. an opening here already
  const w=bodyWall(s, pickFor(s)), mid=o=>o.x+o.w/2;
  const here=(w?.openings||[]).filter(o=>o.kind===kind && fits(u,o)).sort((a,b)=>Math.abs(mid(a)-at)-Math.abs(mid(b)-at))[0];
  if(here && Math.abs(mid(here)-at)<=36){ put(s, here); return { ok:true, how:'set', msg:`${u.name} in ${s.label}` }; }
  // 2. a layout from the library
  const best=optionsFor(s.len, s.type||'ext', state.model).map(lib=>{ const bw=bodyWall(s, lib); const o=(bw?.openings||[]).filter(o=>o.kind===kind && fits(u,o)).sort((a,b)=>Math.abs(mid(a)-at)-Math.abs(mid(b)-at))[0];
    return o ? { lib, d:Math.abs(mid(o)-at) } : null; }).filter(Boolean).sort((a,b)=>a.d-b.d)[0];
  if(best && best.d<=48){
    choose(s, best.lib.id); const pt=partnerOf(s, slotsFor(state.model)); if(pt) choose(pt, mirrorId(best.lib.id), { follow:true });
    const bw=bodyWall(s, pickFor(s)), o=(bw.openings||[]).filter(o=>o.kind===kind && fits(u,o)).sort((a,b)=>Math.abs(mid(a)-at)-Math.abs(mid(b)-at))[0];
    if(o) put(s, o);
    return { ok:true, how:'layout', msg:`${s.label} → ${best.lib.id} · ${u.name} in it` };
  }
  // 3. a new opening (editors), in this home's own copy of the wall
  if(!canEdit()) return { ok:false, msg: best ? `No opening near there. Layout ${best.lib.id} has one for it: pick it in the wall's panel.` : `No layout of ${s.label} takes a ${TYPES[u.type]?.label?.toLowerCase()||'unit'} like this. An editor can add the opening (Panel builder).` };
  if(s.type==='int' && !s.part) return { ok:false, msg:'Between pods the openings must match on both walls: add this one in the Panel builder.' };
  const lib=pickFor(s); if(!lib) return { ok:false, msg:'No wall here.' };
  const R=rsoOf(u); const ow=round ? R.w : R.w, oh=round ? R.h : R.h, tl=w.trim?.[0]||0;
  let x=at-ow/2;
  const spans=panelSpans(w), seams=[]; for(let i=0;i+1<spans.length;i++) if(Math.abs(spans[i][1]-spans[i+1][0])<0.01) seams.push(spans[i][1]);
  const snap=seams.flatMap(sm=>[x, x+ow].map(e=>sm-e)).filter(d=>Math.abs(d)>0.01 && Math.abs(d)<JOINT).sort((a,b)=>Math.abs(a)-Math.abs(b))[0];
  if(snap!=null) x+=snap;
  x=Math.max(END, Math.min(w.L-END-ow, x));
  const y = kind==='window' ? (isFinite(u.sill) ? +u.sill : Math.max(12, HEAD-oh)) : 0;
  const clash=(w.openings||[]).find(o=>x < o.x+o.w+GAP && x+ow > o.x-GAP && y < (o.y||0)+o.h && y+oh > (o.y||0));
  if(clash) return { ok:false, msg:`Too close to the ${clash.kind==='window'?'window':clash.kind==='door'?'door':'opening'} there. Drop it in a clear stretch of wall.` };
  if(x<END-0.01 || x+ow>w.L-END+0.01) return { ok:false, msg:'The wall is too short for it.' };
  const nw=clone(lib), key=`${kind}@${Math.round(x+tl)}`;
  nw.openings=[...(nw.openings||[]), { kind, x:+(x+tl).toFixed(4), y:+y.toFixed(4), w:ow, h:oh, key, ...(round?{ shape:'round', d:ow }:{}) }];
  nw.name=`${lib.name||lib.id} · ${u.name} added`; nw.model=state.model; nw.source=`${u.name} dropped in Build ${new Date().toISOString().slice(0,10)}`;
  const { saveWallFor } = await import('./wall-builder.js');
  const r=await saveWallFor(nw, s);
  const bw=bodyWall(s, pickFor(s)), o=(bw.openings||[]).find(q=>okey(q)===key) || (bw.openings||[]).find(q=>q.kind===kind && Math.abs(q.x-x)<1);
  if(o) put(s, o);
  return { ok:true, how:'new', msg:`${u.name} added to ${s.label} · this home now uses wall ${r.id}` };
}
export { placeUnit };
