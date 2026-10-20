/* Cubit Builder — sheets.js */
import { FT, H, PW, T } from './config.js';
import { MODELS } from './data.js';
import { fft, fin } from './format.js';
import { renderFoundation } from './foundation.js';
import { screwsFor, slotsFor } from './layout.js';
import { panelCount, panelNum } from './panels.js';
import { buildWallMesh, resize } from './scene3d.js';
import { wallListHTML } from './sidebar.js';
import { pickFor, state } from './state.js';

/* ============================================================ assembly sheets */
const sheetsEl=document.getElementById('sheets'), studioEl=document.getElementById('studio');
let w3=null;
function openSheets(){
  state.view='sheets'; sheetsEl.hidden=false; studioEl.hidden=true; document.getElementById('studioTools').hidden=true;
  document.getElementById('bSheets').textContent='Back to 3D';
  const slots=slotsFor(state.model);
  if(state.sheetSlot!=='__found' && !slots.find(s=>s.id===state.sheetSlot)) state.sheetSlot=slots[0].id;
  renderSheetList(); renderSheet();
}
function closeSheets(){
  state.view='studio'; sheetsEl.hidden=true; studioEl.hidden=false; document.getElementById('studioTools').hidden=false;
  document.getElementById('bSheets').textContent='Assembly sheets'; resize();
}
function renderSheetList(){
  const el=document.getElementById('sheetList'); const slots=slotsFor(state.model);
  const nS=screwsFor(state.model,state.inset).length;
  el.innerHTML=`<div class="side-h"><div class="eyebrow">${MODELS[state.model].name} · ${slots.length} walls</div></div>`+
    `<div class="wl"><button class="${state.sheetSlot==='__found'?'on':''}" data-s="__found"><span class="n">Foundation · ground screws</span><span class="l">${nS} screws</span><span class="o">Site plan with every screw located</span></button></div>`+
    wallListHTML(slots,state.sheetSlot);
  el.querySelectorAll('.wl button').forEach(b=>b.onclick=()=>{ state.sheetSlot=b.dataset.s; renderSheetList(); renderSheet(); });
}
function renderSheet(){
  const el=document.getElementById('sheet');
  if(state.sheetSlot==='__found'){ renderFoundation(el); return; }
  const s=slotsFor(state.model).find(x=>x.id===state.sheetSlot); const w=pickFor(s);
  const isInt = s.type==='int';
  const faceA = isInt ? `Side A · faces ${s.pod.label}` : 'Front · interior side';
  const faceB = isInt ? `Side B · faces ${s.other.label}` : 'Back · exterior side';
  if(!w){ el.innerHTML='<p>No wall option exists for this length yet.</p>'; return; }
  const n=panelCount(w); const face=state.face; const order=[...Array(n)].map((_,i)=>i+1); const seq = state.reverse? order.slice().reverse() : order;
  el.innerHTML=`
    <div class="sheet-title">
      <div><div class="eyebrow" style="color:#555">Assembly sheet · Cubit Home</div><h3>${s.label} — ${w.id} ${w.name}</h3></div>
      <div class="meta">${MODELS[state.model].name} · ${fft(w.len*FT)} × ${fft(H)} · ${n} panels @ 4′×8′ · ${isInt?'Interior':'Exterior'} wall ${fin(w.t||T)}<br>${new Date().toISOString().slice(0,10)}</div>
    </div>
    <div class="sheet-tools">
      <span class="seg" role="group" aria-label="Face"><button data-face="int" aria-pressed="${face==='int'}">${faceA}</button><button data-face="ext" aria-pressed="${face==='ext'}">${faceB}</button></span>
      <span class="seg" role="group" aria-label="Panel order"><button data-rev="0" aria-pressed="${!state.reverse}">Order 1 → ${n}</button><button data-rev="1" aria-pressed="${state.reverse}">Reverse ${n} → 1</button></span>
    </div>
    <div><span class="facebadge ${face}">${(face==='int'?faceA:faceB).toUpperCase()}</span><span style="font-size:12.5px;color:#333">${isInt?'Plug and switch boxes on this side shown.':face==='int'?'Boxes for plugs and switches shown. Openings shown as seen from inside.':'Openings and outside plugs and lights only.'} Install panels in number order, starting at 1 (follow the arrow).</span></div>
    <div class="elev">${elevationSVG(w,face,state.reverse)}</div>
    <div class="sheet-grid">
      <div id="wall3d"><span class="w3cap">3D · panels pulled apart · drag to turn</span></div>
      <div class="tblwrap">${boxTable(w,face)}</div>
    </div>`;
  el.querySelectorAll('[data-face]').forEach(b=>b.onclick=()=>{ state.face=b.dataset.face; renderSheet(); });
  el.querySelectorAll('[data-rev]').forEach(b=>b.onclick=()=>{ state.reverse=b.dataset.rev==='1'; renderSheet(); });
  buildWall3D(w);
}

function boxTable(w,face){
  const L=w.len*FT;
  // positions in the current view, measured from the left end as seen in this view
  const ops=w.openings.map(o=>({...o, vx: face==='ext'? o.x : L-o.x-o.w}));
  const items = face==='int' ? w.inside.map(b=>({...b,vx:b.x})) : w.outside.map(b=>({...b,vx:b.x}));
  const names={outlet:(face==='int'||w.type==='int')?'Plug box':'Outside plug (WP)',switch:'Switch box',light:'Outside light',data:'Data box'};
  let h=`<table class="boxes"><thead><tr><th>Item</th><th>From left end</th><th>Height</th><th>Size</th><th>Panel</th></tr></thead><tbody>`;
  const n=panelCount(w);
  const pn = vx => { const kExt = face==='ext' ? Math.floor(vx/PW) : Math.floor((L-vx)/PW); return panelNum(n,Math.min(n-1,Math.max(0,kExt)),state.reverse); };
  ops.sort((a,b)=>a.vx-b.vx).forEach(o=>{ h+=`<tr><td>${o.kind==='window'?'Window opening':o.kind==='door'?'Door opening':o.kind==='opening'?'Cased opening':'Patio door opening'}</td><td>${fin(o.vx)}</td><td>sill ${fin(o.y)}</td><td>${fin(o.w)} × ${fin(o.h)}</td><td>${pn(o.vx+o.w/2)}</td></tr>`; });
  items.sort((a,b)=>a.vx-b.vx).forEach(b=>{ h+=`<tr><td>${names[b.kind]||b.kind}</td><td>${fin(b.vx)} (centre)</td><td>${fin(b.y)}</td><td>—</td><td>${pn(b.vx)}</td></tr>`; });
  return h+`</tbody></table>`;
}
function elevationSVG(w,face,rev){
  const L=w.len*FT, n=panelCount(w);
  const s=Math.min(6, 900/L), Wd=L*s, Hd=H*s, ml=90, mt=110, mr=90, mb=130;
  const VW=Wd+ml+mr, VH=Hd+mt+mb;
  const X = x => ml + x*s;                      // view x (inches from view-left) -> svg
  const Y = y => mt + (H-y)*s;
  const vx = (x,wd=0) => face==='ext' ? x : L-x-wd;   // exterior coords -> view coords
  let g=`<svg viewBox="0 0 ${VW} ${VH}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Wall elevation">`;
  g+=`<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#2f6db5"/></marker>
      <pattern id="foam" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f1e4c8"/><circle cx="2" cy="2" r=".8" fill="#e2cfa6"/><circle cx="6" cy="6" r=".8" fill="#e2cfa6"/></pattern></defs>`;
  // panels
  for(let k=0;k<n;k++){
    const kv = face==='ext'? k : n-1-k;   // exterior index of the panel drawn at view position k
    const x0=X(k*PW);
    g+=`<rect x="${x0}" y="${Y(H)}" width="${PW*s}" height="${Hd}" fill="url(#foam)" stroke="#111" stroke-width="1.4"/>`;
    const num=panelNum(n,kv,rev);
    g+=`<circle cx="${x0+PW*s/2}" cy="${mt-58}" r="19" fill="#fff" stroke="#d0661f" stroke-width="3"/><text x="${x0+PW*s/2}" y="${mt-51}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="800" font-size="21" fill="#111">${num}</text>`;
    g+=`<text x="${x0+PW*s/2}" y="${Y(H/2)}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="800" font-size="${Math.min(70,PW*s*0.55)}" fill="#111" opacity=".09">${num}</text>`;
  }
  // install direction arrow
  const firstK = [...Array(n).keys()].find(k=>panelNum(n, face==='ext'?k:n-1-k, rev)===1);
  const ltr = firstK===0;
  g+=`<line x1="${X(ltr?6:L-6)}" y1="${mt-90}" x2="${X(ltr?L-6:6)}" y2="${mt-90}" stroke="#d0661f" stroke-width="2.2" marker-end="url(#ar)" style="color:#d0661f"/>`;
  g+=`<text x="${X(ltr?6:L-6)}" y="${mt-96}" text-anchor="${ltr?'start':'end'}" font-size="12" fill="#d0661f" font-weight="600">INSTALL ORDER ${ltr?'→':'←'}</text>`;
  // panel chain dims (top)
  for(let k=0;k<n;k++) g+=dimH(X(k*PW),X((k+1)*PW),mt-22,fin(PW),mt);
  // openings
  w.openings.forEach(o=>{
    const x=vx(o.x,o.w);
    const col = o.kind==='window' ? '#cfe6f7' : o.kind==='door' ? '#d9c3ac' : o.kind==='opening' ? '#ffffff' : '#cfe6f7';
    g+=`<rect x="${X(x)}" y="${Y(o.y+o.h)}" width="${o.w*s}" height="${o.h*s}" fill="${col}" stroke="#111" stroke-width="1.6"/>`;
    g+=`<line x1="${X(x)}" y1="${Y(o.y+o.h)}" x2="${X(x+o.w)}" y2="${Y(o.y)}" stroke="#111" stroke-width=".5"/><line x1="${X(x+o.w)}" y1="${Y(o.y+o.h)}" x2="${X(x)}" y2="${Y(o.y)}" stroke="#111" stroke-width=".5"/>`;
    const lbl = `${fin(o.w)} × ${fin(o.h)}`;
    g+=`<rect x="${X(x+o.w/2)-58}" y="${Y(o.y+o.h/2)-17}" width="116" height="30" fill="#fff" stroke="#111" stroke-width=".6"/>`;
    g+=`<text x="${X(x+o.w/2)}" y="${Y(o.y+o.h/2)-3}" text-anchor="middle" font-size="11.5" font-weight="600">${lbl}</text>`;
    g+=`<text x="${X(x+o.w/2)}" y="${Y(o.y+o.h/2)+9}" text-anchor="middle" font-size="9.5" fill="#333">${o.kind==='window'?'sill '+fin(o.y):o.kind==='door'?'door R.O.':o.kind==='opening'?'cased opening':'patio R.O.'}</text>`;
    // vertical: sill + head on the right of opening
    if(o.y>0) g+=dimV(Y(0),Y(o.y),X(x+o.w)+14,fin(o.y),X(x+o.w));
    g+=dimV(Y(o.y),Y(o.y+o.h),X(x+o.w)+(o.y>0?34:14),fin(o.h),X(x+o.w));
  });
  // ordinate positions of opening edges from the view-left end (bottom)
  const edges=[...new Set(w.openings.flatMap(o=>{const x=vx(o.x,o.w); return [x,x+o.w];}).map(v=>Math.round(v*16)/16))].sort((a,b)=>a-b);
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
  const built=buildWallMesh(w,mat,{nums:true,reverse:state.reverse,numSize:1.3,numZ:zNum});
  const L=w.len, gap=0.6;
  // pull panels apart; move loose items with their panel
  built.group.children.forEach(c=>{ const k=c.userData.k; if(k!==undefined) c.position.x += k*gap; });
  const wrap=new THREE.Group(); wrap.add(built.group);
  const totalW=L+(panelCount(w)-1)*gap; built.group.position.set(-totalW/2,-4,0);
  w3.obj=wrap; w3.scene.add(wrap);
  const dist=totalW*1.05+8; const side = state.face==='int' ? -1 : 1;
  w3.camera.position.set(totalW*0.25*side, 3, dist*side); w3.controls.target.set(0,0,0);
}
window.addEventListener('resize',()=>{ if(state.view==='sheets'&&w3){ const h=document.getElementById('wall3d'); if(!h) return; const r=h.getBoundingClientRect(); w3.renderer.setSize(r.width,r.height,false); w3.camera.aspect=r.width/r.height; w3.camera.updateProjectionMatrix(); } });

export { sheetsEl, w3, openSheets, closeSheets, renderSheetList, renderSheet, boxTable, elevationSVG, dimH, dimV, buildWall3D, studioEl };
