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
export { SCREW_MAX, NOTCH, H, T, TI, FLOOR, GAP, CEIL, PW, FT, POD, SIDE_NAME, WALL_BASE, LAYER_KINDS };
