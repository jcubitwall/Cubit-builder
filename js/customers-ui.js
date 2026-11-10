/* Cubit Builder — customers-ui.js : customer profiles, linking homes, signing and unlocking.

   openCustomer(id)   the profile: contact and site, the linked home(s) with everything picked in them, the finishes
                      typed in, sign & lock, the signed summary (PDF), the log. null = a new customer.
   pickCustomer()     the list to link a home to (or ＋ New customer); resolves with the customer's id.
   openSign(cid, k)   both sign on the screen; the home locks.
   openUnlock(k)      editors and admins: reason and fee, then the home opens for changes again. */
import { MODELS } from './data.js';
import { state, save } from './state.js';
import { canSave, canEdit, email } from './role.js';
import { CUSTOMERS, FINISHES, CAT_NAME, liveCustomers, customerById, newCustomerId, saveCustomer, linkHome, signHome, signedRecord, deleteCustomer, restoreCustomer, homeSummary } from './customers.js';
import { saveProject, lockProject, unlockProject, projectOf } from './projects.js';
import { renderModels, renderSide, toast } from './sidebar.js';
import { buildHome } from './scene3d.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when = iso => iso ? new Date(iso).toLocaleString(undefined,{dateStyle:'medium', timeStyle:'short'}) : '';
const day = iso => iso ? new Date(iso).toLocaleDateString(undefined,{dateStyle:'medium'}) : '';
const refresh = () => { renderModels(); buildHome(); renderSide(); };
const homesOf = cid => Object.keys(MODELS).filter(k=>MODELS[k].project && MODELS[k].customer===cid);
function dialog(id, cls='lib-dlg cust-dlg'){ let d=document.getElementById(id); if(!d){ d=document.createElement('dialog'); d.id=id; d.className=cls; document.body.appendChild(d); } return d; }

/* ---------------------------------------------------------------- the profile */
const PF = [['name','Name','text'],['company','Company','text'],['phone','Phone','tel'],['email','Email','email'],['address','Mailing address','text'],['site','Site (where the home goes)','text']];
function summaryHTML(S){
  if(!S) return '<p class="note">Open the home once to read its selections.</p>';
  const li = a => a.length ? `<ul>${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">none</span>';
  const cab = Object.entries(S.cabinets||{}).map(([c,o])=>`<div><b>${esc(CAT_NAME[c]||c)}</b>${li(Object.entries(o).map(([n,q])=>`${q} × ${n}`))}</div>`).join('');
  return `<dl class="cust-sum"><dt>Home</dt><dd>${esc(S.home)} · ${esc(S.pods)} pods · ${S.area} sq ft</dd><dt>Foundation</dt><dd>${esc(S.foundation)}</dd>
    ${S.decks.length?`<dt>Decks</dt><dd>${esc(S.decks.join(', '))}</dd>`:''}<dt>Windows</dt><dd>${li(S.windows)}</dd><dt>Outside doors</dt><dd>${li(S.doors)}</dd><dt>Inside doors & openings</dt><dd>${li(S.inside)}</dd>
    <dt>Cabinets, appliances & fixtures</dt><dd>${cab||'<span class="muted">none placed yet</span>'}</dd><dt>Pot lights</dt><dd>${S.lights}</dd></dl>`;
}
function openCustomer(id){
  const isNew=!id, c = id ? customerById(id) : { id:newCustomerId(), name:'', homes:[], selections:{} };
  if(!c){ toast('That customer is gone.'); return; }
  const d=dialog('custDlg'), ro=!canSave();
  const homes = isNew ? [] : homesOf(c.id);
  d.innerHTML=`<form class="dlg cust-f" method="dialog"><div class="dlg-h"><h2>${isNew?'New customer':esc(c.name)}</h2><button class="btn ghost" value="close" formnovalidate>Close</button></div>
    <div class="cust-grid">${PF.map(([k,l,t])=>`<label class="fld">${l}<input type="${t}" data-k="${k}" value="${esc(c[k]||'')}" ${ro?'disabled':''} ${k==='name'?'required':''}></label>`).join('')}
      <label class="fld cust-wide">Notes<textarea data-k="notes" rows="3" ${ro?'disabled':''}>${esc(c.notes||'')}</textarea></label></div>
    ${isNew?'':`<div class="cust-homes-h"><h3>Home${homes.length===1?'':'s'}</h3></div>
    ${homes.length ? homes.map(k=>{ const m=MODELS[k], pid=m.project, sg=c.signed?.[pid], F=c.selections?.[pid]||{}, locked=!!m.locked;
      return `<section class="cust-home" data-home="${esc(k)}"><div class="cust-hh"><b>${esc(m.name)}</b><span class="badge ${locked?'lock':''}">${locked?`Signed ${esc(day(m.locked.at))} · locked`:'Not signed yet'}</span>
          <span class="spacer"></span><button type="button" class="btn ghost sm" data-open="${esc(k)}">Open</button>
          ${!locked && canSave()?`<button type="button" class="btn sm" data-sign="${esc(k)}">Sign & lock</button>`:''}${locked && canEdit()?`<button type="button" class="btn ghost sm" data-unlock="${esc(k)}">Unlock…</button>`:''}${sg?`<button type="button" class="btn ghost sm" data-pdf="${esc(pid)}">Signed summary (PDF)</button>`:''}</div>
        <details ${homes.length===1?'open':''}><summary>Selections</summary>${summaryHTML(homeSummary(k))}
          <div class="cust-fin">${FINISHES.map(([f,l])=>`<label class="fld">${l}<input data-fin="${esc(pid)}:${f}" value="${esc(F[f]||'')}" ${ro||locked?'disabled':''} placeholder="${locked?'':'to choose'}"></label>`).join('')}</div>
          ${(m.unlocks||[]).length?`<p class="note">Unlocked: ${m.unlocks.map(u=>`${esc(day(u.at))} (${esc(u.reason)}${u.fee?` · fee ${esc(u.fee)}`:''})`).join('; ')}</p>`:''}</details></section>`; }).join('')
      : '<p class="note">No home linked yet. Open a draft or an Unassigned home and tap <b>Save to Customer</b>.</p>'}
    <details class="cust-log"><summary>Log</summary><ul>${(c.log||[]).slice().reverse().map(l=>`<li>${esc(when(l.at))} · ${esc(l.what)}${l.by?` · ${esc(String(l.by).split('@')[0])}`:''}</li>`).join('')}</ul></details>`}
    <div class="row cust-acts">${ro?'':`<button class="btn" value="save" id="cuSave">${isNew?'Add customer':'Save'}</button>`}${!isNew && canEdit()?`<button type="button" class="btn ghost danger" id="cuDel">Delete customer</button>`:''}</div></form>`;
  const f=d.querySelector('form');
  const collect = () => { const it={ ...c, selections:{...(c.selections||{})} }; f.querySelectorAll('[data-k]').forEach(el=>it[el.dataset.k]=el.value.trim());
    f.querySelectorAll('[data-fin]').forEach(el=>{ const [pid,k]=el.dataset.fin.split(':'); (it.selections[pid] ||= {})[k]=el.value.trim(); }); delete it.log; return it; };
  f.onsubmit=async e=>{ if(e.submitter?.value!=='save') return; e.preventDefault(); const it=collect(); if(!it.name){ toast('A customer needs a name.'); return; }
    try{ await saveCustomer(it); toast(isNew?`${it.name} added`:'Customer saved'); renderModels(); if(isNew) openCustomer(it.id); else d.close(); }catch(err){ toast('Not saved: '+err.message); } };
  d.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{ state.model=b.dataset.open; state.selected=null; save(); d.close(); refresh(); });
  d.querySelectorAll('[data-sign]').forEach(b=>b.onclick=async()=>{ try{ await saveCustomer(collect()); }catch(e){} d.close(); openSign(c.id, b.dataset.sign); });
  d.querySelectorAll('[data-unlock]').forEach(b=>b.onclick=()=>{ d.close(); openUnlock(b.dataset.unlock); });
  d.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>signedPDF(c.id, b.dataset.pdf));
  d.querySelector('#cuDel')?.addEventListener('click', async e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again: kept 2 weeks, then gone'; return; }
    try{ await deleteCustomer(c.id); d.close(); renderModels(); toast(`${c.name} deleted · editors can bring it back for 2 weeks`); }catch(err){ toast('Not deleted: '+err.message); } });
  d.returnValue=''; if(!d.open) d.showModal(); if(isNew) d.querySelector('[data-k="name"]')?.focus();
}

/* ---------------------------------------------------------------- pick a customer for a home */
function pickCustomer(){
  return new Promise(res=>{
    const d=dialog('custPick'); let q='';
    const draw=()=>{ const L=liveCustomers().filter(c=>!q || `${c.name} ${c.company||''} ${c.email||''}`.toLowerCase().includes(q.toLowerCase()));
      d.querySelector('#cpL').innerHTML = L.map(c=>`<button class="fam-it" data-c="${esc(c.id)}"><b>${esc(c.name)}</b><small>${esc([c.company, c.phone, homesOf(c.id).length?`${homesOf(c.id).length} home(s)`:''].filter(Boolean).join(' · '))}</small></button>`).join('') || '<p class="note">No customer by that name.</p>';
      d.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{ done(b.dataset.c); }); };
    d.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Save to which customer?</h2><button class="btn ghost" id="cpX">Cancel</button></div>
      <button class="fam-it new" id="cpNew"><b>＋ New customer</b><small>make the profile now</small></button>
      <input type="search" id="cpQ" placeholder="Search customers" aria-label="Search customers"><div class="fam-list" id="cpL"></div></div>`;
    let settled=false; const done=v=>{ if(settled) return; settled=true; d.close(); res(v); };
    d.querySelector('#cpX').onclick=()=>done(null); d.onclose=()=>done(null);
    d.querySelector('#cpQ').oninput=e=>{ q=e.target.value; draw(); };
    d.querySelector('#cpNew').onclick=()=>{ const f=document.createElement('form'); f.className='cust-quick';
      f.innerHTML=`<label class="fld">Name<input id="cqN" required></label><label class="fld">Phone<input id="cqP" type="tel"></label><label class="fld">Email<input id="cqE" type="email"></label><div class="row"><button class="btn">Add and link</button></div>`;
      d.querySelector('#cpNew').replaceWith(f); f.querySelector('#cqN').focus();
      f.onsubmit=async e=>{ e.preventDefault(); const it={ id:newCustomerId(), name:f.querySelector('#cqN').value.trim(), phone:f.querySelector('#cqP').value.trim(), email:f.querySelector('#cqE').value.trim(), homes:[], selections:{} };
        if(!it.name) return; try{ await saveCustomer(it); done(it.id); }catch(err){ toast('Not saved: '+err.message); } }; };
    draw(); d.showModal(); d.querySelector('#cpQ').focus();
  });
}

/* ---------------------------------------------------------------- signing */
function pad(canvas){
  const g=canvas.getContext('2d'); let down=false, any=false, last=null;
  const fit=()=>{ const r=canvas.getBoundingClientRect(); canvas.width=Math.round(r.width*2); canvas.height=Math.round(r.height*2); g.lineWidth=4; g.lineCap='round'; g.lineJoin='round'; g.strokeStyle='#111'; };
  fit();
  const pt=e=>{ const r=canvas.getBoundingClientRect(); return [(e.clientX-r.left)*2, (e.clientY-r.top)*2]; };
  canvas.addEventListener('pointerdown', e=>{ e.preventDefault(); canvas.setPointerCapture(e.pointerId); down=true; last=pt(e); });
  canvas.addEventListener('pointermove', e=>{ if(!down) return; const p=pt(e); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last=p; any=true; });
  const up=()=>{ down=false; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  return { clear:()=>{ g.clearRect(0,0,canvas.width,canvas.height); any=false; }, has:()=>any, png:()=>canvas.toDataURL('image/png') };
}
async function openSign(cid, k){
  const c=customerById(cid), m=MODELS[k]; if(!c || !m) return;
  const S=homeSummary(k);
  const d=dialog('signDlg', 'lib-dlg sign-dlg');
  d.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Sign · ${esc(m.name)}</h2><button class="btn ghost" id="sgX">Cancel</button></div>
    <p class="note">Signing locks this home and everything selected in it for <b>${esc(c.name)}</b>. Changes afterwards need an unlock by an editor or admin, and may carry a fee.</p>
    <details><summary>What's being signed</summary>${summaryHTML(S)}${Object.entries(c.selections?.[m.project]||{}).filter(([,v])=>v).map(([f,v])=>`<div class="muted">${esc(FINISHES.find(x=>x[0]===f)?.[1]||f)}: ${esc(v)}</div>`).join('')}</details>
    <div class="sign-pads"><div><label class="fld">Customer<input id="sgCn" value="${esc(c.name)}"></label><canvas class="sig" id="sgC" aria-label="Customer signature"></canvas><button class="linkbtn" id="sgCc">Clear</button></div>
      <div><label class="fld">Cubit rep<input id="sgRn" value="${esc((email()||'').split('@')[0])}"></label><canvas class="sig" id="sgR" aria-label="Rep signature"></canvas><button class="linkbtn" id="sgRc">Clear</button></div></div>
    <div class="row"><button class="btn" id="sgGo">Sign and lock</button></div></div>`;
  d.showModal();
  const pc=pad(d.querySelector('#sgC')), pr=pad(d.querySelector('#sgR'));
  d.querySelector('#sgCc').onclick=()=>pc.clear(); d.querySelector('#sgRc').onclick=()=>pr.clear(); d.querySelector('#sgX').onclick=()=>d.close();
  d.querySelector('#sgGo').onclick=async e=>{
    if(!pc.has() || !pr.has()){ toast('Both need to sign.'); return; }
    const b=e.target; b.disabled=true;
    try{
      // the home as it is now is what's signed: save it first
      const r=await saveProject(m.name, false, { customer:cid }); const pid=(r.project||projectOf(state.model))?.id || m.project;
      const rec={ client:d.querySelector('#sgCn').value.trim()||c.name, rep:d.querySelector('#sgRn').value.trim(), sigClient:pc.png(), sigRep:pr.png(),
        summary:homeSummary(state.model), finishes:c.selections?.[pid]||{}, customer:{ name:c.name, company:c.company||'', phone:c.phone||'', email:c.email||'', address:c.address||'', site:c.site||'' }, home:{ id:pid, name:m.name } };
      await signHome(cid, pid, rec);
      await lockProject(pid, { customer:cid, rep:rec.rep, client:rec.client });
      d.close(); refresh(); toast(`Signed. ${m.name} is locked for ${c.name}.`);
      signedPDF(cid, pid, rec);
    }catch(err){ toast('Not signed: '+err.message); b.disabled=false; }
  };
}
function openUnlock(k){
  const m=MODELS[k]; if(!m?.locked) return;
  if(!canEdit()){ toast('Only editors and admins can unlock a signed home.'); return; }
  const d=dialog('unlockDlg');
  d.innerHTML=`<form class="dlg" method="dialog"><div class="dlg-h"><h2>Unlock ${esc(m.name)}?</h2></div>
    <p class="note">Signed ${esc(when(m.locked.at))}${m.locked.client?` by ${esc(m.locked.client)}`:''}. Unlocking lets the home change again; it's logged on the home and the customer, and should be signed again when it's done.</p>
    <label class="fld">Why<input id="ulR" required placeholder="e.g. customer wants a bigger window in the bedroom"></label>
    <label class="fld">Fee (if any)<input id="ulF" placeholder="e.g. $250"></label>
    <div class="row"><button class="btn danger" value="ok">Unlock</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
  d.onclose=async()=>{ if(d.returnValue!=='ok') return; const reason=d.querySelector('#ulR').value.trim(), fee=d.querySelector('#ulF').value.trim(); if(!reason){ toast('Say why it is being unlocked.'); return; }
    try{ await unlockProject(m.project, reason, fee); const c=customerById(m.customer); if(c) await saveCustomer({...c, status:'Changes', log:undefined}, `home ${m.project} unlocked: ${reason}${fee?` · fee ${fee}`:''}`); refresh(); toast(`${m.name} unlocked`); }catch(err){ toast('Not unlocked: '+err.message); } };
  d.returnValue=''; d.showModal();
}

/* ---------------------------------------------------------------- the signed summary as a PDF */
async function signedPDF(cid, pid, rec=null){
  rec = rec || await signedRecord(cid, pid); if(!rec){ toast('No signed record found.'); return; }
  const doc=new window.jspdf.jsPDF({unit:'pt', format:'letter'}); const W=612; let y=48;
  const clean=t=>String(t??'').replace(/[′‘’]/g,"'").replace(/[″“”]/g,'"').replace(/×/g,'x').replace(/·/g,'-').replace(/[^\x20-\x7E]/g,'');
  const text=(t,x,size=10,bold=false)=>{ doc.setFont('helvetica', bold?'bold':'normal'); doc.setFontSize(size); const L=doc.splitTextToSize(clean(t), W-x-48); L.forEach(l=>{ if(y>740){ doc.addPage(); y=48; } doc.text(l, x, y); y+=size*1.35; }); };
  try{ const logo=await (await fetch('brand/cubit-logo.png')).blob(); const url=await new Promise(r=>{ const f=new FileReader(); f.onload=()=>r(f.result); f.readAsDataURL(logo); }); doc.addImage(url,'PNG',48,30,150,56); }catch(e){}
  y=110; text('Home selections · signed', 48, 18, true); text(`${rec.home?.name||''} · signed ${when(rec.at||new Date().toISOString())}`, 48, 10);
  y+=6; const C=rec.customer||{}; text('Customer', 48, 12, true); [C.name, C.company, C.phone, C.email, C.address, C.site?`Site: ${C.site}`:''].filter(Boolean).forEach(l=>text(l, 60));
  const S=rec.summary; if(S){ y+=6; text('Home', 48, 12, true); text(`${S.home} · ${S.pods} pods · ${S.area} sq ft · ${S.foundation}${S.decks?.length?` · decks ${S.decks.join(', ')}`:''}`, 60);
    [['Windows',S.windows],['Outside doors',S.doors],['Inside doors and openings',S.inside]].forEach(([h,a])=>{ if(a?.length){ y+=4; text(h, 48, 11, true); a.forEach(l=>text('- '+l, 60)); } });
    const cab=Object.entries(S.cabinets||{}); if(cab.length){ y+=4; text('Cabinets, appliances and fixtures', 48, 11, true); cab.forEach(([c,o])=>{ text(CAT_NAME[c]||c, 60, 10, true); Object.entries(o).forEach(([n,q])=>text(`- ${q} x ${n}`, 72)); }); }
    text(`Pot lights: ${S.lights}`, 48, 10); }
  const F=Object.entries(rec.finishes||{}).filter(([,v])=>v); if(F.length){ y+=6; text('Finishes', 48, 12, true); F.forEach(([f,v])=>text(`${FINISHES.find(x=>x[0]===f)?.[1]||f}: ${v}`, 60)); }
  if(y>600){ doc.addPage(); y=48; }
  y+=16; text('By signing, the customer and Cubit agree that the home and selections above are final. Changes after signing require an unlock and may carry a fee.', 48, 9);
  y+=10; const sy=y;
  if(rec.sigClient) doc.addImage(rec.sigClient,'PNG',48,sy,220,70); if(rec.sigRep) doc.addImage(rec.sigRep,'PNG',330,sy,220,70);
  y=sy+80; doc.setDrawColor(120); doc.line(48,y,268,y); doc.line(330,y,550,y); y+=14;
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(clean(`Customer: ${rec.client||''}`), 48, y); doc.text(clean(`Cubit rep: ${rec.rep||''}`), 330, y);
  const blob=doc.output('blob'), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=clean(`${C.name||'Customer'} - ${rec.home?.name||'home'} - signed ${day(rec.at||new Date().toISOString())}.pdf`).replace(/[\\/:*?"<>|]/g,'-'); document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export { openCustomer, pickCustomer, openSign, openUnlock, signedPDF };
