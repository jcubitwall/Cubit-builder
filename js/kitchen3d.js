/* Cubit Builder — kitchen3d.js : a saved kitchen (a cabinet group) as one 3D group, and its picture for the
   Library cards and the Build tray.
   A kitchen is a recipe: each item with its place off the first item (rx, rz in feet, ra a turn in degrees).
   kitchenModel builds every cabinet with the Library's own model, set where the recipe puts it, so the 3D view and
   the picture match what drops into a home. The pictures are drawn once in a small off-screen renderer and kept. */
import { itemModel } from './casework3d.js';
import { rotXZ } from './furniture.js';

const FT = 12;
/* → THREE.Group in feet, floor at y 0, centred on the kitchen's footprint; userData.parts = the cabinets (for exploding) */
function kitchenModel(items){
  const g=new THREE.Group(), parts=[];
  (items||[]).forEach(r=>{
    let m; try{ m=itemModel(r, { edges:true }); }catch(e){ return; }
    const holder=new THREE.Group(), sc=new THREE.Group();
    m.group.position.set(-r.w/2, r.y||0, 0); sc.scale.setScalar(1/FT); sc.add(m.group); holder.add(sc);
    holder.position.set(r.rx||0, 0, r.rz||0); holder.rotation.y=(r.ra||0)*Math.PI/180;
    g.add(holder); parts.push(holder); });
  const box=new THREE.Box3().setFromObject(g);
  if(!box.isEmpty()){ const c=box.getCenter(new THREE.Vector3()); g.children.forEach(h=>{ h.position.x-=c.x; h.position.z-=c.z; }); }
  // turned so the fronts face the way the Library looks at a cabinet (from -z)
  const out=new THREE.Group(); g.rotation.y=Math.PI; out.add(g); out.userData.parts=parts;
  return out;
}
/* a home's group as a recipe (same shape as a saved kitchen's items) */
function recipeOf(members){
  const a=members.find(o=>o.wall)||members[0]; if(!a) return [];
  return members.map(it=>{ const [x,z]=rotXZ(it.u-a.u, it.v-a.v, -(a.a||0)); return { ...it, rx:x, rz:z, ra:(((it.a||0)-(a.a||0))%360+360)%360 }; });
}

/* ---------------------------------------------------------------- pictures */
let R=null, scene=null, cam=null;
const cache=new Map();
function ensure(){
  if(R) return true;
  try{ R=new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true }); }catch(e){ return false; }
  R.setPixelRatio(1); R.setSize(320, 220, false); R.setClearColor(0x000000, 0);
  scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8577, 0.8));
  const sun=new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(20,40,30); scene.add(sun);
  const back=new THREE.DirectionalLight(0xffffff, 0.3); back.position.set(-25,20,-30); scene.add(back);
  cam=new THREE.PerspectiveCamera(30, 320/220, 0.1, 400);
  return true;
}
const sig = (key, items) => key+'|'+items.length+'|'+JSON.stringify(items).length;
/* → a PNG data URL of the kitchen seen from the front, a little from above (or '' when there's no WebGL) */
function kitchenPicture(key, items){
  const s=sig(key, items||[]); if(cache.has(s)) return cache.get(s);
  if(!items?.length || !ensure()){ cache.set(s,''); return ''; }
  const g=kitchenModel(items); scene.add(g);
  // from the front, a little to the right and above
  const box=new THREE.Box3().setFromObject(g), size=box.getSize(new THREE.Vector3()), c=box.getCenter(new THREE.Vector3());
  const r=Math.max(size.x, size.y*1.3, size.z)*0.5+0.3, d=r/Math.tan(15*Math.PI/180)*0.82;
  const dir=new THREE.Vector3(0.55, 0.45, -1).normalize();
  cam.position.copy(c).addScaledVector(dir, d); cam.lookAt(c); cam.updateProjectionMatrix();
  let url=''; try{ R.render(scene, cam); url=R.domElement.toDataURL('image/png'); }catch(e){}
  scene.remove(g); g.traverse(o=>{ o.geometry?.dispose?.(); });
  cache.set(s, url); return url;
}
export { kitchenModel, kitchenPicture, recipeOf };
