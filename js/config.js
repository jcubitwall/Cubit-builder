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
/* ============================================================ pod types
   Plan units are feet. x = along the pod length, z = across (8′). */
const POD = { L24:{len:24, name:'Life pod'}, P16:{len:16, name:'16′ pod'}, P8:{len:8, name:'8′ pod'} };
const SIDE_NAME = { S:'Front', N:'Back', W:'Left end', E:'Right end' };

export { H, T, TI, FLOOR, GAP, CEIL, PW, FT, POD, SIDE_NAME };
