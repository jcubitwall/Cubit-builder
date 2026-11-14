/* Cubit Builder — membrane.js : the breathable exterior membrane (PolarBlock, 1 mm) on the exterior walls.
   It goes on each exterior OSB sheet at the shop BEFORE the CNC cuts it, so it is cut out with the panel (windows,
   doors, vents) and there are no laps. The SIP walls where two pods join get it too (facing each other across
   the ¾″ gap, no siding there); a joint wall that's been taken out has none: on site the only work is the 3″ seam tape (same product, darker blue)
   centred over every joint between exterior panels. Not on the steel frame, floors or roof.
   The Membrane layer (Layers → Shell) shows it and the tape in the 3D; the Takeoff lists sheets and tape. */
import { MEMBRANELIB } from './data.js';
import { H } from './config.js';
import { slotsFor } from './layout.js';
import { bodyWall, wallLen, panelSpans } from './panels.js';
import { pickFor, jointWallT } from './state.js';
import { ls } from './libsettings.js';

const FT = 12;
/* the walls it goes on: every exterior wall, and each pod's own SIP wall where two pods join (unless taken out) */
const membraneOn = s => s.type==='ext' || (s.type==='int' && s.other && !s.part && jointWallT(s)!==0);
const tapeW = () => ls('membrane','tapeW');   // the Library's Membrane rules page
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
/* the joints between this wall's panels (x, in from the wall's left end) and the tape's runs up each, missing openings */
function tapeRuns(w){
  const sp=panelSpans(w), J=sp.slice(0,-1).filter((s,i)=>Math.abs(s[1]-sp[i+1][0])<0.01).map(s=>s[1]);
  const half=tapeW()/2;
  /* the height an opening takes out of the tape at x (the tape is 3″ wide, so its nearer edge counts): a square
     opening its full height; a round window the chord of the circle at the tape's nearer edge */
  const cut=(o,x)=>{ if(o.shape==='round'){ const d=o.d||o.w, r=d/2, cx=o.x+r, cy=o.y+r, dx=Math.max(0, Math.abs(x-cx)-half);
      if(dx>=r) return null; const h=Math.sqrt(r*r-dx*dx); return [cy-h, cy+h]; }
    return o.x<x+half && o.x+o.w>x-half ? [o.y, o.y+o.h] : null; };
  return J.map(x=>{ let segs=[[0,H]]; holesOf(w).forEach(o=>{ const k=cut(o,x); if(!k) return; const [c,d]=k; segs=segs.flatMap(([a,b])=>{ if(d<=a||c>=b) return [[a,b]]; const r=[]; if(c>a) r.push([a,c]); if(d<b) r.push([d,b]); return r; }); });
    return { x, segs:segs.filter(([a,b])=>b-a>0.5) }; });
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
    polygonOffset:true, polygonOffsetFactor:2, polygonOffsetUnits:2 }));   // pushed back: the siding over it always wins
  m.position.z=t/2; m.userData.membrane=true;
  // the seam tape over each joint
  const T=M.tape, tw=tapeW()/FT, tm=new THREE.MeshStandardMaterial({ color:new THREE.Color(T?.color||'#3f5f93'), roughness:0.8, metalness:0, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 });
  tapeRuns(w).forEach(r=>r.segs.forEach(([a,b])=>{ const g=new THREE.Mesh(new THREE.PlaneGeometry(tw, (b-a)/FT), tm); g.position.set(r.x/FT, (a+b)/2/FT, t*0.9); m.add(g); }));
  return m;
}
/* the whole home: the exterior OSB sheets it goes on (whole sheets, before the CNC cuts them) and the seam tape */
function membraneTakeoff(k){
  const M=membrane(); if(!M) return null;
  let sheets=0, sqin=0, tape=0, joints=0, walls=0;
  slotsFor(k).filter(membraneOn).forEach(s=>{ const w=bodyWall(s, pickFor(s)); if(!w) return; walls++;
    const sp=panelSpans(w); sheets+=sp.length; sqin+=sp.length*48*H;
    tapeRuns(w).forEach(r=>{ joints++; tape+=r.segs.reduce((a,[x,y])=>a+(y-x),0); }); });
  if(!walls) return null;
  const sqft=sqin/144, tapeFt=tape/12;
  return { M, walls, sheets, sqft, joints, tapeFt, rolls: M.roll ? Math.ceil(sqft/(M.roll.w*M.roll.len/144)) : null,
    tapeRolls: M.tape?.roll ? Math.ceil(tapeFt*1.05/M.tape.roll) : null };
}
export { membrane, membraneOn, membraneMesh, membraneTakeoff };
