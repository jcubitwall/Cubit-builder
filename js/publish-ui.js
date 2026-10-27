/* Cubit Builder — publish-ui.js : New home, My drafts, and publishing a draft to the shared library.

   · New home: start from scratch (one blank pod), optionally filed under a model name.
   · My drafts: only you see them. Changing a Cubit model or a published variation makes a draft copy first.
   · Publish a draft:  as a variation (sub-model) under any model name — or, three warnings later, over the Cubit
     model it was copied from. Every replaced version is kept on the server. */
import { MODELS } from './data.js';
import { state, save } from './state.js';
import { FAMILIES, familyById, familyOf, saveSub, saveOver, removeOver, OVERS, removeSub, editSub, takeMerged } from './catalog.js';
import { mergedText } from './sync.js';
import { newHome, renameDraft, setDraftFamily, deleteDraft, myDrafts, isDraft } from './drafts.js';
import { canSave } from './role.js';
import { renderModels, renderSide, toast } from './sidebar.js';
import { buildHome } from './scene3d.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const famOpts = (sel, none='Decide later') => `<option value="">${none}</option>`+FAMILIES.filter(f=>!f.deleted).map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${esc(f.name)}</option>`).join('');
const refresh = () => { renderModels(); buildHome(); renderSide(); };
function dialog(id){ let d=document.getElementById(id); if(!d){ d=document.createElement('dialog'); d.id=id; d.className='lib-dlg pub-dlg'; document.body.appendChild(d); } return d; }

/* ---------------------------------------------------------------- New home */
function openNewHome(){
  if(!canSave()){ toast('Viewers can look but not build homes.'); return; }
  const d=dialog('newDlg');
  d.innerHTML=`<form method="dialog" class="dlg"><div class="dlg-h"><h2>New home</h2><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>
    <label for="nhName">Name</label><input type="text" id="nhName" maxlength="80" placeholder="e.g. Smith cottage" autocomplete="off">
    <label for="nhFam">Model it belongs to</label><select id="nhFam" class="pub-sel">${famOpts(familyOf(state.model)||'')}</select>
    <div><label>Start with</label><div class="seg nh-pod" role="group">${[['L24','24′ pod'],['P16','16′ pod'],['P8','8′ pod']].map(([t,l],i)=>`<button type="button" data-t="${t}" aria-pressed="${i===0}">${l}</button>`).join('')}</div></div>
    <p class="note">It starts in <b>My drafts</b>: only you see it until you publish it. Drag more pods and decks in from the tray, then tap walls to pick them.</p>
    <div class="row"><button class="btn" value="ok" id="nhGo">Start building</button></div></form>`;
  let pod='L24';
  d.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{ pod=b.dataset.t; d.querySelectorAll('[data-t]').forEach(x=>x.setAttribute('aria-pressed', x===b)); });
  d.onclose=()=>{ if(d.returnValue!=='ok') return;
    const name=d.querySelector('#nhName').value.trim()||'New home';
    newHome({ name, family:d.querySelector('#nhFam').value||null, pod });
    document.getElementById('homeDlg')?.close();
    refresh(); setTimeout(()=>import('./build.js').then(b=>b.flatten(true)), 80); toast(`“${name}” started in My drafts`); };
  d.returnValue=''; d.showModal(); d.querySelector('#nhName').focus();
}

/* ---------------------------------------------------------------- the home panel: draft / protected */
function draftBlock(){
  const k=state.model, m=MODELS[k]; if(!m) return '';
  if(m.custom){
    const from=m.from && MODELS[m.from];
    return `<div class="pub-box draft"><div class="eyebrow">My draft · only you can see it</div>
      <p>${from?`Copied from <b>${esc(from.name)}</b>. `:m.scratch?'Started from scratch. ':''}${m.savedAt?`Saved ${new Date(m.savedAt).toLocaleString()}.`:''}</p>
      <label class="fld">Model it belongs to<select id="dfFam" class="pub-sel" ${canSave()?'':'disabled'}>${famOpts(m.family||'')}</select></label>
      <div class="row edit-only"><button class="btn" id="dfPub">Publish…</button><button class="btn ghost sm" id="dfRen">Rename</button><button class="btn ghost sm" id="dfDel">Delete draft</button></div></div>`;
  }
  if(m.project) return '';
  const fam=familyById(familyOf(k));
  if(m.sub) return `<div class="pub-box"><div class="eyebrow">Published variation of ${esc(fam?.name||'a model')} · protected</div>
      <p>Anything you change goes into a draft copy in My drafts. Publish it back over this variation when it's ready.</p>
      <details class="edit-only"><summary>Manage this variation</summary>
        <label class="fld">Name<input id="subName" value="${esc(m.name)}" maxlength="80"></label>
        <label class="fld">Model<select id="subFam" class="pub-sel">${FAMILIES.map(f=>`<option value="${f.id}" ${f.id===m.family?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>
        <div class="row"><button class="btn ghost sm" id="subEdit">Rename / move</button><button class="btn ghost sm" id="subDel">Remove from the library</button></div></details></div>`;
  return `<div class="pub-box"><div class="eyebrow">Cubit model · protected</div>
      <p>Anything you change goes into a draft copy in My drafts, so ${esc(m.name)} stays as it is for everyone.${m.overAt?` Last saved over ${new Date(m.overAt).toLocaleDateString()}${m.overBy?` by ${esc(m.overBy)}`:''}.`:''}</p>
      ${m.overAt?`<details class="edit-only"><summary>Version history</summary><p class="note">The version from the shop files is kept underneath.</p><button class="btn ghost sm" id="ovBack">Go back to the shop files' version</button></details>`:''}</div>`;
}
function bindDraftBlock(root){
  const $=id=>root.querySelector('#'+id), k=state.model, m=MODELS[k];
  $('dfFam')?.addEventListener('change', e=>{ setDraftFamily(k, e.target.value||null); renderModels(); renderSide(); });
  $('dfPub')?.addEventListener('click', ()=>openPublish());
  $('dfRen')?.addEventListener('click', ()=>{ const d=dialog('dfRenDlg');
    d.innerHTML=`<form method="dialog" class="dlg"><div class="dlg-h"><h2>Rename draft</h2></div><input type="text" id="dfName" maxlength="80" value="${esc(m.name)}"><div class="row"><button class="btn" value="ok">Save</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
    d.onclose=()=>{ if(d.returnValue==='ok'){ renameDraft(k, d.querySelector('#dfName').value); renderModels(); renderSide(); } }; d.returnValue=''; d.showModal(); d.querySelector('#dfName').select(); });
  $('dfDel')?.addEventListener('click', async e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to delete'; return; } await deleteDraft(k); refresh(); toast('Draft deleted'); });
  $('subEdit')?.addEventListener('click', async()=>{ try{ await editSub(m.sub, {name:$('subName').value.trim()||m.name, family:$('subFam').value}); refresh(); toast('Variation updated'); }catch(e){ toast('Not saved: '+e.message); } });
  $('subDel')?.addEventListener('click', async e=>{ const b=e.target, n=+(b.dataset.n||0);
    const steps=['Tap again: this removes it for everyone','Last chance: tap to remove'];
    if(n<2){ b.dataset.n=n+1; b.textContent=steps[n]; return; }
    try{ await removeSub(m.sub); refresh(); toast('Removed from the library (a copy is kept on the server)'); }catch(err){ toast('Not removed: '+err.message); } });
  $('ovBack')?.addEventListener('click', async e=>{ const b=e.target, n=+(b.dataset.n||0);
    const steps=['Tap again: everyone gets the shop files’ version','Last chance: tap to go back'];
    if(n<2){ b.dataset.n=n+1; b.textContent=steps[n]; return; }
    try{ await removeOver(k); refresh(); toast('Back to the shop files’ version'); }catch(err){ toast('Not changed: '+err.message); } });
}

/* ---------------------------------------------------------------- Publish */
function openPublish(){
  const k=state.model, m=MODELS[k]; if(!isDraft(k)) return;
  const from=m.from && MODELS[m.from] && !MODELS[m.from].custom && !MODELS[m.from].project ? m.from : null;
  const fromM=from && MODELS[from];
  const d=dialog('pubDlg');
  const view=(mode)=>{
    d.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>Publish “${esc(m.name)}”</h2><button class="btn ghost" id="pbX">Cancel</button></div>
      <div class="seg pub-mode" role="tablist"><button data-mode="sub" aria-pressed="${mode==='sub'}">Add as a variation</button>${from?`<button data-mode="over" aria-pressed="${mode==='over'}">Save over ${esc(fromM.name)}</button>`:''}</div>
      <div id="pbBody"></div></div>`;
    d.querySelector('#pbX').onclick=()=>d.close();
    d.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>view(b.dataset.mode));
    const body=d.querySelector('#pbBody');
    if(mode==='sub'){
      body.innerHTML=`<label for="pbFam">Model</label><select id="pbFam" class="pub-sel">${FAMILIES.filter(f=>!f.deleted).map(f=>`<option value="${f.id}" ${f.id===(m.family||familyOf(k))?'selected':''}>${esc(f.name)}</option>`).join('')}</select>
        <label for="pbName">Name of the variation</label><input type="text" id="pbName" maxlength="80" value="${esc(m.name.replace(/ \(draft\)$/,''))}">
        <label for="pbNote">Note (optional)</label><input type="text" id="pbNote" maxlength="200" placeholder="e.g. extra 8′ office pod, done for the Smiths">
        <p class="note">It joins the model's designs in the Homes list, for everyone. Your draft is moved there (it leaves My drafts).</p>
        <div class="row"><button class="btn" id="pbGo">Publish</button></div>`;
      body.querySelector('#pbGo').onclick=async()=>{ const name=body.querySelector('#pbName').value.trim(); if(!name){ toast('Give it a name.'); return; }
        const fam=body.querySelector('#pbFam').value, note=body.querySelector('#pbNote').value.trim(); body.querySelector('#pbGo').disabled=true;
        try{ await saveSub({family:fam, name, note}); await deleteDraft(k); state.model=Object.keys(MODELS).find(x=>MODELS[x].sub && MODELS[x].name===name && MODELS[x].family===fam)||state.model; save(); d.close(); refresh(); toast(`Published “${name}” under ${familyById(fam)?.name}`); takeMerged(); }
        catch(e){ toast(e.cancelled ? 'Not published. Nothing was changed.' : 'Not published: '+e.message); body.querySelector('#pbGo').disabled=false; } };
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
          await deleteDraft(k); state.model=from; save(); d.close(); refresh(); const mg=takeMerged(); toast(`${fromM.name} saved over for everyone. ${mergedText(mg)}`, mg?8000:undefined); }
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
