// Rebuild the Mozaik test kitchen cabinets with js/casework.js and compare every part with Mozaik's cut list.
// node tools/mozaik/compare.mjs
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const here=path.dirname(url.fileURLToPath(import.meta.url));
globalThis.localStorage={ getItem:()=>null, setItem:()=>{} }; globalThis.fetch=async()=>({ ok:false });
const C=await import(path.join(here,'../../js/casework.js'));
await C.loadSettings();
const rows=fs.readFileSync(path.join(here,'test-kitchen/PET Matt White 16mm.csv'),'utf8').trim().split(/\r?\n/).map(l=>l.split(','));
const MZ={}; rows.forEach(r=>{ const cab=r[4]; (MZ[cab] ||= []).push({ name:r[3].trim(), a:+r[1]/25.4, b:+r[2]/25.4 }); });
const T=0.6;
const JOBS={
  R19C3:{ k:'B',  w:22.75, h:35.5, d:23.625+T, opt:{shelves:2}, map:{'FEnd (L)':'Left end','FEnd (R)':'Right end','Bottom':'Bottom','Back':'Back','Front Stretcher':'Front stretcher','Rear Stretcher':'Rear stretcher','Front Toe':'Toe kick','Adjustable Shelf':'Adjustable shelf','Door(L)':'Door, left','Door(R)':'Door, right'} },
  R19C4:{ k:'W',  w:14, h:38.5, d:12+T, opt:{shelves:2}, map:{'FEnd (L)':'Left end','FEnd (R)':'Right end','Bottom':'Bottom','Top':'Top','Back':'Back','Adjustable Shelf':'Adjustable shelf','Door(L)':'Door'} },
  R19C1:{ k:'P',  w:20, h:74, d:17.5+T, opt:{shelves:4, kick:3.75}, map:{'FEnd (L)':'Left end','FEnd (R)':'Right end','Bottom':'Bottom','Top':'Top','Back':'Back','Fixed Shelf':'Fixed shelf','Adjustable Shelf':'Adjustable shelf','Door(R)':'Lower door'} },
};
let worst=0, out=[];
for(const [cab,j] of Object.entries(JOBS)){
  const it={ ...C.newItem(j.k), w:j.w, h:j.h, d:j.d, opt:{ ...C.newItem(j.k).opt, ...j.opt } };
  const P=C.partsOf(it).filter(p=>!p.hw && !p.solid);
  out.push(`\n${cab}  (${j.k} ${j.w} × ${j.h} × ${j.d})`);
  const used=new Set();
  for(const m of MZ[cab]){
    const want=j.map[m.name]; if(!want){ out.push(`   ?  ${m.name}`); continue; }
    const cands=P.filter((p,i)=>!used.has(i) && p.name.replace(/ \d+$/,'').startsWith(want));
    let best=null; cands.forEach(p=>{ const e=Math.min(Math.abs(p.cutL-Math.max(m.a,m.b))+Math.abs(p.cutW-Math.min(m.a,m.b)),9); if(!best||e<best.e) best={p,e}; });
    if(!best){ out.push(`   ✗ ${m.name.padEnd(17)} Mozaik ${m.a.toFixed(3)} × ${m.b.toFixed(3)}   (no ${want} in ours)`); continue; }
    used.add(P.indexOf(best.p)); worst=Math.max(worst,best.e);
    out.push(`   ${best.e<0.01?'✓':best.e<0.06?'≈':'✗'} ${m.name.padEnd(17)} Mozaik ${Math.max(m.a,m.b).toFixed(3)} × ${Math.min(m.a,m.b).toFixed(3)}   ours ${best.p.cutL.toFixed(3)} × ${best.p.cutW.toFixed(3)}   ${best.e>=0.01?'off '+best.e.toFixed(3):''}`);
  }
  P.forEach((p,i)=>{ if(!used.has(i)) out.push(`   +  ours only: ${p.name} ${p.cutL.toFixed(3)} × ${p.cutW.toFixed(3)}`); });
}
console.log(out.join('\n')); console.log('\nworst difference', worst.toFixed(3));
