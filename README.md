# Cubit Builder

A web app for designing Cubit pod homes wall by wall, then producing what the shop and the site crew need to build them.

**Live app:** https://jcubitwall.github.io/Cubit-builder/ (once GitHub Pages is switched on, see below)

## What it does

- **Pick a home model:** Life, Nest, Cove, Panorama, and **Expanse** (two 24′ pods with two 16′ pods on the end), built from 8×8, 8×16 and 8×24 pods with a 5/8″ space at every joint. The Tanja Leet *Expanse + 1* (5 pods) is a shared project, scanned straight from the Shapr3D STEP file with every opening measured.
- **Add pods:** open *Pods in this home · add a pod* in the sidebar. Pick a size and choose which pod and which wall to put it beside. Your layout is saved in your browser, and *Copy layout code* gives the text to paste into `data/models.json`.
- **Swap any wall, floor or ceiling:** click it in 3D, or in the list, and choose another option from the library. Each pod has its walls plus four layers: exterior floor, interior floor, interior ceiling and roof.
- **The library only holds real scanned parts.** Every imported STEP file adds its unique walls and layers. Where a home needs a size that hasn't been scanned yet, the app shows a plain placeholder (marked ⚠ on walls). Exterior walls are 6½″. Where pods join, **each pod keeps its own 4½″ interior wall**.
- **Long and short walls:** the long walls (B and D) always run the full pod length. The short end walls (A and C) fit between them, so a short wall is 96″ minus the two long walls' thickness: 83″ between two 6½″ walls, 85″ when one of them is a 4½″ interior wall.
- **Panels:** 4′ × 8′ SIPs always start with a full panel at panel 1 (the left end seen from the interior). The last panel is cut to fit, and the sheets and labels show its width.
- **Wall letters:** every pod's walls are **A, B, C, D, going clockwise seen from above. Wall A is always a short end wall: the end with the door**. The app picks the end in this order: an exterior door first, then a patio door, then an interior door. If it picks the wrong end, click the other short wall and press **Make this Wall A**. A side that is part exterior and part interior keeps one letter, numbered clockwise (B1, B2).
- **Exploded view:** walls, interior walls and roof pull apart, and the house lifts off its ground screws.
- **Projects:** press **Projects** to save what's on screen under a name, for example *Tanja Leet · Expanse + 1*. A project keeps its own layout (including pods you added), every wall choice, which wall is A on each pod, which side faces the assemblers on each wall, and the screw inset. Projects are saved in your browser. **Export** makes a file you can send to someone, and projects listed in `data/projects.json` show up for everyone (marked *shared*).
- **Panel labels, cut & stack (ShopSabre):** every 4×8 panel gets a code: pod number + wall letter + panel number, e.g. **3B-4** = Pod 3, Wall B, panel 4.
  - **Panel numbers stay with the panel.** Panel 1 is always the left end seen from the interior (side A on a wall between pods).
  - **Assembly always runs left → right** as the assemblers see the wall. For each wall, choose which side faces the assemblers. Interior up gives 1, 2, 3 … 6; exterior up gives 6, 5 … 1.
  - **Stacking:** each wall's panels are stacked with the first one needed on top.
  - **Flipping:** box cut-outs that don't go all the way through have to face up on the CNC. If that face isn't the face the assemblers need up, the panel is marked **FLIP before stacking**. A panel with cut-outs on both faces is marked **TWO-SIDED**.
  - **Labels PDF:** a cut & stack list, then one 4″ × 2″ label per panel (Avery 5163 / 8163). Each label shows the code, its stack position, which face goes up, the CNC face, any flip warning, and a small strip showing where the panel sits in the wall.
- **Wall assembly sheets:** one per wall. Flip between the front (interior) and back (exterior) face, and number the 4×8 SIP panels 1→6 or reversed. Each sheet has opening sizes, plug and switch locations, and a 3D view of the panels pulled apart.
- **Foundation sheet:** a true plan seen from above, with every ground screw located. Where pods meet they share one row of screws, with the offset bracket turned out under the next pod. It includes chain dimensions, diagonals for squaring, and a **Download PDF** button to email to the site crew.

## Pod facts the app uses

| | |
|---|---|
| Pod outside sizes | exactly 8×8, 8×16, 8×24 ft |
| Space between pods | 5/8″ |
| Floor | 10¼″ total: two SIP layers + air gap inside a 9¼″ LVL rim |
| Walls | 96″ clear inside height; exterior 6½″, interior 4½″ |
| Ceiling | 12⅞″ total: two SIP layers, OSB top and bottom, 11⅞″ LVL rim |
| Panels | 4′ × 8′ SIP |
| Ground screws | just inside the floor edge, no more than 8′ apart (inset is set on the foundation sheet, default 6″) |

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

## Switching on GitHub Pages (one time)

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
js/main.js          start-up and toolbar
js/config.js        pod dimensions and constants
js/data.js          loads the JSON data
js/layout.js        wall slots per home, wall letters, 5/8″ gaps, ground-screw layout
js/state.js         current selections (saved in the browser)
js/panels.js        4×8 panel split, numbering, thumbnails
js/scene3d.js       3D view (three.js)
js/sidebar.js       model list, wall options, add-a-pod editor, wall upload
js/sheets.js        wall assembly sheets
js/foundation.js    foundation sheet + PDF
js/labels.js        panel codes, assembly order, stacking, CNC flips, label PDF
js/projects.js      saving / opening named projects (+ projects-ui.js for the dialog)
tools/step-import/  scripts that turn a Shapr3D STEP file into walls and a model
```

There's no build step: it is plain HTML, CSS and JavaScript modules. To run it on your own computer, start any local web server in this folder (for example `python3 -m http.server`) and open http://localhost:8000. Double-clicking `index.html` won't work, because browsers block the data files when a page is opened that way.

## Importing a home from Shapr3D

Export the whole home as **STEP**. `tools/step-import/import_step.py` finds the pods, scans every wall and every floor and ceiling layer, adds the unique ones to the library (`data/walls.json`, `data/layers.json`), and saves the home as a shared project. See that folder's README.

## Next up

- Read plugs, switches and pot lights from STEP files (name the bodies `PLUG`, `SWITCH`, `POTLIGHT`).
- Floor and ceiling panel sheets (Fe / Fi / Re / Ri), including pot lights.
- A shared wall library and saved homes for the whole team.
- PDF export for the wall assembly sheets.
- The rule for corners where three or four pods meet a single screw.
