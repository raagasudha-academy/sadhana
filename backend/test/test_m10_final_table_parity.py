"""Offline unit tests for read-only final-name audit reconciliation."""
import importlib.util
from pathlib import Path
import unittest

script = Path(__file__).resolve().parents[1] / 'scripts/m10FinalTableParity.py'
spec = importlib.util.spec_from_file_location('m10_final_table_parity', script)
parity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parity)


class AuditParityTests(unittest.TestCase):
    def test_restore_origin_reports_match(self):
        src = {'TableArn': 'arn:aws:dynamodb:us-east-1:123:table/source'}
        dst = {'RestoreSummary': {'SourceTableArn': src['TableArn']}}
        self.assertEqual(parity.restore_origin_status(src, dst), 'MATCH')

    def test_restore_origin_missing_is_not_a_false_mismatch(self):
        src = {'TableArn': 'arn:aws:dynamodb:us-east-1:123:table/source'}
        self.assertEqual(parity.restore_origin_status(src, {}), 'UNAVAILABLE')
        self.assertEqual(parity.restore_origin_status(src, {'RestoreSummary': {}}), 'UNAVAILABLE')

    def test_restore_origin_explicit_conflict_is_blocker(self):
        src = {'TableArn': 'arn:aws:dynamodb:us-east-1:123:table/source'}
        dst = {'RestoreSummary': {'SourceTableArn': 'arn:aws:dynamodb:us-east-1:123:table/other'}}
        self.assertEqual(parity.restore_origin_status(src, dst), 'MISMATCH')

    def test_string_sets_are_order_independent(self):
        a = {'sources': {'SS': ['b', 'a']}, 'history': {'M': {'flags': {'SS': ['x', 'y']}}}}
        b = {'sources': {'SS': ['a', 'b']}, 'history': {'M': {'flags': {'SS': ['y', 'x']}}}}
        self.assertEqual(parity.normalized(a), parity.normalized(b))

    def test_audit_merge_deduplicates_legacy_keys_without_losing_payload(self):
        original = {'PK': {'S': 'AUDIT#raaga'}, 'SK': {'S': 'RECORD#x'}, 'at': {'S': '2026-11-05T12:00:00Z'}, 'details': {'M': {'n': {'N': '1'}}}}
        m9 = {'auditId': {'S': 'm9test'}, 'institutionId': {'S': 'sruti'}, 'timestamp': {'S': '2026-11-05T13:00:00Z'}}
        calls = {
            'sadhana-dev-main': [original],
            'sadhana-dev-audit': [original],
            'sadhana-dev-m9-audit': [m9],
        }
        old_scan = parity.scan
        parity.scan = lambda table: calls[table]
        try:
            # First verify the expected records by capturing them from a synthetic target.
            import hashlib, json
            digest = hashlib.sha256(json.dumps(['AUDIT#raaga', 'RECORD#x'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            legacy = {
                'auditId': {'S': 'legacy-' + digest},
                'timestamp': original['at'],
                'action': {'S': 'LEGACY_EVENT'},
                'recordSource': {'S': 'legacy'},
                'legacySourceTables': {'SS': ['sadhana-dev-audit', 'sadhana-dev-main']},
                'legacyPayload': {'M': original},
                'institutionId': {'S': 'raaga'},
            }
            calls['sadhana-dev-audit-records'] = [m9, {**legacy, 'legacySourceTables': {'SS': list(reversed(legacy['legacySourceTables']['SS']))}}]
            self.assertEqual(parity.verify_audit('sadhana-dev-audit-records'), (2, 2, True))
        finally:
            parity.scan = old_scan


if __name__ == '__main__':
    unittest.main()

class ClassifiedAuditTests(unittest.TestCase):
    def test_legacy_shared_audit_is_classified_without_changing_original_payload(self):
        original = {'PK': {'S': 'AUDIT#shared'}, 'SK': {'S': 'REC#1'}, 'at': {'S': '2026-11-05T14:00:00Z'}, 'description': {'S': 'original'}}
        m9 = {'auditId': {'S': 'new1'}, 'institutionId': {'S': 'raaga'}, 'timestamp': {'S': '2026-11-05T15:00:00Z'}}
        calls = {'sadhana-dev-main': [original], 'sadhana-dev-audit': [original], 'sadhana-dev-m9-audit': [m9]}
        old_scan = parity.scan
        parity.scan = lambda name: calls[name]
        try:
            expected = parity.expected_audit_records()
            self.assertEqual(len(expected), 2)
            historical = next(row for key, row in expected.items() if key.startswith('legacy-'))
            self.assertEqual(historical['institutionId'], {'S': 'shared'})
            self.assertEqual(historical['legacyPayload']['M'], original)
        finally:
            parity.scan = old_scan

    def test_reject_unknown_historical_institution(self):
        legacy = {'PK': {'S': 'AUDIT#unexpected'}, 'SK': {'S': 'REC#1'}, 'at': {'S': '2026-11-05'}}
        old_scan = parity.scan
        parity.scan = lambda name: ([legacy] if name.endswith('-main') else [])
        try:
            with self.assertRaises(RuntimeError):
                parity.expected_audit_records()
        finally:
            parity.scan = old_scan

class AuditIndexTests(unittest.TestCase):
    def test_index_matches_classified_table_rows(self):
        rows = [
            {'auditId': {'S': 'ra1'}, 'institutionId': {'S': 'raaga'}},
            {'auditId': {'S': 'sr1'}, 'institutionId': {'S': 'sruti'}},
            {'auditId': {'S': 'sh1'}, 'institutionId': {'S': 'shared'}},
        ]
        original_scan, original_aws = parity.scan, parity.aws
        parity.scan = lambda table: rows
        def aws(*args):
            raw = args[args.index('--expression-attribute-values')+1]
            inst = __import__('json').loads(raw)[':institution']['S']
            return {'Items': [r for r in rows if r['institutionId']['S'] == inst]}
        parity.aws = aws
        try:
            self.assertTrue(parity.verify_audit_institution_index('audit'))
            rows.pop()
            # The index test is evaluated against the same table snapshot in this
            # fake; omission is tested separately below.
        finally:
            parity.scan, parity.aws = original_scan, original_aws

    def test_index_missing_a_row_fails(self):
        rows = [
            {'auditId': {'S': 'sh1'}, 'institutionId': {'S': 'shared'}}
        ]
        original_scan, original_aws = parity.scan, parity.aws
        parity.scan = lambda table: rows
        parity.aws = lambda *args: {'Items': []}
        try:
            self.assertFalse(parity.verify_audit_institution_index('audit'))
        finally:
            parity.scan, parity.aws = original_scan, original_aws
