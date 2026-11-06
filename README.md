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
  - **Joints:** every pod keeps a ¾″ space to every pod it touches. Each pod is docked to one neighbour: it sits ¾″ out from that pod and lines up with it along the joint, so its outside walls are flush with that pod's. The layout starts from the longest pod and docks outward, the longest shared joint first. Where a pod also touches a pod it isn't docked to, it's pushed clear to keep the ¾″ there too, and its far walls may then sit ¾″ off that pod's (`layoutOffsets` in layout.js).
  - **Pods keep their parts:** a pod keeps its own walls, floors and ceilings when it is moved or turned.
  - **Your own copy:** editing a built-in home makes your own copy. Editing a project changes the project; save it to keep the change.
- **3D view:** **Layers** switches each part on or off: roof, ceiling, walls, floors, decks, ground screws and pads, windows and doors. It also has see-through glass and doors, wall letters and panel numbers. The small arrow on the right edge opens and hides the panel, in full screen and in the normal view; tapping a wall opens it too.
- **Windows & doors:** the window & door library is in `data/units.json`, with picture, casement, awning, single hung, slider, man door, patio slider and round units. **Round windows:** Cubit's round window (`WN-RD-32`) is exactly 32″ across and goes in a 33″ round rough opening. Round units only fit round openings (`shape:'round'`), and square units only fit square ones. It draws as a ring frame with round glass in 3D, a circle in the lists, and is labelled "round window · R.O. ⌀ 33" on the sheets. A round hole or round window that runs over a panel joint is cut round on both panels: in 3D each panel gets its part of the circle out of its edge (`notchedOutline` in panels.js), and in the G-code the bit follows that part of the circle and runs ⅜″ past the panel edge (`roundOverJoint` in tap.js).
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
- **Panels:** 4′ × 8′ SIPs: as many full panels as fit, and only one panel cut to fit, whose width the sheets and labels show.
- **Openings with no SIP:** a full-height opening without a shape (floor to ceiling) has no SIP in it, so the wall is laid out as separate stretches either side of it. Each stretch gets full panels plus at most one cut panel. In the panel builder the opening has a "No SIP in this opening" tick to overrule that either way, and the Panel layout box picks, per stretch, which end gets the cut panel (left by default, seen from outside). No splines are run across the gap, and a wall that is all opening has no panels.
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
- **Adopt into Cubit Homes** (`js/publish-ui.js`, editors, only from a Purgatory home's panel, so the other teams see a home there first; a draft is saved to Purgatory before it can be adopted): add it as a variation (sub-model) under any model name, or save it over the Cubit model it was copied from, after three warnings and typing the model's name. Saving over a standard model stores an `over` item in `catalog/submodels.json`. The shop files' version stays underneath and can be brought back. Every replaced or removed catalog version is kept in `catalog/history/<id>/`.
- **Mirror / flip**: cabinets and furniture mirror left ↔ right (`it.mirror`: hinges, drawers and names swap sides in the parts list). Pods mirror end for end or flip front to back (`mirrorPod`): walls change sides, run the other way and are mirrored, Wall A follows, and floors and ceilings use mirrored layers (`<id>~mx`, `~mz`, `~mxz`, see `layerById`). Any wall can be mirrored from its panel; floor, ceiling and roof layers have Mirror and Flip.
- **Tap a part** (wall, floor / ceiling / roof, deck, cabinet): it stays solid and everything else goes see-through (`applyGhost` in scene3d.js), like the cabinet viewer. Tap empty space for the solid home. A **long touch** held still picks up a pod, deck or cabinet to move it, in 3D too; on empty space it opens the Layers list.
- **Stretch**: a tapped item (not appliances) shows green double arrows on each free side (`updateHandles`, `roomBeyond`, `stretchTo` in furniture.js). Drag one to resize that way; the opposite side stays put, and it stops at and snaps (within 3″) against the next wall or item that overlaps it in height. Removing a pod removes the cabinets and furniture in it. A long touch on empty space opens Layers right where you touched.
- **Joins part-way along a side** (Oct 2026 rule): wherever a pod side is partly outside wall and partly wall between pods, the 6½″ outside wall always carries on, full thickness, until flush with the inside face of the neighbour pod's wall; only there does the 4½″ wall begin (`openJoinEnds` in layout.js, no longer only for open walls).
- **Plumbing fixtures** (casework.js): Bathroom fixtures (toilets, one-piece showers and tub-showers, alcove and freestanding tubs, a wall-hung basin) and Sinks (kitchen single / double / 60-40, undermount, farmhouse, bar, laundry tub) at typical stock sizes. Sinks sit in the countertop, off the wall by their `gap`. Cubit's own stock pieces come from their STEP files, tessellated per solid into `data/fixtures-*.json` (LifePodGo shower, left and right hand). The tessellation script is `tools/step-import/fixture_mesh.py`.
- **Lights by hand** (`js/light-edit-ui.js`, edits in `state.lights[home].edits[pod] = {hide, pins}`): tap the interior ceiling to get a plan of its lights. Pick lights (several at once, in the plan or by tapping the holes in 3D), type inches and press ← → ↑ ↓ (screen directions) to move them. Add light places an extra one (a pendant), cut like a pot light. Remove, and Back to the rules. Moved and added lights are pinned and stay exactly put whatever the rules do later.
- **Homes list**: one chip per model name (LifePod, Nest, Haven, Cove, Panorama, Expanse). Tap one to list everything under it: the Cubit model, Variations, Team projects and My drafts. A home is filed by its model if set, else by its name (`famByName`: anything with “Nest” in its name goes under Nest), else by the Cubit model it came from. Homes that match none are under “Not filed yet”. Naming a draft after a model files it there. The STEP upload asks which model a home belongs to and adds it to the name.
- **Wall builder** (`js/wall-builder.js`, ⋯ → Wall builder, or Wall builder on any wall's panel): make an 8′ wall 4′ to 24′ long, exterior 6½″ or interior 4½″. Add plug, switch and double switch boxes (3″ deep) and round pockets on either face, plus window, door and cased openings, round windows (a fixed ⌀ 33″ rough opening for the 32″ window) and round holes through the wall. Tap to size and place items in inches, or drag them. See it from outside or inside, Flip (turn the wall around), Mirror, and warnings for anything past the wall or on a panel joint. Save puts it in the wall library, shared through `functions/api/walls.js` (R2 `walls/index.json`, history kept) and loaded into the library at start. Opened from a wall, saving also puts it on that wall.
  - **Ends** (wall builder): each end is Full length, Between 6½″ or Between 4½″ (saved as `fit`). The cut ends show hatched, the panel joints and measurements count from the cut ends, and the cut length is shown. Opened from a home's wall, it takes that wall's own fit. In a home the layout's fit always applies.

- **Full-depth pockets:** a pocket as deep as the wall (within 1/16″) is cut as a hole right through: a round one as a round hole (bridged if 4″ or more), a square one as a through-hole. One on the outside face goes in the room-face file with the other through cuts. The wall builder says so under the depth.
- **iPad home-screen app:** iPadOS blurs a band about 50pt deep under its status bar, so in home-screen mode (`html.standalone`) the header, the full-screen bar and the view cube start below it.
- **Floor, ceiling & roof builder** (`js/layer-builder.js`, ⋯ → Floor / ceiling / roof builder, or Layer builder on any floor, ceiling or roof panel): the wall builder's twin for layers. Pick the kind (exterior floor, interior floor, ceiling, roof) and length (8′, 16′, 24′); add rectangular holes (heat pump head, chase), a 22 × 30 hatch, round holes, and rectangular or round pockets. Every item switches between Right through, Pocket from the top and Pocket from the bottom, with its depth (as deep as the panel = right through). Type sizes and places in inches or drag; see it from above or below (from below left and right swap), Mirror end for end, Flip front to back; warnings for anything past the edge or a pocket on a panel joint. Opened from a pod, the edges are labelled with that pod's wall letters. On a ceiling the pot lights stay with the light rules and show faintly. Save puts it in the layer library, shared through `functions/api/layers.js` (R2 `layers/index.json`, history kept) and loaded at start; opened from a pod's layer, saving also puts it there.
- **Wall rules: defaults, locks and chases** (`js/wall-rules.js`, shared through `functions/api/wallrules.js` → R2 `wallrules/rules.json`; Defaults & locks in the wall builder). Per kind of item (plug, switch, double switch, wall light box, round pocket, round hole, window sill, round window sill): default height (centre from the floor; sill for windows), default depth, a lock on each, and Sideways: Free, Chases or Fixed. New items start at the defaults. A locked value can't be dragged or typed; 🔒 on the picked item unlocks it for that one item only (saved on it as `free`), 🔓 puts it back to the rule. Chases: a 1″ vertical hole in every SIP panel, centres 6″ in from each edge of the original 48″ panel and then every foot (6, 18, 30, 42), measured from the factory edge of a panel cut short; items set to Chases snap to the nearest one when added, dragged or typed ("Place freely" overrides), and snap again when the length, ends, mirror or flip move the panels. The chases show as faint blue lines. Starting rules: plugs 18″ and switches 48″ to centre, both locked, 3″ deep locked, on the chases.
- **Undo / redo in every builder** (`js/local-history.js`): ↶ ↷ in the wall builder, the floor/ceiling/roof builder and the cabinet library's item view, plus ⌘Z / ⇧⌘Z. Every change is a step (the builder keeps a copy each time it redraws).
- **Shape studio** (`js/shape-studio.js`, ⋯ → Shape studio, or Draw a new shape in the wall / floor-ceiling-roof builders): full-screen sketching that follows **Shapr3D's rules**.
  - **Sketch, then regions:** lines, rectangles, circles, arcs and splines; every area they close off is a region (overlaps and lines across a shape split it, a shape inside another leaves an island — `arrangement()` in `js/geom2d.js`, a planar graph of every curve). Tap a region and set Not cut / Right through / Pocket + depth (several regions at once). A region keeps its setting while you edit (remembered by a point inside it); when one is split, both halves keep it.
  - **Tools** (keys V L R C A S F O T M): Select (taps add to the selection, double-tap = whole chain, drag a point / line / picked shapes, Pencil or mouse on empty space = box select, finger = pan); Line (touch and drag: it draws from where the pencil lands, with length and angle live, and each drag from the end carries it on; a tap anywhere stops it (on its start closes it) and leaves blue end bullets — drag from a bullet to add on, drag a corner or a line to move it; tap the start to close, the last point again to finish; starting on a line's end carries it on, ending on another's end joins them; type length, Tab, angle, Enter); Rect (corner or centre; drag or tap-tap; type W Tab H); Circle (centre & radius or 3 points); Arc (drag start → end, then drag to bend it, radius live; or 3 taps); Spline (draw freehand with the pencil — smoothed to a few points you can drag — or tap fit points); Fillet (press a corner and drag, or tap it and type R); Offset (press a closed shape and drag, or type; straight shapes stay sharp, curved ones round); Trim (tap the piece between two crossings); Mirror (pick, then tap the line to mirror across: a copy).
  - **Tap a shape to pick it:** with any drawing tool, a tap (no drag) inside a shape switches to Select and picks it.
  - **Inference snapping:** end points, midpoints, centres, quadrants, crossings, onto lines, lined up with other points (dotted guides), horizontal / vertical / perpendicular / parallel from the last point, 15° steps, then the grid; a small label names it.
  - **Dimensions:** live while drawing (length + angle, W × H, ⌀, R); picked lines, arcs, circles and corners show theirs — tap one to type a new value.
  - **Undo** steps through every action, each line segment on its own (they're saved as they're drawn).
  - **Delete:** pick any mix of lines, sides, circles and shapes and one Delete takes them all; inside a shape, *Delete this shape* removes its whole outline (*Pick its lines* picks it). Shapes drawn inside shapes are their own regions with their own depth and stay one shape for the CNC.
  - **Corner radius:** the R bubble or the inspector; several corners picked take one value. Number fields have a ✓ Set button and also take the value when you tap away (the iPad number pad has no Enter).
  - **Mirror:** step 1 pick what to mirror (tap lines or inside shapes, or box them) → Next → step 2 tap the straight line to mirror across.
  - **Units:** in / ft-in / mm / cm (remembered); everything shown and typed follows it, and a typed value can carry its own unit (3' 4", 25mm, 2.5cm).
  - **Gestures:** pinch zoom, two-finger pan, **two-finger tap = undo, three-finger tap = redo**; ⌘Z / ⇧⌘Z; Escape steps back.
  - The ¾″ bit check: inside corners tighter than ⅜″ are ringed red and the outline the bit really leaves is dashed.
  - Saved shapes keep the sketch (`sketch:{ents, regs}`) and the cut regions worked out at 0.004″ (`regs:[{outer, holes, cut, depth, name}]`). First-style drawings still open and place.

- **Placing shapes:** Add shape in the wall builder and the floor / ceiling / roof builder places a copy (a later change in the library never moves a panel already made). Drag it or type where it sits; Mirror / Flip it; choose the face its pockets come from. Walls and layers keep them as `shapes:[{ kind:'shape', ref, name, regs (or geo), x, y|z, w, h, mx, my, face }]`; regions with islands carry `islands` through to the cuts (3D keeps islands standing, the bit's rings go round them); `expandWallShapes` / `expandLayerShapes` turn them into exact outline cuts (`shape:'poly'`, `path`, `tool`) inside `bodyWall` and `layerHoles`, so the 3D view, sheets and G-code all use them. The bit's paths come from Clipper offsets (`js/geom2d.js`, `js/vendor/clipper.js`): through cuts ⅜″ inside the outline (clockwise), pockets as rings from the middle out (climb). In the G-code, runs of points along one circle go back in as true G2/G3 arcs (`fitArcs`). A drawn through cut over a panel joint is cut exactly on both panels (3D: Clipper difference; G-code: its part on each panel, the bit running ¾″ past the edge). Wall pockets over a joint are flagged (keep 1¾″ clear of splines).
- **Panel builder** (`js/panel-builder.js`, ⋯ → Panel builder, or Panel builder on any wall or layer's panel): one place for every SIP panel. The chooser at the top switches between Wall, Exterior floor, Interior floor, Interior ceiling and Roof (the wall builder and the floor / ceiling / roof builder underneath, each with only its own tools, each saving to its own library). Opened from the ⋯ menu it starts on whatever is picked in the home; with nothing picked, on the last kind used.
- **Builders are full screen** (panel builder, cabinet library, Shape studio), with the close ✕ always top right.
- **Layers list folds:** the switches are in groups — Shell, Inside the panels, Cabinets & furniture, Floors & foundation, View & labels (plus Focus and Pods). Tap a group's name to fold or open it (remembered on this device); its own switch turns the whole group on or off, and it shows how many are on.
- **North (Build view)** (`js/compass-ui.js`): a small dial under the view cube shows where north is on screen and turns with the view. Tap it to set the home's bearing: type it, tap N / E / S / W, ↺ / ↻ 15°, or drag the needle to point north. Kept per home (`orient.js`), it turns the north arrow beside the home, gives each wall's facing, and prints on the foundation sheets. Changing it on a Cubit model makes your draft, like any other change.

## Library 3D viewer
Tap any row in the Library (⋯ → Library), or its 3D button, to see that home, pod, wall, floor / ceiling / roof or deck full screen in 3D (`js/viewer3d.js`). Exploded view (or spread three fingers on an iPad: the wider, the further; pinch three fingers to put it back) pulls it apart (homes and pods the same way Build does; a wall's panels apart; floors and decks spread from the middle). The side cube top right turns with the view; tap a side and the view flies there and locks flat (no perspective, no turning; zoom and slide still work). Tap 🔓 3D, double-tap the cube or press Esc to turn freely again. Letters and Numbers switch the wall letters and the panel numbers on or off (remembered in this browser). Homes and pods are built by Build's own code and copied, and Build is put back as it was.

## Panel builder: moving items
The first tap on a window, hole, box or hatch only picks it. Drag a picked item to move it: it moves along one line only, sideways or up / down (along or across on a floor, ceiling or roof), whichever way the drag starts.


## Back arrow between windows
Any window opened from another window gets a ← top left (`js/dialog-back.js`). Opened on top (Library → 3D viewer, Panel builder → Shape studio): ← closes it and you're back on the first. Opened in place (Homes → Library): ← reopens the window you came from. It applies to every window automatically; small question windows such as Rename keep their own Cancel.

## Two people saving the same home
Every shared save (a team project, a home saved over, a variation saved back) carries the version it started from. If someone else saved in the meantime, the server saves nothing and hands their version back, and the app combines the two (`js/sync.js`): what only you changed is kept, what only they changed is kept (Heinrich's plumbing and your walls both end up in the home). Only when you both changed the same thing (the same wall, the same cabinet, the north direction) does a window ask which to keep. The one not kept stays in the earlier versions. A project measures your changes from when you opened (or last saved) it; a draft from when it was copied.
On the server every shared list (projects, sub-models, walls, floors and roofs, shapes, library edits) is written only if it hasn't changed since it was read (`functions/_store.js`), so two saves at the same moment can't wipe each other out.

## Measuring from a reference (panel builder)
Pick an item, tap 📏 Measure from…, then tap any point of reference on the drawing: a dot (the centre, a corner or an edge of a hole, window, door, box or shape) or a line (a panel joint, a chase, an end, the floor or the top). Type how far sideways and / or up-down (straight, never at an angle), choose whether that distance runs to the item's centre or its near edge, and tap Place it. It's placed once and doesn't follow the reference later (`js/refmeasure.js`, walls and floors / ceilings / roofs).

## Names beside codes
Walls, floors / ceilings / roofs, pods and decks in a home can be given a name (Name button in the side panel; a pod's name also in Plan). The code stays (Wall D, panels 1D-1 …) and the name shows beside it: "Wall D · Kitchen wall", on the sheets and the labels too (`js/names.js`, kept per home in projects, drafts and published homes). Openings, boxes and layer holes get an optional name in the panel builder (shown on the sheets); cabinets and fixtures a name in their side panel. Library items are renamed in the Library.

## Cabinets: Mozaik's construction
The cabinet library builds cabinets the way Cubit has for years in Mozaik (`docs/mozaik-cabinet-rules.md`, read from Brad's test kitchen):
- One sheet material at its measured thickness.
- Dado construction with stopped dados and notched panels. The back sits in a dado and a groove in the bottom.
- System 32 shelf pins, 37 mm from the front and 64 mm from the back, 7 holes per shelf.
- Blum or DTC press-in hinges: cup, dowels and plate marks.
- Runner holes for each drawer.
- 16 mm drawer boxes with tongues in ¼″ dados.

Every part carries its exact machining (`part.cnc`). In the library, opening a part draws it as it lies on the CNC: outline, notches, dados, holes and dimension chains, plus a table of every cut, its bit, its position from the edges and its depth. **Cutting plan** shows every part of a cabinet and prints as a booklet.
- Side A is the last program, the one with the cut-throughs.
- Side B is cut first, and only if a part has cuts on its other face.

The 3D view (library and home) builds every part from its machining (`cncGeos` in `js/casework3d.js`). You see the real outline and notches, every dado, groove, rabbet and hole, at its depth and on its face. Each part is placed by `part.cnc.at`. The right end is drawn and cut as the mirror of the left end, so its toe notch stays at the front.
Handles are picked per cabinet, or left to drill later (the default). `node tools/mozaik/compare.mjs` checks the rules against Mozaik's cut list.

## Cabinet G-code
Open ⋯ → **Cabinet G-code** for every cabinet in the home, or **G-code…** in a cabinet's Cutting plan for just that one (`js/cabcnc.js`). The steps:
1. **Measure the sheets.** The thickness is asked for every time, in inches or mm. Every dado width, depth and inside panel size follows it.
2. **Nesting.** Every part is nested on 48 × 96 sheets with 9/16″ between parts and ⅛″ trimmed off each edge. Parts can be turned; PET has no grain.
3. **One ShopSabre program per sheet,** in Mozaik's style and on the same tool table as the walls ("WALLS TOOLSET"). The order:
   - T7 5 mm drill: shelf pins, plate marks, runner holes, handle holes.
   - T11 35 mm and T8 8 mm: hinge cups and dowels.
   - T2 ½″: dados and grooves.
   - T14 ¼″: drawer-box dados and tongues.
   - T1 ⅜″: every outline last. Big parts get a skim pass that leaves 0.04″, then every part is cut through.
   - Every part's inside face is up, so sheets go in good face down and none need turning over.
   - If a part ever has cuts on its other face, its sheet gets a "-B first" program, so the cut-throughs are always in the last program.

The zip holds the programs, a parts list with each part's place on its sheet, and a README.

## Zooming the panel builder
Pinch to zoom the drawing in either builder (wall, floor, ceiling, roof), around the point between your fingers, and slide with two fingers. Double-tap with two fingers to see the whole panel again. The − / % / + buttons in the corner do the same, as do trackpad pinch and the mouse wheel. Taps and drags still land in the drawing's own inches, so a zoomed-in drag moves the item in finer steps (`js/zoompan.js`).

## Wardrobes
The Wardrobes category in the cabinet library is a system of separate boxes that stand side by side. Each one is built with the same Mozaik rules as the kitchen cabinets, so each cuts, drills and nests the same way.

The units:
- Hanging (long hang under a hat shelf)
- Double hanging
- Shelves (adjustable, with a fixed shelf in the middle for stiffness)
- Hanging over drawers
- Shelves over drawers
- Drawers under doors (outside fronts)
- Top box (stands on a unit to reach the ceiling)

Every unit can be Doors or Open. Drawers inside a unit with doors sit 2″ behind the box front, past the hinges, and their runner holes move back with them.

**Wardrobe wall** puts ready-made walls of units in the library, taken from the inspiration photos: Five doors, Walk-in (open), Floor to ceiling (with top boxes) and Compact. Its width follows the layout, top boxes can be added, and each unit is labelled U1, U2 … in the cut list.

Wardrobe boxes are 23½″ deep, so two 84″ ends fit across one 48″ sheet; 23⅝ misses by 0.06″. Nesting now tries several orders and keeps the one that uses the fewest sheets.

## Bookshelf, wall joint
The Shelves category has an open, modern bookshelf for where two pod walls meet. It is 15″ wide by default, to cover the joint and the edges of the finished panels, and 12″ deep. It's built like every cabinet: dados, evenly spaced fixed shelves (6 openings of about 14½″), a back in its dado, a 4″ toe kick (2½″ or none if wanted) and no doors.

Its default height is the tallest it can be and still be tipped up into place. Its diagonal has to clear the pod ceiling: 106.6″ underside of the ceiling less 10.56″ top of the interior floor = 96.04″ clear, with ¾″ kept spare (`erectH()` in `js/casework.js`). At 12″ deep that's 94½″, leaving about 1½″ above it once standing.

## Blueprints (drawing set)
Sheets → Whole home → **Blueprints · drawing set**, or ⋯ → Blueprints. This makes a Cubit-branded drawing set for any home (`js/blueprint.js` draws it, `js/blueprint-ui.js` shows it and makes the PDF). It's modelled on the Tidal Drafting set for Cubit Pod 5 (Quadlux 2).
- **Sheets:**
  - A01 Cover & general notes (sheet list, project data, liability)
  - A11 Foundation plan (screws numbered and dimensioned, or the ICF footing)
  - A12 Floor plan (walls, doors with swings, windows, fixtures and furniture, room names with inside sizes, three dimension chains each side, elevation and section markers, north arrow, scale bar)
  - A13 Pod & wall key plan (the wall codes and a wall schedule)
  - E11 Electrical (pot lights, plugs, switches, data, outside lights; legend with counts)
  - P11 Plumbing (fixtures with drain sizes)
  - A21 Exterior elevations (front, right, back, left, with unit symbols and level marks)
  - A31 Section (every layer at its build thickness, with construction notes)
  - A61 Window, exterior door and interior door schedules
  - A91 3D views (three outside, one with the roof off)
- **Page:** 24″ × 18″ (ARCH C). Plans are at the largest of ½, ⅜, ¼, 3/16 or ⅛″ = 1′-0″ that fits.
- **Title block, on every sheet:** notes, six revisions, the Cubit logo (`brand/cubit-logo.png`, taken from the drafter's set) with the company lines, client, site, model, pods, floor area, project, drawing title, date, scale, drawn and checked by, and the drawing number.
- **Details:** edits the title block and notes. The company lines and notes are kept for every home in this browser (`localStorage` `cubit-blueprints`). Project, client, site, drawn and checked by, date, revisions and which sheets are in the set are kept per home. In the notes, `{T}`, `{TI}`, `{GAP}` and `{FOUNDATION}` fill in from the home.
- **PDF:** vector, one page per sheet, through svg2pdf (`js/vendor/svg2pdf.umd.min.js`, MIT), with Oswald embedded (`fonts/`, SIL Open Font License). Text is ASCII only so the font has every glyph.

## Ceiling / roof cassette
From the shop, Oct 2026. Heights are measured from the bottom of the floor.

| Layer | Build | Height |
|---|---|---|
| Interior ceiling SIP | 6½″ (½″ OSB + 5½″ EPS + ½″ OSB) | 106.6–113.1 |
| Gap | 1⅞″, wiring runs here | 113.1–114.975 |
| Roof SIP | 4½″ (½″ OSB + 3½″ core + ½″ OSB) | 114.975–119.475 |

- **Overall:** 12⅞″, made up of the roof's top ½″ OSB, the 11⅞″ LVL rim and the ceiling's bottom ½″ OSB. The rim runs from 107.1 to 118.975.
- **The gap is built like the floor** (`ROOF_BUILD` in config.js, `roofBuild` in framing.js):
  - 8″ EPS strips, 1⅞″ thick, all round against the rims.
  - 16″ wood blocks laid flat across every panel joint, at 32″ and 64″ across. They are 1⅞″ thick so they fill the gap; LVL offcuts ripped 3½″ wide are exactly that.
- **Where it shows:** 3D (with the framing switch), the framing cut list and the take-off.
- **Scanned layers:** older scanned ceilings and roofs (6.47″ / 6.48″) take these thicknesses when they load (`fixLayer` in data.js).

## Deleted items (⋯ → Deleted items)
Everything deleted is in one window, sorted into groups, each row with **Restore** (`js/trash-ui.js`; on a phone, Homes → Deleted items):
- **People:** customer profiles.
- **Homes:** Cubit Homes originals and variations, Purgatory homes, customers' homes, my drafts.
- **Model names.**
- **Building:** walls, floors / ceilings / roofs, decks, pods.

Deleted things disappear from every list and picker straight away. Library items, model names, Cubit Homes originals, customers and drafts can come back for 14 days, then they're gone for good (`KEEP_MS` in libedit.js; drafts are kept in this browser, `cubit-draft-trash`). Purgatory and customers' homes keep every save on the server, so they can always come back: a deletion is noted in `projects/deleted.json` (`GET api/projects?deleted=1`, editors) and Restore brings back its last save. Restoring needs an editor or admin, except your own drafts. The Library's walls, floors and decks lists show a **Deleted (n)** link that opens this window.

## Every Library card: 3D, Rename, Delete
Every card in the Library (walls, floors / ceilings / roofs, decks, windows and doors, cabinets, appliances, bathroom fixtures, plumbing, electrical, heating, furniture) has **3D** (the full-screen quick view), and for editors **Rename** and **Delete**. A deleted item leaves every list, picker, the tray and the price book at once; homes that already use it keep it. It goes to ⋯ → Deleted items for 2 weeks. Renames and deletions of cabinets and fixtures (`casework:<k>`) and windows / doors (`units:<id>`) are kept with the other library edits.

The 3D quick view has **⛶ Full screen** (or F): the header goes and the 3D takes the whole display (the browser's own full screen on a computer); **✕ Exit full screen** comes back.

## Moving a home's plugs and switches in the panel builder
Open the panel builder from a wall of a home (the wall's panel → Panel builder). The home's own plugs and switches, laid out by the electrical rules, show in green (orange once moved, grey when locked to a fireplace). Tap one, then drag it, type where it goes, or use the arrows: ◀ ▶ jump chase to chase and ▲ ▼ go 1″ (or pick 1″, ½″ or ⅛″ steps for every arrow). **Save … to this home only** (or Save to library, which also saves them) keeps the moves on that home only (`elec.ov.mv`, electrical.js), over the rules' defaults; the wall in the library is unchanged. **Put it back** drops an unsaved move; **Back to the rule** clears a saved one. The library wall's own plugs show faded where the home's rules replace them.

**Box size:** pick any plug, switch or data box (panel builder or a wall's panel in Build) and set it to **Single** (2⅜ × 3⅜), **Double** (4⅛ × 3⅝) or **Triple** (5⅞ × 3⅝). For a home's own boxes it's kept on that home (`elec.ov.g`); for a library wall's boxes it's part of the wall.

The same moves are in Build: pick a wall in 3D, then tap a plug or switch in its panel (Plugs & switches). It gets the same arrows (chase to chase, or 1″ / ½″ / ⅛″) and typed position, is ringed in orange in the 3D view, and each move goes on the home at once so you see it against the furniture (Undo takes it back).

## Holes through both floor layers
In the panel builder for a pod's interior or exterior floor (opened from the pod), a hole right through has **Through both floor layers**: saving cuts the same hole in the pod's other floor too (both floors use the pod's own frame, seen from above), and that floor is saved and put on the pod. A linked pair keeps one `link` id, so moving or resizing the hole moves its twin on the next save. Removing a hole that has a twin in the other floor (linked, or the same place and size) asks **Both floors** or **Only this floor**; turning the switch off or making it a pocket asks the same. A team layer made in the builder is saved over; a standard, scanned or mirrored floor becomes a new layer. Roofs and ceilings don't have this (a roof only gets holes if a pod goes on top; rules for that later).

## Switches: what each one does, and 3-ways
Every switch box gets a number (S1, S2 …, by pod, wall and place) and says what each switch in it does, for the electrician: by the rules the room's lights (3-way with the room's other doors when the room has 3-way), and at an outside door the second switch is the outside light. Pick a switch box (a wall's panel in Build, or the panel builder) to change it: per switch **Room lights, Pot lights, Outside light, Exhaust fan, Ceiling fan, Under-cabinet lights, Pendant / island, Wall light, Switched plug, Other** (type it) or **Not set yet** (flagged), and **1-way / 3-way**. Make the box Double or Triple for more switches. **Pair with…** ties any two switches as a 3-way, in one room or across an open space (pods joined by a wide opening are one room); three or more tied together are 3-way at the ends and 4-way between (worked out each time). Kept on the home (`elec.ov.sw`). **Seeing the pairs:** in 3D every tied group gets its own colour: an arched wire over the walls from switch to switch, with beads, a ring on each switch and a pill naming it (S2 · 4-way); picking a switch brings its group forward and fades the rest (Layers → 3-way switch links turns them off). The same colour marks the switch's 3-way / 4-way chip in the wall panel and the schedule. Blueprint E11 draws a dashed arc between tied switches. **This home's electrical** has the **switch schedule**, and blueprint E11 marks each switch S1, S2 … with the schedule beside the legend.

## Plugs & switches (devices)
Library → **Plugs & switches**: **Switches**, **Plugs (receptacles)** and **Data & TV**, the common types sold at Home Depot Canada, RONA / Home Hardware and Canadian Tire (as types, not one brand's part numbers; `js/devices.js`): toggle and Decora rocker single-pole / 3-way / 4-way, lighted and pilot-light rockers, 20 A, double and triple rockers (2 or 3 switches in one gang), switch + receptacle, slide / rotary / toggle / ELV dimmers, smart switch, smart dimmer and companion, motion sensor, countdown and 7-day timers, fan speed and fan + light controls, push-button, key, 30 A double-pole, line-voltage thermostat; duplex and Decora 15 A TR, 20 A T-slot, split, single 15 / 20 A, GFCI 15 / 20 A, WR GFCI and WR duplex with in-use cover, AFCI, USB-A, USB-A + C, 2 × USB-C, 20 A USB, GFCI + USB, USB-only, smart, half-switched, surge, night-light, 14-50R range, 14-30R dryer, 6-20R, EV 14-50R; Cat 6, 2 × Cat 6, coax, Cat 6 + coax, HDMI, brush plate, phone. Tamper-resistant (TR) as required in Canadian homes. (There's no "Lightning" wall outlet; USB-C is the current one.)

**＋ New switch / plug / data jack** adds one (name, single-pole / 3-way / 4-way, switches in one gang, amps, look, features, note), shared with the team (`functions/api/devices.js`, `catalog/devices.json`); team-added ones have **Edit**. Every device has 3D (its plate and box), Rename and Delete (Deleted items).

Every box holds one device per gang, chosen by the rules (Decora rocker of the right way, 20 A T-slot on counters, GFCI at a basin, WR GFCI outside, range 14-50R, Cat 6 + coax for data …) and changed on any box (a wall's panel in Build, or the panel builder; `elec.ov.dev`). A double rocker gets a second "and" for what its other switch does. A device that can't do the 3-way / 4-way it's wired as is flagged. The switch schedule names each switch's device; **This home's electrical → Devices to buy** counts them; blueprint E11 lists them in the legend; they're priced in the Price book (`dev:<id>`) and in the home's cost.

## 2D: a blueprint top view
The 2D button gives a flat top view that reads like the drawing set: paper white, flat light, the rooms white, and over them the plan as blueprint.js draws it (walls dark and cut, windows, door swings, room names and sizes, the outside dimensions and rough openings); the picked wall shows orange. Wall letters and panel numbers are off while in 2D (Layers turns them on; they come back in 3D), and so are the SIP floor joints, floor lines, the compression seals and the dashes along open pod joints (they come back in 3D). Furniture, cabinets and pods still show and drag as before. The view squares itself to the nearest 90° going into 2D and after anything turns it.

## Middle walls (split a pod)
A wall inside a pod to split off a bathroom, a bedroom … Drag **Middle wall** from the tray into a pod (across it, or along it when dropped along the pod's middle line), or pick a pod and tap **＋ Wall across** / **＋ Wall along**. It lands where it's dropped to the inch, or flush with another wall's face within 3″.

Tap it: **Door** (No door, Door left / middle / right, 30″ / 32″ / 34″ / 36″; a library interior wall with that door is made once and reused, the interior door unit chosen by itself), **Where it sits** (◀ ▶ by 1″, ½″ or 1′, or type the middle from the end), **Snap flush** (with each wall face it can line up with, in this pod or the pods beside it, or the middle of the pod), Make it across / along, Remove. It's a 4½″ interior wall like any other (`layout.js middleWalls`): a library wall of the pod's width or length fitted between the inside faces of the walls it meets, with the wall options, the panel builder, sheets, labels and CNC; letters M1, M2 … It's kept on the pod (`pods[i].parts`: `{ id, dir:'cross'|'long', at, wall }`, in the pod's own frame), so it moves, turns, mirrors and flips with the pod. The drawings and the 2D view label each room it makes with its size.

Not yet: the electrical rules still treat the pod as one room (plugs along the outside walls, switches at the pod's doors). Add plugs and switches on a middle wall by hand (its panel → Plugs & switches → Add).

## TVs
Library → Furniture & TVs → **TVs**: flat screens 43″ to 85″ (16:9, on a flat wall mount, about 3″ off the wall). A new TV goes with the middle of its screen at 42″ (seated eye level), raised so the bottom never sits under 24″ (`tvY` in casework.js); change its Height on any one to override. Against a wall it gets a **recessed TV box** (power + low voltage) behind the screen, hidden by it, clear of the wall mount (the middle of the TV, a third of its width up to 24″), on the chase nearest the middle (electrical.js 5d, `tvr`). It starts double-gang size (4⅛ × 3⅝); set Single / Double / Triple on it like any box. Blueprint E11 shows it as TV.

## Rules on every library item
Each cabinet, appliance, fixture, TV … page in the Library has **Rules for this item**: its height rule, its electrical rules (its own plug, counter plugs, GFCI, bedside, desk, TV box, fireplace power, no plug near a tub or above a baseboard, data boxes), its plumbing (drain, floor hole, valve wall, alcove walls) and any wall rule. Windows and doors list theirs on the card (fit, no plug under a window, door switches, interior doors). The same rules also sit where they act (Electrical / Plumbing / Heating rules, Wall rules), so a rule can show in both (`js/item-rules.js`).

## Windows & doors in the Library
Three categories: **Windows**, **Exterior doors** (man doors, patio doors) and **Interior doors** (units with `"place": "int"` in data/units.json). An interior door is only offered in interior walls, and where one fits there only interior doors are offered (so an interior opening no longer picks the steel exterior man door by itself). Two interior door samples (34 × 80 and 36 × 82 prehung) stand in until the real units are uploaded.

## New model names
Homes → Cubit Homes → **＋ New model name** (editors and admins). It shows as a chip for the whole team at once and in the Save window's model list, empty until a home is adopted into it from Purgatory (Adopt into Cubit Homes, pick the model name). Open a model name's chip to **Rename** or **Delete** it; homes under a deleted model name show under "Not filed yet" until it's restored. Added names are kept with the library edits (`fams` in `catalog/library-edits.json`, `{op:'newfam', name}` on `api/library`); the six first ones stay in `data/families.json`.

## Exploding in Build
In Build, a three-finger spread pulls the home (or an isolated cabinet) apart as far as you spread your fingers, the same as the Library's 3D view; a pinch brings it back together. The Exploded view button still goes all the way apart or all the way back.

## Homes, customers and roles
**The home picker** (top left) has four categories, one list at a time:
- **Cubit Homes:** the originals, by model name: the standard layout and its variations. They're protected; a change makes your own copy in My Drafts.
- **My Drafts:** your own working copies. Only you see them.
- **Purgatory:** homes saved for the team to review. These are team projects without a customer, including every older project.
- **Customers:** each customer, with the home(s) linked to them and their profile.

**The home's panel** shows what you can do with it:

| Home | What you can do |
|---|---|
| Draft | Save to Purgatory · Save to Customer (pick one or ＋ New customer). Not adopted straight into Cubit Homes: save it to Purgatory first so the other teams see it |
| Purgatory | Save changes · Save to Customer · editors: Adopt into Cubit Homes, Delete |
| Customer | Profile · Save changes · Sign & lock · editors: Unlock |
| Cubit Home | Protected. Editors can rename or move a variation, replace it (change it, then Adopt → Replace, after three warnings and the typed name), or delete it (typed name, kept 2 weeks). |

**Customers** (`js/customers.js`, `js/customers-ui.js`, `functions/api/customers.js`):
- **Profile:** contact details and site, plus the linked homes.
- **Selections:** built from each home (pods, windows and doors, cabinets, appliances and fixtures, foundation, decks, lights), plus the finishes typed in (cladding and colour, accent walls, frames, flooring, walls, ceiling, cabinets, counters, hardware, fixtures).
- **Sign & lock:** the customer and the rep sign on the screen. The home is saved, the signatures and the summary are kept for good (`customers/<id>/signed-…`), the home locks, and a signed PDF summary downloads (it can be made again from the profile).
- **Locked homes:** the server refuses saves (423). A change in the app goes into a draft. Editors unlock with a reason and any fee; every unlock is logged on the home and the customer.
- **Deleting a customer:** editors only. Kept 2 weeks, then gone.

**Roles** (`functions/_auth.js`, `js/role.js`). Admins set them under ⋯ → Team (`catalog/team.json`). `ADMIN_EMAILS` are always admins. Anyone else who can log in is a User.

| Role | Can |
|---|---|
| User | Look at everything: explode, zoom, walls, labels, panel builder and sheets (look only). Saves nothing. |
| Salesperson | Everything a User can do, plus customers, swapping walls and windows, pods, cabinets, basic choices with a client, Save to Purgatory or Customer, and Sign & lock. |
| Editor | Everything a Salesperson can do, plus the panel builder (moving windows, plugs, holes), pot lights, the libraries, deleting, Adopt and Replace in Cubit Homes, Unlock, and shop settings. |
| Admin | Everything an Editor can do, plus the Team list and STEP uploads. |

CSS: `.edit-only` is hidden for Users, and `.editor-only` is hidden for Users and Salespeople. The server checks every save the same way (`atLeast(me, role)`).

## When the long walls run through
Normally a pod's end walls run through, corner to corner, and the long walls butt between them. The roles swap at a corner where the end wall has no SIP: a full-height opening (a door, a cased opening between pods, glass doors) starts right at the corner, no more than the long wall's thickness plus 2″ in.
- **The long wall runs through to that corner.** It gets the spine notch and the corner studs, and its full-height end stud faces the opening.
- **The end wall stops at the long wall's inside face.** Any sliver of up to 2″ before its opening isn't a panel (a jack fills it), and there's no end stud in the opening.
- **Openings wall to wall:** both long walls run through at that end.
- **Exterior ends too:** this includes end walls that are full glass doors.
- **What doesn't change:** wall letters stay as they are, and the rough openings keep their sizes.

Where: `fitShortWalls` in layout.js (`slot.through`, `slot.snap`), `bodyWall` and `wallStretches` in panels.js, corner logic in framing.js.

## Moving cabinets: one touch, one wall
While you drag a cabinet, it keeps the wall its back was on when you picked it up (or the first wall it touched, if it's new). It slides along that wall and stops at the corner instead of flipping onto the other wall. Another wall can only take it once it's pulled into the room beyond that wall's reach (its depth + 1.6′). Two-finger twist still turns it. Code: `lockA` in `snap` (furniture.js), set in `trackFurn` (build.js).

## Groups and the kitchen library
- **Pick several:** a cabinet's panel → **Pick several…**. Tap items to add or take them away, or use **All on this wall** or **All in this pod**. Then **Group…** and name it.
- **What a group does:** it picks, moves (drag any member), turns (two fingers) and explodes as one. A group stays in one pod.
- **Ungroup to edit** keeps the memory (`it.was`), so **Relink "name"** on any of its items puts it back together.
- **Save to kitchen library** (editors and admins) stores the group as a recipe: each item's size and options, and its place relative to an anchor. You can save it as a new kitchen. **Updating** the saved kitchen it came from warns first and asks you to type its name; the old version is kept (`kitchens/history/`).
- **Copies, not links:** homes keep their own copy, so updating a saved kitchen never changes a home that already has it. Salespeople can change kitchens freely, but those changes stay in their draft or the customer's home.
- **Dropping one in:** Build tray → Cabinets → **Kitchens & groups**. Drag a kitchen in and it lands as a group on the wall you drop it on.
- **Code:** `js/kitchens.js`, `functions/api/kitchens.js`, group helpers in furniture.js, panels in casework-ui.js.

## Standard windows and doors (North-Air)

These are Cubit's standard units, from North-Air quote 91,608 (Cubit CO-24), stored in `data/units.json`. All are Black/Black, Low E / Argon, with 1½″ brickmould.

| Unit | Size (unit) | Rough stud opening | Notes |
|---|---|---|---|
| WN-CA-2447 Casement | 24 × 47¼ | 25¼ × 48½ | Egress. Brickmould 27 × 50¼. Hinge left or right per opening. |
| DR-PA-7183 Patio door 6′ | 70¾ × 82½ | 72 × 83¾ | Brickmould 73¾ × 85½. Moving panel left or right per opening. |
| DR-EN-3782 Man door | 37½ × 82 1/16 | 38¾ × 83 5/16 | Standard steel slab with a fixed glass lite and a 6″ steel panel all the way around. Outswing, 6⅝″ vinyl-clad jamb, brickmould on 3 sides. |

New openings drawn in the Panel builder start at these rough stud openings. Interior doors stay at 36½ × 80¾.

A sample unit is offered only for openings that no standard unit fits. That keeps interior doors and older homes' taller windows covered.

## Walls between pods always match (joints)

Where two pods meet, each pod keeps its own interior wall, always 4½″. Doors, windows, HRV holes and other openings go right through both walls, so their openings always match, mirrored (`js/joints.js`, applied in `bodyWall`):

- The wall picked or built most recently leads, and the wall on the other side takes its openings. The time is stored in `MODELS[k].joint.lead[wkey]`. **Use this wall's openings** on the wall panel makes the other wall lead instead.
- If neither wall has been picked yet (stock homes, new pods), the openings of both walls are combined, lower-numbered pod first. An opening on the other side that overlaps one already there is dropped, because it's the same opening drawn slightly off.
- Plugs, switches, data boxes and anything else on a wall's face belong to that wall only. The electrical rules put boxes only on the face toward the wall's own pod.
- **Let the two differ** (`joint.free`) stops a pair matching. Use it only when the two walls really must have different openings.

## Plugs and switches by rule (electrical)
New homes take no plugs or switches from the wall library. `js/electrical.js` lays them out from the rooms, the doors and the cabinets every time something changes, and they're cut into the walls like any other box (3D, panel sheets, CNC, blueprint E11). In an older home, the same happens to any wall swapped in and every wall of a pod added; Library → Electrical → Electrical rules → **This home's electrical** → **Re-lay electrical** moves the whole home onto the rules (one wall at a time: **Lay this wall out by the rules** on its panel).

Rules (CEC as used in Nova Scotia; heights to the box centre):
- Plugs 16″, with no point along usable wall more than 1.8 m from one. Every stretch of 900 mm or more gets a plug. Doorways, full-height glass, the wall behind a door swung open and walls behind fixed cabinets, appliances, tubs and showers break the run. The run carries on round corners. Bathrooms get only the basin GFCI.
- Kitchen counters: plugs at 42″, every point within 900 mm, none behind the range or sink. Basin: GFCI at 42″ within 1 m.
- Each appliance gets its own plug behind it: fridge 42″, range 6″, dishwasher 12″, washer / dryer 42″, microwave 42″. Beds against a wall: a plug each side of the head.
- One weatherproof plug outside, beside the main door. With no outside door it goes mid-wall and is flagged.
- Switches 48″, centred 6″ from the rough opening on the latch side, on the side the door swings into. Outside doors get a double box. A room with two or more entrances gets 3-way switches (4-way between) once the team confirms. Rooms are pods joined through a non-door opening 48″ or wider.
- Walls between pods: boxes go only on the face toward the wall's own pod.
- Data boxes (optional per home): one on the TV wall in front of a sofa, and one opposite each bed.
- Chases come first: a box snaps to an electrical chase (`wall-rules.js`) within 18″ for plugs or 6″ for switches, clear of openings, panel joints, cabinets and other boxes. Otherwise it stays where the rule put it and is flagged **needs a chase**.

Hand changes are stored with the home in `MODELS[k].elec`:
- `auto` (whole home)
- `walls` (wall keys `pod:side:from:type`)
- `ov.del` / `ov.mv` / `ov.add`: removed, moved and added boxes
- `sw3` (3-way confirmations)
- `data`

These changes survive every re-layout. **Start over** drops them. Each wall's panel lists its boxes, with ◀ ▶ (next chase), ✕ and ↺, plus Add.

A box counts as on a chase anywhere within 2″ of the chase centre. The rules aim for dead centre and nudge only as far as needed, in ½″ steps.

Furniture's own plugs go on every wall, including walls in older homes that keep the library's plugs and switches. That means appliances, the basin GFCI, counter plugs, bedside plugs, and a desk plug 12″ above the desktop. The wall plugs, switches, outside plug and data boxes go only on walls laid out by the rules.

## Sinks, sink bases and countertops

Kitchens fit themselves after every change (`js/furniture.js`, `fitKitchen`).

- **Sinks dock into a sink base.** Drop a sink on a base cabinet and it docks: at the centre, or with its hole 3″ in from either side (`sinkBase.keep`), whichever is nearest where it was dropped. The sink's own gap sets how far it sits off the wall. Change Left / Centre / Right on the sink's panel.
- **Sink base width.** A base holding a sink is never narrower than the sink needs (`sinkBaseMin`). It grows to fit when the sink docks, and the units on its right move along with it. It can be made wider but not narrower. **Fit to the sink** takes it back to the minimum.
- **Stretchers.** The base's front and rear stretchers are narrowed over the sink hole, ¼″ clear of it, keeping full width 3″ in from each side. If less than ½″ would be left, the middle is cut out and only the two ends are fitted. The notches are part of each stretcher's CNC outline.
- **Mount.** Every sink is either top mount (drop-in) or bottom mount (undermount), shown on the sink and the countertop. A top-mount hole is ¼″ in from the sink's edge all the way around (`counter.lap`). A bottom-mount hole is the bowl opening, less `counter.reveal` each side. The sink hangs under the countertop.
- **Countertop fit.** A countertop on base cabinets fits them: back to the wall, ⅛″ past each end that isn't against a wall or a tall unit (a range end gets the ⅛″ too), and 1″ past the front of the boxes so the doors stay about ¼″ under. It sits on the cabinets at the shop thickness, ½″ FormX by default.
- **Countertop CNC.** Each countertop gets its own program with FormX's own tool (Shop settings → Countertop CNC), included in the cabinet G-code zip. The sink holes are cut first, bit inside the line. Then the outline, bit outside the line, stepping down each pass.

## Plumbing fixtures with their plumbing mapped (plumbing.js)
A fixture can carry its plumbing points (`plumb` in casework.js, drawn for the as-drawn hand; mirroring flips them).
The first is the **Mirolin Liberty tub-shower 60 × 34 × 88** (Bathroom fixtures: TS5L left hand drain, TS5R right hand),
from Mirolin's TS5L data sheet: 2″ drain 6¾″ from the drain end and 18¼″ from the back, 2½″ overflow, 2¾″ clear under
the tub, 20″ threshold, 16″ bathing well, 6 shelves. Valve 30″, spout 24″ and shower arm 78″ off the floor on the drain
end, in line with the drain, are the usual heights (not on the sheet). The floor opening (8″ × 12″ on the drain) is
typical: check the Mirolin installation guide before cutting.

Placed in a home, it works out the drain's exact point, the floor opening, and the valve wall (which wall, how far along
seen from inside, the heights, ½″ PEX hot and cold), shown on the fixture, on the wall and on P11. The rules, flagged:
· an alcove unit needs a wall at its back and both ends;
· the valve end must be against a wall, and an inside one (no supply pipes in a SIP outside wall: mirror or turn it,
  or fur out a chase);
· no window or door where the valve, spout or shower arm go.
Electrical: no receptacle within 500 mm of any tub or shower (across the floor, same room); hand-placed ones there are
flagged.

### Drain holes follow the fixture (floor cassette)
A placed fixture with a mapped rough-in cuts its drain hole in the interior floor cassette under it (plumbing.js
`withCuts`, used for the 3D floor and the floor layer sheets, like the ceiling lights). Move, turn, mirror or remove the
fixture and the hole goes with it. Mapped: toilets (3″ drain on the standard 12″ rough-in, 4½″ hole for a 4 × 3
flange), the MAAX Biarritz (5″ round on its centre drain, typical) and the Mirolin Liberty (8 × 12 at its drain end,
typical). Typical sizes are marked "typical size, confirm" on the sheet. Flagged: a hole at the cassette's edge or across
a panel joint, and any tub, shower or toilet with no rough-in mapped (its hole isn't cut: mark it on site).

## 📏 Tape (panel builder)
In the panel builder (walls, floors, ceilings, roofs), tap **📏 Tape**, then two points on the drawing. Each tap clicks
onto the nearest corner, edge middle or centre of a window, door, hole, box, pocket or shape (the picked one too), else
onto a panel joint, chase, end, the floor or the top (keeping where you tapped along it), else lands where you tapped.
It shows across, up / down and straight, drawn on the panel and in a readout under it. A third tap starts again; Done
puts it away. Measuring only: nothing moves (to place something at a distance, pick it and use Measure from…).

## Price book and Cost to build
⋯ → **Price book**: what Cubit pays for every product (cost only, no markup), shared by the team (R2
prices/book.json via /api/prices). Products come from the app itself, so the list is always complete: every window
and door, every bought catalogue item (fixtures, sinks, appliances, furniture, fireplace inserts), cabinet sheet
stock, banding, FormX and hardware, the six SIP panel types, every line the shopping list buys (lumber and LVL by
length, EPS, OSB, steel, ACM, screws, ground screws, concrete, seals, SilverBack), labour rates per trade and the
standard hours per job. Editors, admins and anyone given **Prices** in ⋯ → Team (an inventory person: e.g. a User with Prices, who can
keep prices up to date without being able to change homes or libraries) type a cost and it saves on
its own; only the changed prices are sent, so two people can price at once. Each price shows who set it, when, and
what it was. Download the list as a spreadsheet (CSV), change the cost column, upload it back. Salespeople can look.
Sheets → **Cost to build**: the home's quantities × the price book, by group, with every unpriced line in red and a
CSV download.

### Fireplace power (Plug / Hardwired)
The fireplace surround has a **Power** choice: **Plug** puts an appliance receptacle, **Hardwired** a junction box, in
the wall behind the surround, inside the insert's cavity, to one side of the insert and half way up it (on a chase
when one is within reach), noted as a dedicated circuit. It's locked to the fireplace: it moves when the fireplace
moves, changes with Power, and can't be moved or removed by hand (the wall panel shows 🔒 with the fireplace). E11
shows the junction box as J. No wall behind the fireplace → flagged.

### Team homes always open at their latest save
A team home (Purgatory or a customer's) used to open from this device's own copy when it had been open here before:
after someone (or you on another device) saved, the app showed the older copy, and on a device that had lost track of
the version it started from, saving that copy undid the newer save. Now, whenever a team home becomes the one on
screen (the app opening on it, or picked in the Homes list) it's checked against the server (projects.js
`refreshOpen`): nothing unsaved here → the latest save opens; unsaved changes here → they're combined with the latest
save (same-thing conflicts are asked about at Save, as before); no record of the starting version → this device's
copy goes into My Drafts as "(copy from this device)" and the latest save opens. A short message says which.

## Floors 1 to 99 (layout.js · pods.js · build.js)
- **▼ Floor N ▲** beside 2D/3D:
  - ▲ goes one floor past the top of the home to start a new one, up to floor 99. Tapping the name jumps between floor 1 and the top floor.
  - In 3D a floor shows with the floors below it; in 2D it shows on its own.
  - Pods dragged from the tray go onto the floor picked.
- **Every floor stacks like the second:**
  - Each floor sits 116.4″ (`UP`) above the one below, on a single 6½″ SIP floor, with no steel frame.
  - A 1″ EPS pad goes only where a pod touches a pod of the floor right below.
  - A pod has to sit on a pod of the floor right below, can hang over its edge, and can't overlap another pod on its own floor.
- **Posts:** an overhang of 8′ or more gets 8×8 posts down to the ground (screw pile or Sonotube), or onto the roof of the highest pod further down that's in the way. Posts are listed by stock length.
- **Stairs** go from a pod on any floor to the floor right above. The ＋ Stairs button shows on a pod with a pod above it or below it.
- **Sheets:** A12 Main Level, A14 Second Floor, A14.2 Third Floor … (one per floor). The takeoff stage is called "Upper floors".

## Second floor and stairs (layout.js · stairs.js)
- **Floor 1 / Floor 2** button beside 2D/3D. On Floor 2, pods dragged from the tray go upstairs (`lv:1` on the pod). Floor 1 hides the upstairs; Floor 2 shows both.
- An upstairs pod has **no metal frame**. Its floor is one **6.5″ SIP** (`floor-up`, code FU) and it sits **116.4″** (`UP`) above the ground floor. A **1″ EPS pad** goes only where it touches the pod below. The lower pod keeps its full roof.
- Upstairs pods snap to 8′ and can hang over the edge. An overhang of **8′ or more** gets **8×8″ posts** at the ends, flush with the outermost walls, down to a ground screw or a **10″ Sonotube** depending on the foundation. An upstairs pod has to sit on some pod below and can't overlap another upstairs pod.
- **Double-tap a stair** to isolate it.
- **Landings:** each stair shows whether it has a clear 36″ landing at its foot and at its top, either straight on or turned to the side, inside the pod's walls and not over an opening. A new stair is placed where both landings are clear when it can be. A stair can't start over the opening of the stair coming up from below, except a spiral continuing the same column.
- **Next floor up** (stair panel), from the pod a stair arrives in to the floor above, each choice checked for fit and both landings:
  - the same stair right above (a stairwell, or one spiral column);
  - a switchback (turn round on the landing and climb back along the other wall);
  - carry straight on;
  - a U-shaped stair from the landing;
  - the closest start of each kind to where you arrive.
- **Stair kinds** (stairs.js), each a type with its own footprint, openings, 3D parts and plan lines:
  - **Straight:** Shortest / Standard / Comfortable.
  - **U-shaped (switchback):** Standard / Compact. Two 36″ flights side by side (72″, fits in an 8′ pod) with a landing at the turn, about 9′ long instead of 13′.
  - **Crossing winder** (where pods cross, like a pinwheel stack where each floor's pod turns 90° on the one below and they share only an 8′ × 8′ corner): a U with winders that fits inside that crossing. 36″ wide, 16 risers: 2 steps in the lower pod (where there's headroom), 4 to the end wall, 3 winders (30°) round the corner, 1 across the end, 3 winders round, 2 out into the pod above. 99″ × 83″ in plan, opening about 78″ × 84″. It tucks against the end wall. The ceiling and roof below open from the 3rd step on (headroom over the first flight), but the floor above opens only up to the top step: from the last riser the upper floor runs on flush, a level landing (and floor out to a door such as a roof-deck slider). Layers can have different openings (`holesUp` for the floor above). The landing at the top can step off sideways into the upper pod's length. Offered under Next floor up ("Closest start · crossing winder"), so it chains crossing after crossing. Its winders need the building official's OK (NBC 9.8.4.5).
  - **Square spiral:** exactly as drawn in Johnny's Shapr3D model, read out of `Spiral_Stair.step` into `js/stair-spiral.js`: each tread's outline (nosing overlaps, hub cut-outs), the 4″ hubs, the 3″ round post, the base plate and the 43⅜ × 57⅞″ top landing. It's 81¾″ square. Heights are eased from the model's 117¾″ to this build's 116.4″ floor to floor (risers 7.28″ instead of 7.36″). Controls: Quarter turn and Wind the other way (mirrors it). Its winders need the building official's OK.
- **The stair opening goes through every layer in its way:** the lower pod's ceiling and roof panels, the EPS strips and blocks of the ceiling–roof cassette, the 1″ EPS pad between the pods, and the upper pod's floor. The EPS pad on the materials list is less the opening.
- **Stairs**: pick a ground-floor pod → **＋ Stairs**. You get a straight 36″ stair along a long wall, with three legal options (NBC 9.8): Shortest (7⅞″ rise / 10⅛″ run), Standard (~7½ / 10½) and Comfortable (~7 / 11). Tap the stair to slide it, put it on the other wall, turn it round or remove it. The **stair opening** is cut in the lower pod's ceiling and roof and in the upper pod's floor. In 2D and on the sheets it shows as treads with **UP** downstairs and a dashed opening with **DN** upstairs (A12 main floor, A14 second floor). Saved in `MODELS[k].stairs`.
- **Take-off, shopping list and Cost to build**: a Second floor stage with the upstairs SIP floor panels, EPS pad (sq ft and 4 × 8 sheets +10%), 8×8 posts (about 10′ 3½″, cut from 12′ stock), post bases, and a ground screw or a 10″ × 4′ Sonotube with its concrete per post. These lines are always in the price book. (`upstairsTakeoff` in takeoff.js)
- Not done yet: weatherproofing where pods meet, and handrails and guards (the builder supplies these).

## Panel builder: three ways to save (wall-builder.js)
- **Save to this home only** (when opened from a wall of a home):
  - The wall goes into that home only (`MODELS[k].homeWalls`, ids `HW08-1` / `HI08-1`) and onto that wall. Nothing is added to or changed in the library.
  - Saving again writes over the same home wall. Reopening the wall opens that home wall.
  - A Cubit home gets a draft first.
  - Home walls travel with drafts and saved projects. Saving a project never puts them in the library, and a pod with one isn't saved as a library pod.
- **Save over W08-21 in the library:** writes over the library wall it came from (for a home wall, the one it was based on). Asks first when other homes use it; locked homes keep theirs.
- **Save as new library wall:** adds it to the library as a new wall; the old one stays.
- Also fixed: saving a project, or making a draft, now keeps the home's stairs.

## Editing library walls and floors (wall-builder.js · layer-builder.js)
- Every wall and floor/ceiling/roof card in the Library has **Edit**, which opens the panel builder on that one. The library stays open underneath and refreshes when the builder closes.
- A library wall opens as itself, whether it's one of Cubit's own, the team's or this browser's. **Save W08-15** writes over it, so every home using it changes; the server keeps the old version. **Save as new wall** keeps the old one and adds another. After that, Save keeps writing over the one you're on.
- A wall opened from its mirror (`~m`, likewise `~mx/~mz` for layers) is edited as you see it. It's saved back, unmirrored, over the wall it mirrors, and the mirrors are rebuilt.
- A brand-new wall shows **Save to library** until its first save.
- **Saving over asks first** whenever other homes use the wall (or floor/ceiling/roof). It lists the homes that will change (Cubit Homes, Purgatory, customers' homes, drafts) and the **locked** ones that won't. You can save over everywhere, save as new instead, or cancel. It asks once each time the builder is opened.
- **Locked homes never change.** A home that's signed and locked keeps the walls and layers it was locked with (and later, homes in manufacturing, being made, built or archived, once `m.stage` is tracked). (`freeze.js`)
  - When you save over, the version being replaced is kept for each locked home.
  - At start-up, any team wall or layer saved after a home was locked is put back as it was then. It's taken from the copies the home was saved with, else from the server's history (`GET api/walls?asof=<time>&ids=…`, same for layers), else from Cubit's original.
  - The 3D, sheets, CNC and costs of a locked home all use those versions (`FROZEN` in data.js, read by `byId` / `layerById` for the home on screen).
- A name changed in the builder now sticks. The library's rename list used to put the old name back.

## Middle wall handles, length and thickness (midhandles.js · pods.js setPart / turnPart)
- Pick a middle wall and orange handles show on it, in 3D and 2D:
  - **⇄ at each end:** drag to shorten or lengthen that end. It snaps back to the wall it meets ("to the wall"), and to the faces of walls across its run within 3′. Otherwise it snaps to the inch, minimum 12″.
  - **Arrow in the middle:** drag to move it across. It snaps flush with nearby wall faces within 2″, otherwise to the inch.
  - **↻ beside it:** tap for a quarter turn about its middle (across ↔ along), keeping its length where it fits.
  - An outline and a tip show where it'll go; it's set when you lift.
- In the panel:
  - **Length** (typed) and **Keep in place**: which end stays put, either end or the middle. Ends are named by the real compass.
  - Each end shows "to the wall" or how far short it stops, with a **To the wall** button.
  - **Thickness:** 2½ / 3½ / 4½ / 6½″ or typed (1–12″), default 4½″.
- **Open joints and full-height openings count as no wall** (the same rule as the panels: floor to top, no SIP).
  - A middle wall's end runs to the pod's edge there, and the panel says "open".
  - **Continue into Pod N** adds the next pod's own piece on the same line and at the same thickness. Each pod still builds its own piece.
  - A middle wall can be moved right up to (and into) an open joint or a full-height opening. It only keeps 1″ clear of walls that actually have SIP along its length (`partLimits`).
- Stored on the part: `t` (when not 4½), and `e0` / `e1` (its ends in inches along its run in the pod's own frame; none = to the wall). Mirroring a pod flips them; a shortened end is a free end (no notch); the wall body is the same library wall with bigger trims, so doors, the panel builder, sheets and CNC all follow.
