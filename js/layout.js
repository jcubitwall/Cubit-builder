/* Cubit Builder — layout.js
   Pods, wall slots, wall letters and ground screws for a home model.
   Plan units are feet. x = along a pod's length, z = across it (8′). Seen from above,
   +x is to the right and +z is down the screen, so going clockwise means S → E → N → W. */
import { FT, GAP, POD, SIDE_NAME } from './config.js';
import { MODELS } from './data.js';
import { pickFor, state } from './state.js';

const EPS = 1e-6;
const podList = modelKey => MODELS[modelKey].pods.map((p,i)=>({...p, i, len:POD[p.t].len, x1:p.x+POD[p.t].len, z1:p.z+8,
  label:`Pod ${i+1}`, long:`Pod ${i+1} (${POD[p.t].len}′)`}));

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
        slots.push({ id:`${p.i}${s.k}${a}i`, type:'int', pod:p, other:q, side:s.k, a, b, len:b-a, p0:shift(p0,p.i), p1:shift(p1,p.i), n:s.n });
      });
      sub(s.a,s.b,cov.map(c=>c.iv)).forEach(([a,b])=>{
        const [p0,p1]=ends(s,a,b);
        slots.push({ id:`${p.i}${s.k}${a}`, type:'ext', pod:p, side:s.k, a, b, len:b-a, p0:shift(p0,p.i), p1:shift(p1,p.i), n:s.n });
      });
    });
  });
  fitShortWalls(slots, pods);
  assignLetters(modelKey, slots, pods);
  slots.forEach(s=>{
    s.label = `${s.pod.label} · Wall ${s.letter}`;
    s.detail = s.type==='int' ? `interior, faces ${s.other.label}` : (s.len < ((s.side==='S'||s.side==='N')?s.pod.len:8) ? 'exterior part' : 'exterior');
  });
  slots.sort((a,b)=> a.pod.i-b.pod.i || a.letter.localeCompare(b.letter, undefined, {numeric:true}));
  return slots;
}

/* ============================================================ long vs short walls
   The long walls (S and N, along the pod's length) always run the full length. The short end walls
   (W and E) sit between them, so each end loses the thickness of the long wall it butts into.
   An 8′ × 8′ pod has no long side; its S and N walls are treated as the long ones. */
const isShort = s => s.side==='W' || s.side==='E';
function fitShortWalls(slots, pods){
  slots.forEach(s=>{
    s.short = isShort(s);
    if(!s.short){ s.trim=[0,0]; return; }
    const p=s.pod, x = s.side==='W' ? p.x : p.x1;
    // left end seen from outside: W side → S corner, E side → N corner
    const leftSide = s.side==='W' ? 'S' : 'N', rightSide = s.side==='W' ? 'N' : 'S';
    const thick = side => {
      const long = slots.find(q=>q.pod===p && q.side===side && q.a<=x+1e-6 && q.b>=x-1e-6);
      const w = long && pickFor(long);
      return w ? (w.t || (long.type==='int'?4.5:6.5)) : 6.5;
    };
    s.trim=[thick(leftSide), thick(rightSide)];
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
  const okA = k => CW.includes(k) && (pod.len<=8 || k==='W' || k==='E');
  const own = state.wallA?.[modelKey]?.[pod.i];
  if(own && okA(own)) return own;
  const fromModel = MODELS[modelKey].wallA?.[pod.i+1];
  if(fromModel && okA(fromModel)) return fromModel;
  const opsOn = (side, type) => slots.filter(s=>s.pod===pod && s.side===side && (!type || s.type===type)).flatMap(s=>pickFor(s)?.openings||[]);
  // Wall A is always one of the short end walls (on an 8′ × 8′ pod any wall can be A)
  const cand = pod.len>8 ? ['E','W'] : CW;
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
   Screws sit just inside the floor around each pod's perimeter. Corners always get one;
   long sides get extras so no gap exceeds 8′ (spacing comes out a little under 8′).
   Where two pods meet there is ONE row: the larger pod keeps its screws and their offset
   bracket is turned to reach under the neighbour; the smaller pod's screws on that edge are dropped.
   Every other screw has the same bracket turned 180°, flush under its own pod. */
const NORM={S:[0,-1],N:[0,1],W:[-1,0],E:[1,0]};
function screwsFor(modelKey, insetIn){
  const i=insetIn/FT, eps=1e-6;
  const OFF = podOffsets(modelKey);
  const pods=podList(modelKey).map(p=>({...p,pi:p.i}));
  let all=[];
  pods.forEach(p=>{
    const L=p.len, xs=[], zs=[];
    const nx=Math.ceil((L-2*i)/8-1e-9), nz=Math.ceil((8-2*i)/8-1e-9);
    for(let k=0;k<=nx;k++) xs.push(i+(L-2*i)*k/nx);
    for(let k=0;k<=nz;k++) zs.push(i+(8-2*i)*k/nz);
    const pts=new Map(); const add=(x,z)=>pts.set(x.toFixed(4)+','+z.toFixed(4),[x,z]);
    xs.forEach(x=>{ add(x,zs[0]); add(x,zs[zs.length-1]); });
    zs.forEach(z=>{ add(xs[0],z); add(xs[xs.length-1],z); });
    [...pts.values()].forEach(([x,z])=>{
      const sides=[]; if(Math.abs(z-zs[0])<eps) sides.push('S'); if(Math.abs(z-zs[zs.length-1])<eps) sides.push('N');
      if(Math.abs(x-xs[0])<eps) sides.push('W'); if(Math.abs(x-xs[xs.length-1])<eps) sides.push('E');
      const inn=NORM[sides[0]];
      all.push({pod:p.pi, x:p.x+x+OFF[p.pi].ox, z:p.z+z+OFF[p.pi].oz, lx:p.x+x, lz:p.z+z, sides, shared:false, toward:null, dir:[-inn[0],-inn[1]], spacing:(L-2*i)/nx});
    });
  });
  const edges=[];
  pods.forEach(p=>pods.forEach(q=>{
    if(p===q) return;
    if(Math.abs(p.z1-q.z)<eps){ const a=Math.max(p.x,q.x), b=Math.min(p.x1,q.x1); if(b-a>=4-eps) edges.push({p,q,ps:'N',qs:'S',axis:'x',a,b}); }
    if(Math.abs(p.x1-q.x)<eps){ const a=Math.max(p.z,q.z), b=Math.min(p.z1,q.z1); if(b-a>=4-eps) edges.push({p,q,ps:'E',qs:'W',axis:'z',a,b}); }
  }));
  const drop=new Set();
  edges.forEach(e=>{
    const pOwns = e.p.len>e.q.len || (e.p.len===e.q.len && e.p.pi<e.q.pi);
    const own = pOwns? e.p : e.q, oth = pOwns? e.q : e.p, os = pOwns? e.ps : e.qs, ts = pOwns? e.qs : e.ps;
    all.forEach((sc,idx)=>{
      const along = e.axis==='x'? sc.lx : sc.lz;
      if(sc.pod===own.pi && sc.sides.includes(os) && along>=e.a-i-eps && along<=e.b+i+eps && !sc.shared){
        sc.shared=true; sc.toward=oth.pi; sc.dir=NORM[os].slice();
      }
      if(sc.pod===oth.pi && sc.sides.includes(ts) && along>=e.a-eps && along<=e.b+eps) drop.add(idx);
    });
  });
  return all.filter((sc,idx)=>!drop.has(idx) || sc.shared);
}

const podLabels = modelKey => podList(modelKey).reduce((a,p)=>(a[p.i]=p.long,a),{});

export { podOffsets, slotsFor, NORM, screwsFor, podList, podLabels, CW };
