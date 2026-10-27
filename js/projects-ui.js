/* Cubit Builder — projects-ui.js : the Projects dialog */
import { MODELS } from './data.js';
import { countsText } from './pods.js';
import { PROJECTS, SHARED, TEAM, saveProject, openProject, deleteProject, renameProject, exportJSON, importJSON, versions, restoreVersion, isTeam } from './projects.js';
import { state } from './state.js';
import { buildHome } from './scene3d.js';
import { renderModels, renderSide, toast } from './sidebar.js';
import { openSheets } from './sheets.js';
import { mergedText } from './sync.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when = iso => { try{ return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); }catch(e){ return iso; } };

function refreshAll(){ renderModels(); buildHome(); renderSide(); if(state.view==='sheets') openSheets(); }

const who = e => e ? String(e).split('@')[0].replace(/^./,c=>c.toUpperCase()) : '';
const fail = e => toast(e?.cancelled ? 'Not saved. Nothing was changed.' : `Couldn't save: ${e.message||e}`);
function rows(list, openId, own){
  return `<div class="projlist">${list.map(p=>`<div class="projrow ${p.id===openId?'on':''}" data-row="${esc(p.id)}"><b>${esc(p.name)}</b>
    <small>${esc(p.model.pods.length)} pod${p.model.pods.length===1?'':'s'}${p.saved?` · saved ${esc(when(p.saved))}`:''}${p.by?` by ${esc(who(p.by))}`:''}</small>
    <div class="acts"><button class="btn ghost" data-open="${esc(p.id)}">Open</button>${own?`<span class="edit-only"><button class="btn ghost" data-ren="${esc(p.id)}">Rename</button><button class="btn ghost" data-ver="${esc(p.id)}">Earlier versions</button><button class="btn ghost" data-del="${esc(p.id)}">Delete</button></span>`:''}</div>
    <div class="vers" hidden></div></div>`).join('')}</div>`;
}
function render(){
  const body=document.getElementById('projBody'), team=isTeam();
  const m=MODELS[state.model]; const openId=m.project && (TEAM[m.project]||PROJECTS[m.project]) ? m.project : null;
  const byDate=(a,b)=>String(b.saved||'').localeCompare(String(a.saved||''));
  const teamL=Object.values(TEAM).sort(byDate);
  const mine=Object.values(PROJECTS).filter(p=>!TEAM[p.id]).sort(byDate);
  const shared=Object.values(SHARED).filter(p=>!TEAM[p.id]);
  const cur = openId ? (TEAM[openId]||PROJECTS[openId]) : null;
  body.innerHTML=`
    <p class="note viewer-only">You can open any project and explore it. Saving projects is for admins.</p>
    <div class="edit-only">
      <label for="projName">${openId?'Open project':'Save what you have on screen'} · ${esc(m.name)}</label>
      <div class="row" style="margin-top:6px"><input type="text" id="projName" value="${esc(cur?cur.name:'')}" placeholder="e.g. Tanja Leet · Expanse + 1" maxlength="80"></div>
      <div class="row" style="margin-top:8px">
        <button class="btn" id="projSave">${openId?'Save changes':'Save project'}</button>
        ${openId?'<button class="btn ghost" id="projSaveNew">Save as a new project</button>':''}
      </div>
      <p class="note" style="margin-top:6px">${team?'Saved for the whole team. ':''}Keeps the layout and pods, every wall, window and door, Wall A, which side faces the assemblers, cabinets, lights, foundation and screw inset.${team?' Saving over a project keeps the one before it under Earlier versions.':''}</p>
    </div>
    ${team?`<div><div class="eyebrow" style="margin-bottom:6px">Team projects · everyone sees these</div>${teamL.length?rows(teamL, openId, true):'<p class="note">No team projects yet.</p>'}</div>`:''}
    ${mine.length||!team?`<div><div class="eyebrow" style="margin-bottom:6px">${team?'Still only on this device':'Your projects · this browser'}</div>${mine.length?rows(mine, openId, true):'<p class="note">No saved projects yet.</p>'}</div>`:''}
    ${shared.length?`<div><div class="eyebrow" style="margin-bottom:6px">From STEP uploads</div>${rows(shared, openId, false)}</div>`:''}
    <div class="row edit-only">
      <button class="btn ghost" id="projExport" ${teamL.length+mine.length?'':'disabled'}>Export projects</button>
      <button class="btn ghost" id="projImport">Import a project file</button>
    </div>
    ${team?'':`<p class="note edit-only">Projects are kept in this browser here (the team server isn't reachable). Export a file to pass one on.</p>`}`;
  const name=body.querySelector('#projName');
  const busy=(b,on)=>{ if(b){ b.disabled=on; } };
  body.querySelector('#projSave').onclick=async e=>{ const n=name.value.trim(); if(!n){ name.focus(); toast('Give the project a name first.'); return; }
    busy(e.target,true); try{ const r=await saveProject(n,false); refreshAll(); render(); toast(`Saved “${n}”${team?' for the team':''}. ${mergedText(r.merged)} ${countsText(r.counts)}`, r.merged?8000:undefined); }catch(err){ fail(err); busy(e.target,false); } };
  const sn=body.querySelector('#projSaveNew'); if(sn) sn.onclick=async e=>{ const n=name.value.trim()||'Copy'; busy(e.target,true);
    try{ const r=await saveProject(n,true); refreshAll(); render(); toast(`Saved “${n}” as a new project. ${countsText(r.counts)}`); }catch(err){ fail(err); busy(e.target,false); } };
  body.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{ openProject(b.dataset.open); refreshAll(); document.getElementById('projDlg').close(); toast('Project opened'); });
  body.querySelectorAll('[data-ren]').forEach(b=>b.onclick=()=>{
    const row=b.closest('.projrow'); const p=TEAM[b.dataset.ren]||PROJECTS[b.dataset.ren];
    row.innerHTML=`<input type="text" value="${esc(p.name)}" maxlength="80" aria-label="New name"><div class="acts"><button class="btn">Done</button></div>`;
    const inp=row.querySelector('input'); inp.focus(); inp.select();
    const done=async()=>{ const v=inp.value.trim(); if(v){ try{ await renameProject(p.id,v); renderModels(); }catch(err){ fail(err); } } render(); };
    row.querySelector('.btn').onclick=done; inp.onkeydown=e=>{ if(e.key==='Enter') done(); };
  });
  body.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to delete'; return; }
    try{ await deleteProject(b.dataset.del); refreshAll(); render(); toast('Project deleted · its earlier versions are kept'); }catch(err){ fail(err); }
  });
  body.querySelectorAll('[data-ver]').forEach(b=>b.onclick=async()=>{
    const box=b.closest('.projrow').querySelector('.vers'); if(!box.hidden){ box.hidden=true; return; }
    box.hidden=false; box.innerHTML='<p class="note">Loading…</p>';
    const id=b.dataset.ver, list=TEAM[id] ? await versions(id) : [];
    box.innerHTML = list.length ? list.map(v=>`<div class="ver"><span>${esc(when(v.at))}${v.by?` · ${esc(who(v.by))}`:''} · ${esc(v.name)}</span><button class="btn ghost sm" data-res="${esc(id)}|${esc(v.key)}">Bring back</button></div>`).join('')
      : `<p class="note">${TEAM[id]?'No earlier versions yet: they start with the next save.':'Earlier versions are kept for team projects.'}</p>`;
    box.querySelectorAll('[data-res]').forEach(r=>r.onclick=async()=>{ const [pid,key]=r.dataset.res.split('|');
      try{ await restoreVersion(pid,key); refreshAll(); render(); toast('Earlier version brought back (the one it replaced is kept too)'); }catch(err){ fail(err); } });
  });
  const ex=body.querySelector('#projExport'); ex.onclick=()=>{
    const blob=new Blob([exportJSON([...Object.keys(TEAM), ...Object.keys(PROJECTS)])],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cubit-projects.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  };
  body.querySelector('#projImport').onclick=()=>document.getElementById('projFile').click();
}
window.addEventListener('cubit-projects-moved', e=>{ renderModels(); toast(`${e.detail} project${e.detail>1?'s':''} from this device moved up to the team`); });

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
