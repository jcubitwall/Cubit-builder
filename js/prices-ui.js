/* Cubit Builder — prices-ui.js : the Price book (⋯ → Price book) and the home's Cost to build sheet.

   Price book: every product the app knows (prices.js products()), grouped, with a search and a "not priced" filter.
   Editors, admins and anyone given Prices in the team list (an inventory person) type a cost straight into the list; it saves on its own a moment later (only what changed).
   Each price shows who set it and when. A spreadsheet (CSV) goes out and comes back in: change the cost column in
   Excel or Numbers and upload it; rows are matched by their key (or by the product's name). Salespeople can look. */
import { loadPrices, book, savePrices, isLocal, products, forgetProducts, homeCost, money } from './prices.js';
import { canPrice } from './role.js';
import { state } from './state.js';
import { MODELS } from './data.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const say = async t => { const { toast }=await import('./sidebar.js'); toast(t); };
const parseCost = s => { s=String(s??'').trim().replace(/[$,\s]/g,''); if(!s) return null; const v=+s; return isFinite(v) && v>=0 ? Math.round(v*100)/100 : NaN; };
const when = iso => iso ? new Date(iso).toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' }) : '';
const csvCell = v => /[",\n]/.test(String(v??'')) ? `"${String(v).replace(/"/g,'""')}"` : String(v??'');
function download(name, text){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text], { type:'text/csv' })); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000); }
function parseCSV(t){ const rows=[]; let r=[], c='', q=false;
  for(let i=0;i<t.length;i++){ const ch=t[i];
    if(q){ if(ch==='"'){ if(t[i+1]==='"'){ c+='"'; i++; } else q=false; } else c+=ch; }
    else if(ch==='"') q=true; else if(ch===','){ r.push(c); c=''; } else if(ch==='\n' || ch==='\r'){ if(ch==='\r' && t[i+1]==='\n') i++; r.push(c); rows.push(r); r=[]; c=''; } else c+=ch; }
  if(c!=='' || r.length){ r.push(c); rows.push(r); } return rows.filter(x=>x.some(v=>v.trim()!=='')); }

/* ---------------------------------------------------------------- the price book */
let dlg=null, q='', show='all', P=[], pending={}, timer=null, saving=false;
async function openPriceBook(){
  if(!dlg){ dlg=document.createElement('dialog'); dlg.className='lib-dlg pb-dlg'; document.body.appendChild(dlg); }
  dlg.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Price book</h2><button class="btn ghost" id="pbX">Done</button></div><p class="note">Loading…</p></div>`;
  dlg.querySelector('#pbX').onclick=()=>dlg.close(); dlg.showModal();
  await loadPrices(true);
  if(book().denied){ dlg.querySelector('.note').textContent='Prices are for salespeople, editors and admins.'; return; }
  forgetProducts(); P=products(); render();
}
function render(){
  const ed=canPrice(), B=book().items, groups=[...new Set(P.map(p=>p.group))];
  const unpriced=P.filter(p=>typeof B[p.key]?.cost!=='number').length;
  const match=p=>(!q || (p.name+' '+p.group+' '+p.key).toLowerCase().includes(q.toLowerCase())) && (show==='all' || (show==='none' ? typeof B[p.key]?.cost!=='number' : p.group===show));
  const list=P.filter(match);
  const body=groups.map(g=>{ const rows=list.filter(p=>p.group===g); if(!rows.length) return '';
    return `<div class="pb-g"><div class="eyebrow">${esc(g)} <small>${rows.length}</small></div>${rows.map(p=>{ const v=B[p.key], c=typeof v?.cost==='number'?v.cost:'';
      return `<div class="pb-row${c===''?' none':''}"><div class="pb-n"><b>${esc(p.name)}</b><small>${esc(p.unit)}${v?.at?` · ${esc(v.by||'')} · ${when(v.at)}`:''}${v?.prev?.length?` · was ${money(v.prev[0].cost)}`:''}</small></div>
        ${ed?`<label class="pb-c"><i>$</i><input data-key="${esc(p.key)}" inputmode="decimal" value="${c===''?'':c.toFixed(2)}" placeholder="—" aria-label="Cost of ${esc(p.name)}"></label>`:`<span class="pb-c ro">${money(c===''?null:c)}</span>`}</div>`; }).join('')}</div>`; }).join('');
  dlg.innerHTML=`<div class="dlg pb"><div class="dlg-h"><h2>Price book</h2><span class="spacer"></span><span class="pb-st" id="pbSt">${saving?'Saving…':Object.keys(pending).length?'Not saved yet':''}</span><button class="btn ghost" id="pbX">Done</button></div>
    <p class="note">What Cubit pays for each product, used for every home's <b>Cost to build</b> sheet. ${ed?'Type a cost and it saves on its own.':'Editors, admins and people given Prices in the team list change prices.'}${isLocal()?' <b>Local server: saved in this browser only.</b>':''}</p>
    <div class="pb-bar"><input type="search" id="pbQ" placeholder="Search products" value="${esc(q)}">
      <div class="seg wrap sm"><button data-show="all" aria-pressed="${show==='all'}">All ${P.length}</button><button data-show="none" aria-pressed="${show==='none'}">Not priced ${unpriced}</button>${groups.map(g=>`<button data-show="${esc(g)}" aria-pressed="${show===g}">${esc(g.replace(/^Build materials · /,''))}</button>`).join('')}</div></div>
    <div class="pb-list">${body || '<p class="note">Nothing matches.</p>'}</div>
    <div class="row pb-io"><button class="btn ghost sm" id="pbOut">Download spreadsheet (CSV)</button>${ed?'<label class="btn ghost sm pb-in">Upload spreadsheet (CSV)<input type="file" id="pbIn" accept=".csv,text/csv" hidden></label>':''}</div>
    <p class="note muted">Lumber, LVL and other materials are priced by the piece or measure the shopping list buys them in. Labour: a rate per trade, and the standard hours each job takes.</p></div>`;
  const $=s=>dlg.querySelector(s);
  $('#pbX').onclick=async()=>{ await flush(); dlg.close(); refreshSheet(); };
  const qi=$('#pbQ'); qi.oninput=()=>{ q=qi.value; const pos=qi.selectionStart; render(); const n=dlg.querySelector('#pbQ'); n.focus(); n.setSelectionRange(pos,pos); };
  dlg.querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>{ show=b.dataset.show; render(); });
  dlg.querySelectorAll('[data-key]').forEach(inp=>{ inp.onchange=()=>{ const v=parseCost(inp.value); if(Number.isNaN(v)){ say('Type a cost in dollars, e.g. 12.50'); inp.focus(); return; }
      const p=P.find(x=>x.key===inp.dataset.key); pending[p.key]={ cost:v, unit:p.unit, name:p.name }; inp.value=v==null?'':v.toFixed(2); queue(); };
    inp.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } }; });
  $('#pbOut').onclick=()=>exportCSV();
  $('#pbIn')?.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f) importCSV(f); });
}
const status = t => { const s=dlg?.querySelector('#pbSt'); if(s) s.textContent=t; };
function queue(){ status('Not saved yet'); clearTimeout(timer); timer=setTimeout(flush, 700); }
async function flush(){
  clearTimeout(timer); const set=pending; if(!Object.keys(set).length) return; pending={}; saving=true; status('Saving…');
  try{ await savePrices(set); saving=false; status(`Saved ${Object.keys(set).length} price${Object.keys(set).length>1?'s':''}`); }
  catch(e){ saving=false; pending={ ...set, ...pending }; status('Not saved'); say(e.message); }
}
function exportCSV(){
  const B=book().items, rows=[['key','group','product','unit','cost','updated','by']];
  P.forEach(p=>{ const v=B[p.key]; rows.push([p.key, p.group, p.name, p.unit, typeof v?.cost==='number'?v.cost.toFixed(2):'', v?.at?v.at.slice(0,10):'', v?.by||'']); });
  download(`cubit-price-book-${new Date().toISOString().slice(0,10)}.csv`, rows.map(r=>r.map(csvCell).join(',')).join('\n'));
}
async function importCSV(file){
  const rows=parseCSV(await file.text()); if(rows.length<2){ say('That spreadsheet is empty'); return; }
  const h=rows[0].map(x=>x.trim().toLowerCase()), ik=h.indexOf('key'), ip=h.indexOf('product'), ic=h.indexOf('cost');
  if(ic<0 || (ik<0 && ip<0)){ say('The spreadsheet needs a "cost" column and a "key" or "product" column (download one to see)'); return; }
  const B=book().items, set={}; let bad=0, unknown=0;
  rows.slice(1).forEach(r=>{ const p = ik>=0 && r[ik] ? P.find(x=>x.key===r[ik].trim()) : P.find(x=>x.name.toLowerCase()===String(r[ip]||'').trim().toLowerCase());
    if(!p){ unknown++; return; } const v=parseCost(r[ic]); if(Number.isNaN(v)){ bad++; return; }
    const old=typeof B[p.key]?.cost==='number'?B[p.key].cost:null; if(v===old) return; if(v===null && old===null) return;
    set[p.key]={ cost:v, unit:p.unit, name:p.name }; });
  const n=Object.keys(set).length;
  if(!n){ say(`No prices changed${unknown?` · ${unknown} rows not matched`:''}${bad?` · ${bad} costs not understood`:''}`); return; }
  if(!confirm(`Update ${n} price${n>1?'s':''} from the spreadsheet?${unknown?`\n${unknown} rows didn't match a product and are skipped.`:''}${bad?`\n${bad} costs weren't understood and are skipped.`:''}`)) return;
  try{ status('Saving…'); await savePrices(set); render(); say(`${n} price${n>1?'s':''} updated from the spreadsheet`); }catch(e){ status('Not saved'); say(e.message); }
}

/* ---------------------------------------------------------------- the home's cost to build (Sheets) */
let sheetEl=null;
async function renderCostSheet(el){
  sheetEl=el; el.innerHTML='<p class="note">Working out the cost…</p>';
  await loadPrices();
  if(book().denied){ el.innerHTML='<p class="note">Costs are for salespeople, editors and admins.</p>'; return; }
  let C; try{ C=homeCost(); }catch(e){ el.innerHTML=`<p class="note">Couldn't work out the cost: ${esc(e.message)}</p>`; return; }
  const m=MODELS[state.model];
  el.innerHTML=`<div class="cost"><div class="to-head"><div class="eyebrow">Cost to build · Cubit's cost, no markup</div><h3>${esc(m?.name||'')}</h3></div>
    <div class="cost-sum"><span><small>Priced</small><b>${money(C.total)}</b></span><span><small>Lines</small><b>${C.lines.length}</b></span>${C.missing?`<span class="warn"><small>Not priced</small><b>${C.missing}</b></span>`:''}</div>
    ${C.missing?`<p class="note warn">${C.missing} line${C.missing>1?'s have':' has'} no price yet, so the total is short. <button class="linkbtn" id="costBook">Open the price book</button></p>`:''}
    ${C.groups.map(g=>`<details class="to-stage" open><summary><b>${esc(g.group)}</b><span>${money(g.total)}${g.missing?` · ${g.missing} not priced`:''}</span></summary>
      <table class="boxes cost-t"><thead><tr><th>Item</th><th>Qty</th><th>Unit cost</th><th>Total</th></tr></thead><tbody>${C.lines.filter(l=>l.group===g.group).map(l=>`<tr class="${l.total==null?'none':''}"><td>${esc(l.name)}</td><td>${+l.n.toFixed(2)} ${esc(l.unit)}</td><td>${l.labour&&l.cost==null&&l.unit!=='h'?'set hours':money(l.cost)}</td><td>${money(l.total)}</td></tr>`).join('')}</tbody></table></details>`).join('')}
    <div class="row"><button class="btn ghost sm" id="costCsv">Download (CSV)</button><button class="btn ghost sm" id="costBook2">Price book…</button></div>
    <p class="note muted">Quantities from the take-off and shopping list (materials as bought, with their waste allowances), the windows and doors chosen, the SIP panels (a cut panel counts as a whole one), the cabinets' sheets, banding and hardware, countertops, and everything bought and placed. Labour: standard hours × each trade's rate.</p></div>`;
  el.querySelector('#costBook')?.addEventListener('click', ()=>openPriceBook());
  el.querySelector('#costBook2').onclick=()=>openPriceBook();
  el.querySelector('#costCsv').onclick=()=>{ const rows=[['group','item','qty','unit','unit cost','total']]; C.lines.forEach(l=>rows.push([l.group, l.name, l.n, l.unit, l.cost??'', l.total??''])); rows.push([]); rows.push(['','','','','Total (priced)', C.total.toFixed(2)]);
    download(`${(m?.name||'home').replace(/[^\w-]+/g,'-')}-cost.csv`, rows.map(r=>r.map(csvCell).join(',')).join('\n')); };
}
function refreshSheet(){ if(sheetEl && sheetEl.isConnected && state.sheetSlot==='__cost') renderCostSheet(sheetEl); }

/* ⋯ → Price book */
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bPrices')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bPrices'; b.className='edit-only price-menu'; b.textContent='Price book'; pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openPriceBook(); }; } }

export { openPriceBook, renderCostSheet };
