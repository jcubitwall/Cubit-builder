/* Cubit Builder — shapes.js : the Shape library (drawn in the Shape studio) and how a placed shape becomes cuts.

   A shape: { id 'SH-nn', name, contours:[ geom2d contour + { cut:'thru'|'pocket', depth, name } ], w, h }
   Shared by the team through functions/api/shapes.js (R2 shapes/index.json); this browser's own when offline.

   Placed on a wall or a floor / ceiling / roof it is a copy (so a later change in the library never moves a
   panel that's already made): { kind:'shape', ref, name, geo:[contours], x, y, w, h, mx, my, face }
     walls:  x, y = the lower-left corner of its box, inches from the left end seen from OUTSIDE and from the floor;
             face 'outside' | 'inside' = the face its pockets are cut from; mx / my mirror it as seen from outside
     layers: x, z = the corner of its box, x along the pod, z across (as seen from above, z down the plan);
             face 'top' | 'bottom'; mx / my as seen from above
   expand*() turn it into the ordinary cuts the 3D view, the sheets and the G-code already know: exact outlines
   ('poly' + path) with the bit's paths worked out (tool rings), through cuts as openings / holes, pockets as face
   cuts with their depth. A pocket as deep as the panel is a through cut. */
import { canSave } from './role.js';
import { flatten, bbox, bboxAll, mirrorAll, normalize, toolRings, area } from './geom2d.js';

const SHAPELIB=[];
const KEY='cubit-shapes';
let remote=false;
async function loadShapes(){
  SHAPELIB.length=0;
  try{ const r=await fetch('api/shapes',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ (await r.json()).forEach(s=>SHAPELIB.push({...s, src:'team'})); remote=true; } }catch(e){}
  try{ JSON.parse(localStorage.getItem(KEY)||'[]').forEach(s=>{ if(!SHAPELIB.find(x=>x.id===s.id)) SHAPELIB.push({...s, src:'saved'}); }); }catch(e){}
  return SHAPELIB;
}
const shapeById = id => SHAPELIB.find(s=>s.id===id);
const nextShapeId = () => { let n=1; while(SHAPELIB.some(s=>s.id===`SH-${String(n).padStart(2,'0')}`)) n++; return `SH-${String(n).padStart(2,'0')}`; };
function keepLocal(){ try{ localStorage.setItem(KEY, JSON.stringify(SHAPELIB.filter(s=>s.src==='saved'))); }catch(e){} }
async function saveShape(shape){
  if(!canSave()) throw new Error('Viewers can look but not save.');
  const s=JSON.parse(JSON.stringify(shape)); delete s.src;
  const B=boxOf(s); s.w=+B.w.toFixed(4); s.h=+B.h.toFixed(4);
  let shared=false;
  if(remote){ const r=await fetch('api/shapes',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'save', shape:s})});
    const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); shared=true; }
  const i=SHAPELIB.findIndex(x=>x.id===s.id), e={...s, src:shared?'team':'saved'}; if(i>=0) SHAPELIB[i]=e; else SHAPELIB.push(e);
  if(!shared) keepLocal();
  window.dispatchEvent(new Event('cubit:shapes'));
  return { shape:e, shared };
}
async function deleteShape(id){
  if(remote){ const r=await fetch('api/shapes',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'delete', id})}); if(!r.ok){ const o=await r.json().catch(()=>({})); throw new Error(o.error||`Server said ${r.status}`); } }
  const i=SHAPELIB.findIndex(x=>x.id===id); if(i>=0) SHAPELIB.splice(i,1); keepLocal(); window.dispatchEvent(new Event('cubit:shapes'));
}
const sharedShapes = () => remote;

/* the box round what a shape cuts: its regions (Shapr3D-style sketches), else its outlines (the first drawings) */
function boxOf(s){ if(s.regs?.length) return bbox(s.regs.flatMap(r=>r.outer)); return bboxAll(s.contours||[]); }
/* a library shape → an item to place (a copy of what it cuts, lower-left at 0,0) */
function placeItem(shape){
  const B=boxOf(shape), m=P=>P.map(([x,y])=>[+(x-B.x0).toFixed(4), +(y-B.y0).toFixed(4)]);
  const base={ kind:'shape', ref:shape.id, name:shape.name, w:+B.w.toFixed(4), h:+B.h.toFixed(4), mx:false, my:false };
  if(shape.regs?.length) return { ...base, regs:shape.regs.map(r=>({ outer:m(r.outer), holes:(r.holes||[]).map(m), cut:r.cut, depth:r.depth, name:r.name||'' })) };
  return { ...base, geo:normalize(shape.contours) };
}
/* the item's regions as outlines (+ islands), lower-left of its box at 0,0, mirrored as asked (y up) */
function regionsOf(it){
  if(it.regs){ const f=P=>P.map(([x,y])=>[it.mx?it.w-x:x, it.my?it.h-y:y]);
    return it.regs.filter(r=>r.cut==='thru'||r.cut==='pocket').map(r=>({ pts:f(r.outer), holes:(r.holes||[]).map(f), cut:r.cut, depth:+r.depth||0, name:r.name||'' })); }
  const geo=normalize(mirrorAll(it.geo||[], !!it.mx, !!it.my));
  return geo.filter(c=>(c.kind==='circle' || c.closed) && c.cut!=='none').map(c=>({ pts:flatten(c, 0.005), holes:[], cut:c.cut||'pocket', depth:+c.depth||0, name:c.name||'' }));
}
const isThru = (r, t) => r.cut==='thru' || r.depth>=t-0.0625;
const bb = pts => { let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; pts.forEach(([x,y])=>{ x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y); }); return {x0,y0,x1,y1}; };
const r4 = v => +v.toFixed(4);
/* a wall's shapes → { openings:[…], outside:[…], inside:[…] } in the wall's own conventions (L = wall length, inches) */
function expandWallShapes(w){
  const out={ openings:[], outside:[], inside:[] }, t=+(w.t||6.5), L=w.len*12;
  (w.shapes||[]).forEach((it,si)=>{
    regionsOf(it).forEach((r,ri)=>{
      const mv=P=>P.map(([x,y])=>[r4(it.x+x), r4(it.y+y)]), pts=mv(r.pts), isl=r.holes.map(mv), B=bb(pts), key=`shape${si}.${ri}`, nm=r.name||it.name||'shape';
      if(isThru(r,t)){ out.openings.push({ kind:'shape', shape:'poly', name:nm, path:pts, ...(isl.length?{islands:isl}:{}), tool:toolRings([pts,...isl],true), x:r4(B.x0), y:r4(B.y0), w:r4(B.x1-B.x0), h:r4(B.y1-B.y0), key }); return; }
      const inside=it.face==='inside', fl=P=>inside ? P.map(([x,y])=>[r4(L-x),y]) : P, P=fl(pts), I=isl.map(fl), Q=bb(P);
      (inside?out.inside:out.outside).push({ kind:'pocket', shape:'poly', name:nm, path:P, ...(I.length?{islands:I}:{}), tool:toolRings([P,...I],false), depth:r.depth, x:r4((Q.x0+Q.x1)/2), y:r4((Q.y0+Q.y1)/2), w:r4(Q.x1-Q.x0), h:r4(Q.y1-Q.y0), key });
    });
  });
  return out;
}
/* a floor / ceiling / roof's shapes → holes in layer coords (x along, z across; the drawing's y up = −z) */
function expandLayerShapes(L){
  const out=[], t=+(L.t||4.5);
  (L.shapes||[]).forEach((it,si)=>{
    regionsOf(it).forEach((r,ri)=>{
      const mv=P=>P.map(([x,y])=>[r4(it.x+x), r4(it.z+(it.h-y))]), pts=mv(r.pts), isl=r.holes.map(mv), B=bb(pts);
      const h={ shape:'poly', name:r.name||it.name||'shape', path:pts, ...(isl.length?{islands:isl}:{}), x:r4(B.x0), z:r4(B.y0), w:r4(B.x1-B.x0), d:r4(B.y1-B.y0), key:`shape${si}.${ri}` };
      if(!isThru(r,t)){ h.depth=r.depth; h.face=it.face==='bottom'?'bottom':'top'; }
      h.tool=toolRings([pts,...isl], isThru(r,t));
      out.push(h);
    });
  });
  return out;
}
/* a small picture of a library shape */
function shapeThumb(s, px=48){
  const regs = s.regs?.length ? s.regs : (s.contours||[]).filter(c=>(c.kind==='circle'||c.closed) && c.cut!=='none').map(c=>({outer:flatten(c,0.05), holes:[], cut:c.cut||'pocket'}));
  const pts=regs.flatMap(r=>r.outer); if(!pts.length) return `<svg width="${px}" height="${px}"></svg>`;
  const B=bbox(pts), k=(px-4)/Math.max(B.w,B.h,1), d=P=>'M'+P.map(([x,y])=>`${((x-B.x0)*k).toFixed(1)} ${(px-4-(y-B.y0)*k).toFixed(1)}`).join('L')+'Z';
  return `<svg viewBox="-2 -2 ${px} ${px}" width="${px}" height="${px}" aria-hidden="true">${regs.map(r=>`<path d="${[r.outer,...(r.holes||[])].map(d).join(' ')}" fill-rule="evenodd" class="${r.cut==='thru'?'th':'pk'}"/>`).join('')}</svg>`;
}
export { shapeThumb, SHAPELIB, loadShapes, shapeById, nextShapeId, saveShape, deleteShape, sharedShapes, placeItem, regionsOf, expandWallShapes, expandLayerShapes };
