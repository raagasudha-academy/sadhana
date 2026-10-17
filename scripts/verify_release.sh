#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo '== Git status =='
git status --short
echo '== Frontend quality =='
npm run verify
echo '== Backend quality =='
(cd backend && npm run check && npm test)
echo '== Playwright E2E =='
npm run test:e2e
echo '== Git whitespace check =='
git diff --check
echo '== Release verification PASSED =='
