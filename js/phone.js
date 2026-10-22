/* Cubit Builder — phone.js : the phone layout (narrow screens). A small header with the home as a picker, and
   a tab bar at the bottom: 3D · Take-off · Shopping (admins) · Sheets · Plan (admins). The 3D view fills the
   screen; the walls / options panel comes up from the bottom when you tap something. */
import { MODELS } from './data.js';
import { state } from './state.js';
import { openSheets, closeSheets } from './sheets.js';
import { openPlan, closePlan } from './planner.js';
import { resize } from './scene3d.js';
import { takeoffHTML } from './takeoff.js';
import { renderShop } from './shop.js';

const mq = matchMedia('(max-width: 700px)');
const $ = id => document.getElementById(id);
let on=false, tab='3d';
const models=$('models'), modelsHome=models.parentNode, modelsNext=models.nextSibling;
const tools=$('studioTools');

function setHeaderHeight(){ document.documentElement.style.setProperty('--hh', $('studio').parentNode.querySelector('header.bar').getBoundingClientRect().height+'px'); }
function label(){ const m=MODELS[state.model]; $('bHomeName').textContent = m ? m.name : '…'; }

function show(t){
  tab=t;
  document.querySelectorAll('#tabs [data-tab]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.tab===t));
  const pv=$('phoneView');
  if(t==='sheets'){ pv.hidden=true; closePlan(); openSheets(); return; }
  if(t==='plan'){ pv.hidden=true; closeSheets(); openPlan(); return; }
  closePlan(); closeSheets();
  if(t==='3d'){ pv.hidden=true; $('studio').hidden=false; state.view='studio'; requestAnimationFrame(resize); return; }
  // take-off / shopping: their own page
  $('studio').hidden=true; $('sheets').hidden=true; $('planner').hidden=true; pv.hidden=false; state.view=t;
  if(t==='take') pv.innerHTML=takeoffHTML(); else { pv.innerHTML='<p class="note">Loading…</p>'; renderShop(pv); }
  window.scrollTo(0,0);
}
function enter(){
  if(on) return; on=true; document.documentElement.classList.add('phone');
  $('homeBody').appendChild(models);                       // the model chips move into the home sheet
  $('fsTools').appendChild(tools);                          // Exploded view sits on the 3D view's own bar
  if(!$('studio').classList.contains('side-closed')) $('bSide').click();   // panel starts closed
  setHeaderHeight(); label(); show(tab);
}
function leave(){
  if(!on) return; on=false; document.documentElement.classList.remove('phone');
  modelsHome.insertBefore(models, modelsNext);
  $('studioTools').hidden=false; modelsHome.insertBefore(tools, $('bPlan'));
  $('phoneView').hidden=true; if(tab==='take'||tab==='shop'){ tab='3d'; $('studio').hidden=false; state.view='studio'; }
  requestAnimationFrame(resize);
}
function initPhone(){
  const dlg=$('homeDlg');
  $('bHome').onclick=()=>dlg.showModal();
  $('homeClose').onclick=()=>dlg.close();
  $('hProjects').onclick=()=>{ dlg.close(); $('bProjects').click(); };
  $('hUpload').onclick=()=>{ dlg.close(); $('bUpload').click(); };
  // picking a home closes the sheet (a model name with more than one design stays open to pick one)
  models.addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b) return;
    setTimeout(()=>{ if(b.dataset.m || !models.querySelector('.variants')) dlg.close(); }, 0); });
  // keep the label and the open page in step with the home on screen
  new MutationObserver(()=>{ label(); if(on && (tab==='take'||tab==='shop')) show(tab); }).observe(models, {childList:true});
  document.querySelectorAll('#tabs [data-tab]').forEach(b=>b.onclick=()=>show(b.dataset.tab));
  window.addEventListener('resize', ()=>{ if(on) setHeaderHeight(); });
  const apply=()=> mq.matches ? enter() : leave();
  mq.addEventListener('change', apply); apply();
}
export { initPhone };
