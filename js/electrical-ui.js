/* Cubit Builder — electrical-ui.js : the plugs and switches laid out by rule (electrical.js), on screen.
   · ⋯ → Electrical (and the line on the home panel): the whole home — what was placed, what to confirm (3-way
     switches), what needs a chase, data boxes on or off, Re-lay electrical (older homes onto the rules).
   · A wall's panel: its boxes, each moved chase to chase, removed or put back; add a box. */
import { MODELS } from './data.js';
import { state, pickFor } from './state.js';
import { slotsFor } from './layout.js';
import { bodyWall } from './panels.js';
import { canSave } from './role.js';
import { fin } from './format.js';
import { usesRules, homeAuto, slotAuto, summary, relay, setData, setThreeWay, removeBox, restoreBox, moveBox, resetBox, addBox, boxesOn, ruleWall, nextChase, elecOf, ELEC_H, ELEC_NAME } from './electrical.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SHORT = { plug:'Plug', counter:'Counter plug', gfci:'GFCI plug', appl:'Appliance plug', switch:'Switch', double:'Double switch', data:'Data', wp:'Outside plug' };
const refresh = async () => { const [{ buildHome }, { renderSide }]=await Promise.all([import('./scene3d.js'), import('./sidebar.js')]); buildHome(); renderSide(); if(dlg?.open) render(); };
const say = async t => { const { toast }=await import('./sidebar.js'); toast(t); };

/* ---------------------------------------------------------------- one wall (sidebar) */
function elecWallBlock(s){
  const on=slotAuto(s), list=boxesOn(s);
  const P=summary(), gone=(P?.removed||[]).filter(b=>b.W.s.id===s.id);
  const row=b=>{ const tags=[b.chase||b.face==='out'?'<span class="el-ok">on a chase</span>':'<span class="el-warn">needs a chase</span>', ...b.flags.filter(f=>f!=='needs a chase').map(f=>`<span class="el-warn">${esc(f)}</span>`), b.moved?'<span class="el-tag">moved</span>':'', b.user?'<span class="el-tag">added</span>':''].filter(Boolean).join(' ');
    return `<div class="el-row" data-id="${esc(b.id)}" data-face="${b.face}" data-a="${b.a}">
      <div><b>${esc(b.way>1 ? `${b.way}-way switch` : SHORT[b.rk]||b.name)}</b>${b.face==='out'?' · outside':''} <small>${fin(b.x)} from the left${b.face==='in'?' (seen from inside)':''} · ${fin(b.y)} up${b.note?` · ${esc(b.note)}`:''}</small><div class="el-tags">${tags}</div></div>
      <div class="el-act edit-only"><button class="btn ghost sm" data-mv="-1" title="Next chase to the left" aria-label="Next chase to the left">◀</button><button class="btn ghost sm" data-mv="1" title="Next chase to the right" aria-label="Next chase to the right">▶</button>${b.moved?'<button class="btn ghost sm" data-reset title="Back to where the rule put it" aria-label="Reset">↺</button>':''}<button class="btn ghost sm" data-rm title="Remove" aria-label="Remove">✕</button></div></div>`; };
  const adds=['plug','switch','counter','data', ...(s.type==='ext'?['wp']:[])];
  if(!on) return `<div class="el-box"><div class="eyebrow">Plugs & switches</div>
      <p class="note">This wall keeps the plugs and switches drawn in the wall library. Furniture and appliances against it still get their own plugs${(list||[]).length?':':'.'}</p>
      ${(list||[]).map(row).join('')}
      ${gone.length?`<p class="note">Removed: ${gone.map(b=>`<button class="linkbtn edit-only" data-restore="${esc(b.id)}">${esc(SHORT[b.rk]||b.rk)} (put back)</button>`).join(' · ')}</p>`:''}
      <div class="row edit-only"><button class="btn ghost" id="elRule">Lay this wall out by the rules</button><button class="btn ghost" id="elHome">Electrical…</button></div></div>`;
  return `<div class="el-box"><div class="eyebrow">Plugs & switches · by the rules</div>
    ${(list||[]).length ? (list||[]).map(row).join('') : '<p class="note">No plugs or switches on this wall.</p>'}
    ${gone.length?`<p class="note">Removed: ${gone.map(b=>`<button class="linkbtn edit-only" data-restore="${esc(b.id)}">${esc(SHORT[b.rk]||b.rk)} (put back)</button>`).join(' · ')}</p>`:''}
    <div class="row edit-only el-add"><span class="note">Add</span>${adds.map(k=>`<button class="btn ghost sm" data-add="${k}">${SHORT[k]}</button>`).join('')}</div>
    <p class="note"><button class="linkbtn" id="elHome">Electrical for the whole home…</button></p></div>`;
}
function bindElecWall(root, s){
  root.querySelector('#elHome')?.addEventListener('click', ()=>openElectrical());
  root.querySelector('#elRule')?.addEventListener('click', ()=>{ ruleWall(s, true); refresh(); say(`${s.label}: plugs and switches by the rules`); });
  const bw=()=>bodyWall(s, pickFor(s));
  root.querySelectorAll('.el-row').forEach(r=>{ const id=r.dataset.id, face=r.dataset.face, a=+r.dataset.a;
    r.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{ const left=+b.dataset.mv<0, dirA=(face==='in') === left ? 1 : -1;   // seen from inside, left = further along from the outside-left end
      const n=nextChase(s, bw(), a, dirA); if(n==null){ say('No more chases that way'); return; } moveBox(id, n); refresh(); });
    r.querySelector('[data-rm]')?.addEventListener('click', ()=>{ removeBox(id); refresh(); });
    r.querySelector('[data-reset]')?.addEventListener('click', ()=>{ resetBox(id); refresh(); });
  });
  root.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{ restoreBox(b.dataset.restore); refresh(); });
  root.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{ const rk=b.dataset.add, w=bw(), L=w.L, face=rk==='wp'?'out':'in';
    const taken=(boxesOn(s)||[]).filter(x=>x.face===face).map(x=>x.a);
    let a=nextChase(s, w, L/2-0.01, 1) ?? L/2; for(let i=0;i<12 && taken.some(t=>Math.abs(t-a)<4);i++){ const n=nextChase(s, w, a, i%2?-1:1); if(n==null) break; a=n; }
    addBox(s, rk==='wp'?'wp':rk, a, ELEC_H[rk], face); refresh(); say(`${SHORT[rk]} added on ${s.label}: move it with ◀ ▶`); });
}

/* ---------------------------------------------------------------- the home (sidebar line + dialog) */
function elecHomeLine(){
  if(!usesRules()) return canSave() ? `<div class="el-line"><span class="note">Plugs & switches: from the wall library.</span> <button class="linkbtn" id="elOpen">Electrical…</button></div>` : '';
  const P=summary(); const todo=(P.confirms||[]).filter(c=>c.value===undefined).length, need=P.offChase.length;
  const n=P.boxes.length;
  return `<div class="el-line"><span class="note">Plugs & switches by the rules: ${n} boxes${todo?` · <b>${todo} to confirm</b>`:''}${need?` · <b>${need} need a chase</b>`:''}.</span> <button class="linkbtn" id="elOpen">Electrical…</button></div>`;
}
const bindElecHome = root => root.querySelector('#elOpen')?.addEventListener('click', ()=>openElectrical());

let dlg=null;
function render(){
  const B=dlg.querySelector('#elBody'), k=state.model, E=elecOf(k)||{}, on=usesRules(k), all=homeAuto(k);
  if(!on){
    B.innerHTML=`<p>This home keeps the plugs and switches drawn into its library walls. New homes, walls swapped in and pods added are laid out by the electrical rules on their own.</p>
      <div class="row edit-only"><button class="btn" id="elRelay">Re-lay electrical</button></div>
      <p class="note">Re-lay takes every library plug and switch out of this home's walls and lays them out by the rules below. You can still add, move and remove boxes after.</p>${rulesHTML()}`;
    B.querySelector('#elRelay')?.addEventListener('click', ()=>{ relay(); refresh(); say('Electrical laid out by the rules'); });
    return;
  }
  const P=summary(k), c=P.counts, slots=slotsFor(k), lab=id=>slots.find(s=>s.id===id)?.label||'';
  const cnt=Object.entries(c).map(([r,n])=>`<span class="el-chip">${n} × ${SHORT[r]||r}</span>`).join('');
  const conf=(P.confirms||[]).map(x=>`<div class="el-row"><div><b>${esc(x.name)}</b> <small>${x.n} entrances</small></div>
    <div class="seg" role="group" aria-label="Switches for ${esc(x.name)}"><button data-sw3="${x.room}" data-v="1" aria-pressed="${x.value===true}">${x.n>2?'3-way + 4-way':'3-way'}</button><button data-sw3="${x.room}" data-v="0" aria-pressed="${x.value===false}">Single switches</button></div></div>`).join('');
  const need=P.needs.map(b=>`<button class="el-flag" data-slot="${esc(b.W.s.id)}"><b>${esc(SHORT[b.rk]||b.rk)}</b> ${esc(b.W.s.label)} <small>${fin(b.face==='in'?b.W.Lin-b.a:b.a)} from the left · ${esc(b.flags.filter(f=>f!=='confirm 3-way').join(', '))}</small></button>`).join('');
  B.innerHTML=`
    <p>${all?'Every wall of this home gets its':'Some walls of this home (swapped in or on added pods) get their'} plugs and switches from the rules. ${cnt}</p>
    ${conf?`<div class="eyebrow">Confirm · rooms with more than one entrance</div>${conf}`:''}
    <div class="eyebrow">Options</div>
    <label class="el-opt"><input type="checkbox" id="elData" ${E.data?'checked':''}> Data boxes (network / TV): the TV wall in front of a sofa and opposite each bed</label>
    ${(P.flags||[]).length?`<div class="eyebrow">Couldn't follow the rules</div>${P.flags.map(f=>`<button class="el-flag" ${f.w?`data-slot="${esc(f.w)}"`:''}>${esc(f.t)}</button>`).join('')}`:''}
    ${need?`<div class="eyebrow">To check (${P.needs.length})</div><div class="el-flags">${need}</div>`:''}
    <div class="row edit-only">${all?'':'<button class="btn" id="elRelay">Re-lay the whole home</button>'}<button class="btn ghost" id="elClear">Start over (drop hand changes)</button></div>
    ${rulesHTML()}`;
  B.querySelectorAll('[data-sw3]').forEach(b=>b.onclick=()=>{ setThreeWay(b.dataset.sw3, b.dataset.v==='1'); refresh(); });
  B.querySelector('#elData').onchange=e=>{ setData(e.target.checked); refresh(); };
  B.querySelectorAll('.el-flag[data-slot]').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.slot; state.selFurn=null; dlg.close(); import('./scene3d.js').then(m=>m.highlight?.()); refresh(); });
  B.querySelector('#elRelay')?.addEventListener('click', ()=>{ relay(); refresh(); say('Electrical laid out by the rules'); });
  const cl=B.querySelector('#elClear'); cl.onclick=()=>{ if(cl.dataset.sure!=='1'){ cl.dataset.sure='1'; cl.textContent='Tap again: every box moved, added or removed by hand goes back to the rules'; return; } relay(k, { clear:true }); refresh(); say('Electrical back to the rules'); };
}
const rulesHTML = () => `<details class="help"><summary>The rules</summary><ul class="el-rules">
  <li>Plugs ${ELEC_H.plug}″ to centre: no point along usable wall more than 1.8 m (70⅞″) from one, any wall 900 mm or longer gets one. Doorways, full-height glass, behind a door swung open and behind fixed cabinets, appliances, tubs and showers don't count. Bathrooms: the basin plug only.</li>
  <li>Counters: plugs at ${ELEC_H.counter}″ so no point is more than 900 mm from one, none behind the range or sink. Basin: GFCI at ${ELEC_H.gfci}″ within 1 m.</li>
  <li>Appliances get their own plug behind them: fridge 42″, range 6″, dishwasher 12″, washer / dryer 42″, microwave 42″. Beds: a plug each side of the head.</li>
  <li>Switches ${ELEC_H.switch}″, centre 6″ from the rough opening on the latch side, on the side the door swings into; outside doors a double box (room + outside light). Two or more entrances: 3-way, once confirmed.</li>
  <li>One weatherproof plug outside, beside the main door.</li>
  <li>Every box sits on a chase (6″ in from each edge of the original 48″ panel, then every 12″) when one is within 18″ (plugs) or 6″ (switches); otherwise it's flagged "needs a chase". Walls between pods: boxes only on the face toward the wall's own pod.</li></ul></details>`;
function openElectrical(){
  if(!dlg){ dlg=document.createElement('dialog'); dlg.className='lib-dlg el-dlg'; dlg.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Electrical</h2><button class="btn ghost" id="elX">Done</button></div><div id="elBody"></div></div>`; document.body.appendChild(dlg); dlg.querySelector('#elX').onclick=()=>dlg.close(); }
  render(); dlg.showModal();
}
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bElec')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bElec'; b.textContent='Electrical'; pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openElectrical(); }; } }
export { elecWallBlock, bindElecWall, elecHomeLine, bindElecHome, openElectrical };
