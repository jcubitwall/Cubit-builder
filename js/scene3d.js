/* Cubit Builder — scene3d.js */
import { CEIL, FLOOR, FT, H, POD, PW, T, WALL_BASE, LAYER_KINDS, NOTCH } from './config.js';
import { MODELS } from './data.js';
import { podOffsets, screwsFor, slotsFor, layerSlotsFor, podList, deckList, layoutOffsets, padsFor } from './layout.js';
import { boolTree } from './geom2d.js';
import { crossesJoint, notchedOutline, panelCells, panelCount, panelNum, wallLen, panelSpans, panelAt, bodyWall, layerHoles, isShaped, shapeOf, outlinePts, faceShape, handOf } from './panels.js';
import { w3 } from './sheets.js';
import { renderSide } from './sidebar.js';
import { pickFor, pickLayer, state } from './state.js';
import { withLights } from './lights.js';
import { sealRole, sealsFor, SEAL } from './seals.js';
import { getBearing } from './orient.js';
import { symbol, unitFor, pairOf, doorOwner } from './units.js';
import { concretePlan } from './concrete.js';
import { deckMembers } from './deckframe.js';
import { wallFraming, floorBuild } from './framing.js';
import { FRAME, FLOOR_BUILD } from './config.js';
import { DECK } from './config.js';
import { foundationOf } from './state.js';
import { pickLightAt, selectedLights, onMarkers, lightsOfSlot } from './light-edit-ui.js';
import { buildFurniture, applyFurniture, furnMeshes, explodeFurniture, furnHolder, onFurnApplied, setWalls, handleMeshes } from './furniture.js';

/* ============================================================ 3D studio */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40,1,0.5,500);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI*0.999; controls.minPolarAngle = 0;
scene.add(new THREE.HemisphereLight(0xffffff,0x8a8a80,0.85));
const sun = new THREE.DirectionalLight(0xffffff,0.75); sun.position.set(30,50,20); scene.add(sun);
const grid = new THREE.GridHelper(96,24,0x9aa39b,0xc3c9c1); grid.position.y=-FLOOR-0.02; scene.add(grid);
let homeGroup = new THREE.Group(); scene.add(homeGroup);
let framingMeshes = [], plateMeshes = [], rimGroup = null, wallGroups = [], layerGroups = [], deckGroups = [], roofGroup=null, ceilGroup=null, floorGroup=null, screwGroup=null, fpGroup=null, unitMeshes=[], floorMats=[], pickables=[];

function themeColors(){
  const dark = (document.documentElement.dataset.theme==='dark') || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? {bg:0x1a1e1c, grid1:0x4a524c, grid2:0x2c322e} : {bg:0xe3e6e0, grid1:0x9aa39b, grid2:0xc3c9c1};
}
function applyTheme(){ const c=themeColors(); scene.background=new THREE.Color(c.bg); }
applyTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);

const MAT = {
  glass: new THREE.MeshStandardMaterial({color:0x8fc3ea,transparent:true,opacity:0.55,roughness:0.1}),
  door: new THREE.MeshStandardMaterial({color:0x6b4a2f,roughness:0.7,transparent:true,opacity:1}),
  recess: new THREE.MeshBasicMaterial({color:0x3a3530, side:THREE.DoubleSide}),
  hand: new THREE.MeshBasicMaterial({color:0x8e44ad, side:THREE.DoubleSide}),   // made by hand, not by the CNC
  doorInt: new THREE.MeshStandardMaterial({color:0xe6e6e2,roughness:0.6,transparent:true,opacity:1}),   // interior doors: light grey / white
  outlet: new THREE.MeshStandardMaterial({color:0xf2f2f2}),
  sw: new THREE.MeshStandardMaterial({color:0x2f6db5}),
  extOutlet: new THREE.MeshStandardMaterial({color:0x2f8a57}),
  light: new THREE.MeshStandardMaterial({color:0xffd34d,emissive:0x664400}),
  floor: new THREE.MeshStandardMaterial({color:0x8d8f86,roughness:0.9}),
  steel: new THREE.MeshStandardMaterial({color:0x56606b,metalness:0.6,roughness:0.45}),
  bracket: new THREE.MeshStandardMaterial({color:0xd0661f,metalness:0.4,roughness:0.5}),
  roof: new THREE.MeshStandardMaterial({color:0x4b514d,transparent:true,opacity:0.92,roughness:0.8})
};
const lineMat = new THREE.LineBasicMaterial({color:0x3b3122});
MAT.frame = new THREE.MeshStandardMaterial({color:0xf3f2ee, roughness:0.6});
const symMat = new THREE.LineBasicMaterial({color:0x1c3d5a});
/* one window or door from the library, centred in its rough opening; wall-local feet (x along, y up, z out) */
function buildUnit(o, r, t, interior=false){
  const u=r.unit, g=new THREE.Group(), W=Math.min(u.w,o.w-0.1), Hh=Math.min(u.h,o.h-0.1);   // never flush with the opening's sides
  const x0=o.x+(o.w-W)/2, y0=o.y+(o.h-Hh)/2, d=Math.min(u.d||4.5, t*FT-0.5)/FT, zc=-t/2, fw=1.75;
  const box=(x,y,w,h,dd,mat)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w/FT,h/FT,dd),mat); m.position.set((x+w/2)/FT,(y+h/2)/FT,zc); g.add(m); return m; };
  // a round window: a ring frame and round glass, centred in the round rough opening
  if(u.type==='round'){
    const R=Math.min(W,Hh)/2, cx=(o.x+o.w/2)/FT, cy=(o.y+o.h/2)/FT;
    const ring=new THREE.Shape(); ring.absarc(0,0,R/FT,0,Math.PI*2,false);
    const hole=new THREE.Path(); hole.absarc(0,0,(R-fw)/FT,0,Math.PI*2,true); ring.holes.push(hole);
    const fg=new THREE.ExtrudeGeometry(ring,{depth:d, bevelEnabled:false, curveSegments:40}); fg.translate(0,0,-d/2);
    const fm=new THREE.Mesh(fg,MAT.frame); fm.position.set(cx,cy,zc); g.add(fm);
    const gl=new THREE.Mesh(new THREE.CylinderGeometry((R-fw)/FT,(R-fw)/FT,0.05,40),MAT.glass); gl.rotation.x=Math.PI/2; gl.position.set(cx,cy,zc); g.add(gl);
    return g;
  }
  // frame
  box(x0,y0,fw,Hh,d,MAT.frame); box(x0+W-fw,y0,fw,Hh,d,MAT.frame);
  box(x0+fw,y0+Hh-fw,W-2*fw,fw,d,MAT.frame); box(x0+fw,y0,W-2*fw,fw,d,MAT.frame);
  // glass, or the door leaf with its knob on the handle side
  if(u.type==='entry'){
    box(x0+fw,y0+fw,W-2*fw,Hh-2*fw,0.14,interior?MAT.doorInt:MAT.door);
    const kx = r.hand==='R' ? x0+fw+3 : x0+W-fw-3, knob=new THREE.SphereGeometry(0.12,12,8);
    [zc+0.12, zc-0.12].forEach(z=>{ const k=new THREE.Mesh(knob,MAT.steel); k.position.set(kx/FT, (y0+36)/FT, z); g.add(k); });
  } else box(x0+fw,y0+fw,W-2*fw,Hh-2*fw,0.05,MAT.glass);
  // symbol on both faces
  const sym=symbol(u.type, r.hand, W, Hh), pts=[];
  [0.02, -t-0.02].forEach(z=>{
    sym.segs.forEach(([a,b,c,e])=>pts.push((x0+a)/FT,(y0+b)/FT,z,(x0+c)/FT,(y0+e)/FT,z));
    sym.arrows.forEach(([a,b,c,e])=>{ pts.push((x0+a)/FT,(y0+b)/FT,z,(x0+c)/FT,(y0+e)/FT,z);
      const ang=Math.atan2(e-b,c-a), k=3; [ang+2.6, ang-2.6].forEach(q=>pts.push((x0+c)/FT,(y0+e)/FT,z,(x0+c+k*Math.cos(q))/FT,(y0+e+k*Math.sin(q))/FT,z)); });
  });
  // a man door's swing on the floor: a quarter circle from the hinge, inside (in) or outside (out)
  if(u.type==='entry'){
    const hx = r.hand==='R' ? x0+W : x0, dir = r.hand==='R' ? -1 : 1, R=W, zs = r.swing==='out' ? 1 : -1, zb = r.swing==='out' ? 0.02 : -t-0.02;
    let px=hx+dir*R, pz=0;
    for(let i=1;i<=16;i++){ const a=i/16*Math.PI/2, nx=hx+dir*R*Math.cos(a), nz=R*Math.sin(a);
      pts.push(px/FT,(y0+0.3)/FT,zb+zs*pz/FT, nx/FT,(y0+0.3)/FT,zb+zs*nz/FT); px=nx; pz=nz; }
    pts.push(hx/FT,(y0+0.3)/FT,zb, hx/FT,(y0+0.3)/FT,zb+zs*R/FT);
  }
  const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  g.add(new THREE.LineSegments(lg,symMat));
  return g;
}

function letterSprite(txt, size){
  const c=document.createElement('canvas'); c.width=256; c.height=160; const g=c.getContext('2d');
  g.fillStyle='#1c211e'; g.beginPath(); if(g.roundRect) g.roundRect(8,8,240,144,26); else g.rect(8,8,240,144); g.fill();
  g.fillStyle='#ffffff'; g.font='bold 96px Archivo, Arial, sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(txt,128,86);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));
  sp.scale.set(size*1.6,size,1); sp.renderOrder=11; return sp;
}
function numberSprite(txt, size, accent){
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.fillStyle='#ffffff'; g.beginPath(); g.arc(64,64,58,0,Math.PI*2); g.fill();
  g.lineWidth=8; g.strokeStyle=accent||'#d0661f'; g.stroke();
  g.fillStyle='#1c211e'; g.font='bold 70px Archivo, Arial, sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(txt,64,68);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));
  sp.scale.set(size,size,1); sp.renderOrder=10; return sp;
}

/* a slab (inches a..b × y0..y1, depth d feet, from z=0 to z=d) with round holes / slots cut right through */
function holedSlab(a,b,y0,y1,shapes,d){
  const sh=new THREE.Shape([[a,y0],[b,y0],[b,y1],[a,y1]].map(([x,y])=>new THREE.Vector2(x/FT,y/FT)));
  shapes.forEach(S=>{ const P=outlinePts(S).slice(0,-1).map(([x,y])=>new THREE.Vector2(x/FT,y/FT)); sh.holes.push(new THREE.Path(P)); });
  return new THREE.ExtrudeGeometry(sh, {depth:d, bevelEnabled:false, curveSegments:24});
}
const HAND_LINE = new THREE.LineBasicMaterial({color:0x8e44ad});
const SEAL_LOW = new THREE.MeshStandardMaterial({color:0x1f6fe0, roughness:0.6, emissive:0x082a66}), SEAL_HIGH = new THREE.MeshStandardMaterial({color:0xe8170f, roughness:0.6, emissive:0x5a0400});   // high seal bright red (it takes the most water), low seal blue
/* purple outline of a hand-made feature, drawn on a face (points in inches, plane z in feet) */
function handLoop(P, z, flat){ const pts=P.map(p=>flat ? new THREE.Vector3(p[0]/FT, z, p[1]/FT) : new THREE.Vector3(p[0]/FT, p[1]/FT, z)); return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), HAND_LINE); }
const BOX_FLOOR = new THREE.MeshBasicMaterial({color:0xf4f1ea, side:THREE.DoubleSide});   // the back of a carved electrical box
/* A slab piece (inches a..b × y0..y1, d feet thick along its extrusion axis, 0..d) with every cut exactly as drawn:
   cuts = [{P:[[x,y],…] closed outline in inches, lo, hi}] — removed between lo and hi (feet along the thickness).
   Through cuts run 0..d; a pocket runs from its face to its depth. Built as one extrusion per depth band. */
function cutSlab(a,b,y0,y1,d,cuts,outline){
  const zs=[...new Set([0,d,...cuts.flatMap(c=>[c.lo,c.hi]).filter(z=>z>1e-4 && z<d-1e-4)])].sort((p,q)=>p-q), out=[];
  for(let i=0;i<zs.length-1;i++){
    const z0=zs[i], z1=zs[i+1]; if(z1-z0<1e-4) continue; const mid=(z0+z1)/2;
    const sh=new THREE.Shape((outline||[[a,y0],[b,y0],[b,y1],[a,y1]]).map(([x,y])=>new THREE.Vector2(x/FT,y/FT)));
    cuts.filter(c=>c.lo<=mid && c.hi>=mid).forEach(c=>sh.holes.push(new THREE.Path(c.P.slice(0,-1).map(([x,y])=>new THREE.Vector2(x/FT,y/FT)))));
    const g=new THREE.ExtrudeGeometry(sh,{depth:z1-z0, bevelEnabled:false, curveSegments:24}); g.translate(0,0,z0); out.push(g);
  }
  return out;
}
/* which cuts can be carved in a piece: wholly inside it, and not touching another cut at the same depth (those stay
   painted on the face, so the mesh never breaks) */
function carvable(cands, a,b,y0,y1){
  const ok=[], bb=P=>{ const xs=P.map(p=>p[0]), ys=P.map(p=>p[1]); return [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)]; };
  cands.forEach(c=>{ const B=c.B||(c.B=bb(c.P)); const m=0.06;
    if(B[0]<a+m || B[1]>b-m || B[2]<y0+m || B[3]>y1-m) return;
    if(ok.some(o=>o.lo<c.hi && c.lo<o.hi && !(B[1]+m<o.B[0] || o.B[1]+m<B[0] || B[3]+m<o.B[2] || o.B[3]+m<B[2]))) return;
    ok.push(c); });
  return ok;
}
/* builds one wall as panel groups in local feet coords: x along (exterior-left = 0), y up, z outward (outer face at 0) */
function buildWallMesh(w, mat, opts={}){
  const g = new THREE.Group(); const n=panelCount(w); const panels=[]; const spans=panelSpans(w), L=wallLen(w);
  const t=(w.t||T)/FT;
  // part-way cuts on either face that have a drawn size: carved into the panels below
  const faceCuts=[];
  [[w.inside||[], x=>L-x, true], [w.outside||[], x=>x, false]].forEach(([items,toX,ins])=>items.forEach(b=>{
    if(!b.depth) return; const P=faceShape(b,toX); if(!P) return; b.carved=false;
    faceCuts.push({P, dep:Math.min(b.depth,(w.t||T))/FT, inside:ins, src:b}); }));
  for(let k=0;k<n;k++){
    const pg=new THREE.Group(); pg.userData.k=k;
    const [nl,nr]=w.notch||[0,0], nd=Math.min(NOTCH, (w.t||T)-0.5)/FT;
    panelCells(w,k).forEach(([x0,x1,y0,y1])=>{
      // split off the corner notch: there the wall is only (t − 1¾″) deep, flush with the inside face
      const cuts=[x0, ...[nl, L-nr].filter(c=>c>x0+1e-6 && c<x1-1e-6), x1];
      for(let c=0;c<cuts.length-1;c++){
        const a=cuts[c], b=cuts[c+1], mid=(a+b)/2, notched=(nl&&mid<nl)||(nr&&mid>L-nr), d=notched?t-nd:t;
        // round holes / slots inside this piece: cut exactly (extruded outline with holes), else a plain box
        const inside=w.openings.filter(o=>isShaped(o) && o.x>=a-1e-6 && o.x+o.w<=b+1e-6 && o.y>=y0-1e-6 && o.y+o.h<=y1+1e-6);
        // pockets from either face, carved to their depth (z here: 0 = inside face, d = this piece's outer face)
        const pk=carvable(faceCuts.map(c=>({...c, lo:c.inside?0:Math.max(0,d-c.dep), hi:c.inside?Math.min(d,c.dep):d})), a,b,y0,y1);
        pk.forEach(c=>{ c.src.carved=true; });
        // round holes / slots running over this piece's side edge: their part comes out of the edge as a notch
        const edge=w.openings.filter(o=>crossesJoint(o) && o.x<b-1e-6 && o.x+o.w>a+1e-6 && !inside.includes(o));
        // a drawn outline (Shape studio, STEP) over the edge: the piece minus the outlines, exactly (Clipper), holes and all
        if(edge.some(o=>o.shape==='poly') && globalThis.ClipperLib){
          const rect=[[a,y0],[b,y0],[b,y1],[a,y1]], parts=boolTree([rect], edge.map(o=>outlinePts(shapeOf(o)).slice(0,-1)), 'diff');
          const extra=inside.map(o=>({P:outlinePts(shapeOf(o)), lo:0, hi:d})).concat(pk), close=P=>[...P, P[0]];
          const within=(P,q)=>{ let c=false; for(let i=0,j=P.length-1;i<P.length;j=i++){ const u=P[i], v=P[j]; if((u[1]>q[1])!==(v[1]>q[1]) && q[0]<(v[0]-u[0])*(q[1]-u[1])/(v[1]-u[1])+u[0]) c=!c; } return c; };
          parts.forEach(pt=>{ const mine=extra.filter(c=>within(pt.outer, c.P[0])), holes=pt.holes.map(h=>({P:close(h), lo:0, hi:d}));
            cutSlab(a,b,y0,y1,d,holes.concat(mine),pt.outer).forEach(g=>{ const m=new THREE.Mesh(g, mat); m.position.z=-t; pg.add(m); }); });
          continue;
        }
        const outline = edge.length ? notchedOutline(a,b,y0,y1, edge.map(shapeOf)) || null : null;
        if(inside.length || pk.length || outline){
          const thr=inside.map(o=>({P:outlinePts(shapeOf(o)), lo:0, hi:d}));
          cutSlab(a,b,y0,y1,d,thr.concat(pk),outline).forEach(g=>{ const m=new THREE.Mesh(g, mat); m.position.z=-t; pg.add(m); });
        } else {
          const m=new THREE.Mesh(new THREE.BoxGeometry((b-a)/FT,(y1-y0)/FT,d),mat);
          m.position.set(mid/FT,(y0+y1)/2/FT,-t+d/2); pg.add(m);
        }
      }
    });
    // outline of panel + opening edges on both faces
    const pts=[]; const X0=spans[k][0]/FT, X1=spans[k][1]/FT, Ht=H/FT;
    [0.004,-t-0.004].forEach(z=>{ pts.push(X0,0,z,X1,0,z, X1,0,z,X1,Ht,z, X1,Ht,z,X0,Ht,z, X0,Ht,z,X0,0,z); });
    // round holes / slots of this panel: their outline on both faces
    w.openings.filter(o=>isShaped(o) && o.x>=spans[k][0]-1e-6 && o.x+o.w<=spans[k][1]+1e-6).forEach(o=>{ const P=outlinePts(shapeOf(o));
      [0.004,-t-0.004].forEach(z=>{ for(let i=0;i<P.length-1;i++) pts.push(P[i][0]/FT,P[i][1]/FT,z, P[i+1][0]/FT,P[i+1][1]/FT,z); }); });
    const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    pg.add(new THREE.LineSegments(lg,lineMat));
    g.add(pg); panels.push(pg);
  }
  // openings made by hand: a purple outline on both faces
  w.openings.filter(o=>handOf(o)).forEach(o=>{ const P=outlinePts(shapeOf(o)); [0.012, -t-0.012].forEach(z=>g.add(handLoop(P, z))); });
  // openings: the unit chosen for it (frame, glass or door leaf, and its symbol), else plain glass / door leaf
  w.openings.forEach(o=>{
    if(o.kind==='opening'||o.kind==='vent'||o.kind==='shape') return;   // cased opening / vent / drawn shape: just a hole
    if(opts.openOnly && opts.openOnly(o)) return;      // the door between two pods is in the neighbour's wall: here it's just the opening
    const r=opts.unitOf ? opts.unitOf(o) : null, interior = w.type==='int';
    const m = r ? buildUnit(o, r, t, interior) : (()=>{ const thick = o.kind==='window'? 0.05 : 0.12;
      const b=new THREE.Mesh(new THREE.BoxGeometry(o.w/FT,o.h/FT,thick), o.kind==='door'?(interior?MAT.doorInt:MAT.door):MAT.glass);
      b.position.set((o.x+o.w/2)/FT,(o.y+o.h/2)/FT,-t/2); return b; })();
    m.userData.unit=true; m.userData.k=panelAt(w, o.x+o.w/2); m.userData.okey = o.key ?? `${o.kind}@${Math.round(o.x)}`;
    g.add(m);
  });
  // face items exactly as drawn: boxes at their real size, pockets / recesses / chases as dark outlines on their face;
  // old-style markers (no drawn size) as the plug / switch symbols
  const flat=(P,z,mat)=>{ const m=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(P.map(p=>new THREE.Vector2(p[0]/FT,p[1]/FT))),24), mat); m.position.z=z; return m; };
  [[w.inside, x=>L-x, -t, -1], [w.outside, x=>x, 0, 1]].forEach(([items, toX, z0, dir])=>items.forEach(b=>{
    const P=faceShape(b, toX), X=toX(b.x);
    if(P && b.carved){   // carved to its depth: mark the bottom of the pocket (white for an electrical box)
      const m=flat(P, z0-dir*Math.min(b.depth,(w.t||T))/FT + dir*0.004, handOf(b)?MAT.hand:b.kind==='box'?BOX_FLOOR:MAT.recess); m.userData.k=panelAt(w,X); g.add(m);
      if(handOf(b)) g.add(handLoop(P, z0+dir*0.008));
      return; }
    if(P && b.kind==='box' && !b.shape?.match(/round|slot|poly/)){
      const m=new THREE.Mesh(new THREE.BoxGeometry(b.w/FT,b.h/FT,0.06), MAT.outlet); m.position.set(X/FT,b.y/FT,z0+dir*0.03); m.userData.k=panelAt(w,X); g.add(m); return; }
    if(P){ const m=flat(P, z0+dir*0.006, handOf(b)?MAT.hand:MAT.recess); m.userData.k=panelAt(w,X); g.add(m); return; }
    const inside=dir<0;
    const m=inside ? new THREE.Mesh(new THREE.BoxGeometry(2.5/FT,4/FT,0.06), b.kind==='switch'?MAT.sw:MAT.outlet)
                   : new THREE.Mesh(new THREE.BoxGeometry(3/FT,(b.kind==='light'?5:4)/FT,0.08), b.kind==='light'?MAT.light:(w.type==='int'?(b.kind==='switch'?MAT.sw:MAT.outlet):MAT.extOutlet));
    m.position.set(X/FT,b.y/FT,z0+dir*(inside?0.03:0.04)); m.userData.k=panelAt(w,X); g.add(m); }));
  // panel numbers
  if(opts.nums){
    for(let k=0;k<n;k++){
      const sp=numberSprite(String(panelNum(n,k,opts.reverse)), opts.numSize||1.1);
      sp.position.set((spans[k][0]+spans[k][1])/2/FT, H/FT+0.75, opts.numZ!==undefined?opts.numZ:0.3);
      panels[k].add(sp);
    }
  }
  return {group:g, panels};
}

const LAYER_COLOR = {'floor-ext':0x8d8f86, 'floor-int':0xb9b2a0, 'ceiling-int':0xd9d2bf, 'roof':0x4b514d};
/* one floor / ceiling layer as boxes around its holes; local feet coords: x along the pod, z across, y up from the layer's underside */
function buildLayerMesh(L, mat){
  const g=new THREE.Group(), len=L.len*FT, wid=96, t=(L.t||4.5)/FT;
  const all=layerHoles(L), thru=h=>!h.depth;
  const shaped=all.filter(h=>isShaped(h) && thru(h)), blind=all.filter(h=>!thru(h));
  const holes=all.filter(h=>!isShaped(h) && thru(h)).map(h=>({x0:h.x,x1:h.x+h.w,z0:h.z,z1:h.z+h.d}));
  const xs=[...new Set([0,len,...holes.flatMap(h=>[h.x0,h.x1])])].filter(v=>v>=0&&v<=len).sort((a,b)=>a-b);
  const zs=[...new Set([0,wid,...holes.flatMap(h=>[h.z0,h.z1])])].filter(v=>v>=0&&v<=wid).sort((a,b)=>a-b);
  const lsh = h => shapeOf({...h, y:h.z, h:h.d, d:h.dia, ends:h.ends});   // layer coords: x along, z across
  // pockets from the top or the bottom: carved to their depth (extrusion z: 0 = top face, t = bottom face)
  const bcuts=blind.map(h=>{ const dp=Math.min(h.depth,(L.t||4.5))/FT; return {P:outlinePts(lsh(h)), lo:h.face==='bottom'?t-dp:0, hi:h.face==='bottom'?t:dp, src:h}; });
  const carvedSet=new Set();
  const piece=(x0,x1,z0,z1)=>{
    const inside=shaped.filter(h=>h.x>=x0-1e-6 && h.x+h.w<=x1+1e-6 && h.z>=z0-1e-6 && h.z+h.d<=z1+1e-6);
    const pk=carvable(bcuts.map(c=>({...c})), x0,x1,z0,z1); pk.forEach(c=>carvedSet.add(c.src));
    if(inside.length || pk.length){
      cutSlab(x0,x1,z0,z1,t, inside.map(h=>({P:outlinePts(lsh(h)), lo:0, hi:t})).concat(pk)).forEach(geo=>{
        const m=new THREE.Mesh(geo, mat); m.rotation.x=Math.PI/2; m.position.y=t; g.add(m); });
      return; }
    const m=new THREE.Mesh(new THREE.BoxGeometry((x1-x0)/FT,t,(z1-z0)/FT),mat); m.position.set((x0+x1)/2/FT,t/2,(z0+z1)/2/FT); g.add(m); };
  for(let i=0;i<xs.length-1;i++){
    let run=null;
    for(let j=0;j<zs.length-1;j++){
      const cx=(xs[i]+xs[i+1])/2, cz=(zs[j]+zs[j+1])/2;
      const hole=holes.some(h=>cx>h.x0&&cx<h.x1&&cz>h.z0&&cz<h.z1);
      if(!hole){ if(run) run[1]=zs[j+1]; else run=[zs[j],zs[j+1]]; }
      if((hole||j===zs.length-2) && run){ piece(xs[i],xs[i+1],run[0],run[1]); run=null; }
    }
  }
  // recesses that don't go through: a dark outline on their face
  all.filter(h=>handOf(h)).forEach(h=>{ const P=outlinePts(lsh(h)); [-0.01, t+0.01].forEach(y=>g.add(handLoop(P, y, true))); });
  blind.forEach(h=>{ const P=outlinePts(lsh(h)); const m=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(P.map(p=>new THREE.Vector2(p[0]/FT,p[1]/FT))),24), handOf(h)?MAT.hand:MAT.recess);
    const dp=Math.min(h.depth,(L.t||4.5))/FT, carved=carvedSet.has(h);   // carved: mark the bottom of the pocket, else its outline on the face
    m.rotation.x=Math.PI/2; m.position.y = h.face==='bottom' ? (carved ? dp-0.004 : -0.006) : (carved ? t-dp+0.004 : t+0.006); g.add(m); });
  // panel joints and round-hole outlines on the top face
  const pts=[]; (L.seams||[]).forEach(sx=>{ pts.push(sx/FT,t+0.004,0, sx/FT,t+0.004,8); });
  shaped.forEach(h=>{ const P=outlinePts(lsh(h)); for(let i=0;i<P.length-1;i++) pts.push(P[i][0]/FT,t+0.004,P[i][1]/FT, P[i+1][0]/FT,t+0.004,P[i+1][1]/FT); });
  if(pts.length){ const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3)); g.add(new THREE.LineSegments(lg,lineMat)); }
  return g;
}
/* one deck frame in its own frame: x along the ledger (0..W), z outward (0..D), inches; y up from its underside */
const DECK_MAT = new THREE.MeshStandardMaterial({color:0xa88f5d, roughness:0.9});
function buildDeckMesh(L, mat){
  // framed by Cubit's deck rules (deckframe.js): double 2×8 rims, 2×8 joists 24″ or 16″ o.c. from the house, notched corners
  const g=new THREE.Group(), h=DECK.depth;
  deckMembers(L).forEach(([nm,x0,x1,z0,z1])=>{ const m=new THREE.Mesh(new THREE.BoxGeometry((x1-x0)/FT,h/FT,(z1-z0)/FT),mat); m.position.set((x0+x1)/2/FT,h/2/FT,(z0+z1)/2/FT); g.add(m); });
  return g;
}
function buildHome(){
  scene.remove(homeGroup); homeGroup=new THREE.Group(); scene.add(homeGroup);
  wallGroups=[]; layerGroups=[]; deckGroups=[]; pickables=[]; floorMats=[]; framingMeshes=[]; plateMeshes=[];
  const slots = slotsFor(state.model); const model=MODELS[state.model];
  const OFF = podOffsets(state.model);
  const pods = podList(state.model).map((p,i)=>({...p,x:p.x+OFF[i].ox,z:p.z+OFF[i].oz}));
  const LOd=layoutOffsets(state.model).decks;
  const boxes=pods.map(p=>[p.x,p.z,p.x+p.w,p.z+p.d]).concat(deckList(state.model).map((d,k)=>[d.x+LOd[k].ox,d.z+LOd[k].oz,d.x1+LOd[k].ox,d.z1+LOd[k].oz]));
  const minx=Math.min(...boxes.map(b=>b[0])), maxx=Math.max(...boxes.map(b=>b[2]));
  const minz=Math.min(...boxes.map(b=>b[1])), maxz=Math.max(...boxes.map(b=>b[3]));
  const cx=(minx+maxx)/2, cz=(minz+maxz)/2;
  homeGroup.position.set(-cx,0,-cz);
  podCentres = pods.map(p=>({x:p.x+p.w/2-cx, z:p.z+p.d/2-cz, span:Math.max(p.w,p.d)}));
  if(state.focusPod!=null && state.focusPod>=pods.length) state.focusPod=null;
  // floor and ceiling layers (exterior floor, interior floor, interior ceiling, roof) + ground screws
  roofGroup=new THREE.Group(); ceilGroup=new THREE.Group(); floorGroup=new THREE.Group(); homeGroup.add(floorGroup);
  layerSlotsFor(state.model).forEach(ls=>{
    const L=withLights(pickLayer(ls), ls); const isFloor=ls.kind.startsWith('floor');
    // ceiling + roof stay see-through so they never hide the walls; floors go see-through when the ground screws show
    const mat=new THREE.MeshStandardMaterial({color:LAYER_COLOR[ls.kind], roughness:0.85, transparent:!isFloor, opacity: isFloor ? 1 : 0.42, depthWrite: isFloor});
    if(isFloor) floorMats.push(mat);
    const grp=buildLayerMesh(L, mat);
    const y=((L.z??LAYER_KINDS[ls.kind].z)-WALL_BASE)/FT;
    // turned pods: rotate the layer about its corner, then move that corner back onto the footprint
    // three.js turns counter-clockwise seen from above for +angle, so a clockwise turn is negative
    const th=-(ls.rot||0)*Math.PI/180, L0=ls.len;
    const off={0:[0,0],90:[8,0],180:[L0,8],270:[0,L0]}[ls.rot||0];
    const inner=new THREE.Group(); inner.add(...grp.children); grp.add(inner);
    inner.rotation.y=th; inner.position.set(off[0],0,off[1]);
    grp.position.set(ls.x, y, ls.z);
    grp.userData={layerSlot:ls, mat, baseY:y, bx:grp.position.x, bz:grp.position.z, pod:ls.pod.i, inner};
    grp.traverse(o=>{ if(o.isMesh){ o.userData.slotId=ls.id; pickables.push(o); } });
    (isFloor?floorGroup:ls.kind==='roof'?roofGroup:ceilGroup).add(grp); layerGroups.push(grp);
  });
  homeGroup.add(ceilGroup); homeGroup.add(roofGroup);
  // decks (porch frames), docked with the same ¾″ space as pods
  deckGroups=[];
  const DOFF=layoutOffsets(state.model).decks;
  deckList(state.model).forEach((d,k)=>{
    const mat=DECK_MAT.clone();
    const grp=new THREE.Group(), inner=buildDeckMesh(d.L, mat);
    const W=d.L.W/FT, D=d.L.D/FT, off={0:[0,0],90:[D,0],180:[W,D],270:[0,W]}[d.rot];
    inner.rotation.y=-d.rot*Math.PI/180; inner.position.set(off[0],0,off[1]); grp.add(inner);
    const y=((d.L.z||0)-WALL_BASE)/FT;
    grp.position.set(d.x+DOFF[k].ox, y, d.z+DOFF[k].oz);
    grp.userData={deck:d, id:`deck:${k}`, mat, baseY:y, bx:grp.position.x, bz:grp.position.z, k};
    grp.traverse(o=>{ if(o.isMesh){ o.userData.slotId=`deck:${k}`; pickables.push(o); } });
    homeGroup.add(grp); deckGroups.push(grp);
  });
  // with the house turned off, only the ground screws, pads and footprints show
  screwGroup=new THREE.Group(); homeGroup.add(screwGroup);
  screwGroup.position.y=-0.006;   // the foundation stops a hair below the ACM, so their touching faces never flicker through each other
  // concrete pads under decks that float instead of sitting on screws
  { const padG=new THREE.BoxGeometry(16/FT, 8/FT, 16/FT), padM=new THREE.MeshStandardMaterial({color:0xa7a9a4, roughness:0.95});
    padsFor(state.model, state.inset).forEach(pd=>{ const m=new THREE.Mesh(padG,padM); m.position.set(pd.x, -WALL_BASE/FT - 4/FT, pd.z); screwGroup.add(m); }); }
  // concrete foundation: footing, ICF (foam / core / foam) and the inside supports
  if(foundationOf(state.model)==='concrete') screwGroup.add(buildConcrete());
  { // footprints on the ground so the screws can be read against the home when walls and floors are off
    fpGroup=new THREE.Group(); homeGroup.add(fpGroup);
    const fpMat=new THREE.LineBasicMaterial({color:0x3b3122}), dkMat=new THREE.LineDashedMaterial({color:0x8a7a5c, dashSize:0.6, gapSize:0.4});
    const loop=(x0,z0,x1,z1,mat)=>{ const g=new THREE.BufferGeometry().setFromPoints([[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]].map(([x,z])=>new THREE.Vector3(x,-FLOOR-0.01,z))); const l=new THREE.Line(g,mat); l.computeLineDistances(); fpGroup.add(l); };
    pods.forEach(p=>loop(p.x,p.z,p.x+p.w,p.z+p.d,fpMat));
    const LOd2=layoutOffsets(state.model).decks;
    deckList(state.model).forEach((d,k)=>loop(d.x+LOd2[k].ox,d.z+LOd2[k].oz,d.x1+LOd2[k].ox,d.z1+LOd2[k].oz,dkMat));
  }
  const shaftG=new THREE.CylinderGeometry(0.12,0.12,5.5,10), brXG=new THREE.BoxGeometry(1.25,0.06,0.58), brZG=new THREE.BoxGeometry(0.58,0.06,1.25),
    collarG=new THREE.CylinderGeometry(0.17,0.17,0.5,14),
    gussetG=(()=>{ const sh=new THREE.Shape(); sh.moveTo(0.1,0); sh.lineTo(0.98,0); sh.lineTo(0.98,-0.08); sh.lineTo(0.1,-0.85); sh.closePath();
      const g=new THREE.ExtrudeGeometry(sh,{depth:0.05,bevelEnabled:false}); g.translate(0,0,-0.025); return g; })(),
    gussetSmallG=(()=>{ const sh=new THREE.Shape(); sh.moveTo(0.1,0); sh.lineTo(0.23,0); sh.lineTo(0.1,-0.3); sh.closePath();
      const g=new THREE.ExtrudeGeometry(sh,{depth:0.05,bevelEnabled:false}); g.translate(0,0,-0.025); return g; })(), helixG=new THREE.CylinderGeometry(0.45,0.45,0.04,18);
  const plateG=new THREE.BoxGeometry(1.25,0.06,0.58), swivelG=new THREE.CylinderGeometry(0.3,0.3,0.05,20);
  screwsFor(state.model,state.inset).forEach(sc=>{
    const s=new THREE.Group();
    const sh=new THREE.Mesh(shaftG,MAT.steel); sh.position.y=-FLOOR-2.75; s.add(sh);
    const col=new THREE.Mesh(collarG,MAT.steel); col.position.y=-FLOOR-0.06-0.25; s.add(col);
    [-4.8,-5.8].forEach(y=>{ const h=new THREE.Mesh(helixG,MAT.steel); h.position.y=y; h.rotation.z=0.12; s.add(h); });
    const ang=d=>Math.atan2(-d[1],d[0]);
    const gusset=(d,big,mat)=>{ const g=new THREE.Mesh(big?gussetG:gussetSmallG, mat); g.position.y=-FLOOR-0.06; g.rotation.y=ang(d); s.add(g); };
    if(sc.head==='swivel'){
      // perimeter: swivel head with its bracket turned in under the pod; it can turn out later for a deck or another pod
      const sw=new THREE.Mesh(swivelG,MAT.steel); sw.position.y=-FLOOR-0.085; s.add(sw);
      const alongX=Math.abs(sc.dir[0])>0.5;
      const cap=new THREE.Mesh(alongX?brXG:brZG, MAT.steel); cap.position.set(sc.dir[0]*0.375,-FLOOR-0.03,sc.dir[1]*0.375); s.add(cap);
      gusset(sc.dir,true,MAT.steel); gusset([-sc.dir[0],-sc.dir[1]],false,MAT.steel);
    } else {
      // shared: plate centred on the joint, square across it; tee / cross heads where 3 or 4 pods meet
      const d=sc.dir, perp=[d[1],-d[0]];
      const p1=new THREE.Mesh(plateG,MAT.bracket); p1.rotation.y=ang(d); p1.position.y=-FLOOR-0.03; s.add(p1);
      gusset(d,true,MAT.bracket); gusset([-d[0],-d[1]],true,MAT.bracket);
      if(sc.head!=='centre'){
        const p2=new THREE.Mesh(plateG,MAT.bracket); p2.rotation.y=ang(perp); p2.position.y=-FLOOR-0.03; s.add(p2);
        gusset(perp,true,MAT.bracket); gusset([-perp[0],-perp[1]],true,MAT.bracket);
      }
    }
    if(sc.arm){   // corner arm reaching a corner the screw took over
      const L=Math.hypot(sc.arm[0],sc.arm[1]), arm=new THREE.Mesh(new THREE.BoxGeometry(L,0.06,0.25),MAT.bracket);
      arm.rotation.y=Math.atan2(-sc.arm[1],sc.arm[0]); arm.position.set(sc.arm[0]/2,-FLOOR-0.03,sc.arm[1]/2); s.add(arm);
      const pad=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.06,0.58),MAT.bracket); pad.position.set(sc.arm[0],-FLOOR-0.03,sc.arm[1]); s.add(pad);
    }
    s.position.set(sc.x,0,sc.z); screwGroup.add(s);
  });
  // north arrow on the ground beside the home
  { const B=getBearing()*Math.PI/180, sh=new THREE.Shape();
    sh.moveTo(0,2.2); sh.lineTo(0.9,-0.4); sh.lineTo(0.25,-0.1); sh.lineTo(0.25,-1.6); sh.lineTo(-0.25,-1.6); sh.lineTo(-0.25,-0.1); sh.lineTo(-0.9,-0.4); sh.closePath();
    const arrow=new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({color:0xc0392b, side:THREE.DoubleSide}));
    arrow.rotation.x=-Math.PI/2;
    const ng=new THREE.Group(); ng.add(arrow);
    const lab=letterSprite('N',1.1); lab.position.set(0,0.8,-3.2); ng.add(lab);
    ng.scale.setScalar(1.6); ng.rotation.y=B; ng.position.set(minx-9, -FLOOR-0.01, maxz+12); homeGroup.add(ng); northGroup=ng; }
  slots.forEach(s=>{
    const w=bodyWall(s, pickFor(s)); if(!w) return;
    const mat=new THREE.MeshStandardMaterial({color:s.type==='int'?0xece0c6:0xc9a46a,roughness:0.85});
    const built=buildWallMesh(w,mat,{nums:state.nums,numSize:1.0,numZ:-(w.t||6.5)/FT-0.45,   // panel numbers over the room side, so a joined pod's numbers don't mix in
      unitOf:o=>unitFor(s,o),openOnly:o=>{ const pr=pairOf(s,o); return !!pr && doorOwner(s,o).id!==s.id; }});
    const g=built.group;
    const r=[s.n[1],-s.n[0]];
    g.rotation.y=Math.atan2(-r[1],r[0]);
    const tl=(w.trim?.[0]||0)/FT;   // long walls start inside the end wall's thickness
    g.userData={slot:s, mat, base:new THREE.Vector3(s.p0[0]+r[0]*tl,0,s.p0[1]+r[1]*tl), n:new THREE.Vector3(s.n[0],0,s.n[1])};
    g.position.copy(g.userData.base);
    // between pods (and in a wide cased opening outside) an opening can take up most of the wall: a see-through pane fills it so a click there
    // still picks this wall (and its options); it tints orange when the wall is picked
    { const t=(w.t||(s.type==='int'?4.5:6.5))/FT;
      w.openings.filter(o=>o.kind!=='vent' && o.w>=12 && (s.type==='int' || (o.kind==='opening' && o.w>=48))).forEach(o=>{
        const m=new THREE.Mesh(new THREE.PlaneGeometry(o.w/FT, o.h/FT), new THREE.MeshBasicMaterial({color:0xe0864a, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide}));
        m.position.set((o.x+o.w/2)/FT, (o.y+o.h/2)/FT, -t/2); m.userData.pickPane=true; m.renderOrder=2; g.add(m); }); }
    // the rubber compression seal on the outside face (toward the other pod): high seal red, low seal blue
    const role=sealRole(s, slots);
    sealsFor(w, role, H).forEach(sl=>{
      const curve=new THREE.CatmullRomCurve3(sl.pts.map(([x,y])=>new THREE.Vector3(x/FT, y/FT, SEAL.t/2/FT)), false, 'centripetal');
      const m=new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, sl.pts.length*3), SEAL.t/2/FT, 8, false), role==='high'?SEAL_HIGH:SEAL_LOW);
      m.userData.seal=role; g.add(m); });
    g.traverse(o=>{ if(o.isMesh) { o.userData.slotId=s.id; pickables.push(o);} });
    if(state.letters){
      const t=(w.t||6.5)/12, mid=wallLen(w)/2/FT;
      const lab=letterSprite(s.letter, 1.3); lab.position.set(mid, 4.6, -t-0.6); lab.userData.letter=true; g.add(lab);   // on the inside face, mid-wall
    }
    // framing lumber inside the wall: plates, end studs, jacks, OSB splines (shown with Layers → Framing)
    const fr=wallFraming(s, pickFor(s));
    if(fr){ const tt=(w.t||6.5)/FT, d=fr.lumber.d/FT, osb=FRAME.osb/FT, sp=FRAME.spline.t/FT;
      fr.pieces.forEach(pc=>{
        const isS=pc.kind==='Spline', dz = isS ? sp : pc.zf ? (pc.zf[1]-pc.zf[0])/FT : d, zc = isS ? (pc.face==='outside face' ? -osb-sp/2 : -tt+osb+sp/2) : pc.zf ? -(pc.zf[0]+pc.zf[1])/2/FT : -tt/2;
        const m=new THREE.Mesh(new THREE.BoxGeometry((pc.x1-pc.x0)/FT, (pc.y1-pc.y0)/FT, dz), isS?FRAME_MAT.osb:FRAME_MAT.wood);
        m.position.set((pc.x0+pc.x1)/2/FT, (pc.y0+pc.y1)/2/FT, zc); m.userData.framing=true; m.userData.spline=isS; m.userData.pod=s.pod.i; m.renderOrder=2;
        if(/plate/.test(pc.kind)){
          // plates belong to the floor (bottom) and the ceiling (top): they stay with those when the home explodes
          g.updateMatrix(); m.applyMatrix4(g.matrix); m.userData.plate={pod:s.pod.i, top:pc.kind==='Top plate', base:m.position.clone()};
          homeGroup.add(m); plateMeshes.push(m); framingMeshes.push(m);
        } else { g.add(m); framingMeshes.push(m); } }); }
    homeGroup.add(g); wallGroups.push(g);
  });
  // LVL rims of the floor and roof cassettes: four pieces per pod, open 1⅞″ squares at the outside corners. The
  // floor rims go on with the interior floor (it's built with them), the roof rims with the ceiling; in the
  // exploded view they travel with those layers.
  rimGroup=new THREE.Group(); homeGroup.add(rimGroup);
  { const t=FRAME.lvl.t/FT, e=0.004;   // ~1/20″ proud so the rim's outside face isn't drawn on top of the slab's
    pods.forEach((p,pi)=>{ p.i=pi; });
    pods.forEach(p=>[[FLOOR_BUILD.rimZ, FRAME.lvl.floor, 'floor-int'], [CEIL_Z, FRAME.lvl.roof, 'ceiling-int']].forEach(([z0,h,lay])=>{
      const y=(z0-WALL_BASE)/FT, hh=h/FT, box=(x0,z0_,x1,z1)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,hh,z1-z0_),FRAME_MAT.lvl); m.position.set((x0+x1)/2, y+hh/2, (z0_+z1)/2); m.userData={pod:p.i, lay, base:m.position.clone()}; rimGroup.add(m); };
      box(p.x+t, p.z-e, p.x+p.w-t, p.z+t); box(p.x+t, p.z+p.d-t, p.x+p.w-t, p.z+p.d+e);
      box(p.x-e, p.z+t, p.x+t, p.z+p.d-t); box(p.x+p.w-t, p.z+t, p.x+p.w+e, p.z+p.d-t); }));
    // floor cassette: 8″ EPS strips and 16″ 2×4 joint blocks in the 1½″ gap between the two floor layers
    const [g0,g1]=FLOOR_BUILD.gap, gy=(g0-WALL_BASE)/FT, gh=(g1-g0)/FT;
    pods.forEach(p=>{ const B=floorBuild(p), along = p.w>=p.d;
      const put=([u0,u1,v0,v1],mat,kind)=>{ const [x0,x1,z0,z1] = along ? [u0,u1,v0,v1] : [v0,v1,u0,u1];
        const m=new THREE.Mesh(new THREE.BoxGeometry((x1-x0)/FT, gh*0.98, (z1-z0)/FT), mat);
        m.position.set(p.x+(x0+x1)/2/FT, gy+gh/2, p.z+(z0+z1)/2/FT); m.userData={pod:p.i, lay:'floor-int', base:m.position.clone(), build:kind}; rimGroup.add(m); };
      B.eps.forEach(r=>put(r, FRAME_MAT.eps, 'eps')); B.blocks.forEach(r=>put(r, FRAME_MAT.wood, 'block'));
      // under the floor: 2 mm ACM sheets right under the exterior floor, then the steel frames (2″ × 3″ tube, 8′ × 8′
      // sections) at the very bottom, on the foundation
      const fr=FLOOR_BUILD.frame, ac=FLOOR_BUILD.acp, under=(r,y0,h,mat,kind)=>{ const [x0,x1,z0,z1] = along ? r : [r[2],r[3],r[0],r[1]];
        const m=new THREE.Mesh(new THREE.BoxGeometry((x1-x0)/FT, h/FT, (z1-z0)/FT), mat);
        m.position.set(p.x+(x0+x1)/2/FT, (y0-WALL_BASE)/FT+h/2/FT, p.z+(z0+z1)/2/FT); m.userData={pod:p.i, lay:'frame', base:m.position.clone(), build:kind, always:true}; rimGroup.add(m); };
      B.acp.forEach(r=>under([r[0]+0.05,r[1]-0.05,r[2],r[3]], -ac.t, ac.t, FRAME_MAT.acp, 'acp'));
      B.tubes.forEach(r=>under(r, -ac.t-fr.h, fr.h, FRAME_MAT.steel, 'tube')); });
  }
  unitMeshes=[]; wallGroups.forEach(g=>g.traverse(o=>{ if(o.userData.unit) unitMeshes.push(o); }));
  // cabinets, appliances and furniture, each standing in its pod
  buildFurniture(homeGroup, pods);
  // faces sit a hair behind their own edge lines, so panel seams and outlines draw cleanly instead of flickering
  homeGroup.traverse(o=>{ const m=o.isMesh && o.material; if(m && !m.polygonOffset){ m.polygonOffset=true; m.polygonOffsetFactor=1; m.polygonOffsetUnits=1; } });
  applyLayers();
  highlight();
  // frame camera
  const span=Math.max(maxx-minx,maxz-minz); homeSpan=span;
  if(!buildHome.framed || buildHome.framed!==state.model){
    // a home opens as the flat plan, straight down, filling the view. Editing a home (which turns a built-in home into
    // your own copy) keeps the view where it is.
    const M=MODELS[state.model], prev=buildHome.framed, edited = prev && (M.base===prev || M.base===MODELS[prev]?.base || state.model===MODELS[prev]?.base) && M.custom;
    if(!edited){ const asp=Math.max(0.5, renderer.domElement.clientWidth/Math.max(1,renderer.domElement.clientHeight));
      const sp=Math.max(maxz-minz, (maxx-minx)/asp)+10, dist=sp/2/Math.tan(camera.fov*Math.PI/360)*1.05;
      camera.position.set(0, dist, 0.02); controls.target.set(0,0,0); }
    buildHome.framed=state.model;
  }
  computeSpread(); explodeT = state.exploded?1:0; applyExplode();
}
const FRAME_MAT = { steel:new THREE.MeshStandardMaterial({color:0x3d4247, roughness:0.45, metalness:0.6}), acp:new THREE.MeshStandardMaterial({color:0xc9ccd0, roughness:0.35, metalness:0.3}), eps:new THREE.MeshStandardMaterial({color:0xe9eef2, roughness:0.95}), wood:new THREE.MeshStandardMaterial({color:0xe0b36a, roughness:0.8}), osb:new THREE.MeshStandardMaterial({color:0xb7864a, roughness:0.9}), lvl:new THREE.MeshStandardMaterial({color:0xc9783a, roughness:0.75}) };
const CEIL_Z = 106.6;   // bottom of the roof cassette (interior ceiling), inches above the bottom of the floor
const CONC = { foam:new THREE.MeshStandardMaterial({color:0xe6ebef, roughness:0.95}), core:new THREE.MeshStandardMaterial({color:0xa9aba6, roughness:0.9}),
  foot:new THREE.MeshStandardMaterial({color:0x8f918c, roughness:0.95}), access:new THREE.MeshBasicMaterial({color:0xd0661f}) };
/* the concrete foundation in plan feet (same frame as the pods); its top is the underside of the home */
function buildConcrete(){
  const cp=concretePlan(state.model), g=new THREE.Group(), top=-FLOOR, yb=top-cp.BH, yf=yb-cp.FTk;
  const ring=(outer, inner, y, h, mat)=>{
    const sh=new THREE.Shape(outer.map(([x,z])=>new THREE.Vector2(x,-z)));
    sh.holes.push(new THREE.Path(inner.map(([x,z])=>new THREE.Vector2(x,-z))));
    const m=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:h, bevelEnabled:false}), mat); m.rotation.x=-Math.PI/2; m.position.y=y; g.add(m); };
  const O=cp.off;
  cp.band(O.foamOut, O.core0).forEach(b=>ring(b.outer,b.inner,yb,cp.BH,CONC.foam));
  cp.band(O.core0, O.core1).forEach(b=>ring(b.outer,b.inner,yb,cp.BH-0.002,CONC.core));
  cp.band(O.core1, O.foamIn).forEach(b=>ring(b.outer,b.inner,yb,cp.BH,CONC.foam));
  cp.band(O.foot0, O.foot1).forEach(b=>ring(b.outer,b.inner,yf,cp.FTk,CONC.foot));
  const box=(x0,z0,x1,z1,y,h,mat)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,h,z1-z0),mat); m.position.set((x0+x1)/2,y+h/2,(z0+z1)/2); g.add(m); };
  cp.sections.forEach(sc=>{
    const [x0,z0,x1,z1]=sc.rect, F=cp.F;
    if(sc.ax==='x'){ box(x0,z0,x1,z0+F,yb,cp.BH,CONC.foam); box(x0,z0+F,x1,z1-F,yb,cp.BH-0.002,CONC.core); box(x0,z1-F,x1,z1,yb,cp.BH,CONC.foam); }
    else { box(x0,z0,x0+F,z1,yb,cp.BH,CONC.foam); box(x0+F,z0,x1-F,z1,yb,cp.BH-0.002,CONC.core); box(x1-F,z0,x1,z1,yb,cp.BH,CONC.foam); }
    const f=sc.foot; box(f[0],f[1],f[2],f[3],yf,cp.FTk,CONC.foot);
  });
  if(cp.access){   // crawl-space access: an orange frame on the outside face of the wall
    const a=cp.access, w=a.w, along=a.ax==='x', out=0.25+0.01, cx=a.x+a.n[0]*out, cz=a.z+a.n[1]*out, th=0.08;
    const fr=(dx,dz,ww,hh,y)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(along?ww:th, hh, along?th:ww), CONC.access); m.position.set(cx+(along?dx:0), y, cz+(along?0:dz)); g.add(m); };
    fr(-w/2,-w/2,th,cp.BH,yb+cp.BH/2); fr(w/2,w/2,th,cp.BH,yb+cp.BH/2); fr(0,0,w,th,yb+cp.BH-th/2); fr(0,0,w,th,yb+th/2);
  }
  return g;
}
let explodeT=0, explodeGoal=0, podCentres=[], homeSpan=30, northGroup=null;
/* Exploded view, done the way assembly illustrations are (Li, Agrawala et al., "Automated generation of
   interactive 3D exploded view diagrams", SIGGRAPH 2008): parts move apart in an order that respects what
   blocks what, and sub-assemblies explode on their own.
     1. the pods (and decks) separate first, along the plan grid, so every joint opens up wide enough
        for both pods' walls to come out without meeting (SPREAD ≥ 2 × WALL_OUT + clearance);
     2. then each pod comes apart: roof and ceiling up, walls straight out from the pod, floors down.
   Nothing passes through anything at any point of the animation. */
const WALL_OUT=2.6, SPREAD=2*WALL_OUT+2.2;
let spread={pods:[], decks:[]};
function computeSpread(){
  // one SPREAD for every joint line (pod–pod or pod–deck) before a pod or deck, centred on the home
  const P=podList(state.model), D=deckList(state.model), all=P.concat(D), E=1e-6;
  const lines=axis=>{ const L=new Set(); all.forEach(a=>all.forEach(b=>{ if(a===b||(a.deck&&b.deck)) return;
    if(axis==='x' && Math.abs(a.x1-b.x)<E && Math.min(a.z1,b.z1)-Math.max(a.z,b.z)>E) L.add(b.x);
    if(axis==='z' && Math.abs(a.z1-b.z)<E && Math.min(a.x1,b.x1)-Math.max(a.x,b.x)>E) L.add(b.z); })); return [...L]; };
  const lx=lines('x'), lz=lines('z');
  const at=it=>[lx.filter(v=>v<=it.x+E).length*SPREAD, lz.filter(v=>v<=it.z+E).length*SPREAD];
  const ps=P.map(at), ds=D.map(at), every=ps.concat(ds);
  const mx=(Math.max(...every.map(v=>v[0]))+Math.min(...every.map(v=>v[0])))/2, mz=(Math.max(...every.map(v=>v[1]))+Math.min(...every.map(v=>v[1])))/2;
  spread={ pods:ps.map(v=>[v[0]-mx,v[1]-mz]), decks:ds.map(v=>[v[0]-mx,v[1]-mz]) };
}
const ease = (a,b,t) => { const u=Math.min(1,Math.max(0,(t-a)/(b-a))); return u*u*(3-2*u); };
function applyExplode(){
  const e=explodeT, eP=ease(0,0.55,e), eW=ease(0.4,1,e);   // stage 1: pods apart · stage 2: each pod comes apart
  const lift = e*4.5;   // the house rises off its foundation, high enough that the frames clear the screw heads
  const OFFS = {frame:-3.6, 'floor-ext':-2.2, 'floor-int':0, 'ceiling-int':5, 'roof':7.5};
  const sp = k => state.focusPod!=null ? [0,0] : (spread.pods[k]||[0,0]);   // one pod on its own comes apart where it stands
  layerGroups.forEach(g=>{ const u=g.userData, v=sp(u.pod);
    g.position.set(u.bx+v[0]*eP, u.baseY + lift + eW*OFFS[u.layerSlot.kind], u.bz+v[1]*eP); });
  deckGroups.forEach(g=>{ const u=g.userData, v=spread.decks[u.k]||[0,0];
    g.position.set(u.bx+v[0]*eP, u.baseY + lift + eW*OFFS['floor-ext'], u.bz+v[1]*eP); });
  wallGroups.forEach(g=>{
    const u=g.userData, v=sp(u.slot.pod.i);
    g.position.copy(u.base).addScaledVector(u.n, eW*WALL_OUT);
    g.position.x += v[0]*eP; g.position.z += v[1]*eP;
    g.position.y = lift + eW*0.6;
  });
  plateMeshes.forEach(m=>{ const u=m.userData.plate, v=sp(u.pod); m.position.set(u.base.x+v[0]*eP, u.base.y+lift+eW*(u.top?OFFS['ceiling-int']:OFFS['floor-int']), u.base.z+v[1]*eP); });
  if(rimGroup) rimGroup.children.forEach(m=>{ const u=m.userData, v=sp(u.pod); m.position.set(u.base.x+v[0]*eP, u.base.y+lift+eW*OFFS[u.lay], u.base.z+v[1]*eP); });
  explodeFurniture(e, sp, eP, eW, lift);
  applyRimVis();
}
/* LVL rims and the floor build-up show with Lumber & LVL (exploded or not); the steel frames and ACM with their own switch */
function applyRimVis(){
  if(!rimGroup) return; const S=state.show, F=state.focusPod, ex=explodeT>0.01;
  rimGroup.visible=!state.isolate;   // an isolated part shows on its own
  rimGroup.children.forEach(m=>{ const u=m.userData, layerOn = u.lay==='floor-int' ? S.floors : (S.ceiling||S.roof);
    // the steel frames and ACM under the floor are their own layer
    m.visible = (F==null || u.pod===F) && (u.lay==='frame' ? S.frames!==false : S.framing); });   // their own switches, exploded or not
}
/* what shows: each layer on its own (Layers menu) */
function applyLayers(){
  if(!floorGroup) return;
  isoHidden.forEach(o=>{ o.visible=true; }); isoHidden=[];   // put back what an isolate hid; the switches below decide the rest
  const S=state.show, F=state.focusPod, inPod = i => F==null || i===F;
  wallGroups.forEach(g=>g.visible=S.walls && inPod(g.userData.slot.pod.i));
  floorGroup.visible=S.floors; ceilGroup.visible=S.ceiling; roofGroup.visible=S.roof;
  layerGroups.forEach(g=>g.visible=inPod(g.userData.pod));
  deckGroups.forEach(g=>g.visible=S.decks && F==null);
  screwGroup.visible=S.screws && F==null;
  fpGroup.visible=S.screws && !S.walls && !S.floors && F==null;
  if(northGroup) northGroup.visible = F==null;
  floorMats.forEach(m=>{ m.transparent=S.screws; m.opacity=S.screws?0.35:1; m.depthWrite=!S.screws; m.needsUpdate=true; });
  unitMeshes.forEach(m=>m.visible=S.units);
  wallGroups.forEach(g=>g.children.forEach(o=>{ if(o.userData.seal) o.visible = S.seals!==false; }));
  // framing: lumber & LVL and the OSB splines switch on their own; both show through see-through walls
  framingMeshes.forEach(m=>m.visible=(m.userData.spline ? S.splines : S.framing) && S.walls && inPod(m.userData.pod));
  applyRimVis();
  const see = S.framing || S.splines;
  wallGroups.forEach(g=>{ const m=g.userData.mat; m.transparent=see; m.opacity=see?0.22:1; m.depthWrite=!see; m.needsUpdate=true; });
  MAT.glass.opacity = state.glass ? 0.18 : 0.55;
  MAT.door.opacity = MAT.doorInt.opacity = state.glass ? 0.25 : 1; MAT.door.depthWrite = MAT.doorInt.depthWrite = !state.glass;
  MAT.glass.needsUpdate = MAT.door.needsUpdate = MAT.doorInt.needsUpdate = true;
  controls.maxPolarAngle = Math.PI*0.999;   // turn the home right over to reach the underside of the floor
  applyIsolate();
  applyFurniture();
  applyGhost();
}
/* Isolate: one wall, floor / ceiling / roof layer or deck on its own, to look at from every side (underneath too).
   Everything else in the home is hidden; the part keeps its own switches (windows, lumber, splines). */
let isoHidden=[];
const isoTarget = id => id && (String(id).startsWith('furn:') ? furnHolder(String(id).slice(5)) : null || wallGroups.find(g=>g.userData.slot.id===id) || layerGroups.find(g=>g.userData.layerSlot.id===id) || deckGroups.find(g=>g.userData.id===id));
function applyIsolate(){
  const t=isoTarget(state.isolate); if(!t) return;
  // walk up from the part to the home: on each level only the branch holding the part stays visible
  const hide=o=>{ if(o.visible){ o.visible=false; isoHidden.push(o); } };
  for(let o=t; o && o!==homeGroup; o=o.parent){ o.visible=true; if(o.parent) o.parent.children.forEach(c=>{ if(c!==o) hide(c); }); }
  t.traverse(o=>{ if(o.userData?.unit) o.visible=state.show.units; if(o.userData?.letter) hide(o); });   // the big letter tag would cover the wall
  controls.maxPolarAngle = Math.PI;
}
/* frame the camera on the isolated part, keeping the angle you look from */
function focusIsolated(){
  const t=isoTarget(state.isolate); if(!t) return;
  const B=new THREE.Box3().setFromObject(t), c=B.getCenter(new THREE.Vector3()), size=B.getSize(new THREE.Vector3()).length();
  const dir=camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(c); camera.position.copy(c).addScaledVector(dir, Math.max(6, size*(String(state.isolate).startsWith('furn:')?2.4:1.25))); controls.update();
}
/* point the camera at one pod (or back at the whole home), keeping the angle you're looking from */
function focusCamera(i){
  const c = i==null ? {x:0, z:0, span:null} : podCentres[i]; if(!c) return;
  const to=new THREE.Vector3(c.x, 3.5, c.z), dir=camera.position.clone().sub(controls.target).normalize();
  const dist = i==null ? Math.hypot(homeSpan+14, homeSpan*0.95+12, homeSpan*1.35+18) : c.span*1.55+14;
  controls.target.copy(to); camera.position.copy(to).addScaledVector(dir, dist); controls.update();
}
/* tap a part: it stays solid and everything else goes see-through (like the cabinet viewer). Tap empty space to
   have the whole home solid again. Not while a part is isolated (it's on its own already). */
/* orange rings under the lights picked by hand (light-edit-ui.js) */
let lightMarks=null;
function applyLightMarkers(){
  if(lightMarks){ lightMarks.parent?.remove(lightMarks); lightMarks=null; }
  const S=selectedLights(); if(!S.ids.size || !/:ceiling-int$/.test(state.selected||'')) return;
  const g=layerGroups.find(g=>g.userData.layerSlot.id===state.selected); if(!g) return;
  lightMarks=new THREE.Group(); lightMarks.userData.noGhost=true;
  const mat=new THREE.MeshBasicMaterial({color:0xd0661f, side:THREE.DoubleSide, depthTest:false});
  lightsOfSlot(g.userData.layerSlot).filter(p=>S.ids.has(p.id)).forEach(p=>{ const m=new THREE.Mesh(new THREE.RingGeometry(2.4/FT, 3.6/FT, 32), mat);
    m.rotation.x=Math.PI/2; m.position.set(p.x/FT, -0.02, p.z/FT); m.renderOrder=40; m.userData.noGhost=true; lightMarks.add(m); });
  g.userData.inner.add(lightMarks);
}
onMarkers(()=>applyLightMarkers());
const GHOST=new WeakMap();
setWalls(()=>wallGroups);
onFurnApplied(()=>applyGhost());
function ghostOf(m){ let g=GHOST.get(m); if(!g){ g=m.clone(); g.transparent=true; g.opacity=(m.opacity??1)*0.14; g.depthWrite=false; GHOST.set(m,g); } return g; }
function applyGhost(){
  if(!homeGroup) return;
  const tgt = !state.isolate ? (state.selFurn ? furnHolder(state.selFurn) : state.selected ? isoTarget(state.selected) : null) : null;
  const keep=new Set(); tgt?.traverse(o=>keep.add(o));
  homeGroup.traverse(o=>{
    if(!(o.isMesh||o.isLineSegments||o.isLine||o.isSprite) || Array.isArray(o.material) || o.userData.pickPane || o.userData.noGhost) return;
    const u=o.userData, ghosted = u._mat && o.material===GHOST.get(u._mat);
    if(tgt && !keep.has(o)){ const base = ghosted ? u._mat : o.material; if((base.opacity??1)<0.05) return; u._mat=base; o.material=ghostOf(base); }
    else if(ghosted){ o.material=u._mat; delete u._mat; }
  });
}
function highlight(){
  deckGroups.forEach(g=>{ const sel=g.userData.id===state.selected && !state.isolate; g.userData.mat.color.set(sel?0xe0864a:0xa88f5d); g.userData.mat.emissive.set(sel?0x3a1a05:0x000000); });
  layerGroups.forEach(g=>{ const sel=g.userData.layerSlot.id===state.selected && !state.isolate; g.userData.mat.color.set(sel?0xe0864a:LAYER_COLOR[g.userData.layerSlot.kind]); g.userData.mat.emissive.set(sel?0x3a1a05:0x000000); });
  wallGroups.forEach(g=>{ const sel=g.userData.slot.id===state.selected && !state.isolate; g.userData.mat.color.set(sel?0xe0864a:(g.userData.slot.type==='int'?0xf0e6d0:0xc9a46a)); g.userData.mat.emissive.set(sel?0x3a1a05:0x000000);
    g.children.forEach(o=>{ if(o.userData.pickPane) o.material.opacity = sel ? 0.28 : 0; }); });
  applyGhost();
  applyLightMarkers();
}
function resize(){
  const r=stage.getBoundingClientRect(); renderer.setSize(r.width,r.height,false); camera.aspect=r.width/Math.max(1,r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
// picking: only things you can see (a hidden roof or ceiling must not catch the click)
const shown = h => { for(let o=h.object; o; o=o.parent){ if(!o.visible) return false; } return true; };
const ray=new THREE.Raycaster(), mouse=new THREE.Vector2(); let downAt=null;
renderer.domElement.addEventListener('pointerdown',e=>{downAt=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!downAt) return; const d=Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1]); downAt=null; if(d>5) return;
  const r=renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(mouse,camera);
  if(ray.intersectObjects(handleMeshes(),false).length) return;   // a stretch handle (build.js drags it)
  const hit=ray.intersectObjects(pickables,false).find(shown);
  // a cabinet or piece of furniture in front of the wall / floor: pick it
  const fh=ray.intersectObjects(furnMeshes(),false)[0];
  if(fh && (!hit || /:(ceiling-int|roof)$/.test(hit.object.userData.slotId||'') || fh.distance<=hit.distance+0.05)){ state.selFurn=fh.object.userData.furn; state.selected=null; state.selUnit=null; applyFurniture(); highlight(); renderSide(); return; }
  if(state.selFurn){ state.selFurn=null; applyFurniture(); }
  // the ceiling already picked: a tap on it picks / unpicks the light hole there (or places a new light)
  if(hit && hit.object.userData.slotId===state.selected && /:ceiling-int$/.test(state.selected||'')){
    const g=layerGroups.find(g=>g.userData.layerSlot.id===state.selected), inner=g?.userData.inner;
    if(inner){ const l=inner.worldToLocal(hit.point.clone()); if(pickLightAt(g.userData.layerSlot, l.x*FT, l.z*FT)) return; } }
  state.selected = hit ? hit.object.userData.slotId : null;
  state.selUnit = null; for(let o=hit?.object; o; o=o.parent){ if(o.userData?.okey){ state.selUnit=o.userData.okey; break; } }
  highlight(); renderSide();
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(e.buttons) return;
  const r=renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(mouse,camera);
  renderer.domElement.style.cursor = ray.intersectObjects(pickables,false).some(shown) ? 'pointer':'grab';
});
function loop(){
  requestAnimationFrame(loop);
  if(Math.abs(explodeT-explodeGoal)>0.001){ explodeT += (explodeGoal-explodeT)*0.12; applyExplode(); }
  controls.update();
  if(state.view==='studio') renderer.render(scene,camera);
  if(state.view==='sheets' && w3) { w3.controls.update(); w3.renderer.render(w3.scene,w3.camera); }
}
function setExplodeGoal(v){ explodeGoal=v; }


export { applyGhost, focusIsolated, isoTarget, stage, renderer, scene, camera, controls, sun, grid, homeGroup, wallGroups, themeColors, applyTheme, MAT, lineMat, numberSprite, buildWallMesh, buildHome, explodeT, applyExplode, highlight, resize, ray, loop, setExplodeGoal, applyLayers, focusCamera, podCentres, roofGroup, floorGroup, screwGroup, pickables, explodeGoal, mouse };
