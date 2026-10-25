/* Cubit Builder — main.js : boot + toolbar toggles */
import { state, initState } from './state.js';
import { loadData } from './data.js';
import { loadProjects } from './projects.js';
import { initProjectsUI } from './projects-ui.js';
import { buildHome, resize, loop, setExplodeGoal } from './scene3d.js';
import { renderModels, renderSide } from './sidebar.js';
import { openSheets, closeSheets } from './sheets.js';
import { openPlan, closePlan } from './planner.js';
import './fullscreen.js';
import { explodeLayers } from './layers.js';
import { loadRole } from './role.js';
import { initUpload } from './upload.js';
import { loadUnits } from './units.js';
import { loadCatalog } from './catalog.js';
import { loadEdits } from './libedit.js';
import { startBuild } from './build.js';
import './library-ui.js';
import { loadSettings, loadFixtures } from './casework.js';
import './casework-ui.js';
import { loadDrafts } from './drafts.js';
import { setCabExplode, cabExploded } from './furniture.js';
import './publish-ui.js';
import { toast } from './sidebar.js';
import { MODELS } from './data.js';
/* the first change to a Cubit model went into your own draft copy */
window.addEventListener('cubit:draft', e=>{ setTimeout(()=>{ renderModels(); buildHome(); renderSide(); }, 0);
  setTimeout(()=>toast(`Editing your draft of ${MODELS[e.detail.from]?.name||'this home'} · the Cubit model is unchanged`), 1800); });   // after the change's own message
import { initPhone } from './phone.js';
import { initZoomView } from './zoomview.js';

function bindTog(id,key,fn){ const b=document.getElementById(id); b.onclick=()=>{ state[key]=!state[key]; b.setAttribute('aria-pressed',state[key]); fn(); }; }
/* Exploded view: the home (or the isolated pod); while a cabinet is isolated, that cabinet */
const tEx=document.getElementById('tExplode'), cabIso=()=>String(state.isolate||'').startsWith('furn:');
tEx.onclick=()=>{ if(cabIso()){ setCabExplode(!cabExploded()); tEx.setAttribute('aria-pressed', cabExploded()); return; }
  state.exploded=!state.exploded; tEx.setAttribute('aria-pressed',state.exploded); explodeLayers(state.exploded); setExplodeGoal(state.exploded?1:0); };
document.getElementById('bSheets').onclick=()=>{ if(state.view==='sheets'){ closeSheets(); } else { state.sheetSlot = state.selected || null; openSheets(); } };
document.getElementById('bPlan').onclick=()=>{ if(state.view==='plan'){ closePlan(); closeSheets(); } else openPlan(); };

/* iPad: spread three fingers to explode the home, pinch three fingers to put it back together. The button stays
   for mouse and phone. OrbitControls ignores three-finger touches, so the two don't fight. */
(()=>{ const stage=document.getElementById('stage'); let g=null;
  const spread=t=>{ const n=t.length; let cx=0,cy=0; for(const p of t){ cx+=p.clientX; cy+=p.clientY; } cx/=n; cy/=n;
    let d=0; for(const p of t) d+=Math.hypot(p.clientX-cx, p.clientY-cy); return d/n; };
  const want=on=>{ const cur = cabIso() ? cabExploded() : !!state.exploded; if(cur!==on) tEx.click(); };
  stage.addEventListener('touchstart', e=>{ if(e.touches.length===3){ g={d0:spread(e.touches), done:false}; e.preventDefault(); } }, {passive:false});
  stage.addEventListener('touchmove', e=>{ if(!g || e.touches.length!==3) return; e.preventDefault(); if(g.done) return;
    const r=spread(e.touches)/g.d0; if(r>1.2){ want(true); g.done=true; } else if(r<0.83){ want(false); g.done=true; } }, {passive:false});
  stage.addEventListener('touchend', e=>{ if(e.touches.length<3) g=null; });
  stage.addEventListener('touchcancel', ()=>{ g=null; });
})();

/* the how-to hints step aside once you've used the view */
document.querySelectorAll('.hint').forEach(h=>{ const host=h.parentNode; const off=()=>{ h.classList.add('gone'); host.removeEventListener('pointerdown',off); }; host.addEventListener('pointerdown',off); });

(async function boot(){
  try{ await loadRole(); await loadData(); await loadUnits(); await loadProjects(); await loadCatalog(); await loadEdits(); await loadSettings(); await loadFixtures(); }
  catch(e){ document.getElementById('sideH').innerHTML='<h2>Could not load the wall library</h2><p>Open the app from its web address (GitHub Pages) or a local web server, not by double-clicking the file.</p>'; return; }
  initState(); try{ await loadDrafts(); }catch(e){}
  initProjectsUI(); initUpload();
  renderModels(); buildHome(); renderSide(); resize(); loop(); initPhone(); initZoomView(); startBuild();
})();
