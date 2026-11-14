/* Cubit Builder — finishes-ui.js : Finishes, picked by eye. A panel of swatches (siding, roof, wall paint, flooring,
   cabinets) that floats over Build, so the 3D changes behind it as you tap. Opened from the toolbar (🎨 Finishes)
   or from a floor's side panel. finishes.js keeps them on the home; in Design the 3D shows them. */
import { MODELS } from './data.js';
import { state, save } from './state.js';
import { canSave } from './role.js';
import { PALETTE, LABEL, finishOf, colourOf, designFinish } from './finishes.js';
import { buildHome, homeGroup, onBuilt } from './scene3d.js';
import { onMode, isDesign, setMode } from './mode.js';
import { toast } from './sidebar.js';

const stage=document.getElementById('stage');
const pop=document.createElement('div'); pop.className='fin-pop'; pop.hidden=true; pop.setAttribute('role','dialog'); pop.setAttribute('aria-label','Finishes'); stage.appendChild(pop);
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(){
  const f=finishOf();
  pop.innerHTML=`<div class="fin-h"><b>Finishes</b><button class="btn ghost sm" data-fx="1" aria-label="Close">Done</button></div>
    ${isDesign()?'':'<p class="note">The 3D shows finishes in Design. <button class="linkbtn" data-fdesign="1">Switch to Design</button></p>'}
    ${Object.keys(PALETTE).map(part=>`<div class="fin-row"><div class="fin-l">${LABEL[part]}<small>${esc(f[part]||(part==='units'?'Black (standard)':'not picked'))}</small></div><div class="fin-sw" role="group" aria-label="${LABEL[part]}">
      ${PALETTE[part].map(([n,c])=>`<button class="sw-b" data-part="${part}" data-n="${esc(n)}" aria-pressed="${(f[part]||(part==='units'?'Black':''))===n}" title="${esc(n)}" style="--c:${c}"><span></span></button>`).join('')}
      ${f[part]?`<button class="sw-x" data-part="${part}" data-n="" title="Clear">✕</button>`:''}</div></div>`).join('')}
    <p class="note">Cabinets are recorded for the selections; the 3D keeps the library's look. Windows &amp; doors show black or white in every mode; one opening can differ (tap its wall). Everything here also fills the customer's finish selections.</p>`;
}
function open(on){ pop.hidden=!on; document.getElementById('bFinish')?.setAttribute('aria-pressed', String(on)); if(on) render(); }
pop.addEventListener('click', async e=>{
  if(e.target.closest('[data-fx]')){ open(false); return; }
  if(e.target.closest('[data-fdesign]')){ setMode('design'); render(); return; }
  const b=e.target.closest('[data-part]'); if(!b) return;
  if(!canSave()){ toast('Viewers can look but not pick finishes.'); return; }
  const { ensureDraft } = await import('./pods.js'); const k=ensureDraft(), m=MODELS[k];
  const part=b.dataset.part, n=b.dataset.n; m.finish={ ...(m.finish||{}) }; if(n) m.finish[part]=n; else delete m.finish[part];
  if(m.custom){ const { saveCustomModels } = await import('./data.js'); saveCustomModels?.(); }
  save(); buildHome(); render(); toast(n ? `${LABEL[part]}: ${n}` : `${LABEL[part]} cleared`);
});
/* the roof and the floor take their colours (Design); the walls' skins are made with the walls (scene3d.js) */
function tint(){
  const F=designFinish(); if(!F) return;
  homeGroup.traverse(o=>{ if(!o.isMesh || !o.material || Array.isArray(o.material)) return; const id=o.userData.slotId||'';
    const c = F.roof && /:roof$/.test(id) ? F.roof : F.floor && /:floor-int$/.test(id) ? F.floor : null;
    if(c){ if(!o.userData.finMat){ o.material=o.material.clone(); o.userData.finMat=true; } o.material.color.set(c); } });
}
onBuilt(()=>setTimeout(tint, 0));
onMode(()=>{ buildHome(); if(!pop.hidden) render(); });
/* the toolbar button, beside Present */
setTimeout(()=>{ const bar=document.querySelector('#stage .fs-bar'), after=document.querySelector('#stage .snap-b')||document.getElementById('bFull'); if(!bar || document.getElementById('bFinish')) return;
  const b=document.createElement('button'); b.className='fsbtn'; b.id='bFinish'; b.innerHTML='<span aria-hidden="true">🎨</span> Finishes'; b.title='Siding, roof, paint, flooring and cabinets, by eye'; b.setAttribute('aria-pressed','false');
  b.onclick=()=>open(pop.hidden); (after||bar.lastChild).after(b); }, 50);
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !pop.hidden){ open(false); } });
export { open as openFinishes };
