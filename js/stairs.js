/* Cubit Builder — stairs.js : a stair from the ground floor up to a pod on the second floor.

   A stair sits in a ground-floor pod and climbs into the pod above, through openings cut in the lower pod's ceiling
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
  spiral:  { kind:'spiral', n:16, rise:R/16, run:0, total:0, Q:81.75, post:3, label:'Square spiral', note:'81¾″ square, 3″ post, 16 risers, 22½° wedge treads' , w:39 },
};
// a U stair's two flights: the first takes the extra riser when the count is odd; the landing is as deep as a flight is wide
function uPlan(o){ const nA=Math.ceil(o.n/2), nB=o.n-nA, D=o.w; return { nA, nB, D, lenA:(nA-1)*o.run, lenB:(nB-1)*o.run, len:Math.max(nA-1, nB-1)*o.run + D }; }
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

/* the local footprint and openings of each kind (pod-local inch rects { u0,u1,v0,v1 }) */
function shapeOf(S, o){
  const sg=S.dir>0?1:-1, U=(a,b)=>[Math.min(a,b), Math.max(a,b)];
  if(o.kind==='spiral'){ const Q=o.Q, v0=(96-Q)/2, [u0,u1]=[S.u0, S.u0+Q];
    return { foot:{ u0, u1, v0, v1:v0+Q }, holes:[{ u0:u0-0.5, u1:u1+0.5, v0:v0-0.5, v1:v0+Q+0.5 }] }; }
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
  const pods=podList(k), p=pods[S.pod]; if(!p || p.lv) return null;
  const o=OPTS[S.opt]||OPTS.std, ls=frame(k, S.pod); if(!ls) return null;
  const sh=shapeOf(S, o), L=p.len*12, F=sh.foot;
  const foot=rectPlan(ls, F.u0, F.u1, F.v0, F.v1), holes=sh.holes.map(h=>rectPlan(ls, h.u0, h.u1, h.v0, h.v1)), hole=unionRect(holes);
  // the pod above has to cover every opening
  const OFF=podOffsets(k), inPod = (r,q)=>{ const o2=OFF[q.i], x=q.x+o2.ox, z=q.z+o2.oz; return r.x>=x-0.01 && r.x1<=x+q.w+0.01 && r.z>=z-0.01 && r.z1<=z+q.d+0.01; };
  const above=pods.filter(q=>q.lv).find(q=>holes.every(h=>inPod(h,q)));
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
  const pods=podList(k), list = i!=null ? [pods[i]] : pods.filter(p=>!p.lv);
  for(const p of list){ if(!p || p.lv) continue; const L=p.len*12, o=OPTS[opt]||OPTS.std;
    for(const side of ['S','N']) for(const dir of [1,-1]) for(let a=6.5; a<=L-6.5; a+=1){
      const S={ pod:p.i, dir, side, u0: o.kind==='spiral' ? a : (dir>0 ? a : L-a), opt, q:0 }; const st=solve(k,S); if(st && !st.why) return S; } }
  return null;
}
function edit(fn){ checkpoint(); const key=ensureDraft(); const m=MODELS[key]; m.stairs ||= []; const r=fn(m.stairs, key); if(!m.stairs.length) delete m.stairs; save(); return r; }
function addStair(i=null, opt='std'){
  const k=state.model; let S=null;
  for(const o of [opt, 'std', 'u', 'spiral', 'min']){ S=bestSpot(k, i, o); if(S) break; }
  if(!S) return null;
  return edit(L=>{ let n=1; while(L.some(s=>s.id==='s'+n)) n++; const s={ id:'s'+n, ...S }; L.push(s); return s.id; });
}
function updateStair(id, patch){ return edit(L=>{ const s=L.find(x=>x.id===id); if(s) Object.assign(s, patch); return id; }); }
function removeStair(id){ edit(L=>{ const i=L.findIndex(x=>x.id===id); if(i>=0) L.splice(i,1); }); }
/* the foot of the same stair seen from its other end (for "turn it round") */
function flipped(S){ const o=OPTS[S.opt]||OPTS.std; if(o.kind==='spiral') return { dir:-S.dir }; return { dir:-S.dir, u0:S.u0+S.dir*o.total }; }
/* each option for a stair as it sits now (or at its best spot in this pod): { key, label, note, fits, why, alt, kind } */
function optionsFor(id){
  const k=state.model, S=(MODELS[k]?.stairs||[]).find(x=>x.id===id); if(!S) return [];
  return Object.entries(OPTS).map(([key,o])=>{ const st=solve(k,{...S, opt:key}); const alt=st?.why ? bestSpot(k, S.pod, key) : null;
    const ft = x => `${Math.floor(x/12)}′ ${Math.round(x%12)}″`;
    const note = o.kind==='spiral' ? `${o.n} risers ${o.rise.toFixed(2)}″, 15 wedge treads · ${ft(o.Q)} square`
      : o.kind==='u' ? (P=>`${o.n} risers ${o.rise.toFixed(2)}″, treads ${o.run}″, landing · ${ft(P.len)} long, ${2*o.w}″ wide`)(uPlan(o))
      : `${o.n} risers ${o.rise.toFixed(2)}″, ${o.n-1} treads ${o.run}″ · ${ft(o.total)} long, ${o.w}″ wide`;
    return { key, kind:o.kind, label:o.label, note, fits:!st?.why || !!alt, why:st?.why, alt }; });
}

/* ---------------------------------------------------------------- what it looks like
   3D parts in plan feet / inches up: { kind:'box', x,z,x1,z1, y0,y1 } · { kind:'poly', pts:[[x,z]…], y0,y1 }
   · { kind:'post', x,z, r, y0,y1 } · { kind:'slope', a:[x,z], b:[x,z], ya, yb, t } (a stringer, t feet thick) */
const T=1.5;   // tread thickness ″
function spiralGeo(st){
  const o=st.o, F=st.sh.foot, c=[(F.u0+F.u1)/2, (F.v0+F.v1)/2], h=o.Q/2, a0=Math.PI + (st.S.q||0)*Math.PI/2, sg=st.S.dir<0?-1:1, step=2*Math.PI/16;
  // the square's outline point at angle a (pod-local), and the wedge between two angles (corners included)
  const hit = a => { const cs=Math.cos(a), sn=Math.sin(a), t=h/Math.max(Math.abs(cs), Math.abs(sn)); return [c[0]+cs*t, c[1]+sn*t]; };
  const wedge = (A, B) => { const lo=Math.min(A,B), hi=Math.max(A,B), pts=[c, hit(lo)];
    for(let k=-8;k<=8;k++){ const ca=Math.PI/4+k*Math.PI/2; if(ca>lo+1e-9 && ca<hi-1e-9) pts.push(hit(ca)); } pts.push(hit(hi)); return pts; };
  return { c, h, a0, sg, step, hit, wedge };
}
function stairParts(st){
  const out=[], o=st.o, P=q=>toPlan(st.ls, q), sg=st.S.dir>0?1:-1;
  if(o.kind==='spiral'){ const G=spiralGeo(st), cp=P(G.c);
    out.push({ kind:'post', x:cp[0], z:cp[1], r:o.post/2/12, y0:0, y1:R+1 });
    for(let i=0;i<o.n-1;i++){ const A=G.a0+G.sg*i*G.step, B=A+G.sg*G.step; out.push({ kind:'poly', pts:G.wedge(A,B).map(P), y0:(i+1)*o.rise-T, y1:(i+1)*o.rise }); }
    // the landing plate at the top, over the start (a quarter of the square)
    const A=G.a0+G.sg*(o.n-1)*G.step; out.push({ kind:'poly', pts:G.wedge(A, A+G.sg*Math.PI/2).map(P), y0:R-T, y1:R });
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
  if(o.kind==='spiral'){ const G=spiralGeo(st), walk=[];
    for(let i=0;i<o.n;i++){ const A=G.a0+G.sg*i*G.step; lines.push([P(G.c), P(G.hit(A))]); }
    for(let a=0;a<=(o.n-1);a+=0.25){ const A=G.a0+G.sg*(a+0.5)*G.step, r=G.h*0.55; walk.push(P([G.c[0]+Math.cos(A)*r, G.c[1]+Math.sin(A)*r])); }
    return { lines, walk, post:{ c:P(G.c), r:o.post/2/12 } }; }
  const fl = (uFoot, d, v0, n) => { for(let i=0;i<n;i++){ const u=uFoot+d*i*o.run; lines.push([P([u, v0]), P([u, v0+o.w])]); } return uFoot+d*(n-1)*o.run; };
  if(o.kind==='u'){ const sh=st.sh, Pp=sh.P, vmA=sh.vA0+o.w/2, vmB=sh.vB0+o.w/2;
    const uL=fl(st.S.u0, sg, sh.vA0, Pp.nA), uE=uL+sg*Pp.D; fl(uL, -sg, sh.vB0, Pp.nB);
    lines.push([P([uE, sh.vA0]), P([uE, sh.vB0+(sh.vB0>sh.vA0?o.w:0)])]);
    const uM=uL+sg*Pp.D/2;
    return { lines, walk:[P([st.S.u0, vmA]), P([uM, vmA]), P([uM, vmB]), P([uL-sg*(Pp.nB-1)*o.run, vmB])] }; }
  const v0=st.sh.foot.v0, vm=v0+o.w/2; fl(st.S.u0, sg, v0, o.n);
  return { lines, walk:[P([st.S.u0, vm]), P([st.S.u0 + sg*o.total, vm])] };
}
export { stairPlan, stairParts, OPTS, stairsOf, stairHoles, addStair, updateStair, removeStair, optionsFor, bestSpot, solve, flipped };
