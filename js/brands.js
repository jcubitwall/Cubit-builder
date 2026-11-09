/* Cubit Builder — brands.js : window and door makers, their catalogues, and the rough opening each unit needs.

   data/brands.json (tools/brands/*.py) holds each maker's catalogue as scanned from its site: the styles, each
   with a grid of sizes, the options (colours, glass, grilles), and the maker's rough-opening rule. The catalogue
   is only for looking at: a unit is usable in a home once an editor or admin ADOPTS it into the Cubit library
   (units.js), where it can then be edited to any size.

   Rough stud opening (RSO): the unit's own rso when it has one, else unit + the brand's allowance
   (North Air: + 1¼″ wide and high), else unit + 1¼″. Brickmould likewise (North Air: unit + 3″). */
const BRANDS = [];
async function loadBrands(){
  try{ const r=await fetch('data/brands.json'); if(r.ok){ BRANDS.length=0; ((await r.json()).brands||[]).forEach(b=>BRANDS.push(b)); } }catch(e){}
}
const brandById = id => BRANDS.find(b=>b.id===id) || null;
/* the brand a unit is filed under: its own `brand`, else its maker matched by name; samples and Cubit's own */
function brandKeyOf(u){
  if(!u) return 'other';
  if(u.brand) return u.brand;
  const m=String(u.maker||'').toLowerCase().trim();
  const b=m && BRANDS.find(b=>[b.id, b.name.toLowerCase(), ...(b.match||[])].includes(m));
  if(b) return b.id;
  if(u.sample) return 'sample';
  return m ? m.replace(/[^a-z0-9]+/g,'-') : 'cubit';
}
const BRAND_NAMES = { sample:'Placeholders (samples)', cubit:'Cubit', other:'Other' };
const brandName = key => brandById(key)?.name || BRAND_NAMES[key] || String(key).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const r16 = v => Math.round(v*16)/16;
/* the rough stud opening a unit needs: { w, h } (round units: their own) */
function rsoOf(u){
  if(!u) return null;
  if(u.rso && !u.rsoAuto) return { w:u.rso.w, h:u.rso.h };
  if(u.type==='round') return { w:u.w+1, h:u.h+1 };   // Cubit's round window: 32″ in a 33″ round opening
  const b=brandById(brandKeyOf(u)), dw=b?.rso?.dw ?? 1.25, dh=b?.rso?.dh ?? 1.25;
  return { w:r16(u.w+dw), h:r16(u.h+dh) };
}
function bmOf(u){
  if(u?.bm && !u.rsoAuto) return { ...u.bm };
  const b=brandById(brandKeyOf(u)); if(!b?.bm) return null;
  return { w:r16(u.w+b.bm.dw), h:r16(u.h+b.bm.dh) };
}
/* 70.75 → 70¾ */
const fr = v => { const n=Math.floor(v), f=Math.round((v-n)*16); if(!f) return String(n); const g=(a,b)=>b?g(b,a%b):a, d=g(f,16); return `${n} ${f/d}/${16/d}`.replace(' 1/2','½').replace(' 1/4','¼').replace(' 3/4','¾'); };
const code2 = v => String(Math.round(v)).padStart(2,'0');
/* a brand's catalogue as units: [{ id, name, type, w, h, d, brand, style, maker, confirm, url, … }] */
const catCache=new Map();
function catalogOf(brandId){
  if(catCache.has(brandId)) return catCache.get(brandId);
  const b=brandById(brandId); if(!b) return [];
  const out=[];
  const add=(s, w, h, note)=>{
    const u={ id:`${b.id==='north-air'?'NA':b.id.slice(0,3).toUpperCase()}-${s.code}-${code2(w)}${code2(h)}`, name:`${b.name} ${s.name} ${fr(w)} × ${fr(h)}`,
      type:s.type, w, h, d:b.d||4.5, brand:b.id, maker:b.name, style:s.key, confirm:true, url:s.url, source:`${b.name} catalogue` };
    if(note) u.note=note;
    u.rso=rsoOf({ ...u, rso:null }); const bm=bmOf({ ...u, bm:null }); if(bm) u.bm=bm;
    out.push(u); };
  (b.styles||[]).forEach(s=>{ s.w.forEach(w=>s.h.forEach(h=>add(s, w, h))); (s.extra||[]).forEach(x=>add(s, x.w, x.h, x.note)); });   // extra: sizes off the grid
  catCache.set(brandId, out); return out;
}
const styleOf = (brandId, key) => brandById(brandId)?.styles?.find(s=>s.key===key) || null;
export { BRANDS, loadBrands, brandById, brandKeyOf, brandName, rsoOf, bmOf, catalogOf, styleOf };
