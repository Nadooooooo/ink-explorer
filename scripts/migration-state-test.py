import importlib.util,tempfile,json,unittest,sys,copy,os
from pathlib import Path
from unittest import mock
spec=importlib.util.spec_from_file_location('migration',Path(__file__).with_name('migrate-public-hosting.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MigrationState(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);m.REPORT=Path(self.tmp.name)
  ids=mock.patch.multiple(m,ACCOUNT='fixture-account',ZONE='fixture-zone');ids.start();self.addCleanup(ids.stop)
  self.original=[{'id':h,'hostname':h,'service':'inkexplorer','zone_id':m.ZONE,'environment':'production','enabled':True,'previews_enabled':False}for h in ['inkexplorer.xyz','www.inkexplorer.xyz']]
  self.domains=copy.deepcopy(self.original);self.dns={};self.mutations=[];self.fail_dns=False;self.healthy=True
  for name,value in [('cloudflare-before.json',{'domains':self.original}),('tunnel.json',{'id':'test','target':'test.cfargotunnel.com'})]:m.save(name,value)
  for name in ['local-boundary','stage-boundary']:
   p=m.REPORT/name;p.mkdir();(p/'results.json').write_text(json.dumps({'complete':True,'passed':True}))
  api=mock.patch.object(m,'api',self.api);api.start();self.addCleanup(api.stop)
  self.boot=unittest.mock.patch.object(m,'verify_boot_persistence',return_value={'scope':'test'});self.boot.start();self.addCleanup(self.boot.stop)
 def api(self,method,path,data=None):
  if method!='GET':self.mutations.append((method,path))
  if path.endswith('/cfd_tunnel/test'):return {'status':'healthy' if self.healthy else 'down'}
  if path.endswith('/workers/scripts/inkexplorer/deployments'):return {'deployments':[{'created_on':'2026-10-23','versions':[{'version_id':'f80294c4-2c7f-42d9-bda4-264d0d08d447','percentage':100}]}]}
  if '/workers/routes' in path:return []
  if '/workers/domains' in path:
   if method=='GET':return copy.deepcopy(self.domains)
   if method=='DELETE':self.domains=[x for x in self.domains if x['id']!=path.split('/')[-1]];return {}
   if method=='PUT':
    value={**data,'id':data['hostname']};self.domains.append(value);return value
  if '/dns_records' in path:
   if method=='GET':
    host=path.split('?name=')[-1] if '?name=' in path else None
    return [dict(x)for x in self.dns.values() if host is None or x['name']==host]
   if method=='POST':
    if self.fail_dns:raise RuntimeError('Simulated DNS write failure')
    value={**data,'id':data['name']};self.dns[value['id']]=value;return value
   if method=='DELETE':return self.dns.pop(path.split('/')[-1])
  raise AssertionError((method,path,data))
 def run_command(self,command):
  with unittest.mock.patch.object(sys,'argv',['migrate',command]):m.main()
 def test_prepare_requires_dedicated_preview_before_contacting_cloudflare(self):
  for host in ('','inkexplorer.xyz','www.inkexplorer.xyz','preview.example'):
   with self.subTest(host=host), mock.patch.dict(os.environ,{'INK_MIGRATION_PREVIEW_HOST':host}), mock.patch.object(m,'api') as api:
    with self.assertRaises(ValueError):self.run_command('prepare')
    api.assert_not_called()
 def test_prepare_writes_private_token_and_uses_configured_preview(self):
  host='stage.inkexplorer.xyz'
  secret=Path(self.tmp.name)/'operator'/'tunnel-token'
  def prepare_api(method,path,data=None):
   if path.endswith('/cfd_tunnel?is_deleted=false'):return [{'id':'fixture','name':'inkexplorer-public-server'}]
   if path.endswith('/token'):return 'fixture-only'
   if path.endswith('/configurations'):
    if method=='GET':return {'config':{}}
    self.assertIn(host,[rule.get('hostname') for rule in data['config']['ingress']]);return {}
   if path.endswith('/dns_records?name='+host):return []
   if method=='POST' and path.endswith('/dns_records'):
    self.assertEqual(data['name'],host);return {'id':'preview-fixture'}
   self.fail((method,path))
  with mock.patch.object(m,'api',prepare_api), mock.patch.dict(os.environ,{'INK_MIGRATION_PREVIEW_HOST':host,'INK_TUNNEL_TOKEN_FILE':str(secret)}):
   self.run_command('prepare')
  self.assertEqual(secret.read_text(),'fixture-only')
  self.assertEqual(secret.stat().st_mode & 0o777,0o600)
 def test_occupied_preview_name_preserves_dns_tunnel_and_token(self):
  preview='stage.inkexplorer.xyz'
  secret=Path(self.tmp.name)/'existing-token'
  secret.write_text('previous fixture')
  for existing_tunnels in ([],[{'id':'fixture','name':'inkexplorer-public-server'}]):
   with self.subTest(tunnels=existing_tunnels):
    def preflight(method,path,data=None):
     self.assertEqual(method,'GET')
     if path.endswith('/cfd_tunnel?is_deleted=false'):return existing_tunnels
     if path.endswith('/dns_records?name='+preview):return [{'type':'CNAME','content':'other.example'}]
     self.fail(path)
    with mock.patch.object(m,'api',preflight), mock.patch.dict(os.environ,{'INK_MIGRATION_PREVIEW_HOST':preview,'INK_TUNNEL_TOKEN_FILE':str(secret)}):
     with self.assertRaisesRegex(AssertionError,'Preserve existing preview DNS'):self.run_command('prepare')
    self.assertEqual(secret.read_text(),'previous fixture')
 def test_incomplete_or_conflicting_tunnel_config_prevents_mutation(self):
  preview='stage.inkexplorer.xyz'
  secret=Path(self.tmp.name)/'unwritten-token'
  for response in ({},{'config':{'ingress':[{'hostname':preview,'service':'http://other.example'}]}}):
   with self.subTest(response=response):
    def preflight(method,path,data=None):
     self.assertEqual(method,'GET')
     if path.endswith('/cfd_tunnel?is_deleted=false'):return [{'id':'fixture','name':'inkexplorer-public-server'}]
     if path.endswith('/dns_records?name='+preview):return []
     if path.endswith('/configurations'):return response
     self.fail(path)
    with mock.patch.object(m,'api',preflight), mock.patch.dict(os.environ,{'INK_MIGRATION_PREVIEW_HOST':preview,'INK_TUNNEL_TOKEN_FILE':str(secret)}):
     with self.assertRaises(AssertionError):self.run_command('prepare')
    self.assertFalse(secret.exists())
 def test_failed_config_can_resume_with_the_original_private_token(self):
  preview='stage.inkexplorer.xyz'
  secret=Path(self.tmp.name)/'operator'/'tunnel-token'
  secret.parent.mkdir();secret.write_text('previous fixture')
  tunnels=[];dns=[];config_writes=[]
  def prepare_api(method,path,data=None):
   if path.endswith('/cfd_tunnel?is_deleted=false'):return tunnels
   if path.endswith('/dns_records?name='+preview):return dns
   if method=='POST' and path.endswith('/cfd_tunnel'):
    tunnel={'id':'fixture','name':data['name']};tunnels.append(tunnel);return tunnel
   if path.endswith('/token'):return 'new fixture'
   if method=='POST' and path.endswith('/dns_records'):
    record={**data,'id':'record'};dns.append(record);return record
   if path.endswith('/configurations'):
    if method=='GET':return {'config':{}}
    config_writes.append(data)
    if len(config_writes)==1:raise RuntimeError('Simulated ingress rejection')
    return {}
   self.fail((method,path))
  with mock.patch.object(m,'api',prepare_api), mock.patch.dict(os.environ,{'INK_MIGRATION_PREVIEW_HOST':preview,'INK_TUNNEL_TOKEN_FILE':str(secret)}):
   with self.assertRaisesRegex(RuntimeError,'Simulated ingress'):self.run_command('prepare')
   self.assertEqual(secret.read_text(),'previous fixture')
   self.assertEqual(list(secret.parent.iterdir()),[secret])
   self.run_command('prepare')
  self.assertEqual(secret.read_text(),'new fixture')
  self.assertEqual(len(tunnels),1);self.assertEqual(len(dns),1)
  self.assertEqual(json.loads((m.REPORT/'tunnel.json').read_text())['previewDnsId'],'record')
 def test_unhealthy_tunnel_cannot_change_domains(self):
  self.healthy=False
  with self.assertRaises(AssertionError):self.run_command('activate')
  self.assertEqual(self.mutations,[]);self.assertEqual(self.domains,self.original)
 def test_failure_after_detaching_domain_restores_worker(self):
  self.fail_dns=True
  with self.assertRaisesRegex(RuntimeError,'Simulated DNS'):self.run_command('activate')
  self.assertEqual(sorted(x['hostname']for x in self.domains),sorted(x['hostname']for x in self.original));self.assertFalse(self.dns)
  self.assertIn('automatically rolled back',json.loads((m.REPORT/'cutover.json').read_text())['phase'])
 def test_success_then_rollback_restores_both_bindings(self):
  self.run_command('activate');self.assertFalse(self.domains);self.assertEqual(len(self.dns),2)
  self.run_command('rollback');self.assertEqual(len(self.domains),2);self.assertFalse(self.dns)
 def test_rollback_preserves_concurrent_dns_change(self):
  self.run_command('activate');self.dns['inkexplorer.xyz']['content']='other-operator.example'
  with self.assertRaisesRegex(RuntimeError,'Preserve concurrent DNS'):self.run_command('rollback')
  self.assertEqual(self.dns['inkexplorer.xyz']['content'],'other-operator.example')
  self.assertTrue(any(d['hostname']=='www.inkexplorer.xyz' for d in self.domains))
class TunnelConfiguration(unittest.TestCase):
 def test_unrelated_applications_and_settings_are_preserved(self):
  existing={'originRequest':{'connectTimeout':15},'ingress':[{'hostname':'other.example','service':'http://127.0.0.1:9876'},{'service':'http_status:404'}]}
  result=m.tunnel_config(existing,'preview.inkexplorer.xyz')['config'];self.assertEqual(result['originRequest'],existing['originRequest']);self.assertEqual(result['ingress'][-2:],existing['ingress']);self.assertEqual(len(existing['ingress']),2)
 def test_conflicting_existing_application_is_rejected(self):
  with self.assertRaisesRegex(AssertionError,'Conflicting existing Tunnel'):
   m.tunnel_config({'ingress':[{'hostname':'inkexplorer.xyz','service':'http://127.0.0.1:9999'}]},'preview.inkexplorer.xyz')
 def test_each_application_forwards_its_actual_hostname(self):
  rules=m.tunnel_config(None,'preview.inkexplorer.xyz')['config']['ingress'];self.assertEqual(len(rules),4)
  for rule in rules[:3]:self.assertEqual(rule['originRequest']['httpHostHeader'],rule['hostname'])
if __name__=='__main__':
 unittest.main()
