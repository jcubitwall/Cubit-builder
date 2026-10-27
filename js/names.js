/* Cubit Builder — names.js : your own names for the parts of a home, shown beside their codes.

   Wall D stays Wall D (and its panels stay 1D-1, 1D-2 …, so the shop codes stay short and unique), but it can be
   called "Kitchen wall" too: everywhere it's listed it reads "Wall D · Kitchen wall", and the labels and sheets
   print the name beside the code. Same for floors / ceilings / roofs, pods and decks.
   Names belong to the home (state.names[home][key]) and travel with it: drafts, projects, published homes.
   Keys: 'w:<slot id>' a wall · 'l:<layer slot id>' a floor, ceiling or roof · 'p:<pod index>' · 'd:<deck index>'.
   Renaming a protected home (a Cubit model or a published variation) makes your draft copy first, as any change. */
import { state, save } from './state.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nameOf = (key, k=state.model) => state.names?.[k]?.[key] || '';
const withName = (label, key, k) => { const n=nameOf(key, k); return n ? `${label} · ${n}` : label; };
async function setName(key, v){
  const { ensureDraft } = await import('./pods.js');
  const k=ensureDraft();                           // a protected home turns into your draft first
  const b=((state.names ||= {})[k] ||= {}); v=String(v||'').trim().slice(0,60);
  if(v) b[key]=v; else delete b[key];
  save(); return k;
}
/* a small window to type a name; resolves to the text ('' = clear it) or null (cancelled) */
function askName({ title='Name', current='', placeholder='', note='' }={}){
  return new Promise(res=>{
    const d=document.createElement('dialog'); d.className='lib-dlg'; d.id='nameDlg';
    d.innerHTML=`<form method="dialog" class="dlg"><div class="dlg-h"><h2>${esc(title)}</h2></div>
      <label for="nmIn">Name</label><input type="text" id="nmIn" maxlength="60" autocomplete="off" value="${esc(current)}" placeholder="${esc(placeholder)}">
      ${note?`<p class="note">${note}</p>`:''}
      <div class="row"><button class="btn" value="ok">Save</button>${current?'<button class="btn ghost" value="clear" formnovalidate>Clear the name</button>':''}<button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('close', ()=>{ const v=d.returnValue, t=d.querySelector('#nmIn').value; d.remove(); res(v==='ok' ? t.trim() : v==='clear' ? '' : null); });
    d.returnValue=''; d.showModal(); const i=d.querySelector('#nmIn'); i.focus(); i.select();
  });
}
export { nameOf, withName, setName, askName };
