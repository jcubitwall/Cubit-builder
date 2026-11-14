/* Cubit Builder — libsettings.js : the adjustable numbers behind the Library's rules (siding trims and play, screws,
   membrane tape, ACP overlap and screws, the LVL wire holes, the heater / wall-light wire runs …). Each Library
   category's Rules page shows the ones that belong to it; editors change them there and every home uses the new
   values from then on. Shared by the team: kept with the wall rules (wall-rules.js → api/wallrules, key "lib").

   A module that uses one of these registers with onLibSettings(fn): fn runs straight away and again whenever the
   values load or change, and copies them into that module's own constants. */
import { rules, saveRules } from './wall-rules.js';

/* area → [key, label, default, unit, min, max, step] */
const SCHEMA = {
  siding: { name:'Siding', fields:[
    ['cornerLeg','Einspine corner trim: leg', 4, 'in', 2, 8, 0.125],
    ['cornerClear','Siding stops at least this far from the corner (spine clear)', 2, 'in', 0.5, 6, 0.125],
    ['cornerLap','Corner trim covers the siding at least', 1, 'in', 0.25, 3, 0.125],
    ['insideLeg','Inside corner trim: leg', 3, 'in', 1, 6, 0.125],
    ['insideClear','Siding stops at least this far from an inside corner', 0.75, 'in', 0, 3, 0.125],
    ['jointClear','Pod joint: siding stops at least', 2, 'in', 0.5, 6, 0.125],
    ['jointMax','Pod joint: siding stops at most', 6, 'in', 2, 12, 0.125],
    ['jointLap','Pod joint connector covers the siding', 1, 'in', 0.25, 3, 0.125],
    ['moldTuck','Rib end tucks into the brick-mold J-trim up to', 0.5, 'in', 0, 1.5, 0.0625],
    ['joinerW','Joiner (between two openings): width', 6, 'in', 3, 12, 0.25],
    ['nom','Panels go up at a cover of', 32.5, 'in', 31.75, 33, 0.0625],
    ['ripMin','Narrowest rip (narrower: black ACM instead)', 3, 'in', 1, 12, 0.25],
    ['screwsPanel','Screws per full panel', 12, '', 1, 40, 1],
    ['screwsRip','Screws per rip', 4, '', 1, 40, 1],
    ['screwsExtra','Extra screws for ends and odd spots', 10, '%', 0, 50, 1],
    ['screwBag','Screws per bag', 250, '', 25, 5000, 1] ] },
  acm: { name:'Black ACM', fields:[
    ['roundLap','Round windows: upper half laps over the lower', 0.5, 'in', 0, 3, 0.0625] ] },
  membrane: { name:'Membrane', fields:[
    ['tapeW','Seam tape width', 3, 'in', 1, 8, 0.25] ] },
  acp: { name:'ACP accent walls', fields:[
    ['overlap','Sheets overlap at each joint', 0.5, 'in', 0, 2, 0.0625],
    ['screwEvery','Screws in the reveals about every', 16, 'in', 6, 36, 1],
    ['screwFromEnd','First screw from the end of a reveal', 2, 'in', 0.5, 6, 0.25] ] },
  lvl: { name:'LVL wire holes', fields:[
    ['bit','Bit', 0.75, 'in', 0.25, 2, 0.0625],
    ['out','Centre out from the brick mold', 2, 'in', 0.5, 12, 0.125],
    ['below','Centre below the roof surface', 5.5, 'in', 1, 12, 0.125] ] },
  heater: { name:'Baseboard heater wire', fields:[
    ['up','Hole up from the floor', 3, 'in', 1, 12, 0.125],
    ['inFromRight','Hole in from the heater\'s right end', 3, 'in', 1, 24, 0.125],
    ['chaseY','Run leaves the chase at', 6, 'in', 2, 24, 0.25],
    ['r','Bend radius', 3, 'in', 1, 12, 0.25],
    ['endDepth','Groove depth where it reaches the heater', 1, 'in', 0.25, 3, 0.125] ] },
};
const subs=[];
const libSettings = () => rules()?.lib || {};
function ls(area, key){
  const f=SCHEMA[area]?.fields.find(x=>x[0]===key); const v=libSettings()?.[area]?.[key];
  return typeof v==='number' && isFinite(v) ? v : f ? f[2] : undefined;
}
function onLibSettings(fn){ subs.push(fn); try{ fn(ls); }catch(e){} }
function applyLibSettings(){ subs.forEach(fn=>{ try{ fn(ls); }catch(e){ console.warn('lib settings', e); } }); }
/* save the changed values of some areas: { area:{ key:value } } (editors; shared through the wall rules) */
async function saveLibSettings(changes){
  const R=JSON.parse(JSON.stringify(rules()||{})), lib=R.lib ||= {};
  Object.entries(changes).forEach(([a,o])=>{ lib[a]={ ...(lib[a]||{}), ...o }; });
  await saveRules(R); applyLibSettings();
}
async function resetLibSettings(areas){
  const R=JSON.parse(JSON.stringify(rules()||{})); if(R.lib) areas.forEach(a=>delete R.lib[a]);
  await saveRules(R); applyLibSettings();
}
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* the settings form for some areas */
function libSettingsHTML(areas, canEdit){
  const A=areas.filter(a=>SCHEMA[a]); if(!A.length) return '';
  return `<div class="ls-box">${A.map(a=>`<fieldset class="ls-area"><legend>${esc(SCHEMA[a].name)}</legend>
    ${SCHEMA[a].fields.map(([k,label,def,unit,min,max,step])=>{ const v=ls(a,k), changed=Math.abs(v-def)>1e-9;
      return `<label class="ls-f"><span>${esc(label)}</span><span class="ls-in"><input type="number" data-ls="${a}:${k}" value="${v}" min="${min}" max="${max}" step="${step}" ${canEdit?'':'disabled'}>${unit?`<small>${unit==='in'?'″':unit}</small>`:''}</span>${changed?`<small class="ls-def">was ${def}${unit==='in'?'″':unit}</small>`:''}</label>`; }).join('')}</fieldset>`).join('')}
    ${canEdit?`<div class="row"><button class="btn sm" id="lsSave">Save these settings</button><button class="btn ghost sm" id="lsReset">Back to the standard values</button><span class="note">Every home uses them from then on, for the whole team.</span></div>`:'<p class="note">Editors and admins can change these.</p>'}</div>`;
}
function bindLibSettings(box, areas, done, toast=()=>{}){
  if(!box) return;
  box.querySelector('#lsSave')?.addEventListener('click', async()=>{
    const ch={}; box.querySelectorAll('[data-ls]').forEach(i=>{ const [a,k]=i.dataset.ls.split(':'), v=parseFloat(i.value), f=SCHEMA[a].fields.find(x=>x[0]===k);
      if(isFinite(v) && v>=f[4] && v<=f[5]) (ch[a] ||= {})[k]=v; });
    try{ await saveLibSettings(ch); toast('Settings saved for the whole team'); done(); }catch(e){ toast('Not saved: '+e.message); } });
  box.querySelector('#lsReset')?.addEventListener('click', async()=>{ try{ await resetLibSettings(areas); toast('Back to the standard values'); done(); }catch(e){ toast('Not saved: '+e.message); } });
}
export { SCHEMA as LIB_SETTINGS, ls, onLibSettings, applyLibSettings, saveLibSettings, libSettingsHTML, bindLibSettings };
