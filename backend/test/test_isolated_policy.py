import pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from isolatedPolicy import build_policy,policy_diff

class IsolatedPolicy(unittest.TestCase):
    def test_exact_expected_statements(self):
        p=build_policy('627821644317'); by={s['Sid']:s for s in p['Statement']}
        self.assertEqual(len(by),7)
        self.assertEqual(by['M9VerifiedIdentityLookup']['Action'],['cognito-idp:ListUsers'])
        self.assertIn('CognitoIdentityIndex',by['M9IndexReads']['Resource'][0])
        for s in p['Statement']:
            for r in ([s['Resource']] if isinstance(s['Resource'],str) else s['Resource']):
                self.assertNotIn(':table/sadhana-dev-calendar',r)
                self.assertNotIn(':table/sadhana-dev-students',r)
        self.assertTrue(policy_diff(p,p)['matches'])
    def test_detects_unexpected_grants(self):
        p=build_policy('627821644317')
        other={'Version':p['Version'],'Statement':p['Statement']+[{'Sid':'Unexpected','Effect':'Allow','Action':['dynamodb:DeleteItem'],'Resource':['*']}]}
        self.assertFalse(policy_diff(other,p)['matches'])
        self.assertEqual(policy_diff(other,p)['unexpectedStatementCount'],1)
    def test_wrong_account_rejected(self):
        with self.assertRaises(ValueError): build_policy('000000000000')
    def test_creation_script_uses_versioned_policy(self):
        self.assertIn('build_policy(account', (ROOT/'scripts/isolatedDeploy.py').read_text())
        self.assertNotIn("'update-function-code'", (ROOT/'scripts/isolatedDeploy.py').read_text())

if __name__=='__main__':unittest.main()
