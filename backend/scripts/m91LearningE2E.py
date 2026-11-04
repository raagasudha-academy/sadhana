#!/usr/bin/env python3
"""Guarded isolated M9.1 text-workflow E2E. No legacy storage, no production routing.
By default performs AWS preflight only. --apply performs explicitly confirmed
practice/homework/submission/feedback writes using real verified role JWTs.
"""
import argparse
import base64
import datetime as dt
import getpass
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

ACCOUNT='627821644317'
REGION='us-east-1'
LAMBDA='sadhana-m9-isolated-e2e'
API='https://y3eobn1ppi.execute-api.us-east-1.amazonaws.com/m9-test/api'
POOL='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_nyQjIQasG'
CLIENT='5l61r0hmdb2ga2dregunoeqsqe'
PARENT='844844e8-9061-70e4-6b95-f84584536a30'
CLASS='CLASS-RAAGA-MIDDLESBROUGH'
STUDENTS={'001-001':'per_620c5ec74e45e6442daab84c83f4243d4713470694d98271130a34bc3bcabd5b','001-002':'per_8de169dee983b52dda5fc4a674b5136016e26b7ce7a006806d07060cd2fc8280'}

class Stop(Exception):pass

def aws(*args):
    p=subprocess.run(['aws',*args,'--profile','default','--region',REGION,'--output','json'],capture_output=True,text=True)
    if p.returncode:raise Stop('AWS read failed: '+p.stderr.strip()[:260])
    try:return json.loads(p.stdout)
    except json.JSONDecodeError:raise Stop('Unexpected empty/non-JSON AWS result')

def preflight():
    who=aws('sts','get-caller-identity')
    if who.get('Account')!=ACCOUNT:raise Stop('Wrong AWS account')
    cfg=aws('lambda','get-function-configuration','--function-name',LAMBDA)
    env=cfg.get('Environment',{}).get('Variables',{})
    if cfg.get('State')!='Active' or cfg.get('LastUpdateStatus')!='Successful':raise Stop('Lambda not ready')
    if env.get('M9_STRICT_DATA_FENCE')!='enabled' or env.get('M9_VERIFIED_IDENTITY_LINK_WRITES')!='disabled' or env.get('SADHANA_PARENT_PROVISIONING_ENABLED')!='false':raise Stop('Isolated safety guards not intact')
    flags={name:env.get(name,'unset') for name in ('M9_FINAL_LEARNER_READS','M9_LEARNER_WRITES','M9_HOMEWORK_WRITES')}
    return {'account':who['Account'],'function':cfg['FunctionName'],'strictFence':'enabled','flags':flags,'mediaEvidenceSupported':False,'productionChanged':False}

def token_claims(token):
    token=token.strip().removeprefix('Bearer ').strip()
    try:
        p=token.split('.')
        if len(p)!=3:raise ValueError()
        claims=json.loads(base64.urlsafe_b64decode(p[1]+'='*(-len(p[1])%4)))
    except (ValueError,IndexError):raise Stop('Invalid JWT format')
    if claims.get('iss')!=POOL or claims.get('client_id')!=CLIENT or claims.get('token_use')!='access' or int(claims.get('exp',0))<=dt.datetime.now(dt.timezone.utc).timestamp():raise Stop('Invalid pool/client/token use or expired token')
    return token,claims

def fetch(method,path,token,body=None):
    url=API+path
    data=json.dumps(body).encode('utf-8') if body is not None else None
    req=urllib.request.Request(url,data=data,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=35) as r:status=r.status;raw=r.read(1048576)
    except urllib.error.HTTPError as e:status=e.code;raw=e.read(1048576)
    try:result=json.loads(raw)
    except ValueError:result={'error':'Non-JSON response'}
    return status,result

def require(method,path,token,expected,body=None):
    status,result=fetch(method,path,token,body)
    print(json.dumps({'request':method+' '+path.split('?')[0],'status':status,'expected':expected,'pass':status==expected}))
    if status!=expected:raise Stop('Unexpected API response '+str(status)+': '+str(result.get('error') or result.get('message') or '')[:240])
    return result

def run(apply):
    cfg=preflight()
    print(json.dumps({'preflight':cfg,'dryRun':not apply},indent=2))
    if not apply:return
    if cfg['flags'].get('M9_LEARNER_WRITES')!='enabled' or cfg['flags'].get('M9_HOMEWORK_WRITES')!='enabled':
        raise Stop('M9 learner/homework write flags are not enabled. No writes attempted; do not enable until reviewing deployment and IAM.')
    print('Use fresh PARENT and Raagasudha ADMIN/assigned TEACHER access tokens. Tokens are never printed.')
    def clipboard_token(label):
        input(f'Copy {label} ACCESS token to clipboard, then press Return: ')
        token = subprocess.check_output(['pbpaste'], text=True).strip()
        subprocess.run(['pbcopy'], input='', text=True, check=True)
        if token.lower().startswith('bearer '):
            token = token[7:].strip()
        if len(token.split('.')) != 3:
            raise Stop(f'{label} clipboard does not contain a JWT')
        return token_claims(token)

    parent,pc=clipboard_token('PARENT')
    if pc.get('sub')!=PARENT:
        raise Stop('Parent identity mismatch')

    staff,sc=clipboard_token('Raagasudha ADMIN/TEACHER')
    if pc.get('sub')!=PARENT:raise Stop('Parent identity mismatch')
    if sc.get('sub')==PARENT:raise Stop('Teacher/admin token is the parent token')
    if not any(x in sc.get('cognito:groups',[]) for x in ('raagasudha-admin','raaga-admin')):
        print('Staff token has no Raagasudha admin group: assigned teacher authorization will be checked by API.')
    for roll,sid in STUDENTS.items():
        data=require('GET',f'/learner/{sid}/dashboard?institution=raaga',parent,200)
        if not any(x.get('classId')==CLASS for x in data.get('classes',[])):
            raise Stop('Expected Middlesbrough class not on '+roll+' dashboard')
    require('GET',f'/homework/{CLASS}?institution=raaga',staff,200)
    print('Read checks passed. This writes ONE practice entry, ONE test assignment and ONE submission/feedback; no media.')
    if input('Type CREATE M91 TEXT E2E to continue: ').strip()!='CREATE M91 TEXT E2E':raise Stop('Cancelled; no writes')
    sid=STUDENTS['001-001']
    date=dt.datetime.now(dt.timezone(dt.timedelta(0))).astimezone(dt.timezone.utc).date().isoformat()
    # UK date is required for practice window; use zoneinfo.
    from zoneinfo import ZoneInfo
    date=dt.datetime.now(ZoneInfo('Europe/London')).date().isoformat()
    due=(dt.datetime.now(ZoneInfo('Europe/London')).date()+dt.timedelta(days=7)).isoformat()
    practice=require('POST',f'/learner/{sid}/practice?institution=raaga',parent,201,{'classId':CLASS,'date':date,'minutes':5,'topic':'M9.1 integration test','comments':'Controlled integration test entry'})
    result={'practiceId':practice.get('record',{}).get('id')}
    print('Practice created. Following tests may leave clearly labeled test records if interrupted.')
    homework=require('POST',f'/homework/{CLASS}?institution=raaga',staff,201,{'title':'M9.1 E2E TEST — safe to archive after verification','instructions':'Integration test only: write a short test response.','dueDate':due,'dueTime':'23:59','gradingEnabled':False})
    hid=homework.get('record',{}).get('id')
    if not isinstance(hid,str):raise Stop('Homework response missing ID')
    result['homeworkId']=hid
    listed=require('GET',f'/learner/{sid}/homework?institution=raaga',parent,200)
    if not any(x.get('id')==hid for x in listed.get('records',[])):raise Stop('Test assignment missing from learner list')
    submission=require('PUT',f'/learner/{sid}/submission/{hid}?institution=raaga',parent,200,{'text':'M9.1 controlled E2E text submission','status':'submitted','expectedVersion':0,'attachmentIds':[]})
    result['submissionVersion']=submission.get('record',{}).get('version')
    subs=require('GET',f'/homework/{CLASS}/submissions/{hid}?institution=raaga',staff,200)
    if not any(x.get('studentId')==sid for x in subs.get('records',[])):raise Stop('Submission not visible to teacher')
    require('POST',f'/homework/{CLASS}/feedback/{hid}/{sid}?institution=raaga',staff,200,{'feedback':'M9.1 test feedback','expectedVersion':result['submissionVersion']})
    print(json.dumps({'textWorkflowPassed':True,'testRecords':result,'mediaPassed':False,'productionCutoverReady':False},indent=2))

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--apply',action='store_true',help='explicit guarded test writes; default is read only')
    args=ap.parse_args()
    try:run(args.apply)
    except (Stop,KeyboardInterrupt) as e:print('STOPPED: '+str(e),file=sys.stderr);sys.exit(1)
