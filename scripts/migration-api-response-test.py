import importlib.util
import io
import json
import os
import unittest
import unittest.mock
from pathlib import Path

spec=importlib.util.spec_from_file_location('migration_api',Path(__file__).with_name('migrate-public-hosting.py'))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Response(io.BytesIO):
    def __init__(self,body,status):
        super().__init__(body)
        self.status=status

class ApiResponse(unittest.TestCase):
    def setUp(self):
        for patch in (
            unittest.mock.patch.multiple(m, ACCOUNT='fixture-account', ZONE='fixture-zone'),
            unittest.mock.patch.dict(os.environ, {'CLOUDFLARE_API_TOKEN':'fixture-only'}),
        ):
            patch.start()
            self.addCleanup(patch.stop)

    def call(self,method,body,status=200):
        with unittest.mock.patch.object(m.urllib.request,'urlopen',return_value=Response(body,status)):
            return m.api(method,'/test')

    def test_successful_empty_delete_is_supported(self):
        for status in (200,202,204):
            self.assertIsNone(self.call('DELETE',b'',status))

    def test_absent_account_or_zone_stops_before_reading_credentials_or_requesting(self):
        for account,zone in ((None,'fixture-zone'),('fixture-account',None)):
            with self.subTest(account=account,zone=zone), unittest.mock.patch.multiple(m,ACCOUNT=account,ZONE=zone), \
                    unittest.mock.patch.object(Path,'read_text') as read_token, \
                    unittest.mock.patch.object(m.urllib.request,'urlopen') as request:
                with self.assertRaisesRegex(RuntimeError,'CLOUDFLARE_ACCOUNT_ID'):
                    m.api('GET','/test')
                read_token.assert_not_called()
                request.assert_not_called()

    def test_missing_credentials_stop_before_requesting(self):
        with unittest.mock.patch.dict(os.environ,{'CLOUDFLARE_API_TOKEN':''}), \
                unittest.mock.patch.object(Path,'read_text',side_effect=FileNotFoundError), \
                unittest.mock.patch.object(m.urllib.request,'urlopen') as request:
            with self.assertRaisesRegex(RuntimeError,'Configure CLOUDFLARE_API_TOKEN'):
                m.api('GET','/test')
            request.assert_not_called()

    def test_empty_reads_and_writes_remain_errors(self):
        for method in ('GET','POST','PUT'):
            with self.assertRaises(json.JSONDecodeError):
                self.call(method,b'')

    def test_json_delete_and_normal_results_still_work(self):
        self.assertEqual(self.call('DELETE',b'{"success":true,"result":{"id":"test"}}'),{'id':'test'})
        self.assertEqual(self.call('GET',b'{"success":true,"result":[1,2]}'),[1,2])

    def test_invalid_json_and_failed_envelopes_remain_errors(self):
        with self.assertRaises(json.JSONDecodeError):
            self.call('DELETE',b'not json')
        with self.assertRaises(RuntimeError):
            self.call('DELETE',b'{"success":false,"errors":[{"code":10000}]}')

if __name__=='__main__':
    unittest.main()
