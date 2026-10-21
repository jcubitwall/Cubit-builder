/* Cubit Builder — main.js : boot + toolbar toggles */
import { state, initState } from './state.js';
import { loadData } from './data.js';
import { loadProjects } from './projects.js';
import { initProjectsUI } from './projects-ui.js';
import { buildHome, resize, loop, controls, setExplodeGoal, refreshRoof } from './scene3d.js';
import { renderModels, renderSide } from './sidebar.js';
import { openSheets, closeSheets } from './sheets.js';
import { openPlan, closePlan } from './planner.js';

function bindTog(id,key,fn){ const b=document.getElementById(id); b.onclick=()=>{ state[key]=!state[key]; b.setAttribute('aria-pressed',state[key]); fn(); }; }
bindTog('tExplode','exploded',()=>{ setExplodeGoal(state.exploded?1:0); });
bindTog('tRoof','roof',()=>refreshRoof());
bindTog('tNums','nums',()=>buildHome());
bindTog('tLetters','letters',()=>buildHome());
bindTog('tScrews','screws',()=>{ controls.maxPolarAngle = state.screws ? Math.PI*0.62 : Math.PI*0.495; buildHome(); renderSide(); });
document.getElementById('bSheets').onclick=()=>{ if(state.view==='sheets'){ closeSheets(); } else { state.sheetSlot = state.selected || null; openSheets(); } };
document.getElementById('bPlan').onclick=()=>{ if(state.view==='plan'){ closePlan(); closeSheets(); } else openPlan(); };

(async function boot(){
  try{ await loadData(); await loadProjects(); }
  catch(e){ document.getElementById('sideH').innerHTML='<h2>Could not load the wall library</h2><p>Open the app from its web address (GitHub Pages) or a local web server, not by double-clicking the file.</p>'; return; }
  initState(); initProjectsUI();
  renderModels(); buildHome(); renderSide(); resize(); loop();
})();
