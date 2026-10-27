# How Mozaik builds Cubit's cabinets: rules read from the test kitchen

Source: `tools/mozaik/test-kitchen/` (Brad's Mozaik output, 27 Oct 2026). It holds 10 ShopSabre programs (`.TAP`), the cut list (`.csv`) and the nesting report (`.pdf`).
Everything below was measured from those files with `tools/mozaik/parse.py` and `parts.py`. Measurements are in inches unless marked mm.
Where a number is my reading rather than something the files state outright, it says so.

## The job
- One material: **PET Matt White 16 mm** (0.630″), on 48 × 96 sheets. **6 sheets.**
- Nesting: kerf/spacing 9/16″, trim ⅛″ on each edge. Yield per sheet: 92, 91, 89, 86, 87 and 27 %.
- Four cabinets (Mozaik room 19, cabinets 1–4):

| Cab | What | Box (depth × height) | Parts |
|---|---|---|---|
| R19C1 | Tall pantry, 2 doors (31 9/16 + 38 5/16) | 17½ × 74 | 2 ends, top, bottom, fixed shelf, 4 adjustable shelves, back, 2 doors |
| R19C2 | 3-drawer base | 23⅝ × 35½ | 2 ends, bottom, back, front + rear stretcher, 3 drawer fronts, 3 drawer boxes |
| R19C3 | 2-door base | 23⅝ × 35½ | 2 ends, bottom, back, 2 front stretchers, rear stretcher, front toe, 2 adjustable shelves, 2 doors |
| R19C4 | Wall cabinet, 1 door | 12 × 38½ | 2 ends, top, bottom, back, adjustable shelf, door |

- **Everything is cut from 16 mm**, including backs, drawer boxes and drawer bottoms. Our app currently assumes ½″ and ⅝″ plywood.
- Cut list columns (`|`-separated): quantity | grain?, width mm, length mm, part name, cabinet, edge band (top|bottom|left|right) # band material, …, description.
  The R19C2 rows carry "CBT DarkOak 18mm" as their band material.

## Carcass construction: dados, not mortise and tenon
The door base, the wall cabinet and the pantry are all built the same way:
- **Dados in the ends:** ½″ bit, two passes 0.11 apart, so the dado is about **0.61 wide** (for the 0.63 panel), **0.29 deep** (7.4 mm, 46 % of the panel). The cutter ramps in over 1″.
- **Stopped at the front:** the dados stop **1¼″ short of the front edge**, so nothing shows on the finished end. They run out at the back.
- **Notched panels:** a bottom, top or fixed shelf has its corners notched where a dado stops, so the panel still runs full depth.
  - The front notch is about 1½ long and ¼ deep.
  - The back notch is ½ long and ¼ deep.
- **Back:** a full 16 mm back sits in its own 0.61 × 0.29 dado, **0.116″ (3 mm) in from the back edge**, running the full height.
- **Base cabinets:**
  - Bottom dado: the underside of the bottom sits at **4″**, which is the toe height.
  - Toe notch at the front-bottom of each end: **3″ deep × 4″ high**. A smaller ½ × 3¾ notch sits at the back-bottom.
  - Front toe board: 4″ high.
- **Stretchers (base):** short dados at the top of the ends. The front stretcher is about 3″ of dado, starting 1¼ back from the front. The rear stretcher is 4″ wide and lies flat.
- **Wall cabinet:** top and bottom sit in dados at the very top and bottom edges (flush, like a rabbet). The back dado runs between them.
- **Tall cabinet:**
  - Bottom dado at about 3¾–4.
  - Fixed shelf dado at mid-height (about 35½).
  - Top dado flush at the top.
- **Sizes check out:**
  - Bottom width = box width − 2 × 0.63 + 2 × 0.29. For example, the 2-door base: box ≈ 22¾ → bottom 22.05.
  - Adjustable shelf = inside width − 0.055 (about 1.4 mm play), and depth = inside depth less clearance.

**The 3-drawer base (R19C2) is built differently.**
- Its ends have **¼″ grooves 0.415 deep** (two passes, 0.3425 then 0.415) instead of the ½″ dados.
- Its bottom has a rabbet routed on the other face (in the -Flip program) to leave a ¼″ tongue, i.e. tongue and groove.
- Its back dado is 0.415 deep.
- Together with the "DarkOak 18mm" band material, this looks like a different library cabinet (my reading). **Ask Brad which is the Cubit standard.**

## Boring for hardware (System 32)
- **Shelf pins:** 5 mm × 0.4235 deep (10.75 mm), **32 mm pitch**.
  - Front row **37 mm from the front edge**. Rear row **64 mm from the back edge**, on every depth (23⅝, 17½ and 12).
  - Holes come in groups of 7 around each adjustable shelf, with a gap between groups, not a full-height run.
- **Hinge-plate marks on the ends:** 5 mm × 1.5 mm deep (just a starting dimple), in pairs **32 mm apart**, about **1.40″ from the front**. There's one pair per hinge.
- **Hinge cups on doors:**
  - Ø35 mm × 11.2 mm deep, plus two 8 mm × 11.2 mm dowel holes **45 mm apart, 9.5 mm behind the cup centre**. That's Blum's press-in pattern.
  - Cup centre about **23.4 mm (0.922″) in from the hinge edge**. This is my reading of the mirrored sheet; it could be 25 mm.
  - Cup centre **3.26″ from the top** of the door and **3.51″ from the bottom**.
  - Cut in the **-Flip** program.
- **Drawer runners (R19C2 ends):**
  - 5 mm × 13.8 mm holes at **8, 34, 65, 240, 259 and 291 mm** from the front.
  - One row per drawer, at heights 5.84, 17.62 and 29.87.
  - Close to Blum TANDEM's 37 / 261 / 293 pattern but not equal. Ask Brad which runner it is.
- **Drawer backs:** four 5 mm through holes (at 1⅝ from each end; 0.75 and 2.525 up). These look like runner rear hooks (my reading).
- **No pull holes** were drilled on the doors or drawer fronts in this job.

## Drawer boxes (16 mm)
- **Sides:** a ¼″ dado for the front and the back, **0.47 in from each end**, 0.405 deep (two passes). It runs from 1″ up to the top.
- **Bottom groove:** a ½″ groove along the bottom edge of the sides, 0.28 deep.
- **Drawer bottom:** 16 mm, with its edges rabbeted to a tongue (0.148-deep grooves, plus flip-side rabbets) to fit the side groove.
- **Front and back:** ¼″ grooves 0.38 deep at 0.125 from each end. They lock into the side dados.

## The CNC programs (Mozaik → ShopSabre with tool changer)
- **One program per sheet**, named `<job> <material> S<sheet>R01.TAP`, with `-Flip.TAP` added for the side machined after turning the sheet over.
  - The header says **"Load Face Down"**, **inch** units and **"WALLS TOOLSET"** (the same tool table as the SIP walls).
- **Sheet origin:** X across the 48″ width, Y along the 96″ length. **Z0 is the spoilboard** (Z up), so depth = 0.63 − Z.
- **Order:** drilling first, then dados and grooves, then the outlines.

| Tool | Name | Speed | Use |
|---|---|---|---|
| T7 | 5 mm drill | 8 000 | shelf pins, hinge-plate marks, runner holes; plunge F60 |
| T2 | ½″ carbide | 20 000 | dados and back dado: plunge F300, cut F400, 1″ ramp, two passes 0.11 apart |
| T14 | ¼″ | 17 000 | grooves (drawer boxes, R19C2): plunge F120, cut F300, two depths |
| T1 | ⅜″ | 19 000 | outlines, rabbets on the flip side |
| T11 | 35 mm | 9 000 | hinge cups (flip), F75 |
| T8 | 8 mm | 18 000 | hinge dowel holes (flip) |

- **Outlines:** cutter outside the part, so outside corners are arcs of the bit radius (0.1875).
  - Larger parts get an **onion-skin pass to Z0.04** (leaving about 1 mm) at F500. Then every part gets a **final pass to Z−0.005** at F400.
  - Each outline ramps in along the first edge (from Z0.6 down over 0.56).
- **Every tool change:** `M5 · T# · (name) · S… · M3 · g4 x 4` (4 s spin-up) · `M50`. Then safe Z1.0, with Z12 at start and end.
- **-Flip programs:** the sheet is mirrored across its 48″ width.
  - They hold the hinge cups and dowels, and the ⅜″ rabbets that make the tongues (drawer bottoms, R19C2 bottom).
  - They end with a cut along the sheet edge.
  - Parts are already cut through in the main program, so how the sheet is held for the flip side is a question for Brad.

## How this differs from what the app does now (`js/casework.js`)

| | App today | Mozaik / Cubit shop |
|---|---|---|
| Material | ½″ and ⅝″ plywood | 16 mm PET for everything |
| Joinery | Mortise and tenon, one side only | Stopped dados with notched panels (R19C2: ¼″ tongue and groove) |
| Back | ½″ in a ¼-deep groove, ½ in | 16 mm in a 0.29-deep dado, 3 mm in |
| Toe kick | 4½ high, 3 back | 4 high, 3 back |
| Line boring | 37 mm front only | 37 mm front + 64 mm from the back, 32 mm pitch, groups of 7 per shelf |
| Hinge cup | 22.5 mm from edge, 3½ from ends | about 23.4 mm from edge, 3.26 / 3.51 from the ends; 8 mm dowels 45 / 9.5 |
| Flip side | Never | Hinge cups and rabbets in a -Flip program |
| Outline | One pass | Onion skin + final pass, ramped lead-in |

## Questions for Brad
1. Is the dado construction (door base, wall, pantry) the Cubit standard, or the ¼″ tongue and groove of the drawer base?
2. Which drawer runner, and which hinge (cup edge distance 22.5, 23.4 or 25 mm)?
3. On the flip side: is the whole sheet turned over with the loose parts in it?
4. What is the actual measured thickness of the 16 mm PET? It decides the dado width (now about 0.61 with the ½″ bit and a 0.11 step).
5. Are pull holes ever drilled on the CNC?
