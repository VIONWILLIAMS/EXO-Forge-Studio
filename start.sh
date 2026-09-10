#!/usr/bin/env bash
# Installs only into this checkout. No sudo, global packages or shell-profile edits.
set -euo pipefail
EXO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$EXO_ROOT"
EXO_VERSION="$(tr -d '\r\n' < scripts/node-version.txt)"
EXO_NODE=""
EXO_NPM_CLI=""

# Use a compatible existing Node/npm pair when both can actually execute.
if [ "${EXO_USE_LOCAL_NODE:-0}" != 1 ] && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  if node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
    EXO_CANDIDATE="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$(command -v npm)" 2>/dev/null || true)"
    if [ -n "$EXO_CANDIDATE" ] && node "$EXO_CANDIDATE" --version >/dev/null 2>&1; then
      EXO_NODE="$(command -v node)"
      EXO_NPM_CLI="$EXO_CANDIDATE"
    fi
  fi
fi

if [ -z "$EXO_NODE" ]; then
  case "$(uname -s)" in
    Darwin) EXO_OS=darwin ;;
    Linux) EXO_OS=linux ;;
    *) echo 'Use start.ps1 on Windows; start.sh supports macOS and Linux.' >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) EXO_ARCH=arm64 ;;
    x86_64|amd64) EXO_ARCH=x64 ;;
    *) echo 'Automatic Node installation supports arm64 and x64.' >&2; exit 1 ;;
  esac
  EXO_NAME="node-v${EXO_VERSION}-${EXO_OS}-${EXO_ARCH}"
  EXO_RUNTIME="$EXO_ROOT/.local/$EXO_NAME"
  EXO_NODE="$EXO_RUNTIME/bin/node"
  EXO_NPM_CLI="$EXO_RUNTIME/lib/node_modules/npm/bin/npm-cli.js"
  if ! "$EXO_NODE" "$EXO_NPM_CLI" --version >/dev/null 2>&1; then
    for EXO_TOOL in curl tar awk; do
      command -v "$EXO_TOOL" >/dev/null 2>&1 || { echo "Required OS tool missing: $EXO_TOOL" >&2; exit 1; }
    done
    mkdir -p "$EXO_ROOT/.local"
    EXO_TEMP="$(mktemp -d "$EXO_ROOT/.local/node-download.XXXXXX")"
    trap 'rm -rf -- "$EXO_TEMP"' EXIT
    EXO_ARCHIVE="$EXO_NAME.tar.gz"
    echo "Installing project-local Node.js $EXO_VERSION / 正在安装项目独立运行环境…"
    curl --fail --location --show-error --retry 3 --connect-timeout 20 --max-time 600 \
      "https://nodejs.org/dist/v$EXO_VERSION/$EXO_ARCHIVE" -o "$EXO_TEMP/$EXO_ARCHIVE"
    EXO_EXPECTED="$(awk -v name="$EXO_ARCHIVE" '$2 == name {print $1}' scripts/node-sha256.txt)"
    if command -v shasum >/dev/null 2>&1; then
      EXO_ACTUAL="$(shasum -a 256 "$EXO_TEMP/$EXO_ARCHIVE" | awk '{print $1}')"
    elif command -v sha256sum >/dev/null 2>&1; then
      EXO_ACTUAL="$(sha256sum "$EXO_TEMP/$EXO_ARCHIVE" | awk '{print $1}')"
    else
      echo 'Install shasum or sha256sum to verify the Node download.' >&2; exit 1
    fi
    [ -n "$EXO_EXPECTED" ] && [ "$EXO_ACTUAL" = "$EXO_EXPECTED" ] || { echo 'Node archive checksum mismatch; download was not installed.' >&2; exit 1; }
    tar -xzf "$EXO_TEMP/$EXO_ARCHIVE" -C "$EXO_TEMP"
    # Only replace a broken, generated runtime; project sources are never touched.
    rm -rf -- "$EXO_RUNTIME"
    mv "$EXO_TEMP/$EXO_NAME" "$EXO_RUNTIME"
    rm -rf -- "$EXO_TEMP"
    trap - EXIT
  fi
fi

export EXO_NPM_CLI
export PATH="$(dirname -- "$EXO_NODE"):$PATH"
exec "$EXO_NODE" "$EXO_ROOT/scripts/setup.mjs" "$@"
