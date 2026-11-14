/* Cubit Builder — productview.js : the store-style product card and product page used in the Library (and, later,
   on the customer website). Built to read like a shop app: a card shows the photo, the name with its brand in bold,
   the price (the old price struck through when it's on sale), badges and how many are in stock; tapping it opens
   the product page: photos to swipe across (or our drawing / 3D of it), and an info sheet dragged up from the
   bottom with the price, where it's in stock, the Cubit notes and rules, the specs and the documents.

   A product: { sku, name, brand, model, price, was, unit, url, note, images:[url], docs:[{name,url}], stock:n |
   { '<location>':n }, stockAt, w, h, d, lbs, btu, watts, power, gang, cuin, material, mount, kind } — all optional
   but the name. */
import { mediaOf, teamOf, saveMedia, uploadMedia } from './productmedia.js';
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money = v => '$'+(+v).toLocaleString('en-CA', { minimumFractionDigits:2, maximumFractionDigits:2 });
const inch = v => { const w=Math.floor(v+1e-6), f=Math.round((v-w)*16), g=(a,b)=>b?g(b,a%b):a; return f ? (f===16?`${w+1}″`:`${w?w+' ':''}${f/g(f,16)}/${16/g(f,16)}″`) : `${w}″`; };

/* in stock: [{ where, n }] from a number or a map of locations */
function stockOf(P, store){
  if(P.stock==null) return [];
  if(typeof P.stock==='number') return [{ where:store?.pickup||store?.address||store?.name||'Store', n:P.stock }];
  return Object.entries(P.stock).map(([where,n])=>({ where, n:+n }));
}
function stockLine(n){ return n<=0 ? '<span class="pv-out">Out of stock</span>' : n<=3 ? `<span class="pv-low">Only ${n} left</span>` : `<span class="pv-in">${n} in stock</span>`; }
function priceHTML(P, big=false){
  if(!(P.price>0)) return `<div class="pv-price${big?' big':''}"><span class="pv-ask">Price on request</span></div>`;
  const sale=P.was>P.price;
  return `<div class="pv-price${big?' big':''}"><b class="${sale?'sale':''}">${money(P.price)}</b>${P.unit?`<small> / ${esc(P.unit)}</small>`:''}${sale?` <s>${money(P.was)}</s><div class="pv-save">Save ${Math.round((1-P.price/P.was)*100)}% (${money(P.was-P.price)})</div>`:''}</div>`;
}
/* the name with the brand in bold, as the shops write it */
function titleHTML(P){
  const b=P.brand||'', n=String(P.name||'');
  if(b && n.toLowerCase().startsWith(b.toLowerCase())) return `<b>${esc(n.slice(0,b.length))}</b>${esc(n.slice(b.length))}`;
  return b ? `<b>${esc(b)}</b> ${esc(n)}` : esc(n);
}
/* a card. o: { thumb (svg html when there's no photo), adopted, badges:[text], store, actions (html), id } */
function productCard(P, o={}){
  const S=stockOf(P, o.store), total=S.reduce((a,s)=>a+s.n,0);
  // the photo over our drawing: if the photo won't load, the drawing shows
  const img=(o.thumb||'')+(P.images?.[0] ? `<img src="${esc(P.images[0])}" alt="" loading="lazy" onerror="this.remove()">` : '');
  const badges=[o.adopted?'<span class="pv-badge cubit">Cubit approved</span>':'', ...(o.badges||[]).map(b=>`<span class="pv-badge">${esc(b)}</span>`), P.was>P.price?'<span class="pv-badge sale">Sale</span>':''].join('');
  return `<article class="pv-card${o.cls?' '+o.cls:''}" data-pv="${esc(o.id||P.sku)}"${o.attrs||''} tabindex="0" aria-label="${esc(P.name)}">
    <div class="pv-ph">${img}</div>
    <h4 class="pv-t">${titleHTML(P)}</h4>
    ${o.sub?`<small class="pv-sub">${esc(o.sub)}</small>`:''}
    ${o.noPrice && !(P.price>0) ? '' : priceHTML(P)}
    ${badges?`<div class="pv-badges">${badges}</div>`:''}
    <div class="pv-av">${S.length ? stockLine(total) : P.ship==='check' ? '<span class="pv-chk">Check stock</span>' : o.store ? `<span class="pv-chk">${esc(o.store.kind==='online'?'Online':'At '+o.store.name)}</span>` : ''}</div>
    ${o.actions?`<div class="pv-acts">${o.actions}</div>`:''}</article>`;
}
/* the specs as rows */
function specRows(P){
  const R=[];
  if(P.w>0 && P.h>0) R.push(['Size (W × H × D)', `${inch(P.w)} × ${inch(P.h)}${P.d>0?` × ${inch(P.d)}`:''}`]);
  if(P.lbs) R.push(['Weight', `${P.lbs} lb`]);
  if(P.btu) R.push(['Heat', `${(+P.btu).toLocaleString()} BTU`]);
  if(P.heat) R.push(['Heats', P.heat]);
  if(P.watts) R.push(['Power', `${P.watts} W`]);
  if(P.power) R.push(['Electrical', P.power]);
  if(P.gang) R.push(['Gangs', P.gang]);
  if(P.cuin) R.push(['Volume', `${P.cuin} cu in`]);
  if(P.material) R.push(['Material', P.material]);
  if(P.mount) R.push(['Mount', P.mount]);
  if(P.recess!=null) R.push(['Recessed', P.recess?'Yes, or on the wall':'No']);
  if(P.model) R.push(['Model', P.model]);
  if(P.sku) R.push(['SKU / item #', P.sku]);
  if(P.checked) R.push(['Details checked', P.checked]);
  return R;
}
/* the product page, over whatever it's opened from (host: the element to sit in).
   o: { store, adopted, thumb (big drawing html), extraSlides:[html], rules:[[topic,text]], cubitNote, actions (html), onBind(el) } */
function openProduct(host, P, o={}){
  close();
  const slides=[...(P.images||[]).map(u=>`<img src="${esc(u)}" alt="${esc(P.name)}" onerror="this.parentNode.remove()">`), ...(o.extraSlides||[]), o.thumb||''].filter(Boolean);
  const S=stockOf(P, o.store), specs=specRows(P);
  const el=document.createElement('div'); el.className='pv-page'; el.setAttribute('role','dialog'); el.setAttribute('aria-label', P.name);
  el.innerHTML=`<div class="pv-top"><button class="pv-x" aria-label="Close">✕</button><span class="pv-crumb">${esc(o.crumb||'')}</span></div>
    <div class="pv-gal"><div class="pv-track">${slides.map(s=>`<div class="pv-slide">${s}</div>`).join('')}</div>${slides.length>1?`<div class="pv-dots">${slides.map((_,i)=>`<i class="${i?'':'on'}"></i>`).join('')}</div>`:''}</div>
    <section class="pv-sheet" aria-label="Details"><div class="pv-grip" aria-hidden="true"></div>
      <h3 class="pv-name">${titleHTML(P)}</h3>${P.sku?`<div class="pv-sku">#${esc(P.sku)}</div>`:''}
      ${priceHTML(P, true)}
      <div class="pv-badges">${o.adopted?'<span class="pv-badge cubit">Cubit approved</span>':''}${P.was>P.price?'<span class="pv-badge sale">Sale</span>':''}</div>
      <div class="pv-stock"><h4>${esc(o.store?.name||'Where to get it')}</h4>
        ${S.length ? S.map(s=>`<div class="pv-loc"><b>${esc(s.where)}</b>${stockLine(s.n)}</div>`).join('') + (P.stockAt?`<small>as of ${esc(P.stockAt)}</small>`:'')
          : `<div class="pv-loc">${P.ship==='check' ? 'Stock not checked yet: see the store.' : o.store?.kind==='online' ? 'Online store.' : o.store?.address ? esc(o.store.address) : 'Stock not linked yet.'}</div>`}
        ${P.url?`<a class="btn ghost sm" href="${esc(P.url)}" target="_blank" rel="noopener">Open at ${esc(o.store?.name||'the store')}</a>`:''}</div>
      ${o.actions?`<div class="pv-acts big">${o.actions}</div>`:''}
      ${o.cubitNote||P.note?`<h4>Cubit notes</h4>${o.cubitNote?`<p>${esc(o.cubitNote)}</p>`:''}${P.note?`<p>${esc(P.note)}</p>`:''}`:''}
      ${o.rules?.length?`<h4>Rules when it goes in a home</h4><ul class="pv-rules">${o.rules.map(([a,t])=>`<li><span>${esc(a)}</span>${esc(t)}</li>`).join('')}</ul>`:''}
      ${specs.length?`<h4>Specifications</h4><table class="pv-specs"><tbody>${specs.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`:''}
      ${P.docs?.length||P.docNames?.length?`<h4>Documents</h4><ul class="pv-docs">${(P.docs||[]).map(d=>`<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name||'Document')}</a></li>`).join('')}${P.docNames?.length?`<li>On ${P.url?`<a href="${esc(P.url)}" target="_blank" rel="noopener">the store's page</a>`:"the store's page"}: ${P.docNames.map(esc).join(' · ')}</li>`:''}</ul>`:''}
      ${o.edit?editHTML(P, o.edit):''}
    </section>`;
  host.appendChild(el);
  // the photos: swipe across, the dots follow
  const tr=el.querySelector('.pv-track'), dots=[...el.querySelectorAll('.pv-dots i')];
  tr?.addEventListener('scroll', ()=>{ const i=Math.round(tr.scrollLeft/Math.max(1,tr.clientWidth)); dots.forEach((d,k)=>d.classList.toggle('on', k===i)); }, { passive:true });
  // the info sheet: drag its grip (or the top of it) up to read, down to see the photos again
  const sh=el.querySelector('.pv-sheet'), grip=el.querySelector('.pv-grip'), H=()=>el.clientHeight;
  const LOW=()=>H()*0.52, HIGH=()=>H()*0.06; let top=LOW(), drag=null;
  const set=(y,anim)=>{ top=Math.max(HIGH(), Math.min(H()*0.8, y)); sh.style.transition=anim?'top .22s ease':'none'; sh.style.top=top+'px'; sh.classList.toggle('up', top<H()*0.3); };
  set(LOW(), false);
  const start=e=>{ if(e.target.closest('a,button,input')) return; if(sh.scrollTop>0 && e.target!==grip) return; drag={ y:e.clientY, t:top, moved:false }; sh.setPointerCapture?.(e.pointerId); };
  sh.addEventListener('pointerdown', start);
  sh.addEventListener('pointermove', e=>{ if(!drag) return; const dy=e.clientY-drag.y; if(Math.abs(dy)>4) drag.moved=true; if(drag.moved){ set(drag.t+dy,false); e.preventDefault(); } });
  const end=()=>{ if(!drag) return; const mid=(LOW()+HIGH())/2, was=drag; drag=null; if(!was.moved){ set(top>mid?HIGH():LOW(), true); return; } set(top<mid?HIGH():LOW(), true); };
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
  el.querySelector('.pv-x').onclick=close;
  el.addEventListener('keydown', e=>{ if(e.key==='Escape'){ e.stopPropagation(); e.preventDefault(); close(); } });
  el.querySelector('.pv-x').focus();
  if(o.edit) bindEdit(el, P, o);
  o.onBind?.(el);
  return el;
}
/* editors: the product's photos, documents and details (productmedia.js: kept for the whole team) */
const FIELDS=[['brand','Brand'],['model','Model'],['price','Price $','num'],['was','Regular price $ (when on sale)','num'],['watts','Watts','num'],['btu','BTU','num'],['power','Electrical (volts, amps, plug-in…)'],['heat','Heats (area)'],['lbs','Weight lb','num']];
function editHTML(P, E){
  const m=mediaOf(E.key);
  return `<details class="pv-edit"${E.open?' open':''}><summary>Edit photos, documents and details</summary>
    <h5>Photos</h5><div class="pv-thumbs">${(m.images||P.images||[]).map((u,i)=>`<span><img src="${esc(u)}" alt="" onerror="this.style.opacity=.15"><button data-rmimg="${i}" aria-label="Remove photo">✕</button></span>`).join('')||'<small>None yet.</small>'}</div>
    <div class="row"><label class="btn ghost sm">Add photos<input type="file" accept="image/*" multiple hidden id="pvPh"></label><input id="pvPhUrl" placeholder="or paste a photo link (https://…)"><button class="btn ghost sm" id="pvPhAdd">Add</button></div>
    <h5>Documents</h5><ul class="pv-docs">${(m.docs||P.docs||[]).map((d,i)=>`<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a> <button class="linkbtn" data-rmdoc="${i}">remove</button></li>`).join('')||'<li><small>None yet.</small></li>'}</ul>
    <div class="row"><label class="btn ghost sm">Add a PDF<input type="file" accept="application/pdf" multiple hidden id="pvDoc"></label><input id="pvDocName" placeholder="name (spec sheet, manual…)"><input id="pvDocUrl" placeholder="or a link (https://…)"><button class="btn ghost sm" id="pvDocAdd">Add</button></div>
    <h5>Details</h5><div class="pv-fields">${FIELDS.map(([k,l,t])=>`<label><span>${l}</span><input data-f="${k}" ${t==='num'?'inputmode="decimal"':''} value="${esc(m[k]??P[k]??'')}"></label>`).join('')}
      <label class="wide"><span>Cubit note</span><input data-f="note" value="${esc(m.note??P.note??'')}"></label></div>
    <div class="row"><button class="btn sm" id="pvSave">Save for everyone</button>${teamOf(E.key)?'<button class="btn ghost sm" id="pvReset">Undo the team\'s changes</button>':''}<span class="note" id="pvMsg"></span></div></details>`;
}
function bindEdit(el, P, o){
  const E=o.edit, m=mediaOf(E.key), st={ images:[...(m.images||P.images||[])], docs:[...(m.docs||P.docs||[])] };
  const msg=t=>{ const n=el.querySelector('#pvMsg'); if(n) n.textContent=t; };
  const fields=()=>{ const f={}; el.querySelectorAll('[data-f]').forEach(i=>{ const k=i.dataset.f, v=i.value.trim(), num=FIELDS.find(x=>x[0]===k)?.[2]==='num'; if(v==='') return; f[k]=num ? (parseFloat(v.replace(/[$,]/g,''))||null) : v; }); return f; };
  const save=async(extra={})=>{ const info={ ...(teamOf(E.key)||{}), ...fields(), images:st.images, docs:st.docs, ...extra };   // what's typed in the details is kept too delete info.by; delete info.at;
    msg('Saving…'); try{ await saveMedia(E.key, info); msg('Saved'); E.saved?.(); }catch(e){ msg('Not saved: '+e.message); } };
  const reopen=()=>{ E.reopen?.(); };
  el.querySelector('#pvPh')?.addEventListener('change', async e=>{ for(const f of e.target.files){ msg('Uploading '+f.name+'…'); try{ st.images.push(await uploadMedia(f)); }catch(err){ msg('Not uploaded: '+err.message); return; } } await save(); reopen(); });
  el.querySelector('#pvPhAdd')?.addEventListener('click', async()=>{ const u=el.querySelector('#pvPhUrl').value.trim(); if(!/^https?:\/\//.test(u)) return msg('A link starts with https://'); st.images.push(u); await save(); reopen(); });
  el.querySelectorAll('[data-rmimg]').forEach(b=>b.onclick=async()=>{ st.images.splice(+b.dataset.rmimg,1); await save(); reopen(); });
  el.querySelector('#pvDoc')?.addEventListener('change', async e=>{ for(const f of e.target.files){ msg('Uploading '+f.name+'…'); try{ st.docs.push({ name:el.querySelector('#pvDocName').value.trim()||f.name.replace(/\.pdf$/i,''), url:await uploadMedia(f) }); }catch(err){ msg('Not uploaded: '+err.message); return; } } await save(); reopen(); });
  el.querySelector('#pvDocAdd')?.addEventListener('click', async()=>{ const u=el.querySelector('#pvDocUrl').value.trim(), n=el.querySelector('#pvDocName').value.trim(); if(!/^https?:\/\//.test(u)) return msg('A link starts with https://'); st.docs.push({ name:n||'Document', url:u }); await save(); reopen(); });
  el.querySelectorAll('[data-rmdoc]').forEach(b=>b.onclick=async()=>{ st.docs.splice(+b.dataset.rmdoc,1); await save(); reopen(); });
  el.querySelector('#pvSave')?.addEventListener('click', async()=>{ await save(); reopen(); });
  el.querySelector('#pvReset')?.addEventListener('click', async()=>{ msg('Saving…'); try{ await saveMedia(E.key, null); E.saved?.(); reopen(); }catch(e){ msg('Not saved: '+e.message); } });
}
function close(){ document.querySelectorAll('.pv-page').forEach(e=>e.remove()); }
export { productCard, openProduct, close as closeProduct, specRows, stockOf };
