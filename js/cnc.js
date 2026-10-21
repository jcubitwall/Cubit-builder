/* Cubit Builder — cnc.js : the CNC cut plan for every SIP panel of a home, and DXF files for VCarve.

   This is step 1 towards direct G-code. It works out every cut on every panel, for every pass on the
   machine, in machine coordinates, in the order the panels must be cut so each wall's pile comes off the
   machine in stacking order. The same plan will drive the G-code later; for now it writes one DXF per pass
   with a strict layer per operation, a manifest (CSV) and a read-me, zipped.

   CONVENTIONS (all inches) — to be confirmed with the shop, see SETTINGS:
     · One 48″ × 96″ SIP blank per panel. On the table the 96″ (wall height) runs along X and the 48″ along Y.
     · X = 0 at the BOTTOM of the wall, Y = 0 at the front fence, Z = 0 top of the panel (Z is not in the DXF).
     · The drawing is the panel seen from the face that is UP on the machine (a true view, never mirrored).
     · Pass A is cut first. A two-sided panel is flipped end over end about its long (X) axis, keeping the
       bottom of the wall at X = 0, and pass B is cut with the other face up.
     · A panel that is cut to width is trimmed in pass A; its factory edge stays on the joint side.
       In every later pass the panel lies against the front fence (Y = 0).
     · Cut order: within a wall, the LAST panel needed is cut first, so the pile comes off with the first
       panel needed on top. Walls follow the home's wall order (pod 1 wall A, B, C, D, then pod 2 …).
*/
import { H, PW } from './config.js';
import { MODELS } from './data.js';
import { panelSpans, wallLen } from './panels.js';
import { homePlans, faceShort } from './labels.js';
import { state } from './state.js';
import { fin } from './format.js';

const DEFAULTS = {
  blank: { w: PW, h: H },
  overcut: 0.375,            // through cuts that run off a panel edge go this far past it
  minTool: 0.25,             // smallest bit diameter in use; features narrower than this + 1/16″ are flagged
  edgeClear: 1.5,            // boxes closer than this to a panel edge are flagged (joint / spline zone)
  thinStrip: 1.0,            // a strip narrower than this left between a cut-out and a panel edge is flagged
  boxes: { outlet:{w:2.5,h:4}, switch:{w:2.5,h:4}, light:{w:3,h:5}, other:{w:2.5,h:4} },
  wallOrder: 'pod'           // pod 1 A–D, pod 2 A–D, …
};
const KEY='cubit-cnc';
function cncSettings(){ try{ return {...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)||'{}')}; }catch(e){ return {...DEFAULTS}; } }
function saveCncSettings(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }

/* layer per operation; `cut` false = reference only */
const LAYERS = {
  SHEET_REF:      { color: 8, cut:false, what:'Blank outline (reference only, do not cut)' },
  PANEL_REF:      { color: 9, cut:false, what:'Finished panel outline (reference only)' },
  TRIM_CUT:       { color: 1, cut:true,  what:'Cut the panel to width: full-depth through cut in one pass (long bit) along this line, waste on the side away from the panel' },
  OPENING_THRU:   { color: 5, cut:true,  what:'Window / door / cased opening: full-depth through cut in one pass (long bit), tool inside the line' },
  VENT_THRU:      { color: 4, cut:true,  what:'Vent: full-depth through cut in one pass (long bit), tool inside the line' },
  BOX_POCKET:     { color: 3, cut:true,  what:'Electrical box cut-out on the face that is up (depth to confirm)' },
  SPINE_NOTCH:    { color: 6, cut:true,  what:'Steel spine notch at the pod corner, on the outer face of a long wall, full height (method and depth to confirm)' },
};

/* ---------------------------------------------------------------- one pass of one panel */
function passGeom(plan, p, face, trimmedAlready, S){
  const w=plan.w, L=wallLen(w), [x0,x1]=panelSpans(w)[p.k], width=p.width, W=S.blank.w;
  const isFirst = !trimmedAlready;
  // u: 0..width across the panel, measured from the left as seen from the face that is up
  const toU = x => face==='ext' ? x-x0 : x1-x;
  const blankW = (p.cut && isFirst) ? W : width;
  // the waste side of a trimmed panel is the wall end (x0). Seen from outside that is the left, from inside the right.
  const off = (p.cut && isFirst && face==='ext') ? W-width : 0;
  const U = u => u+off;
  // machine coords: X along the wall height, Y across (Y = blankW − U keeps it a true, unmirrored view)
  const XY = (u,v) => [v, blankW-U(u)];
  const items=[], warn=[];
  const rect = (layer, u0,u1,v0,v1, meta={}) => {
    const a=XY(u0,v0), b=XY(u1,v1);
    items.push({ layer, kind:'rect', x0:Math.min(a[0],b[0]), x1:Math.max(a[0],b[0]), y0:Math.min(a[1],b[1]), y1:Math.max(a[1],b[1]), ...meta });
  };
  items.push({ layer:'SHEET_REF', kind:'rect', x0:0, x1:S.blank.h, y0:0, y1:blankW });
  rect('PANEL_REF', 0, width, 0, H);
  if(p.cut && isFirst){
    const uc = face==='ext' ? 0 : width;    // the wall-end edge
    const [X0]=XY(uc,0), Yc=blankW-U(uc);
    items.push({ layer:'TRIM_CUT', kind:'line', x0:-S.overcut, y0:Yc, x1:S.blank.h+S.overcut, y1:Yc, waste: face==='ext' ? 'Y above the line' : 'Y below the line' });
  }
  // through cuts: the shop's long bits cut the full panel depth in one pass from whichever face is up,
  // so trims, openings and vents all go in the first pass and never force a flip
  if(isFirst){
    p.through.forEach(o=>{
      let u0=Math.min(toU(o.x),toU(o.x+o.w)), u1=Math.max(toU(o.x),toU(o.x+o.w)), v0=o.y, v1=Math.min(H,o.y+o.h);
      const open=[];
      if(u0<=0.01){ u0=-S.overcut; open.push('left'); } if(u1>=width-0.01){ u1=width+S.overcut; open.push('right'); }
      if(v0<=0.01){ v0=-S.overcut; open.push('bottom'); } if(v1>=H-0.01){ v1=H+S.overcut; open.push('top'); }
      const layer = o.kind==='vent' ? 'VENT_THRU' : 'OPENING_THRU';
      rect(layer, u0,u1,v0,v1, { open, what:o.kind, size:`${fin(o.w)} × ${fin(o.h)}` });
      // thin strips left next to a panel edge
      if(!open.includes('left') && u0 < S.thinStrip) warn.push(`${o.kind} leaves only ${fin(u0)} to the panel edge`);
      if(!open.includes('right') && width-u1 < S.thinStrip) warn.push(`${o.kind} leaves only ${fin(width-u1)} to the panel edge`);
      if(Math.min(u1-u0, v1-v0) < S.minTool+0.0625) warn.push(`${o.kind} part on this panel is narrower than the bit`);
    });
  }
  // boxes on the face that is up
  const boxes = face==='int' ? p.intCuts.map(b=>({...b, xe:L-b.x})) : p.extCuts.map(b=>({...b, xe:b.x}));
  boxes.forEach(b=>{
    const sz=S.boxes[b.kind]||S.boxes.other, u=toU(b.xe);
    rect('BOX_POCKET', u-sz.w/2, u+sz.w/2, b.y-sz.h/2, b.y+sz.h/2, { what:b.kind, size:`${fin(sz.w)} × ${fin(sz.h)}` });
    if(u-sz.w/2 < S.edgeClear || width-(u+sz.w/2) < S.edgeClear) warn.push(`${b.kind} box is within ${fin(S.edgeClear)} of a panel edge`);
    if(p.through.some(o=>{ const ou0=Math.min(toU(o.x),toU(o.x+o.w)), ou1=Math.max(toU(o.x),toU(o.x+o.w)); return u+sz.w/2>ou0 && u-sz.w/2<ou1 && b.y+sz.h/2>o.y && b.y-sz.h/2<o.y+o.h; })) warn.push(`${b.kind} box overlaps an opening`);
  });
  // steel spine notch: exterior face, at a pod-corner end of a long wall
  const [nl,nr]=w.notch||[0,0];
  const atLeft = nl && p.k===0, atRight = nr && x1>=L-0.01;
  if(atLeft||atRight){
    if(face==='ext'){
      if(atLeft)  rect('SPINE_NOTCH', toU(0)-S.overcut, toU(nl), -S.overcut, H+S.overcut, { what:'spine notch', size:`${fin(nl)} × ${fin(nl)} deep` });
      if(atRight){ const a=toU(L-nr), b=toU(L); rect('SPINE_NOTCH', Math.min(a,b), Math.max(a,b)+S.overcut, -S.overcut, H+S.overcut, { what:'spine notch', size:`${fin(nr)} × ${fin(nr)} deep` }); }
    }
  }
  // everything that cuts must be on the blank, unless it is meant to run off an edge
  items.filter(it=>LAYERS[it.layer].cut && it.kind==='rect').forEach(it=>{
    const e=0.01, offX = it.x0 < -e || it.x1 > S.blank.h+e, offY = it.y0 < -e || it.y1 > blankW+e;
    if((offX||offY) && !(it.open&&it.open.length) && it.layer!=='SPINE_NOTCH') warn.push(`${it.what||it.layer} runs off the blank`);
  });
  return { face, items, warn, blankW, width, trimmed: p.cut && isFirst };
}

/* ---------------------------------------------------------------- the whole home, in cut order */
function cutPlan(){
  const S=cncSettings(), plans=homePlans(), m=MODELS[state.model];
  const runs=[]; let seq=0;
  plans.forEach(plan=>{
    const slot=plan.slot, wallWarn=[];
    // cut the bottom of the pile first: reverse of the stacking order
    plan.seq.slice().reverse().forEach(p=>{
      const passes = p.cnc==='both' ? [plan.assembly==='int'?'ext':'int', plan.assembly] : [p.cnc];
      passes.forEach((face,j)=>{
        const g=passGeom(plan, p, face, j>0, S);
        seq++;
        const passName = passes.length>1 ? (j===0?'A':'B') : 'A';
        const afterFlip = j===passes.length-1 ? (face===plan.assembly ? 'stack as cut' : 'FLIP, then stack') : 'FLIP end over end, then cut pass B';
        runs.push({ seq, slot, plan, p, pass:passName, passes:passes.length, face, faceName:faceShort(slot,face), after:afterFlip,
          file:`${String(seq).padStart(3,'0')}_${p.code}_${passName}${passes.length>1?'':''}.dxf`, ...g });
      });
    });
  });
  return { S, runs, home:m.name, model:state.model };
}

/* ---------------------------------------------------------------- DXF (R12, inches) */
function dxf(run){
  const L=[]; const add=(...a)=>a.forEach(v=>L.push(String(v)));
  const used=[...new Set(run.items.map(i=>i.layer))];
  add(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1009',9,'$INSUNITS',70,1,9,'$EXTMIN',10,0,20,0,9,'$EXTMAX',10,run.items.reduce((a,i)=>Math.max(a,i.x1),0),20,run.blankW,0,'ENDSEC');
  add(0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,used.length);
  used.forEach(n=>add(0,'LAYER',2,n,70,0,62,LAYERS[n].color,6,'CONTINUOUS'));
  add(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  const f=v=>(+v).toFixed(4);
  run.items.forEach(it=>{
    if(it.kind==='line'){ add(0,'LINE',8,it.layer,10,f(it.x0),20,f(it.y0),30,0,11,f(it.x1),21,f(it.y1),31,0); return; }
    add(0,'POLYLINE',8,it.layer,66,1,70,1,10,0,20,0,30,0);
    [[it.x0,it.y0],[it.x1,it.y0],[it.x1,it.y1],[it.x0,it.y1]].forEach(([x,y])=>add(0,'VERTEX',8,it.layer,10,f(x),20,f(y),30,0));
    add(0,'SEQEND',8,it.layer);
  });
  add(0,'ENDSEC',0,'EOF');
  return L.join('\r\n')+'\r\n';
}

/* ---------------------------------------------------------------- manifest + read-me */
const csvCell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
function manifestCSV(cp){
  const rows=[['cut_order','file','panel','wall','wall_detail','pass','face_up','after_this_pass','stack_position_top_is_1','panel_width_in','trimmed_this_pass','openings','boxes','spine_notch','warnings']];
  cp.runs.forEach(r=>{
    const c=l=>r.items.filter(i=>i.layer===l).length;
    rows.push([r.seq, r.file, r.p.code, r.slot.label, r.slot.detail, `${r.pass} of ${r.passes}`, r.faceName, r.after, r.p.stack, (+r.width.toFixed(4)), r.trimmed?'yes':'', c('OPENING_THRU')+c('VENT_THRU'), c('BOX_POCKET'), c('SPINE_NOTCH')?'yes':'', r.warn.join(' | ')]);
  });
  return rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
function readme(cp){
  const S=cp.S;
  return [
`CUBIT BUILDER - CNC CUT FILES (DXF)`,
`Home: ${cp.home}`,
`Made: ${new Date().toISOString().slice(0,16).replace('T',' ')}   Files: ${cp.runs.length}   Panels: ${new Set(cp.runs.map(r=>r.p.code)).size}`,
``,
`CUT IN FILE ORDER (001, 002, ...). Within each wall the last panel needed is cut first,`,
`so the pile comes off the machine with the first panel needed on top. Walls follow the home's`,
`wall order: pod 1 wall A, B, C, D, then pod 2, and so on. manifest.csv lists every file.`,
``,
`UNITS: inches. One 48" x 96" blank per panel.`,
`X = along the wall height, 0 at the BOTTOM of the wall.  Y = across the panel, 0 at the front fence.`,
`Each drawing is the panel seen from the face that is UP on the machine (true view, not mirrored).`,
``,
`PASSES: "_A" is cut first. "_B" exists only for two-sided panels: flip the panel end over end about`,
`its long (X) axis, keep the bottom of the wall at X = 0, push it to the front fence, then cut "_B".`,
`A panel cut to width is trimmed in pass A; after that it lies against the front fence.`,
``,
`LAYERS:`,
...Object.entries(LAYERS).map(([k,v])=>`  ${k.padEnd(14)} ${v.what}`),
``,
`Through cuts that run off a panel edge go ${fin(S.overcut)} past it on purpose.`,
`Box size: outlet/switch ${fin(S.boxes.outlet.w)} x ${fin(S.boxes.outlet.h)}, light ${fin(S.boxes.light.w)} x ${fin(S.boxes.light.h)} (to confirm).`,
``,
`CHECK BEFORE CUTTING: these conventions (zero corner, which way the panel lies, the flip, box sizes,`,
`depths) are still to be confirmed with the shop. Do not run these files until they are.`,
  ].join('\r\n')+'\r\n';
}

/* ---------------------------------------------------------------- zip (store, no compression) */
const CRC = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
const crc32 = b => { let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=CRC[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
function zip(files){   // files: [{name, text}]
  const enc=new TextEncoder(), parts=[], central=[]; let off=0;
  const d=new Date(), dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1)), dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate());
  files.forEach(f=>{
    const name=enc.encode(f.name), data=enc.encode(f.text), crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true); h.setUint16(10,dt,true); h.setUint16(12,dd,true);
    h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,name.length,true); h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true); c.setUint16(12,dt,true); c.setUint16(14,dd,true);
    c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,name.length,true); c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30+name.length+data.length;
  });
  const csize=central.reduce((a,b)=>a+b.length,0);
  const e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,csize,true); e.setUint32(16,off,true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type:'application/zip'});
}
function cutFilesZip(cp=cutPlan()){
  const files=[{name:'README.txt', text:readme(cp)}, {name:'manifest.csv', text:manifestCSV(cp)}, ...cp.runs.map(r=>({name:'dxf/'+r.file, text:dxf(r)}))];
  return zip(files);
}

export { cutPlan, passGeom, dxf, manifestCSV, readme, zip, crc32, cutFilesZip, cncSettings, saveCncSettings, LAYERS, DEFAULTS };
