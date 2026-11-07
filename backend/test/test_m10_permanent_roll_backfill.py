import importlib.util
import unittest
from decimal import Decimal
from pathlib import Path

spec = importlib.util.spec_from_file_location('roll', Path(__file__).resolve().parents[1] / 'scripts/m10PermanentRollBackfill.py')
roll = importlib.util.module_from_spec(spec)
spec.loader.exec_module(roll)


def student(pid, institutions, old, origin=None, permanent=None):
    p = {'personId':pid, 'personTypes':['student'], 'institutionIds':institutions,
         'status':'active','version':Decimal(2), 'createdAt':'2026-01-01',
         'studentProfile':{'rollNumbers':old}}
    if origin: p['legacyPayload']={'createdIn': origin}
    if permanent: p['studentProfile']['rollNumber'] = permanent
    return p

class PermanentRollPlannerTests(unittest.TestCase):
    def test_two_academies_one_roll_and_decimal_versions(self):
        p = roll.choose_plan([student('a',['raaga','sruti'],{'raaga':'001-001','sruti':'004-003'},'raaga'),
                              student('b',['sruti'],{'sruti':'004-004'},'sruti')], {'raaga':Decimal(2),'sruti':Decimal(3)})
        self.assertFalse(p['problems'])
        self.assertEqual(p['changes'][0]['roll'],'RS-003')
        self.assertEqual(p['changes'][0]['newRollNumbers'],{'raaga':'RS-003','sruti':'RS-003'})
        self.assertEqual(p['changes'][1]['roll'],'SR-004')
    def test_keep_formatted_permanent_number_and_reuse(self):
        p = roll.choose_plan([student('a',['raaga','sruti'],{'raaga':'RS-001','sruti':'SR-003'},'raaga')],{'raaga':4,'sruti':5})
        self.assertFalse(p['problems'])
        self.assertEqual(p['changes'][0]['roll'],'RS-001')
    def test_unknown_cross_academy_origin_blocks(self):
        p = roll.choose_plan([student('a',['raaga','sruti'],{'raaga':'001-001','sruti':'004-003'})],{'raaga':0,'sruti':0})
        self.assertTrue(any('Unknown originating institution' in x for x in p['problems']))
    def test_duplicate_global_roll_blocks(self):
        p = roll.choose_plan([student('a',['raaga'],{'raaga':'RS-001'},'raaga'),student('b',['sruti'],{'sruti':'RS-001'},'sruti')],{'raaga':0,'sruti':0})
        self.assertTrue(any('DUPLICATE global roll' in x for x in p['problems']))
    def test_number_validation(self):
        self.assertEqual(roll.integer(Decimal('2'),'version'),2)
        with self.assertRaises(RuntimeError):roll.integer(Decimal('1.5'),'version')
        with self.assertRaises(RuntimeError):roll.integer(True,'version')

if __name__ == '__main__': unittest.main()
