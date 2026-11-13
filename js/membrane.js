/* Cubit Builder — membrane.js : the breathable exterior membrane (PolarBlock, 1 mm) on the exterior walls.
   It covers the SIP panels' outside face only: each exterior wall from its base to the top of the panel, its full
   length, cut out at every window, door and vent. Not on the steel frame, floors, roof or the pod-to-pod joints.
   The Membrane layer (Layers → Shell) shows it in the 3D with its real print; the Takeoff lists the square feet. */
import { MEMBRANELIB } from './data.js';
import { H } from './config.js';
import { slotsFor } from './layout.js';
import { bodyWall, wallLen } from './panels.js';
import { pickFor } from './state.js';

const FT = 12;
const membrane = () => MEMBRANELIB.find(x=>x.id==='polarblock-wrap') || MEMBRANELIB[0] || null;
const holesOf = w => (w.openings||[]).filter(o=>(o.w||o.d||0)>=1);
const holeArea = o => o.shape==='round' ? Math.PI*((o.d||o.w)/2)**2 : (o.w||0)*Math.max(0, Math.min(o.y+o.h, H)-Math.max(o.y, 0));

let TEX=null, TEX_SRC=null;
function printTexture(M){
  if(TEX && TEX_SRC===M.image) return TEX;
  TEX=new THREE.TextureLoader().load(M.image); TEX_SRC=M.image;
  TEX.wrapS=TEX.wrapT=THREE.RepeatWrapping; TEX.anisotropy=4;
  TEX.repeat.set(FT/(M.print?.w||48), FT/(M.print?.h||96));   // the shape's UVs are in feet
  return TEX;
}
/* the membrane on one exterior wall, in its wall group's coordinates (feet; z out from the outside face) */
function membraneMesh(w){
  const M=membrane(); if(!M || !w) return null;
  const L=wallLen(w)/FT, y1=H/FT, t=(M.t||0.04)/FT;
  const sh=new THREE.Shape(); sh.moveTo(0,0); sh.lineTo(L,0); sh.lineTo(L,y1); sh.lineTo(0,y1); sh.lineTo(0,0);
  holesOf(w).forEach(o=>{ const p=new THREE.Path();
    if(o.shape==='round'){ const d=o.d||o.w; p.absarc((o.x+d/2)/FT, (o.y+d/2)/FT, d/2/FT, 0, Math.PI*2, true); }
    else { const x0=o.x/FT, x1=(o.x+o.w)/FT, a=Math.max(0.001, o.y/FT), b=Math.min(y1-0.001, (o.y+o.h)/FT); p.moveTo(x0,a); p.lineTo(x0,b); p.lineTo(x1,b); p.lineTo(x1,a); p.lineTo(x0,a); }
    sh.holes.push(p); });
  const m=new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color:0xffffff, map:printTexture(M), roughness:0.9, metalness:0, side:THREE.DoubleSide,
    polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1 }));
  m.position.z=t/2; m.userData.membrane=true; return m;
}
/* the whole home: square feet on the walls (net of openings), and with the laps */
function membraneTakeoff(k){
  const M=membrane(); if(!M) return null;
  let gross=0, open=0, walls=0;
  slotsFor(k).filter(s=>s.type==='ext').forEach(s=>{ const w=bodyWall(s, pickFor(s)); if(!w) return; walls++;
    gross += wallLen(w)*H; open += holesOf(w).reduce((a,o)=>a+holeArea(o),0); });
  if(!walls) return null;
  const net=(gross-open)/144, buy=net*(1+(M.lap??0.1));
  return { M, walls, gross:gross/144, open:open/144, net, buy, rolls: M.roll ? Math.ceil(buy/(M.roll.w*M.roll.len/144)) : null };
}
export { membrane, membraneMesh, membraneTakeoff };
