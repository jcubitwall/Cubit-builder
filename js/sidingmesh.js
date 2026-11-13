/* Cubit Builder — sidingmesh.js : the siding as real panels in the 3D (the Siding layer), laid out exactly as
   sidinglayout.js lays them out for the crew: each Rando Rib panel is its scanned cross-section run up the wall,
   flange end at the Einspine corners, rib end at the brick molds, pulled back / hopped covers, filler pieces, and the
   short pieces above and below every opening. In the wall group's own coordinates (feet; x along the wall from where
   the group starts, y up from the wall base, z out from the outside face). */
import { wallLayout, sidingProfile } from './sidinglayout.js';

const FT = 12;
let SHAPE=null, SHAPE_ID=null;
/* the cross-section as one closed outline (the scan's edges, chained end to end) */
function profileShape(P){
  if(SHAPE && SHAPE_ID===P.id+P.source?.sha256) return SHAPE;
  const segs=(P.profile||[]).map(g=>[g.a, g.b]), used=new Set(), pts=[];
  const near=(p,q)=>Math.abs(p[0]-q[0])<2e-3 && Math.abs(p[1]-q[1])<2e-3;
  let cur=segs[0]; used.add(0); pts.push(cur[0], cur[1]); let end=cur[1];
  for(let n=1;n<segs.length;n++){
    let k=-1, flip=false;
    for(let i=0;i<segs.length;i++){ if(used.has(i)) continue; if(near(segs[i][0],end)){ k=i; break; } if(near(segs[i][1],end)){ k=i; flip=true; break; } }
    if(k<0) break; used.add(k); const [a,b]=flip?[segs[k][1],segs[k][0]]:segs[k]; pts.push(b); end=b; }
  const sh=new THREE.Shape(); pts.forEach(([x,y],i)=> i ? sh.lineTo(x,y) : sh.moveTo(x,y)); sh.closePath();
  SHAPE=sh; SHAPE_ID=P.id+P.source?.sha256; return sh;
}
const GEO=new Map();
const panelGeo = (P, h) => { const k=P.id+'|'+h.toFixed(3); if(!GEO.has(k)) GEO.set(k, new THREE.ExtrudeGeometry(profileShape(P), { depth:h, bevelEnabled:false, curveSegments:2 })); return GEO.get(k); };
/* one panel: its left edge at x (in), flange end on the left when `flip`, from y0 up to y1 */
function panelMesh(P, x, y0, y1, flip, mat){
  const m=new THREE.Mesh(panelGeo(P, y1-y0), mat);
  m.rotation.x=Math.PI/2;                         // extrude (z) → down the wall; the profile's y → out from the wall
  m.scale.set((flip?-1:1)/FT, 1/FT, 1/FT);
  m.position.set((flip ? x+P.w : x)/FT, y1/FT, 0);
  m.userData.siding=true; return m;
}
/* a piece narrower than a panel (a filler bent to match, or a panel ripped to width): the same ribs, from the rib end,
   cut off at its width. Drawn from the scan's faces and rib bottoms as a sheet the panel's thickness. */
const CLIP=new Map();
function clippedGeo(P, w, h){
  const k=P.id+'|'+w.toFixed(3)+'|'+h.toFixed(3); if(CLIP.has(k)) return CLIP.get(k);
  const t=P.t||0.018, segs=[...(P.faces||[]).map(([a,b,y])=>[a,b,y]), ...(P.grooves||[]).filter(([a,b])=>b-a>0.1).map(([a,b])=>[a,b,t])].sort((p,q)=>p[0]-q[0]);
  let top=[]; segs.forEach(([a,b,y])=>{ top.push([a,y],[b,y]); });
  const cut=[]; for(let i=0;i<top.length;i++){ const p=top[i], q=top[i+1]; if(p[0]<=w) cut.push(p); if(q && p[0]<w && q[0]>w){ const f=(w-p[0])/(q[0]-p[0]); cut.push([w, p[1]+f*(q[1]-p[1])]); } }
  if(cut.length && cut[cut.length-1][0]<w-1e-6) cut.push([w, cut[cut.length-1][1]]);   // past the scan's last flat: run it out flat
  const sh=new THREE.Shape(); cut.forEach(([x,y],i)=> i ? sh.lineTo(x,y) : sh.moveTo(x,y)); cut.slice().reverse().forEach(([x,y])=>sh.lineTo(x, y-t)); sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh, { depth:h, bevelEnabled:false, curveSegments:2 }); CLIP.set(k, g); return g;
}
function flatMesh(P, x, w, y0, y1, mat){
  const m=new THREE.Mesh(clippedGeo(P, w, y1-y0), mat);
  m.rotation.x=Math.PI/2; m.scale.set(1/FT, 1/FT, 1/FT); m.position.set(x/FT, y1/FT, 0); m.userData.siding=true; return m;
}
/* the panels of one run x0..x1 (in, from the wall's corner): st = a stretch from sidinglayout */
function runMeshes(P, st, y0, y1, out, mat, matF){
  const C=st.covers, fill=st.filler||0;
  const layLeft = (from, covers, flip) => { let x=from; covers.forEach(c=>{ out.push(panelMesh(P, x, y0, y1, flip, mat)); x+=c; }); return x; };
  const layRight = (to, covers, flip) => { let x=to; covers.forEach(c=>{ x-=c; out.push(panelMesh(P, x, y0, y1, flip, mat)); }); return x; };
  const flipLeft = st.ends[0]==='C';             // flange end at an Einspine corner
  if(st.split){                                   // rib ends at both molds: two runs meet on a filler in the middle
    const a=layLeft(st.x0, C.slice(0, st.nLeft), false), b=layRight(st.x1, C.slice(st.nLeft), true);
    if(b-a>0.01) out.push(flatMesh(P, a, b-a, y0, y1, matF)); return; }
  if(fill>0.01 && C.length && st.fillerAt!=='far corner'){   // the filler between the first panel and the rest
    const x=layLeft(st.x0, C.slice(0,1), flipLeft); out.push(flatMesh(P, x, fill, y0, y1, matF)); layLeft(x+fill, C.slice(1), flipLeft); return; }
  const x=layLeft(st.x0, C, flipLeft); if(fill>0.01) out.push(flatMesh(P, x, fill, y0, y1, matF));
  if(st.rip>0.01) out.push(flatMesh(P, x, st.rip, y0, y1, matF));
}
/* every piece of siding on one exterior wall, for its wall group (tl = where the group starts along the wall, in) */
function sidingMeshes(slot, tl, colour){
  const P=sidingProfile(); if(!P) return [];
  const Wl=wallLayout(slot, P); if(!Wl) return [];
  const mat=new THREE.MeshStandardMaterial({ color:colour, roughness:0.45, metalness:0.35, side:THREE.DoubleSide });
  const matF=new THREE.MeshStandardMaterial({ color:colour, roughness:0.55, metalness:0.3, side:THREE.DoubleSide });
  const out=[];
  Wl.full.forEach(st=>runMeshes(P, st, Wl.y0, Wl.y1, out, mat, matF));
  Wl.cols.forEach(c=>{
    if(c.below>0.5) runMeshes(P, c.fit, Wl.y0, Wl.y0+c.below, out, mat, matF);
    if(c.above>0.5) runMeshes(P, c.fit, Wl.y1-c.above, Wl.y1, out, mat, matF); });
  out.forEach(m=>{ m.position.x-=tl/FT; });       // the group starts tl in from the wall's corner
  return out;
}
export { sidingMeshes };
