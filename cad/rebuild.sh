#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
python_bin="$project_dir/.venv-cad/bin/python"

if [[ ! -x "$python_bin" ]]; then
  echo "Missing .venv-cad. Follow cad/README.zh-CN.md first." >&2
  exit 2
fi

cd "$project_dir"
exec "$python_bin" cad/build_cad.py
