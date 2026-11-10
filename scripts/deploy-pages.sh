#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="pages-teachers.yml"
BRANCH="$(git -C "$ROOT" branch --show-current)"

command -v gh >/dev/null || { echo 'GitHub CLI (gh) is required to dispatch the Pages workflow.' >&2; exit 1; }
[[ -n "$BRANCH" ]] || { echo 'Detached HEAD; checkout the deployment branch first.' >&2; exit 1; }

if [[ -n "$(git -C "$ROOT" status --porcelain -- package.json app src public index.html vite.config.ts .github/workflows/pages-teachers.yml)" ]]; then
  echo 'Frontend files or deployment configuration have uncommitted changes. Commit them before deploying.' >&2
  exit 1
fi

REMOTE_HEAD="$(git -C "$ROOT" ls-remote --heads origin "refs/heads/$BRANCH" | awk 'NR==1 {print $1}')"
if [[ -z "$REMOTE_HEAD" ]]; then
  echo "Remote branch origin/$BRANCH was not found. Push the branch before dispatching Pages." >&2
  exit 1
fi
LOCAL_HEAD="$(git -C "$ROOT" rev-parse HEAD)"
[[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]] || {
  echo "Local HEAD ($LOCAL_HEAD) differs from origin/$BRANCH ($REMOTE_HEAD). Push the exact commit before dispatching Pages." >&2
  exit 1
}
gh auth status >/dev/null

echo "Dispatching $WORKFLOW for origin/$BRANCH. GitHub Actions will run verification and publish the Pages artifact."
(cd "$ROOT" && gh workflow run "$WORKFLOW" --ref "$BRANCH")
