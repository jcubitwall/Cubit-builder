# Cubit Builder

A web app for designing Cubit pod homes wall by wall, then producing what the shop and the site crew need to build them.

**Live app:** https://jcubitwall.github.io/Cubit-builder/ (once GitHub Pages is switched on, see below)

## What it does

- **Pick a home model:** Life, Nest, Cove, Panorama, Four-pod and **Expanse + 1**, built from 8×8, 8×16 and 8×24 pods with a 5/8″ space at every joint. Expanse + 1 was scanned straight from the Shapr3D STEP file, with every opening measured.
- **Add pods:** open *Pods in this home · add a pod* in the sidebar. Pick a size and choose which pod and which wall to put it beside. Your layout is saved in your browser, and *Copy layout code* gives the text to paste into `data/models.json`.
- **Swap any wall:** click a wall in 3D and choose another option of the same length. Exterior walls are 6½″. Where pods join, **each pod keeps its own 4½″ interior wall**.
- **Wall letters:** every pod's walls are **A, B, C, D, going clockwise seen from above, starting at the wall with a door**. The app picks the door wall in this order: an exterior door first, then a patio door, then an interior door. If it picks the wrong one, click the wall and press **Make this Wall A**. A side that is part exterior and part interior keeps one letter, numbered clockwise (B1, B2).
- **Exploded view:** walls, interior walls and roof pull apart, and the house lifts off its ground screws.
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

All walls are in **`data/walls.json`**, one wall per line. Edit that file on GitHub, commit, and the app picks up the change. Home layouts are in **`data/models.json`**.

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
tools/step-import/  scripts that turn a Shapr3D STEP file into walls and a model
```

There's no build step: it is plain HTML, CSS and JavaScript modules. To run it on your own computer, start any local web server in this folder (for example `python3 -m http.server`) and open http://localhost:8000. Double-clicking `index.html` won't work, because browsers block the data files when a page is opened that way.

## Importing a home from Shapr3D

Export the whole home as **STEP** (inches or mm are both fine). The scripts in `tools/step-import/` read every solid, scan each pod wall with test rays to find its thickness and every opening, and write the walls and the model into the data files. See that folder's README.

## Next up

- Read plugs, switches and pot lights from STEP files (name the bodies `PLUG`, `SWITCH`, `POTLIGHT`).
- Floor and ceiling panel sheets (Fe / Fi / Re / Ri), including pot lights.
- A shared wall library and saved homes for the whole team.
- PDF export for the wall assembly sheets.
- The rule for corners where three or four pods meet a single screw.
