import { gcode } from '../../js/gcode.js';
import fs from 'fs';
const out = process.argv[2];
const box=(x0,y0,x1,y1,z,tp)=>({kind:'pocket',x0,y0,x1,y1,z,tp});
const jobs = {
  '1-aE_A1-A2-A3_Sip-6.5': { thick:6.5, ops:[
    {kind:'line', pts:[[46.625,0],[46.625,96.1875]], z:0.53},
    {kind:'line', pts:[[1.375,96.1875],[1.375,0]], z:0.53} ]},
  '1-bI_A1-A2-A3_Sip-6.5': { thick:6.5, ops:[
    box(38.1969,48.1875,40.5719,51.8125,3.5,'pk'), box(38.1969,15.6875,40.5719,19.3125,3.5,'pk'),
    {tp:'pr', kind:'part', x0:-1.75,y0:0,x1:10.25,y1:96},
    {tp:'pr', kind:'part', x0:12.75,y0:0,x1:25.625,y1:72},
    {tp:'pr', kind:'hole', x0:38.1969,y0:48.1875,x1:40.5719,y1:51.8125},
    {tp:'pr', kind:'hole', x0:38.1969,y0:15.6875,x1:40.5719,y1:19.3125},
    {tp:'pr', kind:'part', x0:34.25,y0:0,x1:46.25,y1:96} ]},
  '2-I_B1_Sip-4.5': { thick:4.5, ops:[
    box(15.8249,43.0938,19.9499,46.7188,1.5,'a'), box(28.6999,59.0938,31.0749,62.7188,1.5,'a'),
    box(40.6999,43.0938,43.0749,46.7188,1.5,'a'), box(3.7504,43.0938,7.8754,46.7188,1.5,'b') ]},
  '3-aE_C1_Sip-4.5': { thick:4.5, ops:[ {kind:'line', pts:[[46.625,0],[46.625,96]], z:0.53} ]},
  '3-bI_C1_Sip-4.5': { thick:4.5, ops:[ {kind:'line', pts:[[22.0004,0],[22.0004,82.125],[46.2504,82.125]]} ]},
  '4-bI_C2_Sip-4.5': { thick:4.5, ops:[ {tp:'a', kind:'circle', cx:38.9871, cy:90.0943, d:2.5},
    {tp:'b', kind:'line', pts:[[0,82.125],[12.875,82.125],[12.875,0]]} ]},
};
for(const [n,j] of Object.entries(jobs)) fs.writeFileSync(`${out}/${n}.tap`, gcode(j));
