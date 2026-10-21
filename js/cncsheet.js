/* Cubit Builder — cncsheet.js : the "CNC cut files" sheet. Lists every pass in cut order, previews each
   one in machine coordinates, flags anything that needs a look, and downloads the DXF batch. */
import { MODELS } from './data.js';
import { fin } from './format.js';
import { cutPlan, cutFilesZip, manifestCSV, cncSettings, saveCncSettings, LAYERS } from './cnc.js';
import { downloadBlob } from './sheets.js';
import { state } from './state.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const COL = { SHEET_REF:'#9aa09a', PANEL_REF:'#56605a', TRIM_CUT:'#c0392b', OPENING_THRU:'#2f6db5', VENT_THRU:'#16a0a0', BOX_POCKET:'#2f8a57', SPINE_NOTCH:'#7a3fb0' };
let pick = 0;

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

function renderCncSheet(el){
  const cp=cutPlan(), S=cp.S, runs=cp.runs;
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
      <div class="meta">${runs.length} files · ${panels} panels · ${twoSided} two-sided · ${flips} flipped for stacking<br>${new Date().toISOString().slice(0,10)}</div></div>
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
    <details class="cnc-set"><summary>Settings (saved in this browser)</summary>
      <div class="cnc-fields">
        <label class="fld">Overcut past an edge (in)<input type="number" step="0.0625" id="cOver" value="${S.overcut}"></label>
        <label class="fld">Smallest bit (in)<input type="number" step="0.0625" id="cTool" value="${S.minTool}"></label>
        <label class="fld">Flag boxes nearer a panel edge than (in)<input type="number" step="0.125" id="cEdge" value="${S.edgeClear}"></label>
        <label class="fld">Flag strips narrower than (in)<input type="number" step="0.125" id="cStrip" value="${S.thinStrip}"></label>
        <label class="fld">Outlet / switch box W × H (in)<input id="cBox" value="${S.boxes.outlet.w} x ${S.boxes.outlet.h}"></label>
        <label class="fld">Light box W × H (in)<input id="cLight" value="${S.boxes.light.w} x ${S.boxes.light.h}"></label>
      </div>
      <div class="row"><button class="btn ghost" id="cSave">Save settings</button></div>
    </details>`;
  el.querySelectorAll('tr[data-i]').forEach(tr=>tr.onclick=()=>{ pick=+tr.dataset.i; renderCncSheet(el); });
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
