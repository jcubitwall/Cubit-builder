/* Cubit Builder — main.js : boot + toolbar toggles */
import './dialog-back.js';
import './mode.js';
import './tools-ui.js';
import './savestate.js';
import './finishes-ui.js';
/* the offline copy (sw.js): the app opens and works with weak or no signal */
// the offline copy (sw.js). The app opens from the copy kept on the device; when a new release has been fetched in
// the background, a note offers "Reload" and the new release takes over on that reload.
if('serviceWorker' in navigator && window.isSecureContext){
  const offer = w => { if(!w || document.getElementById('swNew')) return;
    const n=document.createElement('div'); n.id='swNew'; n.className='sw-new'; n.setAttribute('role','status');
    n.innerHTML='<span>A new version of Cubit Builder is ready.</span><button class="btn">Reload</button><button class="btn ghost" aria-label="Later">Later</button>';
    n.children[1].onclick=()=>{ n.children[1].disabled=true; w.postMessage('cubit:reload'); };
    n.children[2].onclick=()=>n.remove();
    document.body.appendChild(n); };
  let reloading=false, hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(hadController && !reloading){ reloading=true; location.reload(); } hadController=true; });
  navigator.serviceWorker.register('sw.js').then(reg=>{
    if(reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', ()=>{ const w=reg.installing; w?.addEventListener('statechange', ()=>{ if(w.state==='installed' && navigator.serviceWorker.controller) offer(w); }); });
    // an iPad left open for days still hears about new releases
    setInterval(()=>reg.update().catch(()=>{}), 30*60*1000);
  }).catch(()=>{});
}
import { loadRules } from './wall-rules.js';
import { loadShapes } from './shapes.js';
import { state, initState } from './state.js';
import { loadData, FROZEN } from './data.js';
import { refreshOpen, loadProjects } from './projects.js';
import { initProjectsUI } from './projects-ui.js';
import { buildHome, resize, loop, setExplodeGoal, explodeGoal } from './scene3d.js';
import { renderModels, renderSide } from './sidebar.js';
import { openSheets, closeSheets } from './sheets.js';
import { openPlan, closePlan } from './planner.js';
import './fullscreen.js';
import { explodeLayers } from './layers.js';
import { loadRole } from './role.js';
import { initUpload } from './upload.js';
import { loadUnits } from './units.js';
import { loadCatalog } from './catalog.js';
import { loadCustomers } from './customers.js';
import { loadKitchens } from './kitchens.js';
import './team-ui.js';
import './joints.js';
import './electrical.js';
import { loadEdits } from './libedit.js';
import { startBuild } from './build.js';
import './library-ui.js';
import './trash-ui.js';
import { loadSettings, loadFixtures } from './casework.js';
import './casework-ui.js';
import './wall-builder.js';
import { loadDrafts } from './drafts.js';
import { setCabExplode, cabExploded, cabExplodeGoal } from './furniture.js';
import './publish-ui.js';
import { toast } from './sidebar.js';
import { MODELS } from './data.js';
/* the first change to a Cubit model went into your own draft copy */
window.addEventListener('cubit:draft', e=>{ setTimeout(()=>{ renderModels(); buildHome(); renderSide(); }, 0);
  const F=MODELS[e.detail.from];
  setTimeout(()=>toast(F?.locked ? `${F.name} is signed and locked · your change went into a draft in My Drafts` : `Editing your draft of ${F?.name||'this home'} · the original is unchanged`), 1800); });   // after the change's own message
import { initPhone } from './phone.js';
import { initZoomView } from './zoomview.js';
import { warmPDF } from './pdflib.js';
warmPDF();   // the PDF maker, fetched quietly once the app is up

function bindTog(id,key,fn){ const b=document.getElementById(id); b.onclick=()=>{ state[key]=!state[key]; b.setAttribute('aria-pressed',state[key]); fn(); }; }
/* Exploded view: the home (or the isolated pod); while a cabinet is isolated, that cabinet */
const tEx=document.getElementById('tExplode'), cabIso=()=>String(state.isolate||'').startsWith('furn:');
tEx.onclick=()=>{ if(cabIso()){ setCabExplode(!cabExploded()); tEx.setAttribute('aria-pressed', cabExploded()); return; }
  state.exploded=!state.exploded; tEx.setAttribute('aria-pressed',state.exploded); explodeLayers(state.exploded); setExplodeGoal(state.exploded?1:0); };
document.getElementById('bSheets').onclick=()=>{ if(state.view==='sheets'){ closeSheets(); } else { state.sheetSlot = state.selected || null; openSheets(); } };
document.getElementById('bPlan').onclick=()=>{ if(state.view==='plan'){ closePlan(); closeSheets(); } else openPlan(); };

/* iPad: spread three fingers to pull the home apart, as far as you spread them (the wider, the further, like the
   Library's 3D view); pinch them to bring it back together. While a cabinet is isolated, the cabinet. The button
   stays for mouse and phone (all the way apart / together). OrbitControls ignores three-finger touches. */
(()=>{ const stage=document.getElementById('stage'); let g=null;
  const spread=t=>{ const n=t.length; let cx=0,cy=0; for(const p of t){ cx+=p.clientX; cy+=p.clientY; } cx/=n; cy/=n;
    let d=0; for(const p of t) d+=Math.hypot(p.clientX-cx, p.clientY-cy); return d/n; };
  const setTo=v=>{
    if(cabIso()){ setCabExplode(v); tEx.setAttribute('aria-pressed', cabExploded()); return; }
    if(v>0.02 && !state.exploded){ state.exploded=true; explodeLayers(true); }
    setExplodeGoal(v); tEx.setAttribute('aria-pressed', !!state.exploded); };
  stage.addEventListener('touchstart', e=>{ if(e.touches.length===3){ g={ d0:spread(e.touches), e0: cabIso() ? cabExplodeGoal() : (state.exploded ? explodeGoal : 0), moved:false }; e.preventDefault(); } }, {passive:false});
  stage.addEventListener('touchmove', e=>{ if(!g || e.touches.length!==3) return; e.preventDefault();
    const r=spread(e.touches)/Math.max(1,g.d0); if(!g.moved && Math.abs(r-1)<0.08) return;   // a swipe (undo / redo) hardly changes the spread
    g.moved=true; window.__cubitSpread=true; setTo(Math.max(0, Math.min(1, g.e0 + (r-1)*1.6))); }, {passive:false});
  const end=e=>{ if(e.touches && e.touches.length>=3) return;
    if(g?.moved && !cabIso() && state.exploded && explodeGoal<=0.02){ state.exploded=false; explodeLayers(false); setExplodeGoal(0); tEx.setAttribute('aria-pressed', false); }
    g=null; setTimeout(()=>{ window.__cubitSpread=false; }, 60); };
  stage.addEventListener('touchend', end); stage.addEventListener('touchcancel', end);
})();

/* the how-to hints step aside once you've used the view */
document.querySelectorAll('.hint').forEach(h=>{ const host=h.parentNode; const off=()=>{ h.classList.add('gone'); host.removeEventListener('pointerdown',off); }; host.addEventListener('pointerdown',off); });

(async function boot(){
  try{ await loadRole(); await loadData(); await (await import("./brands.js")).loadBrands(); await loadUnits(); await loadProjects(); await loadCustomers(); await loadKitchens(); await (await import("./stores.js")).loadStores(); await (await import("./productmedia.js")).loadMedia(); await loadCatalog(); await (await import('./devices.js')).loadDevices(); await loadEdits(); await loadSettings(); await loadFixtures(); await loadRules(); (await import('./libsettings.js')).applyLibSettings(); await loadShapes(); }
  catch(e){ document.getElementById('sideH').innerHTML='<h2>Could not load the wall library</h2><p>Open the app from its web address (GitHub Pages) or a local web server, not by double-clicking the file.</p>'; return; }
  initState(); try{ await loadDrafts(); }catch(e){}
  try{ refreshOpen(state.model); }catch(e){ console.warn('refresh', e); }   // a team home on screen: its latest save, not this device's older copy
  initProjectsUI(); initUpload();
  renderModels(); buildHome(); renderSide(); resize(); loop(); initPhone(); initZoomView(); startBuild();
  // locked homes: the walls / floors changed since they were locked, as they were then (freeze.js)
  import('./freeze.js').then(m=>m.freezeLocked()).then(n=>{ if(n && state.model && (FROZEN[state.model])){ buildHome(); renderSide(); } }).catch(e=>console.warn('freeze', e));
})();

/* dragging a pod, cabinet or drawing must never start a text selection (iPad highlights the whole screen) */
document.addEventListener('selectstart', e=>{ const el = e.target.nodeType===1 ? e.target : e.target.parentElement;
  if(!el?.closest?.('input, textarea, select, [contenteditable], #sheet, .bp-form, .pt-tab, .boxes')) e.preventDefault(); });
document.addEventListener('pointerdown', e=>{ if(e.target.closest?.('#stage, #plan, .wb-stage, .v3-stage, .bp-stage, .cw-dlg canvas, .tray-it')) window.getSelection?.()?.removeAllRanges(); }, true);
