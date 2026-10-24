/* Cubit Builder — casework.js : the cabinet & furniture library engine.

   Every cabinet is generated from rules (frameless, full overlay) at any size, from the shop's own materials:
   plywood in two thicknesses only, ½″ and ⅝″ (their exact measured thickness is a setting), edge banded.
   Joinery is mortise and tenon that is cut on the CNC from ONE side, so no part is flipped:
     · tenons are part of a panel's outline (cut with the profile, face up),
     · mortises are pockets on the inside face of the mating panel (blind, nothing shows outside), their ends
       overcut by the bit so the square tenon corners seat,
     · the back sits in a groove (pocket) on the inside face of the sides,
     · shelf-pin rows, hinge cups and pull holes are all on the same face that is up for that part
       (inside face of sides, back face of doors and drawer fronts).
   Cut sizes come out short of the finished size by the edge band on every banded edge.

   Units: inches inside. Items: { k, w, h, d, y, opt } (w/h/d finished overall, y = height off the floor).
   An item's own coordinates: x 0→w left to right seen from the front, y up, z 0 at the back → d at the front. */

const MM = 1/25.4;
const r16 = v => Math.round(v*16)/16;

/* ---------------------------------------------------------------- shop settings (shared by the team) */
const DEFAULTS = {
  units:'in',
  thick:{ '1/2':0.469, '5/8':0.594 },          // measured plywood thickness, inches (15/32″, 19/32″)
  use:{ carcass:'5/8', back:'1/2', door:'5/8', shelf:'5/8', drawer:'1/2', bottom:'1/2', kick:'5/8' },
  ply:{ name:'Baltic birch / prefinished maple plywood', sheet:[48,96] },
  band:{ t:1*MM, w:22*MM, name:'PVC edge band 1 mm × 22 mm' },
  kick:{ h:4.5, set:3 },                         // toe kick height and setback
  reveal:3*MM,                                   // gap between doors / drawer fronts
  tenon:{ len:0.375, w:2, every:10, fit:0.008 }, // tenon length (= mortise depth), width, max spacing, clearance
  bit:0.25,                                      // cutter diameter (mortise ends are overcut by it)
  groove:{ depth:0.25, inset:0.5 },              // back groove depth, and its distance in from the back edge
  pins:{ dia:5*MM, pitch:32*MM, edge:37*MM },
  hinge:{ name:'Blum CLIP top BLUMOTION 110° full overlay', cup:35*MM, depth:13*MM, edge:22.5*MM, end:3.5 },
  glide:'blum-tandem',
  glides:{
    'blum-tandem':{ name:'Blum TANDEM 563H undermount, full extension, soft close', clear:10*MM, lens:[12,15,18,21], under:true, prep:'Rear notches + hook hole per Blum template; locking devices at the front' },
    'dtc-under':  { name:'DTC soft-close undermount', clear:10*MM, lens:[12,14,16,18,20,22], under:true, prep:'Rear notches + hook hole per DTC template' },
    'side-ball':  { name:'Side-mount ball bearing, full extension', clear:1, lens:[12,14,16,18,20,22], under:false, prep:'' },
  },
  pull:{ name:'Bar pull, brushed black', cc:128*MM, hole:5*MM, edge:2, end:3 },
  screw:{ name:'Glue + #8 × 1¼″ screws', every:8 },
  rod:{ name:'Oval closet rod 1″ with end flanges' },
  counter:{ name:'Quartz', t:1.25, over:1 },
};
const KEY='cubit-casework-settings';
let S = clone(DEFAULTS), remote=false;
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function merge(base, over){ for(const k in over){ if(over[k] && typeof over[k]==='object' && !Array.isArray(over[k]) && base[k] && typeof base[k]==='object') merge(base[k], over[k]); else base[k]=over[k]; } return base; }
async function loadSettings(){
  try{ const r=await fetch('api/casework',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ S=merge(clone(DEFAULTS), await r.json()); remote=true; return S; } }catch(e){}
  try{ S=merge(clone(DEFAULTS), JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){}
  return S;
}
async function saveSettings(next){
  S=merge(clone(DEFAULTS), next);
  if(remote){ const r=await fetch('api/casework',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({settings:S})}); const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); }
  else { try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
  return S;
}
const settings = () => S;
const th = role => S.thick[S.use[role]] ?? 0.594;
const nomOf = role => S.use[role];

/* ---------------------------------------------------------------- display */
function fmt(v, units=S.units){
  if(units==='mm') return `${Math.round(v/MM)}`;
  const neg=v<0; v=Math.abs(v); let w=Math.floor(v+1e-9), f=Math.round((v-w)*16);
  if(f===16){ w++; f=0; }
  let s = f ? (()=>{ let n=f, d=16; while(n%2===0){ n/=2; d/=2; } return `${w?w+' ':''}${n}/${d}`; })() : `${w}`;
  return (neg?'-':'')+s;
}
const fmtU = (v,u=S.units) => fmt(v,u)+(u==='mm'?' mm':'″');

/* ---------------------------------------------------------------- parts */
/* part(name, role, matRole|label, box[x,y,z,sx,sy,sz], thickness axis 'x'|'y'|'z', opts) */
function part(name, role, mat, box, axis, o={}){
  const [x,y,z,sx,sy,sz]=box, T={x:sx,y:sy,z:sz}[axis];
  const faces = axis==='x' ? [sy,sz] : axis==='y' ? [sx,sz] : [sy,sx];       // [L,W]: vertical first for upright parts
  let L=Math.max(...faces), W=Math.min(...faces);
  if(o.grain==='v' && axis!=='y'){ L=sy; W=axis==='x'?sz:sx; }
  return { name, role, mat, T, L, W, box, axis, ex:o.ex||[0,0,0], band:o.band||{long:0,short:0}, ten:o.ten||0, ops:o.ops||[], hw:!!o.hw, qty:1, tenonGeo:o.tenonGeo||[], note:o.note||'' };
}
const tenonCount = len => Math.max(2, Math.ceil((len-2*1.5)/S.tenon.every)+1);
/* tenons along an edge of length `len`: their centres (from one end) */
function tenonAt(len){ const n=tenonCount(len), a=Math.min(1.5+S.tenon.w/2, len/4), b=len-a; return [...Array(n)].map((_,i)=>n===1?len/2:a+(b-a)*i/(n-1)); }
/* a horizontal panel between two sides (bottom, top, fixed shelf, kick, stretcher) with tenons into both sides */
function tenoned(name, role, mat, box, axis, o={}){
  const p=part(name, role, mat, box, axis, o), tl=S.tenon.len;
  const [x,y,z,sx,sy,sz]=box, deep = axis==='y' ? sz : sy;      // the edge along which the tenons sit (panel depth)
  const at=tenonAt(deep), tw=S.tenon.w;
  p.ten=at.length; p.tenonLen=tl;
  p.tenonGeo = [-1,1].flatMap(sd=>at.map(c=> axis==='y'
    ? [sd<0 ? x-tl : x+sx, y, z+c-tw/2, tl, sy, tw]
    : [sd<0 ? x-tl : x+sx, y+c-tw/2, z, tl, tw, sz]));
  p.ops = [`${at.length} tenons ${fmtU(tw)} × ${fmtU(tl)} each end (in the outline)`, ...(o.ops||[])];
  return p;
}
function finishPart(p){
  const bt=S.band.t, tl=p.tenonLen||0;
  p.cutL = r16(p.L - p.band.short*bt + (p.ten ? 2*tl : 0));
  p.cutW = r16(p.W - p.band.long*bt);
  p.bandLen = p.band.long*p.L + p.band.short*p.W;
  return p;
}

/* ---------------------------------------------------------------- building blocks */
/* the carcass: two sides, bottom, top (full or two stretchers), back in a groove, optional toe kick,
   fixed shelves (tenoned), adjustable shelves (on pins), partitions. Returns {parts, t, dc, ix0, ix1, y0, y1}. */
function carcass(it, c){
  const W=it.w, H=it.h, t=th('carcass'), tb=th('back'), gd=S.groove.depth, gi=S.groove.inset;
  const dc = it.d - (c.doors===false ? 0 : th('door'));             // carcass depth (doors in front)
  const kh = c.kick ? S.kick.h : 0, ks=S.kick.set;
  const zb = gi+tb;                                                    // front face of the back
  const P=[], sideOps=[];
  const y0 = kh, y1 = H - t;                                           // inside: top of bottom → underside of top
  const fixed=[...(c.fixed||[])];
  const sideMort = n => `${n} mortise pockets ${fmtU(S.tenon.len)} deep, ends overcut ${fmtU(S.bit)}`;
  let mort=0;
  const bot=tenoned('Bottom','carcass','carcass',[t,kh,zb,W-2*t,t,dc-zb],'y',{ex:[0,-1,0], band:{long:1,short:0}}); mort+=bot.ten; P.push(bot);
  if(c.top==='stretchers'){
    const sw=4;
    const fs=tenoned('Top stretcher, front','carcass','carcass',[t,H-t,dc-sw,W-2*t,t,sw],'y',{ex:[0,1,.4], band:{long:1,short:0}});
    const bs=tenoned('Top stretcher, back','carcass','carcass',[t,H-t,zb,W-2*t,t,sw],'y',{ex:[0,1,-.4]});
    mort+=fs.ten+bs.ten; P.push(fs,bs);
  } else { const tp=tenoned('Top','carcass','carcass',[t,H-t,zb,W-2*t,t,dc-zb],'y',{ex:[0,1,0], band:{long:1,short:0}}); mort+=tp.ten; P.push(tp); }
  if(kh){ const kb=tenoned('Toe kick','carcass','kick',[t,0,dc-ks-th('kick'),W-2*t,kh,th('kick')],'z',{ex:[0,-.6,1]}); mort+=kb.ten; P.push(kb); }
  fixed.forEach((fy,i)=>{ const f=tenoned(fixed.length>1?`Fixed shelf ${i+1}`:'Fixed shelf','shelf','carcass',[t,fy,zb,W-2*t,t,dc-zb],'y',{ex:[0,0,.5], band:{long:1,short:0}}); mort+=f.ten; P.push(f); });
  // partitions: vertical dividers between bottom and top, tenoned into both (mortises on the bottom's top face and the top's underside)
  (c.parts||[]).forEach((px,i)=>{ const p=part(`Partition ${i+1}`,'carcass','carcass',[px-t/2,y0+t,zb,t,y1-y0-t,dc-zb],'x',{ex:[0,0,.3], band:{long:1,short:0}, grain:'v'});
    const at=tenonAt(dc-zb); p.ten=at.length; p.tenonLen=S.tenon.len; p.ops=[`${at.length} tenons each end (top and bottom edges)`]; p.vten=true;
    p.tenonGeo=[-1,1].flatMap(sd=>at.map(cz=>[px-t/2, sd<0 ? y0+t-S.tenon.len : y1, zb+cz-S.tenon.w/2, t, S.tenon.len, S.tenon.w])); P.push(p); });
  // back in grooves on the inside faces of the sides
  const back=part('Back','back','back',[t-gd,kh,gi,W-2*t+2*gd,H-kh,tb],'z',{ex:[0,0,-1], grain:'v', ops:[`Sits in ${fmtU(gd)} grooves in both sides`]}); P.push(back);
  // adjustable shelves between the fixed ones
  const zones=[y0+t, ...fixed.flatMap(f=>[f, f+t]), y1].reduce((a,v,i,arr)=>i%2? a : a.concat([[arr[i],arr[i+1]]]), []);
  let adj=c.adj||0;
  if(typeof adj==='number' && adj>0){
    // spread the shelves over the zones by height
    const tot=zones.reduce((s,[a,b])=>s+(b-a),0);
    zones.forEach(([a,b])=>{ const n=Math.round(adj*(b-a)/tot); for(let k=1;k<=n;k++){ const sy=a+(b-a)*k/(n+1)-t/2;
      P.push(part('Adjustable shelf','shelf','shelf',[t+1/32,sy,zb+1/16,W-2*t-1/16,th('shelf'),dc-zb-0.25],'y',{ex:[0,0,.6], band:{long:1,short:0}})); } });
  }
  const pinRows = adj ? 2 : 0;
  sideOps.push(sideMort(mort), `Back groove ${fmtU(tb+0.01)} wide × ${fmtU(gd)} deep, ${fmtU(gi)} in from the back`);
  if(pinRows) sideOps.push(`2 rows of ${fmtU(S.pins.dia)} shelf-pin holes at ${Math.round(S.pins.pitch/MM)} mm, ${Math.round(S.pins.edge/MM)} mm in`);
  if(kh) sideOps.push(`Toe-kick notch ${fmtU(ks)} × ${fmtU(kh)} (in the outline)`);
  const sides=[['Left side',0,[-1,0,0]],['Right side',W-t,[1,0,0]]].map(([n,x,ex])=>part(n,'carcass','carcass',[x,0,0,t,H,dc],'x',{ex, band:{long:1,short:0}, grain:'v', ops:[...sideOps, 'Cut inside face up']}));
  if(kh) sides.forEach(s=>s.notch=[ks,kh,dc]);
  P.unshift(...sides);
  return { parts:P, t, dc, kh, ix0:t, ix1:W-t, y0, y1, zb };
}
const hingeCount = h => h<=40 ? 2 : h<=60 ? 3 : h<=80 ? 4 : 5;
/* a door (full overlay) covering x0..x1, y0..y1 of the front; side 'L'|'R' = the hinge side; pull at 'top'|'bottom'|'mid' */
function door(name, x0,x1,y0,y1, dc, side, pullAt='top'){
  const r=S.reveal, w=x1-x0-r, h=y1-y0-r, td=th('door'), nh=hingeCount(h);
  const p=part(name,'front','door',[x0+r/2,y0+r/2,dc,w,h,td],'z',{ex:[0,0,2.2], band:{long:2,short:2}, grain:'v',
    ops:[`${nh} hinge cups Ø${Math.round(S.hinge.cup/MM)} mm × ${Math.round(S.hinge.depth/MM)} mm deep, ${(S.hinge.edge/MM).toFixed(1)} mm from the ${side==='L'?'left':'right'} edge, first ${fmtU(S.hinge.end)} from the ends`,
         `Pull: 2 holes Ø${Math.round(S.pull.hole/MM)} mm through, ${Math.round(S.pull.cc/MM)} mm apart`, 'Cut back face up']});
  const hw=[], hx = side==='L' ? x0+r/2+0.9 : x1-r/2-0.9;
  for(let i=0;i<nh;i++){ const hy = y0+r/2 + S.hinge.end + (h-2*S.hinge.end)*(nh>1?i/(nh-1):0.5) - 0.9;
    hw.push(part('Hinge','hw','buy',[hx-0.9,hy,dc-0.6,1.8,1.8,0.6],'z',{ex:[0,0,1.6], hw:true})); }
  // pull: vertical bar near the opening edge
  const px = side==='L' ? x1-r/2-S.pull.edge : x0+r/2+S.pull.edge, cc=S.pull.cc;
  const py = pullAt==='bottom' ? y0+r/2+S.pull.end : pullAt==='mid' ? (y0+y1)/2-cc/2 : y1-r/2-S.pull.end-cc;
  hw.push(part('Pull','hw','buy',[px-0.25,py-0.4,dc+td,0.5,cc+0.8,0.9],'z',{ex:[0,0,2.8], hw:true}));
  return [p, ...hw];
}
/* doors across a bay: one if narrow, else a pair */
function doors(x0,x1,y0,y1,dc,pullAt='top', name='Door'){
  const n = (x1-x0) > 24.01 ? 2 : 1;
  if(n===1) return door(name, x0,x1,y0,y1,dc,'L',pullAt);
  const m=(x0+x1)/2;
  return [...door(`${name}, left`, x0,m,y0,y1,dc,'L',pullAt), ...door(`${name}, right`, m,x1,y0,y1,dc,'R',pullAt)];
}
/* a drawer: front over x0..x1 × y0..y1, box on glides in the opening ox0..ox1 */
function drawer(name, x0,x1,y0,y1, ox0,ox1, dc, zb, fixedFront=false){
  const r=S.reveal, w=x1-x0-r, h=y1-y0-r, td=th('door');
  const out=[];
  const fr=part(fixedFront?`${name} (false front)`:`${name} front`,'front','door',[x0+r/2,y0+r/2,dc,w,h,td],'z',{ex:[0,0,fixedFront?2.2:3], band:{long:2,short:2},
    ops: fixedFront ? ['Fixed to the carcass, no box'] : [`Pull: 2 holes Ø${Math.round(S.pull.hole/MM)} mm through, ${Math.round(S.pull.cc/MM)} mm apart, centred`, 'Cut back face up']});
  out.push(fr);
  if(fixedFront) return out;
  const cc=S.pull.cc, py=y0+r/2+Math.min(h/2, 2.5)-0.25;
  out.push(part('Pull','hw','buy',[(x0+x1)/2-cc/2-0.4,py,dc+td,cc+0.8,0.5,0.9],'z',{ex:[0,0,3.6], hw:true}));
  const G=S.glides[S.glide]||Object.values(S.glides)[0], ts=th('drawer'), tbt=th('bottom'), gd=S.groove.depth;
  const avail = dc - zb - 0.5, len = [...G.lens].sort((a,b)=>b-a).find(l=>l<=avail) || Math.min(...G.lens);
  const bw = ox1-ox0-G.clear, bh = Math.max(2.5, Math.min(h-1.25, h-0.75)), bz=dc-len, by=y0+r/2+(G.under?0.6:0.5), bx=ox0+G.clear/2;
  const ex=[0,0,1.6], up=G.under?0.5:0.25;
  const ins=bw-2*ts;
  const pr=[`${tenonCount(bh)} mortise pockets ${fmtU(S.tenon.len)} deep for the front and back`, `Bottom groove ${fmtU(tbt+0.01)} × ${fmtU(gd)} deep, ${fmtU(up)} up`, 'Cut inside face up'];
  out.push(part(`${name} box side`,'drawer','drawer',[bx,by,bz,ts,bh,len],'x',{ex:[-.5,0,1.6], band:{long:1,short:0}, ops:pr}));
  out.push(part(`${name} box side`,'drawer','drawer',[bx+bw-ts,by,bz,ts,bh,len],'x',{ex:[.5,0,1.6], band:{long:1,short:0}, ops:pr}));
  const fb=(nm,z,e)=>{ const p=part(nm,'drawer','drawer',[bx+ts,by,z,ins,bh,ts],'z',{ex:e, band:{long:1,short:0}});
    const at=tenonAt(bh); p.ten=at.length; p.tenonLen=S.tenon.len; p.ops=[`${at.length} tenons each end (in the outline)`, `Bottom groove ${fmtU(gd)} deep, ${fmtU(up)} up`, ...(nm.includes('back')&&G.prep?[G.prep]:[])];
    p.tenonGeo=[-1,1].flatMap(sd=>at.map(c=>[sd<0?bx+ts-S.tenon.len:bx+ts+ins, by+c-S.tenon.w/2, z, S.tenon.len, S.tenon.w, ts])); return p; };
  out.push(fb(`${name} box front`, dc-ts, [0,0,2.1]), fb(`${name} box back`, bz, [0,0,1.1]));
  out.push(part(`${name} box bottom`,'drawer','bottom',[bx+ts-gd,by+up,bz+ts-gd,ins+2*gd,tbt,len-2*ts+2*gd],'y',{ex:[0,-.6,1.6], ops:[`Sits in the ${fmtU(gd)} grooves all round`]}));
  [ox0, ox1-0.5].forEach(gx=>out.push(part('Glide','hw','buy',[gx,by-(G.under?0.5:-1),bz,0.5,0.5,len],'x',{ex:[gx<ox0+1?-.3:.3,0,1.2], hw:true, note:`${G.name}, ${len}″`})));
  return out;
}
/* drawer fronts stacked from the top down: heights[] of the fronts, top first; fills y0..y1 */
function drawerStack(x0,x1,y0,y1, heights, ox0,ox1, dc, zb){
  const out=[]; let y=y1;
  heights.forEach((hh,i)=>{ out.push(...drawer(`Drawer ${i+1}`, x0,x1,y-hh,y, ox0,ox1, dc, zb)); y-=hh; });
  return out;
}
const split = (total, n, first) => first ? [first, ...Array(n-1).fill((total-first)/(n-1))] : Array(n).fill(total/n);

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
  { k:'counter',   name:'Countertops',       y:34.5 },
  { k:'appliance', name:'Appliances',        y:0 },
  { k:'furniture', name:'Furniture',         y:0 },
];
const W_STD = [9,12,15,18,21,24,27,30,33,36];
const ITEMS = [];
const def = o => { ITEMS.push({ wR:[6,48], hR:[6,108], dR:[6,30], opts:[], ...o }); };

/* base cabinets: 34½″ box + countertop = 36″; 24″ deep with the doors */
const baseBuild = kind => it => {
  const c=carcass(it,{kick:true, top:'stretchers', adj: kind==='door'||kind==='doordrawer' ? (it.opt.shelves??1) : 0});
  const { parts:P, t, dc, kh, ix0, ix1, zb } = c, H=it.h, W=it.w;
  if(kind==='door') P.push(...doors(0,W,kh,H,dc,'top'));
  if(kind==='doordrawer'){ const dh=it.opt.top??6; P.push(...drawer('Drawer', 0,W,H-dh,H, ix0,ix1, dc, zb), ...doors(0,W,kh,H-dh,dc,'top')); }
  if(kind==='drawers'){ const n=it.opt.drawers??3; P.push(...drawerStack(0,W,kh,H, split(H-kh, n, n>2?6:0), ix0,ix1, dc, zb)); }
  if(kind==='sink'){ P.push(...drawer('Top', 0,W,H-6,H, ix0,ix1, dc, zb, true), ...doors(0,W,kh,H-6,dc,'top')); }
  return P;
};
def({ k:'B',   cat:'base', name:'Base, doors',           w:18, h:34.5, d:24, sizes:W_STD, opts:[['shelves','Shelves',[0,1,2]]], opt:{shelves:1}, build:baseBuild('door') });
def({ k:'BDD', cat:'base', name:'Base, drawer over door', w:24, h:34.5, d:24, sizes:W_STD.filter(w=>w>=12), opts:[['shelves','Shelves',[0,1,2]],['top','Drawer front',[5,6,7]]], opt:{shelves:1, top:6}, build:baseBuild('doordrawer') });
def({ k:'BD',  cat:'base', name:'Drawer base',           w:18, h:34.5, d:24, sizes:W_STD.filter(w=>w>=12), opts:[['drawers','Drawers',[2,3,4]]], opt:{drawers:3}, build:baseBuild('drawers') });
def({ k:'BS',  cat:'base', name:'Sink base',             w:30, h:34.5, d:24, sizes:[24,27,30,33,36], build:baseBuild('sink') });

/* uppers: 12″ deep; 30 / 36 / 42″ tall (15–24″ over a fridge or range hood) */
const upperBuild = open => it => {
  const n = it.opt.shelves ?? Math.max(0, Math.round((it.h-12)/12));
  const c=carcass(it,{kick:false, top:'full', adj:n, doors:!open});
  const { parts:P, dc } = c;
  if(!open) P.push(...doors(0,it.w,0,it.h,dc,'bottom'));
  return P;
};
def({ k:'W',  cat:'upper', name:'Upper, doors',     w:30, h:30, d:12, sizes:W_STD, hSizes:[12,15,18,24,30,36,42], opts:[['shelves','Shelves',[0,1,2,3]]], opt:{shelves:2}, build:upperBuild(false) });
def({ k:'WO', cat:'upper', name:'Upper, open',      w:30, h:30, d:12, sizes:W_STD, hSizes:[12,15,18,24,30,36,42], opts:[['shelves','Shelves',[0,1,2,3]]], opt:{shelves:2}, build:upperBuild(true) });
def({ k:'WF', cat:'upper', name:'Over the fridge',  w:30, h:15, d:24, sizes:[24,30,33,36], hSizes:[12,15,18,24], opt:{shelves:0}, build:upperBuild(false) });

/* pantries: 84 / 90 / 96″, 24″ deep; a fixed shelf where the doors split */
def({ k:'P', cat:'tall', name:'Pantry, doors', w:24, h:84, d:24, sizes:[18,24,30,36], hSizes:[84,90,96], opts:[['shelves','Shelves',[3,4,5,6]]], opt:{shelves:4},
  build: it => { const split=Math.min(it.h-24, 48); const c=carcass(it,{kick:true, top:'full', fixed:[split-th('carcass')/2], adj:it.opt.shelves??4});
    const { parts:P, kh, dc } = c; P.push(...doors(0,it.w,kh,split,dc,'top','Lower door'), ...doors(0,it.w,split,it.h,dc,'bottom','Upper door')); return P; } });
def({ k:'PD', cat:'tall', name:'Pantry, drawers + doors', w:24, h:84, d:24, sizes:[18,24,30,36], hSizes:[84,90,96], opts:[['drawers','Drawers',[2,3,4]]], opt:{drawers:3},
  build: it => { const top=36; const c=carcass(it,{kick:true, top:'full', fixed:[top-th('carcass')], adj:3});
    const { parts:P, kh, dc, ix0, ix1, zb } = c; const n=it.opt.drawers??3;
    P.push(...drawerStack(0,it.w,kh,top, split(top-kh,n), ix0,ix1, dc, zb), ...doors(0,it.w,top,it.h,dc,'bottom','Upper door')); return P; } });

/* linen towers: 18 / 24″ wide, 84″, 21″ deep */
def({ k:'L', cat:'linen', name:'Linen tower', w:18, h:84, d:21, sizes:[15,18,21,24], hSizes:[72,84,90,96], opts:[['base','Lower part',['drawers','doors']]], opt:{base:'drawers'},
  build: it => { const top=34.5; const c=carcass(it,{kick:true, top:'full', fixed:[top-th('carcass')], adj:3});
    const { parts:P, kh, dc, ix0, ix1, zb } = c;
    if(it.opt.base==='doors') P.push(...doors(0,it.w,kh,top,dc,'top','Lower door')); else P.push(...drawerStack(0,it.w,kh,top, split(top-kh,3), ix0,ix1, dc, zb));
    P.push(...doors(0,it.w,top,it.h,dc,'bottom','Upper door')); return P; } });

/* wardrobes: 24″ deep, 84 / 96″ tall */
def({ k:'WD', cat:'wardrobe', name:'Wardrobe', w:36, h:84, d:24, wR:[18,48], sizes:[18,24,30,36,42,48], hSizes:[84,90,96],
  opts:[['inside','Inside',['hang','double','drawers','shelves']]], opt:{inside:'hang'},
  build: it => {
    const ins=it.opt.inside||'hang', H=it.h, W=it.w, t=th('carcass'), shelfY=H-14;
    const fixed = ins==='shelves' ? [] : ins==='drawers' ? [S.kick.h+28, shelfY] : ins==='double' ? [ (H-S.kick.h)/2+S.kick.h, shelfY ] : [shelfY];
    const c=carcass(it,{kick:true, top:'full', fixed, adj: ins==='shelves' ? Math.round((H-S.kick.h)/12)-1 : 0});
    const { parts:P, kh, dc, ix0, ix1, zb } = c;
    const rod = (y, nm='Closet rod') => P.push({...part(nm,'hw','buy',[ix0,y-1,zb+(dc-zb)/2-0.5,ix1-ix0,1,1],'y',{ex:[0,0,.8], hw:true, note:`${S.rod.name}, ${fmtU(ix1-ix0)}`})});
    if(ins==='hang') rod(shelfY-2);
    if(ins==='double'){ rod(fixed[0]-2,'Closet rod, lower'); rod(shelfY-2,'Closet rod, upper'); }
    if(ins==='drawers'){ P.push(...drawerStack(ix0,ix1,kh,kh+28, split(28,3), ix0,ix1, dc-th('door'), zb).map(p=>{ if(p.role==='front'){ p.name=p.name.replace('front','inside front'); } return p; })); rod(shelfY-2); }
    P.push(...doors(0,W,kh,H,dc,'mid'));
    return P; } });

/* vanities: 21″ deep, 34½″ (or 32½″) */
def({ k:'VD',  cat:'vanity', name:'Vanity, sink + doors',   w:30, h:34.5, d:21, sizes:[24,30,36,48], hSizes:[32.5,34.5], build:baseBuild('sink') });
def({ k:'VDR', cat:'vanity', name:'Vanity, drawers',        w:18, h:34.5, d:21, sizes:[12,15,18,21,24], hSizes:[32.5,34.5], opts:[['drawers','Drawers',[3,4]]], opt:{drawers:3}, build:baseBuild('drawers') });

/* window benches: 18″ seat (with cushion on top), 18–20″ deep */
def({ k:'WB', cat:'bench', name:'Window bench, drawers', w:48, h:17, d:18, wR:[24,120], sizes:[36,48,60,72,84,96], hSizes:[16,17,18], dSizes:[16,18,20], opts:[['bays','Drawers across',[1,2,3,4]]], opt:{bays:2},
  build: it => { const n=it.opt.bays??2, W=it.w, t=th('carcass'); const xs=[...Array(n-1)].map((_,i)=>t+(W-2*t)*(i+1)/n);
    const c=carcass(it,{kick:true, top:'full', parts:xs}); const { parts:P, kh, dc, zb } = c;
    const edges=[0, ...xs, W], inner=[t, ...xs, W-t];
    for(let i=0;i<n;i++){ const ox0=i===0?t:xs[i-1]+t/2, ox1=i===n-1?W-t:xs[i]-t/2; P.push(...drawer(`Drawer ${i+1}`, edges[i], edges[i+1], kh, it.h, ox0, ox1, dc, zb)); }
    return P; } });
def({ k:'WBL', cat:'bench', name:'Window bench, lift top', w:48, h:17, d:18, wR:[24,120], sizes:[36,48,60,72,84,96], hSizes:[16,17,18], dSizes:[16,18,20],
  build: it => { const c=carcass(it,{kick:true, top:'stretchers', doors:false}); const { parts:P, kh, dc, t } = c; const W=it.w, H=it.h;
    P.push(part('Front panel','front','door',[t,kh,dc-th('door'),W-2*t,H-kh-t,th('door')],'z',{ex:[0,0,1.5], band:{long:1,short:0}, ops:['Tenons into the sides like a fixed panel']}));
    P.push(part('Lid','front','door',[0,H,0,W,th('door'),dc],'y',{ex:[0,1.8,0], band:{long:2,short:2}, ops:['Piano hinge along the back, lid stay at one end']}));
    P.push(part('Piano hinge','hw','buy',[t,H-0.1,0.4,W-2*t,0.2,1],'y',{ex:[0,1.2,0], hw:true}));
    return P; } });

/* shelves */
def({ k:'SO', cat:'shelf', name:'Open shelving / bookcase', w:30, h:72, d:12, wR:[12,48], sizes:[18,24,30,36,42,48], hSizes:[30,36,48,60,72,84,96], dSizes:[10,12,14,16], opts:[['shelves','Shelves',[2,3,4,5,6]]], opt:{shelves:4},
  build: it => { const n=it.opt.shelves??4, kh=S.kick.h, t=th('carcass'); const fixed=[...Array(n)].map((_,i)=>kh+t+(it.h-kh-2*t)*(i+1)/(n+1)-t/2);
    const c=carcass(it,{kick:true, top:'full', fixed, doors:false}); return c.parts; } });
def({ k:'SF', cat:'shelf', name:'Floating shelf', w:48, h:2, d:10, y:60, wR:[12,120], sizes:[24,36,48,60,72,96], hSizes:[1.75,2,2.5,3], dSizes:[8,10,12],
  build: it => { const t=th('back'), W=it.w, H=it.h, D=it.d;
    return [ part('Top skin','shelf','back',[0,H-t,0,W,t,D],'y',{ex:[0,1,0], band:{long:1,short:2}}),
      part('Bottom skin','shelf','back',[0,0,0,W,t,D],'y',{ex:[0,-1,0], band:{long:1,short:2}}),
      part('Front edge','shelf','back',[0,t,D-t,W,H-2*t,t],'z',{ex:[0,0,1]}),
      part('Wall cleat','hw','buy',[0.5,t,0,W-1,H-2*t,1],'z',{ex:[0,0,-1.2], hw:true, note:'Hidden floating-shelf bracket, screwed to studs / blocking'}) ]; } });

/* fireplaces: a plywood surround around a linear electric insert (follow the insert's manual for clearances) */
const INSERTS = { 50:{w:50, h:16.5, d:5.75}, 60:{w:60, h:16.5, d:5.75}, 72:{w:72, h:16.5, d:5.75} };
def({ k:'FP', cat:'fire', name:'Fireplace surround, linear electric', w:72, h:40, d:16, wR:[48,120], sizes:[60,72,84,96], hSizes:[30,36,40,48,84,96], dSizes:[14,16,18],
  opts:[['insert','Insert',['50','60','72']]], opt:{insert:'60'},
  build: it => { const I=INSERTS[it.opt.insert]||INSERTS[60]; const W=it.w, H=it.h, t=th('carcass');
    const iy=Math.min(18, H-I.h-4), fy=iy-t;
    const c=carcass(it,{kick:true, top:'full', fixed:[fy]}); const { parts:P, dc } = c;
    const fw=Math.min(I.w, W-2*t-2), fx=(W-fw)/2;
    const face=part('Face panel','front','door',[0,S.kick.h,dc,W,H-S.kick.h,th('door')],'z',{ex:[0,0,2], band:{long:2,short:2}, grain:'v', ops:[`Cut-out for the insert ${fmtU(fw)} × ${fmtU(I.h)} (check the insert's own cut-out size)`, 'Cut back face up']});
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

const itemDef = k => ITEMS.find(i=>i.k===k);
const catOf = k => CATS.find(c=>c.k===k);
/* a fresh item of a kind, at its default size */
function newItem(k){
  const d=itemDef(k); if(!d) return null;
  const it={ k, w:d.w, h:d.h, d:d.d, y: d.y ?? catOf(d.cat)?.y ?? 0, opt:clone(d.opt||{}) };
  if(d.sized) Object.assign(it, d.sized(it));
  return it;
}
/* every part of an item, with its cut size, edge band and machining notes */
function partsOf(it){
  const d=itemDef(it.k); if(!d) return [];
  const P=d.build({ ...it, opt:{...(d.opt||{}), ...(it.opt||{})} }).filter(Boolean).map(finishPart);
  return P;
}
/* the cut list: parts grouped by material and size */
function cutList(it){
  const rows=new Map();
  partsOf(it).filter(p=>!p.hw && !p.solid).forEach(p=>{
    const nom=S.use[p.mat]||p.mat, key=[p.name.replace(/, (left|right)$/,'').replace(/ \d+( |$)/,' # '),nom,p.cutL,p.cutW,p.band.long,p.band.short].join('|');
    const r=rows.get(key); if(r) r.qty++; else rows.set(key,{ name:p.name, nom, T:p.T, L:p.cutL, W:p.cutW, fL:p.L, fW:p.W, band:p.band, ten:p.ten, ops:p.ops, qty:1 });
  });
  return [...rows.values()];
}
/* hardware: grouped by name */
function hardwareOf(it){
  const m=new Map();
  partsOf(it).filter(p=>p.hw).forEach(p=>{
    const nm = p.name==='Hinge' ? S.hinge.name : p.name==='Pull' ? `${S.pull.name}, ${Math.round(S.pull.cc/MM)} mm c-c` : p.note || p.name;
    m.set(nm,(m.get(nm)||0)+1);
  });
  const P=partsOf(it).filter(p=>!p.hw && !p.solid);
  const joints=P.reduce((s,p)=>s+(p.ten||0)*2,0);
  if(joints) m.set(`${S.screw.name} (at the joints, every ${fmtU(S.screw.every)})`, Math.ceil(joints/2));
  return [...m.entries()].map(([name,qty])=>({name,qty}));
}
/* totals for a list of placed items: plywood area per thickness, banding length */
function totals(items){
  const area={}, band={len:0};
  items.forEach(it=>partsOf(it).filter(p=>!p.hw && !p.solid).forEach(p=>{ const n=S.use[p.mat]||p.mat; area[n]=(area[n]||0)+p.cutL*p.cutW/144; band.len+=p.bandLen; }));
  const sheet=S.ply.sheet[0]*S.ply.sheet[1]/144;
  return { area, sheets:Object.fromEntries(Object.entries(area).map(([n,a])=>[n, Math.ceil(a*1.2/sheet)])), bandFt:Math.ceil(band.len/12*1.1) };
}
function csv(it, name){
  const rows=[['Part','Qty','Ply','Cut length','Cut width','Finished L','Finished W','Band long edges','Band short edges','Tenons/end','Machining']];
  cutList(it).forEach(r=>rows.push([r.name,r.qty,r.nom,fmt(r.L),fmt(r.W),fmt(r.fL),fmt(r.fW),r.band.long,r.band.short,r.ten||'',r.ops.join('; ')]));
  rows.push([]); rows.push(['Hardware','Qty']); hardwareOf(it).forEach(h=>rows.push([h.name,h.qty]));
  rows.unshift([`${name} — ${fmt(it.w)} W × ${fmt(it.h)} H × ${fmt(it.d)} D (${S.units==='mm'?'mm':'inches'})`]);
  return rows.map(r=>r.map(v=>/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:v).join(',')).join('\n');
}
export { DEFAULTS, MM, CATS, ITEMS, itemDef, catOf, newItem, partsOf, cutList, hardwareOf, totals, csv, fmt, fmtU, settings, loadSettings, saveSettings, th, nomOf };
