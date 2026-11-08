import pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class M9IsolatedReleaseTests(unittest.TestCase):
 def test_production_api_readonly_references(self):
  source=(ROOT/'scripts/isolatedDeploy.py').read_text()
  self.assertIn('6n9clqr224',source)
  self.assertNotIn("'update-integration'",source)
  self.assertNotIn("'update-function-code'",source)
 def test_requires_explicit_execute(self):
  source=(ROOT/'scripts/isolatedDeploy.py').read_text()
  self.assertIn("parser.add_argument('--execute'",source)
  self.assertIn('if not args.execute:',source)
 def test_new_isolated_role_only_m9_dynamodb(self):
  source=(ROOT/'scripts/isolatedDeploy.py').read_text()
  self.assertIn('M9DisposableWorkflowWrites',source)
  self.assertIn("M9_PREFIX = 'sadhana-dev-m9-'",source)
  self.assertIn("'M9_STRICT_DATA_FENCE':'enabled'",source)
  self.assertIn("'M95_ONBOARDING_MODE':'disabled'",source)
 def test_smoke_never_persists_tokens(self):
  source=(ROOT/'scripts/isolatedSmoke.py').read_text()
  self.assertIn('M9_RAAGA_ADMIN_TOKEN',source)
  self.assertNotIn("'token':token",source)
if __name__ == '__main__':unittest.main()
