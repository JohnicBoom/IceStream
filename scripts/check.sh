#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --test tests/*.test.mjs
omarchy plugin validate .
QMLLINT="${QMLLINT:-/usr/lib/qt6/bin/qmllint}"
"$QMLLINT" -I "${OMARCHY_PATH:-/usr/share/omarchy}/shell" ui/*.qml
