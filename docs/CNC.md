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
