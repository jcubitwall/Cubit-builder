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
  return { C, treads, foot:box(0, WD.foot, 0, B2), hole:box(-0.5, WD.open+0.5, -0.5, B2+0.5),
    footZones:[box(WD.foot, WD.foot+LAND, 0, w), box(WD.foot-LAND, WD.foot, b2, B2)],
    topZones:[box(top-LAND, top, B2, B2+LAND), box(top, top+LAND, b2, B2), box(top-LAND, top, -LAND, 0)],
    arrive:{ p:C(top, b2+w/2), d:[-sg, 0] } };
}
/* the local footprint and openings of each kind (pod-local inch rects { u0,u1,v0,v1 }) */
function shapeOf(S, o){
  const sg=S.dir>0?1:-1, U=(a,b)=>[Math.min(a,b), Math.max(a,b)];
  if(o.kind==='spiral'){ const Q=o.Q, v0=(96-Q)/2, [u0,u1]=[S.u0, S.u0+Q];
    return { foot:{ u0, u1, v0, v1:v0+Q }, holes:[{ u0:u0-0.5, u1:u1+0.5, v0:v0-0.5, v1:v0+Q+0.5 }] }; }
  if(o.kind==='wind'){ const G=windGeo(S); return { foot:G.foot, holes:[G.hole], G }; }
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
  // the pod above has to cover every opening
  const OFF=podOffsets(k), inPod = (r,q)=>{ const o2=OFF[q.i], x=q.x+o2.ox, z=q.z+o2.oz; return r.x>=x-0.01 && r.x1<=x+q.w+0.01 && r.z>=z-0.01 && r.z1<=z+q.d+0.01; };
  const above=pods.filter(q=>q.lv===p.lv+1).find(q=>holes.every(h=>inPod(h,q)));
  const why = F.u0 < 6.5-0.01 || F.u1 > L-6.5+0.01 ? `needs ${Math.ceil((F.u1-F.u0)/12*10)/10}′ clear along the pod`
            : F.v0 < 4.5-0.01 || F.v1 > 96-4.5+0.01 ? 'too wide for this pod' : !above ? 'the opening has to be under an upstairs pod' : '';
  return { S, o, p, ls, foot, hole, holes, above:above?above.i:null, why, sh, op:sh.op || { a:0, b:F.u1-F.u0 } };
}
const stairsOf = (k=state.model) => (MODELS[k]?.stairs||[]).map(S=>solve(k,S)).filter(Boolean);

/* the stair holes in one layer (layer-local inches, as holes): the lower pod's ceiling and roof, the upper pod's floor */
function stairHoles(ls, k=state.model){
  const out=[];
  stairsOf(k).forEach(st=>{ if(st.above==null) return;
    const mine = (ls.pod.i===st.S.pod && (ls.kind==='ceiling-int' || ls.kind==='roof')) || (ls.pod.i===st.above && ls.kind==='floor-up');
    if(!mine) return;
    st.holes.forEach(H=>{ const P=[[H.x,H.z],[H.x1,H.z],[H.x1,H.z1],[H.x,H.z1]].map(q=>toLocal(ls,q));
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
const T=1.5;   // tread thickness ″
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
  if(o.kind==='wind'){ st.sh.G.treads.forEach((pts,i)=>out.push({ kind:'poly', pts:pts.map(P), y0:(i+1)*o.rise-T, y1:(i+1)*o.rise }));
    // a carriage under the first flight, and a post at each winder pivot
    const G=st.sh.G; [[0.75],[WD.w-0.75]].forEach(([b])=>out.push({ kind:'slope', a:P(G.C(WD.foot,b)), b:P(G.C(WD.w,b)), ya:0, yb:WD.A*o.rise, t:1.5/12 }));
    [[WD.w,WD.w],[WD.w,WD.w+WD.gap]].forEach(([a,b])=>{ const c=P(G.C(a,b)); out.push({ kind:'box', x:c[0]-1.75/12, z:c[1]-1.75/12, x1:c[0]+1.75/12, z1:c[1]+1.75/12, y0:0, y1:R }); });
    return out; }
  const flight = (uFoot, d, v0, n, y0, landTo) => {   // n risers from y0; treads between them
    for(let i=0;i<n-1;i++){ const u=uFoot+d*i*o.run, r=rectPlan(st.ls, Math.min(u, u+d*(o.run+1)), Math.max(u, u+d*(o.run+1)), v0, v0+o.w); out.push({ kind:'box', ...r, y0:y0+(i+1)*o.rise-T, y1:y0+(i+1)*o.rise }); }
    const uTop=uFoot+d*(n-1)*o.run;
    [v0+0.75, v0+o.w-0.75].forEach(v=>out.push({ kind:'slope', a:P([uFoot, v]), b:P([uTop, v]), ya:y0, yb:y0+n*o.rise, t:1.5/12 }));
    return uTop; };
  if(o.kind==='u'){ const sh=st.sh, Pp=sh.P;
    const uLand = flight(st.S.u0, sg, sh.vA0, Pp.nA, 0);
    // the landing, both flights wide, at the top of the first flight
    const yL=Pp.nA*o.rise, r=rectPlan(st.ls, Math.min(uLand, uLand+sg*Pp.D), Math.max(uLand, uLand+sg*Pp.D), Math.min(sh.vA0, sh.vB0), Math.max(sh.vA0, sh.vB0)+o.w);
    out.push({ kind:'box', ...r, y0:yL-T, y1:yL });
    flight(uLand, -sg, sh.vB0, Pp.nB, yL);
    return out; }
  flight(st.S.u0, sg, st.sh.foot.v0, o.n, 0);
  return out;
}
/* the stair in plan feet, for the 2D and the sheets: the lines to draw and the walking line (a polyline up the
   middle, its arrow at the top) */
function stairPlan(st){
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
const floorHoles = (k, i, skip=null) => stairsOf(k).filter(st=>st.above===i && st.S.id!==skip).flatMap(st=>st.holes);
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
  const startsOverHole = below.some(b=>b.holes.some(h=>over(low,h)) && !(b.o.kind==='spiral' && st.o.kind==='spiral' && Math.abs(b.foot.x-st.foot.x)<0.1 && Math.abs(b.foot.z-st.foot.z)<0.1));
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
export { landings, nextOptions, addStairSpec, stairPlan, stairParts, OPTS, stairsOf, stairHoles, addStair, updateStair, removeStair, optionsFor, bestSpot, solve, flipped };
