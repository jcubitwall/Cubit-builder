/* Cubit Builder — finishes.js : the finishes a customer picks by eye (finishes-ui.js), kept on the home itself
   (MODELS[k].finish, so it travels with a draft, a team home and a customer's home).

     siding    the outside of the exterior walls (lap siding, in a colour)
     roof      the roof
     paint     the inside faces of the walls
     floor     the flooring
     cabinets  the cabinet finish (recorded for the selections; the 3D keeps the library's look)

   In Design the 3D shows them (scene3d.js puts a thin skin of siding / paint on the wall faces, finishes-ui.js tints
   the roof and the floor); Shop and the drawings are unchanged. They also fill the customer's finish selections. */
import { MODELS } from './data.js';
import { state } from './state.js';
import { isDesign } from './mode.js';

const PALETTE = {
  siding:   [['Natural cedar','#b58a5a'], ['Barn red','#8e3b2e'], ['Charcoal','#3c4043'], ['Slate blue','#50677a'], ['Sage','#8a9a7b'], ['Cream','#e8dfc8'], ['White','#f2f1ec'], ['Black','#1f2224']],
  roof:     [['Charcoal','#34383b'], ['Black','#1d1f20'], ['Galvalume','#a9adb0'], ['Forest green','#2f4a35'], ['Barn red','#7d2f26'], ['Brown','#5a4636']],
  paint:    [['Warm white','#f1ece2'], ['Bright white','#fafaf7'], ['Greige','#d8d0c2'], ['Pale grey','#dcdfe0'], ['Soft sage','#c9d2c0']],
  floor:    [['Light oak','#d8b98c'], ['Natural oak','#c49a66'], ['Walnut','#7a5536'], ['Grey wash','#a9a39a'], ['Concrete','#b9b8b2']],
  cabinets: [['White','#f3f2ee'], ['Light oak','#d6b88f'], ['Navy','#2e3b55'], ['Sage','#8e9f86'], ['Black','#232526']],
};
const LABEL = { siding:'Siding', roof:'Roof', paint:'Wall paint', floor:'Flooring', cabinets:'Cabinets' };
const finishOf = (k=state.model) => MODELS[k]?.finish || {};
const colourOf = (part, k=state.model) => { const n=finishOf(k)[part]; return n ? (PALETTE[part].find(p=>p[0]===n)?.[1] || null) : null; };
/* what the 3D shows (Design only): null when nothing's picked */
function designFinish(k=state.model){
  if(!isDesign()) return null;
  const F={ siding:colourOf('siding',k), roof:colourOf('roof',k), paint:colourOf('paint',k), floor:colourOf('floor',k) };
  return Object.values(F).some(Boolean) ? F : null;
}
/* the customer's finish selections, filled from what was picked here (typed ones on the profile win) */
function finishText(k=state.model){
  const f=finishOf(k), o={};
  if(f.siding){ o.cladding='Lap siding'; o.claddingColour=f.siding; }
  if(f.floor) o.flooring=f.floor; if(f.paint) o.walls=`Paint · ${f.paint}`; if(f.cabinets) o.cabinets=f.cabinets;
  if(f.roof) o.other=`Roof · ${f.roof}`;
  return o;
}
export { PALETTE, LABEL, finishOf, colourOf, designFinish, finishText };
