/* Cubit Builder — layout.js
   Pods, wall slots, wall letters and ground screws for a home model.
   Plan units are feet. Seen from above, +x is to the right and +z is down the screen, so going
   clockwise means S → E → N → W. A pod can be turned in 90° steps (rot 0/90/180/270, clockwise):
   at 0/180 its length runs along x, at 90/270 along z. */
import { FT, GAP, POD, SIDE_NAME, LAYER_KINDS } from './config.js';
import { MODELS, podById } from './data.js';
import { pickFor, state } from './state.js';

const EPS = 1e-6;
const podList = modelKey => MODELS[modelKey].pods.map((p,i)=>{
  const len=POD[p.t].len, rot=((p.rot||0)%360+360)%360, alongX = rot%180===0;
  const w = alongX ? len : 8, d = alongX ? 8 : len;
  return {...p, i, rot, len, w, d, alongX, x1:p.x+w, z1:p.z+d, label:`Pod ${i+1}`, long:`Pod ${i+1} (${len}′)`};
});
/* which world side a pod's own (local, unturned) side ends up on, and back */
const ROT_SIDE = {0:{S:'S',E:'E',N:'N',W:'W'}, 90:{S:'E',E:'N',N:'W',W:'S'}, 180:{S:'N',E:'W',N:'S',W:'E'}, 270:{S:'W',E:'S',N:'E',W:'N'}};
const worldSide = (rot, local) => ROT_SIDE[rot][local];
const localSide = (rot, world) => Object.keys(ROT_SIDE[rot]).find(k=>ROT_SIDE[rot][k]===world);

/* The layout in models.json is the nominal grid. Every joint between pods adds exactly 5/8″:
   a pod moves over by one gap for each joint line between it and the datum. A joint line is a
   coordinate where one pod ends and a neighbouring pod starts beside it. */
function podOffsets(modelKey){
  const P = podList(modelKey);
  const joints = axis => {
    const lines = new Set();
    P.forEach(p=>P.forEach(q=>{
      if(p===q) return;
      if(axis==='x' && Math.abs(p.x1-q.x)<EPS && Math.min(p.z1,q.z1)-Math.max(p.z,q.z)>EPS) lines.add(q.x);
      if(axis==='z' && Math.abs(p.z1-q.z)<EPS && Math.min(p.x1,q.x1)-Math.max(p.x,q.x)>EPS) lines.add(q.z);
    }));
    return [...lines];
  };
  const jx = joints('x'), jz = joints('z');
  return P.map(p=>({ ox: jx.filter(v=>v<=p.x+EPS).length*GAP, oz: jz.filter(v=>v<=p.z+EPS).length*GAP }));
}

/* ============================================================ wall slots per model
   Every pod has its own four walls. Where pods join, BOTH pods keep a 4½″ interior wall
   (slot type 'int'); the rest of each side is exterior (6½″, type 'ext'). */
function slotsFor(modelKey){
  const OFF = podOffsets(modelKey);
  const pods = podList(modelKey);
  const shift = (pt,pi)=>[pt[0]+OFF[pi].ox, pt[1]+OFF[pi].oz];
  const slots=[];
  const sub=(a,b,cov)=>{ let segs=[[a,b]]; cov.forEach(([c,d])=>{ const out=[]; segs.forEach(([s,e])=>{ if(d<=s||c>=e){out.push([s,e]);return;} if(c>s)out.push([s,c]); if(d<e)out.push([d,e]); }); segs=out; }); return segs.filter(([s,e])=>e-s>=4-EPS); };
  const ends = (s,a,b)=>{
    const A = s.axis==='x' ? [a,s.fixed] : [s.fixed,a], B = s.axis==='x' ? [b,s.fixed] : [s.fixed,b];
    // left end when standing outside the wall: right = (-n) × up  => (n.z, -n.x) in plan
    const r=[s.n[1],-s.n[0]]; return (A[0]*r[0]+A[1]*r[1]) <= (B[0]*r[0]+B[1]*r[1]) ? [A,B] : [B,A];
  };
  pods.forEach(p=>{
    const sides=[
      {k:'S', fixed:p.z,  a:p.x, b:p.x1, axis:'x', n:[0,-1]},
      {k:'N', fixed:p.z1, a:p.x, b:p.x1, axis:'x', n:[0, 1]},
      {k:'W', fixed:p.x,  a:p.z, b:p.z1, axis:'z', n:[-1,0]},
      {k:'E', fixed:p.x1, a:p.z, b:p.z1, axis:'z', n:[ 1,0]}];
    sides.forEach(s=>{
      // feet from the left end of this side seen from outside (doesn't change when the pod is turned)
      const fromOf = (a,b) => (s.k==='S'||s.k==='E') ? s.b-b : a-s.a;
      const cov=[];
      pods.forEach(q=>{ if(q===p) return;
        let iv=null;
        if(s.k==='S' && Math.abs(q.z1-s.fixed)<EPS) iv=[Math.max(q.x,s.a),Math.min(q.x1,s.b)];
        if(s.k==='N' && Math.abs(q.z -s.fixed)<EPS) iv=[Math.max(q.x,s.a),Math.min(q.x1,s.b)];
        if(s.k==='W' && Math.abs(q.x1-s.fixed)<EPS) iv=[Math.max(q.z,s.a),Math.min(q.z1,s.b)];
        if(s.k==='E' && Math.abs(q.x -s.fixed)<EPS) iv=[Math.max(q.z,s.a),Math.min(q.z1,s.b)];
        if(iv && iv[1]-iv[0]>EPS) cov.push({iv,q});
      });
      // joined stretches: this pod's own 4½″ wall facing the neighbour
      cov.filter(c=>c.iv[1]-c.iv[0]>=4-EPS).forEach(({iv:[a,b],q})=>{
        const [p0,p1]=ends(s,a,b);
        slots.push({ id:`${p.i}${s.k}${a}i`, type:'int', pod:p, other:q, side:s.k, a, b, len:b-a, p0n:p0, p1n:p1, p0:shift(p0,p.i), p1:shift(p1,p.i), n:s.n, sideLen:s.b-s.a, from:fromOf(a,b), local:localSide(p.rot,s.k) });
      });
      sub(s.a,s.b,cov.map(c=>c.iv)).forEach(([a,b])=>{
        const [p0,p1]=ends(s,a,b);
        slots.push({ id:`${p.i}${s.k}${a}`, type:'ext', pod:p, side:s.k, a, b, len:b-a, p0n:p0, p1n:p1, p0:shift(p0,p.i), p1:shift(p1,p.i), n:s.n, sideLen:s.b-s.a, from:fromOf(a,b), local:localSide(p.rot,s.k) });
      });
    });
  });
  fitShortWalls(slots, pods);
  assignLetters(modelKey, slots, pods);
  slots.forEach(s=>{
    // which ends of the wall sit at a corner of its pod (where the steel spine notch is)
    const P=s.pod, isCorner = c => (Math.abs(c[0]-P.x)<EPS||Math.abs(c[0]-P.x1)<EPS) && (Math.abs(c[1]-P.z)<EPS||Math.abs(c[1]-P.z1)<EPS);
    s.corner=[isCorner(s.p0n), isCorner(s.p1n)];
    s.label = `${s.pod.label} · Wall ${s.letter}`;
    s.detail = s.type==='int' ? `interior, faces ${s.other.label}` : (s.len < s.sideLen ? 'exterior part' : 'exterior');
  });
  slots.sort((a,b)=> a.pod.i-b.pod.i || a.letter.localeCompare(b.letter, undefined, {numeric:true}));
  return slots;
}

/* ============================================================ long vs short walls
   The long walls (B and D, along the pod's length) always run the full length. The short end walls
   (A and C) sit between them, so each end loses the thickness of the long wall it butts into.
   An 8′ × 8′ pod has no long side; the sides along x (S, N) are treated as long when it isn't turned. */
const isLongSide = (pod, side) => pod.alongX ? (side==='S'||side==='N') : (side==='W'||side==='E');
function fitShortWalls(slots, pods){
  slots.forEach(s=>{
    s.short = !isLongSide(s.pod, s.side);
    s.trim=[0,0];
    if(!s.short) return;
    const p=s.pod;
    // the long wall passing through a corner point of this short wall
    const thickAt = c => {
      const long = slots.find(q=>q.pod===p && isLongSide(p,q.side) && (
        (q.side==='S'||q.side==='N') ? Math.abs(q.p0n[1]-c[1])<EPS && Math.min(q.a,q.b)-EPS<=c[0] && c[0]<=Math.max(q.a,q.b)+EPS
                                     : Math.abs(q.p0n[0]-c[0])<EPS && Math.min(q.a,q.b)-EPS<=c[1] && c[1]<=Math.max(q.a,q.b)+EPS));
      const w = long && pickFor(long);
      return w ? (w.t || (long.type==='int'?4.5:6.5)) : 6.5;
    };
    s.trim=[thickAt(s.p0n), thickAt(s.p1n)];
  });
}

/* ============================================================ wall letters
   Each pod's walls are A, B, C, D going CLOCKWISE (seen from above). Wall A is always a SHORT end wall —
   the end with a door. Which end:
     1. a wall you set with "Make this Wall A" (saved per model, per pod), else
     2. the model's own setting in models.json ("wallA": {"<pod number>": "S|E|N|W"}), else
     3. the end with an exterior door, else a patio door, else an interior door, else the outside end.
   So A and C are the short walls, B and D the long ones.
   A side split into an exterior part and an interior part keeps one letter, numbered 1, 2 clockwise. */
const CW = ['S','E','N','W'];
function doorWall(modelKey, pod, slots){
  const okA = k => CW.includes(k) && (pod.len<=8 || !isLongSide(pod,k));
  const own = state.wallA?.[modelKey]?.[pod.i];
  if(own && okA(own)) return own;
  const fromModel = MODELS[modelKey].wallA?.[pod.i+1];
  if(fromModel && okA(fromModel)) return fromModel;
  const podA = pod.a || podById(pod.src)?.a;           // kept on the pod in its own frame
  if(podA && okA(worldSide(pod.rot,podA))) return worldSide(pod.rot,podA);
  const opsOn = (side, type) => slots.filter(s=>s.pod===pod && s.side===side && (!type || s.type===type)).flatMap(s=>pickFor(s)?.openings||[]);
  // Wall A is always one of the short end walls (on an 8′ × 8′ pod any wall can be A)
  const cand = pod.len>8 ? CW.filter(k=>!isLongSide(pod,k)) : CW;
  return cand.find(k=>opsOn(k,'ext').some(o=>o.kind==='door'))
      || cand.find(k=>opsOn(k,'ext').some(o=>o.kind==='patio'))
      || cand.find(k=>opsOn(k).some(o=>o.kind==='door'))
      || cand.find(k=>opsOn(k,'ext').length)
      || cand[0];
}
function assignLetters(modelKey, slots, pods){
  pods.forEach(pod=>{
    const start = doorWall(modelKey, pod, slots);
    const order = CW.slice(CW.indexOf(start)).concat(CW.slice(0, CW.indexOf(start)));
    order.forEach((side, li)=>{
      const mine = slots.filter(s=>s.pod===pod && s.side===side);
      // clockwise along each side: S → +x, E → +z, N → −x, W → −z
      const dir = {S:1, E:1, N:-1, W:-1}[side];
      mine.sort((u,v)=> (u.a-v.a)*dir);
      mine.forEach((s,k)=>{ s.letter = 'ABCD'[li] + (mine.length>1 ? String(k+1) : ''); s.wallSide = side; });
    });
    pod.wallA = start;
  });
}

/* ============================================================ ground screws
   Screws are never doubled up: where pods meet they share one screw that sits in the CENTRE of the 5/8″
   joint, carrying both pods. Around the outside the screw sits just inside the floor edge (the inset) with a
   swivel head, so a deck or another pod can be added later.

   The layout is built from support lines:
     · a perimeter line inside each pod's outside edge (at the inset),
     · a joint line down the middle of every joint (collinear joints between several pod pairs are one line).
   Each line gets a screw at both ends, at every place another joint line crosses or tees into it, and
   evenly spaced screws between those so no gap is over 8′. Where a line ends against a joint, its end
   screw is the one on that joint, so the screws "hop into the centre". Screws that still land within 18″ of
   each other are merged into one (that happens at inside corners where three pods meet).
   Head types: swivel (one pod), centre (2 pods), tee (3 pods), cross (4 pods). */
const NORM={S:[0,-1],N:[0,1],W:[-1,0],E:[1,0]};
const HEAD_FOR = n => n<=1 ? 'swivel' : n===2 ? 'centre' : n===3 ? 'tee' : 'cross';
function screwPlan(modelKey, insetIn){
  const i=insetIn/FT, E=1e-4, G=GAP, MAX=8, MERGE=1.5;
  const OFF = podOffsets(modelKey);
  const P = podList(modelKey).map(p=>{ const x=p.x+OFF[p.i].ox, z=p.z+OFF[p.i].oz; return {i:p.i, len:p.len, x, z, x1:x+p.w, z1:z+p.d}; });
  const lines=[];
  P.forEach(p=>{
    [{k:'S',ax:'x',e:p.z, a:p.x,b:p.x1,n:[0,-1]},{k:'N',ax:'x',e:p.z1,a:p.x,b:p.x1,n:[0,1]},
     {k:'W',ax:'z',e:p.x, a:p.z,b:p.z1,n:[-1,0]},{k:'E',ax:'z',e:p.x1,a:p.z,b:p.z1,n:[1,0]}].forEach(sd=>{
      const sg = sd.n[0]+sd.n[1];
      const cov=[];
      P.forEach(q=>{ if(q===p) return;
        const qe = sd.ax==='x' ? (sg>0?q.z:q.z1) : (sg>0?q.x:q.x1);
        if(Math.abs(qe-(sd.e+sg*G))>E) return;
        const a=Math.max(sd.ax==='x'?q.x:q.z, sd.a), b=Math.min(sd.ax==='x'?q.x1:q.z1, sd.b);
        if(b-a>E) cov.push([a,b,q.i]);
      });
      if(sg>0) cov.forEach(([a,b,qi])=>lines.push({kind:'joint', ax:sd.ax, c:sd.e+G/2, a, b, pods:[p.i,qi]}));
      let segs=[[sd.a,sd.b]];
      cov.forEach(([c,d])=>{ const out=[]; segs.forEach(([u,v])=>{ if(d<=u+E||c>=v-E){out.push([u,v]);return;} if(c>u+E)out.push([u,c]); if(d<v-E)out.push([d,v]); }); segs=out; });
      segs.filter(([u,v])=>v-u>E).forEach(([a,b])=>lines.push({kind:'ext', ax:sd.ax, c:sd.e-sg*i, edge:sd.e, a, b, pods:[p.i], n:sd.n}));
    });
  });
  // one line per straight joint, even when it runs past several pods
  const J=[]; lines.filter(l=>l.kind==='joint').sort((u,v)=>u.ax.localeCompare(v.ax)||u.c-v.c||u.a-v.a).forEach(l=>{
    const last=J[J.length-1];
    if(last && last.ax===l.ax && Math.abs(last.c-l.c)<E && l.a<=last.b+G+E){ last.b=Math.max(last.b,l.b); l.pods.forEach(x=>{ if(!last.pods.includes(x)) last.pods.push(x); }); }
    else J.push({...l, pods:l.pods.slice()});
  });
  const X = lines.filter(l=>l.kind==='ext');
  const crossing = (l, end) => J.find(o=>o.ax!==l.ax && Math.abs(o.c-end)<=G+E && l.c>=o.a-G-E && l.c<=o.b+G+E);
  const endsOf = l => [[l.a,+1],[l.b,-1]];
  J.forEach(l=>{ l.st=endsOf(l).map(([e,dir])=>{ const o=crossing(l,e); return {t: o?o.c : e+dir*i}; });
    // joints crossing or teeing into this one
    J.forEach(o=>{ if(o.ax===l.ax) return; if(o.c>l.a+E && o.c<l.b-E && l.c>=o.a-G-E && l.c<=o.b+G+E) l.st.push({t:o.c}); });
  });
  X.forEach(l=>{ l.st=endsOf(l).map(([e,dir])=>{
    const o=crossing(l,e); if(o) return {t:o.c};
    // the joint carries on in line with this edge (an inside corner): its end screw serves this end
    const co=J.find(j=>j.ax===l.ax && Math.abs(Math.abs(j.c-l.edge)-G/2)<E && (Math.abs(j.a-e)<G+E || Math.abs(j.b-e)<G+E));
    if(co){ const js = Math.abs(co.a-e)<G+E ? co.st[0] : co.st[1]; return {t:js.t, virtual:true}; }
    return {t:e+dir*i};
  }); });
  // stations → points, with even fill (no gap over 8′)
  const pts=[];
  [...J, ...X].forEach((l,li)=>{
    const st=l.st.slice().sort((u,v)=>u.t-v.t).filter((s,k,a)=>k===0||s.t-a[k-1].t>E);
    const at=t=>l.ax==='x'?[t,l.c]:[l.c,t];
    const add=(t,virtual)=>{ if(!virtual) pts.push({p:at(t), line:l}); };
    st.forEach((s,k)=>{ add(s.t,s.virtual); if(k<st.length-1){ const D=st[k+1].t-s.t, n=Math.ceil(D/MAX-1e-9); for(let m=1;m<n;m++) add(s.t+D*m/n,false); } });
  });
  // merge screws that land together (or within 18″)
  const groups=[];
  pts.forEach(q=>{ const g=groups.find(g=>Math.hypot(g.p[0]-q.p[0],g.p[1]-q.p[1])<MERGE); if(g){ g.items.push(q); } else groups.push({p:q.p.slice(), items:[q]}); });
  groups.forEach(g=>{
    // keep the spot most lines agree on, joints first
    const score=q=>g.items.filter(o=>Math.hypot(o.p[0]-q.p[0],o.p[1]-q.p[1])<E).length*10 + (q.line.kind==='joint'?1:0);
    g.p=g.items.reduce((best,q)=>score(q)>score(best)?q:best, g.items[0]).p.slice();
  });
  const screws = groups.map(g=>{
    const [x,z]=g.p;
    const pods=P.filter(p=>x>=p.x-G/2-0.02 && x<=p.x1+G/2+0.02 && z>=p.z-G/2-0.02 && z<=p.z1+G/2+0.02).map(p=>p.i);
    const head=HEAD_FOR(pods.length);
    const prim=pods.slice().sort((u,v)=>P[v].len-P[u].len||u-v)[0] ?? g.items[0].line.pods[0];
    const ext=g.items.find(q=>q.line.kind==='ext'), jn=g.items.find(q=>q.line.kind==='joint');
    // bracket direction: swivel heads turned in under their pod; centre heads square across the joint
    const dir = head==='swivel' ? (ext ? [-ext.line.n[0],-ext.line.n[1]] : [0,1]) : (jn ? (jn.line.ax==='x'?[0,1]:[1,0]) : [0,1]);
    return { x, z, pod:prim, pods, head, shared:pods.length>1, toward:pods.find(q=>q!==prim), dir };
  });
  // checks: no two screws close together; no gap over 8′ along any support line
  const warnings=[];
  for(let a=0;a<screws.length;a++) for(let b=a+1;b<screws.length;b++){ const d=Math.hypot(screws[a].x-screws[b].x, screws[a].z-screws[b].z); if(d<3) warnings.push({kind:'close', a, b, d}); }
  [...J, ...X].forEach(l=>{
    const on=screws.map((s,k)=>({k, t:l.ax==='x'?s.x:s.z, off:Math.abs((l.ax==='x'?s.z:s.x)-l.c)})).filter(o=>o.off<MERGE && o.t>=l.a-MERGE && o.t<=l.b+MERGE).sort((u,v)=>u.t-v.t);
    for(let k=0;k<on.length-1;k++) if(on[k+1].t-on[k].t>MAX+0.05) warnings.push({kind:'gap', a:on[k].k, b:on[k+1].k, d:on[k+1].t-on[k].t});
  });
  return {screws, warnings, lines:{joints:J.length, perimeter:X.length}};
}
const screwsFor = (modelKey, insetIn) => screwPlan(modelKey, insetIn).screws;

/* Each pod has four horizontal layers: exterior floor, interior floor, interior ceiling, roof */
function layerSlotsFor(modelKey){
  const OFF=podOffsets(modelKey);
  return podList(modelKey).flatMap(p=>Object.keys(LAYER_KINDS).map(kind=>({ id:`${p.i}:${kind}`, layer:true, kind, pod:p, len:p.len, rot:p.rot,
    x:p.x+OFF[p.i].ox, z:p.z+OFF[p.i].oz, w:p.w, d:p.d, label:`${p.label} · ${LAYER_KINDS[kind].label}` })));
}
/* The neighbour's wall on the other side of the same joint (both pods keep their own 4½″ wall) */
const partnerOf = (slot, slots) => slot.type!=='int' ? null :
  slots.find(q=>q.type==='int' && q.pod===slot.other && q.other===slot.pod && Math.abs(q.a-slot.a)<EPS && Math.abs(q.b-slot.b)<EPS) || null;
const podLabels = modelKey => podList(modelKey).reduce((a,p)=>(a[p.i]=p.long,a),{});

export { podOffsets, slotsFor, NORM, screwsFor, screwPlan, HEAD_FOR, podList, podLabels, CW, layerSlotsFor, partnerOf, worldSide, localSide, isLongSide, ROT_SIDE };
