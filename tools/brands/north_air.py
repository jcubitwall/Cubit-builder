"""Cubit Builder - the North Air catalogue (data/brands.json).

Scanned from https://northairwindow.com on 2026-11-07. The site lists the window styles with their features,
colours, glass, grilles, hardware and CSA A440 ratings, but publishes NO sizes, size charts or spec sheets (its
brochure links are broken). So each style gets a grid of common sizes, every one marked `confirm: true` until
North Air confirms it: the team adopts the ones Cubit uses into the Cubit library and edits them to the real size.

Rough opening rule (from Cubit's three North-Air uploads): RSO = unit + 1 1/4" wide and high; brickmould =
unit + 3". Frame depth 4 1/2" (the uploads).

    python3 tools/brands/north_air.py      # rewrites data/brands.json
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = 'https://northairwindow.com'
R = lambda a, b, s: list(range(a, b + 1, s))

COMMON = ['Low-E glass', 'Sealed units with S-class super spacer', 'Fusion-welded sashes and frames', 'Triple weather-stripping']
SWING_HW = ['Fold-down handles', 'Multi-point locking', 'Heavy-duty locking handles (white or black, optional)', 'E-Z Screen full screens']
SLIDE_HW = ['Recessed finger latches', 'Cam locks (die-cast zinc, alignment lugs)', 'Self-locking latch (optional)', 'Full screens with corner pull tabs']
CASE_RATE = [
    {'grilles': False, 'glass': 2, 'ER': 34, 'PG': 70, 'zones': 3, 'air': 'A3', 'water': 'B7', 'wind': 'C5'},
    {'grilles': True,  'glass': 2, 'ER': 31, 'PG': 70, 'zones': None, 'air': 'A3', 'water': 'B7', 'wind': 'C5'},
    {'grilles': False, 'glass': 3, 'ER': 40, 'PG': 70, 'zones': 3, 'air': 'A3', 'water': 'B7', 'wind': 'C5'},
    {'grilles': True,  'glass': 3, 'ER': 37, 'PG': 70, 'zones': 3, 'air': 'A3', 'water': 'B7', 'wind': 'C5'}]
AWN_RATE = [dict(r) for r in CASE_RATE]; AWN_RATE[2]['ER'] = 39
HUNG_RATE = [
    {'grilles': False, 'glass': 2, 'ER': 35, 'PG': 70, 'zones': 3, 'air': 'A3', 'water': 'B7', 'wind': 'C5'},
    {'grilles': True,  'glass': 2, 'ER': 32, 'PG': 70, 'zones': None, 'air': 'A3', 'water': 'B7', 'wind': 'C5'}]
LIFT_RATE = [
    {'grilles': False, 'glass': 2, 'ER': 34, 'PG': 50, 'zones': None, 'air': 'A2', 'water': 'B4', 'wind': 'C3'},
    {'grilles': True,  'glass': 2, 'ER': 29, 'PG': 50, 'zones': None, 'air': 'A2', 'water': 'B4', 'wind': 'C3'}]

STYLES = [
    # key, app type, name, code, page, widths, heights, features, hardware, ratings, note
    ('casement', 'casement', 'Casement', 'CA', '/windows/casement-windows/', R(18, 36, 6), R(24, 72, 6),
     COMMON + ['Exterior bevelled frame'], SWING_HW, CASE_RATE, 'Hinged on one side, opens out with a crank.'),
    ('awning', 'awning', 'Awning', 'AW', '/windows/awning-windows/', R(24, 48, 6), R(18, 36, 6),
     COMMON + ['Exterior bevelled frame', 'Contoured interior glazing stops'], SWING_HW, AWN_RATE, 'Hinged at the top; often above or below other windows, or over doors.'),
    ('single-hung', 'single', 'Single hung tilt', 'SH', '/windows/single-hung-tilt-windows/', R(24, 42, 6), R(36, 72, 6),
     COMMON + ['Bottom sash slides up and tilts in for cleaning'], SLIDE_HW, HUNG_RATE, 'Lower sash slides up; upper sash fixed.'),
    ('double-hung', 'double', 'Double hung tilt', 'DH', '/windows/double-hung-tilt-windows/', R(24, 42, 6), R(36, 72, 6),
     COMMON + ['Both sashes slide and tilt in for cleaning'], SLIDE_HW, HUNG_RATE, 'Both sashes slide; both tilt in.'),
    ('slider', 'slider', 'Single slider', 'SL', '/windows/single-slider-windows/', R(36, 72, 6), R(24, 60, 6),
     COMMON, SLIDE_HW, HUNG_RATE, 'One panel slides sideways, the other is fixed.'),
    ('slider-3', 'slider3', '3-lite end vent slider', 'S3', '/windows/3-lite-slider-windows/', R(72, 108, 12), R(36, 60, 6),
     COMMON + ['Both end vents slide and tilt in for cleaning'], SLIDE_HW, [], 'Fixed centre lite with a sliding vent at each end.'),
    ('double-lift', 'dslider', 'Double lift slider', 'DL', '/windows/double-lift-slider-windows/', R(48, 72, 6), R(36, 60, 6),
     COMMON + ['Both sashes slide, tilt in and lift out from inside'], SLIDE_HW, LIFT_RATE, 'Both panels slide; large glass area.'),
    ('picture', 'picture', 'Picture', 'PI', '/windows/picture-windows/', R(24, 96, 12), R(24, 72, 12),
     COMMON, [], [], 'Fixed glass, no sash.'),
    ('bay', 'bay', 'Bay', 'BY', '/windows/bay-windows/', R(72, 120, 12), R(48, 60, 12),
     COMMON + ['Projects out at 30 deg or 45 deg', 'Oak veneer head and seat boards'], [], [], 'Projects out from the wall; any combination of units. Shown here by its opening in the wall.'),
    ('bow', 'bow', 'Bow', 'BW', '/windows/bow-windows/', R(72, 120, 12), R(48, 60, 12),
     COMMON + ['Curved projection of several units', 'Oak veneer head and seat boards'], [], [], 'A gentle curve of several units. Shown here by its opening in the wall.'),
]
# windows only on the site; the doors Cubit already uses (uploads) are filed under the brand in units.json
BRAND = {
    'id': 'north-air', 'name': 'North Air', 'url': URL, 'scanned': '2026-11-07',
    'note': 'Sizes are a grid of common sizes, not from North Air (the site publishes none). Confirm with North Air before ordering.',
    'rso': {'dw': 1.25, 'dh': 1.25}, 'bm': {'dw': 3, 'dh': 3}, 'd': 4.5,
    'match': ['north-air', 'north air', 'northair'],
    'options': {
        'exterior': ['White', 'Cream/Ivory', 'Cocoa', 'Sable', 'Sandalwood', 'Espresso', 'Hickory', 'Anthracite Grey'],
        'interior': ['White', 'Kolonial Oak', 'Stainable/Paintable Pine', 'Espresso (with Espresso exterior only)', 'Light Oak', 'Walnut'],
        'glass': ['Double glazed, Low-E', 'Triple glazed, Low-E'],
        'grilles': ['None', 'Regular squares', 'Prairie', 'Ladder'],
        'grilleBars': ['5/16" flat (white, pewter)', '5/16" x 5/8" flat contour (brass, pewter)', '7/8" x 2" simulated divided lites'],
    },
    'also': ['Custom shapes (custom windows page)', 'North Star patio door (brochure only on the site)'],
    'styles': [{'key': k, 'type': t, 'name': n, 'code': c, 'url': URL + u, 'w': w, 'h': h, 'features': f, 'hardware': hw, 'ratings': rt, 'note': nt}
               for (k, t, n, c, u, w, h, f, hw, rt, nt) in STYLES],
}
if __name__ == '__main__':
    out = os.path.join(ROOT, 'data', 'brands.json')
    json.dump({'brands': [BRAND]}, open(out, 'w'), indent=1)
    n = sum(len(s['w']) * len(s['h']) for s in BRAND['styles'])
    print(f'{out}: North Air, {len(STYLES)} styles, {n} sizes')
