/* Cubit Builder — cncsheet.js : the "CNC cut files" sheet. Lists every pass in cut order, previews each
   one in machine coordinates, flags anything that needs a look, and downloads the DXF batch. */
import { MODELS } from './data.js';
import { fin } from './format.js';
import { cutPlan, cutFilesZip, manifestCSV, cncSettings, saveCncSettings, LAYERS } from './cnc.js';
import { tapPlan, tapZip, tapSVG } from './tap.js';
import { parse, timeOf, fmtTime, simulate, depthOf, checkPanel, depthCanvas, panel3D, BW, BH, RES } from './cutsim.js';
import { downloadBlob } from './sheets.js';
import { state } from './state.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const COL = { SHEET_REF:'#9aa09a', PANEL_REF:'#56605a', TRIM_CUT:'#c0392b', OPENING_THRU:'#2f6db5', VENT_THRU:'#16a0a0', BOX_POCKET:'#2f8a57', SPINE_NOTCH:'#7a3fb0' };
let pick = 0, tpick = 0;

function previewSVG(r){
  const s=7.2, pad=34, W=r.items.reduce((a,i)=>Math.max(a,i.x1),96)+1, Hh=r.blankW;
  const X=x=>pad+(x+1)*s, Y=y=>pad+(Hh-y)*s;     // Y up, like the machine
  let g=`<svg viewBox="0 0 ${(W+2)*s+pad*2} ${(Hh+2)*s+pad*2}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Pass preview">`;
  r.items.forEach(it=>{
    const c=COL[it.layer]||'#333', dash=LAYERS[it.layer].cut?'':'stroke-dasharray="5 4"';
    if(it.kind==='line') g+=`<line x1="${X(it.x0)}" y1="${Y(it.y0)}" x2="${X(it.x1)}" y2="${Y(it.y1)}" stroke="${c}" stroke-width="2.2" ${dash}/>`;
    else g+=`<rect x="${X(it.x0)}" y="${Y(it.y1)}" width="${(it.x1-it.x0)*s}" height="${(it.y1-it.y0)*s}" fill="${LAYERS[it.layer].cut?c+'22':'none'}" stroke="${c}" stroke-width="${LAYERS[it.layer].cut?1.8:1}" ${dash}/>`;
  });
  // datum + axes
  g+=`<circle cx="${X(0)}" cy="${Y(0)}" r="5" fill="#fff" stroke="#d0661f" stroke-width="2"/><text x="${X(0)+8}" y="${Y(0)+16}" font-size="10" fill="#d0661f">X0 Y0 · bottom of wall, front fence</text>`;
  g+=`<text x="${X(W/2)}" y="${Y(0)+28}" font-size="10" text-anchor="middle" fill="#555">X → wall height (96″)</text>`;
  g+=`<text transform="translate(${X(0)-14} ${Y(Hh/2)}) rotate(-90)" font-size="10" text-anchor="middle" fill="#555">Y → across the panel (${fin(Hh)})</text>`;
  return g+'</svg>';
}

let TP=null, tview='path';
const TIMES=new Map();
const tOf = f => { if(!TIMES.has(f.text)) TIMES.set(f.text, timeOf(f.text)); return TIMES.get(f.text); };
const sum = (fs) => fs.reduce((a,f)=>a+tOf(f),0);
const fname = x => MODELS[state.model].name.replace(/[^\w .+-]+/g,'').trim() + (x?` - ${x}`:'');
function tapSection(){
  TP=tapPlan(); const F=TP.files; if(tpick>=F.length) tpick=0;
  if(!F.length) return '';
  const f=F[tpick], podN=f.pod+1;
  let lastPod=null, lastWall=null, rows='';
  F.forEach((x,i)=>{
    if(x.pod!==lastPod){ const fs=F.filter(y=>y.pod===x.pod); rows+=`<tr class="grp pod"><td colspan="4">Pod ${x.pod+1}<span>${fs.length} files · ~${fmtTime(sum(fs))}</span></td><td><button class="linkbtn" data-dl="pod:${x.pod}" title="Download Pod ${x.pod+1}">↓</button></td></tr>`; lastPod=x.pod; lastWall=null; }
    if(x.letter!==lastWall){ const fs=F.filter(y=>y.pod===x.pod && y.letter===x.letter); rows+=`<tr class="grp"><td colspan="4">Wall ${esc(x.letter)}<span>bottom of the pile first · ~${fmtTime(sum(fs))}</span></td><td><button class="linkbtn" data-dl="wall:${x.pod}:${esc(x.letter)}" title="Download this wall">↓</button></td></tr>`; lastWall=x.letter; }
    rows+=`<tr class="${i===tpick?'on':''}" data-t="${i}"><td>${esc(x.name)}</td><td>${x.side.includes('E')?'ext':'int'} up</td><td>${x.stack}${x.stack===1?' top':x.stack===x.of?' btm':''}</td><td>${fmtTime(tOf(x))}</td><td>${x.warn.length?`<span class="flipflag">⚠</span>`:''}</td></tr>`; });
  const panelFiles=F.filter(y=>y.panel===f.panel);
  return `<h4 style="margin:6px 0 6px">G-code for the ShopSabre (.tap) · about ${fmtTime(sum(F))} of cutting</h4>
    <details class="help"><summary>Test first · how these files work</summary><p>Written in the shop's own format (ShopSabre ATC post, tool 13, Z zero on the bed, flip side to side) and checked against 13 of the shop's real files. Run each new panel type as an air cut, then on scrap, before cutting a real panel. Boxes only appear once a wall has a box layout. Times are rough: feeds from the files, rapids at ~${800} in/min, plus a margin for acceleration. Save the tap folder to the shop's network folder; the CNC PC picks them up from there.${TP.blank.length?` No CNC work (a note keeps their place in the pile): ${esc(TP.blank.map(b=>b.panel).join(', '))}.`:''}</p></details>
    <div class="dl-row"><span>Download .tap</span>
      <button class="btn" data-dl="home">Whole home</button>
      <button class="btn ghost" data-dl="pod:${f.pod}">Pod ${podN}</button>
      <button class="btn ghost" data-dl="wall:${f.pod}:${esc(f.letter)}">Pod ${podN} · Wall ${esc(f.letter)}</button>
      <button class="btn ghost" data-dl="panel:${esc(f.panel)}">Panel ${esc(f.panel)}${panelFiles.length>1?' (both sides)':''}</button></div>
    <div class="cnc-grid">
      <div class="tblwrap cnc-list"><table class="boxes"><thead><tr><th>File</th><th>Face</th><th>Stack</th><th>Time</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="cnc-prev">
        <div class="tv-head"><div><b>${esc(f.name)}</b><span>${fin(f.width)} wide · ${f.thick}″ SIP · ~${fmtTime(tOf(f))}${panelFiles.length>1?` · panel ~${fmtTime(sum(panelFiles))}`:''}</span></div>
          <div class="seg tv-tabs" role="tablist">${[['path','Toolpath'],['sim','Simulate'],['3d','3D panel']].map(([k,l])=>`<button class="fsbtn" data-tv="${k}" aria-pressed="${tview===k}">${l}</button>`).join('')}</div></div>
        <div class="tapv" id="tapv"></div>
        <div id="tapChecks"></div>
        ${f.warn.length?`<ul class="cnc-w">${f.warn.map(w=>`<li>⚠ ${esc(w)}</li>`).join('')}</ul>`:''}
        <details class="help"><summary>Cuts in this file</summary><ul class="note">${f.ops.map(o=>`<li>${esc(o.what||o.kind)}</li>`).join('')||'<li>No cuts on this face.</li>'}</ul></details>
      </div>
    </div>`;
}
/* the right-hand view: toolpath, animated cut, or the finished panel in 3D; then the checks */
let anim=null, view3d=null;
function mountTapView(el){
  if(anim){ cancelAnimationFrame(anim.raf); anim=null; } if(view3d){ view3d.dispose(); view3d=null; }
  const host=el.querySelector('#tapv'); if(!host || !TP?.files.length) return;
  const f=TP.files[tpick], panelFiles=TP.files.filter(y=>y.panel===f.panel);
  if(tview==='path'){ host.innerHTML=tapSVG(f.text, f.thick)+`<p class="note"><span class="sw" style="background:#c0392b"></span> right through · <span class="sw" style="background:#7a3fb0"></span> Einspine slot · <span class="sw" style="background:#2f8a57"></span> 3″ pocket · dashed = rapids</p>`; }
  else if(tview==='sim'){
    const pr=parse(f.text), T=pr.total;
    host.innerHTML=`<div class="sim-wrap"><canvas class="sim-c"></canvas><canvas class="sim-o"></canvas></div>
      <div class="sim-ctl"><button class="btn" id="simPlay">▶ Play</button><input type="range" id="simT" min="0" max="${T.toFixed(1)}" step="0.1" value="0" aria-label="Time">
        <span id="simClock">0 s / ${fmtTime(T)}</span><select id="simSpd" aria-label="Speed">${[10,30,100,300].map(v=>`<option value="${v}" ${v===30?'selected':''}>${v}×</option>`).join('')}</select></div>
      <p class="note">${/E/.test(f.side)?'Exterior':'Interior'} face up, as on the machine. <span class="sw" style="background:#2f8a57"></span> cut part-way, darker = deeper · <span class="sw" style="background:#222624"></span> right through.</p>`;
    const cv=host.querySelector('.sim-c'), ov=host.querySelector('.sim-o'), clock=host.querySelector('#simClock'), sl=host.querySelector('#simT');
    let hm=null, next=0, tNow=0, playing=false, lastDraw=0, lastTs=0;
    ov.width=BW; ov.height=BH;
    const draw=(tool)=>{ depthCanvas(cv, depthOf(hm, f.thick), f.thick, {ext:/E/.test(f.side)});
      const c=ov.getContext('2d'); c.clearRect(0,0,BW,BH);
      if(tool){ c.beginPath(); c.arc(tool[0]/RES, BH-tool[1]/RES, 0.375/RES, 0, 7); c.fillStyle='rgba(208,102,31,.85)'; c.fill(); c.lineWidth=2; c.strokeStyle='#fff'; c.stroke(); }
      clock.textContent=`${fmtTime(tNow)} / ${fmtTime(T)}`; sl.value=tNow; };
    const goTo=t=>{ if(t<tNow || !hm){ hm=null; next=0; } const r=simulate(pr, t, hm, next); hm=r.hm; next=r.next; tNow=t; draw(r.tool); };
    const step=ts=>{ if(!playing) return; const dt=lastTs?(ts-lastTs)/1000:0; lastTs=ts;
      const t=Math.min(T, tNow+dt*(+host.querySelector('#simSpd').value)); const r=simulate(pr, t, hm, next); hm=r.hm; next=r.next; tNow=t;
      if(ts-lastDraw>70 || t>=T){ draw(r.tool); lastDraw=ts; }
      if(t>=T){ playing=false; host.querySelector('#simPlay').textContent='↺ Again'; return; }
      anim.raf=requestAnimationFrame(step); };
    anim={raf:0};
    host.querySelector('#simPlay').onclick=()=>{ if(tNow>=T) goTo(0); playing=!playing; host.querySelector('#simPlay').textContent=playing?'❚❚ Pause':'▶ Play'; lastTs=0; if(playing) anim.raf=requestAnimationFrame(step); };
    sl.oninput=()=>{ playing=false; host.querySelector('#simPlay').textContent='▶ Play'; goTo(+sl.value); };
    goTo(0);
  }
  // checks for the whole panel (both sides), and the 3D view
  const P=checkPanel(panelFiles);
  if(tview==='3d'){ host.innerHTML='<div class="v3d"></div><p class="note">The panel after all its files, interior face up. Drag to turn, scroll or pinch to zoom. Brown = ½″ OSB, white = foam.</p>'; view3d=panel3D(host.querySelector('.v3d'), P); }
  const nPieces=P.pieces.length;
  el.querySelector('#tapChecks').innerHTML=`<div class="checks">
    <div><b>${P.throughArea.toFixed(0)} sq in</b><span>right through</span></div><div><b>${P.pocketArea.toFixed(0)} sq in</b><span>part-way</span></div><div><b>${nPieces}</b><span>loose piece${nPieces===1?'':'s'}</span></div></div>
    ${P.warn.length?`<ul class="cnc-w">${P.warn.map(w=>`<li>⚠ ${esc(w)}</li>`).join('')}</ul>`:''}
    ${P.ok.length?`<ul class="ok-l">${P.ok.map(w=>`<li>✓ ${esc(w)}</li>`).join('')}</ul>`:''}
    ${nPieces?`<details class="help"><summary>Loose pieces</summary><ul class="note">${P.pieces.map(p=>`<li>${p.area.toFixed(0)} sq in · ${fin(p.box[1]-p.box[0])} × ${fin(p.box[3]-p.box[2])} at ${fin(p.box[0])}, ${fin(p.box[2])}</li>`).join('')}</ul></details>`:''}`;
}
function renderCncSheet(el){
  const cp=cutPlan(), S=cp.S, runs=cp.runs, tapHTML=tapSection();
  if(pick>=runs.length) pick=0;
  const panels=new Set(runs.map(r=>r.p.code)).size, twoSided=runs.filter(r=>r.pass==='B').length, flips=runs.filter(r=>/^FLIP, then/.test(r.after)).length;
  const nWarn=runs.filter(r=>r.warn.length).length;
  let rows='';
  let lastWall=null;
  runs.forEach((r,i)=>{
    if(r.slot.id!==lastWall){ rows+=`<tr class="grp"><td colspan="7">${esc(r.slot.label)} · ${esc(r.slot.detail)} · ${esc(r.plan.w.id)} · ${r.plan.assembly==='int'?'interior':'exterior'} side up for assembly</td></tr>`; lastWall=r.slot.id; }
    rows+=`<tr class="${i===pick?'on':''}" data-i="${i}"><td>${String(r.seq).padStart(3,'0')}</td><td><b>${esc(r.p.code)}</b>${r.passes>1?` · pass ${r.pass}`:''}</td><td>${esc(r.faceName)} up</td><td>${r.trimmed?`trim to ${fin(r.width)}`:''}</td><td>${r.after.startsWith('FLIP')?`<b class="flipflag">${esc(r.after)}</b>`:esc(r.after)}</td><td>${r.pass===(r.passes>1?'B':'A')?r.p.stack+(r.p.stack===1?' (top)':''):''}</td><td>${r.warn.length?`<span class="flipflag">⚠ ${r.warn.length}</span>`:''}</td></tr>`;
  });
  const r=runs[pick];
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Shop sheet · Cubit Home</div><h3>${esc(cp.home)} — CNC cut files</h3></div>
      <div class="meta">${TP.files.length} .tap files · ${new Set(TP.files.map(f=>f.panel)).size} panels on the CNC · ${TP.blank.length} with no CNC work<br>${new Date().toISOString().slice(0,10)}</div></div>
    ${tapHTML}
    <details class="cnc-old" style="margin-top:22px"><summary>DXF files for VCarve (older route)</summary>
    <div class="cnc-warn"><b>Not for cutting yet.</b> These DXF files follow conventions that still have to be confirmed with the shop: which corner is zero, which way the panel lies, how a panel is flipped and lined up again, box sizes and depths. Check one panel against VCarve before using any of them.</div>
    <div class="sheet-tools"><button class="btn" id="cncZip">Download cut files (DXF zip)</button><button class="btn ghost" id="cncCsv">Manifest (CSV)</button>
      <span style="font-size:12.5px;color:#333">Files are numbered in cut order. Within each wall the last panel needed is cut first, so the pile comes off the machine in stacking order.</span></div>
    ${nWarn?`<p class="note" style="color:#b4520f;font-weight:600">${nWarn} file${nWarn>1?'s':''} flagged ⚠: open them below to see why.</p>`:''}
    <div class="cnc-grid">
      <div class="tblwrap cnc-list"><table class="boxes"><thead><tr><th>#</th><th>Panel</th><th>Face up</th><th>Trim</th><th>After</th><th>Stack</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="cnc-prev">
        <div class="eyebrow" style="color:#555">${esc(r.file)} · ${esc(r.slot.label)} · ${esc(r.faceName)} up</div>
        <div class="elev">${previewSVG(r)}</div>
        ${r.warn.length?`<ul class="cnc-w">${r.warn.map(w=>`<li>⚠ ${esc(w)}</li>`).join('')}</ul>`:'<p class="note">No flags on this pass.</p>'}
        <table class="boxes"><thead><tr><th>Layer</th><th>Count</th><th>What it is</th></tr></thead><tbody>
          ${Object.entries(LAYERS).filter(([k])=>r.items.some(i=>i.layer===k)).map(([k,v])=>`<tr><td><span class="sw" style="background:${COL[k]}"></span>${k}</td><td>${r.items.filter(i=>i.layer===k).length}</td><td>${esc(v.what)}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>
    <details class="cnc-set edit-only"><summary>Settings (saved in this browser)</summary>
      <div class="cnc-fields">
        <label class="fld">Overcut past an edge (in)<input type="number" step="0.0625" id="cOver" value="${S.overcut}"></label>
        <label class="fld">Smallest bit (in)<input type="number" step="0.0625" id="cTool" value="${S.minTool}"></label>
        <label class="fld">Flag boxes nearer a panel edge than (in)<input type="number" step="0.125" id="cEdge" value="${S.edgeClear}"></label>
        <label class="fld">Flag strips narrower than (in)<input type="number" step="0.125" id="cStrip" value="${S.thinStrip}"></label>
        <label class="fld">Outlet / switch box W × H (in)<input id="cBox" value="${S.boxes.outlet.w} x ${S.boxes.outlet.h}"></label>
        <label class="fld">Light box W × H (in)<input id="cLight" value="${S.boxes.light.w} x ${S.boxes.light.h}"></label>
      </div>
      <div class="row"><button class="btn ghost" id="cSave">Save settings</button></div>
    </details></details>`;
  el.querySelectorAll('tr[data-i]').forEach(tr=>tr.onclick=()=>{ pick=+tr.dataset.i; renderCncSheet(el); });
  el.querySelectorAll('tr[data-t]').forEach(tr=>tr.onclick=()=>{ tpick=+tr.dataset.t; renderCncSheet(el); });
  el.querySelectorAll('[data-dl]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const [k,a,c]=b.dataset.dl.split(':');
    const pick = k==='home' ? null : k==='pod' ? {pod:+a} : k==='wall' ? {pod:+a, letter:c} : {panel:a};
    const label = k==='home' ? 'ShopSabre tap files' : k==='pod' ? `Pod ${+a+1} tap files` : k==='wall' ? `Pod ${+a+1} Wall ${c} tap files` : `Panel ${a} tap files`;
    downloadBlob(tapZip(TP, pick), `${fname(label)}.zip`); });
  el.querySelectorAll('[data-tv]').forEach(b=>b.onclick=()=>{ tview=b.dataset.tv; el.querySelectorAll('[data-tv]').forEach(x=>x.setAttribute('aria-pressed', x===b)); mountTapView(el); });
  mountTapView(el);
  const name=MODELS[state.model].name.replace(/[^\w .+-]+/g,'').trim();
  el.querySelector('#cncZip').onclick=()=>downloadBlob(cutFilesZip(cp), `${name} - CNC cut files.zip`);
  el.querySelector('#cncCsv').onclick=()=>downloadBlob(new Blob([manifestCSV(cp)],{type:'text/csv'}), `${name} - CNC manifest.csv`);
  el.querySelector('#cSave').onclick=()=>{
    const num=id=>parseFloat(el.querySelector(id).value), wh=id=>{ const m=el.querySelector(id).value.match(/([\d.]+)\s*[x×]\s*([\d.]+)/i); return m?{w:+m[1],h:+m[2]}:null; };
    const b=wh('#cBox'), l=wh('#cLight');
    const n={ overcut:num('#cOver'), minTool:num('#cTool'), edgeClear:num('#cEdge'), thinStrip:num('#cStrip'), boxes:{...S.boxes, ...(b?{outlet:b, switch:b, other:b}:{}), ...(l?{light:l}:{})} };
    if([n.overcut,n.minTool,n.edgeClear,n.thinStrip].some(v=>!(v>=0))) return;
    saveCncSettings(n); renderCncSheet(el);
  };
}
export { renderCncSheet };
