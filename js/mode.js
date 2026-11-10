/* Cubit Builder — mode.js : Design or Shop, the switch in the top bar.

   Design  for building with a customer: the plan as a drawing (room names, sizes, outside dimensions), no panel
           numbers or wall letters, the side panel leads with the choices a customer makes, the shop's own buttons
           (assembly sheets, panel builder, panel codes, CNC variants) out of the way, a short Layers list.
   Shop    the app with everything showing, for the people who build it.
   Nothing is taken away in Design: it's all one tap away in Shop. The choice is kept on this device. The page carries
   html.mode-design or html.mode-shop, so the CSS can hide shop-only parts (.shop-only) in Design. */
const KEY='cubit-mode';
let MODE='design';
try{ const v=localStorage.getItem(KEY); if(v==='shop'||v==='design') MODE=v; }catch(e){}
const fns=[];
const mode = () => MODE;
const isShop = () => MODE==='shop';
const isDesign = () => MODE==='design';
function apply(){
  const r=document.documentElement; r.classList.toggle('mode-design', MODE==='design'); r.classList.toggle('mode-shop', MODE==='shop');
  document.querySelectorAll('.mode-sw [data-mode]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.mode===MODE)));
}
function setMode(m){
  if(m!=='design' && m!=='shop') return; if(m===MODE) return;
  MODE=m; try{ localStorage.setItem(KEY, m); }catch(e){}
  apply(); fns.forEach(f=>{ try{ f(m); }catch(e){ console.warn('mode', e); } });
}
const onMode = fn => { fns.push(fn); };
/* the switch, in the top bar beside Build / Sheets */
function mountSwitch(){
  if(document.querySelector('.mode-sw')) return;
  const views=document.getElementById('views'); if(!views) return;
  const sw=document.createElement('div'); sw.className='mode-sw'; sw.setAttribute('role','group'); sw.setAttribute('aria-label','Mode');
  sw.innerHTML=`<button data-mode="design" title="Design: rooms, sizes and choices, for building with a customer">Design</button><button data-mode="shop" title="Shop: everything, with panel numbers, codes, sheets and CNC">Shop</button>`;
  views.after(sw);
  sw.addEventListener('click', e=>{ const b=e.target.closest('[data-mode]'); if(b) setMode(b.dataset.mode); });
  apply();
}
apply();
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', mountSwitch); else mountSwitch();
export { mode, isShop, isDesign, setMode, onMode };
