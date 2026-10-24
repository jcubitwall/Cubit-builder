/* Cubit Builder — casework3d.js : cabinets and furniture as 3D models (in the home, and in the library viewer).
   One mesh per part, in inches inside the item's own group, scaled to feet for the home. Tenons are drawn so
   the joinery shows when the item is exploded. */
import { partsOf } from './casework.js';

const COL = { carcass:0xdcc39a, shelf:0xe4cfa4, back:0xcdb287, front:0xf1ece2, drawer:0xd8bd8c, hw:0x5d6166, appliance:0xc9cdd1, appdoor:0xdfe2e5, top:0x8f9493,
  furnsoft:0x8e978a, furnsoft2:0xa3ab9d, furnwood:0xb48a5c, furnwood2:0xc49a6b };
const mats = {};
function matFor(role, dim=false){
  const k=role+(dim?'-d':'');
  if(!mats[k]) mats[k]=new THREE.MeshStandardMaterial({ color:COL[role]??0xcccccc, roughness: role==='hw'||role==='appliance'||role==='appdoor' ? 0.35 : 0.8, metalness: role==='hw'||role==='appliance' ? 0.55 : 0, transparent:dim, opacity:dim?0.18:1, depthWrite:!dim });
  return mats[k];
}
const EDGE = new THREE.LineBasicMaterial({ color:0x2b2f2c, transparent:true, opacity:0.28 });
const SEL = new THREE.MeshStandardMaterial({ color:0xd0661f, roughness:0.6, emissive:0x5a2205 });

function boxGeo(p){
  const [x,y,z,sx,sy,sz]=p.box;
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
/* the item as a group in inches: { group, parts, meshes } — explode(e) spreads the parts (e 0…1) */
function itemModel(it, { edges=true, tenons=true }={}){
  const parts=partsOf(it), group=new THREE.Group(), meshes=[];
  parts.forEach((p,i)=>{
    const sub=new THREE.Group(); sub.userData={ part:i, ex:p.ex };
    const g=boxGeo(p), m=new THREE.Mesh(g, matFor(p.role)); m.userData.part=i; m.castShadow=true; m.receiveShadow=true; sub.add(m); meshes.push(m);
    if(edges && !p.hw) sub.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), EDGE));
    if(tenons) (p.tenonGeo||[]).forEach(b=>{ const tg=boxGeo({box:b}), tm=new THREE.Mesh(tg, matFor(p.role)); tm.userData.part=i; sub.add(tm); meshes.push(tm); if(edges) sub.add(new THREE.LineSegments(new THREE.EdgesGeometry(tg), EDGE)); });
    group.add(sub);
  });
  const span=Math.max(it.w,it.h,it.d);
  function explode(e){ group.children.forEach(s=>{ const [a,b,c]=s.userData.ex||[0,0,0]; s.position.set(a*e*span*0.34, b*e*span*0.34, c*e*span*0.34); }); }
  function select(i){ meshes.forEach(m=>{ const p=parts[m.userData.part]; m.material = i==null ? matFor(p.role) : m.userData.part===i ? SEL : matFor(p.role, true); }); }
  return { group, parts, meshes, explode, select };
}
export { itemModel, matFor, COL };
