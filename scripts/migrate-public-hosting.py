#!/usr/bin/env python3
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from tempfile import NamedTemporaryFile
from public_boot_proof import verify_boot_persistence
ROOT=Path(__file__).resolve().parent.parent
REPORT=ROOT/'reports/server-migration'
ACCOUNT=os.getenv('CLOUDFLARE_ACCOUNT_ID')
ZONE=os.getenv('CLOUDFLARE_ZONE_ID')

def require(condition, message):
    """Keep operational checks active when the interpreter runs with -O."""
    if not condition:
        raise AssertionError(message)

def api(method,path,data=None):
 if not ACCOUNT or not ZONE:
  raise RuntimeError('Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ZONE_ID before contacting Cloudflare')
 token=os.getenv('CLOUDFLARE_API_TOKEN')
 if not token:
  try:
   token=(Path.home()/'.config/cloudflare/api-token').read_text()
  except FileNotFoundError:
   raise RuntimeError('Configure CLOUDFLARE_API_TOKEN or the operator token file before contacting Cloudflare') from None
 token=token.strip()
 if not token:
  raise RuntimeError('Cloudflare API token is empty')
 request=urllib.request.Request('https://api.cloudflare.com/client/v4'+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(request,timeout=30) as r:
   payload=r.read()
   if not payload and method=='DELETE' and 200<=r.status<300:return None
   j=json.loads(payload)
 except urllib.error.HTTPError as e:
  try:errors=json.load(e).get('errors')
  except (ValueError, AttributeError):errors=[]
  raise RuntimeError(f'Cloudflare {method} {path}: HTTP {e.code}; {errors}') from None
 if not j.get('success'):raise RuntimeError(str(j.get('errors')))
 return j.get('result')
def save(name,value):
 p=REPORT/name;p.write_text(json.dumps(value,indent=2)+'\n')
def current():
 return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'domains':api('GET',f'/accounts/{ACCOUNT}/workers/domains?zone_id={ZONE}'),'routes':api('GET',f'/zones/{ZONE}/workers/routes'),'dns':api('GET',f'/zones/{ZONE}/dns_records?per_page=100')}
def ready(name):
 j=json.loads((REPORT/name/'results.json').read_text())
 require(j.get('complete') and j.get('passed'),f'Incomplete validation: {name}')
 return j
def own_dns(host,target):
 records=api('GET',f'/zones/{ZONE}/dns_records?name={host}')
 return [r for r in records if r['type'] in ('A','AAAA','CNAME')]
def change_host(host,tunnel,before):
 previous=next(d for d in before['domains'] if d['hostname']==host)
 current_domains=api('GET',f'/accounts/{ACCOUNT}/workers/domains?zone_id={ZONE}')
 current_domain=next((d for d in current_domains if d['hostname']==host),None)
 require(current_domain and current_domain['id']==previous['id'] and current_domain['service']=='inkexplorer','Concurrent Worker binding change')
 api('DELETE',f"/accounts/{ACCOUNT}/workers/domains/{current_domain['id']}")
 require(not any(d['hostname']==host for d in api('GET',f'/accounts/{ACCOUNT}/workers/domains?zone_id={ZONE}')),'Worker binding was not detached')
 records=own_dns(host,tunnel['target'])
 data={'type':'CNAME','name':host,'content':tunnel['target'],'proxied':True,'ttl':1}
 if records:
  require(len(records)==1 and records[0]['content'] in ('100::',tunnel['target']) and not records[0].get('meta',{}).get('read_only'),'Unexpected or still-managed DNS record; rollback required')
  return api('PUT',f"/zones/{ZONE}/dns_records/{records[0]['id']}",data)
 return api('POST',f'/zones/{ZONE}/dns_records',data)
def restore_host(host,tunnel,before):
 domains=api('GET',f'/accounts/{ACCOUNT}/workers/domains?zone_id={ZONE}')
 existing=next((d for d in domains if d['hostname']==host),None)
 if existing:
  require(existing['service']=='inkexplorer','Preserve concurrent domain binding')
  return existing
 records=own_dns(host,tunnel['target'])
 require(all(record['content']==tunnel['target'] and record['type']=='CNAME' for record in records),'Preserve concurrent DNS change')
 for record in records:
  api('DELETE',f"/zones/{ZONE}/dns_records/{record['id']}")
 old=next(d for d in before['domains'] if d['hostname']==host)
 return api('PUT',f'/accounts/{ACCOUNT}/workers/domains',{k:old[k] for k in ['hostname','service','zone_id','environment','enabled','previews_enabled']})
def tunnel_config(existing, preview_host):
 hosts=['inkexplorer.xyz','www.inkexplorer.xyz',preview_host]
 require(existing is None or isinstance(existing,dict),'Invalid Tunnel configuration')
 config=dict(existing or {});rules=config.get('ingress',[]);require(isinstance(rules,list),'Invalid Tunnel ingress')
 owned=[];other=[];fallback=[]
 for rule in rules:
  require(isinstance(rule,dict),'Invalid Tunnel rule')
  if rule.get('hostname') in hosts:
   require(rule.get('service')=='http://127.0.0.1:4197' and not rule.get('path'),'Conflicting existing Tunnel application; preserve configuration')
   require(not any(r.get('hostname')==rule['hostname'] for r in owned),'Duplicate Tunnel application')
   require(isinstance(rule.get('originRequest',{}),dict),'Invalid Tunnel origin request')
   owned.append(dict(rule))
  elif not rule.get('hostname') and not rule.get('path'):fallback.append(rule)
  else:other.append(rule)
 require(len(fallback)<=1,'Multiple catch-all Tunnel rules')
 applications=[]
 for host in hosts:
  rule=next((r for r in owned if r['hostname']==host),{'hostname':host,'service':'http://127.0.0.1:4197'})
  rule['originRequest']={**rule.get('originRequest',{}),'httpHostHeader':host};applications.append(rule)
 config['ingress']=applications+other+(fallback or [{'service':'http_status:404'}])
 return {'config':config}


def prepare_tunnel():
    preview_host = os.getenv('INK_MIGRATION_PREVIEW_HOST', '')
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.inkexplorer\.xyz', preview_host) or preview_host == 'www.inkexplorer.xyz':
        raise ValueError('Set INK_MIGRATION_PREVIEW_HOST to a dedicated preview subdomain of inkexplorer.xyz')
    if not (REPORT / 'cloudflare-before.json').exists():
        save('cloudflare-before.json', current())

    tunnel_path = f'/accounts/{ACCOUNT}/cfd_tunnel'
    dns_path = f'/zones/{ZONE}/dns_records'
    name = 'inkexplorer-public-server'
    tunnels = api('GET', f'{tunnel_path}?is_deleted=false')
    tunnel = next((item for item in tunnels if item['name'] == name), None)
    records = api('GET', f'{dns_path}?name={preview_host}')
    require(isinstance(records, list), 'Invalid preview DNS response')
    # A pre-existing record can belong to this migration only if its tunnel already exists.
    if records:
        require(tunnel is not None and len(records) == 1 and
                records[0]['type'] == 'CNAME' and records[0]['content'] == tunnel['id'] + '.cfargotunnel.com',
                'Preserve existing preview DNS')

    existing_config = None
    if tunnel is not None:
        remote = api('GET', f"{tunnel_path}/{tunnel['id']}/configurations")
        require(isinstance(remote, dict) and isinstance(remote.get('config'), dict),
                'Missing current Tunnel configuration; preserve existing ingress')
        existing_config = remote['config']
    config = tunnel_config(existing_config, preview_host)
    if tunnel is None:
        tunnel = api('POST', tunnel_path, {'name': name, 'config_src': 'cloudflare'})
    tunnel_id = tunnel['id']
    target = tunnel_id + '.cfargotunnel.com'
    token = api('GET', f'{tunnel_path}/{tunnel_id}/token')
    require(isinstance(token, str) and token.strip(), 'Cloudflare returned an empty Tunnel token')

    secret = Path(os.environ.get('INK_TUNNEL_TOKEN_FILE') or ROOT / 'runtime/tunnel-token')
    secret.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with NamedTemporaryFile(mode='w', encoding='utf-8', dir=secret.parent, delete=False) as replacement:
        temporary = Path(replacement.name)
        try:
            replacement.write(token)
            replacement.flush()
            os.fsync(replacement.fileno())
            # Publish the local credential only after the DNS and ingress are both ready.
            preview = records[0] if records else api('POST', dns_path, {
                'type': 'CNAME', 'name': preview_host, 'content': target, 'proxied': True, 'ttl': 1,
            })
            if config['config'] != existing_config:
                api('PUT', f'{tunnel_path}/{tunnel_id}/configurations', config)
            os.replace(temporary, secret)
        finally:
            temporary.unlink(missing_ok=True)
    save('tunnel.json', {'id': tunnel_id, 'name': tunnel['name'], 'previewDnsId': preview['id'],
                         'target': target, 'config': config})
    print('Tunnel and preview hostname prepared. Public domains unchanged.')


def main():
 command=sys.argv[1]
 REPORT.mkdir(parents=True,exist_ok=True)
 if command=='prepare':
  prepare_tunnel()
 elif command=='activate':
  ready('local-boundary');ready('stage-boundary')
  save('boot-persistence.json',verify_boot_persistence())
  before=json.loads((REPORT/'cloudflare-before.json').read_text());tunnel=json.loads((REPORT/'tunnel.json').read_text())
  health=api('GET',f"/accounts/{ACCOUNT}/cfd_tunnel/{tunnel['id']}")
  require(health['status']=='healthy','Tunnel not healthy')
  require(not api('GET',f'/zones/{ZONE}/workers/routes'),'Unexpected Worker route')
  deployments=api('GET',f'/accounts/{ACCOUNT}/workers/scripts/inkexplorer/deployments')
  latest=max(deployments['deployments'],key=lambda x:x['created_on'])
  require({v['version_id']:v['percentage'] for v in latest['versions']}=={'f80294c4-2c7f-42d9-bda4-264d0d08d447':100},'Public Worker changed since the copied release')
  state={'phase':'switching','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hosts':[]}
  save('cutover.json',state)
  try:
   for host in ['www.inkexplorer.xyz','inkexplorer.xyz']:
    state['hosts'].append(host);save('cutover.json',state)
    record=change_host(host,tunnel,before);state.setdefault('records',[]).append(record);save('cutover.json',state)
   state['phase']='switched; public validation required';state['after']=current();save('cutover.json',state)
   print('Public DNS now points to the Tunnel; run public validation immediately.')
  except Exception:
   errors=[]
   for host in reversed(state['hosts']):
    try:restore_host(host,tunnel,before)
    except Exception as error:errors.append({'host':host,'error':str(error)})
   state['phase']='automatically rolled back after cutover failure' if not errors else 'rollback incomplete; concurrent changes preserved'
   state['rollbackErrors']=errors;state['after']=current();save('cutover.json',state);raise
 elif command=='rollback':
  before=json.loads((REPORT/'cloudflare-before.json').read_text());tunnel=json.loads((REPORT/'tunnel.json').read_text())
  state=json.loads((REPORT/'cutover.json').read_text())
  errors=[]
  for host in reversed(state['hosts']):
   try:restore_host(host,tunnel,before)
   except Exception as error:errors.append({'host':host,'error':str(error)})
  state['phase']='rolled back' if not errors else 'rollback incomplete; concurrent changes preserved'
  state['rollbackErrors']=errors;state['rollbackAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();state['after']=current();save('cutover.json',state)
  if errors:raise RuntimeError(str(errors))
  print('Original Worker bindings restored; validate public responses.')
 elif command=='status':
  save('cloudflare-current.json',current());print('Cloudflare routing snapshot saved.')
 else:raise RuntimeError('Supported operations: prepare, activate, rollback, status')

if __name__=='__main__':main()
