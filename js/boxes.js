/* Cubit Builder — boxes.js : the electrical device boxes that go in the SIP walls, and which one a wall gets.

   A box is let into the foam from the face it serves: the CNC cuts a pocket the size of the box (plus a little
   clearance) to the box's depth plus ⅛″. A standard device box needs a 3″ pocket. In a wall thinner than 4½″
   (a thin wall between pods, a thin middle wall) that leaves too little foam behind it, so those walls get the
   shallow box automatically: its own pocket depth goes to the 3D, the sheets and the CNC (.tap Z depth).
   A box whose depth was unlocked by hand in the panel builder keeps its own. */
const BOXLIB = [
  { id:'BX-STD-1G', name:'Standard device box, 1 gang (deep)', maker:'', model:'', w:2, h:3, d:2.5, cuin:null,
    pocket:{ w:2.375, h:3.375, depth:3 }, use:'standard', note:'Every wall 4½″ and thicker.' },
  { id:'BX-IBV-1100L', name:'Iberville 3 × 2 × 1½″ deep gangable steel device box', maker:'Iberville', model:'1100L-CRT', w:2, h:3, d:1.5, cuin:8,
    pocket:{ w:2.375, h:3.375, depth:1.625 }, use:'shallow', gangable:true, steel:true, csa:true, price:6.47, sku:'1000106184',
    url:'https://www.homedepot.ca/product/iberville-3-x-2-x-1-1-2-d-gangable-8-cu-inch-rectangle-steel-device-box/1000106184',
    note:'Galvanized steel, flush mounting ears, gangs to 2 or 3 gangs. For walls thinner than 4½″.' },
  { id:'BX-JB-4SQ', name:'4″ square junction box (hardwired)', maker:'', model:'', w:4, h:4, d:2.125, cuin:null,
    pocket:{ w:4.375, h:4.375, depth:2.25 }, use:'jbox', note:'For a hardwired fireplace insert (its Power set to Hardwired): the plug box becomes this one, and the CNC pocket changes with it. In walls thinner than 4½″: the 1½″ deep version, pocket 1⅝″.' },
];
/* a box adopted from a store catalogue (stores.js, data/stores.json 'bx') joins the Cubit catalogue: its CNC pocket
   is the box plus ⅜″ each way, ⅛″ deeper than the box */
function addBox(P, storeId, storeName){
  const id=`BX-${String(storeId).toUpperCase()}-${P.sku}`.slice(0,48);
  if(boxById(id)) return boxById(id);
  const b={ id, name:`${P.brand} ${P.model}: ${P.name}`, maker:P.brand, model:P.model, w:P.w, h:P.h, d:P.d, cuin:P.cuin??null, gang:P.gang,
    pocket:{ w:+(P.w+0.375).toFixed(4), h:+(P.h+0.375).toFixed(4), depth:+(P.d+0.125).toFixed(4) }, use:'adopted', kind:P.kind, mount:P.mount,
    store:{ id:storeId, name:storeName, sku:P.sku, url:P.url }, url:P.url, note:P.note||'' };
  BOXLIB.push(b); return b;
}
const THIN_BELOW = 4.5;          // walls thinner than this get the shallow box
const boxById = id => BOXLIB.find(b=>b.id===id) || null;
/* the box a wall of thickness t (inches) gets */
const boxForWall = t => boxById(t!=null && t < THIN_BELOW-1e-6 ? 'BX-IBV-1100L' : 'BX-STD-1G');
/* a small front picture */
function boxSVG(b, px=90){
  const s=px/4, W=b.w*s, H=b.h*s, ear=0.35*s;
  return `<svg viewBox="-4 -${ear+4} ${W+8} ${H+2*ear+8}" width="${W+8}" height="${H+2*ear+8}" aria-hidden="true"><rect x="0" y="0" width="${W}" height="${H}" rx="2" fill="#c9cdd2" stroke="#3b3f42"/>
    <rect x="${W*0.3}" y="-${ear}" width="${W*0.4}" height="${ear}" fill="#b3b8bd" stroke="#3b3f42"/><rect x="${W*0.3}" y="${H}" width="${W*0.4}" height="${ear}" fill="#b3b8bd" stroke="#3b3f42"/>
    <circle cx="${W/2}" cy="${H*0.12}" r="${s*0.08}" fill="#3b3f42"/><circle cx="${W/2}" cy="${H*0.88}" r="${s*0.08}" fill="#3b3f42"/>
    <text x="${W/2}" y="${H/2+4}" text-anchor="middle" font-size="${s*0.45}" fill="#1c211e">${b.d}″ D</text></svg>`;
}
export { BOXLIB, THIN_BELOW, boxById, boxForWall, boxSVG, addBox };
