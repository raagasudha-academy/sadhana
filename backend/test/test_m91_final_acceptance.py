import importlib.util
import pathlib
import unittest

P=pathlib.Path(__file__).resolve().parents[1]/'scripts'/'m91FinalAcceptance.py'
spec=importlib.util.spec_from_file_location('m91_final_acceptance',P)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class FinalAcceptanceTests(unittest.TestCase):
    def test_only_negative_media_start_requests(self):
        cases=m.negative_cases()
        self.assertEqual(len(cases),9)
        self.assertTrue(all(path.endswith('/evidence/start?institution=raaga') or path.endswith('/evidence/start?institution=sruti') for _,path,_,_ in cases))
        self.assertTrue(all(expected in (400,403) for _,_,_,expected in cases))
        self.assertTrue(all('/submission/'+m.HOMEWORK+'/' in p for _,p,_,_ in cases))
    def test_upload_size_boundaries(self):
        by_name={name:(body,expected) for name,_,body,expected in m.negative_cases()}
        self.assertEqual(by_name['image-over-5MB'][0]['size'],5_000_001)
        self.assertEqual(by_name['audio-mp3-over-20MB'][0]['size'],20_000_001)
        self.assertEqual(by_name['audio-m4a-over-20MB'][0]['size'],20_000_001)
        self.assertEqual(by_name['video-mp4-over-100MB'][0]['size'],100_000_001)
    def test_does_not_log_token(self):
        source=P.read_text()
        self.assertNotIn('print(token)',source)
        self.assertNotIn('print(parent)',source)
    def test_identity_matching_rejects_other_account(self):
        import base64,json,time
        claims={'iss':m.ISS,'client_id':m.CLIENT,'token_use':'access','exp':time.time()+3600,'sub':'wrong'}
        t='eyJ.'+base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')+'.sig'
        with self.assertRaises(m.Stopped):m.decode_token(t)
    def test_account_is_isolated(self):
        self.assertEqual(m.FUNCTION,'sadhana-m9-isolated-e2e')
        self.assertIn('/m9-test/api',m.API)

if __name__=='__main__':unittest.main()
