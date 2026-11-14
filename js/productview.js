/* Cubit Builder — productview.js : the store-style product card and product page used in the Library (and, later,
   on the customer website). Built to read like a shop app: a card shows the photo, the name with its brand in bold,
   the price (the old price struck through when it's on sale), badges and how many are in stock; tapping it opens
   the product page: photos to swipe across (or our drawing / 3D of it), and an info sheet dragged up from the
   bottom with the price, where it's in stock, the Cubit notes and rules, the specs and the documents.

   A product: { sku, name, brand, model, price, was, unit, url, note, images:[url], docs:[{name,url}], stock:n |
   { '<location>':n }, stockAt, w, h, d, lbs, btu, watts, power, gang, cuin, material, mount, kind } — all optional
   but the name. */
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
  const img=P.images?.[0] ? `<img src="${esc(P.images[0])}" alt="" loading="lazy">` : (o.thumb||'');
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
  if(P.watts) R.push(['Power', `${P.watts} W`]);
  if(P.power) R.push(['Electrical', P.power]);
  if(P.gang) R.push(['Gangs', P.gang]);
  if(P.cuin) R.push(['Volume', `${P.cuin} cu in`]);
  if(P.material) R.push(['Material', P.material]);
  if(P.mount) R.push(['Mount', P.mount]);
  if(P.recess!=null) R.push(['Recessed', P.recess?'Yes, or on the wall':'No']);
  if(P.model) R.push(['Model', P.model]);
  if(P.sku) R.push(['SKU / item #', P.sku]);
  return R;
}
/* the product page, over whatever it's opened from (host: the element to sit in).
   o: { store, adopted, thumb (big drawing html), extraSlides:[html], rules:[[topic,text]], cubitNote, actions (html), onBind(el) } */
function openProduct(host, P, o={}){
  close();
  const slides=[...(P.images||[]).map(u=>`<img src="${esc(u)}" alt="${esc(P.name)}">`), ...(o.extraSlides||[]), ...((P.images||[]).length||o.extraSlides?.length ? [] : [o.thumb||''])].filter(Boolean);
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
      ${P.docs?.length?`<h4>Documents</h4><ul class="pv-docs">${P.docs.map(d=>`<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name||'Document')}</a></li>`).join('')}</ul>`:''}
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
  o.onBind?.(el);
  return el;
}
function close(){ document.querySelectorAll('.pv-page').forEach(e=>e.remove()); }
export { productCard, openProduct, close as closeProduct, specRows, stockOf };
