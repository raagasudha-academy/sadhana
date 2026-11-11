#!/usr/bin/env python3
"""Guarded M9.1 isolated private S3 media E2E; default read-only.

--apply creates ONE labelled homework, ONE tiny PNG receipt and ONE submission.
No JWTs, presigned URLs, emails or PII are printed. Never switches production.
"""
import argparse
import base64
import datetime as dt
import json
import subprocess
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

ACCOUNT='627821644317'
LAMBDA='sadhana-m9-isolated-e2e'
REGION='us-east-1'
API='https://y3eobn1ppi.execute-api.us-east-1.amazonaws.com/m9-test/api'
ISS='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_nyQjIQasG'
CLIENT='5l61r0hmdb2ga2dregunoeqsqe'
PARENT='844844e8-9061-70e4-6b95-f84584536a30'
CLASS='CLASS-RAAGA-MIDDLESBROUGH'
STUDENT='per_620c5ec74e45e6442daab84c83f4243d4713470694d98271130a34bc3bcabd5b'
OTHER_STUDENT='per_nonexistent_m91_media_security_test'
EXPECTED_SHA='Mb+RKczzq9ly4mUaLJ4CwbsZykdQ0s7A7wCux6YRnRk='
# Fully valid 1x1 PNG, from a generated constant with no real student content.
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==')

class Halt(Exception): pass

def aws(*args):
    p=subprocess.run(['aws',*args,'--region',REGION,'--profile','default','--output','json'],text=True,capture_output=True)
    if p.returncode: raise Halt('AWS preflight failed: '+p.stderr.strip()[:200])
    try: return json.loads(p.stdout)
    except json.JSONDecodeError: raise Halt('AWS response not JSON')

def preflight():
    account=aws('sts','get-caller-identity').get('Account')
    if account!=ACCOUNT: raise Halt('Unexpected AWS account')
    c=aws('lambda','get-function-configuration','--function-name',LAMBDA)
    e=c.get('Environment',{}).get('Variables',{})
    checks={
        'lambdaReady':c.get('State')=='Active' and c.get('LastUpdateStatus')=='Successful',
        'expectedMediaCode':c.get('CodeSha256')==EXPECTED_SHA,
        'strictFence':e.get('M9_STRICT_DATA_FENCE')=='enabled',
        'identityWritesOff':e.get('M9_VERIFIED_IDENTITY_LINK_WRITES')=='disabled',
        'automaticProvisioningOff':e.get('SADHANA_PARENT_PROVISIONING_ENABLED')=='false',
        'homeworkWritesOn':e.get('M9_HOMEWORK_WRITES')=='enabled',
        'mediaOn':e.get('M9_HOMEWORK_MEDIA')=='enabled',
    }
    return {'account':account,'lambda':LAMBDA,'checks':checks,'ready':all(checks.values())}

def claims(token):
    token=token.strip()
    if token.lower().startswith('bearer '):token=token[7:].strip()
    try:
        components=token.split('.')
        if len(components)!=3:raise ValueError()
        c=json.loads(base64.urlsafe_b64decode(components[1]+'='*(-len(components[1])%4)))
    except (ValueError,IndexError,TypeError):raise Halt('Clipboard does not contain a JWT')
    if c.get('iss')!=ISS or c.get('client_id')!=CLIENT or c.get('token_use')!='access' or c.get('exp',0)<=dt.datetime.now(dt.timezone.utc).timestamp():raise Halt('Wrong Cognito pool, client, token type or expired token')
    return token,c

def clipboard_token(label):
    input('Copy '+label+' ACCESS token to clipboard, then press Return: ')
    t=subprocess.check_output(['pbpaste'],text=True)
    subprocess.run(['pbcopy'],input='',text=True,check=True)
    return claims(t)

def request(method,path,token,body=None):
    data=json.dumps(body).encode() if body is not None else None
    req=urllib.request.Request(API+path,data=data,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/json','Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=45) as r: status=r.status;raw=r.read(1024*1024)
    except urllib.error.HTTPError as e: status=e.code;raw=e.read(1024*1024)
    try: response=json.loads(raw)
    except ValueError: response={'error':'Non-JSON API response'}
    return status,response

def check(method,path,token,status,body=None):
    got,out=request(method,path,token,body)
    print(json.dumps({'step':method+' '+path.split('?')[0],'expected':status,'actual':got,'passed':got==status}))
    if got!=status:raise Halt('Unexpected API response: '+str(out.get('error') or out.get('message') or 'unknown')[:220])
    return out

def download(url):
    req=urllib.request.Request(url,method='GET')
    with urllib.request.urlopen(req,timeout=45) as res: return res.read(1024*1024)

def run(write):
    p=preflight()
    print(json.dumps({'preflight':p,'dryRun':not write},indent=2))
    if not p['ready']:raise Halt('Media preflight failed; no requests attempted')
    if not write:return
    parent,pc=clipboard_token('PARENT')
    staff,sc=clipboard_token('Raagasudha ADMIN/assigned TEACHER')
    if pc.get('sub')!=PARENT:raise Halt('Parent token subject mismatch')
    if sc.get('sub')==PARENT:raise Halt('Staff token duplicates parent token')
    # Verify access and test invalid media before any new records are created.
    check('GET',f'/learner/{STUDENT}/dashboard?institution=raaga',parent,200)
    check('GET',f'/homework/{CLASS}?institution=raaga',staff,200)
    if input('Type CREATE M91 MEDIA E2E to create one test assignment and upload tiny PNG: ').strip()!='CREATE M91 MEDIA E2E':
        raise Halt('Cancelled; no writes')
    due=(dt.datetime.now(ZoneInfo('Europe/London')).date()+dt.timedelta(days=7)).isoformat()
    hw=check('POST',f'/homework/{CLASS}?institution=raaga',staff,201,{
        'title':'M9.1 MEDIA E2E TEST — safe to archive after verification',
        'instructions':'Automated isolated integration test with a generated 1-pixel PNG.',
        'dueDate':due,'dueTime':'23:59','gradingEnabled':False
    })
    hid=hw.get('record',{}).get('id')
    if not isinstance(hid,str) or not hid.startswith('HOMEWORK-'):raise Halt('Homework created but returned unexpected ID; inspect before retrying')
    print(json.dumps({'createdTestHomework':hid,'note':'Do not rerun --apply after this point if any step fails'}))
    path=f'/learner/{STUDENT}/submission/{hid}'
    # Each denial is independently verified and cannot grant a signed URL.
    check('POST',path+'/evidence/start?institution=sruti',parent,403,{'mime':'image/png','size':len(PNG)})
    check('POST',f'/learner/{OTHER_STUDENT}/submission/{hid}/evidence/start?institution=raaga',parent,403,{'mime':'image/png','size':len(PNG)})
    check('POST',path+'/evidence/start?institution=raaga',parent,400,{'mime':'image/png','size':5000001})
    start=check('POST',path+'/evidence/start?institution=raaga',parent,200,{'mime':'image/png','size':len(PNG)})
    aid=start.get('attachmentId')
    url=start.get('uploadUrl')
    headers=start.get('headers')
    if not isinstance(aid,str) or not aid.startswith('MEDIA-') or not isinstance(url,str) or not url.startswith('https://') or not isinstance(headers,dict):raise Halt('Upload receipt created but invalid signed PUT response; inspect before retry')
    put=urllib.request.Request(url,data=PNG,headers=headers,method='PUT')
    try:
        with urllib.request.urlopen(put,timeout=55) as res: put_status=res.status
    except urllib.error.HTTPError as e:raise Halt('S3 PUT failed with HTTP '+str(e.code))
    if put_status not in (200,201,204):raise Halt('Unexpected S3 PUT response '+str(put_status))
    print(json.dumps({'s3PutPassed':True,'bytes':len(PNG)}))
    finish=check('POST',path+'/evidence/finish?institution=raaga',parent,200,{'key':aid})
    if not finish.get('ready'):raise Halt('S3 HEAD receipt verification failed')
    submission=check('PUT',path+'?institution=raaga',parent,200,{'text':'M9.1 private media E2E (generated PNG)','status':'submitted','expectedVersion':0,'attachmentIds':[aid]})
    if aid not in submission.get('record',{}).get('attachmentIds',[]):raise Halt('Attachment not persisted on submission')
    parent_links=check('GET',path+'/evidence?institution=raaga',parent,200)
    teacher_links=check('GET',f'/homework/{CLASS}/evidence/{hid}/{STUDENT}?institution=raaga',staff,200)
    for label,links in [('parent',parent_links),('staff',teacher_links)]:
        matches=[r for r in links.get('records',[]) if r.get('id')==aid]
        if len(matches)!=1 or download(matches[0]['url'])!=PNG:raise Halt(label+' signed download failed content check')
        print(json.dumps({'downloadVerified':label,'bytes':len(PNG)}))
    print(json.dumps({'mediaE2EPassed':True,'homeworkId':hid,'mediaReceiptId':aid,'submissionVersion':submission['record'].get('version'),'negativeAuthorisationPassed':True,'productionCutoverReady':False},indent=2))

if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--apply',action='store_true')
    args=cli.parse_args()
    try:run(args.apply)
    except (Halt,KeyboardInterrupt,EOFError,urllib.error.URLError) as e:
        print('STOPPED: '+str(e),file=sys.stderr)
        sys.exit(1)
