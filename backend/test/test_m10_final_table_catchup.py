"""Safe offline tests; no AWS access."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import m10FinalTableCatchup as mod


class CutoverCatchupTests(unittest.TestCase):
    def test_identical_and_set_order_do_not_create_a_write(self):
        expected = {'k': {'id': {'S': 'x'}, 'sources': {'SS': ['a', 'b']}}}
        actual = {'k': {'id': {'S': 'x'}, 'sources': {'SS': ['b', 'a']}}}
        self.assertEqual(mod.classify(expected, actual), ([], [], []))

    def test_detects_missing_changed_and_target_only(self):
        expected = {'new': {'id': {'S': 'new'}}, 'edit': {'id': {'S': 'edit'}, 'v': {'N': '2'}}}
        actual = {'edit': {'id': {'S': 'edit'}, 'v': {'N': '1'}}, 'extra': {'id': {'S': 'extra'}}}
        self.assertEqual(mod.classify(expected, actual), (['new'], ['edit'], ['extra']))

    def test_condition_guards_replacement_and_added_fields(self):
        old = {'auditId': {'S': 'k'}, 'v': {'N': '1'}}
        new = {'auditId': {'S': 'k'}, 'name': {'S': 'added'}}
        expr, names, values = mod.write_condition('auditId', old, new)
        self.assertIn('attribute_not_exists(', expr)
        self.assertIn(' = ', expr)
        self.assertEqual(set(names.values()), {'auditId', 'v', 'name'})
        self.assertIn({'N': '1'}, values.values())

    def test_wont_change_primary_key(self):
        with self.assertRaises(RuntimeError):
            mod.write_condition('id', {'id': {'S': 'a'}}, {'id': {'S': 'b'}})

    def test_only_simple_entity_key(self):
        self.assertEqual(mod.primary_key({'KeySchema': [{'AttributeName': 'personId', 'KeyType': 'HASH'}]}), 'personId')
        with self.assertRaises(RuntimeError):
            mod.primary_key({'KeySchema': [{'AttributeName': 'PK', 'KeyType': 'HASH'}, {'AttributeName': 'SK', 'KeyType': 'RANGE'}]})

    def test_apply_requires_explicit_write_freeze(self):
        with self.assertRaises(RuntimeError) as context:
            mod.main(['--apply'])
        self.assertIn('write-freeze', str(context.exception))


if __name__ == '__main__':
    unittest.main()


class AuditOnlyScopeTests(unittest.TestCase):
    """Mock DynamoDB boundaries: no network or table writes occur."""
    def test_audit_only_still_requires_real_freeze_confirmation(self):
        with self.assertRaises(RuntimeError) as ex:
            mod.main(['--audit-only','--apply'])
        self.assertIn('write-freeze', str(ex.exception))

    def _run_mock(self, argv, *, other_missing=False, changed_audit=False, apply=False):
        from unittest.mock import patch
        rows = {name: {'x': {'auditId' if name == 'audit' else 'id': {'S': 'x'}}} for name in mod.p.ENTITIES}
        audit_new = {'missing-01': {'auditId': {'S': 'missing-01'}, 'institutionId': {'S': 'raaga'}}}
        calls = []
        def capture(entity, src, dst, key):
            calls.append(entity)
            existing = rows[entity]
            expected = dict(existing)
            if entity == 'audit':
                expected.update(audit_new)
                if changed_audit:
                    expected['x'] = {'auditId': {'S': 'x'}, 'version': {'N': '2'}}
                if apply and any(v == 'missing-01' for v in inserted):
                    existing = dict(existing); existing.update(audit_new)
            if entity == 'people' and other_missing:
                expected['person-new'] = {'id': {'S': 'person-new'}}
            return expected, existing
        inserted = []
        def insert(dst, key, item):
            inserted.append(item['auditId']['S'])
        with patch.object(mod.p,'aws',return_value={'Account':mod.p.EXPECTED_ACCOUNT}), \
             patch.object(mod,'preflight',side_effect=lambda e:(f'source-{e}',f'dest-{e}',('auditId' if e=='audit' else 'id'))), \
             patch.object(mod,'snapshot',side_effect=capture), \
             patch.object(mod,'put_missing',side_effect=insert), \
             patch.object(mod,'put_changed',side_effect=AssertionError('changed write forbidden')):
            result = mod.main(argv)
        return result, inserted, calls

    def test_audit_only_dry_run_reports_without_writes(self):
        result, written, calls = self._run_mock(['--audit-only'])
        self.assertEqual(result, 0)
        self.assertEqual(written, [])
        self.assertEqual(len(calls), 18)

    def test_audit_only_refuses_non_audit_drift(self):
        with self.assertRaisesRegex(RuntimeError,'other 17 tables'):
            self._run_mock(['--audit-only'],other_missing=True)

    def test_audit_only_refuses_changed_audit_items(self):
        with self.assertRaisesRegex(RuntimeError,'cannot replace changed audit'):
            self._run_mock(['--audit-only'],changed_audit=True)

    def test_audit_only_scopes_apply_to_audit_and_rechecks_all_tables(self):
        result, inserted, calls = self._run_mock(['--audit-only','--apply','--confirm-write-freeze',mod.CONFIRM_TEXT],apply=True)
        self.assertEqual(result, 0)
        self.assertEqual(inserted, ['missing-01'])
        self.assertEqual(len(calls), 37) # 18 initial + 1 audit recheck/write + 18 final
