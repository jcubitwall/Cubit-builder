# STEP import tools

Scripts used to turn a Shapr3D STEP export into Cubit Builder data. They were first run on
`Cubit Kya: Expanse Tanja Leet` (the **Expanse + 1** model) on 2026-10-20.

Needs Python 3 with `cadquery-ocp` (OpenCascade) installed: `pip install cadquery-ocp`.

| Step | Script | What it does |
|---|---|---|
| 1 | `1_read_step.py file.step solids.json` | Reads every solid: name, bounding box, volume. Saves each one to `brep/` |
| 2 | `2_scan_walls.py` | Shoots test rays through each pod wall on a 1″ × 2″ grid to map solid wall vs open |
| 3 | `3_find_openings.py` | Groups the open cells into openings, refines every edge to 1/64″, and classifies each one (window / door / patio / cased opening / vent) from the window and door units it contains |
| 4 | `4_build_app_data.py` | Converts each pod side into app wall slots (exterior parts and 4½″ interior parts) and writes walls + slot picks for `data/walls.json` and `data/models.json` |

What the scripts rely on in the model:
- Bottom sheets (`FRP`) mark each pod's floor outline. The `PODS` table in step 2 is read from them.
- Walls are everything between the top of the floor (10.56″) and the bottom of the ceiling (106.56″), apart from window and door units.
- Window and door units are recognised by body name (`Door`, `Panorama Proto`, `Kitchen`, `Living`, `Frame`).
- Plugs, switches and pot lights are not read yet. The Expanse file had none modelled. Name them `PLUG`, `SWITCH` and `POTLIGHT` in Shapr3D and they can be added.

Axes: app plan x = STEP y and app plan z = STEP x, a proper rotation, so nothing is mirrored and clockwise stays clockwise.
