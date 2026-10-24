/* Cubit Builder — history.js : undo / redo for building a home (pods, decks, walls picked, windows, cabinets).
   A checkpoint is taken just before every change; Undo puts the home back as it was. */
import { MODELS, saveCustomModels } from './data.js';
import { state, save } from './state.js';

const U=[], R=[], MAX=80;
let quiet=false, onRestore=()=>{};
const FIELDS=['picks','layerPicks','units','wallA','faces','cabinets','lights'];
function snap(){
  const k=state.model;
  return { model:k, entry:JSON.stringify(MODELS[k]), furniture:JSON.stringify(state.furniture?.[k]||[]), f:JSON.stringify(FIELDS.map(f=>state[f]?.[k]??null)) };
}
/* call just before a change */
function checkpoint(){
  if(quiet) return;
  const s=snap(), last=U[U.length-1];
  if(last && last.model===s.model && last.entry===s.entry && last.furniture===s.furniture && last.f===s.f) return;   // nothing changed since
  U.push(s); if(U.length>MAX) U.shift(); R.length=0;
}
function restore(s){
  quiet=true;
  MODELS[s.model]=JSON.parse(s.entry); state.model=s.model;
  (state.furniture ||= {})[s.model]=JSON.parse(s.furniture);
  JSON.parse(s.f).forEach((v,i)=>{ const f=FIELDS[i]; (state[f] ||= {}); if(v==null) delete state[f][s.model]; else state[f][s.model]=v; });
  state.selected=null; state.selFurn=null;
  if(MODELS[s.model].custom) saveCustomModels();
  save(); quiet=false; onRestore();
}
function undo(){ if(!U.length) return false; R.push(snap()); restore(U.pop()); return true; }
function redo(){ if(!R.length) return false; U.push(snap()); restore(R.pop()); return true; }
const canUndo = () => U.length>0, canRedo = () => R.length>0;
const onHistory = fn => { onRestore=fn; };
export { checkpoint, undo, redo, canUndo, canRedo, onHistory };
