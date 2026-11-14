/* Cubit Builder — sidingmesh.js : the siding as real panels in the 3D (the Siding layer), laid out exactly as
   sidinglayout.js lays them out for the crew: each Rando Rib panel is its scanned cross-section run up the wall,
   flange end at the Einspine corners, rib end at the brick molds, pulled back / hopped covers, filler pieces, and the
   short pieces above and below every opening. In the wall group's own coordinates (feet; x along the wall from where
   the group starts, y up from the wall base, z out from the outside face). */
import { wallLayout, sidingProfile, ACM_LAP, ACM_ROUND, SIDING_TRIM } from './sidinglayout.js';

const FT = 12;
const ACM_T = 0.157;   // 4 mm aluminium composite, matte black
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
function flatMesh(P, x, w, y0, y1, mat, flip=false){
  const m=new THREE.Mesh(clippedGeo(P, w, y1-y0), mat);
  m.rotation.x=Math.PI/2; m.scale.set((flip?-1:1)/FT, 1/FT, 1/FT); m.position.set((flip ? x+w : x)/FT, y1/FT, 0); m.userData.siding=true; return m;
}
/* one run's pieces (sidinglayout planRun): panels with their rib end where the plan says, rips cut to width */
function runMeshes(P, R, y0, y1, out, mat, matF, ri=0){
  R.pieces.forEach((p,pi)=>{
    const m = p.kind==='panel' ? (p.ribR ? panelMesh(P, p.x1-P.w, y0, y1, true, mat) : panelMesh(P, p.x0, y0, y1, false, mat)) : flatMesh(P, p.x0, p.w, y0, y1, matF, p.ribR);
    m.userData.sk=`p|${ri}|${pi}`; out.push(m); });
}
/* the trims on this wall: its half of each corner / connector, and the joiner between two openings */
function trimMeshes(P, Wl, out, mat){
  const TR=SIDING_TRIM, z=(P.depth||0.77)+0.03, th=0.04, H=Wl.y1-Wl.y0;
  const strip=(x0,x1,sk)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry((x1-x0)/FT, H/FT, th/FT), mat); m.position.set((x0+x1)/2/FT, (Wl.y0+Wl.y1)/2/FT, z/FT); m.userData.siding=true; m.userData.sk=sk; out.push(m); };
  const legOf=(e,d)=> e==='C' ? TR.corner.leg : e==='I' ? TR.inside.leg : e==='J' ? d+TR.joint.lap : 0;
  const R0=Wl.runs[0], R1=Wl.runs[Wl.runs.length-1];
  const l0=legOf(Wl.ends[0], R0?.d?.[0]||0), l1=legOf(Wl.ends[1], R1?.d?.[1]||0);
  const g=TR.joint.gap/2;   // a connector spans the ¾″ gap between the pods: each wall draws its half
  if(l0>0) strip(Wl.ends[0]==='J'?-g:0, l0, 'tL'); if(l1>0) strip(Wl.L-l1, Wl.ends[1]==='J'?Wl.L+g:Wl.L, 'tR');
  Wl.runs.forEach((R,ri)=>{ if(R.joiner){ const c=R.joiner.x; strip(c-TR.joiner.w/2, c+TR.joiner.w/2, `j|${ri}`); } else if(R.joinerOnly) strip(R.x0, R.x1, `j|${ri}`); });
}
/* every piece of siding on one exterior wall, for its wall group (tl = where the group starts along the wall, in) */
function sidingMeshes(slot, tl, colour){
  const P=sidingProfile(); if(!P) return [];
  const Wl=wallLayout(slot, P); if(!Wl) return [];
  const mat=new THREE.MeshStandardMaterial({ color:colour, roughness:0.45, metalness:0.35, side:THREE.DoubleSide });
  const matF=new THREE.MeshStandardMaterial({ color:colour, roughness:0.55, metalness:0.3, side:THREE.DoubleSide });
  const out=[];
  Wl.runs.forEach((R,ri)=>runMeshes(P, R, Wl.y0, Wl.y1, out, mat, matF, ri));
  trimMeshes(P, Wl, out, new THREE.MeshStandardMaterial({ color:new THREE.Color(colour).multiplyScalar(0.8), roughness:0.5, metalness:0.3, side:THREE.DoubleSide }));
  // above and below every opening: a matte black ACM panel, no metal siding: against the wall, running ACM_LAP under the siding each side
  const acm=new THREE.MeshStandardMaterial({ color:0x111214, roughness:0.85, metalness:0.1 }), T=ACM_T;
  const acmMesh=(x0,x1,y0,y1,sk)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry((x1-x0)/FT, (y1-y0)/FT, T/FT), acm); m.position.set((x0+x1)/2/FT, (y0+y1)/2/FT, T/2/FT); m.userData.siding=true; m.userData.sk=sk; return m; };
  Wl.runs.forEach((R,ri)=>{ if(R.narrow) out.push(acmMesh(R.x0, R.x1, Wl.y0, Wl.y1, `n|${ri}`)); });
  // a round window's two black halves, each with its half-circle cut; the upper one stands a sheet proud where it laps
  const halfMesh=(c,ci,upper)=>{ const x0=c.m.x0-ACM_LAP, x1=c.m.x1+ACM_LAP, {cx,cy,r}=c.round, lap=ACM_ROUND.lap, sh=new THREE.Shape(), f=v=>v/FT;
    if(!upper){ sh.moveTo(f(x0),f(Wl.y0)); sh.lineTo(f(x1),f(Wl.y0)); sh.lineTo(f(x1),f(cy)); sh.lineTo(f(cx+r),f(cy)); sh.absarc(f(cx),f(cy),f(r),0,-Math.PI,true); sh.lineTo(f(x0),f(cy)); sh.lineTo(f(x0),f(Wl.y0)); }
    else { const yb=cy-lap, a=Math.asin(Math.min(1,lap/r)), rr=Math.sqrt(Math.max(0,r*r-lap*lap));
      sh.moveTo(f(x0),f(yb)); sh.lineTo(f(cx-rr),f(yb)); sh.absarc(f(cx),f(cy),f(r),Math.PI+a,-a,true); sh.lineTo(f(x1),f(yb)); sh.lineTo(f(x1),f(Wl.y1)); sh.lineTo(f(x0),f(Wl.y1)); sh.lineTo(f(x0),f(yb)); }
    const m=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{ depth:T/FT, bevelEnabled:false, curveSegments:24 }), acm);
    m.position.z = upper ? T/FT : 0; m.userData.siding=true; m.userData.sk=`a|${ci}|${upper?'above':'below'}`; return m; };
  Wl.cols.forEach((c,ci)=>{
    if(c.round){ out.push(halfMesh(c,ci,false), halfMesh(c,ci,true)); return; }
    if(c.below>0.5) out.push(acmMesh(c.m.x0-ACM_LAP, c.m.x1+ACM_LAP, Wl.y0, Wl.y0+c.below, `a|${ci}|below`));
    if(c.above>0.5) out.push(acmMesh(c.m.x0-ACM_LAP, c.m.x1+ACM_LAP, Wl.y1-c.above, Wl.y1, `a|${ci}|above`)); });
  out.forEach(m=>{ m.position.x-=tl/FT; m.position.z+=0.05/FT; m.userData.wall=slot.id; });   // over the 1 mm membrane, never through it       // the group starts tl in from the wall's corner
  return out;
}
export { sidingMeshes };
