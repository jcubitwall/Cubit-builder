# Cubit Builder

A web app for designing Cubit pod homes wall by wall, then producing what the shop and the site crew need to build them.

**Private app:** hosted on Cloudflare Pages behind Cloudflare Access, with viewer and admin roles and STEP uploads for admins. See [`docs/PRIVATE-SETUP.md`](docs/PRIVATE-SETUP.md).

## What it does

- **Build (the blueprint builder):** one big view, made for the iPad. It opens as the flat plan, straight down. Drag a pod or deck with one finger to move it (it snaps where it docks); two fingers on a pod and twist to turn it 90°; drag empty space to tilt into 3D: a drag down always tips the home down toward you, a drag up lifts it back (two fingers pan, pinch zooms); double-tap to go back to the flat plan. Tap a wall, floor, ceiling, window or door and its options float in on the right (with Turn 90° / Remove pod for that pod); turn the home right over to reach the underside of the floor. The tray along the bottom holds blank 8′/16′/24′ pods, library pods and decks: drag one in (tap with a second finger to turn it while dragging) or tap it to drop it at the first spot it fits.
- **Pick a home model:** Life, Nest, Cove, Panorama, and **Expanse** (two 24′ pods with two 16′ pods on the end), built from 8×8, 8×16 and 8×24 pods with a ¾″ space at every joint. The Tanja Leet *Expanse + 1* (5 pods) is a shared project, scanned straight from the Shapr3D STEP file with every opening measured.
- **Models and sub-models:** the header has one chip per model name: LifePod, Nest, Haven, Cove, Panorama and Expanse (`data/families.json`). Under the one you're on are its standard layout, its sub-models, and your own layouts. Admins can file any arrangement on screen (a standard home, your own layout or a project) under any model name with **Add this layout to a model**, in the home panel.
  - Sub-models are shared with everyone: they're kept on the server (`api/catalog`, in R2) along with any library items they use.
  - On a sub-model, admins can **Save changes for everyone**, rename it, move it to another model, or remove it.
  - Haven has no standard layout yet, so it shows "no design yet" until something is added to it.
- **Phone layout** (screens up to 700px wide): a small header with the home as a picker, and a tab bar along the bottom with **3D · Take-off · Shopping · Sheets · Plan**.
  - Shopping and Plan are for admins only; viewers just look.
  - The 3D view fills the screen. Tap a wall (or **Details**) and its panel slides up from the bottom; **Layers** and **Exploded view** sit on the view.
  - **Take-off** lists everything by build stage (Foundation → Floor → Walls → Roof & ceiling → Decks → Windows & doors → Fasteners) as big readable lines.
  - **Shopping** is the buy list: purchase lengths, sheets, blocks and concrete. Lines tick off as they're bought; on the private site every admin sees the same ticks (`api/shop`). **Share list** sends it as text to Messages, Mail or the supplier.
  - Both lists are also in the assembly sheets on bigger screens.
  - **Drawings** (wall elevations, plans, sections) shrink to fit the phone's width. Tap one to open it full screen, then pinch or double-tap to zoom and drag to move around (this works on every screen).
- **Plan & pods (drag and drop):** press **Plan & pods** for a top view of the home on an 8′ grid.
  - **Add a pod:** drag a blank 8′, 16′ or 24′ pod, or a pod from the **pod library**, onto the plan.
  - **Snapping:** pods only dock flush end to end, or side by side in 8′ steps. A drop snaps to the nearest spot where the pod shares at least 8′ of wall with another pod. Overlapping or loose pods aren't allowed.
  - **Moving around:** drag empty space to pan, use the scroll wheel or pinch to zoom, or press **+ / − / Fit**. On a phone or tablet, swipe a pod sideways out of the list to drag it, and swipe up or down to scroll the list.
  - **Turning:** press **R** while dragging to turn a pod 90°, or select a pod and press **Turn 90°**.
  - **Changing pods:** drag a pod to move it, or select it to **replace** it with another pod or **remove** it.
  - **Joints:** the ¾″ space at every joint is always added.
  - **Pods keep their parts:** a pod keeps its own walls, floors and ceilings when it is moved or turned.
  - **Your own copy:** editing a built-in home makes your own copy. Editing a project changes the project; save it to keep the change.
- **3D view:** **Layers** switches each part on or off: roof, ceiling, walls, floors, decks, ground screws and pads, windows and doors. It also has see-through glass and doors, wall letters and panel numbers. The small arrow on the right edge opens and hides the panel, in full screen and in the normal view; tapping a wall opens it too.
- **Windows & doors:** the window & door library is in `data/units.json`, with picture, casement, awning, single hung, slider, man door and patio slider units.
  - Select a wall to choose the unit for each opening, with its hinge or sliding side seen from outside and a door's swing.
  - Units that fit the rough opening come first (no bigger, at most 2″ smaller). If only one fits, it is used automatically.
  - The 3D view and assembly sheets draw the standard symbols: the casement or door triangle points to the hinge, and sliders get an arrow on the moving panel. Man doors also show their swing on the floor.
  - **Doors between pods:** both pods' walls have the rough opening, but only one gets the door. By default it's the lower-numbered pod. On either wall you can move the door to the other pod's wall and choose which pod it swings into; the hinge and swing stay the same when it moves.
  - Add real units with **Upload STEP → Window / door**. The `sample` units are placeholders sized to the scanned openings, and they drop out once a real unit of that kind is uploaded.
- **Framing lumber and LVL** (`js/framing.js`, **Framing · cut list** sheet, Layers → Framing lumber & LVL):
  - **Walls:** 2×6 in exterior walls and 2×4 in interior walls. Single plates are recessed top and bottom inside the 96″ panels.
  - **Plates:** bottom plates are fastened to the floor first and the walls set down over them; top plates are fastened to the ceiling and lock into the walls as it's lowered. Both have the two corners facing the incoming wall bevelled ¾″. The top plate runs the full length of each wall, spliced anywhere; the bottom plate stops at doors, patio doors and cased openings. The framing sheet draws each pod's floor and ceiling plate layout (outer edge ½″ in from the edge), and in the exploded 3D view the plates stay with the floor and ceiling.
  - **End studs:** one at each wall end, 93″. At a pod corner the end wall wraps the Einspine notch with two pieces: a full end stud just inboard of the notch and a corner stud ripped to 4¼″ (2×6) behind it at the very end. Both plates are notched 1¾″ × 1¼″ there. Together with the LVL ends, there's wood behind both faces of the spine from floor to roof for the Dynobite screws; the framing sheet has a corner detail. Where both walls at a pod corner have an opening right against it (within 2″), a 6½″ × 6½″ corner post fills the corner square instead, between the plates and notched for the Einspine. It replaces the end and corner studs and the jacks against it.
  - **Jacks:** one each side of every opening, the height of the opening, sides only. Door jacks sit on the bottom plate.
  - **Splines:** two ½″ OSB × 3½″ at every panel joint, between the plates. Where an opening's edge is on the joint, its jack takes the joint for the opening's height and the splines run above and below. Each panel carries the splines on its right edge as assembled, the edge that meets the next panel; this is shown on the cut & stack table, the labels and the elevation.
  - **LVL rims:** 1⅞″ × 9¼″ in the floor and 1⅞″ × 11⅞″ in the roof. Four pieces per pod, each the outside length minus 3¾″, touching only at the inside corners to leave the Einspine squares.
  - **Cut list:** what to buy (2×6 and 2×4 in standard lengths, LVL linear feet, OSB sheets), the cut list by material and by wall, and a CSV.
- **Decks:** every deck is conventional lumber framed by the same rules, whatever its size (`js/deckframe.js`).
  - Double 2×8 all round, so where two decks meet there are four plies on the screw.
  - 2×8 joists parallel to the house, 24″ or 16″ on centre (one setting per home, 24″ standard) from the house side; the last space is whatever is left.
  - Every corner notched 1½″ × 1½″ for a 1½″ × 1½″ angle-iron spine.
  - Decks sit ¾″ off the house (room for ¾″ ribbed siding) and butt straight up to each other.
  - **Decks · lumber takeoff** (with the assembly sheets) lists every piece with its cut length, the 2×8 to buy in standard lengths, deck boards and spines. Each deck's framing sheet has its own takeoff.
  - The plan editor lists the deck size a home already uses first, and warns when a home mixes sizes.
  - On a concrete foundation a deck gets no screws or pads against the house (its house side bears on the foundation), only out at its outer edges.
- **Concrete foundation (ICF) instead of ground screws:** choose **Home stands on → Concrete (ICF)** in the home panel.
  - **Perimeter:** an 18″ × 6″ footing under one course of ICF (Nudura 18″ or Fox Blocks 16″, 6″ or 8″ core, 2⅝″ foam each side) follows the whole home. The core's outer face is flush with the home's outermost face, so the outside foam is always fully outside the home and the home bears on concrete. Small steps from the ¾″ joints (up to 3″) are squared off.
  - **Inside supports:** short ICF sections with an 8″ core (two pods share them) run along the pod joints wherever the ground-screw rules would put an inside screw (never more than 12′ apart, crossings included). Sections within 4′ of each other become one wall, and a section within 2′ of the perimeter ties into it, unless that would close off part of the crawl space. Every part must stay reachable through gaps of at least 24″.
  - **Crawl access:** a 28″ opening goes on the longest perimeter run not behind a deck. The 18″ ICF is under the 500 mm the National Building Code asks for, so the sheet says to step the footing down or add a floor hatch.
  - **Decks:** they keep their own screws or pads, held 6″ past the footing.
  - **Foundation sheet:** the plan with footing, ICF and supports dimensioned from the home's outside corner, a typical section, a takeoff (footing, ICF blocks, corners, end caps, concrete in ft³, yd³ and m³) and a PDF.
- **Home orientation (for the screw installers):** the compass in the plan editor sets which way the home sits on site, at any angle. You can drag the dial, type a bearing, or tap N/E/S/W or ±15°. **North up** turns the plan so north points up the screen.
  - The bearing is saved with the home and its projects.
  - The 3D view shows a north arrow.
  - Each wall shows which way it faces.
  - The foundation sheet and its PDF show a north arrow and the compass direction of each side of the plan.
- **Pod library:** every unique pod from a STEP import is in `data/pods.json`. Saving a project, or pressing **Save this pod to the library**, adds any pod that isn't there yet. Each pod is stored in its own frame, so it can go in at any turn.
- **Mirrored joint walls:** where two pods join, each keeps its own 4½″ wall. Choosing a wall on one side gives the neighbour's wall the same wall, **mirrored**, so doors and openings line up. Every joint in the scanned Expanse + 1 follows this rule.
- **Saving fills the libraries:** saving a project, or one pod, adds anything new to the matching library:
  - walls, for example a mirrored wall nobody has scanned
  - floors and ceilings
  - pods
  
  Items match to ⅛″. Exported project files carry these new items with them.
- **Decks (porch frames):** the plan editor has a **deck library** next to the pod library. Every STEP import scans the deck frames outside the pods and adds any new ones to `data/decks.json`: size, lumber, rims, joist layout and corner notches.
  - **Docking:** drag a deck onto the plan. Its **ledger** (the dark edge) docks flush against a pod or another deck, in 8′ steps. Press **R** while dragging to turn it.
  - **Spacing:** decks keep the ¾″ space at a pod. Deck frames butt against each other.
  - **Corners:** deck corners are notched for the steel corner posts.
  - **Screws or concrete pads:** each deck stands on either **ground screws** or **concrete pads** (floating). Set it on the deck's panel, or for all decks at once in the plan editor.
    - **Screws:** deck screws follow the same rules as pods, with swivel heads on the outside and shared centre screws in the joints.
    - **Pads:** a floating deck gets concrete pads at its corners and no more than 12′ apart, and decks side by side share a pad. Pads show in 3D and on the foundation sheet as P1, P2 and so on. Pad size and spacing are still to be confirmed.
  - **Sheets:** each deck has a framing sheet with joist spacing, corner notches and a cut list.
- **Steel spine notches:** every pod corner has a **1¾″ × 1¾″** notch running the full height, measured from the STEP files. It is cut from the outside face of the end walls, and from the corners of the floors and ceilings. It shows in 3D and on the wall and layer sheets (purple).
- **Swap any wall, floor or ceiling:** click it in 3D, or in the list, and choose another option from the library. Each pod has its walls plus four layers: exterior floor, interior floor, interior ceiling and roof.
- **The library only holds real scanned parts.** Every imported STEP file adds its unique walls and layers. Where a home needs a size that hasn't been scanned yet, the app shows a plain placeholder (marked ⚠ on walls). Exterior walls are 6½″. Where pods join, **each pod keeps its own 4½″ interior wall**.
- **Long and short walls:** the short end walls (A and C) always run straight through, the full 8′ from corner to corner. The long walls (B and D) butt up against them, so a 24′ long wall is 288″ minus the two end walls' thickness: 275″ between two 6½″ end walls. Only ends at a pod corner are trimmed. The corner spine notches are cut from the end walls.
- **Panels:** 4′ × 8′ SIPs always start with a full panel at panel 1 (the left end seen from the interior). The last panel is cut to fit, and the sheets and labels show its width.
- **Pot lights (placed by rule):** click the interior ceiling. Lights are Heinrich's: ⌀ 4″ pocket 5.388″ deep from the room side with a ¾″ wire hole through the middle. Rows run the long way, evenly spaced across the whole room (the gap between rows stays the same across a joint between pods), half a spacing to the outside walls; along the rows they're spaced about 42″ (adjustable per home), picking the count that keeps every light off a panel joint. Pods joined by an opening 48″ or wider space as one room. Set **Cabinets on this wall** (deepest unit: upper 13″, base 24″, wardrobe 24″, fridge 30″ or any depth) on a wall and the row along it moves 6″ in front of it. Uploaded ceilings keep their hatches and heat-pump openings as drawn; lights stay 3″ clear of them. "As drawn" switches back to the lights in the STEP file.
- **Compression seals between pods:** ¾″ rubber with an adhesive strip, on the outside face of each interior wall (the face toward the other pod), around every opening where pods meet. Both pods get one: the wall with the higher letter gets the **high** seal, 2″ above and outside the other wall's **low** seal (low 1½″ out from the rough opening, high 3½″), pitched ¼″ per foot each way from the middle of the head and running down both sides to the bottom. Shown in 3D (high seal bright red, low seal blue; Layers → Compression seals), on the wall sheet (a callout plus the seal drawn on the Side B face, dashed on the room side) and in the take-off (feet, +10%). Above every wall is the pod's 11⅞″ LVL roof rim, wrapped on these sides by the roof's two layers of **SilverBack** (butyl skin); where a seal's head runs above the wall (an opening to the top of the wall) it goes on the SilverBack over the rim, so every opening gets both seals. The take-off lists SilverBack: 2 layers over the roof plus down the rim where pods meet, +10%.
- **Made by hand:** any hole, chase or feature can be ticked **By hand** in the sheet tables (shared with the team). Anything too small for the ¾″ bit is marked automatically. Hand-made features show purple with a HAND tag in 3D and on the sheets, are left out of the G-code, and are listed as BY HAND on each panel's CNC checks.
- **Library (⋯ → Library, or Homes → Library on a phone):** rename or delete any model name, home, pod, wall, floor / ceiling / roof layer or deck. Rename links also sit next to the current home, wall and layer in the side panel, and on every pod and deck in Plan. Edits are shared with the team (server file `catalog/library-edits.json` in R2, admins only); deleting hides an item from every list while homes already using it keep it, and **Show deleted → Restore** brings it back.
- **Wall letters:** every pod's walls are **A, B, C, D, going clockwise seen from above. Only a through wall (one of the two end walls that run corner to corner) can be Wall A, and in a home of several pods every Wall A points the same way.** Each pod first picks its through wall with the largest single opening; the home's direction is the one most pods picked on an outside wall (else the one most pods picked; ties go to the bigger opening). Every pod that can face that way does. A pod set by hand (**Make this Wall A**) keeps its own A. With no openings at either end: exterior door, then patio door, then interior door. A side that is part exterior and part interior keeps one letter, numbered clockwise (B1, B2). Panel numbers in 3D sit over the room side of each wall.
- **Full screen 3D:** press **Full screen** on the 3D view, or the **F** key.
  - **Toolbar:** the toggles float over the model.
  - **Panel:** the walls and options slide in from the right with **Panel** or the **T** key. The panel also opens by itself when you click a wall.
  - **Leaving:** **Esc** or **F** leaves full screen.
  - **Tablets and phones:** full screen fills the window and only the **Exit** button leaves it, so a swipe can't close it by accident. For no browser bars at all, use Share → **Add to Home Screen**. The app then opens full screen like an app.
- **House on / off:** the **House** toggle hides the walls, floors, roof and decks. Only the ground screws and concrete pads stay, with the footprints of the pods (solid) and decks (dashed) drawn on the ground.
- **Exploded view:** it comes apart in two stages, the way assembly illustrations do, so nothing passes through anything else.
  1. **Pods and decks separate** along the plan grid. Every joint opens wide enough for both pods' walls.
  2. **Each pod comes apart:** roof and ceiling up, walls straight out, floors down.
- **Who can do what:** on the private site, **viewers** explore everything but nothing they change is saved. **Admins** also save projects and libraries and can **Upload STEP** files. When you upload, choose whether the file is a **Wall**, a **Pod** or a whole **Home**; it is scanned on the server and the libraries update by themselves.
- **Projects:** press **Projects** to save what's on screen under a name, for example *Tanja Leet · Expanse + 1*. A project keeps its own layout (including pods you added), every wall choice, which wall is A on each pod, which side faces the assemblers on each wall, and the screw inset. Projects are saved in your browser. **Export** makes a file you can send to someone, and projects listed in `data/projects.json` show up for everyone (marked *shared*).
- **Panel labels, cut & stack (ShopSabre):** every 4×8 panel gets a code: pod number + wall letter + panel number, e.g. **3B-4** = Pod 3, Wall B, panel 4.
  - **Panel numbers stay with the panel.** Panel 1 is always the left end seen from the interior (side A on a wall between pods).
  - **Assembly always runs left → right** as the assemblers see the wall. For each wall, choose which side faces the assemblers. Interior up gives 1, 2, 3 … 6; exterior up gives 6, 5 … 1.
  - **Stacking:** each wall's panels are stacked with the first one needed on top.
  - **Flipping:** box cut-outs that don't go all the way through have to face up on the CNC. If that face isn't the face the assemblers need up, the panel is marked **FLIP before stacking**. A panel with cut-outs on both faces is marked **TWO-SIDED**.
  - **Labels PDF:** a cut & stack list, then one 4″ × 2″ label per panel (Avery 5163 / 8163). Each label shows the code, its stack position, which face goes up, the CNC face, any flip warning, and a small strip showing where the panel sits in the wall.
- **CNC cut files (step 1 towards direct G-code):** under **Assembly sheets → CNC cut files · DXF**, every pass of every panel is worked out in machine coordinates. That covers trims, openings, vents, box cut-outs and spine notches.
  - **Cut order:** passes are numbered so each wall's pile comes off the machine in stacking order.
  - **Download:** you get a zip of DXF files, with one layer per operation for VCarve toolpath templates, plus a manifest. See `docs/CNC.md`.
  - **Not for cutting yet:** the zero corner, panel orientation, flip method, box sizes and depths still need to be confirmed with the shop.
- **Wall assembly sheets:** one per wall. Flip between the front (interior) and back (exterior) face, and number the 4×8 SIP panels 1→6 or reversed. Each sheet has opening sizes, plug and switch locations, and a 3D view of the panels pulled apart.
- **Foundation sheet:** a true plan seen from above, with every ground screw located, chain dimensions, diagonals for squaring, and a **Download PDF** button to email to the site crew.
  - **No doubled-up screws.** Where pods meet, one screw sits in the centre of the ¾″ joint and carries both pods. Where three pods meet it gets a **tee** head; where four meet, a **cross** head. Screws closer than 3′ are merged into one; if the one removed was a corner, the remaining head gets a **corner arm** that reaches it.
  - **Perimeter:** around the outside, screws sit just inside the floor edge with a **swivel head**, so a deck or another pod can be added later.
  - **Spacing:** each outside edge and each joint gets a screw at both ends and wherever another joint crosses or tees in, then even spacing so no gap is over 12′ (a gap may run up to 3″ over where the ¾″ joints add up, rather than adding a screw). That puts one on every corner, one in the middle of a 16′ or 24′ side, and none between the corners of an 8′ side. Where an edge ends against a joint, its end screw is the one in the joint. The sheet warns if two screws ever end up closer than 3′ or further than 12′ apart.

## Pod facts the app uses

| | |
|---|---|
| Pod outside sizes | exactly 8×8, 8×16, 8×24 ft |
| Space between pods | ¾″ |
| Floor | 10¼″ total: two SIP layers + air gap inside a 9¼″ LVL rim |
| Walls | 96″ clear inside height; exterior 6½″, interior 4½″ |
| Ceiling | 12⅞″ total: two SIP layers, OSB top and bottom, 11⅞″ LVL rim |
| Panels | 4′ × 8′ SIP |
| Ground screws | perimeter: just inside the floor edge (inset set on the foundation sheet, default 6″), swivel head · joints: centred in the ¾″ gap, shared · never more than 12′ apart, a screw on every corner |
| Corner spine notch | 1¾″ × 1¾″, full height, at every pod corner |
| Pod placement | 8′ grid, turned in 90° steps |

These live in `js/config.js`.

## Adding and changing walls

All walls are in **`data/walls.json`**, one wall per line, and they normally come from STEP imports. Edit that file on GitHub, commit, and the app picks up the change. Home layouts are in **`data/models.json`**.

```json
{ "id": "W24-16", "name": "Office wall", "len": 24, "type": "ext", "t": 6.5,
  "openings": [{"kind":"window","x":40,"y":36,"w":48,"h":36},
               {"kind":"door","x":200,"y":0,"w":38,"h":82.5}],
  "inside":  [{"kind":"outlet","x":30,"y":16}, {"kind":"switch","x":40,"y":48}],
  "outside": [{"kind":"outlet","x":250,"y":16}] }
```

- `len` is in feet, in multiples of 4. Every other number is in inches.
- `type` is `"ext"` for an outside wall or `"int"` for a wall between pods.
- Opening `kind` is `window`, `door`, `patio` or `opening` (cased opening, no door).
- **Openings and `outside` items:** `x` is measured from the left end *as seen from outside*. `y` is measured from the bottom of the wall.
- **`inside` items** (plugs, switches): `x` is measured from the left end *as seen from inside*, the way the electrician reads it.
- On interior walls, `inside` is side A (facing the pod that owns the wall) and `outside` is side B.

Anyone can also upload a wall file from the app sidebar to try it out. Uploaded walls stay in that person's browser until they are added to `data/walls.json`.

## Hosting

The app is a static site plus three small Cloudflare Pages Functions in `functions/` (`/api/me`, `/api/upload`, `/api/imports`). Setup is in `docs/PRIVATE-SETUP.md`.

## (Old) GitHub Pages

1. On GitHub, open the repo → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
3. Pick branch **`main`** and folder **`/ (root)`**, then **Save**.

After a minute the app is live at https://jcubitwall.github.io/Cubit-builder/.

## Project layout

```
index.html          page markup
css/app.css         styles
data/walls.json     wall library (edit this)
data/models.json    home models: which pods, where
data/layers.json    floor / ceiling / roof library (from STEP scans)
data/projects.json  shared, named projects (saved configurations)
data/pods.json      pod library: unique pods with their walls, floors and ceilings
data/decks.json     deck library: porch / deck frames scanned from STEP files
js/main.js          start-up and toolbar
js/config.js        pod dimensions and constants
js/data.js          loads the JSON data
js/layout.js        wall slots per home, wall letters, ¾″ gaps, ground-screw layout
js/state.js         current selections (saved in the browser)
js/panels.js        4×8 panel split, numbering, thumbnails
js/scene3d.js       3D view (three.js)
js/sidebar.js       model list, wall options, wall upload
js/planner.js       plan editor: drag and drop, turn, replace, remove pods
js/pods.js          pod and deck editing rules, pod library, saving new items to the libraries
js/decksheet.js     deck framing sheet and cut list
js/cnc.js           CNC cut plan per panel pass, DXF writer, manifest, zip
js/cncsheet.js      the CNC cut files sheet: cut order, previews, flags, download
js/fullscreen.js    full-screen 3D with a slide-in panel
js/orient.js        the home's bearing (which way it faces on site)
js/sheets.js        wall assembly sheets
js/foundation.js    foundation sheet + PDF
js/labels.js        panel codes, assembly order, stacking, CNC flips, label PDF
js/projects.js      saving / opening named projects (+ projects-ui.js for the dialog)
tools/step-import/  scripts that turn a Shapr3D STEP file into walls, pods and homes (import_step.py --kind home|pod|wall)
functions/          Cloudflare Pages Functions: who you are (role), STEP upload, upload status
.github/workflows/  import-step.yml: scans an uploaded STEP file and commits the results
data/imports.json   log of STEP uploads (newest first)
js/role.js          viewer / admin; viewers can explore but nothing is saved
js/upload.js        the admin Upload STEP dialog
```

There's no build step: it is plain HTML, CSS and JavaScript modules. To run it on your own computer, start any local web server in this folder (for example `python3 -m http.server`) and open http://localhost:8000. Double-clicking `index.html` won't work, because browsers block the data files when a page is opened that way.

## Importing a home from Shapr3D

Export the whole home as **STEP**. `tools/step-import/import_step.py`:

1. finds the pods
2. scans every wall and every floor and ceiling layer
3. adds the unique ones to the libraries (`data/walls.json`, `data/layers.json`)
4. adds each unique pod to `data/pods.json`
5. finds deck frames, adds new ones to `data/decks.json`, and places them
6. saves the home as a shared project

See that folder's README. The scan is exact, so **only upload accurate models**: whatever is in the STEP file goes into the libraries.

## Next up

- Read plugs, switches and pot lights from STEP files (name the bodies `PLUG`, `SWITCH`, `POTLIGHT`).
- Floor and ceiling panel sheets (Fe / Fi / Re / Ri), including pot lights.
- A shared wall library and saved homes for the whole team.
- PDF export for the wall assembly sheets.
- Direct ShopSabre G-code from the cut plan (see `docs/CNC.md`).

## Cabinet library (Oct 2026)
- `js/casework.js` — the engine. Every cabinet is generated from rules at any size: frameless, full overlay, ½″ and ⅝″ plywood only (measured thickness is a setting), edge banded (cut sizes deduct the band), mortise and tenon cut from one side (tenons in the outline, mortises as pockets on the inside face, ends overcut by the bit; back in a groove). Categories: base, upper, pantries, linen towers, wardrobes, vanities, window benches, shelves, fireplaces, countertops, appliances (24″ fridges and ranges included, sizes from the makers' sheets), furniture.
- `js/casework3d.js` 3D parts (tenons drawn), `js/casework-svg.js` front-view thumbnails, `js/casework-ui.js` the library window (⋯ → Cabinet library): sizes, options, 3D with exploded view, parts with cut sizes and machining, hardware, CSV cut list, and the team's Shop settings (stored in R2 `casework/settings.json` via `functions/api/casework.js`).
- `js/furniture.js` placed items per home (`state.furniture[home]`), in pod coordinates so they move and turn with the pod; drag in from the Build tray (Cabinets tab); they back onto the nearest wall and butt to neighbours. Each category has a switch in Layers. Depth of items against a wall feeds the pot-light rule.
- `js/history.js` undo / redo; `js/viewcube.js` the Shapr3D view cube and undo / redo buttons. In Build a double-tap isolates one level down: in a home of several pods the pod tapped, then (in that pod or a one-pod home) the part tapped: a wall, layer or cabinet. Decks isolate straight away. A cabinet is isolated right away from any level, then the part of it tapped (`furn:<id>:<part>`); the library 3D view too. Double-tap the isolated part again, or empty space, to go back up one level. Cabinets stay in one piece when the home explodes; an isolated cabinet comes apart where it stands with Exploded view (or the three-finger spread).

## Drafts, new homes and publishing (Oct 2026)
- **New home** (top bar ＋ New, or Homes → ＋ New home): starts a draft from one blank 8′/16′/24′ pod, optionally filed under a model name. Walls stay plain until picked.
- **My drafts** (`js/drafts.js`, `functions/api/drafts.js`): each person's drafts live in their own R2 folder `drafts/<email>/<key>.json` and only they see them. Every save sends the draft up a moment later.
- **Protected models**: Cubit models (the standard design of each model name) and published variations can't be changed in place. The first change makes a draft copy (`ensureDraft` / `makeDraftCopy` in `js/pods.js`), and the change goes there.
- **Publish** (`js/publish-ui.js`, from the draft's panel): add it as a variation (sub-model) under any model name, or save it over the Cubit model it was copied from, after three warnings and typing the model's name. Saving over a standard model stores an `over` item in `catalog/submodels.json`. The shop files' version stays underneath and can be brought back. Every replaced or removed catalog version is kept in `catalog/history/<id>/`.
- **Mirror / flip**: cabinets and furniture mirror left ↔ right (`it.mirror`: hinges, drawers and names swap sides in the parts list). Pods mirror end for end or flip front to back (`mirrorPod`): walls change sides, run the other way and are mirrored, Wall A follows, and floors and ceilings use mirrored layers (`<id>~mx`, `~mz`, `~mxz`, see `layerById`). Any wall can be mirrored from its panel; floor, ceiling and roof layers have Mirror and Flip.
- **Tap a part** (wall, floor / ceiling / roof, deck, cabinet): it stays solid and everything else goes see-through (`applyGhost` in scene3d.js), like the cabinet viewer. Tap empty space for the solid home. A **long touch** held still picks up a pod, deck or cabinet to move it, in 3D too; on empty space it opens the Layers list.
- **Stretch**: a tapped item (not appliances) shows green double arrows on each free side (`updateHandles`, `roomBeyond`, `stretchTo` in furniture.js). Drag one to resize that way; the opposite side stays put, and it stops at and snaps (within 3″) against the next wall or item that overlaps it in height. Removing a pod removes the cabinets and furniture in it. A long touch on empty space opens Layers right where you touched.
- **Joins part-way along a side** (Oct 2026 rule): wherever a pod side is partly outside wall and partly wall between pods, the 6½″ outside wall always carries on, full thickness, until flush with the inside face of the neighbour pod's wall; only there does the 4½″ wall begin (`openJoinEnds` in layout.js, no longer only for open walls).
- **Plumbing fixtures** (casework.js): Bathroom fixtures (toilets, one-piece showers and tub-showers, alcove and freestanding tubs, a wall-hung basin) and Sinks (kitchen single / double / 60-40, undermount, farmhouse, bar, laundry tub) at typical stock sizes. Sinks sit in the countertop, off the wall by their `gap`. Cubit's own stock pieces come from their STEP files, tessellated per solid into `data/fixtures-*.json` (LifePodGo shower, left and right hand). The tessellation script is `tools/step-import/fixture_mesh.py`.
- **Lights by hand** (`js/light-edit-ui.js`, edits in `state.lights[home].edits[pod] = {hide, pins}`): tap the interior ceiling to get a plan of its lights. Pick lights (several at once, in the plan or by tapping the holes in 3D), type inches and press ← → ↑ ↓ (screen directions) to move them. Add light places an extra one (a pendant), cut like a pot light. Remove, and Back to the rules. Moved and added lights are pinned and stay exactly put whatever the rules do later.
- **Homes list**: one chip per model name (LifePod, Nest, Haven, Cove, Panorama, Expanse). Tap one to list everything under it: the Cubit model, Variations, Team projects and My drafts. A home is filed by its model if set, else by its name (`famByName`: anything with “Nest” in its name goes under Nest), else by the Cubit model it came from. Homes that match none are under “Not filed yet”. Naming a draft after a model files it there. The STEP upload asks which model a home belongs to and adds it to the name.
- **Wall builder** (`js/wall-builder.js`, ⋯ → Wall builder, or Wall builder on any wall's panel): make an 8′ wall 4′ to 24′ long, exterior 6½″ or interior 4½″. Add plug, switch and double switch boxes (3″ deep) and round pockets on either face, plus window, door and cased openings and round holes through the wall. Tap to size and place items in inches, or drag them. See it from outside or inside, Flip (turn the wall around), Mirror, and warnings for anything past the wall or on a panel joint. Save puts it in the wall library, shared through `functions/api/walls.js` (R2 `walls/index.json`, history kept) and loaded into the library at start. Opened from a wall, saving also puts it on that wall.
