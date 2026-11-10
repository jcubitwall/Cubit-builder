/* Cubit Builder — freeze.js : homes that are locked keep the walls and floors they were locked with.

   A home is locked when it's signed (m.locked), or when it's in manufacturing, being made, built or archived
   (m.stage, for when those stages are tracked). Saving over a library wall or floor/ceiling/roof never changes a
   locked home: it keeps the version it had at its lock time.
     · at start-up: for each locked home, any team wall / layer saved after it was locked is fetched as it was then
       (api/walls?asof=…, from the versions the server keeps) into FROZEN (data.js), or Cubit's own original
     · just before a save over: the version being replaced is kept for each locked home that doesn't have one yet
   byId / layerById use FROZEN for the home on screen, so its 3D, sheets, CNC and costs all stay as locked.

   Saving over also asks first when other homes use it (askSaveOver): which ones change, which locked ones don't. */
import { MODELS, LIB, LAYERLIB, FROZEN, BUILTIN } from './data.js';
import { state } from './state.js';

const LOCK_STAGES = new Set(['production','manufacturing','making','built','done','archived']);
const isLocked = m => !!m && !m.deleted && (!!m.locked || LOCK_STAGES.has(m.stage));
const lockedAt = m => m.locked?.at || m.stageAt || null;
const listOf = kind => kind==='walls' ? LIB : LAYERLIB;
const clone = o => JSON.parse(JSON.stringify(o));
const slotOf = k => (FROZEN[k] ||= { walls:{}, layers:{} });

/* fetch, for every locked home, the team walls and layers changed since it was locked, as they were then */
async function freezeLocked(){
  let n=0;
  const homes=Object.entries(MODELS).filter(([,m])=>isLocked(m) && lockedAt(m));
  let P={}; try{ const pr=await import('./projects.js'); P={ ...pr.SHARED, ...pr.PROJECTS, ...pr.TEAM }; }catch(e){}
  for(const [k,m] of homes){ const T=lockedAt(m), lib=P[m.project]?.library || {};
    for(const kind of ['walls','layers']){
      let ids=listOf(kind).filter(x=>x.src==='team' && x.saved && x.saved>T && !slotOf(k)[kind][x.id]).map(x=>x.id);
      // first what the home was saved with (a team home carries its own copies of the team walls it uses)
      ids=ids.filter(id=>{ const own=(lib[kind]||[]).find(x=>x.id===id); if(!own) return true; slotOf(k)[kind][id]={ ...clone(own), src:'frozen' }; n++; return false; });
      if(!ids.length) continue;
      let got=null;
      try{ const r=await fetch(`api/${kind}?asof=${encodeURIComponent(T)}&ids=${encodeURIComponent(ids.join(','))}`, { cache:'no-store' });
        if(r.ok && (r.headers.get('content-type')||'').includes('json')) got=await r.json(); }catch(e){}
      if(!got) continue;
      ids.forEach(id=>{ const v=got[id] ? got[id] : BUILTIN[kind].get(id);
        if(v){ const F=slotOf(k)[kind]; Object.keys(F).forEach(x=>{ if(x.startsWith(id+'~m')) delete F[x]; }); F[id]={ ...clone(v), src:'frozen' }; n++; } });
    } }
  return n;
}
/* just before `id` is written over: every locked home keeps the version it has now (if it was locked after it) */
function keepForLocked(kind, id){
  const old=listOf(kind).find(x=>x.id===id); if(!old) return;
  Object.entries(MODELS).forEach(([k,m])=>{ if(!isLocked(m)) return; const T=lockedAt(m), F=slotOf(k)[kind];
    if(F[id]) return;
    if(old.src==='library' || !old.saved || !T || old.saved<=T) F[id]={ ...clone(old), src:'frozen' }; });
}

/* the homes that use a wall / layer: [{ k, name, group, locked }] */
function homesUsing(kind, id){
  const pat=new RegExp(`"${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(~m[xz]*)?"`);
  return Object.entries(MODELS).filter(([k,m])=>!m.deleted && (pat.test(JSON.stringify(m)) || pat.test(JSON.stringify([state.picks?.[k], state.layerPicks?.[k]]))))
    .map(([k,m])=>({ k, name:m.name||k, locked:isLocked(m), group: m.draft ? 'Drafts' : m.project ? (m.customer ? 'Customers’ homes' : 'Unassigned') : 'Cubit Homes' }));
}
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* before saving over `id`: → 'over' | 'new' | null (cancel). Nothing to ask (no other home uses it) → 'over'. */
/* except: the home it's being edited for (changing that one is the point) */
function askSaveOver(kind, id, name, except=null){
  const all=homesUsing(kind, id).filter(h=>h.k!==except || h.locked);
  if(!all.length) return Promise.resolve('over');
  const chg=all.filter(h=>!h.locked), keep=all.filter(h=>h.locked), what=kind==='walls'?'wall':'floor / ceiling / roof';
  const list=L=>{ const g={}; L.forEach(h=>(g[h.group] ||= []).push(h.name)); return Object.entries(g).map(([gr,ns])=>`<li><b>${esc(gr)}</b> · ${ns.slice(0,8).map(esc).join(', ')}${ns.length>8?` and ${ns.length-8} more`:''}</li>`).join(''); };
  return new Promise(res=>{ const d=document.createElement('dialog'); d.className='lib-dlg so-dlg';
    d.innerHTML=`<form method="dialog" class="dlg"><div class="dlg-h"><h2>Save over ${esc(id)}?</h2></div>
      <p class="note">${esc(name||'')}</p>
      ${chg.length?`<p>This changes the ${what} in <b>${chg.length} other home${chg.length>1?'s':''}</b>:</p><ul class="so-list">${list(chg)}</ul>`:`<p>No other unlocked home uses this ${what}.</p>`}
      ${keep.length?`<p>🔒 <b>${keep.length} locked home${keep.length>1?'s':''}</b> (signed, in production, built or archived) keep the old version:</p><ul class="so-list so-keep">${list(keep)}</ul>`:''}
      <div class="row"><button class="btn" value="over">Save over${chg.length?' everywhere':''}</button><button class="btn ghost" value="new">Save as new instead</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
    document.body.appendChild(d); d.addEventListener('close', ()=>{ const v=d.returnValue; d.remove(); res(v==='over'||v==='new'?v:null); }); d.returnValue=''; d.showModal(); });
}
export { isLocked, lockedAt, freezeLocked, keepForLocked, homesUsing, askSaveOver };
