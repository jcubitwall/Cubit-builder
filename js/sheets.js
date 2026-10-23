/* Cubit Builder — sheets.js */
import { FT, H, PW, T, FRAME, FLOOR_BUILD } from './config.js';
import { MODELS } from './data.js';
import { fft, fin } from './format.js';
import { renderFoundation } from './foundation.js';
import { renderConcreteSheet } from './concretesheet.js';
import { foundationOf } from './state.js';
import { screwsFor, slotsFor, layerSlotsFor, deckList, podList } from './layout.js';
import { renderDeckSheet, renderDecksTakeoff } from './decksheet.js';
import { renderFramingSheet, wallFramingHTML } from './framesheet.js';
import { wallFraming, floorBuild } from './framing.js';
import { takeoffHTML } from './takeoff.js';
import { renderShop } from './shop.js';
import { renderCncSheet } from './cncsheet.js';
import { LAYER_KINDS } from './config.js';
import { panelCount, panelNum, wallLen, panelSpans, panelAt, bodyWall, layerHoles } from './panels.js';
import { buildWallMesh, resize } from './scene3d.js';
import { unitFor, symbol, unitLabel, pairOf, doorOwner } from './units.js';
const sheetSlotNow = () => slotsFor(state.model).find(x=>x.id===state.sheetSlot);
import { wallListHTML } from './sidebar.js';
import { pickFor, pickLayer, state, setFace } from './state.js';
import { panelPlan, homePlans, stackTableHTML, labelsPDF, faceFor, faceShort } from './labels.js';
import { toast } from './sidebar.js';

/* ============================================================ assembly sheets */
const sheetsEl=document.getElementById('sheets'), studioEl=document.getElementById('studio');
let w3=null;
function openSheets(){
  state.view='sheets'; sheetsEl.hidden=false; studioEl.hidden=true; document.getElementById('studioTools').hidden=true;
  document.getElementById('planner').hidden=true; document.getElementById('bPlan').textContent='Plan & pods';
  document.getElementById('bSheets').textContent='Back to 3D';
  const slots=slotsFor(state.model);
  if(!['__found','__labels','__cnc','__decks','__frame','__take','__shop'].includes(state.sheetSlot) && !/^__deck:\d+$/.test(state.sheetSlot||'') && !slots.find(s=>s.id===state.sheetSlot) && !layerSlotsFor(state.model).find(l=>l.id===state.sheetSlot)) state.sheetSlot=slots[0].id;
  renderSheetList(); renderSheet();
}
function closeSheets(){
  state.view='studio'; sheetsEl.hidden=true; studioEl.hidden=false; document.getElementById('studioTools').hidden=false;
  document.getElementById('bSheets').textContent='Assembly sheets'; resize();
}
const esc = t => String(t).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderSheetList(){
  const el=document.getElementById('sheetList'); const slots=slotsFor(state.model);
  const nS=screwsFor(state.model,state.inset).length;
  el.innerHTML=`<div class="side-h"><div class="eyebrow">${MODELS[state.model].name} · ${slots.length} walls</div></div>`+
    `<details class="podgrp" ${!state.sheetSlot||String(state.sheetSlot).startsWith('__')?'open':''}><summary class="podhead">Whole home<span>take-off · shop · CNC</span></summary><div class="wl"><button class="${state.sheetSlot==='__take'?'on':''}" data-s="__take"><span class="n">Take-off · by build stage</span><span class="l">everything</span><span class="o">Foundation → floor → walls → roof → decks → windows → fasteners</span></button><button class="edit-only ${state.sheetSlot==='__shop'?'on':''}" data-s="__shop"><span class="n">Shopping list</span><span class="l">to buy</span><span class="o">Tick off as it's bought · share with the supplier</span></button><button class="${state.sheetSlot==='__found'?'on':''}" data-s="__found">${foundationOf(state.model)==='concrete'?`<span class="n">Foundation · concrete ICF</span><span class="l">footing + ICF</span><span class="o">Plan, section and takeoff for the concrete crew</span>`:`<span class="n">Foundation · ground screws</span><span class="l">${nS} screws</span><span class="o">Site plan with every screw located</span>`}</button><button class="${state.sheetSlot==='__labels'?'on':''}" data-s="__labels"><span class="n">Panel labels · cut &amp; stack</span><span class="l">all walls</span><span class="o">Stacking order, CNC flips, printable labels</span></button><button class="${state.sheetSlot==='__cnc'?'on':''}" data-s="__cnc"><span class="n">CNC cut files · G-code</span><span class="l">.tap for ShopSabre</span><span class="o">Every panel, ready for the CNC · DXF for VCarve too</span></button><button class="${state.sheetSlot==='__frame'?'on':''}" data-s="__frame"><span class="n">Framing · cut list</span><span class="l">lumber + LVL</span><span class="o">Plates, studs, jacks, splines, LVL rims · what to buy</span></button>${deckList(state.model).length?`<button class="${state.sheetSlot==='__decks'?'on':''}" data-s="__decks"><span class="n">Decks · lumber takeoff</span><span class="l">${deckList(state.model).length} deck${deckList(state.model).length>1?'s':''}</span><span class="o">Every piece of 2×8, boards to buy, spines</span></button>`:''}${deckList(state.model).map(d=>`<button class="${state.sheetSlot==='__deck:'+d.k?'on':''}" data-s="__deck:${d.k}"><span class="n">Deck ${d.k+1} · framing</span><span class="l">${d.L.w}′ × ${d.L.d}′</span><span class="o">${d.L.id} · framing plan, takeoff</span></button>`).join('')}</div></details>`+
    wallListHTML(slots,state.sheetSlot);
  el.querySelectorAll('.wl button').forEach(b=>{ const o=b.querySelector('.o'); if(o && !b.title) b.title=o.textContent;
    b.onclick=()=>{ state.sheetSlot=b.dataset.s; el.classList.remove('open'); renderSheetList(); renderSheet(); window.scrollTo(0,0); }; });
  // phone: the list folds into one picker button; tap it for the full list
  const cur=el.querySelector('.wl button.on'), pod=cur?.closest('details.podgrp')?.querySelector('summary')?.childNodes[0]?.textContent?.trim();
  const name=cur ? (cur.querySelector('.n')?.innerText||'').replace(/\s+/g,' ').trim() : 'Choose a sheet';
  el.insertAdjacentHTML('afterbegin', `<button class="sl-pick" aria-expanded="false"><span><small>${esc(pod && !String(state.sheetSlot).startsWith('__') ? pod : 'Sheet')}</small>${esc(name)}</span><svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`);
  el.querySelector('.sl-pick').onclick=()=>{ const on=el.classList.toggle('open'); el.querySelector('.sl-pick').setAttribute('aria-expanded',on); };
}
/* ‹ Prev · Next ›: step through every wall, floor and ceiling in the order of the list */
function addNav(el){
  const ids=[...document.querySelectorAll('#sheetList .wl button[data-s]')].map(b=>b.dataset.s).filter(id=>!id.startsWith('__'));
  const i=ids.indexOf(state.sheetSlot); if(i<0) return;
  const nm=id=>{ const b=document.querySelector(`#sheetList .wl button[data-s="${CSS.escape(id)}"] .n`); return b?b.textContent.trim():''; };
  const pod=id=>{ const sl=slotsFor(state.model).find(x=>x.id===id)||layerSlotsFor(state.model).find(x=>x.id===id); return sl?sl.pod.label:''; };
  el.insertAdjacentHTML('afterbegin', `<div class="sheet-nav"><button class="btn ghost" data-nav="-1" ${i===0?'disabled':''} aria-label="Previous">‹ Prev</button>
    <span><b>${pod(ids[i])} · ${nm(ids[i])}</b><small>${i+1} of ${ids.length}${ids[i+1]?` · next: ${pod(ids[i+1])} · ${nm(ids[i+1])}`:''}</small></span>
    <button class="btn" data-nav="1" ${i===ids.length-1?'disabled':''} aria-label="Next">Next ›</button></div>`);
  el.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{ const j=i+(+b.dataset.nav); if(!ids[j]) return; state.sheetSlot=ids[j]; renderSheetList(); renderSheet();
    const top=document.getElementById('sheet').getBoundingClientRect().top+scrollY-(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hh'))||0)-8;
    scrollTo({top:Math.max(0,top), behavior:'instant'}); document.querySelector('#sheetList .wl button.on')?.scrollIntoView({block:'nearest'}); });
}
function renderSheet(){
  const el=document.getElementById('sheet');
  if(state.sheetSlot==='__found'){ if(foundationOf(state.model)==='concrete') renderConcreteSheet(el); else renderFoundation(el); return; }
  if(state.sheetSlot==='__labels'){ renderLabelsHome(el); return; }
  if(state.sheetSlot==='__cnc'){ renderCncSheet(el); return; }
  if(state.sheetSlot==='__decks'){ renderDecksTakeoff(el); return; }
  if(state.sheetSlot==='__frame'){ renderFramingSheet(el); return; }
  if(state.sheetSlot==='__take'){ el.innerHTML=takeoffHTML(); return; }
  if(state.sheetSlot==='__shop'){ renderShop(el); return; }
  if(/^__deck:\d+$/.test(state.sheetSlot)){ renderDeckSheet(el, +state.sheetSlot.slice(7)); return; }
  const ls=layerSlotsFor(state.model).find(l=>l.id===state.sheetSlot);
  if(ls){ renderLayerSheet(el, ls); addNav(el); return; }
  const s=slotsFor(state.model).find(x=>x.id===state.sheetSlot); const w=bodyWall(s, pickFor(s));
  const isInt = s.type==='int';
  const faceA = isInt ? `Side A · faces ${s.pod.label}` : 'Front · interior side';
  const faceB = isInt ? `Side B · faces ${s.other.label}` : 'Back · exterior side';
  if(!w){ el.innerHTML='<p>No wall option exists for this length yet.</p>'; return; }
  const n=panelCount(w); const face=faceFor(s); state.face=face; state.reverse=false;
  const plan=panelPlan(s,w,face);
  el.innerHTML=`
    <div class="sheet-title">
      <div><div class="eyebrow" style="color:#555">Assembly sheet · Cubit Home</div><h3>${s.label} · ${s.detail} — ${w.id}</h3></div>
      <div class="meta">${MODELS[state.model].name} · ${fft(wallLen(w))} × ${fft(H)} · ${n} panels (${panelSpans(w).map(([a,b])=>fin(b-a)).reverse().join(' + ')}) · ${isInt?'Interior':'Exterior'} wall ${fin(w.t||T)}<br>${new Date().toISOString().slice(0,10)}</div>
    </div>
    <div class="sheet-tools">
      <span style="font-size:13px;color:#333">Facing the assemblers:</span>
      <span class="seg" role="group" aria-label="Side facing the assemblers"><button data-face="int" aria-pressed="${face==='int'}">${faceA}</button><button data-face="ext" aria-pressed="${face==='ext'}">${faceB}</button></span>
      <button class="btn ghost" id="wallLabels" style="color:#111;border-color:#cfd4cc">Labels for this wall (PDF)</button>
    </div>
    <div><span class="facebadge ${face}">${(face==='int'?faceA:faceB).toUpperCase()}</span><span style="font-size:12.5px;color:#333">${isInt?'Plug and switch boxes on this side shown.':face==='int'?'Boxes for plugs and switches shown. Openings shown as seen from inside.':'Openings and outside plugs and lights only.'} Assemble left → right: <b>${plan.seq.map(p=>p.num).join(' → ')}</b>. Stack with ${plan.seq[0].code} on top.</span></div>
    <div class="elev">${elevationSVG(w,face,false,s)}</div>
    <div id="wall3d" class="w3full"><span class="w3cap">3D · panels pulled apart · drag to turn</span></div>
    <div class="tblwrap"><div class="eyebrow" style="color:#555;margin-bottom:4px">Cut &amp; stack · ShopSabre</div>${stackTableHTML(plan)}</div>
    <div class="tblwrap">${boxTable(w,face,s)}</div>
    <div class="tblwrap"><div class="eyebrow" style="color:#555;margin:10px 0 4px">Framing · this wall</div>${wallFramingHTML(wallFraming(s, pickFor(s)))}</div>`;
  el.querySelectorAll('[data-face]').forEach(b=>b.onclick=()=>{ setFace(s,b.dataset.face); renderSheet(); });
  el.querySelector('#wallLabels').onclick=()=>downloadBlob(labelsPDF([plan], MODELS[state.model].name), `${MODELS[state.model].name} - ${plan.slot.pod.label} Wall ${plan.slot.letter} labels.pdf`);
  buildWall3D(w);
  addNav(el);
}

function boxTable(w,face,slot){
  const L=wallLen(w);
  // positions in the current view, measured from the left end as seen in this view
  const ops=w.openings.map(o=>({...o, vx: face==='ext'? o.x : L-o.x-o.w}));
  const items = face==='int' ? w.inside.map(b=>({...b,vx:b.x})) : w.outside.map(b=>({...b,vx:b.x}));
  const names={outlet:(face==='int'||w.type==='int')?'Plug box':'Outside plug (WP)',switch:'Switch box',light:'Outside light',data:'Data box'};
  let h=`<table class="boxes"><thead><tr><th>Item</th><th>From left end</th><th>Height</th><th>Size</th><th>Panel</th><th>Unit</th></tr></thead><tbody>`;
  const n=panelCount(w);
  const pn = vx => panelNum(n, panelAt(w, face==='ext' ? vx : L-vx), false);
  ops.sort((a,b)=>a.vx-b.vx).forEach(o=>{ h+=`<tr><td>${o.kind==='window'?'Window opening':o.kind==='door'?'Door opening':o.kind==='opening'?'Cased opening':o.kind==='vent'?'Vent / duct hole':'Patio door opening'}</td><td>${fin(o.vx)}</td><td>sill ${fin(o.y)}</td><td>${fin(o.w)} × ${fin(o.h)}</td><td>${pn(o.vx+o.w/2)}</td><td>${(()=>{ const r=unitFor(slot,o); return r?`${r.unit.id} · ${unitLabel(r)}`:(o.kind==='window'||o.kind==='door'||o.kind==='patio'?'<i>not chosen</i>':'—'); })()}</td></tr>`; });
  items.sort((a,b)=>a.vx-b.vx).forEach(b=>{ h+=`<tr><td>${names[b.kind]||b.kind}</td><td>${fin(b.vx)} (centre)</td><td>${fin(b.y)}</td><td>—</td><td>${pn(b.vx)}</td><td></td></tr>`; });
  return h+`</tbody></table>`;
}
function elevationSVG(w,face,rev,slot){
  const L=wallLen(w), n=panelCount(w), spans=panelSpans(w);
  const s=Math.min(6, 900/L), Wd=L*s, Hd=H*s, ml=90, mt=110, mr=90, mb=130;
  const VW=Wd+ml+mr, VH=Hd+mt+mb;
  const X = x => ml + x*s;                      // view x (inches from view-left) -> svg
  const Y = y => mt + (H-y)*s;
  const vx = (x,wd=0) => face==='ext' ? x : L-x-wd;   // exterior coords -> view coords
  let g=`<svg viewBox="0 0 ${VW} ${VH}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Wall elevation">`;
  g+=`<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#2f6db5"/></marker>
      <pattern id="foam" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f1e4c8"/><circle cx="2" cy="2" r=".8" fill="#e2cfa6"/><circle cx="6" cy="6" r=".8" fill="#e2cfa6"/></pattern></defs>`;
  // panels (drawn in view order; panel 1 = full panel at the inside-left end, the last one is cut to fit)
  for(let kv=0;kv<n;kv++){
    const [a,b]=spans[kv]; const va = face==='ext' ? a : L-b, vb = face==='ext' ? b : L-a;
    const x0=X(va), pw=(vb-va)*s;
    g+=`<rect x="${x0}" y="${Y(H)}" width="${pw}" height="${Hd}" fill="url(#foam)" stroke="#111" stroke-width="1.4"/>`;
    const num=panelNum(n,kv,rev);
    g+=`<circle cx="${x0+pw/2}" cy="${mt-58}" r="19" fill="#fff" stroke="#d0661f" stroke-width="3"/><text x="${x0+pw/2}" y="${mt-51}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="800" font-size="21" fill="#111">${num}</text>`;
    g+=`<text x="${x0+pw/2}" y="${Y(H/2)}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="800" font-size="${Math.min(70,pw*0.55)}" fill="#111" opacity=".09">${num}</text>`;
    if(vb-va < PW-0.01) g+=`<text x="${x0+pw/2}" y="${Y(H)+14}" text-anchor="middle" font-size="10" fill="#b4520f" font-weight="600">CUT ${fin(vb-va)}</text>`;
  }
  // steel spine notches at pod corners (outside face, full height)
  const [nl,nr]=w.notch||[0,0];
  [[0,nl],[L-nr,nr]].forEach(([x,nw])=>{ if(!nw) return;
    const va=vx(x,nw), out=face==='ext';
    g+=`<rect x="${X(va)}" y="${Y(H)}" width="${nw*s}" height="${Hd}" fill="${out?'#ffffff':'none'}" stroke="#7a3fb0" stroke-width="1.2" ${out?'':'stroke-dasharray="5 3"'}/>`;
    g+=`<text transform="translate(${X(va)+nw*s/2+3} ${Y(H/2)}) rotate(-90)" text-anchor="middle" font-size="9.5" fill="#7a3fb0" font-weight="600">SPINE NOTCH ${fin(nw)} × ${fin(nw)}${out?'':' (OUTSIDE FACE)'}</text>`;
  });
  // install direction arrow
  const ltr = true;   // assembly always runs left to right as the assemblers see the wall
  g+=`<line x1="${X(ltr?6:L-6)}" y1="${mt-90}" x2="${X(ltr?L-6:6)}" y2="${mt-90}" stroke="#d0661f" stroke-width="2.2" marker-end="url(#ar)" style="color:#d0661f"/>`;
  g+=`<text x="${X(ltr?6:L-6)}" y="${mt-96}" text-anchor="${ltr?'start':'end'}" font-size="12" fill="#d0661f" font-weight="600">ASSEMBLE LEFT → RIGHT</text>`;
  // panel chain dims (top)
  spans.forEach(([a,b])=>{ const va = face==='ext' ? a : L-b, vb = face==='ext' ? b : L-a; g+=dimH(X(va),X(vb),mt-22,fin(vb-va),mt); });
  // framing lumber (plates, end studs, jacks) and the OSB splines at the joints, with which panel carries them
  if(slot){ const fr=wallFraming(slot, pickFor(slot));
    if(fr){ fr.pieces.filter(p=>p.kind!=='Spline').forEach(p=>{ const x=vx(p.x0,p.x1-p.x0);
        g+=`<rect x="${X(x)}" y="${Y(p.y1)}" width="${(p.x1-p.x0)*s}" height="${(p.y1-p.y0)*s}" fill="#e8c88f" fill-opacity=".85" stroke="#8a6a2f" stroke-width=".7"/>`; });
      const seen=new Set();
      fr.pieces.filter(p=>p.kind==='Spline' && p.face==='outside face').forEach(p=>{ const x=vx(p.x0,p.x1-p.x0);
        g+=`<rect x="${X(x)}" y="${Y(p.y1)}" width="${(p.x1-p.x0)*s}" height="${(p.y1-p.y0)*s}" fill="none" stroke="#7a4fa0" stroke-width="1" stroke-dasharray="4 3"/>`;
        if(!seen.has(p.joint)){ seen.add(p.joint); const jx=vx(p.joint,0);
          g+=`<text transform="translate(${X(jx)+3} ${Y(48)}) rotate(-90)" text-anchor="middle" font-size="8.5" fill="#7a4fa0" font-weight="600">SPLINES ON ${p.carrier}</text>`; } });
    } }
  // openings
  w.openings.forEach(o=>{
    const x=vx(o.x,o.w);
    if(o.kind==='vent'){   // small duct / vent hole: outline + a leader label, no dimension clutter
      g+=`<rect x="${X(x)}" y="${Y(o.y+o.h)}" width="${o.w*s}" height="${o.h*s}" fill="#bbbbbb" stroke="#111" stroke-width="1.2"/>`;
      return;
    }
    const pr = slot && (o.kind==='door'||o.kind==='patio') ? pairOf(slot,o) : null, openOnly = !!pr && doorOwner(slot,o).id!==slot.id;
    const col = openOnly ? '#ffffff' : o.kind==='window' ? '#cfe6f7' : o.kind==='door' ? (w.type==='int' ? '#ececea' : '#d9c3ac') : o.kind==='opening' ? '#ffffff' : o.kind==='vent' ? '#bbbbbb' : '#cfe6f7';
    g+=`<rect x="${X(x)}" y="${Y(o.y+o.h)}" width="${o.w*s}" height="${o.h*s}" fill="${col}" stroke="#111" stroke-width="1.6"/>`;
    const ur=openOnly ? null : unitFor(slot,o);
    if(openOnly){ /* just the rough opening: no door leaf, no cross */ }
    else if(ur){   // the unit's symbol (casement / door triangle points to the hinge, arrows on sliding panels), mirrored when seen from inside
      const sym=symbol(ur.unit.type, ur.hand, o.w, o.h), fx=v=> face==='ext' ? x+v : x+o.w-v;
      sym.segs.forEach(([a,b,c,d])=>{ g+=`<line x1="${X(fx(a))}" y1="${Y(o.y+b)}" x2="${X(fx(c))}" y2="${Y(o.y+d)}" stroke="#1c3d5a" stroke-width="1" stroke-dasharray="6 4"/>`; });
      sym.arrows.forEach(([a,b,c,d])=>{ g+=`<line x1="${X(fx(a))}" y1="${Y(o.y+b)}" x2="${X(fx(c))}" y2="${Y(o.y+d)}" stroke="#1c3d5a" stroke-width="1.4" marker-end="url(#ar)"/>`; });
    } else g+=`<line x1="${X(x)}" y1="${Y(o.y+o.h)}" x2="${X(x+o.w)}" y2="${Y(o.y)}" stroke="#111" stroke-width=".5"/><line x1="${X(x+o.w)}" y1="${Y(o.y+o.h)}" x2="${X(x)}" y2="${Y(o.y)}" stroke="#111" stroke-width=".5"/>`;
    const lbl = `${fin(o.w)} × ${fin(o.h)}`;
    g+=`<rect x="${X(x+o.w/2)-58}" y="${Y(o.y+o.h/2)-17}" width="116" height="${ur?42:30}" fill="#fff" stroke="#111" stroke-width=".6"/>`;
    if(ur) g+=`<text x="${X(x+o.w/2)}" y="${Y(o.y+o.h/2)+21}" text-anchor="middle" font-size="8.5" fill="#1c3d5a" font-weight="600">${ur.unit.id}${ur.unit.type==='casement'||ur.unit.type==='entry'?' · '+(ur.hand==='R'?'RH':'LH'):''}</text>`;
    g+=`<text x="${X(x+o.w/2)}" y="${Y(o.y+o.h/2)-3}" text-anchor="middle" font-size="11.5" font-weight="600">${lbl}</text>`;
    g+=`<text x="${X(x+o.w/2)}" y="${Y(o.y+o.h/2)+9}" text-anchor="middle" font-size="9.5" fill="#333">${o.kind==='window'?'sill '+fin(o.y):openOnly?`opening · door in ${pr.slot.pod.label}`:o.kind==='door'?'door R.O.':o.kind==='opening'?'cased opening':o.kind==='vent'?'vent @ '+fin(o.y):'patio R.O.'}</text>`;
    // vertical: sill + head on the right of opening
    if(o.y>0) g+=dimV(Y(0),Y(o.y),X(x+o.w)+14,fin(o.y),X(x+o.w));
    g+=dimV(Y(o.y),Y(o.y+o.h),X(x+o.w)+(o.y>0?34:14),fin(o.h),X(x+o.w));
  });
  const vents=w.openings.filter(o=>o.kind==='vent').map(o=>({...o,vx:vx(o.x,o.w)})).sort((a,b)=>a.vx-b.vx);
  vents.forEach((o,i)=>{
    g+=`<line x1="${X(o.vx+o.w/2)}" y1="${Y(o.y)}" x2="${X(o.vx+o.w/2)}" y2="${Y(o.y)+18+i*12}" stroke="#555" stroke-width=".6"/>`;
    const right = o.vx > L/2;
    g+=`<text x="${X(o.vx+o.w/2)+(right?-3:3)}" y="${Y(o.y)+22+i*12}" text-anchor="${right?'end':'start'}" font-size="9" fill="#333">vent ${fin(o.w)}×${fin(o.h)} · ${fin(o.vx)} from left · ${fin(o.y)} up</text>`;
  });
  // ordinate positions of opening edges from the view-left end (bottom)
  const edges=[...new Set(w.openings.filter(o=>o.kind!=='vent').flatMap(o=>{const x=vx(o.x,o.w); return [x,x+o.w];}).map(v=>Math.round(v*16)/16))].sort((a,b)=>a-b);
  let lastLx=-1e9;
  edges.forEach(e=>{ let lx=Math.max(X(e), lastLx+15); lastLx=lx;
    g+=`<line x1="${X(e)}" y1="${Y(0)+4}" x2="${X(e)}" y2="${Y(0)+18}" stroke="#2f6db5" stroke-width=".8"/><line x1="${X(e)}" y1="${Y(0)+18}" x2="${lx}" y2="${Y(0)+26}" stroke="#2f6db5" stroke-width=".8"/>`;
    g+=`<text transform="translate(${lx+4},${Y(0)+30}) rotate(90)" font-size="10.5" fill="#2f6db5">${fin(e)}</text>`; });
  if(edges.length) g+=`<text x="${X(0)-8}" y="${Y(0)+30}" text-anchor="end" font-size="9.5" fill="#2f6db5">from left ⟶</text>`;
  // boxes on this face
  const items = face==='int'? w.inside : w.outside;
  items.forEach(b=>{
    const x = b.x;  // inside items use interior-left coords, outside items exterior-left — both match the view
    const cx=X(x), cy=Y(b.y);
    if(b.kind==='switch'){ g+=`<rect x="${cx-7}" y="${cy-10}" width="14" height="20" fill="#2f6db5" stroke="#111"/><text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="10" fill="#fff" font-weight="700">S</text>`; }
    else if(b.kind==='light'){ g+=`<circle cx="${cx}" cy="${cy}" r="9" fill="#ffd34d" stroke="#111"/><text x="${cx}" y="${cy+3.5}" text-anchor="middle" font-size="9" font-weight="700">L</text>`; }
    else { const fill = (face==='int'||w.type==='int')?'#fff':'#2f8a57'; g+=`<rect x="${cx-7}" y="${cy-10}" width="14" height="20" rx="2" fill="${fill}" stroke="#111"/><line x1="${cx-3}" y1="${cy-5}" x2="${cx-3}" y2="${cy}" stroke="${(face==='int'||w.type==='int')?'#111':'#fff'}" stroke-width="1.6"/><line x1="${cx+3}" y1="${cy-5}" x2="${cx+3}" y2="${cy}" stroke="${(face==='int'||w.type==='int')?'#111':'#fff'}" stroke-width="1.6"/>`; }
    g+=`<text x="${cx}" y="${cy+24}" text-anchor="middle" font-size="9" fill="#333">${fin(x)} / ${fin(b.y)}</text>`;
  });
  // overall dims
  g+=dimH(X(0),X(L),Y(0)+92,`${fin(L)}  (${fft(L)})`,Y(0),13);
  g+=dimV(Y(0),Y(H),ml-36,`${fin(H)}`,X(0),13);
  g+=`<text x="${X(0)}" y="${VH-8}" font-size="10" fill="#555">Dimensions in inches · measured from the LEFT end as you look at this side · box labels = from left / height to centre</text>`;
  return g+'</svg>';
}
function dimH(x1,x2,y,txt,from,fs=10.5){
  let g=`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#2f6db5" stroke-width=".9" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
  if(from!==undefined){ [x1,x2].forEach(x=>g+=`<line x1="${x}" y1="${from+(y>from?3:-3)}" x2="${x}" y2="${y+(y>from?5:-5)}" stroke="#2f6db5" stroke-width=".5"/>`); }
  return g+`<text x="${(x1+x2)/2}" y="${y-4}" text-anchor="middle" font-size="${fs}" fill="#2f6db5">${txt}</text>`;
}
function dimV(y1,y2,x,txt,from,fs=10){
  let g=`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#2f6db5" stroke-width=".9" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
  if(from!==undefined){ [y1,y2].forEach(y=>g+=`<line x1="${from+(x>from?3:-3)}" y1="${y}" x2="${x+(x>from?5:-5)}" y2="${y}" stroke="#2f6db5" stroke-width=".5"/>`); }
  return g+`<text transform="translate(${x-4},${(y1+y2)/2}) rotate(-90)" text-anchor="middle" font-size="${fs}" fill="#2f6db5">${txt}</text>`;
}
function buildWall3D(w){
  const host=document.getElementById('wall3d'); if(!host) return;
  if(!w3){
    const r=new THREE.WebGLRenderer({antialias:true}); r.setPixelRatio(Math.min(devicePixelRatio,2));
    const sc=new THREE.Scene(); sc.background=new THREE.Color(0xeef0ec);
    sc.add(new THREE.HemisphereLight(0xffffff,0x8a8a80,0.9)); const d=new THREE.DirectionalLight(0xffffff,0.6); d.position.set(10,20,15); sc.add(d);
    const d2=new THREE.DirectionalLight(0xffffff,0.4); d2.position.set(-10,10,-15); sc.add(d2);
    const cam=new THREE.PerspectiveCamera(35,1,0.3,300); const ctl=new THREE.OrbitControls(cam,r.domElement); ctl.enableDamping=true;
    w3={renderer:r,scene:sc,camera:cam,controls:ctl,obj:null};
  }
  host.appendChild(w3.renderer.domElement);
  const rect=host.getBoundingClientRect(); w3.renderer.setSize(rect.width,rect.height,false); w3.camera.aspect=rect.width/rect.height; w3.camera.updateProjectionMatrix();
  if(w3.obj) w3.scene.remove(w3.obj);
  const mat=new THREE.MeshStandardMaterial({color:0xc9a46a,roughness:0.85});
  const zNum = state.face==='int' ? -((w.t||T)/FT)-0.4 : 0.4;
  const built=buildWallMesh(w,mat,{nums:true,reverse:state.reverse,numSize:1.3,numZ:zNum,unitOf:o=>unitFor(sheetSlotNow(),o),openOnly:o=>{ const sl=sheetSlotNow(), pr=sl&&pairOf(sl,o); return !!pr && doorOwner(sl,o).id!==sl.id; }});
  const L=wallLen(w)/FT, gap=0.6;
  // pull panels apart; move loose items with their panel
  built.group.children.forEach(c=>{ const k=c.userData.k; if(k!==undefined) c.position.x += k*gap; });
  const wrap=new THREE.Group(); wrap.add(built.group);
  const totalW=L+(panelCount(w)-1)*gap; built.group.position.set(-totalW/2,-4,0);
  w3.obj=wrap; w3.scene.add(wrap);
  const dist=totalW*1.05+8; const side = state.face==='int' ? -1 : 1;
  w3.camera.position.set(totalW*0.25*side, 3, dist*side); w3.controls.target.set(0,0,0);
}
window.addEventListener('resize',()=>{ if(state.view==='sheets'&&w3){ const h=document.getElementById('wall3d'); if(!h) return; const r=h.getBoundingClientRect(); w3.renderer.setSize(r.width,r.height,false); w3.camera.aspect=r.width/r.height; w3.camera.updateProjectionMatrix(); } });

export { renderLayerSheet, renderLabelsHome, downloadBlob, sheetsEl, w3, openSheets, closeSheets, renderSheetList, renderSheet, boxTable, elevationSVG, dimH, dimV, buildWall3D, studioEl };

/* ---------- whole home: cut & stack overview + all labels ---------- */
function renderLabelsHome(el){
  const plans=homePlans(); const name=MODELS[state.model].name;
  const flips=plans.reduce((a,pl)=>a+pl.panels.filter(p=>p.flip!=='none').length,0);
  const total=plans.reduce((a,pl)=>a+pl.n,0);
  let rows='';
  plans.forEach(pl=>{
    const s=pl.slot;
    rows+=`<tr><td><b>${s.label}</b><br><span style="color:#555;font-size:11.5px">${s.detail} · ${pl.w.id}</span></td>
      <td><span class="seg" role="group" aria-label="Side facing the assemblers"><button data-sid="${s.id}" data-f="int" aria-pressed="${pl.assembly==='int'}">${faceShort(s,'int')}</button><button data-sid="${s.id}" data-f="ext" aria-pressed="${pl.assembly==='ext'}">${faceShort(s,'ext')}</button></span></td>
      <td>${pl.seq.map(p=>p.num).join(' → ')}</td><td>${pl.seq.map(p=>p.code).join(', ')}</td>
      <td>${pl.panels.filter(p=>p.flip!=='none').map(p=>`<b class="flipflag">${p.code}</b>`).join(', ')||'—'}</td></tr>`;
  });
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Shop sheet · Cubit Home</div><h3>${name} — panel labels, cut &amp; stack</h3></div>
      <div class="meta">${total} panels · ${plans.length} walls · ${flips} to flip<br>${new Date().toISOString().slice(0,10)}</div></div>
    <div class="sheet-tools"><button class="btn" id="allLabels">Download all labels (PDF)</button>
      <span style="font-size:12.5px;color:#333">Labels print on Avery 5163 / 8163 sheets (2 × 5, 4″ × 2″). The first pages are the cut &amp; stack list.</span></div>
    <div class="note" style="color:#333;font-size:13px;line-height:1.5">
      <b>Label code</b> = pod number + wall letter + panel number, e.g. <b>3B-4</b> is Pod 3, Wall B, panel 4.
      Panel 1 is always the left end seen from the interior (side A on a wall between pods).
      Walls are assembled <b>left → right</b> as the assemblers see them, so with the exterior facing up the order runs ${'6 → 1'}.
      Each wall's panels are stacked with the first one needed on top.
      A panel is <b class="flipflag">flipped</b> when its box cut-outs are on the face that must be down for assembly — the CNC cuts that face up, then the panel is turned over before stacking.</div>
    <div class="tblwrap"><table class="boxes"><thead><tr><th>Wall</th><th>Facing the assemblers</th><th>Assembly order</th><th>Stack, top → bottom</th><th>Flip before stacking</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  el.querySelectorAll('[data-sid]').forEach(b=>b.onclick=()=>{ const s=slotsFor(state.model).find(x=>x.id===b.dataset.sid); setFace(s,b.dataset.f); renderLabelsHome(el); });
  el.querySelector('#allLabels').onclick=()=>downloadBlob(labelsPDF(plans,name), `${name} - panel labels.pdf`);
}
function downloadBlob(blob, name){
  if(window.claude && window.claude.use){
    window.claude.use('downloads').then(dl=>{ if(!dl){ toast('Downloads are not available here.'); return; } dl.save({filename:name, data:blob}).then(()=>toast('Saved')).catch(e=>{ if(!e||e.code!=='declined') toast('Could not save the file here.'); }); });
    return;
  }
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); toast('Downloaded');
}

/* the floor cassette, step by step (from the shop's K24 floor model) */
function floorBuildHTML(ls){
  const p=podList(state.model)[ls.pod.i]; if(!p) return '';
  const B=floorBuild(p), t=FRAME.lvl.t, L=p.len*FT, F=FLOOR_BUILD;
  const longs=B.epsLens.slice(2), cnt={}; longs.forEach(l=>{ const k=fin(l); cnt[k]=(cnt[k]||0)+1; });
  return `<div class="tblwrap" style="margin-top:14px"><div class="eyebrow" style="color:#555;margin-bottom:6px">Floor cassette · build sequence · ${esc(p.label)}</div>
    <ol class="build-seq">
      <li><b>Interior floor</b> panels on the assembly frame, <b>room side down</b> (against the frame). Start at the left, the squaring edge.</li>
      <li><b>LVL rims 1⅞″ × ${fin(FRAME.lvl.floor)}</b> all round, sitting in the panels' edge rebate: 2 × ${fin(L-2*t)} along the sides and 2 × ${fin(96-2*t)} across the ends, leaving the 1⅞″ corner squares open for the Einspines.</li>
      <li><b>EPS strips 8″ × 1½″</b> all round against the rims (this makes the 1½″ gap): 2 × ${fin(96-2*t)} across the ends (¼″ off the rim), then along each side ${Object.entries(cnt).map(([k,n])=>`${n/2} × ${k}`).join(' + ')}, the short piece first.</li>
      <li><b>2×4 blocks 16″</b>, laid flat in the gap across every panel joint, two per joint at ${F.block.at.map(fin).join(' and ')} across the floor: ${B.blocks.length} blocks.</li>
      <li><b>Exterior floor</b> panels on top, into the rims.</li>
    </ol></div>`;
}
/* ---------- floor / ceiling layer sheet: plan from above, panels, holes ---------- */
function renderLayerSheet(el, ls){
  const L=pickLayer(ls), K=LAYER_KINDS[ls.kind], len=L.len*FT, wid=96;
  const cuts=[0,...(L.seams&&L.seams.length?L.seams:[...Array(Math.ceil(len/PW)-1)].map((_,i)=>(i+1)*PW)),len];
  const panels=cuts.slice(0,-1).map((a,i)=>[a,cuts[i+1]]);
  // which face the assemblers see on the upright table: the room side or the outside. Floors show their room
  // side from above, ceilings and the roof from below; seen from below the drawing is mirrored. Assembly always
  // starts at the left (the squaring edge), so the order runs 1 → n or n → 1. Panel numbers stay with the panels.
  // the interior floor is built room side down on the assembly frame (its back face, toward the gap, faces the crew)
  const face = state.faces?.[state.model]?.[ls.id] || (ls.kind==='floor-int' ? 'ext' : 'int'), isFloor = ls.kind.startsWith('floor');
  const below = isFloor ? face==='ext' : face==='int';
  const s=Math.min(3.2, 900/len), ml=70, mt=90, VW=len*s+ml+60, VH=wid*s+mt+90;
  const X=x=>ml+(below?len-x:x)*s, Y=z=>mt+z*s;
  const order = below ? panels.map((_,i)=>i+1).reverse() : panels.map((_,i)=>i+1);
  let g=`<svg viewBox="0 0 ${VW} ${VH}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Layer plan"><defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#2f6db5"/></marker></defs>`;
  panels.forEach(([a,b],i)=>{
    g+=`<rect x="${Math.min(X(a),X(b))}" y="${Y(0)}" width="${(b-a)*s}" height="${wid*s}" fill="#efe9da" stroke="#111" stroke-width="1.3"/>`;
    g+=`<circle cx="${X((a+b)/2)}" cy="${mt-44}" r="16" fill="#fff" stroke="#d0661f" stroke-width="3"/><text x="${X((a+b)/2)}" y="${mt-38}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="800" font-size="17">${i+1}</text>`;
    g+=dimH(Math.min(X(a),X(b)),Math.max(X(a),X(b)),mt-14,fin(b-a),Y(0),10);
    if(b-a<PW-0.01) g+=`<text x="${X((a+b)/2)}" y="${Y(wid/2)}" text-anchor="middle" font-size="11" fill="#b4520f" font-weight="600">CUT ${fin(b-a)}</text>`;
  });
  const HOLES=layerHoles(L);
  HOLES.forEach((h,i)=>{ if(!h.notch) return;
    g+=`<rect x="${Math.min(X(h.x),X(h.x+h.w))}" y="${Y(h.z)}" width="${h.w*s}" height="${h.d*s}" fill="#fff" stroke="#7a3fb0" stroke-width="1.4"/>`; });
  (L.holes||[]).forEach((h,i)=>{
    g+=`<rect x="${Math.min(X(h.x),X(h.x+h.w))}" y="${Y(h.z)}" width="${h.w*s}" height="${h.d*s}" fill="#fff" stroke="#c0392b" stroke-width="1.4"/>`;
    g+=`<text x="${X(h.x+h.w/2)}" y="${Y(h.z+h.d/2)+4}" text-anchor="middle" font-size="10" fill="#c0392b" font-weight="700">H${i+1}</text>`;
  });
  g+=dimH(X(0),X(len),Y(wid)+40,`${fin(len)} (${fft(len)})`,Y(wid),12);
  g+=dimV(Y(0),Y(wid),ml-26,fin(wid),X(0),11);
  g+=`<text x="${ml}" y="${VH-10}" font-size="10" fill="#555">${below?'Seen from BELOW (mirrored)':'Seen from above'} · x from the left end as you look at it, z from the top edge</text></svg>`;
  let t=`<table class="boxes"><thead><tr><th>Hole</th><th>From left end</th><th>From top edge</th><th>Size</th><th>Panel</th></tr></thead><tbody>`;
  (L.holes||[]).forEach((h,i)=>{ const pi=panels.findIndex(([a,b])=>h.x+h.w/2>=a&&h.x+h.w/2<b)+1; t+=`<tr><td>H${i+1}</td><td>${fin(below?len-h.x-h.w:h.x)}</td><td>${fin(h.z)}</td><td>${fin(h.w)} × ${fin(h.d)}</td><td>${pi}</td></tr>`; });
  if(!(L.holes||[]).length) t+=`<tr><td colspan="5">No holes in this layer.</td></tr>`;
  if(HOLES.some(h=>h.notch)) t+=`<tr><td colspan="5" style="color:#7a3fb0">Steel spine notch ${fin(HOLES.find(h=>h.notch).w)} × ${fin(HOLES.find(h=>h.notch).w)} at ${HOLES.filter(h=>h.notch).length===4?'all four corners':'the corners shown'} (purple).</td></tr>`;
  t+=`</tbody></table>`;
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Layer sheet · Cubit Home</div><h3>${ls.label} — ${L.id}</h3></div>
      <div class="meta">${MODELS[state.model].name} · ${fft(len)} × 8′ · ${panels.length} panels · ${L.t||K.t}″ thick · ${fin(L.z??K.z)} up from the floor bottom<br>${new Date().toISOString().slice(0,10)}</div></div>
    <p class="note" style="color:#333">${L.name}${L.source?` · from ${L.source}`:''}${L.blank?' · placeholder: nothing scanned yet':''}</p>
    <div class="sheet-tools"><span style="font-size:13px;color:#333">Facing the assemblers:</span>
      <span class="seg" role="group" aria-label="Side facing the assemblers"><button data-lface="int" aria-pressed="${face==='int'}">Room side</button><button data-lface="ext" aria-pressed="${face==='ext'}">Outside</button></span></div>
    <div><span class="facebadge ${face}">${face==='int'?'ROOM SIDE':'OUTSIDE'} · ${below?'SEEN FROM BELOW':'SEEN FROM ABOVE'}</span><span style="font-size:12.5px;color:#333">Assemble left → right, starting at the squaring edge: <b>${order.join(' → ')}</b>. Stack with panel ${order[0]} on top, ${face==='int'?'room side':'outside'} face up, labels on that face.</span></div>
    <div class="elev">${g}</div>
    <div class="tblwrap">${t}</div>
    ${isFloor ? floorBuildHTML(ls) : ''}`;
  el.querySelectorAll('[data-lface]').forEach(b=>b.onclick=()=>{ setFace(ls, b.dataset.lface); renderSheet(); });
}
/* phone: tapping outside the open sheet list closes it */
document.addEventListener('pointerdown', e=>{ const el=document.getElementById('sheetList'); if(el?.classList.contains('open') && !el.contains(e.target)){ el.classList.remove('open'); el.querySelector('.sl-pick')?.setAttribute('aria-expanded','false'); } });
