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
import { itemDef, newItem, CATS } from './casework.js';
import { itemModel } from './casework3d.js';

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
let afterApply=null; const onFurnApplied = fn => { afterApply=fn; };
function applyFurniture(){
  if(!group) return;
  const F=state.focusPod;
  models.forEach(({holder, m},id)=>{ const it=byId(id); holder.visible = !!it && (state.isolate ? isoMine(id) : shownCat(holder.userData.cat) && (F==null || it.pod===F));
    m.select(null);
    if(state.selFurn===id && !state.isolate) m.meshes.forEach(x=>{ x.material = x.material.clone(); x.material.emissive?.set(0x6a2a08); }); });
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
function setCabExplode(on){
  cabGoal=on?1:0; cancelAnimationFrame(cabRaf);
  const step=()=>{ cabT+=(cabGoal-cabT)*0.15; if(Math.abs(cabGoal-cabT)<0.002) cabT=cabGoal;
    models.forEach(({m},id)=>{ if(isoMine(id)) m.explode(cabT); }); if(cabT!==cabGoal) cabRaf=requestAnimationFrame(step); };
  step();
}
function resetCabExplode(){ cancelAnimationFrame(cabRaf); cabT=cabGoal=0; models.forEach(({m})=>m.explode(0)); }
const cabExploded = () => cabGoal>0.5;
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
function snap(it, pt, wallGroups, homeGroup, keepA=null){
  const p=podAt(pt,lastPods); if(!p || !frames[p.i]) return null;
  const f=frames[p.i]; f.updateMatrixWorld(true);
  const W=wallMeshes(wallGroups), world=homeGroup.localToWorld(pt.clone());
  const local=f.worldToLocal(world.clone());
  const dirs=[[0,-1,0],[0,1,180],[-1,0,90],[1,0,-90]];   // toward the wall: -v (item faces +v, a=0), +v, -u, +u
  const reach=(it.d/FT)+1.6;
  let best=null;
  const cast=(o,d,h)=>{ const wo=f.localToWorld(new THREE.Vector3(o.x,h,o.z)), wd=f.localToWorld(new THREE.Vector3(o.x+d[0],h,o.z+d[1])).sub(wo).normalize();
    ray.set(wo,wd); ray.far=40; const hit=ray.intersectObjects(W,false)[0]; if(!hit) return null; return { dist:hit.distance, slot:hit.object.userData.slotId }; };
  const hh=[Math.max(0.5,(it.y+Math.min(it.h,24)/2)/FT), 0.6];
  dirs.forEach(([du,dv,a])=>{ for(const h of hh){ const c=cast({x:local.x,z:local.z},[du,dv],h); if(c && c.dist<reach && (!best || c.dist<best.dist)) best={...c, du, dv, a}; } });
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
  if(!it || !d || d.fixed || state.isolate || !frames[it.pod] || !models.get(it.id)?.holder.visible) return;
  handleGroup=new THREE.Group(); handleGroup.userData.noGhost=true;
  const mat=new THREE.MeshBasicMaterial({ map:arrowTexture(), transparent:true, depthTest:false, side:THREE.DoubleSide });
  const top=((it.y||0)+it.h)/FT+0.05, hw=it.w/2/FT, dd=it.d/FT, s=Math.max(0.5, Math.min(0.9, Math.min(it.w,it.d)/FT*0.55));
  Object.keys(SIDES).forEach(side=>{
    if(side==='B' && it.wall) return;                         // backed onto a wall
    if(roomBeyond(it, side) < 0.3/FT) return;                  // already up against something: no arrow that way
    const [ox,oz]=SIDES[side], lx = ox ? ox*(hw+s*0.55) : 0, lz = ox ? dd/2 : (oz>0 ? dd+s*0.55 : -s*0.55);
    const p=toPod(it,lx,lz), m=new THREE.Mesh(new THREE.PlaneGeometry(s,s), mat);
    m.rotation.order='YXZ'; m.rotation.y=(it.a||0)*Math.PI/180 + (oz ? Math.PI/2 : 0); m.rotation.x=-Math.PI/2;
    m.position.set(p.u, top, p.v); m.renderOrder=30; m.userData={ handle:side, furn:it.id, noGhost:true };
    handleGroup.add(m); });
  frames[it.pod].add(handleGroup);
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
/* ---------------------------------------------------------------- the ghost while dragging */
let fg=null;
function showFurnGhost(it, at){
  const f=frames[at.pod]; if(!f){ hideFurnGhost(); return; }
  if(!fg){ fg=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0x2e9e5b, transparent:true, opacity:0.4, depthTest:false}));
    fg.renderOrder=20; const e=new THREE.LineSegments(new THREE.EdgesGeometry(fg.geometry), new THREE.LineBasicMaterial({color:0x1c211e, depthTest:false})); e.renderOrder=21; fg.add(e); }
  if(fg.parent!==f) f.add(fg);
  const r=(at.a||0)*Math.PI/180, h=Math.max(0.3, it.h/FT);
  fg.visible=true; fg.rotation.y=r; fg.scale.set(it.w/FT, h, it.d/FT);
  fg.position.set(at.u+Math.sin(r)*it.d/2/FT, (it.y||0)/FT+h/2, at.v+Math.cos(r)*it.d/2/FT);
}
const hideFurnGhost = () => { if(fg) fg.visible=false; };
const setHolderVisible = (id, v) => { const m=models.get(id); if(m) m.holder.visible = v && shownCat(m.holder.userData.cat); };

/* ---------------------------------------------------------------- edits */
function addItem(k, at){ checkpoint(); ensureDraft(); const it={ id:newId(), ...newItem(k), ...at }; delete it.free; list().push(it); save(); return it; }
function updateItem(id, patch){ checkpoint(); ensureDraft(); const it=byId(id); if(!it) return null; Object.assign(it, patch); delete it.free; save(); return it; }
function removeItem(id){ checkpoint(); ensureDraft(); const L=list(), i=L.findIndex(f=>f.id===id); if(i>=0) L.splice(i,1); if(state.selFurn===id) state.selFurn=null; save(); }
function duplicateItem(id){ checkpoint(); ensureDraft(); const it=byId(id); if(!it) return null; const c={...JSON.parse(JSON.stringify(it)), id:newId()};
  const r=(c.a||0)*Math.PI/180; c.u+=Math.cos(r)*c.w/FT; c.v-=Math.sin(r)*c.w/FT; list().push(c); save(); return c; }
function turnItem(id, dir=1){ checkpoint(); ensureDraft(); const it=byId(id); if(!it) return; it.a=(((it.a||0)-90*dir)%360+360)%360; if(it.a>180) it.a-=360; it.wall=null; save(); }
/* when a pod goes, its items go with it; later pods move down one */
function podRemoved(k, i){ const L=list(k); for(let j=L.length-1;j>=0;j--){ if(L[j].pod===i) L.splice(j,1); else if(L[j].pod>i) L[j].pod--; } }
/* deepest unit on each wall (inches), for the pot-light rule */
const DEPTH_CATS=new Set(['base','upper','tall','linen','wardrobe','vanity','appliance','fire']);
function wallDepths(k=state.model){ const out={}; list(k).forEach(it=>{ if(it.wall && DEPTH_CATS.has(itemDef(it.k)?.cat)) out[it.wall]=Math.max(out[it.wall]||0, it.d); }); return out; }

const podsShown = () => lastPods;
export { freeSpot, clash, setWalls, handleMeshes, roomBeyond, stretchTo, updateHandles, onFurnApplied, setCabExplode, resetCabExplode, cabExploded, explodeFurniture, furnHolder, podsShown, showFurnGhost, hideFurnGhost, setHolderVisible, list as furnitureOf, byId as furnById, buildFurniture, refreshItem, applyFurniture, furnMeshes, snap, podAt, addItem, updateItem, removeItem, duplicateItem, turnItem, podRemoved, wallDepths, shownCat, CATS as FURN_CATS };
