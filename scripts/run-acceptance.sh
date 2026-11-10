#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
printf '\n=== Backend authorization / homework regression suite ===\n'
(cd backend && npm run check)
printf '\n=== Frontend type, unit, lint and build ===\n'
npm run verify
printf '\n=== Local browser E2E (includes responsive viewports) ===\n'
npm run test:e2e
printf '\n=== PASS: Local suites complete; NOT a live homework/timetable/email acceptance ===\n'
