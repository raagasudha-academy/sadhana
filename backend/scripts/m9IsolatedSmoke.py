#!/usr/bin/env python3
"""Read-only HTTP admission/academy isolation smoke tests; no JWTs printed/stored."""
import argparse, datetime, json, os, pathlib, sys, urllib.error, urllib.request

def get(url,token=None):
    headers={'Accept':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    request=urllib.request.Request(url,headers=headers,method='GET')
    try:
        with urllib.request.urlopen(request,timeout=20) as response:
            return response.status,response.read(512).decode('utf-8','replace')
    except urllib.error.HTTPError as error:
        return error.code,error.read(512).decode('utf-8','replace')

def main():
    a=argparse.ArgumentParser();a.add_argument('--deployment',default='./m9-isolated-deployment.json');a.add_argument('--report',default='./m9-isolated-smoke.json');args=a.parse_args()
    report=pathlib.Path(args.report)
    if report.exists(): a.error('Refusing to overwrite existing smoke evidence')
    deployed=json.loads(pathlib.Path(args.deployment).read_text())
    base=deployed['apiBaseUrl'].rstrip('/')
    if not base.startswith('https://') or '/m9-test/api' not in base:a.error('Refusing to test non-isolated endpoint')
    checks=[]
    def check(name,url,token,expect):
        try: status,_=get(url,token);ok=status in expect;checks.append({'name':name,'status':status,'passed':ok})
        except Exception as exc:checks.append({'name':name,'status':'network_error','passed':False,'error':str(exc)[:160]})
    check('anonymousRejected',base+'/m9/status',None,{401,403})
    check('invalidTokenRejected',base+'/m9/status','invalid-m9-test-token',{401,403})
    raaga=os.environ.get('M9_RAAGA_ADMIN_TOKEN')
    sruti=os.environ.get('M9_SRUTI_ADMIN_TOKEN')
    if raaga:
        check('raagaAdminCanReadStatus',base+'/m9/status',raaga,{200})
        check('raagaCannotReadSrutiClasses',base+'/m9/list/classes?institution=sruti',raaga,{403})
    if sruti:
        check('srutiAdminCanReadStatus',base+'/m9/status',sruti,{200})
        check('srutiCannotReadRaagaClasses',base+'/m9/list/classes?institution=raaga',sruti,{403})
    result={'schema':1,'readOnly':True,'timestampUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'apiBaseUrl':base,'checks':checks,'allExecutedChecksPassed':bool(checks) and all(c['passed'] for c in checks),'crossInstitutionAuthVerified':bool(raaga and sruti and len(checks)==6 and all(c['passed'] for c in checks)),'deployedWorkflowE2EVerified':False,'cutoverApproved':False,'note':'This verifies basic JWT denial and two-admin cross-academy GET access only; it is not the full app acceptance or rollback test.'}
    report.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    if not result['allExecutedChecksPassed']:sys.exit(1)

if __name__=='__main__':main()
