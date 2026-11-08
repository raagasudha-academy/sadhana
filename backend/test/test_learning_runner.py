import importlib.util
import pathlib
import unittest
from unittest.mock import patch
PATH=pathlib.Path(__file__).parents[1]/'scripts'/'learningE2E.py'
spec=importlib.util.spec_from_file_location('learning',PATH)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class LearningRunnerTests(unittest.TestCase):
 def test_bad_token_rejected(self):
  with self.assertRaises(m.Stop):m.token_claims('bad-token')
 def test_wrong_account_rejected(self):
  with patch.object(m,'aws',return_value={'Account':'wrong'}):
   with self.assertRaises(m.Stop):m.preflight()
 def test_guards_fail_closed(self):
  def mocked(*args):
   if args[0]=='sts':return {'Account':m.ACCOUNT}
   return {'State':'Active','LastUpdateStatus':'Successful','Environment':{'Variables':{'M9_STRICT_DATA_FENCE':'disabled'}}}
  with patch.object(m,'aws',side_effect=mocked):
   with self.assertRaises(m.Stop):m.preflight()
 def test_dryrun_no_token_or_network(self):
  safe={'flags':{'M9_LEARNER_WRITES':'disabled','M9_HOMEWORK_WRITES':'disabled'}}
  with patch.object(m,'preflight',return_value=safe),patch.object(m,'fetch',side_effect=AssertionError('network request')):
   m.run(False)
 def test_write_gates_required(self):
  safe={'flags':{'M9_LEARNER_WRITES':'disabled','M9_HOMEWORK_WRITES':'disabled'}}
  with patch.object(m,'preflight',return_value=safe),patch.object(m.getpass,'getpass',side_effect=AssertionError('token prompt')):
   with self.assertRaises(m.Stop):m.run(True)
if __name__=='__main__':unittest.main()
