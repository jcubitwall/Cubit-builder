"""Cubit Builder - Home Depot Canada as a store catalogue (data/stores.json).

A store catalogue is a short list per Library category of products the team can buy from that store and have
shipped to Cubit (1314 Hwy 325, Blockhouse NS B0J 1E0), to look at and ADOPT into Cubit's own library. More
stores, and more categories per store (rc receptacles, sw switches, appliance …), go in the same file.

Fireplaces, checked on homedepot.ca 2026-11-07: electric only (no venting, no gas line: they suit a SIP pod),
parcel-size and sold online. Sizes and weights are the product pages' "assembled" figures; prices CAD as listed
that day. homedepot.ca doesn't show ship-to-home by postal code without a cart, so each one is `ship: 'check'`:
confirm "Ship to home" for B0J 1E0 at checkout (else pick up at Home Depot Bridgewater).

    python3 tools/stores/home_depot.py      # rewrites data/stores.json
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = lambda sku, brand, model, name, kind, w, h, d, lbs, price, btu=None, watts=None, power=None, recess=False, note='': dict(
    sku=sku, brand=brand, model=model, name=name, kind=kind, w=w, h=h, d=d, lbs=lbs, price=price, btu=btu, watts=watts,
    power=power, recess=recess, note=note, url=f'https://www.homedepot.ca/product/{sku}', ship='check')
FIRE = [
    P('1001352048', 'Dimplex', 'BLF74', 'Dimplex 74" linear wall-mount electric fireplace, black', 'linear', 74.25, 19.5, 7.5, 126, 1699, recess=True,
      note='Surface mount or fully recessed for a flush look.'),
    P('1001837203', 'Huntington Fireplaces', 'EF-HP65', 'Huntington Sparkling Series 65" linear wall-mount electric fireplace, multi-colour flames', 'linear', 64.75, 17, 5.75, 63.8, 1599, recess=True,
      note='Wall mount, or built in.'),
    P('1001491707', 'Dimplex', 'SIL48', 'Dimplex Sierra 48" wall / built-in linear electric fireplace', 'linear', 50.59, 21.65, 7.6, 46.55, None, btu=4777, recess=True,
      note='Wall mount, built in, or on its table-top stand. Price not shown on the page that day.'),
    P('1001972855', 'Real Flame', '5192', 'Real Flame 42" wall-mount or recessed smart landscape electric fireplace insert', 'linear', 41.5, 19.75, 5.5, 49, None, watts=1500, power='plug or hardwired', recess=True,
      note='120 V, 12.6 A. Price not shown on the page that day.'),
    P('1001777701', 'Napoleon', 'NEFB26H', 'Napoleon Cineview 26" built-in wall electric fireplace insert', 'insert', 26, 20.25, 7.75, 37.5, 699, watts=1500, power='plug or hardwired', recess=True),
    P('1001561188', 'Dimplex', 'RBF36-GP', 'Dimplex Revillusion 36" plug-in firebox', 'firebox', 37.17, 26.54, 12.07, 87, 2399, btu=8794, power='plug', recess=True,
      note='Goes into a mantel or a framed opening.'),
    P('1001156640', 'Dimplex', 'DFI2310', 'Dimplex 23" firebox insert with LED log set', 'firebox', 23, 19.5, 10.75, 26, 298, btu=4695, recess=True,
      note='For a 23" mantel opening.'),
    P('1000852078', 'Homestar', 'ZCLOVA20', 'Homestar 20" firebox insert', 'firebox', 20.5, 15.6, 7.05, 17.6, 249.99, btu=4500, watts=1500, power='plug', recess=True),
    P('1000701403', 'Paramount', 'EF-1028-KIT', 'Paramount Ellsworth electric fireplace mantel with 23" insert', 'mantel', 46.5, 40, 13.5, 88.3, 648, btu=4606,
      note='Free-standing mantel; shipping included.'),
    P('1000719541', 'Dimplex', 'DS5629BR', 'Dimplex Traditional 400 sq. ft. electric stove, bronze', 'stove', 25, 26.5, 15.5, 54, 299, btu=4915, power='plug',
      note='Free-standing; plugs into any household outlet.'),
]
STORES = [{
    'id': 'homedepot-ca', 'name': 'Home Depot', 'url': 'https://www.homedepot.ca', 'checked': '2026-11-07',
    'shipTo': '1314 Hwy 325, Blockhouse NS B0J 1E0', 'pickup': 'Home Depot Bridgewater NS',
    'note': 'Only what can be ordered online and shipped to Cubit. Confirm "Ship to home" for B0J 1E0 at checkout; prices as listed that day.',
    'cats': {'fire': FIRE},
}]
if __name__ == '__main__':
    out = os.path.join(ROOT, 'data', 'stores.json')
    json.dump({'stores': STORES}, open(out, 'w'), indent=1)
    print(out, {s['id']: {k: len(v) for k, v in s['cats'].items()} for s in STORES})
