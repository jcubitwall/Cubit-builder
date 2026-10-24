/* Cubit Builder — pods.js : editing the pods in a home, and the pod library.

   A pod in a home: { t, x, z, rot, src?, walls?, layers?, a? }
     rot     0 / 90 / 180 / 270, clockwise seen from above
     src     the library pod it came from (data/pods.json or saved in this browser)
     walls   its own walls, in the pod's own frame: { S:[{from,len,type,wall,face?}], E:[…], N:[…], W:[…] }
             `from` = feet from the left end of that side seen from outside, so turning the pod changes nothing
     layers  { 'floor-ext': id, 'floor-int': id, 'ceiling-int': id, 'roof': id }
     a       which of its own sides is Wall A, when that was set by hand

   Before a pod is moved, turned, replaced or deleted, every pod in the home is "baked": the walls and
   layers on screen are written onto the pods themselves, so they travel with their pod. Wall choices made
   by slot (state.picks / models.json picks) are then cleared for that home.

   Pods sit on the 8′ grid: they dock flush end to end, or side by side in 8′ steps. Two pods must share
   at least 8′ of wall, may not overlap, and the ¾″ space at every joint is added by layout.js. */
import { POD, LAYER_KINDS } from './config.js';
import { checkpoint } from './history.js';
import { podRemoved } from './furniture.js';
import { MODELS, LIB, LAYERLIB, PODLIB, byId, podById, deckById, DECKLIB, layerById, saveCustomModels, savePodLib, saveWallLib, saveLayerLib } from './data.js';
import { slotsFor, layerSlotsFor, podList, localSide } from './layout.js';
import { state, save, pickFor, pickLayer } from './state.js';

const clone = o => JSON.parse(JSON.stringify(o));
const SIDES = ['S','E','N','W'];

/* ---------------------------------------------------------------- footprints + docking rules */
const foot = p => { const len=POD[p.t].len, r=((p.rot||0)%360+360)%360; return r%180===0 ? {x:p.x, z:p.z, w:len, d:8} : {x:p.x, z:p.z, w:8, d:len}; };
const overlaps = (a,b) => a.x < b.x+b.w-1e-6 && b.x < a.x+a.w-1e-6 && a.z < b.z+b.d-1e-6 && b.z < a.z+a.d-1e-6;
const shared = (a,b) => {
  if(Math.abs(a.x+a.w-b.x)<1e-6 || Math.abs(b.x+b.w-a.x)<1e-6) return Math.min(a.z+a.d,b.z+b.d)-Math.max(a.z,b.z);
  if(Math.abs(a.z+a.d-b.z)<1e-6 || Math.abs(b.z+b.d-a.z)<1e-6) return Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
  return 0;
};
const onGrid = f => [f.x,f.z].every(v=>Math.abs(v/8-Math.round(v/8))<1e-6);
/* decks: footprint from the deck library; the ledger is the deck's own S side (faces S/E/N/W at rot 0/90/180/270) */
const deckFoot = d => { const L=deckById(d.lib)||{W:96,D:96}, r=((d.rot||0)%360+360)%360; const w=(r%180===0?L.W:L.D)/12, dd=(r%180===0?L.D:L.W)/12; return {x:d.x, z:d.z, w, d:dd, rot:r}; };
const LEDGER = {0:'S', 90:'E', 180:'N', 270:'W'};
/* a deck docks with its ledger flush against a pod or another deck, lined up on the 8′ steps of that side */
function deckDocked(f, others){
  const side=LEDGER[f.rot], E=1e-6;
  return others.some(o=>{
    let touch, a0, a1, b0, b1;
    if(side==='S'){ touch=Math.abs(o.z+o.d-f.z)<E; a0=f.x; a1=f.x+f.w; b0=o.x; b1=o.x+o.w; }
    if(side==='N'){ touch=Math.abs(o.z-(f.z+f.d))<E; a0=f.x; a1=f.x+f.w; b0=o.x; b1=o.x+o.w; }
    if(side==='W'){ touch=Math.abs(o.x+o.w-f.x)<E; a0=f.z; a1=f.z+f.d; b0=o.z; b1=o.z+o.d; }
    if(side==='E'){ touch=Math.abs(o.x-(f.x+f.w))<E; a0=f.z; a1=f.z+f.d; b0=o.z; b1=o.z+o.d; }
    if(!touch) return false;
    const ov=Math.min(a1,b1)-Math.max(a0,b0), step=(a0-b0)/8;
    const aligned = Math.abs(step-Math.round(step))<1e-6 || Math.abs(a1-b1)<E;
    return ov >= Math.min(8, a1-a0)-E && aligned;
  });
}
/* why a layout isn't allowed, or '' when it is */
function problem(pods, decks=MODELS[state.model]?.decks||[]){
  const F=pods.map(foot), K=decks.map(deckFoot);
  if(!F.every(onGrid)) return 'Pods sit on the 8′ grid.';
  for(let i=0;i<F.length;i++) for(let j=i+1;j<F.length;j++) if(overlaps(F[i],F[j])) return 'That spot overlaps another pod.';
  for(let i=0;i<K.length;i++){
    if(F.some(f=>overlaps(f,K[i])) || K.some((g,j)=>j!==i && overlaps(g,K[i]))) return 'That spot overlaps a pod or a deck.';
    if(!deckDocked(K[i], F.concat(K.filter((_,j)=>j!==i)))) return 'A deck docks with its ledger flush against a pod or another deck, lined up on the 8′ steps.';
  }
  if(K.length){   // every deck has to reach a pod, through other decks if need be
    const all=F.concat(K), seen=new Set(F.map((_,i)=>i)), todo=[...seen];
    while(todo.length){ const i=todo.pop(); all.forEach((g,j)=>{ if(!seen.has(j) && shared(all[i],g)>=Math.min(8,g.w,g.d)-1e-6){ seen.add(j); todo.push(j); } }); }
    if(seen.size<all.length) return 'Every deck has to connect to a pod, directly or through another deck.';
  }
  if(F.length>1){
    const seen=new Set([0]), todo=[0];
    while(todo.length){ const i=todo.pop(); F.forEach((g,j)=>{ if(!seen.has(j) && shared(F[i],g)>=8-1e-6){ seen.add(j); todo.push(j); } }); }
    if(seen.size<F.length) return 'Every pod has to dock against another one, sharing at least 8′ of wall.';
  }
  return '';
}

/* ---------------------------------------------------------------- baking */
function explicitA(key, i){
  const k = state.wallA?.[key]?.[i] || MODELS[key].wallA?.[i+1];
  return k || null;
}
/* the pod as it is on screen now, in its own frame */
function describe(key, i, slots, lslots){
  const p = MODELS[key].pods[i], rot=((p.rot||0)%360+360)%360;
  const walls={S:[],E:[],N:[],W:[]};
  slots.filter(s=>s.pod.i===i).forEach(s=>{
    const w=pickFor(s), f=state.faces?.[key]?.[s.id];
    const g={from:s.from, len:s.len, type:s.type, wall:w&&!w.blank ? w.id : null};
    const old = (p.walls?.[s.local]||[]).find(o=>Math.abs(o.from-s.from)<1e-6 && o.len===s.len && o.type===s.type);
    if(f && f!=='int') g.face=f; else if(!f && old?.face) g.face=old.face;
    walls[s.local].push(g);
  });
  SIDES.forEach(k=>walls[k].sort((a,b)=>a.from-b.from));
  const layers={};
  lslots.filter(l=>l.pod.i===i).forEach(l=>{ const L=pickLayer(l); if(L && !L.blank) layers[l.kind]=L.id; });
  const out={t:p.t, x:p.x, z:p.z, rot, walls, layers};
  if(p.src) out.src=p.src;
  const ex=explicitA(key,i); if(ex) out.a=localSide(rot, ex); else if(p.a) out.a=p.a;
  return out;
}
function bakedPods(key){
  const was=state.model; state.model=key;
  const slots=slotsFor(key), lslots=layerSlotsFor(key);
  const pods=MODELS[key].pods.map((_,i)=>describe(key,i,slots,lslots));
  state.model=was;
  return pods;
}
function bake(key){
  const pods=bakedPods(key), m=MODELS[key];
  m.pods=pods; m.picks={}; m.layerPicks={}; delete m.wallA;
  state.picks[key]={}; state.layerPicks[key]={}; state.wallA[key]={}; state.faces[key]={};
}

/* Cubit models (the standard design of each model name) and published variations (sub-models) are protected:
   the first change makes a private draft copy in "My drafts" and the change goes there. Drafts and team projects
   are edited in place. Publishing (publish-ui.js) is the only way a draft reaches the shared library. */
const isProtected = key => { const m=MODELS[key]; return !!m && !m.custom && !m.project; };
function makeDraftCopy(key){
  const m=MODELS[key], nk='draft-'+Date.now().toString(36)+Math.random().toString(36).slice(2,4);
  const fam = m.family || (m.base && MODELS[m.base]?.family) || null;
  const n=Object.values(MODELS).filter(x=>x.custom && x.from===key).length;
  MODELS[nk]={ name:m.name+(n?` (draft ${n+1})`:' (draft)'), size:m.size, ...(m.scratch?{scratch:true}:{}), base:m.base||(m.sub?undefined:key), family:fam, from:key, pods:bakedPods(key), decks:clone(m.decks||[]), picks:{}, layerPicks:{}, custom:true, draft:true, created:new Date().toISOString() };
  if(!MODELS[nk].base) delete MODELS[nk].base;
  ['bearing','found','deckOC'].forEach(f=>{ const v=state[f]?.[key] ?? m[f]; if(v!=null) (state[f] ||= {})[nk]=v; });
  ['units','furniture','cabinets','lights'].forEach(f=>{ const v=state[f]?.[key] ?? (f==='units'?m.units:null); if(v) (state[f] ||= {})[nk]=clone(v); });
  state.faces[nk]={}; state.picks[nk]={}; state.layerPicks[nk]={}; state.wallA[nk]={};
  state.model=nk; saveCustomModels(); save();
  try{ window.dispatchEvent(new CustomEvent('cubit:draft', {detail:{from:key, key:nk}})); }catch(e){}
  return nk;
}
/* before any change: a protected home turns into your draft copy first. Returns the key to change. */
function ensureDraft(){ return isProtected(state.model) ? makeDraftCopy(state.model) : state.model; }
function editKey(){
  checkpoint();
  const key=state.model, m=MODELS[key];
  if(m.custom || m.project){ bake(key); return key; }
  return makeDraftCopy(key);
}
function finish(key){
  const m=MODELS[key];
  // keep the layout starting at 0,0
  const F=m.pods.map(foot), mx=Math.min(...F.map(f=>f.x)), mz=Math.min(...F.map(f=>f.z));
  if(mx||mz){ m.pods.forEach(p=>{ p.x-=mx; p.z-=mz; }); (m.decks||[]).forEach(d=>{ d.x-=mx; d.z-=mz; }); }
  m.size=sizeText(m.pods);
  if(m.custom) saveCustomModels();
  state.selected=null; save();
}
function sizeText(pods){ const c={}; pods.forEach(p=>c[POD[p.t].len]=(c[POD[p.t].len]||0)+1); return Object.entries(c).sort((a,b)=>b[0]-a[0]).map(([l,n])=>(n>1?n+'×':'')+l).join(' + '); }

/* a fresh pod from a palette item: {t} for a blank pod, {lib:id} for a library pod */
function podFrom(item, x, z, rot){
  if(item.lib){ const L=podById(item.lib); return { t:L.t, x, z, rot, src:L.id, walls:clone(L.walls), layers:clone(L.layers||{}), ...(L.a?{a:L.a}:{}) }; }
  return { t:item.t, x, z, rot };
}
/* each edit returns '' when done, or the reason it couldn't be done */
function tryLayout(pods){ const why=problem(pods); return why; }
function addPod(item, x, z, rot=0){
  const trial=MODELS[state.model].pods.concat([podFrom(item,x,z,rot)]);
  const why=tryLayout(trial); if(why) return why;
  const key=editKey(); MODELS[key].pods.push(podFrom(item,x,z,rot)); finish(key); return '';
}
function movePod(i, x, z, rot){
  const trial=clone(MODELS[state.model].pods); Object.assign(trial[i], {x, z, rot:rot??trial[i].rot??0});
  const why=tryLayout(trial); if(why) return why;
  const key=editKey(); Object.assign(MODELS[key].pods[i], {x, z, rot:rot??MODELS[key].pods[i].rot??0}); finish(key); return '';
}
/* turn 90° clockwise about the pod's middle; if that spot is taken, the nearest free grid spot */
function turnSpot(pods, i){
  const p=pods[i], f=foot(p), rot=((p.rot||0)+90)%360, g=foot({...p,rot});
  const cx=f.x+f.w/2, cz=f.z+f.d/2;
  const bx=Math.round((cx-g.w/2)/8)*8, bz=Math.round((cz-g.d/2)/8)*8;
  const tries=[];
  for(let dx=-24;dx<=24;dx+=8) for(let dz=-24;dz<=24;dz+=8) tries.push([bx+dx,bz+dz]);
  tries.sort((a,b)=>Math.hypot(a[0]-bx,a[1]-bz)-Math.hypot(b[0]-bx,b[1]-bz));
  for(const [x,z] of tries){ const t=clone(pods); Object.assign(t[i],{x,z,rot}); if(!problem(t)) return {x,z,rot}; }
  return null;
}
function rotatePod(i){
  const spot=turnSpot(MODELS[state.model].pods, i);
  if(!spot) return 'No room to turn this pod here. Move it first.';
  return movePod(i, spot.x, spot.z, spot.rot);
}
function replacePod(i, item){
  const cur=MODELS[state.model].pods[i], f=foot(cur);
  const fresh=podFrom(item, cur.x, cur.z, cur.rot||0), g=foot(fresh);
  // keep the same middle when the size changes
  const tries=[[cur.x,cur.z],[Math.round((f.x+f.w/2-g.w/2)/8)*8, Math.round((f.z+f.d/2-g.d/2)/8)*8],[f.x+f.w-g.w, f.z+f.d-g.d]];
  for(const [x,z] of tries){
    const trial=clone(MODELS[state.model].pods); trial[i]={...fresh,x,z};
    if(!problem(trial)){ const key=editKey(); MODELS[key].pods[i]={...fresh,x,z}; finish(key); return ''; }
  }
  return 'That pod doesn’t fit in this spot.';
}
function deletePod(i){
  const pods=MODELS[state.model].pods; if(pods.length<2) return 'A home needs at least one pod.';
  const trial=pods.filter((_,j)=>j!==i); const why=problem(trial); if(why) return why.startsWith('A deck') ? 'A deck is docked to this pod. Move or remove the deck first.' : 'Removing this pod would leave the others apart.';
  const key=editKey(); MODELS[key].pods.splice(i,1); podRemoved(key, i); finish(key); return '';
}
/* every grid spot where a footprint w×d could dock (used to snap a drag to the nearest good spot) */
function dockSpots(item, rot, skip=-1){
  const pods=MODELS[state.model].pods.filter((_,j)=>j!==skip);
  const t = item.lib ? podById(item.lib).t : item.t;
  const probe=foot({t,x:0,z:0,rot});
  const F=pods.map(foot); if(!F.length) return [{x:0,z:0}];
  const minx=Math.min(...F.map(f=>f.x))-probe.w, maxx=Math.max(...F.map(f=>f.x+f.w));
  const minz=Math.min(...F.map(f=>f.z))-probe.d, maxz=Math.max(...F.map(f=>f.z+f.d));
  const out=[];
  for(let x=Math.floor(minx/8)*8;x<=maxx;x+=8) for(let z=Math.floor(minz/8)*8;z<=maxz;z+=8){
    const trial=pods.concat([{t,x,z,rot}]); if(!problem(trial)) out.push({x,z});
  }
  return out;
}

/* ---------------------------------------------------------------- decks */
function deckTrial(fn){ const m=MODELS[state.model]; const d=clone(m.decks||[]); fn(d); return problem(m.pods, d); }
function addDeck(lib, x, z, rot){
  const why=deckTrial(d=>d.push({lib,x,z,rot})); if(why) return why;
  const key=editKey(); (MODELS[key].decks ||= []).push({lib,x,z,rot}); finish(key); return '';
}
function moveDeck(k, x, z, rot){
  const why=deckTrial(d=>Object.assign(d[k],{x,z,rot})); if(why) return why;
  const key=editKey(); Object.assign(MODELS[key].decks[k],{x,z,rot}); finish(key); return '';
}
function removeDeck(k){
  const why=deckTrial(d=>d.splice(k,1)); if(why) return 'Another deck is docked to this one. Remove that one first.';
  const key=editKey(); MODELS[key].decks.splice(k,1); finish(key); return '';
}
function replaceDeck(k, lib){
  const cur=MODELS[state.model].decks[k];
  const why=deckTrial(d=>{ d[k].lib=lib; }); if(why) return 'That deck doesn’t fit in this spot.';
  const key=editKey(); MODELS[key].decks[k].lib=lib; finish(key); return '';
}
/* what a deck stands on: 'screws' (ground screws, the default) or 'pads' (floating on concrete pads); k = index or 'all' */
function setDeckFoundation(k, found){
  const key=editKey(), decks=MODELS[key].decks||[];
  (k==='all' ? decks : [decks[k]]).forEach(d=>{ if(!d) return; if(found==='pads') d.found='pads'; else delete d.found; });
  finish(key); return '';
}
/* every spot where a deck with this turn can dock (snapping targets) */
function deckSpots(lib, rot, skip=-1){
  const m=MODELS[state.model], decks=(m.decks||[]).filter((_,j)=>j!==skip);
  const others=m.pods.map(foot).concat(decks.map(deckFoot));
  const g=deckFoot({lib,x:0,z:0,rot}), side=LEDGER[g.rot], out=[];
  others.forEach(o=>{
    const cand=[];
    if(side==='S'||side==='N'){ const z = side==='S' ? o.z+o.d : o.z-g.d; for(let a=o.x-g.w+8; a<=o.x+o.w-8+1e-6; a+=8) cand.push([a,z]); cand.push([o.x+o.w-g.w,z]); }
    else { const x = side==='W' ? o.x+o.w : o.x-g.w; for(let a=o.z-g.d+8; a<=o.z+o.d-8+1e-6; a+=8) cand.push([x,a]); cand.push([x,o.z+o.d-g.d]); }
    cand.forEach(([x,z])=>{ if(out.some(q=>Math.abs(q.x-x)<1e-6&&Math.abs(q.z-z)<1e-6)) return;
      const d=clone(decks); d.push({lib,x,z,rot}); if(!problem(m.pods,d)) out.push({x,z}); });
  });
  return out;
}
function turnDeck(k){
  const d=MODELS[state.model].decks[k], f=deckFoot(d), cx=f.x+f.w/2, cz=f.z+f.d/2;
  for(let r=1;r<4;r++){
    const rot=((d.rot||0)+90*r)%360, spots=deckSpots(d.lib, rot, k), g=deckFoot({...d,rot});
    if(!spots.length) continue;
    spots.sort((a,b)=>Math.hypot(a.x+g.w/2-cx,a.z+g.d/2-cz)-Math.hypot(b.x+g.w/2-cx,b.z+g.d/2-cz));
    const s=spots[0]; if(Math.hypot(s.x+g.w/2-cx,s.z+g.d/2-cz)<14) return moveDeck(k, s.x, s.z, rot);
  }
  return 'No other way for this deck to face from here. Drag it to a new spot.';
}

/* ---------------------------------------------------------------- saving to the libraries
   When a home or a single pod is saved, any wall, floor or ceiling it uses that isn't in a library yet
   (a mirrored join wall, say) is added to that library, and every pod that isn't in the pod library yet
   is added to it. Matching is to ⅛″. */
const near = (a,b) => Math.abs(a-b)<=0.125+1e-9;
const sameItems = (A=[],B=[]) => A.length===B.length && A.every((o,k)=>{ const q=B[k]; return o.kind===q.kind && ['x','y','w','h'].every(f=>near(o[f]||0,q[f]||0)); });
const byX = l => (l||[]).slice().sort((a,b)=>a.x-b.x||a.y-b.y);
function sameWall(a,b){ return a.len===b.len && (a.type||'ext')===(b.type||'ext') && sameItems(byX(a.openings),byX(b.openings)) && sameItems(byX(a.inside),byX(b.inside)) && sameItems(byX(a.outside),byX(b.outside)); }
function nextId(prefix, list){ let n=1; while(list.some(x=>x.id===`${prefix}-${String(n).padStart(2,'0')}`)) n++; return `${prefix}-${String(n).padStart(2,'0')}`; }
function libraryWall(id, counts){
  if(!id) return id;
  const w=byId(id); if(!w) return id;
  if(!id.endsWith('~m') && LIB.includes(w)) return id;
  const hit=LIB.find(x=>sameWall(x,w)); if(hit) return hit.id;
  const nw={...clone(w), id:nextId(`${w.type==='int'?'I':'W'}${String(w.len).padStart(2,'0')}`, LIB), src:'saved', source:`saved ${new Date().toISOString().slice(0,10)}`};
  delete nw.mirrorOf;
  LIB.push(nw); counts.walls++; return nw.id;
}
function libraryLayer(id, counts){
  const L=layerById(id); if(!L || LAYERLIB.includes(L)) return id;
  const nl={...clone(L), id:nextId(`${LAYER_KINDS[L.kind].code}${String(L.len).padStart(2,'0')}`, LAYERLIB), src:'saved'};
  LAYERLIB.push(nl); counts.layers++; return nl.id;
}
const podSig = p => JSON.stringify([p.t, SIDES.map(k=>(p.walls?.[k]||[]).map(g=>[g.from,g.len,g.type,g.wall||null])), Object.keys(LAYER_KINDS).map(k=>p.layers?.[k]||null)]);
function libraryPod(p, name, counts){
  const sig=podSig(p);
  const hit=PODLIB.find(x=>podSig(x)===sig); if(hit) return hit.id;
  const np={ id:nextId(p.t, PODLIB), name, t:p.t, len:POD[p.t].len, walls:clone(p.walls), layers:clone(p.layers||{}), src:'saved', source:`saved ${new Date().toISOString().slice(0,10)}` };
  if(p.a) np.a=p.a;
  SIDES.forEach(k=>np.walls[k]=(np.walls[k]||[]).map(({face,...g})=>g));
  PODLIB.push(np); counts.pods++; return np.id;
}
/* bake the home on screen and put everything new into the libraries; `only` = one pod index */
function saveToLibraries(homeName, only=null){
  const key=state.model, m=MODELS[key];
  const own = m.custom || m.project || m.sub;
  const pods = own ? (bake(key), m.pods) : bakedPods(key);   // a built-in home itself is never changed
  const counts={walls:0, layers:0, pods:0};
  pods.forEach((p,i)=>{
    SIDES.forEach(k=>(p.walls?.[k]||[]).forEach(g=>{ g.wall=libraryWall(g.wall, counts); }));
    Object.keys(p.layers||{}).forEach(k=>{ p.layers[k]=libraryLayer(p.layers[k], counts); });
    if(only===null || only===i){
      const complete = SIDES.every(k=>(p.walls[k]||[]).every(g=>g.wall));
      if(complete) p.src=libraryPod(p, `${POD[p.t].len}′ pod · ${homeName} · Pod ${i+1}`, counts);
    }
  });
  if(counts.walls) saveWallLib(); if(counts.layers) saveLayerLib(); if(counts.pods) savePodLib();
  if(m.custom) saveCustomModels();
  save();
  return counts;
}
const countsText = c => {
  const parts=[]; if(c.pods) parts.push(`${c.pods} pod${c.pods>1?'s':''}`); if(c.walls) parts.push(`${c.walls} wall${c.walls>1?'s':''}`); if(c.layers) parts.push(`${c.layers} floor/ceiling layer${c.layers>1?'s':''}`);
  return parts.length ? `New in the libraries: ${parts.join(', ')}.` : 'Nothing new for the libraries.';
};
function renameLibPod(id, name){ const p=podById(id); if(p && p.src==='saved'){ p.name=name; savePodLib(); } }
function deleteLibPod(id){ const k=PODLIB.findIndex(p=>p.id===id && p.src==='saved'); if(k>=0){ PODLIB.splice(k,1); savePodLib(); } }

export { isProtected, makeDraftCopy, ensureDraft, setDeckFoundation, deckFoot, LEDGER, addDeck, moveDeck, removeDeck, replaceDeck, deckSpots, turnDeck, foot, problem, bake, addPod, movePod, rotatePod, replacePod, deletePod, dockSpots, turnSpot, saveToLibraries, countsText, sizeText, renameLibPod, deleteLibPod, podSig };
