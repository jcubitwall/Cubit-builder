/* Cubit Builder — fullscreen.js : full-screen 3D with the tools and data one tap (or key) away.
   Full screen fills the whole display (browser full screen where it's allowed, otherwise the whole window).
   The toggles move onto a floating bar. The walls / options panel opens and hides with the small arrow on
   the right edge (or T), in full screen and in the normal view, and opens by itself when you click
   something. F toggles full screen; Esc leaves it. */
import { resize } from './scene3d.js';
import { state } from './state.js';

const studio=document.getElementById('studio'), aside=studio.querySelector('aside');
const bFull=document.getElementById('bFull'), bSide=document.getElementById('bSide');
const tools=document.getElementById('studioTools'), fsTools=document.getElementById('fsTools'), home=tools.parentNode, homeNext=tools.nextSibling;
let on=false;
const touchFirst = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

let sideNormal=true;   // panel open in the normal (not full-screen) view
const overlay = () => on || (studio.classList.contains('build') && !document.documentElement.classList.contains('phone'));
function setPanel(open){
  if(overlay()) studio.classList.toggle('panel-open', open); else sideNormal=open;
  studio.classList.toggle('side-closed', !overlay() && !open);
  bSide.setAttribute('aria-expanded', open); bSide.title = (open?'Hide':'Show')+' the panel (T)';
  requestAnimationFrame(resize);
}
const panelOpen=()=> overlay() ? studio.classList.contains('panel-open') : sideNormal;
function enter(){
  if(on || state.view!=='studio') return;
  on=true; studio.classList.add('fs'); studio.classList.remove('side-closed'); bFull.setAttribute('aria-pressed','true'); bFull.querySelector('.lbl').textContent='Exit';
  fsTools.appendChild(tools);
  setPanel(!!(state.selected||state.selFurn));
  // computers use the browser's real full screen (Esc leaves). Tablets and phones fill the window instead:
  // the browser's full screen there exits on a downward swipe, which is too easy to do by accident.
  // On a tablet, only the Exit button leaves.
  if(!touchFirst && studio.requestFullscreen && !document.fullscreenElement) studio.requestFullscreen().catch(()=>{});
  document.documentElement.classList.add('fs-lock');
  requestAnimationFrame(resize);
}
function exit(){
  if(!on) return;
  on=false; studio.classList.remove('fs','panel-open'); bFull.setAttribute('aria-pressed','false'); bFull.querySelector('.lbl').textContent='Full screen';
  setPanel(sideNormal);
  home.insertBefore(tools, homeNext);
  document.documentElement.classList.remove('fs-lock');
  if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  requestAnimationFrame(resize);
}
bFull.onclick=()=> on ? exit() : enter();
bSide.onclick=()=> setPanel(!panelOpen());
document.addEventListener('fullscreenchange', ()=>{ if(!document.fullscreenElement && on) exit(); else requestAnimationFrame(resize); });
document.addEventListener('keydown', e=>{
  if(e.target.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if(state.view!=='studio') return;
  if(e.key==='f'||e.key==='F'){ e.preventDefault(); on ? exit() : enter(); }
  if(e.key==='t'||e.key==='T'){ e.preventDefault(); bSide.click(); }
  if(e.key==='Escape' && on && !document.fullscreenElement) exit();
});
// clicking a wall, floor or deck brings the panel in with its options
studio.querySelector('#stage').addEventListener('pointerup', e=>{ if(e.target.tagName!=='CANVAS') return; const x=e.clientX, y=e.clientY;
  setTimeout(()=>{ if((state.selected||state.selFurn) && !panelOpen()) setPanel(true);
    else if(!state.selected && !state.selFurn && panelOpen() && overlay() && !document.body.classList.contains('dragging') && !e.defaultPrevented) setPanel(false); }, 0); });

export { enter as enterFullscreen, exit as exitFullscreen, setPanel, panelOpen };
// leaving the 3D view (sheets, plan) always leaves full screen first
new MutationObserver(()=>{ if(studio.hidden && on) exit(); }).observe(studio, {attributes:true, attributeFilter:['hidden']});
