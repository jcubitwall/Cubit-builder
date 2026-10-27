/* Cubit Builder — sync.js : two people saving the same home don't wipe out each other's work.

   Every shared save (a team project, a home saved over, a variation saved back) carries the version it started
   from (rev). If someone else saved in the meantime the server saves nothing and hands back their version. Then:
     base   = the home as it was when you started (the version you opened, or your draft when it was copied)
     mine   = the home as you have it now
     theirs = what is saved now (their changes)
   Anything only you changed is yours, anything only they changed is theirs, so Heinrich's plumbing and your wall
   panels both end up in the home. Only when you both changed the SAME thing (the same wall, the same cabinet) does
   a window ask which to keep, side by side. The version not kept stays in the earlier versions on the server.
   Then it saves again on top of theirs (and checks again, in case a third save came in meanwhile). */

const META = ['id','saved','by','rev','merged','library','restoredFrom','shared'];
const isObj = v => v!==null && typeof v==='object' && !Array.isArray(v);
const stable = v => Array.isArray(v) ? '['+v.map(stable).join(',')+']'
  : isObj(v) ? '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}' : JSON.stringify(v===undefined?null:v);
const eq = (a,b) => (a===undefined) === (b===undefined) && stable(a)===stable(b);
const clone = v => v===undefined ? undefined : JSON.parse(JSON.stringify(v));
const strip = it => { const o={...(it||{})}; META.forEach(k=>delete o[k]); return o; };
const hasIds = a => Array.isArray(a) && a.length>0 && a.every(x=>isObj(x) && x.id!=null);

/* three-way merge: returns { value, conflicts:[{ path, mine, theirs }] }. In value a conflict holds MINE for now. */
function merge3(base, mine, theirs){ const C=[]; return { value: m3(base, mine, theirs, [], C), conflicts: C }; }
function m3(b, m, t, path, C){
  if(eq(m,t)) return clone(m);
  if(eq(m,b)) return clone(t);           // only they changed it
  if(eq(t,b)) return clone(m);           // only you changed it
  if(isObj(m) && isObj(t)){
    const B=isObj(b)?b:{}, out={};
    new Set([...Object.keys(t), ...Object.keys(m), ...Object.keys(B)]).forEach(k=>{ const v=m3(B[k], m[k], t[k], [...path,k], C); if(v!==undefined) out[k]=v; });
    return out;
  }
  if(Array.isArray(m) && Array.isArray(t)){
    // lists of things with ids (cabinets, fixtures, lights …): matched by id, not by place in the list
    if((hasIds(m)||!m.length) && (hasIds(t)||!t.length) && (hasIds(m)||hasIds(t)) && (!Array.isArray(b) || !b.length || hasIds(b))){
      const map = a => new Map((Array.isArray(a)?a:[]).map(x=>[String(x.id), x]));
      const B=map(b), M=map(m), T=map(t), out=[];
      const ids=[...new Set([...t.map(x=>String(x.id)), ...m.map(x=>String(x.id))])];
      B.forEach((_,id)=>{ if(!ids.includes(id)) ids.push(id); });
      ids.forEach(id=>{ const v=m3(B.get(id), M.get(id), T.get(id), [...path,'id:'+id], C); if(v!==undefined) out.push(v); });
      return out;
    }
    // lists by place (pods, decks): the places both had merge one by one; anything either added goes on the end
    if(Array.isArray(b) && m.length>=b.length && t.length>=b.length){
      const out=b.map((_,i)=>m3(b[i], m[i], t[i], [...path,i], C)).filter(v=>v!==undefined);
      const add=[...m.slice(b.length), ...t.slice(b.length)], seen=new Set();
      add.forEach(x=>{ const s=stable(x); if(!seen.has(s)){ seen.add(s); out.push(clone(x)); } });
      return out;
    }
  }
  C.push({ path, mine:clone(m), theirs:clone(t) });
  return clone(m);
}
/* put the chosen side of each conflict into the merged home */
function setAt(root, path, val){
  let o=root;
  for(let i=0;i<path.length-1;i++){ const k=path[i];
    if(typeof k==='string' && k.startsWith('id:')){ o=o.find(x=>String(x.id)===k.slice(3)); }
    else o=o[k];
    if(o==null) return; }
  const k=path[path.length-1];
  if(typeof k==='string' && k.startsWith('id:')){ const i=o.findIndex(x=>String(x.id)===k.slice(3));
    if(val===undefined){ if(i>=0) o.splice(i,1); } else if(i>=0) o[i]=clone(val); else o.push(clone(val)); }
  else if(val===undefined){ if(Array.isArray(o)) o.splice(k,1); else delete o[k]; }
  else o[k]=clone(val);
}

/* ---------- words for a conflict */
const SIDE={S:'front (S)', N:'back (N)', E:'right end (E)', W:'left end (W)'};
const LAYER={'floor-ext':'exterior floor','floor-int':'interior floor','ceiling-int':'interior ceiling','roof':'roof'};
const TOP={ name:'Name', note:'Note', found:'Foundation', bearing:'North direction', inset:'Ground screw inset', deckOC:'Deck joist spacing', units:'Window and door units', wallA:'Which wall is Wall A', faces:'Side facing the assemblers', lights:'Lights', cabinets:'Cabinets', furniture:'Cabinets and fixtures', picks:'Wall choice', layerPicks:'Floor, ceiling or roof choice', family:'Model it belongs to' };
function label(path, root){
  if(path[0]==='whole') return 'The whole home (your copy was made before their save)';
  const p=path.slice(path[0]==='model'?1:0);
  if(p[0]==='pods' && typeof p[1]==='number'){
    const pod=`Pod ${p[1]+1}`;
    if(p[2]==='walls') return `${pod} · wall on the ${SIDE[p[3]]||p[3]}${typeof p[4]==='number'&&p.length>4?` (part ${p[4]+1})`:''}`;
    if(p[2]==='layers') return `${pod} · ${LAYER[p[3]]||p[3]}`;
    if(p.length===2) return `${pod} (whole pod)`;
    return `${pod} · ${p.slice(2).join(' ')}`;
  }
  if(p[0]==='pods') return 'Pods (the layout)';
  if(p[0]==='decks') return typeof p[1]==='number' ? `Deck ${p[1]+1}` : 'Decks';
  if((p[0]==='furniture'||p[0]==='lights'||p[0]==='cabinets') && typeof p[1]==='string' && p[1].startsWith('id:')){
    const it=(root?.[p[0]]||[]).find?.(x=>String(x.id)===p[1].slice(3));
    return `${TOP[p[0]]} · ${it?.name||it?.label||it?.kind||p[1].slice(3)}`;
  }
  if(TOP[p[0]]) return TOP[p[0]] + (p.length>1 ? ` · ${p.slice(1).join(' ').replace(/id:/g,'')}` : '');
  return path.join(' · ');
}
const brief = v => v===undefined ? 'removed' : (isObj(v)||Array.isArray(v)) ? '' : v==='' ? '' : esc(String(v)).slice(0,40);
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const who = e => e ? String(e).split('@')[0].replace(/[._-]+/g,' ').replace(/\b./g,c=>c.toUpperCase()) : 'someone';
const when = iso => { try{ return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); }catch(e){ return ''; } };

/* both changed the same things: which to keep? resolves to an array of 'mine' | 'theirs', or null (cancel) */
function askConflicts(conflicts, current, merged, what){
  return new Promise(res=>{
    const d=document.createElement('dialog'); d.className='lib-dlg sync-dlg'; d.id='syncDlg';
    const them=who(current.by);
    d.innerHTML=`<div class="dlg"><div class="dlg-h"><h2>${esc(them)} changed this too</h2></div>
      <p>${esc(them)} saved ${esc(what)} at ${esc(when(current.saved))}, after you opened it. Everything else you each changed is combined.
      You both changed ${conflicts.length===1?'one thing':`these ${conflicts.length} things`}: pick which to keep.</p>
      <div class="row"><button class="btn ghost sm" data-all="mine">Keep all mine</button><button class="btn ghost sm" data-all="theirs">Keep all ${esc(them)}'s</button></div>
      <div class="sync-list">${conflicts.map((c,i)=>`<div class="sync-row"><b>${esc(label(c.path, merged))}</b>
        <span class="seg" role="radiogroup" aria-label="${esc(label(c.path, merged))}">
          <button type="button" data-i="${i}" data-v="mine" aria-pressed="true">Mine <small>${brief(c.mine)}</small></button>
          <button type="button" data-i="${i}" data-v="theirs" aria-pressed="false">${esc(them)}'s <small>${brief(c.theirs)}</small></button></span></div>`).join('')}</div>
      <p class="note">The one you don't keep stays in the earlier versions, so it can be brought back.</p>
      <div class="row"><button class="btn" id="syncGo">Save the combined home</button><button class="btn ghost" id="syncNo">Cancel (save nothing)</button></div></div>`;
    document.body.appendChild(d);
    const pick=conflicts.map(()=>'mine');
    const show=()=>d.querySelectorAll('[data-i]').forEach(b=>b.setAttribute('aria-pressed', pick[+b.dataset.i]===b.dataset.v));
    d.addEventListener('click', e=>{ const b=e.target.closest('[data-i]'); if(b){ pick[+b.dataset.i]=b.dataset.v; show(); return; }
      const a=e.target.closest('[data-all]'); if(a){ pick.fill(a.dataset.all); show(); } });
    let done=false; const end=v=>{ if(done) return; done=true; d.close(); d.remove(); res(v); };
    d.querySelector('#syncGo').onclick=()=>end(pick);
    d.querySelector('#syncNo').onclick=()=>end(null);
    d.addEventListener('cancel', e=>{ e.preventDefault(); end(null); });
    d.showModal();
  });
}

/* save with the check. send(item, baseRev, mergedInfo) → { changed:true, current } or { item } (what was saved).
   base / mine are whole items; baseRev = the version mine started from (undefined: don't check, the old way). */
async function syncSave({ send, base, mine, baseRev, what='this home' }){
  let item=mine, rev=baseRev, info=null;
  for(let n=0; n<5; n++){
    const r=await send(item, rev, info);
    if(!r.changed) return { item:r.item || item, merged:info };
    const cur=r.current;
    if(!base){ // nothing to compare with (an old draft): the whole home is the one thing you both changed
      const pick=await askConflicts([{ path:['whole'], mine:'', theirs:'' }], cur, {}, what);
      if(!pick) throw Object.assign(new Error('Not saved: nothing changed.'), { cancelled:true });
      if(pick[0]==='theirs') return { item:cur, kept:'theirs' };
      item={...mine}; rev=cur.rev||0; info={ with:cur.by||'', at:cur.saved||'', conflicts:1 }; continue;
    }
    const { value, conflicts }=merge3(strip(base), strip(mine), strip(cur));
    if(conflicts.length){
      const pick=await askConflicts(conflicts, cur, value, what);
      if(!pick) throw Object.assign(new Error('Not saved: nothing changed.'), { cancelled:true });
      conflicts.forEach((c,i)=>setAt(value, c.path, pick[i]==='mine' ? c.mine : c.theirs));
    }
    const meta={}; META.forEach(k=>{ if(mine[k]!==undefined) meta[k]=mine[k]; });
    item={ ...value, ...meta }; rev=cur.rev||0; info={ with:cur.by||'', at:cur.saved||'', conflicts:conflicts.length };
  }
  throw new Error('Others kept saving at the same moment. Try again.');
}
const mergedText = info => info ? `Combined with ${who(info.with)}'s changes from ${when(info.at)}${info.conflicts?` (${info.conflicts} picked by you)`:''}.` : '';
export { merge3, setAt, syncSave, strip, mergedText, label, who };
