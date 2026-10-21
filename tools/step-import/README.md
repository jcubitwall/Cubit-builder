# STEP import

One command turns a Shapr3D STEP export of a home into library items plus a shared project:

```
pip install cadquery-ocp numpy
python3 tools/step-import/import_step.py  "home.step"  --name "Customer · Model"  [--id customer-model]  [--from expanse]  [--repo .]
```

Kinds: `--kind home` (default) is a whole home saved as a shared project. `--kind pod` is one pod that only feeds the libraries. `--kind wall` is one upright wall added to the wall library (see `wall_import.py`). Admins can also upload from the app, and the scan then runs in the *Import STEP* GitHub Action (`run_job.py`).

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
6. **Adds each unique pod to the pod library** (`data/pods.json`, via `pods_lib.py`). A pod is its type plus its walls and layers in its own frame. Each wall stretch is stored by side, by the distance `from` the left end of that side seen from outside, and by length and type. New pods get ids like `L24-05` or `P16-02`.

To rebuild `data/pods.json` from the shared projects without scanning again, run `python3 -I tools/step-import/pods_lib.py --repo .`

**Corner notches.** Every pod corner has a 1¾″ × 1¾″ steel spine notch, full height. The app always draws it, so it doesn't come from the scan. In the Expanse + 1 file it measured 1.70–1.79″ at wall height on every corner. At floor and ceiling height some corners had it and some didn't.

Not read yet: plugs, switches and pot lights. When they're modelled, name them `PLUG`, `SWITCH` and `POTLIGHT`.

It takes about 30 seconds for a 5-pod home.
