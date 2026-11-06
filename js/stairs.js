/* Cubit Builder — stairs.js : a stair from the ground floor up to a pod on the second floor.

   A stair sits in a pod on any floor and climbs into the pod right above (the next floor), through openings cut in the lower pod's ceiling
   and roof and in the upper pod's floor. The kinds:

     Straight     one flight against a long wall, along the pod. Shortest / Standard / Comfortable
     U-shaped     two flights side by side across the pod (36″ + 36″ = 72″, fits inside an 8′ pod) with a landing
                  between them at the turn: about half the length of a straight stair. Standard / Compact
     Square spiral  Cubit's 81¾″ square spiral (from Johnny's Shapr3D model): a 3″ round post in the middle, 16 risers,
                  15 wedge treads of 22½° each and a landing plate at the top; it fits across an 8′ pod

   The rules (National Building Code of Canada, 9.8, stairs within a dwelling unit):
     rise 125–200 mm (max 7⅞″) · run 255–355 mm (min 10⅛″ rounded up) · width 860 mm (34″) or more
     headroom 1950 mm (76¾″) over the stair · all risers the same
   The square spiral's 22½° wedges are winders / a spiral stair under 9.8.4: check them with the building official.
   The total rise is fixed by the build: ground floor top to upstairs floor top = UP (116.4″).

   MODELS[k].stairs = [{ id, pod (the ground-floor pod), opt, u0 (inches from the pod's own W end), dir, side, q }]
     straight / U: dir 1 = the (first) flight climbs toward the pod's own E end, -1 W; side 'S'|'N' the long wall the
                   (first) flight is against; u0 = the foot of the bottom riser
     spiral:       u0 = its W edge; dir 1 = it winds counter-clockwise seen from above (in the pod's own frame), -1
                   clockwise; q 0–3 = which side it starts from (quarter turns)
   Pod-local inches: u along the pod from its own W end, v across from its own S side (the floor layers' frame). */
import { MODELS } from './data.js';
import { state, save } from './state.js';
import { checkpoint } from './history.js';
import { UP, LAYER_KINDS, WALL_BASE } from './config.js';
import { podList, layerSlotsFor, podOffsets } from './layout.js';
import { ensureDraft } from './pods.js';
import { SPIRAL } from './stair-spiral.js';

const R = UP;   // inches, ground floor top to the upstairs floor top
const HEAD = 76.75, CEIL_ABOVE = LAYER_KINDS['ceiling-int'].z - WALL_BASE;   // ceiling underside above the floor
const IN_S = 6.5, IN_N = 6.5;   // the long walls' inside faces (close enough; interior walls are 4½″)
const plan = (rise, run, label, note) => { const n=Math.ceil(R/rise - 1e-9), r=R/n; return { n, rise:r, run, total:(n-1)*run, label, note }; };
const OPTS = {
  min:     { kind:'straight', ...plan(7.875, 10.125, 'Shortest', 'the steepest the code allows: 7⅞″ rise, 10⅛″ run'), w:36 },
  std:     { kind:'straight', ...plan(7.5, 10.5, 'Standard', 'about 7½″ rise, 10½″ run'), w:36 },
  comfort: { kind:'straight', ...plan(7, 11, 'Comfortable', 'about 7″ rise, 11″ run'), w:36 },
  u:       { kind:'u', ...plan(7.5, 10.5, 'U-shaped', 'two flights side by side with a landing: about 7½″ rise, 10½″ run'), w:36 },
  ucomp:   { kind:'u', ...plan(7.875, 10.125, 'U-shaped compact', 'the steepest the code allows, two flights and a landing'), w:36 },
  wind:    { kind:'wind', n:16, rise:R/16, run:10.5, label:'Crossing winder', note:'fits where pods cross: 2 steps in, a flight to the end wall, winders round, out into the pod above', w:36 },
  spiral:  { kind:'spiral', n:16, rise:R/16, run:0, total:0, Q:81.75, post:3, label:'Square spiral', note:'Johnny’s Shapr3D model: 81¾″ square, 3″ post, 4″ hubs, 15 treads and a top landing', w:39 },
};
// a U stair's two flights: the first takes the extra riser when the count is odd; the landing is as deep as a flight is wide
function uPlan(o){ const nA=Math.ceil(o.n/2), nB=o.n-nA, D=o.w; return { nA, nB, D, lenA:(nA-1)*o.run, lenB:(nB-1)*o.run, len:Math.max(nA-1, nB-1)*o.run + D }; }
OPTS.wind.total=99;   // its length along the pod (″)
OPTS.u.total=uPlan(OPTS.u).len; OPTS.ucomp.total=uPlan(OPTS.ucomp).len; OPTS.spiral.total=OPTS.spiral.Q;

/* headroom: how many treads in from the foot the ceiling has to be open */
const headK = o => Math.floor((CEIL_ABOVE - HEAD)/o.rise);
/* the opening along a straight run: from where the headroom runs out to the top riser (inches from its foot) */
function openingOf(o){ const k=headK(o); return { a:Math.max(0, k*o.run), b:o.total + 1 }; }

/* pod-local ↔ plan feet (same turn rule as the floor layers) */
const frame = (k, i) => layerSlotsFor(k).find(l=>l.pod.i===i && l.kind==='ceiling-int');
function toPlan(ls, [u, v]){ const th=-(ls.rot||0)*Math.PI/180, L0=ls.len, off={0:[0,0],90:[8,0],180:[L0,8],270:[0,L0]}[ls.rot||0], c=Math.cos(th), s=Math.sin(th);
  const lu=u/12, lv=v/12; return [ls.x+off[0]+(c*lu + s*lv), ls.z+off[1]+(-s*lu + c*lv)]; }
function toLocal(ls, [wx, wz]){ const th=-(ls.rot||0)*Math.PI/180, L0=ls.len, off={0:[0,0],90:[8,0],180:[L0,8],270:[0,L0]}[ls.rot||0], c=Math.cos(th), s=Math.sin(th);
  const dx=wx-ls.x-off[0], dz=wz-ls.z-off[1]; return [(dx*c-dz*s)*12, (dx*s+dz*c)*12]; }
const rectPlan = (ls, u0, u1, v0, v1) => { const P=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(q=>toPlan(ls,q)); return { x:Math.min(...P.map(p=>p[0])), z:Math.min(...P.map(p=>p[1])), x1:Math.max(...P.map(p=>p[0])), z1:Math.max(...P.map(p=>p[1])) }; };
const unionRect = L => ({ x:Math.min(...L.map(r=>r.x)), z:Math.min(...L.map(r=>r.z)), x1:Math.max(...L.map(r=>r.x1)), z1:Math.max(...L.map(r=>r.z1)) });

/* the crossing winder, drawn in its own frame: a = inches back from the end wall's inside face (u0), b = inches across
   from the first flight's wall. Two flights 36″ wide side by side (b 0–36 and 47–83, 83″ = an 8′ pod inside), the
   turn at the end wall. Treads, in climbing order: 6 up the first flight toward the end wall (the first 2 outside the
   opening, where there's headroom), 3 winders round the corner (30° each, pivoting on the inside corner), 1 across
   the end, 3 winders round the next corner, 2 back along the other wall; then the floor above. */
const WD = { A:6, B:1, C:2, W:3, run:10.5, w:36, gap:11, foot:99, open:78 };
function windGeo(S){
  const sg=S.dir>0?1:-1, C=(a,b)=>[S.u0-sg*a, S.side==='N' ? 89.5-b : 6.5+b];
  const treads=[], run=WD.run, w=WD.w, b2=w+WD.gap, B2=b2+w;
  const rect=(a0,a1,b0,b1)=>[C(a0,b0),C(a1,b0),C(a1,b1),C(a0,b1)];
  for(let i=1;i<=WD.A;i++){ const a1=WD.foot-(i-1)*run, a0=WD.foot-i*run; treads.push(rect(a0,a1,0,w)); }
  // winders: from the pivot, between two directions, clipped to the corner square (corner point included)
  const wind=(pa,pb,d0,d1,sq)=>{   // pivot (pa,pb), turning from direction d0 to d1, inside the square sq=[a0,a1,b0,b1]
    const A0=Math.atan2(d0[1],d0[0]), A1=Math.atan2(d1[1],d1[0]); let da=A1-A0; if(da>Math.PI) da-=2*Math.PI; if(da<-Math.PI) da+=2*Math.PI;
    const sgn=Math.sign(da), hit=a=>{ const ca=Math.cos(a), sa=Math.sin(a); let tt=1e9;
      if(Math.abs(ca)>1e-9) [sq[0],sq[1]].forEach(e=>{ const t=(e-pa)/ca; if(t>1e-6) tt=Math.min(tt,t); });
      if(Math.abs(sa)>1e-9) [sq[2],sq[3]].forEach(e=>{ const t=(e-pb)/sa; if(t>1e-6) tt=Math.min(tt,t); });
      return [pa+ca*tt, pb+sa*tt]; };
    const corners=[[sq[0],sq[2]],[sq[1],sq[2]],[sq[1],sq[3]],[sq[0],sq[3]]].filter(([ca,cb])=>Math.hypot(ca-pa,cb-pb)>1e-6), out=[];
    for(let k=0;k<WD.W;k++){ const a0=A0+da*k/WD.W, a1=A0+da*(k+1)/WD.W, span=Math.abs(a1-a0), pts=[[pa,pb], hit(a0)];
      // the square's corners swept between the two edges of this winder, in turning order
      corners.map(([ca,cb])=>{ let r=(Math.atan2(cb-pb, ca-pa)-a0)*sgn; while(r<0) r+=2*Math.PI; while(r>=2*Math.PI) r-=2*Math.PI; return [r,ca,cb]; })
        .filter(([r])=>r>1e-6 && r<span-1e-6).sort((x,y)=>x[0]-y[0]).forEach(([,ca,cb])=>pts.push([ca,cb]));
      pts.push(hit(a1)); out.push(pts.map(([a,b])=>C(a,b))); }
    return out; };
  treads.push(...wind(w, w, [0,-1], [-1,0], [0,w,0,w]));                 // round the first corner (into the end)
  treads.push(rect(0, w, w, b2));                                           // one across the end
  treads.push(...wind(w, b2, [-1,0], [0,1], [0,w,b2,B2]));                  // round the second corner
  for(let i=1;i<=WD.C;i++) treads.push(rect(w+(i-1)*run, w+i*run, b2, B2)); // back along the other wall
  const box=(a0,a1,b0,b1)=>{ const P=[C(a0,b0),C(a1,b1)]; return { u0:Math.min(P[0][0],P[1][0]), u1:Math.max(P[0][0],P[1][0]), v0:Math.min(P[0][1],P[1][1]), v1:Math.max(P[0][1],P[1][1]) }; };
  const top=w+WD.C*run;
  // the column: one straight steel post, plumb, in the middle of the U (between the two winder corners), floor to floor
  const col=[w, w+WD.gap/2];
  // the ceiling and roof below open from the 3rd step on (headroom over the first flight); the floor above only up to
  // the top step: from the last riser its floor runs on flush, the landing (and a level floor out to a door there)
  return { C, treads, foot:box(0, WD.foot, 0, B2), hole:box(-0.5, WD.open+0.5, -0.5, B2+0.5), holeUp:box(-0.5, top+0.5, -0.5, B2+0.5),
    footZones:[box(WD.foot, WD.foot+LAND, 0, w), box(WD.foot-LAND, WD.foot, b2, B2)],
    topZones:[box(top-LAND, top, B2, B2+LAND), box(top, top+LAND, b2, B2), box(top-LAND, top, -LAND, 0)],
    arrive:{ p:C(top, b2+w/2), d:[-sg, 0] }, col:C(...col), colTie:C(top+0.5, col[1]) };
}
/* the local footprint and openings of each kind (pod-local inch rects { u0,u1,v0,v1 }) */
function shapeOf(S, o){
  const sg=S.dir>0?1:-1, U=(a,b)=>[Math.min(a,b), Math.max(a,b)];
  if(o.kind==='spiral'){ const Q=o.Q, v0=(96-Q)/2, [u0,u1]=[S.u0, S.u0+Q];
    return { foot:{ u0, u1, v0, v1:v0+Q }, holes:[{ u0:u0-0.5, u1:u1+0.5, v0:v0-0.5, v1:v0+Q+0.5 }] }; }
  if(o.kind==='wind'){ const G=windGeo(S); return { foot:G.foot, holes:[G.hole], holesUp:[G.holeUp], G }; }
  if(o.kind==='u'){ const P=uPlan(o), W=o.w, vA0 = S.side==='N' ? 96-IN_N-W : IN_S, vB0 = S.side==='N' ? vA0-W : vA0+W;
    const [fu0,fu1]=U(S.u0, S.u0+sg*P.len), k=headK(o);
    const [au0,au1]=U(S.u0+sg*k*o.run, S.u0+sg*P.len);
    return { foot:{ u0:fu0, u1:fu1, v0:Math.min(vA0,vB0), v1:Math.max(vA0,vB0)+W }, P, vA0, vB0,
      holes:[{ u0:fu0-0.5, u1:fu1+0.5, v0:vB0-0.5, v1:vB0+W+0.5 }, { u0:au0-0.5, u1:au1+0.5, v0:vA0-0.5, v1:vA0+W+0.5 }] }; }
  const v0 = S.side==='N' ? 96-IN_N-o.w : IN_S, op=openingOf(o), [lo,hi]=U(S.u0, S.u0+sg*o.total);
  const oa = sg>0 ? S.u0+op.a : S.u0-op.b, ob = sg>0 ? S.u0+op.b : S.u0-op.a;
  return { foot:{ u0:lo, u1:hi, v0, v1:v0+o.w }, holes:[{ u0:Math.min(oa,ob), u1:Math.max(oa,ob), v0:v0-0.5, v1:v0+o.w+0.5 }], op };
}

/* everything about one stair: its footprint and openings in plan, the pod above, and whether it fits */
function solve(k, S){
  const pods=podList(k), p=pods[S.pod]; if(!p) return null;   // any floor: it climbs to the floor above
  const o=OPTS[S.opt]||OPTS.std, ls=frame(k, S.pod); if(!ls) return null;
  const sh=shapeOf(S, o), L=p.len*12, F=sh.foot;
  const foot=rectPlan(ls, F.u0, F.u1, F.v0, F.v1), holes=sh.holes.map(h=>rectPlan(ls, h.u0, h.u1, h.v0, h.v1)), hole=unionRect(holes);
  const holesUp=(sh.holesUp||sh.holes).map(h=>rectPlan(ls, h.u0, h.u1, h.v0, h.v1));   // in the floor above (can be less than below)
  // the pod above has to cover every opening
  const OFF=podOffsets(k), inPod = (r,q)=>{ const o2=OFF[q.i], x=q.x+o2.ox, z=q.z+o2.oz; return r.x>=x-0.01 && r.x1<=x+q.w+0.01 && r.z>=z-0.01 && r.z1<=z+q.d+0.01; };
  const above=pods.filter(q=>q.lv===p.lv+1).find(q=>holes.every(h=>inPod(h,q)));
  const why = F.u0 < 6.5-0.01 || F.u1 > L-6.5+0.01 ? `needs ${Math.ceil((F.u1-F.u0)/12*10)/10}′ clear along the pod`
            : F.v0 < 4.5-0.01 || F.v1 > 96-4.5+0.01 ? 'too wide for this pod' : !above ? 'the opening has to be under an upstairs pod' : '';
  return { S, o, p, ls, foot, hole, holes, holesUp, above:above?above.i:null, why, sh, op:sh.op || { a:0, b:F.u1-F.u0 } };
}
const stairsOf = (k=state.model) => (MODELS[k]?.stairs||[]).map(S=>solve(k,S)).filter(Boolean);

/* the stair holes in one layer (layer-local inches, as holes): the lower pod's ceiling and roof, the upper pod's floor */
function stairHoles(ls, k=state.model){
  const out=[];
  stairsOf(k).forEach(st=>{ if(st.above==null) return;
    const mine = (ls.pod.i===st.S.pod && (ls.kind==='ceiling-int' || ls.kind==='roof')) || (ls.pod.i===st.above && ls.kind==='floor-up');
    if(!mine) return;
    (ls.kind==='floor-up' ? st.holesUp : st.holes).forEach(H=>{ const P=[[H.x,H.z],[H.x1,H.z],[H.x1,H.z1],[H.x,H.z1]].map(q=>toLocal(ls,q));
      const x=Math.min(...P.map(p=>p[0])), x1=Math.max(...P.map(p=>p[0])), z=Math.min(...P.map(p=>p[1])), z1=Math.max(...P.map(p=>p[1]));
      out.push({ x:+x.toFixed(3), z:+z.toFixed(3), w:+(x1-x).toFixed(3), d:+(z1-z).toFixed(3), stair:true, name:'Stair opening' }); }); });
  return out;
}

/* the best spot in a ground-floor pod (or any): the first that fits, against either long wall, going either way */
function bestSpot(k, i, opt){
  const pods=podList(k), list = i!=null ? [pods[i]] : pods.filter(p=>pods.some(q=>q.lv===p.lv+1));
  // first a spot with a clear landing at the foot and the top; failing that, any spot it fits
  for(const strict of [true, false]) for(const p of list){ if(!p) continue; const L=p.len*12, o=OPTS[opt]||OPTS.std;
    for(const side of ['S','N']) for(const dir of [1,-1]) for(const q of (o.kind==='spiral' && strict ? [0,1,2,3] : [0])) for(let a=6.5; a<=L-6.5; a+=1){
      const S={ pod:p.i, dir, side, u0: o.kind==='spiral' ? a : o.kind==='wind' ? (dir>0 ? L-a : a) : (dir>0 ? a : L-a), opt, q }; const st=solve(k,S); if(!st || st.why) continue;   // a crossing winder from the end wall in
      if(strict){ const Ld=landings(st, k); if(!Ld.foot.ok || !Ld.top.ok || Ld.startsOverHole) continue; }
      return S; } }
  return null;
}
function edit(fn){ checkpoint(); const key=ensureDraft(); const m=MODELS[key]; m.stairs ||= []; const r=fn(m.stairs, key); if(!m.stairs.length) delete m.stairs; save(); return r; }
function addStair(i=null, opt='std'){
  const k=state.model; let S=null;
  for(const o of [opt, 'std', 'u', 'wind', 'spiral', 'min']){ S=bestSpot(k, i, o); if(S) break; }
  if(!S) return null;
  return edit(L=>{ let n=1; while(L.some(s=>s.id==='s'+n)) n++; const s={ id:'s'+n, ...S }; L.push(s); return s.id; });
}
function updateStair(id, patch){ return edit(L=>{ const s=L.find(x=>x.id===id); if(s) Object.assign(s, patch); return id; }); }
function removeStair(id){ edit(L=>{ const i=L.findIndex(x=>x.id===id); if(i>=0) L.splice(i,1); }); }
/* the foot of the same stair seen from its other end (for "turn it round") */
function flipped(S){ const o=OPTS[S.opt]||OPTS.std; if(o.kind==='spiral') return { dir:-S.dir }; if(o.kind==='wind') return { dir:-S.dir, u0:S.u0-S.dir*WD.foot }; return { dir:-S.dir, u0:S.u0+S.dir*o.total }; }
/* each option for a stair as it sits now (or at its best spot in this pod): { key, label, note, fits, why, alt, kind } */
function optionsFor(id){
  const k=state.model, S=(MODELS[k]?.stairs||[]).find(x=>x.id===id); if(!S) return [];
  return Object.entries(OPTS).map(([key,o])=>{ const st=solve(k,{...S, opt:key}); const alt=st?.why ? bestSpot(k, S.pod, key) : null;
    const ft = x => `${Math.floor(x/12)}′ ${Math.round(x%12)}″`;
    const note = o.kind==='wind' ? `fits where pods cross · ${o.n} risers ${o.rise.toFixed(2)}″, treads 10½″, 6 winders · 8′ 3″ × 7′ 0″ inside, opening 6′ 6″ × 7′ 0″`
      : o.kind==='spiral' ? `your Shapr3D model · ${o.n} risers ${o.rise.toFixed(2)}″, 15 treads on hubs, top landing · ${ft(o.Q)} square`
      : o.kind==='u' ? (P=>`${o.n} risers ${o.rise.toFixed(2)}″, treads ${o.run}″, landing · ${ft(P.len)} long, ${2*o.w}″ wide`)(uPlan(o))
      : `${o.n} risers ${o.rise.toFixed(2)}″, ${o.n-1} treads ${o.run}″ · ${ft(o.total)} long, ${o.w}″ wide`;
    return { key, kind:o.kind, label:o.label, note, fits:!st?.why || !!alt, why:st?.why, alt }; });
}

/* ---------------------------------------------------------------- what it looks like
   3D parts in plan feet / inches up: { kind:'box', x,z,x1,z1, y0,y1 } · { kind:'poly', pts:[[x,z]…], y0,y1 }
   · { kind:'post', x,z, r, y0,y1 } · { kind:'slope', a:[x,z], b:[x,z], ya, yb, t } (a stringer, t feet thick) */
const T=3;   // tread thickness ″: solid 3″ treads (wood) on the steel
/* the square spiral as drawn (stair-spiral.js): its parts placed in the pod. File x east / y north seen from above →
   pod-local u / v the same way round; dir -1 mirrors it (winds the other way); q turns it by quarters about the post.
   Heights are stretched a touch to land flush on this build's floor (the model rises 117¾″, the floors here are
   116.4″ apart: every riser 7.28″ instead of 7.36″). */
function spiralGeo(st){
  const o=st.o, F=st.sh.foot, c=[(F.u0+F.u1)/2, (F.v0+F.v1)/2], q=((st.S.q||0)%4+4)%4, mir=st.S.dir<0, k=R/SPIRAL.total;
  const T = ([x,y]) => { let u=x, v=mir ? y : -y; for(let i=0;i<q;i++){ const t=u; u=-v; v=t; } return [c[0]+u, c[1]+v]; };
  const Z = z => z*k;
  // the way tread 1 points (from the post), in the pod's frame: for lining one spiral up above another
  const d1=T([-1,0]), a0=Math.atan2(d1[1]-c[1], d1[0]-c[0]);
  return { c, h:o.Q/2, T, Z, a0, sg:mir?-1:1, step:2*Math.PI/16 };
}
function stairParts(st){
  const out=[], o=st.o, P=q=>toPlan(st.ls, q), sg=st.S.dir>0?1:-1;
  if(o.kind==='spiral'){ const G=spiralGeo(st), cp=P(G.c), X=SPIRAL, pl=pts=>pts.map(q=>P(G.T(q)));
    out.push({ kind:'post', x:cp[0], z:cp[1], r:X.post.r/12, y0:0, y1:G.Z(X.post.z1) });
    if(X.base) out.push({ kind:'poly', pts:pl(X.base.pts), y0:0, y1:X.base.t });
    X.hubs.forEach(([z0,z1])=>out.push({ kind:'post', x:cp[0], z:cp[1], r:X.hubR/12, y0:G.Z(z0), y1:G.Z(z1) }));
    X.treads.forEach(t=>out.push({ kind:'poly', pts:pl(t.pts), y0:G.Z(t.z0), y1:G.Z(t.z1) }));
    out.push({ kind:'poly', pts:pl(X.landing.pts), y0:G.Z(X.landing.z0), y1:G.Z(X.landing.z1) });
    return out; }
  // every other kind: solid treads on one steel tube stringer up the middle (a mono stringer), straight runs only
  const run=steps(st), sup=run.treads.map(t=>({ p:t.c, yb:t.y-T, n:t.n }));
  run.treads.forEach(t=>t.pts && out.push({ kind:'poly', pts:t.pts.map(P), y0:t.y-T, y1:t.y }));
  mono(st, run.path, sup, out);
  rails(st, out);
  return out;
}
/* the treads of a stair in climbing order, pod-local: { pts, c (its middle), y (its top), n (along its nosing) },
   and the stringer's path: a polyline up the middle of the walking line, straight runs with a corner at each turn,
   from the foot of the bottom riser to the edge of the floor above */
function steps(st){
  const o=st.o, S=st.S, sg=S.dir>0?1:-1, sh=st.sh, treads=[];
  const rect=(u0,u1,v0,v1,y)=>{ const a=Math.min(u0,u1), b=Math.max(u0,u1); treads.push({ pts:[[a,v0],[b,v0],[b,v1],[a,v1]], c:[(a+b)/2,(v0+v1)/2], y, n:[0,1] }); };
  if(o.kind==='wind'){ const G=sh.G, C=G.C, w=WD.w, b2=w+WD.gap, mid=w/2;
    G.treads.forEach((pts,i)=>{ const n=pts.length, c=[pts.reduce((s,q)=>s+q[0],0)/n, pts.reduce((s,q)=>s+q[1],0)/n];
      let best=[0,1], bl=0; pts.forEach((q,k)=>{ const r=pts[(k+1)%n], l=Math.hypot(r[0]-q[0], r[1]-q[1]); if(l>bl){ bl=l; best=[(r[0]-q[0])/l, (r[1]-q[1])/l]; } });
      treads.push({ pts, c, y:(i+1)*o.rise, n:best }); });
    // up the first flight's middle into the corner, across the end, out along the last flight's middle
    return { treads, path:[C(WD.foot, mid), C(mid, mid), C(mid, b2+mid), C(w+WD.C*WD.run, b2+mid)] }; }
  const flight=(uFoot, d, v0, n, y0)=>{ for(let i=0;i<n-1;i++){ const u=uFoot+d*i*o.run; rect(u, u+d*(o.run+1), v0, v0+o.w, y0+(i+1)*o.rise); } return uFoot+d*(n-1)*o.run; };
  if(o.kind==='u'){ const Pp=sh.P, vmA=sh.vA0+o.w/2, vmB=sh.vB0+o.w/2;
    const uL=flight(S.u0, sg, sh.vA0, Pp.nA, 0), yL=Pp.nA*o.rise, uM=uL+sg*Pp.D/2;
    const lv0=Math.min(sh.vA0, sh.vB0), lv1=Math.max(sh.vA0, sh.vB0)+o.w;
    // the landing: carried where the stringer turns under it, at both corners and between
    [[uM, vmA],[uM,(vmA+vmB)/2],[uM, vmB]].forEach((c,j)=>treads.push({ pts:j===1?[[Math.min(uL,uL+sg*Pp.D),lv0],[Math.max(uL,uL+sg*Pp.D),lv0],[Math.max(uL,uL+sg*Pp.D),lv1],[Math.min(uL,uL+sg*Pp.D),lv1]]:null, c, y:yL, n:[0,1], land:true }));
    const uB=flight(uL, -sg, sh.vB0, Pp.nB, yL);
    return { treads, path:[[S.u0, vmA],[uM, vmA],[uM, vmB],[uB, vmB]], land:true }; }
  const v0=sh.foot.v0, uT=flight(S.u0, sg, v0, o.n, 0);
  return { treads, path:[[S.u0, v0+o.w/2],[uT, v0+o.w/2]] };
}
/* the mono stringer: an HSS 4×10 along the path, its top a straight line in each run, a welded bracket (a V of ½″
   plate under a cap plate) up to the middle of each tread. Its foot sits on a plate on the floor where its underside
   meets the floor (any steps before that on short steel pedestals); its top end bolts to the face of the floor above. */
const STR={ w:4, d:10, gap:5 };
function mono(st, path, sup, out){
  const P=q=>toPlan(st.ls, q), sl=[0]; for(let i=1;i<path.length;i++) sl.push(sl[i-1]+Math.hypot(path[i][0]-path[i-1][0], path[i][1]-path[i-1][1]));
  const at=s=>{ let i=1; while(i<path.length-1 && sl[i]<s) i++; const a=path[i-1], b=path[i], L=sl[i]-sl[i-1]||1, t=(s-sl[i-1])/L; return { p:[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t], r:[(b[0]-a[0])/L, (b[1]-a[1])/L] }; };
  const near=q=>{ let best=null; for(let i=1;i<path.length;i++){ const a=path[i-1], b=path[i], dx=b[0]-a[0], dz=b[1]-a[1], L2=dx*dx+dz*dz||1;
      const t=Math.max(0, Math.min(1, ((q[0]-a[0])*dx+(q[1]-a[1])*dz)/L2)), x=a[0]+dx*t, z=a[1]+dz*t, d=Math.hypot(q[0]-x, q[1]-z);
      if(!best || d<best.d-1e-6) best={ d, s:sl[i-1]+t*Math.sqrt(L2) }; } return best.s; };
  const S2=sup.map(q=>({ ...q, s:near(q.p) })), pts=S2.map(q=>[q.s, q.yb-STR.gap]).sort((a,b)=>a[0]-b[0]);
  const lerp=s=>{ let i=1; while(i<pts.length-1 && pts[i][0]<s) i++; const a=pts[i-1], b=pts[i]; if(Math.abs(b[0]-a[0])<1e-6) return Math.min(a[1],b[1]); return a[1]+(b[1]-a[1])*(s-a[0])/(b[0]-a[0]); };
  const hk=sl.map(lerp);                                            // the stringer's top at each corner of its path
  hk[hk.length-1]=Math.min(hk[hk.length-1], R-1.5);
  const hAt=s=>{ let i=1; while(i<sl.length-1 && sl[i]<s) i++; return hk[i-1]+(hk[i]-hk[i-1])*(s-sl[i-1])/((sl[i]-sl[i-1])||1); };
  for(let pass=0; pass<8; pass++) S2.forEach(q=>{ const x=hAt(q.s)-(q.yb-1); if(x<=1e-3) return; let i=1; while(i<sl.length-1 && sl[i]<q.s) i++; hk[i-1]-=x; hk[i]-=x; });   // never into a tread
  // where its underside meets the floor: the foot
  let s0=0; if(hAt(0)<STR.d){ for(let i=1;i<sl.length;i++){ const a=hk[i-1], b=hk[i]; if(b>=STR.d){ s0=sl[i-1]+(STR.d-a)/((b-a)||1)*(sl[i]-sl[i-1]); break; } } }
  const knots=[s0, ...sl.filter(s=>s>s0+0.01)];
  for(let i=0;i<knots.length-1;i++){ const A=at(knots[i]).p, B=at(knots[i+1]).p, ha=hAt(knots[i]), hb=hAt(knots[i+1]);
    out.push({ kind:'beam', a:P(A), b:P(B), ya:ha-STR.d/2, yb:hb-STR.d/2, w:STR.w/12, d:STR.d/12, m:'steel' }); }
  const F=at(s0); out.push({ kind:'beam', a:P([F.p[0]-F.r[0]*2, F.p[1]-F.r[1]*2]), b:P([F.p[0]+F.r[0]*10, F.p[1]+F.r[1]*10]), ya:0.25, yb:0.25, w:8/12, d:0.5/12, m:'steel' });   // base plate
  const E=at(sl[sl.length-1]), he=hk[hk.length-1], nE=[-E.r[1], E.r[0]];
  out.push({ kind:'beam', a:P([E.p[0]-nE[0]*4, E.p[1]-nE[1]*4]), b:P([E.p[0]+nE[0]*4, E.p[1]+nE[1]*4]), ys:[he-STR.d-1, he+1, he-STR.d-1, he+1], w:0.5/12, d:0, m:'steel' });   // bolting plate on the face of the floor framing
  S2.forEach(q=>{ const A=at(q.s), r=A.r, n=q.n, top=q.yb-0.375;
    out.push({ kind:'beam', a:P([q.p[0]-n[0]*7, q.p[1]-n[1]*7]), b:P([q.p[0]+n[0]*7, q.p[1]+n[1]*7]), ya:q.yb-0.19, yb:q.yb-0.19, w:3.5/12, d:0.375/12, m:'steel' });   // cap plate
    if(q.s<s0-0.5){ const x=A.p; out.push({ kind:'beam', a:P([x[0]-r[0]*1.5, x[1]-r[1]*1.5]), b:P([x[0]+r[0]*1.5, x[1]+r[1]*1.5]), ys:[0, top, 0, top], w:3/12, d:0, m:'steel' }); return; }   // a pedestal
    const h=hAt(q.s), g=top-h, x=A.p;
    if(g<3){ out.push({ kind:'beam', a:P([x[0]-r[0]*1.5, x[1]-r[1]*1.5]), b:P([x[0]+r[0]*1.5, x[1]+r[1]*1.5]), ys:[h, top, h, top], w:3/12, d:0, m:'steel' }); return; }
    const k=Math.min(4, g*0.6); [-1,1].forEach(sd=>out.push({ kind:'beam', a:P(x), b:P([x[0]+r[0]*k*sd, x[1]+r[1]*k*sd]), ya:h+0.5, yb:top-0.75, w:0.5/12, d:1.5/12, m:'steel' })); });
  st.stringer={ foot:s0, len:sl[sl.length-1]-s0, top:he };
}
/* guards: glass (½″ tempered on stainless standoffs at the tread ends, a 1½″ stainless handrail on the stair side) or
   stainless cable (2″ posts at 4′ or less, a top rail, ⅛″ cables at 3″ or less), 36″ high (NBC 9.8.8.3, inside a
   house): along each open side of the stair and round the opening in the floor above, except over walls and where
   you step off at the top. Where a stair side runs under an edge of that opening it's one guard, up to 36″ over the floor. */
const GH=36;
function guardRuns(st, k=state.model){
  const o=st.o, S=st.S, sg=S.dir>0?1:-1, sh=st.sh, P=q=>toPlan(st.ls, q), runs=[];
  if(o.kind==='spiral' || st.above==null) return runs;
  const side=(a,b,na,nb,inn)=>runs.push({ A:P(a), B:P(b), na, nb, inn:[P([a[0]+inn[0]*12, a[1]+inn[1]*12]), P(a)] });
  if(o.kind==='wind'){ const C=sh.G.C, w=WD.w, b2=w+WD.gap, r=o.rise, top=w+WD.C*WD.run, sd=C(0,1)[1]-C(0,0)[1];
    side(C(WD.foot, w), C(w, w), r, (WD.A+1)*r, [0,-sd]);
    side(C(w, b2), C(top, b2), (WD.A+2*WD.W+WD.B+1)*r, R, [0,sd]); }
  else if(o.kind==='u'){ const Pp=sh.P, r=o.rise, uL=S.u0+sg*(Pp.nA-1)*o.run, uE=uL+sg*Pp.D, uB=uL-sg*(Pp.nB-1)*o.run, yL=Pp.nA*r, dB=Math.sign(sh.vB0-sh.vA0);
    const vAo = dB>0 ? sh.vA0 : sh.vA0+o.w, vBo = dB>0 ? sh.vB0+o.w : sh.vB0, vI = dB>0 ? sh.vB0 : sh.vA0;
    side([S.u0, vAo], [uL, vAo], r, yL, [0, dB]); side([uL, vAo], [uE, vAo], yL, yL, [0, dB]);
    side([uE, vAo], [uE, vBo], yL, yL, [-sg, 0]);
    side([uE, vBo], [uL, vBo], yL, yL, [0, -dB]); side([uL, vBo], [uB, vBo], yL+r, R, [0, -dB]);
    side([uL, vI], [uB, vI], yL+r, R, [0, dB]); }
  else { const v0=sh.foot.v0, uT=S.u0+sg*o.total; [[v0, 1], [v0+o.w, -1]].forEach(([v,d])=>side([S.u0, v], [uT, v], o.rise, R, [0, d])); }
  // over a wall: the side of a pod, about 6½″ in
  const pods=podList(k), box=q=>{ const r=OFFP(k, q), t=7.5/12; return [r.x+t, r.z+t, r.x1-t, r.z1-t]; };
  const onWall=(A,B,b)=>{ const e=1.5/12; return (Math.abs(A[0]-b[0])<e+1/12 && Math.abs(B[0]-b[0])<e+1/12) || (Math.abs(A[0]-b[2])<e+1/12 && Math.abs(B[0]-b[2])<e+1/12)
      || (Math.abs(A[1]-b[1])<e+1/12 && Math.abs(B[1]-b[1])<e+1/12) || (Math.abs(A[1]-b[3])<e+1/12 && Math.abs(B[1]-b[3])<e+1/12)
      || A[0]<b[0]-e && B[0]<b[0]-e || A[0]>b[2]+e && B[0]>b[2]+e || A[1]<b[1]-e && B[1]<b[1]-e || A[1]>b[3]+e && B[1]>b[3]+e; };
  const lo=box(pods[S.pod]), hi=box(pods[st.above]);
  const sides=runs.filter(q=>!onWall(q.A, q.B, lo)).map(q=>({ ...q, bot:[q.na-T-5, q.nb-T-5], top:[q.na+GH, q.nb+GH] }));
  // round the opening above: each edge of each hole, less what's inside another hole, over a wall, or where you step off
  const H=st.holesUp, inH=(x,z,me)=>H.some((h,j)=>j!==me && x>h.x+1e-3 && x<h.x1-1e-3 && z>h.z+1e-3 && z<h.z1-1e-3);
  const E=ends(st), ap=P(E.arrive.p), aw=(o.w||36)/12;
  let fl=[];
  H.forEach((h,j)=>[[[h.x,h.z],[h.x1,h.z]],[[h.x1,h.z],[h.x1,h.z1]],[[h.x1,h.z1],[h.x,h.z1]],[[h.x,h.z1],[h.x,h.z]]].forEach(([A,B])=>{
    const L=Math.hypot(B[0]-A[0], B[1]-A[1]); if(L<1e-3) return; const ux=(B[0]-A[0])/L, uz=(B[1]-A[1])/L;
    const cuts=new Set([0, L]); H.forEach(g=>[g.x,g.x1].forEach(x=>{ if(Math.abs(ux)>1e-6){ const t=(x-A[0])/ux; if(t>0&&t<L) cuts.add(t); } }));
    H.forEach(g=>[g.z,g.z1].forEach(z=>{ if(Math.abs(uz)>1e-6){ const t=(z-A[1])/uz; if(t>0&&t<L) cuts.add(t); } }));
    const off=Math.abs((ap[0]-A[0])*uz-(ap[1]-A[1])*ux);   // the step-off point's distance from this edge
    if(off<(o.run+3)/12){ const t=(ap[0]-A[0])*ux+(ap[1]-A[1])*uz; [t-aw/2, t+aw/2].forEach(x=>{ if(x>0&&x<L) cuts.add(x); }); }
    const T2=[...cuts].sort((a,b)=>a-b);
    for(let i=0;i<T2.length-1;i++){ const t0=T2[i], t1=T2[i+1], tm=(t0+t1)/2; if(t1-t0<0.05) continue;
      const mx=A[0]+ux*tm, mz=A[1]+uz*tm, ex=-uz*0.02, ez=ux*0.02;
      if(inH(mx+ex, mz+ez, j) || inH(mx-ex, mz-ez, j)) continue;   // between two holes: inside the opening
      if(off<(o.run+3)/12){ const t=(ap[0]-A[0])*ux+(ap[1]-A[1])*uz; if(tm>t-aw/2 && tm<t+aw/2) continue; }
      fl.push({ A:[A[0]+ux*t0, A[1]+uz*t0], B:[A[0]+ux*t1, A[1]+uz*t1] }); } }));
  fl=fl.filter(q=>!onWall(q.A, q.B, hi));
  // a stair side right under an edge of the opening: one guard there, up to 36″ over the floor
  const out=[];
  sides.forEach(q=>{ const L=Math.hypot(q.B[0]-q.A[0], q.B[1]-q.A[1])||1e-6, ux=(q.B[0]-q.A[0])/L, uz=(q.B[1]-q.A[1])/L, cuts=new Set([0,1]), spans=[];
    fl.forEach(f=>{ const d1=Math.abs((f.A[0]-q.A[0])*uz-(f.A[1]-q.A[1])*ux), d2=Math.abs((f.B[0]-q.A[0])*uz-(f.B[1]-q.A[1])*ux); if(d1>3/12 || d2>3/12) return;
      let t0=((f.A[0]-q.A[0])*ux+(f.A[1]-q.A[1])*uz)/L, t1=((f.B[0]-q.A[0])*ux+(f.B[1]-q.A[1])*uz)/L; if(t0>t1) [t0,t1]=[t1,t0];
      const a=Math.max(0,t0), b=Math.min(1,t1); if(b-a<1e-3) return; spans.push([a,b]); cuts.add(a); cuts.add(b); const Lf=Math.hypot(f.B[0]-f.A[0], f.B[1]-f.A[1])||1e-6, pf=t=>{ const x=q.A[0]+(q.B[0]-q.A[0])*t, z=q.A[1]+(q.B[1]-q.A[1])*t; return ((x-f.A[0])*(f.B[0]-f.A[0])+(z-f.A[1])*(f.B[1]-f.A[1]))/(Lf*Lf); };
      const fa=pf(a), fb=pf(b); f.used=(f.used||[]).concat([[Math.min(fa,fb), Math.max(fa,fb)]]); });
    const T2=[...cuts].sort((a,b)=>a-b), lp=(a,b,t)=>a+(b-a)*t;
    for(let i=0;i<T2.length-1;i++){ const t0=T2[i], t1=T2[i+1]; if(t1-t0<1e-3) continue; const tm=(t0+t1)/2, both=spans.some(([a,b])=>tm>a&&tm<b);
      out.push({ A:[lp(q.A[0],q.B[0],t0), lp(q.A[1],q.B[1],t0)], B:[lp(q.A[0],q.B[0],t1), lp(q.A[1],q.B[1],t1)], bot:[lp(q.bot[0],q.bot[1],t0), lp(q.bot[0],q.bot[1],t1)],
        top: both ? [R+GH, R+GH] : [lp(q.top[0],q.top[1],t0), lp(q.top[0],q.top[1],t1)], hand:[lp(q.na,q.nb,t0)+GH-1, lp(q.na,q.nb,t1)+GH-1], inn:q.inn, stair:true }); } });
  // what's left of the opening's edges, at the floor above
  fl.forEach(f=>{ let segs=[[0,1]]; const L=Math.hypot(f.B[0]-f.A[0], f.B[1]-f.A[1])||1e-6;
    (f.used||[]).forEach(([a,b])=>{ segs=segs.flatMap(([x,y])=>{ const r=[]; if(a>x) r.push([x,Math.min(y,a)]); if(b<y) r.push([Math.max(x,b),y]); return r.filter(([p,q2])=>q2-p>1e-3); }); });
    segs.forEach(([a,b])=>{ if((b-a)*L<0.1) return; out.push({ A:[f.A[0]+(f.B[0]-f.A[0])*a, f.A[1]+(f.B[1]-f.A[1])*a], B:[f.A[0]+(f.B[0]-f.A[0])*b, f.A[1]+(f.B[1]-f.A[1])*b], bot:[R-10, R-10], top:[R+GH, R+GH] }); }); });
  return out;
}
const RAILS={ glass:'Glass', cable:'Stainless cable', none:'None' };
function rails(st, out){
  const kind=st.S.rail || 'glass'; if(kind==='none') return;
  const G=guardRuns(st), lp=(a,b,t)=>a+(b-a)*t;
  G.forEach(g=>{ const L=Math.hypot(g.B[0]-g.A[0], g.B[1]-g.A[1]); if(L<0.05) return;
    let ix=0, iz=0; if(g.inn){ const d=[g.inn[0][0]-g.inn[1][0], g.inn[0][1]-g.inn[1][1]], l=Math.hypot(...d)||1; ix=d[0]/l; iz=d[1]/l; }
    const sh=(p,k)=>[p[0]+ix*k/12, p[1]+iz*k/12];
    if(kind==='glass'){ out.push({ kind:'beam', a:sh(g.A,-1), b:sh(g.B,-1), ys:[g.bot[0], g.top[0], g.bot[1], g.top[1]], w:0.5/12, d:0, m:'glass' });
      if(g.stair){ const n=Math.max(2, Math.ceil(L/2)); for(let i=0;i<=n;i++){ const t=i/n, p=[lp(g.A[0],g.B[0],t), lp(g.A[1],g.B[1],t)], yb=lp(g.bot[0],g.bot[1],t);   // standoffs into the tread ends
          [yb+1.5, yb+4].forEach(y=>out.push({ kind:'beam', a:sh(p,-1.6), b:sh(p,0.2), ya:y, yb:y, w:1.25/12, d:1.25/12, m:'ss' })); }
        if(Math.abs(g.hand[1]-g.hand[0])>1) out.push({ kind:'beam', a:sh(g.A,2.5), b:sh(g.B,2.5), ya:g.hand[0]-2, yb:g.hand[1]-2, w:1.5/12, d:1.5/12, m:'ss' }); }   // handrail (on the slopes), 34″–38″ over the nosings
      return; }
    // stainless cable
    const n=Math.max(1, Math.ceil(L/4)); for(let i=0;i<=n;i++){ const t=i/n, p=sh([lp(g.A[0],g.B[0],t), lp(g.A[1],g.B[1],t)],-1), y0=lp(g.bot[0],g.bot[1],t)+(g.stair?2:4), y1=lp(g.top[0],g.top[1],t);
      out.push({ kind:'beam', a:[p[0]-0.04*(g.B[0]-g.A[0])/L*1.0, p[1]-0.04*(g.B[1]-g.A[1])/L], b:[p[0]+0.04*(g.B[0]-g.A[0])/L, p[1]+0.04*(g.B[1]-g.A[1])/L], ys:[y0, y1, y0, y1], w:2/12, d:0, m:'ss' }); }
    out.push({ kind:'beam', a:sh(g.A,-1), b:sh(g.B,-1), ya:g.top[0]-0.75, yb:g.top[1]-0.75, w:3/12, d:1.5/12, m:'ss' });   // top rail
    const c0=[g.bot[0]+(g.stair?T+7:12), g.bot[1]+(g.stair?T+7:12)], c1=[g.top[0]-1.5, g.top[1]-1.5], k=Math.ceil(Math.max(c1[0]-c0[0], c1[1]-c0[1])/3);
    for(let j=0;j<k;j++){ const f=j/k; out.push({ kind:'beam', a:sh(g.A,-1), b:sh(g.B,-1), ya:lp(c0[0],c1[0],f), yb:lp(c0[1],c1[1],f), w:0.25/12, d:0.25/12, m:'ss' }); } });
}
/* the stair in plan feet, for the 2D and the sheets: the lines to draw and the walking line (a polyline up the
   middle, its arrow at the top) */
function stairPlan(st){
  const L=stairPlan0(st), rail=st.S.rail||'glass';
  if(rail!=='none') L.guards=guardRuns(st).map(g=>({ a:g.A, b:g.B, lower:!!g.stair, upper:!g.stair || g.top[0]>=R+GH-0.01, rail }));
  return L;
}
function stairPlan0(st){
  const o=st.o, P=q=>toPlan(st.ls, q), sg=st.S.dir>0?1:-1, lines=[];
  if(o.kind==='spiral'){ const G=spiralGeo(st), X=SPIRAL, walk=[];
    // every tread's outline, as drawn
    X.treads.forEach(t=>{ const Q=t.pts.map(q=>P(G.T(q))); Q.forEach((a,i)=>lines.push([a, Q[(i+1)%Q.length]])); });
    // the walking line round through the middle of the treads
    X.treads.forEach(t=>{ const n=t.pts.length, cx=t.pts.reduce((a,q)=>a+q[0],0)/n, cy=t.pts.reduce((a,q)=>a+q[1],0)/n, r=Math.hypot(cx,cy)||1, f=G.h*0.55/r; walk.push(P(G.T([cx*f, cy*f]))); });
    return { lines, walk, post:{ c:P(G.c), r:X.post.r/12 } }; }
  if(o.kind==='wind'){ const G=st.sh.G, walk=[];
    G.treads.forEach(pts=>{ const Q=pts.map(P); Q.forEach((a,i)=>lines.push([a, Q[(i+1)%Q.length]])); const n=pts.length; walk.push(P([pts.reduce((s,q)=>s+q[0],0)/n, pts.reduce((s,q)=>s+q[1],0)/n])); });
    return { lines, walk }; }
  const fl = (uFoot, d, v0, n) => { for(let i=0;i<n;i++){ const u=uFoot+d*i*o.run; lines.push([P([u, v0]), P([u, v0+o.w])]); } return uFoot+d*(n-1)*o.run; };
  if(o.kind==='u'){ const sh=st.sh, Pp=sh.P, vmA=sh.vA0+o.w/2, vmB=sh.vB0+o.w/2;
    const uL=fl(st.S.u0, sg, sh.vA0, Pp.nA), uE=uL+sg*Pp.D; fl(uL, -sg, sh.vB0, Pp.nB);
    lines.push([P([uE, sh.vA0]), P([uE, sh.vB0+(sh.vB0>sh.vA0?o.w:0)])]);
    const uM=uL+sg*Pp.D/2;
    return { lines, walk:[P([st.S.u0, vmA]), P([uM, vmA]), P([uM, vmB]), P([uL-sg*(Pp.nB-1)*o.run, vmB])] }; }
  const v0=st.sh.foot.v0, vm=v0+o.w/2; fl(st.S.u0, sg, v0, o.n);
  return { lines, walk:[P([st.S.u0, vm]), P([st.S.u0 + sg*o.total, vm])] };
}
/* ---------------------------------------------------------------- landings, and one stair after another
   A stair wants a clear landing 36″ deep and as wide as the stair at its foot and at its top: straight on, or turned
   to the side (the other half of the pod). Clear = inside the pod's walls, on floor (not over a stair opening). */
const LAND=36;
const OFFP = (k, q) => { const o=podOffsets(k)[q.i]; return { x:q.x+o.ox, z:q.z+o.oz, x1:q.x+o.ox+q.w, z1:q.z+o.oz+q.d }; };
const inset = (r, d) => ({ x:r.x+d, z:r.z+d, x1:r.x1-d, z1:r.z1-d });
const over = (a, b, m=1/12) =>   // overlapping by more than an inch (the openings have ½″ clearance round them)
   Math.min(a.x1,b.x1)-Math.max(a.x,b.x) > m && Math.min(a.z1,b.z1)-Math.max(a.z,b.z) > m;
const within = (a, b) => a.x>=b.x-0.01 && a.x1<=b.x1+0.01 && a.z>=b.z-0.01 && a.z1<=b.z1+0.01;
/* the openings in a pod's floor (from stairs climbing into it) */
const floorHoles = (k, i, skip=null) => stairsOf(k).filter(st=>st.above===i && st.S.id!==skip).flatMap(st=>st.holesUp);
const LR = (st, u0, u1, v0, v1) => rectPlan(st.ls, Math.min(u0,u1), Math.max(u0,u1), Math.min(v0,v1), Math.max(v0,v1));
/* where you step on, where you step off, and the landing choices at each (pod-local rects); arrive: the point and the
   way you're walking at the top (pod-local), for lining up the next stair */
function ends(st){
  const o=st.o, S=st.S, sg=S.dir>0?1:-1, sh=st.sh;
  if(o.kind==='wind'){ const G=sh.G, z=r=>[r.u0, r.u1, r.v0, r.v1]; return { foot:G.footZones.map(z), top:G.topZones.map(z), arrive:G.arrive }; }
  if(o.kind==='spiral'){ const G=spiralGeo(st), h=o.Q/2;
    // as drawn: you come in to tread 1 (west, going round toward the south) through the open north-west quarter, from
    // the west or the north side of the square; at the top you step off the landing plate (the west half) to the west
    // or the south. Zones in the file's frame, placed like the stair
    const Z = ([x0,x1,y0,y1]) => { const a=G.T([x0,y0]), b=G.T([x1,y1]); return [Math.min(a[0],b[0]), Math.max(a[0],b[0]), Math.min(a[1],b[1]), Math.max(a[1],b[1])]; };
    const foot=[Z([-h-LAND, -h, 0, h]), Z([-h, 0, h, h+LAND])], top=[Z([-h-LAND, -h, -h, 17]), Z([-h, 0, -h-LAND, -h])];
    const a=G.T([-h*0.5, -h*0.3]), b=G.T([-h*0.5-12, -h*0.3]);   // arriving: on the landing, heading off it to the west
    return { foot, top, arrive:{ p:a, d:[(b[0]-a[0])/12, (b[1]-a[1])/12] } }; }
  if(o.kind==='u'){ const P=sh.P, uL=S.u0+sg*(P.nA-1)*o.run, uBt=uL-sg*(P.nB-1)*o.run, A=[sh.vA0, sh.vA0+o.w], B=[sh.vB0, sh.vB0+o.w];
    return { foot:[[S.u0-sg*LAND, S.u0, ...A], [S.u0-sg*LAND, S.u0, Math.min(A[0],B[0]), Math.max(A[1],B[1])]],
      top:[[uBt-sg*LAND, uBt, ...B], [uBt, uBt+sg*LAND, ...A]], arrive:{ p:[uBt, (B[0]+B[1])/2], d:[-sg,0] } }; }
  const v0=sh.foot.v0, v1=sh.foot.v1, ov = S.side==='N' ? [v0-LAND, v0] : [v1, v1+LAND], uT=S.u0+sg*o.total;
  return { foot:[[S.u0-sg*LAND, S.u0, v0, v1], [S.u0, S.u0+sg*LAND, ...ov]], top:[[uT, uT+sg*LAND, v0, v1], [uT-sg*LAND, uT, ...ov]], arrive:{ p:[uT, (v0+v1)/2], d:[sg,0] } };
}
/* the landings of a stair: { foot:{ ok, rect, why }, top:{ ok, rect, why }, startsOverHole } (rects in plan feet) */
function landings(st, k=state.model){
  if(!st) return null;
  const pods=podList(k), E=ends(st), up=st.above!=null ? pods[st.above] : null;
  const check = (zones, pod, skip) => { if(!zones) return { ok:true, rect:null, why:'' };
    const room=inset(OFFP(k, pod), 4.5/12), holes=floorHoles(k, pod.i, skip), R=zones.map(z=>LR(st, ...z));
    const good=R.find(r=>within(r, room) && !holes.some(h=>over(r,h,2/12)));   // sharing an edge with an opening is fine (that's where you step off)
    return good ? { ok:true, rect:good, why:'' } : { ok:false, rect:R[0], why: R.every(r=>!within(r, room)) ? 'runs into a wall' : 'over a stair opening' }; };
  const foot=check(E.foot, st.p, null);
  const top = up ? check(E.top, up, st.S.id) : { ok:false, rect:null, why:'no pod above' };
  // its first steps (the foot and two treads) mustn't stand over the opening of a stair coming up from below, unless
  // it's the same spiral carrying on up the same column
  const lowRun=Math.min(2*(st.o.run||12), 24)-1, F=st.sh.foot;
  const vw = st.o.kind==='u' ? [st.sh.vA0, st.sh.vA0+st.o.w] : [F.v0, F.v1];   // a U starts up its first flight only
  const low = st.o.kind==='spiral' ? LR(st, F.u0, F.u1, F.v0, F.v1) : LR(st, st.S.u0+(st.S.dir>0?1:-1)*0.6, st.S.u0+(st.S.dir>0?1:-1)*lowRun, vw[0]+0.6, vw[1]-0.6);
  const below=stairsOf(k).filter(b=>b.above===st.p.i);
  const startsOverHole = below.some(b=>b.holesUp.some(h=>over(low,h)) && !(b.o.kind==='spiral' && st.o.kind==='spiral' && Math.abs(b.foot.x-st.foot.x)<0.1 && Math.abs(b.foot.z-st.foot.z)<0.1));
  return { foot, top, startsOverHole };
}
/* the next stair up from this one (from the pod it arrives in to the floor above): candidates, each checked
   → [{ label, note, S, ok, why }] */
function nextOptions(id, k=state.model){
  const st=stairsOf(k).find(x=>x.S.id===id); if(!st || st.above==null) return [];
  const pods=podList(k), A=pods[st.above], lsA=frame(k, A.i); if(!lsA) return [];
  const hasUp=pods.some(q=>q.lv===A.lv+1);
  const E=ends(st), P0=toPlan(st.ls, E.arrive.p), P1=toPlan(st.ls, [E.arrive.p[0]+E.arrive.d[0]*12, E.arrive.p[1]+E.arrive.d[1]*12]);
  const a=toLocal(lsA, P0), a1=toLocal(lsA, P1), du=a1[0]-a[0], dv=a1[1]-a[1], along=Math.abs(du)>=Math.abs(dv), d=Math.sign(du)||1;
  const sideAt = v => v<48 ? 'S' : 'N', other = s => s==='S'?'N':'S';
  const cands=[];
  // the same stair again, right above (a stairwell)
  { const Pf=toPlan(st.ls, [st.S.u0, st.sh.foot.v0+1]), Pg=toPlan(st.ls, [st.S.u0+(st.S.dir>0?12:-12), st.sh.foot.v0+1]), f=toLocal(lsA, Pf), g=toLocal(lsA, Pg);
    if(st.o.kind==='spiral'){ const F=st.sh.foot, cP=toPlan(st.ls, [(F.u0+F.u1)/2, (F.v0+F.v1)/2]), c=toLocal(lsA, cP), G=spiralGeo(st), aP=toPlan(st.ls, [G.c[0]+Math.cos(G.a0), G.c[1]+Math.sin(G.a0)]), aL=toLocal(lsA, aP);
      const ang=Math.atan2(aL[1]-c[1], aL[0]-c[0]), q=((Math.round((ang-Math.PI)/(Math.PI/2))%4)+4)%4;
      cands.push({ label:'The same spiral, right above', note:'one spiral column through every floor', S:{ opt:st.S.opt, u0:+(c[0]-st.o.Q/2).toFixed(2), dir:st.S.dir, side:'S', q } }); }
    else if(Math.abs(g[0]-f[0])>6) cands.push({ label:`The same ${st.o.label.toLowerCase()} stair, right above`, note:'a stairwell: each floor the same', S:{ opt:st.S.opt, u0:+f[0].toFixed(2), dir:Math.sign(g[0]-f[0]), side:sideAt(f[1]+st.o.w/2), q:0 } }); }
  if(along){
    const arrS=sideAt(a[1]), uL=a[0]+d*LAND;   // the far side of the landing you arrive on
    ['std','min','comfort'].forEach(o=>cands.push({ label:`Switchback · ${OPTS[o].label.toLowerCase()}`, note:'turn round on the landing and climb back along the other wall', S:{ opt:o, u0:+uL.toFixed(2), dir:-d, side:other(arrS), q:0 } }));
    cands.push({ label:'Carry straight on', note:'past the landing, the same way, the same wall', S:{ opt:'std', u0:+uL.toFixed(2), dir:d, side:arrS, q:0 } });
    ['u','ucomp'].forEach(o=>[arrS, other(arrS)].forEach(sd=>cands.push({ label:`${OPTS[o].label} from the landing`, note:'starts where you arrive', S:{ opt:o, u0:+uL.toFixed(2), dir:-d, side:sd, q:0 } })));
  }
  // the closest start of each kind to where you arrive
  const arrive = [a[0]+d*LAND/2, a[1]];
  ['std','u','wind','spiral'].forEach(o=>{ let best=null; const L=A.len*12, O=OPTS[o];
    for(const side of ['S','N']) for(const dir of [1,-1]) for(const q of (O.kind==='spiral'?[0,1,2,3]:[0])) for(let x=6.5; x<=L-6.5; x+=(O.kind==='wind'?1:3)){
      const S={ pod:A.i, opt:o, side, dir, q, u0: O.kind==='spiral' ? x : O.kind==='wind' ? (dir>0 ? L-x : x) : (dir>0 ? x : L-x) }, s2=solve(k,S); if(!s2 || s2.why) continue;
      const Ld=landings(s2, k); if(!Ld.foot.ok || !Ld.top.ok || Ld.startsOverHole) continue;
      const fz=ends(s2).foot[0], fc=[(fz[0]+fz[1])/2, (fz[2]+fz[3])/2], dist=Math.hypot(fc[0]-arrive[0], fc[1]-arrive[1]);
      if(!best || dist<best.dist) best={ dist, S }; }
    if(best) cands.push({ label:`Closest start · ${O.label.toLowerCase()}`, note:`its foot about ${Math.round(best.dist/12)}′ from where you arrive`, S:best.S }); });
  // check each: it fits, both landings are clear, it doesn't start over the opening it arrives through
  const seen=new Set();
  return cands.map(c=>{ const S={ pod:A.i, ...c.S }, key=JSON.stringify([S.opt,Math.round(S.u0),S.dir,S.side,S.q]); if(seen.has(key)) return null; seen.add(key);
    const s2=solve(k,S); let why=!hasUp ? `add a pod on floor ${A.lv+2} above first` : !s2 ? 'not here' : s2.why;
    if(!why){ const Ld=landings(s2,k); why = Ld.startsOverHole ? 'it would start over the opening you come up through' : !Ld.foot.ok ? `no landing at its foot (${Ld.foot.why})` : !Ld.top.ok ? `no landing at its top (${Ld.top.why})` : ''; }
    return { ...c, S, ok:!why, why }; }).filter(Boolean);
}
function addStairSpec(S){ return edit(L=>{ let n=1; while(L.some(s=>s.id==='s'+n)) n++; const s={ id:'s'+n, ...S }; L.push(s); return s.id; }); }
export { RAILS, guardRuns, landings, nextOptions, addStairSpec, stairPlan, stairParts, OPTS, stairsOf, stairHoles, addStair, updateStair, removeStair, optionsFor, bestSpot, solve, flipped };
