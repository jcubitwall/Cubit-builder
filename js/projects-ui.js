/* Cubit Builder — projects-ui.js : the Projects dialog */
import { MODELS } from './data.js';
import { countsText } from './pods.js';
import { PROJECTS, SHARED, saveProject, openProject, deleteProject, renameProject, exportJSON, importJSON } from './projects.js';
import { state } from './state.js';
import { buildHome } from './scene3d.js';
import { renderModels, renderSide, toast } from './sidebar.js';
import { openSheets } from './sheets.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when = iso => { try{ return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); }catch(e){ return iso; } };

function refreshAll(){ renderModels(); buildHome(); renderSide(); if(state.view==='sheets') openSheets(); }

function render(){
  const body=document.getElementById('projBody');
  const m=MODELS[state.model]; const openId=m.project && PROJECTS[m.project] ? m.project : null;
  const mine=Object.values(PROJECTS).sort((a,b)=>b.saved.localeCompare(a.saved));
  const shared=Object.values(SHARED);
  body.innerHTML=`
    <p class="note viewer-only">You can open any shared project and explore it. Saving projects is for admins.</p>
    <div class="edit-only">
      <label for="projName">${openId?'Open project':'Save what you have on screen'} · ${esc(m.name)}</label>
      <div class="row" style="margin-top:6px"><input type="text" id="projName" value="${esc(openId?PROJECTS[openId].name:'')}" placeholder="e.g. Tanja Leet · Expanse + 1" maxlength="80"></div>
      <div class="row" style="margin-top:8px">
        <button class="btn" id="projSave">${openId?'Save changes':'Save project'}</button>
        ${openId?'<button class="btn ghost" id="projSaveNew">Save as a new project</button>':''}
      </div>
      <p class="note" style="margin-top:6px">Saves the layout with any pods you added, every wall choice, which wall is A on each pod, which side faces the assemblers on each wall, and the screw inset.</p>
    </div>
    <div>
      <div class="eyebrow" style="margin-bottom:6px">Your projects · this browser</div>
      ${mine.length?`<div class="projlist">${mine.map(p=>`<div class="projrow ${p.id===openId?'on':''}"><b>${esc(p.name)}</b><small>${esc(p.model.pods.length)} pods · saved ${esc(when(p.saved))}</small>
        <div class="acts"><button class="btn ghost" data-open="${p.id}">Open</button><button class="btn ghost" data-ren="${p.id}">Rename</button><button class="btn ghost" data-del="${p.id}">Delete</button></div></div>`).join('')}</div>`
        :'<p class="note">No saved projects yet.</p>'}
    </div>
    ${shared.length?`<div><div class="eyebrow" style="margin-bottom:6px">Shared projects · everyone sees these</div><div class="projlist">${shared.map(p=>`<div class="projrow"><b>${esc(p.name)}</b><small>${esc(p.model.pods.length)} pods</small><div class="acts"><button class="btn ghost" data-open="${p.id}">Open</button></div></div>`).join('')}</div></div>`:''}
    <div class="row edit-only">
      <button class="btn ghost" id="projExport" ${mine.length?'':'disabled'}>Export my projects</button>
      <button class="btn ghost" id="projImport">Import a project file</button>
    </div>
    <p class="note edit-only">Projects are kept in this browser. To pass one to someone else, export it and send them the file. To make it shared with everyone, send the file to be added to <code>data/projects.json</code>.</p>`;
  const name=body.querySelector('#projName');
  body.querySelector('#projSave').onclick=()=>{ const n=name.value.trim(); if(!n){ name.focus(); toast('Give the project a name first.'); return; } const r=saveProject(n,false); refreshAll(); render(); toast(`Saved “${n}”. ${countsText(r.counts)}`); };
  const sn=body.querySelector('#projSaveNew'); if(sn) sn.onclick=()=>{ const n=name.value.trim()||'Copy'; const r=saveProject(n,true); refreshAll(); render(); toast(`Saved “${n}” as a new project. ${countsText(r.counts)}`); };
  body.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{ openProject(b.dataset.open); refreshAll(); document.getElementById('projDlg').close(); toast('Project opened'); });
  body.querySelectorAll('[data-ren]').forEach(b=>b.onclick=()=>{
    const row=b.closest('.projrow'); const p=PROJECTS[b.dataset.ren];
    row.innerHTML=`<input type="text" value="${esc(p.name)}" maxlength="80" aria-label="New name"><div class="acts"><button class="btn">Done</button></div>`;
    const inp=row.querySelector('input'); inp.focus(); inp.select();
    const done=()=>{ const v=inp.value.trim(); if(v){ renameProject(p.id,v); renderModels(); } render(); };
    row.querySelector('.btn').onclick=done; inp.onkeydown=e=>{ if(e.key==='Enter') done(); };
  });
  body.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
    if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to delete'; return; }
    deleteProject(b.dataset.del); refreshAll(); render(); toast('Project deleted');
  });
  const ex=body.querySelector('#projExport'); ex.onclick=()=>{
    const blob=new Blob([exportJSON(Object.keys(PROJECTS))],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cubit-projects.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  };
  body.querySelector('#projImport').onclick=()=>document.getElementById('projFile').click();
}

function initProjectsUI(){
  const dlg=document.getElementById('projDlg');
  document.getElementById('bProjects').onclick=()=>{ render(); dlg.showModal(); };
  document.getElementById('projClose').onclick=()=>dlg.close();
  document.getElementById('projFile').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return; const rd=new FileReader();
    rd.onload=()=>{ try{ const n=importJSON(rd.result); renderModels(); render(); toast(n?`Imported ${n} project${n>1?'s':''}`:'No projects found in that file.'); }catch(err){ toast('That file is not a Cubit project file.'); } };
    rd.readAsText(f); e.target.value='';
  });
}

export { initProjectsUI };
