# STEP import

One command turns a Shapr3D STEP export of a home into library items plus a shared project:

```
pip install cadquery-ocp numpy
python3 tools/step-import/import_step.py  "home.step"  --name "Customer · Model"  [--id customer-model]  [--from expanse]  [--repo .]
```

What it does:
1. **Finds the pods** from the floor's bottom sheets (FRP). Each touching group of sheets is one pod, with sizes rounded to 8′, 16′ or 24′. The pods' long axis becomes the app's x axis, using a proper rotation so nothing is mirrored.
2. **Scans every wall** of every pod with test rays on a 1″ × 2″ grid, then refines each opening edge to 1/64″. Openings are classified from the units inside them (`Door`, `Panorama Proto`, `Kitchen`, `Living`, `Frame`, `Window`): window, door, patio, cased opening (big, no unit), interior door (≤ 50″ wide and floor to < 90″), or vent (small). Each pod side is split into exterior and interior parts exactly as the app does.
3. **Scans each pod's four horizontal layers** with vertical rays on a 2″ grid, for panel joints and holes:

   | Layer | Height above floor bottom |
   |---|---|
   | exterior floor | 0–4.6″ |
   | interior floor | 6.08–10.56″ |
   | interior ceiling | 106.6–113.07″ |
   | roof | 113.07–119.55″ |
4. **Adds only unique items to the library.** A wall or layer that matches an existing one within 1/8″ reuses it. New walls get ids like `W24-03` (24′ exterior) or `I08-02` (8′ interior). New layers get `FE`, `FI`, `CI` or `RF` plus length, e.g. `CI24-01`.
5. **Saves the home as a shared project** in `data/projects.json`. Its slot picks point at the library items.

Not read yet: plugs, switches and pot lights. When they're modelled, name them `PLUG`, `SWITCH` and `POTLIGHT`.

It takes about 30 seconds for a 5-pod home.
