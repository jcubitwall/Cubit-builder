/* Cubit Builder — plumbing.js : where a fixture's plumbing lands in the home, and the rules it brings.

   A fixture with plumbing points (casework.js `plumb`, e.g. the Mirolin Liberty tub-shower) is placed like any
   furniture; from where it stands this works out, every time the home changes:
     · the drain: its exact point in the floor (from the fixture's back and its drain end), size, and the floor
       opening it needs under it;
     · the valve wall: which wall the valve, spout and shower arm go in, how far along it (seen from inside) and how
       high, with the ½″ PEX hot and cold supplies to the valve.
   The rules (flagged on the fixture, on the wall and on the plumbing plan):
     · an alcove unit needs a wall at its back and at both ends;
     · the valve end must be against a wall, and an inside one: no supply pipes in a SIP outside wall (mirror the
       unit or turn it so the valve end is on an inside wall, or fur out a chase);
     · no window or door in that wall where the valve, spout or shower arm go.
   Electrical takes its part from electrical.js: no receptacle within 500 mm of a tub or shower (measured across
   the floor, same room), and the walls behind the unit carry no boxes. P11 (blueprint.js) draws the drain at its
   real point with the valve wall marked. */
import { MODELS } from './data.js';
import { state } from './state.js';
import { homeModel } from './blueprint.js';
import { plumbOf } from './casework.js';
import { FT } from './config.js';
import { fin } from './format.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ON_WALL = 2;      // a fixture's end within 2″ of a wall's inside face is against it
const CLEAR = 6;        // openings kept this far from the valve, spout and arm

let memo={ sig:null, v:null };
const sigOf = k => { const m=MODELS[k]; return JSON.stringify([k, m?.pods, m?.picks, m?.units, m?.joint, m?.wallA, state.picks?.[k], state.faces?.[k], state.units?.[k], state.wallA?.[k], state.furniture?.[k]]); };

/* the wall a plan point (feet) sits against, inside face, same pod: { W, a (along from the outside-left end), xin (from the left seen from inside), off } */
function wallAt(Hm, pod, P){
  let best=null;
  Hm.walls.forEach(W=>{ if(W.s.pod.i!==pod) return;
    const off=((P[0]-W.S[0])*W.m[0]+(P[1]-W.S[1])*W.m[1])*FT - W.t*FT, a=((P[0]-W.S[0])*W.d[0]+(P[1]-W.S[1])*W.d[1])*FT, L=W.L*FT;
    if(Math.abs(off)>ON_WALL || a<-0.5 || a>L+0.5) return;
    if(!best || Math.abs(off)<Math.abs(best.off)) best={ W, a, xin:L-a, off }; });
  return best;
}

function compute(k){
  const Hm=homeModel(k), out=[];
  Hm.items.forEach(I=>{ const p=plumbOf(I.it); if(!p) return;
    const w=I.it.w, d=I.it.d, name=I.it.label||I.def.name, flags=[], F={ id:I.it.id, I, name, p, flags };
    if(p.drain) F.drain={ P:I.f(p.drain.lx, p.drain.lz), dia:p.drain.dia };
    if(p.hole){ const h=p.hole; F.hole={ ...h, pts:[[-h.w/2,-h.d/2],[h.w/2,-h.d/2],[h.w/2,h.d/2],[-h.w/2,h.d/2]].map(([x,z])=>I.f(p.hole.lx+x, p.hole.lz+z)) }; }
    if(p.wall){ const v=p.wall, at=wallAt(Hm, I.it.pod, I.f(v.lx, v.lz));
      F.wall={ ...v, at, P:I.f(v.lx, v.lz) };
      const end = v.side==='left' ? 'left' : 'right';
      if(!at) flags.push(`The valve end (${end}) isn’t against a wall: the valve, spout and shower arm need one`);
      else {
        if(at.W.s.type==='ext') flags.push(`The valve end (${end}) is on an outside wall (${at.W.s.label}): no supply pipes in a SIP wall. Mirror it or turn it so the valve end is on an inside wall, or fur out a chase`);
        const y0=Math.min(v.spout, v.valve)-CLEAR, y1=v.head+CLEAR, a=at.a;
        const hit=(at.W.w.openings||[]).find(o=>a+CLEAR>o.x && a-CLEAR<o.x+o.w && y1>o.y && y0<o.y+o.h);
        if(hit) flags.push(`A ${hit.kind==='window'?'window':hit.kind==='door'||hit.kind==='patio'?'door':'opening'} in ${at.W.s.label} is where the valve / shower arm go`);
      }
    }
    if(p.alcove){
      const back=wallAt(Hm, I.it.pod, I.f(0,0)), other=wallAt(Hm, I.it.pod, I.f(p.wall?.side==='left' ? w/2 : -w/2, d/2));
      F.back=back; F.other=other;
      const miss=[!back&&'its back', !other&&'its other end'].filter(Boolean);
      if(miss.length) flags.push(`Alcove unit: needs a wall at ${miss.join(' and ')} (a ${fin(w)} alcove)`);
    }
    out.push(F);
  });
  return { fixtures:out };
}
function plumbing(k=state.model){
  if(!MODELS[k]) return { fixtures:[] };
  const sig=sigOf(k); if(memo.sig===sig) return memo.v;
  let v; try{ v=compute(k); }catch(e){ console.warn('plumbing', e); v={ fixtures:[] }; }
  memo={ sig, v }; return v;
}
const fixtureOf = id => plumbing().fixtures.find(F=>F.id===id) || null;

/* ---------------------------------------------------------------- words */
const flagsHTML = F => F.flags.map(f=>`<span class="el-warn">${esc(f)}</span>`).join(' ');
/* the selected fixture (furniture side panel) */
function plumbNote(it){
  const F=fixtureOf(it.id); if(!F) return '';
  const p=F.p, v=F.wall, dr=p.drain, end=v?.side||"left";
  const rows=[];
  if(dr) rows.push(`<b>Drain</b> ${fin(dr.dia)} · centre ${fin(dr.x)} from the ${end} end, ${fin(dr.z)} from the back${dr.below?` · ${fin(dr.below)} clear under the tub`:''}`);
  if(p.hole) rows.push(`<b>Floor opening</b> ${fin(p.hole.w)} × ${fin(p.hole.d)} on the drain (${esc(p.hole.note)})`);
  if(p.overflow) rows.push(`<b>Overflow</b> ${fin(p.overflow.dia)}, ${fin(p.overflow.y)} up on the ${end} end`);
  if(v) rows.push(`<b>Valve wall</b> ${v.at ? `${esc(v.at.W.s.label)}${v.at.W.s.type==='ext'?' (outside)':''}, ${fin(v.at.xin)} from the left seen from inside` : 'none'} · valve ${fin(v.valve)}, spout ${fin(v.spout)}, shower arm ${fin(v.head)} up${v.std?' (usual heights: check the trim you buy)':''}`);
  if(p.supply) rows.push(`<b>Supplies</b> ${esc(p.supply)}`);
  return `<div class="el-box"><div class="eyebrow">Plumbing</div>${rows.map(r=>`<p class="note">${r}</p>`).join('')}
    ${F.flags.length?`<div class="el-tags">${flagsHTML(F)}</div>`:'<p class="note"><span class="el-ok">Plumbing rules met</span></p>'}
    <p class="note muted">From the ${esc(p.src||'maker’s sheet')}. No plugs within 500 mm of it; none on the walls behind it.</p></div>`;
}
/* one wall (wall side panel): the plumbing that goes in it */
function plumbWallBlock(s){
  const F=plumbing().fixtures.filter(F=>F.wall?.at?.W.s.id===s.id); if(!F.length) return '';
  return `<div class="el-box"><div class="eyebrow">Plumbing in this wall</div>${F.map(f=>{ const v=f.wall;
    return `<p class="note"><b>${esc(f.name)}</b>: valve ${fin(v.valve)}, spout ${fin(v.spout)}, shower arm ${fin(v.head)} up, ${fin(v.at.xin)} from the left (seen from inside). ${esc(f.p.supply||'')}</p>${f.flags.length?`<div class="el-tags">${flagsHTML(f)}</div>`:''}`; }).join('')}</div>`;
}

export { plumbing, fixtureOf, plumbNote, plumbWallBlock };
