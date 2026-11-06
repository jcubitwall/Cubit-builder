/* Cubit Builder — midhandles.js : handles on a picked middle wall, in 3D and 2D.

     ⇄ at each end    drag to make it longer or shorter (that end only); snaps to the wall it meets (to the wall),
                      to the faces of walls across its run, else to the inch
     ⇅ in the middle  drag to move it across; snaps flush with nearby walls (their faces, within 2″), else to the inch
     ↻ beside it      tap for a quarter turn about its middle (across ↔ along, same length where it fits)

   The drag shows an outline of where it goes and a tip with the number; it's set when the finger lifts.
   (build.js routes the pointer here when it lands on a handle.) */
import { state } from './state.js';
import { slotsFor, midAt, midLine, podOffsets } from './layout.js';
import { movePart, setPart, turnPart, partSnaps, partEndSnaps } from './pods.js';
import { homeGroup, onBuilt, addHandleSource } from './scene3d.js';
import { H, UP, FT } from './config.js';

const SNAP = 2;   // inches: a flush spot this close wins over the inch
let group=null, shownFor=null, ghost=null;
const mats={};
function tex(kind){
  if(mats[kind]) return mats[kind];
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.fillStyle='#d9682b'; g.beginPath(); g.arc(64,64,60,0,Math.PI*2); g.fill(); g.lineWidth=6; g.strokeStyle='#fff'; g.stroke();
  g.fillStyle='#fff'; g.strokeStyle='#fff';
  if(kind==='turn'){ g.lineWidth=11; g.lineCap='round'; g.beginPath(); g.arc(64,64,32,-Math.PI*0.95,Math.PI*0.45); g.stroke();
    const ex=64+32*Math.cos(Math.PI*0.45), ey=64+32*Math.sin(Math.PI*0.45); g.beginPath(); g.moveTo(ex-24,ey-4); g.lineTo(ex+8,ey-22); g.lineTo(ex+6,ey+16); g.closePath(); g.fill(); }
  else { g.beginPath(); g.moveTo(14,64); g.lineTo(44,36); g.lineTo(44,54); g.lineTo(84,54); g.lineTo(84,36); g.lineTo(114,64); g.lineTo(84,92); g.lineTo(84,74); g.lineTo(44,74); g.lineTo(44,92); g.closePath(); g.fill(); }
  return mats[kind]=new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthTest:false, side:THREE.DoubleSide });
}
const slotOf = id => slotsFor(state.model).find(s=>s.id===id && s.part);
/* the wall's body in the plan (home feet): its two ends on the centre line, the run direction r, the normal n, the top */
function bodyOf(s){
  const r=[s.n[1],-s.n[0]], t=(s.body?.t||4.5)/FT, L=s.len;
  const A=[s.p0[0]+r[0]*s.trim[0]/FT - s.n[0]*t/2, s.p0[1]+r[1]*s.trim[0]/FT - s.n[1]*t/2];
  const B=[s.p0[0]+r[0]*(L-s.trim[1]/FT) - s.n[0]*t/2, s.p0[1]+r[1]*(L-s.trim[1]/FT) - s.n[1]*t/2];
  return { A, B, r, n:s.n, t, y:H/FT + 0.06 + (s.pod.lv ? UP/FT : 0) };
}
function clear(){ if(group){ group.parent?.remove(group); group=null; } shownFor=null; }
function update(){
  const s=state.selected && /M/.test(state.selected) ? slotOf(state.selected) : null;
  clear(); if(!s || state.isolate) return;
  const b=bodyOf(s), sz=0.85, g=new THREE.Group(); g.userData.noGhost=true;
  const put=(kind, x, z, ang, h)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(sz,sz), tex(kind)); m.rotation.order='YXZ'; m.rotation.y=ang; m.rotation.x=-Math.PI/2;
    m.position.set(x, b.y, z); m.renderOrder=32; m.userData={ midHandle:h, slot:s.id, noGhost:true }; g.add(m); };
  const angR=Math.atan2(-b.r[1], b.r[0]), angN=Math.atan2(-b.n[1], b.n[0]);
  put('arrow', b.A[0]-b.r[0]*0.6, b.A[1]-b.r[1]*0.6, angR, 'endA');
  put('arrow', b.B[0]+b.r[0]*0.6, b.B[1]+b.r[1]*0.6, angR, 'endB');
  const c=[(b.A[0]+b.B[0])/2, (b.A[1]+b.B[1])/2];
  put('arrow', c[0], c[1], angN, 'move');
  put('turn', c[0]+b.n[0]*1.1, c[1]+b.n[1]*1.1, 0, 'turn');   // beside it, off its +x / +z face
  homeGroup.add(g); group=g; shownFor=s.id;
}
onBuilt(()=>{ shownFor=null; update(); });
/* keep up with the pick (taps pick walls in scene3d) */
(function watch(){ const want = state.selected && /M/.test(state.selected) ? state.selected : null; if(want!==shownFor) update(); requestAnimationFrame(watch); })();
const midHandleMeshes = () => group ? group.children : [];
addHandleSource(midHandleMeshes);
/* the height the handles sit at (home feet), for reading the finger on that plane */
const handleY = d => { const s=slotOf(d.sid); return s ? bodyOf(s).y : 0; };

/* ---------------------------------------------------------------- dragging */
function showGhost(s, A, B, t, y){
  const len=Math.hypot(B[0]-A[0], B[1]-A[1]); if(!ghost){ ghost=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({ color:0xd9682b, transparent:true, opacity:0.45, depthTest:false })); ghost.renderOrder=31; ghost.userData.noGhost=true; }
  if(ghost.parent!==homeGroup) homeGroup.add(ghost);
  ghost.scale.set(Math.max(0.05,len), H/FT, t); ghost.rotation.set(0, Math.atan2(-(B[1]-A[1]), B[0]-A[0]), 0);
  ghost.position.set((A[0]+B[0])/2, (y - 0.06) - H/FT/2, (A[1]+B[1])/2); ghost.visible=true;
}
const hideGhost = () => { if(ghost) ghost.visible=false; };
const fin = v => { const w=Math.floor(v+1e-6), f=Math.round((v-w)*16); return f ? (f===16 ? `${w+1}″` : `${w} ${f/gcd(f,16)}/${16/gcd(f,16)}″`) : `${w}″`; };
const gcd=(a,b)=>b?gcd(b,a%b):a;
/* start: { h, sid } from the handle hit */
function startMid(hit){ const s=slotOf(hit.object.userData.slot); if(!s) return null; return { mode:'mid', h:hit.object.userData.midHandle, sid:s.id, i:s.pod.i, id:s.part.id, moved:false, val:null }; }
/* the finger at plan point P (home feet): where it'd go → d.val, and the outline + the tip text */
function trackMid(d, P){
  const s=slotOf(d.sid); if(!s || !P) return '';
  const b=bodyOf(s), fa = s.mid.axis==='x' ? 0 : 1, ra=1-fa, off=podOffsets(state.model)[s.pod.i], o=[off.ox, off.oz];
  if(d.h==='move'){
    const c=P[fa===0?'x':'z']-o[fa]; let at=midAt(s.pod, s.part, c), why='';
    const sn=partSnaps(s).map(x=>({ ...x, d:Math.abs(x.at-at) })).filter(x=>x.d<=SNAP).sort((a,b)=>a.d-b.d)[0];
    if(sn){ at=sn.at; why=sn.label; } else at=Math.round(at);
    d.val=at; d.moved=true;
    // the outline where it'd sit: the same ends, its centre line moved to the new spot
    const c1=midLine(s.pod, { ...s.part, at }).c + o[fa], c0=(b.A[fa]+b.B[fa])/2, dd=c1-c0;
    const A=[...b.A], B=[...b.B]; A[fa]+=dd; B[fa]+=dd; showGhost(s, A, B, b.t, b.y);
    return `${fin(at)} from the ${s.part.dir==='long'?'side':'end'}${why?' · '+why:''}`;
  }
  if(d.h==='endA' || d.h==='endB'){
    const B0=s.body, lo=(ra===0?s.pod.x:s.pod.z), toV=f=>{ const dd=(f-o[ra]-lo)*12; return B0.inc ? dd : B0.span-dd; }, toW=v=>(B0.inc ? v : B0.span-v)/12+lo+o[ra];
    // which of its own ends this handle is (its run counts from the pod's own S / W side)
    if(d.end==null){ const vH=toV((d.h==='endA' ? b.A : b.B)[ra]); d.end = Math.abs(vH-B0.v0) < Math.abs(vH-B0.v1) ? 0 : 1; }
    let v=toV(P[ra===0?'x':'z']), why='';
    const sn=partEndSnaps(s).filter(x=>x.end==null || x.end===d.end).map(x=>({ ...x, d:Math.abs(x.v-v) })).filter(x=>x.d<=SNAP).sort((a,b)=>a.d-b.d)[0];
    if(sn){ v=sn.v; why=sn.label; } else v=Math.round(v);
    if(d.end===0) v=Math.max(B0.in0, Math.min(v, B0.v1-12)); else v=Math.min(B0.in1, Math.max(v, B0.v0+12));
    const toWall = d.end===0 ? v<=B0.in0+0.01 : v>=B0.in1-0.01;
    d.val = toWall ? null : v; d.moved=true;
    const v0 = d.end===0 ? v : B0.v0, v1 = d.end===1 ? v : B0.v1;
    const A=[...b.A], Bb=[...b.B]; A[ra]=toW(v0); Bb[ra]=toW(v1); showGhost(s, A, Bb, b.t, b.y);
    return `${fin(v1-v0)} long${toWall?' · to the wall':why?' · '+why:''}`;
  }
  return '';
}
/* the finger lifted: set it (→ the slot id, or '' when nothing changed) */
function endMid(d){
  hideGhost();
  if(d.h==='turn') return turnPart(d.i, d.id);
  if(!d.moved) return '';
  if(d.h==='move') return movePart(d.i, d.id, d.val);
  return setPart(d.i, d.id, d.end===0 ? { e0:d.val } : { e1:d.val });
}
export { handleY, midHandleMeshes, startMid, trackMid, endMid, update as updateMidHandles };
