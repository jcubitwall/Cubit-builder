# CNC cut files: where this is going

**Goal:** one button in Cubit Builder makes every ShopSabre program for a home. The programs come out in cut order, so each wall's pile comes off the machine in stacking order, with flipped and two-sided panels handled.

## Step 1: cut plan and DXF batch (done)

Open **Assembly sheets → CNC cut files · DXF**.

- **What's worked out:** every cut on every panel, for every pass on the machine, in machine coordinates:
  - trimming the last panel to width
  - windows, doors and cased openings
  - vents
  - electrical box cut-outs on the face that is up
  - the steel spine notch on the outer face of an end wall's corner panels
- **Download:** a zip containing:
  - `README.txt`
  - `manifest.csv`
  - one DXF per pass, numbered in cut order, e.g. `011_1D-6_A.dxf`
- **Layers:** each operation has its own layer, so a VCarve toolpath template can select vectors by layer.

| Layer | Operation |
|---|---|
| `SHEET_REF` | blank outline (reference, not cut) |
| `PANEL_REF` | finished panel outline (reference, not cut) |
| `TRIM_CUT` | cut the panel to width |
| `OPENING_THRU` | window, door or cased opening, through |
| `VENT_THRU` | vent, through |
| `BOX_POCKET` | electrical box cut-out |
| `SPINE_NOTCH` | steel spine notch on the outer face |

- **Checks before writing:** anything that runs off the blank (unless it is meant to), features narrower than the smallest bit, boxes too close to a panel edge or overlapping an opening, and thin strips left beside an opening.

### Conventions the files use (to confirm)

- **Units:** inches. One 48″ × 96″ blank per panel.
- **Orientation:** the wall height runs along X, with X = 0 at the bottom of the wall. Y runs across the panel, with Y = 0 at the front fence. Z = 0 is the top of the panel.
- **View:** each drawing is the panel seen from the face that is up. It is never mirrored.
- **Two-sided panels:** cut pass A, then flip the panel end over end about its long axis. Keep the bottom of the wall at X = 0, push the panel to the front fence, and cut pass B.
- **Trimmed panels:** a panel cut to width is trimmed in pass A, and its factory edge stays on the joint side.
- **Cut order:** within a wall, the last panel needed is cut first. Walls follow pod 1 A, B, C, D, then pod 2, and so on.
- **Through cuts:** the shop's long bits cut the full panel depth in one pass from either face. Trims, openings and vents therefore go in the first pass, and they never cause a flip. Only cuts that stop part-way decide which face is up: box cut-outs and the spine notch.
- **Spine notch:** it counts as an outer-face cut. A corner panel of an end wall is therefore cut outer face up, then flipped if it is assembled interior side up.

## What the shop runs today (from VCarve screenshots, 22 Oct 2026)

- **Machine:** ShopSabre IS 510 (5′ × 10′ bed), HSD spindle, tool changer (rack 4–15 plus 3 on the side), vacuum table.
- **Software:** VCarve Pro 12.505. One job per pod, e.g. `Kya24-LP-X_Sip-6.5`, with one sheet per panel (`K24-LP-X_D4`, `K24-LP-X_A1-A2-A3` …). Layers include `Chases` and `Level 1`.
- **Job size:** 48 × 96 × 6.5″ (a whole SIP panel per sheet).
- **SIP panel cutter:** tool #13, ¾″ 2-flute end mill, 10,000 rpm, feed 180 ipm, plunge 150 ipm, chip load 0.009″, stepover 0.3″ (40 %), pass depth 6.55″ (one pass right through 6.5″).
- **Box pockets** (toolpaths named `Receptacles`, `Oven_Plug`): pocket, offset, climb, start depth 0, cut depth 3.0″, no ramp, no profile pass, pocket allowance 0.
- **Safe Z** = thickness + 1 (7.5″ / 5.5″). **Home** X0 Y0.
- **Post:** `ShopSabre ATC Arc (inch) (*.tap)`, a copy is in `tools/cnc/reference/`.

### Confirmed from the shop's .tap files (tools/cnc/reference)

- **Z = 0 is the table**, not the top of the panel. A 3″ pocket in a 4.5″ panel goes to Z1.5; through cuts go to Z −0.05.
- **X runs across the 48″ width, Y along the 96″ length**, with the origin at the panel's lower-left. (The DXF step-1 plan in `js/cnc.js` assumed 96″ along X and Z 0 on top: that has to change to match.)
- **File names:** `<n>-<side><face>_<panels>_Sip-<thick>.tap`. n = panel order. Side a/b = first/second time on the table. Face E = exterior up, I = interior up. A one-sided panel is just `I`.
- **The flip mirrors X:** the exterior cut at X46.625 lines up with interior X1.375.
- **Exterior-face cuts** (aE files): a single ¾″ line 1.0–1.75″ in from the Einspine edge, down to Z0.53. It goes through the outer skin and foam and leaves the inner skin.
- **Box pockets:** single 2⅜″ × 3⅝″, double 4⅛″ × 3⅝″, 3″ deep. On exterior walls (A1) the box is also cut right through.
- **Parts and holes:** two passes (Z0.125, then Z −0.05). Single lines (door and window cuts) take one pass at Z −0.05, with the tool centre ⅜″ inside the finished edge.
- **Round holes:** 2½″ through (C2), cut on a 0.875″ radius.
- **Several parts per blank:** A1, A2 (header 12⅞″ × 72″) and A3 are cut out of one 48″ × 96″ panel.

### G-code generator (js/gcode.js)

It writes the post's exact format. `tools/cnc/check.sh` re-makes all six reference panels and simulates them against the shop's own files. Every one cuts exactly the same, and four are byte-identical; the other two only start their pocket rings at a different corner.

## Step 2: G-code in shadow mode

- **How it works:** the app writes ShopSabre G-code from the same cut plan. The post-processor is copied from a program the machine already runs, and only bits from a locked tool list can be used.
- **Preview:** each toolpath is shown before anything is written.
- **Checking it:** VCarve keeps cutting while a compare tool checks the app's toolpaths against VCarve's for the same panels.

## Step 3: live, one operation at a time

The order is:

1. trim cut
2. through openings
3. box pockets and flips

Each one starts with an air cut, then a scrap panel.

## Shop answers (22 Oct 2026)

- **Box layouts** are fixed per pod type, or per wall.
- **Job setup** (from the photo): double sided, 48 × 96, Z zero = machine bed, XY datum lower-left, flip side to side.
- **Openings** are cut at the rough opening. Doors and windows are a little smaller, to leave room for foam sealing.
- **Tool:** only #13, the long ¾″ bit.
- **Nesting:** parts go on any free space on a blank. Saving material is key (A1, A2 and A3 share one blank).
- **Files** are saved to a folder on the local network, and the CNC PC picks them up from there.
- **First test:** Johnny.

## Step 2 status: .tap files from the app (js/tap.js)

The CNC sheet now offers a ".tap zip" download, with one file per panel side, named like the shop's.

- **Included:** openings (the shop's C2, D3 and D5 paths come out identical), trims, Einspine slots, boxes once a wall has a box layout, and vents.
- **`tools/cnc/check.sh`** checks the generator against 13 real shop files.
- **Not done yet:**
  - box layouts per pod type or wall
  - nesting several small parts on one blank
  - the end-wall Einspine edge (see the open question)
  - roof and floor panels

**Open question.** C1's cuts only line up with the schematic if C1 is 46¼″ wide, with the corner Einspine taking the first 1¾″. The door head stops at X46.25, and the jamb sits 21⅝″ from the edge against the schematic's 23⅜″. In A1-A2-A3, the second outside slot lands exactly on A3's cut edge.

## Simulator and time estimates (js/cutsim.js)

- **Time:** feeds come from each file. Rapids are assumed at 800 in/min (XY) and 400 in/min (Z). Add 10 s per tool change, the 4 s dwell, and +15% for acceleration. These are rough guesses until a panel is timed on the machine.
- **Simulate:** replays the bit on a 1/16″ grid. The depth map plays at 10–300× speed with a time slider.
- **Checks** cover both sides of a panel together (the exterior pass is mirrored side to side). They show what goes right through, what is cut part-way, and which pieces come loose. They also check that every opening, trim strip and vent actually drops out, and flag spots left less than 0.3″ thick.
- **3D:** shows the panel after all its files, interior face up, with ½″ OSB skins and the foam core. Loose pieces float above the panel.
- **Downloads:** the CNC sheet downloads the whole home, one pod, one wall or one panel (both sides). Each comes in the same home / pod / wall folders and stacking order.
