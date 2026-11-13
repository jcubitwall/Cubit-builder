/* Cubit Builder — devices.js : the switches, plugs (receptacles) and data jacks that go in the boxes.

   The common types sold at Home Depot Canada, RONA / Home Hardware and Canadian Tire (Leviton, Legrand, Eaton …),
   as types, not one brand's part numbers: what the electrician needs to know. 15 A, 125 V, tamper-resistant (TR)
   unless it says otherwise: TR receptacles are required in Canadian dwellings. Decora (rocker) is the default look.
   Each box holds one device per gang; a device can control more than one thing (a double rocker = 2 in one gang).
   The team adds more in the Library (Plugs & switches → ＋ New), shared through functions/api/devices.js; renames
   and deletions of any of them go through the library edits (kind 'devices'). */
const B = (id, kind, name, o={}) => ({ id, kind, name, ...o });
const BUILT = [
  // ---- switches (sw): way = 1 single-pole · 3 three-way · 4 four-way; n = how many things it switches (one gang)
  B('SW-TG-1P','sw','Toggle switch, single-pole',{ way:1, look:'toggle' }),
  B('SW-TG-3W','sw','Toggle switch, 3-way',{ way:3, look:'toggle' }),
  B('SW-TG-4W','sw','Toggle switch, 4-way',{ way:4, look:'toggle' }),
  B('SW-RK-1P','sw','Decora rocker switch, single-pole',{ way:1, look:'rocker' }),
  B('SW-RK-3W','sw','Decora rocker switch, 3-way',{ way:3, look:'rocker' }),
  B('SW-RK-4W','sw','Decora rocker switch, 4-way',{ way:4, look:'rocker' }),
  B('SW-RK-LIT','sw','Decora rocker, lighted (glows when off)',{ way:1, look:'rocker', feats:['lighted'] }),
  B('SW-RK-PIL','sw','Decora rocker, pilot light (on when on)',{ way:1, look:'rocker', feats:['pilot'], note:'For a light you can\'t see from the switch: outside, attic, garage' }),
  B('SW-RK-20','sw','Decora rocker switch, 20 A',{ way:1, amp:20, look:'rocker' }),
  B('SW-DBL-RK','sw','Double rocker (2 switches, one gang)',{ way:1, n:2, look:'double' }),
  B('SW-DBL-TG','sw','Double toggle (2 switches, one gang)',{ way:1, n:2, look:'double' }),
  B('SW-TRI-RK','sw','Triple rocker (3 switches, one gang)',{ way:1, n:3, look:'triple' }),
  B('SW-COMBO-RC','sw','Switch + receptacle combination',{ way:1, look:'combo', feats:['receptacle'] }),
  B('SW-DIM-SL','sw','Dimmer, Decora rocker with slide (LED, single-pole / 3-way)',{ way:3, look:'dimmer', feats:['dimmer','LED'] }),
  B('SW-DIM-RT','sw','Dimmer, rotary',{ way:1, look:'rotary', feats:['dimmer','LED'] }),
  B('SW-DIM-TG','sw','Dimmer, toggle',{ way:1, look:'toggle', feats:['dimmer','LED'] }),
  B('SW-DIM-ELV','sw','Dimmer, ELV / MLV (low-voltage lighting)',{ way:1, look:'dimmer', feats:['dimmer'] }),
  B('SW-DIM-SM','sw','Smart dimmer (Wi-Fi), single-pole / 3-way',{ way:3, look:'smart', feats:['dimmer','smart','neutral'] }),
  B('SW-SM','sw','Smart switch (Wi-Fi), single-pole / 3-way',{ way:3, look:'smart', feats:['smart','neutral'] }),
  B('SW-SM-REM','sw','Smart companion / remote (for a smart 3-way)',{ way:3, look:'smart', feats:['smart'] }),
  B('SW-OCC','sw','Motion sensor switch (occupancy / vacancy)',{ way:1, look:'sensor', feats:['sensor'] }),
  B('SW-TMR-CD','sw','Countdown timer switch (fans, heaters)',{ way:1, look:'timer', feats:['timer'], note:'Bathroom fan run-on' }),
  B('SW-TMR-PRG','sw','Programmable timer switch (7-day)',{ way:1, look:'timer', feats:['timer'] }),
  B('SW-FAN-SPD','sw','Fan speed control',{ way:1, look:'fan', feats:['fan'] }),
  B('SW-FAN-LT','sw','Fan + light control (2 in one gang)',{ way:1, n:2, look:'fan', feats:['fan','dimmer'] }),
  B('SW-PB','sw','Push-button switch',{ way:1, look:'push' }),
  B('SW-KEY','sw','Key / locking switch',{ way:1, look:'toggle', feats:['locking'] }),
  B('SW-DP-30','sw','Double-pole switch 30 A, 240 V (baseboard, water heater)',{ way:1, amp:30, look:'toggle', feats:['240 V'] }),
  B('SW-THERM','sw','Line-voltage thermostat (baseboard heater)',{ way:1, look:'therm', feats:['240 V','heat'] }),
  // ---- receptacles (rc)
  B('RC-DUP-15','rc','Duplex receptacle 15 A, TR',{ amp:15, look:'duplex' }),
  B('RC-DEC-15','rc','Decora duplex receptacle 15 A, TR',{ amp:15, look:'decora' }),
  B('RC-TS-20','rc','Duplex receptacle 20 A T-slot (5-20R), TR (kitchen counter)',{ amp:20, look:'decora' }),
  B('RC-SPLIT-15','rc','Split duplex 15 A, TR (two circuits, kitchen counter)',{ amp:15, look:'decora', feats:['split'] }),
  B('RC-SGL-15','rc','Single receptacle 15 A, TR (fridge, freezer)',{ amp:15, look:'single' }),
  B('RC-SGL-20','rc','Single receptacle 20 A T-slot, TR',{ amp:20, look:'single' }),
  B('RC-GFCI-15','rc','GFCI receptacle 15 A, TR, self-test',{ amp:15, look:'gfci', feats:['GFCI'] }),
  B('RC-GFCI-20','rc','GFCI receptacle 20 A T-slot, TR, self-test',{ amp:20, look:'gfci', feats:['GFCI'] }),
  B('RC-GFCI-WR','rc','GFCI receptacle 15 A, weather-resistant (WR) + TR, with in-use cover',{ amp:15, look:'gfci', feats:['GFCI','WR','outdoor'] }),
  B('RC-WR-15','rc','Duplex receptacle 15 A, weather-resistant (WR) + TR, with in-use cover',{ amp:15, look:'decora', feats:['WR','outdoor'] }),
  B('RC-AFCI-15','rc','AFCI receptacle 15 A, TR (first outlet of an AFCI circuit)',{ amp:15, look:'gfci', feats:['AFCI'] }),
  B('RC-USB-A','rc','Duplex receptacle 15 A, TR + 2 USB-A',{ amp:15, look:'usb', feats:['USB-A'] }),
  B('RC-USB-AC','rc','Duplex receptacle 15 A, TR + USB-A and USB-C',{ amp:15, look:'usb', feats:['USB-A','USB-C'] }),
  B('RC-USB-CC','rc','Duplex receptacle 15 A, TR + 2 USB-C (fast charge)',{ amp:15, look:'usb', feats:['USB-C'] }),
  B('RC-USB-20','rc','Duplex receptacle 20 A, TR + USB-A and USB-C',{ amp:20, look:'usb', feats:['USB-A','USB-C'] }),
  B('RC-GFCI-USB','rc','GFCI receptacle 20 A, TR + USB-A and USB-C',{ amp:20, look:'gfci', feats:['GFCI','USB-A','USB-C'] }),
  B('RC-USB-ONLY','rc','USB charger only (USB-A + USB-C, no plug)',{ look:'usb', feats:['USB-A','USB-C'] }),
  B('RC-SMART','rc','Smart receptacle (Wi-Fi), TR',{ amp:15, look:'decora', feats:['smart'] }),
  B('RC-SW-HALF','rc','Duplex, half switched (top on the wall switch)',{ amp:15, look:'decora', feats:['switched'] }),
  B('RC-SURGE','rc','Surge-protected receptacle, TR',{ amp:15, look:'decora', feats:['surge'] }),
  B('RC-NL','rc','Receptacle with night light, TR',{ amp:15, look:'decora', feats:['night light'] }),
  B('RC-1450','rc','Range receptacle 50 A, 240 V (14-50R)',{ amp:50, look:'big', feats:['240 V'] }),
  B('RC-1430','rc','Dryer receptacle 30 A, 240 V (14-30R)',{ amp:30, look:'big', feats:['240 V'] }),
  B('RC-620','rc','Receptacle 20 A, 240 V (6-20R)',{ amp:20, look:'single', feats:['240 V'] }),
  B('RC-EV-1450','rc','EV charger receptacle 50 A, 240 V (14-50R, outdoor rated)',{ amp:50, look:'big', feats:['240 V','WR','outdoor'] }),
  // ---- data and TV (dt)
  B('DT-CAT6','dt','Data jack, Cat 6 (network)',{ look:'jack' }),
  B('DT-CAT6-2','dt','Data jacks, 2 × Cat 6',{ look:'jack', n:2 }),
  B('DT-COAX','dt','Coax (TV / cable)',{ look:'coax' }),
  B('DT-CAT6-COAX','dt','Cat 6 + coax',{ look:'jack', n:2 }),
  B('DT-HDMI','dt','HDMI pass-through',{ look:'jack' }),
  B('DT-LV-BR','dt','Low-voltage brush plate (cables through)',{ look:'brush' }),
  B('DT-PHONE','dt','Phone jack (RJ11)',{ look:'jack' }),
];
const DEVICES = BUILT.map(d=>({ ...d }));
let remote=false;
const LOCAL='cubit-devices';
async function loadDevices(){
  let add=[];
  try{ const r=await fetch('api/devices',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ add=await r.json(); remote=true; } }catch(e){}
  if(!remote) try{ add=JSON.parse(localStorage.getItem(LOCAL)||'[]'); }catch(e){}
  add.forEach(put);
}
function put(d){ const i=DEVICES.findIndex(x=>x.id===d.id); if(i>=0) DEVICES[i]={ ...DEVICES[i], ...d }; else DEVICES.push({ ...d }); }
const deviceById = id => DEVICES.find(d=>d.id===id) || null;
const devicesOf = kind => DEVICES.filter(d=>d.kind===kind && !d.deleted);
async function saveDevice(item){
  if(remote){ const r=await fetch('api/devices',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'save', item})}); const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); (o.devices||[]).forEach(put); }
  else { put({ ...item, custom:true }); try{ localStorage.setItem(LOCAL, JSON.stringify(DEVICES.filter(d=>d.custom))); }catch(e){} }
  return item.id;
}
const newDeviceId = (kind, name) => { const base=`${kind.toUpperCase()}-${String(name).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24)||'NEW'}`; let id=base, n=2; while(deviceById(id)) id=`${base}-${n++}`; return id; };
/* the device a box's gang gets by the rules, unless the team picks another */
function defaultDevice(rk, way=1, note=''){
  if(rk==='switch' || rk==='double') return way===4 ? 'SW-RK-4W' : way===3 ? 'SW-RK-3W' : 'SW-RK-1P';
  if(rk==='counter') return 'RC-TS-20';
  if(rk==='gfci') return 'RC-GFCI-15';
  if(rk==='wp') return 'RC-GFCI-WR';
  if(rk==='appl') return /range/i.test(note) ? 'RC-1450' : /fridge/i.test(note) ? 'RC-SGL-15' : 'RC-DEC-15';
  if(rk==='data') return 'DT-CAT6-COAX';
  if(rk==='tvr') return 'RC-DEC-15';
  if(rk==='jbox' || rk==='light') return null;   // a wall light box: the fixture goes on it, no device
  return 'RC-DEC-15';
}
/* a small front view of a device (for the Library cards and lists) */
function deviceSVG(d, px=64){
  const L=d?.look||'decora', c='#f4f2ec', s='#5c6166';
  let g=`<rect x="14" y="4" width="36" height="56" rx="3" fill="${c}" stroke="${s}" stroke-width="1.4"/>`;
  const slot=(x,y)=>`<rect x="${x}" y="${y}" width="2.4" height="7" rx="1" fill="${s}"/>`;
  const face=(y)=>`<rect x="22" y="${y}" width="20" height="17" rx="5" fill="#fff" stroke="${s}" stroke-width="1"/>${slot(26.5,y+4)}${slot(35.1,y+4)}<circle cx="32" cy="${y+13.5}" r="1.6" fill="${s}"/>`;
  if(d?.kind==='sw'){
    if(L==='toggle') g+=`<rect x="28" y="22" width="8" height="20" rx="2" fill="#fff" stroke="${s}"/><rect x="29.5" y="23" width="5" height="9" rx="1.5" fill="${s}"/>`;
    else if(L==='double') g+=`<rect x="20" y="12" width="24" height="18" rx="2" fill="#fff" stroke="${s}"/><rect x="20" y="34" width="24" height="18" rx="2" fill="#fff" stroke="${s}"/>`;
    else if(L==='triple') [10,25,40].forEach(y=>{ g+=`<rect x="20" y="${y}" width="24" height="13" rx="2" fill="#fff" stroke="${s}"/>`; });
    else if(L==='rotary') g+=`<circle cx="32" cy="32" r="11" fill="#fff" stroke="${s}" stroke-width="1.4"/><line x1="32" y1="24" x2="32" y2="29" stroke="${s}" stroke-width="2"/>`;
    else if(L==='dimmer') g+=`<rect x="20" y="10" width="18" height="44" rx="2" fill="#fff" stroke="${s}"/><rect x="41" y="12" width="4" height="40" rx="2" fill="#ddd" stroke="${s}" stroke-width=".6"/><rect x="40" y="26" width="6" height="5" rx="1" fill="${s}"/>`;
    else if(L==='combo') g+=`<rect x="20" y="9" width="24" height="18" rx="2" fill="#fff" stroke="${s}"/>${face(33)}`;
    else if(L==='timer'||L==='therm') g+=`<rect x="20" y="10" width="24" height="44" rx="2" fill="#fff" stroke="${s}"/><rect x="24" y="15" width="16" height="9" fill="#cfe3ea" stroke="${s}" stroke-width=".6"/>${[0,1,2].map(i=>`<circle cx="${26+i*6}" cy="36" r="2" fill="${s}"/>`).join('')}`;
    else if(L==='sensor') g+=`<rect x="20" y="10" width="24" height="44" rx="2" fill="#fff" stroke="${s}"/><path d="M24 16 h16 v8 a8 4 0 0 1 -16 0z" fill="#d9dde0" stroke="${s}" stroke-width=".6"/>`;
    else if(L==='push') g+=`<circle cx="32" cy="24" r="5" fill="#fff" stroke="${s}"/><circle cx="32" cy="40" r="5" fill="${s}"/>`;
    else g+=`<rect x="20" y="10" width="24" height="44" rx="2" fill="#fff" stroke="${s}"/><line x1="20" y1="32" x2="44" y2="32" stroke="${s}" stroke-width=".8"/>${L==='smart'?'<circle cx="32" cy="48" r="1.6" fill="#2b8"/>':''}${L==='fan'?'<path d="M32 24 l4 6 h-8z" fill="'+s+'"/>':''}`;
  } else if(d?.kind==='rc'){
    if(L==='single') g+=face(23);
    else if(L==='big') g+=`<circle cx="32" cy="32" r="13" fill="#fff" stroke="${s}" stroke-width="1.2"/><rect x="25" y="26" width="2.6" height="9" fill="${s}"/><rect x="36.4" y="26" width="2.6" height="9" fill="${s}"/><rect x="30.7" y="37" width="2.6" height="6" fill="${s}"/>`;
    else if(L==='usb') g+=face(9)+`<rect x="24" y="31" width="7" height="3" fill="${s}"/><rect x="34" y="31" width="6" height="3" rx="1.5" fill="${s}"/>`+face(38);
    else if(L==='gfci') g+=face(8)+`<rect x="24" y="28" width="7" height="6" fill="#e6e8ea" stroke="${s}" stroke-width=".6"/><rect x="33" y="28" width="7" height="6" fill="#e6e8ea" stroke="${s}" stroke-width=".6"/>`+face(38);
    else g+=face(11)+face(36);
  } else {
    if(L==='coax') g+=`<circle cx="32" cy="32" r="6" fill="#fff" stroke="${s}" stroke-width="1.4"/><circle cx="32" cy="32" r="2" fill="${s}"/>`;
    else if(L==='brush') g+=`<rect x="20" y="22" width="24" height="20" rx="3" fill="#333"/>`;
    else g+=`<rect x="25" y="18" width="14" height="11" fill="#fff" stroke="${s}"/>${(d?.n||1)>1?`<rect x="25" y="35" width="14" height="11" fill="#fff" stroke="${s}"/>`:''}`;
  }
  return `<svg viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true">${g}</svg>`;
}
const isDevicesRemote = () => remote;
export { DEVICES, loadDevices, deviceById, devicesOf, saveDevice, newDeviceId, defaultDevice, deviceSVG, isDevicesRemote };
