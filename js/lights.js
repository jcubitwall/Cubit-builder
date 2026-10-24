/* Cubit Builder — lights.js : pot lights placed by rule, cut into the interior ceiling.

   The light is Heinrich's (Preston Cudmore STEP): a 4″ round pocket from the room side, 5.388″ deep (about 1″ of
   ceiling left), with a ¾″ (0.78″) wire hole through the rest, on the same centre.

   The rules (standard pot-light layout):
     1. Rooms: pods joined through an opening 48″ or wider are one room. A door or a plain wall keeps them apart.
     2. Rows run the long way of the pods, evenly spaced across the whole room with half a spacing to its outside walls.
        In side-by-side pods the gap between rows is the same everywhere, also between the two rows either side of a
        joint (both walls and the ¾″ space are measured in), and no row lands in the walls.
     3. Along the rows the lights are evenly spaced over the whole room (so the rows of pods side by side line up),
        no more than the target spacing apart (42″, Heinrich's), with half a spacing at each end.
     4. Cabinets / wardrobes / a fridge on a wall: the row nearest that wall moves out to 6″ in front of the deepest
        unit (the whole row moves, so it stays straight); rows between re-space evenly. On an end wall the end lights
        move out the same way and the rest of the row re-spaces.
     5. A light never sits on a panel joint (spline): within 4″ of one it slides clear along its row. It never cuts
        into another hole drawn in the ceiling (hatch, chase…): it slides up to 12″ along its row, else it's left out.
   Ceilings are uploaded with their wire hatches and heat-pump head openings (kept exactly as drawn); the lights are
   added here. With lights placed by rule, round 4″ pockets drawn in the ceiling (and their wire holes) are replaced. */
import { MODELS } from './data.js';
import { wallDepths } from './furniture.js';
import { state, save, pickFor } from './state.js';
import { slotsFor, podList, layerSlotsFor } from './layout.js';
import { FT, PW } from './config.js';

const LIGHT = { d:4, depth:5.388, wire:0.78 };
const BUMP = 6, OPEN_MIN = 48, SEAM_CLEAR = 4, END_MIN = 10, ROW_MIN = 8, HOLE_CLEAR = 3;   // clear of hatches, heat-pump heads, chases
const cfgOf = k => ({ auto:true, spacing:42, ...(state.lights?.[k]||{}) });
function setLights(k, ch){ ((state.lights ||= {})[k] = {...cfgOf(k), ...ch}); save(); }
const cabinetsOf = k => state.cabinets?.[k] || {};
function setCabinet(k, slotId, depth, kind){ const c=((state.cabinets ||= {})[k] ||= {}); if(depth>0) c[slotId]={depth:+depth, kind:kind||'Custom'}; else delete c[slotId]; save(); }
const cabDepth = v => typeof v==='number' ? v : (v?.depth||0);

/* a pod's ceiling frame (inches): x along the pod 0..len, z across 0..96; to and from the plan (feet) */
function frame(ls){
  const th=-(ls.rot||0)*Math.PI/180, L0=ls.len, off={0:[0,0],90:[8,0],180:[L0,8],270:[0,L0]}[ls.rot||0], c=Math.cos(th), s=Math.sin(th);
  const toW=(x,z)=>{ const xf=x/FT, zf=z/FT; return [ls.x+off[0]+xf*c+zf*s, ls.z+off[1]-xf*s+zf*c]; };
  return { toW };
}
/* which pod side (S/E/N/W, plan) each edge of the ceiling frame lies on */
function edgeSides(ls){
  const {toW}=frame(ls), L=ls.len*FT, e=0.05;
  const side=([wx,wz])=> Math.abs(wz-ls.z)<e ? 'S' : Math.abs(wz-(ls.z+ls.d))<e ? 'N' : Math.abs(wx-ls.x)<e ? 'W' : 'E';
  return { z0:side(toW(L/2,0)), z1:side(toW(L/2,96)), x0:side(toW(0,48)), x1:side(toW(L,48)) };
}
function sideInfo(k, pod, side, slots){
  const mine=slots.filter(s=>s.pod.i===pod.i && s.side===side);
  const cab=cabinetsOf(k);
  const t=Math.max(0, ...mine.map(s=>pickFor(s)?.t || (s.type==='int'?4.5:6.5)));
  const placed=wallDepths(k);   // cabinets placed against these walls count too
  const depth=Math.max(0, ...mine.map(s=>Math.max(cabDepth(cab[s.id]), placed[s.id]||0)));
  const joins=mine.filter(s=>s.type==='int' && s.other && (pickFor(s)?.openings||[]).some(o=>o.w>=OPEN_MIN && o.kind!=='door')).map(s=>s.other);
  return { t: t||6.5, depth, joins };
}
/* even positions over [a,b]: half a spacing at a free end, a fixed light at an end held by a cabinet */
/* n lights over [a,b]: half a spacing at a free end, a light right at an end held by a cabinet; also gives the spacing */
function spreadN(a, b, n, fixA, fixB){
  const len=b-a; if(len<=0 || n<1) return {P:[], s:0};
  if(fixA && fixB){ if(n<2) return {P:[(a+b)/2], s:len}; const s=len/(n-1); return {P:[...Array(n)].map((_,i)=>a+s*i), s}; }
  if(fixA || fixB){ const s=len/(n-0.5), P=[...Array(n)].map((_,i)=>a+s*i); return {P: fixA ? P : P.map(p=>a+b-p).reverse(), s}; }
  const s=len/n; return {P:[...Array(n)].map((_,i)=>a+s*(i+0.5)), s};
}
/* the count closest to the target spacing that keeps every light off the panel joints (hits = lights on a joint) */
function spread(a, b, S, fixA, fixB, hits){
  const len=b-a; if(len<=0) return [];
  const n0=Math.max(1, Math.round(len/S)), C=[];
  for(let n=Math.max(1,n0-1); n<=n0+2; n++){ const r=spreadN(a,b,n,fixA,fixB); if(r.s>0 && r.s<=S*1.15) C.push({...r, h:hits?hits(r.P):0}); }
  if(!C.length) return spreadN(a,b,n0,fixA,fixB).P;
  C.sort((x,y)=>x.h-y.h || Math.abs(x.s-S)-Math.abs(y.s-S));
  return C[0].P;
}
/* light centres for every pod: { podIndex: [{x,z}] } in that pod's ceiling frame (inches) */
function lightPlan(k=state.model){
  const cfg=cfgOf(k), S=Math.max(24, +cfg.spacing||42);
  const slots=slotsFor(k), pods=podList(k), LS=layerSlotsFor(k).filter(l=>l.kind==='ceiling-int');
  const info = pods.map(p=>{ const ls=LS.find(l=>l.pod.i===p.i); const E=edgeSides(ls); const si={}; Object.entries(E).forEach(([e,side])=>{ si[e]=sideInfo(k,p,side,slots); });
    const {toW}=frame(ls), L=p.len*FT;
    // the interior along the pod, in plan inches on the pod's long axis
    const ax = p.alongX ? 0 : 1, w0=toW(si.x0.t,48)[ax]*FT, w1=toW(L-si.x1.t,48)[ax]*FT;
    // and across it, on the other plan axis
    const c0=toW(L/2,si.z0.t)[1-ax]*FT, c1=toW(L/2,96-si.z1.t)[1-ax]*FT;
    return { p, ls, si, L, ax, lo:Math.min(w0,w1), hi:Math.max(w0,w1), flip:w0>w1, clo:Math.min(c0,c1), chi:Math.max(c0,c1), cflip:c0>c1 }; });
  // rooms: pods joined through large openings
  const room=pods.map((_,i)=>i), root=i=>room[i]===i?i:(room[i]=root(room[i]));
  info.forEach(I=>Object.values(I.si).forEach(s=>s.joins.forEach(o=>{ if(info[o.i] && info[o.i].ax===I.ax) room[root(I.p.i)]=root(o.i); })));
  const out={};
  const groups={}; info.forEach(I=>(groups[root(I.p.i)] ||= []).push(I));
  Object.values(groups).forEach(G=>{
    // along: one even spacing over the room, its ends held out by cabinets on the end walls
    const lo=Math.min(...G.map(I=>I.lo)), hi=Math.max(...G.map(I=>I.hi));
    const endCab=(at, isLo)=>Math.max(0, ...G.filter(I=>Math.abs((isLo?I.lo:I.hi)-at)<1).map(I=>{ const e = (isLo !== I.flip) ? I.si.x0 : I.si.x1; return e.joins.length ? 0 : e.depth; }));
    const c0=endCab(lo,true), c1=endCab(hi,false);
    // a light on a panel joint of any pod in the room counts against that spacing
    // (and one that would land in the walls between two pods joined end to end)
    const hits = P => G.reduce((n,I)=>{ const sm=[...Array(Math.ceil(I.L/PW)-1)].map((_,i)=>(i+1)*PW);
      return n + P.map(a=>I.flip ? (I.L-I.si.x1.t)-(a-I.lo) : I.si.x0.t+(a-I.lo)).filter(x=>x>0 && x<I.L && sm.some(q=>Math.abs(q-x)<SEAM_CLEAR)).length; }, 0)
      + P.filter(a=>!G.some(I=>a>=I.lo+END_MIN-0.01 && a<=I.hi-END_MIN+0.01)).length*3;
    const along=spread(c0?lo+c0+BUMP:lo, c1?hi-c1-BUMP:hi, S, !!c0, !!c1, hits);
    // across: rows evenly over the whole room, measured wall to wall across every pod in it, so the gap between rows
    // is the same everywhere, also between the two rows either side of a joint (walls and the ¾″ space included)
    const clo=Math.min(...G.map(I=>I.clo)), chi=Math.max(...G.map(I=>I.chi));
    const sideCab=(at, isLo)=>Math.max(0, ...G.filter(I=>Math.abs((isLo?I.clo:I.chi)-at)<1).map(I=>{ const e = (isLo !== I.cflip) ? I.si.z0 : I.si.z1; return e.joins.length ? 0 : e.depth; }));
    const d0=sideCab(clo,true), d1=sideCab(chi,false);
    const inWall = P => P.filter(c=>!G.some(I=>c>=I.clo+ROW_MIN-0.01 && c<=I.chi-ROW_MIN+0.01)).length;
    const across=spread(d0?clo+d0+BUMP:clo, d1?chi-d1-BUMP:chi, S, !!d0, !!d1, inWall);
    G.forEach(I=>{
      const {si, L}=I;
      const toZ = c => I.cflip ? (96-si.z1.t) - (c-I.clo) : si.z0.t + (c-I.clo);
      const rows=across.filter(c=>c>=I.clo+ROW_MIN-0.01 && c<=I.chi-ROW_MIN+0.01).map(toZ).sort((a,b)=>a-b);
      // along positions that fall in this pod, clear of its own end walls (and their cabinets)
      const m0=Math.max(END_MIN, si.x0.joins.length?0:si.x0.depth+BUMP), m1=Math.max(END_MIN, si.x1.joins.length?0:si.x1.depth+BUMP);
      const toLocal = a => I.flip ? (L-si.x1.t) - (a-I.lo) : si.x0.t + (a-I.lo);
      const xs=along.map(toLocal).filter(x=>x>=si.x0.t+m0-0.01 && x<=L-si.x1.t-m1+0.01);
      // clear of panel joints (splines) and of other holes in the ceiling
      const seams=[...Array(Math.ceil(L/PW)-1)].map((_,i)=>(i+1)*PW);
      const cx = x => { const s=seams.find(q=>Math.abs(q-x)<SEAM_CLEAR); return s==null ? x : (x<s ? s-SEAM_CLEAR : s+SEAM_CLEAR); };
      out[I.p.i] = { rows, xs:xs.map(cx), pts: rows.flatMap(z=>xs.map(x=>({x:cx(x), z}))) };
    });
  });
  return out;
}
const isDrawnLight = h => h.shape==='round' && ((Math.abs((h.dia||h.w)-LIGHT.d)<0.1 && h.face==='bottom') || Math.abs((h.dia||h.w)-LIGHT.wire)<0.05 && !h.depth);
/* the interior ceiling with its lights: drawn 4″ pockets swapped for the automatic ones */
function withLights(L, ls, k=state.model){
  if(!L || ls.kind!=='ceiling-int' || !cfgOf(k).auto) return L;
  const plan=lightPlan(k)[ls.pod.i]; if(!plan) return L;
  const keep=(L.holes||[]).filter(h=>!isDrawnLight(h));
  const c=LIGHT.d/2+HOLE_CLEAR, blocked=(x,z)=>keep.some(h=>x>h.x-c && x<h.x+h.w+c && z>h.z-c && z<h.z+h.d+c);
  const holes=keep.slice(), r=LIGHT.d/2, rw=LIGHT.wire/2; let n=0;
  plan.pts.forEach(({x,z})=>{
    let X=x; if(blocked(X,z)){ X=[1,-1,2,-2,3,-3,4,-4,6,-6,8,-8,10,-10,12,-12].map(d=>x+d).find(v=>!blocked(v,z)); }
    if(X==null) return; n++;
    holes.push({ x:+(X-r).toFixed(4), z:+(z-r).toFixed(4), w:LIGHT.d, d:LIGHT.d, shape:'round', dia:LIGHT.d, depth:Math.min(LIGHT.depth, (L.t||6.47)-1), face:'bottom', light:true });
    holes.push({ x:+(X-rw).toFixed(4), z:+(z-rw).toFixed(4), w:LIGHT.wire, d:LIGHT.wire, shape:'round', dia:LIGHT.wire, light:true });
  });
  holes.sort((a,b)=>a.x-b.x || a.z-b.z);
  return { ...L, holes, lights:n, auto:true };
}
const CAB_PRESETS = [['None',0],['Upper cabinets',13],['Base cabinets',24],['Wardrobe',24],['Fridge',30]];
export { lightPlan, withLights, cfgOf, setLights, cabinetsOf, setCabinet, cabDepth, CAB_PRESETS, LIGHT };
