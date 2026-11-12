#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo '== Git status =='
git status --short
echo '== Frontend quality =='
npm run verify
echo '== Backend quality =='
npm run verify:backend
echo '== API and Playwright end-to-end =='
npm run test:e2e:all
echo '== Git whitespace check =='
git diff --check
echo '== Release verification PASSED =='
