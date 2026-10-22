/* Cubit Builder — shop.js : the shopping list for the home on screen (admins only). Lines tick off as they're
   bought; on the private site the ticks are shared by every admin (api/shop), otherwise kept on this device.
   Share sends the list as text (Messages, Mail, the supplier). */
import { MODELS } from './data.js';
import { state } from './state.js';
import { email } from './role.js';
import { shoppingList, shoppingText } from './takeoff.js';
import { toast } from './sidebar.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const homeKey = () => state.model.replace(/[^a-z0-9_-]/gi,'-').slice(0,80);
let ticks={}, remote=null;
async function load(){
  try{ const r=await fetch('api/shop?home='+encodeURIComponent(homeKey()),{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ ticks=await r.json(); remote=true; return; } }catch(e){}
  remote=false; try{ ticks=JSON.parse(localStorage.getItem('cubit-shop-'+homeKey())||'{}'); }catch(e){ ticks={}; }
}
async function tick(key, done){
  if(done) ticks[key]={by:email()||'', at:new Date().toISOString()}; else delete ticks[key];
  if(remote){ try{ const r=await fetch('api/shop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({home:homeKey(), key, done})}); if(r.ok) ticks=await r.json(); else toast('Not saved: server said '+r.status); }catch(e){ toast('Not saved: no connection'); } }
  else try{ localStorage.setItem('cubit-shop-'+homeKey(), JSON.stringify(ticks)); }catch(e){}
}
async function renderShop(el){
  await load();
  const lines=shoppingList(), m=MODELS[state.model];
  const done=lines.filter(l=>ticks[l.key]).length;
  let g='', h=`<div class="to-head"><div class="eyebrow">Shopping list${remote?' · shared with all admins':' · this device'}</div><h3>${esc(m.name)}</h3>
    <div class="row"><button class="btn" id="shShare">Share list</button><span class="muted">${done} of ${lines.length} ticked</span></div></div><ul class="shop">`;
  lines.forEach(l=>{ if(l.group!==g){ g=l.group; h+=`<li class="shop-g">${esc(g)}</li>`; }
    const t=ticks[l.key];
    h+=`<li><label class="shop-l ${t?'done':''}"><input type="checkbox" data-k="${esc(l.key)}" ${t?'checked':''}><span class="to-n">${l.n}</span><span class="to-w"><b>${esc(l.what)}</b>${t?`<small>${esc(t.by||'')} · ${esc((t.at||'').slice(0,10))}</small>`:''}</span></label></li>`; });
  el.innerHTML=h+'</ul>';
  el.querySelectorAll('input[data-k]').forEach(c=>c.onchange=async()=>{ await tick(c.dataset.k, c.checked); renderShop(el); });
  el.querySelector('#shShare').onclick=async()=>{ const text=shoppingText(lines);
    if(navigator.share){ try{ await navigator.share({title:`${m.name} — shopping list`, text}); return; }catch(e){ if(e.name==='AbortError') return; } }
    try{ await navigator.clipboard.writeText(text); toast('List copied'); }catch(e){ toast('Could not share the list here'); } };
}
export { renderShop };
