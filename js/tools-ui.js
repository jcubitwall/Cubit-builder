/* Cubit Builder — tools-ui.js : the Tools tab. Every production tool and whole-home sheet as a big tile, the same on
   the iPad (a tab beside Build and Sheets) and the phone (a tab in the bottom bar), plus the Design / Shop switch.
   The tiles open what the ⋯ menu opens (that menu stays as it is). */
import { state } from './state.js';
import { mode, setMode } from './mode.js';
import { openSheets } from './sheets.js';

const isPhone = () => document.documentElement.classList.contains('phone');
const SHEETS = [
  ['__take', 'Take-off', 'by build stage'], ['__shop', 'Shopping list', 'to buy, tick off'], ['__cost', 'Cost to build', 'from the price book'],
  ['__bp', 'Blueprints', 'the drawing set, PDF'], ['__cnc', 'CNC cut files', 'G-code for the panels'], ['__labels', 'Panel labels', 'cut & stack'],
  ['__frame', 'Framing', 'lumber cut list'], ['__found', 'Foundation', 'screws or ICF'],
];
/* the ⋯ menu's tools, by id: [id, title, note] (shown only when this person has it) */
const TOOLS = [
  ['bBlueprints','Blueprints','drawing set, details'], ['bPanelB','Panel builder','walls, floors, ceilings, roofs'], ['bShapeS','Shape studio','sketch pockets and holes'],
  ['bLibrary','Library','every item, adopt, edit'], ['bPrices','Price book','prices and suppliers'], ['bCabCnc','Cabinet G-code','cabinet parts to CNC'],
  ['bProjects','Projects','saved homes, history'], ['bTrash','Deleted items','bring things back'], ['bTeam','Team','who can do what'], ['bUpload','Upload STEP','add from a STEP file'],
];
let dlg=null;
function sheet(slot){ dlg?.close(); state.sheetSlot=slot;
  if(isPhone()){ document.querySelector('#tabs [data-tab="sheets"]')?.click(); return; }
  if(state.view==='sheets') openSheets(); else document.querySelector('#views [data-v="sheets"]')?.click(); }
function has(id){ const b=document.getElementById(id); if(!b || b.hidden) return false; return getComputedStyle(b).display!=='none'; }
const markup = () => { try{ const v=parseFloat(localStorage.getItem('cubit-markup')); return isFinite(v) ? v : 0; }catch(e){ return 0; } };
function render(){
  const tile=(attr, t, n)=>`<button class="tool-t" ${attr}><b>${t}</b><small>${n}</small></button>`;
  dlg.innerHTML=`<div class="tools"><header class="tools-h"><h2>Tools</h2><button class="btn ghost" data-x="1" aria-label="Close">Done</button></header>
    <section><div class="eyebrow">Mode</div><div class="seg tools-mode" role="group" aria-label="Mode"><button data-mode="design" aria-pressed="${mode()==='design'}"><b>Design</b><small>for building with a customer</small></button><button data-mode="shop" aria-pressed="${mode()==='shop'}"><b>Shop</b><small>everything: panels, codes, CNC</small></button></div></section>
    <section class="tools-markup"><label for="tMarkup">Customer price in Design = cost +</label><input id="tMarkup" type="number" inputmode="decimal" min="0" max="300" step="1" value="${markup()}"><span>% markup</span><small>Kept on this device. The price shows beside the footprint while building (tap it to hide it).</small></section>
    <section><div class="eyebrow">Sheets for this home</div><div class="tool-g">${SHEETS.map(([k,t,n])=>tile(`data-sheet="${k}"`, t, n)).join('')}</div></section>
    <section><div class="eyebrow">Production</div><div class="tool-g">${TOOLS.filter(([id])=>has(id)).map(([id,t,n])=>tile(`data-tool="${id}"`, t, n)).join('')}</div></section></div>`;
}
function openTools(){
  if(!dlg){ dlg=document.createElement('dialog'); dlg.className='tools-dlg'; dlg.setAttribute('aria-label','Tools'); document.body.appendChild(dlg);
    dlg.addEventListener('click', e=>{
      if(e.target===dlg || e.target.closest('[data-x]')){ dlg.close(); return; }
      const m=e.target.closest('[data-mode]'); if(m){ setMode(m.dataset.mode); render(); return; }
      const s=e.target.closest('[data-sheet]'); if(s){ sheet(s.dataset.sheet); return; }
      if(e.target.id==='tMarkup') return;
      const t=e.target.closest('[data-tool]'); if(t){ dlg.close(); document.getElementById(t.dataset.tool)?.click(); } }); }
  render(); dlg.showModal();
  dlg.querySelector('#tMarkup')?.addEventListener('change', e=>{ const v=Math.max(0, Math.min(300, parseFloat(e.target.value)||0)); try{ localStorage.setItem('cubit-markup', String(v)); }catch(err){} window.dispatchEvent(new Event('cubit:markup')); });
}
/* the tab: beside Build / Sheets in the top bar (iPad, desktop), and in the phone's bottom bar */
function mount(){
  const views=document.getElementById('views');
  if(views && !views.querySelector('[data-tools]')){ const b=document.createElement('button'); b.dataset.tools='1'; b.textContent='Tools'; b.setAttribute('aria-pressed','false'); b.onclick=openTools; views.appendChild(b); }
  const tabs=document.getElementById('tabs');
  if(tabs && !tabs.querySelector('[data-tools]')){ const b=document.createElement('button'); b.dataset.tools='1'; b.setAttribute('aria-pressed','false');
    b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>Tools';
    b.onclick=openTools; tabs.appendChild(b); }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', mount); else mount();
export { openTools };
