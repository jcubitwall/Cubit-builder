/* Cubit Builder — casework3d.js : cabinets and furniture as 3D models (in the home, and in the library viewer).
   One mesh per part, in inches inside the item's own group, scaled to feet for the home. Tenons are drawn so
   the joinery shows when the item is exploded. */
import { partsOf } from './casework.js';
import { boolTree } from './geom2d.js';

const COL = { carcass:0xdcc39a, shelf:0xe4cfa4, back:0xcdb287, front:0xf1ece2, drawer:0xd8bd8c, hw:0x5d6166, appliance:0xc9cdd1, appdoor:0xdfe2e5, top:0x8f9493,
  furnsoft:0x8e978a, porcelain:0xf6f6f2, acrylic:0xeef0ee, steel:0xc9ced2, furnsoft2:0xa3ab9d, furnwood:0xb48a5c, furnwood2:0xc49a6b };
const mats = {};
function matFor(role, dim=false){
  const k=role+(dim?'-d':'');
  if(!mats[k]) mats[k]=new THREE.MeshStandardMaterial({ color:COL[role]??0xcccccc, roughness: role==='hw'||role==='appliance'||role==='appdoor'||role==='steel' ? 0.35 : role==='porcelain'||role==='acrylic' ? 0.3 : 0.8, metalness: role==='hw'||role==='appliance' ? 0.55 : role==='steel' ? 0.15 : 0, transparent:dim, opacity:dim?0.18:1, depthWrite:!dim });
  return mats[k];
}
const EDGE = new THREE.LineBasicMaterial({ color:0x2b2f2c, transparent:true, opacity:0.28 });
const SEL = new THREE.MeshStandardMaterial({ color:0xd0661f, roughness:0.6, emissive:0x5a2205 });

function boxGeo(p){
  const [x,y,z,sx,sy,sz]=p.box;
  // a mesh drawn from a STEP file (inches × q), mirrored if the item is
  if(p.mesh){ const q=p.meshQ||100, P=p.mesh.p, W=p.mirrorW||0, pos=new Float32Array(P.length);
    for(let i=0;i<P.length;i+=3){ pos[i]=W ? W-P[i]/q : P[i]/q; pos[i+1]=P[i+1]/q; pos[i+2]=P[i+2]/q; }
    let idx=p.mesh.i; if(W){ idx=idx.slice(); for(let i=0;i<idx.length;i+=3){ const t=idx[i+1]; idx[i+1]=idx[i+2]; idx[i+2]=t; } }
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
  // round (toilet bowl, pedestal): an elliptic cylinder filling the box
  if(p.shape==='cyl'){ const g=new THREE.CylinderGeometry(0.5,0.5,1,28); g.scale(sx,sy,sz); g.translate(x+sx/2,y+sy/2,z+sz/2); return g; }
  // an open basin (tub, shower pan, sink): the rim walls, with a rounded inside
  if(p.shape==='basin'){ const t=p.t||1, s=new THREE.Shape(), r=Math.min(3, (Math.min(sx,sz)-2*t)/4);
    s.moveTo(0,0); s.lineTo(sx,0); s.lineTo(sx,-sz); s.lineTo(0,-sz); s.lineTo(0,0);
    const h=new THREE.Path(), a=t, b=-t, c=sx-t, d=-(sz-t);
    h.moveTo(a+r,b); h.lineTo(c-r,b); h.quadraticCurveTo(c,b,c,b-r); h.lineTo(c,d+r); h.quadraticCurveTo(c,d,c-r,d); h.lineTo(a+r,d); h.quadraticCurveTo(a,d,a,d+r); h.lineTo(a,b-r); h.quadraticCurveTo(a,b,a+r,b);
    s.holes.push(h); const g=new THREE.ExtrudeGeometry(s,{depth:sy, bevelEnabled:false, curveSegments:6}); g.rotateX(-Math.PI/2); g.translate(x,y,z); return g; }
  // a side with a toe-kick notch: the profile in z–y, pushed out along x
  if(p.notch){ const [ks,kh,dc]=p.notch, s=new THREE.Shape();
    s.moveTo(0,0); s.lineTo(dc-ks,0); s.lineTo(dc-ks,kh); s.lineTo(dc,kh); s.lineTo(dc,sy); s.lineTo(0,sy); s.lineTo(0,0);
    const g=new THREE.ExtrudeGeometry(s,{depth:sx, bevelEnabled:false}); g.rotateY(-Math.PI/2); g.translate(x+sx,y,z); return g; }
  // a panel with a cut-out (fireplace face): profile in x–y, pushed out along z
  if(p.hole){ const [hx,hy,hw,hh]=p.hole, s=new THREE.Shape();
    s.moveTo(x,y); s.lineTo(x+sx,y); s.lineTo(x+sx,y+sy); s.lineTo(x,y+sy); s.lineTo(x,y);
    const h=new THREE.Path(); h.moveTo(hx,hy); h.lineTo(hx,hy+hh); h.lineTo(hx+hw,hy+hh); h.lineTo(hx+hw,hy); h.lineTo(hx,hy); s.holes.push(h);
    const g=new THREE.ExtrudeGeometry(s,{depth:sz, bevelEnabled:false}); g.translate(0,0,z); return g; }
  const g=new THREE.BoxGeometry(Math.max(sx,0.01),Math.max(sy,0.01),Math.max(sz,0.01)); g.translate(x+sx/2,y+sy/2,z+sz/2); return g;
}
/* a cabinet part exactly as it's cut: its outline (notches), minus every dado, groove, rabbet and hole to its depth.
   The panel is built in slices through its thickness, one per depth that something is cut to, each slice the outline
   less everything that goes at least that deep. Placed by part.cnc.at (origin, u, v, outward normal of the up face). */
const circ = (u,v,r,n=14) => [...Array(n)].map((_,i)=>[u+r*Math.cos(2*Math.PI*i/n), v+r*Math.sin(2*Math.PI*i/n)]);
function cncGeos(p){
  const c=p.cnc, A=c.at, T=p.T; if(!A) return null;
  const dep=o=>Math.min(T, o.thru ? T : o.depth);
  const levels=[...new Set(c.ops.map(o=>+dep(o).toFixed(4)).filter(d=>d>0.002))].sort((a,b)=>a-b);
  const cuts=[0, ...levels.filter(d=>d<T-0.002), T];
  const shapeOf = o => o.u!=null ? circ(o.u,o.v,o.d/2) : [[o.u0,o.v0],[o.u1,o.v0],[o.u1,o.v1],[o.u0,o.v1]];
  const geos=[];
  for(let i=0;i+1<cuts.length;i++){ const a=cuts[i], b=cuts[i+1];
    const rem=c.ops.filter(o=>dep(o)>=b-1e-4).map(shapeOf);
    const regs = rem.length ? boolTree([c.outline], rem, 'diff') : [{outer:c.outline, holes:[]}];
    regs.forEach(R=>{ if(R.outer.length<3) return;
      const sh=new THREE.Shape(R.outer.map(([u,v])=>new THREE.Vector2(u,v)));
      R.holes.forEach(h=>sh.holes.push(new THREE.Path(h.map(([u,v])=>new THREE.Vector2(u,v)))));
      const g=new THREE.ExtrudeGeometry(sh,{ depth:b-a, bevelEnabled:false, curveSegments:4 });
      g.translate(0,0,-b);            // z = −(depth from the up face)
      geos.push(g); }); }
  const M=new THREE.Matrix4().makeBasis(new THREE.Vector3(...A.eu), new THREE.Vector3(...A.ev), new THREE.Vector3(...A.n)).setPosition(...A.o);
  geos.forEach(g=>g.applyMatrix4(M));
  return geos;
}
/* the item as a group in inches: { group, parts, meshes } — explode(e) spreads the parts (e 0…1) */
function itemModel(it, { edges=true, tenons=true, detail=true }={}){
  const parts=partsOf(it), group=new THREE.Group(), meshes=[];
  parts.forEach((p,i)=>{
    const sub=new THREE.Group(); sub.userData={ part:i, ex:p.ex };
    const exact = (detail && p.cnc && !p.hw && !p.solid) ? cncGeos(p) : null;
    (exact || [boxGeo(p)]).forEach(g=>{ const m=new THREE.Mesh(g, matFor(p.role)); m.userData.part=i; m.castShadow=true; m.receiveShadow=true; sub.add(m); meshes.push(m);
      if(edges && !p.hw) sub.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), EDGE)); });
    if(tenons) (p.tenonGeo||[]).forEach(b=>{ const tg=boxGeo({box:b}), tm=new THREE.Mesh(tg, matFor(p.role)); tm.userData.part=i; sub.add(tm); meshes.push(tm); if(edges) sub.add(new THREE.LineSegments(new THREE.EdgesGeometry(tg), EDGE)); });
    group.add(sub);
  });
  const span=Math.max(it.w,it.h,it.d);
  function explode(e){ group.children.forEach(s=>{ const [a,b,c]=s.userData.ex||[0,0,0]; s.position.set(a*e*span*0.34, b*e*span*0.34, c*e*span*0.34); }); }
  function select(i){ meshes.forEach(m=>{ const p=parts[m.userData.part]; m.material = i==null ? matFor(p.role) : m.userData.part===i ? SEL : matFor(p.role, true); }); }
  return { group, parts, meshes, explode, select };
}
export { itemModel, matFor, COL };
