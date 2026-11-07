/* Cubit Builder — item-rules.js : every rule that comes with a library item, gathered in one list for the item's page
   in the Library. The same rules also show where they act (Library → Electrical / Plumbing / Heating rules, Walls →
   Wall rules), so one can appear in both places: a fridge's plug height is on the fridge and in the electrical rules. */
import { itemDef, catOf, plumbOf, newItem, tvY } from './casework.js';
import { itemElecRules, ELEC_H } from './electrical.js';
import { TYPES } from './units.js';
import { fin } from './format.js';

/* [{ area, t, also }] for a cabinet, appliance, fixture, TV … (k) */
function itemRules(k){
  const d=itemDef(k); if(!d) return [];
  const it=newItem(k), out=[], add=(area, t, also)=>out.push({ area, t, also });
  // height: where a new one goes; its Height can be changed on any one
  const cat=catOf(d.cat);
  if(d.tv) add('Height', `Middle of the screen at 42″ (seated eye level), the bottom never under 24″: this one goes ${fin(tvY(d.h))} to the bottom. Change its Height on any one to override.`);
  else if(it.y>0) add('Height', `Placed ${fin(it.y)} off the floor${cat && cat.y===it.y ? ` (the ${cat.name.toLowerCase()} height)` : ''}. Change its Height on any one to override.`);
  if(d.cat==='heat' && /^HP-/.test(k)) add('Height', 'High on an outside wall, about 6″ under the ceiling, clear each side; line set, condensate and power through the wall behind it.', 'Heating rules');
  if(/^BB-/.test(k)) add('Heating', `Usually under a window, on its own 240 V circuit${/^BB-DX/.test(k)?'; the thermostat is built into the heater (no wall thermostat)':' and thermostat'}.`, 'Heating rules');
  itemElecRules(d).forEach(t=>add('Electrical', t, 'Electrical rules'));
  const P=plumbOf(it);
  if(P){
    if(P.drain) add('Plumbing', `Drain ${fin(P.drain.dia)}, centre ${fin(P.drain.x)} along and ${fin(P.drain.z)} from the back${P.drain.below?`, ${fin(P.drain.below)} clearance under it`:''}.`, 'Plumbing rules');
    if(P.hole) add('Plumbing', `The drain hole (${P.hole.shape==='round'?`${fin(P.hole.dia)} round`:`${fin(P.hole.w)} × ${fin(P.hole.d)}`}) is cut in the interior floor cassette under it wherever it's placed: at least 3″ from the cassette edge and 1½″ clear of a panel joint.`, 'Plumbing rules');
    if(P.wall) add('Plumbing', `Valve wall on the ${P.wall.side||'left'} end: valve ${fin(P.wall.valve)}${P.wall.spout?`, spout ${fin(P.wall.spout)}`:''}${P.wall.head?`, shower arm ${fin(P.wall.head)}`:''}. The valve wall has to be an interior wall (not the SIP outside wall), with no window or door where the valve or arm go.`, 'Plumbing rules');
    if(/^(SH|TS|BT)/.test(k)) add('Plumbing', 'Needs walls on its three alcove sides.', 'Plumbing rules');
  }
  if(d.cat==='sink') add('Walls', 'Under a window, the window can be centred over the sink (the sink\'s panel → Centre the window).', 'Wall rules');
  return out;
}
/* windows and doors */
function unitRules(u){
  const T=TYPES[u.type]||{}, out=[], add=(area,t,also)=>out.push({ area, t, also });
  add('Fit', 'Goes in a rough opening no smaller than it and at most 2″ bigger each way; the only one that fits is chosen by itself.');
  if(T.cat==='window'){ add('Electrical', 'No receptacle under it: the plug goes to the nearest chase beside it.', 'Electrical rules'); add('Walls', 'Its sill height and side snapping follow Walls → Wall rules (window).', 'Wall rules'); }
  if(T.cat==='door' || T.cat==='patio'){ add('Electrical', `Switch at ${ELEC_H.switch}″, 6″ from the rough opening on the latch side, on the side the door swings into; a room with two or more doors gets 3-way switches.`, 'Electrical rules'); add('Electrical', 'Doorways break the plug run along the floor, and so does the wall behind the door swung open.', 'Electrical rules'); }
  if(u.place==='int') add('Walls', 'An interior door: only offered in interior and connecting walls (and there, before exterior doors).');
  else if(T.cat==='door') add('Electrical', 'The main outside door gets the weatherproof outside plug beside it, and a double switch box inside (room + outside light).', 'Electrical rules');
  return out;
}
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function rulesBox(list){
  if(!list.length) return '';
  return `<details class="ir-box" open><summary>Rules for this item <small>${list.length}</small></summary><ul class="ir-list">${list.map(r=>`<li><span class="ir-a">${esc(r.area)}</span>${esc(r.t)}${r.also?` <small class="muted">· also in ${esc(r.also)}</small>`:''}</li>`).join('')}</ul></details>`;
}
export { itemRules, unitRules, rulesBox };
