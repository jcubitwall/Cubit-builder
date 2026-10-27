/* Cubit Builder — casework.js : the cabinet & furniture library engine.

   Cabinets are built the way Cubit has built them for years in Mozaik (read from Brad's test kitchen, see
   docs/mozaik-cabinet-rules.md): frameless, full overlay, ONE sheet material (16 mm PET, measured thickness),
   and DADO construction:
     · bottoms, tops, fixed shelves and stretchers sit in ½″-bit dados in the ends, 0.26″ deep; a panel goes
       0.25″ into each dado. Dados stop 1¼″ short of the front so nothing shows; the panel's corners are notched
       to pass the stop (and ¼″ more, the bit's round end).
     · the back is a full 16 mm panel in its own dado 3 mm in from the back edge of the ends, and in a groove in
       the bottom; it runs to the top of the ends.
     · shelf pins Ø5 × 10 mm, 32 mm apart: a row 37 mm from the front and a row 64 mm from the back, 7 holes per
       adjustable shelf centred on where the shelf sits.
     · hinge plates: two 0.8 mm marks 32 mm apart on the ends; hinge cups Ø35 and two Ø8 dowel holes on the doors.
     · drawer runner holes on the ends.
   Every part carries its exact machining (part.cnc): its outline with notches, every dado, groove and hole, which
   face is up and in which program (side A = the last program, with the cut-throughs; side B = first, only if a part
   needs machining on its other face). The library draws and dimensions all of it before any G-code is made.
   Cut sizes are Mozaik's sizes (the edge band is allowed for in the reveals); a setting can take the band off instead.

   Units: inches inside. Items: { k, w, h, d, y, opt } (w/h/d finished overall, y = height off the floor).
   An item's own coordinates: x 0→w left to right seen from the front, y up, z 0 at the back → d at the front. */

const MM = 1/25.4;
const r16 = v => Math.round(v*16)/16;
const r4 = v => Math.round(v*10000)/10000;

/* ---------------------------------------------------------------- shop settings (shared by the team) */
const SETTINGS_V = 2;              // 2 = Mozaik rules (older saved settings were the mortise-and-tenon ones)
const DEFAULTS = {
  v:SETTINGS_V,
  units:'in',
  mat:{ name:'PET Matt White 16 mm', t:0.600, sheet:[48,96] },        // t: what the sheets measure (Mozaik uses 0.600″); measured again before every G-code
  band:{ t:1*MM, w:22*MM, name:'PVC edge band 1 mm', deduct:false },  // deduct: take the band off the cut sizes (Mozaik's sizes already allow for it)
  dado:{ depth:0.26, engage:0.25, fit:0.01, stop:1.25, clear:0.25, bit:0.5 },
  back:{ inset:0.116 },                                               // back dado in from the back edge of the ends (3 mm)
  kick:{ h:4, set:3, rearW:0.5, rearBelow:0.25 },                     // toe kick; small notch at the back-bottom of the ends
  stretcher:{ w:4 },
  shelf:{ side:1/16, back:1/8, group:7 },
  fronts:{ side:1/16, gap:1/8, pairOver:21,          // a door wider than pairOver becomes a pair
    base:{ below:1/8, top:3/8 },        // base doors / drawer fronts: from 1/8 below the bottom to 3/8 under the top of the box
    upper:{ below:5/8, top:1/4 },       // uppers: 5/8 below the box (finger pull), 1/4 under the top
    tall:{ below:0, top:1/4 } },
  pins:{ dia:5*MM, depth:10*MM, pitch:32*MM, front:37*MM, back:64*MM },
  mark:{ dia:5*MM, depth:0.8*MM },
  hinge:'blum',
  hinges:{
    blum:{ name:'Blum CLIP top BLUMOTION 110°, press-in', cup:35*MM, depth:0.41, edge:23.5*MM, dowel:8*MM, dowelApart:45*MM, dowelBack:9.5*MM, bottom:3.511, top:3.26, plateX:1.40, plateApart:32*MM },
    dtc: { name:'DTC soft-close 110°, press-in', cup:35*MM, depth:0.41, edge:23.5*MM, dowel:8*MM, dowelApart:45*MM, dowelBack:9.5*MM, bottom:3.511, top:3.26, plateX:1.40, plateApart:32*MM } },
  runner:'blum-tandem',
  runners:{
    'blum-tandem':{ name:'Blum TANDEM 563H, full extension, soft close', clear:10*MM, lens:[12,15,18,21], front:[8,34,65], rear:[293,274,242], holeDepth:13*MM, rowAbove:0.35, boxPlus:0.25 },
    'dtc-under':  { name:'DTC soft-close undermount', clear:10*MM, lens:[12,14,16,18,20,22], front:[8,34,65], rear:[293,274,242], holeDepth:13*MM, rowAbove:0.35, boxPlus:0.25 } },
  drawer:{ groove:0.5, grooveDepth:0.25, dadoIn:0.345, dadoW:0.255, dadoDepth:0.385, tongue:0.25, topDrop:0.125, sides:[3.5,4.75,6.75,8.75,10.75] },
  handle:'later',
  handles:[
    { id:'bar128', name:'Bar pull, 128 mm c-c', cc:128*MM, dia:5*MM },
    { id:'bar160', name:'Bar pull, 160 mm c-c', cc:160*MM, dia:5*MM },
    { id:'bar96',  name:'Bar pull, 96 mm c-c',  cc:96*MM,  dia:5*MM },
    { id:'knob',   name:'Knob, one hole',       cc:0,      dia:5*MM } ],
  pullAt:{ edge:2, end:3 },                                          // door handle: in from the opening edge, from the end
  screw:{ name:'Confirmat / #8 screws through the ends', every:8 },
  rod:{ name:'Oval closet rod 1″ with end flanges' },
  counter:{ name:'Quartz', t:1.25, over:1 },
};
const KEY='cubit-casework-settings';
let S = clone(DEFAULTS), remote=false;
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function merge(base, over){ for(const k in over){ if(over[k] && typeof over[k]==='object' && !Array.isArray(over[k]) && base[k] && typeof base[k]==='object') merge(base[k], over[k]); else base[k]=over[k]; } return base; }
/* settings saved before the Mozaik rules are dropped (only the units are kept) */
const upgrade = o => (o && o.v===SETTINGS_V) ? o : { units:o?.units||'in' };
async function loadSettings(){
  try{ const r=await fetch('api/casework',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ S=merge(clone(DEFAULTS), upgrade(await r.json())); remote=true; return S; } }catch(e){}
  try{ S=merge(clone(DEFAULTS), upgrade(JSON.parse(localStorage.getItem(KEY)||'{}'))); }catch(e){}
  return S;
}
async function saveSettings(next){
  S=merge(clone(DEFAULTS), {...next, v:SETTINGS_V});
  if(remote){ const r=await fetch('api/casework',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({settings:S})}); const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); }
  else { try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
  return S;
}
const settings = () => S;
const T_ = () => S.mat.t;
const th = () => S.mat.t;                 // one material: every part is the sheet thickness
const nomOf = () => S.mat.name;
const hingeSpec = () => S.hinges[S.hinge] || Object.values(S.hinges)[0];
const runnerSpec = () => S.runners[S.runner] || Object.values(S.runners)[0];
const handleById = id => (S.handles||[]).find(h=>h.id===id);

/* ---------------------------------------------------------------- display */
function fmt(v, units=S.units){
  if(units==='mm') return `${Math.round(v/MM*10)/10}`;
  const neg=v<0; v=Math.abs(v); let w=Math.floor(v+1e-9), f=Math.round((v-w)*16);
  if(f===16){ w++; f=0; }
  let s = f ? (()=>{ let n=f, d=16; while(n%2===0){ n/=2; d/=2; } return `${w?w+' ':''}${n}/${d}`; })() : `${w}`;
  return (neg?'-':'')+s;
}
const fmtU = (v,u=S.units) => fmt(v,u)+(u==='mm'?' mm':'″');
/* exact, for machining (3 decimals in inches, 0.1 mm) */
const fx3 = (v,u=S.units) => u==='mm' ? `${Math.round(v/MM*10)/10} mm` : `${(Math.round(v*1000)/1000).toFixed(3)}″`;

/* ---------------------------------------------------------------- parts */
/* part(name, role, matRole|label, box[x,y,z,sx,sy,sz], thickness axis 'x'|'y'|'z', opts)
   opts.cnc = the part as it's cut: { U, V, u:[edge at u=0, edge at u=U], v:[edge at v=0, edge at v=V], up:'face that is up',
     outline:[[u,v]…] (with notches), ops:[ {k:'dado'|'groove'|'rabbet'|'slot', u0,u1,v0,v1, depth, tool, side, what},
     {k:'hole'|'cup'|'mark', u,v, d, depth, side, what} ] } — u,v in inches on the part, side 'A' (last program) | 'B' (first) */
function part(name, role, mat, box, axis, o={}){
  const [x,y,z,sx,sy,sz]=box, T={x:sx,y:sy,z:sz}[axis];
  const faces = axis==='x' ? [sy,sz] : axis==='y' ? [sx,sz] : [sy,sx];
  let L=Math.max(...faces), W=Math.min(...faces);
  if(o.cnc){ L=Math.max(o.cnc.U,o.cnc.V); W=Math.min(o.cnc.U,o.cnc.V); }
  return { name, role, mat, T, L, W, box, axis, ex:o.ex||[0,0,0], band:o.band||{long:0,short:0}, ops:o.ops||[], hw:!!o.hw, qty:1, tenonGeo:[], note:o.note||'', cnc:o.cnc||null, notch:o.notch||null, hole:o.hole||null };
}
/* a rectangle outline, and one with notched corners: n = { fl, fr, bl, br } = [length along v, depth along u] */
const rectO = (U,V) => [[0,0],[U,0],[U,V],[0,V]];
/* a panel that sits in dados along both u-ends (u=0 and u=U): corners notched where the dados stop.
   front notch (v from 0) and back notch (v from V), each `len` long and `e` deep */
function notchedO(U,V,e,front,back){
  const P=[];
  if(front){ P.push([e,0],[U-e,0],[U-e,front],[U,front]); } else P.push([0,0],[U,0]);
  if(back){ P.push([U,V-back],[U-e,V-back],[U-e,V],[e,V],[e,V-back],[0,V-back]); } else P.push([U,V],[0,V]);
  if(front) P.push([0,front],[e,front]);
  return P;
}
function finishPart(p){
  const bt = S.band.deduct ? S.band.t : 0;
  p.cutL = r4(p.L - p.band.short*bt);
  p.cutW = r4(p.W - p.band.long*bt);
  p.bandLen = p.band.long*p.L + p.band.short*p.W;
  if(p.cnc && !p.ops.length) p.ops = opsText(p);
  return p;
}
/* plain words for a part's machining (the list under each part; the drawing shows the same with dimensions) */
function opsText(p){
  const c=p.cnc, out=[], by=new Map();
  c.ops.forEach(o=>{ const k=`${o.side}|${o.what}`; by.set(k,[...(by.get(k)||[]),o]); });
  by.forEach((os,k)=>{ const o=os[0], side=o.side==='B'?' (side B, cut first)':'';
    if(o.k==='hole'||o.k==='cup'||o.k==='mark') out.push(`${os.length}× ${o.what}: Ø${Math.round(o.d/MM*10)/10} mm × ${fx3(o.depth)} deep${side}`);
    else out.push(`${o.what}: ${o.tool} bit, ${fx3(Math.abs(o.u1-o.u0)<Math.abs(o.v1-o.v0)?o.u1-o.u0:o.v1-o.v0)} wide × ${fx3(o.depth)} deep${side}`); });
  if(c.outline.length>4) out.push(`Outline with ${(c.outline.length-4)/2|0} notch${c.outline.length>6?'es':''} (cut with the outline)`);
  return out;
}

/* ---------------------------------------------------------------- the carcass (Mozaik dado construction) */
/* c: { kick, top:'stretchers'|'full', adj:n, fixed:[underside heights], doors:false (no doors in front), parts:[partition x],
        hinges:[{side:'L'|'R', ys:[cup heights on the cabinet]}] (filled in by the fronts), runners:[{y,len}] } */
function carcass(it, c){
  const W=it.w, H=it.h, T=T_(), e=S.dado.engage, dd=S.dado.depth, dw=T+S.dado.fit, stop=S.dado.stop, cl=S.dado.clear, bi=S.back.inset;
  const D = it.d - (c.doors===false ? 0 : T);                         // box depth (fronts in front of it)
  const kh = c.kick ? (it.opt?.kick ?? S.kick.h) : 0, ks=S.kick.set;
  const zbF = D - bi - dw;                                            // the back dado's front face, from the front
  const yb = kh;                                                      // underside of the bottom
  const backY = yb + (T - dd) + 0.01;                                 // the back's lower edge (in the bottom's groove)
  const iw = W - 2*T, pw = iw + 2*e;                                  // inside width; a panel between the ends
  const P=[], endOps=[];
  const zOf = u => it.d - (c.doors===false?0:T) - u;                 // depth from the front → item z
  const dado = (what, u0,u1, v0,v1) => endOps.push({ k:'dado', u0:r4(u0), u1:r4(u1), v0:r4(v0), v1:r4(v1), depth:dd, tool:'½″', side:'A', what });
  // bottom: full depth, in dados in the ends, the back in a groove on its top face
  dado('Bottom dado', stop, D-cl, yb, yb+dw);
  const bn = (D-(D-cl))+cl;                                           // back notch: past the dado's end + the bit's round end
  P.push(part('Bottom','carcass','carcass',[T-e,yb,zOf(D),pw,T,D],'y',{ex:[0,-1,0],
    cnc:{ U:pw, V:D, u:['left end','right end'], v:['front','back'], up:'top face (inside)', outline:notchedO(pw,D,e,stop+cl,bn),
      ops:[{ k:'groove', u0:0, u1:pw, v0:r4(D-bi-dw), v1:r4(D-bi), depth:dd, tool:'½″', side:'A', what:'Back groove' }] } }));
  // top: full (uppers, talls) or two flat stretchers (bases)
  if(c.top==='stretchers'){
    const sw=S.stretcher.w;
    dado('Front stretcher dado', stop, sw+cl, H-dw, H);
    dado('Rear stretcher dado', zbF-cl-sw, zbF-cl, H-dw, H);
    P.push(part('Front stretcher','carcass','carcass',[T-e,H-T,zOf(sw),pw,T,sw],'y',{ex:[0,1,.4],
      cnc:{ U:pw, V:sw, u:['left end','right end'], v:['front','back'], up:'underside', outline:notchedO(pw,sw,e,stop+cl,0), ops:[] } }));
    P.push(part('Rear stretcher','carcass','carcass',[T-e,H-T,zOf(zbF-cl),pw,T,sw],'y',{ex:[0,1,-.4],
      cnc:{ U:pw, V:sw, u:['left end','right end'], v:['front','back'], up:'underside', outline:rectO(pw,sw), ops:[] } }));
  } else {
    dado('Top dado', stop, zbF-cl, H-dw, H);
    P.push(part('Top','carcass','carcass',[T-e,H-T,zOf(zbF),pw,T,zbF],'y',{ex:[0,1,0],
      cnc:{ U:pw, V:zbF, u:['left end','right end'], v:['front','back'], up:'underside (inside)', outline:notchedO(pw,zbF,e,stop+cl,2*cl), ops:[] } }));
  }
  // fixed shelves: same as a top, at their underside height
  (c.fixed||[]).forEach((fy,i,arr)=>{ dado(arr.length>1?`Fixed shelf ${i+1} dado`:'Fixed shelf dado', stop, zbF-cl, fy, fy+dw);
    P.push(part(arr.length>1?`Fixed shelf ${i+1}`:'Fixed shelf','shelf','carcass',[T-e,fy,zOf(zbF),pw,T,zbF],'y',{ex:[0,0,.5],
      cnc:{ U:pw, V:zbF, u:['left end','right end'], v:['front','back'], up:'top face', outline:notchedO(pw,zbF,e,stop+cl,2*cl), ops:[] } })); });
  // the back: in the ends' back dados and the bottom's groove, up to the top of the ends
  const bh = H - backY;
  endOps.push({ k:'dado', u0:r4(D-bi-dw), u1:r4(D-bi), v0: kh ? 0 : r4(backY), v1:H, depth:dd, tool:'½″', side:'A', what:'Back dado' });
  P.push(part('Back','back','carcass',[T-e,backY,bi,pw,bh,T],'z',{ex:[0,0,-1],
    cnc:{ U:pw, V:bh, u:['left end','right end'], v:['bottom','top'], up:'either face', outline:rectO(pw,bh), ops:[] } }));
  // toe kick board: between the ends (butt joint), set back
  if(kh) P.push(part('Toe kick','carcass','carcass',[T,0,zOf(ks+T),iw,kh,T],'z',{ex:[0,-.6,1],
    cnc:{ U:iw, V:kh, u:['left','right'], v:['bottom','top'], up:'either face', outline:rectO(iw,kh), ops:[] }, note:'Screwed between the ends, behind the toe notch' }));
  // partitions (benches): stand on the bottom, under the top, in dados in both
  (c.parts||[]).forEach((px,i)=>{ const v0=yb+T-e, v1=H-T+e, ph=v1-v0;
    const bot=P.find(p=>p.name==='Bottom'), top=P.find(p=>p.name==='Top');
    [bot,top].forEach(q=>q && q.cnc.ops.push({ k:'dado', u0:r4(px-T/2-(T-e)-S.dado.fit/2), u1:r4(px+T/2-(T-e)+S.dado.fit/2), v0:stop, v1:r4(q.cnc.V-cl), depth:dd, tool:'½″', side:'A', what:`Partition ${i+1} dado` }));
    P.push(part(`Partition ${i+1}`,'carcass','carcass',[px-T/2,v0,zOf(zbF),T,ph,zbF],'x',{ex:[0,0,.3],
      cnc:{ U:zbF, V:ph, u:['front','back'], v:['bottom','top'], up:'either face', outline:notchedO(ph,zbF,e,stop+cl,2*cl).map(([a,b])=>[b,a]), ops:[] } })); });
  // adjustable shelves: spread over the open heights, each on 4 pins; 7 holes per pin row centred on it
  const opening = (a,b) => [a,b];
  const zones=[]; { let lo=yb+T; [...(c.fixed||[])].sort((a,b)=>a-b).forEach(fy=>{ zones.push(opening(lo,fy)); lo=fy+T; }); zones.push(opening(lo, c.top==='stretchers' ? H-T : H-T)); }
  const adj = typeof c.adj==='number' ? c.adj : 0, shelfY=[];
  if(adj>0){ const tot=zones.reduce((s,[a,b])=>s+(b-a),0);
    let left=adj; zones.forEach(([a,b],zi)=>{ const n = zi===zones.length-1 ? left : Math.round(adj*(b-a)/tot); left-=n;
      const gap=(b-a-n*T)/(n+1); for(let k=0;k<n;k++){ const sy=a+gap*(k+1)+T*k; shelfY.push(sy);
        const su=iw-2*S.shelf.side, sv=zbF-S.shelf.back;
        P.push(part('Adjustable shelf','shelf','carcass',[T+S.shelf.side,sy,zOf(zbF-S.shelf.back),su,T,sv],'y',{ex:[0,0,.6], band:{long:1,short:0},
          cnc:{ U:su, V:sv, u:['left','right'], v:['front','back'], up:'either face', outline:rectO(su,sv), ops:[] } })); } }); }
  const pinU=[S.pins.front, D-S.pins.back], g=S.shelf.group, half=(g-1)/2;
  shelfY.forEach((sy,si)=>pinU.forEach(u=>{ for(let k=-half;k<=half;k++){ const v=sy+k*S.pins.pitch; if(v>yb+T+0.4 && v<H-T-0.4) endOps.push({ k:'hole', u:r4(u), v:r4(v), d:S.pins.dia, depth:S.pins.depth, side:'A', what:'Shelf pin holes' }); } }));
  // the ends (left and right), inside face up; toe notch at the front-bottom, small notch at the back-bottom
  const endO = kh ? [[ks,0],[D-S.kick.rearW,0],[D-S.kick.rearW,kh-S.kick.rearBelow],[D,kh-S.kick.rearBelow],[D,H],[0,H],[0,kh],[ks,kh]] : rectO(D,H);
  const mkEnd=(nm,x,ex)=>part(nm,'carcass','carcass',[x,0,zOf(D),T,H,D],'x',{ex, band:{long:1,short:0}, notch: kh?[ks,kh,D]:null,
    cnc:{ U:D, V:H, u:['front','back'], v:['bottom','top'], up:'inside face', outline:endO, ops:endOps.map(o=>({...o})) } });
  const L=mkEnd('Left end',0,[-1,0,0]), R=mkEnd('Right end',W-T,[1,0,0]);
  P.unshift(L,R);
  return { parts:P, t:T, dc:D, kh, ix0:T, ix1:W-T, y0:yb+T, y1:H-T, zb:bi+T, ends:{L,R}, shelfY, D, zbF, front:it.d };
}
/* hinge plates and runner holes go on the end at the hinge / runner side */
const endAt = (c, side) => side==='L' ? c.ends.L : c.ends.R;
const hingeCount = h => h<=40 ? 2 : h<=60 ? 3 : h<=80 ? 4 : 5;

/* ---------------------------------------------------------------- fronts */
/* the vertical extent of a front on a cabinet of this kind (Mozaik's door rules) */
function frontSpan(kind, c, H){
  const F=S.fronts[kind]||S.fronts.base;
  if(kind==='upper') return [ -F.below, H-F.top ];
  if(kind==='tall') return [ c.kh-F.below, H-F.top ];
  return [ c.kh-F.below, H-F.top ];
}
/* handle holes on a front (only when a handle is picked; the default is "drill later") */
function handleOps(U,V,hid,where,hingeEdgeU){
  const h=handleById(hid); if(!h) return [];
  let cu, cv, vert;
  if(where==='drawer'){ cu=U/2; cv=V-Math.min(V/2, 2.5); vert=false; }
  else { cu = hingeEdgeU===0 ? U-S.pullAt.edge : S.pullAt.edge; vert=true; cv = where==='bottom' ? S.pullAt.end+h.cc/2 : where==='mid' ? V/2 : V-S.pullAt.end-h.cc/2; }
  const pts = h.cc ? (vert ? [[cu,cv-h.cc/2],[cu,cv+h.cc/2]] : [[cu-h.cc/2,cv],[cu+h.cc/2,cv]]) : [[cu,cv]];
  return pts.map(([u,v])=>({ k:'hole', u:r4(u), v:r4(v), d:h.dia, depth:T_()+0.02, thru:true, side:'A', what:`${h.name} holes (through)` }));
}
/* a door: covers x0..x1 (cabinet x) × y0..y1 (cabinet y); side 'L'|'R' = hinge side; drawn from the BACK face (cups up) */
function door(c, name, x0,x1,y0,y1, side, pullAt='top', hid){
  const T=T_(), hs=hingeSpec(), U=x1-x0, V=y1-y0, nh=hingeCount(V);
  // seen from the back, a left-hinged door's hinge edge is on the right: u=U
  const hu = side==='L' ? U-hs.edge : hs.edge, dir = side==='L' ? -1 : 1;
  const cupsV = [...Array(nh)].map((_,i)=>{ const a=hs.bottom, b=V-hs.top; return nh===1?(a+b)/2 : a+(b-a)*i/(nh-1); });
  const ops=[];
  cupsV.forEach(v=>{ ops.push({ k:'cup', u:r4(hu), v:r4(v), d:hs.cup, depth:hs.depth, side:'A', what:'Hinge cup' });
    [-1,1].forEach(s=>ops.push({ k:'hole', u:r4(hu+dir*hs.dowelBack), v:r4(v+s*hs.dowelApart/2), d:hs.dowel, depth:hs.depth, side:'A', what:'Hinge dowel holes' })); });
  ops.push(...handleOps(U,V,hid,pullAt, side==='L'?U:0));
  const p=part(name,'front','carcass',[x0,y0,c.front-T,U,V,T],'z',{ex:[0,0,2.2], band:{long:2,short:2},
    cnc:{ U, V, u:[side==='L'?'opening edge':'hinge edge', side==='L'?'hinge edge':'opening edge'], v:['bottom','top'], up:'back face (inside)', outline:rectO(U,V), ops } });
  // hinge plate marks on the end, ±16 mm round each cup's height
  const end=endAt(c, side), hy=cupsV.map(v=>y0+v);
  hy.forEach(y=>[-1,1].forEach(s=>end.cnc.ops.push({ k:'mark', u:hs.plateX, v:r4(y+s*hs.plateApart/2), d:S.mark.dia, depth:S.mark.depth, side:'A', what:'Hinge plate marks' })));
  const hw=cupsV.map(v=>part('Hinge','hw','buy',[side==='L'?x0+0.2:x1-2,y0+v-0.9,c.front-T-0.6,1.8,1.8,0.6],'z',{ex:[0,0,1.6], hw:true}));
  if(hid && handleById(hid)) hw.push(part('Handle','hw','buy',[side==='L'?x1-S.pullAt.edge-0.25:x0+S.pullAt.edge-0.25, y1-S.pullAt.end-4, c.front, 0.5, 4, 0.9],'z',{ex:[0,0,2.8], hw:true, note:handleById(hid).name}));
  return [p, ...hw];
}
/* doors across the front of the box between the cabinet's ends (x 0..W): one, or a pair when wider than 24″ */
function doors(c, W, y0, y1, pullAt='top', name='Door', hid){
  const s=S.fronts.side, g=S.fronts.gap, n = W > (S.fronts.pairOver||21)+0.01 ? 2 : 1;
  if(n===1) return door(c, name, s, W-s, y0, y1, 'L', pullAt, hid);
  const w=(W-2*s-g)/2;
  return [...door(c, `${name}, left`, s, s+w, y0, y1, 'L', pullAt, hid), ...door(c, `${name}, right`, W-s-w, W-s, y0, y1, 'R', pullAt, hid)];
}
/* a drawer: front over x0..x1 × y0..y1; box on runners in the opening between the ends */
function drawer(c, name, x0,x1,y0,y1, fixedFront=false, hid, bay){
  const T=T_(), U=x1-x0, V=y1-y0, out=[];
  const fr=part(fixedFront?`${name} (false front)`:`${name} front`,'front','carcass',[x0,y0,c.front-T,U,V,T],'z',{ex:[0,0,fixedFront?2.2:3], band:{long:2,short:2},
    cnc:{ U, V, u:['left','right'], v:['bottom','top'], up:'back face (inside)', outline:rectO(U,V), ops: fixedFront ? [] : handleOps(U,V,hid,'drawer') }, note: fixedFront?'Screwed to the front stretcher, no box':'' });
  out.push(fr); if(fixedFront) return out;
  if(hid && handleById(hid)) out.push(part('Handle','hw','buy',[x0+U/2-2,y1-2.75,c.front,4,0.5,0.9],'z',{ex:[0,0,3.6], hw:true, note:handleById(hid).name}));
  const R=runnerSpec(), Dr=S.drawer, avail=c.zbF-0.5, len=[...R.lens].sort((a,b)=>b-a).find(l=>l<=avail) || Math.min(...R.lens);
  const ox0=bay?bay[0]:c.ix0, ox1=bay?bay[1]:c.ix1, ow=ox1-ox0, bw=ow-R.clear, L=len+R.boxPlus;
  const sh=[...Dr.sides].sort((a,b)=>b-a).find(h=>h<=V-1.75) || Math.min(...Dr.sides);
  const by=Math.max(y0, c.y0)+0.5, bx=ox0+R.clear/2, bz=c.front-T-L;
  const fbU=bw-2*T+2*Dr.tongue, fbV=sh-Dr.groove-T-Dr.topDrop, botU=bw-2*T+2*Dr.grooveDepth;
  const sideOps = s => [
    { k:'groove', u0:0, u1:r4(L), v0:Dr.groove, v1:r4(Dr.groove+T+S.dado.fit), depth:Dr.grooveDepth, tool:'½″', side:'A', what:'Bottom groove' },
    { k:'dado', u0:Dr.dadoIn, u1:r4(Dr.dadoIn+Dr.dadoW), v0:Dr.groove, v1:r4(sh-Dr.topDrop), depth:Dr.dadoDepth, tool:'¼″', side:'A', what:'Front dado' },
    { k:'dado', u0:r4(L-Dr.dadoIn-Dr.dadoW), u1:r4(L-Dr.dadoIn), v0:Dr.groove, v1:r4(sh-Dr.topDrop), depth:Dr.dadoDepth, tool:'¼″', side:'A', what:'Back dado' } ];
  [['left',bx],['right',bx+bw-T]].forEach(([s,x])=>out.push(part(`${name} box side, ${s}`,'drawer','carcass',[x,by,bz,T,sh,L],'x',{ex:[s==='left'?-.5:.5,0,1.6], band:{long:1,short:0},
    cnc:{ U:L, V:sh, u:['back','front'], v:['bottom','top'], up:'inside face', outline:rectO(L,sh), ops:sideOps(s) } })));
  const fb = (nm, z) => part(nm,'drawer','carcass',[bx+T-Dr.tongue,by+Dr.groove+T,z,fbU,fbV,T],'z',{ex:[0,0,nm.includes('front')?2.1:1.1], band:{long:1,short:0},
    cnc:{ U:fbU, V:fbV, u:['left','right'], v:['bottom','top'], up:'inside face', outline:rectO(fbU,fbV),
      ops:[ { k:'rabbet', u0:0, u1:Dr.dadoIn+Dr.dadoW-0.01, v0:0, v1:r4(fbV), depth:r4(T-Dr.tongue), tool:'¼″', side:'A', what:'Tongue rabbet, left end' },
            { k:'rabbet', u0:r4(fbU-(Dr.dadoIn+Dr.dadoW-0.01)), u1:r4(fbU), v0:0, v1:r4(fbV), depth:r4(T-Dr.tongue), tool:'¼″', side:'A', what:'Tongue rabbet, right end' } ] }, note:'Sits on the drawer bottom' });
  out.push(fb(`${name} box front`, c.front-T-T-0.0), fb(`${name} box back`, bz));
  out.push(part(`${name} box bottom`,'drawer','carcass',[bx+T-Dr.grooveDepth,by+Dr.groove,bz,botU,T,L],'y',{ex:[0,-.6,1.6],
    cnc:{ U:botU, V:L, u:['left','right'], v:['back','front'], up:'underside', outline:rectO(botU,L), ops:[] }, note:'Slides into the side grooves, full length' }));
  // runner holes on both ends, one row per drawer
  const rowY = by + R.rowAbove, us=[...R.front.map(m=>m*MM), ...R.rear.map(m=>len*25.4 - m).map(m=>m*MM)];
  [c.ends.L, c.ends.R].forEach(end=>us.forEach(u=>end.cnc.ops.push({ k:'hole', u:r4(u), v:r4(rowY), d:5*MM, depth:R.holeDepth, side:'A', what:`Runner holes (${len}″ runner)` })));
  [ox0, ox1-0.5].forEach(gx=>out.push(part('Runner','hw','buy',[gx,by-0.5,bz,0.5,0.5,len],'x',{ex:[gx<ox0+1?-.3:.3,0,1.2], hw:true, note:`${R.name}, ${len}″`})));
  return out;
}
/* drawer fronts stacked from the top down: heights[] top first; fills y0..y1 with the front gap between */
function drawerStack(c, x0, x1, y0, y1, heights, hid){
  const s=S.fronts.side, g=S.fronts.gap, out=[]; let y=y1;
  heights.forEach((hh,i)=>{ out.push(...drawer(c, `Drawer ${i+1}`, x0+s, x1-s, y-hh, y, false, hid)); y-=hh+g; });
  return out;
}
/* split the height of a stack of n fronts (gaps between them), the top one `first` high if given */
const split = (total, n, first, g=S.fronts.gap) => { const net=total-(n-1)*g; return first ? [first, ...Array(n-1).fill((net-first)/(n-1))] : Array(n).fill(net/n); };


/* ---------------------------------------------------------------- simple solids (appliances, furniture, tops) */
const solid = (name, role, box, ex=[0,0,0], note='') => ({ ...part(name, role, role==='top'?'counter':'buy', box, 'y', {ex}), solid:true, note });

/* ---------------------------------------------------------------- the catalog */
const CATS = [
  { k:'base',      name:'Base cabinets',     y:0 },
  { k:'upper',     name:'Upper cabinets',    y:54 },
  { k:'tall',      name:'Pantries',          y:0 },
  { k:'linen',     name:'Linen towers',      y:0 },
  { k:'wardrobe',  name:'Wardrobes',         y:0 },
  { k:'vanity',    name:'Vanities',          y:0 },
  { k:'bench',     name:'Window benches',    y:0 },
  { k:'shelf',     name:'Shelves',           y:0 },
  { k:'fire',      name:'Fireplaces',        y:0 },
  { k:'counter',   name:'Countertops',       y:35.5 },
  { k:'appliance', name:'Appliances',        y:0 },
  { k:'bath',      name:'Bathroom fixtures', y:0 },
  { k:'sink',      name:'Sinks',             y:27 },
  { k:'furniture', name:'Furniture',         y:0 },
];
const W_STD = [9,12,15,18,21,24,27,30,33,36];
const ITEMS = [];
const def = o => { ITEMS.push({ wR:[6,48], hR:[6,108], dR:[6,30], opts:[], ...o }); };

/* base cabinets (Mozaik's): 35½″ box, 23⅝″ deep box + the doors */
const hidOf = it => it.opt?.handle ?? S.handle;
const baseBuild = kind => it => {
  const c=carcass(it,{kick:true, top:'stretchers', adj: kind==='door'||kind==='doordrawer' ? (it.opt.shelves??1) : 0});
  const P=c.parts, H=it.h, W=it.w, [f0,f1]=frontSpan('base',c,H), g=S.fronts.gap, s=S.fronts.side, hid=hidOf(it);
  if(kind==='door') P.push(...doors(c,W,f0,f1,'top','Door',hid));
  if(kind==='doordrawer'){ const dh=it.opt.top??6; P.push(...drawer(c,'Drawer', s,W-s, f1-dh,f1, false, hid), ...doors(c,W,f0,f1-dh-g,'top','Door',hid)); }
  if(kind==='drawers'){ const n=it.opt.drawers??3; P.push(...drawerStack(c, 0,W, f0,f1, split(f1-f0, n, n>2?6.75:0), hid)); }
  if(kind==='sink'){ P.push(...drawer(c,'Top', s,W-s, f1-6,f1, true), ...doors(c,W,f0,f1-6-g,'top','Door',hid)); }
  return P;
};
def({ k:'B',   cat:'base', name:'Base, doors',           w:18, h:35.5, d:24.225, sizes:W_STD, opts:[['shelves','Shelves',[0,1,2]]], opt:{shelves:1}, build:baseBuild('door') });
def({ k:'BDD', cat:'base', name:'Base, drawer over door', w:24, h:35.5, d:24.225, sizes:W_STD.filter(w=>w>=12), opts:[['shelves','Shelves',[0,1,2]],['top','Drawer front',[5,6,7]]], opt:{shelves:1, top:6}, build:baseBuild('doordrawer') });
def({ k:'BD',  cat:'base', name:'Drawer base',           w:18, h:35.5, d:24.225, sizes:W_STD.filter(w=>w>=12), opts:[['drawers','Drawers',[2,3,4]]], opt:{drawers:3}, build:baseBuild('drawers') });
def({ k:'BS',  cat:'base', name:'Sink base',             w:30, h:35.5, d:24.225, sizes:[24,27,30,33,36], build:baseBuild('sink') });

/* uppers (Mozaik's): 12″ deep box + the door; 38½″ tall by default (15–24″ over a fridge or range hood) */
const upperBuild = open => it => {
  const n = it.opt.shelves ?? Math.max(0, Math.round((it.h-12)/12));
  const c=carcass(it,{kick:false, top:'full', adj:n, doors:!open});
  const P=c.parts, [f0,f1]=frontSpan('upper',c,it.h);
  if(!open) P.push(...doors(c,it.w,f0,f1,'bottom','Door',hidOf(it)));
  return P;
};
def({ k:'W',  cat:'upper', name:'Upper, doors',     w:30, h:38.5, d:12.6, sizes:W_STD, hSizes:[12,15,18,24,30,36,38.5,42], opts:[['shelves','Shelves',[0,1,2,3]]], opt:{shelves:2}, build:upperBuild(false) });
def({ k:'WO', cat:'upper', name:'Upper, open',      w:30, h:38.5, d:12, sizes:W_STD, hSizes:[12,15,18,24,30,36,38.5,42], opts:[['shelves','Shelves',[0,1,2,3]]], opt:{shelves:2}, build:upperBuild(true) });
def({ k:'WF', cat:'upper', name:'Over the fridge',  w:30, h:15, d:24.225, sizes:[24,30,33,36], hSizes:[12,15,18,24], opt:{shelves:0}, build:upperBuild(false) });

/* pantries: 84 / 90 / 96″, 24″ deep; a fixed shelf where the doors split */
def({ k:'P', cat:'tall', name:'Pantry, doors', w:24, h:84, d:24.225, sizes:[18,20,24,30,36], hSizes:[74,84,90,96], opts:[['shelves','Shelves',[3,4,5,6]],['split','Door split at',[35.4,48]]], opt:{shelves:4, split:35.4},
  build: it => { const sp=Math.min(it.opt.split ?? 35.4, it.h-12), T=th(), g=S.fronts.gap; const c=carcass(it,{kick:true, top:'full', fixed:[sp-0.17], adj:it.opt.shelves??4});
    const P=c.parts, [f0,f1]=frontSpan('tall',c,it.h), hid=hidOf(it); P.push(...doors(c,it.w,f0,sp-g/2,'top','Lower door',hid), ...doors(c,it.w,sp+g/2,f1,'bottom','Upper door',hid)); return P; } });
def({ k:'PD', cat:'tall', name:'Pantry, drawers + doors', w:24, h:84, d:24.225, sizes:[18,24,30,36], hSizes:[84,90,96], opts:[['drawers','Drawers',[2,3,4]]], opt:{drawers:3},
  build: it => { const top=36, g=S.fronts.gap; const c=carcass(it,{kick:true, top:'full', fixed:[top-th()], adj:3});
    const P=c.parts, [f0,f1]=frontSpan('tall',c,it.h), n=it.opt.drawers??3, hid=hidOf(it);
    P.push(...drawerStack(c, 0,it.w, f0,top-g/2, split(top-g/2-f0,n), hid), ...doors(c,it.w,top+g/2,f1,'bottom','Upper door',hid)); return P; } });

/* linen towers: 18 / 24″ wide, 84″, 21″ deep */
def({ k:'L', cat:'linen', name:'Linen tower', w:18, h:84, d:21, sizes:[15,18,21,24], hSizes:[72,84,90,96], opts:[['base','Lower part',['drawers','doors']]], opt:{base:'drawers'},
  build: it => { const top=35.5, g=S.fronts.gap; const c=carcass(it,{kick:true, top:'full', fixed:[top-th()], adj:3});
    const P=c.parts, [f0,f1]=frontSpan('tall',c,it.h), hid=hidOf(it);
    if(it.opt.base==='doors') P.push(...doors(c,it.w,f0,top-g/2,'top','Lower door',hid)); else P.push(...drawerStack(c, 0,it.w, f0,top-g/2, split(top-g/2-f0,3), hid));
    P.push(...doors(c,it.w,top+g/2,f1,'bottom','Upper door',hid)); return P; } });

/* wardrobes: 24″ deep, 84 / 96″ tall */
def({ k:'WD', cat:'wardrobe', name:'Wardrobe', w:36, h:84, d:24, wR:[18,48], sizes:[18,24,30,36,42,48], hSizes:[84,90,96],
  opts:[['inside','Inside',['hang','double','drawers','shelves']]], opt:{inside:'hang'},
  build: it => {
    const ins=it.opt.inside||'hang', H=it.h, W=it.w, t=th(), shelfY=H-14;
    const fixed = ins==='shelves' ? [] : ins==='drawers' ? [S.kick.h+28, shelfY] : ins==='double' ? [ (H-S.kick.h)/2+S.kick.h, shelfY ] : [shelfY];
    const c=carcass(it,{kick:true, top:'full', fixed, adj: ins==='shelves' ? Math.round((H-S.kick.h)/12)-1 : 0});
    const { parts:P, kh, dc, ix0, ix1, zb } = c, hid=hidOf(it);
    const rod = (y, nm='Closet rod') => P.push({...part(nm,'hw','buy',[ix0,y-1,zb+(dc-zb)/2-0.5,ix1-ix0,1,1],'y',{ex:[0,0,.8], hw:true, note:`${S.rod.name}, ${fmtU(ix1-ix0)}`})});
    if(ins==='hang') rod(shelfY-2);
    if(ins==='double'){ rod(fixed[0]-2,'Closet rod, lower'); rod(shelfY-2,'Closet rod, upper'); }
    if(ins==='drawers'){ P.push(...drawerStack({...c, front:c.front-t-1}, ix0,ix1, kh+t,kh+28, split(28-t,3), hid).map(p=>{ if(p.role==='front'){ p.name=p.name.replace('front','inside front'); } return p; })); rod(shelfY-2); }
    const [f0,f1]=frontSpan('tall',c,H); P.push(...doors(c,W,f0,f1,'mid','Door',hid));
    return P; } });

/* vanities: 21″ deep, 34½″ (or 32½″) */
def({ k:'VD',  cat:'vanity', name:'Vanity, sink + doors',   w:30, h:34.5, d:21, sizes:[24,30,36,48], hSizes:[32.5,34.5], build:baseBuild('sink') });
def({ k:'VDR', cat:'vanity', name:'Vanity, drawers',        w:18, h:34.5, d:21, sizes:[12,15,18,21,24], hSizes:[32.5,34.5], opts:[['drawers','Drawers',[3,4]]], opt:{drawers:3}, build:baseBuild('drawers') });

/* window benches: 18″ seat (with cushion on top), 18–20″ deep */
def({ k:'WB', cat:'bench', name:'Window bench, drawers', w:48, h:17, d:18, wR:[24,120], sizes:[36,48,60,72,84,96], hSizes:[16,17,18], dSizes:[16,18,20], opts:[['bays','Drawers across',[1,2,3,4]]], opt:{bays:2},
  build: it => { const n=it.opt.bays??2, W=it.w, t=th(), s=S.fronts.side, g=S.fronts.gap; const xs=[...Array(n-1)].map((_,i)=>t+(W-2*t)*(i+1)/n);
    const c=carcass(it,{kick:true, top:'full', parts:xs}); const P=c.parts, [f0,f1]=frontSpan('base',c,it.h), hid=hidOf(it);
    const edges=[s, ...xs.flatMap(x=>[x-g/2,x+g/2]), W-s];
    for(let i=0;i<n;i++){ const ox0=i===0?t:xs[i-1]+t/2, ox1=i===n-1?W-t:xs[i]-t/2; P.push(...drawer(c, `Drawer ${i+1}`, edges[2*i], edges[2*i+1], f0, f1, false, hid, [ox0,ox1])); }
    return P; } });
def({ k:'WBL', cat:'bench', name:'Window bench, lift top', w:48, h:17, d:18, wR:[24,120], sizes:[36,48,60,72,84,96], hSizes:[16,17,18], dSizes:[16,18,20],
  build: it => { const c=carcass(it,{kick:true, top:'stretchers', doors:false}); const { parts:P, kh, dc, t } = c; const W=it.w, H=it.h;
    P.push(part('Front panel','front','carcass',[t,kh,dc-th(),W-2*t,H-kh-t,th()],'z',{ex:[0,0,1.5], band:{long:1,short:0}, ops:['Screwed between the ends behind the front stretcher']}));
    P.push(part('Lid','front','carcass',[0,H,0,W,th(),dc],'y',{ex:[0,1.8,0], band:{long:2,short:2}, ops:['Piano hinge along the back, lid stay at one end']}));
    P.push(part('Piano hinge','hw','buy',[t,H-0.1,0.4,W-2*t,0.2,1],'y',{ex:[0,1.2,0], hw:true}));
    return P; } });

/* shelves */
def({ k:'SO', cat:'shelf', name:'Open shelving / bookcase', w:30, h:72, d:12, wR:[12,48], sizes:[18,24,30,36,42,48], hSizes:[30,36,48,60,72,84,96], dSizes:[10,12,14,16], opts:[['shelves','Shelves',[2,3,4,5,6]]], opt:{shelves:4},
  build: it => { const n=it.opt.shelves??4, kh=S.kick.h, t=th(); const fixed=[...Array(n)].map((_,i)=>kh+t+(it.h-kh-2*t)*(i+1)/(n+1)-t/2);
    const c=carcass(it,{kick:true, top:'full', fixed, doors:false}); return c.parts; } });
def({ k:'SF', cat:'shelf', name:'Floating shelf', w:48, h:2, d:10, y:60, wR:[12,120], sizes:[24,36,48,60,72,96], hSizes:[1.75,2,2.5,3], dSizes:[8,10,12],
  build: it => { const t=th(), W=it.w, H=it.h, D=it.d;
    return [ part('Top skin','shelf','back',[0,H-t,0,W,t,D],'y',{ex:[0,1,0], band:{long:1,short:2}}),
      part('Bottom skin','shelf','back',[0,0,0,W,t,D],'y',{ex:[0,-1,0], band:{long:1,short:2}}),
      part('Front edge','shelf','back',[0,t,D-t,W,H-2*t,t],'z',{ex:[0,0,1]}),
      part('Wall cleat','hw','buy',[0.5,t,0,W-1,H-2*t,1],'z',{ex:[0,0,-1.2], hw:true, note:'Hidden floating-shelf bracket, screwed to studs / blocking'}) ]; } });

/* fireplaces: a plywood surround around a linear electric insert (follow the insert's manual for clearances) */
const INSERTS = { 50:{w:50, h:16.5, d:5.75}, 60:{w:60, h:16.5, d:5.75}, 72:{w:72, h:16.5, d:5.75} };
def({ k:'FP', cat:'fire', name:'Fireplace surround, linear electric', w:72, h:40, d:16, wR:[48,120], sizes:[60,72,84,96], hSizes:[30,36,40,48,84,96], dSizes:[14,16,18],
  opts:[['insert','Insert',['50','60','72']]], opt:{insert:'60'},
  build: it => { const I=INSERTS[it.opt.insert]||INSERTS[60]; const W=it.w, H=it.h, t=th();
    const iy=Math.min(18, H-I.h-4), fy=iy-t;
    const c=carcass(it,{kick:true, top:'full', fixed:[fy]}); const { parts:P, dc } = c;
    const fw=Math.min(I.w, W-2*t-2), fx=(W-fw)/2;
    const face=part('Face panel','front','carcass',[0,S.kick.h,dc,W,H-S.kick.h,th()],'z',{ex:[0,0,2], band:{long:2,short:2}, ops:[`Cut-out for the insert ${fmtU(fw)} × ${fmtU(I.h)} (check the insert's own cut-out size)`, 'Cut back face up']});
    face.hole=[fx, iy, fw, I.h]; P.push(face);
    P.push({ ...solid(`Electric insert ${I.w}″`, 'appliance', [fx, iy, dc-I.d+0.75, fw, I.h, I.d], [0,0,3.2]), note:'Generic linear electric insert, check the model’s size and clearances' });
    return P; } });

/* countertops */
def({ k:'CT', cat:'counter', name:'Countertop', w:48, h:1.25, d:25.5, wR:[12,144], sizes:[24,36,48,60,72,96,120], dSizes:[22,25.5,26], opts:[['sink','Sink cut-out',['none','30″ undermount','24″ undermount']],['splash','Backsplash',['none','4″']]], opt:{sink:'none', splash:'none'},
  build: it => { const P=[{ ...solid('Countertop','top',[0,0,0,it.w,it.h,it.d],[0,1,0]), note:`${S.counter.name} ${fmtU(it.h)}${it.opt.sink!=='none'?`, ${it.opt.sink} sink cut-out (template)`:''}` }];
    if(it.opt.splash==='4″') P.push({ ...solid('Backsplash','top',[0,it.h,0,it.w,4,0.75],[0,1.6,-.6]), note:S.counter.name });
    return P; } });

/* appliances: common models (sizes from the makers' spec sheets; always check the current sheet before ordering) */
const APPL = [
  // fridges
  ['FR24T','Fridge 24″ top freezer · Summit FF1072B','fridge',24,59.88,26.25,'9.9 cu ft'],
  ['FR24B','Fridge 24″ bottom freezer · Bosch 500 B24CB50ESS','fridgeB',23.625,79.94,26.19,'12.8 cu ft, counter depth, cut-out 24 × 80 7/16 × 24'],
  ['FR24L','Fridge 24″ bottom freezer · Liebherr CS1360B','fridgeB',23.625,79.56,24.81,'12.7 cu ft, counter depth'],
  ['FR24U','Fridge 24″ under-counter · Summit FF64BSS','under',23.63,34,23.5,'built-in all-refrigerator'],
  ['FR30','Fridge 30″ top freezer (typical)','fridge',29.75,66.5,31.5,'18 cu ft class — check model'],
  ['FR36','Fridge 36″ French door (typical)','fridgeF',35.75,70,36,'25 cu ft class — check model'],
  // ranges
  ['RG24E','Range 24″ electric · Avanti DER24P3S','range',23.5,37.5,25.25,'2.3 cu ft oven'],
  ['RG24G','Range 24″ gas · Avanti (typical)','range',23.75,37.5,25.5,'check model'],
  ['RG30E','Range 30″ electric · GE JB645RKSS','range',29.875,47,28,'5.3 cu ft, backguard included in height'],
  // others
  ['DW24','Dishwasher 24″ (typical, e.g. Bosch 300)','dw',23.5,33.875,23.75,'built-in under the counter'],
  ['DW18','Dishwasher 18″ (typical, e.g. Bosch 300)','dw',17.625,33.875,22.5,'built-in under the counter'],
  ['HD24','Range hood 24″ under-cabinet (typical)','hood',24,5,18,'under a 24″ upper'],
  ['HD30','Range hood 30″ under-cabinet (typical)','hood',30,6,20,'under a 30″ upper'],
  ['WD24','Washer or dryer 24″ compact (typical)','washer',23.5,33.5,23.5,'stackable'],
];
const fridgeParts = (it, kind) => { const W=it.w,H=it.h,D=it.d, dd=1.5, P=[];
  P.push(solid('Cabinet','appliance',[0,0,0,W,H,D-dd],[0,0,0]));
  if(kind==='under'){ P.push(solid('Door','appdoor',[0,0.5,D-dd,W,H-1,dd],[0,0,2])); return P; }
  if(kind==='fridge'){ const fz=H*0.28; P.push(solid('Freezer door','appdoor',[0,H-fz,D-dd,W,fz-0.3,dd],[0,0,2]), solid('Fridge door','appdoor',[0,0.5,D-dd,W,H-fz-0.8,dd],[0,0,2])); }
  if(kind==='fridgeB'){ const fz=H*0.32; P.push(solid('Fridge door','appdoor',[0,fz+0.3,D-dd,W,H-fz-0.6,dd],[0,0,2]), solid('Freezer drawer','appdoor',[0,0.5,D-dd,W,fz-0.5,dd],[0,0,2.6])); }
  if(kind==='fridgeF'){ const fz=H*0.32; P.push(solid('Left door','appdoor',[0,fz+0.3,D-dd,W/2-0.1,H-fz-0.6,dd],[-.6,0,2]), solid('Right door','appdoor',[W/2+0.1,fz+0.3,D-dd,W/2-0.1,H-fz-0.6,dd],[.6,0,2]), solid('Freezer drawer','appdoor',[0,0.5,D-dd,W,fz-0.5,dd],[0,0,2.6])); }
  return P; };
APPL.forEach(([k,name,kind,w,h,d,note])=>def({ k, cat:'appliance', name, w, h, d, fixed:true, note, y: kind==='hood' ? 54-6 : 0,
  build: it => { const W=it.w,H=it.h,D=it.d;
    if(kind.startsWith('fridge')||kind==='under') return fridgeParts(it, kind);
    if(kind==='range') return [ solid('Body','appliance',[0,0,0,W,H-4,D-1],[0,0,0]), solid('Oven door','appdoor',[1,4,D-1,W-2,H-16,1],[0,0,2]), solid('Cooktop','top',[0,H-4.6,0.5,W,0.6,D-1.5],[0,1.4,0]), solid('Backguard','appliance',[0,H-4,0,W,4,2.5],[0,2,-.8]) ];
    if(kind==='dw') return [ solid('Tub','appliance',[0,0,0,W,H,D-1],[0,0,0]), solid('Door','appdoor',[0,4,D-1,W,H-4.5,1],[0,0,2]) ];
    if(kind==='hood') return [ solid('Hood','appliance',[0,0,0,W,H,D],[0,0,0]) ];
    return [ solid('Body','appliance',[0,0,0,W,H,D-1],[0,0,0]), solid('Door','appdoor',[W*0.15,H*0.25,D-1,W*0.7,H*0.55,1],[0,0,2]) ]; } }));

/* furniture: bought pieces, shown at their usual size so rooms can be laid out (resize to the real piece) */
const legs = (W,D,h,s=1.5,inset=1) => [[inset,inset],[W-inset-s,inset],[inset,D-inset-s],[W-inset-s,D-inset-s]].map(([x,z],i)=>solid(`Leg ${i+1}`,'furnwood',[x,0,z,s,h,s],[x<W/2?-.6:.6,-.6,z<D/2?-.6:.6]));
const BED = { Twin:[39,75], Full:[54,75], Queen:[60,80], King:[76,80] };
def({ k:'BED', cat:'furniture', name:'Bed with platform', w:60, h:22, d:80, wR:[39,80], dR:[75,84], opts:[['size','Mattress',Object.keys(BED)]], opt:{size:'Queen'}, sized: it => { const [w,d]=BED[it.opt.size]||BED.Queen; return {w:w+2, d:d+2}; },
  build: it => { const W=it.w,D=it.d,H=it.h, t=th('carcass'), m=10;
    return [ part('Platform side','carcass','carcass',[0,0,0,t,H-m,D],'x',{ex:[-1,0,0]}), part('Platform side','carcass','carcass',[W-t,0,0,t,H-m,D],'x',{ex:[1,0,0]}),
      part('Platform end','carcass','carcass',[t,0,0,W-2*t,H-m,t],'z',{ex:[0,0,-1]}), part('Platform end','carcass','carcass',[t,0,D-t,W-2*t,H-m,t],'z',{ex:[0,0,1]}),
      part('Platform deck','shelf','carcass',[t,H-m-t,t,W-2*t,t,D-2*t],'y',{ex:[0,.6,0]}),
      solid('Mattress','furnsoft',[1,H-m,1,W-2,m,D-2],[0,2,0]), solid('Headboard','furnwood',[0,0,-1.5,W,H+22,1.5],[0,0,-2]) ]; } });
def({ k:'SOFA', cat:'furniture', name:'Sofa', w:84, h:34, d:36, wR:[60,108], sizes:[60,72,84,96],
  build: it => { const W=it.w,D=it.d,H=it.h, a=6; return [ solid('Base','furnsoft',[a,4,0,W-2*a,13,D],[0,-.5,0]), solid('Seat cushions','furnsoft2',[a,17,8,W-2*a,5,D-8],[0,1,.6]), solid('Back','furnsoft',[a,17,0,W-2*a,H-17,8],[0,.6,-1]), solid('Arm','furnsoft',[0,4,0,a,22,D],[-1,0,0]), solid('Arm','furnsoft',[W-a,4,0,a,22,D],[1,0,0]), ...legs(W,D,4,2,2) ]; } });
def({ k:'CHAIR', cat:'furniture', name:'Armchair', w:32, h:32, d:34, build: it => { const W=it.w,D=it.d,H=it.h,a=5; return [ solid('Base','furnsoft',[a,4,0,W-2*a,13,D],[0,-.5,0]), solid('Seat cushion','furnsoft2',[a,17,8,W-2*a,5,D-8],[0,1,.6]), solid('Back','furnsoft',[a,17,0,W-2*a,H-17,8],[0,.6,-1]), solid('Arm','furnsoft',[0,4,0,a,20,D],[-1,0,0]), solid('Arm','furnsoft',[W-a,4,0,a,20,D],[1,0,0]), ...legs(W,D,4,2,2) ]; } });
def({ k:'TBL', cat:'furniture', name:'Dining table', w:60, h:30, d:36, wR:[30,96], sizes:[36,48,60,72,84], build: it => [ solid('Top','furnwood',[0,it.h-1.25,0,it.w,1.25,it.d],[0,1.5,0]), solid('Apron','furnwood',[3,it.h-5,3,it.w-6,3.75,it.d-6],[0,.6,0]), ...legs(it.w,it.d,it.h-1.25,2.5,3) ] });
def({ k:'DCH', cat:'furniture', name:'Dining chair', w:18, h:32, d:20, build: it => [ solid('Seat','furnwood',[0,17,0,it.w,1.5,it.d],[0,.8,0]), solid('Back','furnwood',[0,18.5,0,it.w,it.h-18.5,1],[0,.6,-1]), ...legs(it.w,it.d,17,1.25,0.5) ] });
def({ k:'DESK', cat:'furniture', name:'Desk', w:48, h:30, d:24, wR:[30,72], sizes:[36,42,48,60], build: it => [ solid('Top','furnwood',[0,it.h-1,0,it.w,1,it.d],[0,1.5,0]), ...legs(it.w,it.d,it.h-1,1.5,1) ] });
def({ k:'NS', cat:'furniture', name:'Nightstand', w:20, h:24, d:16, build: it => [ solid('Case','furnwood',[0,4,0,it.w,it.h-4,it.d],[0,0,0]), solid('Drawer','furnwood2',[1,it.h-8,it.d,it.w-2,6,0.75],[0,0,1.6]), ...legs(it.w,it.d,4,1.25,1) ] });
def({ k:'CTB', cat:'furniture', name:'Coffee table', w:44, h:17, d:24, build: it => [ solid('Top','furnwood',[0,it.h-1.25,0,it.w,1.25,it.d],[0,1.5,0]), ...legs(it.w,it.d,it.h-1.25,2,1.5) ] });

/* ---------------------------------------------------------------- plumbing fixtures
   Generic sizes of common stock fixtures (always check the model you buy), plus Cubit's own stock pieces drawn from
   their STEP files (loaded at start: data/fixtures-*.json, one mesh per solid so they explode). */
const FIX = {};
const FIX_FILES = { lpgShower:'data/fixtures-lifepodgo-shower.json' };
async function loadFixtures(){ await Promise.all(Object.entries(FIX_FILES).map(async([k,u])=>{ try{ const r=await fetch(u); if(r.ok) FIX[k]=await r.json(); }catch(e){} })); }
const fx = (name, role, box, o={}) => ({ ...part(name, role, 'buy', box, 'y', {ex:o.ex||[0,0,0]}), solid:true, shape:o.shape, t:o.t, note:o.note||'' });
/* an open basin (tub, shower pan, sink bowl): rim walls `t` thick plus a floor */
const basin = (name, role, [x,y,z,w,h,d], t, ex=[0,0,0]) => [ fx(name, role, [x,y,z,w,h,d], {shape:'basin', t, ex}), fx(name+' floor', role, [x+t,y,z+t,w-2*t,Math.min(1,h/4),d-2*t], {ex}) ];
function meshParts(key, it){
  const F=FIX[key]; if(!F) return [fx('Loading…','acrylic',[0,0,0,it.w,it.h,it.d])];
  return F.parts.map(pt=>{ let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9]; for(let i=0;i<pt.p.length;i+=3) for(let a=0;a<3;a++){ const v=pt.p[i+a]/F.q; if(v<mn[a]) mn[a]=v; if(v>mx[a]) mx[a]=v; }
    return { ...fx(pt.name,'acrylic',[mn[0],mn[1],mn[2],mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]],{ex:pt.ex}), mesh:pt, meshQ:F.q }; });
}
const BATH_NOTE='Typical size, check the model you buy';
const toilet = (seatH, tankH) => it => { const W=it.w, D=it.d, cx=W/2;
  return [ fx('Tank','porcelain',[cx-W/2,seatH,0.5,W,tankH-seatH,8],{ex:[0,.4,-.6]}), fx('Tank lid','porcelain',[cx-W/2-0.25,tankH,0.25,W+0.5,1,8.5],{ex:[0,1.2,-.6]}),
    fx('Pedestal','porcelain',[cx-4.5,0,7,9,seatH-2,11],{shape:'cyl',ex:[0,-.4,0]}), fx('Bowl','porcelain',[cx-7.25,seatH-6,6,14.5,5,D-6.5],{shape:'cyl',ex:[0,0,.4]}),
    fx('Seat','porcelain',[cx-7.25,seatH-1,6.5,14.5,1,D-7],{shape:'cyl',ex:[0,.8,.4]}) ]; };
def({ k:'WC-R',  cat:'bath', name:'Toilet, round front',             w:20.5, h:29, d:27.5, fixed:true, note:BATH_NOTE, build:toilet(15,29) });
def({ k:'WC-E',  cat:'bath', name:'Toilet, elongated comfort height', w:20.5, h:31, d:30,   fixed:true, note:BATH_NOTE, build:toilet(17,31) });
def({ k:'WC-C',  cat:'bath', name:'Toilet, compact elongated',        w:18,   h:30, d:26.5, fixed:true, note:BATH_NOTE, build:toilet(16.5,30) });
def({ k:'WC-W',  cat:'bath', name:'Toilet, wall hung (in-wall carrier)', w:14.5, h:16, d:21, y:0, fixed:true, note:BATH_NOTE+'. Needs a 2×6 or carrier wall', build: it=>[ fx('Bowl','porcelain',[0,11,1,14.5,5,20],{shape:'cyl',ex:[0,0,.4]}), fx('Seat','porcelain',[0,15.5,1.5,14.5,0.75,19],{shape:'cyl',ex:[0,.8,.4]}), fx('Flush plate','steel',[2.25,40,0,10,6.5,0.4],{ex:[0,0,.6]}) ] });
const oneShower = (pan=6) => it => { const W=it.w, D=it.d, H=it.h, t=1.5;
  return [ ...basin('Shower base','acrylic',[0,0,0,W,pan,D],2.5,[0,-.6,0]),
    fx('Back wall','acrylic',[0,pan,0,W,H-pan,t],{ex:[0,0,-1]}), fx('Left wall','acrylic',[0,pan,0,t,H-pan,D],{ex:[-1,0,0]}), fx('Right wall','acrylic',[W-t,pan,0,t,H-pan,D],{ex:[1,0,0]}),
    fx('Grab bar / soap shelf','steel',[W*0.35,44,t,W*0.3,1.5,3],{ex:[0,0,1]}) ]; };
def({ k:'SH-4836', cat:'bath', name:'Shower, one piece walk-in 48 × 36', w:48, h:76, d:36, fixed:true, note:BATH_NOTE+' (fibreglass / acrylic one piece; fits a 48 × 36 alcove)', build:oneShower() });
def({ k:'SH-6032', cat:'bath', name:'Shower, one piece walk-in 60 × 32', w:60, h:76, d:32, fixed:true, note:BATH_NOTE, build:oneShower() });
def({ k:'SH-3636', cat:'bath', name:'Shower, one piece 36 × 36',         w:36, h:76, d:36, fixed:true, note:BATH_NOTE, build:oneShower() });
def({ k:'SH-3232', cat:'bath', name:'Shower, one piece 32 × 32',         w:32, h:76, d:32, fixed:true, note:BATH_NOTE, build:oneShower() });
def({ k:'TS-6030', cat:'bath', name:'Tub-shower, one piece 60 × 30',     w:60, h:74.5, d:30, fixed:true, note:BATH_NOTE, build:it=>{ const P=oneShower(18)(it); P[0].name='Tub'; P[1].name='Tub floor'; return P; } });
def({ k:'TS-6032', cat:'bath', name:'Tub-shower, one piece 60 × 32',     w:60, h:76,   d:32, fixed:true, note:BATH_NOTE, build:it=>{ const P=oneShower(18)(it); P[0].name='Tub'; P[1].name='Tub floor'; return P; } });
const tub = it => [ ...basin('Tub','acrylic',[0,0,0,it.w,it.h,it.d],3,[0,0,0]), fx('Apron','acrylic',[0,0,it.d-1,it.w,it.h-1,1],{ex:[0,0,1]}) ];
def({ k:'BT-6030', cat:'bath', name:'Bathtub, alcove 60 × 30', w:60, h:15, d:30, fixed:true, note:BATH_NOTE, build:tub });
def({ k:'BT-6032', cat:'bath', name:'Bathtub, alcove 60 × 32', w:60, h:20, d:32, fixed:true, note:BATH_NOTE, build:tub });
def({ k:'BT-FS60', cat:'bath', name:'Bathtub, freestanding 60″', w:60, h:23, d:30, fixed:true, note:BATH_NOTE, build:it=>[ fx('Tub','acrylic',[0,0,0,it.w,it.h,it.d],{shape:'basin',t:2.5}), fx('Tub floor','acrylic',[3,0,3,it.w-6,2,it.d-6],{}) ] });
def({ k:'BT-FS67', cat:'bath', name:'Bathtub, freestanding 67″', w:67, h:23, d:32, fixed:true, note:BATH_NOTE, build:it=>[ fx('Tub','acrylic',[0,0,0,it.w,it.h,it.d],{shape:'basin',t:2.5}), fx('Tub floor','acrylic',[3,0,3,it.w-6,2,it.d-6],{}) ] });
def({ k:'LV-WH', cat:'bath', name:'Bathroom sink, wall hung 20 × 17', w:20, h:6, d:17, y:28, fixed:true, note:BATH_NOTE, build:it=>basin('Basin','porcelain',[0,0,0,it.w,it.h,it.d],1.5) });
/* Cubit stock: LifePodGo one-piece shower (Shapr3D STEP, Oct 2026). Both hands are in stock. */
def({ k:'LPG-SH-L', cat:'bath', name:'LifePodGo shower · left hand', w:42.56, h:87.13, d:35.5, fixed:true, note:'Cubit stock, drawn from the LifePodGo STEP file. Left hand: the deep side wall is on the left, seen from the front. In stock both hands', build:it=>meshParts('lpgShower', it) });
def({ k:'LPG-SH-R', cat:'bath', name:'LifePodGo shower · right hand', w:42.56, h:87.13, d:35.5, fixed:true, mirrored:true, note:'Cubit stock, drawn from the LifePodGo STEP file. Right hand: the deep side wall is on the right, seen from the front. In stock both hands', build:it=>meshParts('lpgShower', it) });
/* kitchen and utility sinks: they sit in the countertop (top of the rim at the counter top), 2″ off the wall */
const sinkY = h => () => 35.5 + (S.counter?.t ?? 1.25) - h + 0.2;
const sink1 = it => basin('Bowl','steel',[0,0,0,it.w,it.h,it.d],1);
const sink2 = (split=0.5) => it => { const a=it.w*split; return [ ...basin('Left bowl','steel',[0,0,0,a+0.5,it.h,it.d],1,[-.5,0,0]), ...basin('Right bowl','steel',[a-0.5,0,0,it.w-a+0.5,it.h,it.d],1,[.5,0,0]) ]; };
def({ k:'SK-1-25', cat:'sink', name:'Kitchen sink, single bowl 25 × 22 drop-in', w:25, h:8,  d:22, gap:1.5, y:sinkY(8),  fixed:true, note:BATH_NOTE+' · fits a 30″ sink base', build:sink1 });
def({ k:'SK-1-30', cat:'sink', name:'Kitchen sink, single bowl 30 × 18 undermount', w:30, h:9, d:18, gap:3, y:sinkY(9), fixed:true, note:BATH_NOTE+' · fits a 33–36″ sink base', build:sink1 });
def({ k:'SK-2-33', cat:'sink', name:'Kitchen sink, double bowl 33 × 22 drop-in', w:33, h:8,  d:22, gap:1.5, y:sinkY(8),  fixed:true, note:BATH_NOTE+' · fits a 36″ sink base', build:sink2() });
def({ k:'SK-2-32', cat:'sink', name:'Kitchen sink, double bowl 32 × 18 undermount', w:32, h:9, d:18, gap:3, y:sinkY(9), fixed:true, note:BATH_NOTE+' · fits a 36″ sink base', build:sink2() });
def({ k:'SK-2-60', cat:'sink', name:'Kitchen sink, 60/40 double 33 × 22', w:33, h:9, d:22, gap:1.5, y:sinkY(9), fixed:true, note:BATH_NOTE, build:sink2(0.6) });
def({ k:'SK-FH-30', cat:'sink', name:'Farmhouse (apron) sink 30″', w:30, h:10, d:20, gap:2, y:sinkY(10), fixed:true, note:BATH_NOTE+' · needs a farmhouse sink base', build:it=>[ ...basin('Bowl','porcelain',[0,0,0,it.w,it.h,it.d],1.25), fx('Apron','porcelain',[0,0,it.d-0.75,it.w,it.h,0.75],{ex:[0,0,1]}) ] });
def({ k:'SK-FH-33', cat:'sink', name:'Farmhouse (apron) sink 33″', w:33, h:10, d:21, gap:2, y:sinkY(10), fixed:true, note:BATH_NOTE+' · needs a farmhouse sink base', build:it=>[ ...basin('Bowl','porcelain',[0,0,0,it.w,it.h,it.d],1.25), fx('Apron','porcelain',[0,0,it.d-0.75,it.w,it.h,0.75],{ex:[0,0,1]}) ] });
def({ k:'SK-BAR', cat:'sink', name:'Bar / prep sink 15 × 15', w:15, h:7, d:15, gap:3, y:sinkY(7), fixed:true, note:BATH_NOTE, build:sink1 });
def({ k:'SK-LAU', cat:'sink', name:'Laundry tub, freestanding 24 × 22', w:24, h:34, d:22, y:0, fixed:true, note:BATH_NOTE, build:it=>[ ...basin('Tub','acrylic',[0,22,0,it.w,12,it.d],1.25,[0,.6,0]), ...[[1,1],[it.w-2.5,1],[1,it.d-2.5],[it.w-2.5,it.d-2.5]].map(([x,z],i)=>fx(`Leg ${i+1}`,'steel',[x,0,z,1.5,22,1.5],{ex:[x<it.w/2?-.6:.6,-.4,z<it.d/2?-.6:.6]})) ] });

const itemDef = k => ITEMS.find(i=>i.k===k);
const catOf = k => CATS.find(c=>c.k===k);
/* a fresh item of a kind, at its default size */
function newItem(k){
  const d=itemDef(k); if(!d) return null;
  const it={ k, w:d.w, h:d.h, d:d.d, y: (typeof d.y==='function' ? d.y() : d.y) ?? catOf(d.cat)?.y ?? 0, opt:clone(d.opt||{}) };
  if(d.sized) Object.assign(it, d.sized(it));
  return it;
}
/* every part of an item, with its cut size, edge band and machining */
const mirU = c => { if(!c) return c; const U=c.U, swap=w=>({left:'right',right:'left','left end':'right end','right end':'left end','hinge edge':'hinge edge','opening edge':'opening edge'}[w]||w);
  return { ...c, u:[swap(c.u[1]), swap(c.u[0])], outline:c.outline.map(([u,v])=>[r4(U-u),v]).reverse(),
    ops:c.ops.map(o=>o.u!=null ? {...o, u:r4(U-o.u)} : {...o, u0:r4(U-o.u1), u1:r4(U-o.u0)}) }; };
function partsOf(it){
  const d=itemDef(it.k); if(!d) return [];
  const P=d.build({ ...it, opt:{...(d.opt||{}), ...(it.opt||{})} }).filter(Boolean).map(finishPart);
  if(!!it.mirror !== !!d.mirrored){   // mirrored left ↔ right: hinges, drawers, partitions and names change sides
    const W=it.w, sw=s=>String(s).replace(/\b(left|right|Left|Right)\b/g, w=>({left:'right',right:'left',Left:'Right',Right:'Left'}[w]));
    P.forEach(p=>{ p.box=[W-p.box[0]-p.box[3], ...p.box.slice(1)];
      if(p.hole) p.hole=[W-p.hole[0]-p.hole[2], ...p.hole.slice(1)]; if(p.mesh) p.mirrorW=W; p.ex=[-p.ex[0], p.ex[1], p.ex[2]]; p.name=sw(p.name); p.ops=p.ops.map(sw);
      if(p.cnc && /left|right|hinge|opening/.test(p.cnc.u.join(' ')) && !/end$/.test(p.name)) p.cnc=mirU(p.cnc); });
  }
  return P;
}
/* the cut list: parts grouped by name and size (left/right pairs together when they're cut the same) */
const sigOf = p => p.cnc ? JSON.stringify([p.cnc.outline, p.cnc.ops.map(o=>[o.k,o.u,o.v,o.u0,o.u1,o.v0,o.v1,o.depth])]) : '';
function cutList(it){
  const rows=new Map();
  partsOf(it).filter(p=>!p.hw && !p.solid).forEach(p=>{
    const key=[p.name.replace(/, (left|right)$/,'').replace(/^(Left|Right) end$/,'End').replace(/ \d+( |$)/,' # '),p.cutL,p.cutW,p.band.long,p.band.short,sigOf(p)].join('|');
    const r=rows.get(key); if(r){ r.qty++; r.parts.push(p); } else rows.set(key,{ name:p.name, nom:nomOf(), T:p.T, L:p.cutL, W:p.cutW, fL:p.L, fW:p.W, band:p.band, ops:p.ops, qty:1, parts:[p] });
  });
  return [...rows.values()];
}
/* hardware: grouped by name */
function hardwareOf(it){
  const m=new Map();
  partsOf(it).filter(p=>p.hw).forEach(p=>{
    const nm = p.name==='Hinge' ? hingeSpec().name : p.note || p.name;
    m.set(nm,(m.get(nm)||0)+1);
  });
  return [...m.entries()].map(([name,qty])=>({name,qty}));
}
/* totals for a list of placed items: sheet area, banding length */
function totals(items){
  const area={}, band={len:0};
  items.forEach(it=>partsOf(it).filter(p=>!p.hw && !p.solid).forEach(p=>{ const n=nomOf(); area[n]=(area[n]||0)+p.cutL*p.cutW/144; band.len+=p.bandLen; }));
  const sheet=S.mat.sheet[0]*S.mat.sheet[1]/144;
  return { area, sheets:Object.fromEntries(Object.entries(area).map(([n,a])=>[n, Math.ceil(a*1.12/sheet)])), bandFt:Math.ceil(band.len/12*1.1) };
}
function csv(it, name){
  const rows=[['Part','Qty','Material','Cut length','Cut width','Thickness','Band long edges','Band short edges','Machining']];
  cutList(it).forEach(r=>rows.push([r.name,r.qty,r.nom,fx3(r.L,'in'),fx3(r.W,'in'),fx3(r.T,'in'),r.band.long,r.band.short,r.ops.join('; ')]));
  rows.push([]); rows.push(['Hardware','Qty']); hardwareOf(it).forEach(h=>rows.push([h.name,h.qty]));
  rows.unshift([`${name} — ${fmt(it.w)} W × ${fmt(it.h)} H × ${fmt(it.d)} D (inches)`]);
  return rows.map(r=>r.map(v=>/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:v).join(',')).join('\n');
}
export { fx3, hingeSpec, runnerSpec, handleById, SETTINGS_V, loadFixtures, DEFAULTS, MM, CATS, ITEMS, itemDef, catOf, newItem, partsOf, cutList, hardwareOf, totals, csv, fmt, fmtU, settings, loadSettings, saveSettings, th, nomOf };
