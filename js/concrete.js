/* Cubit Builder — concrete.js : a concrete (ICF) foundation instead of ground screws.

   How a concrete person would lay it out, with Cubit's rules:
   · PERIMETER: one continuous 18″ × 6″ footing with one course of ICF on it (Nudura 18″ blocks, or Fox Blocks
     16″), following the outline of the whole home (the 5/8″ pod joints are bridged). The home bears on the
     concrete core: the core's outer face is flush with the home's outer face, so the outside foam (2⅝″) is
     entirely outside the home and the inside foam is inside it. The footing is centred under the ICF.
   · INSIDE SUPPORTS: wherever the ground-screw rules would put a screw that is not on the perimeter (down the
     pod joints, where joints cross, never more than 12′ apart), a short section of ICF with an 8″ core on its own
     footing, running along the joint (4′, half a Nudura block), so both pods bear on it.
   · Where short sections along one joint come within 4′ of each other they become one longer wall section
     (fewer ends to form and cap), and a section that would stop within 2′ of the perimeter ties into it.
     Neither is done if it would close off part of the crawl space: every part of the crawl space must stay
     reachable through gaps of at least 24″.
   · ACCESS: one crawl-space access opening (28″ ≥ 700 mm) in the perimeter wall, on the longest open run
     (not behind a deck).
   All plan units here are feet (x right, z down), like the rest of the layout code. */
import { FT, GAP, ICF } from './config.js';
import { podList, deckList, layoutOffsets, screwPlan } from './layout.js';
import { state } from './state.js';

const E = 1e-6;

/* the outline of the whole home: the union of the pods with the 5/8″ joints filled in, as closed loops of
   rectilinear edges, each with its outward normal (away from the home) */
function outline(rects){
  const xs=[...new Set(rects.flatMap(r=>[r[0],r[2]]).map(v=>+v.toFixed(5)))].sort((a,b)=>a-b);
  const zs=[...new Set(rects.flatMap(r=>[r[1],r[3]]).map(v=>+v.toFixed(5)))].sort((a,b)=>a-b);
  const NX=xs.length-1, NZ=zs.length-1, fill=[...Array(NX)].map(()=>Array(NZ).fill(false));
  for(let a=0;a<NX;a++) for(let b=0;b<NZ;b++){ const cx=(xs[a]+xs[a+1])/2, cz=(zs[b]+zs[b+1])/2;
    fill[a][b]=rects.some(r=>cx>r[0]&&cx<r[2]&&cz>r[1]&&cz<r[3]); }
  // bridge the joints: a strip no wider than the joint with home on both sides
  const thin=(v,k)=>v[k+1]-v[k]<=GAP+0.002;
  for(let pass=0;pass<2;pass++){
    for(let a=0;a<NX;a++) for(let b=0;b<NZ;b++){ if(fill[a][b]) continue;
      if(thin(xs,a) && a>0 && a<NX-1 && fill[a-1][b] && fill[a+1][b]) fill[a][b]=true;
      else if(thin(zs,b) && b>0 && b<NZ-1 && fill[a][b-1] && fill[a][b+1]) fill[a][b]=true; }
  }
  // square off small steps (a pod that sits up to 3″ proud of its neighbour, from the 5/8″ joints adding up):
  // the concrete runs straight at the outermost face and the recessed pod still bears fully on the core
  const JOG=0.25, f=(a,b)=>a>=0&&b>=0&&a<NX&&b<NZ&&fill[a][b];
  for(let changed=true, n=0; changed && n<6; n++){ changed=false;
    for(let a=0;a<NX;a++) for(let b=0;b<NZ;b++){ if(fill[a][b]) continue;
      const tx=xs[a+1]-xs[a]<=JOG+1e-4, tz=zs[b+1]-zs[b]<=JOG+1e-4;
      const sideX=f(a-1,b)||f(a+1,b), sideZ=f(a,b-1)||f(a,b+1);
      // a thin strip with home on one side across it and home beside it along it (the inside of a small step)
      if((tx && f(a-1,b)!==f(a+1,b) && sideX && sideZ) || (tz && f(a,b-1)!==f(a,b+1) && sideZ && sideX)){ fill[a][b]=true; changed=true; } } }
  const F=(a,b)=>a>=0&&b>=0&&a<NX&&b<NZ&&fill[a][b];
  // directed boundary edges, solid on the left going round: top → +x, right → +z, bottom → −x, left → −z
  const edges=[];
  for(let a=0;a<NX;a++) for(let b=0;b<NZ;b++){ if(!fill[a][b]) continue;
    const x0=xs[a],x1=xs[a+1],z0=zs[b],z1=zs[b+1];
    if(!F(a,b-1)) edges.push({p:[x0,z0], q:[x1,z0], n:[0,-1]});
    if(!F(a+1,b)) edges.push({p:[x1,z0], q:[x1,z1], n:[1,0]});
    if(!F(a,b+1)) edges.push({p:[x1,z1], q:[x0,z1], n:[0,1]});
    if(!F(a-1,b)) edges.push({p:[x0,z1], q:[x0,z0], n:[-1,0]});
  }
  const key=p=>p[0].toFixed(4)+','+p[1].toFixed(4), from=new Map();
  edges.forEach(e=>{ (from.get(key(e.p)) || from.set(key(e.p),[]).get(key(e.p))).push(e); });
  const used=new Set(), loops=[];
  edges.forEach(e0=>{ if(used.has(e0)) return;
    const loop=[]; let e=e0;
    while(e && !used.has(e)){ used.add(e); loop.push(e);
      const nx=(from.get(key(e.q))||[]).filter(c=>!used.has(c));
      e = nx[0]; }
    // merge straight runs
    const m=[]; loop.forEach(s=>{ const l=m[m.length-1]; if(l && l.n[0]===s.n[0] && l.n[1]===s.n[1]) l.q=s.q; else m.push({...s}); });
    if(m.length>1 && m[0].n[0]===m[m.length-1].n[0] && m[0].n[1]===m[m.length-1].n[1]){ m[0].p=m[m.length-1].p; m.pop(); }
    loops.push(m);
  });
  return loops;
}
/* a loop moved d feet outward (negative = inward); every corner is square so each vertex moves by d·(n₁+n₂) */
function offsetLoop(loop, d){
  return loop.map((e,k)=>{ const pr=loop[(k+loop.length-1)%loop.length]; return [e.p[0]+d*(pr.n[0]+e.n[0]), e.p[1]+d*(pr.n[1]+e.n[1])]; });
}
const area = pts => pts.reduce((a,p,k)=>{ const q=pts[(k+1)%pts.length]; return a+p[0]*q[1]-q[0]*p[1]; },0)/2;
const segLen = e => Math.hypot(e.q[0]-e.p[0], e.q[1]-e.p[1]);

/* the plan: everything the 3D view, the sheet and the takeoff need */
function concretePlan(modelKey){
  const C=(state.icf?.core||ICF.core)/FT, F=ICF.foam/FT, FW=ICF.footW/FT, FTk=ICF.footT/FT;
  const brand=ICF.brands[state.icf?.brand] || ICF.brands.nudura, BH=brand.h/FT;
  const LO=layoutOffsets(modelKey), pl=podList(modelKey);
  const rects=pl.map(p=>{ const x=p.x+LO.pods[p.i].ox, z=p.z+LO.pods[p.i].oz; return [x,z,x+p.w,z+p.d]; });
  const loops=outline(rects);
  // offsets from the home's outer face, + outward: outside foam, core, inside foam, footing (centred under the ICF)
  const mid=-C/2, off={ foamOut:F, core0:0, core1:-C, foamIn:-C-F, foot0:mid+FW/2, foot1:mid-FW/2 };
  const band=(a,b)=>loops.map(l=>{ const A=offsetLoop(l,a), B=offsetLoop(l,b); return Math.abs(area(A))>Math.abs(area(B)) ? {outer:A, inner:B} : {outer:B, inner:A}; });
  const perimLen = loops.reduce((s,l)=>s+l.reduce((t,e)=>t+segLen(e),0),0);            // at the home's face
  const coreLen = loops.reduce((s,l)=>s+Math.abs(perimeterOf(offsetLoop(l,-C/2))),0);   // ICF centreline
  const corners = loops.reduce((s,l)=>{ l.forEach((e,k)=>{ const pr=l[(k+l.length-1)%l.length], cr=pr.n[0]*e.n[1]-pr.n[1]*e.n[0]; if(cr>0) s.out++; else s.in++; }); return s; },{out:0,in:0});

  // inside supports: the ground-screw stations that are not on the perimeter
  const onPerim = (x,z) => loops.some(l=>l.some(e=>{ const [x0,z0]=e.p,[x1,z1]=e.q;
    const t=Math.max(0,Math.min(1, ((x-x0)*(x1-x0)+(z-z0)*(z1-z0))/((x1-x0)**2+(z1-z0)**2||1)));
    return Math.hypot(x-(x0+t*(x1-x0)), z-(z0+t*(z1-z0))) < 1.5; }));
  const plan=screwPlan(modelKey, state.inset, {pods:true, decks:false});
  const stations=plan.screws.filter(s=>!onPerim(s.x,s.z)).map(s=>({x:s.x, z:s.z, ax: Math.abs(s.dir[0])>0.5 ? 'z' : 'x', pods:s.pods}));
  const L=ICF.pier/FT;
  let secs=stations.map(s=>({ax:s.ax, c:s.ax==='x'?s.z:s.x, a:(s.ax==='x'?s.x:s.z)-L/2, b:(s.ax==='x'?s.x:s.z)+L/2, n:1, pods:s.pods}));
  const inner=band(off.foamIn, off.foamIn-1e-3).map(b=>b.outer);   // inside face of the perimeter ICF
  const interiorStop = (sec, end) => {   // distance from a section end to the inside face of the perimeter, along its line
    let best=Infinity;
    inner.forEach(poly=>poly.forEach((p,k)=>{ const q=poly[(k+1)%poly.length];
      if(sec.ax==='x' && Math.abs(p[0]-q[0])<E && sec.c>Math.min(p[1],q[1]) && sec.c<Math.max(p[1],q[1])){ const d = end>0 ? p[0]-sec.b : sec.a-p[0]; if(d>=-E && d<best) best=d; }
      if(sec.ax==='z' && Math.abs(p[1]-q[1])<E && sec.c>Math.min(p[0],q[0]) && sec.c<Math.max(p[0],q[0])){ const d = end>0 ? p[1]-sec.b : sec.a-p[1]; if(d>=-E && d<best) best=d; }
    }));
    return best;
  };
  const CI=ICF.coreShared/FT, halfW=(CI+2*F)/2;   // inside supports carry two pods: 8″ core
  const rectOf = s => s.ax==='x' ? [s.a, s.c-halfW, s.b, s.c+halfW] : [s.c-halfW, s.a, s.c+halfW, s.b];
  const ok = list => crawlCheck(loops, off.foamIn, list.map(rectOf)).ok;
  // 1. join sections along the same joint that come within 4′ of each other
  const MERGE=4;
  const byLine=new Map(); secs.forEach(s=>{ const k=s.ax+':'+s.c.toFixed(3); (byLine.get(k)||byLine.set(k,[]).get(k)).push(s); });
  let merged=[];
  byLine.forEach(list=>{ list.sort((u,v)=>u.a-v.a);
    const out=[]; list.forEach(s=>{ const l=out[out.length-1]; if(l && s.a-l.b<=MERGE+0.01){ l.b=Math.max(l.b,s.b); l.n+=s.n; } else out.push({...s}); });
    merged.push(...out); });
  if(!ok(merged)) merged=secs.map(s=>({...s}));
  // 2. tie a section into the perimeter when it would stop within 2′ of it
  merged.forEach(s=>{ [1,-1].forEach(end=>{ const d=interiorStop(s,end); if(d>E && d<2){
    const keep={a:s.a,b:s.b}; if(end>0) s.b+=d; else s.a-=d; s.tied=(s.tied||0)+1;
    if(!ok(merged)){ s.a=keep.a; s.b=keep.b; s.tied--; } } }); });
  const sections=merged.map((s,k)=>({...s, id:k+1, len:s.b-s.a, kind:(s.b-s.a)>L+0.01 ? 'wall' : 'pier', rect:rectOf(s),
    foot: s.ax==='x' ? [s.a-(FW/2-halfW), s.c-FW/2, s.b+(FW/2-halfW), s.c+FW/2] : [s.c-FW/2, s.a-(FW/2-halfW), s.c+FW/2, s.b+(FW/2-halfW)] }));

  // crawl-space access: middle of the longest perimeter run not behind a deck
  const decks=deckList(modelKey).map(d=>{ const x=d.x+LO.decks[d.k].ox, z=d.z+LO.decks[d.k].oz; return [x,z,x+d.w,z+d.d]; });
  let access=null;
  loops.forEach(l=>l.forEach(e=>{
    const n=e.n, len=segLen(e); if(len<4) return;
    // the run, minus the parts a deck covers (a deck sits just outside this face)
    const ax = n[1]!==0 ? 'x' : 'z', lo=Math.min(e.p[ax==='x'?0:1], e.q[ax==='x'?0:1]), hi=Math.max(e.p[ax==='x'?0:1], e.q[ax==='x'?0:1]), c=e.p[ax==='x'?1:0];
    let free=[[lo,hi]];
    decks.forEach(d=>{ const de = ax==='x' ? (n[1]<0?d[3]:d[1]) : (n[0]<0?d[2]:d[0]); if(Math.abs(de-c)>0.2) return;
      const u=ax==='x'?d[0]:d[1], v=ax==='x'?d[2]:d[3];
      free=free.flatMap(([a,b])=>{ if(v<=a||u>=b) return [[a,b]]; const o=[]; if(u>a) o.push([a,u]); if(v<b) o.push([v,b]); return o; }); });
    free.forEach(([a,b])=>{ if(b-a>=4 && (!access || b-a>access.run)){ const t=(a+b)/2; access={run:b-a, ax, c, t, n, x: ax==='x'?t:c, z: ax==='x'?c:t}; } });
  }));
  if(access) access.w=ICF.access/FT;

  const check=crawlCheck(loops, off.foamIn, sections.map(s=>s.rect));
  // quantities (imperial and metric)
  const secLen=sections.reduce((a,s)=>a+s.len,0), ends=sections.length*2 - sections.reduce((a,s)=>a+(s.tied||0),0);
  const footArea = loops.reduce((a,l)=>{ const A=offsetLoop(l,off.foot0), B=offsetLoop(l,off.foot1); return a+Math.abs(Math.abs(area(A))-Math.abs(area(B))); },0)
                 + sections.reduce((a,s)=>a+(s.foot[2]-s.foot[0])*(s.foot[3]-s.foot[1]),0);
  const footVol=footArea*FTk, coreVol=coreLen*C*BH + secLen*CI*BH - (access ? access.w*C*BH : 0);
  const icfLen=coreLen+secLen, blocks=Math.ceil(coreLen*FT/brand.len*1.05), blocksIn=Math.ceil(secLen*FT/brand.len*1.05);
  return { loops, off, band, rects, stations, sections, access, check, brand,
    C, CI, F, FW, FTk, BH, blocksIn, perimLen, coreLen, secLen, icfLen, corners, ends, blocks, footArea, footVol, coreVol,
    warnings: [ ...(check.ok?[]:[{kind:'closed', text:`Part of the crawl space can't be reached through a 24″ gap (${check.regions} separate areas). Open up a support.`}]),
      ...(access?[{kind:'access', text:`Crawl-space access: ${ICF.access}″ wide opening in the perimeter. The ICF is only ${brand.h}″ tall, under the 500 mm (19¾″) the National Building Code asks for (9.18.2.1, 500 × 700 mm with a door or hatch): step the footing down there or add a floor hatch.`}]:[{kind:'access', text:'No perimeter run long enough for a crawl-space access opening: plan a floor hatch.'}]) ] };
}
function perimeterOf(pts){ return pts.reduce((a,p,k)=>{ const q=pts[(k+1)%pts.length]; return a+Math.hypot(q[0]-p[0],q[1]-p[1]); },0); }

/* Can a person get everywhere in the crawl space? Free space = inside the perimeter ICF, minus the inside
   supports. Shrink it by half the 24″ passage; it must stay one connected piece (tiny pockets ignored). */
function crawlCheck(loops, inFace, rects){
  const polys=loops.map(l=>offsetLoop(l,inFace));
  const xs=polys.flat().map(p=>p[0]), zs=polys.flat().map(p=>p[1]);
  const x0=Math.min(...xs), x1=Math.max(...xs), z0=Math.min(...zs), z1=Math.max(...zs), h=0.25, r=ICF.pass/2/FT;
  const NX=Math.ceil((x1-x0)/h), NZ=Math.ceil((z1-z0)/h);
  const inside=(x,z)=>{ let n=0; polys.forEach(P=>P.forEach((p,k)=>{ const q=P[(k+1)%P.length]; if(((p[1]>z)!==(q[1]>z)) && x < p[0]+(z-p[1])*(q[0]-p[0])/(q[1]-p[1])) n++; })); return n%2===1; };
  const distEdge=(x,z)=>{ let d=Infinity; polys.forEach(P=>P.forEach((p,k)=>{ const q=P[(k+1)%P.length]; const dx=q[0]-p[0], dz=q[1]-p[1], L2=dx*dx+dz*dz||1;
    const t=Math.max(0,Math.min(1,((x-p[0])*dx+(z-p[1])*dz)/L2)); d=Math.min(d, Math.hypot(x-p[0]-t*dx, z-p[1]-t*dz)); })); return d; };
  const distRect=(x,z,R)=>Math.hypot(Math.max(R[0]-x,0,x-R[2]), Math.max(R[1]-z,0,z-R[3]));
  const free=[...Array(NX)].map((_,a)=>[...Array(NZ)].map((_,b)=>{ const x=x0+(a+0.5)*h, z=z0+(b+0.5)*h;
    return inside(x,z) && distEdge(x,z)>=r && rects.every(R=>distRect(x,z,R)>=r); }));
  const seen=[...Array(NX)].map(()=>Array(NZ).fill(false)); let regions=0;
  for(let a=0;a<NX;a++) for(let b=0;b<NZ;b++){ if(!free[a][b]||seen[a][b]) continue;
    let size=0; const st=[[a,b]]; seen[a][b]=true;
    while(st.length){ const [u,v]=st.pop(); size++; [[1,0],[-1,0],[0,1],[0,-1]].forEach(([du,dv])=>{ const U=u+du, V=v+dv; if(U>=0&&V>=0&&U<NX&&V<NZ&&free[U][V]&&!seen[U][V]){ seen[U][V]=true; st.push([U,V]); } }); }
    if(size*h*h>=4) regions++;   // pockets under 4 sq ft are a reach, not a room
  }
  return { ok: regions<=1, regions };
}
export { concretePlan, outline, offsetLoop, crawlCheck };
