"""Read-only audit of canonical documents against Google's SEO Starter Guide."""
import concurrent.futures,hashlib,json,os,pathlib,urllib.request,urllib.error,urllib.robotparser,xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime,timezone
from bs4 import BeautifulSoup

origin=os.environ.get('BASE_URL','https://inkexplorer.xyz').rstrip('/')
out=pathlib.Path(os.environ.get('SEO_OUTPUT','reports/seo-starter'));out.mkdir(parents=True,exist_ok=True)
agent='Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
def get(url):
    request=urllib.request.Request(url,headers={'User-Agent':agent,'Accept-Encoding':'identity'})
    try:
        with urllib.request.urlopen(request,timeout=25) as r:return r.status,dict(r.headers),r.read().decode('utf8'),r.url
    except urllib.error.HTTPError as e:return e.code,dict(e.headers),e.read().decode('utf8','replace'),e.url
status,headers,robots,_=get(origin+'/robots.txt');rp=urllib.robotparser.RobotFileParser();rp.parse(robots.splitlines())
urls=[];sitemaps=[]
for prefix in ['', '/testnet']:
    status,_,xml,_=get(origin+prefix+'/sitemap.xml');locations=[e.text for e in ET.fromstring(xml).findall('{*}url/{*}loc')]
    sitemaps.append({'path':prefix+'/sitemap.xml','status':status,'urls':len(locations)})
    # The preview deliberately preserves production canonical URLs.
    urls.extend(u.replace('https://inkexplorer.xyz',origin,1) for u in locations)
def audit(url):
    try:
        status,headers,body,final=get(url);headers={k.lower():v for k,v in headers.items()};s=BeautifulSoup(body,'html.parser');main=s.select_one('main')
        canonical=[x.get('href') for x in s.select('link[rel="canonical"]')];alternates=[{'lang':x.get('hreflang'),'href':x.get('href')} for x in s.select('link[rel="alternate"][hreflang]')]
        meta=lambda name:[x.get('content','') for x in s.select('meta[name="'+name+'"]')]
        directives=meta('robots')+meta('googlebot')+[headers.get('x-robots-tag','')]
        schemas=[]
        for schema in s.select('script[type="application/ld+json"]'):
            try:schemas.append(json.loads(schema.get_text()))
            except ValueError:schemas.append({'parseError':True})
        return {'url':url,'status':status,'finalUrl':final,'robotsAllowed':rp.can_fetch('Googlebot',url),'directives':directives,'canonical':canonical,'alternates':alternates,
                'title':s.title.get_text() if s.title else '', 'description':meta('description'),'schemaValid':not any('parseError' in x for x in schemas),
                'mainText':main.get_text(' ',strip=True) if main else '', 'visibleDescriptions':[p.get_text(' ',strip=True) for p in s.select('main .page-summary')],
                'internalLinks':sorted(set(a.get('href') for a in s.select('a[href]') if a.get('href','').startswith('/'))),'version':headers.get('x-ink-version'),
                'sha256':hashlib.sha256(body.encode()).hexdigest()}
    except Exception as e:return {'url':url,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(audit,urls))
by_url={r['url']:r for r in rows};issues=[]
for row in rows:
    found=[]
    if row.get('status')!=200:found.append('document unavailable')
    if not row.get('robotsAllowed'):found.append('robots disallows URL')
    if any('noindex' in value for value in row.get('directives',[])):found.append('canonical URL is noindex')
    expected=row['url'].replace(origin,'https://inkexplorer.xyz',1)
    if row.get('canonical')!=[expected]:found.append('canonical differs from sitemap URL')
    if not row.get('title') or len(row.get('description',[]))!=1 or not row.get('description',[''])[0]:found.append('title or description missing')
    if not row.get('schemaValid'):found.append('invalid structured JSON')
    if len(row.get('alternates',[]))!=10:found.append('missing locale alternatives')
    for alternate in row.get('alternates',[]):
        target=by_url.get(alternate['href'].replace('https://inkexplorer.xyz',origin,1))
        if not target or not any(a['href']==expected for a in target.get('alternates',[])):found.append('hreflang lacks reciprocal URL');break
    if found:issues.append({'url':row['url'],'issues':found})
report={'at':datetime.now(timezone.utc).isoformat(),'origin':origin,'guide':'https://developers.google.com/search/docs/fundamentals/seo-starter-guide',
        'scope':'HTTP eligibility, useful initial content and link discovery; not Search Console indexing or Google ranking. Main text length is observational, not a ranking threshold.',
        'sitemaps':sitemaps,'documents':len(rows),'uniqueUrls':len(set(urls)),'issues':issues,'rows':rows}
(out/'public-http.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'documents':len(rows),'issues':len(issues),'examples':issues[:4],'visibleDescriptionPages':sum(bool(r.get('visibleDescriptions')) for r in rows)}))
