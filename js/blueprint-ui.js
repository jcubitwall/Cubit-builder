/* Cubit Builder — blueprint-ui.js : the Blueprints window and the PDF.

   Opens from Sheets → Whole home → Blueprints, or ⋯ → Blueprints. Shows every sheet of the set (blueprint.js) as it
   will print, big and zoomable (pinch, wheel, + / −), with the list down the side. "Details" edits what goes in
   the title block: project, client, site, drawn / checked by, date, the six revisions, which sheets are in the set,
   Cubit's company lines and every note. Company lines and notes are kept for every home in this browser; the rest
   per home. "Download PDF" makes one 24″ × 18″ page per sheet, vector, with the Oswald font embedded.
   The 3D views are rendered from the home as it stands in Build: three outside views and one with the roof off. */
import { state } from './state.js';
import { MODELS } from './data.js';
import * as S3 from './scene3d.js';
import { SHEETS, PW, PH, loadBP, saveBP, homeInfo, makeContext, buildSet, setLogo, NOTES0, COMPANY0 } from './blueprint.js';
import { foundationData } from './foundation.js';
import { concretePlan } from './concrete.js';
import { attachZoom } from './zoompan.js';
import { toast } from './sidebar.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let ASSETS=null;
async function toDataURL(url){ const b=await (await fetch(url)).blob(); return await new Promise(r=>{ const f=new FileReader(); f.onload=()=>r(f.result); f.readAsDataURL(b); }); }
async function toB64(url){ const a=new Uint8Array(await (await fetch(url)).arrayBuffer()); let s=''; for(let i=0;i<a.length;i+=0x8000) s+=String.fromCharCode.apply(null, a.subarray(i,i+0x8000)); return btoa(s); }
async function assets(){
  if(ASSETS) return ASSETS;
  const [logo, reg, bold] = await Promise.all([toDataURL('brand/cubit-logo.png'), toB64('fonts/Oswald-Regular.ttf'), toB64('fonts/Oswald-SemiBold.ttf')]);
  setLogo(logo); ASSETS={ logo, reg, bold }; return ASSETS;
}
function loadScript(src){ return new Promise((ok,no)=>{ if([...document.scripts].some(s=>s.src.endsWith(src))) return ok(); const s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=no; document.head.appendChild(s); }); }

/* ---------------------------------------------------------------- 3D views */
function renderViews(){
  const out=[]; if(!S3.homeGroup || typeof THREE==='undefined') return out;
  const keep={...state.show}, ex=S3.explodeT||0;
  let R=null;
  try{
    if(ex) S3.explodeAt(0);
    Object.assign(state.show, { roof:true, ceiling:true, walls:true, floors:true, decks:true, screws:false, framing:false, splines:false, units:true, seals:false });
    const ni=S3.homeGroup.children.indexOf(S3.northGroup);
    const grab=()=>{ const c=S3.homeGroup.clone(true); if(ni>=0 && c.children[ni]) c.children[ni].visible=false;
      c.traverse(o=>{ if(o.isMesh && o.material && !Array.isArray(o.material) && o.material.transparent && o.material!==S3.MAT.glass){ const m=o.material.clone(); m.transparent=false; m.opacity=1; m.depthWrite=true; o.material=m; } }); return c; };
    S3.applyLayers(); const whole=grab();
    state.show.roof=false; state.show.ceiling=false; S3.applyLayers(); const open=grab();
    Object.assign(state.show, keep); S3.applyLayers(); if(ex) S3.explodeAt(ex);
    const W=1600, H=1000; R=new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true }); R.setPixelRatio(1); R.setSize(W,H,false);
    R.shadowMap.enabled=true; R.shadowMap.type=THREE.PCFSoftShadowMap; if('outputEncoding' in R) R.outputEncoding=THREE.sRGBEncoding;
    const shot=(group, az, el, fill=1.25)=>{
      const sc=new THREE.Scene();
      const cv=document.createElement('canvas'); cv.width=2; cv.height=256; const c2=cv.getContext('2d'); const gr=c2.createLinearGradient(0,0,0,256); gr.addColorStop(0,'#b9d3ea'); gr.addColorStop(0.62,'#eef3f6'); gr.addColorStop(1,'#f4f1ea'); c2.fillStyle=gr; c2.fillRect(0,0,2,256);
      sc.background=new THREE.CanvasTexture(cv);
      group.traverse(o=>{ if(o.isSprite) o.visible=false; if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
      sc.add(group);
      group.updateMatrixWorld(true); const box=new THREE.Box3(); group.traverse(o=>{ if(!o.isMesh) return; for(let q=o; q; q=q.parent) if(!q.visible) return; box.expandByObject(o); }); const _b=box, cen=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3()), rad=size.length()/2;
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(rad*60, rad*60), new THREE.MeshStandardMaterial({ color:0x9aa88a, roughness:1 }));
      sc.fog=new THREE.Fog(0xe6edf0, rad*9, rad*28);
      ground.rotation.x=-Math.PI/2; ground.position.y=box.min.y-0.02; ground.receiveShadow=true; sc.add(ground);
      sc.add(new THREE.HemisphereLight(0xffffff, 0x8d8a7c, 0.75));
      const sun=new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(cen.x+rad*1.4, cen.y+rad*2.2, cen.z+rad*0.9); sun.target.position.copy(cen); sc.add(sun, sun.target);
      sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); const sc_=sun.shadow.camera; sc_.left=sc_.bottom=-rad*3; sc_.right=sc_.top=rad*3; sc_.near=0.1; sc_.far=rad*8; sun.shadow.bias=-0.0006;
      const cam=new THREE.PerspectiveCamera(32, W/H, 0.1, rad*40);
      const a=az*Math.PI/180, e=el*Math.PI/180, d=rad*fill/Math.sin(16*Math.PI/180)*0.78;
      cam.position.set(cen.x+d*Math.cos(e)*Math.sin(a), cen.y+d*Math.sin(e), cen.z+d*Math.cos(e)*Math.cos(a)); cam.lookAt(cen);
      R.render(sc, cam); const url=R.domElement.toDataURL('image/jpeg', 0.86);
      sc.remove(group); ground.geometry.dispose(); ground.material.dispose(); sc.background.dispose(); return url;
    };
    out.push(shot(whole, -35, 14), shot(whole.clone(true), 140, 16), shot(whole.clone(true), 215, 12), shot(open, -25, 58, 0.95));
  }catch(e){ console.warn('3D views', e); Object.assign(state.show, keep); try{ S3.applyLayers(); }catch(_){} }
  finally{ if(R){ R.dispose(); R.forceContextLoss?.(); } }
  return out;
}

/* ---------------------------------------------------------------- the set */
let CUR=null;   // { ctx, set, renders, i }
async function makeSet(withRenders=true){
  await assets();
  const renders = withRenders ? (CUR?.renders?.length && CUR.key===state.model ? CUR.renders : renderViews()) : [];
  const ctx=makeContext({ bp:loadBP(), renders, found:()=>foundationData(), concrete:()=>concretePlan(state.model) });
  return { ctx, set:buildSet(ctx), renders, key:state.model };
}
async function pdfBlob(set){
  const A=await assets(); await loadScript('js/vendor/svg2pdf.umd.min.js');
  const { jsPDF } = window.jspdf; const doc=new jsPDF({ orientation:'landscape', unit:'pt', format:[PW,PH], compress:true });
  doc.addFileToVFS('Oswald-Regular.ttf', A.reg); doc.addFont('Oswald-Regular.ttf','Oswald','normal');
  doc.addFileToVFS('Oswald-SemiBold.ttf', A.bold); doc.addFont('Oswald-SemiBold.ttf','Oswald','bold');
  const host=document.createElement('div'); host.style.cssText='position:fixed;left:-20000px;top:0;width:1728px;height:1296px;overflow:hidden;pointer-events:none'; document.body.appendChild(host);
  try{
    for(let i=0;i<set.length;i++){ if(i) doc.addPage([PW,PH],'landscape'); host.innerHTML=set[i].svg;
      const el=host.firstElementChild; const fn=window.svg2pdf?.svg2pdf || window.svg2pdf; await fn(el, doc, { x:0, y:0, width:PW, height:PH }); }
  } finally { host.remove(); }
  doc.setProperties({ title:`${CUR?.ctx?.info?.project||'Cubit home'} - drawing set`, author:'Cubit', creator:'Cubit Builder' });
  return doc.output('blob');
}
function download(blob, name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
async function downloadPDF(btn){
  const old=btn?.textContent; if(btn){ btn.disabled=true; btn.textContent='Making PDF…'; }
  try{ if(!CUR || CUR.key!==state.model) CUR={...(await makeSet()), i:0}; const b=await pdfBlob(CUR.set);
    download(b, `${CUR.ctx.info.project} - Cubit drawing set ${CUR.ctx.info.date}.pdf`.replace(/[\\/:*?"<>|]/g,'-')); toast('Drawing set downloaded'); }
  catch(e){ console.error(e); toast('Could not make the PDF: '+(e.message||e)); }
  finally{ if(btn){ btn.disabled=false; btn.textContent=old; } }
}

/* ---------------------------------------------------------------- window */
let dlg=null; const ZB={ k:1, x:0, y:0 };
function ensure(){
  if(dlg) return;
  dlg=document.createElement('dialog'); dlg.className='cw-dlg bp-dlg'; dlg.id='bpDlg'; dlg.setAttribute('aria-labelledby','bpT');
  dlg.innerHTML=`<header class="cw-h"><h2 id="bpT">Blueprints</h2><span class="note" id="bpSub"></span><span class="spacer"></span>
      <button class="btn ghost" id="bpEdit" aria-expanded="false">Details</button>
      <button class="btn" id="bpPdf">Download PDF</button>
      <button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="bp-body"><nav class="bp-list" id="bpList" aria-label="Sheets"></nav>
      <div class="bp-main"><div class="wb-stage bp-stage" id="bpStage"></div></div>
      <form class="bp-form" id="bpForm" hidden></form></div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('.cw-x').onclick=()=>dlg.close();
  dlg.querySelector('#bpPdf').onclick=e=>downloadPDF(e.currentTarget);
  dlg.querySelector('#bpEdit').onclick=e=>{ const f=dlg.querySelector('#bpForm'), on=f.hidden; f.hidden=!on; e.currentTarget.setAttribute('aria-expanded', on); if(on) fillForm(); };
}
function show(i){
  CUR.i=i; const st=dlg.querySelector('#bpStage'); st.innerHTML=CUR.set[i].svg; const svg=st.querySelector('svg'); svg.classList.add('wb-svg'); svg.removeAttribute('width'); svg.removeAttribute('height');
  ZB.k=1; ZB.x=0; ZB.y=0; attachZoom(svg, ZB);
  dlg.querySelectorAll('.bp-th').forEach((b,j)=>b.setAttribute('aria-current', j===i ? 'true' : 'false'));
}
function list(){
  const L=dlg.querySelector('#bpList');
  L.innerHTML=CUR.set.map(({sh,svg},j)=>`<button class="bp-th" data-i="${j}"><span class="bp-thimg">${svg.replace(/<image[^>]*>/g,'')}</span><span class="bp-thl"><b>${esc(sh.no)}</b> ${esc(sh.title)}</span></button>`).join('');
  L.querySelectorAll('.bp-th svg').forEach(s=>{ s.removeAttribute('width'); s.removeAttribute('height'); });
  L.querySelectorAll('.bp-th').forEach(b=>b.onclick=()=>show(+b.dataset.i));
}
async function refresh(keepI=true){
  const i=keepI && CUR ? CUR.i : 0; const renders=CUR?.key===state.model ? CUR.renders : null;
  const next=await (async()=>{ if(renders){ await assets(); const ctx=makeContext({ bp:loadBP(), renders, found:()=>foundationData(), concrete:()=>concretePlan(state.model) }); return { ctx, set:buildSet(ctx), renders, key:state.model }; } return makeSet(); })();
  CUR={ ...next, i:Math.min(i, next.set.length-1) };
  dlg.querySelector('#bpSub').textContent=`${CUR.ctx.info.project} · ${CUR.set.length} sheets · 24″ × 18″`;
  list(); show(CUR.i);
}
async function openBlueprints(){
  ensure(); dlg.querySelector('#bpT').textContent=`Blueprints · ${MODELS[state.model]?.name||''}`;
  dlg.querySelector('#bpStage').innerHTML='<p class="bp-wait">Drawing the sheets and rendering the 3D views…</p>'; dlg.querySelector('#bpList').innerHTML='';
  if(!dlg.open) dlg.showModal();
  if(CUR && CUR.key!==state.model) CUR=null;
  await new Promise(r=>setTimeout(r,30));
  try{ await refresh(false); }catch(e){ console.error(e); dlg.querySelector('#bpStage').innerHTML=`<p class="bp-wait">Could not draw the set: ${esc(e.message||e)}</p>`; }
}

/* ---------------------------------------------------------------- details form */
function fillForm(){
  const bp=loadBP(), h=homeInfo(bp), C=bp.company, N=bp.notes, f=dlg.querySelector('#bpForm');
  const inp=(id,label,val,type='text')=>`<label class="bp-f"><span>${label}</span><input type="${type}" data-k="${id}" value="${esc(val)}"></label>`;
  const ta=(id,label,val,rows=5)=>`<label class="bp-f"><span>${label}</span><textarea data-k="${id}" rows="${rows}">${esc(val)}</textarea></label>`;
  f.innerHTML=`<div class="bp-fh">This home</div>
    ${inp('h.project','Project name',h.project)}${inp('h.client','Client',h.client)}${inp('h.site','Site address',h.site)}
    <div class="bp-row">${inp('h.drawn','Drawn by',h.drawn)}${inp('h.checked','Checked by',h.checked)}</div>${inp('h.date','Date',h.date,'date')}
    <div class="bp-fh">Revisions</div>${[0,1,2,3,4,5].map(i=>`<div class="bp-row bp-rev"><b>${i+1}</b><input data-k="r.${i}.text" placeholder="Revision" value="${esc(h.revs[i]?.text||'')}"><input type="date" data-k="r.${i}.date" value="${esc(h.revs[i]?.date||'')}"></div>`).join('')}
    <div class="bp-fh">Sheets in the set</div><div class="bp-sheets">${SHEETS.map(s=>`<label><input type="checkbox" data-sheet="${s.id}" ${(h.sheets?.[s.id]??true)?'checked':''}> ${s.no} ${esc(s.title)}</label>`).join('')}</div>
    <div class="bp-fh">Cubit <small>(every home)</small></div>
    ${inp('c.tagline','Tagline',C.tagline)}${inp('c.address','Address',C.address)}<div class="bp-row">${inp('c.phone','Phone',C.phone)}${inp('c.email','Email',C.email)}</div>${inp('c.web','Website',C.web)}${inp('c.assoc','In association with (drafter)',C.assoc)}
    <div class="bp-fh">Notes <small>(every home · {T} {TI} {GAP} {FOUNDATION} fill in from the home)</small></div>
    ${ta('n.block','Title block notes',N.block,7)}${ta('n.general','General notes (one per line)',N.general,10)}${ta('n.liability','Liability',N.liability,5)}
    ${ta('n.roof','Section: roof / ceiling (one layer per line)',N.roof,5)}${ta('n.wall','Section: wall',N.wall,5)}${ta('n.floor','Section: floor',N.floor,6)}
    <div class="bp-fa"><button type="button" class="btn ghost" id="bpReset">Notes back to standard</button><button type="submit" class="btn">Apply</button></div>`;
  f.onsubmit=async e=>{ e.preventDefault(); const bp2=loadBP(), H=(bp2.homes[state.model] ||= {}); H.revs=H.revs||[];
    f.querySelectorAll('[data-k]').forEach(el=>{ const [g,a,b]=el.dataset.k.split('.'), v=el.value;
      if(g==='h') H[a]=v; else if(g==='c') bp2.company[a]=v; else if(g==='n') bp2.notes[a]=v; else if(g==='r'){ (H.revs[+a] ||= {})[b]=v; } });
    H.revs=H.revs.map(r=>r||{}); H.sheets={}; f.querySelectorAll('[data-sheet]').forEach(c=>H.sheets[c.dataset.sheet]=c.checked);
    saveBP(bp2); await refresh(); toast('Blueprint details saved'); };
  f.querySelector('#bpReset').onclick=async()=>{ const bp2=loadBP(); bp2.notes={...NOTES0}; saveBP(bp2); fillForm(); await refresh(); };
}

/* ---------------------------------------------------------------- the card on the Sheets page */
function renderBlueprintCard(el){
  const m=MODELS[state.model];
  el.innerHTML=`<div class="sheet-title"><div><div class="eyebrow" style="color:#555">Blueprints · permit &amp; client drawing set</div><h3>${esc(m?.name||'')} · Cubit drawing set</h3></div>
      <div class="meta">${SHEETS.length} sheets · 24″ × 18″ (ARCH C) · Cubit title block</div></div>
    <p class="bp-intro">Cover and general notes, foundation, floor plan, pod &amp; wall key plan, electrical, plumbing, elevations, section, window and door schedules and 3D views, all drawn from this home and to scale. Fill in the client, site and revisions under <b>Details</b>.</p>
    <div class="row"><button class="btn" id="bpOpen">Open blueprints</button><button class="btn ghost" id="bpDl" style="color:#111;border-color:#cfd4cc">Download PDF</button></div>
    <ol class="bp-index">${SHEETS.map(s=>`<li><b>${s.no}</b> ${esc(s.title)}</li>`).join('')}</ol>`;
  el.querySelector('#bpOpen').onclick=()=>openBlueprints();
  el.querySelector('#bpDl').onclick=e=>downloadPDF(e.currentTarget);
}
/* ⋯ menu */
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bBlueprints')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bBlueprints'; b.textContent='Blueprints'; pop.insertBefore(b, pop.children[1]||null); b.onclick=()=>{ pop.hidden=true; openBlueprints(); }; } }

export { openBlueprints, downloadPDF, renderBlueprintCard, makeSet, pdfBlob };
