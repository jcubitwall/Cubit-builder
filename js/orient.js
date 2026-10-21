/* Cubit Builder — orient.js : which way the home sits on its site.
   The bearing is the compass direction the TOP of the plan faces (0 = north, 90 = east, clockwise, any angle).
   It is kept per home (and saved with projects), drawn as a north arrow on the plan, the 3D view and the
   foundation sheet, and used to say which way every wall faces. */
import { MODELS } from './data.js';
import { state, save } from './state.js';

const norm = d => ((d%360)+360)%360;
const getBearing = (key=state.model) => norm(+(state.bearing?.[key] ?? MODELS[key]?.bearing ?? 0) || 0);
function setBearing(deg, key=state.model){ (state.bearing ||= {})[key]=Math.round(norm(deg)*10)/10; save(); }
const NAMES=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const compass = d => NAMES[Math.round(norm(d)/22.5)%16];
const fmtBearing = d => `${Math.round(norm(d))}° ${compass(d)}`;
/* the compass direction a plan direction (dx, dz) points to (plan up = (0,-1)) */
const bearingOf = (dx, dz, key) => norm(getBearing(key) + Math.atan2(dx, -dz)*180/Math.PI);
/* north as a plan direction (unit vector), for drawing arrows */
const northVec = key => { const b=getBearing(key)*Math.PI/180; return [-Math.sin(b), -Math.cos(b)]; };
/* which way a wall slot faces (its outside normal) */
const facing = slot => bearingOf(slot.n[0], slot.n[1]);

export { getBearing, setBearing, compass, fmtBearing, bearingOf, northVec, facing };
