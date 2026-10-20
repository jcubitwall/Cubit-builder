/* Cubit Builder — format.js */


/* ============================================================ formatting */
function fin(v){ // inches -> 48 1/2"
  const n = Math.round(v*16); const w = Math.floor(n/16); let r = n%16; let d = 16;
  if(!r) return w+'"';
  while(r%2===0){ r/=2; d/=2; }
  return (w? w+' ':'')+r+'/'+d+'"';
}
function fft(v){ const ft=Math.floor((v+1e-6)/12); const i=v-ft*12; return ft+"′-"+fin(i).replace('"','″'); }
const asciiFt = v => { const ft=Math.floor((v+1e-6)/12); return ft+"'-"+fin(v-ft*12); };

export { fin, fft, asciiFt };
