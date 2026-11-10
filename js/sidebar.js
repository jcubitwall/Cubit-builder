/* Cubit Builder — sidebar.js : model chips, wall list, wall options, layout editor, wall upload */
import { FT, POD, PW, T, TI } from './config.js';
import { jointInfo, makeLead, setFree, differs, setJointT, partnerFor } from './joints.js';
import { jointWallT } from './state.js';
import { planWindowOverSink, centreWindowOverSink } from './sink-window.js';
import { LIB, MODELS, optionsFor, saveCustomModels, layerOptions, mirrorId, layerMirrorId } from './data.js';
import { LAYER_KINDS } from './config.js';
import { screwsFor, slotsFor, podList, CW, layerSlotsFor, partnerOf, deckList, worldSide, podOffsets } from './layout.js';
import { stairsOf, addStair, updateStair, removeStair, RAILS as stairRails, optionsFor as stairOptions, flipped as stairFlipped, landings as stairLandings, nextOptions as stairNext, addStairSpec } from './stairs.js';
import { panelCount, thumbSVG, bodyWall, wallLen, layerHoles, outlinePts, shapeOf } from './panels.js';
import { buildHome, highlight } from './scene3d.js';
import { facing, fmtBearing, bearingOf, compass } from './orient.js';
import { setDeckFoundation, rotatePod, deletePod, ensureDraft, mirrorPod, removeDeck, turnDeck, addPart, movePart, removePart, partSnaps, setPart, turnPart, partNext, continuePart } from './pods.js';
import { checkpoint } from './history.js';
import { openSheets } from './sheets.js';
import { pickFor, save, state, choose, pickLayer, chooseLayer, foundationOf, setFoundation, deckOCOf } from './state.js';
import { ocSeg, bindOC } from './deckframe.js';
import { concretePlan } from './concrete.js';
import { FAMILIES, familyOf, familyById, variantsOf, saveSub, removeSub, editSub } from './catalog.js';
import { isAdmin, canSave, canEdit } from './role.js';
import { myDrafts, renameDraft, deleteDraft } from './drafts.js';
import { liveCustomers, CUSTOMERS, restoreCustomer } from './customers.js';
import { TYPES, unitsFor, unitFor, setUnit, unitSVG, unitLabel, catOf, okey, pairOf, doorOwner, setDoorOwner } from './units.js';
import { fin } from './format.js';
import { setIsolate, setPod } from './layers.js';
import { applyEdits, deleteItem, addFamily } from './libedit.js';
import { withLights, cfgOf, setLights, cabinetsOf, setCabinet, cabDepth, CAB_PRESETS } from './lights.js';
import { askRename, askDelete } from './library-ui.js';
import { nameOf, withName, setName, askName } from './names.js';
import { furnSide, homeBlock, bindHomeBlock } from './casework-ui.js';
import { draftBlock, bindDraftBlock, draftsRow } from './publish-ui.js';
import { lightEditorHTML, bindLightEditor } from './light-edit-ui.js';
import { openWallBuilder } from './wall-builder.js';
import { elecWallBlock, bindElecWall, elecHomeLine, bindElecHome } from './electrical-ui.js';
import { plumbWallBlock } from './plumbing.js';
import './shape-studio.js';
import { openLayerBuilder } from './layer-builder.js';
import './panel-builder.js';
import './compass-ui.js';
import { refreshOpen, renameProject, deleteProject } from './projects.js';

const sideH=document.getElementById('sideH'), sideB=document.getElementById('sideB');
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* the home picker: four categories, one list at a time
     Cubit Homes  the originals, by model name (the standard layout and its variations). Protected: a change makes a
                  draft. Editors and admins adopt homes into it and replace or delete originals, deliberately.
     My Drafts    your own working copies (only you see them)
     Purgatory    homes saved for the team to review (team projects without a customer)
     Customers    each customer and the home(s) linked to them */
const famPick = {};   // last home opened under each model name (this visit)
let openFam, famInit=false, homeCat=null, custOpen=null;
const catOfHome = k => { const m=MODELS[k]; if(!m) return 'cubit'; if(m.custom) return 'drafts'; if(m.project) return m.customer ? 'cust' : 'purg'; return 'cubit'; };
const isOriginal = k => { const m=MODELS[k]; return !!m && !m.deleted && !m.custom && !m.project; };
let managing=false;
function renderModels(){
  applyEdits();
  const el=document.getElementById('models');
  const fam=familyOf(state.model)||null;
  if(fam) famPick[fam]=state.model;
  if(!homeCat) homeCat=catOfHome(state.model);
  if(!famInit){ openFam=fam; famInit=true; }
  const drafts=myDrafts(), purg=Object.keys(MODELS).filter(k=>MODELS[k].project && !MODELS[k].customer && !MODELS[k].deleted).sort((a,b)=>String(MODELS[b].saved||'').localeCompare(String(MODELS[a].saved||'')));
  const custs=liveCustomers(), gone=CUSTOMERS.filter(c=>c.deleted), homesOf=c=>Object.keys(MODELS).filter(k=>MODELS[k].project && MODELS[k].customer===c.id);
  const cubitN=Object.keys(MODELS).filter(isOriginal).length;
  const tabs=[['cubit','Cubit Homes',cubitN], ...(canSave()||drafts.length?[['drafts','My Drafts',drafts.length]]:[]), ['purg','Purgatory',purg.length], ['cust','Customers',custs.length]];
  el.classList.toggle('managing', managing);
  let h=`<div class="hc-tabs" role="tablist" aria-label="Home categories">${tabs.map(([k,l,n])=>`<button role="tab" data-cat="${k}" aria-selected="${homeCat===k}">${l}<small>${n}</small></button>`).join('')}</div>`;
  // each home: open it (tap), and Rename / Delete beside it for those allowed (delete asks twice)
  const item=(k,sub)=>{ const m=MODELS[k], ac=homeActs(k);
    const btn=`<button class="fam-it ${catOfHome(k)}" role="option" data-m="${k}" aria-selected="${k===state.model}"><b>${esc(m.name)}${m.locked?' <span class="lock-b" title="Signed and locked">🔒</span>':''}</b><small>${esc(sub ?? (m.size||''))}</small></button>`;
    return ac.ren||ac.del ? `<div class="fam-row">${btn}<span class="fam-acts manage-only">${ac.ren?`<button class="btn ghost sm" data-hren="${k}" aria-label="Rename ${esc(m.name)}">Rename</button>`:''}${ac.del?`<button class="btn ghost sm danger" data-hdel="${k}" aria-label="Delete ${esc(m.name)}">Delete</button>`:''}</span></div>` : btn; };
  const when = iso => iso ? new Date(iso).toLocaleDateString(undefined,{month:'short', day:'numeric'}) : '';
  const who = e => e ? String(e).split('@')[0] : '';
  if(homeCat==='cubit'){
    const famList = f => variantsOf(f).filter(isOriginal);
    const unfiled=famList(null);
    const chip=(id,name,list)=>`<button class="chip fam ${list.length?'':'empty'}" data-f="${id??''}" aria-pressed="${openFam===id}" aria-expanded="${openFam===id}">${esc(name)}<small>${list.length}</small><span class="caret" aria-hidden="true">▾</span></button>`;
    h+=`<div class="hc-chips">${FAMILIES.filter(f=>!f.deleted).map(f=>chip(f.id, f.name, famList(f.id))).join('')}${unfiled.length?chip(null,'Not filed yet',unfiled):''}${canEdit()?'<button class="chip fam new" data-newfam="1" title="Introduce a new model name">＋ New model name</button>':''}</div>`;
    const list = openFam!=='none' && openFam!==undefined ? famList(openFam) : null;
    const fo = openFam ? familyById(openFam) : null;
    if(list && fo && canEdit()) h+=`<div class="fam-bar manage-only"><span class="note">Model name <b>${esc(fo.name)}</b></span><button class="btn ghost sm" data-fren="${esc(fo.id)}">Rename</button><button class="btn ghost sm danger" data-fdel="${esc(fo.id)}">Delete</button></div>`;
    if(list) h+=`<div class="fam-list" role="listbox">${list.length ? list.map(k=>item(k, MODELS[k].sub ? `variation · ${MODELS[k].size||''}` : `standard · ${MODELS[k].size||''}`)).join('') : '<p class="note">No original under this model name yet. Editors adopt one into it from Purgatory (open the home there → Adopt into Cubit Homes, pick this model name).</p>'}</div>`;
  } else if(homeCat==='drafts'){
    h+=`<div class="fam-list" role="listbox">${canSave()?'<button class="fam-it new" data-new="1"><b>＋ New home</b><small>start from scratch</small></button>':''}${drafts.map(k=>item(k, MODELS[k].from&&MODELS[k].from!==k&&MODELS[MODELS[k].from] ? `from ${MODELS[MODELS[k].from].name}` : 'only you see it')).join('') || '<p class="note">No drafts. Change any home and your copy lands here.</p>'}</div>`;
  } else if(homeCat==='purg'){
    h+=`<div class="fam-list" role="listbox">${purg.map(k=>item(k, [MODELS[k].size, who(MODELS[k].by), when(MODELS[k].saved)].filter(Boolean).join(' · '))).join('') || '<p class="note">Nothing waiting. Save a draft to Purgatory for the team to review.</p>'}</div>`;
  } else {
    h+=`<div class="fam-list" role="listbox">${canSave()?'<button class="fam-it new" data-newcust="1"><b>＋ New customer</b><small>profile, then link a home</small></button>':''}${custs.map(c=>{ const hs=homesOf(c), open=custOpen===c.id || hs.includes(state.model);
        return `<div class="cust-g"><button class="fam-it cust-h" data-copen="${esc(c.id)}" aria-expanded="${open}"><b>${esc(c.name)}</b><small>${c.status==='Signed'||Object.keys(c.signed||{}).length?'signed · ':''}${hs.length} home${hs.length===1?'':'s'}</small></button>
          ${open?`<div class="cust-homes">${hs.map(k=>item(k, MODELS[k].locked?'signed · locked':'not signed yet')).join('')}${canSave()?`<button class="fam-it sub" data-cust="${esc(c.id)}"><b>Profile</b><small>details, selections, sign</small></button>`:''}</div>`:''}</div>`; }).join('') || '<p class="note">No customers yet.</p>'}
      ${canEdit() && gone.length ? `<p class="note">${gone.length} deleted customer${gone.length===1?'':'s'} · <button class="linkbtn" data-trash="customers">Deleted items</button></p>` : ''}</div>`;
  }
  // Rename and Delete only while managing, so they aren't sitting beside every home in front of a customer
  if(canSave()) h+=`<div class="hc-manage"><button class="btn ghost sm" id="hManage" aria-pressed="${managing}">${managing?'Done managing':'Manage: rename, delete'}</button></div>`;
  el.innerHTML = h;
  el.querySelector('#hManage')?.addEventListener('click', ()=>{ managing=!managing; renderModels(); });
  const go = k => { state.model=k; state.selected=null; refreshOpen(k); save(); renderModels(); buildHome(); renderSide(); if(state.view==='sheets') openSheets(); };   // a team home: the latest save, not this device's older copy
  el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>go(b.dataset.m));
  el.querySelectorAll('[data-hren]').forEach(b=>b.onclick=()=>renameHome(b.dataset.hren));
  el.querySelectorAll('[data-hdel]').forEach(b=>b.onclick=()=>deleteHome(b, b.dataset.hdel));
  el.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{ homeCat=b.dataset.cat; renderModels(); });
  el.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{ const f=b.dataset.f||null; openFam = openFam===f ? 'none' : f; renderModels(); });
  el.querySelectorAll('[data-copen]').forEach(b=>b.onclick=()=>{ custOpen = custOpen===b.dataset.copen ? null : b.dataset.copen; renderModels(); });
  el.querySelectorAll('[data-cust]').forEach(b=>b.onclick=()=>{ document.getElementById('homeDlg')?.close(); import('./customers-ui.js').then(m=>m.openCustomer(b.dataset.cust)); });
  el.querySelectorAll('[data-trash]').forEach(b=>b.onclick=()=>{ document.getElementById('homeDlg')?.close(); import('./trash-ui.js').then(m=>m.openTrash(b.dataset.trash)); });
  el.querySelectorAll('[data-newfam]').forEach(b=>b.onclick=newFamily);
  el.querySelectorAll('[data-fren]').forEach(b=>b.onclick=()=>askRename('families', b.dataset.fren, ()=>renderModels()));
  el.querySelectorAll('[data-fdel]').forEach(b=>b.onclick=()=>askDelete(b, 'families', b.dataset.fdel, ()=>{ openFam='none'; renderModels(); }));
  el.querySelectorAll('[data-crest]').forEach(b=>b.onclick=async()=>{ try{ await restoreCustomer(b.dataset.crest); renderModels(); toast('Customer restored'); }catch(e){ toast(e.message); } });
  el.querySelectorAll('[data-newcust]').forEach(b=>b.onclick=()=>{ document.getElementById('homeDlg')?.close(); import('./customers-ui.js').then(m=>m.openCustomer(null)); });
}
/* a new model name: it shows as a chip at once, empty until a home is adopted into it */
async function newFamily(){
  const v=await askName({ title:'New model name', current:'', placeholder:'e.g. Summit', note:'Shown as a model name in Cubit Homes and the Save window for the whole team. Homes are filed under it when they are adopted into Cubit Homes from Purgatory.' }); if(v==null || !v.trim()) return;
  try{ const id=await addFamily(v); openFam=id; renderModels(); toast(`“${v.trim()}” added. Adopt a home into it from Purgatory (Adopt into Cubit Homes).`); }
  catch(e){ toast('Not added: '+(e.message||e)); }
}
/* ---------------------------------------------------------------- stairs (stairs.js) */
let stairStep=1;
function renderStairSide(id){
  const S=(MODELS[state.model].stairs||[]).find(x=>x.id===id), st=S && stairsOf(state.model).find(x=>x.S.id===id);
  if(!S || !st){ state.selected=null; renderSide(); return; }
  const P=podList(state.model), lo=P[S.pod], up=st.above!=null ? P[st.above] : null, o=st.o;
  const H=st.hole, hw=Math.round((H.x1-H.x)*12), hd=Math.round((H.z1-H.z)*12);
  const what = o.kind==='spiral' ? `As drawn in your Shapr3D model (Spiral_Stair.step): 15 treads on 4″ hubs round a ${fin(o.post)} post, a top landing plate over the west half · ${fin(o.Q)} square · ${o.n} risers of ${fin(Math.round(o.rise*16)/16)} (the model’s 7⅜″, eased to land flush on these floors)`
    : o.kind==='wind' ? `${o.n} risers of ${fin(Math.round(o.rise*16)/16)}: 2 steps in, 4 more to the end wall, 3 winders round the corner, 1 across the end, 3 winders round, 2 out into the pod above · 36″ wide, 99″ × 83″`
    : o.kind==='u' ? `${o.n} risers of ${fin(Math.round(o.rise*16)/16)}, treads of ${fin(o.run)}, two ${o.w}″ flights side by side with a landing · ${fin(Math.round(o.total))} long, ${2*o.w}″ wide`
    : `${o.n} risers of ${fin(Math.round(o.rise*16)/16)}, ${o.n-1} treads of ${fin(o.run)} · ${fin(Math.round(o.total))} long, ${o.w}″ wide`;
  sideH.innerHTML=`<div class="eyebrow">Stairs · ${esc(o.label.toLowerCase())}</div><h2>${esc(lo.label)} up to ${up?esc(up.label):'—'}</h2>
    <p>${what} · opening about ${fin(hw)} × ${fin(hd)} in the ceiling, roof and the floor above</p>`;
  const opts=stairOptions(id);
  sideB.innerHTML=`<div class="mid-box"><div class="eyebrow">Stair</div>
    ${st.why?`<p class="note el-warn">${esc(st.why)}</p>`:''}
    ${[['straight','Straight'],['u','U-shaped (switchback)'],['wind','Where pods cross'],['spiral','Spiral']].map(([kd,nm])=>`<div class="eyebrow sm">${nm}</div><div class="st-opts">${opts.filter(x=>x.kind===kd).map(x=>`<button class="st-opt" data-sopt="${x.key}" aria-pressed="${S.opt===x.key}" ${x.fits?'':'disabled'}><b>${esc(x.label)}</b><small>${esc(x.note)}</small>${x.fits?'':`<small class="el-warn">${esc(x.why||'doesn’t fit here')}</small>`}</button>`).join('')}</div>`).join('')}
    ${(()=>{ const Ld=stairLandings(st), ln=(nm,x)=>`<li class="${x.ok?'ok':'bad'}">${x.ok?'✓':'✗'} ${nm}: ${x.ok?'clear 36″ landing':esc(x.why)}</li>`;
      const nx=st.above!=null ? stairNext(S.id) : [];
      return `<div class="eyebrow sm">Landings</div><ul class="st-land">${ln('at the foot', Ld.foot)}${ln('at the top', Ld.top)}${Ld.startsOverHole?'<li class="bad">✗ it starts over the opening of the stair below</li>':''}</ul>
        ${nx.length?`<div class="eyebrow sm">Next floor up</div><div class="st-opts">${nx.map((c,i)=>`<button class="st-opt" data-snext="${i}" ${c.ok?'':'disabled'}><b>${esc(c.label)}</b><small>${esc(c.note)}</small>${c.ok?'':`<small class="el-warn">${esc(c.why)}</small>`}</button>`).join('')}</div>`:''}`; })()}
    <p class="note">${o.kind==='spiral' ? 'The square spiral’s 22½° wedge treads are winders / a spiral stair under the National Building Code (9.8.4): check them with the building official before building. ' : o.kind==='wind' ? 'Its winders turn 30° each, 90° per set with a tread between the sets (National Building Code 9.8.4.5): check them with the building official. ' : 'Legal for a house (National Building Code 9.8): risers 7⅞″ or less, runs 10⅛″ or more, 6′ 4¾″ headroom, 34″ or wider. '}${o.kind==='spiral'?'Handrail and guards by the builder.':'Solid 3″ treads on one steel tube stringer up the middle (HSS 4×10, a welded bracket under each tread): sizes and welds by an engineer.'}</p>
    ${o.kind!=='spiral'?`<div class="eyebrow sm">Railing</div><div class="seg sm st-rail">${Object.entries(stairRails).map(([k,l])=>`<button data-srail="${k}" aria-pressed="${(S.rail||'glass')===k}">${l}</button>`).join('')}</div>
    <p class="note">${(S.rail||'glass')==='glass'?'½″ tempered glass on stainless standoffs at the tread ends, 36″ high, a 1½″ stainless handrail on the stair side':(S.rail||'glass')==='cable'?'2″ stainless posts at 4′ or less, a top rail at 36″, ⅛″ cables 3″ apart or less':'no guards drawn'} · along the open sides and round the opening above.</p>`:''}
    <div class="eyebrow sm">Where it sits</div>
    <div class="mid-pos"><button class="btn ghost" data-sst="-1" aria-label="Slide back">◀</button>
      <label class="cw-f"><span>${o.kind==='spiral'?'Its near edge':'Foot of the stair'} from ${esc(lo.label)}'s end</span><input id="stU" inputmode="decimal" value="${Math.round(S.u0*16)/16}"><i>″</i></label>
      <button class="btn ghost" data-sst="1" aria-label="Slide on">▶</button></div>
    <div class="cw-opt"><span>Each tap</span><div class="seg sm">${[[1,'1″'],[12,'1′']].map(([v,l])=>`<button data-sstep="${v}" aria-pressed="${stairStep===v}">${l}</button>`).join('')}</div></div>
    <div class="row">${o.kind==='spiral' ? '<button class="btn ghost sm" id="stQ">Quarter turn</button><button class="btn ghost sm" id="stDir">Wind the other way</button>' : '<button class="btn ghost sm" id="stSide">Other wall</button><button class="btn ghost sm" id="stDir">Turn it round</button>'}<button class="btn ghost sm danger" id="stRm">Remove stairs</button></div></div>`;
  const go=patch=>{ updateStair(id, patch); renderModels(); buildHome(); highlight(); renderSide(); };
  sideB.querySelectorAll('[data-sopt]').forEach(b=>b.onclick=()=>{ const x=opts.find(q=>q.key===b.dataset.sopt); go(x.why && x.alt ? { ...x.alt, opt:x.key } : { opt:x.key }); });
  sideB.querySelectorAll('[data-srail]').forEach(b=>b.onclick=()=>go({ rail:b.dataset.srail }));
  sideB.querySelectorAll('[data-sstep]').forEach(b=>b.onclick=()=>{ stairStep=+b.dataset.sstep; renderSide(); });
  sideB.querySelectorAll('[data-sst]').forEach(b=>b.onclick=()=>go({ u0:S.u0 + (+b.dataset.sst)*stairStep }));
  sideB.querySelector('#stU').onchange=e=>{ const v=parseFloat(e.target.value); if(isFinite(v)) go({ u0:v }); };
  const sb=sideB.querySelector('#stSide'); if(sb) sb.onclick=()=>go({ side:S.side==='S'?'N':'S' });
  const sq=sideB.querySelector('#stQ'); if(sq) sq.onclick=()=>go({ q:((S.q||0)+1)%4 });
  sideB.querySelector('#stDir').onclick=()=>go(stairFlipped(S));
  const NX=st.above!=null ? stairNext(S.id) : [];
  sideB.querySelectorAll('[data-snext]').forEach(b=>b.onclick=()=>{ const c=NX[+b.dataset.snext]; if(!c?.ok) return; const id=addStairSpec(c.S);
    state.selected='stair:'+id; renderModels(); buildHome(); renderSide(); toast(`${c.label} · up to the next floor`); });
  sideB.querySelector('#stRm').onclick=e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to remove'; return; } removeStair(id); state.selected=null; renderModels(); buildHome(); highlight(); renderSide(); toast('Stairs removed (the openings close)'); };
}
/* ---------------------------------------------------------------- a middle wall: where it sits, and its door */
const DOORS=[[30,32.5],[32,34.5],[34,36.5],[36,38.5]];   // slab ″ → rough opening ″ (prehung)
let midDoorW=34, midStep=1, midKeep='mid';
function midBlock(s, w){
  const q=s.part, p=s.pod, span=(q.dir==='long'?8:p.len)*12, B=s.body;
  // by the real compass (its place counts from the pod's own W end across, or own S side along; its run the other way)
  // every reference by the letter of the pod wall it meets or faces (A, B1, C …), never by the compass
  const { lo:endLo, hi:endHi, at:wsL, facing } = midLetters(s);
  const ws=wsL, wsOther=midLetters(s).other;
  const snaps=partSnaps(s).filter(x=>Math.abs(x.at-q.at)>0.01).slice(0, 12);
  const doorOf=()=>{ const o=(w?.openings||[]).find(o=>o.kind==='door'); if(!o) return 'none'; const L=s.len*12, a=s.trim[0], b=L-s.trim[1], c=o.x+o.w/2; return Math.abs(c-(a+b)/2)<3 ? 'mid' : c<(a+b)/2 ? 'left' : 'right'; };
  const cur=doorOf();
  return `<div class="mid-box"><div class="eyebrow">Interior wall ${esc(s.letter)} · ${q.dir==='long'?'along':'across'} ${esc(p.label)}</div>
    <div class="eyebrow sm">Door</div>
    <div class="seg wrap" role="group" aria-label="Door">${[['none','No door'],['left','Door left'],['mid','Door middle'],['right','Door right']].map(([v,l])=>`<button data-mdoor="${v}" aria-pressed="${cur===v}">${l}</button>`).join('')}</div>
    <div class="cw-opt"><span>Door size</span><div class="seg sm" role="group" aria-label="Door size">${DOORS.map(([d])=>`<button data-mdw="${d}" aria-pressed="${midDoorW===d}">${d}″</button>`).join('')}</div></div>
    <p class="note">Left and right seen from the ${esc(facing)} side. More choices (pocket doors, two doors, windows) in the wall options below or the panel builder.</p>
    <div class="eyebrow sm">Where it sits</div>
    <div class="mid-pos"><button class="btn ghost" data-mnud="-1" aria-label="Move toward ${esc(ws)}">◀</button>
      <label class="cw-f"><span>Middle, from ${esc(ws)}</span><input id="midAt" inputmode="decimal" value="${Math.round(q.at*16)/16}"><i>″</i></label>
      <button class="btn ghost" data-mnud="1" aria-label="Move away from ${esc(ws)}">▶</button></div>
    <div class="cw-opt"><span>Each tap</span><div class="seg sm">${[[1,'1″'],[0.5,'½″'],[12,'1′']].map(([v,l])=>`<button data-mstep="${v}" aria-pressed="${midStep===v}">${l}</button>`).join('')}</div></div>
    <p class="note">${fin(q.at-B.t/2-6.5)} clear to ${esc(ws)}, ${fin(span-q.at-B.t/2-6.5)} to ${esc(wsOther)} (to the walls' inside faces, roughly).</p>
    <div class="eyebrow sm">Length</div>
    <div class="mid-len"><label class="cw-f"><span>Length</span><input id="midLen" inputmode="decimal" value="${Math.round(B.len*16)/16}"><i>″</i></label>
      <span class="note">wall to wall ${fin(B.in1-B.in0)}</span></div>
    <div class="cw-opt"><span>Keep in place</span><div class="seg sm" role="group" aria-label="The end that stays put">${[['lo',`${endLo} end`],['mid','middle'],['hi',`${endHi} end`]].map(([v,l])=>`<button data-mkeep="${v}" aria-pressed="${midKeep===v}">${l}</button>`).join('')}</div></div>
    <div class="mid-ends">${[[0,endLo,B.v0<=B.in0+0.01,B.in0<=0.01],[1,endHi,B.v1>=B.in1-0.01,B.in1>=B.span-0.01]].map(([e,nm,on,open])=>{ const nx=on && open ? partNext(s, e) : null;
      return `<span class="note">${esc(nm)} end: ${on ? (open ? `<b>open</b> · runs to the pod's edge (no wall there)` : '<b>to the wall</b>') : `stops ${fin(e? B.in1-B.v1 : B.v0-B.in0)} short`}</span>${on ? (nx ? `<button class="btn ghost sm" data-mnext="${e}">Continue into ${esc(nx.q.label)}</button>` : '<span></span>') : `<button class="btn ghost sm" data-mwall="${e}">To the wall</button>`}`; }).join('')}</div>
    <div class="eyebrow sm">Thickness</div>
    <div class="mid-len"><div class="seg sm" role="group" aria-label="Thickness">${[2.5,3.5,4.5,6.5].map(t=>`<button data-mt="${t}" aria-pressed="${Math.abs(B.t-t)<1e-6}">${fin(t)}</button>`).join('')}</div>
      <label class="cw-f"><span>Custom</span><input id="midT" inputmode="decimal" value="${B.t}"><i>″</i></label></div>
    <p class="note">On the plan and in 3D: drag the ⇄ arrows at its ends to make it shorter or longer, the arrow in the middle to move it (it snaps flush with walls nearby, else to the inch), ↻ to turn it about its middle.</p>
    ${snaps.length?`<div class="eyebrow sm">Snap flush</div><div class="mid-snaps">${snaps.map(x=>`<button class="chip" data-msnap="${x.at}">${esc(x.label)} <small>${fin(x.at)}</small></button>`).join('')}</div>`:''}
    <div class="row"><button class="btn ghost sm" id="midTurn">${q.dir==='long'?'Make it across':'Make it along'}</button><button class="btn ghost sm danger" id="midRm">Remove this wall</button></div></div>`;
}
/* the walls a middle wall meets and faces, by their letters: lo / hi = the pod walls at its two ends (where it would
   join them), at = the wall its place is measured from, other = the one across from that, facing = the wall on the
   side its left / right are seen from. A side split in two (B1, B2) gives the piece that's actually there. */
function midLetters(s){
  const p=s.pod, q=s.part, sl=slotsFor(state.model).filter(x=>x.pod.i===p.i && !x.part);
  const r=[s.n[1],-s.n[0]], tl=(s.trim?.[0]||0)/FT, tr=(s.trim?.[1]||0)/FT;
  const A=[s.p0[0]+r[0]*tl, s.p0[1]+r[1]*tl], Bp=[s.p0[0]+r[0]*(s.len-tr), s.p0[1]+r[1]*(s.len-tr)], mid=[(A[0]+Bp[0])/2, (A[1]+Bp[1])/2];
  const dSeg=(P,x)=>{ const dx=x.p1[0]-x.p0[0], dz=x.p1[1]-x.p0[1], L2=dx*dx+dz*dz||1e-9, t=Math.max(0,Math.min(1,((P[0]-x.p0[0])*dx+(P[1]-x.p0[1])*dz)/L2)); return Math.hypot(P[0]-x.p0[0]-dx*t, P[1]-x.p0[1]-dz*t); };
  const on=(local, P)=>{ const c=sl.filter(x=>x.local===local); if(!c.length) return `the ${local} side`; const b=c.sort((u,v)=>dSeg(P,u)-dSeg(P,v))[0]; return `Wall ${b.letter}`; };
  const lo=q.dir==='long'?'W':'S', hi=q.dir==='long'?'E':'N', at=q.dir==='long'?'S':'W', ot=q.dir==='long'?'N':'E';
  const near=(local)=>{ const c=sl.filter(x=>x.local===local); return c.length ? (dSeg(A,c[0])<dSeg(Bp,c[0]) ? A : Bp) : mid; };
  const facingLocal=['S','N','E','W'].find(k=>{ const v=sideVec(p,k); return Math.abs(v[0]-s.n[0])<0.5 && Math.abs(v[1]-s.n[1])<0.5; }) || at;
  return { lo:on(lo, near(lo)), hi:on(hi, near(hi)), at:on(at, mid), other:on(ot, mid), facing:on(facingLocal, mid) };
}
const worldSideName = (p, local) => ({ S:'south', N:'north', W:'west', E:'east' })[worldSide(p.rot, local)];
/* the real compass name of a plan direction (the north arrow can point anywhere) */
const CWN={ N:'north', S:'south', E:'east', W:'west', NE:'north-east', NW:'north-west', SE:'south-east', SW:'south-west' };
const compassName = (dx, dz) => { const c=compass(bearingOf(dx, dz)); return CWN[c] || CWN[c.slice(-2)] || CWN[c.slice(-1)] || c; };
/* the plan direction the pod's own side `local` faces */
const sideVec = (p, local) => ({ S:[0,-1], N:[0,1], W:[-1,0], E:[1,0] })[worldSide(p.rot, local)];
function bindMid(s){
  const q=s.part, pi=s.pod.i, root=sideB.querySelector('.mid-box'); if(!root) return;
  const go=id=>{ if(!id) return; state.selected=id; renderModels(); buildHome(); highlight(); renderSide(); };
  root.querySelectorAll('[data-mnud]').forEach(b=>b.onclick=()=>go(movePart(pi, q.id, q.at + (+b.dataset.mnud)*midStep)));
  root.querySelectorAll('[data-mstep]').forEach(b=>b.onclick=()=>{ midStep=+b.dataset.mstep; renderSide(); });
  root.querySelector('#midAt').onchange=e=>{ const v=parseFloat(e.target.value); if(isFinite(v)) go(movePart(pi, q.id, v)); };
  root.querySelectorAll('[data-msnap]').forEach(b=>b.onclick=()=>{ go(movePart(pi, q.id, +b.dataset.msnap)); toast(`Snapped ${b.firstChild.textContent.trim()}`); });
  root.querySelector('#midTurn').onclick=()=>go(turnPart(pi, q.id));
  root.querySelector('#midLen').onchange=e=>{ const v=parseFloat(e.target.value); if(isFinite(v) && v>=12) go(setPart(pi, q.id, { len:v, keep:midKeep })); else toast('At least 12″'); };
  root.querySelectorAll('[data-mkeep]').forEach(b=>b.onclick=()=>{ midKeep=b.dataset.mkeep; renderSide(); });
  root.querySelectorAll('[data-mnext]').forEach(b=>b.onclick=()=>{ const id=continuePart(pi, q.id, +b.dataset.mnext); if(id){ go(id); toast('Carried on into the next pod: its own piece, on the same line'); } });
  root.querySelectorAll('[data-mwall]').forEach(b=>b.onclick=()=>go(setPart(pi, q.id, b.dataset.mwall==='0' ? { e0:null } : { e1:null })));
  root.querySelectorAll('[data-mt]').forEach(b=>b.onclick=()=>go(setPart(pi, q.id, { t:+b.dataset.mt })));
  root.querySelector('#midT').onchange=e=>{ const v=parseFloat(e.target.value); if(isFinite(v) && v>=1 && v<=12) go(setPart(pi, q.id, { t:v })); else toast('Between 1″ and 12″'); };
  root.querySelector('#midRm').onclick=e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to remove'; return; } removePart(pi, q.id); state.selected=null; renderModels(); buildHome(); highlight(); renderSide(); toast('Interior wall removed'); };
  root.querySelectorAll('[data-mdw]').forEach(b=>b.onclick=()=>{ midDoorW=+b.dataset.mdw; renderSide(); });
  root.querySelectorAll('[data-mdoor]').forEach(b=>b.onclick=()=>midDoor(s, b.dataset.mdoor));
}
/* a door in a middle wall: a library interior wall of its length with one door there (made once, then reused) */
async function midDoor(s, where){
  if(where==='none'){ checkpoint(); ensureDraft(); const pk=state.picks[state.model]; if(pk) delete pk[s.id]; const mp=MODELS[state.model].picks; if(mp) delete mp[s.id]; save(); buildHome(); renderSide(); toast('No door: a solid wall'); return; }
  const RO=(DOORS.find(d=>d[0]===midDoorW)||DOORS[2])[1], H=80.75, L=s.len*12, a=s.trim[0], b=L-s.trim[1];
  if(b-a < RO+8){ toast('Too short for that door.'); return; }
  const x = where==='left' ? a+6 : where==='right' ? b-6-RO : (a+b)/2-RO/2;
  const same=LIB.find(w=>!w.deleted && w.type==='int' && w.len===s.len && (w.openings||[]).length===1 && w.openings[0].kind==='door' && Math.abs(w.openings[0].x-x)<0.25 && Math.abs(w.openings[0].w-RO)<0.25 && !(w.inside||[]).length && !(w.outside||[]).length);
  if(same){ choose(s, same.id); buildHome(); renderSide(); toast(`${same.name} · ${midDoorW}″ door`); return; }
  try{ const { saveWallFor }=await import('./wall-builder.js');
    await saveWallFor({ name:`${s.len}′ interior · 1 door ${where==='mid'?'middle':where} (${midDoorW}″) · interior wall`, len:s.len, type:'int', openings:[{ kind:'door', x:+x.toFixed(4), y:0, w:RO, h:H }], inside:[], outside:[], shapes:[] }, s);
    buildHome(); renderSide(); toast(`${midDoorW}″ door ${where==='mid'?'in the middle':'on the '+where}`); }
  catch(e){ toast('Not made: '+(e.message||e)); }
}
const showHomeCat = c => { homeCat=c; renderModels(); };

/* ---------------------------------------------------------------- rename / delete a home from the Homes window
   Cubit Homes originals: editors (deleted ones come back from ⋯ → Deleted items for 2 weeks).
   My Drafts: your own. Purgatory and customer homes: rename by salespeople and up, delete by editors (every save is
   kept on the server). Delete asks twice: the button first says "Tap again to delete", then a window asks to confirm. */
function homeActs(k){ const m=MODELS[k]; if(!m || m.deleted) return {};
  if(m.custom) return { ren:canSave(), del:canSave() };
  if(m.project) return { ren:canSave() && !m.locked, del:canEdit() };
  return { ren:canEdit(), del:canEdit() };
}
async function renameHome(k){ const m=MODELS[k]; if(!m) return;
  if(!m.custom && !m.project){ askRename('models', k, ()=>{ renderModels(); renderSide(); }); return; }
  const v=await askName({ title:`Rename ${m.custom?'draft':'home'}`, current:m.name }); if(v==null || !v.trim() || v.trim()===m.name) return;
  try{ if(m.custom) renameDraft(k, v); else await renameProject(m.project, v.trim()); renderModels(); renderSide(); toast(`Renamed to “${v.trim()}”`); }
  catch(e){ toast('Not renamed: '+(e.message||e)); }
}
async function deleteHome(btn, k){ const m=MODELS[k]; if(!m) return;
  if(btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to delete';
    setTimeout(()=>{ if(btn.isConnected){ btn.dataset.sure=''; btn.textContent='Delete'; } }, 4000); return; }
  const where = m.custom ? 'your draft' : m.project ? (m.customer ? 'this customer’s home' : 'this Purgatory home') : 'this Cubit Home original, for everyone';
  const back = m.custom ? 'It can be brought back for 2 weeks (⋯ → Deleted items).' : m.project ? 'Its saves are kept on the server, so it can be brought back (⋯ → Deleted items).' : 'It can be brought back for 2 weeks (⋯ → Deleted items).';
  if(!confirm(`Delete “${m.name}”, ${where}?\n\n${back}`)){ btn.dataset.sure=''; btn.textContent='Delete'; return; }
  const onScreen = state.model===k;
  try{
    if(m.custom) await deleteDraft(k);
    else if(m.project) await deleteProject(m.project);
    else await deleteItem('models', k);
    if(onScreen || !MODELS[state.model] || MODELS[state.model].deleted){ const next=FAMILIES.map(f=>variantsOf(f.id).find(x=>!MODELS[x]?.deleted)).find(Boolean) || Object.keys(MODELS).find(x=>!MODELS[x].deleted);
      if(next){ state.model=next; state.selected=null; save(); buildHome(); } }
    renderModels(); renderSide(); toast(`Deleted “${m.name}” · ${back}`);
  }catch(e){ toast('Not deleted: '+(e.message||e)); }
}
function wallListHTML(slots, current){
  const layers=layerSlotsFor(state.model);
  let html='';
  podList(state.model).forEach(pod=>{
    const mine=slots.filter(s=>s.pod.i===pod.i); if(!mine.length) return;
    const ids=mine.map(s=>s.id).concat(layers.filter(l=>l.pod.i===pod.i).map(l=>l.id)), open=podList(state.model).length===1 || ids.includes(current);
    html+=`<details class="podgrp" ${open?'open':''}><summary class="podhead">${pod.long}<span>Wall A = ${sideWord(mine[0].pod.wallA||'')}</span></summary><div class="wl">`;
    mine.forEach(s=>{
      const w=pickFor(s);
      html+=`<button class="${s.id===current?'on':''}" data-s="${s.id}" title="${esc(w.id+' — '+w.name)}"><span class="n">Wall ${s.letter}${nameOf('w:'+s.id)?` · ${esc(nameOf('w:'+s.id))}`:''} <em>${s.detail}</em></span><span class="l">${fmtLen(wallLen(bodyWall(s,w)))} · ${panelCount(bodyWall(s,w))} panels</span><span class="o">${esc(w.id+' — '+w.name)}${w.blank?' ⚠':''}</span></button>`;
    });
    layers.filter(l=>l.pod.i===pod.i).forEach(l=>{
      const L=pickLayer(l);
      html+=`<button class="lay ${l.id===current?'on':''}" data-s="${l.id}" title="${esc(L.id+' — '+L.name)}"><span class="n">${LAYER_KINDS[l.kind].label}</span><span class="l">${l.len}′ · ${(L.t||0).toFixed(2).replace(/\.?0+$/,'')}″</span><span class="o">${esc(L.id+' — '+L.name)}</span></button>`;
    });
    html+='</div></details>';
  });
  const decks=deckList(state.model);
  if(decks.length){
    html+=`<details class="podgrp" ${/deck:/.test(current||'')?'open':''}><summary class="podhead">Decks<span>${decks.length}</span></summary><div class="wl">`;
    decks.forEach(d=>{ html+=`<button class="lay ${('deck:'+d.k)===current||('__deck:'+d.k)===current?'on':''}" data-s="${state.view==='sheets'?'__deck:':'deck:'}${d.k}" title="${esc(d.L.id+' — '+(d.L.name||''))}"><span class="n">Deck ${d.k+1}</span><span class="l">${d.L.w}′ × ${d.L.d}′</span><span class="o">${esc(d.L.id+' — '+(d.L.name||''))}</span></button>`; });
    html+='</div></details>';
  }
  return html;
}
function layerThumb(L){
  const len=L.len*12, s=150/len, W=len*s, H=96*s;
  let g=`<svg viewBox="-2 -2 ${W+4} ${H+4}" aria-hidden="true"><rect width="${W}" height="${H}" fill="#e7e2d6" stroke="#5b4a33" stroke-width=".8"/>`;
  (L.seams||[]).forEach(x=>{ g+=`<line x1="${x*s}" y1="0" x2="${x*s}" y2="${H}" stroke="#5b4a33" stroke-width=".4" stroke-dasharray="2 2"/>`; });
  // holes exactly as drawn (round ones round, drawn shapes their outline); pockets darker by depth
  layerHoles(L).filter(h=>!h.notch).forEach(h=>{ const st = h.depth ? `fill="#8a6a3e" fill-opacity="${Math.min(.85,.25+h.depth*.12).toFixed(2)}" stroke="#5b4a33" stroke-width=".5"` : `fill="#fff" stroke="#c0392b" stroke-width=".7"`;
    if(h.shape==='round'||h.shape==='slot'||h.shape==='poly'){ const P=outlinePts(shapeOf({...h, y:h.z, h:h.d, d:h.dia})); g+=`<path d="${[P,...(h.islands||[])].map(Q=>'M'+Q.map(([x,z])=>`${(x*s).toFixed(2)} ${(z*s).toFixed(2)}`).join('L')+'Z').join(' ')}" fill-rule="evenodd" ${st}/>`; }
    else g+=`<rect x="${h.x*s}" y="${h.z*s}" width="${h.w*s}" height="${h.d*s}" ${st}/>`; });
  return g+'</svg>';
}
const fmtLen = inch => { const ft=Math.floor((inch+0.01)/12), r=Math.round((inch-ft*12)*8)/8; return r? `${ft}′-${r}″` : `${ft}′`; };
const sideWord = k => ({S:'top side', E:'right side', N:'bottom side', W:'left side'}[k]);

/* a selected wall, floor, ceiling or deck closes with ✕ (or Esc) back to the whole home */
/* the shop's own buttons (sheets, isolate, panel builder…) in one folding section at the bottom of the panel; hidden
   in Design. Open or shut is remembered. */
const SHOPSEC_KEY='cubit-shopsec';
const shopSecOpen = () => { try{ return localStorage.getItem(SHOPSEC_KEY)==='1'; }catch(e){ return false; } };
const shopSec = (inner, label='Shop · sheets, isolate, panel builder') => `<details class="shop-sec shop-only"${shopSecOpen()?' open':''}><summary>${label}</summary>${inner}</details>`;
document.addEventListener('toggle', e=>{ if(e.target.classList?.contains('shop-sec')){ try{ localStorage.setItem(SHOPSEC_KEY, e.target.open?'1':'0'); }catch(err){} } }, true);
function renderSide(){
  renderSideInner();
  if(state.selected && sideH){ sideH.insertAdjacentHTML('afterbegin','<button class="side-x" id="sideX" title="Back to the whole home (Esc)" aria-label="Back to the whole home">✕</button>');
    sideH.querySelector('#sideX').onclick=()=>{ state.selected=null; highlight(); renderSide();
      const st=document.getElementById('studio'); if(st.classList.contains('panel-open')) document.getElementById('bSide').click(); }; }
  // the pod this wall / floor belongs to: turn it or take it out, right here
  const pi = state.selected && !String(state.selected).startsWith('deck:') ? parseInt(state.selected,10) : NaN;
  if(Number.isFinite(pi) && sideB && canSave() && MODELS[state.model].pods[pi]){
    sideB.insertAdjacentHTML('afterbegin', `<div class="pod-acts"><b>${esc(withName(`Pod ${pi+1}`, 'p:'+pi))}</b><button class="btn ghost sm" id="podName">Name</button><button class="btn ghost sm" id="podTurn">Turn 90°</button><button class="btn ghost sm" id="podMir" title="End for end: left ↔ right">Mirror</button><button class="btn ghost sm" id="podFlip" title="Front ↔ back">Flip</button><button class="btn ghost sm" id="podRm">Remove pod</button></div>`);
    const go=(why,msg)=>{ if(why){ toast(why); return; } state.selected=null; renderModels(); buildHome(); renderSide(); toast(msg); };
    sideB.querySelector('.pod-acts').insertAdjacentHTML('beforeend', `<span class="pod-mid"><button class="btn ghost sm" id="midX" title="A wall across the pod, to split off a bathroom, a bedroom …">＋ Wall across</button><button class="btn ghost sm" id="midL" title="A wall along the pod">＋ Wall along</button></span>`);
    { const P=podList(state.model), me=P[pi], OFF=podOffsets(state.model), ov=(a,b)=>{ const oa=OFF[a.i], ob=OFF[b.i]; return Math.min(a.x1+oa.ox,b.x1+ob.ox)-Math.max(a.x+oa.ox,b.x+ob.ox)>0.1 && Math.min(a.z1+oa.oz,b.z1+ob.oz)-Math.max(a.z+oa.oz,b.z+ob.oz)>0.1; };
      // a pod with one above it gets a stair up; a pod with one below it gets a stair up into it from there
      const upP = me ? P.filter(q=>q.lv===me.lv+1 && ov(q,me)) : [], dnP = me ? P.filter(q=>q.lv===me.lv-1 && ov(q,me)) : [];
      if(upP.length || dnP.length) sideB.querySelector('.pod-acts').insertAdjacentHTML('beforeend', `<button class="btn ghost sm" id="podStair" title="A legal stair up to the floor above, with the opening cut">＋ Stairs</button>`);
      sideB.querySelector('#podStair')?.addEventListener('click', ()=>{ let id=null;
        if(upP.length) id=addStair(pi); if(!id) for(const q of dnP){ id=addStair(q.i); if(id) break; }
        if(!id){ toast('No room for a stair here: it needs about 12′ clear along a pod, under the pod above.'); return; }
        state.selected='stair:'+id; renderModels(); buildHome(); highlight(); renderSide(); toast('Stairs added · pick another option or slide them'); }); }
    const addMid=dir=>{ const id=addPart(pi, dir); if(!id) return; state.selected=id; renderModels(); buildHome(); highlight(); renderSide(); toast('Interior wall added · slide it, snap it flush, or tap a door option'); };
    sideB.querySelector('#midX').onclick=()=>addMid('cross'); sideB.querySelector('#midL').onclick=()=>addMid('long');
    sideB.querySelector('#podTurn').onclick=()=>go(rotatePod(pi),'Pod turned 90°');
    bindName(sideB, 'podName', 'p:'+pi, `Name Pod ${pi+1}`, 'e.g. Bedroom pod');
    sideB.querySelector('#podMir').onclick=()=>go(mirrorPod(pi,'x'),'Pod mirrored end for end');
    sideB.querySelector('#podFlip').onclick=()=>go(mirrorPod(pi,'z'),'Pod flipped front to back');
    sideB.querySelector('#podRm').onclick=e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to remove'; return; } const why=deletePod(pi); go(why, 'Pod removed, with the cabinets and furniture in it'); if(!why) setPod(null); };
  }
  // a window or door tapped in 3D: straight to its options
  if(state.selUnit && sideB){ const el=[...sideB.querySelectorAll('[data-k]')].find(x=>x.dataset.k===state.selUnit);
    const row=el?.closest('.unit-row'); if(row){ row.classList.add('unit-flash'); row.scrollIntoView({block:'center', behavior:'smooth'}); setTimeout(()=>row.classList.remove('unit-flash'), 1400); }
    state.selUnit=null; }
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && state.view==='studio' && state.selected && !document.querySelector('dialog[open]') && !e.target.closest('input,textarea,select')){ state.selected=null; highlight(); renderSide(); } });
/* where two pods meet: the two walls' openings always match; the plugs and switches on each face are its own */
function jointBlock(s){
  const J=jointInfo(s); if(!J) return '';
  const other=esc(J.other.label);
  if(J.free) return `<div class="jt-box"><div class="eyebrow">Connecting wall · 4½″</div><p class="note">Joins ${other}. <b>Let go:</b> this wall keeps its own openings${differs(s)?', and they <b>don’t line up</b> with the other side':''}.</p>
    <div class="row"><button class="btn ghost edit-only" id="jFree">Match the other side again</button></div></div>`;
  const lead = J.leads==='me' ? 'This wall leads: the other side takes its openings, mirrored.' : J.leads==='q' ? `The openings follow ${esc(J.other.label)}, mirrored.` : 'The openings of both walls are put together, so each one goes right through.';
  return `<div class="jt-box"><div class="eyebrow">Connecting wall · 4½″</div><p class="note">Joins ${other}. Doors, windows, HRV holes and openings always match on both sides. ${lead} Plugs, switches and other boxes are each wall’s own.</p>
    <div class="row">${J.leads==='me'?'':'<button class="btn ghost edit-only" id="jLead">Use this wall’s openings</button>'}<button class="btn ghost edit-only" id="jFree" title="Only when the two walls really must have different openings">Let the two differ</button></div></div>`;
}
/* a wall between pods: any thickness, or none (taken out). Taking out both sides leaves a full opening into the
   next pod: the two pods simply butt together there. */
function jointWallBlock(s){
  const t=jointWallT(s), cur=t==null?4.5:t, q=partnerFor(s), qt=q?jointWallT(q):null, qGone=qt===0, ed=canSave();
  if(t===0) return `<div class="jt-box jw-box"><div class="eyebrow">Connecting wall · taken out</div>
    <p class="note">This wall is taken out: no SIP, nothing on its faces${q?(qGone?`, and ${esc(q.label)} is out too, so the two pods are <b>open to each other</b> here, wall to wall, floor to ceiling.`:`. ${esc(q.label)} still stands on the other side (${fin(qt??4.5)}).`):'.'}</p>
    <div class="row edit-only">${q&&!qGone?`<button class="btn ghost sm" id="jwBoth">Take out ${esc(q.label)} too (full opening)</button>`:''}<button class="btn ghost sm" id="jwBack">Put this wall back (4½″)</button>${q&&qGone?`<button class="btn ghost sm" id="jwBackBoth">Put both back</button>`:''}</div></div>`;
  return `<div class="jt-box jw-box"><div class="eyebrow">Connecting wall · thickness</div>
    <div class="mid-len"><div class="seg sm" role="group" aria-label="Thickness">${[2.5,3.5,4.5,6.5].map(v=>`<button data-jwt="${v}" aria-pressed="${Math.abs(cur-v)<1e-6}" ${ed?'':'disabled'}>${fin(v)}</button>`).join('')}</div>
      <label class="cw-f"><span>Custom</span><input id="jwT" inputmode="decimal" value="${cur}" ${ed?'':'disabled'}><i>″</i></label></div>
    <p class="note">It keeps its face on the joint and gets thicker or thinner into this pod.${q?` ${esc(q.label)} on the other side is ${fin(qt??4.5)}${qGone?' (taken out)':''}.`:''}</p>
    <div class="row edit-only"><button class="btn ghost sm danger" id="jwOut">Take this wall out</button>${q?`<button class="btn ghost sm danger" id="jwOutBoth">Take out both (full opening)</button>`:''}${q&&Math.abs(cur-(qt??4.5))>1e-6&&qt!==0?`<button class="btn ghost sm" id="jwMatch">Make ${esc(q.label)} ${fin(cur)} too</button>`:''}</div></div>`;
}
function bindJointWall(s){
  const go=(t, both, msg)=>{ setJointT(s, t, both); renderModels(); buildHome(); highlight(); renderSide(); toast(msg); };
  sideB.querySelectorAll('[data-jwt]').forEach(b=>b.onclick=()=>go(+b.dataset.jwt, false, `${s.label}: ${fin(+b.dataset.jwt)} thick`));
  const i=sideB.querySelector('#jwT'); if(i) i.onchange=()=>{ const v=parseFloat(i.value); if(isFinite(v) && v>=1 && v<=12) go(v, false, `${s.label}: ${fin(v)} thick`); else toast('Between 1″ and 12″ (or take it out)'); };
  const sure=(b, fn)=>{ if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to confirm'; return; } fn(); };
  sideB.querySelector('#jwOut')?.addEventListener('click', e=>sure(e.target, ()=>go(0, false, `${s.label} taken out`)));
  sideB.querySelector('#jwOutBoth')?.addEventListener('click', e=>sure(e.target, ()=>go(0, true, 'Both walls taken out: a full opening between the pods')));
  sideB.querySelector('#jwBoth')?.addEventListener('click', ()=>{ const q=partnerFor(s); if(q){ setJointT(q, 0); renderModels(); buildHome(); highlight(); renderSide(); toast('Both walls out: a full opening between the pods'); } });
  sideB.querySelector('#jwMatch')?.addEventListener('click', ()=>{ const q=partnerFor(s); if(q){ setJointT(q, jointWallT(s)); renderModels(); buildHome(); highlight(); renderSide(); toast(`${q.label} matches`); } });
  sideB.querySelector('#jwBack')?.addEventListener('click', ()=>go(null, false, `${s.label} back, 4½″`));
  sideB.querySelector('#jwBackBoth')?.addEventListener('click', ()=>go(null, true, 'Both walls back, 4½″'));
}
function renderSideInner(){
  if(state.selFurn && furnSide(sideH, sideB)) return;   // a cabinet or piece of furniture picked
  const slots=slotsFor(state.model); const m=MODELS[state.model];
  const ls=layerSlotsFor(state.model).find(x=>x.id===state.selected);
  if(ls){ renderLayerSide(ls); return; }
  if(/^deck:\d+$/.test(state.selected||'')){ renderDeckSide3d(+state.selected.slice(5)); return; }
  if(/^stair:/.test(state.selected||'')){ renderStairSide(state.selected.slice(6)); return; }
  const s=slots.find(x=>x.id===state.selected);
  if(!s){
    const pods=m.pods.length, panels=slots.reduce((a,x)=>a+(pickFor(x)?panelCount(bodyWall(x,pickFor(x))):0),0);
    const area=m.pods.reduce((a,p)=>a+POD[p.t].len*8,0);
    const fam=familyById(familyOf(state.model));
    const nS=screwsFor(state.model,state.inset).length, conc=foundationOf(state.model)==='concrete' ? concretePlan(state.model) : null;
    const facts=[`${pods} pod${pods>1?'s':''}`, `${area} sq ft`, `${slots.filter(x=>x.type!=='int').length} outside + ${slots.filter(x=>x.type==='int').length} inside walls`, `${panels} SIP panels`,
      conc ? `${Math.round(conc.icfLen)}′ ICF${nS?` · ${nS} deck screws`:''}` : `${nS} ground screws`, (m.decks||[]).length ? `${m.decks.length} deck${m.decks.length>1?'s':''}` : '', m.note ? 'scanned from STEP' : ''].filter(Boolean);
    sideH.innerHTML=`<div class="eyebrow">${fam?esc(fam.name):'Model'}${m.sub?' · sub-model':m.custom?' · your layout':m.project?' · project':fam&&fam.base===state.model?' · standard':''}</div><h2>${esc(m.name)} <button class="linkbtn ren-link editor-only" id="renHome">Rename</button></h2><p>${facts.join(' · ')}</p>`;
    sideH.querySelector('#renHome').onclick=()=>askRename('models', state.model);
    sideB.innerHTML=`
      ${draftBlock()}
      ${foundationBlock()}
      ${wallListHTML(slots,null)}
      ${homeBlock()}
      ${elecHomeLine()}
      <div class="more-grp">
      ${MODELS[state.model].project ? catalogBlock() : ''}
      ${layoutBlock(m)}
      ${importBlock()}
      <details class="help"><summary>How walls are lettered</summary><p>Each pod's walls run A, B, C, D clockwise seen from above. A and C are the through walls (they run straight through, corner to corner) and B and D butt between them. Every pod's A points the same way: the way most pods' largest opening faces on the outside of the home. Click a through wall to make it A by hand. Panel numbers sit over the room side of each wall.</p></details>
      </div>`;
    bindLayout(); bindFoundation(); bindCatalog(); bindHomeBlock(sideB); bindDraftBlock(sideB); bindElecHome(sideB);
  } else {
    const w=pickFor(s); const opts=optionsFor(s.len, s.type||'ext', state.model);
    const isInt=s.type==='int';
    sideH.innerHTML=`<div class="eyebrow">${s.part ? `Interior wall · ${fin(s.body.t)} · ${fin(s.body.len)} long` : `${isInt?(jointWallT(s)===0?'Connecting wall · taken out':`Connecting wall · ${fin(jointWallT(s)??4.5)}`):'Exterior wall · 6½″'} · ${s.len}′${jointWallT(s)===0?'':` · ${s.len/4} panels`}`}</div><h2>${esc(withName(s.label, 'w:'+s.id))}${nameBtn('nmWall')}</h2><p>${s.detail} · faces ${fmtBearing(facing(s))}<span class="shop-only"> · now <b>${w?esc(w.id):'—'}</b> ${w?esc(w.name):''}${w&&!w.blank?' <button class="linkbtn ren-link editor-only" id="renWall">Rename</button>':''}</span></p>`;
    const rw=sideH.querySelector('#renWall'); if(rw) rw.onclick=()=>askRename('walls', w.mirrorOf||w.id);
    setTimeout(()=>{ if(s.part) bindMid(s); }, 0);
    bindName(sideH, 'nmWall', 'w:'+s.id, `Name ${s.label}`, 'e.g. Kitchen wall');
    sideB.innerHTML=`
      ${s.part?midBlock(s,w):isInt?jointWallBlock(s):''}
      ${unitsBlock(s, bodyWall(s,w))}
      ${elecWallBlock(s)}
      ${plumbWallBlock(s)}
      ${(()=>{ const cv=cabinetsOf(state.model)[s.id], d=cabDepth(cv), kind=d ? (typeof cv==='object' ? cv.kind : 'Custom') : 'None';
        return `<div class="cab-box"><div class="eyebrow">Cabinets on this wall · deepest unit</div>
          <div class="seg wrap" role="group" aria-label="Deepest cabinet on this wall">${CAB_PRESETS.map(([n,v])=>`<button data-cab="${v}" data-cabn="${n}" aria-pressed="${kind===n}">${n}${v?` ${v}″`:''}</button>`).join('')}</div>
          <label class="lt-sp">Deepest unit <input type="number" id="cabD" min="0" max="48" step="0.5" value="${d}"> ″ out from the wall</label>
          ${d?`<p class="note">The ceiling lights along this wall sit ${fin(d+6)} out from it (6″ in front of the ${kind.toLowerCase()==='custom'?'units':kind.toLowerCase()}).</p>`:''}</div>`; })()}
      <div class="eyebrow">${opts.length} wall layout${opts.length===1?'':'s'} for a ${s.len}′ ${isInt?'interior':'exterior'} wall · seen from ${isInt?(s.other?.label||'the other side'):'outside'}</div>
      ${opts.length?'':`<p class="note">Nothing in the library for a ${s.len}′ ${isInt?'interior':'exterior'} wall yet. Upload a STEP file of a home that has one and it will be added.</p>`}
      <div class="opts">${opts.map(o=>`<button class="opt" data-o="${esc(o.id)}" aria-pressed="${w&&o.id===w.id}">${thumbSVG(o)}<b>${esc(o.name)}</b><code class="shop-only">${esc(o.id)}${o.src==='imported'?' · uploaded':''}${o.src==='saved'?' · saved here':''}${o.model?' · this home':''}</code></button>`).join('')}</div>
      ${shopSec(`<div class="row"><button class="btn" id="toSheet">Assembly sheet</button><button class="btn ghost" id="isoBtn" aria-pressed="${state.isolate===s.id}">${state.isolate===s.id?'Exit isolate':'Isolate'}</button>${s.short ? `<button class="btn ghost" id="makeA" ${s.letter.startsWith('A')?'disabled':''}>Make this Wall A</button>` : ''}${w&&!w.blank?`<button class="btn ghost edit-only" id="wMir" title="The same wall the other way round (left ↔ right)">Mirror wall</button>`:''}<button class="btn ghost edit-only" id="wBuild" title="Openings, boxes, holes and shapes for this wall">Panel builder</button></div>
      ${(state.wallA?.[state.model]?.[s.pod.i] || m.pods[s.pod.i]?.a) ? `<p class="note">Wall A for ${s.pod.label} was set by hand. <button class="linkbtn" id="autoA">Go back to automatic</button></p>`:''}
      ${isInt && !s.part && jointWallT(s)!==0 ? jointBlock(s) : ''}`)}`;
    sideB.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
      choose(s, b.dataset.o);
      // where two pods join, the neighbour's wall becomes the same wall, mirrored
      const pt=partnerOf(s, slots); if(pt) choose(pt, mirrorId(b.dataset.o), {follow:true});
      buildHome(); renderSide(); toast(`${s.label} → ${b.dataset.o}`+(pt?` · ${pt.label} → mirrored`:'')); });
    sideB.querySelector('#wBuild')?.addEventListener('click',()=>openWallBuilder({ from: w && !w.blank ? w.id : null, slot:s, len:s.len, type:s.type||'ext' }));
    sideB.querySelector('#wMir')?.addEventListener('click',()=>{ const id=mirrorId(w.id); choose(s, id); const pt=partnerOf(s, slots); if(pt) choose(pt, mirrorId(id), {follow:true}); buildHome(); renderSide(); toast(`${s.label} mirrored`+(pt?` · ${pt.label} follows`:'')); });
    bindUnits(s, bodyWall(s,w));
    bindElecWall(sideB, s);
    if(isInt && !s.part) bindJointWall(s);
    sideB.querySelector('#jLead')?.addEventListener('click',()=>{ makeLead(s); buildHome(); renderSide(); toast(`${s.other?.label||'The other'}'s wall now takes this wall's openings`); });
    sideB.querySelector('#jFree')?.addEventListener('click',()=>{ const f=!jointInfo(s)?.free; setFree(s, f); buildHome(); renderSide(); toast(f?'The two walls can now differ':'The two walls match again'); });
    sideB.querySelectorAll('[data-cab]').forEach(b=>b.onclick=()=>{ setCabinet(state.model, s.id, +b.dataset.cab, b.dataset.cabn); buildHome(); renderSide(); });
    const cd=sideB.querySelector('#cabD'); if(cd) cd.onchange=()=>{ setCabinet(state.model, s.id, Math.max(0,+cd.value||0), 'Custom'); buildHome(); renderSide(); };
    sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot=s.id; openSheets(); };
    sideB.querySelector('#isoBtn').onclick=()=>setIsolate(state.isolate===s.id ? null : s.id, s.label);
    
    const mk=sideB.querySelector('#makeA'); if(mk) mk.onclick=()=>{ checkpoint(); ensureDraft(); ((state.wallA[state.model] ||= {}))[s.pod.i]=s.side; save(); buildHome(); renderSide(); toast(`${s.pod.label}: this is now Wall A`); };
    const auto=sideB.querySelector('#autoA'); if(auto) auto.onclick=()=>{ checkpoint(); ensureDraft(); const mm=MODELS[state.model]; if(state.wallA[state.model]) delete state.wallA[state.model][s.pod.i]; delete mm.pods[s.pod.i].a; if(mm.custom) saveCustomModels(); save(); buildHome(); renderSide(); };
  }
  sideB.querySelectorAll('.wl button').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.s; highlight(); renderSide(); });
  const imp=sideB.querySelector('#bImport'); if(imp) imp.onclick=()=>document.getElementById('fileIn').click();
}

/* filing this layout under a model name (admins) */
function catalogBlock(){
  if(!canSave()) return '';
  const m=MODELS[state.model], fam=familyOf(state.model), opts=sel=>FAMILIES.map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${esc(f.name)}</option>`).join('');
  if(m.sub) return `<details class="catalog"><summary>Sub-model of ${esc(familyById(m.family)?.name||'')} · manage</summary>
      <div class="row"><button class="btn" id="subSave">Save changes for everyone</button></div>
      <label class="fld">Name<input id="subName" value="${esc(m.name)}" maxlength="80"></label>
      <label class="fld">Model<select id="subFam">${opts(m.family)}</select></label>
      <div class="row"><button class="btn ghost" id="subEdit">Rename / move</button><button class="btn ghost" id="subDel">Remove</button></div>
      <p class="note">Changes you make on screen (walls, pods, windows, foundation) stay on this device until you save them for everyone.</p></details>`;
  return `<details class="catalog"><summary>Add this layout to a model</summary>
      <label class="fld">Model<select id="subFam">${opts(fam||'')}</select></label>
      <label class="fld">Sub-model name<input id="subName" maxlength="80" placeholder="e.g. Cove + Office"></label>
      <label class="fld">Note (optional)<input id="subNote" maxlength="200" placeholder="e.g. extra 8′ pod for the Smith family, kept as an option"></label>
      <div class="row"><button class="btn" id="subAdd">Add as a sub-model</button></div>
      <p class="note">Files everything on screen (pods, decks, walls, windows and doors, foundation) under that model, for everyone.</p></details>`;
}
function bindCatalog(){
  const $=id=>sideB.querySelector('#'+id), done=(k,msg)=>{ renderModels(); buildHome(); renderSide(); toast(msg); };
  const fail=e=>toast('Not saved: '+e.message);
  if($('subAdd')) $('subAdd').onclick=async()=>{ const name=$('subName').value.trim(); if(!name){ $('subName').focus(); toast('Give the sub-model a name.'); return; }
    $('subAdd').disabled=true; try{ await saveSub({family:$('subFam').value, name, note:$('subNote').value.trim()}); done(null, `Added “${name}” to ${familyById($('subFam')?.value)?.name||'the model'}`); }catch(e){ fail(e); $('subAdd').disabled=false; } };
  const m=MODELS[state.model];
  if($('subSave')) $('subSave').onclick=async()=>{ try{ await saveSub({family:m.family, name:m.name, note:m.note, id:m.sub}); done(null,'Saved for everyone'); }catch(e){ fail(e); } };
  if($('subEdit')) $('subEdit').onclick=async()=>{ const name=$('subName').value.trim()||m.name; try{ await editSub(m.sub, {name, family:$('subFam').value}); done(null,'Sub-model updated'); }catch(e){ fail(e); } };
  if($('subDel')) $('subDel').onclick=async()=>{ const b=$('subDel'); if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to remove'; return; }
    try{ await removeSub(m.sub); done(null,'Sub-model removed'); }catch(e){ fail(e); } };
}

/* what the home stands on */
function foundationBlock(){
  const f=foundationOf(state.model), c=f==='concrete'?concretePlan(state.model):null;
  return `<div class="fld">Home stands on<div class="seg" role="group" aria-label="Foundation"><button class="fsbtn" data-found="screws" aria-pressed="${f!=='concrete'}">Ground screws</button><button class="fsbtn" data-found="concrete" aria-pressed="${f==='concrete'}">Concrete (ICF)</button></div></div>`
    + (c ? `<p class="note">${c.brand.name} ICF on an 18″ × 6″ footing: ${Math.round(c.coreLen)}′ around the outside${c.sections.length?` and ${c.sections.length} inside support${c.sections.length>1?'s':''} with an 8″ core (${c.sections.filter(s=>s.kind==='wall').length} wall section${c.sections.filter(s=>s.kind==='wall').length===1?'':'s'})`:''}. ${c.check.ok?'Every part of the crawl space can be reached.':'<b class="flipflag">Part of the crawl space is closed off.</b>'} Details on the foundation sheet.</p>` : '');
}
function bindFoundation(){
  sideB.querySelectorAll('[data-found]').forEach(b=>b.onclick=()=>{ setFoundation(state.model, b.dataset.found); state.show.screws=true; buildHome(); renderSide();
    toast(b.dataset.found==='concrete'?'Home on a concrete ICF foundation':'Home on ground screws'); });
}

/* windows & doors in the selected wall: which library unit goes in each opening */
const KIND_NAME = { window:'Window', door:'Door', patio:'Patio door' };
function unitsBlock(s, w){
  const ops=(w?.openings||[]).filter(catOf).sort((a,b)=>a.x-b.x);
  if(!ops.length) return '';
  const n={};
  return `<div class="eyebrow">Windows &amp; doors · seen from ${s.type==='int'?esc(s.other?.label||'the other side'):'outside'}, left to right</div><div class="units">${ops.map(o=>{
    n[o.kind]=(n[o.kind]||0)+1;
    const pr=pairOf(s,o), own=doorOwner(s,o).id===s.id;
    if(pr && !own) return `<div class="unit-row"><div class="unit-pic">${unitSVG('none','L',o.w,o.h)}</div><div class="unit-main"><b>${KIND_NAME[o.kind]} ${n[o.kind]}</b> <span class="muted">${fin(o.w)} × ${fin(o.h)} R.O. · between ${esc(s.pod.label)} and ${esc(pr.slot.pod.label)}</span>
      <span class="muted">The door is in ${esc(pr.slot.pod.label)}'s wall (${esc(pr.slot.label)}). This wall has the matching rough opening only.</span>
      <div class="unit-opts"><button class="btn ghost" data-own="${esc(okey(o))}">Put the door in ${esc(s.pod.label)}</button><button class="btn ghost" data-goto="${esc(pr.slot.id)}">Open ${esc(pr.slot.label)}</button></div></div></div>`;
    const r=unitFor(s,o), list=unitsFor(o, s), T=r&&TYPES[r.unit.type];
    const sel=`<select data-k="${esc(okey(o))}" aria-label="Unit for ${KIND_NAME[o.kind]} ${n[o.kind]}"><option value="">${r&&r.how==='auto'?'Automatic: '+esc(r.unit.name):'Not chosen yet'}</option>${list.map(({u,fit})=>`<option value="${esc(u.id)}" ${r&&r.how!=='auto'&&r.unit.id===u.id?'selected':''}>${esc(u.name)}${fit?'':' — does not fit'}</option>`).join('')}</select>`;
    const hand = T?.hand ? `<span class="seg sm" role="group" aria-label="${T.hand} side"><button data-h="L" data-k="${esc(okey(o))}" aria-pressed="${r.hand!=='R'}">${T.hand==='Hinge'?'Hinge L':'Left'}</button><button data-h="R" data-k="${esc(okey(o))}" aria-pressed="${r.hand==='R'}">${T.hand==='Hinge'?'Hinge R':'Right'}</button></span>` : '';
    const swing = T?.swing ? `<span class="seg sm" role="group" aria-label="Swing"><button data-sw="in" data-k="${esc(okey(o))}" aria-pressed="${r.swing!=='out'}">${pr?'Into '+esc(s.pod.label):'In'}</button><button data-sw="out" data-k="${esc(okey(o))}" aria-pressed="${r.swing==='out'}">${pr?'Into '+esc(pr.slot.pod.label):'Out'}</button></span>` : '';
    const ownerSeg = pr ? `<span class="muted">Between ${esc(s.pod.label)} and ${esc(pr.slot.pod.label)}: only one wall gets the door. It's in this one (${esc(s.pod.label)}); ${esc(pr.slot.label)} has the matching rough opening. <button class="linkbtn" data-move="${esc(okey(o))}">Move it to ${esc(pr.slot.pod.label)}'s wall</button></span>` : '';
    const wsink = o.kind==='window' ? (()=>{ const P=planWindowOverSink(s,o); if(!P.ok) return '';
      if(Math.abs(P.dx)<0.01) return `<span class="muted">Centred over the sink below${P.joint?' (as near as the panel joint allows)':''}.</span>`;
      return `<div class="unit-opts"><button class="btn ghost edit-only" data-wsink="${esc(okey(o))}" title="Moves the window in this home's own copy of the wall">Centre over the sink (${P.dx>0?'→':'←'} ${fin(Math.abs(P.dx))})</button></div>`; })() : '';
    return `<div class="unit-row"><div class="unit-pic">${r?unitSVG(r.unit.type,r.hand,o.w,o.h,44,s.type==='int',o.shape==='round'):unitSVG('none','L',o.w,o.h,44,false,o.shape==='round')}</div><div class="unit-main"><b>${o.shape==='round'?'Round window':KIND_NAME[o.kind]} ${n[o.kind]}</b> <span class="muted">${o.shape==='round'?'⌀ '+fin(o.d||o.w)+' round R.O.':fin(o.w)+' × '+fin(o.h)+' R.O.'}${o.y>0?' · sill '+fin(o.y):''}</span>${sel}${hand||swing?`<div class="unit-opts">${hand}${swing}</div>`:''}${ownerSeg}${wsink}${r?`<span class="muted">${esc(pr?unitLabel(r).replace(/swings (in|out)/, m=>'swings into '+(m.endsWith('in')?s.pod.label:pr.slot.pod.label)):unitLabel(r))}${r.unit.sample?' · sample unit':''}${r.unit.rso?` · RSO ${fin(r.unit.rso.w)} × ${fin(r.unit.rso.h)}${Math.abs(r.unit.rso.w-o.w)>0.25||Math.abs(r.unit.rso.h-o.h)>0.25?' (this opening is '+fin(o.w)+' × '+fin(o.h)+')':''}`:''}${r.unit.egress?' · egress':''}</span>`:''}</div></div>`;
  }).join('')}</div>${!ops.every(o=>unitsFor(o, s).length)?'<p class="note">Add a window or door to the library with <b>Upload STEP → Window / door</b>.</p>':''}`;
}
function bindUnits(s, w){
  const ops=(w?.openings||[]).filter(catOf), byK=k=>ops.find(o=>okey(o)===k);
  const cur=o=>{ const r=unitFor(s,o); return r?{u:r.unit.id, hand:r.hand, swing:r.swing}:null; };
  const done=()=>{ buildHome(); renderSide(); };
  sideB.querySelectorAll('.units select').forEach(el=>el.onchange=()=>{ const o=byK(el.dataset.k); setUnit(s,o, el.value?{u:el.value, hand:cur(o)?.hand||'L', swing:cur(o)?.swing||'in'}:null); done(); });
  sideB.querySelectorAll('.units [data-h]').forEach(b=>b.onclick=()=>{ const o=byK(b.dataset.k), c=cur(o); if(c){ setUnit(s,o,{...c, hand:b.dataset.h}); done(); } });
  sideB.querySelectorAll('.units [data-sw]').forEach(b=>b.onclick=()=>{ const o=byK(b.dataset.k), c=cur(o); if(c){ setUnit(s,o,{...c, swing:b.dataset.sw}); done(); } });
  // a door between two pods: which pod's wall holds it
  sideB.querySelectorAll('.units [data-own]').forEach(b=>b.onclick=()=>{ setDoorOwner(s, byK(b.dataset.own)); done(); });
  sideB.querySelectorAll('.units [data-move]').forEach(b=>b.onclick=()=>{ const o=byK(b.dataset.move), pr=pairOf(s,o); if(pr){ setDoorOwner(pr.slot, pr.o); state.selected=pr.slot.id; done(); } });
  sideB.querySelectorAll('.units [data-wsink]').forEach(b=>b.onclick=async()=>{ const o=byK(b.dataset.wsink); b.disabled=true;
    try{ const r=await centreWindowOverSink(s, o); if(!r.ok){ toast(r.why); b.disabled=false; return; }
      done(); toast(r.same ? 'Already centred over the sink' : `Window centred over the sink${r.joint?` · ${fin(Math.abs(r.joint))} off centre so its edge sits on the panel joint`:''} · this home now uses wall ${r.id}`); }
    catch(e){ toast(`Not moved: ${e.message||e}`); b.disabled=false; } });
  sideB.querySelectorAll('.units [data-goto]').forEach(b=>b.onclick=()=>{ state.selected=b.dataset.goto; highlight(); renderSide(); });
}

/* "Name" beside a code: Wall D · Kitchen wall (names.js) */
const nameBtn = (id) => canSave() ? ` <button class="linkbtn ren-link edit-only" id="${id}">Name</button>` : '';
function bindName(root, id, key, title, placeholder, after){ const b=root.querySelector('#'+id); if(!b) return;
  b.onclick=async()=>{ const v=await askName({ title, current:nameOf(key), placeholder, note:'Shown beside its code everywhere (on the sheets and labels too). The code itself stays the same.' });
    if(v===null) return; await setName(key, v); renderModels(); buildHome(); renderSide(); toast(v?`Named “${v}”`:'Name cleared'); }; }
function renderDeckSide3d(k){
  const d=deckList(state.model)[k]; if(!d){ state.selected=null; renderSide(); return; }
  const L=d.L;
  sideH.innerHTML=`<div class="eyebrow">Deck ${k+1} · ${L.w}′ × ${L.d}′ frame</div><h2>${esc(withName(`${L.w}′ × ${L.d}′ deck`, 'd:'+k))}${nameBtn('nmDeck')}</h2><p class="shop-only"><code>${esc(L.id)}</code> · double 2×8 rims · 2×8 joists ${deckOCOf(state.model)}″ o.c. from the house · 4 corner notches 1½″ · ¾″ off the house</p>`;
  sideB.innerHTML=`<div class="row"><button class="btn ghost edit-only" id="dTurn" title="Turn it a quarter turn where it docks">Turn</button><button class="btn ghost danger edit-only" id="dDel">Remove deck</button></div>
    <div class="fld">Stands on<div class="seg"><button class="fsbtn" id="fScrews" aria-pressed="${d.found!=='pads'}">Ground screws</button><button class="fsbtn" id="fPads" aria-pressed="${d.found==='pads'}">Concrete pads (floating)</button></div></div>
    <div class="edit-only">${ocSeg()}</div>
    <p class="note">Decks dock with their ledger against a pod or another deck. Long-press a deck to pick it up and move it.</p>
    ${shopSec(`<div class="row"><button class="btn" id="toSheet">Framing sheet</button><button class="btn ghost" id="isoBtn" aria-pressed="${state.isolate==='deck:'+k}">${state.isolate==='deck:'+k?'Exit isolate':'Isolate'}</button></div>`, 'Shop · framing sheet, isolate')}`;
  bindOC(sideB, ()=>{ buildHome(); renderSide(); });
  const setF=f=>{ setDeckFoundation(k,f); state.selected='deck:'+k; renderModels(); buildHome(); renderSide(); toast(f==='pads'?'Deck floats on concrete pads':'Deck on ground screws'); };
  sideB.querySelector('#fScrews').onclick=()=>setF('screws'); sideB.querySelector('#fPads').onclick=()=>setF('pads');
  sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot='__deck:'+k; openSheets(); };
  sideB.querySelector('#isoBtn').onclick=()=>setIsolate(state.isolate==='deck:'+k ? null : 'deck:'+k, `Deck ${k+1}`);
  sideB.querySelector('#dDel')?.addEventListener('click', e=>{ const b=e.currentTarget; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to remove'; return; }
    const why=removeDeck(k); if(why){ toast(why); return; } state.selected=null; if(state.isolate==='deck:'+k) setIsolate(null); renderModels(); buildHome(); renderSide(); toast(`Deck ${k+1} removed · undo brings it back`); });
  bindName(sideH, 'nmDeck', 'd:'+k, `Name Deck ${k+1}`, 'e.g. Front deck');
  sideB.querySelector('#dTurn')?.addEventListener('click', ()=>{ const why=turnDeck(k); if(why){ toast(why); return; } state.selected='deck:'+k; renderModels(); buildHome(); renderSide(); });
  
}
/* ============================================================ layout editor: add / remove pods */
function renderLayerSide(ls){
  const L=pickLayer(ls), K=LAYER_KINDS[ls.kind], opts=layerOptions(ls.kind, ls.len);
  sideH.innerHTML=`<div class="eyebrow">${K.label} · ${ls.len}′ × 8′ · ${(L.t||K.t)}″ thick</div><h2>${esc(withName(ls.label, 'l:'+ls.id))}${nameBtn('nmLayer')}</h2><p class="shop-only">now <b>${esc(L.id)}</b> ${esc(L.name)}${L.blank?'':' <button class="linkbtn ren-link editor-only" id="renLayer">Rename</button>'}</p><p class="design-only">${esc(ls.pod?.label||'')}${ls.pod?' · ':''}${ls.len}′ × 8′</p>`;
  const rl=sideH.querySelector('#renLayer'); if(rl) rl.onclick=()=>askRename('layers', L.id);
  bindName(sideH, 'nmLayer', 'l:'+ls.id, `Name ${ls.label}`, 'e.g. Bedroom ceiling');
  sideB.innerHTML=`
    ${(ls.kind==='ceiling-int'||ls.kind==='roof') && state.isolate!==ls.id ? '<p class="note">Turn on Ceiling or Roof under Layers (or use Exploded view) to see them in 3D, or press Isolate.</p>':''}
    ${ls.kind==='ceiling-int' ? (()=>{ const c=cfgOf(state.model), LL=withLights(L, ls);
      return `<div class="lights-box"><div class="eyebrow">Pot lights · 4″, ${LL.lights??0} in this pod</div>
        <div class="seg" role="group" aria-label="Pot lights"><button data-lauto="1" aria-pressed="${c.auto}">Placed by rule</button><button data-lauto="0" aria-pressed="${!c.auto}">As drawn</button></div>
        ${c.auto?`<label class="lt-sp">Spacing about <input type="number" id="ltSp" min="24" max="72" step="1" value="${c.spacing}"> ″ <small>(whole home)</small></label>
        <p class="note">Rows run the long way, evenly spaced with half a spacing to the walls; pods joined by a large opening space as one room. Lights move 6″ in front of cabinets set on a wall, and never land on a panel joint.</p>`:''}</div>`; })() : ''}
    ${ls.kind==='ceiling-int' ? lightEditorHTML(ls) : ''}
    <p class="note design-only">${ls.kind==='floor-int'||ls.kind==='floor-ext' ? 'Flooring and other finishes are picked under Finishes. The floor panel itself (holes, hatches, CNC) is set in Shop.' : 'The panel itself (holes, hatches, CNC) is set in Shop.'}</p>
    ${shopSec(`<div class="row"><button class="btn" id="toSheet">Layer sheet</button><button class="btn ghost" id="isoBtn" aria-pressed="${state.isolate===ls.id}">${state.isolate===ls.id?'Exit isolate':'Isolate'}</button>${L.blank?'':'<button class="btn ghost edit-only" id="lMir" title="End for end">Mirror</button><button class="btn ghost edit-only" id="lFlip" title="Front to back">Flip</button>'}<button class="btn ghost" id="lBuild" title="Holes, hatches, pockets and shapes for this layer">Panel builder</button></div>
    <div class="eyebrow">${opts.length} ${K.label.toLowerCase()} option${opts.length===1?'':'s'} for a ${ls.len}′ pod · seen from above</div>
    ${opts.length?'':`<p class="note">Nothing in the library for this yet. It fills up as STEP files are imported.</p>`}
    <div class="opts">${opts.map(o=>`<button class="opt" data-o="${esc(o.id)}" aria-pressed="${o.id===L.id}">${layerThumb(o)}<b>${esc(o.name)}</b><code>${esc(o.id)}</code></button>`).join('')}</div>`, 'Shop · panel options, sheet, panel builder')}`;
  sideB.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ chooseLayer(ls, b.dataset.o); buildHome(); renderSide(); toast(`${ls.label} → ${b.dataset.o}`); });
  if(ls.kind==='ceiling-int') bindLightEditor(sideB, ls);
  sideB.querySelector('#lMir')?.addEventListener('click',()=>{ chooseLayer(ls, layerMirrorId(L.id,'x')); buildHome(); renderSide(); toast(`${ls.label} mirrored end for end`); });
  sideB.querySelector('#lFlip')?.addEventListener('click',()=>{ chooseLayer(ls, layerMirrorId(L.id,'z')); buildHome(); renderSide(); toast(`${ls.label} flipped front to back`); });
  sideB.querySelector('#lBuild')?.addEventListener('click',()=>openLayerBuilder({ from: L.blank ? null : L.id, slot:ls, len:ls.len, kind:ls.kind }));
  sideB.querySelector('#toSheet').onclick=()=>{ state.sheetSlot=ls.id; openSheets(); };
  sideB.querySelector('#isoBtn').onclick=()=>setIsolate(state.isolate===ls.id ? null : ls.id, ls.label);
  sideB.querySelectorAll('[data-lauto]').forEach(b=>b.onclick=()=>{ setLights(state.model,{auto:b.dataset.lauto==='1'}); buildHome(); renderSide(); });
  const sp=sideB.querySelector('#ltSp'); if(sp) sp.onchange=()=>{ const v=Math.max(24,Math.min(72,+sp.value||42)); setLights(state.model,{spacing:v}); buildHome(); renderSide(); };
  
}
function layoutBlock(m){
  return `<details id="layoutBox"><summary>Pods in this home</summary>
    <div class="podrows">${podList(state.model).map(p=>`<div class="podrow"><span>${p.long}${p.rot?` · turned ${p.rot}°`:''}</span><code>${esc(p.src||'blank')}</code></div>`).join('')}</div>
    <div class="row"><button class="btn" id="openPlan">Open the plan editor</button></div>
    <p class="note">Drag pods in from the pod library, move, turn, replace or remove them on an 8′ grid.</p>
    ${m.custom?`<div class="row"><button class="btn ghost" id="apCopy">Copy layout code</button><button class="btn ghost" id="apDel">Delete this layout</button></div>`:''}
  </details>`;
}
function bindLayout(){
  const box=document.getElementById('layoutBox'); if(!box) return;
  if(state.layoutOpen) box.open=true;
  box.addEventListener('toggle',()=>{ state.layoutOpen=box.open; });
  box.querySelector('#openPlan').onclick=()=>document.getElementById('bPlan').click();
  const cp=box.querySelector('#apCopy'); if(cp) cp.onclick=async()=>{
    const m=MODELS[state.model]; const code=JSON.stringify({[state.model.replace('custom-','home-')]:{name:m.name.replace(' (custom)',''), size:m.size, pods:m.pods, picks:{...(m.picks||{}), ...(state.picks[state.model]||{})}}},null,2);
    try{ await navigator.clipboard.writeText(code); toast('Layout copied. Paste it into data/models.json.'); }
    catch(e){ const ta=document.createElement('textarea'); ta.value=code; ta.rows=8; ta.style.width='100%'; cp.after(ta); ta.select(); toast('Select the text below and copy it.'); }
  };
  const del=box.querySelector('#apDel'); if(del) del.onclick=()=>{
    if(del.dataset.sure!=='1'){ del.dataset.sure='1'; del.textContent='Tap again to delete'; return; }
    delete MODELS[state.model]; saveCustomModels(); state.model=Object.keys(MODELS)[0]; save(); renderModels(); buildHome(); renderSide();
  };
}
function sizeText(pods){ const c={}; pods.forEach(p=>c[POD[p.t].len]=(c[POD[p.t].len]||0)+1); return Object.entries(c).sort((a,b)=>b[0]-a[0]).map(([l,n])=>(n>1?n+'×':'')+l).join(' + '); }

function importBlock(){
  return `<details class="edit-only"><summary>Upload wall options</summary>
  <p>Upload a .json file of walls. Each wall drops into every slot of the same length. All sizes are inches, y from the bottom of the wall. Openings and outside items: x from the left end seen from <b>outside</b>. Inside boxes: x from the left end seen from <b>inside</b>, the way the electrician reads it. Use <code>"type": "int"</code> for a 4½″ wall (an interior wall, or a connecting wall between pods).</p>
<pre>[{ "id": "W24-16", "name": "Office wall", "len": 24, "type": "ext",
   "openings": [{"kind":"window","x":40,"y":36,"w":48,"h":36},
                {"kind":"door","x":200,"y":0,"w":38,"h":82.5}],
   "inside":  [{"kind":"outlet","x":30,"y":16},
               {"kind":"switch","x":40,"y":48}],
   "outside": [{"kind":"outlet","x":250,"y":16}] }]</pre>
  <div class="row"><button class="btn ghost" id="bImport">Upload wall file…</button></div></details>`;
}
document.getElementById('fileIn').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return; const rd=new FileReader();
  rd.onload=()=>{ try{
      let data=JSON.parse(rd.result); if(!Array.isArray(data)) data=data.walls||[data];
      let added=0; const keep=[];
      data.forEach(w=>{ if(!w.id||!w.len||(w.len*FT)%PW) return; const ty=w.type==='int'?'int':'ext'; const clean={id:String(w.id),name:w.name||w.id,len:+w.len,type:ty,t:+w.t||(ty==='int'?TI:T),openings:w.openings||[],inside:w.inside||[],outside:w.outside||[],src:'imported'};
        const i=LIB.findIndex(x=>x.id===clean.id); if(i>=0) LIB[i]=clean; else LIB.push(clean); keep.push(clean); added++; });
      try{ const prev=JSON.parse(localStorage.getItem('cubit-walls-imported')||'[]').filter(p=>!keep.find(k=>k.id===p.id)); localStorage.setItem('cubit-walls-imported',JSON.stringify(prev.concat(keep))); }catch(_){}
      toast(added?`Added ${added} wall option${added>1?'s':''}`:'No walls found. Check that each has id and a len in multiples of 4 ft.');
      renderSide();
    }catch(err){ toast('That file is not valid JSON.'); } };
  rd.readAsText(f); e.target.value='';
});
let toastT; function toast(msg, ms=2400){ let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);} t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,ms||2400); }

export { midLetters, showHomeCat, catOfHome, sideH, renderModels, wallListHTML, renderSide, importBlock, toast, sideB, layerThumb };

/* a team home was brought up to its latest save (projects.js refreshOpen): say so */
window.addEventListener('cubit:refreshed', e=>{ const d=e.detail||{}, by=d.by||'someone';
  const t = d.what==='loaded' ? `Opened the latest save (by ${by})`
    : d.what==='merged' ? `${by} saved this home since you opened it: your unsaved changes are combined with theirs`
    : d.what==='kept' ? `${by} saved this home since you opened it and you both changed ${d.n===1?'the same thing':d.n+' of the same things'}: Save changes will ask which to keep`
    : d.what==='draft' ? `Opened the latest save (by ${by}). This device's older copy is kept in My Drafts as “${d.name}”` : '';
  if(t) setTimeout(()=>toast(t, 7000), 400); });
