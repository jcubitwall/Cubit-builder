/* Cubit Builder — electrical-ui.js : the plugs and switches laid out by rule (electrical.js), on screen.
   · Library → Electrical → Electrical rules → This home's electrical (and the line on the home panel): the whole home — what was placed, what to confirm (3-way
     switches), what needs a chase, data boxes on or off, Re-lay electrical (older homes onto the rules).
   · A wall's panel: its boxes, each moved chase to chase, removed or put back; add a box. */
import { MODELS } from './data.js';
import { state, pickFor } from './state.js';
import { slotsFor } from './layout.js';
import { bodyWall } from './panels.js';
import { canSave } from './role.js';
import { fin } from './format.js';
import { devicesOf, deviceById } from './devices.js';
import { usesRules, homeAuto, slotAuto, summary, relay, setData, setThreeWay, removeBox, restoreBox, moveBox, resetBox, setGang, GANG, CONTROLS, setSwitchUse, pairSwitch, unpairSwitch, switchSchedule, switchLinks, setDevice, deviceCounts, addBox, boxesOn, ruleWall, nextChase, elecOf, ELEC_H, ELEC_NAME } from './electrical.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SHORT = { light:'Wall light', plug:'Plug', counter:'Counter plug', gfci:'GFCI plug', appl:'Appliance plug', jbox:'Junction box', switch:'Switch', double:'Double switch', data:'Data', wp:'Outside plug', tvr:'TV box (recessed)' };
const refresh = async () => { const [{ buildHome }, { renderSide }]=await Promise.all([import('./scene3d.js'), import('./sidebar.js')]); buildHome(); renderSide(); if(dlg?.open) render(); };
const refreshSide = async () => { const { renderSide }=await import('./sidebar.js'); renderSide(); };
const say = async t => { const { toast }=await import('./sidebar.js'); toast(t); };

/* ---------------------------------------------------------------- one wall (sidebar) */
/* tap a box to pick it: the same moves as the panel builder (arrows chase to chase or by a step, or typed), put on
   this home at once so you see it against the furniture in 3D; the picked box is ringed in the 3D view */
let pickId=null, step='chase';
const STEPS=[['chase','Chase to chase'],['1','1″'],['0.5','½″'],['0.125','⅛″']];
function editor(b){
  const f=(id,label,v)=>`<label class="cw-f"><span>${label}</span><input data-ef="${id}" inputmode="decimal" value="${Math.round(v*16)/16}"><i>″</i></label>`;
  return `<div class="el-ed edit-only"><p class="note">Moves go on this home only, over the rule; the wall in the library doesn't change.</p>
    <div class="wb-pad" role="group" aria-label="Move it"><button class="btn ghost" data-en="up" aria-label="Up">▲</button><button class="btn ghost" data-en="left" aria-label="Left">◀</button><button class="btn ghost" data-en="right" aria-label="Right">▶</button><button class="btn ghost" data-en="down" aria-label="Down">▼</button></div>
    <div class="cw-opt"><span>Box size</span><div class="seg sm" role="group" aria-label="Box size">${[[1,'Single'],[2,'Double'],[3,'Triple']].map(([v,l])=>`<button data-eg="${v}" aria-pressed="${(b.g||1)===v}" title="${l} gang · ${fin(GANG[v].w)} × ${fin(GANG[v].h)}">${l}</button>`).join('')}</div></div>
    <div class="cw-opt"><span>Each tap</span><div class="seg sm">${STEPS.map(([v,l])=>`<button data-estep="${v}" aria-pressed="${step===v}">${l}</button>`).join('')}</div></div>
    <div class="cw-fs">${f('x', `Centre from the left${b.face==='in'?' (seen from inside)':''}`, b.x)}${f('y','Centre from the floor', b.y)}</div>
    ${switchUsesHTML(b)}${plugDevicesHTML(b)}</div>`;
}
/* a switch box: what each switch in it does, and 3-way pairs (any two switches, in one room or across an open space).
   Changes go on this home at once (shared with the panel builder). */
const devSel = (kinds, cur, i) => `<select data-dev="${i}" class="sw-dev" aria-label="Device ${i+1}">${kinds.map(k=>`<optgroup label="${k==='sw'?'Switches':k==='rc'?'Plugs (receptacles)':'Data & TV'}">${devicesOf(k).map(d=>`<option value="${esc(d.id)}" ${d.id===cur?'selected':''}>${esc(d.name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
/* a plug, data or TV box: the device in each gang */
function plugDevicesHTML(b){
  if(b.sn || !b.devs || b.rk==='jbox') return '';
  const kinds = b.rk==='data' ? ['dt','rc'] : b.rk==='tvr' ? ['rc','dt'] : ['rc','dt'];
  return `<div class="sw-uses"><div class="eyebrow">Device${b.devs.length>1?'s':''} · what goes in the box</div>
    ${b.devs.map((id,i)=>`<div class="sw-u"><span class="sw-n">${b.devs.length>1?i+1:'•'}</span>${devSel(kinds, id, i)}</div>`).join('')}
    <p class="note">Plugs &amp; switches in the Library: every type, and ＋ New to add one.</p></div>`;
}
function switchUsesHTML(b){
  if(!b.sn || !b.uses) return '';
  const others=switchSchedule().filter(x=>x.id!==b.id);
  return `<div class="sw-uses"><div class="eyebrow">${esc(b.sn)} · what each switch does</div>
    ${b.uses.map((u,i)=>`<div class="sw-u" data-swi="${i}"><span class="sw-n">${b.uses.length>1?i+1:'•'}</span>
      ${linkChip(u)}<select data-swc="${i}" aria-label="Switch ${i+1} controls">${Object.entries(CONTROLS).map(([k,l])=>`<option value="${k}" ${u.c===k?'selected':''}>${esc(l)}</option>`).join('')}</select>
      ${u.c==='other'?`<input data-swt="${i}" value="${esc(u.t||'')}" placeholder="What it switches" maxlength="40">`:''}
      ${(u.n||1)>1?`<span class="sw-and">and</span><select data-swc2="${i}" aria-label="Its second switch controls">${Object.entries(CONTROLS).map(([k,l])=>`<option value="${k}" ${(u.c2||'none')===k?'selected':''}>${esc(l)}</option>`).join('')}</select>`:''}
      <div class="sw-devrow">${devSel(['sw'], b.devs?.[i]||u.dev, i)}</div>
      <div class="seg sm" role="group" aria-label="Way"><button data-sww="${i}" data-v="1" aria-pressed="${(u.way||1)===1}">1-way</button><button data-sww="${i}" data-v="3" aria-pressed="${u.way>1}">${u.way===4?'4-way':'3-way'}</button></div>
      ${u.way>1?`<span class="sw-with">with ${u.with.map(id=>{ const o=others.find(x=>x.id===id); return o?`<b>${esc(o.sn)}</b> <small>${esc(o.wall)}</small>`:''; }).filter(Boolean).join(', ')||'<span class="el-warn">pick the other switch</span>'}
        <select data-swp="${i}" aria-label="3-way with"><option value="">＋ pair with…</option>${others.filter(o=>!u.with.includes(o.id)).map(o=>`<option value="${esc(o.id)}">${esc(o.sn)} · ${esc(o.wall)}${o.why?` · ${esc(o.why.replace(/^switch, /,''))}`:''}</option>`).join('')}</select></span>`:''}
    </div>`).join('')}
    <p class="note">More switches in one box: make it Double or Triple above. Pair any two switches as a 3-way (three or more: 4-way in the middle), in one room or across an open space.</p></div>`;
}
function bindSwitchUses(root, id, after){
  root.querySelectorAll('[data-dev]').forEach(el=>el.onchange=()=>{ setDevice(id, +el.dataset.dev, el.value); after(); });
  root.querySelectorAll('[data-swc2]').forEach(el=>el.onchange=()=>{ setSwitchUse(id, +el.dataset.swc2, { c2:el.value }); after(); });
  root.querySelectorAll('[data-swc]').forEach(el=>el.onchange=()=>{ setSwitchUse(id, +el.dataset.swc, { c:el.value }); after(); });
  root.querySelectorAll('[data-swt]').forEach(el=>el.onchange=()=>{ setSwitchUse(id, +el.dataset.swt, { t:el.value.trim() }); after(); });
  root.querySelectorAll('[data-sww]').forEach(el=>el.onclick=()=>{ const i=+el.dataset.sww; if(el.dataset.v==='1') unpairSwitch(id, i); else setSwitchUse(id, i, { way:3 }); after(); });
  root.querySelectorAll('[data-swp]').forEach(el=>el.onchange=()=>{ if(!el.value) return; pairSwitch(id, +el.dataset.swp, el.value); after(); });
}
/* ---------------------------------------------------------------- the 3-way links, seen in 3D
   Each group of tied switches gets its own colour: an arched "wire" over the walls from switch to switch (in order
   along the run), a glowing ring on each switch and its number. The same colour marks them in the wall panel and
   the schedule. Picking a switch brings its group forward and fades the others. Layers → 3-way switch links. */
const LINK_COLS = ['#ff7a00','#1e88e5','#8e24aa','#00a37a','#e53935','#c2185b','#6d4c41','#3949ab'];
const linkCol = g => LINK_COLS[(g-1)%LINK_COLS.length];
let linkObjs=[];
function boxPoint(b, wallGroups){
  const g=wallGroups.find(g=>g.userData.slot.id===b.W.s.id); if(!g) return null;
  const z = b.face==='in' ? -(b.W.t||0.375)-0.06 : 0.06;   // W.t: the wall's thickness in feet
  g.updateMatrix(); const P=new THREE.Vector3(b.a/12, b.y/12, z).applyMatrix4(g.matrix); P.q=g.quaternion; return P;
}
async function drawLinks(root, wallGroups){
  linkObjs=[];
  if(!('swlinks' in state.show)) state.show.swlinks=true;
  const L=switchLinks(); if(!L.length) return;
  const S3=await import('./scene3d.js');
  const grp=new THREE.Group(); grp.userData.swlinks=true; root.add(grp);
  L.forEach(G=>{ const col=new THREE.Color(linkCol(G.grp));
    const mat=new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.95, depthTest:false });
    const pts=G.boxes.map(b=>boxPoint(b, wallGroups)).filter(Boolean); if(pts.length<2) return;
    for(let i=0;i+1<pts.length;i++){ const A=pts[i], B=pts[i+1], d=A.distanceTo(B), top=Math.max(A.y,B.y)+1.2+Math.min(4, d*0.18);
      const c1=A.clone().lerp(B,0.25); c1.y=top; const c2=A.clone().lerp(B,0.75); c2.y=top;
      const curve=new THREE.CubicBezierCurve3(A,c1,c2,B);
      const m=new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.07, 6, false), mat); m.renderOrder=998; grp.add(m);
      // travellers: little beads moving along it so it reads as a link, not a wall line
      for(let k=1;k<4;k++){ const bead=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8), mat); bead.position.copy(curve.getPoint(k/4)); bead.renderOrder=998; grp.add(bead); } }
    G.boxes.forEach((b,i)=>{ const P=pts[i]; if(!P) return;
      const ring=new THREE.Mesh(new THREE.TorusGeometry(0.32,0.06,8,28), mat); ring.position.copy(P); ring.quaternion.copy(P.q); ring.renderOrder=999; grp.add(ring);
      const lab=pill(`${b.sn} · ${G.boxes.length>2 && i>0 && i<G.boxes.length-1 ? '4' : '3'}-way`, linkCol(G.grp)); lab.position.copy(P).add(new THREE.Vector3(0,0.9,0)); grp.add(lab); });
    linkObjs.push({ grp:G.grp, ids:G.boxes.map(b=>b.id), mat, labs:grp.children.filter(o=>o.userData.pillMat && !o.userData.done).map(o=>{ o.userData.done=true; return o.userData.pillMat; }) });
  });
  styleLinks(); S3.applyLayers?.();
}
/* a coloured pill with white text, always facing the camera */
function pill(text, col){
  const c=document.createElement('canvas'), x=c.getContext('2d'), f=44; x.font=`700 ${f}px ui-monospace, Menlo, monospace`;
  const w=Math.ceil(x.measureText(text).width)+40, h=f+28; c.width=w; c.height=h;
  x.font=`700 ${f}px ui-monospace, Menlo, monospace`; x.fillStyle=col; const r=h/2;
  x.beginPath(); x.moveTo(r,0); x.lineTo(w-r,0); x.arc(w-r,r,r,-Math.PI/2,Math.PI/2); x.lineTo(r,h); x.arc(r,r,r,Math.PI/2,Math.PI*1.5); x.fill();
  x.fillStyle='#fff'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(text, w/2, h/2+2);
  const t=new THREE.CanvasTexture(c); const m=new THREE.SpriteMaterial({ map:t, depthTest:false, transparent:true });
  const sp=new THREE.Sprite(m); const k=0.009; sp.scale.set(w*k, h*k, 1); sp.renderOrder=1000; sp.userData.pillMat=m; return sp;
}
function styleLinks(){ const on=linkObjs.find(o=>pickId && o.ids.includes(pickId));
  linkObjs.forEach(o=>{ const v = !on || o===on ? 0.95 : 0.18; o.mat.opacity=v; (o.labs||[]).forEach(m=>{ m.opacity=v; }); }); }
import('./scene3d.js').then(m=>m.onBuilt?.((root, walls)=>drawLinks(root, walls)));
const linkChip = u => u.grp ? `<span class="sw-chip" style="--c:${linkCol(u.grp)}" title="3-way group ${u.grp}">${u.way===4?'4':'3'}-way</span>` : '';

/* ring the picked box in the 3D view (wall-local feet: x from the outside-left end, y up, z 0 outside / -t inside) */
let ring=null;
async function markBox(s){
  const S3=await import('./scene3d.js');
  if(ring){ ring.parent?.remove(ring); ring=null; }
  styleLinks();
  const b=pickId && s ? (boxesOn(s)||[]).find(x=>x.id===pickId) : null; if(!b) return;
  const g=S3.wallGroups.find(g=>g.userData.slot.id===s.id); if(!g) return;
  const t=(bodyWall(s, pickFor(s))?.t || (s.type==='int'?4.5:6.5))/12;
  ring=new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 32), new THREE.MeshBasicMaterial({ color:0xff7a00, side:THREE.DoubleSide, depthTest:false, transparent:true }));
  ring.renderOrder=999; ring.position.set(b.a/12, b.y/12, b.face==='in' ? -t-0.02 : 0.02); g.add(ring);
}
function elecWallBlock(s){
  const on=slotAuto(s), list=boxesOn(s);
  const P=summary(), gone=(P?.removed||[]).filter(b=>b.W.s.id===s.id);
  const row=b=>{ const tags=[b.chase||b.face==='out'?`<span class="el-ok">on a chase${b.nudge>0.01?` · ${fin(b.nudge)} off centre`:''}</span>`:'<span class="el-warn">needs a chase</span>', ...b.flags.filter(f=>f!=='needs a chase').map(f=>`<span class="el-warn">${esc(f)}</span>`), b.moved?'<span class="el-tag">moved</span>':'', b.user?'<span class="el-tag">added</span>':''].filter(Boolean).join(' ');
    return `<div class="el-row${pickId===b.id?' on':''}" data-id="${esc(b.id)}" data-face="${b.face}" data-a="${b.a}" data-x="${b.x}" data-y="${b.y}" ${b.lock?'':'data-pick="1"'}>
      <div><b>${esc(b.way>1 ? `${b.way}-way switch` : SHORT[b.rk]||b.name)}</b>${b.sn?` <span class="sw-sn">${esc(b.sn)}</span>`:''}${(b.g||1)>1?` · ${b.g===3?'triple':'double'} box`:''}${(b.uses||[]).map(linkChip).join('')}${b.useText?`<small class="sw-txt">${esc(b.useText)}</small>`:(b.devs||[]).length?`<small class="sw-txt">${esc((b.devs||[]).map(id=>deviceById(id)?.name).filter(Boolean).join(' · '))}</small>`:''}${b.face==='out'?' · outside':''} <small>${fin(b.x)} from the left${b.face==='in'?' (seen from inside)':''} · ${fin(b.y)} up${b.note?` · ${esc(b.note)}`:''}</small><div class="el-tags">${tags}</div></div>
      ${b.lock?`<div class="el-act"><span class="el-ok" title="It goes where the fireplace goes: move the fireplace, or change its Power (Plug / Hardwired)">🔒 with the fireplace</span></div>`:`<div class="el-act edit-only"><button class="btn ghost sm" data-mv="-1" title="Next chase to the left" aria-label="Next chase to the left">◀</button><button class="btn ghost sm" data-mv="1" title="Next chase to the right" aria-label="Next chase to the right">▶</button>${b.moved?'<button class="btn ghost sm" data-reset title="Back to where the rule put it" aria-label="Reset">↺</button>':''}<button class="btn ghost sm" data-rm title="Remove" aria-label="Remove">✕</button></div>`}</div>${pickId===b.id && !b.lock ? editor(b) : ''}`; };
  const adds=['plug','switch','counter','data','light', ...(s.type==='ext'?['wp']:[])];
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
  if(pickId && !(boxesOn(s)||[]).some(b=>b.id===pickId)) pickId=null;
  setTimeout(()=>markBox(s), 0);
  root.querySelectorAll('.el-row[data-pick]').forEach(r=>r.addEventListener('click', e=>{ if(e.target.closest('button,input')) return; pickId = pickId===r.dataset.id ? null : r.dataset.id; refreshSide(); }));
  const cur=()=>(boxesOn(s)||[]).find(b=>b.id===pickId);
  { const b=cur(); const ed=root.querySelector('.el-ed'); if(b && ed) bindSwitchUses(ed, b.id, ()=>refresh()); }
  root.querySelectorAll('[data-eg]').forEach(btn=>btn.onclick=()=>{ const b=cur(); if(!b) return; setGang(b.id, +btn.dataset.eg); refresh(); });
  root.querySelectorAll('[data-estep]').forEach(b=>b.onclick=()=>{ step=b.dataset.estep; refreshSide(); });
  root.querySelectorAll('[data-en]').forEach(btn=>btn.onclick=()=>{ const b=cur(); if(!b) return; const d=btn.dataset.en, st=step==='chase'?1:+step;
    if(d==='up'||d==='down'){ moveBox(b.id, null, +Math.max(2, Math.min(94, b.y+(d==='up'?st:-st))).toFixed(3)); refresh(); return; }
    const right=d==='right';
    if(step==='chase'){ const dirA=(b.face==='in') === !right ? 1 : -1, n=nextChase(s, bw(), b.a, dirA); if(n==null){ say('No more chases that way'); return; } moveBox(b.id, n); }
    else moveBox(b.id, +(b.a + (b.face==='in' ? (right?-st:st) : (right?st:-st))).toFixed(3));
    refresh(); });
  root.querySelectorAll('[data-ef]').forEach(inp=>inp.onchange=()=>{ const b=cur(); const v=parseFloat(inp.value); if(!b || !isFinite(v)) return;
    if(inp.dataset.ef==='y') moveBox(b.id, null, Math.max(2, Math.min(94, v)));
    else moveBox(b.id, +(b.face==='in' ? b.a+b.x-v : v).toFixed(3));
    refresh(); });
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
    addBox(s, rk==='wp'?'wp':rk, a, ELEC_H[rk], face); refresh(); say(rk==='light' ? `Wall light added on ${s.label} at ${ELEC_H.light}″: set exactly where it goes; its wire run follows from the nearest chase` : `${SHORT[rk]} added on ${s.label}: move it with ◀ ▶`); });
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
    ${(()=>{ const S=switchSchedule(k); return S.length ? `<div class="eyebrow">Switch schedule · for the electrician</div><table class="sw-sched"><tbody>${S.map(x=>`<tr><th>${esc(x.sn)}</th><td><button class="linkbtn el-flag-l" data-slot="${esc(x.slot)}">${esc(x.wall)}</button>${x.g>1?` · ${x.g===3?'triple':'double'}`:''}</td><td>${(x.uses||[]).map(linkChip).join('')} ${esc(x.text)}</td></tr>`).join('')}</tbody></table><p class="note">Tap a wall to go to it; pick a switch there to say what each one does.</p>` : ''; })()}
    ${(()=>{ const D=deviceCounts(k); return D.length ? `<details class="help"><summary>Devices to buy (${D.reduce((t,x)=>t+x.n,0)})</summary><table class="sw-sched"><tbody>${D.map(x=>`<tr><th>${x.n} ×</th><td>${esc(x.name)}</td></tr>`).join('')}</tbody></table></details>` : ''; })()}
    <div class="eyebrow">Options</div>
    <label class="el-opt"><input type="checkbox" id="elData" ${E.data?'checked':''}> Data boxes (network / TV): the TV wall in front of a sofa and opposite each bed</label>
    ${(P.flags||[]).length?`<div class="eyebrow">Couldn't follow the rules</div>${P.flags.map(f=>`<button class="el-flag" ${f.w?`data-slot="${esc(f.w)}"`:''}>${esc(f.t)}</button>`).join('')}`:''}
    ${need?`<div class="eyebrow">To check (${P.needs.length})</div><div class="el-flags">${need}</div>`:''}
    <div class="row edit-only">${all?'':'<button class="btn" id="elRelay">Re-lay the whole home</button>'}<button class="btn ghost" id="elClear">Start over (drop hand changes)</button></div>
    ${rulesHTML()}`;
  B.querySelectorAll('[data-sw3]').forEach(b=>b.onclick=()=>{ setThreeWay(b.dataset.sw3, b.dataset.v==='1'); refresh(); });
  B.querySelector('#elData').onchange=e=>{ setData(e.target.checked); refresh(); };
  B.querySelectorAll('.el-flag-l[data-slot]').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.slot; state.selFurn=null; dlg.close(); import('./scene3d.js').then(m=>m.highlight?.()); import('./fullscreen.js').then(m=>m.setPanel?.(true)); refresh(); });
  B.querySelectorAll('.el-flag[data-slot]').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.slot; state.selFurn=null; dlg.close(); import('./scene3d.js').then(m=>m.highlight?.()); refresh(); });
  B.querySelector('#elRelay')?.addEventListener('click', ()=>{ relay(); refresh(); say('Electrical laid out by the rules'); });
  const cl=B.querySelector('#elClear'); cl.onclick=()=>{ if(cl.dataset.sure!=='1'){ cl.dataset.sure='1'; cl.textContent='Tap again: every box moved, added or removed by hand goes back to the rules'; return; } relay(k, { clear:true }); refresh(); say('Electrical back to the rules'); };
}
export const rulesHTML = () => `<details class="help"><summary>The rules</summary><ul class="el-rules">
  <li>Plugs ${ELEC_H.plug}″ to centre: no point along usable wall more than 1.8 m (70⅞″) from one, any wall 900 mm or longer gets one. Doorways, full-height glass, behind a door swung open and behind fixed cabinets, appliances, tubs and showers don't count. Bathrooms: the basin plug only.</li>
  <li>Counters: plugs at ${ELEC_H.counter}″ so no point is more than 900 mm from one, none behind the range or sink. Basin: GFCI at ${ELEC_H.gfci}″ within 1 m.</li>
  <li>No plug within 500 mm of a bathtub or shower (across the floor, same room); none on the walls behind one.</li>
  <li>Appliances get their own plug behind them: fridge 42″, range 6″, dishwasher 12″, washer / dryer 42″, microwave 42″. Beds: a plug each side of the head.</li>
  <li>Every switch box is numbered (S1, S2 …) and says what each switch does (room lights, outside light, fan …); any two switches can be paired as a 3-way, in one room or across an open space (more than two: 4-way between). Not set yet is flagged.</li>
  <li>TVs on the wall: a recessed TV box (power + low voltage) behind the screen, clear of the wall mount, on the chase nearest the middle. A new TV goes with the middle of its screen at 42″, the bottom never under 24″ (change its height on any one).</li>
  <li>No plug above a baseboard heater. A fireplace's plug or junction box (its Power) sits inside the surround and moves with it. Every library item's page lists the rules that come with it.</li>
  <li>Switches ${ELEC_H.switch}″, centre 6″ from the rough opening on the latch side, on the side the door swings into; outside doors a double box (room + outside light). Two or more entrances: 3-way, once confirmed.</li>
  <li>One weatherproof plug outside, beside the main door.</li>
  <li>Every box sits on a chase (6″ in from each edge of the original 48″ panel, then every 12″) when one is within 18″ (plugs) or 6″ (switches); otherwise it's flagged "needs a chase". Connecting walls: boxes only on the face toward the wall's own pod.</li></ul></details>`;
function openElectrical(){
  if(!dlg){ dlg=document.createElement('dialog'); dlg.className='lib-dlg el-dlg'; dlg.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Electrical</h2><button class="btn ghost" id="elX">Done</button></div><div id="elBody"></div></div>`; document.body.appendChild(dlg); dlg.querySelector('#elX').onclick=()=>dlg.close(); }
  render(); dlg.showModal();
}
/* (no ⋯ menu item: Electrical lives in the Library → Electrical → Electrical rules, and on the home and wall panels) */
export { plugDevicesHTML, switchUsesHTML, bindSwitchUses, elecWallBlock, bindElecWall, elecHomeLine, bindElecHome, openElectrical };
