#!/bin/sh
# Re-make the shop's reference panels with js/gcode.js and check every one cuts exactly the same as the real file.
cd "$(dirname "$0")" && mkdir -p out && node rebuild_reference.mjs out || exit 1
fail=0
for f in reference/*.tap; do n=$(basename "$f")
  r=$(python3 simulate.py "out/$n" "$f"); echo "$n  $r"
  echo "$r" | grep -q "'cells_differ': 0," || fail=1
done
[ $fail = 0 ] && echo "ALL MATCH" || { echo "MISMATCH"; exit 1; }
