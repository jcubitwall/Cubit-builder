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

import { offset as offsetPaths } from './geom2d.js';
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
  inside:{ set:2, side:1/8 },                                     // inside drawers: fronts set back behind the hinges
  handle:'later',
  handles:[
    { id:'bar128', name:'Bar pull, 128 mm c-c', cc:128*MM, dia:5*MM },
    { id:'bar160', name:'Bar pull, 160 mm c-c', cc:160*MM, dia:5*MM },
    { id:'bar96',  name:'Bar pull, 96 mm c-c',  cc:96*MM,  dia:5*MM },
    { id:'knob',   name:'Knob, one hole',       cc:0,      dia:5*MM } ],
  pullAt:{ edge:2, end:3 },                                          // door handle: in from the opening edge, from the end
  screw:{ name:'Confirmat / #8 screws through the ends', every:8 },
  rod:{ name:'Oval closet rod 1″ with end flanges' },
  // countertops: Cubit makes most of them in ½″ FormX solid surface, cut on the CNC with FormX's own bit and speeds
  counter:{ name:'FormX ½″ solid surface', t:0.5, over:1, end:0.125, lap:0.25, reveal:0.25,
    cnc:{ T:15, name:'FORMX', dia:0.5, S:18000, feed:200, plunge:60, step:0.25, sheet:[30,144], margin:0.5 } },
  // sink bases: the stretchers keep their full width this far in from each side; the sink's hole clears them by `clear`
  sinkBase:{ keep:3, clear:0.25, minStrip:0.5 },
};
const KEY='cubit-casework-settings';
let S = clone(DEFAULTS), remote=false;
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function merge(base, over){ for(const k in over){ if(over[k] && typeof over[k]==='object' && !Array.isArray(over[k]) && base[k] && typeof base[k]==='object') merge(base[k], over[k]); else base[k]=over[k]; } return base; }
/* settings saved before the Mozaik rules are dropped (only the units are kept) */
const upgrade = o => (o && o.v===SETTINGS_V) ? o : { units:o?.units||'in' };
/* the old countertop default (1¼″ quartz) gives way to FormX; a countertop someone set up on purpose stays */
function fixCounter(){ const c=S.counter; if(c && c.name==='Quartz' && Math.abs(c.t-1.25)<1e-6) S.counter=merge(clone(DEFAULTS.counter), {}); return S; }
async function loadSettings(){
  try{ const r=await fetch('api/casework',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ S=merge(clone(DEFAULTS), upgrade(await r.json())); remote=true; return fixCounter(); } }catch(e){}
  try{ S=merge(clone(DEFAULTS), upgrade(JSON.parse(localStorage.getItem(KEY)||'{}'))); }catch(e){}
  return fixCounter();
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
/* where a part sits in the cabinet: at(o, eu, ev, n) = origin of (u,v)=(0,0) on the face that is up, the u and v
   directions, and that face's outward normal (eu × ev = n, so the drawing is the face as you look at it) */
const at = (o, eu, ev, n) => ({ o, eu, ev, n });
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
  if(p.mirrorCnc && p.cnc){ p.cnc=mirU(p.cnc); delete p.mirrorCnc; }
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
/* where a docked sink's hole crosses a sink base's stretchers (it.sinkCut, set by furniture.js, in the cabinet's
   coordinates seen from the front: x0..x1 across, z0..z1 from the back). Returns the stretchers' notch along u
   (u runs from the right end) and how much of each stretcher's width is left, or null. */
function sinkCutOf(it, c, { T, e, pw, D, zbF, cl, sw }){
  const sc=it.sinkCut; if(!sc || c.top!=='stretchers') return null;
  const SB=S.sinkBase, W=it.w, mir = !!it.mirror !== !!itemDef(it.k)?.mirrored;
  let x0=sc.x0-SB.clear, x1=sc.x1+SB.clear; if(mir){ [x0,x1]=[W-x1, W-x0]; }    // built as drawn, mirrored afterwards
  x0=Math.min(x0, SB.keep); x1=Math.max(x1, W-SB.keep);                       // the full width stays only `keep` in from the sides
  x0=Math.max(x0, T+0.25); x1=Math.min(x1, W-T-0.25);
  const xR=T-e+pw, ua=r4(Math.max(0.5, xR-x1)), ub=r4(Math.min(pw-0.5, xR-x0));
  const zFront=it.d-T, zFS=zFront-sw;                                          // front stretcher: z zFS..zFront (item z, from the back)
  const zRB=zFront-(zbF-cl), zRF=zRB+sw;                                        // rear stretcher: z zRB..zRF
  const keepF=r4(Math.max(0, Math.min(sw, zFront-(sc.z1+SB.clear)))), keepR=r4(Math.max(0, Math.min(sw, (sc.z0-SB.clear)-zRB)));
  return { u:[ua,ub], keepF, keepR };
}
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
    cnc:{ U:pw, V:D, u:['left end','right end'], v:['front','back'], up:'top face (inside)', outline:notchedO(pw,D,e,stop+cl,bn), at:at([T-e,yb+T,zOf(0)],[1,0,0],[0,0,-1],[0,1,0]),
      ops:[{ k:'groove', u0:0, u1:pw, v0:r4(D-bi-dw), v1:r4(D-bi), depth:dd, tool:'½″', side:'A', what:'Back groove' }] } }));
  // top: full (uppers, talls) or two flat stretchers (bases)
  if(c.top==='stretchers'){
    const sw=S.stretcher.w;
    dado('Front stretcher dado', stop, sw+cl, H-dw, H);
    dado('Rear stretcher dado', zbF-cl-sw, zbF-cl, H-dw, H);
    // a sink base with a sink docked: both stretchers are narrowed over the sink's hole (+ clearance), keeping their full
    // width `sinkBase.keep` in from each side; where too little would be left, the middle comes out and the two ends stay
    const cut=sinkCutOf(it, c, { T, e, pw, D, zbF, cl, sw });
    const stretcher=(name, x0u, U, outline, atO, ex, z0)=>part(name,'carcass','carcass',[atO[0]-U,H-T,z0,U,T,sw],'y',{ex,
      cnc:{ U, V:sw, u:['right end','left end'], v:['front','back'], up:'underside', outline, ops:[], at:at(atO,[-1,0,0],[0,0,-1],[0,-1,0]) } });
    const front=notchedO(pw,sw,e,stop+cl,0), rear=rectO(pw,sw), xR=T-e+pw;
    const pieces=(name, base, keepV, fromFront, z0, ex)=>{
      if(!cut || keepV>=sw-1e-6){ P.push(stretcher(name, 0, pw, base, [xR,H-T,fromFront?zOf(0):zOf(zbF-cl-sw)], ex, z0)); return; }
      const [ua,ub]=cut.u;
      if(keepV>=S.sinkBase.minStrip){   // narrowed over the sink
        const o = fromFront ? [[e,0],[pw-e,0],[pw-e,stop+cl],[pw,stop+cl],[pw,sw],[ub,sw],[ub,keepV],[ua,keepV],[ua,sw],[0,sw],[0,stop+cl],[e,stop+cl]]
                            : [[0,0],[ua,0],[ua,sw-keepV],[ub,sw-keepV],[ub,0],[pw,0],[pw,sw],[0,sw]];
        const p=stretcher(name, 0, pw, o, [xR,H-T,fromFront?zOf(0):zOf(zbF-cl-sw)], ex, z0);
        p.note=`Narrowed to ${fx3(keepV)} over the sink, full width ${fx3(Math.min(ua, pw-ub)+T-e)} in from each side`; P.push(p); return; }
      // the middle comes out: two ends
      const zO=fromFront?zOf(0):zOf(zbF-cl-sw);
      const r=fromFront ? [[e,0],[ua,0],[ua,sw],[0,sw],[0,stop+cl],[e,stop+cl]] : rectO(ua,sw);
      const lU=pw-ub, l=fromFront ? [[0,0],[lU-e,0],[lU-e,stop+cl],[lU,stop+cl],[lU,sw],[0,sw]] : rectO(lU,sw);
      const pr=stretcher(name.replace('stretcher','stretcher, right end'), 0, ua, r, [xR,H-T,zO], ex, z0);
      const pl=stretcher(name.replace('stretcher','stretcher, left end'), 0, lU, l, [xR-ub,H-T,zO], ex, z0);
      pr.note=pl.note='The middle is cut out for the sink: only the ends are fitted'; P.push(pr, pl); };
    pieces('Front stretcher', front, cut?cut.keepF:sw, true, zOf(sw), [0,1,.4]);
    pieces('Rear stretcher', rear, cut?cut.keepR:sw, false, zOf(zbF-cl), [0,1,-.4]);
  } else {
    dado('Top dado', stop, zbF-cl, H-dw, H);
    P.push(part('Top','carcass','carcass',[T-e,H-T,zOf(zbF),pw,T,zbF],'y',{ex:[0,1,0],
      cnc:{ U:pw, V:zbF, u:['right end','left end'], v:['front','back'], up:'underside (inside)', outline:notchedO(pw,zbF,e,stop+cl,2*cl), ops:[], at:at([T-e+pw,H-T,zOf(0)],[-1,0,0],[0,0,-1],[0,-1,0]) } }));
  }
  // fixed shelves: same as a top, at their underside height
  (c.fixed||[]).forEach((fy,i,arr)=>{ dado(arr.length>1?`Fixed shelf ${i+1} dado`:'Fixed shelf dado', stop, zbF-cl, fy, fy+dw);
    P.push(part(arr.length>1?`Fixed shelf ${i+1}`:'Fixed shelf','shelf','carcass',[T-e,fy,zOf(zbF),pw,T,zbF],'y',{ex:[0,0,.5],
      cnc:{ U:pw, V:zbF, u:['left end','right end'], v:['front','back'], up:'top face', outline:notchedO(pw,zbF,e,stop+cl,2*cl), ops:[], at:at([T-e,fy+T,zOf(0)],[1,0,0],[0,0,-1],[0,1,0]) } })); });
  // the back: in the ends' back dados and the bottom's groove, up to the top of the ends
  const bh = H - backY;
  endOps.push({ k:'dado', u0:r4(D-bi-dw), u1:r4(D-bi), v0: kh ? 0 : r4(backY), v1:H, depth:dd, tool:'½″', side:'A', what:'Back dado' });
  P.push(part('Back','back','carcass',[T-e,backY,bi,pw,bh,T],'z',{ex:[0,0,-1],
    cnc:{ U:pw, V:bh, u:['left end','right end'], v:['bottom','top'], up:'front face', outline:rectO(pw,bh), ops:[], at:at([T-e,backY,bi+T],[1,0,0],[0,1,0],[0,0,1]) } }));
  // toe kick board: between the ends (butt joint), set back
  if(kh) P.push(part('Toe kick','carcass','carcass',[T,0,zOf(ks+T),iw,kh,T],'z',{ex:[0,-.6,1],
    cnc:{ U:iw, V:kh, u:['left','right'], v:['bottom','top'], up:'front face', outline:rectO(iw,kh), ops:[], at:at([T,0,zOf(ks)],[1,0,0],[0,1,0],[0,0,1]) }, note:'Screwed between the ends, behind the toe notch' }));
  // partitions (benches): stand on the bottom, under the top, in dados in both
  (c.parts||[]).forEach((px,i)=>{ const v0=yb+T-e, v1=H-T+e, ph=v1-v0;
    const bot=P.find(p=>p.name==='Bottom'), top=P.find(p=>p.name==='Top');
    [bot,top].forEach(q=>{ if(!q) return; let a=px-T/2-(T-e)-S.dado.fit/2, b=px+T/2-(T-e)+S.dado.fit/2; if(q===top){ [a,b]=[pw-b,pw-a]; }
      q.cnc.ops.push({ k:'dado', u0:r4(a), u1:r4(b), v0:stop, v1:r4(q.cnc.V-cl), depth:dd, tool:'½″', side:'A', what:`Partition ${i+1} dado` }); });
    P.push(part(`Partition ${i+1}`,'carcass','carcass',[px-T/2,v0,zOf(zbF),T,ph,zbF],'x',{ex:[0,0,.3],
      cnc:{ U:zbF, V:ph, u:['front','back'], v:['bottom','top'], up:'right face', outline:notchedO(ph,zbF,e,stop+cl,2*cl).map(([a,b])=>[b,a]), ops:[], at:at([px+T/2,v0,zOf(0)],[0,0,-1],[0,1,0],[1,0,0]) } })); });
  // adjustable shelves: spread over the open heights, each on 4 pins; 7 holes per pin row centred on it
  const opening = (a,b) => [a,b];
  const zones0=[]; { let lo=yb+T; [...(c.fixed||[])].sort((a,b)=>a-b).forEach(fy=>{ zones0.push(opening(lo,fy)); lo=fy+T; }); zones0.push(opening(lo, c.top==='stretchers' ? H-T : H-T)); }
  const zones = zones0.filter(([a])=>a >= (c.adjFrom ?? -1e9) - 1e-6);   // adjFrom: no shelves below it (drawers there)
  const adj = typeof c.adj==='number' ? c.adj : 0, shelfY=[];
  if(adj>0){ const tot=zones.reduce((s,[a,b])=>s+(b-a),0);
    let left=adj; zones.forEach(([a,b],zi)=>{ const n = zi===zones.length-1 ? left : Math.round(adj*(b-a)/tot); left-=n;
      const gap=(b-a-n*T)/(n+1); for(let k=0;k<n;k++){ const sy=a+gap*(k+1)+T*k; shelfY.push(sy);
        const su=iw-2*S.shelf.side, sv=zbF-S.shelf.back;
        P.push(part('Adjustable shelf','shelf','carcass',[T+S.shelf.side,sy,zOf(zbF-S.shelf.back),su,T,sv],'y',{ex:[0,0,.6], band:{long:1,short:0},
          cnc:{ U:su, V:sv, u:['left','right'], v:['front','back'], up:'top face', outline:rectO(su,sv), ops:[], at:at([T+S.shelf.side,sy+T,zOf(0)],[1,0,0],[0,0,-1],[0,1,0]) } })); } }); }
  const pinU=[S.pins.front, D-S.pins.back], g=S.shelf.group, half=(g-1)/2;
  shelfY.forEach((sy,si)=>pinU.forEach(u=>{ for(let k=-half;k<=half;k++){ const v=sy+k*S.pins.pitch; if(v>yb+T+0.4 && v<H-T-0.4) endOps.push({ k:'hole', u:r4(u), v:r4(v), d:S.pins.dia, depth:S.pins.depth, side:'A', what:'Shelf pin holes' }); } }));
  // the ends (left and right), inside face up; toe notch at the front-bottom, small notch at the back-bottom
  const endO = kh ? [[ks,0],[D-S.kick.rearW,0],[D-S.kick.rearW,kh-S.kick.rearBelow],[D,kh-S.kick.rearBelow],[D,H],[0,H],[0,kh],[ks,kh]] : rectO(D,H);
  const mkEnd=(nm,x,ex,o,n)=>part(nm,'carcass','carcass',[x,0,zOf(D),T,H,D],'x',{ex, band:{long:1,short:0}, notch: kh?[ks,kh,D]:null,
    cnc:{ U:D, V:H, u:['front','back'], v:['bottom','top'], up:'inside face', outline:endO, ops:endOps.map(o=>({...o})), at:at(o,[0,0,-1],[0,1,0],n) } });
  const L=mkEnd('Left end',0,[-1,0,0],[T,0,zOf(0)],[1,0,0]), R=mkEnd('Right end',W-T,[1,0,0],[W-T,0,zOf(0)],[-1,0,0]);
  R.mirrorCnc=true;   // its inside face looks the other way: drawn (and cut) as the mirror of the left end, front on the right
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
    cnc:{ U, V, u:[side==='L'?'opening edge':'hinge edge', side==='L'?'hinge edge':'opening edge'], v:['bottom','top'], up:'back face (inside)', outline:rectO(U,V), ops, at:at([x1,y0,c.front-T],[-1,0,0],[0,1,0],[0,0,-1]) } });
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
    cnc:{ U, V, u:['right','left'], v:['bottom','top'], up:'back face (inside)', outline:rectO(U,V), ops: fixedFront ? [] : handleOps(U,V,hid,'drawer'), at:at([x1,y0,c.front-T],[-1,0,0],[0,1,0],[0,0,-1]) }, note: fixedFront?'Screwed to the front stretcher, no box':'' });
  out.push(fr); if(fixedFront) return out;
  if(hid && handleById(hid)) out.push(part('Handle','hw','buy',[x0+U/2-2,y1-2.75,c.front,4,0.5,0.9],'z',{ex:[0,0,3.6], hw:true, note:handleById(hid).name}));
  const R=runnerSpec(), Dr=S.drawer, avail=c.zbF-(c.inset||0)-0.5, len=[...R.lens].sort((a,b)=>b-a).find(l=>l<=avail) || Math.min(...R.lens);
  const ox0=bay?bay[0]:c.ix0, ox1=bay?bay[1]:c.ix1, ow=ox1-ox0, bw=ow-R.clear, L=len+R.boxPlus;
  const sh=[...Dr.sides].sort((a,b)=>b-a).find(h=>h<=V-1.75) || Math.min(...Dr.sides);
  const by=Math.max(y0, c.y0)+0.5, bx=ox0+R.clear/2, bz=c.front-T-L;
  const fbU=bw-2*T+2*Dr.tongue, fbV=sh-Dr.groove-T-Dr.topDrop, botU=bw-2*T+2*Dr.grooveDepth;
  const sideOps = s => [
    { k:'groove', u0:0, u1:r4(L), v0:Dr.groove, v1:r4(Dr.groove+T+S.dado.fit), depth:Dr.grooveDepth, tool:'½″', side:'A', what:'Bottom groove' },
    { k:'dado', u0:Dr.dadoIn, u1:r4(Dr.dadoIn+Dr.dadoW), v0:Dr.groove, v1:r4(sh-Dr.topDrop), depth:Dr.dadoDepth, tool:'¼″', side:'A', what:'Front dado' },
    { k:'dado', u0:r4(L-Dr.dadoIn-Dr.dadoW), u1:r4(L-Dr.dadoIn), v0:Dr.groove, v1:r4(sh-Dr.topDrop), depth:Dr.dadoDepth, tool:'¼″', side:'A', what:'Back dado' } ];
  [['left',bx],['right',bx+bw-T]].forEach(([s,x])=>out.push(part(`${name} box side, ${s}`,'drawer','carcass',[x,by,bz,T,sh,L],'x',{ex:[s==='left'?-.5:.5,0,1.6], band:{long:1,short:0},
    cnc:{ U:L, V:sh, u: s==='left'?['front','back']:['back','front'], v:['bottom','top'], up:'inside face', outline:rectO(L,sh), ops:sideOps(s),
      at: s==='left' ? at([x+T,by,bz+L],[0,0,-1],[0,1,0],[1,0,0]) : at([x,by,bz],[0,0,1],[0,1,0],[-1,0,0]) } })));
  const fb = (nm, z) => { const isF=nm.includes('front'), x0=bx+T-Dr.tongue, y0=by+Dr.groove+T; return part(nm,'drawer','carcass',[x0,y0,z,fbU,fbV,T],'z',{ex:[0,0,isF?2.1:1.1], band:{long:1,short:0},
    cnc:{ U:fbU, V:fbV, u: isF?['right','left']:['left','right'], v:['bottom','top'], up:'inside face', outline:rectO(fbU,fbV),
      at: isF ? at([x0+fbU,y0,z],[-1,0,0],[0,1,0],[0,0,-1]) : at([x0,y0,z+T],[1,0,0],[0,1,0],[0,0,1]),
      ops:[ { k:'rabbet', u0:0, u1:Dr.dadoIn+Dr.dadoW-0.01, v0:0, v1:r4(fbV), depth:r4(T-Dr.tongue), tool:'¼″', side:'A', what:'Tongue rabbet, left end' },
            { k:'rabbet', u0:r4(fbU-(Dr.dadoIn+Dr.dadoW-0.01)), u1:r4(fbU), v0:0, v1:r4(fbV), depth:r4(T-Dr.tongue), tool:'¼″', side:'A', what:'Tongue rabbet, right end' } ] }, note:'Sits on the drawer bottom' }); };
  out.push(fb(`${name} box front`, c.front-T-T-0.0), fb(`${name} box back`, bz));
  out.push(part(`${name} box bottom`,'drawer','carcass',[bx+T-Dr.grooveDepth,by+Dr.groove,bz,botU,T,L],'y',{ex:[0,-.6,1.6],
    cnc:{ U:botU, V:L, u:['left','right'], v:['back','front'], up:'underside', outline:rectO(botU,L), ops:[], at:at([bx+T-Dr.grooveDepth,by+Dr.groove,bz],[1,0,0],[0,0,1],[0,-1,0]) }, note:'Slides into the side grooves, full length' }));
  // runner holes on both ends, one row per drawer
  const rowY = by + R.rowAbove, us=[...R.front.map(m=>m*MM), ...R.rear.map(m=>len*25.4 - m).map(m=>m*MM)].map(u=>u+(c.inset||0));   // inside drawers: set back behind the doors
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
/* drawers INSIDE a cabinet with doors (wardrobes): fronts between the ends, set back behind the hinges
   (S.inside.set), runners and their holes set back with them; y0..y1 = the stack, bottom to top */
function insideDrawers(c, y0, y1, n, hid, first, set=S.inside.set){
  const T=T_(), g=S.fronts.gap, cc={ ...c, front:c.D-set, inset:T+set };     // set 0: flush with the box front (open units)
  const hs=split(y1-y0, n, first);
  const out=[]; let y=y1;
  hs.forEach((hh,i)=>{ out.push(...drawer(cc, `Inside drawer ${i+1}`, c.ix0+S.inside.side, c.ix1-S.inside.side, y-hh, y, false, hid)); y-=hh+g; });
  return out;
}
/* a closet rod across the inside, under a shelf at y (its flanges screw to the ends) */
const rod = (c, y, nm='Closet rod') => part(nm,'hw','buy',[c.ix0,y-1.75,c.zb+(c.D-c.zb)/2-0.5,c.ix1-c.ix0,1,1],'y',{ex:[0,0,.8], hw:true, note:`${S.rod.name}, ${fmtU(c.ix1-c.ix0)}`});
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
  { k:'heat',      name:'Heat pumps',        y:0 },
  { k:'baseboard', name:'Baseboard heaters', y:1 },
  { k:'plumb',     name:'Water heaters & plumbing', y:0 },
  { k:'elec',      name:'Electrical panels', y:48 },
  { k:'tv',        name:'TVs',               y:0 },
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
    if(ins==='drawers'){ P.push(...insideDrawers(c, kh+t+0.25, kh+28-0.25, 3, hid)); rod(shelfY-2); }
    const [f0,f1]=frontSpan('tall',c,H); P.push(...doors(c,W,f0,f1,'mid','Door',hid));
    return P; } });

/* ---------------------------------------------------------------- the wardrobe system
   Separate boxes that stand side by side to make a wall of wardrobe (each is a complete Mozaik-built cabinet, so
   every one cuts, drills and nests like the kitchen cabinets). 23½″ box + doors (23½ so two 84″ ends fit across
   one 48″ sheet, which 23⅝ just misses), 84 / 90 / 96″ tall, 4″ toe kick,
   a fixed shelf in dados near the top (and wherever a unit needs stiffening), adjustable shelves on pins, closet
   rods under shelves, drawers inside behind the doors (set back past the hinges) or outside below them.
   Every unit can be "Open" (no doors, as a walk-in closet). Top boxes stand on top to reach a high ceiling. */
const WR_W=[15,18,21,24,30,33,36,42,48], WR_H=[72,84,90,96];
const wrBase = { cat:'wardrobe', w:36, h:84, d:24.1, wR:[12,48], hR:[60,108], sizes:WR_W, hSizes:WR_H };
const frontOpt = ['front','Front',['doors','open']];
const isOpen = it => it.opt.front==='open';
/* a wardrobe box: c = carcass; adds its doors (full height above `doorFrom`) unless open */
function wrBox(it, cfg){ return carcass(it, { kick:true, top:'full', doors:!isOpen(it), ...cfg }); }
function wrDoors(c, it, from){ if(isOpen(it)) return []; const [f0,f1]=frontSpan('tall',c,it.h); return doors(c, it.w, from ?? f0, f1, 'mid', 'Door', hidOf(it)); }
const topShelf = it => it.h - 14;                       // the hat shelf, 14″ under the top
def({ ...wrBase, k:'WRH', name:'Wardrobe · hanging', note:'Long hanging (dresses, coats) under a hat shelf.', opts:[frontOpt], opt:{front:'doors'},
  build: it => { const c=wrBox(it,{ fixed:[topShelf(it)] }); return [...c.parts, rod(c, topShelf(it)), ...wrDoors(c,it)]; } });
def({ ...wrBase, k:'WRDH', name:'Wardrobe · double hanging', note:'Shirts and jackets on two rods.', opts:[frontOpt], opt:{front:'doors'},
  build: it => { const T=th(), mid=Math.round(((S.kick.h+T)+topShelf(it))/2), c=wrBox(it,{ fixed:[mid, topShelf(it)] });
    return [...c.parts, rod(c, topShelf(it), 'Closet rod, upper'), rod(c, mid, 'Closet rod, lower'), ...wrDoors(c,it)]; } });
def({ ...wrBase, k:'WRS', w:18, name:'Wardrobe · shelves', note:'Folded clothes: adjustable shelves, a fixed shelf in the middle for stiffness.', opts:[frontOpt,['shelves','Shelves',[3,4,5,6]]], opt:{front:'doors', shelves:4},
  build: it => { const c=wrBox(it,{ fixed:[Math.round(it.h/2)], adj:it.opt.shelves??4 }); return [...c.parts, ...wrDoors(c,it)]; } });
def({ ...wrBase, k:'WRHD', name:'Wardrobe · hanging over drawers', note:'Drawers inside, behind the doors; short hanging above.', opts:[frontOpt,['drawers','Drawers',[2,3,4]]], opt:{front:'doors', drawers:3},
  build: it => { const T=th(), n=it.opt.drawers??3, top=S.kick.h+T+n*8.5, c=wrBox(it,{ fixed:[top, topShelf(it)] });
    const dr = insideDrawers(c, S.kick.h+T+0.25, top-0.25, n, hidOf(it), 0, isOpen(it) ? 0 : S.inside.set);
    return [...c.parts, ...dr, rod(c, topShelf(it)), ...wrDoors(c,it)]; } });
def({ ...wrBase, k:'WRSD', w:24, name:'Wardrobe · shelves over drawers', note:'Drawers inside at the bottom, adjustable shelves above.', opts:[frontOpt,['drawers','Drawers',[2,3,4]],['shelves','Shelves',[2,3,4]]], opt:{front:'doors', drawers:3, shelves:3},
  build: it => { const T=th(), n=it.opt.drawers??3, top=S.kick.h+T+n*8.5, c=wrBox(it,{ fixed:[top], adj:it.opt.shelves??3, adjFrom:top });
    const dr = insideDrawers(c, S.kick.h+T+0.25, top-0.25, n, hidOf(it), 0, isOpen(it) ? 0 : S.inside.set);
    return [...c.parts, ...dr, ...wrDoors(c,it)]; } });
def({ ...wrBase, k:'WRDD', w:24, name:'Wardrobe · drawers under doors', note:'Drawer fronts outside at the bottom, doors and shelves above.', opts:[['drawers','Drawers',[2,3,4]],['shelves','Shelves',[2,3,4]]], opt:{drawers:3, shelves:3},
  build: it => { const T=th(), g=S.fronts.gap, n=it.opt.drawers??3, top=S.kick.h+n*8.5+0.5, c=carcass(it,{ kick:true, top:'full', fixed:[top], adj:it.opt.shelves??3, adjFrom:top }), hid=hidOf(it);
    const [f0,f1]=frontSpan('tall',c,it.h);
    return [...c.parts, ...drawerStack(c, 0, it.w, f0, top+T/2-g/2, split(top+T/2-g/2-f0, n), hid), ...doors(c, it.w, top+T/2+g/2, f1, 'mid', 'Door', hid)]; } });
def({ ...wrBase, k:'WRT', w:36, h:16, y:84, wR:[12,48], hR:[10,30], hSizes:[12,16,20,24], name:'Wardrobe · top box', note:'Stands on a wardrobe unit to reach the ceiling; seasonal storage.', opts:[frontOpt], opt:{front:'doors'},
  build: it => { const c=carcass(it,{ kick:false, top:'full', doors:!isOpen(it) }); if(isOpen(it)) return c.parts; const [f0,f1]=frontSpan('upper',c,it.h); return [...c.parts, ...doors(c, it.w, 0, f1, 'bottom', 'Door', hidOf(it))]; } });

/* whole wardrobe walls: units side by side (each its own box), like the inspiration photos */
const WALLS = {
  'Five doors': { note:'Hanging over drawers · shelves · hanging over wide drawers · shelves', units:[['WRHD',36],['WRS',18],['WRHD',36,{drawers:3}],['WRS',18]] },
  'Walk-in, open': { front:'open', note:'Open: hanging over drawers · shelves over drawers · double hanging · double hanging · shelves', units:[['WRHD',30,{drawers:3}],['WRSD',30,{drawers:2,shelves:3}],['WRDH',24],['WRDH',36],['WRS',24,{shelves:4}]] },
  'Floor to ceiling': { tops:true, note:'Drawers under doors · hanging · double hanging · hanging · shelves, with top boxes', units:[['WRDD',18],['WRH',30],['WRDH',30],['WRH',30],['WRS',18]] },
  'Compact': { note:'Hanging · shelves over drawers', units:[['WRH',30],['WRSD',24]] },
};
const wallW = it => (WALLS[it.opt?.layout]||WALLS['Five doors']).units.reduce((a,u)=>a+u[1],0);
def({ cat:'wardrobe', k:'WRW', name:'Wardrobe wall', w:108, h:84, d:24.1, wR:[24,240], hR:[72,96], sizes:null, hSizes:[84,90,96],
  note:'Separate units side by side, each cut as its own box. Change the layout to try the others; build your own from the single units.',
  opts:[['layout','Layout',Object.keys(WALLS)],['tops','Top boxes',['no','16″','24″']]], opt:{layout:'Five doors', tops:'no'},
  sized: it => ({ w: wallW(it) }),
  build: it => { const L=WALLS[it.opt.layout]||WALLS['Five doors'], n=L.units.length, out=[]; let x=0;
    const tops = it.opt.tops==='no' ? (L.tops ? 16 : 0) : parseFloat(it.opt.tops)||0;
    const H = it.h - (tops ? tops : 0);
    L.units.forEach(([k,w,o],i)=>{ const d=itemDef(k), sub={ k, w, h:H, d:it.d, opt:{ ...(d.opt||{}), ...(L.front?{front:L.front}:{}), ...(o||{}), handle:it.opt.handle } };
      const shift=(P, dy=0)=>P.filter(Boolean).forEach(p=>{ p.box=[p.box[0]+x, p.box[1]+dy, ...p.box.slice(2)]; if(p.cnc?.at) p.cnc.at={...p.cnc.at, o:[p.cnc.at.o[0]+x, p.cnc.at.o[1]+dy, p.cnc.at.o[2]]};
        p.name=`U${i+1} ${p.name}`; p.ex=[p.ex[0]+(i-(n-1)/2)*0.35, p.ex[1], p.ex[2]]; out.push(p); });
      shift(d.build(sub));
      if(tops){ const td=itemDef('WRT'); shift(td.build({ k:'WRT', w, h:tops, d:it.d, opt:{ front:L.front||'doors', handle:it.opt.handle } }), H); }
      x+=w; });
    return out; } });

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
/* the tallest a cabinet can be and still be stood up in the room: tipped up from lying on its back, its diagonal
   (height × depth) must clear the ceiling. Pod ceiling: 106.6″ (underside of the interior ceiling) less the top of the
   interior floor (6.08 + 4.48) = 96.04″ clear; 3/4″ kept spare. */
const CEILING = 106.6 - (6.08 + 4.48), ERECT_SPARE = 0.75;
const erectH = d => Math.floor((Math.sqrt(CEILING*CEILING - d*d) - ERECT_SPARE)*4)/4;
/* an open, modern bookshelf for where two pod walls meet: 15″ wide covers the joint and the finished panel edges.
   Box dados like every cabinet, evenly spaced FIXED shelves (stiff and clean), back in its dado, no doors. As tall as
   it can be and still tip up under the ceiling (diagonal), unless set lower. */
def({ k:'BJ', cat:'shelf', name:'Bookshelf, wall joint', w:15, d:12, h:erectH(12), wR:[9,36], hR:[30,96], dR:[8,16], sizes:[12,15,18,24], dSizes:[10,12,14],
  hSizes:[72,84,erectH(12)], note:`15″ wide covers where two walls meet. ${erectH(12)}″ tall: the most that still tips up under the ${CEILING.toFixed(2)}″ ceiling with ${ERECT_SPARE}″ to spare.`,
  opts:[['openings','Openings',[5,6,7,8]],['kick','Toe kick',[4,2.5,0]]], opt:{openings:6, kick:4},
  build: it => { const T=th(), H=Math.min(it.h, erectH(it.d)), kh=it.opt.kick??4, n=it.opt.openings??6;
    const lo=kh+T, hi=H-T, step=(hi-lo-(n-1)*T)/n, fixed=[...Array(n-1)].map((_,i)=>r4(lo+step*(i+1)+T*i));
    const c=carcass({ ...it, h:H, opt:{ ...it.opt, kick:kh } }, { kick:kh>0, top:'full', fixed, doors:false });
    return c.parts.map(p=>{ if(/Fixed shelf/.test(p.name)) p.band={long:1,short:0}; return p; }); } });
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
const fireInsertY = (it, I) => Math.min(18, it.h-I.h-4);
const INSERTS = { 50:{w:50, h:16.5, d:5.75}, 60:{w:60, h:16.5, d:5.75}, 72:{w:72, h:16.5, d:5.75} };
def({ k:'FP', cat:'fire', name:'Fireplace surround, linear electric', w:72, h:40, d:16, wR:[48,120], sizes:[60,72,84,96], hSizes:[30,36,40,48,84,96], dSizes:[14,16,18],
  opts:[['insert','Insert',['50','60','72']], ['power','Power',['Plug','Hardwired']]], opt:{insert:'60', power:'Plug'},
  build: it => { const I=INSERTS[it.opt.insert]||INSERTS[60]; const W=it.w, H=it.h, t=th();
    const iy=fireInsertY(it, I), fy=iy-t;
    const c=carcass(it,{kick:true, top:'full', fixed:[fy]}); const { parts:P, dc } = c;
    const fw=Math.min(I.w, W-2*t-2), fx=(W-fw)/2;
    const face=part('Face panel','front','carcass',[0,S.kick.h,dc,W,H-S.kick.h,th()],'z',{ex:[0,0,2], band:{long:2,short:2}, ops:[`Cut-out for the insert ${fmtU(fw)} × ${fmtU(I.h)} (check the insert's own cut-out size)`, 'Cut back face up']});
    face.hole=[fx, iy, fw, I.h]; P.push(face);
    P.push({ ...solid(`Electric insert ${I.w}″`, 'appliance', [fx, iy, dc-I.d+0.75, fw, I.h, I.d], [0,0,3.2]), note:'Generic linear electric insert, check the model’s size and clearances' });
    return P; } });

/* a product adopted from a store catalogue (stores.js) into the Cubit library: a fixed-size item drawn from its
   size and kind. Fireplaces: a linear / built-in insert or a firebox is also offered as an Insert in the surround
   (FP), so the surround's cut-out fits that exact unit. */
function defStoreItem(cat, P){
  const k=`HD${P.sku}`; if(ITEMS.some(x=>x.k===k)) return ITEMS.find(x=>x.k===k);
  const kind=P.kind||'box', y = kind==='linear' ? 36 : kind==='insert'||kind==='firebox' ? 18 : 0;
  const note=`${P.brand} ${P.model} · ${P.store||'store'} SKU ${P.sku}${P.price?` · $${P.price}`:''}${P.power?` · ${P.power}`:''}${P.note?` · ${P.note}`:''}`;
  const d={ k, cat, name:P.name, w:+P.w, h:+P.h, d:+P.d, fixed:true, y, note, store:{ id:P.storeId, sku:P.sku, url:P.url, price:P.price },
    build: it => { const W=it.w, H=it.h, D=it.d;
      if(kind==='mantel'){ const ow=Math.min(24, W*0.55), oh=Math.min(20, H*0.55);
        return [ solid('Mantel','furnwood',[0,0,0,W,H,D],[0,0,0]), solid('Firebox glass','screen',[(W-ow)/2,6,D-0.2,ow,oh,0.4],[0,0,1.5]), solid('Mantel shelf','furnwood2',[-1,H-1.5,-0.5,W+2,1.5,D+1.5],[0,1.2,0]) ]; }
      if(kind==='stove') return [ solid('Stove body','appliance',[2,4,1,W-4,H-6,D-2],[0,0,0]), solid('Top','appliance',[0,H-2,0,W,2,D],[0,1,0]), solid('Base','appliance',[1,0,1,W-2,4,D-2],[0,-0.5,0]), solid('Glass door','screen',[W*0.2,H*0.3,D-1,W*0.6,H*0.4,0.3],[0,0,1.5]) ];
      const fr=Math.min(1.5, H*0.08);
      return [ solid('Body','appliance',[0,0,0,W,H,D-0.4],[0,0,0]), solid('Glass','screen',[fr,fr,D-0.4,W-2*fr,H-2*fr,0.4],[0,0,1.5]) ]; } };
  def(d);
  // fireplaces that go into a framed opening: an Insert choice in the surround too
  if(cat==='fire' && P.recess){ const fp=ITEMS.find(x=>x.k==='FP'); INSERTS[k]={ w:+P.w, h:+P.h, d:+P.d, name:`${P.brand} ${P.model}` };
    const o=fp?.opts?.find(o=>o[0]==='insert'); if(o && !o[2].includes(k)) o[2].push(k); }
  return ITEMS[ITEMS.length-1];
}
/* the fireplace insert's power, where it goes in the wall behind the surround (electrical.js places it and it moves with
   the fireplace): Plug → a receptacle, Hardwired → a junction box, either way inside the insert's cavity, to one
   side of the insert, half way up it, on its own circuit. { hard, y (from the floor under the surround), off (from
   the middle, along the wall), half (how far either side of the middle it may go) } */
function firePower(it){
  if(it.k!=='FP') return null;
  const I=INSERTS[it.opt?.insert]||INSERTS[60], t=th(), fw=Math.min(I.w, it.w-2*t-2);
  return { hard:/^hard/i.test(it.opt?.power||''), y:Math.round(fireInsertY(it, I)+I.h/2), off:Math.max(0, fw/2-6), half:Math.max(2, fw/2-2), insert:I.w };
}
/* countertops */
/* countertops: ½″ FormX by default (shop settings). Placed on base cabinets, they fit themselves (furniture.js):
   back to the wall, ⅛″ past each end that isn't against a wall or a tall unit (a range end too), 1″ past the front
   of the boxes (so the doors are still about ¼″ under). Sinks docked under them get their hole, exact for the CNC:
   it.sinks = [{ x0, x1, z0, z1, mount, name }] in the countertop's own coordinates (x from its left end, z from the back). */
def({ k:'CT', cat:'counter', name:'Countertop', w:48, h:0.5, d:24.625, wR:[12,144], hR:[0.25,2], dR:[12,40], sizes:[24,36,48,60,72,96,120], dSizes:[22,24.625,25.5,26], opts:[['splash','Backsplash',['none','4″']]], opt:{splash:'none'},
  sized: it => ({ h:S.counter.t }),
  build: it => { const T=it.h, W=it.w, D=it.d, holes=(it.sinks||[]).filter(h=>h.x1>h.x0+1 && h.z1>h.z0+1);
    const name=`${S.counter.name}`;
    const top=part('Countertop','top','counter',[0,0,0,W,T,D],'y',{ ex:[0,1,0],
      note:`${name} ${fmtU(T)}${holes.length?' · '+holes.map(h=>`${h.mount==='top'?'top mount':'bottom mount'} sink: hole ${fx3(h.x1-h.x0)} × ${fx3(h.z1-h.z0)}`).join(' · '):''}`,
      cnc:{ U:W, V:D, u:['left end','right end'], v:['front','back'], up:'top face', outline:rectO(W,D),
        ops: holes.flatMap(h=>(h.paths?.length ? h.paths.map(P=>({ path:P.map(([x,z])=>[r4(x), r4(D-z)]) })) : [{}]).map(extra=>({ k:'cutout', u0:r4(h.x0), u1:r4(h.x1), v0:r4(D-h.z1), v1:r4(D-h.z0), r:h.r||0, ...extra, thru:true, depth:T, tool:'FormX', side:'A',
          what:`Sink cut-out, ${h.mount==='top'?`top mount (${fmtU(S.counter.lap)} in from the sink's edge)`:`bottom mount (the countertop ${fmtU(S.counter.reveal||0)} over the bowl, recessed sink)`}${h.name?` · ${h.name}`:''}` }))),
        at:at([0,T,D],[1,0,0],[0,0,-1],[0,1,0]) } });
    top.counter=true;
    const P=[top];
    if(it.opt.splash==='4″') P.push({ ...solid('Backsplash','top',[0,T,0,W,4,T],[0,1.6,-.6]), note:name });
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
/* the headboard (1½″) is inside the bed's depth, so the bed backs onto a wall without going into it */
const HEADBOARD = 1.5;
def({ k:'BED', cat:'furniture', name:'Bed with platform', w:60, h:22, d:83.5, wR:[39,80], dR:[76.5,86], opts:[['size','Mattress',Object.keys(BED)]], opt:{size:'Queen'}, sized: it => { const [w,d]=BED[it.opt.size]||BED.Queen; return {w:w+2, d:d+2+HEADBOARD}; },
  build: it => { const W=it.w,D=it.d-HEADBOARD,H=it.h, t=th('carcass'), m=10, z0=HEADBOARD;
    return [ part('Platform side','carcass','carcass',[0,0,z0,t,H-m,D],'x',{ex:[-1,0,0]}), part('Platform side','carcass','carcass',[W-t,0,z0,t,H-m,D],'x',{ex:[1,0,0]}),
      part('Platform end','carcass','carcass',[t,0,z0,W-2*t,H-m,t],'z',{ex:[0,0,-1]}), part('Platform end','carcass','carcass',[t,0,z0+D-t,W-2*t,H-m,t],'z',{ex:[0,0,1]}),
      part('Platform deck','shelf','carcass',[t,H-m-t,z0+t,W-2*t,t,D-2*t],'y',{ex:[0,.6,0]}),
      solid('Mattress','furnsoft',[1,H-m,z0+1,W-2,m,D-2],[0,2,0]), solid('Headboard','furnwood',[0,0,0,W,H+22,HEADBOARD],[0,0,-2]) ]; } });
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
   their STEP files (loaded at start: the fixtures-* catalogue sets, one mesh per solid so they explode). */
const FIX = {};
const FIX_FILES = { lpgShower:'api/seed/fixtures-lifepodgo-shower', maaxBiarritz:'api/seed/fixtures-maax-biarritz', maaxBiarritz85:'api/seed/fixtures-maax-biarritz-85' };
async function loadFixtures(){ await Promise.all(Object.entries(FIX_FILES).map(async([k,u])=>{ try{ const r=await fetch(u); if(r.ok) FIX[k]=await r.json(); }catch(e){} }));
  await loadStepSinks(); }
/* sinks uploaded as STEP files (Upload STEP → Sink; tools/step-import/sink_import.py): the sinks catalogue set lists them, each
   with its mesh, its rim outline and its bowl opening(s), so the same rules hold as for the built-in sinks: it docks
   in a sink base, the base fits it, the stretchers clear it, and the countertop's hole follows its exact shape (¼″
   inside the rim for top mount; ¼″ over the bowls for bottom mount, recessed). */
async function loadStepSinks(){
  let list=[]; try{ const r=await fetch('api/seed/sinks',{cache:'no-store'}); if(r.ok) list=await r.json(); }catch(e){}
  await Promise.all(list.map(async e=>{ try{ const r=await fetch(e.file); if(!r.ok) return; const F=await r.json(); FIX[e.k]=F;
    if(ITEMS.some(d=>d.k===e.k)) return;
    def({ k:e.k, cat:'sink', name:e.name, w:F.w, h:F.h, d:F.d, gap:e.gap ?? 2, y:sinkY(F.h), fixed:true, step:true, note:'Cubit sink, drawn from its STEP file',
      mount:e.mount||'top', rim:1, dock:true, rimPath:F.rim, openPaths:F.open, opts:[['mount','Mount',['top','bottom']]], opt:{ mount:e.mount||'top' },
      build:it=>meshParts(e.k, it, 'steel') }); }catch(err){} }));
}
const fx = (name, role, box, o={}) => ({ ...part(name, role, 'buy', box, 'y', {ex:o.ex||[0,0,0]}), solid:true, shape:o.shape, t:o.t, note:o.note||'' });
/* an open basin (tub, shower pan, sink bowl): rim walls `t` thick plus a floor */
const basin = (name, role, [x,y,z,w,h,d], t, ex=[0,0,0]) => [ fx(name, role, [x,y,z,w,h,d], {shape:'basin', t, ex}), fx(name+' floor', role, [x+t,y,z+t,w-2*t,Math.min(1,h/4),d-2*t], {ex}) ];
function meshParts(key, it, role='acrylic'){
  const F=FIX[key]; if(!F) return [fx('Loading…',role,[0,0,0,it.w,it.h,it.d])];
  return F.parts.map(pt=>{ let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9]; for(let i=0;i<pt.p.length;i+=3) for(let a=0;a<3;a++){ const v=pt.p[i+a]/F.q; if(v<mn[a]) mn[a]=v; if(v>mx[a]) mx[a]=v; }
    return { ...fx(pt.name,role,[mn[0],mn[1],mn[2],mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]],{ex:pt.ex}), mesh:pt, meshQ:F.q }; });
}
const BATH_NOTE='Typical size, check the model you buy';
/* toilets: 3″ drain on the standard 12″ rough-in (centre 12″ from the finished wall behind), a 4½″ hole for a 4 × 3
   closet flange */
const WC_PLUMB = w => ({ src:'standard 12″ toilet rough-in', drain:{ x:w/2, z:12, dia:3 }, hole:{ shape:'round', dia:4.5, note:'for a 4″ × 3″ closet flange; 12″ rough-in' } });
const toilet = (seatH, tankH) => it => { const W=it.w, D=it.d, cx=W/2;
  return [ fx('Tank','porcelain',[cx-W/2,seatH,0.5,W,tankH-seatH,8],{ex:[0,.4,-.6]}), fx('Tank lid','porcelain',[cx-W/2-0.25,tankH,0.25,W+0.5,1,8.5],{ex:[0,1.2,-.6]}),
    fx('Pedestal','porcelain',[cx-4.5,0,7,9,seatH-2,11],{shape:'cyl',ex:[0,-.4,0]}), fx('Bowl','porcelain',[cx-7.25,seatH-6,6,14.5,5,D-6.5],{shape:'cyl',ex:[0,0,.4]}),
    fx('Seat','porcelain',[cx-7.25,seatH-1,6.5,14.5,1,D-7],{shape:'cyl',ex:[0,.8,.4]}) ]; };
def({ k:'WC-R',  cat:'bath', name:'Toilet, round front',             w:20.5, h:29, d:27.5, fixed:true, plumb:WC_PLUMB(20.5), note:BATH_NOTE, build:toilet(15,29) });
def({ k:'WC-E',  cat:'bath', name:'Toilet, elongated comfort height', w:20.5, h:31, d:30,   fixed:true, plumb:WC_PLUMB(20.5), note:BATH_NOTE, build:toilet(17,31) });
def({ k:'WC-C',  cat:'bath', name:'Toilet, compact elongated',        w:18,   h:30, d:26.5, fixed:true, plumb:WC_PLUMB(18), note:BATH_NOTE, build:toilet(16.5,30) });
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
/* Mirolin Liberty one-piece tub-shower, 60 × 34 × 88 (TS5L left hand drain, TS5R right hand; Home Depot 1000714777).
   From Mirolin's TS5L data sheet: 60 × 34 × 88 (±¼″), bathing well 16″ deep with a 42 × 21 bottom, 2″ drain and 2½″
   overflow (13″ of water drain to overflow), 2¾″ drain-to-floor clearance; drain centre 6¾″ from the drain end and
   18¼″ from the back; 20″ threshold; 6 shelves; 177 lb; alcove, rough-in above the floor; sits on its two feet and
   front edge, shimmed level. Valve, spout and shower arm aren't on the sheet: the usual heights (valve 30″, spout
   24″, arm 78″ off the floor) on the drain end, in line with the drain. `plumb` is drawn for the left hand unit, x
   from its left end, z from its back, inches; plumbing.js puts it in the home and checks it. */
const LIB_PLUMB = { src:'Mirolin TS5L data sheet', alcove:true,
  drain:{ x:6.75, z:18.25, dia:2, below:2.75 },
  overflow:{ x:4, z:18.25, y:17, dia:2.5 },
  hole:{ w:8, d:12, typical:true, note:'typical size: check the Mirolin installation guide' },
  wall:{ side:'left', z:18.25, valve:30, spout:24, head:78, std:true },
  supply:'½″ PEX hot and cold to the valve' };
const libertyTS = it => { const W=60, D=34, H=88, rim=20, t=3.8, wt=1.5, dr=LIB_PLUMB.drain, ov=LIB_PLUMB.overflow, vw=LIB_PLUMB.wall;
  const P=[ fx('Tub','acrylic',[0,0,0,W,rim,D],{ shape:'basin', t, ex:[0,-.6,0] }), fx('Tub floor','acrylic',[t,0,t,W-2*t,rim-16,D-2*t],{ ex:[0,-.6,0] }),
    fx('Back wall','acrylic',[0,rim,0,W,H-rim,wt],{ ex:[0,0,-1] }), fx('Left wall','acrylic',[0,rim,wt,wt,H-rim,D-wt],{ ex:[-1,0,0] }), fx('Right wall','acrylic',[W-wt,rim,wt,wt,H-rim,D-wt],{ ex:[1,0,0] }) ];
  [46,56,66].forEach((y,i)=>{ P.push(fx(`Shelf, left ${i+1}`,'acrylic',[wt,y,wt,3.5,0.75,9],{ ex:[-.6,0,-.6] }), fx(`Shelf, right ${i+1}`,'acrylic',[W-wt-3.5,y,wt,3.5,0.75,9],{ ex:[.6,0,-.6] })); });
  // where the plumbing goes (the trim is bought separately): drain, overflow, valve, spout and shower arm
  P.push(fx('Drain 2″','steel',[dr.x-1.4,rim-16,dr.z-1.4,2.8,0.15,2.8],{ shape:'cyl', ex:[0,.4,0], note:'2″ drain' }),
    fx('Overflow 2½″','steel',[ov.x,ov.y-1.6,ov.z-1.6,0.3,3.2,3.2],{ ex:[-.4,0,0], note:'2½″ overflow' }),
    fx('Valve trim, left','steel',[wt,vw.valve-3.5,vw.z-3.5,0.4,7,7],{ ex:[-.6,0,0], note:'valve, bought separately' }),
    fx('Tub spout, left','steel',[wt,vw.spout-0.6,vw.z-0.9,5,1.2,1.8],{ ex:[-.6,0,0], note:'spout, bought separately' }),
    fx('Shower arm, left','steel',[wt,vw.head-0.4,vw.z-0.4,6,0.8,0.8],{ ex:[-.6,0,0], note:'shower arm, bought separately' }),
    fx('Shower head, left','steel',[wt+5,vw.head-2.5,vw.z-2,1.2,3,4],{ ex:[-.6,0,0] }));
  P.forEach(p=>{ p.ex=[0,0,0]; });   // one piece: it doesn't come apart in the exploded view
  return P; };
const LIB_NOTE = 'Mirolin Liberty, one piece acrylic tub-shower for a 60″ alcove: 60 × 34 × 88, 20″ threshold, 16″ deep bathing well, 6 shelves, 177 lb, rough-in above the floor. From Mirolin’s data sheet';
def({ k:'TS-MIR-LIB-L', cat:'bath', name:'Mirolin Liberty tub-shower 60 × 34 · left hand drain (TS5L)', w:60, h:88, d:34, fixed:true, plumb:LIB_PLUMB, note:LIB_NOTE+'. Left hand: drain, valve and shower on the left end, seen from the front', build:libertyTS });
def({ k:'TS-MIR-LIB-R', cat:'bath', name:'Mirolin Liberty tub-shower 60 × 34 · right hand drain (TS5R)', w:60, h:88, d:34, fixed:true, mirrored:true, plumb:LIB_PLUMB, note:LIB_NOTE+'. Right hand: drain, valve and shower on the right end, seen from the front', build:libertyTS });
/* MAAX Biarritz 30 × 32 × 75 two-piece shower kit (base + wall surround, no door; model 100726-000-002-000, Home Depot
   1000161589), drawn from MAAX's dimension drawing (tools/step-import/make_biarritz.py → STEP → mesh): 29 3/4 × 32 ×
   74 1/4, 23 3/4 door opening, 5″ curb, corner seats to a ledge 39 5/8 up, drain centred 14 7/8 from the left and the
   back with 1″ drain clearance. The valve isn't on the drawing: a shower valve 48″ up on the left side wall (mirror it
   for the right), shower arm 78″ (above the surround). */
const BIA_PLUMB = { src:'MAAX Biarritz dimension drawing', alcove:true,
  drain:{ x:14.875, z:14.875, dia:2, below:1 },
  hole:{ shape:'round', dia:5, typical:true, note:'typical size: check the MAAX installation guide' },
  wall:{ side:'left', z:16, valve:48, head:78, std:true },
  supply:'½″ PEX hot and cold to the valve' };
def({ k:'SH-MAAX-BIA', cat:'bath', name:'MAAX Biarritz P40 one piece shower 30 × 32 × 75 (no door)', w:29.75, h:74.25, d:32, fixed:true, plumb:BIA_PLUMB,
  note:'MAAX Biarritz P40, one piece fibreglass / AcrylX shower, alcove, 2 built-in shelves, model 100726-000-002-000: 29 3/4 wide × 32 deep × 74 1/4 high, 23 3/4 door opening (68 1/2 max door height), 5″ curb, centre drain. Drawn from the MAAX dimension drawing', build:it=>meshParts('maaxBiarritz', it).map(p=>({ ...p, ex:[0,0,0] })) });   // stays together in the exploded view
/* MAAX Biarritz 85, the same one piece shower 36 × 35 (model 100973-000-002, Home Depot 1001927075), from its MAAX
   drawing: 35 5/8 × 34 7/8 × 74 3/4, 27 1/2 door opening (69 1/4 high), 32″ inside, 4 3/8 threshold, drain 17 3/4
   from the left and 16 1/8 from the back; the 2 corner shelves ~41 3/8 up. Valve as on the P40. */
const BIA85_PLUMB = { ...BIA_PLUMB, src:'MAAX Biarritz 85 dimension drawing', drain:{ x:17.75, z:16.125, dia:2, below:1 }, wall:{ ...BIA_PLUMB.wall, z:17.5 } };
def({ k:'SH-MAAX-BIA36', cat:'bath', name:'MAAX Biarritz 85 one piece shower 36 × 35 × 75 (no door)', w:35.625, h:74.75, d:34.875, fixed:true, plumb:BIA85_PLUMB,
  note:'MAAX Biarritz 85, one piece AcrylX shower, alcove, 2 built-in corner shelves, model 100973-000-002: 35 5/8 wide × 34 7/8 deep × 74 3/4 high, 27 1/2 door opening (69 1/4 max door height), 4 3/8 threshold, centre drain. Drawn from the MAAX dimension drawing', build:it=>meshParts('maaxBiarritz85', it).map(p=>({ ...p, ex:[0,0,0] })) });
/* heating, plumbing and electrical equipment, at their usual sizes (check the model you buy) */
const white = 'porcelain';
// ductless heat pump wall head: high on an outside wall, line set and condensate out through the wall behind it
[['HP-09','Heat pump wall unit 9 000 BTU (typical)',31.4,11.6,9.1],['HP-12','Heat pump wall unit 12 000 BTU (typical)',31.4,11.6,9.1],['HP-18','Heat pump wall unit 18 000 BTU (typical)',39.4,12.8,10.1]].forEach(([k,name,w,h,d])=>
  def({ k, cat:'heat', name, w, h, d, y:82, fixed:true, note:'Ductless mini-split indoor head (e.g. Mitsubishi, Fujitsu): keep about 6″ under the ceiling and clear to each side; line set, condensate and power through the wall behind it. Check the model',
    build:it=>[ fx('Unit',white,[0,0,0,it.w,it.h,it.d],{ note:'indoor head' }), fx('Vane','steel',[1.5,0.4,it.d-0.3,it.w-3,1.2,0.4]) ] }));
// electric baseboard heaters, 240 V: usually under a window; no plug above one.
// The Library offers Dimplex Eclipse only: the thermostat is built into the unit (electronic, on its right end), so
// no wall thermostat box. Sizes from homedepot.ca (2026-11-07): 6⅝″ high, 2⅜″ deep; 240 / 208 V.
const ECLIPSE = [ // length, watts 240 V / 208 V, Dimplex model, Home Depot SKU, price CAD (blank: not shown that day)
  [20, 500, 375, '400001237', '1000709635', null], [25, 750, 563, '400001238', '1000709636', null], [30, 1000, 750, '400001239', '1000709637', 152.99],
  [35, 1250, 938, '400001240', '1000709638', 143], [40, 1500, 1125, '400001241', '1000709639', 167.49], [50, 2000, 1500, '400001242', '1000709640', 186.99],
  [60, 2500, 1875, '400001243', '1000709641', 179] ];
ECLIPSE.forEach(([w,watt,w208,model,sku,price])=>
  def({ k:`BB-DX-${w}`, cat:'baseboard', name:`Dimplex Eclipse baseboard ${w}″ · ${watt} W, built-in thermostat`, w, h:6.625, d:2.375, y:1, fixed:true, brand:'Dimplex', model, sku, price,
    url:`https://www.homedepot.ca/product/${sku}`,
    note:`Dimplex Eclipse ${model}, ${watt} W at 240 V (${w208} W at 208 V), built-in electronic thermostat, white. Home Depot SKU ${sku}${price?` · $${price}`:''}. Its own 240 V circuit; usually under a window. No plug above it`,
    build:it=>[ fx('Heater',white,[0,0,0,it.w,it.h,it.d]), fx('Grille','steel',[1.5,it.h-1.4,it.d-0.15,it.w-6.5,1,0.2]), fx('Thermostat','steel',[it.w-4.2,it.h-2.2,it.d-0.05,3,1.6,0.3],{ note:'built-in electronic thermostat' }) ] }));
// the earlier generic baseboards: kept so homes that have one still draw it, no longer offered in the Library
[[24,500],[36,750],[48,1000],[60,1250],[72,1500]].forEach(([w,watt])=>
  def({ k:`BB-${w}`, cat:'baseboard', legacy:true, name:`Baseboard heater ${w}″ · ${watt} W (typical)`, w, h:7.5, d:3.25, y:1, fixed:true, note:`Electric baseboard, 240 V, ${watt} W. No plug above it`,
    build:it=>[ fx('Heater',white,[0,0,0,it.w,it.h,it.d]), fx('Grille','steel',[2,it.h-1.6,it.d-0.2,it.w-4,1.2,0.25]) ] }));
// water heaters and the laundry box
def({ k:'WH-40', cat:'plumb', name:'Water heater, electric 40 gal (typical)', w:20.25, h:50, d:20.25, fixed:true, note:'Tank, about 20¼″ across, 50″ high: cold in, hot out on top, relief valve and drain pan. Check the model and its clearances',
  build:it=>[ fx('Tank',white,[0,0,0,it.w,it.h,it.d],{ shape:'cyl' }), fx('Pipes','steel',[it.w/2-3,it.h,it.d/2-0.5,6,4,1]) ] });
def({ k:'WH-60', cat:'plumb', name:'Water heater, electric 60 gal (typical)', w:24, h:58, d:24, fixed:true, note:'Tank, about 24″ across, 58″ high. Check the model and its clearances',
  build:it=>[ fx('Tank',white,[0,0,0,it.w,it.h,it.d],{ shape:'cyl' }), fx('Pipes','steel',[it.w/2-3,it.h,it.d/2-0.5,6,4,1]) ] });
def({ k:'WH-TL', cat:'plumb', name:'Water heater, tankless electric (typical)', w:14, h:22, d:4.5, y:48, fixed:true, note:'On the wall; needs its own large circuit(s). Check the model',
  build:it=>[ fx('Unit',white,[0,0,0,it.w,it.h,it.d]) ] });
def({ k:'WOB', cat:'plumb', name:'Washer outlet box, recessed (typical)', w:8.5, h:9.5, d:3.5, y:42, fixed:true, note:'Hot and cold valves and the 2″ drain for the washer, recessed in the wall behind it',
  build:it=>[ fx('Box',white,[0,0,0,it.w,it.h,it.d]), fx('Valves','steel',[1,it.h-3,it.d-0.4,it.w-2,1.5,1]) ] });
// flat-screen TVs on the wall (16:9, slim bezel, on a flat mount). Height by the TV rule: the middle of the screen at
// seated eye level, 42″, raised so the bottom stays at least 24″ off the floor (big screens). That's where a new one
// goes; its Height can be changed on any one (an override). A recessed TV box goes behind it (electrical.js 5d).
const TV_EYE=42, TV_MIN_BOTTOM=24;
const tvY = h => Math.round(Math.max(TV_EYE-h/2, TV_MIN_BOTTOM)*4)/4;
[[43,38.2,22.2],[50,44.4,25.7],[55,48.4,27.9],[65,57.0,32.7],[75,66.0,37.8],[85,74.5,42.6]].forEach(([dg,w,h])=>
  def({ k:`TV-${dg}`, cat:'tv', name:`TV ${dg}″ flat screen (typical)`, w, h, d:3, y:()=>tvY(h), fixed:true, tv:true,
    note:`About ${w} × ${h}″ on a flat wall mount (about 3″ off the wall). Placed with the middle of the screen at ${TV_EYE}″ (seated eye level), the bottom never under ${TV_MIN_BOTTOM}″: ${tvY(h)}″ to the bottom. Change its height for this one if it should sit higher (over a fireplace, a bedroom). A recessed TV box (power + low voltage) goes behind it, clear of the mount. Check the model`,
    build:it=>[ fx('Mount','steel',[it.w/2-8,it.h/2-6,0,16,12,1],{ note:'wall plate' }), fx('TV','screen',[0,0,1,it.w,it.h,it.d-1.1]), fx('Screen','screen',[0.4,0.4,it.d-0.1,it.w-0.8,it.h-0.8,0.1]) ] }));
// electrical panel
[['EP-100','Electrical panel 100 A (typical)',14.5,29.5],['EP-200','Electrical panel 200 A (typical)',14.5,38]].forEach(([k,name,w,h])=>
  def({ k, cat:'elec', name, w, h, d:3.75, y:42, fixed:true, note:'Load centre, surface or recessed: keep 1 m clear in front, not in a bathroom or clothes closet. Check the model and the electrician’s layout',
    build:it=>[ fx('Panel','steel',[0,0,0,it.w,it.h,it.d]), fx('Door','steel',[0.5,0.5,it.d-0.1,it.w-1,it.h-1,0.15],{ ex:[0,0,1] }) ] }));
/* a fixture's plumbing in its own frame, mirrored if it is: lx from its middle, lz from its back, y up (inches) */
function plumbOf(it){
  const d=itemDef(it.k), P=d?.plumb; if(!P) return null;
  const mir=!!it.mirror !== !!d.mirrored, W=it.w, X=x=>(mir?W-x:x)-W/2, sd=s=>mir?({left:'right',right:'left'}[s]||s):s;
  const r={ ...P, mir };
  if(P.drain){ r.drain={ ...P.drain, lx:X(P.drain.x), lz:P.drain.z }; if(P.hole) r.hole={ ...P.hole, lx:r.drain.lx, lz:r.drain.lz }; }
  if(P.overflow) r.overflow={ ...P.overflow, lx:X(P.overflow.x), lz:P.overflow.z };
  if(P.wall){ const side=sd(P.wall.side); r.wall={ ...P.wall, side, lx:side==='left'?-W/2:W/2, lz:P.wall.z }; }
  return r;
}
/* kitchen and utility sinks: they sit in the countertop (top of the rim at the counter top), 2″ off the wall */
const sinkY = h => () => 35.5 + (S.counter?.t ?? 0.5) - h + 0.2;
/* a kitchen sink as it really looks: a flat rim (deck) with rounded corners, the bowl(s) hanging under it with rounded
   corners and a floor. Top mount: the rim sits on the countertop. Bottom mount: the flange is under the countertop.
   split: one bowl (null) or the left bowl's share of a double. The rim's radius (d.R) and the bowls' (d.rb) also
   round the countertop's hole (sinkHole). */
const SINK_RIM_T = 0.12, SINK_DIV = 1.5;
function sinkBowls(it, split){ const d=itemDef(it.k)||{}, rim=d.rim||1, iw=it.w-2*rim, id=it.d-2*rim;
  if(split==null) return [[rim, rim, iw, id]];
  const a=(iw-SINK_DIV)*split; return [[rim, rim, a, id], [rim+a+SINK_DIV, rim, iw-SINK_DIV-a, id]]; }
const sinkModel = (split=null) => it => { const d=itemDef(it.k)||{}, R=d.R??1.25, rb=d.rb??1, H=it.h, B=sinkBowls(it, split);
  const P=[ fx('Rim','steel',[0,H-SINK_RIM_T,0,it.w,SINK_RIM_T,it.d],{ shape:'rplate', ex:[0,.6,0] }) ];
  P[0].rr={ R, holes:B.map(b=>[...b, rb]) };
  B.forEach((b,i)=>{ const q=fx(B.length>1?(i?'Right bowl':'Left bowl'):'Bowl','steel',[b[0],0,b[1],b[2],H-SINK_RIM_T,b[3]],{ shape:'rbowl', ex:[B.length>1?(i?.5:-.5):0,-.4,0] }); q.rr={ R:rb, t:0.06 }; P.push(q); });
  return P; };
const sink1 = sinkModel();
const sink2 = (split=0.5) => sinkModel(split);
def({ k:'SK-1-25', cat:'sink', name:'Kitchen sink, single bowl 25 × 22 drop-in', w:25, h:8,  d:22, gap:1.5, y:sinkY(8),  fixed:true, note:BATH_NOTE+' · fits a 30″ sink base', build:sink1 });
def({ k:'SK-1-30', cat:'sink', name:'Kitchen sink, single bowl 30 × 18 undermount', w:30, h:9, d:18, gap:3, y:sinkY(9), fixed:true, note:BATH_NOTE+' · fits a 33–36″ sink base', build:sink1 });
def({ k:'SK-2-33', cat:'sink', name:'Kitchen sink, double bowl 33 × 22 drop-in', w:33, h:8,  d:22, gap:1.5, y:sinkY(8),  fixed:true, note:BATH_NOTE+' · fits a 36″ sink base', build:sink2() });
def({ k:'SK-2-32', cat:'sink', name:'Kitchen sink, double bowl 32 × 18 undermount', w:32, h:9, d:18, gap:3, y:sinkY(9), fixed:true, note:BATH_NOTE+' · fits a 36″ sink base', build:sink2() });
def({ k:'SK-2-60', cat:'sink', name:'Kitchen sink, 60/40 double 33 × 22', w:33, h:9, d:22, gap:1.5, y:sinkY(9), fixed:true, note:BATH_NOTE, build:sink2(0.6) });
def({ k:'SK-FH-30', cat:'sink', name:'Farmhouse (apron) sink 30″', w:30, h:10, d:20, gap:2, y:sinkY(10), fixed:true, note:BATH_NOTE+' · needs a farmhouse sink base', build:it=>[ ...basin('Bowl','porcelain',[0,0,0,it.w,it.h,it.d],1.25), fx('Apron','porcelain',[0,0,it.d-0.75,it.w,it.h,0.75],{ex:[0,0,1]}) ] });
def({ k:'SK-FH-33', cat:'sink', name:'Farmhouse (apron) sink 33″', w:33, h:10, d:21, gap:2, y:sinkY(10), fixed:true, note:BATH_NOTE+' · needs a farmhouse sink base', build:it=>[ ...basin('Bowl','porcelain',[0,0,0,it.w,it.h,it.d],1.25), fx('Apron','porcelain',[0,0,it.d-0.75,it.w,it.h,0.75],{ex:[0,0,1]}) ] });
def({ k:'SK-BAR', cat:'sink', name:'Bar / prep sink 15 × 15', w:15, h:7, d:15, gap:3, y:sinkY(7), fixed:true, note:BATH_NOTE, build:sink1 });
def({ k:'SK-LAU', cat:'sink', name:'Laundry tub, freestanding 24 × 22', w:24, h:34, d:22, y:0, fixed:true, note:BATH_NOTE, build:it=>[ ...basin('Tub','acrylic',[0,22,0,it.w,12,it.d],1.25,[0,.6,0]), ...[[1,1],[it.w-2.5,1],[1,it.d-2.5],[it.w-2.5,it.d-2.5]].map(([x,z],i)=>fx(`Leg ${i+1}`,'steel',[x,0,z,1.5,22,1.5],{ex:[x<it.w/2?-.6:.6,-.4,z<it.d/2?-.6:.6]})) ] });
/* sinks that sit in a countertop: how they're mounted and how wide their rim is.
   Top mount (drop-in): the rim sits on the countertop, and the hole is cut `counter.lap` (¼″) in from the sink's edge
   all the way round. Bottom mount (undermount): the sink hangs under the countertop, and the hole is the bowl's
   opening (inside the rim), less `counter.reveal` (¼″) each side: the countertop runs ¼″ over the bowl, so the sink
   is recessed under it.
   They dock into a sink base (furniture.js): its centre, or against either side (the hole `sinkBase.keep` in). */
ITEMS.filter(d=>d.cat==='sink' && d.k!=='SK-LAU').forEach(d=>{ const top=/drop-in/.test(d.name) || d.k==='SK-2-60';
  d.mount=top?'top':'bottom'; d.rim=top?1.25:1; d.R=1.25; d.rb=1; d.dock=true;
  d.opts=[...(d.opts||[]), ['mount','Mount',['top','bottom']]]; d.opt={ ...(d.opt||{}), mount:d.mount }; });
/* the hole a sink needs in the countertop (centred on the sink): { w, d, mount } */
const HOLES = new Map();
function sinkHole(it){ const d=itemDef(it.k); if(!d?.dock) return null;
  const mount=it.opt?.mount || d.mount, c=S.counter;
  // a sink from a STEP file: its own outlines, offset in (round corners stay round): [{x,z}…] from its left end and back
  if(d.rimPath){ const mir=!!it.mirror, key=[it.k, mount, c.lap, c.reveal, mir].join('|');
    if(!HOLES.has(key)){ const fl=P=>P.map(([x,z])=>[mir?it.w-x:x, z]);
      let paths = mount==='top' ? offsetPaths([fl(d.rimPath)], -c.lap) : offsetPaths((d.openPaths||[]).map(fl), -(c.reveal||0));
      if(mount==='top' && paths.length>1) paths=[paths.sort((a,b)=>Math.abs(polyArea(b))-Math.abs(polyArea(a)))[0]];
      if(!paths.length) return null;
      const xs=paths.flat().map(p=>p[0]), zs=paths.flat().map(p=>p[1]), x0=Math.min(...xs), x1=Math.max(...xs), z0=Math.min(...zs), z1=Math.max(...zs);
      HOLES.set(key, { w:r4(x1-x0), d:r4(z1-z0), mount, r:0, cx:r4((x0+x1)/2-it.w/2), cz:r4((z0+z1)/2-it.d/2), paths:paths.map(P=>P.map(([x,z])=>[r4(x),r4(z)])) }); }
    return HOLES.get(key); }
  // the hole's corners follow the sink: in from the rim's rounded corners (top mount), or the bowl's (bottom mount)
  if(mount==='top') return { w:r4(it.w-2*c.lap), d:r4(it.d-2*c.lap), mount, r:r4(Math.max(0, (d.R??1.25)-c.lap)) };
  const rim=d.rim||1; return { w:r4(it.w-2*rim-2*(c.reveal||0)), d:r4(it.d-2*rim-2*(c.reveal||0)), mount, r:r4(Math.max(0, (d.rb??1)-(c.reveal||0))) };
}
/* the narrowest sink base for a sink: its hole plus the full-width stretcher ends and clearance each side,
   but never narrower than the sink itself plus the two ends */
const polyArea = P => P.reduce((a,p,i)=>{ const q=P[(i+1)%P.length]; return a+p[0]*q[1]-q[0]*p[1]; },0)/2;
function sinkBaseMin(sink){ const h=sinkHole(sink); if(!h) return 0; const T=T_(), SB=S.sinkBase;
  return Math.ceil(Math.max(h.w+2*(T+SB.clear+0.25), sink.w+2*T)*4)/4; }

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
/* the mirror image of a part's machining (u → U−u); `at` moves with it so the part stays where it is.
   wx: the item is being mirrored left ↔ right (W = its width), so the part itself moves to the other side */
const mirU = (c, W=null) => { if(!c) return c; const U=c.U, swap=w=>({left:'right',right:'left','left end':'right end','right end':'left end','hinge edge':'hinge edge','opening edge':'opening edge'}[w]||w);
  const fx = v => W==null ? v : [W-v[0], v[1], v[2]], fd = v => W==null ? v : [-v[0], v[1], v[2]];
  let A=c.at; if(A){ const o=[A.o[0]+U*A.eu[0], A.o[1]+U*A.eu[1], A.o[2]+U*A.eu[2]]; A={ o:fx(o), eu:fd(A.eu.map(x=>-x)), ev:fd(A.ev), n:fd(A.n) }; }
  return { ...c, at:A, u: W==null ? [c.u[1], c.u[0]] : [swap(c.u[1]), swap(c.u[0])], outline:c.outline.map(([u,v])=>[r4(U-u),v]).reverse(),
    ops:c.ops.map(o=>o.u!=null ? {...o, u:r4(U-o.u)} : {...o, u0:r4(U-o.u1), u1:r4(U-o.u0), ...(o.path?{ path:o.path.map(([u,v])=>[r4(U-u),v]).reverse() }:{})}) }; };
function partsOf(it){
  const d=itemDef(it.k); if(!d) return [];
  const P=d.build({ ...it, opt:{...(d.opt||{}), ...(it.opt||{})} }).filter(Boolean).map(finishPart);
  if(!!it.mirror !== !!d.mirrored){   // mirrored left ↔ right: hinges, drawers, partitions and names change sides
    const W=it.w, sw=s=>String(s).replace(/\b(left|right|Left|Right)\b/g, w=>({left:'right',right:'left',Left:'Right',Right:'Left'}[w]));
    P.forEach(p=>{ p.box=[W-p.box[0]-p.box[3], ...p.box.slice(1)];
      if(p.hole) p.hole=[W-p.hole[0]-p.hole[2], ...p.hole.slice(1)]; if(p.rr?.holes) p.rr={ ...p.rr, holes:p.rr.holes.map(([x,z,w,d,r])=>[p.box[3]-x-w,z,w,d,r]) }; if(p.mesh) p.mirrorW=W; p.ex=[-p.ex[0], p.ex[1], p.ex[2]]; p.name=sw(p.name); p.ops=p.ops.map(sw);
      if(p.cnc) p.cnc=mirU(p.cnc, W); });
  }
  return P;
}
/* the cut list: parts grouped by name and size (left/right pairs together when they're cut the same) */
const sigOf = p => p.cnc ? JSON.stringify([p.cnc.outline, p.cnc.ops.map(o=>[o.k,o.u,o.v,o.u0,o.u1,o.v0,o.v1,o.depth])]) : '';
function cutList(it){
  const rows=new Map();
  partsOf(it).filter(p=>!p.hw && !p.solid).forEach(p=>{
    const key=[p.name.replace(/, (left|right)$/,'').replace(/^(Left|Right) end$/,'End').replace(/ \d+( |$)/,' # '),p.cutL,p.cutW,p.band.long,p.band.short,sigOf(p)].join('|');
    const r=rows.get(key); if(r){ r.qty++; r.parts.push(p); } else rows.set(key,{ name:p.name, nom:p.counter?S.counter.name:nomOf(), T:p.T, L:p.cutL, W:p.cutW, fL:p.L, fW:p.W, band:p.band, ops:p.ops, qty:1, parts:[p] });
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
  items.forEach(it=>partsOf(it).filter(p=>!p.hw && !p.solid && !p.counter).forEach(p=>{ const n=nomOf(); area[n]=(area[n]||0)+p.cutL*p.cutW/144; band.len+=p.bandLen; }));
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
export { defStoreItem, INSERTS, tvY, firePower, plumbOf, sinkHole, sinkBaseMin, fx3, hingeSpec, runnerSpec, handleById, SETTINGS_V, loadFixtures, DEFAULTS, MM, CATS, ITEMS, itemDef, catOf, newItem, partsOf, cutList, hardwareOf, totals, csv, fmt, fmtU, settings, loadSettings, saveSettings, th, nomOf };
