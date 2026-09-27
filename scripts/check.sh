#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --test tests/*.test.mjs
omarchy plugin validate .
QMLLINT="${QMLLINT:-/usr/lib/qt6/bin/qmllint}"
SHELL_DIR="${OMARCHY_PATH:-/usr/share/omarchy}/shell"
# The shell resolves `import qs.Commons` / `qs.Ui` against its root, so give
# qmllint a temporary import dir where `qs` points at that root. (The symlink
# lives in /tmp; plugin folders must not contain symlinks.)
lintroot=$(mktemp -d)
trap 'rm -rf "$lintroot"' EXIT
ln -s "$SHELL_DIR" "$lintroot/qs"
# Remaining missing-property warnings come from Omarchy's QtObject-typed
# members (bar, Style.font, Color.popups, Loader.item), not plugin code.
"$QMLLINT" -I "$lintroot" ui/*.qml
