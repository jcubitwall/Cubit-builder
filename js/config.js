/* Cubit Builder — config.js */


/* ============================================================ constants */
const H = 96;            // wall height, inches (8')
const T = 6.5;           // exterior SIP thickness, inches
const TI = 4.5;          // interior wall thickness, inches (always)
const FLOOR = 10.25/12;  // double SIP floor inside a 9 1/4" LVL rim = 10 1/4" total (feet)
const GAP = 0.625/12;     // every joint between pods has exactly a 5/8" space
const CEIL = 12.875/12;  // double SIP ceiling, OSB top + bottom, 11 7/8" LVL rim = 12 7/8" total (feet)
const PW = 48;           // panel width, inches (4')
const FT = 12;
const SCREW_MAX = 12;     // ground screws no more than 12′ apart (corners always; a 16′ side gets one in the middle)
const PAD_MAX = 12;       // concrete pads under a floating deck: same rule as screws, corners always, no more than 12′ apart (to confirm)
/* concrete foundation (instead of ground screws): an 18″ × 6″ perimeter footing under one course of ICF.
   The home bears on the concrete core; the outside foam sits fully outside the home's outer face. */
const ICF = { foam:2.625, core:6, coreShared:8,   // 8″ core under the pod joints, where two pods share the support
  footW:18, footT:6, pier:48, access:28, pass:24,
  brands:{ nudura:{name:'Nudura', h:18, len:96}, fox:{name:'Fox Blocks', h:16, len:48} } };
/* decks: always conventional lumber. Double 2×8 all round (so where two decks meet there are four plies to sit
   on a screw), joists 2×8 at 24″ on centre running parallel to the house, measured from the house side, the
   last space whatever is left. Every corner notched 1½″ × 1½″ for a short 1½″ × 1½″ angle-iron spine.
   Decks sit ¾″ off the house (room for siding, ¾″ with ribs). */
const DECK = { gap:0.75, ply:1.5, depth:7.25, plies:2, oc:24, notch:1.5, angle:'1½″ × 1½″ angle iron',
  stock:[8,10,12,14,16], kerf:0.125, board:{name:'5/4 × 6 deck board', t:1, w:5.5, gap:0.1875} };
/* framing inside the SIPs: plates (single, recessed top and bottom inside the 96″ panel), an end stud at each
   wall end, a jack each side of every opening (sides only), OSB splines at panel joints; LVL rims in the floor
   and roof cassettes */
const FRAME = { plate:1.5, ext:{name:'2×6', d:5.5}, int:{name:'2×4', d:3.5}, ply:1.5, osb:7/16,
  spline:{t:0.5, w:3.5}, lvl:{t:1.875, floor:9.25, roof:11.875}, stock:[8,10,12,14,16] };
const NOTCH = 1.75;       // steel spine notch at every pod corner, full height: 1¾″ × 1¾″ (measured from the STEP files)
/* ============================================================ pod types
   Plan units are feet. x = along the pod length, z = across (8′). */
const POD = { L24:{len:24, name:'Life pod'}, P16:{len:16, name:'16′ pod'}, P8:{len:8, name:'8′ pod'} };
const SIDE_NAME = { S:'Front', N:'Back', W:'Left end', E:'Right end' };

/* Horizontal layers, heights in inches above the bottom of the floor (walls start at 10.56″) */
const WALL_BASE = 10.56;
const LAYER_KINDS = {
  'floor-ext':   { label:'Exterior floor',   short:'Ext. floor',  code:'FE', z:0,      t:4.6 },
  'floor-int':   { label:'Interior floor',   short:'Int. floor',  code:'FI', z:6.08,   t:4.48 },
  'ceiling-int': { label:'Interior ceiling', short:'Ceiling',     code:'CI', z:106.6,  t:6.47 },
  'roof':        { label:'Roof',             short:'Roof',        code:'RF', z:113.07, t:6.48 },
};
export { FRAME, DECK, ICF, PAD_MAX, SCREW_MAX, NOTCH, H, T, TI, FLOOR, GAP, CEIL, PW, FT, POD, SIDE_NAME, WALL_BASE, LAYER_KINDS };
