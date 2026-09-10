#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
blender_bin="${BLENDER_BIN:-blender}"

cd "$project_dir"
"$blender_bin" --background --python tools/blender/build_exo_forge.py
for view_name in front side isometric exploded industrial rescue construction; do
  "$blender_bin" --background assets/source/exo-forge-v0.1.blend --python tools/blender/render_fixed_view.py -- "$view_name"
done
python3 tools/validate_glb.py
