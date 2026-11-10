import sys
from pathlib import Path
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'scripts'))
import middlesbroughEnrol as m

class EnrolTests(unittest.TestCase):
    def test_deterministic_ids_are_distinct(self):
        values=[m.enrolment_id(x) for x in m.STUDENTS.values()]
        self.assertEqual(len(set(values)),2)
        self.assertTrue(all(x.startswith('enr_') for x in values))
    def test_transaction_is_scoped_and_conditional(self):
        x=m.plan_transactions('2026-11-04T12:00:00Z')
        self.assertEqual(len(x),8)
        self.assertTrue(all(a[list(a)[0]]['TableName'].startswith(m.PREFIX) for a in x))
        self.assertEqual(sum('Put' in a for a in x),4)
        for a in x:
            if 'Put' in a: self.assertIn('attribute_not_exists',a['Put']['ConditionExpression'])
        for a in x:
            if 'ConditionCheck' in a: self.assertTrue(a['ConditionCheck']['ConditionExpression'])
    def test_no_prod_or_legacy_tables(self):
        self.assertEqual({a[list(a)[0]]['TableName'].removeprefix(m.PREFIX)
                          for a in m.plan_transactions('2026-11-04T12:00:00Z')},
                         {'classes','people','enrolments','audit'})
    def test_live_blocks_teacher_drift(self):
        with patch.object(m,'aws',return_value={'Account':m.ACCOUNT}),patch.object(m,'get',return_value={'teacherPersonIds':['OTHER']}):
            with self.assertRaisesRegex(RuntimeError,'teacher assignment changed'):m.validate_live()

if __name__=='__main__':unittest.main()
