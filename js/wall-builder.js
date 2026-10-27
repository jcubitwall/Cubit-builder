/* Cubit Builder — wall-builder.js : build a wall without Shapr3D.

   A wall is 8′ (96″) high, 4′ to 24′ long in 4′ panels, 6½″ (exterior) or 4½″ (interior). On it:
     · electrical boxes (single plug / switch 2⅜ × 3⅜, double switch 4⅛ × 3⅝, 3″ deep) on either face
     · round holes: through the wall (a vent, any size) or a blind round pocket on one face
     · openings: window (custom size and sill), door, cased opening
   Tap an item to pick it and type its size and place (inches); drag it to move it. Flip turns the wall around
   (outside becomes inside), Mirror swaps left and right, the view shows it from outside or inside. Save puts it
   in the wall library (shared by the team), ready to pick for any wall of that length and type.
   Same data as the scanned walls: openings + outside items measured from the left end seen from OUTSIDE,
   inside items from the left end seen from INSIDE; openings by their bottom-left corner, face items by centre. */
import { LIB, byId, mirrorWall, saveWallLib } from './data.js';
import { state } from './state.js';
import { canSave } from './role.js';
import { buildHome } from './scene3d.js';
import { renderSide, toast } from './sidebar.js';
import { choose } from './state.js';
import { fin } from './format.js';

const H=96, PW=48;
const BOX = { plug:{w:2.375, h:3.375, depth:3, y:17.44, name:'Plug box'}, switch:{w:2.375, h:3.375, depth:3, y:47.94, name:'Switch box'}, double:{w:4.125, h:3.625, depth:3, y:47.94, name:'Double switch box'} };
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const r8 = v => Math.round(v*8)/8;
let W=null, view='outside', sel=null, dlg=null, origin=null, forSlot=null;

function blank(len=8, type='ext'){ return { id:null, name:'', len, type, t: type==='int'?4.5:6.5, fit:[0,0], openings:[], inside:[], outside:[] }; }
/* open the builder: a fresh wall, a copy of a library wall, or (from a wall's panel) ready to use on that wall */
function openWallBuilder({ from=null, slot=null, len, type }={}){
  forSlot=slot||null;
  if(from){ const src=byId(from); W=clone(src); delete W.src; delete W.mirrorOf; origin = src?.src==='team' && !String(from).endsWith('~m') ? src.id : null; if(!origin){ W.id=null; W.name=(src?.name||'')+' (copy)'; } }
  else { W=blank(len||slot?.len||8, type||slot?.type||'ext'); origin=null; }
  W.openings ||= []; W.inside ||= []; W.outside ||= [];
  // how its ends meet the walls beside it: the home's own fit for that wall when opened from one
  W.fit = slot?.trim ? slot.trim.map(v=>+v||0) : (W.fit || [0,0]);
  view='outside'; sel=null; ensure(); render(); if(!dlg.open) dlg.showModal();
}
function ensure(){
  if(dlg) return; dlg=document.createElement('dialog'); dlg.className='cw-dlg wb-dlg'; dlg.setAttribute('aria-label','Wall builder');
  document.body.appendChild(dlg);
}
const L = () => W.len*12;
/* how much comes off each end (inches, left / right seen from outside): 0 full length, 6½ or 4½ where it butts
   between the walls at its ends (a negative amount: it runs on past the end, see the 6½″ join rule) */
const fitL = () => W.fit?.[0]||0, fitR = () => W.fit?.[1]||0;
const cutSeen = () => view==='outside' ? fitL() : fitR();          // what's cut off the end on the left as seen now
const netL = () => L()-fitL()-fitR();
/* the panel joints: 4′ panels counted from the right-hand end seen from outside, the short one at the left */
function seamsOut(){ const out=[], n=Math.ceil(netL()/PW-1e-6); for(let j=1;j<n;j++) out.push(L()-fitR()-j*PW); return out; }
/* screen x of an item seen from the current side */
const listOf = k => k==='op' ? W.openings : W[k];
function drawX(k, it){                       // left edge (openings) / centre (face items) as seen now
  const flip = (k==='op'||k==='outside') ? view==='inside' : view==='outside';
  if(k==='op') return flip ? L()-it.x-it.w : it.x;
  return flip ? L()-it.x : it.x;
}
function fromDrawX(k, it, x){ const flip=(k==='op'||k==='outside') ? view==='inside' : view==='outside'; if(k==='op') return flip ? L()-x-it.w : x; return flip ? L()-x : x; }
const near = view => view==='outside' ? 'outside' : 'inside';
function sizeOf(k, it){ if(it.shape==='round') return [it.d, it.d]; return [it.w, it.h]; }

/* checks: inside the wall, clear of the panel joints (the OSB splines), boxes not in an opening */
function problems(){
  const out=[], seams=seamsOut(), lo=Math.max(0,fitL()), hi=L()-Math.max(0,fitR());
  W.openings.forEach((o,i)=>{ if(o.x<lo-0.01||o.x+o.w>hi+0.01||o.y<0||o.y+o.h>H) out.push(`Opening ${i+1} runs past the ${o.x<lo-0.01||o.x+o.w>hi+0.01?'cut end':'wall'}`); });
  ['inside','outside'].forEach(k=>W[k].forEach((b,i)=>{ const [w,h]=sizeOf(k,b), x0=b.x-w/2, x1=b.x+w/2;
    const a = k==='inside' ? L()-hi : lo, z = k==='inside' ? L()-lo : hi;
    if(x0<a||x1>z||b.y-h/2<0||b.y+h/2>H) out.push(`${b.name||'Box'} on the ${k} runs past the ${x0<a||x1>z?'cut end':'wall'}`);
    const sx = k==='inside' ? seams.map(s=>L()-s) : seams;
    if(sx.some(s=>s>x0-1.75 && s<x1+1.75)) out.push(`${b.name||'Box'} on the ${k} is on a panel joint (spline): move it at least 1¾″ clear`); }));
  return out;
}
function autoName(){
  const n=k=>W.openings.filter(o=>o.kind===k).length, boxes=W.inside.length+W.outside.length;
  const bits=[n('window')&&`${n('window')} window${n('window')>1?'s':''}`, n('door')&&`${n('door')} door${n('door')>1?'s':''}`, n('opening')&&`${n('opening')} cased opening${n('opening')>1?'s':''}`, n('vent')&&`${n('vent')} round hole${n('vent')>1?'s':''}`, boxes&&`${boxes} box${boxes>1?'es':''}`].filter(Boolean);
  return `${W.len}′ ${W.type==='int'?'interior':'exterior'}${bits.length?' · '+bits.join(', '):' · plain'}`;
}

/* ---------------------------------------------------------------- drawing */
function elevation(){
  const len=L(), pad=10;
  let g=`<rect x="0" y="0" width="${len}" height="${H}" class="wb-wall ${W.type}"/>`;
  seamsOut().forEach(s=>{ const x = view==='inside' ? len-s : s; g+=`<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="wb-seam"/>`; });
  // the ends that come off where the wall butts between others: hatched; and a strip where it runs on past its end
  const cl = view==='outside' ? fitL() : fitR(), cr = view==='outside' ? fitR() : fitL();
  if(cl>0) g+=`<rect x="0" y="0" width="${cl}" height="${H}" class="wb-cut"/>`;
  if(cr>0) g+=`<rect x="${len-cr}" y="0" width="${cr}" height="${H}" class="wb-cut"/>`;
  if(cl<0) g+=`<rect x="${cl}" y="0" width="${-cl}" height="${H}" class="wb-wall ${W.type} wb-ext"/>`;
  if(cr<0) g+=`<rect x="${len}" y="0" width="${-cr}" height="${H}" class="wb-wall ${W.type} wb-ext"/>`;
  W.openings.forEach((o,i)=>{ const x=drawX('op',o), on=sel&&sel.k==='op'&&sel.i===i;
    if(o.shape==='round') g+=`<circle cx="${x+o.w/2}" cy="${H-o.y-o.h/2}" r="${o.d/2}" class="wb-op${on?' on':''}" data-k="op" data-i="${i}"/>`;
    else g+=`<rect x="${x}" y="${H-o.y-o.h}" width="${o.w}" height="${o.h}" class="wb-op ${o.kind}${on?' on':''}" data-k="op" data-i="${i}"/><text x="${x+o.w/2}" y="${H-o.y-o.h/2}" class="wb-lab">${o.kind==='opening'?'cased':o.kind}</text>`; });
  ['inside','outside'].forEach(k=>W[k].forEach((b,i)=>{ const x=drawX(k,b), on=sel&&sel.k===k&&sel.i===i, far = k!==near(view);
    const cls=`wb-box${far?' far':''}${on?' on':''}`;
    if(b.shape==='round') g+=`<circle cx="${x}" cy="${H-b.y}" r="${b.d/2}" class="${cls}" data-k="${k}" data-i="${i}"/>`;
    else g+=`<rect x="${x-b.w/2}" y="${H-b.y-b.h/2}" width="${b.w}" height="${b.h}" class="${cls}" data-k="${k}" data-i="${i}"/>`;
    const [bw,bh]=sizeOf(k,b); g+=`<rect x="${x-bw/2-4}" y="${H-b.y-bh/2-4}" width="${bw+8}" height="${bh+8}" class="wb-hit" data-k="${k}" data-i="${i}"/>`; }));   // a finger-sized target
  // dimensions of the picked item to the left end and the floor
  // openings to their left edge and bottom, boxes and pockets to their centre (as the fields read)
  if(sel){ const it=listOf(sel.k)[sel.i]; if(it){ const op=sel.k==='op', [w0,h0]=sizeOf(sel.k,it), w=op?w0:0, h=op?h0:0, x=drawX(sel.k,it), xl = x, yb = it.y;
    const c0=cutSeen(); g+=`<line x1="${c0}" y1="${H-yb-h/2}" x2="${xl}" y2="${H-yb-h/2}" class="wb-dim"/><text x="${(c0+xl)/2}" y="${H-yb-h/2-1.5}" class="wb-dimt">${fin(xl-c0)}</text>`;
    g+=`<line x1="${xl+w/2}" y1="${H}" x2="${xl+w/2}" y2="${H-yb}" class="wb-dim"/><text x="${xl+w/2+1.5}" y="${H-yb/2}" class="wb-dimt" text-anchor="start">${fin(yb)}</text>`; } }
  return `<svg class="wb-svg" viewBox="${-pad} ${-pad} ${len+2*pad} ${H+2*pad+8}" role="img" aria-label="The wall seen from ${view}">${g}
    <text x="0" y="${H+7}" class="wb-end">◀ left end seen from ${view}</text><text x="0" y="${H+12}" class="wb-end">${fitL()||fitR() ? `${fin(netL())} long (${W.len}′ less its ends)` : `${W.len}′ full length`} · ${W.t}″ thick · 96″ high</text></svg>`;
}
function fields(){
  if(!sel) return `<p class="note">Tap an item on the wall to size and place it, or drag it. Measurements are from the left end seen from ${view} and from the floor.</p>`;
  const it=listOf(sel.k)[sel.i]; if(!it) return '';
  const [w,h]=sizeOf(sel.k,it), x=drawX(sel.k,it), isOp=sel.k==='op', round=it.shape==='round';
  const f=(id,label,v)=>`<label class="cw-f"><span>${label}</span><input data-f="${id}" inputmode="decimal" value="${Math.round(v*16)/16}"><i>″</i></label>`;
  return `<div class="wb-sel"><div class="eyebrow">${isOp ? (round?'Round hole through the wall':it.kind==='opening'?'Cased opening':it.kind==='window'?'Window opening':'Door opening') : (round?'Round pocket':'Box')+` · ${sel.k} face`}</div>
    <div class="cw-fs">${round ? f('d','Diameter',it.d) : f('w','Width',w)+f('h','Height',h)}
      ${f('x', isOp?'Left edge from the left end':'Centre from the left end', x-cutSeen())}
      ${f('y', isOp?(it.kind==='window'||round?'Bottom from the floor':'Bottom from the floor'):'Centre from the floor', isOp ? it.y : it.y)}
      ${!isOp ? f('depth','Depth', it.depth||3) : ''}</div>
    <div class="row"><button class="btn ghost sm" id="wbDup">Duplicate</button><button class="btn ghost sm" id="wbDel">Remove</button></div></div>`;
}
function render(){
  const P=problems(), libHit=!!origin;
  dlg.innerHTML=`<div class="cw">
    <header class="cw-h"><h2>Wall builder</h2><span class="note">${origin?`editing <b>${esc(origin)}</b>`:forSlot?`for ${esc(forSlot.label)}`:'new wall'}</span><span class="spacer"></span><button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="wb-body">
      <div class="wb-view">
        <div class="cw-vh"><div class="seg"><button data-view="outside" aria-pressed="${view==='outside'}">Outside</button><button data-view="inside" aria-pressed="${view==='inside'}">Inside</button></div>
          <span class="spacer"></span><button class="btn ghost sm" id="wbFlip" title="Turn the wall around: the outside becomes the inside">Flip</button><button class="btn ghost sm" id="wbMir" title="Swap left and right">Mirror</button></div>
        <div class="wb-stage">${elevation()}</div>
        ${P.length?`<ul class="wb-warn">${P.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}
      </div>
      <div class="cw-side">
        <div class="cw-opt"><span>Wall</span><div class="seg"><button data-type="ext" aria-pressed="${W.type==='ext'}">Exterior 6½″</button><button data-type="int" aria-pressed="${W.type==='int'}">Interior 4½″</button></div></div>
        <div class="cw-opt"><span>Length (8′ high)</span><div class="seg wrap">${[4,8,12,16,20,24].map(n=>`<button data-len="${n}" aria-pressed="${W.len===n}">${n}′</button>`).join('')}</div></div>
        <div class="cw-opt"><span>Ends (seen from outside)</span>
          ${['Left','Right'].map((nm,e)=>`<div class="wb-endrow"><b>${nm}</b><div class="seg wrap">${[[0,'Full length'],[6.5,'Between 6½″'],[4.5,'Between 4½″']].map(([v,l])=>`<button data-fit="${e}" data-v="${v}" aria-pressed="${Math.abs((W.fit?.[e]||0)-v)<1e-6}">${l}</button>`).join('')}${(W.fit?.[e]||0)<0?`<button aria-pressed="true" disabled>Runs on ${fin(-(W.fit[e]))}</button>`:''}</div></div>`).join('')}
          <p class="note">${fitL()||fitR() ? `Cut length ${fin(netL())}: ${fitL()?`${fin(fitL())} off the left`:''}${fitL()&&fitR()?', ':''}${fitR()?`${fin(fitR())} off the right`:''} where it butts the wall${fitL()&&fitR()?'s':''} beside it. Measurements are from the cut ends.` : 'Full length: it runs the whole way, corner to corner.'}</p></div>
        <h3>Add to the ${near(view)} face</h3>
        <div class="wb-add"><button class="btn ghost sm" data-add="plug">Plug box</button><button class="btn ghost sm" data-add="switch">Switch box</button><button class="btn ghost sm" data-add="double">Double switch box</button><button class="btn ghost sm" data-add="pocket">Round pocket</button></div>
        <h3>Through the wall</h3>
        <div class="wb-add"><button class="btn ghost sm" data-add="window">Window opening</button><button class="btn ghost sm" data-add="door">Door opening</button><button class="btn ghost sm" data-add="opening">Cased opening</button><button class="btn ghost sm" data-add="vent">Round hole</button></div>
        ${fields()}
        <h3>Save</h3>
        <label class="cw-f"><span>Name</span><input id="wbName" value="${esc(W.name||'')}" placeholder="${esc(autoName())}"></label>
        <div class="row">${canSave()?`<button class="btn" id="wbSave">${libHit?'Save changes':'Save to wall library'}</button>${libHit?'<button class="btn ghost" id="wbSaveNew">Save as a new wall</button>':''}`:'<span class="note">Viewers can look but not save walls.</span>'}</div>
        ${forSlot?`<p class="note">Saving also puts it on ${esc(forSlot.label)}.</p>`:''}
      </div></div></div>`;
  bind();
}
/* ---------------------------------------------------------------- editing */
function add(kind){
  const c=L()/2;
  if(BOX[kind] || kind==='pocket'){ const k=near(view), b = kind==='pocket' ? {kind:'pocket', shape:'round', d:3, depth:3, x:0, y:48, name:'Round pocket'} : {kind:'box', shape:'rect', ...BOX[kind], x:0};
    b.x=fromDrawX(k,b,c+ (W[k].length%3)*6); W[k].push(b); sel={k, i:W[k].length-1}; }
  else { const o = kind==='window' ? {kind, x:0, y:36, w:36, h:48} : kind==='door' ? {kind, x:0, y:0, w:36.5, h:80.75} : kind==='opening' ? {kind, x:0, y:0, w:48, h:82} : {kind:'vent', shape:'round', d:4, x:0, y:84, w:4, h:4};
    o.x=fromDrawX('op',o,c-o.w/2); W.openings.push(o); sel={k:'op', i:W.openings.length-1}; }
  render();
}
function setField(f, v){
  const it=listOf(sel.k)[sel.i]; if(!it || !isFinite(v)) return;
  if(f==='d'){ const cx = sel.k==='op' ? it.x+it.w/2 : it.x, cy = sel.k==='op' ? it.y+it.h/2 : it.y; it.d=v; it.w=it.h=v; if(sel.k==='op'){ it.x=cx-v/2; it.y=cy-v/2; } }
  else if(f==='x') { v+=cutSeen(); if(sel.k==='op') it.x=fromDrawX('op',it,v); else it.x=fromDrawX(sel.k,it,v); }
  else it[f]=v;
  if(sel.k==='op' && f==='w' && view==='inside'){ /* keep the left edge seen from inside */ }
  ['x','y','w','h','d','depth'].forEach(k=>{ if(it[k]!=null) it[k]=Math.round(it[k]*10000)/10000; });
  render();
}
function bind(){
  const $=s=>dlg.querySelector(s);
  $('.cw-x').onclick=()=>dlg.close();
  dlg.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{ view=b.dataset.view; render(); });
  dlg.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{ W.type=b.dataset.type; W.t=W.type==='int'?4.5:6.5; render(); });
  dlg.querySelectorAll('[data-len]').forEach(b=>b.onclick=()=>{ const old=L(); W.len=+b.dataset.len;
    // keep everything where it was from the left end seen from outside (inside items keep their distance from the outside-left end too)
    W.inside.forEach(it=>{ it.x += L()-old; }); render(); });
  dlg.querySelectorAll('[data-fit]').forEach(b=>b.onclick=()=>{ W.fit=[fitL(), fitR()]; W.fit[+b.dataset.fit]=+b.dataset.v; render(); });
  dlg.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add));
  dlg.querySelectorAll('[data-f]').forEach(inp=>inp.onchange=()=>{ const s=String(inp.value).trim(), m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); const v=m?(m[1]?+m[1]:0)+(m[2]?(+m[2])/(+m[3]):0):NaN; setField(inp.dataset.f, v); });
  $('#wbDel')?.addEventListener('click',()=>{ listOf(sel.k).splice(sel.i,1); sel=null; render(); });
  $('#wbDup')?.addEventListener('click',()=>{ const it=clone(listOf(sel.k)[sel.i]); it.x += (sel.k==='op'?it.w:0)+6; listOf(sel.k).push(it); sel={k:sel.k, i:listOf(sel.k).length-1}; render(); });
  $('#wbFlip').onclick=()=>{ const o=W.outside; W.outside=W.inside; W.inside=o; W.openings.forEach(op=>{ op.x=L()-op.x-op.w; mapPath(op, x=>L()-x); }); sel=null; render(); toast('Wall turned around: the outside is now the inside'); };
  $('#wbMir').onclick=()=>{ const m=mirrorWall({...W, id:W.id||'X'}); W.openings=m.openings; W.inside=m.inside; W.outside=m.outside; sel=null; render(); toast('Mirrored left ↔ right'); };
  $('#wbName')?.addEventListener('change', e=>{ W.name=e.target.value.trim(); });
  $('#wbSave')?.addEventListener('click',()=>saveWall(false));
  $('#wbSaveNew')?.addEventListener('click',()=>saveWall(true));
  // pick and drag on the drawing
  const svg=$('.wb-svg'); let drag=null;
  const toWall=e=>{ const p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.addEventListener('pointerdown', e=>{ const t=e.target.closest('[data-k]');
    if(!t){ if(sel){ sel=null; render(); } return; }
    const k=t.dataset.k, i=+t.dataset.i, it=listOf(k)[i], p=toWall(e);
    sel={k,i}; drag={k,i,p0:p, x0:drawX(k,it), y0:it.y, moved:false}; svg.setPointerCapture(e.pointerId); e.preventDefault();
    dlg.querySelectorAll('.on').forEach(n=>n.classList.remove('on')); t.classList.add('on'); });
  svg.addEventListener('pointermove', e=>{ if(!drag) return; const p=toWall(e), it=listOf(drag.k)[drag.i]; drag.moved=true;
    const nx=r8(drag.x0 + (p.x-drag.p0.x)), ny=r8(drag.y0 - (p.y-drag.p0.y));
    it.x=fromDrawX(drag.k,it,nx); it.y=Math.max(0, Math.min(H, ny));
    const el=svg.querySelector(`[data-k="${drag.k}"][data-i="${drag.i}"]:not(.wb-hit)`), x=drawX(drag.k,it), [w,h]=sizeOf(drag.k,it);
    if(el.tagName==='circle'){ el.setAttribute('cx', drag.k==='op' ? x+it.w/2 : x); el.setAttribute('cy', drag.k==='op' ? H-it.y-it.h/2 : H-it.y); }
    else if(drag.k==='op'){ el.setAttribute('x',x); el.setAttribute('y',H-it.y-it.h); } else { el.setAttribute('x',x-w/2); el.setAttribute('y',H-it.y-h/2); } });
  svg.addEventListener('pointerup', ()=>{ if(!drag) return; drag=null; render(); });
}
function mapPath(o, f){ ['ends','path'].forEach(k=>{ if(o[k]) o[k]=o[k].map(([x,y])=>[f(x),y]); }); }
const nextId=(prefix)=>{ let n=1; while(LIB.some(x=>x.id===`${prefix}-${String(n).padStart(2,'0')}`)) n++; return `${prefix}-${String(n).padStart(2,'0')}`; };
async function saveWall(asNew){
  if(!canSave()){ toast('Viewers can look but not save walls.'); return; }
  const w=clone(W); w.name=(dlg.querySelector('#wbName')?.value||'').trim() || autoName(); w.t = w.type==='int'?4.5:6.5;
  if(asNew || !origin) w.id=nextId(`${w.type==='int'?'I':'W'}${String(w.len).padStart(2,'0')}`); else w.id=origin;
  w.source=`Wall builder ${new Date().toISOString().slice(0,10)}`;
  let shared=false;
  try{ const r=await fetch('api/walls',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'save', wall:w})});
    if(r.ok && (r.headers.get('content-type')||'').includes('json')) shared=true; else if(r.status!==404 && r.status!==405){ const o=await r.json().catch(()=>({})); if(o.error) throw new Error(o.error); } }
  catch(e){ toast(`Couldn't save: ${e.message||e}`); return; }
  const i=LIB.findIndex(x=>x.id===w.id), entry={...w, src: shared?'team':'saved'};
  if(i>=0) LIB[i]=entry; else LIB.push(entry);
  if(!shared) saveWallLib();
  origin=w.id; W.id=w.id; W.name=w.name;
  if(forSlot){ choose(forSlot, w.id); }
  buildHome(); renderSide(); render();
  toast(`${w.id} saved to the wall library${shared?' (for the whole team)':' (in this browser)'}${forSlot?` · on ${forSlot.label}`:''}`);
}
/* ⋯ menu → Wall builder */
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bWallB')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bWallB'; b.textContent='Wall builder';
    pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openWallBuilder(); }; } }
export { openWallBuilder };
