#!/usr/bin/env python3
"""Safe local-only audited CSS filename renamer. Dry run unless --apply."""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess
import sys

# Replaced at package creation time with the audited CSS hashes.
MAPPING = {'accessV1274.css': {'new': 'accountAccessControls.css', 'sha256': '15acf0d3b2a22c32ee9d1721038c150ae2b35cb051eda84713636a0971a35cf5'}, 'compactHeaderV1281.css': {'new': 'studentCompactHeader.css', 'sha256': '35a0586772851f8845a3e113bda0146cd291a61f2a8bb25f6bb191262b82a6e2'}, 'familyCardsV096.css': {'new': 'registrationFamilyCards.css', 'sha256': 'afdcf6689baef0d781d389e9d83f3e39d1977eb5629cbafa04a69e56535fa568'}, 'familyDashboardV1.css': {'new': 'studentFamilyDashboard.css', 'sha256': '617cedec51540cb6317ca52b4dd0969bf7afbda590810e00e9f5e5ac02dc6dd9'}, 'homeworkConfirmV1283.css': {'new': 'homeworkConfirmation.css', 'sha256': '5054bacebffbb53eb5a0b47a28fb683799de0feda4781d27eb10e5ac8afeb01b'}, 'homeworkV1278.css': {'new': 'homeworkPalette.css', 'sha256': '8fa449b7e335be07c54fa2e2df5a71e57f14c3184604b66503c2d4fa01f80846'}, 'learningUXV1276.css': {'new': 'learningExperience.css', 'sha256': 'fbd2bdb7a16a9171f8f6b9c114b20640939063b1210b09aab0f0736c126d2284'}, 'rollRequestV1275.css': {'new': 'studentAccessRequest.css', 'sha256': 'a98f8cb640f5ebbed4a47fa58909698f1df7d9c4183fd585e2b3ec4a1c1d7713'}, 'studentNavigationV1277.css': {'new': 'studentNavigationLayout.css', 'sha256': '71a715e0778e0a972c8652b8b9b227e238c25d7b740872f4f48e1ddc71e5d783'}}


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    repo = Path(git('rev-parse', '--show-toplevel').stdout.strip())
    if Path.cwd().resolve() != repo.resolve():
        sys.exit('Run from the repository root: cd ~/Dev/sadhana')
    if git('status', '--porcelain').stdout.strip():
        # The installer itself is untracked by design; allow that one file only.
        statuses = git('status', '--porcelain').stdout.splitlines()
        if any(line[3:] != 'scripts/renameStudentStyles.py' for line in statuses):
            sys.exit('Working tree must be clean apart from this installer. Commit or stash other changes first.')

    tracked = [x for x in git('ls-files', '-z').stdout.split('\x00') if x]
    eligible = {'.ts', '.tsx', '.css', '.js', '.jsx', '.mjs', '.html', '.json'}
    changes = {}
    pattern_cache = {}
    for old in MAPPING:
        pattern_cache[old] = re.compile(r"(['\"])(?P<dir>\.{1,2}/(?:[^'\"\n]*/)?)(?P<file>" + re.escape(old) + r")\1")

    for rel in tracked:
        path = repo / rel
        if not path.is_file() or path.suffix not in eligible:
            continue
        try:
            before = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        after = before
        for old, value in MAPPING.items():
            after = pattern_cache[old].sub(lambda match: match.group(1) + match.group('dir') + value['new'] + match.group(1), after)
        if after != before:
            changes[rel] = after

    for old, info in MAPPING.items():
        source = repo / 'src' / old
        target = repo / 'src' / info['new']
        if not source.is_file() or target.exists():
            sys.exit(f'Missing source or occupied target: {source} -> {target}')
        if hashlib.sha256(source.read_bytes()).hexdigest() != info['sha256']:
            sys.exit(f'Audited CSS has changed: {source}. Stop and re-audit.')

    # Check for unhandled references in tracked source/asset files; don't touch history/docs.
    for rel in tracked:
        path = repo / rel
        if not path.is_file() or path.suffix not in eligible or path.name in MAPPING:
            continue
        try:
            before = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        after = changes.get(rel, before)
        for old in MAPPING:
            if old in after:
                sys.exit(f'Unresolved stylesheet reference {old} in {rel}; aborting safely.')

    print('Preflight passed: 9 audited CSS files; reference edits:', ', '.join(sorted(changes)))
    if not args.apply:
        print('Dry run only. Run with --apply to rename locally.')
        return
    for old, info in MAPPING.items():
        subprocess.run(['git', 'mv', f'src/{old}', f"src/{info['new']}"], cwd=repo, check=True)
    for rel, after in changes.items():
        (repo / rel).write_text(after, encoding='utf-8')
    print('Applied. Run npm run verify and review git diff --stat before commit.')


if __name__ == '__main__':
    main()
