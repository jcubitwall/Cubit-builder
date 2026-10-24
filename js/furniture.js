/* Cubit Builder — furniture.js : cabinets, appliances and furniture placed in a home.

   Kept per home in state.furniture[home] = [{ id, k, w, h, d, y, opt, pod, u, v, a, wall }]:
     pod      the pod it stands in (so it moves and turns with the pod)
     u, v     feet, in the pod's own unturned frame (u along the pod, v across its 8′), the middle of the item's back
     a        degrees the item is turned in that frame (0 = its front faces +v)
     wall     the wall it's backed against (slot id), used for the pot-light rule (deepest unit per wall)
   Every category has its own switch in Layers (state.show['cw-<cat>']). */
import { state, save } from './state.js';
import { checkpoint } from './history.js';
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
  frames=pods.map(p=>{ const f=podFrame(p); group.add(f); return f; });
  const L=list();
  for(let i=L.length-1;i>=0;i--) if(!frames[L[i].pod] || !itemDef(L[i].k)) L.splice(i,1);
  L.forEach(it=>place(it));
  applyFurniture();
  return group;
}
function place(it){
  const f=frames[it.pod]; if(!f) return null;
  const m=itemModel(it, { edges:true, tenons:false });
  const holder=new THREE.Group(); holder.userData={ furn:it.id, cat:itemDef(it.k).cat };
  m.group.position.set(-it.w/2, it.y||0, 0); m.group.scale.setScalar(1);
  const sc=new THREE.Group(); sc.scale.setScalar(1/FT); sc.add(m.group); holder.add(sc);
  holder.position.set(it.u, 0, it.v); holder.rotation.y=(it.a||0)*Math.PI/180;
  holder.traverse(o=>{ if(o.isMesh){ o.userData.furn=it.id; } });
  f.add(holder); models.set(it.id, {holder, m});
  return holder;
}
function refreshItem(it){ const old=models.get(it.id); if(old) old.holder.parent?.remove(old.holder); place(it); applyFurniture(); }
function applyFurniture(){
  if(!group) return;
  const F=state.focusPod;
  models.forEach(({holder, m},id)=>{ const it=byId(id); holder.visible = !!it && shownCat(holder.userData.cat) && (F==null || it.pod===F) && !state.isolate;
    m.select(null);
    if(state.selFurn===id) m.meshes.forEach(x=>{ x.material = x.material.clone(); x.material.emissive?.set(0x6a2a08); }); });
}
const furnMeshes = () => { const out=[]; models.forEach(({holder})=>{ if(holder.visible) holder.traverse(o=>{ if(o.isMesh) out.push(o); }); }); return out; };

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
  return { pod:p.i, u: ax[0]? ux : u0, v: ax[1]? vz : v0, a, wall: best.slot||null };
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
function addItem(k, at){ checkpoint(); const it={ id:newId(), ...newItem(k), ...at }; delete it.free; list().push(it); save(); return it; }
function updateItem(id, patch){ checkpoint(); const it=byId(id); if(!it) return null; Object.assign(it, patch); delete it.free; save(); return it; }
function removeItem(id){ checkpoint(); const L=list(), i=L.findIndex(f=>f.id===id); if(i>=0) L.splice(i,1); if(state.selFurn===id) state.selFurn=null; save(); }
function duplicateItem(id){ checkpoint(); const it=byId(id); if(!it) return null; const c={...JSON.parse(JSON.stringify(it)), id:newId()};
  const r=(c.a||0)*Math.PI/180; c.u+=Math.cos(r)*c.w/FT; c.v-=Math.sin(r)*c.w/FT; list().push(c); save(); return c; }
function turnItem(id, dir=1){ checkpoint(); const it=byId(id); if(!it) return; it.a=(((it.a||0)-90*dir)%360+360)%360; if(it.a>180) it.a-=360; it.wall=null; save(); }
/* when a pod goes, its items go with it; later pods move down one */
function podRemoved(k, i){ const L=list(k); for(let j=L.length-1;j>=0;j--){ if(L[j].pod===i) L.splice(j,1); else if(L[j].pod>i) L[j].pod--; } }
/* deepest unit on each wall (inches), for the pot-light rule */
const DEPTH_CATS=new Set(['base','upper','tall','linen','wardrobe','vanity','appliance','fire']);
function wallDepths(k=state.model){ const out={}; list(k).forEach(it=>{ if(it.wall && DEPTH_CATS.has(itemDef(it.k)?.cat)) out[it.wall]=Math.max(out[it.wall]||0, it.d); }); return out; }

const podsShown = () => lastPods;
export { podsShown, showFurnGhost, hideFurnGhost, setHolderVisible, list as furnitureOf, byId as furnById, buildFurniture, refreshItem, applyFurniture, furnMeshes, snap, podAt, addItem, updateItem, removeItem, duplicateItem, turnItem, podRemoved, wallDepths, shownCat, CATS as FURN_CATS };
