/* Cubit Builder — lib-rules.js : the Rules page of every Library category. What the rules are for that kind of
   item, written out with today's values, and which adjustable settings (libsettings.js) belong to it. The pages
   that already had their own settings (Wall rules, Electrical, Plumbing, Heating, Shop settings) show under these. */
import { ls } from './libsettings.js';
import { fin } from './format.js';
import { CHASE } from './wall-rules.js';

const i = v => fin(Math.round(v*16)/16);
/* category key → { areas:[settings areas], rules:[[topic, text]] } */
function libRules(cat){
  const S=k=>ls('siding',k);
  const R={
    'b:walls': { rules:[
      ['Panels', 'SIP walls are built from 48″ panels; a wall is cut from whole panels with the short one at its left end (seen from outside).'],
      ['Electrical chases', `A 1″ hole up through the foam of every panel, ${CHASE.first}″ in from each factory edge and then every ${CHASE.every}″ (${CHASE.first}, ${CHASE.first+CHASE.every}, ${CHASE.first+2*CHASE.every}, ${CHASE.first+3*CHASE.every}″). Plug, switch and light boxes snap to the nearest one.`],
      ['Membrane', 'Every exterior wall, and each pod\'s own wall where pods join, gets the PolarBlock membrane on its OSB before the CNC; the joints get the seam tape (Library → Membrane).'],
      ['Openings', 'Windows and doors sit in rough openings; the brick mold is 1½″ outside each side, top and bottom. Their own rules are under Windows & doors.'],
      ['Heights and locks', 'Default heights, depths and locks of everything on a wall are below: every wall built after a change uses them.'] ] },
    'b:layers': { rules:[
      ['Rims', 'Floor and roof cassettes are rimmed with 1⅞″ LVL; EPS strips and 2×4 blocks make up the rest of the floor build-up.'],
      ['Drain holes', 'A fixture\'s drain hole is cut in the interior floor cassette under it: at least 3″ from the cassette edge and 1½″ clear of a panel joint.'] ] },
    'b:decks': { rules:[
      ['Frame', 'Deck frames and their joist spacing are set on each home\'s deck (tap the deck).'] ] },
    'x:sid': { areas:['siding','acm'], rules:[
      ['Panel', `Rando Rib: rib end on one edge, long flat and end flange on the other. Full cover 33″, pulled back to 31¾″, or hopped a rib to 30–30½″. Panels go up at ${i(S('nom'))} cover so each still has play.`],
      ['Direction', 'Rib ends point at the windows and doors; with none, the flange end goes to the Einspine corner. Each new panel\'s rib end laps over the flange already up, so a run starts at the rib-end side.'],
      ['Corners', `Every Einspine corner gets the same corner trim (${i(S('cornerLeg'))} legs), screwed so it comes off to reach the spine. The siding stops ${i(S('cornerClear'))} to ${i(S('cornerLeg')-S('cornerLap'))} from the corner. Inside corners: the inside trim (${i(S('insideLeg'))} legs).`],
      ['Pod joints', `A connector bent to suit each joint: the siding stops ${i(S('jointClear'))} to ${i(S('jointMax'))} from the pod's end, so the slack goes there.`],
      ['Openings', `The rib end butts the brick mold, tucking up to ${i(S('moldTuck'))} into the J-trim. Between two openings the runs meet under a ${i(S('joinerW'))} joiner. Above and below every opening: matte black ACM, 1½″ under the siding each side.`],
      ['Round windows', `Black ACM full height around a round window, in two halves split at its middle, half-circle cuts into its round J-trim; the upper half laps ${i(ls('acm','roundLap'))} over the lower.`],
      ['Rips', `Where whole panels can't close a run, the last piece is a rip from a stock panel, cut edge under a trim. Under ${i(S('ripMin'))}: black ACM instead.`],
      ['Screws', `${S('screwsPanel')} per panel, ${S('screwsRip')} per rip, +${S('screwsExtra')}% for ends; bags of ${S('screwBag')}.`] ] },
    'x:mem': { areas:['membrane'], rules:[
      ['Where', 'On the outside face of each OSB sheet at the shop, before the CNC cuts it, so it\'s cut out with the panel and there are no laps. Every exterior wall, and each pod\'s own wall where pods join.'],
      ['Tape', `${i(ls('membrane','tapeW'))} seam tape (same product, darker blue) centred over every joint between those panels; it stops at every window, door and round window.`] ] },
    'x:acp': { areas:['acp'], rules:[
      ['Sheets', `4 mm ACP, 4′ × 10′. Neighbouring sheets overlap ${i(ls('acp','overlap'))}: the joint's 3 mm groove is in the overlap. Woodgrains run plumb (sheets never turned).`],
      ['Grooves', 'A ½″ bit: 3 mm deep at the joints, 1.5 mm for every other reveal line.'],
      ['Screws', `In the reveals, about every ${i(ls('acp','screwEvery'))}, the first ${i(ls('acp','screwFromEnd'))} from the end.`],
      ['Ends', 'The ACP stops under the corner trims / connector like the siding does, and at the brick molds.'] ] },
    'u:win': { areas:['lvl','acm'], rules:[
      ['Fit', 'Goes in a rough opening no smaller than it and at most 2″ bigger each way.'],
      ['Colour', 'Black or white; black unless the home is set to white (Finishes, or the wall panel → All windows & doors). One window can differ: pick it on that opening.'],
      ['Brick mold', '1½″ outside the rough opening each side, top and bottom; the siding\'s rib end butts it.'],
      ['Black ACM', 'Above and below every window. A round window: full height in two halves split at its middle (see Siding).'],
      ['Electrical', 'No receptacle under a window: the plug goes to the nearest chase beside it.'],
      ['LVL wire hole', `Only when picked on the window: ${i(ls('lvl','bit'))} through the roof LVL, centre ${i(ls('lvl','out'))} out from the brick mold, ${i(ls('lvl','below'))} below the roof surface.`],
      ['Sill', 'Sill heights and snapping are in Walls → Rules.'] ] },
    'u:ext': { areas:['lvl'], rules:[
      ['Colour', 'Black or white, frame and slab; black unless the home is set to white. One door can differ: pick it on that opening.'],
      ['LVL wire hole', `Every exterior door (patio doors too): ${i(ls('lvl','bit'))} by hand through the roof LVL, centre ${i(ls('lvl','out'))} out from the brick mold on the side nearest the pod's middle (until the hatch rules), ${i(ls('lvl','below'))} below the roof surface.`],
      ['Switches', 'Switch 6″ from the rough opening on the latch side, on the side the door swings into; two or more doors in a room: 3-way switches.'],
      ['Outside', 'The main outside door gets the weatherproof outside plug beside it and a double switch box inside.'],
      ['Black ACM', 'Above every door (and below where there\'s room).'] ] },
    'u:int': { rules:[ ['Where', 'Only offered in interior and connecting walls.'], ['Switches', 'Switch on the latch side, 6″ from the rough opening.'] ] },
    'd:sw': { rules:[ ['Boxes', 'Switch boxes snap to the nearest chase; heights and locks in Walls → Rules.'] ] },
    'd:rc': { rules:[ ['Boxes', 'Plug boxes snap to the nearest chase; never under a window; doorways break the run along the floor.'] ] },
    'd:dt': { rules:[ ['Boxes', 'Data and TV boxes snap to the nearest chase.'] ] },
    'd:bx': { rules:[ ['Pockets', 'Each box\'s CNC pocket is its outside size plus clearance, cut to its depth; wall lights use the shallow single-gang box.'],
      ['Wall lights', 'Wire from the nearest chase 3″ above the box centre, a 3″ curve down to box height, then straight to the box side, mid-panel all the way.'] ] },
    'elec': { rules:[ ['Panel', 'Electrical panels and their clearances follow the electrical rules below.'] ] },
    'baseboard': { areas:['heater'], rules:[
      ['Wire hole', `${i(ls('heater','up'))} up from the floor, ${i(ls('heater','inFromRight'))} in from the heater's right end (seen from the room).`],
      ['Wire run', `From the nearest usable chase at ${i(ls('heater','chaseY'))} up, mid-panel, a ${i(ls('heater','r'))} curve, then straight, tapering to ${i(ls('heater','endDepth'))} deep at the hole. Moving or snapping the heater moves the run.`],
      ['Where', 'Usually centred under a window (tap it → Snap to centre of window), on its own 240 V circuit.'] ] },
  };
  return R[cat] || { rules:[] };
}
export { libRules };
