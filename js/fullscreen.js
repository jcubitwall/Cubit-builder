/* Cubit Builder — fullscreen.js : full-screen 3D with the tools and data one tap (or key) away.
   Full screen fills the whole display (browser full screen where it's allowed, otherwise the whole window).
   The toggles move onto a floating bar; the walls / options panel slides in from the right with
   "Panel" or the T key, and opens by itself when you click a wall. F toggles full screen; Esc leaves it. */
import { resize } from './scene3d.js';
import { state } from './state.js';

const studio=document.getElementById('studio'), aside=studio.querySelector('aside');
const bFull=document.getElementById('bFull'), bPanel=document.getElementById('bPanel');
const tools=document.getElementById('studioTools'), fsTools=document.getElementById('fsTools'), home=tools.parentNode, homeNext=tools.nextSibling;
let on=false;

function setPanel(open){ studio.classList.toggle('panel-open', open); bPanel.setAttribute('aria-pressed', open); }
function enter(){
  if(on || state.view!=='studio') return;
  on=true; studio.classList.add('fs'); bFull.setAttribute('aria-pressed','true'); bFull.querySelector('.lbl').textContent='Exit';
  fsTools.appendChild(tools);
  setPanel(!!state.selected);
  if(studio.requestFullscreen && !document.fullscreenElement) studio.requestFullscreen().catch(()=>{});   // the window-filling version still works if refused
  requestAnimationFrame(resize);
}
function exit(){
  if(!on) return;
  on=false; studio.classList.remove('fs','panel-open'); bFull.setAttribute('aria-pressed','false'); bFull.querySelector('.lbl').textContent='Full screen';
  home.insertBefore(tools, homeNext);
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  requestAnimationFrame(resize);
}
bFull.onclick=()=> on ? exit() : enter();
bPanel.onclick=()=> setPanel(!studio.classList.contains('panel-open'));
document.addEventListener('fullscreenchange', ()=>{ if(!document.fullscreenElement && on) exit(); else requestAnimationFrame(resize); });
document.addEventListener('keydown', e=>{
  if(e.target.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if(state.view!=='studio') return;
  if(e.key==='f'||e.key==='F'){ e.preventDefault(); on ? exit() : enter(); }
  if((e.key==='t'||e.key==='T') && on){ e.preventDefault(); bPanel.click(); }
  if(e.key==='Escape' && on && !document.fullscreenElement) exit();
});
// clicking a wall, floor or deck in full screen brings the panel in with its options
studio.querySelector('#stage').addEventListener('pointerup', ()=>{ if(on) setTimeout(()=>{ if(state.selected) setPanel(true); }, 0); });

export { enter as enterFullscreen, exit as exitFullscreen };
// leaving the 3D view (sheets, plan) always leaves full screen first
new MutationObserver(()=>{ if(studio.hidden && on) exit(); }).observe(studio, {attributes:true, attributeFilter:['hidden']});
