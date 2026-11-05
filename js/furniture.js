/* Cubit Builder — furniture.js : cabinets, appliances and furniture placed in a home.

   Kept per home in state.furniture[home] = [{ id, k, w, h, d, y, opt, pod, u, v, a, wall }]:
     pod      the pod it stands in (so it moves and turns with the pod)
     u, v     feet, in the pod's own unturned frame (u along the pod, v across its 8′), the middle of the item's back
     a        degrees the item is turned in that frame (0 = its front faces +v)
     wall     the wall it's backed against (slot id), used for the pot-light rule (deepest unit per wall)
   Every category has its own switch in Layers (state.show['cw-<cat>']). */
import { state, save } from './state.js';
import { checkpoint } from './history.js';
import { ensureDraft } from './pods.js';
import { itemDef, newItem, CATS, settings as cwSettings, sinkHole, sinkBaseMin, th } from './casework.js';
import { itemModel } from './casework3d.js';
import { slotsFor } from './layout.js';
import { bodyWall } from './panels.js';
import { pickFor } from './state.js';

const FT=12;
const list = (k=state.model) => ((state.furniture ||= {})[k] ||= []);
const byId = id => list().find(f=>f.id===id);
const newId = () => 'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const shownCat = c => state.show['cw-'+c] !== false;

/* ---------------------------------------------------------------- pod frames (same turn rule as the floor layers) */
let frames=[], group=null, models=new Map(), lastPods=[];
function podFrame(p){
  const g=new THREE.Group(), L=p.len, off={0:[0,0],90:[8,0],180:[L,8],270:[0,L]}[p.rot||0];
  g.position.set(p.x+off[0], 0, p.z+off[1]); g.rotation.y=-(p.rot||0)*Math.PI/180; g.userData.pod=p.i; return g;
}
/* draw every placed item; called from buildHome with the pods where they sit on screen */
function buildFurniture(homeGroup, pods){
  lastPods=pods; group=new THREE.Group(); group.name='furniture'; homeGroup.add(group); models=new Map();
  frames=pods.map(p=>{ const f=podFrame(p); f.userData.base=f.position.clone(); group.add(f); return f; });
  const L=list();
  for(let i=L.length-1;i>=0;i--) if(!frames[L[i].pod] || !itemDef(L[i].k)) L.splice(i,1);
  L.forEach(it=>place(it));
  applyFurniture();
  return group;
}
function place(it){
  const f=frames[it.pod]; if(!f) return null;
  const m=itemModel(it, { edges:true, tenons:true });   // tenons show when it's exploded
  const holder=new THREE.Group(); holder.userData={ furn:it.id, cat:itemDef(it.k).cat };
  m.group.position.set(-it.w/2, it.y||0, 0); m.group.scale.setScalar(1);
  const sc=new THREE.Group(); sc.scale.setScalar(1/FT); sc.add(m.group); holder.add(sc);
  holder.position.set(it.u, 0, it.v); holder.rotation.y=(it.a||0)*Math.PI/180;
  holder.traverse(o=>{ if(o.isMesh){ o.userData.furn=it.id; } });
  f.add(holder); models.set(it.id, {holder, m});
  return holder;
}
function refreshItem(it){ if(!it) return; const old=models.get(it.id); if(old){ old.holder.parent?.remove(old.holder); models.delete(it.id); } const cur=byId(it.id); if(cur) place(cur); applyFurniture(); }
/* picked: the tapped item, the rest of its group, and anything multi-selected */
const isSel = id => { if(state.selFurn===id || (state.selSet||[]).includes(id)) return true; const g=byId(state.selFurn)?.grp?.id; return !!g && byId(id)?.grp?.id===g; };
let afterApply=null; const onFurnApplied = fn => { afterApply=fn; };
function applyFurniture(){
  if(!group) return;
  const F=state.focusPod;
  models.forEach(({holder, m},id)=>{ const it=byId(id); holder.visible = !!it && (state.isolate ? isoMine(id) : shownCat(holder.userData.cat) && (F==null || it.pod===F));
    m.select(null);
    if(isSel(id) && !state.isolate) m.meshes.forEach(x=>{ x.material = x.material.clone(); x.material.emissive?.set(0x6a2a08); }); });
  updateHandles();
  afterApply?.();
}
/* the exploded view: cabinets ride with their pod's floor, in one piece; an isolated cabinet comes apart where it stands */
function explodeFurniture(e, spreadOf, eP, eW, lift){
  const iso=String(state.isolate||'').startsWith('furn:');   // an isolated cabinet comes apart where it stands
  frames.forEach(f=>{ const v=iso?[0,0]:(spreadOf(f.userData.pod)||[0,0]), b=f.userData.base; if(b) f.position.set(b.x+v[0]*eP, b.y+(iso?0:lift), b.z+v[1]*eP); });
  models.forEach(({m},id)=>m.explode(isoMine(id) ? cabT : 0));   // cabinets stay together; an isolated one has its own explode
}
/* isolate ids: 'furn:<item>' a whole cabinet, 'furn:<item>:<part>' one part of it */
const isoMine = id => { const s=String(state.isolate||''); return s==='furn:'+id || s.startsWith('furn:'+id+':'); };
/* an isolated cabinet's own exploded view (Exploded view / three-finger spread while it's isolated); it starts
   assembled every time a cabinet is isolated, whatever the home around it is doing */
let cabT=0, cabGoal=0, cabRaf=0;
function setCabExplode(on){   // true / false, or how far apart (0–1) from the three-finger spread
  cabGoal = typeof on==='number' ? Math.max(0, Math.min(1, on)) : (on?1:0); cancelAnimationFrame(cabRaf);
  const step=()=>{ cabT+=(cabGoal-cabT)*0.15; if(Math.abs(cabGoal-cabT)<0.002) cabT=cabGoal;
    models.forEach(({m},id)=>{ if(isoMine(id)) m.explode(cabT); }); if(cabT!==cabGoal) cabRaf=requestAnimationFrame(step); };
  step();
}
function resetCabExplode(){ cancelAnimationFrame(cabRaf); cabT=cabGoal=0; models.forEach(({m})=>m.explode(0)); }
const cabExploded = () => cabGoal>0.02;
const cabExplodeGoal = () => cabGoal;
const furnHolder = ref => { const [id,part]=String(ref).split(':'); const o=models.get(id); if(!o) return null; return part==null ? o.holder : o.m.group.children[+part] || null; };
const furnMeshes = () => { const out=[]; const vis=o=>{ for(; o; o=o.parent) if(!o.visible) return false; return true; }; models.forEach(({holder})=>{ if(holder.visible) holder.traverse(o=>{ if(o.isMesh && vis(o)) out.push(o); }); }); return out; };

/* ---------------------------------------------------------------- where an item lands */
const ray=new THREE.Raycaster();
/* walls to snap to: the wall meshes (not the see-through panes, seals or labels) */
function wallMeshes(wallGroups){ const out=[]; wallGroups.forEach(g=>{ if(!g.visible) return; g.traverse(o=>{ if(o.isMesh && o.visible && o.userData.slotId && !o.userData.pickPane && !o.userData.seal && !o.userData.framing && !o.userData.unit && !o.userData.letter && !o.isSprite) out.push(o); }); }); return out; }
/* which pod a home-frame point (feet) is in */
function podAt(pt, pods){ return pods.find(p=>pt.x>=p.x-0.01 && pt.x<=p.x+p.w+0.01 && pt.z>=p.z-0.01 && pt.z<=p.z+p.d+0.01); }
/* snap an item (size in inches) dropped at home-frame point `pt` (THREE.Vector3, feet): back against the nearest
   wall within reach, clear of the walls at the ends, butted to its neighbours. Returns {pod,u,v,a,wall} or null. */
/* lockA: one touch, one wall. While a drag goes on, the item keeps the wall it started on (its back to it): it slides
   along it and stops at the corner instead of flipping onto the other wall. Only when it's pulled out into the room,
   beyond that wall's reach (its depth + 1.6′), can another wall take it. */
/* a sink dropped on a sink base docks in it (centre or either side, whichever is nearest the finger); anywhere else
   it's placed like any other item and is no longer docked */
function snap(it, pt, wallGroups, homeGroup, keepA=null, lockA=null){
  if(itemDef(it.k)?.cat==='upper' && !it.id) return snapUpper(it, snapItem(it, pt, wallGroups, homeGroup, keepA, lockA));
  if(!itemDef(it.k)?.dock) return snapItem(it, pt, wallGroups, homeGroup, keepA, lockA);
  const p=podAt(pt,lastPods), f=p && frames[p.i];
  if(f){ let R=f; while(R.parent) R=R.parent; R.updateMatrixWorld(true);
    const l=f.worldToLocal(homeGroup.localToWorld(pt.clone())), cab=baseUnder(p.i, l.x, l.z, it.id);
    if(cab){ const fresh=it.dock?.cab!==cab.id, cw={ ...cab, w:Math.max(cab.w, sinkBaseMin(it)) };
      const at=dockAt(it, cw, toItem(cw, l.x, l.z).x*FT), P=dockPose(it, cw, at);
      if(P) return { pod:p.i, u:P.u, v:P.v, a:P.a, y:P.y, wall:cab.wall||null, dock:{ cab:cab.id, at, ...(fresh?{fresh:true}:{}) } }; } }
  const r=snapItem(it, pt, wallGroups, homeGroup, keepA, lockA); return r ? { ...r, dock:null } : r;
}
/* an upper cabinet being dragged in: over a base cabinet on the same wall it takes that base's width and lines up
   with it (it can be resized afterwards like any cabinet) */
function snapUpper(it, s){
  if(!s || s.free) return s;
  const c=list().filter(o=>o.pod===s.pod && itemDef(o.k)?.cat==='base' && sameA(o.a, s.a)).map(o=>({ o, q:toItem(o, s.u, s.v) }))
    .filter(r=>Math.abs(r.q.z)<4/FT && Math.abs(r.q.x)<=r.o.w/2/FT).sort((a,b)=>Math.abs(a.q.x)-Math.abs(b.q.x))[0];
  if(!c) return s;
  const d=itemDef(it.k), w=Math.min(d.wR?.[1]??48, Math.max(d.wR?.[0]??6, c.o.w)), p=toPod(c.o, 0, 0);
  return { ...s, u:p.u, v:p.v, a:c.o.a||0, w, overBase:c.o.id };
}
function snapItem(it, pt, wallGroups, homeGroup, keepA=null, lockA=null){
  const p=podAt(pt,lastPods); if(!p || !frames[p.i]) return null;
  const f=frames[p.i]; { let R=f; while(R.parent) R=R.parent; R.updateMatrixWorld(true); }   // walls just rebuilt may not have been drawn yet
  const W=wallMeshes(wallGroups), world=homeGroup.localToWorld(pt.clone());
  const local=f.worldToLocal(world.clone());
  const dirs=[[0,-1,0],[0,1,180],[-1,0,90],[1,0,-90]];   // toward the wall: -v (item faces +v, a=0), +v, -u, +u
  const reach=(it.d/FT)+1.6;
  let best=null;
  const cast=(o,d,h)=>{ const wo=f.localToWorld(new THREE.Vector3(o.x,h,o.z)), wd=f.localToWorld(new THREE.Vector3(o.x+d[0],h,o.z+d[1])).sub(wo).normalize();
    ray.set(wo,wd); ray.far=40; const hit=ray.intersectObjects(W,false)[0]; if(!hit) return null; return { dist:hit.distance, slot:hit.object.userData.slotId }; };
  const hh=[Math.max(0.5,(it.y+Math.min(it.h,24)/2)/FT), 0.6];
  const look = D => D.forEach(([du,dv,a])=>{ for(const h of hh){ const c=cast({x:local.x,z:local.z},[du,dv],h); if(c && c.dist<reach && (!best || c.dist<best.dist)) best={...c, du, dv, a}; } });
  const nA = x => ((Math.round(x)%360)+360)%360;
  if(lockA!=null) look(dirs.filter(d=>nA(d[2])===nA(lockA)));   // the wall it's on first
  if(!best) look(dirs);
  if(!best){
    // not near a wall: free standing (furniture), keep it in the pod
    return { pod:p.i, u:local.x, v:local.z, a:keepA ?? 0, wall:null, free:true };
  }
  const a=best.a, u0=local.x+best.du*best.dist, v0=local.z+best.dv*best.dist;      // the wall face under the finger
  // along the wall: room to each side (the walls at the ends)
  const ax=best.du ? [0,1] : [1,0];
  const off=0.25, base={x:u0-best.du*off, z:v0-best.dv*off}, half=it.w/2/FT;
  const lo=cast(base,[-ax[0],-ax[1]],hh[1]), hi=cast(base,[ax[0],ax[1]],hh[1]);
  let s=0;                                   // shift along the wall so it fits between the end walls
  if(lo && lo.dist<half) s = half-lo.dist;
  if(hi && hi.dist<half) s = -(half-hi.dist);
  // butt against neighbours on the same wall within 4″
  const cx = (ax[0]? base.x : base.z) + s;
  let ux = ax[0] ? cx : u0, vz = ax[1] ? cx : v0;
  list().forEach(o=>{ if(o.id===it.id || o.pod!==p.i || o.a!==a) return; const ocx = ax[0]? o.u : o.v, oh=o.w/2/FT;
    const gap1=(cx-half)-(ocx+oh), gap2=(ocx-oh)-(cx+half);
    if(Math.abs(gap1)<4/FT){ if(ax[0]) ux-=gap1; else vz-=gap1; }
    else if(Math.abs(gap2)<4/FT){ if(ax[0]) ux+=gap2; else vz+=gap2; } });
  // items that stand off the wall (a sink in the countertop) move out by their gap
  let U = ax[0]? ux : u0, V = ax[1]? vz : v0; const gap=(itemDef(it.k)?.gap||0)/FT;
  if(gap){ const r=a*Math.PI/180; U+=Math.sin(r)*gap; V+=Math.cos(r)*gap; }
  return { pod:p.i, u:U, v:V, a, wall: best.slot||null };
}

/* ---------------------------------------------------------------- stretch handles
   A tapped item gets a green double arrow on each side that's free (not against a wall, a pod side or another
   item): drag one to make it longer / deeper or shorter, the other side stays put. It stops at, and snaps up
   against (within 3″), the next wall or item — a countertop runs right up to the fridge panel. */
const SIDES={ L:[-1,0], R:[1,0], F:[0,1], B:[0,-1] };   // outward, in the item's own frame (x along its width, z toward its front)
let handleGroup=null, wallsRef=()=>[];
const setWalls = fn => { wallsRef=fn; };
let arrowTex=null;
function arrowTexture(){
  if(arrowTex) return arrowTex;
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.fillStyle='#2e9e5b'; g.beginPath(); g.arc(64,64,60,0,Math.PI*2); g.fill(); g.lineWidth=6; g.strokeStyle='#fff'; g.stroke();
  g.fillStyle='#fff'; g.beginPath(); g.moveTo(14,64); g.lineTo(44,36); g.lineTo(44,54); g.lineTo(84,54); g.lineTo(84,36); g.lineTo(114,64); g.lineTo(84,92); g.lineTo(84,74); g.lineTo(44,74); g.lineTo(44,92); g.closePath(); g.fill();
  arrowTex=new THREE.CanvasTexture(c); return arrowTex;
}
/* the turn handle: a green disc with a curved arrow */
let turnTex=null;
function turnTexture(){
  if(turnTex) return turnTex;
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.fillStyle='#2e9e5b'; g.beginPath(); g.arc(64,64,60,0,Math.PI*2); g.fill(); g.lineWidth=6; g.strokeStyle='#fff'; g.stroke();
  g.lineWidth=11; g.lineCap='round'; g.beginPath(); g.arc(64,64,32,-Math.PI*0.95,Math.PI*0.45); g.stroke();
  const ex=64+32*Math.cos(Math.PI*0.45), ey=64+32*Math.sin(Math.PI*0.45);
  g.fillStyle='#fff'; g.beginPath(); g.moveTo(ex-24,ey-4); g.lineTo(ex+8,ey-22); g.lineTo(ex+6,ey+16); g.closePath(); g.fill();
  turnTex=new THREE.CanvasTexture(c); return turnTex;
}
/* the item in its pod frame: local (x across its width from its middle, z from its back) ⇄ pod (u, v), feet */
const toPod = (it, lx, lz) => { const a=(it.a||0)*Math.PI/180; return { u: it.u + lx*Math.cos(a) + lz*Math.sin(a), v: it.v - lx*Math.sin(a) + lz*Math.cos(a) }; };
const toItem = (it, u, v) => { const a=(it.a||0)*Math.PI/180, dx=u-it.u, dz=v-it.v; return { x: dx*Math.cos(a) - dz*Math.sin(a), z: dx*Math.sin(a) + dz*Math.cos(a) }; };
/* free room (feet) beyond one side of an item before the next wall or item (that overlaps it in height) */
function roomBeyond(it, side){
  const f=frames[it.pod]; if(!f) return 0;
  f.updateMatrixWorld(true);
  const [ox,oz]=SIDES[side], hw=it.w/2/FT, d=it.d/FT;
  const edge = ox ? ox*hw : (oz>0 ? d : 0);
  let room=40;
  // walls: rays from a few points along that side, at the item's height
  const W=wallMeshes(wallsRef()), ray=new THREE.Raycaster();
  const along = ox ? [0.15*d, 0.5*d, 0.85*d] : [-0.85*hw, 0, 0.85*hw];
  const hs=[(it.y||0)+Math.min(it.h,24)/2, (it.y||0)+it.h-1].map(h=>Math.max(0.3, h/FT));
  along.forEach(t=>hs.forEach(h=>{
    const lx = ox ? edge-ox*0.01 : t, lz = ox ? t : edge-oz*0.01;
    const p0=toPod(it,lx,lz), p1=toPod(it,lx+ox,lz+oz);
    const wo=f.localToWorld(new THREE.Vector3(p0.u,h,p0.v)), wd=f.localToWorld(new THREE.Vector3(p1.u,h,p1.v)).sub(wo).normalize();
    ray.set(wo,wd); ray.far=40; const hit=ray.intersectObjects(W,false)[0]; if(hit) room=Math.min(room, Math.max(0, hit.distance-0.01)); }));
  // other items in the same pod whose height range overlaps
  const y0=it.y||0, y1=y0+it.h;
  const sinkTop = k => ['counter','sink'].includes(itemDef(k)?.cat);   // a sink sits in the countertop: they don't stop each other
  list().forEach(o=>{ if(o.id===it.id || o.pod!==it.pod) return; if(sinkTop(o.k) && sinkTop(it.k) && itemDef(o.k).cat!==itemDef(it.k).cat) return; const oy0=o.y||0, oy1=oy0+o.h; if(oy1<=y0+0.25 || oy0>=y1-0.25) return;
    const ohw=o.w/2/FT, od=o.d/FT, pts=[[-ohw,0],[ohw,0],[ohw,od],[-ohw,od]].map(([x,z])=>{ const p=toPod(o,x,z); return toItem(it,p.u,p.v); });
    const xs=pts.map(p=>p.x), zs=pts.map(p=>p.z), mnx=Math.min(...xs), mxx=Math.max(...xs), mnz=Math.min(...zs), mxz=Math.max(...zs), e=0.02;
    if(ox){ if(mnz>=d-e || mxz<=e) return; const gap = ox>0 ? mnx-hw : -hw-mxx; if(gap>-e) room=Math.min(room, Math.max(0,gap)); }
    else { if(mnx>=hw-e || mxx<=-hw+e) return; const gap = oz>0 ? mnz-d : -mxz; if(gap>-e) room=Math.min(room, Math.max(0,gap)); } });
  return room;
}
function updateHandles(){
  if(handleGroup){ handleGroup.parent?.remove(handleGroup); handleGroup=null; }
  const it=state.selFurn && byId(state.selFurn), d=it && itemDef(it.k);
  if(!it || !d || state.isolate || !frames[it.pod] || !models.get(it.id)?.holder.visible) return;
  handleGroup=new THREE.Group(); handleGroup.userData.noGhost=true;
  const mat=new THREE.MeshBasicMaterial({ map:arrowTexture(), transparent:true, depthTest:false, side:THREE.DoubleSide });
  const top=((it.y||0)+it.h)/FT+0.05, hw=it.w/2/FT, dd=it.d/FT, s=Math.max(0.5, Math.min(0.9, Math.min(it.w,it.d)/FT*0.55));
  { // the turn handle, off the front right corner: drag it round to turn the item in 45° steps
    const o=turnHandleAt(it), p=toPod(it, o.x, o.z), m=new THREE.Mesh(new THREE.PlaneGeometry(s,s), new THREE.MeshBasicMaterial({ map:turnTexture(), transparent:true, depthTest:false, side:THREE.DoubleSide }));
    m.rotation.order='YXZ'; m.rotation.y=(it.a||0)*Math.PI/180; m.rotation.x=-Math.PI/2;
    m.position.set(p.u, top, p.v); m.renderOrder=31; m.userData={ handle:'turn', furn:it.id, noGhost:true }; handleGroup.add(m); }
  if(!d.fixed) Object.keys(SIDES).forEach(side=>{
    if(side==='B' && it.wall) return;                         // backed onto a wall
    if(roomBeyond(it, side) < 0.3/FT) return;                  // already up against something: no arrow that way
    const [ox,oz]=SIDES[side], lx = ox ? ox*(hw+s*0.55) : 0, lz = ox ? dd/2 : (oz>0 ? dd+s*0.55 : -s*0.55);
    const p=toPod(it,lx,lz), m=new THREE.Mesh(new THREE.PlaneGeometry(s,s), mat);
    m.rotation.order='YXZ'; m.rotation.y=(it.a||0)*Math.PI/180 + (oz ? Math.PI/2 : 0); m.rotation.x=-Math.PI/2;
    m.position.set(p.u, top, p.v); m.renderOrder=30; m.userData={ handle:side, furn:it.id, noGhost:true };
    handleGroup.add(m); });
  frames[it.pod].add(handleGroup);
}
/* where the turn handle sits, in the item's own frame (feet: x from its middle, z from its back) */
const turnHandleAt = it => { const s=Math.max(0.5, Math.min(0.9, Math.min(it.w,it.d)/FT*0.55)); return { x:it.w/2/FT+s*0.45, z:it.d/FT+s*0.45 }; };
/* ---------------------------------------------------------------- turning (the turn handle)
   The item turns about its middle in 45° steps; a group turns as one, about the picked item's middle. When it's
   done it's kept clear of the pod's walls, and an item turned square to a wall with its back within 2″ of it backs
   onto that wall again (so the pot-light rule and the plugs know it's there). */
const centreOf = it => toPod(it, 0, it.d/FT/2);
const poseAbout = (it, c, a) => { const r=a*Math.PI/180; return { u:c.u-Math.sin(r)*it.d/FT/2, v:c.v-Math.cos(r)*it.d/FT/2 }; };
const norm180 = a => { a=((Math.round(a)%360)+360)%360; return a>180 ? a-360 : a; };
function podCast(f, u, v, du, dv, h){
  const W=wallMeshes(wallsRef()), wo=f.localToWorld(new THREE.Vector3(u,h,v)), wd=f.localToWorld(new THREE.Vector3(u+du,h,v+dv)).sub(wo).normalize();
  ray.set(wo,wd); ray.far=40; const hit=ray.intersectObjects(W,false)[0]; return hit ? { dist:hit.distance, slot:hit.object.userData.slotId } : null;
}
/* pod-frame extent of an item turned to a (feet): how far its footprint reaches each way from its middle */
function reachOf(it, a){
  const hw=it.w/2/FT, hd=it.d/FT/2, r=a*Math.PI/180, c=Math.abs(Math.cos(r)), s=Math.abs(Math.sin(r));
  return { u: hw*c+hd*s, v: hw*s+hd*c };
}
/* keep an item (pose {u,v,a}) clear of the walls; back it onto a wall it's square to and within 2″ of */
function settle(it, pose){
  const f=frames[it.pod]; if(!f) return { ...pose, wall:null };
  let root=f; while(root.parent) root=root.parent; root.updateMatrixWorld(true);   // walls just rebuilt may not have been drawn yet
  const T={ ...it, ...pose }, c=centreOf(T), R=reachOf(it, pose.a), h=Math.max(0.5, ((it.y||0)+Math.min(it.h,24)/2)/FT);
  let du=0, dv=0;
  [[1,0,'u'],[-1,0,'u'],[0,1,'v'],[0,-1,'v']].forEach(([x,z,k])=>{ const hit=podCast(f, c.u, c.v, x, z, h); if(!hit) return;
    const over=R[k]-hit.dist; if(over>0){ if(x) du-=x*over; else dv-=z*over; } });
  let out={ ...pose, u:pose.u+du, v:pose.v+dv, wall:null };
  if(pose.a%90===0){   // square to the pod: is its back on a wall?
    const r=pose.a*Math.PI/180, bx=-Math.round(Math.sin(r)), bz=-Math.round(Math.cos(r)), cc=centreOf({ ...it, ...out });
    const hit=podCast(f, cc.u, cc.v, bx, bz, h), gap=hit ? hit.dist-it.d/FT/2 : 99;
    if(hit && gap<2/FT){ out.u+=bx*gap; out.v+=bz*gap; out.wall=hit.slot||null; }
  }
  return out;
}
/* turning by the handle: start = {a0, th0, c} from turnStart; pt = home-frame point under the finger.
   Returns { deg, moves:[[id,{u,v,a,wall}],…] } */
function podPoint(it, pt, homeGroup){ const f=frames[it.pod]; if(!f) return null; f.updateMatrixWorld(true); return f.worldToLocal(homeGroup.localToWorld(pt.clone())); }
function turnStart(it, pt, homeGroup){
  const l=podPoint(it, pt, homeGroup), c=centreOf(it); if(!l) return null;
  const others=groupMembers(it.grp?.id).filter(o=>o.id!==it.id).map(o=>({ id:o.id, home:{u:o.u, v:o.v, a:o.a||0} }));
  return { a0:it.a||0, th0:Math.atan2(l.x-c.u, l.z-c.v)*180/Math.PI, c, others };
}
function turnTo(it, st, pt, homeGroup, done=false){
  const l=podPoint(it, pt, homeGroup); if(!l || !st) return null;
  let d=Math.atan2(l.x-st.c.u, l.z-st.c.v)*180/Math.PI-st.th0; d=((d%360)+540)%360-180;
  const deg=Math.round(d/45)*45, a=norm180(st.a0+deg);
  let me={ ...poseAbout(it, st.c, a), a, wall:null };
  if(!st.others.length) me=settle(it, me);   // a group turns freely; one item stays clear of the walls
  const moves=[[it.id, me]];
  st.others.forEach(o=>{ const [x,z]=rotXZ(o.home.u-st.c.u, o.home.v-st.c.v, deg); moves.push([o.id, { u:st.c.u+x, v:st.c.v+z, a:norm180(o.home.a+deg), wall:null }]); });
  return { deg, moves };
}
const handleMeshes = () => handleGroup ? handleGroup.children.filter(m=>m.visible) : [];
/* stretch an item by dragging one side to a home-frame point (feet); returns the change to make, or null */
function stretchTo(it, side, pt, homeGroup, room){
  const f=frames[it.pod]; if(!f) return null; f.updateMatrixWorld(true);
  const l=f.worldToLocal(homeGroup.localToWorld(pt.clone())), q=toItem(it, l.x, l.z), d=itemDef(it.k);
  const [ox,oz]=SIDES[side], hw=it.w/2/FT, dd=it.d/FT, snapTo=3/FT, r8=v=>Math.round(v*FT*8)/8;   // inches, to ⅛″
  if(ox){
    const fixed=-ox*hw, cur=ox*hw, max=cur+ox*room;
    let edge = ox>0 ? Math.min(q.x, max) : Math.max(q.x, max);
    if(Math.abs(edge-max)<snapTo) edge=max;                   // up against the wall / the next item
    let w=r8(Math.abs(edge-fixed)); w=Math.min(d.wR[1], Math.max(d.wR[0], w));
    const mid=fixed+ox*w/FT/2, p=toPod(it, mid, 0);
    return { w, u:p.u, v:p.v, snapped: edge===max && room<39 };
  }
  if(oz>0){ const max=dd+room; let z=Math.min(q.z, max); if(Math.abs(z-max)<snapTo) z=max; let dpt=r8(z); dpt=Math.min(d.dR[1], Math.max(d.dR[0], dpt)); return { d:dpt, snapped: z===max && room<39 }; }
  // the back (free-standing items): the front stays, the back moves
  const min=-room; let z=Math.max(q.z, min); if(Math.abs(z-min)<snapTo) z=min; let dpt=r8(dd-z); dpt=Math.min(d.dR[1], Math.max(d.dR[0], dpt));
  const p=toPod(it, 0, dd-dpt/FT); return { d:dpt, u:p.u, v:p.v, snapped: z===min && room<39 };
}
/* ---------------------------------------------------------------- a free spot for a new item
   Two items clash when their heights overlap and their footprints overlap (a sink in a countertop doesn't count). */
function clash(a, b){
  if(a.pod!==b.pod) return false;
  const ca=itemDef(a.k)?.cat, cb=itemDef(b.k)?.cat; if((ca==='sink'&&cb==='counter')||(ca==='counter'&&cb==='sink')) return false;
  const ay0=a.y||0, by0=b.y||0; if(ay0+a.h<=by0+0.25 || by0+b.h<=ay0+0.25) return false;
  const sep=(A,B)=>{ const hw=A.w/2/FT, d=A.d/FT; const pts=[[-B.w/2/FT,0],[B.w/2/FT,0],[B.w/2/FT,B.d/FT],[-B.w/2/FT,B.d/FT]].map(([x,z])=>{ const p=toPod(B,x,z); return toItem(A,p.u,p.v); });
    const e=0.02; return Math.max(...pts.map(p=>p.x))<=-hw+e || Math.min(...pts.map(p=>p.x))>=hw-e || Math.max(...pts.map(p=>p.z))<=e || Math.min(...pts.map(p=>p.z))>=d-e; };
  return !(sep(a,b) || sep(b,a));
}
/* try spots along the walls of every pod (both long walls, then the ends), first one that's free */
function freeSpot(it, homeGroup){
  for(const p of lastPods){ const f=frames[p.i]; if(!f) continue; f.updateMatrixWorld(true);
    const tries=[]; for(let u=1.5; u<=p.len-1.5; u+=1) tries.push([u,1.2],[u,6.8]); tries.push([1.2,4],[p.len-1.2,4]);
    for(const [u,v] of tries){ const pt=homeGroup.worldToLocal(f.localToWorld(new THREE.Vector3(u,0,v)));
      const at=snap(it, pt, wallsRef(), homeGroup); if(!at || at.free) continue;
      const cand={...it, ...at, id:'_new'}; if(!list().some(o=>clash(cand,o))) return at; } }
  return null;
}
/* ---------------------------------------------------------------- groups (a kitchen…)
   Items grouped together carry it.grp = {id, name, from}; from = the saved kitchen it came from (kitchens.js). They pick,
   move, turn and explode as one. Ungrouping keeps it.was = the group, so it can be relinked after editing. */
const rotXZ = (x, z, deg) => { const r=deg*Math.PI/180, c=Math.cos(r), s=Math.sin(r); return [x*c+z*s, -x*s+z*c]; };
const groupMembers = gid => gid ? list().filter(o=>o.grp?.id===gid) : [];
const newGid = () => 'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,4);
function makeGroup(ids, name, from=null){ checkpoint(); ensureDraft(); const gid=newGid(); ids.forEach(id=>{ const it=byId(id); if(it){ it.grp={id:gid, name, from}; delete it.was; } }); save(); return gid; }
function ungroup(gid){ checkpoint(); ensureDraft(); groupMembers(gid).forEach(it=>{ it.was={...it.grp}; delete it.grp; }); save(); }
function relinkGroup(gid){ checkpoint(); ensureDraft(); const L=list().filter(it=>it.was?.id===gid); L.forEach(it=>{ it.grp=it.was; delete it.was; }); save(); return L.length; }
function renameGroup(gid, name){ checkpoint(); ensureDraft(); groupMembers(gid).forEach(it=>{ it.grp.name=name; }); save(); }
function setGroupFrom(gid, from){ groupMembers(gid).forEach(it=>{ it.grp.from=from; }); save(); }
function removeGroup(gid){ checkpoint(); ensureDraft(); const L=list(); for(let i=L.length-1;i>=0;i--) if(L[i].grp?.id===gid) L.splice(i,1); if(byId(state.selFurn)==null) state.selFurn=null; changed(); }
/* several items moved at once (a group dragged): one undo step */
function setMany(updates){ checkpoint(); ensureDraft(); updates.forEach(([id,patch])=>{ const it=byId(id); if(it){ Object.assign(it, patch); delete it.free; } }); changed(); }
/* the live preview while a group is dragged: move the 3D holders without rebuilding them */
function moveHolder(id, u, v, a){ const o=models.get(id); if(o){ o.holder.position.set(u, 0, v); o.holder.rotation.y=(a||0)*Math.PI/180; } }
/* a group as a recipe: each item relative to the anchor (sizes, options, where it sits from the anchor's back-middle) */
function groupRecipe(items, anchor){
  return items.map(it=>{ const [x,z]=rotXZ(it.u-anchor.u, it.v-anchor.v, -(anchor.a||0)); const { id, pod, u, v, a, wall, grp, was, free, ...rest }=it;
    return { ...JSON.parse(JSON.stringify(rest)), rx:x, rz:z, ra:(((it.a||0)-(anchor.a||0))%360+360)%360 }; });
}
/* where every item of a recipe goes when its anchor lands at `at` ({pod,u,v,a}) */
function placeRecipe(recipe, at){
  return recipe.map(r=>{ const [x,z]=rotXZ(r.rx, r.rz, at.a||0); let a=(((at.a||0)+r.ra)%360+360)%360; if(a>180) a-=360; const { rx, rz, ra, ...it }=r; return { ...it, pod:at.pod, u:at.u+x, v:at.v+z, a, wall: r.rx===0 && r.rz===0 ? at.wall : null }; });
}
function addRecipe(recipe, at, name, from){
  checkpoint(); ensureDraft(); const gid=newGid(), L=list();
  placeRecipe(recipe, at).forEach(x=>{ L.push({ id:newId(), ...x, grp:{id:gid, name, from} }); const c=itemDef(x.k)?.cat; if(c && state.show['cw-'+c]===false) state.show['cw-'+c]=true; });
  changed(); return gid;
}

/* ---------------------------------------------------------------- the ghost while dragging */
let fg=null;
function showFurnGhost(it, at){
  const f=frames[at.pod]; if(!f){ hideFurnGhost(); return; }
  if(!fg){ fg=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0x2e9e5b, transparent:true, opacity:0.4, depthTest:false}));
    fg.renderOrder=20; const e=new THREE.LineSegments(new THREE.EdgesGeometry(fg.geometry), new THREE.LineBasicMaterial({color:0x1c211e, depthTest:false})); e.renderOrder=21; fg.add(e); }
  if(fg.parent!==f) f.add(fg);
  const r=(at.a||0)*Math.PI/180, h=Math.max(0.3, it.h/FT), W=at.w ?? it.w;
  fg.visible=true; fg.rotation.y=r; fg.scale.set(W/FT, h, it.d/FT);
  fg.position.set(at.u+Math.sin(r)*it.d/2/FT, (it.y||0)/FT+h/2, at.v+Math.cos(r)*it.d/2/FT);
}
const hideFurnGhost = () => { if(fg) fg.visible=false; };
const setHolderVisible = (id, v) => { const m=models.get(id); if(m) m.holder.visible = v && shownCat(m.holder.userData.cat); };

/* ---------------------------------------------------------------- kitchens: sinks, sink bases, countertops
   After every change (changed()):
     · a sink docked in a sink base (sink.dock = { cab, at:'L'|'C'|'R' }) sits in it: centred, or its hole
       `sinkBase.keep` (3″) in from either side; 2″… (the sink's own gap) off the wall; its rim at the countertop.
       The base is never narrower than the sink needs (sinkBaseMin): it grows to it when the sink docks, and can be
       made wider, not narrower. The base's stretchers are narrowed over the sink's hole (cab.sinkCut, casework.js).
     · a countertop on base cabinets fits them: back to the wall, ⅛″ past each end unless that end is against a wall
       or a tall unit (a range end gets the ⅛″ too), 1″ past the front of the boxes, sitting on them, the shop's
       thickness. The sinks under it give it its holes (ct.sinks). */
const KF = () => cwSettings();
const isBase = o => { const c=itemDef(o.k)?.cat; return c==='base' || c==='vanity'; };
const underCounter = o => isBase(o) || /^(DW|FR24U)/.test(o.k||'');
const isTallAt = (o, top) => { const c=itemDef(o.k)?.cat; if(/^RG/.test(o.k||'')) return false;   // a range: the countertop still runs ⅛″ past
  return ['tall','linen','wardrobe'].includes(c) || ((o.y||0)+o.h > top+2 && (o.y||0) < top); };
const sameA = (a,b) => Math.abs((((a||0)-(b||0))%360+540)%360-180)<1;
/* where a docked sink goes in its base: { u, v, a, y, x (hole centre from the base's middle, in), hole } */
function dockPose(sink, cab, at){
  const SB=KF().sinkBase, hole=sinkHole(sink); if(!hole) return null;
  let x=0; const side=cab.w/2-SB.keep-hole.w/2;
  if(at==='L') x=-Math.max(0,side); else if(at==='R') x=Math.max(0,side);
  const gap=itemDef(sink.k)?.gap ?? 2, p=toPod(cab, (x-(hole.cx||0))/FT, gap/FT);   // x: the hole's centre; the sink's own middle is cx off it
  const top=(cab.y||0)+cab.h;   // top mount: the rim sits on the countertop · bottom mount: the sink hangs under it
  return { u:p.u, v:p.v, a:cab.a||0, y:+(hole.mount==='top' ? top+KF().counter.t-sink.h+0.2 : top-sink.h).toFixed(4), x, hole, gap };
}
/* which of L / C / R a point (inches across the base from its middle) is nearest */
function dockAt(sink, cab, xIn){ const SB=KF().sinkBase, hole=sinkHole(sink); if(!hole) return 'C';
  const side=Math.max(0, cab.w/2-SB.keep-hole.w/2), opts=[['L',-side],['C',0],['R',side]];
  return opts.sort((p,q)=>Math.abs(p[1]-xIn)-Math.abs(q[1]-xIn))[0][0]; }
/* the sink base under a point in a pod (feet, pod frame), for a sink being dropped */
function baseUnder(pod, x, z, notId){
  const L=list().filter(o=>o.pod===pod && o.id!==notId && itemDef(o.k)?.cat==='base' && !o.grp?.locked);
  const hit=L.filter(o=>{ const q=toItem(o,x,z); return Math.abs(q.x)<=o.w/2/FT && q.z>=-0.05 && q.z<=o.d/FT+0.05; });
  return hit.sort((a,b)=>(b.k==='BS')-(a.k==='BS'))[0] || null;
}
/* a cabinet made wider or narrower in a run: its left end stays, and the units butted on its right move along with
   its right end (countertops and docked sinks fit themselves afterwards) */
function resizeInRun(cab, w){
  const dW=w-cab.w; if(Math.abs(dW)<1e-6) return;
  const L=list(), right=cab.w/2/FT;
  const line=L.filter(o=>o.id!==cab.id && o.pod===cab.pod && sameA(o.a,cab.a) && itemDef(o.k)?.cat!=='counter' && !o.dock).map(o=>{
    const c=toItem(cab, o.u, o.v); return { o, z:c.z, x0:c.x-o.w/2/FT, x1:c.x+o.w/2/FT }; }).filter(r=>Math.abs(r.z)<4/FT).sort((a,b)=>a.x0-b.x0);
  const move=[]; let edge=right; line.forEach(r=>{ if(r.x0>=edge-0.5/FT && r.x0<=edge+0.5/FT){ move.push(r.o); edge=r.x1; } });
  const shift=(o,d)=>{ const p0=toPod(cab,0,0), p1=toPod(cab,d/FT,0); o.u+=p1.u-p0.u; o.v+=p1.v-p0.v; };
  move.forEach(o=>shift(o,dW));
  shift(cab, dW/2); cab.w=+w.toFixed(4);
}
/* a sink base back to the narrowest its sink allows */
function fitBaseToSink(id){ checkpoint(); ensureDraft(); const cab=byId(id); if(!cab?.sinkMin) return; resizeInRun(cab, cab.sinkMin); changed(); }
function fitSinks(){
  const L=list();
  L.forEach(o=>{ if(o.sinkCut && !L.some(s=>s.dock?.cab===o.id)){ delete o.sinkCut; delete o.sinkMin; } });
  const docked=L.filter(s=>{ if(!s.dock) return false; const cab=byId(s.dock.cab);
    if(!cab || cab.pod!==s.pod || !itemDef(s.k)?.dock){ delete s.dock; return false; } return true; });
  // the base is never narrower than its sink needs: it grows to it (its neighbours on the right move along)
  docked.forEach(s=>{ const cab=byId(s.dock.cab), min=sinkBaseMin(s); cab.sinkMin=min; delete s.dock.fresh; if(cab.w<min-1e-6) resizeInRun(cab, min); });
  docked.forEach(s=>{ const cab=byId(s.dock.cab);
    const P=dockPose(s, cab, s.dock.at||'C'); if(!P) return;
    Object.assign(s, { u:P.u, v:P.v, a:P.a, y:P.y, wall:cab.wall||null });
    const xc=cab.w/2+P.x, z0=P.gap+s.d/2+(P.hole.cz||0)-P.hole.d/2;
    cab.sinkCut={ x0:+(xc-P.hole.w/2).toFixed(4), x1:+(xc+P.hole.w/2).toFixed(4), z0:+z0.toFixed(4), z1:+(z0+P.hole.d).toFixed(4) }; });
}
function fitCounters(){
  const C=KF().counter, L=list(), T=th();
  L.filter(o=>itemDef(o.k)?.cat==='counter').forEach(ct=>{
    ct.h=C.t;
    // the under-counter units on the countertop's back line, in its frame (feet)
    // a run is cabinets side by side with the same top (a dishwasher or under-counter fridge joins any run): a taller
    // dresser or bar run gets its countertop at its own height, and a taller unit beside a run is where it stops (flush)
    const on=L.filter(o=>o.pod===ct.pod && o.id!==ct.id && underCounter(o) && sameA(o.a,ct.a)).map(o=>{
      const p=toItem(ct, ...Object.values(toPod(o,-o.w/2/FT,0))), q=toItem(ct, ...Object.values(toPod(o,o.w/2/FT,0)));
      return { o, x0:Math.min(p.x,q.x), x1:Math.max(p.x,q.x), z:(p.z+q.z)/2, top:isBase(o) ? (o.y||0)+o.h : null }; }).filter(r=>Math.abs(r.z)<4/FT).sort((a,b)=>a.x0-b.x0);
    if(!on.length) return;
    const sameTop = (g, r) => g.top==null || r.top==null || Math.abs(g.top-r.top)<0.5;
    const runs=[]; on.forEach(r=>{ const g=runs[runs.length-1]; if(g && r.x0<=g.x1+0.5/FT && sameTop(g, r)){ g.x1=Math.max(g.x1,r.x1); g.its.push(r); g.top ??= r.top; } else runs.push({ x0:r.x0, x1:r.x1, its:[r], top:r.top }); });
    const hw=ct.w/2/FT, ov=g=>Math.min(g.x1,hw)-Math.max(g.x0,-hw);
    const run=runs.filter(g=>ov(g)>0).sort((a,b)=>ov(b)-ov(a))[0]; if(!run) return;
    const cabs=run.its.filter(r=>isBase(r.o)).map(r=>r.o);
    const top=cabs.length ? Math.max(...cabs.map(o=>(o.y||0)+o.h)) : 35.5;
    const box=cabs.length ? Math.max(...cabs.map(o=>o.d-T)) : 23.625;
    // each end: against a wall or a tall unit → flush; otherwise ⅛″ past
    const f=frames[ct.pod]; if(f){ let R=f; while(R.parent) R=R.parent; R.updateMatrixWorld(true); }
    const h=(top+0.25)/FT, zm=box/2/FT;
    const endHit = (x, dir) => {
      if(f){ const p0=toPod(ct, x+dir*0.01/FT, zm), p1=toPod(ct, x+dir, zm), hit=podCast(f, p0.u, p0.v, p1.u-p0.u, p1.v-p0.v, h); if(hit && hit.dist<0.6/FT) return true; }
      return L.some(o=>{ if(o.pod!==ct.pod || o.id===ct.id || !isTallAt(o, top)) return false;
        const pts=[[-o.w/2,0],[o.w/2,0],[o.w/2,o.d],[-o.w/2,o.d]].map(([a,b])=>{ const pp=toPod(o,a/FT,b/FT); return toItem(ct,pp.u,pp.v); });
        const xs=pts.map(p=>p.x), zs=pts.map(p=>p.z); if(Math.max(...zs)<=0.02 || Math.min(...zs)>=box/FT) return false;
        return dir<0 ? Math.abs(Math.max(...xs)-x)<0.6/FT : Math.abs(Math.min(...xs)-x)<0.6/FT; }); };
    const oL=endHit(run.x0,-1)?0:C.end, oR=endHit(run.x1,1)?0:C.end;
    const x0=run.x0-oL/FT, x1=run.x1+oR/FT, cx=(x0+x1)/2, P=toPod(ct, cx, run.its[0].z);
    Object.assign(ct, { w:+((x1-x0)*FT).toFixed(4), d:+(box+C.over).toFixed(4), y:+top.toFixed(4), u:P.u, v:P.v, wall:run.its.find(r=>r.o.wall)?.o.wall||ct.wall||null });
    // the sinks in it: their holes in the countertop's own coordinates (in, x from its left end, z from the back)
    // a point on the sink (in, x from its left end, z from its back) in the countertop's coordinates
    const onCT = (s, x, z) => { const p=toPod(s, (x-s.w/2)/FT, z/FT), q=toItem(ct, p.u, p.v); return [+(q.x*FT+ct.w/2).toFixed(4), +(q.z*FT).toFixed(4)]; };
    ct.sinks=L.filter(s=>s.pod===ct.pod && itemDef(s.k)?.dock && sameA(s.a,ct.a)).map(s=>{ const hole=sinkHole(s); if(!hole) return null;
      const [X,Z]=onCT(s, s.w/2+(hole.cx||0), s.d/2+(hole.cz||0)), paths=hole.paths ? hole.paths.map(P=>P.map(([x,z])=>onCT(s,x,z))) : null;
      return { x0:+(X-hole.w/2).toFixed(4), x1:+(X+hole.w/2).toFixed(4), z0:+(Z-hole.d/2).toFixed(4), z1:+(Z+hole.d/2).toFixed(4), mount:hole.mount, r:hole.r||0, ...(paths?{paths}:{}), name:itemDef(s.k).name }; }).filter(Boolean)
      .filter(hh=>hh.x0>=-0.01 && hh.x1<=ct.w+0.01 && hh.z0>=-0.01 && hh.z1<=ct.d+0.01);
    if(!ct.sinks.length) delete ct.sinks;
  });
}
/* after every change: kitchens fit themselves, the items that moved are drawn again, then it's saved */
function fitKitchen(){
  const L=list(), before=new Map(L.map(o=>[o.id, JSON.stringify(o)]));
  try{ fitSinks(); fitCounters(); }catch(e){ console.warn('kitchen fit', e); }
  return L.filter(o=>before.get(o.id)!==JSON.stringify(o)).map(o=>o.id);
}
/* anything placed changed: fit the kitchen, save, and tell whoever listens (build.js redraws the walls when the
   plugs a bed, desk or fridge brings with it have moved) */
let changeHook=null; const onFurnChanged = f => { changeHook=f; };
function changed(){ const moved=fitKitchen(); save(); if(group) moved.forEach(id=>refreshItem(byId(id))); changeHook?.(); }

/* ---------------------------------------------------------------- sinks and windows
   Home frame (feet, as the walls are drawn: slot.p0, slot.n) ⇄ a pod's own frame (the furniture's u, v). */
function homeToPod(pod, x, z){ const f=frames[pod], hg=group?.parent; if(!f || !hg){ return null; } let R=f; while(R.parent) R=R.parent; R.updateMatrixWorld(true);
  const l=f.worldToLocal(hg.localToWorld(new THREE.Vector3(x,0,z))); return { u:l.x, v:l.z }; }
function podToHome(pod, u, v){ const f=frames[pod], hg=group?.parent; if(!f || !hg) return null; let R=f; while(R.parent) R=R.parent; R.updateMatrixWorld(true);
  const w=hg.worldToLocal(f.localToWorld(new THREE.Vector3(u,0,v))); return { x:w.x, z:w.z }; }
/* the windows in a wall, with their middles in the home frame */
function windowsIn(slotId){
  const s=slotsFor(state.model).find(q=>q.id===slotId); if(!s) return [];
  const w=bodyWall(s, pickFor(s)); if(!w) return [];
  const r=[s.n[1],-s.n[0]], tl=w.trim?.[0]||0;
  return (w.openings||[]).filter(o=>o.kind==='window').map(o=>{ const t=(o.x+o.w/2+tl)/FT; return { o, s, x:s.p0[0]+r[0]*t, z:s.p0[1]+r[1]*t }; });
}
/* the middle of a docked sink's hole, or of the sink base, in the pod frame */
function sinkMiddle(cab){
  const sk=list().find(s=>s.dock?.cab===cab.id), hole=sk && sinkHole(sk);
  if(sk && hole) return { sink:sk, ...toPod(sk, (hole.cx||0)/FT, (sk.d/2+(hole.cz||0))/FT) };
  return { sink:null, ...toPod(cab, 0, cab.d/2/FT) };
}
/* the base cabinets in a row with this one (same wall line, butted within ½″), left to right in its frame */
function rowOf(cab){
  const line=list().filter(o=>o.pod===cab.pod && sameA(o.a,cab.a) && !o.dock && itemDef(o.k)?.cat!=='counter' && itemDef(o.k)?.cat!=='upper').map(o=>{
    const c=toItem(cab, o.u, o.v); return { o, z:c.z, x0:c.x-o.w/2/FT, x1:c.x+o.w/2/FT }; }).filter(r=>Math.abs(r.z)<4/FT).sort((a,b)=>a.x0-b.x0);
  const i=line.findIndex(r=>r.o.id===cab.id); if(i<0) return [];
  let a=i, b=i; while(a>0 && line[a-1].x1>=line[a].x0-0.5/FT) a--; while(b<line.length-1 && line[b+1].x0<=line[b].x1+0.5/FT) b++;
  return line.slice(a, b+1);
}
/* slide a sink base (and the cabinets butted to it) along its wall so its sink sits under the middle of the window
   above. Returns { ok, moved (in), wanted (in), why } */
function centreUnderWindow(id){
  const cab=byId(id); if(!cab) return { ok:false, why:'No cabinet.' };
  if(!cab.wall) return { ok:false, why:'This cabinet isn’t backed onto a wall.' };
  const W=windowsIn(cab.wall); if(!W.length) return { ok:false, why:'There’s no window in the wall behind it.' };
  const m=sinkMiddle(cab), mx=toItem(cab, m.u, m.v).x;
  const pick=W.map(w=>{ const p=homeToPod(cab.pod, w.x, w.z); return p && { w, x:toItem(cab, p.u, p.v).x }; }).filter(Boolean).sort((a,b)=>Math.abs(a.x-mx)-Math.abs(b.x-mx))[0];
  if(!pick) return { ok:false, why:'Couldn’t place the window.' };
  const want=pick.x-mx; if(Math.abs(want)<0.01/FT) return { ok:true, moved:0, wanted:0 };
  const row=rowOf(cab); if(!row.length) return { ok:false, why:'Couldn’t find the cabinet row.' };
  const room = want<0 ? roomBeyond(row[0].o,'L') : roomBeyond(row[row.length-1].o,'R');
  const d=Math.sign(want)*Math.min(Math.abs(want), Math.max(0, room));
  checkpoint(); ensureDraft();
  const p0=toPod(cab,0,0), p1=toPod(cab,d,0), du=p1.u-p0.u, dv=p1.v-p0.v;
  row.forEach(r=>{ const o=byId(r.o.id); o.u+=du; o.v+=dv; });
  changed();
  return { ok:true, moved:+(d*FT).toFixed(3), wanted:+(want*FT).toFixed(3) };
}
/* where a sink would put the middle of a window in a wall: the sinks / sink bases backed onto it, nearest first:
   [{ t (in, along the wall from its left end seen from outside, before its trims), name }] */
function sinksOnWall(slotId){
  const s=slotsFor(state.model).find(q=>q.id===slotId); if(!s) return [];
  const r=[s.n[1],-s.n[0]];
  return list().filter(o=>o.wall===slotId && itemDef(o.k)?.cat==='base' && (o.k==='BS' || list().some(x=>x.dock?.cab===o.id))).map(cab=>{
    const m=sinkMiddle(cab), h=podToHome(cab.pod, m.u, m.v); if(!h) return null;
    return { t:((h.x-s.p0[0])*r[0]+(h.z-s.p0[1])*r[1])*FT, name:m.sink ? itemDef(m.sink.k).name : itemDef(cab.k).name }; }).filter(Boolean);
}

/* ---------------------------------------------------------------- edits */
function addItem(k, at){ checkpoint(); ensureDraft(); const it={ id:newId(), ...newItem(k), ...at }; delete it.free; list().push(it);
  const cat=itemDef(k)?.cat; if(cat && state.show['cw-'+cat]===false){ state.show['cw-'+cat]=true; import('./layers.js').then(m=>m.renderLayers?.()).catch(()=>{}); }   // dragged in while its layer was off: switch it on
  changed(); return it; }
function updateItem(id, patch){ checkpoint(); ensureDraft(); const it=byId(id); if(!it) return null; Object.assign(it, patch); delete it.free; changed(); return it; }
function removeItem(id){ checkpoint(); ensureDraft(); const L=list(), i=L.findIndex(f=>f.id===id); if(i>=0) L.splice(i,1); if(state.selFurn===id) state.selFurn=null; changed(); }
function duplicateItem(id){ checkpoint(); ensureDraft(); const it=byId(id); if(!it) return null; const c={...JSON.parse(JSON.stringify(it)), id:newId()};
  const r=(c.a||0)*Math.PI/180; c.u+=Math.cos(r)*c.w/FT; c.v-=Math.sin(r)*c.w/FT; list().push(c); changed(); return c; }
function turnItem(id, dir=1){ checkpoint(); ensureDraft(); const it=byId(id); if(!it) return; const c=centreOf(it), a=norm180((it.a||0)-90*dir); Object.assign(it, settle(it, { ...poseAbout(it, c, a), a })); changed(); }
/* when a pod goes, its items go with it; later pods move down one */
function podRemoved(k, i){ const L=list(k); for(let j=L.length-1;j>=0;j--){ if(L[j].pod===i) L.splice(j,1); else if(L[j].pod>i) L[j].pod--; } }
/* deepest unit on each wall (inches), for the pot-light rule */
const DEPTH_CATS=new Set(['base','upper','tall','linen','wardrobe','vanity','appliance','fire']);
function wallDepths(k=state.model){ const out={}; list(k).forEach(it=>{ if(it.wall && DEPTH_CATS.has(itemDef(it.k)?.cat)) out[it.wall]=Math.max(out[it.wall]||0, it.d); }); return out; }

const podsShown = () => lastPods;
export { onFurnChanged, centreUnderWindow, sinksOnWall, windowsIn, fitBaseToSink, dockAt, turnStart, turnTo, freeSpot, clash, setWalls, handleMeshes, roomBeyond, stretchTo, updateHandles, onFurnApplied, setCabExplode, resetCabExplode, cabExploded, explodeFurniture, furnHolder, podsShown, showFurnGhost, hideFurnGhost, setHolderVisible, list as furnitureOf, byId as furnById, buildFurniture, refreshItem, applyFurniture, furnMeshes, snap, podAt, addItem, updateItem, removeItem, duplicateItem, turnItem, podRemoved, wallDepths, shownCat, CATS as FURN_CATS , cabExplodeGoal , rotXZ, groupMembers, makeGroup, ungroup, relinkGroup, renameGroup, setGroupFrom, removeGroup, setMany, moveHolder, groupRecipe, placeRecipe, addRecipe };
