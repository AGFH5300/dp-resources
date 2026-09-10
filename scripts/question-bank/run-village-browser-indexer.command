#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. DP Resources expects Node 24+."
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Node 24+ is required. Current: $(node --version)"
  exit 1
fi

echo ""
echo "DP Resources — PirateIB Village Chromium Indexer"
echo ""
echo "A separate temporary Chrome/Chromium window will open."
echo "Use Village normally. The terminal will show chunk/question coverage."
echo "When you are satisfied with coverage, return here and press ENTER."
echo ""

node scripts/question-bank/capture-village-browser.mjs "$@"
