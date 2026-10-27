/* Cubit Builder — casework-ui.js : the Cabinet library window (browse, resize, 3D with exploded view and parts,
   cut list), the shop settings (plywood, edge band, joinery, hardware), and the options of a placed item. */
import { CATS, ITEMS, itemDef, catOf, newItem, partsOf, cutList, hardwareOf, totals, csv, fmt, fmtU, fx3, settings, saveSettings, loadSettings, DEFAULTS, MM } from './casework.js';
import { partSVG, opsTable } from './casework-parts.js';
import { itemModel } from './casework3d.js';
import { frontSVG } from './casework-svg.js';
import { furnitureOf, furnById, updateItem, removeItem, duplicateItem, turnItem, refreshItem, addItem, snap, applyFurniture, podsShown, freeSpot } from './furniture.js';
import { state, save } from './state.js';
import { canSave } from './role.js';
import { homeGroup, wallGroups, highlight } from './scene3d.js';
import { renderSide, toast } from './sidebar.js';
import { setPanel, panelOpen } from './fullscreen.js';
import { setIsolate } from './layers.js';
import { askName } from './names.js';
import { checkpoint } from './history.js';
import { ensureDraft } from './pods.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const U = () => settings().units;
const show = v => fmt(v);                                  // a length in the shop's units, no unit sign
/* exact values for the settings (a measured 0.469″ must not round to ½″) */
const prec = v => { if(U()==='mm'){ const m=v/MM; return String(Math.round(m*10)/10); } return Math.abs(v*16-Math.round(v*16))<1e-6 ? fmt(v) : String(Math.round(v*1000)/1000); };
const unitSign = () => U()==='mm' ? 'mm' : '″';
/* "34 1/2", "34.5", "34-1/2", "876 mm" → inches */
function parseLen(s){
  s=String(s).trim().toLowerCase(); if(!s) return NaN;
  const mm=/mm$/.test(s) || (U()==='mm' && !/["″in]$/.test(s)); s=s.replace(/mm|in|["″]/g,'').trim();
  if(mm) return parseFloat(s)*MM;
  const m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); if(!m) return parseFloat(s);
  return (m[1]?parseFloat(m[1]):0) + (m[2]?(+m[2])/(+m[3]):0);
}
const sizeTxt = it => `${show(it.w)} × ${show(it.h)} × ${show(it.d)}${unitSign()}`;
const bandTxt = b => !b.long && !b.short ? '—' : [b.long?`${b.long} long`:'' , b.short?`${b.short} short`:''].filter(Boolean).join(', ');
function download(name, text, type='text/csv'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---------------------------------------------------------------- the window */
let dlg=null, view={ tab:'lib', cat:'base', item:null, edit:null, explode:0, sel:null };
import { makeHistory, histButtons, bindHistory } from './local-history.js';
/* undo / redo of the item on screen: its sizes, options and mirror */
const pickIt = it => it ? JSON.parse(JSON.stringify({ w:it.w, h:it.h, d:it.d, y:it.y||0, opt:it.opt||{}, mirror:!!it.mirror })) : null;
const HIST = makeHistory(()=>pickIt(view.item), v=>{ const it=view.item; if(!it||!v) return; if(view.edit){ updateItem(it.id, v); refreshItem(it); renderSide(); } else Object.assign(it, v); });
function ensure(){
  if(dlg) return dlg;
  dlg=document.createElement('dialog'); dlg.className='cw-dlg'; dlg.setAttribute('aria-label','Cabinet library');
  dlg.innerHTML=`<div class="cw">
    <header class="cw-h"><h2>Cabinet library</h2>
      <div class="seg" role="tablist"><button role="tab" data-tab="lib">Library</button><button role="tab" data-tab="set">Shop settings</button></div>
      <span class="spacer"></span><button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="cw-body"></div></div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('.cw-x').onclick=()=>dlg.close();
  dlg.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ view.tab=b.dataset.tab; render(); });
  dlg.addEventListener('close', ()=>{ stopViewer(); });
  return dlg;
}
async function openCaseLib(o={}){
  ensure(); await loadSettings();
  if(o.edit){ const it=furnById(o.edit); if(it){ view.edit=it.id; view.item=it; view.cat=itemDef(it.k).cat; } }
  else { view.edit=null; view.item=o.k ? newItem(o.k) : null; if(o.cat) view.cat=o.cat; if(o.k) view.cat=itemDef(o.k).cat; }
  view.tab=o.tab||'lib'; view.explode=0; view.sel=null;
  HIST.reset(); render(); if(!dlg.open) dlg.showModal();
}
function render(){
  dlg.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected', b.dataset.tab===view.tab));
  const body=dlg.querySelector('.cw-body');
  stopViewer();
  if(view.tab==='set'){ renderSettings(body); return; }
  if(view.item){ renderDetail(body); return; }
  const items=ITEMS.filter(i=>i.cat===view.cat);
  body.innerHTML=`<nav class="cw-cats" aria-label="Categories">${CATS.map(c=>`<button data-cat="${c.k}" aria-current="${c.k===view.cat}"><span>${c.name}</span><small>${ITEMS.filter(i=>i.cat===c.k).length}</small></button>`).join('')}</nav>
    <section class="cw-grid">${items.map(d=>{ const it=newItem(d.k); return `<button class="cw-card" data-k="${d.k}"><div class="cw-thumb">${frontSVG(it)}</div><b>${esc(d.name)}</b><small>${sizeTxt(it)}${d.fixed?' · fixed size':''}</small></button>`; }).join('')}</section>`;
  body.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{ view.cat=b.dataset.cat; render(); });
  body.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ view.item=newItem(b.dataset.k); view.edit=null; view.explode=0; view.sel=null; HIST.reset(); render(); });
}

/* ---------------------------------------------------------------- one item: 3D, sizes, options, parts */
function groupsOf(parts){
  const G=new Map();
  parts.forEach((p,i)=>{ const key=[p.hw||p.solid?'x':'p', p.name.replace(/, (left|right)$/,'').replace(/^(Left|Right) end$/,'End').replace(/ \d+( |$)/,' # '), p.cutL, p.cutW, p.band.long, p.band.short, p.cnc?JSON.stringify([p.cnc.outline,p.cnc.ops]):''].join('|');
    const g=G.get(key); if(g) g.idx.push(i); else G.set(key,{ p, idx:[i] }); });
  return [...G.values()];
}
function sizeRow(key, label, val, list, range, fixed){
  return `<div class="cw-size"><label for="cw-${key}">${label}</label>
    <div class="cw-step"><button class="cw-b" data-step="${key}" data-dir="-1" aria-label="Smaller" ${fixed?'disabled':''}>−</button><input id="cw-${key}" data-len="${key}" value="${esc(show(val))}" inputmode="decimal" ${fixed?'disabled':''}><span class="u">${unitSign()}</span><button class="cw-b" data-step="${key}" data-dir="1" aria-label="Bigger" ${fixed?'disabled':''}>+</button></div>
    ${list&&!fixed?`<div class="cw-pre">${list.map(v=>`<button data-pre="${key}" data-v="${v}" aria-pressed="${Math.abs(v-val)<1e-6}">${show(v)}</button>`).join('')}</div>`:''}</div>`;
}
function renderDetail(body){
  const it=view.item, d=itemDef(it.k), cat=catOf(d.cat), parts=partsOf(it), G=groupsOf(parts);
  const cut=G.filter(g=>!g.p.hw && !g.p.solid), solids=G.filter(g=>g.p.solid), hw=hardwareOf(it), tot=totals([it]);
  const editing=!!view.edit;
  HIST.track();
  body.innerHTML=`<div class="cw-detail">
    <div class="cw-view">
      <div class="cw-vh"><button class="btn ghost sm" id="cwBack">← ${editing?'Close':esc(cat.name)}</button><b>${esc(d.name)}</b><span class="spacer"></span>${histButtons(HIST)}
        <button class="btn ghost sm" id="cwFront">Front</button><button class="btn ghost sm" id="cwIso">3D</button></div>
      <canvas id="cwCanvas" aria-label="3D view of ${esc(d.name)}"></canvas>
      <div class="cw-ex"><label for="cwEx">Exploded</label><input type="range" id="cwEx" min="0" max="1" step="0.01" value="${view.explode}"><span class="note">Tap a part to find it in the list</span></div>
    </div>
    <div class="cw-side">
      ${d.note?`<p class="note">${esc(d.note)} · check the maker's current spec sheet before ordering.</p>`:''}
      <div class="cw-sizes">
        ${sizeRow('w','Width',it.w,d.sizes,d.wR,d.fixed)}
        ${sizeRow('h','Height',it.h,d.hSizes,d.hR,d.fixed)}
        ${sizeRow('d','Depth',it.d,d.dSizes,d.dR,d.fixed)}
        ${sizeRow('y','Off the floor',it.y||0,null,[0,96],false)}
      </div>
      ${(d.opts||[]).map(([k,l,vals])=>`<div class="cw-opt"><span>${l}</span><div class="seg wrap">${vals.map(v=>`<button data-opt="${k}" data-v="${esc(v)}" aria-pressed="${String((it.opt||{})[k] ?? d.opt?.[k])===String(v)}">${esc(v)}</button>`).join('')}</div></div>`).join('')}
      ${parts.some(p=>p.role==='front' && p.cnc) ? `<div class="cw-opt"><span>Handles</span><div class="seg wrap"><button data-handle="later" aria-pressed="${(it.opt?.handle ?? settings().handle)==='later'}">Drill later</button>${(settings().handles||[]).map(h=>`<button data-handle="${esc(h.id)}" aria-pressed="${(it.opt?.handle ?? settings().handle)===h.id}">${esc(h.name)}</button>`).join('')}</div></div>` : ''}
      <div class="cw-opt"><span>Mirror</span><div class="seg"><button data-mir="0" aria-pressed="${!it.mirror}">As drawn</button><button data-mir="1" aria-pressed="${!!it.mirror}">Mirrored (left ↔ right)</button></div></div>
      <div class="row cw-acts">
        ${editing ? `<button class="btn" id="cwDone">Done</button>` : `<button class="btn edit-only" id="cwAdd">Add to this home</button>`}
        ${cut.length?`<button class="btn ghost" id="cwPlan">Cutting plan</button><button class="btn ghost" id="cwCsv">Cut list (CSV)</button>`:''}
      </div>
      ${cut.length?`<p class="cw-tot">${parts.filter(p=>!p.hw&&!p.solid).length} parts · ${Object.entries(tot.area).map(([n,a])=>`${esc(n)} ${fx3(settings().mat.t)} · ${a.toFixed(1)} sq ft`).join(' · ')} · ${tot.bandFt} ft of edge band</p>`:''}
      ${cut.length?`<h3>Parts <small>cut sizes · open one to see exactly how it's cut</small></h3>
      <div class="cw-parts" role="list">${cut.map(g=>{ const p=g.p; return `<details class="cw-part" data-parts="${g.idx.join(',')}" role="listitem"><summary><span class="q">${g.idx.length}×</span><span class="n">${esc(g.idx.length>1?p.name.replace(/, (left|right)$/,'').replace(/^(Left|Right) end$/,'End'):p.name)}</span><span class="s">${fx3(p.cutL)} × ${fx3(p.cutW)}</span></summary>
        <div class="pt-body"><p class="note">${p.cnc?`On the CNC: <b>${esc(p.cnc.up)} up</b> · `:''}${fx3(p.T)} thick · edge band ${bandTxt(p.band)}${p.note?` · ${esc(p.note)}`:''}</p>${p.cnc?partSVG(p,{px:560})+opsTable(p):`<ul>${p.ops.map(o=>`<li>${esc(o)}</li>`).join('')}</ul>`}</div></details>`; }).join('')}</div>`:''}
      ${solids.length?`<h3>Pieces</h3><div class="cw-parts">${solids.map(g=>`<details class="cw-part" data-parts="${g.idx.join(',')}"><summary><span class="q">${g.idx.length}×</span><span class="n">${esc(g.p.name)}</span><span class="s">${show(g.p.box[3])} × ${show(g.p.box[4])} × ${show(g.p.box[5])}</span></summary>${g.p.note?`<ul><li>${esc(g.p.note)}</li></ul>`:''}</details>`).join('')}</div>`:''}
      ${hw.length?`<h3>Hardware</h3><ul class="cw-hw">${hw.map(h=>`<li><b>${h.qty}×</b> ${esc(h.name)}</li>`).join('')}</ul>`:''}
    </div></div>`;
  startViewer(body.querySelector('#cwCanvas'), it);
  const apply=(patch)=>{ if(editing) updateItem(it.id, patch); else Object.assign(it, patch); if(d.sized && patch.opt) Object.assign(it, d.sized(it)); if(editing){ refreshItem(it); renderSide(); } const ex=view.explode; render(); view.explode=ex; };
  bindHistory(body, HIST, ()=>{ const ex=view.explode; render(); view.explode=ex; });
  body.querySelector('#cwBack').onclick=()=>{ if(editing){ dlg.close(); return; } view.item=null; render(); };
  body.querySelector('#cwFront').onclick=()=>V?.front(); body.querySelector('#cwIso').onclick=()=>V?.iso();
  body.querySelector('#cwEx').oninput=e=>{ view.explode=+e.target.value; V?.explode(view.explode); };
  const clampR=(k,v)=>{ const r={w:d.wR,h:d.hR,d:d.dR,y:[0,96]}[k]||[0,200]; return Math.min(r[1], Math.max(r[0], v)); };
  body.querySelectorAll('[data-len]').forEach(inp=>inp.onchange=()=>{ const v=parseLen(inp.value); if(!isFinite(v)){ inp.value=show(it[inp.dataset.len]||0); return; } apply({[inp.dataset.len]:clampR(inp.dataset.len, v)}); });
  body.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{ const k=b.dataset.step, st=U()==='mm'?10*MM:(k==='y'?1:0.5); apply({[k]:clampR(k,(it[k]||0)+st*(+b.dataset.dir))}); });
  body.querySelectorAll('[data-mir]').forEach(b=>b.onclick=()=>apply({mirror:b.dataset.mir==='1'}));
  body.querySelectorAll('[data-pre]').forEach(b=>b.onclick=()=>apply({[b.dataset.pre]:+b.dataset.v}));
  body.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{ const raw=b.dataset.v, v=isNaN(+raw)?raw:+raw; apply({opt:{...(it.opt||{}), [b.dataset.opt]:v}}); });
  body.querySelectorAll('[data-handle]').forEach(b=>b.onclick=()=>apply({opt:{...(it.opt||{}), handle:b.dataset.handle}}));
  body.querySelector('#cwPlan')?.addEventListener('click',()=>openPlan(it, d.name));
  body.querySelector('#cwCsv')?.addEventListener('click',()=>download(`${d.name.replace(/[^\w]+/g,'-')}-${Math.round(it.w)}x${Math.round(it.h)}x${Math.round(it.d)}.csv`, csv(it, d.name)));
  body.querySelector('#cwDone')?.addEventListener('click',()=>dlg.close());
  body.querySelector('#cwAdd')?.addEventListener('click',()=>{ if(!canSave()){ toast('Viewers can look but not change the home.'); return; } const f=placeAuto(it); if(f){ dlg.close(); toast(`${d.name} added · drag it in the plan to move it`); } });
  body.querySelectorAll('.cw-part').forEach(el=>el.addEventListener('toggle',()=>{ if(el.open){ body.querySelectorAll('.cw-part[open]').forEach(o=>{ if(o!==el) o.open=false; }); V?.select(el.dataset.parts.split(',').map(Number)); } else V?.select(null); }));
}
/* the cutting plan: every different part, drawn and dimensioned, with its cuts as numbers (prints as a booklet) */
function openPlan(it, name){
  const rows=cutList(it), d=document.createElement('dialog'); d.className='cw-dlg pt-plan'; d.setAttribute('aria-label','Cutting plan');
  const S=settings();
  d.innerHTML=`<div class="cw"><header class="cw-h"><h2>Cutting plan · ${esc(name)}</h2><span class="note">${fmt(it.w)} × ${fmt(it.h)} × ${fmt(it.d)}″ · ${esc(S.mat.name)} at ${fx3(S.mat.t)}</span><span class="spacer"></span><button class="btn ghost" id="ptPrint">Print</button><button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="pt-list">
      <section class="pt-intro"><h3>How these parts are cut</h3><ul>
        <li><b>Side A</b> is the last program for a sheet: the face named on each part is up, its dados, grooves and holes are cut, then every part is cut out (a skim pass that leaves about 1 mm, then the final pass through). Side B, when a part has cuts on its other face, is cut <b>first</b>, so the cut-throughs are always last.</li>
        <li>Dados: ½″ bit, as wide as the sheet measures plus ${fx3(S.dado.fit)}, ${fx3(S.dado.depth)} deep. A panel goes ${fx3(S.dado.engage)} into each. They stop ${fx3(S.dado.stop)} short of the front; the panel's corners are notched to pass the stop.</li>
        <li>Holes: shelf pins Ø5 mm × ${fx3(S.pins.depth)}, 32 mm apart, rows ${Math.round(S.pins.front/MM)} mm from the front and ${Math.round(S.pins.back/MM)} mm from the back. Hinge plate marks Ø5 × ${fx3(S.mark.depth)}. Hinge cups Ø35 mm with two Ø8 mm dowel holes.</li>
        <li>All sizes use the sheet thickness set in Shop settings (${fx3(S.mat.t)}). Measure the sheets and set it before making G-code: the dado widths and every depth follow it.</li></ul></section>
      ${rows.map(r=>{ const p=r.parts[0]; return `<section class="pt-sheet"><h3>${r.qty}× ${esc(r.qty>1?p.name.replace(/, (left|right)$/,'').replace(/^(Left|Right) end$/,'End (left and right)'):p.name)} <small>${fx3(r.L)} × ${fx3(r.W)} × ${fx3(r.T)}</small></h3>
        <p class="note">${p.cnc?`<b>${esc(p.cnc.up)} up</b> · `:''}edge band ${bandTxt(r.band)}${p.note?` · ${esc(p.note)}`:''}</p>${p.cnc?partSVG(p,{px:900,maxH:620})+opsTable(p):`<ul>${r.ops.map(o=>`<li>${esc(o)}</li>`).join('')}</ul>`}</section>`; }).join('')}
    </div></div>`;
  document.body.appendChild(d);
  d.querySelector('.cw-x').onclick=()=>d.close(); d.addEventListener('close',()=>d.remove());
  d.querySelector('#ptPrint').onclick=()=>{ document.documentElement.classList.add('print-plan'); window.print(); setTimeout(()=>document.documentElement.classList.remove('print-plan'),500); };
  d.showModal();
}
/* add an item to the home: backed against the nearest wall to the middle of the first pod */
function placeAuto(it){
  const pods=podsShown(); if(!pods.length) return null;
  const at=freeSpot(it, homeGroup);   // against a wall, clear of everything already placed
  if(!at){ toast('No room found. Open Build and drag it in.'); return null; }
  const f=addItem(it.k, { w:it.w, h:it.h, d:it.d, y:it.y, opt:JSON.parse(JSON.stringify(it.opt||{})), ...at });
  state.selFurn=f.id; state.selected=null; refreshItem(f); highlight(); renderSide(); if(!panelOpen()) setPanel(true); return f;
}
/* ---------------------------------------------------------------- the 3D viewer */
let V=null;
function startViewer(canvas, it){
  const r=new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.shadowMap.enabled=true;
  const sc=new THREE.Scene(), cam=new THREE.PerspectiveCamera(35, 1, 1, 5000);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8f86, 0.85)); const sun=new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(60,120,90); sc.add(sun);
  const fill=new THREE.DirectionalLight(0xffffff,0.3); fill.position.set(-80,40,-60); sc.add(fill);
  const M=itemModel(it, { edges:true, tenons:true }); M.group.position.set(-it.w/2, 0, -it.d/2); sc.add(M.group);
  const span=Math.max(it.w, it.h, it.d), ctl=new THREE.OrbitControls(cam, canvas); ctl.enableDamping=true; ctl.target.set(0, it.h/2, 0);
  const grid=new THREE.GridHelper(span*3, 12, 0xbfc5bd, 0xdde1da); grid.material.transparent=true; grid.material.opacity=0.5; sc.add(grid);
  const fit=(az, el)=>{ const d=span*2.4+20; cam.position.set(Math.sin(az)*Math.cos(el)*d, it.h/2+Math.sin(el)*d, Math.cos(az)*Math.cos(el)*d); ctl.target.set(0,it.h/2,0); ctl.update(); };
  fit(0.62, 0.32);
  M.explode(view.explode);
  const size=()=>{ const w=canvas.clientWidth, h=canvas.clientHeight; if(!w||!h) return; r.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); };
  const ro=new ResizeObserver(size); ro.observe(canvas); size();
  let raf=0, sel=null; const loop=()=>{ raf=requestAnimationFrame(loop); ctl.update(); r.render(sc,cam); }; loop();
  // tap a part: open its row
  const rc=new THREE.Raycaster(), nd=new THREE.Vector2(); let down=null;
  canvas.addEventListener('pointerdown', e=>{ down=[e.clientX,e.clientY]; });
  // double-tap a part: it alone (as in the home); double-tap it again or empty space: the whole cabinet back
  let isoPart=null, lastUp=null;
  const shownM = m => { for(let o=m; o; o=o.parent) if(!o.visible) return false; return true; };
  const isoTo = i => { isoPart=i; M.group.children.forEach(s=>{ s.visible = i==null || s.userData.part===i; }); };
  canvas.addEventListener('pointerup', e=>{ if(!down || Math.hypot(e.clientX-down[0],e.clientY-down[1])>6) return; const b=canvas.getBoundingClientRect(); nd.set((e.clientX-b.left)/b.width*2-1, -(e.clientY-b.top)/b.height*2+1); rc.setFromCamera(nd,cam);
    const h=rc.intersectObjects(M.meshes.filter(shownM),false)[0], i=h?.object.userData.part;
    const now=performance.now(), dbl=lastUp && now-lastUp.t<450 && Math.hypot(e.clientX-lastUp.x, e.clientY-lastUp.y)<40; lastUp = dbl ? null : {t:now, x:e.clientX, y:e.clientY};
    if(dbl){ isoTo(i==null || i===isoPart ? null : i); return; }
    const rows=[...dlg.querySelectorAll('.cw-part')]; rows.forEach(x=>x.open=false);
    if(i==null){ M.select(null); return; }
    const row=rows.find(x=>x.dataset.parts.split(',').map(Number).includes(i));
    if(row){ row.open=true; row.scrollIntoView({block:'nearest', behavior:'smooth'}); } else M.select([i]); });
  V={ explode:e=>M.explode(e), front:()=>fit(0,0.02), iso:()=>fit(0.62,0.32),
    select:idx=>{ if(!idx){ M.select(null); return; } M.meshes.forEach(m=>{ const on=idx.includes(m.userData.part); m.material = on ? selMat : dimMat(m); }); },
    stop:()=>{ cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); r.dispose(); } };
  const selMat=new THREE.MeshStandardMaterial({color:0xd0661f, roughness:0.6, emissive:0x4a1c04});
  const dims=new Map(); const dimMat=m=>{ const base=M.parts[m.userData.part]; const k=base.role; if(!dims.has(k)){ const c=m.material.clone(); c.transparent=true; c.opacity=0.16; c.depthWrite=false; dims.set(k,c); } return dims.get(k); };
  M.select=(idx)=>{ if(idx) return V.select(idx); M.meshes.forEach(m=>{ m.material = origMat.get(m); }); };
  const origMat=new Map(M.meshes.map(m=>[m,m.material]));
}
function stopViewer(){ if(V){ V.stop(); V=null; } }

/* ---------------------------------------------------------------- shop settings */
const F = (path, label, kind='len', extra='') => ({ path, label, kind, extra });
const SECTIONS = [
  ['Sheet material', 'One material for every part (Mozaik: 16 mm PET at 0.600″). Sheets vary: measure them and set the thickness before you make G-code. Every dado width and every depth follows it.', [
    F('mat.name','Material','text'), F('mat.t','Sheets measure'), F('mat.sheet.0','Sheet width'), F('mat.sheet.1','Sheet length') ]],
  ['Edge band', 'Doors, drawer fronts, shelf fronts and the front edges of the ends are banded. Mozaik’s sizes already allow for the band in the reveals, so it isn’t taken off again unless you switch that on.', [
    F('band.t','Band thickness'), F('band.name','Edge band','text'), F('band.deduct','Take the band off the cut sizes','bool') ]],
  ['Dados', 'Bottoms, tops, fixed shelves and stretchers sit in dados in the ends; the back in its own dado and a groove in the bottom.', [
    F('dado.depth','Dado depth'), F('dado.engage','A panel goes into each dado'), F('dado.fit','Dado wider than the sheet by'), F('dado.stop','Dados stop short of the front by'), F('dado.clear','Clearance past a dado end (bit radius)'), F('back.inset','Back dado in from the back edge') ]],
  ['Box', '', [ F('kick.h','Toe kick height'), F('kick.set','Toe kick setback'), F('kick.rearW','Rear notch on the ends, deep'), F('stretcher.w','Stretcher width (bases)'), F('shelf.side','Adjustable shelf clearance, each side'), F('shelf.back','Adjustable shelf clearance at the back'), F('shelf.group','Pin holes per shelf, per row','num') ]],
  ['Doors and drawer fronts', 'Full overlay. Gaps and how far the fronts run past the box, by cabinet kind (Mozaik’s door rules).', [
    F('fronts.side','Gap at each side'), F('fronts.gap','Gap between fronts'), F('fronts.pairOver','Two doors when wider than'),
    F('fronts.base.below','Base: below the bottom'), F('fronts.base.top','Base: under the top of the box'), F('fronts.upper.below','Upper: below the box'), F('fronts.upper.top','Upper: under the top'), F('fronts.tall.below','Tall: below the bottom'), F('fronts.tall.top','Tall: under the top') ]],
  ['Shelf pins and marks', '', [ F('pins.dia','Pin hole'), F('pins.depth','Pin hole depth'), F('pins.pitch','Pin spacing'), F('pins.front','Front row in from the front'), F('pins.back','Back row in from the back'), F('mark.depth','Hinge plate mark depth') ]],
  ['Hinges', 'Blum by default; DTC is set up the same way. The press-in hinge: a 35 mm cup and two 8 mm dowel holes.', [ F('hinge','Hinge used','pick:hinges') ]],
  ['Drawer runners', 'Runner holes on the ends, one row per drawer. Front holes from the front edge; back holes measured back from the runner length.', [ F('runner','Runners used','pick:runners') ]],
  ['Drawer boxes', '16 mm sides, front and back; the front and back have tongues in ¼″ dados in the sides and sit on the bottom; the bottom slides in a groove in the sides.', [
    F('drawer.groove','Bottom groove up from the side’s lower edge'), F('drawer.grooveDepth','Bottom groove depth'), F('drawer.dadoIn','Front / back dado in from the end'), F('drawer.dadoW','Dado width (¼″ bit)'), F('drawer.dadoDepth','Dado depth'), F('drawer.tongue','Tongue thickness'), F('drawer.topDrop','Front / back below the side’s top') ]],
  ['Handles', 'Pick a handle on a cabinet to drill its holes on the CNC; “Drill later” leaves them off.', [ F('handles','Handles','handles') ]],
  ['Fasteners and tops', '', [ F('screw.name','Assembly fastener','text'), F('rod.name','Closet rod','text'), F('counter.name','Countertop','text'), F('counter.t','Countertop thickness'), F('counter.over','Front overhang') ]],
];
const LABEL = { cup:'Cup diameter', depth:'Cup and dowel depth', edge:'Cup centre from the door edge', dowel:'Dowel hole', dowelApart:'Dowel holes apart', dowelBack:'Dowels behind the cup centre', bottom:'Lowest cup above the door bottom', top:'Highest cup below the door top', plateX:'Plate marks in from the front', plateApart:'Plate marks apart',
  clear:'Clearance, both sides together', lens:'Lengths (inches)', front:'Front holes from the front (mm)', rear:'Back holes before the runner end (mm)', holeDepth:'Hole depth', rowAbove:'Hole row above the box bottom', boxPlus:'Box longer than the runner by' };
const getP = (o,p) => p.split('.').reduce((a,k)=>a?.[k], o);
function setP(o,p,v){ const ks=p.split('.'); const last=ks.pop(); const t=ks.reduce((a,k)=>(a[k] ??= {}), o); t[last]=v; }
function renderSettings(body){
  const S=JSON.parse(JSON.stringify(settings())), ro=!canSave();
  const field=f=>{ const v=getP(S,f.path);
    if(f.kind==='text') return `<label class="cw-f"><span>${f.label}</span><input data-p="${f.path}" data-kind="text" value="${esc(v)}" ${ro?'disabled':''}></label>`;
    if(f.kind==='bool') return `<div class="cw-f"><span>${f.label}</span><div class="seg"><button data-p="${f.path}" data-v="1" data-bool="1" aria-pressed="${!!v}" ${ro?'disabled':''}>Yes</button><button data-p="${f.path}" data-v="0" data-bool="1" aria-pressed="${!v}" ${ro?'disabled':''}>No</button></div></div>`;
    if(f.kind==='num') return `<label class="cw-f"><span>${f.label}</span><input data-p="${f.path}" data-kind="num" value="${esc(v)}" inputmode="numeric" ${ro?'disabled':''}></label>`;
    if(f.kind.startsWith('pick:')){ const lib=f.kind.slice(5), L=S[lib];
      return `<div class="cw-f wide"><span>${f.label}</span><div class="seg wrap">${Object.entries(L).map(([k,g])=>`<button data-p="${f.path}" data-v="${k}" aria-pressed="${v===k}" ${ro?'disabled':''}>${esc(g.name)}</button>`).join('')}</div></div>
        ${Object.entries(L).map(([k,g])=>`<fieldset class="cw-gl"><legend>${esc(g.name)}</legend>${Object.entries(g).map(([kk,val])=> kk==='name' ? `<label class="cw-f wide"><span>Name</span><input data-p="${lib}.${k}.name" data-kind="text" value="${esc(val)}" ${ro?'disabled':''}></label>`
          : Array.isArray(val) ? `<label class="cw-f"><span>${esc(LABEL[kk]||kk)}</span><input data-p="${lib}.${k}.${kk}" data-kind="list" value="${val.join(', ')}" ${ro?'disabled':''}></label>`
          : `<label class="cw-f"><span>${esc(LABEL[kk]||kk)}</span><input data-p="${lib}.${k}.${kk}" data-kind="len" value="${esc(prec(val))}" inputmode="decimal" ${ro?'disabled':''}><i>${unitSign()}</i></label>`).join('')}</fieldset>`).join('')}`; }
    if(f.kind==='handles') return `<div class="cw-f wide"><span>Default on a new cabinet</span><div class="seg wrap"><button data-p="handle" data-v="later" aria-pressed="${S.handle==='later'}" ${ro?'disabled':''}>Drill later</button>${S.handles.map(h=>`<button data-p="handle" data-v="${esc(h.id)}" aria-pressed="${S.handle===h.id}" ${ro?'disabled':''}>${esc(h.name)}</button>`).join('')}</div></div>
      ${S.handles.map((h,i)=>`<fieldset class="cw-gl"><legend>${esc(h.name)}</legend><label class="cw-f wide"><span>Name</span><input data-p="handles.${i}.name" data-kind="text" value="${esc(h.name)}" ${ro?'disabled':''}></label>
        <label class="cw-f"><span>Hole spacing, centre to centre (0 = one hole)</span><input data-p="handles.${i}.cc" data-kind="len" value="${esc(prec(h.cc))}" ${ro?'disabled':''}><i>${unitSign()}</i></label>
        <label class="cw-f"><span>Hole</span><input data-p="handles.${i}.dia" data-kind="len" value="${esc(prec(h.dia))}" ${ro?'disabled':''}><i>${unitSign()}</i></label></fieldset>`).join('')}
      ${ro?'':'<button class="btn ghost sm" id="cwAddHandle">Add a handle</button>'}`;
    if(f.kind==='ply') return `<div class="cw-f"><span>${f.label}</span><div class="seg">${['1/2','5/8'].map(n=>`<button data-p="${f.path}" data-v="${n}" aria-pressed="${v===n}" ${ro?'disabled':''}>${n==='1/2'?'½″':'⅝″'}</button>`).join('')}</div></div>`;
    if(f.kind==='glide') return `<div class="cw-f wide"><span>${f.label}</span><div class="seg wrap">${Object.entries(S.glides).map(([k,g])=>`<button data-p="glide" data-v="${k}" aria-pressed="${S.glide===k}" ${ro?'disabled':''}>${esc(g.name)}</button>`).join('')}</div></div>
      ${Object.entries(S.glides).map(([k,g])=>`<fieldset class="cw-gl"><legend>${esc(g.name)}</legend>
        <label class="cw-f"><span>Name</span><input data-p="glides.${k}.name" data-kind="text" value="${esc(g.name)}" ${ro?'disabled':''}></label>
        <label class="cw-f"><span>Clearance, both sides together</span><input data-p="glides.${k}.clear" data-kind="len" value="${esc(prec(g.clear))}" ${ro?'disabled':''}><i>${unitSign()}</i></label>
        <label class="cw-f"><span>Lengths (inches)</span><input data-p="glides.${k}.lens" data-kind="list" value="${g.lens.join(', ')}" ${ro?'disabled':''}></label>
        <label class="cw-f wide"><span>Drawer prep</span><input data-p="glides.${k}.prep" data-kind="text" value="${esc(g.prep)}" ${ro?'disabled':''}></label></fieldset>`).join('')}`;
    return `<label class="cw-f"><span>${f.label}</span><input data-p="${f.path}" data-kind="len" value="${esc(prec(v))}" inputmode="decimal" ${ro?'disabled':''}><i>${unitSign()}</i></label>`; };
  body.innerHTML=`<div class="cw-set">
    <div class="cw-set-h"><div class="seg"><button data-units="in" aria-pressed="${S.units==='in'}">Inches</button><button data-units="mm" aria-pressed="${S.units==='mm'}">Millimetres</button></div>
      <span class="note">${ro?'Viewers can look but not change these.':'Shared by the whole team. Changes apply to every cabinet, in every home.'}</span><span class="spacer"></span>
      ${ro?'':`<button class="btn ghost" id="cwReset">Back to defaults</button><button class="btn" id="cwSave">Save settings</button>`}</div>
    ${SECTIONS.map(([h,note,fs])=>`<section><h3>${h}</h3>${note?`<p class="note">${note}</p>`:''}<div class="cw-fs">${fs.map(field).join('')}</div></section>`).join('')}
  </div>`;
  const read=()=>{ body.querySelectorAll('input[data-p]').forEach(inp=>{ const k=inp.dataset.kind, p=inp.dataset.p;
      if(k==='text') setP(S,p,inp.value.trim());
      else if(k==='list') setP(S,p,inp.value.split(/[,\s]+/).map(Number).filter(x=>x>0));
      else if(k==='num'){ const n=parseInt(inp.value,10); if(n>0) setP(S,p,n); }
      else { const v=parseLen(inp.value); if(isFinite(v) && v>=0) setP(S,p,v); } }); };
  body.querySelector('#cwAddHandle')?.addEventListener('click', async()=>{ read(); S.handles.push({ id:'h'+Date.now().toString(36), name:'New handle', cc:128*MM, dia:5*MM }); await commit(S,false); renderSettings(body); });
  body.querySelectorAll('button[data-p]').forEach(b=>b.onclick=()=>{ read(); setP(S,b.dataset.p, b.dataset.bool ? b.dataset.v==='1' : b.dataset.v); b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed', x===b)); });
  body.querySelectorAll('[data-units]').forEach(b=>b.onclick=async()=>{ read(); S.units=b.dataset.units; await commit(S, false); renderSettings(body); });
  body.querySelector('#cwSave')?.addEventListener('click', async()=>{ read(); await commit(S, true); });
  body.querySelector('#cwReset')?.addEventListener('click', e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to reset'; return; } commit({...JSON.parse(JSON.stringify(DEFAULTS)), units:S.units}, true).then(()=>renderSettings(body)); });
}
async function commit(S, say){
  try{ await saveSettings(S); if(say) toast('Shop settings saved'); furnitureOf().forEach(refreshItem); renderSide(); }
  catch(e){ toast(`Couldn't save: ${e.message||e}`); }
}

/* ---------------------------------------------------------------- a placed item, in the side panel */
function furnSide(sideH, sideB){
  const it=furnById(state.selFurn); if(!it) return false;
  const d=itemDef(it.k), cat=catOf(d.cat), n=partsOf(it).filter(p=>!p.hw&&!p.solid).length, tot=totals([it]);
  sideH.innerHTML=`<button class="side-x" id="sideXf" title="Back to the whole home" aria-label="Back to the whole home">✕</button><div class="eyebrow">${esc(cat.name)}</div><h2>${esc(it.label||d.name)}${it.label?` <small class="muted">${esc(d.name)}</small>`:''}${canSave()?' <button class="linkbtn ren-link" id="fName">Name</button>':''}</h2><p>${sizeTxt(it)}${it.y?` · ${show(it.y)}${unitSign()} off the floor`:''}${n?` · ${n} parts · ${Object.entries(tot.area).map(([k,a])=>`${k}″ ${a.toFixed(1)} sq ft`).join(' · ')}`:''}</p>`;
  sideH.querySelector('#sideXf').onclick=()=>{ state.selFurn=null; applyFurniture(); renderSide(); };
  sideH.querySelector('#fName')?.addEventListener('click', async()=>{ const v=await askName({ title:`Name this ${d.name.toLowerCase()}`, current:it.label||'', placeholder:d.name, note:'Shown instead of the catalogue name in this home; the catalogue item stays the same.' });
    if(v===null) return; checkpoint(); ensureDraft(); const x=furnById(it.id); if(!x) return; if(v) x.label=v; else delete x.label; save(); renderSide(); toast(v?`Named “${v}”`:'Name cleared'); });
  const ed=canSave();
  const iso=state.isolate==='furn:'+it.id;
  sideB.innerHTML=`<div class="row"><button class="btn" id="fOpen">3D, exploded &amp; parts</button><button class="btn ghost" id="fIso" aria-pressed="${iso}">${iso?'Exit isolate':'Isolate'}</button></div>
    ${iso?'<p class="note">Spread three fingers (or press <b>Exploded view</b>) to take it apart right here; pinch to put it back.</p>':''}
    ${ed?`<div class="row"><button class="btn ghost sm" id="fTurn">Turn 90°</button><button class="btn ghost sm" id="fMir" aria-pressed="${!!it.mirror}">Mirror</button><button class="btn ghost sm" id="fDup">Duplicate</button><button class="btn ghost sm" id="fRm">Remove</button></div>`:''}
    <div class="cw-sizes compact">
      ${['w','h','d','y'].map(k=>`<label class="cw-f"><span>${{w:'Width',h:'Height',d:'Depth',y:'Off the floor'}[k]}</span><input data-fl="${k}" value="${esc(show(it[k]||0))}" inputmode="decimal" ${!ed||(d.fixed&&k!=='y')?'disabled':''}><i>${unitSign()}</i></label>`).join('')}
    </div>
    ${(d.opts||[]).map(([k,l,vals])=>`<div class="cw-opt"><span>${l}</span><div class="seg wrap">${vals.map(v=>`<button data-fo="${k}" data-v="${esc(v)}" aria-pressed="${String((it.opt||{})[k] ?? d.opt?.[k])===String(v)}" ${ed?'':'disabled'}>${esc(v)}</button>`).join('')}</div></div>`).join('')}
    <p class="note">Drag it in the plan (Build) to move it along the walls; it backs onto the nearest wall and butts up to the cabinets beside it.${it.wall?' Its depth counts for the pot lights along this wall.':''}</p>`;
  const ch=patch=>{ updateItem(it.id, patch); if(d.sized && patch.opt) Object.assign(it, d.sized(it)); refreshItem(it); renderSide(); };
  sideB.querySelector('#fOpen').onclick=()=>openCaseLib({edit:it.id});
  sideB.querySelector('#fIso').onclick=()=>{ setIsolate(iso?null:'furn:'+it.id, d.name); renderSide(); };
  sideB.querySelector('#fTurn')?.addEventListener('click',()=>{ turnItem(it.id); refreshItem(it); renderSide(); });
  sideB.querySelector('#fMir')?.addEventListener('click',()=>{ ch({mirror:!it.mirror}); toast(it.mirror?'Mirrored':'Back as drawn'); });
  sideB.querySelector('#fDup')?.addEventListener('click',()=>{ const c=duplicateItem(it.id); state.selFurn=c.id; refreshItem(c); applyFurniture(); renderSide(); toast('Duplicated · drag it where it goes'); });
  sideB.querySelector('#fRm')?.addEventListener('click',e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to remove'; return; } removeItem(it.id); refreshItem({id:it.id}); renderSide(); toast('Removed'); });
  sideB.querySelectorAll('[data-fl]').forEach(inp=>inp.onchange=()=>{ const v=parseLen(inp.value); if(isFinite(v) && v>=0) ch({[inp.dataset.fl]:v}); else inp.value=show(it[inp.dataset.fl]||0); });
  sideB.querySelectorAll('[data-fo]').forEach(b=>b.onclick=()=>{ const raw=b.dataset.v; ch({opt:{...(it.opt||{}), [b.dataset.fo]:isNaN(+raw)?raw:+raw}}); });
  return true;
}
/* the home's cabinets, for the home overview */
function homeBlock(){
  const L=furnitureOf(); const t=totals(L);
  return `<div class="cw-home"><div class="eyebrow">Cabinets &amp; furniture</div>
    <p>${L.length ? `${L.length} item${L.length>1?'s':''}${Object.keys(t.area).length?` · ${Object.entries(t.sheets).map(([n,s])=>`${s} sheet${s>1?'s':''} of ${n}″`).join(' · ')} · ${t.bandFt} ft edge band`:''}` : 'None yet. Drag them in from the tray in Build, or add one from the library.'}</p>
    <div class="row"><button class="btn ghost sm" id="cwLib">Cabinet library</button>${L.some(x=>partsOf(x).some(p=>!p.hw&&!p.solid))?'<button class="btn ghost sm" id="cwAll">Cut list for the home (CSV)</button>':''}</div></div>`;
}
function bindHomeBlock(root){
  root.querySelector('#cwLib')?.addEventListener('click',()=>openCaseLib());
  root.querySelector('#cwAll')?.addEventListener('click',()=>{ const L=furnitureOf(); download(`cabinets-${state.model}.csv`, L.map((it,i)=>csv(it, `${i+1}. ${itemDef(it.k).name}`)).join('\n\n')); });
}
export { openCaseLib, furnSide, homeBlock, bindHomeBlock, parseLen };
/* ⋯ menu → Cabinet library (and the Homes window on a phone) */
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bCabLib')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bCabLib'; b.textContent='Cabinet library';
    pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openCaseLib(); }; }
  const hp=document.getElementById('hProjects');
  if(hp && !document.getElementById('hCabLib')){ const b=document.createElement('button'); b.className='btn ghost'; b.id='hCabLib'; b.textContent='Cabinets';
    hp.after(b); b.onclick=()=>{ document.getElementById('homeDlg')?.close(); openCaseLib(); }; } }
