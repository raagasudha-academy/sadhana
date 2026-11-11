#!/usr/bin/env python3
"""Strict read-only retirement readiness check. NEVER deletes or updates tables."""
import argparse,json,pathlib,sys
p=argparse.ArgumentParser();p.add_argument('--report',required=True,help='Existing sadhana-legacy-retirement-report.json');p.add_argument('--root',default='.');a=p.parse_args()
path=pathlib.Path(a.report);data=json.loads(path.read_text());root=pathlib.Path(a.root)
print('=== RETIREMENT READINESS ===')
print('Inventory JSON:',path)
print('Top-level report keys:',', '.join(sorted(data)) if isinstance(data,dict) else '<not a dict>')
# The report is inventory, not a certificate. Fail closed absent additional independent evidence.
reasons=['Static source and environment references are not sufficient evidence of runtime isolation.', 'No restored-backup test evidence has been supplied.', 'A complete authenticated, role-scoped API regression gate has not been run.', 'Isolated E2E Lambda still references sadhana-dev-main and is not configured for final mode.']
for r in reasons: print('BLOCKED:',r)
print('RESULT: NO LEGACY DELETION AUTHORISED')
sys.exit(2)
