/* Cubit Builder — layout.js */
import { FT, GAP, POD, SIDE_NAME } from './config.js';
import { MODELS } from './data.js';

// real position of each pod once the 5/8" joint spaces are added (layout above is the nominal grid)
function podOffsets(modelKey){
  const P=MODELS[modelKey].pods;
  const xs=[...new Set(P.map(p=>p.x))].sort((a,b)=>a-b), zs=[...new Set(P.map(p=>p.z))].sort((a,b)=>a-b);
  return P.map(p=>({ox:xs.indexOf(p.x)*GAP, oz:zs.indexOf(p.z)*GAP}));
}

/* ============================================================ wall slots per model */
function slotsFor(modelKey){
  const OFF = podOffsets(modelKey);
  const pods = MODELS[modelKey].pods.map((p,i)=>({...p,i,len:POD[p.t].len,x1:p.x+POD[p.t].len,z1:p.z+8}));
  const shift = (pt,pi)=>[pt[0]+OFF[pi].ox, pt[1]+OFF[pi].oz];
  const counts={}; pods.forEach(p=>counts[p.t]=(counts[p.t]||0)+1);
  const seen={}; pods.forEach(p=>{ seen[p.t]=(seen[p.t]||0)+1; p.label = POD[p.t].name + (counts[p.t]>1 ? ' '+'ABCD'[seen[p.t]-1] : ''); });
  const slots=[];
  const sub=(a,b,cov)=>{ let segs=[[a,b]]; cov.forEach(([c,d])=>{ const out=[]; segs.forEach(([s,e])=>{ if(d<=s||c>=e){out.push([s,e]);return;} if(c>s)out.push([s,c]); if(d<e)out.push([d,e]); }); segs=out; }); return segs.filter(([s,e])=>e-s>=4-1e-6); };
  pods.forEach(p=>{
    const sides=[
      {k:'S', fixed:p.z,  a:p.x, b:p.x1, axis:'x', n:[0,-1]},
      {k:'N', fixed:p.z1, a:p.x, b:p.x1, axis:'x', n:[0, 1]},
      {k:'W', fixed:p.x,  a:p.z, b:p.z1, axis:'z', n:[-1,0]},
      {k:'E', fixed:p.x1, a:p.z, b:p.z1, axis:'z', n:[ 1,0]}];
    sides.forEach(s=>{
      const cov=[];
      pods.forEach(q=>{ if(q===p) return;
        if(s.k==='S' && Math.abs(q.z1-s.fixed)<1e-6) cov.push([Math.max(q.x,s.a),Math.min(q.x1,s.b)]);
        if(s.k==='N' && Math.abs(q.z -s.fixed)<1e-6) cov.push([Math.max(q.x,s.a),Math.min(q.x1,s.b)]);
        if(s.k==='W' && Math.abs(q.x1-s.fixed)<1e-6) cov.push([Math.max(q.z,s.a),Math.min(q.z1,s.b)]);
        if(s.k==='E' && Math.abs(q.x -s.fixed)<1e-6) cov.push([Math.max(q.z,s.a),Math.min(q.z1,s.b)]);
      });
      // shared stretches -> one interior wall, owned by the lower-numbered pod
      pods.forEach(q=>{ if(q.i<=p.i) return;
        let iv=null;
        if(s.k==='S' && Math.abs(q.z1-s.fixed)<1e-6) iv=[Math.max(q.x,s.a),Math.min(q.x1,s.b)];
        if(s.k==='N' && Math.abs(q.z -s.fixed)<1e-6) iv=[Math.max(q.x,s.a),Math.min(q.x1,s.b)];
        if(s.k==='W' && Math.abs(q.x1-s.fixed)<1e-6) iv=[Math.max(q.z,s.a),Math.min(q.z1,s.b)];
        if(s.k==='E' && Math.abs(q.x -s.fixed)<1e-6) iv=[Math.max(q.z,s.a),Math.min(q.z1,s.b)];
        if(!iv || iv[1]-iv[0]<4-1e-6) return;
        const [a,b]=iv;
        const A = s.axis==='x' ? [a,s.fixed] : [s.fixed,a], B = s.axis==='x' ? [b,s.fixed] : [s.fixed,b];
        const r=[s.n[1],-s.n[0]]; const dA=A[0]*r[0]+A[1]*r[1], dB=B[0]*r[0]+B[1]*r[1];
        const [p0,p1] = dA<=dB ? [A,B] : [B,A];
        slots.push({ id:`${p.i}${s.k}${a}i`, type:'int', pod:p, other:q, side:s.k, len:b-a, p0:shift(p0,p.i), p1:shift(p1,p.i), n:s.n,
          label:`${p.label} ↔ ${q.label} · interior` });
      });
      sub(s.a,s.b,cov.filter(([c,d])=>d>c)).forEach(([a,b])=>{
        const A = s.axis==='x' ? [a,s.fixed] : [s.fixed,a];
        const B = s.axis==='x' ? [b,s.fixed] : [s.fixed,b];
        // order so A is the left end when standing outside: right = (-n) × up
        const r = [ s.n[1], -s.n[0] ];  // in (x,z): (-n)×y  => (n.z, -n.x)
        const dA = A[0]*r[0]+A[1]*r[1], dB = B[0]*r[0]+B[1]*r[1];
        const [p0,p1] = dA<=dB ? [A,B] : [B,A];
        const len = b-a;
        const partial = len < (s.axis==='x'? p.len : 8);
        slots.push({ id:`${p.i}${s.k}${a}`, type:'ext', pod:p, side:s.k, len, p0:shift(p0,p.i), p1:shift(p1,p.i), n:s.n,
          label:`${p.label} · ${SIDE_NAME[s.k]}${partial?' (open part)':''}` });
      });
    });
  });
  slots.sort((a,b)=>(a.type==='int')-(b.type==='int'));
  return slots;
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
  const pods=MODELS[modelKey].pods.map((p,pi)=>({...p,pi,len:POD[p.t].len,x1:p.x+POD[p.t].len,z1:p.z+8}));
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
  // shared edges
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

export { podOffsets, slotsFor, NORM, screwsFor };
