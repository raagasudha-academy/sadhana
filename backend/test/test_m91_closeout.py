import importlib.util, pathlib, unittest
p=pathlib.Path(__file__).resolve().parents[1]/'scripts/m91Closeout.py'
spec=importlib.util.spec_from_file_location('closeout',p)
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class CloseoutTests(unittest.TestCase):
    def test_sruti_gap_blocks(self):
        r=m.evaluate({'srutiImportBlocked':True,'srutiSyncBlocked':True,'raagaOnlyGateway':True})
        self.assertIn('SRUTI_INTAKE_CONTRACT_AND_IMPORT',r['blockers'])
        self.assertFalse(r['productionCutoverReady'])
    def test_aws_safety_blocks(self):
        r=m.evaluate({'srutiImportBlocked':False,'srutiSyncBlocked':False,'raagaOnlyGateway':False},{'accountCorrect':True,'isolatedLambdaActive':True,'strictFence':False,'identityLinkWritesDisabled':True})
        self.assertIn('ISOLATED_AWS_SAFETY',r['blockers'])
    def test_no_unearned_ready(self):
        r=m.evaluate({'srutiImportBlocked':False,'srutiSyncBlocked':False,'raagaOnlyGateway':False})
        self.assertFalse(r['productionCutoverReady'])
        self.assertIn('ROLLBACK_REHEARSAL',r['blockers'])
if __name__=='__main__':unittest.main()
