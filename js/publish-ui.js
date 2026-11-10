/* Cubit Builder — publish-ui.js : New home, My drafts, and publishing a draft to the shared library.

   · New home: start from scratch (one blank pod), optionally filed under a model name.
   · My drafts: only you see them. Changing a Cubit model or a published variation makes a draft copy first.
   · Adopt into Cubit Homes, only from Unassigned (a draft is saved to Unassigned first, so the other teams see it):
     as a variation (sub-model) under any model name — or, three warnings later, over the Cubit model it was
     copied from. Every replaced version is kept on the server. */
import { MODELS } from './data.js';
import { state, save } from './state.js';
import { FAMILIES, familyById, familyOf, saveSub, saveOver, removeOver, OVERS, removeSub, editSub, takeMerged } from './catalog.js';
import { mergedText } from './sync.js';
import { newHome, renameDraft, setDraftFamily, deleteDraft, myDrafts, isDraft } from './drafts.js';
import { canSave, canEdit } from './role.js';
import { saveProject, deleteProject } from './projects.js';
import { customerById, linkHome } from './customers.js';
import { pickCustomer, openCustomer, openSign, openUnlock } from './customers-ui.js';
import { deleteItem } from './libedit.js';
import { renderModels, renderSide, toast, showHomeCat } from './sidebar.js';
import { buildHome } from './scene3d.js';
import { foot, makeDraftCopy } from './pods.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const famOpts = (sel, none='Decide later') => `<option value="">${none}</option>`+FAMILIES.filter(f=>!f.deleted).map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${esc(f.name)}</option>`).join('');
const refresh = () => { renderModels(); buildHome(); renderSide(); };
function dialog(id){ let d=document.getElementById(id); if(!d){ d=document.createElement('dialog'); d.id=id; d.className='lib-dlg pub-dlg'; document.body.appendChild(d); } return d; }

/* ---------------------------------------------------------------- New home
   A gallery: each Cubit model (its footprint and size) and a blank 24′, 16′ or 8′ pod. One tap starts building. The
   name, model name and customer are optional, under "Name, model, customer". A model starts as your draft copy of it;
   with a customer picked, the home is saved to that customer straight away. */
const POD_LEN={ L24:24, P16:16, P8:8 };
function footSVG(pods){
  const F=pods.map(foot); if(!F.length) return '';
  const x0=Math.min(...F.map(f=>f.x)), z0=Math.min(...F.map(f=>f.z)), x1=Math.max(...F.map(f=>f.x+f.w)), z1=Math.max(...F.map(f=>f.z+f.d)), W=x1-x0, D=z1-z0;
  return `<svg viewBox="${-1} ${-1} ${W+2} ${D+2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${F.map(f=>`<rect x="${f.x-x0}" y="${D-(f.z-z0)-f.d}" width="${f.w}" height="${f.d}" fill="#efe9da" stroke="#1c211e" stroke-width=".5"/>`).join('')}</svg>`;
}
function openNewHome(){
  if(!canSave()){ toast('Viewers can look but not build homes.'); return; }
  const d=dialog('newDlg'); d.classList.add('nh-dlg');
  const originals=Object.keys(MODELS).filter(k=>{ const m=MODELS[k]; return m && !m.deleted && !m.custom && !m.project && m.pods?.length; })
    .sort((a,b)=>FAMILIES.findIndex(f=>f.id===familyOf(a))-FAMILIES.findIndex(f=>f.id===familyOf(b)) || (MODELS[a].sub?1:0)-(MODELS[b].sub?1:0));
  const area=k=>MODELS[k].pods.filter(p=>!(+p.lv)).reduce((a,p)=>{ const f=foot(p); return a+f.w*f.d; },0);
  let cid=null;
  d.innerHTML=`<form method="dialog" class="dlg"><div class="dlg-h"><h2>New home</h2><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>
    <p class="note">Tap where to start. It opens as your draft; only you see it until you save it for the team or a customer.</p>
    <div class="nh-grid">${originals.map(k=>`<button type="button" class="nh-card" data-from="${esc(k)}"><span class="nh-pic">${footSVG(MODELS[k].pods)}</span><b>${esc(MODELS[k].name)}</b><small>${area(k)} sq ft · ${esc(MODELS[k].size||'')}</small></button>`).join('')}
      ${Object.entries(POD_LEN).map(([t,l])=>`<button type="button" class="nh-card blank" data-t="${t}"><span class="nh-pic">${footSVG([{t, x:0, z:0, rot:0}])}</span><b>Blank ${l}′ pod</b><small>${l*8} sq ft · start from scratch</small></button>`).join('')}</div>
    <details class="nh-more"><summary>Name, model, customer (optional)</summary>
      <label for="nhName">Name</label><input type="text" id="nhName" maxlength="80" placeholder="e.g. Smith cottage" autocomplete="off">
      <label for="nhFam">Model it belongs to</label><select id="nhFam" class="pub-sel">${famOpts(familyOf(state.model)||'')}</select>
      <label>Customer</label><div class="row"><span class="nh-cust">None yet</span><button type="button" class="btn ghost sm" id="nhCust">Pick or add a customer…</button></div>
    </details></form>`;
  d.querySelector('#nhCust').onclick=async()=>{ const c=await pickCustomer(); if(!c) return; cid=c; d.querySelector('.nh-cust').textContent=customerById(c)?.name||'Customer'; };
  const start=async({ from=null, pod='L24' })=>{
    const typed=d.querySelector('#nhName').value.trim(), fam=d.querySelector('#nhFam').value||null;
    const day=new Date().toLocaleDateString(undefined,{month:'short', day:'numeric'});
    const name=typed || `${from?MODELS[from].name:'New home'} · ${day}`;
    d.close('started');
    if(from){ state.model=from; makeDraftCopy(from); renameDraft(state.model, name); if(fam) setDraftFamily(state.model, fam); }
    else newHome({ name, family:fam, pod });
    document.getElementById('homeDlg')?.close();
    refresh(); setTimeout(()=>import('./build.js').then(b=>b.flatten(true)), 80);
    if(cid){ try{ const k=state.model, r=await saveProject(name, true, { customer:cid }); const pid=r.project?.id; await deleteDraft(k, { moved:true }); if(pid) await linkHome(cid, pid);
        showHomeCat('cust'); refresh(); toast(`“${name}” started for ${customerById(cid)?.name||'the customer'}`); }
      catch(err){ toast(`Started in My drafts (not linked to the customer: ${err.message||err})`); } return; }
    toast(`“${name}” started in My drafts · name it any time`);
  };
  d.querySelectorAll('[data-from]').forEach(b=>b.onclick=()=>start({ from:b.dataset.from }));
  d.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>start({ pod:b.dataset.t }));
  d.returnValue=''; d.showModal();
}

/* ---------------------------------------------------------------- the home panel: what this home is and what you can do with it
   My Draft    → Save to Unassigned · Save to Customer   (adopting into Cubit Homes is only from Unassigned, so the
                 other teams see a home there first)
   Unassigned   → Save changes · Save to Customer · (editors) Adopt into Cubit Homes · Delete
   Customer    → Profile · Save changes · Sign & lock  ·  locked: (editors) Unlock
   Cubit Home  → protected: a change makes a draft · (editors) replace it from Unassigned (a changed copy saved there), or delete it (typed name) */
const who = e => e ? String(e).split('@')[0] : '';
const day = iso => iso ? new Date(iso).toLocaleDateString(undefined,{dateStyle:'medium'}) : '';
function draftBlock(){
  const k=state.model, m=MODELS[k]; if(!m) return '';
  if(m.custom){
    const from=m.from && MODELS[m.from];
    return `<div class="pub-box draft"><div class="eyebrow">My Draft · only you can see it</div>
      <p>${from?`Copied from <b>${esc(from.name)}</b>. `:m.scratch?'Started from scratch. ':''}${m.savedAt?`Saved ${new Date(m.savedAt).toLocaleString()}.`:''}</p>
      <label class="fld">Model it belongs to<select id="dfFam" class="pub-sel" ${canSave()?'':'disabled'}>${famOpts(m.family||'')}</select></label>
      <div class="row edit-only"><button class="btn" id="hsPurg">Save to Unassigned</button><button class="btn ghost" id="hsCust">Save to Customer</button></div>
      <p class="note editor-only">To adopt it into Cubit Homes, save it to Unassigned first so the other teams see it. Adopt it from there.</p>
      <div class="row"><button class="btn ghost sm edit-only" id="dfRen">Rename</button><button class="btn ghost sm edit-only" id="dfDel">Delete draft</button></div></div>`;
  }
  if(m.project){
    if(m.customer){
      const c=customerById(m.customer);
      return `<div class="pub-box cust"><div class="eyebrow">Customer · ${esc(c?.name||'(customer removed)')}</div>
        <p>${m.locked?`🔒 <b>Signed ${esc(day(m.locked.at))}</b>${m.locked.client?` by ${esc(m.locked.client)}`:''} · locked. Changes go into a draft until it's unlocked.`:'Not signed yet.'}${m.saved?` Saved ${esc(day(m.saved))}${m.by?` by ${esc(who(m.by))}`:''}.`:''}</p>
        <div class="row">${c?'<button class="btn ghost edit-only" id="hsProf">Profile</button>':''}${m.locked?'<button class="btn ghost editor-only" id="hsUnlock">Unlock…</button>':`<button class="btn edit-only" id="hsSave">Save changes</button>${c?'<button class="btn ghost edit-only" id="hsSign">Sign & lock</button>':''}`}<button class="btn ghost sm" id="hsHist">History</button></div></div>`;
    }
    return `<div class="pub-box purg"><div class="eyebrow">Unassigned · waiting for the team</div>
      <p>${m.saved?`Saved ${esc(day(m.saved))}${m.by?` by ${esc(who(m.by))}`:''}. `:''}The team reviews it here: adopt it into Cubit Homes, or save it to a customer.</p>
      <div class="row edit-only"><button class="btn" id="hsSave">Save changes</button><button class="btn ghost" id="hsCust">Save to Customer</button></div>
      <div class="row"><button class="btn ghost sm editor-only" id="dfPub">Adopt into Cubit Homes…</button><button class="btn ghost sm editor-only" id="hsDel">Delete</button><button class="btn ghost sm" id="hsHist">History</button></div></div>`;
  }
  const fam=familyById(familyOf(k));
  return `<div class="pub-box"><div class="eyebrow">Cubit Homes · ${esc(fam?.name||'')} ${m.sub?'variation':'original'} · protected</div>
      <p>Change anything and it goes into your own copy in My Drafts, so ${esc(m.name)} stays as it is for everyone.${m.overAt?` Last replaced ${new Date(m.overAt).toLocaleDateString()}${m.overBy?` by ${esc(m.overBy)}`:''}.`:''}</p>
      <details class="editor-only"><summary>Manage this original</summary>
        ${m.sub?`<label class="fld">Name<input id="subName" value="${esc(m.name)}" maxlength="80"></label>
        <label class="fld">Model<select id="subFam" class="pub-sel">${FAMILIES.map(f=>`<option value="${f.id}" ${f.id===m.family?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>
        <div class="row"><button class="btn ghost sm" id="subEdit">Rename / move</button></div>`:''}
        <p class="note">To replace it: change it (that makes your draft), save the draft to Unassigned, then from Unassigned tap Adopt into Cubit Homes → Replace ${esc(m.name)}.</p>
        ${m.overAt?`<button class="btn ghost sm" id="ovBack">Go back to the shop files' version</button>`:''}
        <label class="fld">Delete from Cubit Homes: type “${esc(m.name)}”<input id="cdName" autocomplete="off"></label>
        <div class="row"><button class="btn ghost sm danger" id="cdDel" disabled>Delete ${esc(m.name)}</button></div>
        <p class="note">Deleted originals can be brought back for 2 weeks (⋯ → Deleted items).</p></details></div>`;
}
function bindDraftBlock(root){
  const $=id=>root.querySelector('#'+id), k=state.model, m=MODELS[k];
  const fail = e => toast(e?.cancelled ? 'Not saved. Nothing was changed.' : 'Not saved: '+(e.message||e));
  const base = () => m.name.replace(/ \(draft( \d+)?\)$/,'');
  $('dfFam')?.addEventListener('change', e=>{ setDraftFamily(k, e.target.value||null); renderModels(); renderSide(); });
  $('dfPub')?.addEventListener('click', ()=>openPublish());
  $('hsPurg')?.addEventListener('click', async e=>{ e.target.disabled=true;
    try{ const r=await saveProject(base(), true, { customer:'' }); await deleteDraft(k, { moved:true }); showHomeCat('purg'); refresh(); toast(`“${base()}” is in Unassigned for the team. ${mergedText(r.merged)}`); }catch(err){ fail(err); e.target.disabled=false; } });
  $('hsCust')?.addEventListener('click', async e=>{ const cid=await pickCustomer(); if(!cid) return; e.target.disabled=true;
    try{ const r=await saveProject(base(), !!m.custom, { customer:cid }); const pid=r.project?.id; if(m.custom) await deleteDraft(k, { moved:true }); if(pid) await linkHome(cid, pid);
      showHomeCat('cust'); refresh(); toast(`Saved to ${customerById(cid)?.name||'the customer'}`); }catch(err){ fail(err); e.target.disabled=false; } });
  $('hsSave')?.addEventListener('click', async e=>{ e.target.disabled=true; try{ const r=await saveProject(m.name, false); refresh(); toast(`Saved. ${mergedText(r.merged)}`, r.merged?8000:undefined); }catch(err){ fail(err); e.target.disabled=false; } });
  $('hsProf')?.addEventListener('click', ()=>openCustomer(m.customer));
  $('hsSign')?.addEventListener('click', ()=>openSign(m.customer, k));
  $('hsUnlock')?.addEventListener('click', ()=>openUnlock(k));
  $('hsHist')?.addEventListener('click', ()=>document.getElementById('bProjects')?.click());
  $('hsDel')?.addEventListener('click', async e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to delete'; return; }
    try{ await deleteProject(m.project); refresh(); toast('Deleted from Unassigned · its saves are kept on the server'); }catch(err){ fail(err); } });
  $('dfRen')?.addEventListener('click', ()=>{ const d=dialog('dfRenDlg');
    d.innerHTML=`<form method="dialog" class="dlg"><div class="dlg-h"><h2>Rename draft</h2></div><input type="text" id="dfName" maxlength="80" value="${esc(m.name)}"><div class="row"><button class="btn" value="ok">Save</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
    d.onclose=()=>{ if(d.returnValue==='ok'){ renameDraft(k, d.querySelector('#dfName').value); renderModels(); renderSide(); } }; d.returnValue=''; d.showModal(); d.querySelector('#dfName').select(); });
  $('dfDel')?.addEventListener('click', async e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to delete'; return; } await deleteDraft(k); refresh(); toast('Draft deleted · Library → Recently deleted brings it back for 2 weeks'); });
  $('subEdit')?.addEventListener('click', async()=>{ try{ await editSub(m.sub, {name:$('subName').value.trim()||m.name, family:$('subFam').value}); refresh(); toast('Updated'); }catch(e){ toast('Not saved: '+e.message); } });
  const cd=$('cdName'), cdb=$('cdDel');
  if(cd) cd.oninput=()=>{ cdb.disabled = cd.value.trim().toLowerCase()!==m.name.trim().toLowerCase(); };
  cdb?.addEventListener('click', async()=>{ try{ if(m.sub) await removeSub(m.sub); else await deleteItem('models', k);
      state.model=Object.keys(MODELS).find(x=>!MODELS[x].deleted && !MODELS[x].custom && !MODELS[x].project && x!==k)||state.model; save(); refresh(); toast(`${m.name} deleted from Cubit Homes`); }catch(err){ toast('Not deleted: '+err.message); } });
  $('ovBack')?.addEventListener('click', async e=>{ const b=e.target, n=+(b.dataset.n||0);
    const steps=['Tap again: everyone gets the shop files’ version','Last chance: tap to go back'];
    if(n<2){ b.dataset.n=n+1; b.textContent=steps[n]; return; }
    try{ await removeOver(k); refresh(); toast('Back to the shop files’ version'); }catch(err){ toast('Not changed: '+err.message); } });
}

/* ---------------------------------------------------------------- Publish */
function openPublish(){
  const k=state.model, m=MODELS[k];
  // only from Unassigned: the other teams see a home there before it becomes a Cubit Home
  if(!m?.project || m.customer){ toast('Save it to Unassigned first. Homes are adopted into Cubit Homes from Unassigned.'); return; }
  if(!canEdit()){ toast('Only editors and admins adopt homes into Cubit Homes.'); return; }
  const from=m.from && MODELS[m.from] && !MODELS[m.from].custom && !MODELS[m.from].project ? m.from : null;
  const fromM=from && MODELS[from];
  const d=dialog('pubDlg');
  const view=(mode)=>{
    d.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Adopt “${esc(m.name)}” into Cubit Homes</h2><button class="btn ghost" id="pbX">Cancel</button></div>
      <div class="seg pub-mode" role="tablist"><button data-mode="sub" aria-pressed="${mode==='sub'}">Add to Cubit Homes</button>${from?`<button data-mode="over" aria-pressed="${mode==='over'}">Replace ${esc(fromM.name)}</button>`:''}</div>
      <div id="pbBody"></div></div>`;
    d.querySelector('#pbX').onclick=()=>d.close();
    d.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>view(b.dataset.mode));
    const body=d.querySelector('#pbBody');
    if(mode==='sub'){
      body.innerHTML=`<label for="pbFam">Model</label><select id="pbFam" class="pub-sel">${FAMILIES.filter(f=>!f.deleted).map(f=>`<option value="${f.id}" ${f.id===(m.family||familyOf(k))?'selected':''}>${esc(f.name)}</option>`).join('')}</select>
        <label for="pbName">Name in Cubit Homes</label><input type="text" id="pbName" maxlength="80" value="${esc(m.name.replace(/ \(draft\)$/,''))}">
        <label for="pbNote">Note (optional)</label><input type="text" id="pbNote" maxlength="200" placeholder="e.g. extra 8′ office pod, done for the Smiths">
        <p class="note">It becomes an original under that model in Cubit Homes, for everyone, and leaves Unassigned.</p>
        <div class="row"><button class="btn" id="pbGo">Adopt</button></div>`;
      body.querySelector('#pbGo').onclick=async()=>{ const name=body.querySelector('#pbName').value.trim(); if(!name){ toast('Give it a name.'); return; }
        const fam=body.querySelector('#pbFam').value, note=body.querySelector('#pbNote').value.trim(); body.querySelector('#pbGo').disabled=true;
        try{ await saveSub({family:fam, name, note}); await deleteProject(m.project); state.model=Object.keys(MODELS).find(x=>MODELS[x].sub && MODELS[x].name===name && MODELS[x].family===fam)||state.model; save(); d.close(); refresh(); showHomeCat('cubit'); toast(`“${name}” adopted into Cubit Homes under ${familyById(fam)?.name}`); takeMerged(); }
        catch(e){ toast(e.cancelled ? 'Not adopted. Nothing was changed.' : 'Not adopted: '+e.message); body.querySelector('#pbGo').disabled=false; } };
      return;
    }
    // saving over a Cubit model: three warnings
    let step=0;
    const W=[
      `<p class="pub-warn"><b>Warning 1 of 3.</b> This replaces <b>${esc(fromM.name)}</b>${fromM.sub?' (a published variation)':' (a Cubit model)'} with your draft, <b>for the whole team</b>.</p><p class="note">The version it replaces is kept on the server and can be brought back.</p>`,
      `<p class="pub-warn"><b>Warning 2 of 3.</b> Everyone who opens ${esc(fromM.name)} will see your version: its pods, walls, windows and doors, foundation and cabinets. Homes and sheets made from it will change.</p>`,
      `<p class="pub-warn"><b>Warning 3 of 3.</b> Type the model's name to confirm.</p><input type="text" id="pbConfirm" autocomplete="off" placeholder="${esc(fromM.name)}">`,
    ];
    const show=()=>{ body.innerHTML=W[step]+`<div class="row"><button class="btn ${step<2?'ghost':''} danger" id="pbNext" ${step===2?'disabled':''}>${step<2?'I understand, continue':`Save over ${esc(fromM.name)}`}</button><button class="btn ghost" id="pbBack">Cancel</button></div>`;
      body.querySelector('#pbBack').onclick=()=>d.close();
      const nx=body.querySelector('#pbNext'), cf=body.querySelector('#pbConfirm');
      if(cf){ cf.oninput=()=>{ nx.disabled = cf.value.trim().toLowerCase()!==fromM.name.trim().toLowerCase(); }; cf.focus(); }
      nx.onclick=async()=>{ if(step<2){ step++; show(); return; } nx.disabled=true;
        try{ if(fromM.sub) await saveSub({family:fromM.family, name:fromM.name, note:fromM.note, id:fromM.sub}); else await saveOver(from);
          await deleteProject(m.project); state.model=from; save(); d.close(); refresh(); const mg=takeMerged(); toast(`${fromM.name} saved over for everyone. ${mergedText(mg)}`, mg?8000:undefined); }
        catch(e){ toast(e.cancelled ? 'Not saved. Nothing was changed.' : 'Not saved: '+e.message); nx.disabled=false; } }; };
    show();
  };
  view('sub'); d.showModal();
}

/* ---------------------------------------------------------------- the Homes list: My drafts + New home */
function draftsRow(){
  if(!canSave()) return '';
  const D=myDrafts();
  return `<div class="drafts-row" role="group" aria-label="My drafts"><span class="row-k">My drafts</span><button class="chip new" data-new="1">＋ New home</button>${D.map(k=>`<button class="chip draft" data-m="${k}" aria-pressed="${k===state.model}">${esc(MODELS[k].name)}<small>${MODELS[k].family?esc(familyById(MODELS[k].family)?.name||''):'draft'}</small></button>`).join('')}</div>`;
}
/* top bar: a New home button beside the home picker */
{ const hb=document.getElementById('bHome');
  if(hb && !document.getElementById('bNew')){ const b=document.createElement('button'); b.id='bNew'; b.className='btn ghost new-b edit-only'; b.title='Start a new home from scratch'; b.innerHTML='<span aria-hidden="true">＋</span> New'; hb.after(b); b.onclick=openNewHome; } }
document.addEventListener('click', e=>{ const b=e.target.closest('[data-new]'); if(b) openNewHome(); });
export { openNewHome, draftBlock, bindDraftBlock, draftsRow, openPublish };
