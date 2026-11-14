/* Cubit Builder — lvlholes.js : wire holes drilled BY HAND through the roof LVL rim beside exterior doors (and
   beside a window when the team asks for one), for the outside light's wire.

     · ¾″ bit, straight through the 1⅞″ roof rim LVL, square to the wall, from outside into the ceiling cassette.
     · 5½″ below the roof surface = 5″ down from the top of the LVL.
     · Its centre 2″ out from the brick mold (the brick mold is 1½″ outside the rough opening), left or right.
     · Every exterior door gets one, patio doors too. Its side: the one nearest the pod's wire hatch (rules for the
       ceiling hatches are still to come); until then the side nearest the middle of the pod. The team can switch it.
     · A window gets one only when the team picks a side for it.
   Kept with the home: MODELS[k].elec.lvl = { '<wall key>|<opening key>': 'L' | 'R' | 'off' }.
   Shown on the framing sheet, on each wall's sheet, in the 3D and in the wall's side panel (left / right seen from
   outside). */
import { MODELS } from './data.js';
import { state, save, wkey, pickFor } from './state.js';
import { ROOF_TOP, WALL_BASE } from './config.js';
import { slotsFor, podOffsets } from './layout.js';
import { bodyWall } from './panels.js';
import { okey } from './units.js';
import { onLibSettings } from './libsettings.js';
import { checkpoint } from './history.js';
import { ensureDraft } from './pods.js';
import { saveCustomModels } from './data.js';

const LVLH = { bit:0.75, mold:1.5, out:2, below:5.5, lvl:1.875 };
let Y = ROOF_TOP - LVLH.below - WALL_BASE;
onLibSettings(ls=>{ LVLH.bit=ls('lvl','bit'); LVLH.out=ls('lvl','out'); LVLH.below=ls('lvl','below'); Y=ROOF_TOP-LVLH.below-WALL_BASE; });   // Library → Windows / Exterior doors → Rules     // the hole's centre, in wall coordinates (inches up from the wall's base)
const keyOf = (s, o) => `${wkey(s)}|${okey(o)}`;
const isDoor = o => o.kind==='door' || o.kind==='patio';
const picks = (k=state.model) => MODELS[k]?.elec?.lvl || {};
function setLvlHole(s, o, side){   // side: 'L' | 'R' | 'off' | null (back to the rule)
  checkpoint(); const k=ensureDraft(), m=MODELS[k]; m.elec = m.elec ? JSON.parse(JSON.stringify(m.elec)) : {};
  const L=(m.elec.lvl ||= {}), key=keyOf(s,o);
  if(side==null || (isDoor(o) && side===autoSide(s,o)) || (!isDoor(o) && side==='off')) delete L[key]; else L[key]=side;
  if(m.custom) saveCustomModels(); save(); return k;
}
/* x of the hole's centre (wall x, from the left seen from outside) for a side */
const xFor = (o, side) => side==='L' ? o.x - LVLH.mold - LVLH.out : o.x + o.w + LVLH.mold + LVLH.out;
/* the rule's side for a door: nearest the middle of the pod (until the hatch rules come) */
function autoSide(s, o){
  const off=podOffsets(state.model)[s.pod.i]||{ ox:0, oz:0 }, C=[(s.pod.x+s.pod.x1)/2+off.ox, (s.pod.z+s.pod.z1)/2+off.oz];
  const w=bodyWall(s, pickFor(s)), r=[s.n[1],-s.n[0]], tc=((C[0]-s.p0[0])*r[0]+(C[1]-s.p0[1])*r[1])*12 - (w?.trim?.[0]||0);
  return Math.abs(xFor(o,'L')-tc) <= Math.abs(xFor(o,'R')-tc) ? 'L' : 'R';
}
/* one wall's holes: [{ o, side, x, y, auto, along (from the wall's left end, seen from outside, inches) }] */
function lvlHolesOn(s, k=state.model){
  if(!s || s.type==='int') return [];
  const w=bodyWall(s, pickFor(s)); if(!w) return [];
  const P=picks(k), tl=w.trim?.[0]||0, L=s.len*12;
  return (w.openings||[]).filter(o=>isDoor(o) || o.kind==='window').map(o=>{
    const pick=P[keyOf(s,o)];
    let side = isDoor(o) ? (pick==='L'||pick==='R' ? pick : pick==='off' ? null : autoSide(s,o)) : (pick==='L'||pick==='R' ? pick : null);
    if(!side) return null;
    const x=xFor(o, side), along=x+tl;
    return { o, side, x:+x.toFixed(4), y:+Y.toFixed(4), along:+along.toFixed(4), auto:isDoor(o) && !(pick==='L'||pick==='R'), off:along<LVLH.bit || along>L-LVLH.bit };
  }).filter(Boolean);
}
/* every hole in the home, wall by wall */
const lvlHoles = (k=state.model) => slotsFor(k).filter(s=>s.type==='ext').flatMap(s=>lvlHolesOn(s,k).map(h=>({ ...h, s })));
const holeText = h => `¾″ hole by hand through the roof LVL, ${h.side==='L'?'left':'right'} of the ${h.o.kind==='patio'?'patio door':h.o.kind}: centre ${fmtIn(h.along)} from the wall's left end (seen from outside), 5″ down from the top of the LVL (5½″ below the roof surface)`;
const fmtIn = v => { const w=Math.floor(v+1e-6), f=Math.round((v-w)*16), g=(a,b)=>b?g(b,a%b):a; return f ? (f===16?`${w+1}″`:`${w?w+' ':''}${f/g(f,16)}/${16/g(f,16)}″`) : `${w}″`; };
export { LVLH, lvlHoles, lvlHolesOn, setLvlHole, autoSide, holeText, isDoor as isExitDoor, keyOf as lvlKey, picks as lvlPicks };
