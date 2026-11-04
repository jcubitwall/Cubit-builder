/* Cubit Builder — team-ui.js : ⋯ → Team (admins only). Who is an Admin, Editor, Salesperson or User.
   Anyone who can log in and isn't on this list is a User (looks, saves nothing). The admins set in the Cloudflare
   settings (ADMIN_EMAILS) are shown and always stay admins. "Prices" lets someone keep the price book up to date (an
   inventory person) whatever their role; editors and admins can always. */
import { isAdmin, roleName } from './role.js';
import { toast } from './sidebar.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ROLES = [['admin','Admin','everything, plus app settings, the team and uploads'],['editor','Editor','everything except app settings'],['sales','Salesperson','customers, swap walls, add pods, basic changes with a client'],['user','User','looks at everything, saves nothing']];
let dlg=null, data={ members:{}, admins:[] };
async function call(body){
  const r=await fetch('api/team', body ? { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) } : { cache:'no-store' });
  const out=await r.json().catch(()=>({})); if(!r.ok) throw new Error(out.error || `Server said ${r.status}`); data=out; return out;
}
function render(){
  const opts = r => ROLES.map(([k,l])=>`<option value="${k}" ${k===r?'selected':''}>${l}</option>`).join('');
  const rows = Object.entries(data.members||{}).sort((a,b)=>a[0].localeCompare(b[0]));
  dlg.querySelector('#tmBody').innerHTML=`
    <div class="tm-list">${(data.admins||[]).map(e=>`<div class="tm-row"><span>${esc(e)}</span><span class="badge">Admin · Cloudflare setting</span></div>`).join('')}
      ${rows.map(([e,v])=>{ const always=v.role==='admin'||v.role==='editor';
        return `<div class="tm-row"><span>${esc(e)}</span><select data-e="${esc(e)}" aria-label="Role for ${esc(e)}">${opts(v.role)}</select><label class="tm-pr" title="${always?'Editors and admins can always change prices':'Can change the price book'}"><input type="checkbox" data-pr="${esc(e)}" ${always||v.prices?'checked':''} ${always?'disabled':''}> Prices</label><button class="linkbtn" data-rm="${esc(e)}">Remove</button></div>`; }).join('') || '<p class="note">Nobody added yet.</p>'}</div>
    <form class="tm-add" id="tmAdd"><input type="email" id="tmE" placeholder="name@cubithome.com" required aria-label="Email"><select id="tmR">${opts('sales')}</select><label class="tm-pr"><input type="checkbox" id="tmP"> Prices</label><button class="btn">Add</button></form>
    <dl class="tm-roles">${ROLES.map(([,l,t])=>`<dt>${l}</dt><dd>${t}</dd>`).join('')}<dt>Prices</dt><dd>on top of any role: can change the price book (⋯ → Price book), e.g. an inventory person as a User with Prices. Editors and admins always can</dd></dl>
    <p class="note">They also need to be let in by Cloudflare Access (the site's login). Anyone who can log in and isn't listed here is a User.</p>`;
  const B=dlg.querySelector('#tmBody');
  B.querySelectorAll('[data-e]').forEach(s=>s.onchange=async()=>{ try{ await call({op:'set', email:s.dataset.e, role:s.value}); render(); toast(`${s.dataset.e} is now ${roleName(s.value)}`); }catch(e){ toast(e.message); } });
  B.querySelectorAll('[data-pr]').forEach(c=>c.onchange=async()=>{ const e=c.dataset.pr, v=data.members[e]; try{ await call({op:'set', email:e, role:v.role, prices:c.checked}); render(); toast(c.checked?`${e} can change prices`:`${e} can no longer change prices`); }catch(err){ c.checked=!c.checked; toast(err.message); } });
  B.querySelectorAll('[data-rm]').forEach(b=>b.onclick=async()=>{ if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again'; return; } try{ await call({op:'remove', email:b.dataset.rm}); render(); }catch(e){ toast(e.message); } });
  B.querySelector('#tmAdd').onsubmit=async e=>{ e.preventDefault(); const em=B.querySelector('#tmE').value.trim(), r=B.querySelector('#tmR').value;
    const pr=B.querySelector('#tmP').checked;
    try{ await call({op:'set', email:em, role:r, prices:pr}); render(); toast(`${em} added as ${roleName(r)}${pr?' with Prices':''}`); }catch(err){ toast(err.message); } };
}
async function openTeam(){
  if(!isAdmin()){ toast('Only admins manage the team.'); return; }
  if(!dlg){ dlg=document.createElement('dialog'); dlg.className='lib-dlg tm-dlg'; dlg.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Team</h2><button class="btn ghost" id="tmX">Done</button></div><div id="tmBody"><p class="note">Loading…</p></div></div>`; document.body.appendChild(dlg); dlg.querySelector('#tmX').onclick=()=>dlg.close(); }
  dlg.showModal();
  try{ await call(); render(); }catch(e){ dlg.querySelector('#tmBody').innerHTML=`<p class="note">${esc(e.message)}</p>`; }
}
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bTeam')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bTeam'; b.className='admin-only'; b.textContent='Team'; pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openTeam(); }; } }
export { openTeam };
