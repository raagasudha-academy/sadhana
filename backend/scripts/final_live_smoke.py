#!/usr/bin/env python3
"""Read-only HTTP smoke tests for Sadhana. Does not perform authenticated writes."""
import argparse, json, urllib.request, urllib.error, sys
p=argparse.ArgumentParser();p.add_argument('--base-url',default='https://6n9clqr224.execute-api.us-east-1.amazonaws.com/dev/api');p.add_argument('--origin',required=True,help='Exact deployed frontend Origin, e.g. https://portal.example');p.add_argument('--token-file',help='Optional local path to an existing access token; DO NOT paste tokens into chat');p.add_argument('--institution',choices=['raaga','sruti'],default='raaga');a=p.parse_args()
base=a.base_url.rstrip('/');token=open(a.token_file).read().strip() if a.token_file else None
failures=[]
def run(method,path,expected,auth=False,preflight=False):
    h={'Origin':a.origin}
    if auth and token:h['Authorization']='Bearer '+token
    if preflight:h.update({'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'})
    req=urllib.request.Request(base+path,headers=h,method=method)
    try:
        with urllib.request.urlopen(req,timeout=20) as resp:status,headers=resp.status,resp.headers;resp.read(2048)
    except urllib.error.HTTPError as e:status,headers=e.code,e.headers;e.read(2048)
    except Exception as e:failures.append(f'{method} {path}: transport {e}');print('FAIL',method,path,e);return
    origin=headers.get('Access-Control-Allow-Origin','')
    # API Gateway may return literal origin or wildcard; never accept absent header.
    cors=origin in (a.origin,'*')
    ok=(status in expected) and cors
    print(('PASS' if ok else 'FAIL'),method,path,'HTTP',status,'CORS',origin or '<missing>')
    if not ok:failures.append(f'{method} {path}: HTTP {status} (expected {expected}), CORS {origin!r}')
run('OPTIONS','/health',{200,204},preflight=True)
run('GET','/health',{401,403}) # endpoint is authenticated
run('GET','/operations/enrolment?institution='+a.institution,{401,403})
if token:
    run('GET','/health',{200},auth=True)
    for endpoint in ['family','student','enrolment','attendance','practice','feedback','rsvp']:
        # Authorisation can be 403 for a token without staff permissions.
        run('GET','/operations/'+endpoint+'?institution='+a.institution,{200,403},auth=True)
else:print('SKIP authenticated GET coverage (provide --token-file for role-specific smoke)')
print('RESULT:', 'PASS (limited read-only smoke)' if not failures else 'FAIL')
for f in failures:print(' -',f)
sys.exit(1 if failures else 0)
