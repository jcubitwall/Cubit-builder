/* Cubit Builder — upload.js : admins upload STEP files (Wall, Pod or Home). The file goes to the server,
   a scan runs (GitHub Action), and the results land in the libraries; this dialog follows the scan and
   shows what was added. */
import { isAdmin } from './role.js';
import { toast } from './sidebar.js';

const el = id => document.getElementById(id);
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let watching=null, timer=null;

function summaryText(s){
  if(!s) return '';
  if(s.kind==='unit') return `${s.new_units?'New unit':'Already in the library as'} <b>${esc(s.unit)}</b> · ${esc(s.type)} · ${s.w}″ × ${s.h}″ × ${s.d}″ deep${s.note?' · <span class="flipflag">'+esc(s.note)+'</span>':''}`;
  if(s.kind==='wall') return `${s.new_walls?'New wall':'Already in the library as'} <b>${esc(s.wall)}</b> · ${esc(s.type==='int'?'interior':'exterior')} · ${s.openings} opening${s.openings===1?'':'s'} · ${esc(s.fitted||'')}${/no "OSB out"/.test(s.outside_face||'')?' · <span class="flipflag">outside face guessed (no “OSB out” body): check it</span>':''}`;
  const bits=[`${s.pods} pod${s.pods===1?'':'s'}`, `${s.new_walls} new wall${s.new_walls===1?'':'s'}`, `${s.new_layers} new floor/ceiling layer${s.new_layers===1?'':'s'}`, `${s.new_pods} new pod${s.new_pods===1?'':'s'}`];
  if(s.decks!=null) bits.push(`${s.decks} deck${s.decks===1?'':'s'} (${s.new_decks} new)`);
  return bits.join(' · ') + (s.project?` · saved as shared project <b>${esc(s.project)}</b>`:'');
}
function rowHTML(i){
  const st = i.status==='done' ? '<b style="color:var(--ok)">Done</b>' : i.status==='failed' ? '<b class="flipflag">Failed</b>' : '<b>Scanning…</b>';
  return `<div class="projrow"><b>${esc(i.name)}</b><small>${esc(i.kind)} · ${esc(i.by||'')} · ${esc((i.finished||i.started||'').replace('T',' ').slice(0,16))}</small>
    <div class="acts">${st}</div>
    <small style="grid-column:1/-1">${i.status==='failed'?`<span class="flipflag">${esc(i.error||'')}</span>`:summaryText(i.summary)}</small></div>`;
}
async function refresh(){
  try{
    const r=await fetch('api/imports',{cache:'no-store'}); const list=r.ok?await r.json():[];
    const mine = watching && list.find(i=>i.id===watching.id);
    let h='';
    if(watching && !mine) h+=`<div class="projrow"><b>${esc(watching.name)}</b><small>${esc(watching.kind)} · uploaded</small><div class="acts"><b>Scanning…</b></div><small style="grid-column:1/-1">Usually 2–5 minutes. You can close this; it keeps going.</small></div>`;
    if(mine && watching){ clearInterval(timer); timer=null;
      toast(mine.status==='done' ? `${watching.name}: scan finished` : `${watching.name}: scan failed`);
      if(mine.status==='done') h+=`<p class="note">The site updates itself a minute or so after a scan. <button class="linkbtn" id="upReload">Reload now</button></p>`;
      watching=null; }
    h+= list.length ? `<div class="eyebrow" style="margin:10px 0 6px">Recent uploads</div><div class="projlist">${list.slice(0,12).map(rowHTML).join('')}</div>` : '';
    el('upStatus').innerHTML=h;
    const rl=el('upReload'); if(rl) rl.onclick=()=>location.reload();
  }catch(e){ el('upStatus').innerHTML='<p class="note">Could not reach the server for upload status.</p>'; }
}
function initUpload(){
  if(!isAdmin()) return;
  const dlg=el('upDlg');
  el('bUpload').onclick=()=>{ dlg.showModal(); refresh(); };
  el('upClose').onclick=()=>dlg.close();
  const unitUI=()=>{ const k=new FormData(el('upForm')).get('kind'), t=el('upType').value;
    el('upUnit').hidden = k!=='unit';
    el('upHandF').hidden = !['casement','slider','entry','patio'].includes(t);
    el('upSwingF').hidden = t!=='entry'; };
  el('upForm').addEventListener('change', unitUI);
  el('upForm').onsubmit=async e=>{
    e.preventDefault();
    const f=el('upFile').files[0], name=el('upName').value.trim();
    let kind=new FormData(el('upForm')).get('kind');
    if(kind==='unit') kind=`unit-${el('upType').value}-${el('upHand').value}-${el('upSwing').value}`;
    if(!f || !name) return;
    const go=el('upGo'); go.disabled=true; go.textContent='Uploading…';
    try{
      const q=new URLSearchParams({kind, name, filename:f.name});
      const r=await fetch('api/upload?'+q, { method:'PUT', body:f, headers:{'content-type':'application/octet-stream'} });
      const out=await r.json().catch(()=>({error:`Server said ${r.status}`}));
      if(!r.ok) throw new Error(out.error||`Server said ${r.status}`);
      watching={ id:out.id, name, kind: kind.startsWith('unit')?'window / door':kind }; el('upForm').reset(); unitUI();
      toast('Uploaded. Scanning on the server…');
      refresh(); clearInterval(timer); timer=setInterval(refresh, 15000);
    }catch(err){ toast(err.message); el('upStatus').innerHTML=`<p class="note flipflag">${esc(err.message)}</p>`; }
    go.disabled=false; go.textContent='Upload and scan';
  };
}
export { initUpload };
