/* Cubit Builder — scene3d.js */
import { CEIL, FLOOR, FT, H, POD, PW, T, WALL_BASE, LAYER_KINDS, NOTCH } from './config.js';
import { MODELS } from './data.js';
import { podOffsets, screwsFor, slotsFor, layerSlotsFor, podList, deckList, layoutOffsets, padsFor } from './layout.js';
import { panelCells, panelCount, panelNum, wallLen, panelSpans, panelAt, bodyWall, layerHoles } from './panels.js';
import { w3 } from './sheets.js';
import { renderSide } from './sidebar.js';
import { pickFor, pickLayer, state } from './state.js';
import { getBearing } from './orient.js';

/* ============================================================ 3D studio */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40,1,0.5,500);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI*0.495;
scene.add(new THREE.HemisphereLight(0xffffff,0x8a8a80,0.85));
const sun = new THREE.DirectionalLight(0xffffff,0.75); sun.position.set(30,50,20); scene.add(sun);
const grid = new THREE.GridHelper(96,24,0x9aa39b,0xc3c9c1); grid.position.y=-FLOOR; scene.add(grid);
let homeGroup = new THREE.Group(); scene.add(homeGroup);
let wallGroups = [], layerGroups = [], deckGroups = [], roofGroup=null, floorGroup=null, screwGroup=null, pickables=[];

function themeColors(){
  const dark = (document.documentElement.dataset.theme==='dark') || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  return dark ? {bg:0x1a1e1c, grid1:0x4a524c, grid2:0x2c322e} : {bg:0xe3e6e0, grid1:0x9aa39b, grid2:0xc3c9c1};
}
function applyTheme(){ const c=themeColors(); scene.background=new THREE.Color(c.bg); }
applyTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);

const MAT = {
  glass: new THREE.MeshStandardMaterial({color:0x8fc3ea,transparent:true,opacity:0.55,roughness:0.1}),
  door: new THREE.MeshStandardMaterial({color:0x6b4a2f,roughness:0.7}),
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

/* builds one wall as panel groups in local feet coords: x along (exterior-left = 0), y up, z outward (outer face at 0) */
function buildWallMesh(w, mat, opts={}){
  const g = new THREE.Group(); const n=panelCount(w); const panels=[]; const spans=panelSpans(w), L=wallLen(w);
  const t=(w.t||T)/FT;
  for(let k=0;k<n;k++){
    const pg=new THREE.Group(); pg.userData.k=k;
    const [nl,nr]=w.notch||[0,0], nd=Math.min(NOTCH, (w.t||T)-0.5)/FT;
    panelCells(w,k).forEach(([x0,x1,y0,y1])=>{
      // split off the corner notch: there the wall is only (t − 1¾″) deep, flush with the inside face
      const cuts=[x0, ...[nl, L-nr].filter(c=>c>x0+1e-6 && c<x1-1e-6), x1];
      for(let c=0;c<cuts.length-1;c++){
        const a=cuts[c], b=cuts[c+1], mid=(a+b)/2, notched=(nl&&mid<nl)||(nr&&mid>L-nr), d=notched?t-nd:t;
        const m=new THREE.Mesh(new THREE.BoxGeometry((b-a)/FT,(y1-y0)/FT,d),mat);
        m.position.set(mid/FT,(y0+y1)/2/FT,-t+d/2); pg.add(m);
      }
    });
    // outline of panel + opening edges on both faces
    const pts=[]; const X0=spans[k][0]/FT, X1=spans[k][1]/FT, Ht=H/FT;
    [0.004,-t-0.004].forEach(z=>{ pts.push(X0,0,z,X1,0,z, X1,0,z,X1,Ht,z, X1,Ht,z,X0,Ht,z, X0,Ht,z,X0,0,z); });
    const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    pg.add(new THREE.LineSegments(lg,lineMat));
    g.add(pg); panels.push(pg);
  }
  // openings: glass / door leaf
  w.openings.forEach(o=>{
    if(o.kind==='opening'||o.kind==='vent') return;   // cased opening / vent: just a hole
    const thick = o.kind==='window'? 0.05 : 0.12;
    const m=new THREE.Mesh(new THREE.BoxGeometry(o.w/FT,o.h/FT,thick), o.kind==='window'?MAT.glass:MAT.door);
    m.position.set((o.x+o.w/2)/FT,(o.y+o.h/2)/FT,-t/2);
    if(o.kind==='patio'){ m.material=MAT.glass; }
    g.add(m);
    m.userData.k=panelAt(w, o.x+o.w/2);
  });
  // boxes: inside on interior face, outside on exterior face
  w.inside.forEach(b=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(2.5/FT,4/FT,0.06), b.kind==='switch'?MAT.sw:MAT.outlet);
    m.position.set((L-b.x)/FT,b.y/FT,-t-0.03); g.add(m); m.userData.k=panelAt(w, L-b.x); });
  w.outside.forEach(b=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(3/FT,(b.kind==='light'?5:4)/FT,0.08), b.kind==='light'?MAT.light:(w.type==='int'?(b.kind==='switch'?MAT.sw:MAT.outlet):MAT.extOutlet));
    m.position.set(b.x/FT,b.y/FT,0.04); g.add(m); m.userData.k=panelAt(w, b.x); });
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
  const holes=layerHoles(L).map(h=>({x0:h.x,x1:h.x+h.w,z0:h.z,z1:h.z+h.d}));
  const xs=[...new Set([0,len,...holes.flatMap(h=>[h.x0,h.x1])])].filter(v=>v>=0&&v<=len).sort((a,b)=>a-b);
  const zs=[...new Set([0,wid,...holes.flatMap(h=>[h.z0,h.z1])])].filter(v=>v>=0&&v<=wid).sort((a,b)=>a-b);
  for(let i=0;i<xs.length-1;i++){
    let run=null;
    for(let j=0;j<zs.length-1;j++){
      const cx=(xs[i]+xs[i+1])/2, cz=(zs[j]+zs[j+1])/2;
      const hole=holes.some(h=>cx>h.x0&&cx<h.x1&&cz>h.z0&&cz<h.z1);
      if(!hole){ if(run) run[1]=zs[j+1]; else run=[zs[j],zs[j+1]]; }
      if((hole||j===zs.length-2) && run){ const m=new THREE.Mesh(new THREE.BoxGeometry((xs[i+1]-xs[i])/FT,t,(run[1]-run[0])/FT),mat); m.position.set((xs[i]+xs[i+1])/2/FT,t/2,(run[0]+run[1])/2/FT); g.add(m); run=null; }
    }
  }
  // panel joints on the top face
  const pts=[]; (L.seams||[]).forEach(sx=>{ pts.push(sx/FT,t+0.004,0, sx/FT,t+0.004,8); });
  if(pts.length){ const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3)); g.add(new THREE.LineSegments(lg,lineMat)); }
  return g;
}
/* one deck frame in its own frame: x along the ledger (0..W), z outward (0..D), inches; y up from its underside */
const DECK_MAT = new THREE.MeshStandardMaterial({color:0xa88f5d, roughness:0.9});
function buildDeckMesh(L, mat){
  const g=new THREE.Group(), W=L.W, D=L.D, t=L.lumber?.t||1.5, h=L.h||7.25, n=L.notch||0;
  const R=L.rims||{ledger:true,far:true,left:true,right:true}, N=(cx,cz)=>(L.notches||[]).some(c=>c[0]===cx&&c[1]===cz);
  const box=(x0,x1,z0,z1)=>{ if(x1-x0<0.01||z1-z0<0.01) return; const m=new THREE.Mesh(new THREE.BoxGeometry((x1-x0)/FT,h/FT,(z1-z0)/FT),mat); m.position.set((x0+x1)/2/FT,h/2/FT,(z0+z1)/2/FT); g.add(m); };
  const sx0=R.left?t:0, sx1=W-(R.right?t:0);
  if(R.ledger) box(Math.max(sx0,N(0,0)?n:0), Math.min(sx1,W-(N(1,0)?n:0)), 0, t);
  if(R.far)    box(Math.max(sx0,N(0,1)?n:0), Math.min(sx1,W-(N(1,1)?n:0)), D-t, D);
  if(R.left)   box(0, t, N(0,0)?n:0, D-(N(0,1)?n:0));
  if(R.right)  box(W-t, W, N(1,0)?n:0, D-(N(1,1)?n:0));
  const jz0=R.ledger?t:0, jz1=D-(R.far?t:0);
  (L.joists?.at||[]).forEach(a=>{ if(L.joists.run==='z') box(a,a+t,jz0,jz1); else box(sx0,sx1,a,a+t); });
  return g;
}
function buildHome(){
  scene.remove(homeGroup); homeGroup=new THREE.Group(); scene.add(homeGroup);
  wallGroups=[]; layerGroups=[]; deckGroups=[]; pickables=[];
  const slots = slotsFor(state.model); const model=MODELS[state.model];
  const OFF = podOffsets(state.model);
  const pods = podList(state.model).map((p,i)=>({...p,x:p.x+OFF[i].ox,z:p.z+OFF[i].oz}));
  const LOd=layoutOffsets(state.model).decks;
  const boxes=pods.map(p=>[p.x,p.z,p.x+p.w,p.z+p.d]).concat(deckList(state.model).map((d,k)=>[d.x+LOd[k].ox,d.z+LOd[k].oz,d.x1+LOd[k].ox,d.z1+LOd[k].oz]));
  const minx=Math.min(...boxes.map(b=>b[0])), maxx=Math.max(...boxes.map(b=>b[2]));
  const minz=Math.min(...boxes.map(b=>b[1])), maxz=Math.max(...boxes.map(b=>b[3]));
  const cx=(minx+maxx)/2, cz=(minz+maxz)/2;
  homeGroup.position.set(-cx,0,-cz);
  // floor and ceiling layers (exterior floor, interior floor, interior ceiling, roof) + ground screws
  roofGroup=new THREE.Group(); floorGroup=new THREE.Group(); homeGroup.add(floorGroup);
  layerSlotsFor(state.model).forEach(ls=>{
    const L=pickLayer(ls); const isFloor=ls.kind.startsWith('floor');
    const see = isFloor ? state.screws : true;   // ceiling + roof stay see-through so they never hide the walls
    const mat=new THREE.MeshStandardMaterial({color:LAYER_COLOR[ls.kind], roughness:0.85, transparent:see, opacity: isFloor ? (state.screws?0.35:1) : 0.42, depthWrite: !(!isFloor)});
    const grp=buildLayerMesh(L, mat);
    const y=((L.z??LAYER_KINDS[ls.kind].z)-WALL_BASE)/FT;
    // turned pods: rotate the layer about its corner, then move that corner back onto the footprint
    // three.js turns counter-clockwise seen from above for +angle, so a clockwise turn is negative
    const th=-(ls.rot||0)*Math.PI/180, L0=ls.len;
    const off={0:[0,0],90:[8,0],180:[L0,8],270:[0,L0]}[ls.rot||0];
    const inner=new THREE.Group(); inner.add(...grp.children); grp.add(inner);
    inner.rotation.y=th; inner.position.set(off[0],0,off[1]);
    grp.position.set(ls.x, y, ls.z);
    grp.userData={layerSlot:ls, mat, baseY:y, bx:grp.position.x, bz:grp.position.z, pod:ls.pod.i};
    grp.traverse(o=>{ if(o.isMesh){ o.userData.slotId=ls.id; pickables.push(o); } });
    (isFloor?floorGroup:roofGroup).add(grp); layerGroups.push(grp);
  });
  homeGroup.add(roofGroup); roofGroup.visible=state.roof;
  // decks (porch frames), docked with the same 5/8″ space as pods
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
  screwGroup=new THREE.Group(); homeGroup.add(screwGroup); screwGroup.visible=state.screws || !state.house;
  // concrete pads under decks that float instead of sitting on screws
  { const padG=new THREE.BoxGeometry(16/FT, 8/FT, 16/FT), padM=new THREE.MeshStandardMaterial({color:0xa7a9a4, roughness:0.95});
    padsFor(state.model, state.inset).forEach(pd=>{ const m=new THREE.Mesh(padG,padM); m.position.set(pd.x, -WALL_BASE/FT - 4/FT, pd.z); screwGroup.add(m); }); }
  if(!state.house){
    // footprints on the ground so the screws can be read against the home
    const fpMat=new THREE.LineBasicMaterial({color:0x3b3122}), dkMat=new THREE.LineDashedMaterial({color:0x8a7a5c, dashSize:0.6, gapSize:0.4});
    const loop=(x0,z0,x1,z1,mat)=>{ const g=new THREE.BufferGeometry().setFromPoints([[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]].map(([x,z])=>new THREE.Vector3(x,-FLOOR+0.01,z))); const l=new THREE.Line(g,mat); l.computeLineDistances(); screwGroup.add(l); };
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
    ng.scale.setScalar(1.6); ng.rotation.y=B; ng.position.set(minx-9, -FLOOR+0.03, maxz+12); homeGroup.add(ng); }
  slots.forEach(s=>{
    const w=bodyWall(s, pickFor(s)); if(!w) return;
    const mat=new THREE.MeshStandardMaterial({color:s.type==='int'?0xece0c6:0xc9a46a,roughness:0.85});
    const built=buildWallMesh(w,mat,{nums:state.nums,numSize:1.0});
    const g=built.group;
    const r=[s.n[1],-s.n[0]];
    g.rotation.y=Math.atan2(-r[1],r[0]);
    const tl=(w.trim?.[0]||0)/FT;   // long walls start inside the end wall's thickness
    g.userData={slot:s, mat, base:new THREE.Vector3(s.p0[0]+r[0]*tl,0,s.p0[1]+r[1]*tl), n:new THREE.Vector3(s.n[0],0,s.n[1])};
    g.position.copy(g.userData.base);
    g.traverse(o=>{ if(o.isMesh) { o.userData.slotId=s.id; pickables.push(o);} });
    if(state.letters){
      const t=(w.t||6.5)/12, mid=wallLen(w)/2/FT;
      const lab=letterSprite(s.letter, 1.3); lab.position.set(mid, 4.6, -t-0.6); g.add(lab);   // on the inside face, mid-wall
    }
    homeGroup.add(g); wallGroups.push(g);
  });
  // house off: hide walls, floors, ceilings, roof and decks
  if(!state.house){ wallGroups.forEach(g=>g.visible=false); floorGroup.visible=false; roofGroup.visible=false; deckGroups.forEach(g=>g.visible=false); }
  highlight();
  // frame camera
  const span=Math.max(maxx-minx,maxz-minz);
  if(!buildHome.framed || buildHome.framed!==state.model){
    camera.position.set(span*1.0+14, span*0.95+12, span*1.35+18); controls.target.set(0,3.5,0); buildHome.framed=state.model;
  }
  computeSpread(); explodeT = state.exploded?1:0; applyExplode();
}
let explodeT=0, explodeGoal=0;
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
  const lift = e*2.5;   // the house rises off its ground screws
  const OFFS = {'floor-ext':-1.4, 'floor-int':0, 'ceiling-int':5, 'roof':7.5};
  const sp = k => spread.pods[k]||[0,0];
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
  if(roofGroup){ roofGroup.visible = state.house && (state.roof || e>0.01); }
}
function highlight(){
  deckGroups.forEach(g=>{ const sel=g.userData.id===state.selected; g.userData.mat.color.set(sel?0xe0864a:0xa88f5d); g.userData.mat.emissive.set(sel?0x3a1a05:0x000000); });
  layerGroups.forEach(g=>{ const sel=g.userData.layerSlot.id===state.selected; g.userData.mat.color.set(sel?0xe0864a:LAYER_COLOR[g.userData.layerSlot.kind]); g.userData.mat.emissive.set(sel?0x3a1a05:0x000000); });
  wallGroups.forEach(g=>{ const sel=g.userData.slot.id===state.selected; g.userData.mat.color.set(sel?0xe0864a:(g.userData.slot.type==='int'?0xf0e6d0:0xc9a46a)); g.userData.mat.emissive.set(sel?0x3a1a05:0x000000); });
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
  const hit=ray.intersectObjects(pickables,false).find(shown);
  state.selected = hit ? hit.object.userData.slotId : null;
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
function refreshRoof(){ if(roofGroup) roofGroup.visible=state.house && (state.roof||explodeT>0.01); }

export { stage, renderer, scene, camera, controls, sun, grid, homeGroup, wallGroups, themeColors, applyTheme, MAT, lineMat, numberSprite, buildWallMesh, buildHome, explodeT, applyExplode, highlight, resize, ray, loop, setExplodeGoal, refreshRoof, roofGroup, floorGroup, screwGroup, pickables, explodeGoal, mouse };
